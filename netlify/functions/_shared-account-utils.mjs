import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

import {
  accountCanonicalId,
  cleanText,
  getStoreWithFallback,
  listAccountsByCanonicalIds,
} from './_account-utils.mjs';

export const SHARED_IDENTITY_PROTOCOL_VERSION = '2026-08-04';
export const GAME_AUTHORIZATION_TTL_MS = 2 * 60 * 1000;

const ALIAS_STORE_NAME = 'shared-account-aliases';
const AUTHORIZATION_STORE_NAME = 'shared-account-authorizations';
const SUPPORTED_GAMES = new Set(['spades', 'euchre', 'gin']);
const GAME_SECRET_ENVIRONMENT_KEYS = Object.freeze({
  spades: 'SHARED_ACCOUNT_SPADES_SECRET',
  euchre: 'SHARED_ACCOUNT_EUCHRE_SECRET',
  gin: 'SHARED_ACCOUNT_GIN_SECRET',
});
export const SPADES_NATIVE_CALLBACK_URI = 'spades-freeplay://shared-account-callback';

export function validateNativeGameCallback({ audience, source, redirectUri, state }) {
  if (!source && !redirectUri && !state) return null;
  if (source !== 'spades-native' || audience !== 'spades') {
    throw new SharedAccountContractError('The native callback belongs to a different game.', 400, 'invalid_native_callback');
  }
  if (redirectUri !== SPADES_NATIVE_CALLBACK_URI) {
    throw new SharedAccountContractError('The native callback is not allowlisted.', 400, 'invalid_native_callback');
  }
  const normalizedState = cleanText(state);
  if (!normalizedState || normalizedState.length < 32 || normalizedState.length > 128 || /\s/.test(normalizedState)) {
    throw new SharedAccountContractError('The native callback state is invalid.', 400, 'invalid_native_callback_state');
  }
  return { redirectUri: SPADES_NATIVE_CALLBACK_URI, state: normalizedState };
}

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

export async function deleteAccountAliases(canonicalAccountId, options = {}) {
  const canonicalId = cleanText(canonicalAccountId);
  if (!canonicalId) return 0;

  const store = resolveStore(options.store, ALIAS_STORE_NAME);
  const { blobs = [] } = await store.list({ prefix: 'by-alias/' });
  let deleted = 0;

  for (const blob of blobs) {
    const record = await store.get(blob.key, { type: 'json' });
    if (cleanText(record?.canonicalAccountId) !== canonicalId) continue;

    await store.delete(blob.key);
    deleted += 1;
  }

  return deleted;
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

  const storedHandle = cleanText(account.playerHandle);
  const handle = storedHandle || `player-${createHash('sha256')
    .update(canonicalAccountId)
    .digest('hex')
    .slice(0, 24)}`;

  return {
    protocolVersion: SHARED_IDENTITY_PROTOCOL_VERSION,
    canonicalAccountId,
    displayName: cleanText(account.playerName),
    handle,
    emailVerified: account.emailVerified !== false,
    aliases: await listAccountAliases(canonicalAccountId, options),
  };
}

export async function resolveGameAccountIdentities(identityKeysValue, audienceValue, options = {}) {
  const audience = normalizeGameAudience(audienceValue);
  if (!audience) {
    throw new SharedAccountContractError(
      'Choose a supported game audience.',
      400,
      'invalid_audience',
    );
  }
  if (!Array.isArray(identityKeysValue)) {
    throw new SharedAccountContractError(
      'Identity keys must be an array.',
      400,
      'invalid_identity_lookup',
    );
  }

  const identityKeys = [...new Set(identityKeysValue.map((value) => {
    const identityKeyValue = typeof value === 'string' ? value.trim() : '';
    if (!identityKeyValue || identityKeyValue.length > 128) {
      throw new SharedAccountContractError(
        'Identity keys must be non-empty strings of at most 128 characters.',
        400,
        'invalid_identity_lookup',
      );
    }
    return identityKeyValue;
  }))];
  if (identityKeys.length > 100) {
    throw new SharedAccountContractError(
      'At most 100 identities can be resolved at once.',
      400,
      'identity_lookup_limit',
    );
  }
  if (!identityKeys.length) return [];

  const aliasPairs = await Promise.all(identityKeys.map(async (identityKeyValue) => [
    identityKeyValue,
    await lookupCanonicalAccountByAlias(audience, identityKeyValue, {
      store: options.aliasStore,
    }),
  ]));
  const canonicalByIdentityKey = new Map(aliasPairs);
  const candidateCanonicalIds = new Set(identityKeys);
  for (const canonicalAccountId of canonicalByIdentityKey.values()) {
    if (canonicalAccountId) candidateCanonicalIds.add(canonicalAccountId);
  }

  const accounts = await listAccountsByCanonicalIds(
    [...candidateCanonicalIds],
    { store: options.accountStore },
  );
  const accountByCanonicalId = new Map(
    accounts.map((account) => [accountCanonicalId(account), account]),
  );
  const resolvedCanonicalIds = new Set();
  const identities = [];

  for (const identityKeyValue of identityKeys) {
    const canonicalAccountId = canonicalByIdentityKey.get(identityKeyValue) || identityKeyValue;
    if (resolvedCanonicalIds.has(canonicalAccountId)) continue;
    const account = accountByCanonicalId.get(canonicalAccountId);
    if (!account) continue;
    const identity = await sharedIdentityForAccount(account, {
      store: options.aliasStore,
    });
    if (!identity) continue;
    identities.push(identity);
    resolvedCanonicalIds.add(canonicalAccountId);
  }

  return identities;
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
  const nativeCallback = validateNativeGameCallback({
    audience,
    redirectUri: options.redirectUri,
    source: options.source,
    state: options.state,
  });
  const authorizationCode = (options.codeFactory || (() => randomBytes(32).toString('base64url')))();
  const now = Number(options.now ?? Date.now());
  const ttlMs = Math.min(Number(options.ttlMs || GAME_AUTHORIZATION_TTL_MS), GAME_AUTHORIZATION_TTL_MS);
  const record = {
    protocolVersion: SHARED_IDENTITY_PROTOCOL_VERSION,
    audience,
    identity,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    ...(nativeCallback ? { nativeCallback } : {}),
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
    ...(nativeCallback ? nativeCallback : {}),
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
  const variableName = GAME_SECRET_ENVIRONMENT_KEYS[audience];
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
