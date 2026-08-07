import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

import {
  accountCanonicalId,
  cleanText,
  getStoreWithFallback,
} from './_account-utils.mjs';

export const SHARED_IDENTITY_PROTOCOL_VERSION = '2026-08-04';
export const GAME_AUTHORIZATION_TTL_MS = 2 * 60 * 1000;

const ALIAS_STORE_NAME = 'shared-account-aliases';
const AUTHORIZATION_STORE_NAME = 'shared-account-authorizations';
const SUPPORTED_GAMES = new Set(['spades', 'euchre']);

export class SharedAccountContractError extends Error {
  constructor(message, statusCode = 400, code = 'shared_account_error') {
    super(message);
    this.name = 'SharedAccountContractError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function hashKey(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function resolveStore(store, name) {
  return store || getStoreWithFallback(name);
}

export function normalizeGameAudience(value) {
  const audience = cleanText(value).toLowerCase();
  return SUPPORTED_GAMES.has(audience) ? audience : '';
}

function normalizeAlias(value = {}) {
  const provider = normalizeGameAudience(value.provider);
  const legacyAccountId = cleanText(value.legacyAccountId);

  if (!provider || !legacyAccountId) {
    throw new SharedAccountContractError(
      'Choose a supported game provider and legacy account ID.',
      400,
      'invalid_alias',
    );
  }

  return { provider, legacyAccountId };
}

function aliasKey(provider, legacyAccountId) {
  return `by-alias/${provider}/${hashKey(`${provider}:${legacyAccountId}`)}.json`;
}

function authorizationKey(code) {
  return `codes/${hashKey(code)}.json`;
}

function authorizationClaimKey(code) {
  return `claims/${hashKey(code)}.json`;
}

export async function lookupCanonicalAccountByAlias(provider, legacyAccountId, options = {}) {
  const alias = normalizeAlias({ provider, legacyAccountId });
  const store = resolveStore(options.store, ALIAS_STORE_NAME);
  const record = await store.get(aliasKey(alias.provider, alias.legacyAccountId), { type: 'json' });
  return cleanText(record?.canonicalAccountId) || null;
}

export async function listAccountAliases(canonicalAccountId, options = {}) {
  const canonicalId = cleanText(canonicalAccountId);
  if (!canonicalId) return [];

  const store = resolveStore(options.store, ALIAS_STORE_NAME);
  const { blobs = [] } = await store.list({ prefix: 'by-alias/' });
  const records = await Promise.all(blobs.map((blob) => store.get(blob.key, { type: 'json' })));

  return records
    .filter((record) => cleanText(record?.canonicalAccountId) === canonicalId)
    .map((record) => ({
      provider: normalizeGameAudience(record.provider),
      legacyAccountId: cleanText(record.legacyAccountId),
    }))
    .filter((record) => record.provider && record.legacyAccountId)
    .sort((left, right) => `${left.provider}:${left.legacyAccountId}`.localeCompare(`${right.provider}:${right.legacyAccountId}`));
}

export async function addAccountAlias(account, aliasValue, options = {}) {
  const canonicalAccountId = accountCanonicalId(account);
  if (!canonicalAccountId) {
    throw new SharedAccountContractError('A canonical account is required before linking an alias.', 400, 'canonical_account_required');
  }

  const alias = normalizeAlias(aliasValue);
  const store = resolveStore(options.store, ALIAS_STORE_NAME);
  const key = aliasKey(alias.provider, alias.legacyAccountId);
  const existing = await store.get(key, { type: 'json' });

  if (existing) {
    if (cleanText(existing.canonicalAccountId) !== canonicalAccountId) {
      throw new SharedAccountContractError(
        'That legacy account is already linked to another canonical account.',
        409,
        'alias_collision',
      );
    }

    return { alias, canonicalAccountId, created: false };
  }

  const record = {
    ...alias,
    canonicalAccountId,
    createdAt: new Date(options.now || Date.now()).toISOString(),
  };

  try {
    await store.setJSON(key, record, {
      onlyIfNew: true,
      metadata: {
        provider: alias.provider,
        canonicalAccountId,
      },
    });
  } catch {
    const racedRecord = await store.get(key, { type: 'json' });
    if (cleanText(racedRecord?.canonicalAccountId) === canonicalAccountId) {
      return { alias, canonicalAccountId, created: false };
    }
    throw new SharedAccountContractError(
      'That legacy account is already linked to another canonical account.',
      409,
      'alias_collision',
    );
  }

  return { alias, canonicalAccountId, created: true };
}

export async function sharedIdentityForAccount(account, options = {}) {
  const canonicalAccountId = accountCanonicalId(account);
  if (!canonicalAccountId) return null;

  return {
    protocolVersion: SHARED_IDENTITY_PROTOCOL_VERSION,
    canonicalAccountId,
    displayName: cleanText(account.playerName),
    handle: cleanText(account.playerHandle),
    emailVerified: account.emailVerified !== false,
    aliases: await listAccountAliases(canonicalAccountId, options),
  };
}

export async function createGameAuthorization(identity, audienceValue, options = {}) {
  const audience = normalizeGameAudience(audienceValue);
  if (!audience) {
    throw new SharedAccountContractError('Choose Spades or Euchre for account authorization.', 400, 'invalid_audience');
  }
  if (!identity?.canonicalAccountId || identity.protocolVersion !== SHARED_IDENTITY_PROTOCOL_VERSION) {
    throw new SharedAccountContractError('A current canonical identity is required.', 400, 'invalid_identity');
  }

  const store = resolveStore(options.store, AUTHORIZATION_STORE_NAME);
  const authorizationCode = (options.codeFactory || (() => randomBytes(32).toString('base64url')))();
  const now = Number(options.now ?? Date.now());
  const ttlMs = Math.min(Number(options.ttlMs || GAME_AUTHORIZATION_TTL_MS), GAME_AUTHORIZATION_TTL_MS);
  const record = {
    protocolVersion: SHARED_IDENTITY_PROTOCOL_VERSION,
    audience,
    identity,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
  };

  await store.setJSON(authorizationKey(authorizationCode), record, {
    onlyIfNew: true,
    metadata: {
      audience,
      canonicalAccountId: identity.canonicalAccountId,
      expiresAt: record.expiresAt,
    },
  });

  return {
    protocolVersion: SHARED_IDENTITY_PROTOCOL_VERSION,
    authorizationCode,
    audience,
    expiresAt: record.expiresAt,
  };
}

export async function exchangeGameAuthorization(authorizationCode, audienceValue, options = {}) {
  const code = cleanText(authorizationCode);
  const audience = normalizeGameAudience(audienceValue);
  if (!code || !audience) {
    throw new SharedAccountContractError('A valid authorization code and audience are required.', 400, 'invalid_authorization');
  }

  const store = resolveStore(options.store, AUTHORIZATION_STORE_NAME);
  const record = await store.get(authorizationKey(code), { type: 'json' });
  if (!record) {
    throw new SharedAccountContractError('That account authorization was not found.', 401, 'authorization_not_found');
  }
  if (record.audience !== audience) {
    throw new SharedAccountContractError('That account authorization belongs to a different game.', 403, 'wrong_audience');
  }
  if (new Date(record.expiresAt).getTime() <= Number(options.now ?? Date.now())) {
    throw new SharedAccountContractError('That account authorization expired.', 401, 'authorization_expired');
  }

  try {
    await store.setJSON(authorizationClaimKey(code), {
      audience,
      claimedAt: new Date(options.now ?? Date.now()).toISOString(),
    }, { onlyIfNew: true });
  } catch {
    throw new SharedAccountContractError('That account authorization was already used.', 409, 'authorization_replayed');
  }

  return record.identity;
}

function configuredGameSecret(audience) {
  const variableName = audience === 'spades'
    ? 'SHARED_ACCOUNT_SPADES_SECRET'
    : 'SHARED_ACCOUNT_EUCHRE_SECRET';
  return String(process.env[variableName] || '').trim();
}

export function validateGameAuthorizationCaller(event, audienceValue) {
  const audience = normalizeGameAudience(audienceValue);
  const secret = audience ? configuredGameSecret(audience) : '';
  if (!audience) {
    throw new SharedAccountContractError('Choose a supported game audience.', 400, 'invalid_audience');
  }
  if (secret.length < 32) {
    throw new SharedAccountContractError('Shared account authorization is not configured for this game.', 503, 'authorization_unconfigured');
  }

  const authorization = String(event.headers?.authorization || event.headers?.Authorization || '');
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    throw new SharedAccountContractError('Game authorization credentials were rejected.', 401, 'game_not_authorized');
  }

  return audience;
}
