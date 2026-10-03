import { connectLambda } from '@netlify/blobs';

import { cleanText } from './_account-utils.mjs';
import { requireTournamentAdmin } from './_host-auth.mjs';
import { enforceRateLimit } from './_rate-limit.mjs';
import {
  GUEST_SESSION_MAX_AGE_SECONDS,
  createGuestKey,
  guestAccessRequired,
  guestKeyDigest,
  guestKeyMatches,
  getGuestStore,
  guestKeyName,
  loadGuestRecord,
  withGuestCookie,
} from './_tournament-guest-auth.mjs';
import { loadHostedTournament } from './_tournament-events-utils.mjs';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

async function admin(event) {
  const result = await requireTournamentAdmin(event);
  return result.error ? json(result.error.statusCode, { error: result.error.message }) : result;
}

export async function handler(event) {
  if (event.blobs) connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST to manage tournament guest access.' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Guest access payload must be valid JSON.' });
  }

  const action = cleanText(payload.action).toLowerCase();
  const slug = cleanText(payload.tournamentSlug || payload.slug);
  if (!slug) return json(400, { error: 'Choose a tournament before managing guest access.' });

  const tournament = await loadHostedTournament(slug);
  if (!tournament) return json(404, { error: 'That hosted tournament was not found.' });

  if (action === 'exchange') {
    const limit = await enforceRateLimit(event, {
      action: 'tournament-guest-key',
      identity: slug,
      limit: 8,
      storeName: 'tournament-guest-rate-limits',
    });
    if (!limit.allowed) return json(429, { error: 'Too many guest key attempts. Try again later.', retryAfterSeconds: limit.retryAfterSeconds });

    const rawKey = cleanText(payload.key).slice(0, 200);
    const record = await loadGuestRecord(slug);
    const valid = Boolean(
      rawKey
        && record
        && !record.revokedAt
        && new Date(record.expiresAt).getTime() > Date.now()
        && guestKeyMatches(rawKey, record),
    );
    if (!valid) return json(401, { error: guestAccessRequired().message, code: 'guest_access_required' });

    return withGuestCookie(json(200, {
      ok: true,
      tournamentSlug: slug,
      expiresAt: record.expiresAt,
      guestScope: 'event-view',
    }), slug, record.expiresAt);
  }

  const auth = await admin(event);
  if (auth?.statusCode) return auth;

  const store = getGuestStore();
  if (action === 'create' || action === 'rotate') {
    if (!process.env.TOURNAMENT_SESSION_SECRET || String(process.env.TOURNAMENT_SESSION_SECRET).trim().length < 32) {
      return json(503, { error: 'Tournament guest access is not configured on Netlify.' });
    }

    const guestKey = createGuestKey();
    const expiresAt = new Date(Date.now() + GUEST_SESSION_MAX_AGE_SECONDS * 1000).toISOString();
    await store.setJSON(guestKeyName(slug), {
      slug,
      keyHash: guestKeyDigest(guestKey),
      createdAt: new Date().toISOString(),
      expiresAt,
      createdBy: auth.method,
    });
    return json(200, {
      ok: true,
      tournamentSlug: slug,
      guestKey,
      expiresAt,
      note: 'Copy this key now. It is not stored or shown again.',
    });
  }

  if (action === 'revoke') {
    const record = await loadGuestRecord(slug, store);
    if (record) {
      await store.setJSON(guestKeyName(slug), { ...record, revokedAt: new Date().toISOString(), revokedBy: auth.method });
    }
    return json(200, { ok: true, tournamentSlug: slug, revoked: Boolean(record) });
  }

  return json(400, { error: 'Choose create, rotate, revoke, or exchange for guest access.' });
}
