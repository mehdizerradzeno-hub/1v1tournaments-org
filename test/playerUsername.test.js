import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PlayerUsernameError,
  playerUsernameForAccount,
  publicAccount,
  reservePlayerUsername,
  validatePlayerUsername,
} from '../netlify/functions/_account-utils.mjs';
import {
  claimUsername,
  createAccount,
} from '../netlify/functions/player-account.mjs';

class MemoryStore {
  constructor() {
    this.records = new Map();
  }

  async get(key) {
    const value = this.records.get(key);
    return value ? structuredClone(value) : null;
  }

  async setJSON(key, value, options = {}) {
    if (options.onlyIfNew && this.records.has(key)) {
      throw new Error('Record already exists');
    }
    this.records.set(key, structuredClone(value));
    return { modified: true };
  }

  async delete(key) {
    this.records.delete(key);
  }
}

test('username policy normalizes the input and rejects temporary or ambiguous identifiers', () => {
  assert.deepEqual(validatePlayerUsername('@North_Star'), {
    error: '',
    username: 'north_star',
  });
  assert.equal(playerUsernameForAccount({ playerHandle: '@North_Star' }), 'north_star');
  assert.match(validatePlayerUsername('ab').error, /3-32/);
  assert.match(validatePlayerUsername('north.star').error, /lowercase letters/);
  assert.match(validatePlayerUsername('admin').error, /reserved/);
  assert.equal(playerUsernameForAccount({ playerHandle: 'Guest 1234' }), '');
});

test('username reservation is atomic, global, and idempotent for its owner', async () => {
  const store = new MemoryStore();
  const firstAccount = { id: 'acct-first', canonicalAccountId: 'acct-first' };
  const secondAccount = { id: 'acct-second', canonicalAccountId: 'acct-second' };

  assert.deepEqual(
    await reservePlayerUsername('@North_Star', firstAccount, { store, createdAt: '2026-10-11T00:00:00.000Z' }),
    { created: true, username: 'north_star' },
  );
  assert.deepEqual(
    await reservePlayerUsername('north_star', firstAccount, { store }),
    { created: false, username: 'north_star' },
  );
  await assert.rejects(
    reservePlayerUsername('NORTH_STAR', secondAccount, { store }),
    (error) => error instanceof PlayerUsernameError && error.code === 'username_taken',
  );
});

test('new accounts require and persist the claimed username as their public identity', async () => {
  const accountStore = new Map();
  const usernameStore = new MemoryStore();
  let saved = null;

  const response = await createAccount({
    contactEmail: 'north@example.com',
    password: 'safe-password-1',
    confirmPassword: 'safe-password-1',
    playerHandle: '@North_Star',
  }, {
    getAccountByEmail: async (email) => accountStore.get(email) || null,
    reservePlayerUsername: (username, account) => reservePlayerUsername(username, account, { store: usernameStore }),
    saveAccount: async (account) => {
      saved = structuredClone(account);
      accountStore.set(account.email, saved);
    },
    createSession: async () => ({ id: 'session-created', token: 'session-created' }),
    verifiedEmailsRequired: () => false,
  });

  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 201);
  assert.equal(saved.playerHandle, 'north_star');
  assert.equal(saved.playerName, 'north_star');
  assert.equal(body.account.username, 'north_star');
  assert.equal(body.account.playerName, 'north_star');
  assert.match(response.headers['Set-Cookie'], /one_v_one_player_session=session-created/);

  const missingUsername = await createAccount({
    contactEmail: 'missing@example.com',
    password: 'safe-password-1',
    confirmPassword: 'safe-password-1',
  }, {
    getAccountByEmail: async () => null,
  });
  assert.equal(missingUsername.statusCode, 400);
  assert.equal(JSON.parse(missingUsername.body).code, 'invalid_username');
});

test('a legacy account can claim one username and receives a refreshed session', async () => {
  const usernameStore = new MemoryStore();
  const legacyAccount = {
    id: 'acct-legacy',
    canonicalAccountId: 'acct-legacy',
    email: 'legacy@example.com',
    emailVerified: true,
    playerHandle: 'old_handle',
    playerName: 'Old display name',
  };
  let saved = null;

  const response = await claimUsername({ headers: {} }, { username: 'Legacy_Player' }, {
    getAccountFromEvent: async () => legacyAccount,
    reservePlayerUsername: (username, account) => reservePlayerUsername(username, account, { store: usernameStore }),
    saveAccount: async (account) => {
      saved = structuredClone(account);
    },
    createSession: async () => ({ id: 'refreshed-session', token: 'refreshed-session' }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(saved.playerHandle, 'legacy_player');
  assert.equal(saved.playerName, 'legacy_player');
  assert.equal(JSON.parse(response.body).account.username, 'legacy_player');
  assert.match(response.headers['Set-Cookie'], /refreshed-session/);

  assert.equal(publicAccount(legacyAccount).usernameRequired, true);
  assert.equal(publicAccount(legacyAccount).username, '');

  const repeat = await claimUsername({ headers: {} }, { username: 'different_name' }, {
    getAccountFromEvent: async () => saved,
  });
  assert.equal(repeat.statusCode, 409);
  assert.equal(JSON.parse(repeat.body).code, 'username_already_claimed');
});
