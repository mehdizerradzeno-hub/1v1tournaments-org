import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  accountKey, createPasswordRecord, createSignedSessionToken, getAccountFromEvent, publicAccount,
  sessionKey,
} from '../netlify/functions/_account-utils.mjs';
import {
  EMAIL_VERIFICATION_PROTOCOL_VERSION, emailVerificationEvidenceForAccount, emailVerificationForAccount,
} from '../netlify/functions/_email-verification.mjs';
import { consumePlayerEmailCode, issuePlayerEmailCode, verifiedEmailsRequired } from '../netlify/functions/_player-email.mjs';
import { createAccount, loginAccount, requestEmailCode, verifyAccountEmail } from '../netlify/functions/player-account.mjs';
import {
  createGameAuthorization, exchangeGameAuthorization, resolveGameAccountIdentities, sharedIdentityForAccount,
  validateGameAuthorizationCaller,
} from '../netlify/functions/_shared-account-utils.mjs';
import { handleSharedAccountRequest } from '../netlify/functions/shared-account.mjs';
import { handler as tournamentSignup } from '../netlify/functions/tournament-signup.mjs';
import { accountEmailVerificationStatus } from '../src/lib/accountConnect.js';

class MemoryStore {
  records = new Map();
  version = 0;
  async get(key) { return structuredClone(this.records.get(key) || null); }
  async getWithMetadata(key) {
    const data = await this.get(key);
    return data ? { data, etag: `version-${this.version}` } : null;
  }
  async setJSON(key, value, options = {}) {
    if (options.onlyIfNew && this.records.has(key)) throw new Error('already exists');
    if (options.onlyIfMatch && options.onlyIfMatch !== `version-${this.version}`) return { modified: false };
    this.records.set(key, structuredClone(value));
    this.version += 1;
    return { modified: true, etag: `version-${this.version}` };
  }
  async delete(key) { this.records.delete(key); }
  async list() { return { blobs: [...this.records.keys()].map((key) => ({ key })) }; }
}

const baseTime = Date.parse('2026-10-01T01:00:00.000Z');
const code = '123456';
const original = {
  id: 'acct_11111111-1111-4111-8111-111111111111',
  canonicalAccountId: 'acct_11111111-1111-4111-8111-111111111111',
  email: 'verification@example.com', playerHandle: 'proof_player', playerName: 'proof_player',
  usernameClaimedAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z',
  emailVerified: false,
};

async function challenge(account = original, options = {}) {
  const store = options.store || new MemoryStore();
  const messages = [];
  await issuePlayerEmailCode({ email: account.email, playerName: account.playerHandle,
    purpose: 'verify-email', canonicalAccountId: account.canonicalAccountId }, {
    store, now: () => baseTime, providerConfigured: true, createEmailCode: () => code,
    sendPlayerEmail: async (message) => { messages.push(message); return { ok: true, configured: true }; },
  });
  return { store, messages };
}

async function verify(account, store, payload = {}, now = baseTime + 1000) {
  let saved = null;
  const response = await verifyAccountEmail({ contactEmail: account.email, code, ...payload }, {
    now: () => now, getAccountByEmail: async () => account,
    consumePlayerEmailCode: (input) => consumePlayerEmailCode(input, { store, now: () => now }),
    saveAccount: async (value) => { saved = structuredClone(value); },
  });
  return { response, saved, body: JSON.parse(response.body) };
}

test('new registration cannot auto-verify with absent/false legacy configuration or forged browser claims', async () => {
  const before = process.env.REQUIRE_VERIFIED_PLAYER_EMAILS;
  try {
    for (const flag of [undefined, 'false', 'true']) {
      if (flag === undefined) delete process.env.REQUIRE_VERIFIED_PLAYER_EMAILS;
      else process.env.REQUIRE_VERIFIED_PLAYER_EMAILS = flag;
      let saved; let issued;
      const response = await createAccount({ email: original.email, username: original.playerHandle,
        password: 'Synthetic-password-1', confirmPassword: 'Synthetic-password-1',
        emailVerified: true, emailVerification: { status: 'verified' } }, {
        getAccountByEmail: async () => null, reservePlayerUsername: async () => {},
        saveAccount: async (value) => { saved = value; },
        createSession: async () => ({ id: 'synthetic-session' }),
        verifiedEmailsRequired: () => false, emailProviderConfigured: () => true,
        issuePlayerEmailCode: async (value) => { issued = value; return { configured: true, ok: true }; },
      });
      const body = JSON.parse(response.body);
      assert.equal(response.statusCode, 201);
      assert.equal(saved.emailVerified, false);
      assert.equal(saved.emailVerification, undefined);
      assert.equal(body.account.emailVerification.status, 'required');
      assert.equal(body.verificationRequired, true);
      assert.equal(issued.canonicalAccountId, saved.canonicalAccountId);
      assert.equal(issued.purpose, 'verify-email');
      assert.equal(verifiedEmailsRequired(), true);
    }
  } finally {
    if (before === undefined) delete process.env.REQUIRE_VERIFIED_PLAYER_EMAILS;
    else process.env.REQUIRE_VERIFIED_PLAYER_EMAILS = before;
  }
});

