import test from 'node:test';
import assert from 'node:assert/strict';
import { leagueHttpFixture, fixtureHost, fixturePlayer, fixtureConfig } from '../integration/euchreLeagueFixture.mjs';
import { assertEuchreLeagueTicketAccess, ensureEuchreLeagueGame } from '../netlify/functions/_euchre-league-games.mjs';
import { assertTournamentTicketAccess } from '../netlify/functions/_tournament-game-contract.mjs';
import { ticketKey } from '../netlify/functions/tournament-match-access.mjs';
import { accountKey } from '../netlify/functions/_account-utils.mjs';

const leagueId = fixtureConfig.id;
const playerFor = canonical => fixturePlayer(Number(canonical.split('-').at(-1)));
const open = (f, match, player = playerFor(match.homePlayerId)) => f.request(player, { action: 'open-match', leagueId, matchId: match.id });

test('HTTP league mutations require host entitlement and ownership; browser identities and results are untrusted', async () => {
  const f = leagueHttpFixture();
  const create = { action: 'create', league: { ...fixtureConfig, ownerCanonicalAccountId: 'forged',
    currentSeasonId: 'forged', schedule: [{ week: 99 }], participants: [{ displayName: 'guest' }] } };
  assert.equal((await f.request(null, create)).statusCode, 401);
  assert.equal((await f.request(fixturePlayer(1), create)).statusCode, 403);
  assert.equal((await f.request(fixtureHost, create)).statusCode, 201);
  const stored = await f.repository().load(leagueId);
  assert.equal(stored.ownerCanonicalAccountId, fixtureHost.canonicalAccountId);
  assert.equal(stored.currentSeasonId, 'season-1');
  assert.deepEqual(stored.participants, []);
  assert.deepEqual(stored.schedule, []);
  const foreignHost = { ...fixtureHost, id: 'host-other', canonicalAccountId: 'other-host' };
  assert.equal((await f.request(foreignHost, { action: 'archive', leagueId })).statusCode, 403);
  assert.equal((await f.request(foreignHost, null, { leagueId, admin: 'true' })).statusCode, 403);
  const publicRead = await f.request(null, null, { leagueId });
  assert.equal(publicRead.statusCode, 200);
  assert.equal(publicRead.data.canManage, false);
  assert.ok(!publicRead.body.includes('host-canonical'));
  assert.equal((await f.request(null, { action: 'join', leagueId })).statusCode, 401);
  assert.equal((await f.request({ id: 'guest', playerHandle: 'temporary' }, { action: 'join', leagueId })).statusCode, 409);
  const joined = await f.request(fixturePlayer(1), { action: 'join', leagueId, username: 'forged', canonicalAccountId: 'forged' });
  assert.equal(joined.data.league.participants[0].username, 'tester_001');
  assert.equal((await f.request(fixtureHost, { action: 'force-result', leagueId, verified: true })).statusCode, 403);
  const listing = await f.request(foreignHost, null, { admin: 'true' });
  assert.deepEqual(listing.data.leagues, []);
});

test('HTTP management locks rosters/settings, supports pause and safe rescheduling, and keeps public projections private', async () => {
  const f = leagueHttpFixture();
  let league = await f.seed();
  assert.equal((await f.request(fixtureHost, { action: 'update', leagueId, patch: { divisionCount: 2 } })).statusCode, 400);
  assert.equal((await f.request(fixturePlayer(1), { action: 'leave', leagueId })).statusCode, 409);
  assert.equal((await f.request(fixtureHost, { action: 'start', leagueId })).statusCode, 409);
  const match = league.matches[0];
  assert.equal((await f.request(fixtureHost, { action: 'reschedule', leagueId, matchId: match.id, scheduledFor: '2027-01-01T20:00:00Z' })).statusCode, 200);
  assert.equal((await open(f, match)).statusCode, 409);
  f.setTime('2027-01-02T00:00:00Z');
  assert.equal((await f.request(fixtureHost, { action: 'pause', leagueId })).statusCode, 200);
  assert.equal((await open(f, match)).statusCode, 409);
  await f.request(fixtureHost, { action: 'resume', leagueId });
  assert.equal((await open(f, match)).statusCode, 201);
  assert.equal((await f.request(fixtureHost, { action: 'archive', leagueId })).statusCode, 409);
  assert.equal((await f.request(fixtureHost, { action: 'reschedule', leagueId, matchId: match.id, scheduledFor: '2027-01-03T00:00:00Z' })).statusCode, 409);
  const read = await f.request(playerFor(match.homePlayerId), null, { leagueId });
  for (const privateField of ['canonicalAccountId', 'accountId', 'ownerCanonicalAccountId', 'callbackIds', 'assignments', 'ticket', 'roomUrl']) assert.ok(!read.body.includes(`"${privateField}"`), privateField);
  assert.ok(read.data.viewer.matchAccess.every(access => league.matches.some(m => m.id === access.matchId && [m.homePlayerId, m.awayPlayerId].includes(match.homePlayerId))));
  league = await f.repository().load(leagueId);
  const exported = await f.request(fixtureHost, { action: 'export-standings', leagueId });
  assert.equal(exported.statusCode, 200);
  assert.ok(exported.data.csv.includes('tester_001'));
});

