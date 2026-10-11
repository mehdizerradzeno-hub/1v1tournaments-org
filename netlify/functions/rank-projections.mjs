import { connectLambda } from '@netlify/blobs';

import { listAccountsByCanonicalIds } from './_account-utils.mjs';
import {
  GameRankProjectionError,
  lookupGameRankProjections,
  normalizeGameRankProjection,
  upsertGameRankProjection,
  validateGameRankProjectionServiceCaller,
} from './_game-rank-projections.mjs';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
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

async function assertCanonicalAccountExists(canonicalAccountId, resolveAccounts) {
  const accounts = await resolveAccounts([canonicalAccountId]);
  if (!accounts.some((account) => account?.canonicalAccountId === canonicalAccountId || account?.id === canonicalAccountId)) {
    throw new GameRankProjectionError('account_not_found', 'That shared account is unavailable.', 404);
  }
}

export async function handleRankProjectionRequest(event, dependencies = {}) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { ok: false, code: 'method_not_allowed' });
  const payload = parseBody(event);
  if (!payload) return json(400, { ok: false, code: 'invalid_request' });

  try {
    const audience = (dependencies.validateCaller || validateGameRankProjectionServiceCaller)(
      event,
      payload.audience,
      { env: dependencies.env || process.env },
    );
    const store = dependencies.projectionStore;
    if (payload.action === 'upsert') {
      const projection = normalizeGameRankProjection(payload.projection);
      if (projection.game !== audience) {
        throw new GameRankProjectionError('wrong_audience', 'A game can publish only its own rank projection.', 403);
      }
      await assertCanonicalAccountExists(
        projection.canonicalAccountId,
        dependencies.resolveAccounts || listAccountsByCanonicalIds,
      );
      const result = await (dependencies.upsert || upsertGameRankProjection)(projection, { store });
      return json(200, { ok: true, ...result });
    }
    if (payload.action === 'lookup') {
      const result = await (dependencies.lookup || lookupGameRankProjections)(
        payload.canonicalAccountIds,
        { store },
      );
      return json(200, { ok: true, ...result });
    }
    return json(400, { ok: false, code: 'invalid_action' });
  } catch (error) {
    if (error instanceof GameRankProjectionError) {
      return json(error.statusCode, { ok: false, code: error.code, message: error.message });
    }
    console.error('Rank projection request failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      code: typeof error?.code === 'string' ? error.code : undefined,
    });
    return json(503, { ok: false, code: 'hub_unavailable' });
  }
}

export async function handler(event) {
  if (event.blobs) connectLambda(event);
  return handleRankProjectionRequest(event);
}