test('unavailable email delivery leaves a genuine unverified account and no provenance', async () => {
  let saved;
  const response = await createAccount({ email: original.email, username: original.playerHandle,
    password: 'Synthetic-password-1', confirmPassword: 'Synthetic-password-1' }, {
    getAccountByEmail: async () => null, reservePlayerUsername: async () => {},
    saveAccount: async (account) => { saved = account; }, createSession: async () => ({ id: 'synthetic' }),
    emailProviderConfigured: () => false, issuePlayerEmailCode: async () => assert.fail('no provider'),
  });
  assert.equal(response.statusCode, 201);
  assert.equal(saved.emailVerified, false);
  assert.equal(JSON.parse(response.body).account.emailVerification.status, 'required');
});

test('new unverified tournament admission cannot bypass the challenge with absent/false flag; legacy admission remains unchanged', async () => {
  const before = process.env.REQUIRE_VERIFIED_PLAYER_EMAILS;
  try {
    for (const flag of [undefined, 'false', 'true']) {
      if (flag === undefined) delete process.env.REQUIRE_VERIFIED_PLAYER_EMAILS;
      else process.env.REQUIRE_VERIFIED_PLAYER_EMAILS = flag;
      const event = { httpMethod: 'POST', headers: {}, body: '{}' };
      const blocked = await tournamentSignup(event, { getAccountFromEvent: async () => original });
      assert.equal(blocked.statusCode, 403);
      assert.match(JSON.parse(blocked.body).error, /Verify this player account email/);
      for (const emailVerified of [true, undefined]) {
        const legacy = await tournamentSignup(event, { getAccountFromEvent: async () => ({ ...original, emailVerified }) });
        // The ordinary next validation is reached; no tournament/storage write.
        assert.equal(legacy.statusCode, 400);
        assert.match(JSON.parse(legacy.body).error, /Choose a tournament/);
      }
    }
  } finally {
    if (before === undefined) delete process.env.REQUIRE_VERIFIED_PLAYER_EMAILS;
    else process.env.REQUIRE_VERIFIED_PLAYER_EMAILS = before;
  }
});

