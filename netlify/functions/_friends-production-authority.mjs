import { getDatabase, MissingDatabaseConnectionError } from '@netlify/database';

import {
  accountCanonicalId,
  cleanText,
  getStoreWithFallback,
  saveAccount,
} from './_account-utils.mjs';
import { FriendsAuthority, FriendsAuthorityError } from './_friends-authority.mjs';
import { PostgresFriendsAuthorityStore } from './_friends-postgres-store.mjs';

async function allAccounts() {
  const store = getStoreWithFallback('player-accounts');
  const accounts = [];
  let cursor;
  do {
    const page = await store.list(cursor ? { cursor } : {});
    const records = await Promise.all((page.blobs || []).map((blob) => store.get(blob.key, { type: 'json' })));
    accounts.push(...records.filter(Boolean));
    cursor = page.hasMore ? cleanText(page.cursor) : '';
  } while (cursor);
  return accounts;
}

/** Server-only canonical account resolver. Browser values never select an actor. */
export async function resolveFriendsAccount(value) {
  const accounts = await allAccounts();
  if (value && typeof value === 'object' && 'searchHandle' in value) {
    const handle = cleanText(value.searchHandle).replace(/^@/, '').toLowerCase();
    return accounts.filter((account) => cleanText(account.playerHandle).replace(/^@/, '').toLowerCase() === handle);
  }
  const canonicalAccountId = cleanText(value);
  return accounts.find((account) => accountCanonicalId(account) === canonicalAccountId) || null;
}

function normalizedPublicHandle(value) {
  const handle = cleanText(value).replace(/^@/, '').toLowerCase().slice(0, 32);
  if (!handle || !/^[a-z0-9._-]+$/.test(handle)) {
    throw new FriendsAuthorityError(
      'invalid_public_profile',
      'Friends requires a valid public player handle.',
      400,
    );
  }
  return handle;
}

/**
 * Hydrates an existing Hub account with the public profile that a trusted game
 * received through the signed shared-account exchange. This deliberately only
 * fills a missing handle: a later game exchange must never be able to replace
 * an account's established public identity.
 */
export async function syncFriendsPublicProfile(
  { canonicalAccountId, handle, displayName },
  options = {},
) {
  const canonicalId = cleanText(canonicalAccountId);
  if (!canonicalId) {
    throw new FriendsAuthorityError('invalid_principal', 'Friends requires a valid account.', 400);
  }

  const account = await (options.resolveAccount || resolveFriendsAccount)(canonicalId);
  if (!account) {
    throw new FriendsAuthorityError('account_not_found', 'Friends account was not found.', 404);
  }

  const publicHandle = normalizedPublicHandle(handle);
  const existingHandle = cleanText(account.playerHandle).replace(/^@/, '').toLowerCase();
  if (existingHandle && existingHandle !== publicHandle) {
    throw new FriendsAuthorityError(
      'public_profile_conflict',
      'Friends public profile does not match this account.',
      409,
    );
  }

  const publicName = cleanText(displayName).slice(0, 128);
  const updatedAccount = {
    ...account,
    playerHandle: existingHandle || publicHandle,
    playerName: cleanText(account.playerName).slice(0, 128) || publicName || publicHandle,
    updatedAt: new Date().toISOString(),
  };
  await (options.saveAccount || saveAccount)(updatedAccount);

  return {
    canonicalAccountId: accountCanonicalId(updatedAccount),
    handle: updatedAccount.playerHandle,
    displayName: updatedAccount.playerName,
  };
}

function storageUnavailable() {
  return new FriendsAuthorityError('friends_storage_unavailable', 'Friends storage is not available.', 503);
}

/**
 * Creates the durable Hub authority only after the feature gate has already
 * admitted a trusted game service request. Missing Database configuration is
 * deliberately converted to a fail-closed Friends error.
 */
export function createProductionFriendsAuthority({
  database,
  resolveAccount = resolveFriendsAccount,
  connectionString = process.env.NETLIFY_DB_URL,
} = {}) {
  let activeDatabase = database;
  try {
    // The platform-provided default can be a read-only role. Friends is the
    // sole transactional authority for relationship and presence writes, so
    // production uses its separately scoped runtime database secret.
    const configuredConnectionString = typeof connectionString === 'string'
      ? connectionString.trim()
      : '';
    activeDatabase ||= getDatabase(
      configuredConnectionString ? { connectionString: configuredConnectionString } : undefined,
    );
  } catch (error) {
    if (error instanceof MissingDatabaseConnectionError) throw storageUnavailable();
    throw error;
  }
  return new FriendsAuthority({
    store: new PostgresFriendsAuthorityStore({ pool: activeDatabase.pool }),
    resolveAccount,
  });
}

export async function deleteFriendsForAccount({ canonicalAccountId }, options = {}) {
  const authority = options.authority || createProductionFriendsAuthority(options);
  return authority.deleteAccount({ canonicalAccountId });
}
