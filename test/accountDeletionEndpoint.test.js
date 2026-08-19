import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  createSignedSessionToken,
  deleteSessionsForAccount,
  getAccountFromEvent,
  isAccountDeleted,
  markAccountDeleted,
  sessionKey,
} from '../netlify/functions/_account-utils.mjs';
import {
  deleteAccount,
} from '../netlify/functions/player-account.mjs';

class MemoryStore {
  constructor(records = {}) {
    this.records = new Map(
      Object.entries(records).map(([key, value]) => [
        key,
        structuredClone(value),
      ]),
    );
  }

  async get(key) {
    const value = this.records.get(key);
    return value == null ? null : structuredClone(value);
  }

  async setJSON(key, value) {
    this.records.set(key, structuredClone(value));
  }

  async list({ prefix = '' } = {}) {
    return {
      blobs: [...this.records.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key })),
    };
  }

  async delete(key) {
    this.records.delete(key);
  }
}

const account = {
  id: 'acct_delete_test',
  canonicalAccountId: 'acct_delete_test',
  email: 'delete@example.com',
  emailVerified: true,
  playerName: 'Delete Test',
  playerHandle: '@delete',
  createdAt: '2026-08-19T00:00:00.000Z',
};

test('account deletion rejects signed-out requests', async () => {
  const response = await deleteAccount(
    { headers: {} },
    { confirmation: 'DELETE' },
    {
      getAccountFromEvent: async () => null,
    },
  );

  assert.equal(response.statusCode, 401);
  assert.match(JSON.parse(response.body).error, /sign in/i);
});

test('account deletion requires explicit DELETE confirmation', async () => {
  let cleanupCalls = 0;

  const response = await deleteAccount(
    { headers: {} },
    { confirmation: 'nope' },
    {
      getAccountFromEvent: async () => account,
      deleteCanonicalAccountFootprint: async () => {
        cleanupCalls += 1;
        return {};
      },
    },
  );

  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /type DELETE/i);
  assert.equal(cleanupCalls, 0);
});

test('authenticated confirmed deletion runs canonical cleanup in safe order', async () => {
  const calls = [];

  const response = await deleteAccount(
    { headers: {} },
    { confirmation: 'DELETE' },
    {
      getAccountFromEvent: async () => account,
      deleteCanonicalAccountFootprint: async (value) => {
        assert.equal(value.id, account.id);
        calls.push('cleanup');
        return {
          aliasesDeleted: 1,
          signupsAnonymized: 1,
        };
      },
      markAccountDeleted: async (accountId) => {
        assert.equal(accountId, account.id);
        calls.push('tombstone');
      },
      deleteSessionsForAccount: async (accountId) => {
        assert.equal(accountId, account.id);
        calls.push('sessions');
      },
      deleteAccountRecord: async (value) => {
        assert.equal(value.id, account.id);
        calls.push('credentials');
      },
    },
  );

  assert.equal(response.statusCode, 200);

  const body = JSON.parse(response.body);

  assert.equal(body.ok, true);
  assert.equal(body.deleted, true);
  assert.equal(body.account, null);
  assert.equal(body.canonicalAccountId, account.id);

  assert.deepEqual(calls, [
    'cleanup',
    'tombstone',
    'sessions',
    'credentials',
  ]);

  const cookie = response.headers?.['Set-Cookie'] || '';

  assert.match(cookie, /one_v_one_player_session=/);
  assert.match(cookie, /Max-Age=0/);
});

test('all stored sessions for the deleted account are invalidated', async () => {
  const store = new MemoryStore({
    'session-a.json': {
      id: 'session-a',
      accountId: account.id,
      accountEmail: account.email,
    },
    'session-b.json': {
      id: 'session-b',
      accountId: account.id,
      accountEmail: account.email,
    },
    'other-session.json': {
      id: 'other-session',
      accountId: 'acct_other',
      accountEmail: 'other@example.com',
    },
  });

  const deleted = await deleteSessionsForAccount(account.id, {
    store,
  });

  assert.equal(deleted, 2);
  assert.equal(await store.get('session-a.json'), null);
  assert.equal(await store.get('session-b.json'), null);
  assert.ok(await store.get('other-session.json'));
});

test('deleted-account tombstones persist and can be checked independently', async () => {
  const store = new MemoryStore();

  assert.equal(
    await isAccountDeleted(account.id, { store }),
    false,
  );

  await markAccountDeleted(account.id, { store });

  assert.equal(
    await isAccountDeleted(account.id, { store }),
    true,
  );
});

test('deleted account cannot be restored from a still-present signed session', async () => {
  const originalSecret = process.env.TOURNAMENT_SESSION_SECRET;
  process.env.TOURNAMENT_SESSION_SECRET =
    'account-deletion-test-secret-more-than-32-characters';

  try {
    const now = new Date();

    const session = {
      id: 'session-delete-test',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      accountId: account.id,
      accountEmail: account.email,
    };

    const token = createSignedSessionToken(session, account);

    const sessionStore = new MemoryStore({
      [sessionKey(session.id)]: session,
    });

    const accountStore = new MemoryStore({});
    const deletionStore = new MemoryStore();

    await markAccountDeleted(account.id, {
      store: deletionStore,
    });

    const resolved = await getAccountFromEvent(
      {
        headers: {
          cookie:
            `one_v_one_player_session=${encodeURIComponent(token)}`,
        },
      },
      {
        sessionStore,
        accountStore,
        deletionStore,
      },
    );

    assert.equal(resolved, null);

    // The rejected stored session is removed too.
    assert.equal(
      await sessionStore.get(sessionKey(session.id)),
      null,
    );
  } finally {
    if (originalSecret === undefined) {
      delete process.env.TOURNAMENT_SESSION_SECRET;
    } else {
      process.env.TOURNAMENT_SESSION_SECRET = originalSecret;
    }
  }
});

test('deleted-account check occurs before signed-claims fallback', () => {
  const source = fs.readFileSync(
    new URL(
      '../netlify/functions/_account-utils.mjs',
      import.meta.url,
    ),
    'utf8',
  );

  const deletionCheck = source.indexOf(
    'isAccountDeleted(session.accountId',
  );

  const signedFallback = source.indexOf(
    'if (!account && signedSessionInGrace',
  );

  assert.ok(deletionCheck >= 0);
  assert.ok(signedFallback >= 0);
  assert.ok(deletionCheck < signedFallback);
});
