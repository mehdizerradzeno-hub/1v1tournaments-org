import test from 'node:test';
import assert from 'node:assert/strict';
import { saveLeague, upsertLeagueMatchResult } from '../netlify/functions/_league-utils.mjs';
import { handleLeagueReadRequest } from '../netlify/functions/leagues.mjs';
import { leagueHttpFixture, fixtureConfig, fixtureHost, fixturePlayer } from '../integration/euchreLeagueFixture.mjs';
import { requestEuchreLeagues } from '../src/lib/euchreLeagueClient.js';
import { ensureEuchreLeagueGame } from '../netlify/functions/_euchre-league-games.mjs';
import { assertManualTournamentMutationAllowed, deleteHostedTournament, saveHostedTournament } from '../netlify/functions/_tournament-events-utils.mjs';

test('legacy readers, editors and force-result writers cannot downgrade or overwrite a versioned Euchre season', async () => {
  const f = leagueHttpFixture();
  const league = await f.seed();
  const store = f.storeFor('leagues');
  const before = await store.getWithMetadata(`${league.id}.json`);
  await assert.rejects(saveLeague({ id: league.id, gameSlug: 'spades' }, null, { store }), error => error.code === 'versioned_league_required');
  await assert.rejects(upsertLeagueMatchResult(league.id, league.matches[0].id, { homeScore: 2, awayScore: 0, winner: 'home' }, { force: true, store }), error => error.code === 'versioned_league_required');
  const read = await handleLeagueReadRequest({ queryStringParameters: { leagueId: league.id, admin: 'true' } }, {
    getAccountFromEvent: async () => null, requireTournamentAdmin: async () => ({ method: 'token' }), loadLeagueById: async () => league,
  });
  assert.equal(read.statusCode, 409);
  assert.equal(JSON.parse(read.body).code, 'versioned_league_required');
  assert.deepEqual(await store.getWithMetadata(`${league.id}.json`), before);
});

test('legacy create racing with versioned create cannot clobber the new format', async () => {
  const f = leagueHttpFixture();
  const store = f.storeFor('leagues');
  let inserted = false;
  const raceStore = { ...store, async setJSON(key, value, options) {
    if (!inserted) { inserted = true; await f.repository().create(fixtureConfig, 'owner'); }
    return store.setJSON(key, value, options);
  } };
  await assert.rejects(saveLeague({ id: fixtureConfig.id, gameSlug: 'spades' }, null, { store: raceStore }), error => error.code === 'write_conflict');
  assert.equal((await f.repository().load(fixtureConfig.id)).gameSlug, 'euchre');
});

test('league client preserves shared-account credentials and never persists a host key in the URL', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ ok: true }) }; };
  await requestEuchreLeagues({ leagueId: 'league', admin: true, token: 'synthetic-host-key' }, fetchImpl);
  await requestEuchreLeagues({ action: 'open-match', leagueId: 'league', matchId: 'fixture' }, fetchImpl);
  assert.equal(calls[0].url, '/.netlify/functions/euchre-leagues?admin=true&leagueId=league');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-host-key');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[1].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].options.body), { action: 'open-match', leagueId: 'league', matchId: 'fixture' });
  await assert.rejects(requestEuchreLeagues({}, async () => ({ ok: false, json: async () => ({ error: 'Denied', code: 'host_entitlement_required' }) })), error => error.code === 'host_entitlement_required');
});

test('archived registration seasons are read-only even through direct organizer API actions', async () => {
  const f = leagueHttpFixture();
  await f.request(fixtureHost, { action: 'create', league: fixtureConfig });
  await f.request(fixturePlayer(1), { action: 'join', leagueId: fixtureConfig.id });
  assert.equal((await f.request(fixtureHost, { action: 'archive', leagueId: fixtureConfig.id })).statusCode, 200);
  const before = await f.repository().load(fixtureConfig.id);
  for (const payload of [{ action: 'remove-player', canonicalAccountId: fixturePlayer(1).canonicalAccountId },
    { action: 'start' }, { action: 'update', patch: { name: 'Changed' } }, { action: 'set-registration', registrationOpen: true }]) {
    assert.equal((await f.request(fixtureHost, { ...payload, leagueId: fixtureConfig.id })).statusCode, 409);
  }
  assert.deepEqual(await f.repository().load(fixtureConfig.id), before);
  assert.equal((await f.request(null, null, { leagueId: fixtureConfig.id })).statusCode, 404);
});

test('generic tournament creation, metadata edits and deletion cannot take over an internal league game', async () => {
  const f = leagueHttpFixture();
  const league = await f.seed();
  const game = await ensureEuchreLeagueGame({ repo: f.repository(), leagueId: league.id, matchId: league.matches[0].id,
    authorize() {}, clock: f.clock }, f.dependencies);
  const store = f.storeFor('tournament-events');
  const before = await store.get(`${game.tournament.slug}.json`);
  assert.throws(() => assertManualTournamentMutationAllowed(game.tournament), error => error.code === 'league_managed_tournament');
  assert.throws(() => assertManualTournamentMutationAllowed({ slug: game.tournament.slug }), error => error.code === 'league_managed_tournament');
  await assert.rejects(saveHostedTournament({ slug: game.tournament.slug, title: 'Hijacked', competitionMeta: {} }, fixtureHost, { store }), error => error.code === 'league_managed_tournament');
  await assert.rejects(deleteHostedTournament(game.tournament.slug, { store, bracketStore: f.storeFor('tournament-brackets') }), error => error.code === 'league_managed_tournament');
  assert.deepEqual(await store.get(`${game.tournament.slug}.json`), before);
  assert.doesNotThrow(() => assertManualTournamentMutationAllowed({ slug: 'ordinary-event', gameSlug: 'euchre' }));
});
