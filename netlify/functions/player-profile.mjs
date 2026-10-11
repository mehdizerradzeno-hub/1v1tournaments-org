import { connectLambda } from '@netlify/blobs';

import {
  PlayerProfileError,
  loadPublicPlayerProfile,
} from './_player-profile.mjs';

const headers = {
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=60',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

export async function handlePlayerProfileRequest(event, dependencies = {}) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'GET') return json(405, { ok: false, code: 'method_not_allowed' });

  try {
    const profile = await (dependencies.loadProfile || loadPublicPlayerProfile)(
      event.queryStringParameters?.handle,
      dependencies,
    );
    return json(200, { ok: true, profile });
  } catch (error) {
    if (error instanceof PlayerProfileError) {
      return json(error.statusCode, { ok: false, code: error.code, message: error.message });
    }
    console.error('Public player profile failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      code: typeof error?.code === 'string' ? error.code : undefined,
    });
    return json(503, { ok: false, code: 'profile_unavailable' });
  }
}

export async function handler(event) {
  if (event.blobs) connectLambda(event);
  return handlePlayerProfileRequest(event);
}