test('ordinary verify-email issues an account-bound challenge and persists genuine proof only after consumption', async () => {
  const { store, messages } = await challenge();
  const record = [...store.records.values()][0];
  assert.equal(record.canonicalAccountId, original.canonicalAccountId);
  assert.equal(record.purpose, 'verify-email');
  assert.match(messages[0].text, /expires in 15 minutes/);
  assert.equal(JSON.stringify(record).includes(code), false);
  const { response, body, saved } = await verify(original, store, {
    canonicalAccountId: 'browser-forgery', emailVerification: { status: 'verified', verifiedAt: 'forged' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(saved.canonicalAccountId, original.canonicalAccountId);
  assert.equal(saved.emailVerification.canonicalAccountId, original.canonicalAccountId);
  assert.equal(saved.emailVerification.emailKey, accountKey(original.email));
  assert.deepEqual(body.account.emailVerification, {
    protocolVersion: EMAIL_VERIFICATION_PROTOCOL_VERSION, status: 'verified', method: 'email-code',
    verifiedAt: '2026-10-01T01:00:01.000Z',
  });
  assert.equal(JSON.stringify(body).includes(saved.emailVerification.emailKey), false);
  assert.equal((await verify(saved, store)).response.statusCode, 400);
});

test('wrong, expired, cross-account and pre-upgrade unbound challenges cannot create proof', async () => {
  const wrong = await challenge();
  assert.equal((await verify(original, wrong.store, { code: '000000' })).saved, null);
  const expired = await challenge();
  assert.equal((await verify(original, expired.store, {}, baseTime + 15 * 60 * 1000)).saved, null);
  const other = { ...original, id: 'acct_other', canonicalAccountId: 'acct_other' };
  assert.equal((await verify(other, wrong.store)).saved, null);
  const unbound = await challenge();
  const [key, record] = [...unbound.store.records][0];
  delete record.canonicalAccountId;
  unbound.store.records.set(key, record);
  assert.equal((await verify(original, unbound.store)).saved, null);
  const absent = await verifyAccountEmail({ email: original.email, code, emailVerified: true }, {
    getAccountByEmail: async () => null, saveAccount: async () => assert.fail('unknown account'),
  });
  assert.equal(absent.statusCode, 400);
});

test('verification code concurrency is one-use and request responses do not disclose accounts or change legacy flags', async () => {
  const { store } = await challenge();
  const attempts = await Promise.all([verify(original, store), verify(original, store)]);
  assert.deepEqual(attempts.map((value) => value.response.statusCode).sort(), [200, 400]);
  const legacy = { ...original, emailVerified: true };
  let issued;
  const known = await requestEmailCode({ email: original.email }, 'verify-email', {
    getAccountByEmail: async () => legacy, emailProviderConfigured: () => true,
    issuePlayerEmailCode: async (value) => { issued = value; return { ok: true }; },
  });
  const unknown = await requestEmailCode({ email: 'unknown@example.com' }, 'verify-email', {
    getAccountByEmail: async () => null, emailProviderConfigured: () => true,
  });
  assert.deepEqual(JSON.parse(known.body), JSON.parse(unknown.body));
  assert.equal(issued.canonicalAccountId, legacy.canonicalAccountId);
  assert.equal(legacy.emailVerified, true);
  assert.equal(emailVerificationForAccount(legacy).status, 'legacy_unknown');
});

test('proof projection fails closed for wrong canonical account, changed email, malformed provenance or false flag', () => {
  const verified = { ...original, emailVerified: true,
    emailVerification: emailVerificationEvidenceForAccount(original, new Date(baseTime).toISOString()) };
  assert.equal(emailVerificationForAccount(verified).status, 'verified');
  for (const changed of [
    { ...verified, email: 'another@example.com' },
    { ...verified, canonicalAccountId: 'acct_other' },
    { ...verified, emailVerified: false },
    { ...verified, emailVerification: { ...verified.emailVerification, method: 'automatic' } },
    { ...verified, emailVerification: { ...verified.emailVerification, protocolVersion: 'wrong' } },
    { ...verified, emailVerification: { ...verified.emailVerification, verifiedAt: 'invalid' } },
    { ...verified, emailVerification: { ...verified.emailVerification, verifiedAt: '2020-01-01T00:00:00Z' } },
    { ...verified, emailVerification: { ...verified.emailVerification, verifiedAt: '2999-01-01T00:00:00Z' } },
    { ...verified, emailVerification: { status: 'verified', method: 'email-code' } },
  ]) assert.notEqual(emailVerificationForAccount(changed).status, 'verified');
});

test('legacy login/session restoration preserves canonical IDs and cannot turn old boolean claims into proof', async () => {
  const oldSecret = process.env.TOURNAMENT_SESSION_SECRET;
  process.env.TOURNAMENT_SESSION_SECRET = 'synthetic-session-signing-secret-at-least-32';
  try {
    for (const legacy of [{ ...original, emailVerified: true }, { ...original, emailVerified: undefined }]) {
      const account = { ...legacy, password: createPasswordRecord('Synthetic-password-1') };
      const now = Date.now();
      const session = { id: 'existing-session', createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 60_000).toISOString(), accountEmail: account.email, accountId: account.id };
      const token = createSignedSessionToken(session, account);
      const sessionStore = new MemoryStore(); const accountStore = new MemoryStore(); const deletionStore = new MemoryStore();
      await sessionStore.setJSON(sessionKey(session.id), session);
      await accountStore.setJSON(accountKey(account.email), account);
      const event = { headers: { cookie: `one_v_one_player_session=${token}` } };
      const restored = await getAccountFromEvent(event, { sessionStore, accountStore, deletionStore });
      assert.equal(restored.canonicalAccountId, account.canonicalAccountId);
      assert.equal(publicAccount(restored).emailVerified, true);
      assert.equal(publicAccount(restored).emailVerification.status, 'legacy_unknown');
      const response = await loginAccount({ email: account.email, password: 'Synthetic-password-1' }, {
        getAccountByEmail: async () => account, createSession: async () => ({ id: session.id, token }),
      });
      assert.equal(response.statusCode, 200);
      assert.equal(JSON.parse(response.body).account.emailVerification.status, 'legacy_unknown');
      assert.match(response.headers['Set-Cookie'], /HttpOnly/);
    }
  } finally {
    if (oldSecret === undefined) delete process.env.TOURNAMENT_SESSION_SECRET;
    else process.env.TOURNAMENT_SESSION_SECRET = oldSecret;
  }
});

test('normal signed Hub exchange and fresh canonical lookup carry only server-proven verification and remain one-use/audience-bound', async () => {
  const { store: codes } = await challenge();
  const { saved } = await verify(original, codes);
  const accounts = new MemoryStore(); const aliases = new MemoryStore(); const authorizations = new MemoryStore();
  await accounts.setJSON(accountKey(saved.email), saved);
  const oldSecret = process.env.SHARED_ACCOUNT_SPADES_SECRET;
  process.env.SHARED_ACCOUNT_SPADES_SECRET = 'synthetic-shared-signing-secret-at-least-32';
  try {
    const deps = {
      getAccountFromEvent: async () => saved,
      sharedIdentityForAccount: (account) => sharedIdentityForAccount(account, { store: aliases }),
      createGameAuthorization: (identity, audience) => createGameAuthorization(identity, audience, {
        store: authorizations, now: baseTime, codeFactory: () => 'synthetic-one-use-code',
      }),
      exchangeGameAuthorization: (value, audience) => exchangeGameAuthorization(value, audience, {
        store: authorizations, now: baseTime + 1000,
      }),
    };
    const issued = await handleSharedAccountRequest({ httpMethod: 'POST', body: JSON.stringify({
      action: 'issue-game-authorization', audience: 'spades', identity: { canonicalAccountId: 'forged' },
    }) }, deps);
    assert.equal(issued.statusCode, 201);
    const { authorizationCode } = JSON.parse(issued.body).authorization;
    assert.throws(() => validateGameAuthorizationCaller({ headers: { authorization: 'Bearer wrong' } }, 'spades'));
    await assert.rejects(exchangeGameAuthorization(authorizationCode, 'euchre', { store: authorizations,
      now: baseTime + 1000 }), (error) => error.code === 'wrong_audience');
    const exchanged = await handleSharedAccountRequest({ httpMethod: 'POST', headers: {
      authorization: `Bearer ${process.env.SHARED_ACCOUNT_SPADES_SECRET}`,
    }, body: JSON.stringify({ action: 'exchange-game-authorization', audience: 'spades', authorizationCode }) }, deps);
    const identity = JSON.parse(exchanged.body).identity;
    assert.equal(identity.canonicalAccountId, original.canonicalAccountId);
    assert.equal(identity.emailVerification.status, 'verified');
    assert.equal(identity.emailVerification.method, 'email-code');
    assert.equal(JSON.stringify(identity).includes(saved.emailVerification.emailKey), false);
    await assert.rejects(exchangeGameAuthorization(authorizationCode, 'spades', { store: authorizations,
      now: baseTime + 1001 }), (error) => error.code === 'authorization_replayed');
    const [fresh] = await resolveGameAccountIdentities([original.canonicalAccountId], 'spades', {
      accountStore: accounts, aliasStore: aliases,
    });
    assert.deepEqual(fresh.emailVerification, identity.emailVerification);
    // Fresh lookup does not trust a cached/browser-supplied verified assertion.
    await accounts.setJSON(accountKey(saved.email), { ...saved, emailVerification: undefined });
    const [unknown] = await resolveGameAccountIdentities([original.canonicalAccountId], 'spades', {
      accountStore: accounts, aliasStore: aliases,
    });
    assert.equal(unknown.emailVerified, true);
    assert.equal(unknown.emailVerification.status, 'legacy_unknown');
  } finally {
    if (oldSecret === undefined) delete process.env.SHARED_ACCOUNT_SPADES_SECRET;
    else process.env.SHARED_ACCOUNT_SPADES_SECRET = oldSecret;
  }
});

test('profile exposes ordinary email challenge without claiming every legacy sign-in is email verified', async () => {
  assert.equal(accountEmailVerificationStatus({ ...original, emailVerified: true }), 'legacy_unknown');
  assert.equal(accountEmailVerificationStatus(original), 'required');
  const source = await readFile(new URL('../src/screens/SpadesAccountConnectScreen.jsx', import.meta.url), 'utf8');
  assert.match(source, /requestPlayerEmailVerification\(\{ contactEmail: account.email \}\)/);
  assert.match(source, /verifyPlayerEmail\(\{ contactEmail: account.email, code: verificationCode.trim\(\) \}\)/);
  assert.match(source, /Your existing sign-in and game access stay available/);
  assert.match(source, /account.emailVerified === false/);
});
