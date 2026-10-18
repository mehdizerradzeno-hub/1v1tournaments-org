import test from 'node:test';
import assert from 'node:assert/strict';
import { createEuchreLeagueRepository } from '../netlify/functions/_euchre-league-store.mjs';
import { advanceEuchreLeagueChampionship, championshipSeedSlots } from '../netlify/functions/_euchre-league-championship.mjs';
import { euchreLeagueStandings } from '../src/lib/euchreLeagueSeason.js';

/** Serialized records and persisted ETags, no Netlify credentials or network. */
function disposableStore() {
  const records = new Map();
  let etag = 0;
  let conflict = null;
  return {
    injectConflict(callback) { conflict = callback; },
    async getWithMetadata(key) {
      const row = records.get(key);
      return row ? { data: JSON.parse(row.body), etag: row.etag } : null;
    },
    async set(key, body, options) {
      if (conflict) { const callback = conflict; conflict = null; await callback(); return { modified: false }; }
      const previous = records.get(key);
      if (options.onlyIfNew && previous) return { modified: false };
      if (options.onlyIfMatch && previous?.etag !== options.onlyIfMatch) return { modified: false };
      records.set(key, { body, etag: String(++etag) });
      return { modified: true, etag: String(etag) };
    },
  };
}
const NOW = new Date('2026-10-18T12:00:00Z');
const CONFIG = { id: 'disposable-season', name: 'Disposable 32-player acceptance fixture',
  playerCap: 32, divisionCount: 4, playoffSize: 8, firstRoundDate: '2026-10-25',
  timeZone: 'America/New_York', weeklyPlayTime: '18:00' };
async function enroll(repo, count) {
  await repo.create(CONFIG, 'test-host');
  for (let i = 1; i <= count; i += 1) await repo.enroll(CONFIG.id, {
    canonicalAccountId: `test-${String(i).padStart(3, '0')}`, username: `tester_${String(i).padStart(3, '0')}`,
  });
  return (await repo.start(CONFIG.id)).league;
}
async function finishGame(repo, fixture, index, homeWins) {
  const assignment = { tournamentSlug: `test-game-${fixture.phase}-${fixture.weekIndex}-${fixture.id.split('-').slice(-3).join('-')}-${index}`,
    tournamentMatchId: `${fixture.id}-game-${index}-r1-m1` };
  await repo.assignGame(CONFIG.id, fixture.id, assignment);
  const completion = { ...assignment, completionId: `${fixture.id}-completion-${index}`,
    winnerCanonicalAccountId: homeWins ? fixture.homePlayerId : fixture.awayPlayerId,
    scores: homeWins ? { north: 10, south: 8 } : { north: 7, south: 12 } };
  return { outcome: await repo.recordGame(CONFIG.id, fixture.id, completion), completion };
}

test('32-player league persists seven rounds, eight seeded qualifiers, and exactly one champion', async () => {
  const store = disposableStore();
  const restart = () => createEuchreLeagueRepository({ store, clock: () => NOW });
  let repo = restart();
  let league = await enroll(repo, 32);
  assert.equal(league.matches.length, 112);
  let games = 0;
  let early = null;
  for (let week = 1; week <= 7; week += 1) {
    const fixtures = league.matches.filter(m => m.phase === 'regular' && m.weekIndex === week);
    assert.equal(fixtures.length, 16);
    for (const fixture of fixtures) {
      const first = await finishGame(repo, fixture, 1, true); games += 1;
      early ||= { matchId: fixture.id, completion: first.completion };
      repo = restart(); // Cold repository instance, only serialized store state.
      await finishGame(repo, fixture, 2, false); games += 1;
      const third = await finishGame(repo, fixture, 3, true); games += 1;
      league = third.outcome.league;
    }
    repo = restart();
    league = await repo.load(CONFIG.id);
    if (week < 7) assert.equal(league.championship, null);
  }
  assert.equal(games, 336);
  assert.equal(league.phase, 'playoffs');
  assert.equal(league.championship.qualifiers.length, 8);
  assert.equal(new Set(league.championship.qualifiers.map(q => q.canonicalAccountId)).size, 8);
  for (const division of league.divisions) assert.equal(league.championship.qualifiers.filter(q => q.divisionId === division.id).length, 2);
  assert.deepEqual(championshipSeedSlots(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  const firstRound = league.championship.bracket.rounds[0].matches;
  assert.deepEqual(firstRound.map(m => m.players.map(p => p.seed)), [[1, 8], [4, 5], [2, 7], [3, 6]]);
  const tableBeforePlayoffs = euchreLeagueStandings(league);
  for (let round = 1; round <= 3; round += 1) {
    const fixtures = league.matches.filter(m => m.phase === 'playoff' && m.status === 'scheduled');
    assert.equal(fixtures.length, 8 / (2 ** round));
    for (const fixture of fixtures) {
      await finishGame(repo, fixture, 1, true); games += 1;
      repo = restart();
      league = (await finishGame(repo, fixture, 2, true)).outcome.league; games += 1;
    }
  }
  league = await restart().load(CONFIG.id);
  assert.equal(games, 350);
  assert.equal(league.phase, 'complete');
  assert.equal(league.status, 'complete');
  assert.equal(league.matches.filter(m => m.phase === 'playoff').length, 7);
  assert.equal(league.matches.filter(m => m.status === 'complete').length, 119);
  assert.ok(league.championship.champion.canonicalAccountId);
  assert.equal(league.championship.bracket.rounds.at(-1).matches.length, 1);
  assert.equal(league.championship.bracket.winner.id, league.championship.champion.canonicalAccountId);
  assert.deepEqual(euchreLeagueStandings(league), tableBeforePlayoffs);
  assert.deepEqual(advanceEuchreLeagueChampionship(league, NOW), league);
  const duplicate = await restart().recordGame(CONFIG.id, early.matchId, early.completion);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.league.championship.champion.canonicalAccountId, league.championship.champion.canonicalAccountId);
});

test('conditional writes reject create collisions and retry without dropping another player', async () => {
  const store = disposableStore();
  const repo = createEuchreLeagueRepository({ store, clock: () => NOW });
  await repo.create(CONFIG, 'test-host');
  await assert.rejects(repo.create(CONFIG, 'other-host'), /already exists/);
  store.injectConflict(async () => {
    await repo.enroll(CONFIG.id, { canonicalAccountId: 'player-b', username: 'player_b' });
  });
  await repo.enroll(CONFIG.id, { canonicalAccountId: 'player-a', username: 'player_a' });
  const league = await repo.load(CONFIG.id);
  assert.deepEqual(new Set(league.participants.map(p => p.canonicalAccountId)), new Set(['player-a', 'player-b']));
});

test('authorization is checked again after a stale-write conflict', async () => {
  const store = disposableStore();
  let allowed = true;
  let checks = 0;
  const repo = createEuchreLeagueRepository({ store, clock: () => NOW, authorize() {
    checks += 1;
    if (!allowed) throw new Error('Host entitlement revoked');
  } });
  await repo.create(CONFIG, 'test-host');
  store.injectConflict(async () => { allowed = false; });
  await assert.rejects(repo.enroll(CONFIG.id, { canonicalAccountId: 'player', username: 'player_test' }), /revoked/);
  assert.equal(checks, 3);
  assert.equal((await repo.load(CONFIG.id)).participants.length, 0);
});
