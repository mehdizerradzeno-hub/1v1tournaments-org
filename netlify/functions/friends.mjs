import { connectLambda } from '@netlify/blobs';
import { FriendsAuthorityError, hubFriendsEnabled, validateFriendsServiceCaller } from './_friends-authority.mjs';
import { createProductionFriendsAuthority, syncFriendsPublicProfile } from './_friends-production-authority.mjs';
const CONTRACT_VERSION = '2026-10-13-username-1';
const headers = { 'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
function json(statusCode, body) { return { statusCode, headers, body: JSON.stringify(body) }; }
function parseBody(event) { try { const body = JSON.parse(event.body || '{}'); return body && typeof body === 'object' && !Array.isArray(body) ? body : null; } catch { return null; } }
function profile(value) { if (!value || typeof value !== 'object') throw new FriendsAuthorityError('invalid_public_profile', 'Friends requires a valid public username.', 409); const username = typeof value.username === 'string' ? value.username : value.handle; if (typeof value.canonicalAccountId !== 'string' || typeof username !== 'string') throw new FriendsAuthorityError('invalid_public_profile', 'Friends requires a valid public username.', 409); return { canonicalAccountId: value.canonicalAccountId, username }; }
function projectedProfile(value) { const base = profile(value); const result = { ...base }; if (value.presence !== undefined) result.presence = value.presence; if (value.euchreRank !== undefined) result.euchreRank = value.euchreRank; return result; }
function usernameResponse(value) { const result = { ...value, contractVersion: CONTRACT_VERSION }; for (const key of ['items', 'friends', 'incoming', 'outgoing']) if (Array.isArray(result[key])) result[key] = result[key].map(projectedProfile); if (result.profile) result.profile = projectedProfile(result.profile); return result; }
export async function handleFriendsRequest(event, dependencies = {}) {
  const env = dependencies.env || process.env;
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { ok: false, code: 'method_not_allowed' });
  if (!hubFriendsEnabled(env)) return json(404, { ok: false, code: 'feature_disabled' });
  const payload = parseBody(event);
  if (!payload) return json(400, { ok: false, code: 'invalid_request' });
  try {
    const audience = (dependencies.validateCaller || validateFriendsServiceCaller)(event, payload.audience, { env });
    if (payload.action === 'profile-sync') return json(200, { ok: true, ...usernameResponse({ profile: await (dependencies.syncProfile || syncFriendsPublicProfile)({ canonicalAccountId: payload.actorCanonicalAccountId, handle: payload.username, audience }) }) });
    const authority = dependencies.authority || await (dependencies.createAuthority || createProductionFriendsAuthority)();
    const actorCanonicalAccountId = payload.actorCanonicalAccountId;
    const idempotencyKey = event.headers?.['idempotency-key'] || event.headers?.['Idempotency-Key'];
    if (payload.action === 'search') return json(200, { ok: true, ...usernameResponse(await authority.search({ audience, actorCanonicalAccountId, query: payload.query, cursor: payload.cursor, limit: payload.limit })) });
    if (payload.action === 'snapshot') return json(200, { ok: true, ...usernameResponse(await authority.snapshot({ audience, actorCanonicalAccountId, cursors: payload.cursors, limit: payload.limit })) });
    if (payload.action === 'presence-heartbeat') return json(200, { ok: true, ...usernameResponse(await authority.heartbeatPresence({ audience, actorCanonicalAccountId })) });
    if (payload.action === 'presence-clear') return json(200, { ok: true, ...usernameResponse(await authority.clearPresence({ audience, actorCanonicalAccountId })) });
    if (['send', 'accept', 'decline', 'cancel', 'remove'].includes(payload.action)) return json(200, { ok: true, ...usernameResponse(await authority.mutate({ audience, action: payload.action, actorCanonicalAccountId, targetCanonicalAccountId: payload.targetCanonicalAccountId, idempotencyKey })) });
    return json(400, { ok: false, code: 'invalid_action' });
  } catch (error) { if (error instanceof FriendsAuthorityError) return json(error.statusCode, { ok: false, code: error.code, message: error.message }); console.error('Friends authority request failed', { errorName: error instanceof Error ? error.name : 'UnknownError', code: typeof error?.code === 'string' ? error.code : undefined }); return json(503, { ok: false, code: 'hub_unavailable' }); }
}
export async function handler(event) { if (event.blobs) connectLambda(event); return handleFriendsRequest(event); }
