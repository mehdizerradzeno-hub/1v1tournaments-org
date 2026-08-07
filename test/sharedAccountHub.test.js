import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SharedAccountContractError,
  addAccountAlias,
  createGameAuthorization,
  exchangeGameAuthorization,
  lookupCanonicalAccountByAlias,
  sharedIdentityForAccount,
} from '../netlify/functions/_shared-account-utils.mjs';
import { handleSharedAccountRequest } from '../netlify/functions/shared-account.mjs';
import { matchAccessPayload } from '../netlify/functions/tournament-match-access.mjs';
import { publicSignup } from '../netlify/functions/tournament-signup.mjs';

class MemoryStore {
  constructor() {
    this.records = new Map();
  }

  async get(key) {
    return this.records.get(key) || null;
  }

  async setJSON(key, value, options = {}) {
    if (options.onlyIfNew && this.records.has(key)) throw new Error('Record exists');
    this.records.set(key, structuredClone(value));
  }

  async list(options = {}) {
    const prefix = options.prefix || '';
    return {
      blobs: [...this.records.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })),
    };
  }
}

const account = {
  id: 'acct-shared-player',
  canonicalAccountId: 'acct-shared-player',
  email: 'shared@example.com',
  emailVerified: true,
  playerName: 'Shared Player',
  playerHandle: '@shared',
};

test('shared identity endpoint returns a stable authenticated canonical contract', async () => {
  const aliasStore = new MemoryStore();
  await addAccountAlias(account, { provider: 'spades', legacyAccountId: 'legacy-spades' }, { store: aliasStore });

  const response = await handleSharedAccountRequest({ httpMethod: 'GET' }, {
    getAccountFromEvent: async () => account,
    sharedIdentityForAccount: (value) => sharedIdentityForAccount(value, { store: aliasStore }),
  });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.identity.protocolVersion, '2026-08-04');
  assert.equal(body.identity.canonicalAccountId, account.id);
  assert.equal(body.identity.displayName, account.playerName);
  assert.deepEqual(body.identity.aliases, [{ provider: 'spades', legacyAccountId: 'legacy-spades' }]);
});

test('shared identity endpoint rejects signed-out requests', async () => {
  const response = await handleSharedAccountRequest({ httpMethod: 'GET' }, {
    getAccountFromEvent: async () => null,
  });
  assert.equal(response.statusCode, 401);
});

test('legacy aliases are idempotent and reject cross-account collisions', async () => {
  const store = new MemoryStore();
  const first = await addAccountAlias(account, { provider: 'euchre', legacyAccountId: 'legacy-euchre' }, { store });
  const duplicate = await addAccountAlias(account, { provider: 'euchre', legacyAccountId: 'legacy-euchre' }, { store });

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(await lookupCanonicalAccountByAlias('euchre', 'legacy-euchre', { store }), account.id);

  await assert.rejects(
    addAccountAlias(
      { ...account, id: 'acct-other', canonicalAccountId: 'acct-other' },
      { provider: 'euchre', legacyAccountId: 'legacy-euchre' },
      { store },
    ),
    (error) => error instanceof SharedAccountContractError && error.code === 'alias_collision',
  );
});

test('one-time game authorization validates audience, expiration, and replay', async () => {
  const store = new MemoryStore();
  const identity = await sharedIdentityForAccount(account, { store: new MemoryStore() });
  const issued = await createGameAuthorization(identity, 'spades', {
    store,
    now: 1_000,
    codeFactory: () => 'single-use-code',
  });

  await assert.rejects(
    exchangeGameAuthorization(issued.authorizationCode, 'euchre', { store, now: 2_000 }),
    (error) => error.code === 'wrong_audience',
  );

  const exchanged = await exchangeGameAuthorization(issued.authorizationCode, 'spades', { store, now: 2_000 });
  assert.equal(exchanged.canonicalAccountId, account.id);

  await assert.rejects(
    exchangeGameAuthorization(issued.authorizationCode, 'spades', { store, now: 2_100 }),
    (error) => error.code === 'authorization_replayed',
  );

  const expired = await createGameAuthorization(identity, 'spades', {
    store,
    now: 5_000,
    ttlMs: 1_000,
    codeFactory: () => 'expired-code',
  });
  await assert.rejects(
    exchangeGameAuthorization(expired.authorizationCode, 'spades', { store, now: 6_001 }),
    (error) => error.code === 'authorization_expired',
  );
});

test('tournament signup and match access payloads expose canonical identity with legacy IDs', () => {
  const signup = publicSignup({
    id: 'signup-1',
    accountId: 'legacy-account',
    accountCanonicalId: 'canonical-account',
    tournamentSlug: 'test-tournament',
    playerName: 'Player',
    status: 'registered',
  });
  assert.equal(signup.accountId, 'legacy-account');
  assert.equal(signup.canonicalAccountId, 'canonical-account');

  const payload = matchAccessPayload({
    bracket: { tournamentSlug: 'test-tournament', status: 'published' },
    round: { index: 1, title: 'Round 1' },
    match: {
      id: 'test-tournament-r1-m1',
      label: 'Match 1',
      status: 'ready',
      roomUrl: 'https://1v1spades.com/match/test-tournament-r1-m1',
      players: [
        { id: 'signup-1', accountId: 'legacy-account', canonicalAccountId: 'canonical-account', name: 'Player' },
        { id: 'signup-2', accountId: 'legacy-two', canonicalAccountId: 'canonical-two', name: 'Opponent' },
      ],
    },
    seatIndex: 0,
    ticketRecord: {
      accountId: 'legacy-account',
      canonicalAccountId: 'canonical-account',
      expiresAt: '2026-08-06T12:00:00.000Z',
    },
  });

  assert.equal(payload.player.canonicalAccountId, 'canonical-account');
  assert.equal(payload.protocolVersion, '2026-08-04');
  assert.equal(payload.identity.accountId, 'legacy-account');
  assert.equal(payload.identity.canonicalAccountId, 'canonical-account');
  assert.notEqual(payload.player.id, payload.identity.canonicalAccountId);
});
