import { getStoreWithFallback } from './_account-utils.mjs';
import { backupKey, backupStoreNames } from './_scheduled-ops-utils.mjs';

async function snapshotStore(name) {
  const store = getStoreWithFallback(name);
  const { blobs } = await store.list();
  const records = await Promise.all(blobs.map(async (blob) => ({
    key: blob.key,
    data: await store.get(blob.key, { type: 'json' }),
  })));

  return records.filter((record) => record.data !== null && record.data !== undefined);
}

export async function runTournamentBackup(now = new Date()) {
  const createdAt = new Date(now).toISOString();
  const stores = {};

  for (const name of backupStoreNames()) {
    stores[name] = await snapshotStore(name);
  }

  const snapshot = {
    schemaVersion: 1,
    createdAt,
    excludedStores: ['player-accounts', 'player-sessions', 'player-account-codes', 'rate-limits'],
    stores,
  };
  const store = getStoreWithFallback('tournament-backups');
  const key = backupKey(now);

  await store.setJSON(key, snapshot, {
    metadata: {
      createdAt,
      schemaVersion: '1',
      storeCount: String(Object.keys(stores).length),
    },
  });

  return {
    key,
    createdAt,
    storeCount: Object.keys(stores).length,
    recordCount: Object.values(stores).reduce((total, records) => total + records.length, 0),
  };
}

export default async function tournamentBackup() {
  try {
    const result = await runTournamentBackup();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error('Tournament backup failed', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export const config = {
  schedule: '@daily',
};
