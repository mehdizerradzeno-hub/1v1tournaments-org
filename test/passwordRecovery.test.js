import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPasswordResetUrl,
  consumePlayerEmailCode,
  issuePlayerEmailCode,
} from '../netlify/functions/_player-email.mjs';
import {
  createPasswordRecord,
  createSignedSessionToken,
  getAccountFromEvent,
  sessionKey,
  verifyPassword,
} from '../netlify/functions/_account-utils.mjs';
import {
  loginAccount,
  requestEmailCode,
  resetAccountPassword,
} from '../netlify/functions/player-account.mjs';
import {
  normalizeTournamentAccountMode,
  readPasswordRecoveryFragment,
} from '../src/lib/accountConnect.js';

class MemoryStore {
  constructor(records = {}) {
    this.records = new Map(Object.entries(records));
    this.etags = new Map([...this.records.keys()].map((key) => [key, 'etag-1']));
    this.version = 1;
  }

  async get(key) {
    const value = this.records.get(key);
    return value == null ? null : structuredClone(value);
  }

  async getWithMetadata(key) {
    const value = this.records.get(key);
    return value == null
      ? null
      : {
        data: structuredClone(value),
        etag: this.etags.get(key),
        metadata: {},
      };
  }

  async setJSON(key, value, options = {}) {
    if (options.onlyIfMatch && this.etags.get(key) !== options.onlyIfMatch) {
      return { modified: false };
    }

    this.version += 1;
    const etag = `etag-${this.version}`;
    this.records.set(key, structuredClone(value));
    this.etags.set(key, etag);
    return { etag, modified: true };
  }

  async delete(key) {
    this.records.delete(key);
    this.etags.delete(key);
  }
}

const email = 'recovery@example.com';
const resetToken = 'A'.repeat(43);
const baseTime = Date.parse('2026-08-22T18:00:00.000Z');

async function issueReset({ store = new MemoryStore(), token = resetToken } = {}) {
  let message;
  const result = await issuePlayerEmailCode({
    email,
    playerName: 'Recovery Test',
    purpose: 'reset-password',
  }, {
    createResetToken: () => token,
    now: () => baseTime,
    providerConfigured: true,
    sendPlayerEmail: async (payload) => {
      message = payload;
      return { configured: true, id: 'delivery-id', ok: true };
    },
    store,
  });

  return { message, result, store, token };
}

test('reset email uses the production fragment route and stores only a hashed 256-bit credential', async () => {
  const { message, result, store, token } = await issueReset();
  const resetUrl = message.text.match(/https:\/\/[^\s]+/)?.[0];

  assert.ok(resetUrl);
  assert.equal(new URL(resetUrl).origin, 'https://1v1tournaments.org');
  assert.equal(new URL(resetUrl).pathname, '/account');
  assert.equal(new URL(resetUrl).searchParams.get('mode'), 'reset');
  assert.equal(new URL(resetUrl).searchParams.has('token'), false);

  const fragment = new URLSearchParams(new URL(resetUrl).hash.slice(1));
  assert.equal(fragment.get('email'), email);
  assert.equal(fragment.get('token'), token);
  assert.doesNotMatch(message.subject, new RegExp(token));
  assert.match(message.text, /expires in 15 minutes/i);
  assert.match(message.text, /request a new reset link/i);
  assert.equal(result.expiresAt, '2026-08-22T18:15:00.000Z');

  const [record] = [...store.records.values()];
  assert.equal(record.credentialType, 'opaque-link-token');
  assert.equal(record.codeHash.length, 64);
  assert.equal(JSON.stringify(record).includes(token), false);
});

