import { randomUUID } from 'node:crypto';

import {
  accountCanonicalId,
  cleanEmail,
  cleanText,
  getStoreWithFallback,
} from './_account-utils.mjs';
import {
  deleteAccountAliases,
  listAccountAliases,
} from './_shared-account-utils.mjs';

const DELETED_PLAYER_NAME = 'Deleted Player';

const DEFAULT_SPADES_DELETION_SYNC_URL =
  'https://1v1spades.com/api/spades/account-deletion-sync';

function spadesDeletionSyncConfig(options = {}) {
  const url = String(
    options.spadesDeletionSyncUrl
    || process.env.SPADES_ACCOUNT_DELETION_SYNC_URL
    || DEFAULT_SPADES_DELETION_SYNC_URL
  ).trim();

  const token = String(
    options.spadesDeletionSyncToken
    || process.env.ACCOUNT_DELETION_SYNC_TOKEN
    || ''
  ).trim();

  return { url, token };
}

export async function syncSpadesAccountDeletion({
  canonicalAccountId,
  legacyV11AccountId = null,
}, options = {}) {
  if (typeof options.syncSpadesDeletion === 'function') {
    return options.syncSpadesDeletion({
      canonicalAccountId,
      legacyV11AccountId,
    });
  }

  const { url, token } = spadesDeletionSyncConfig(options);

  if (!url || token.length < 32) {
    throw new Error(
      'Spades account deletion sync is not configured.',
    );
  }

  const response = await (options.fetchImpl || fetch)(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-account-deletion-token': token,
    },
    body: JSON.stringify({
      canonicalAccountId,
      legacyV11AccountId,
    }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok || body?.ok !== true) {
    throw new Error(
      `Spades account deletion sync failed with HTTP ${response.status}.`,
    );
  }

  return body;
}

function resolveStore(options, name) {
  return options?.stores?.[name] || getStoreWithFallback(name);
}

function identityMatches(record, identity) {
  if (!record || typeof record !== 'object') return false;

  const ids = [
    record.accountId,
    record.accountCanonicalId,
    record.canonicalAccountId,
  ].map(cleanText).filter(Boolean);

  if (ids.some((value) => identity.ids.has(value))) return true;

  const emails = [
    record.accountEmail,
    record.contactEmail,
    record.email,
  ].map(cleanEmail).filter(Boolean);

  return emails.some((value) => identity.email && value === identity.email);
}

function includesInsensitive(value, needle) {
  if (!needle) return false;
  return String(value || '').toLowerCase().includes(String(needle).toLowerCase());
}

function scrubScalar(key, value, identity, tombstoneId) {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();

  if (identity.ids.has(trimmed)) {
    return tombstoneId;
  }

  if (
    identity.email
    && (
      cleanEmail(trimmed) === identity.email
      || includesInsensitive(value, identity.email)
    )
  ) {
    if (/email/i.test(key)) return '';
    if (/id$/i.test(key) || key === 'createdBy' || key === 'updatedBy') {
      return tombstoneId;
    }
    return DELETED_PLAYER_NAME;
  }

  const containsName = [...identity.names].some((name) => includesInsensitive(value, name));
  const containsHandle = [...identity.handles].some((handle) => includesInsensitive(value, handle));

  if (containsName || containsHandle) {
    if (/handle/i.test(key)) return '';
    if (/id$/i.test(key)) return tombstoneId;
    return DELETED_PLAYER_NAME;
  }

  return value;
}

function anonymizeIdentityObject(value, identity, tombstoneId) {
  if (Array.isArray(value)) {
    let changed = false;

    const next = value.map((item) => {
      const result = anonymizeIdentityObject(item, identity, tombstoneId);
      changed ||= result.changed;
      return result.value;
    });

    return { changed, value: next };
  }

  if (!value || typeof value !== 'object') {
    return { changed: false, value };
  }

  const matched = identityMatches(value, identity);
  let changed = false;
  const next = {};

  for (const [key, original] of Object.entries(value)) {
    let replacement = original;

    if (typeof original === 'string') {
      replacement = scrubScalar(key, original, identity, tombstoneId);
      changed ||= replacement !== original;
    } else {
      const nested = anonymizeIdentityObject(original, identity, tombstoneId);
      replacement = nested.value;
      changed ||= nested.changed;
    }

    next[key] = replacement;
  }

  if (matched) {
    for (const key of ['accountId', 'accountCanonicalId', 'canonicalAccountId']) {
      if (key in next && cleanText(next[key]) !== tombstoneId) {
        next[key] = tombstoneId;
        changed = true;
      }
    }

    for (const key of ['accountEmail', 'contactEmail', 'email']) {
      if (key in next && next[key] !== '') {
        next[key] = '';
        changed = true;
      }
    }

    for (const key of ['playerHandle', 'handle']) {
      if (key in next && next[key] !== '') {
        next[key] = '';
        changed = true;
      }
    }

    for (const key of ['playerName', 'displayName', 'name']) {
      if (key in next && next[key] !== DELETED_PLAYER_NAME) {
        next[key] = DELETED_PLAYER_NAME;
        changed = true;
      }
    }

    if ('notes' in next && next.notes !== '') {
      next.notes = '';
      changed = true;
    }
  }

  return { changed, value: next };
}

