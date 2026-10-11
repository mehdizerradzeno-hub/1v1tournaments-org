import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PlayerUsernameError,
  releasePlayerUsernameReservation,
  reservePlayerUsername,
  validatePlayerUsername,
} from '../netlify/functions/_account-utils.mjs';
import {
  changeUsername,
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

function usernameReservation(store) {
  return (username, account) => reservePlayerUsername(username, account, {
    store,
    findPlayerUsernameOwner: async () => null,
  });
}

function usernameRelease(store) {
  return (username, account) => releasePlayerUsernameReservation(username, account, { store });
}

test('username policy normalizes case and accepts only 3-20 letters, numbers, or underscores', () => {
  assert.deepEqual(validatePlayerUsername('@North_Star'), {
    error: '',
    username: 'north_star',
  });
  assert.match(validatePlayerUsername('ab').error, /3-20/);
  assert.match(validatePlayerUsername('a'.repeat(21)).error, /3-20/);
  assert.match(validatePlayerUsername('north-star').error, /letters, numbers, and underscores/);
  assert.match(validatePlayerUsername('north.star').error, /letters, numbers, and underscores/);
  assert.match(validatePlayerUsername('north star').error, /letters, numbers, and underscores/);
});

test('username reservation is case-insensitive, global, and idempotent for its owner', async () => {
  const store = new MemoryStore();
  const reserve = usernameReservation(store);
  const firstAccount = { id: 'acct-first', canonicalAccountId: 'acct-first' };
  const secondAccount = { id: 'acct-second', canonicalAccountId: 'acct-second' };

  assert.deepEqual(await reserve('@North_Star', firstAccount), {
    created: true,
    username: 'north_star',
  });
  assert.deepEqual(await reserve('NORTH_STAR', firstAccount), {
    created: false,
    username: 'north_star',
  });
  await assert.rejects(
    reserve('north_star', secondAccount),
    (error) => error instanceof PlayerUsernameError && error.code === 'username_taken',
  );
});

test('new Tournament accounts require a unique username', async () => {
  const usernames = new MemoryStore();
  const accounts = new Map();
  let saved = null;

  const response = await createAccount({
    contactEmail: 'north@example.com',
    password: 'safe-password-1',
    confirmPassword: 'safe-password-1',
    username: 'North_Star',
  }, {
    getAccountByEmail: async (email) => accounts.get(email) || null,
    reservePlayerUsername: usernameReservation(usernames),
    releasePlayerUsernameReservation: usernameRelease(usernames),
    saveAccount: async (account) => {
      saved = structuredClone(account);
      accounts.set(account.email, saved);
    },
    createSession: async () => ({ id: 'created-session', token: 'created-session' }),
    verifiedEmailsRequired: () => false,
  });

  assert.equal(response.statusCode, 201);
  assert.equal(saved.playerHandle, 'north_star');
  assert.equal(saved.playerName, 'north_star');
  assert.equal(JSON.parse(response.body).account.playerHandle, 'north_star');

  const invalid = await createAccount({
    contactEmail: 'invalid@example.com',
    password: 'safe-password-1',
    confirmPassword: 'safe-password-1',
    username: 'not allowed',
  }, { getAccountByEmail: async () => null });
  assert.equal(invalid.statusCode, 400);
  assert.equal(JSON.parse(invalid.body).code, 'invalid_username');
});

test('a rename keeps the canonical account and releases the previous username', async () => {
  const usernames = new MemoryStore();
  const reserve = usernameReservation(usernames);
  const release = usernameRelease(usernames);
  const account = {
    id: 'acct-player',
    canonicalAccountId: 'acct-player',
    email: 'player@example.com',
    playerName: 'old_name',
    playerHandle: 'old_name',
  };
  await reserve(account.playerHandle, account);
  let saved = null;

  const response = await changeUsername({ headers: {} }, { username: 'New_Name' }, {
    getAccountFromEvent: async () => account,
    reservePlayerUsername: reserve,
    releasePlayerUsernameReservation: release,
    saveAccount: async (updated) => { saved = structuredClone(updated); },
    createSession: async () => ({ id: 'renamed-session', token: 'renamed-session' }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(saved.canonicalAccountId, 'acct-player');
  assert.equal(saved.playerHandle, 'new_name');
  assert.equal(JSON.parse(response.body).account.playerName, 'new_name');
  assert.match(response.headers['Set-Cookie'], /renamed-session/);

  const nextAccount = { id: 'acct-next', canonicalAccountId: 'acct-next' };
  assert.deepEqual(await reserve('OLD_NAME', nextAccount), {
    created: true,
    username: 'old_name',
  });
});

test('a rename rejects a username held by another account without changing the signed-in account', async () => {
  const usernames = new MemoryStore();
  const reserve = usernameReservation(usernames);
  const release = usernameRelease(usernames);
  const account = {
    id: 'acct-player',
    canonicalAccountId: 'acct-player',
    email: 'player@example.com',
    playerName: 'player_one',
    playerHandle: 'player_one',
  };
  const other = { id: 'acct-other', canonicalAccountId: 'acct-other' };
  await reserve(account.playerHandle, account);
  await reserve('claimed_name', other);
  let saved = false;

  const response = await changeUsername({ headers: {} }, { username: 'CLAIMED_NAME' }, {
    getAccountFromEvent: async () => account,
    reservePlayerUsername: reserve,
    releasePlayerUsernameReservation: release,
    saveAccount: async () => { saved = true; },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(JSON.parse(response.body).code, 'username_taken');
  assert.equal(saved, false);
});