test('valid reset credential is atomically single-use and concurrent reuse is rejected', async () => {
  const { store, token } = await issueReset();
  const attempt = () => consumePlayerEmailCode({
    email,
    purpose: 'reset-password',
    token,
  }, {
    now: () => baseTime + 1_000,
    store,
  });

  const results = await Promise.all([attempt(), attempt()]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(await attempt(), false);
});

test('atomic recovery claims do not require an unavailable Lambda strong-read URL', async () => {
  const { store, token } = await issueReset({ token: 'F'.repeat(43) });
  const getWithMetadata = store.getWithMetadata.bind(store);

  store.getWithMetadata = async (key, options) => {
    assert.deepEqual(options, { consistency: 'eventual', type: 'json' });
    return getWithMetadata(key, options);
  };

  assert.equal(await consumePlayerEmailCode({
    email,
    purpose: 'reset-password',
    token,
  }, {
    now: () => baseTime + 1_000,
    store,
  }), true);
});

test('missing, malformed, wrong, and expired reset credentials fail safely', async () => {
  const missing = await issueReset({ token: 'B'.repeat(43) });
  assert.equal(await consumePlayerEmailCode({
    email,
    purpose: 'reset-password',
    token: '',
  }, { now: () => baseTime + 1_000, store: missing.store }), false);

  assert.equal(await consumePlayerEmailCode({
    email,
    purpose: 'reset-password',
    token: 'malformed',
  }, { now: () => baseTime + 1_000, store: missing.store }), false);

  assert.equal(await consumePlayerEmailCode({
    email,
    purpose: 'reset-password',
    token: 'C'.repeat(43),
  }, { now: () => baseTime + 1_000, store: missing.store }), false);

  const expired = await issueReset({ token: 'D'.repeat(43) });
  assert.equal(await consumePlayerEmailCode({
    email,
    purpose: 'reset-password',
    token: expired.token,
  }, { now: () => baseTime + 15 * 60 * 1_000, store: expired.store }), false);
});

test('known and unknown recovery requests keep the same anti-enumeration response on delivery failure', async () => {
  const logs = [];
  const commonOptions = {
    emailProviderConfigured: () => true,
    issuePlayerEmailCode: async () => {
      throw new Error('provider failure for a known account');
    },
    logError: (...args) => logs.push(args),
  };
  const known = await requestEmailCode({ contactEmail: email }, 'reset-password', {
    ...commonOptions,
    getAccountByEmail: async () => ({ email, playerName: 'Recovery Test' }),
  });
  const unknown = await requestEmailCode({ contactEmail: 'unknown@example.com' }, 'reset-password', {
    ...commonOptions,
    getAccountByEmail: async () => null,
  });

  assert.equal(known.statusCode, 200);
  assert.equal(unknown.statusCode, 200);
  assert.deepEqual(JSON.parse(known.body), JSON.parse(unknown.body));
  assert.equal(JSON.stringify(logs).includes(email), false);
});

test('successful reset preserves canonical identity, invalidates sessions, rejects the old password, and allows the new login', async () => {
  const issued = await issueReset({ token: 'E'.repeat(43) });
  const original = {
    id: 'acct_recovery_test',
    canonicalAccountId: 'acct_recovery_test',
    email,
    playerName: 'Recovery Test',
    playerHandle: '@recovery',
    aliases: ['spades:legacy-recovery'],
    emailVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    password: createPasswordRecord('Old-password-1'),
  };
  let saved = structuredClone(original);
  const deletedSessionAccountIds = [];

  const response = await resetAccountPassword({
    contactEmail: email,
    confirmPassword: 'New-password-2',
    password: 'New-password-2',
    token: issued.token,
  }, {
    consumePlayerEmailCode: (payload) => consumePlayerEmailCode(payload, {
      now: () => baseTime + 1_000,
      store: issued.store,
    }),
    deleteSessionsForAccount: async (accountId) => deletedSessionAccountIds.push(accountId),
    getAccountByEmail: async () => saved,
    saveAccount: async (account) => {
      saved = structuredClone(account);
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).account, null);
  assert.match(response.headers['Set-Cookie'], /Max-Age=0/);
  assert.deepEqual(deletedSessionAccountIds, [original.id]);
  assert.equal(saved.id, original.id);
  assert.equal(saved.canonicalAccountId, original.canonicalAccountId);
  assert.equal(saved.playerName, original.playerName);
  assert.equal(saved.playerHandle, original.playerHandle);
  assert.deepEqual(saved.aliases, original.aliases);
  assert.equal(verifyPassword('Old-password-1', saved.password), false);
  assert.equal(verifyPassword('New-password-2', saved.password), true);

  const reused = await resetAccountPassword({
    contactEmail: email,
    confirmPassword: 'Another-password-3',
    password: 'Another-password-3',
    token: issued.token,
  }, {
    consumePlayerEmailCode: (payload) => consumePlayerEmailCode(payload, {
      now: () => baseTime + 2_000,
      store: issued.store,
    }),
    deleteSessionsForAccount: async () => assert.fail('reused token must not delete sessions'),
    getAccountByEmail: async () => saved,
    saveAccount: async () => assert.fail('reused token must not update the account'),
  });

  assert.equal(reused.statusCode, 400);
  assert.match(JSON.parse(reused.body).error, /invalid or expired/i);

  const oldLogin = await loginAccount({ contactEmail: email, password: 'Old-password-1' }, {
    getAccountByEmail: async () => saved,
  });
  const newLogin = await loginAccount({ contactEmail: email, password: 'New-password-2' }, {
    createSession: async () => ({ id: 'new-session', token: 'new-session-token' }),
    getAccountByEmail: async () => saved,
  });

  assert.equal(oldLogin.statusCode, 401);
  assert.equal(newLogin.statusCode, 200);
  assert.equal(JSON.parse(newLogin.body).account.canonicalAccountId, original.canonicalAccountId);
});

test('a session created before the password change is rejected even if its stored record is briefly still readable', async () => {
  const previousSecret = process.env.TOURNAMENT_SESSION_SECRET;
  process.env.TOURNAMENT_SESSION_SECRET = 'password-recovery-session-test-secret-32-characters';

  try {
    const now = Date.now();
    const account = {
      id: 'acct_session_recovery',
      canonicalAccountId: 'acct_session_recovery',
      createdAt: '2026-01-01T00:00:00.000Z',
      email,
      emailVerified: true,
      passwordChangedAt: new Date(now - 1_000).toISOString(),
      playerName: 'Recovery Session Test',
    };
    const session = {
      id: 'session-before-password-change',
      accountId: account.id,
      accountEmail: account.email,
      createdAt: new Date(now - 2_000).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
    };
    const token = createSignedSessionToken(session, account);
    const sessionStore = new MemoryStore({ [sessionKey(session.id)]: session });
    const resolved = await getAccountFromEvent({
      headers: {
        cookie: `one_v_one_player_session=${encodeURIComponent(token)}`,
      },
    }, {
      accountStore: {
        get: async () => structuredClone(account),
      },
      deletionStore: new MemoryStore(),
      sessionStore,
    });

    assert.equal(resolved, null);
    assert.equal(await sessionStore.get(sessionKey(session.id)), null);
  } finally {
    if (previousSecret === undefined) delete process.env.TOURNAMENT_SESSION_SECRET;
    else process.env.TOURNAMENT_SESSION_SECRET = previousSecret;
  }
});

test('account reset route accepts reset mode and reads credentials only from the fragment', () => {
  assert.equal(normalizeTournamentAccountMode('reset'), 'reset');
  assert.equal(normalizeTournamentAccountMode('unknown'), 'signin');

  const url = new URL(buildPasswordResetUrl({ email, token: resetToken }));
  const recovery = readPasswordRecoveryFragment(url.hash);

  assert.deepEqual(recovery, { email, token: resetToken });
  assert.equal(url.searchParams.has('email'), false);
  assert.equal(url.searchParams.has('token'), false);
});
