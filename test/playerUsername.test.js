import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PlayerUsernameError,
  releasePlayerUsernameReservation,
  reservePlayerUsername,
  publicAccount,
  USERNAME_CHANGE_COOLDOWN_MS,
  validatePlayerUsername,
} from '../netlify/functions/_account-utils.mjs';
import {
  changeUsername,
  createAccount,
} from '../netlify/functions/player-account.mjs';
import { relinkSignupIdentity } from '../netlify/functions/tournament-signup.mjs';

const checkInScreenFile = fileURLToPath(new URL('../src/screens/CheckInScreen.jsx', import.meta.url));
const accountConnectScreenFile = fileURLToPath(new URL('../src/screens/SpadesAccountConnectScreen.jsx', import.meta.url));

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

test('username prompts match the shared policy and do not claim usernames are immutable', () => {
  const source = readFileSync(checkInScreenFile, 'utf8');

  assert.match(source, /3–20 letters, numbers, or underscores/);
  assert.doesNotMatch(source, /3[-–]32 lowercase characters/);
  assert.match(source, /You can change it later if another username is available\./);
  assert.doesNotMatch(source, /It cannot be changed\./);

  const accountSource = readFileSync(accountConnectScreenFile, 'utf8');
  assert.match(accountSource, /once every 24 hours/);
  assert.match(accountSource, /Username changes are locked for/);
});

test('the current-account projection never exposes an unclaimed legacy display name', () => {
  const legacy = {
    id: 'acct-legacy',
    canonicalAccountId: 'acct-legacy',
    email: 'legacy@example.com',
    playerHandle: '@legacy-name',
    playerName: 'Temporary Legacy Name',
  };

  const publicLegacy = publicAccount(legacy);
  assert.equal(publicLegacy.playerName, '');
  assert.equal(publicLegacy.playerHandle, '');
  assert.equal(publicLegacy.usernameRequired, true);
  assert.equal(JSON.stringify(publicLegacy).includes(legacy.playerName), false);

  const claimed = publicAccount({
    ...legacy,
    playerHandle: 'permanent_name',
    usernameClaimedAt: '2026-10-11T00:00:00.000Z',
  });
  assert.equal(claimed.playerName, 'permanent_name');
  assert.equal(claimed.playerHandle, 'permanent_name');
  assert.equal(claimed.usernameRequired, false);
});

test('relinking a legacy tournament signup replaces its temporary name with the claimed username', () => {
  const legacySignup = {
    id: 'signup-legacy',
    playerName: 'Temporary Table Name',
    playerHandle: 'temporary-name',
    notes: 'Existing registration note',
    status: 'registered',
    createdAt: '2026-10-10T10:00:00.000Z',
  };
  const account = {
    id: 'acct-player',
    canonicalAccountId: 'acct-player',
    email: 'player@example.com',
  };

  const relinked = relinkSignupIdentity(legacySignup, {
    account,
    contactEmail: account.email,
    now: '2026-10-11T12:00:00.000Z',
    playerHandle: 'permanent_name',
    tournamentSlug: 'spades-open',
  });

  assert.equal(relinked.playerName, 'permanent_name');
  assert.equal(relinked.playerHandle, 'permanent_name');
  assert.equal(relinked.canonicalAccountId, account.canonicalAccountId);
  assert.equal(relinked.createdAt, legacySignup.createdAt);
  assert.equal(relinked.notes, legacySignup.notes);
  assert.equal(JSON.stringify(relinked).includes(legacySignup.playerName), false);
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

test('a username rename is locked for 24 hours and exposes the retry timestamp', async () => {
  const usernames = new MemoryStore();
  const reserve = usernameReservation(usernames);
  const release = usernameRelease(usernames);
  const changedAt = '2026-10-16T12:00:00.000Z';
  const account = {
    id: 'acct-player',
    canonicalAccountId: 'acct-player',
    email: 'player@example.com',
    playerName: 'old_name',
    playerHandle: 'old_name',
    usernameClaimedAt: changedAt,
    usernameChangedAt: changedAt,
  };
  await reserve(account.playerHandle, account);
  let saved = false;

  const response = await changeUsername({ headers: {} }, { username: 'new_name' }, {
    now: () => new Date('2026-10-16T12:00:00.000Z'),
    getAccountFromEvent: async () => account,
    reservePlayerUsername: reserve,
    releasePlayerUsernameReservation: release,
    saveAccount: async () => { saved = true; },
  });

  assert.equal(response.statusCode, 429);
  const body = JSON.parse(response.body);
  assert.equal(body.code, 'username_change_cooldown');
  assert.equal(body.retryAfterSeconds, 86400);
  assert.equal(body.usernameChangeAvailableAt, '2026-10-17T12:00:00.000Z');
  assert.equal(saved, false);
  assert.equal(publicAccount(account).usernameChangeAvailableAt, body.usernameChangeAvailableAt);
  assert.equal(USERNAME_CHANGE_COOLDOWN_MS, 24 * 60 * 60 * 1000);
});

test('a username rename is allowed after the cooldown and starts a new timer', async () => {
  const usernames = new MemoryStore();
  const reserve = usernameReservation(usernames);
  const release = usernameRelease(usernames);
  const changedAt = '2026-10-16T12:00:00.000Z';
  const account = {
    id: 'acct-player',
    canonicalAccountId: 'acct-player',
    email: 'player@example.com',
    playerName: 'old_name',
    playerHandle: 'old_name',
    usernameClaimedAt: changedAt,
    usernameChangedAt: changedAt,
  };
  await reserve(account.playerHandle, account);
  let saved = null;

  const response = await changeUsername({ headers: {} }, { username: 'new_name' }, {
    now: () => new Date('2026-10-17T12:00:00.000Z'),
    getAccountFromEvent: async () => account,
    reservePlayerUsername: reserve,
    releasePlayerUsernameReservation: release,
    saveAccount: async (updated) => { saved = structuredClone(updated); },
    createSession: async () => ({ id: 'renamed-session', token: 'renamed-session' }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(saved.usernameChangedAt, '2026-10-17T12:00:00.000Z');
  assert.equal(JSON.parse(response.body).account.usernameChangeAvailableAt, '2026-10-18T12:00:00.000Z');
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
