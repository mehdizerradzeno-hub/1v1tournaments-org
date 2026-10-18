import test from 'node:test';
import assert from 'node:assert/strict';
import { requireEuchreLeagueHost, euchreLeaguePlayerIdentity } from '../netlify/functions/_euchre-league-auth.mjs';

test('league management preserves the existing approved-host entitlement and narrows ownership', async () => {
  const event = { headers: {} };
  const owner = { id: 'owner', canonicalAccountId: 'canonical-owner', playerHandle: 'host_user' };
  const league = { ownerCanonicalAccountId: 'canonical-owner' };
  const entitled = async received => { assert.equal(received, event); return { ok: true, method: 'account', account: owner }; };
  const access = await requireEuchreLeagueHost(event, league, { requireTournamentAdmin: entitled });
  assert.equal(access.canonicalAccountId, 'canonical-owner');
  await assert.rejects(requireEuchreLeagueHost(event, { ownerCanonicalAccountId: 'other-owner' }, {
    requireTournamentAdmin: entitled,
  }), error => error.statusCode === 403 && error.code === 'league_owner_required');
  for (const statusCode of [401, 403, 503]) {
    await assert.rejects(requireEuchreLeagueHost(event, league, {
      requireTournamentAdmin: async () => ({ error: { statusCode, message: 'Access unavailable' } }),
    }), error => error.statusCode === statusCode && error.code === 'host_entitlement_required');
  }
});

test('the existing operator key still works; missing or incorrect keys fail closed', async () => {
  const previous = process.env.TOURNAMENT_ADMIN_TOKEN;
  process.env.TOURNAMENT_ADMIN_TOKEN = 'disposable-unit-test-host-key';
  try {
    const access = await requireEuchreLeagueHost({ headers: { authorization: 'Bearer disposable-unit-test-host-key' } }, {
      ownerCanonicalAccountId: 'some-other-account',
    });
    assert.equal(access.method, 'token');
    assert.equal(access.canonicalAccountId, 'hub-host-key');
    await assert.rejects(requireEuchreLeagueHost({ headers: { authorization: 'Bearer incorrect-test-key' } }), error => error.statusCode === 401);
    await assert.rejects(requireEuchreLeagueHost({ headers: {} }), error => error.statusCode === 401);
  } finally {
    if (previous === undefined) delete process.env.TOURNAMENT_ADMIN_TOKEN;
    else process.env.TOURNAMENT_ADMIN_TOKEN = previous;
  }
});

test('league enrollment requires the shared claimed username and preserves the host/player guard', () => {
  assert.throws(() => euchreLeaguePlayerIdentity(null), error => error.statusCode === 401);
  assert.throws(() => euchreLeaguePlayerIdentity({ id: 'test-player', playerName: 'Temporary Guest', playerHandle: 'legacy_name' }), /Claim/);
  const account = { id: 'test-player', canonicalAccountId: 'canonical-player', playerHandle: 'player_test',
    playerName: 'Ignored Temporary Guest', usernameClaimedAt: '2026-10-18T12:00:00Z' };
  assert.deepEqual(euchreLeaguePlayerIdentity(account, { isHostAccount: () => false }), {
    accountId: 'test-player', canonicalAccountId: 'canonical-player', username: 'player_test',
  });
  assert.throws(() => euchreLeaguePlayerIdentity(account, { isHostAccount: () => true }), error => error.code === 'host_account_cannot_play');
  for (const playerHandle of ['guest', 'guest_abcdef', 'guestplayer']) {
    assert.throws(() => euchreLeaguePlayerIdentity({ ...account, playerHandle }, { isHostAccount: () => false }), error => error.code === 'username_required');
  }
});
