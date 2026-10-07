import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  FixedWindowFriendsRateLimiter,
  FriendsAuthority,
  FriendsAuthorityError,
  InMemoryFriendsAuthorityStore,
} from '../netlify/functions/_friends-authority.mjs';
import { handleFriendsRequest } from '../netlify/functions/friends.mjs';

const accounts = new Map([
  ['acct-a', { canonicalAccountId: 'acct-a', playerHandle: 'alpha', playerName: 'Alpha' }],
  ['acct-b', { canonicalAccountId: 'acct-b', playerHandle: 'bravo', playerName: 'Bravo' }],
  ['acct-c', { canonicalAccountId: 'acct-c', playerHandle: 'charlie', playerName: 'Charlie' }],
  ['acct-guest', { canonicalAccountId: 'acct-guest', playerHandle: 'guest', playerName: 'Guest', isGuest: true }],
  ['acct-bot', { canonicalAccountId: 'acct-bot', playerHandle: 'bot', playerName: 'Bot', isBot: true }],
]);

function createAuthority(options = {}) {
  return new FriendsAuthority({
    store: options.store || new InMemoryFriendsAuthorityStore(),
    resolveAccount: async (input) => {
      if (typeof input === 'object') {
        return [...accounts.values()].filter((account) => account.playerHandle === input.searchHandle);
      }
      return accounts.get(input) || null;
    },
    now: () => '2026-10-07T12:00:00.000Z',
    ...options,
  });
}

test('shared Friends contract artifact stays frozen', () => {
  const content = readFileSync(new URL('../contracts/shared-friends-v1.json', import.meta.url));
  assert.equal(createHash('sha256').update(content).digest('hex'), '428c2a34a25ccfefe13939e64fb5226af1988d2523708c72f7359d52f86922c7');
});

test('crossed requests are serialized into one accepted relationship', async () => {
  const authority = createAuthority();
  const [left, right] = await Promise.all([
    authority.mutate({ audience: 'spades', action: 'send', actorCanonicalAccountId: 'acct-a', targetCanonicalAccountId: 'acct-b', idempotencyKey: 'request-a' }),
    authority.mutate({ audience: 'euchre', action: 'send', actorCanonicalAccountId: 'acct-b', targetCanonicalAccountId: 'acct-a', idempotencyKey: 'request-b' }),
  ]);
  assert.deepEqual(new Set([left.relationship, right.relationship]), new Set(['outgoing', 'accepted']));
  const snapshot = await authority.snapshot({ audience: 'spades', actorCanonicalAccountId: 'acct-a' });
  assert.equal(snapshot.friends.length, 1);
  assert.equal(snapshot.incoming.length + snapshot.outgoing.length, 0);
});

test('idempotent retries, removal and re-request are deterministic', async () => {
  const authority = createAuthority();
  const sent = await authority.mutate({ audience: 'spades', action: 'send', actorCanonicalAccountId: 'acct-a', targetCanonicalAccountId: 'acct-b', idempotencyKey: 'same-send' });
  const retried = await authority.mutate({ audience: 'spades', action: 'send', actorCanonicalAccountId: 'acct-a', targetCanonicalAccountId: 'acct-b', idempotencyKey: 'same-send' });
  assert.equal(sent.relationship, 'outgoing');
  assert.equal(retried.replayed, true);
  await authority.mutate({ audience: 'euchre', action: 'accept', actorCanonicalAccountId: 'acct-b', targetCanonicalAccountId: 'acct-a', idempotencyKey: 'accept' });
  await authority.mutate({ audience: 'spades', action: 'remove', actorCanonicalAccountId: 'acct-a', targetCanonicalAccountId: 'acct-b', idempotencyKey: 'remove' });
  const reRequested = await authority.mutate({ audience: 'euchre', action: 'send', actorCanonicalAccountId: 'acct-b', targetCanonicalAccountId: 'acct-a', idempotencyKey: 'new-request' });
  assert.equal(reRequested.relationship, 'outgoing');
});

