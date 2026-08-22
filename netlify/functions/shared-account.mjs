import { connectLambda } from '@netlify/blobs';

import { getAccountFromEvent } from './_account-utils.mjs';
import {
  SharedAccountContractError,
  createGameAuthorization,
  exchangeGameAuthorization,
  resolveGameAccountIdentities,
  sharedIdentityForAccount,
  validateGameAuthorizationCaller,
} from './_shared-account-utils.mjs';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || '{}');
  } catch {
    return null;
  }
}

export async function handleSharedAccountRequest(event, dependencies = {}) {
  const resolveAccount = dependencies.getAccountFromEvent || getAccountFromEvent;
  const resolveIdentity = dependencies.sharedIdentityForAccount || sharedIdentityForAccount;
  const issueAuthorization = dependencies.createGameAuthorization || createGameAuthorization;
  const exchangeAuthorization = dependencies.exchangeGameAuthorization || exchangeGameAuthorization;
  const resolveGameIdentities = dependencies.resolveGameAccountIdentities || resolveGameAccountIdentities;
  const authorizeGame = dependencies.validateGameAuthorizationCaller || validateGameAuthorizationCaller;

  if (event.httpMethod === 'OPTIONS') return json(204, {});

  if (event.httpMethod === 'GET') {
    const account = await resolveAccount(event);
    if (!account) return json(401, { error: 'Sign in to load your shared 1v1 identity.' });
    return json(200, { ok: true, identity: await resolveIdentity(account) });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use GET for shared identity or POST for game authorization.' });
  }

  const payload = parseBody(event);
  if (!payload) return json(400, { error: 'Shared account payload must be valid JSON.' });

  if (payload.action === 'issue-game-authorization') {
    const account = await resolveAccount(event);
    if (!account) return json(401, { error: 'Sign in before authorizing a game.' });
    const identity = await resolveIdentity(account);
    const authorization = await issueAuthorization(identity, payload.audience);
    return json(201, { ok: true, authorization });
  }

  if (payload.action === 'exchange-game-authorization') {
    const audience = authorizeGame(event, payload.audience);
    const identity = await exchangeAuthorization(payload.authorizationCode, audience);
    return json(200, { ok: true, identity });
  }

  if (payload.action === 'resolve-game-identities') {
    const audience = authorizeGame(event, payload.audience);
    const identities = await resolveGameIdentities(payload.identityKeys, audience);
    return json(200, { ok: true, identities });
  }

  return json(400, { error: 'Choose a supported shared account action.' });
}

export async function handler(event) {
  if (event.blobs) connectLambda(event);

  try {
    return await handleSharedAccountRequest(event);
  } catch (error) {
    if (error instanceof SharedAccountContractError) {
      return json(error.statusCode, { error: error.message, code: error.code });
    }
    console.error('Shared account authorization failed', error);
    return json(500, { error: 'Shared account authorization is not available yet.' });
  }
}
