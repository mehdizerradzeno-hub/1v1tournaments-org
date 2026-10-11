import { getDatabase, MissingDatabaseConnectionError } from '@netlify/database';

import {
  accountCanonicalId,
  cleanText,
  getStoreWithFallback,
  hasClaimedPlayerUsername,
  playerUsernameForAccount,
  validatePlayerUsername,
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
    const handle = validatePlayerUsername(value.searchHandle).username;
    return handle
      ? accounts.filter((account) => validatePlayerUsername(account.playerHandle).username === handle)
      : [];
  }
  const canonicalAccountId = cleanText(value);
  return accounts.find((account) => accountCanonicalId(account) === canonicalAccountId) || null;
}

function normalizedPublicHandle(value) {
  const handle = playerUsernameForAccount({ playerHandle: value });
  if (!handle) {
    throw new FriendsAuthorityError(
      'invalid_public_profile',
      'Friends requires a valid public player handle.',
      400,
    );
  }
  return handle;
}

/**
 * Validates that the public profile returned to a trusted game still matches
 * the Hub account. Games cannot create or rename an identity: names change
 * only through the authenticated player-account endpoint.
 */
export async function syncFriendsPublicProfile(
  { canonicalAccountId, handle },
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

  const accountUsername = playerUsernameForAccount(account);
  if (!accountUsername || !hasClaimedPlayerUsername(account)) {
    throw new FriendsAuthorityError(
      'username_required',
      'Choose a unique username in your 1v1 account before using Friends.',
      409,
    );
  }

  const publicHandle = normalizedPublicHandle(handle);
  if (accountUsername !== publicHandle) {
    throw new FriendsAuthorityError(
      'public_profile_conflict',
      'Friends public profile does not match this account.',
      409,
    );
  }

  return {
    canonicalAccountId: accountCanonicalId(account),
    handle: accountUsername,
    displayName: accountUsername,
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
    // Friends uses the platform runtime connection. Migration 0003 grants
    // that role mutation rights only on the Friends authority tables.
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
