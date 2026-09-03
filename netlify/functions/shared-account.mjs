import { randomUUID } from 'node:crypto';
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

const QA_EXCHANGE_REJECTION_CODES = new Set([
  'game_not_authorized',
  'authorization_not_found',
  'authorization_expired',
  'authorization_replayed',
  'authorization_unconfigured',
  'wrong_audience',
  'invalid_request',
  'invalid_operation',
  'invalid_audience',
  'unauthorized',
  'forbidden',
  'rate_limited',
  'server_error',
]);

function qaExchangeRejectionDiagnostic(error, startedAt, dependencies) {
  if ((dependencies.appEnv ?? process.env.APP_ENV) !== 'qa-native-auth') return null;

  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : null;
  const errorCode = typeof error?.code === 'string' && QA_EXCHANGE_REJECTION_CODES.has(error.code)
    ? error.code
    : 'unknown_hub_error';

  return {
    event: 'qa_shared_account_exchange_rejection',
    correlationId: `qa-hub:${randomUUID()}`,
    operation: 'exchange-game-authorization',
    audience: 'spades',
    hubStatus: statusCode,
    hubErrorCode: errorCode,
    elapsedMs: Math.max(0, Date.now() - startedAt),
  };
}

function emitQaExchangeRejection(error, startedAt, dependencies) {
  const diagnostic = qaExchangeRejectionDiagnostic(error, startedAt, dependencies);
  if (!diagnostic) return;

  const logger = dependencies.qaExchangeRejectionLogger || console.warn;
  logger(JSON.stringify(diagnostic));
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
    const authorization = await issueAuthorization(identity, payload.audience, {
      redirectUri: payload.redirectUri,
      source: payload.source,
      state: payload.state,
    });
    return json(201, { ok: true, authorization });
  }

  if (payload.action === 'exchange-game-authorization') {
    const startedAt = Date.now();
    try {
      const audience = authorizeGame(event, payload.audience);
      const identity = await exchangeAuthorization(payload.authorizationCode, audience);
      return json(200, { ok: true, identity });
    } catch (error) {
      emitQaExchangeRejection(error, startedAt, dependencies);
      throw error;
    }
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
