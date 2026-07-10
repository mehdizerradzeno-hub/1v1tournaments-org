import { createHash, randomUUID } from 'node:crypto';

import { connectLambda } from '@netlify/blobs';

import { getStoreWithFallback } from './_account-utils.mjs';
import { requireTournamentAdmin } from './_host-auth.mjs';
import { createSponsorInquiryRecord } from '../../src/lib/sponsorEngine/index.js';

const INQUIRY_STORE = 'sponsor-inquiries';
const AUDIT_STORE = 'sponsor-audit-events';
const RATE_LIMIT_STORE = 'sponsor-inquiry-rate-limits';
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

function hashValue(value) {
  return createHash('sha256').update(String(value || 'unknown')).digest('hex').slice(0, 40);
}

function clientAddress(event) {
  return event.headers['x-nf-client-connection-ip']
    || event.headers['x-forwarded-for']?.split(',')[0]
    || event.headers['client-ip']
    || 'unknown';
}

function publicInquiry(inquiry) {
  if (!inquiry) return null;

  return {
    id: inquiry.id,
    company: inquiry.company,
    sponsorshipInterest: inquiry.sponsorshipInterest,
    estimatedBudgetRange: inquiry.estimatedBudgetRange,
    desiredTiming: inquiry.desiredTiming,
    message: inquiry.message,
    sourcePage: inquiry.sourcePage,
    status: inquiry.status,
    receivedAt: inquiry.receivedAt,
  };
}

function adminInquiry(inquiry) {
  if (!inquiry) return null;

  return {
    ...publicInquiry(inquiry),
    name: inquiry.name,
    workEmail: inquiry.workEmail,
    website: inquiry.website,
    reviewedAt: inquiry.reviewedAt || '',
    reviewedBy: inquiry.reviewedBy || '',
  };
}

async function checkRateLimit(event) {
  const now = Date.now();
  const windowId = Math.floor(now / RATE_LIMIT_WINDOW_MS);
  const key = `${windowId}/${hashValue(clientAddress(event))}.json`;
  const store = getStoreWithFallback(RATE_LIMIT_STORE);
  const current = await store.get(key, { type: 'json' });
  const count = Number(current?.count || 0) + 1;

  await store.setJSON(key, {
    count,
    updatedAt: new Date(now).toISOString(),
  }, {
    metadata: {
      count,
      windowId,
    },
  });

  return count <= RATE_LIMIT_MAX;
}

async function saveInquiry(inquiry, auditEvent) {
  const inquiryStore = getStoreWithFallback(INQUIRY_STORE);
  const auditStore = getStoreWithFallback(AUDIT_STORE);
  const key = `${inquiry.receivedAt.slice(0, 10)}/${inquiry.id}.json`;

  await inquiryStore.setJSON(key, inquiry, {
    metadata: {
      company: inquiry.company,
      status: inquiry.status,
      receivedAt: inquiry.receivedAt,
    },
  });

  if (auditEvent) {
    await auditStore.setJSON(`${auditEvent.createdAt.slice(0, 10)}/${auditEvent.id}.json`, auditEvent, {
      metadata: {
        action: auditEvent.action,
        entityType: auditEvent.entityType,
        entityId: auditEvent.entityId,
      },
    });
  }

  return inquiry;
}

async function listInquiries() {
  const store = getStoreWithFallback(INQUIRY_STORE);
  const { blobs } = await store.list();
  const inquiries = await Promise.all(blobs.map((blob) => store.get(blob.key, { type: 'json' })));

  return inquiries
    .filter(Boolean)
    .sort((left, right) => String(right.receivedAt || '').localeCompare(String(left.receivedAt || '')))
    .slice(0, 100);
}

async function updateInquiryStatus({ inquiryId, status, account }) {
  const store = getStoreWithFallback(INQUIRY_STORE);
  const { blobs } = await store.list();
  const matchingKey = blobs.find((blob) => blob.key.endsWith(`/${inquiryId}.json`))?.key;

  if (!matchingKey) {
    return null;
  }

  const inquiry = await store.get(matchingKey, { type: 'json' });
  const updated = {
    ...inquiry,
    status,
    reviewedAt: new Date().toISOString(),
    reviewedBy: account?.id || account?.email || 'token',
  };

  await store.setJSON(matchingKey, updated, {
    metadata: {
      company: updated.company,
      status: updated.status,
      receivedAt: updated.receivedAt,
    },
  });

  return updated;
}

export async function handler(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  if (event.httpMethod === 'GET') {
    const adminCheck = await requireTournamentAdmin(event);

    if (adminCheck.error) {
      return json(adminCheck.error.statusCode, { error: adminCheck.error.message });
    }

    try {
      const inquiries = await listInquiries();

      return json(200, {
        ok: true,
        inquiries: inquiries.map(adminInquiry),
      });
    } catch (error) {
      console.error('Sponsor inquiry load failed', error);
      return json(500, { error: 'Sponsor inquiry storage is not available yet.' });
    }
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use POST to submit a sponsor inquiry or GET as a host to review inquiries.' });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Sponsor inquiry payload must be valid JSON.' });
  }

  if (payload.action === 'update-status') {
    const adminCheck = await requireTournamentAdmin(event);

    if (adminCheck.error) {
      return json(adminCheck.error.statusCode, { error: adminCheck.error.message });
    }

    const status = ['NEW', 'REVIEWED', 'ARCHIVED'].includes(payload.status) ? payload.status : '';

    if (!payload.inquiryId || !status) {
      return json(400, { error: 'Choose an inquiry and a supported status.' });
    }

    try {
      const inquiry = await updateInquiryStatus({
        account: adminCheck.account,
        inquiryId: payload.inquiryId,
        status,
      });

      if (!inquiry) {
        return json(404, { error: 'Sponsor inquiry was not found.' });
      }

      return json(200, {
        ok: true,
        inquiry: adminInquiry(inquiry),
        inquiries: (await listInquiries()).map(adminInquiry),
      });
    } catch (error) {
      console.error('Sponsor inquiry update failed', error);
      return json(500, { error: 'Sponsor inquiry could not be updated.' });
    }
  }

  try {
    const allowed = await checkRateLimit(event);

    if (!allowed) {
      return json(429, { error: 'Too many sponsor inquiries from this connection. Try again later.' });
    }

    const receivedAt = new Date().toISOString();
    const inquiryId = `sponsor-inquiry-${randomUUID()}`;
    const result = createSponsorInquiryRecord({
      ...payload,
      id: inquiryId,
      receivedAt,
    });

    if (result.errors.length) {
      return json(400, {
        error: result.errors.join(' '),
        errors: result.errors,
      });
    }

    const inquiry = {
      ...result.inquiry,
      id: inquiryId,
      receivedAt,
      status: 'NEW',
    };

    await saveInquiry(inquiry, result.auditEvent);

    return json(200, {
      ok: true,
      inquiry: publicInquiry(inquiry),
      message: 'Sponsor inquiry received for manual review.',
    });
  } catch (error) {
    console.error('Sponsor inquiry submit failed', error);
    return json(500, { error: 'Sponsor inquiry could not be submitted yet.' });
  }
}
