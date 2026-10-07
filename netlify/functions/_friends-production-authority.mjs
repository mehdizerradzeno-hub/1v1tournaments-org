import { getDatabase, MissingDatabaseConnectionError } from '@netlify/database';

import { accountCanonicalId, cleanText, getStoreWithFallback } from './_account-utils.mjs';
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

function storageUnavailable() {
  return new FriendsAuthorityError('friends_storage_unavailable', 'Friends storage is not available.', 503);
}

/**
 * Creates the durable Hub authority only after the feature gate has already
 * admitted a trusted game service request. Missing Database configuration is
 * deliberately converted to a fail-closed Friends error.
 */
export function createProductionFriendsAuthority({ database, resolveAccount = resolveFriendsAccount } = {}) {
  let activeDatabase = database;
  try {
    activeDatabase ||= getDatabase();
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
