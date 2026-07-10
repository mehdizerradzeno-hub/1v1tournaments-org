import { connectLambda } from '@netlify/blobs';

import { getStoreWithFallback } from './_account-utils.mjs';
import { requireTournamentAdmin } from './_host-auth.mjs';
import { SPONSOR_STORE_NAMES } from '../../src/lib/sponsorEngine/index.js';

const DRAFT_STORE = SPONSOR_STORE_NAMES.outreachDrafts || 'sponsor-outreach-drafts';
const PROPOSAL_STORE = SPONSOR_STORE_NAMES.deals || 'sponsor-deals';
const MAX_BATCH_SIZE = 100;

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

function nowIso() {
  return new Date().toISOString();
}

function storeForType(type) {
  if (type === 'proposal') return getStoreWithFallback(PROPOSAL_STORE);
  return getStoreWithFallback(DRAFT_STORE);
}

function normalizeType(value) {
  return value === 'proposal' ? 'proposal' : 'draft';
}

async function listRecords(type) {
  const store = storeForType(type);
  const { blobs } = await store.list();
  const records = await Promise.all(blobs.map((blob) => store.get(blob.key, { type: 'json' })));

  return records
    .filter(Boolean)
    .sort((left, right) => String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || '')));
}

function normalizeRecord(record, { account, type }) {
  const timestamp = nowIso();
  const fallbackPrefix = type === 'proposal' ? 'proposal' : 'draft';
  const id = String(record?.id || `${fallbackPrefix}-${timestamp}`).trim();

  return {
    ...record,
    id,
    savedBy: record?.savedBy || account?.id || account?.email || 'host',
    createdAt: record?.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

async function saveRecords(type, records) {
  const store = storeForType(type);

  await Promise.all(records.map((record) => store.setJSON(`${record.id}.json`, record, {
    metadata: {
      prospectId: record.prospectId || '',
      status: record.status || '',
      updatedAt: record.updatedAt || '',
    },
  })));
}

export async function handler(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  const adminCheck = await requireTournamentAdmin(event);

  if (adminCheck.error) {
    return json(adminCheck.error.statusCode, { error: adminCheck.error.message });
  }

  const queryType = normalizeType(event.queryStringParameters?.type);

  if (event.httpMethod === 'GET') {
    try {
      return json(200, {
        ok: true,
        drafts: queryType === 'proposal' ? [] : await listRecords('draft'),
        proposals: queryType === 'draft' ? [] : await listRecords('proposal'),
      });
    } catch (error) {
      console.error('Sponsor collateral load failed', error);
      return json(500, { error: 'Sponsor collateral storage is not available yet.' });
    }
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use GET to load or POST to save sponsor drafts and proposals.' });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Sponsor collateral payload must be valid JSON.' });
  }

  const action = payload.action || 'save-one';
  const type = normalizeType(payload.type);

  try {
    if (action === 'save-many') {
      const rawRecords = Array.isArray(payload.records) ? payload.records.slice(0, MAX_BATCH_SIZE) : [];

      if (!rawRecords.length) {
        return json(400, { error: 'Add at least one sponsor draft or proposal to save.' });
      }

      const records = rawRecords.map((record) => normalizeRecord(record, {
        account: adminCheck.account,
        type,
      }));

      await saveRecords(type, records);

      return json(200, {
        ok: true,
        savedCount: records.length,
        drafts: await listRecords('draft'),
        proposals: await listRecords('proposal'),
      });
    }

    if (action === 'save-one') {
      const record = normalizeRecord(payload.record || payload, {
        account: adminCheck.account,
        type,
      });

      await saveRecords(type, [record]);

      return json(200, {
        ok: true,
        record,
        drafts: await listRecords('draft'),
        proposals: await listRecords('proposal'),
      });
    }

    if (action === 'archive') {
      const recordId = String(payload.recordId || '').trim();
      const existing = (await listRecords(type)).find((record) => record.id === recordId);

      if (!recordId) {
        return json(400, { error: 'Choose a sponsor draft or proposal to archive.' });
      }

      if (!existing) {
        return json(404, { error: 'Sponsor draft or proposal was not found.' });
      }

      const archived = normalizeRecord({
        ...existing,
        status: 'ARCHIVED',
        archivedAt: nowIso(),
        archivedBy: adminCheck.account?.id || adminCheck.account?.email || 'host',
      }, {
        account: adminCheck.account,
        type,
      });

      await saveRecords(type, [archived]);

      return json(200, {
        ok: true,
        record: archived,
        drafts: await listRecords('draft'),
        proposals: await listRecords('proposal'),
      });
    }

    return json(400, { error: 'Unsupported sponsor collateral action.' });
  } catch (error) {
    console.error('Sponsor collateral save failed', error);
    return json(500, { error: 'Sponsor collateral could not be saved.' });
  }
}
