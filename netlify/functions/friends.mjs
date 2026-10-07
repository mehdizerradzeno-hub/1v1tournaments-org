import { connectLambda } from '@netlify/blobs';

import {
  FriendsAuthorityError,
  hubFriendsEnabled,
  validateFriendsServiceCaller,
} from './_friends-authority.mjs';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function parseBody(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

/**
 * A transport seam for a future transactional central store. Production has no
 * authority dependency today, so this function fails closed even if a flag is
 * accidentally enabled. Tests inject an authority backed by the atomic store.
 */
export async function handleFriendsRequest(event, dependencies = {}) {
  const env = dependencies.env || process.env;
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { ok: false, code: 'method_not_allowed' });
  if (!hubFriendsEnabled(env)) return json(404, { ok: false, code: 'feature_disabled' });
  const payload = parseBody(event);
  if (!payload) return json(400, { ok: false, code: 'invalid_request' });
  try {
    const audience = (dependencies.validateCaller || validateFriendsServiceCaller)(event, payload.audience, { env });
    const authority = dependencies.authority;
    if (!authority) return json(503, { ok: false, code: 'friends_storage_unavailable' });
    const actorCanonicalAccountId = payload.actorCanonicalAccountId;
    const idempotencyKey = event.headers?.['idempotency-key'] || event.headers?.['Idempotency-Key'];
    if (payload.action === 'search') {
      return json(200, { ok: true, ...(await authority.search({ audience, actorCanonicalAccountId, query: payload.query, cursor: payload.cursor, limit: payload.limit })) });
    }
    if (payload.action === 'snapshot') {
      return json(200, { ok: true, ...(await authority.snapshot({ audience, actorCanonicalAccountId, cursors: payload.cursors, limit: payload.limit })) });
    }
    if (payload.action === 'presence-heartbeat') {
      return json(200, { ok: true, ...(await authority.heartbeatPresence({ audience, actorCanonicalAccountId })) });
    }
    if (payload.action === 'presence-clear') {
      return json(200, { ok: true, ...(await authority.clearPresence({ audience, actorCanonicalAccountId })) });
    }
    if (['send', 'accept', 'decline', 'cancel', 'remove'].includes(payload.action)) {
      return json(200, { ok: true, ...(await authority.mutate({ audience, action: payload.action, actorCanonicalAccountId, targetCanonicalAccountId: payload.targetCanonicalAccountId, idempotencyKey })) });
    }
    return json(400, { ok: false, code: 'invalid_action' });
  } catch (error) {
    if (error instanceof FriendsAuthorityError) {
      return json(error.statusCode, { ok: false, code: error.code, message: error.message });
    }
    return json(503, { ok: false, code: 'hub_unavailable' });
  }
}

export async function handler(event) {
  if (event.blobs) connectLambda(event);
  return handleFriendsRequest(event);
}