test('ordinary tournament tickets bind both league seats and deny outsiders, future games, paused launches and finished games', async () => {
  const f = leagueHttpFixture();
  const league = await f.seed();
  const match = league.matches[0];
  assert.equal((await open(f, match, fixturePlayer(99))).statusCode, 403);
  const opened = await open(f, match);
  assert.equal(opened.statusCode, 201, opened.body);
  const away = await open(f, match, playerFor(match.awayPlayerId));
  assert.equal(away.statusCode, 201, away.body);
  assert.equal(opened.data.seat, 'north');
  assert.equal(away.data.seat, 'south');
  assert.notEqual(opened.data.ticket, away.data.ticket);
  assert.match(opened.data.ticket, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(new URL(opened.data.roomUrl).origin, 'https://euchre.invalid');
  const record = await f.storeFor('tournament-match-tickets').get(ticketKey(opened.data.ticket));
  assert.equal(record.canonicalAccountId, match.homePlayerId);
  const bracket = await f.storeFor('tournament-brackets').get(`${opened.data.tournamentSlug}.json`);
  const tournamentMatch = bracket.rounds[0].matches[0];
  assert.notEqual(tournamentMatch.players[0].id, match.homePlayerId);
  const ticketArguments = { record, bracket, match: tournamentMatch, player: tournamentMatch.players[0],
    request: { game: 'euchre', matchId: record.matchId, canonicalAccountId: record.canonicalAccountId, seat: 'north' }, now: f.clock() };
  assert.doesNotThrow(() => assertTournamentTicketAccess(ticketArguments));
  assert.throws(() => assertTournamentTicketAccess({ ...ticketArguments, request: { ...ticketArguments.request, canonicalAccountId: 'outsider' } }), error => error.code === 'wrong_identity');
  await f.request(fixtureHost, { action: 'pause', leagueId });
  const deps = { euchreLeagueRepository: f.repository(), clock: f.clock };
  await assert.rejects(assertEuchreLeagueTicketAccess(bracket, playerFor(match.homePlayerId), deps), /not available/);
  await assertEuchreLeagueTicketAccess(bracket, playerFor(match.homePlayerId), { ...deps, allowPaused: true });
  const completed = await f.report({ tournamentSlug: bracket.tournamentSlug });
  assert.ok(!completed.error, completed.error?.body);
  assert.equal(completed.leagueSync.seriesComplete, false);
  await assert.rejects(assertEuchreLeagueTicketAccess(bracket, playerFor(match.homePlayerId), { ...deps, allowPaused: true }), /not available/);
});

test('authoritative tournament callbacks aggregate best-of-3, reject score poisoning and recover after a linked-store outage', async () => {
  const f = leagueHttpFixture();
  const league = await f.seed();
  const fixture = league.matches[0];
  const game1 = (await open(f, fixture)).data;
  const invalid = await f.report(game1, true, { result: { scores: { north: 9, south: 5 } } });
  assert.equal(invalid.error.statusCode, 400);
  assert.notEqual((await f.storeFor('tournament-brackets').get(`${game1.tournamentSlug}.json`)).status, 'complete');
  const outage = await f.report(game1, true, { writer: { syncLinkedLeagueTournamentResult() { throw new Error('synthetic outage'); } } });
  assert.equal(outage.error.statusCode, 503);
  assert.equal((await f.repository().load(leagueId)).matches[0].series.games.length, 0);
  const retry = await f.report(game1);
  assert.ok(!retry.error, retry.error?.body);
  assert.equal(retry.duplicate, true);
  assert.equal((await f.repository().load(leagueId)).matches[0].series.homeWins, 1);
  const duplicate = await f.report(game1);
  assert.equal(duplicate.leagueSync.duplicate, true);
  const game2 = (await open(f, fixture)).data;
  assert.notEqual(game2.tournamentSlug, game1.tournamentSlug);
  assert.ok(!(await f.report(game2, false)).error);
  const game3 = (await open(f, fixture)).data;
  assert.ok(!(await f.report(game3)).error);
  const series = (await f.repository().load(leagueId)).matches[0];
  assert.equal(series.status, 'complete');
  assert.equal(series.series.games.length, 3);
  assert.equal(series.result.homeScore, 2);
  assert.equal(series.result.awayScore, 1);
  assert.equal((await open(f, fixture)).statusCode, 409);
  assert.ok(!(await f.report(game1)).error, 'historical identical retry remains safe after series completion');
});

test('reserved game materialization retries after interruption without duplicating or resetting brackets', async () => {
  const f = leagueHttpFixture();
  const league = await f.seed();
  const match = league.matches[0];
  const input = { repo: f.repository(), leagueId, matchId: match.id, authorize() {}, clock: f.clock };
  let interrupted = false;
  const dependencies = { storeFor(name) {
    if (name === 'tournament-brackets' && !interrupted) { interrupted = true; throw new Error('simulated process interruption'); }
    return f.storeFor(name);
  } };
  await assert.rejects(ensureEuchreLeagueGame(input, dependencies), /interruption/);
  const reserved = (await f.repository().load(leagueId)).matches[0].series.assignments;
  assert.equal(reserved.length, 1);
  const retry = await ensureEuchreLeagueGame(input, dependencies);
  assert.equal(retry.assignment.tournamentSlug, reserved[0].tournamentSlug);
  assert.equal((await f.storeFor('tournament-events').list()).blobs.length, 1);
  assert.equal((await f.storeFor('tournament-signups').list()).blobs.length, 2);
  assert.equal((await f.storeFor('tournament-brackets').list()).blobs.length, 1);
});

test('claimed username changes are refreshed between games and frozen safely within an assigned game', async () => {
  const f = leagueHttpFixture();
  await f.request(fixtureHost, { action: 'create', league: fixtureConfig });
  const accounts = [];
  for (let i = 1; i <= 8; i += 1) {
    const account = { ...fixturePlayer(i), email: `synthetic-${i}@example.invalid` };
    accounts.push(account);
    await f.storeFor('player-accounts').setJSON(accountKey(account.email), account);
    assert.equal((await f.request(account, { action: 'join', leagueId })).statusCode, 200);
  }
  await f.request(fixtureHost, { action: 'start', leagueId });
  const fixture = (await f.repository().load(leagueId)).matches[0];
  const home = accounts.find(account => account.canonicalAccountId === fixture.homePlayerId);
  const away = accounts.find(account => account.canonicalAccountId === fixture.awayPlayerId);
  home.playerHandle = 'current_home'; away.playerHandle = 'current_away';
  for (const account of [home, away]) await f.storeFor('player-accounts').setJSON(accountKey(account.email), account);
  const game1 = await open(f, fixture, home);
  assert.equal(game1.statusCode, 201, game1.body);
  assert.deepEqual(game1.data.match.players.map(player => player.handle), ['current_home', 'current_away']);
  const before = await f.storeFor('tournament-brackets').get(`${game1.data.tournamentSlug}.json`);
  home.playerHandle = 'renamed_again';
  await f.storeFor('player-accounts').setJSON(accountKey(home.email), home);
  const changed = await open(f, fixture, home);
  assert.equal(changed.statusCode, 409);
  assert.equal(changed.data.code, 'game_username_changed');
  assert.deepEqual(await f.storeFor('tournament-brackets').get(`${game1.data.tournamentSlug}.json`), before);
  assert.ok(!(await f.report(game1.data)).error);
  const game2 = await open(f, fixture, home);
  assert.equal(game2.statusCode, 201, game2.body);
  assert.equal(game2.data.match.players[0].handle, 'renamed_again');
});

test('32-player HTTP + existing tournament ticket/result pipeline finishes seven rounds and one championship', async () => {
  const f = leagueHttpFixture();
  let league = await f.seed(32);
  assert.equal(league.matches.length, 112);
  assert.equal(league.schedule.length, 7);
  let gameCount = 0;
  while (league.phase !== 'complete') {
    const fixtures = league.matches.filter(m => m.status === 'scheduled' && (league.phase === 'playoffs' ? m.phase === 'playoff' : m.phase === 'regular'));
    assert.ok(fixtures.length, 'season must always make progress');
    for (const fixture of fixtures) {
      for (const homeWins of fixture.phase === 'regular' ? [true, false, true] : [true, true]) {
        const access = await open(f, fixture);
        assert.equal(access.statusCode, 201, access.body);
        const outcome = await f.report(access.data, homeWins);
        assert.ok(!outcome.error, outcome.error?.body);
        gameCount += 1;
      }
    }
    league = await f.repository().load(leagueId);
  }
  assert.equal(gameCount, 350);
  assert.equal(league.championship.qualifiers.length, 8);
  assert.equal(league.matches.filter(m => m.phase === 'playoff' && m.status === 'complete').length, 7);
  assert.ok(league.championship.champion.canonicalAccountId);
  const publicResult = await f.request(null, null, { leagueId });
  assert.equal(publicResult.data.league.championship.champion.username, league.championship.champion.displayName);
  assert.equal(publicResult.data.league.matches.filter(m => m.status === 'complete').length, 119);
  for (let i = 1; i <= 32; i += 1) assert.ok(!publicResult.body.includes(fixturePlayer(i).canonicalAccountId));
  assert.equal((await f.storeFor('tournament-brackets').list()).blobs.length, 350);
});