async function anonymizeTournamentSignups(identity, tombstoneId, options) {
  const store = resolveStore(options, 'tournament-signups');
  const { blobs = [] } = await store.list();
  let changed = 0;

  for (const blob of blobs) {
    const record = await store.get(blob.key, { type: 'json' });
    if (!identityMatches(record, identity)) continue;

    const anonymized = anonymizeIdentityObject(
      record,
      identity,
      tombstoneId,
    ).value;

    const tournamentSlug = cleanText(record?.tournamentSlug);

    if (!tournamentSlug) {
      await store.delete(blob.key);
      changed += 1;
      continue;
    }

    const safeTombstone = tombstoneId.replace(/[^A-Za-z0-9_-]/g, '');
    const replacementKey =
      `${tournamentSlug}/deleted-${safeTombstone}-${changed + 1}.json`;

    await store.setJSON(replacementKey, anonymized, {
      metadata: {
        tournamentSlug,
        status: cleanText(anonymized?.status) || 'deleted-account',
        createdAt: anonymized?.createdAt || new Date().toISOString(),
      },
    });

    await store.delete(blob.key);
    changed += 1;
  }

  return changed;
}

async function anonymizeStore(storeName, identity, tombstoneId, options) {
  const store = resolveStore(options, storeName);
  const { blobs = [] } = await store.list();
  let changed = 0;

  for (const blob of blobs) {
    const record = await store.get(blob.key, { type: 'json' });
    if (!record) continue;

    const anonymized = anonymizeIdentityObject(
      record,
      identity,
      tombstoneId,
    );

    if (!anonymized.changed) continue;

    await store.setJSON(blob.key, anonymized.value);
    changed += 1;
  }

  return changed;
}

async function deleteMatchingStoreRecords(storeName, identity, options) {
  const store = resolveStore(options, storeName);
  const { blobs = [] } = await store.list();
  let deleted = 0;

  for (const blob of blobs) {
    const record = await store.get(blob.key, { type: 'json' });
    if (!identityMatches(record, identity)) continue;

    await store.delete(blob.key);
    deleted += 1;
  }

  return deleted;
}

async function revokeSharedAuthorizations(identity, options) {
  const store = resolveStore(options, 'shared-account-authorizations');
  const { blobs = [] } = await store.list({ prefix: 'codes/' });
  let deleted = 0;

  for (const blob of blobs) {
    const record = await store.get(blob.key, { type: 'json' });

    if (!identityMatches(record?.identity, identity)) continue;

    const suffix = blob.key.slice('codes/'.length);

    await store.delete(blob.key);
    await store.delete(`claims/${suffix}`).catch(() => {});
    deleted += 1;
  }

  return deleted;
}

export async function deleteCanonicalAccountFootprint(account, options = {}) {
  const canonical = accountCanonicalId(account);
  const accountId = cleanText(account?.id);
  const email = cleanEmail(account?.email);

  const aliasStore = resolveStore(options, 'shared-account-aliases');
  const aliases = await listAccountAliases(canonical, {
    store: aliasStore,
  });

  const legacySpadesAlias =
    aliases.find((alias) => alias.provider === 'spades')
    ?.legacyAccountId || null;

  // Fail closed. The Spades service must finish its privacy cleanup
  // before the canonical Hub identity is removed.
  const spadesCleanup = await syncSpadesAccountDeletion(
    {
      canonicalAccountId: canonical,
      legacyV11AccountId: legacySpadesAlias,
    },
    options,
  );

  const identity = {
    email,
    ids: new Set([canonical, accountId].filter(Boolean)),
    names: new Set([cleanText(account?.playerName)].filter(Boolean)),
    handles: new Set([cleanText(account?.playerHandle)].filter(Boolean)),
  };

  const tombstoneId =
    cleanText(options.tombstoneId)
    || `deleted_${randomUUID()}`;

  const [
    aliasesDeleted,
    authorizationsDeleted,
    signupsAnonymized,
    bracketsAnonymized,
    leaguesAnonymized,
    matchTicketsDeleted,
  ] = await Promise.all([
    deleteAccountAliases(canonical, { store: aliasStore }),
    revokeSharedAuthorizations(identity, options),
    anonymizeTournamentSignups(identity, tombstoneId, options),
    anonymizeStore('tournament-brackets', identity, tombstoneId, options),
    anonymizeStore('leagues', identity, tombstoneId, options),
    deleteMatchingStoreRecords(
      'tournament-match-tickets',
      identity,
      options,
    ),
  ]);

  return {
    aliasesDeleted,
    authorizationsDeleted,
    bracketsAnonymized,
    leaguesAnonymized,
    matchTicketsDeleted,
    signupsAnonymized,
    tombstoneId,
    spadesCleanup,
  };
}