test('invalid, guest, bot, self and deleted principals fail closed', async () => {
  const authority = createAuthority();
  await assert.rejects(
    authority.mutate({ audience: 'spades', action: 'send', actorCanonicalAccountId: 'acct-a', targetCanonicalAccountId: 'acct-a' }),
    (error) => error instanceof FriendsAuthorityError && error.code === 'self_action',
  );
  for (const targetCanonicalAccountId of ['acct-guest', 'acct-bot', 'room-123']) {
    await assert.rejects(
      authority.mutate({ audience: 'spades', action: 'send', actorCanonicalAccountId: 'acct-a', targetCanonicalAccountId }),
      (error) => error instanceof FriendsAuthorityError && ['guest_or_bot', 'account_not_found'].includes(error.code),
    );
  }
});

test('privacy deletion removes every edge and audit records do not retain account IDs', async () => {
  const store = new InMemoryFriendsAuthorityStore();
  const authority = createAuthority({ store });
  await authority.mutate({ audience: 'spades', action: 'send', actorCanonicalAccountId: 'acct-a', targetCanonicalAccountId: 'acct-b' });
  await authority.mutate({ audience: 'euchre', action: 'send', actorCanonicalAccountId: 'acct-c', targetCanonicalAccountId: 'acct-a' });
  const deleted = await authority.deleteAccount({ canonicalAccountId: 'acct-a' });
  assert.equal(deleted.relationshipsRemoved, 2);
  assert.equal(store.relationships.size, 0);
  assert.doesNotMatch(JSON.stringify(store.audits), /acct-a|acct-b|acct-c/);
});

test('bounded rate limiting and feature-gated service endpoint fail closed', async () => {
  let now = 0;
  const authority = createAuthority({ rateLimiter: new FixedWindowFriendsRateLimiter({ limit: 1, windowMs: 1_000, now: () => now }) });
  await authority.snapshot({ audience: 'spades', actorCanonicalAccountId: 'acct-a' });
  await assert.rejects(
    authority.snapshot({ audience: 'spades', actorCanonicalAccountId: 'acct-a' }),
    (error) => error instanceof FriendsAuthorityError && error.code === 'rate_limited',
  );
  now = 1_001;
  await authority.snapshot({ audience: 'spades', actorCanonicalAccountId: 'acct-a' });

  const disabled = await handleFriendsRequest({ httpMethod: 'POST', headers: {}, body: '{}' }, { env: {} });
  assert.equal(disabled.statusCode, 404);
  const enabledWithoutStore = await handleFriendsRequest({ httpMethod: 'POST', headers: { authorization: 'Bearer 12345678901234567890123456789012' }, body: JSON.stringify({ audience: 'spades', action: 'snapshot', actorCanonicalAccountId: 'acct-a' }) }, {
    env: { HUB_FRIENDS_ENABLED: 'true', HUB_FRIENDS_SPADES_SECRET: '12345678901234567890123456789012' },
  });
  assert.equal(enabledWithoutStore.statusCode, 503);
  assert.equal(JSON.parse(enabledWithoutStore.body).code, 'friends_storage_unavailable');
});

test('injected transport checks audience and never accepts a browser actor substitute', async () => {
  const authority = createAuthority();
  const response = await handleFriendsRequest({
    httpMethod: 'POST',
    headers: { authorization: 'Bearer 12345678901234567890123456789012', 'idempotency-key': 'transport-send' },
    body: JSON.stringify({ audience: 'spades', action: 'send', actorCanonicalAccountId: 'acct-a', targetCanonicalAccountId: 'acct-b' }),
  }, {
    env: { HUB_FRIENDS_ENABLED: 'true', HUB_FRIENDS_SPADES_SECRET: '12345678901234567890123456789012' },
    authority,
  });
  assert.equal(response.statusCode, 200);
  const wrongAudience = await handleFriendsRequest({
    httpMethod: 'POST',
    headers: { authorization: 'Bearer 12345678901234567890123456789012' },
    body: JSON.stringify({ audience: 'euchre', action: 'snapshot', actorCanonicalAccountId: 'acct-a' }),
  }, {
    env: { HUB_FRIENDS_ENABLED: 'true', HUB_FRIENDS_SPADES_SECRET: '12345678901234567890123456789012' },
    authority,
  });
  assert.equal(wrongAudience.statusCode, 503);
});
