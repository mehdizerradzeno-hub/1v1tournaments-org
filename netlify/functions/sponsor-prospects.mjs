import { randomUUID } from 'node:crypto';

import { connectLambda } from '@netlify/blobs';

import { getStoreWithFallback } from './_account-utils.mjs';
import { requireTournamentAdmin } from './_host-auth.mjs';
import {
  createEmptySponsorProspect,
  markDuplicateProspects,
  SPONSOR_STORE_NAMES,
} from '../../src/lib/sponsorEngine/index.js';

const MAX_BATCH_SIZE = 100;
const PROSPECT_STORE = SPONSOR_STORE_NAMES.prospects || 'sponsor-prospects';

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

function needsServerId(id) {
  return !id || /^(preview|local|research)-/.test(String(id));
}

async function listProspects() {
  const store = getStoreWithFallback(PROSPECT_STORE);
  const { blobs } = await store.list();
  const prospects = await Promise.all(blobs.map((blob) => store.get(blob.key, { type: 'json' })));

  return prospects
    .filter(Boolean)
    .sort((left, right) => String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || '')));
}

function normalizeProspect(input, { account, existingProspects = [] } = {}) {
  const now = new Date().toISOString();
  const existing = existingProspects.find((prospect) => prospect.id === input?.id);
  const id = needsServerId(input?.id) ? `sponsor-prospect-${randomUUID()}` : String(input.id);
  const prospect = createEmptySponsorProspect({
    ...input,
    id,
    createdAt: existing?.createdAt || input?.createdAt || now,
    ownerUserId: input?.ownerUserId || account?.id || account?.email || 'host',
    updatedAt: now,
  });

  return markDuplicateProspects(
    [prospect],
    existingProspects.filter((item) => item.id !== prospect.id),
  )[0];
}

async function saveProspects(prospects) {
  const store = getStoreWithFallback(PROSPECT_STORE);

  await Promise.all(prospects.map((prospect) => store.setJSON(`${prospect.id}.json`, prospect, {
    metadata: {
      company: prospect.companyName,
      domain: prospect.domain,
      status: prospect.status,
      updatedAt: prospect.updatedAt,
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

  if (event.httpMethod === 'GET') {
    try {
      return json(200, {
        ok: true,
        prospects: await listProspects(),
      });
    } catch (error) {
      console.error('Sponsor prospect load failed', error);
      return json(500, { error: 'Sponsor prospect storage is not available yet.' });
    }
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use GET to load sponsor prospects or POST to save host-reviewed records.' });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Sponsor prospect payload must be valid JSON.' });
  }

  const action = payload.action || 'upsert-one';

  try {
    const existingProspects = await listProspects();

    if (action === 'upsert-many') {
      const rawProspects = Array.isArray(payload.prospects) ? payload.prospects.slice(0, MAX_BATCH_SIZE) : [];

      if (!rawProspects.length) {
        return json(400, { error: 'Add at least one sponsor prospect to save.' });
      }

      const savedProspects = [];

      rawProspects.forEach((rawProspect) => {
        savedProspects.push(normalizeProspect(rawProspect, {
          account: adminCheck.account,
          existingProspects: [...existingProspects, ...savedProspects],
        }));
      });

      await saveProspects(savedProspects);

      return json(200, {
        ok: true,
        savedCount: savedProspects.length,
        prospects: await listProspects(),
      });
    }

    if (action === 'upsert-one') {
      const prospect = normalizeProspect(payload.prospect || payload, {
        account: adminCheck.account,
        existingProspects,
      });

      if (!prospect.companyName && !prospect.website) {
        return json(400, { error: 'Sponsor prospect needs at least a company name or website.' });
      }

      await saveProspects([prospect]);

      return json(200, {
        ok: true,
        prospect,
        prospects: await listProspects(),
      });
    }

    return json(400, { error: 'Unsupported sponsor prospect action.' });
  } catch (error) {
    console.error('Sponsor prospect save failed', error);
    return json(500, { error: 'Sponsor prospect could not be saved.' });
  }
}
