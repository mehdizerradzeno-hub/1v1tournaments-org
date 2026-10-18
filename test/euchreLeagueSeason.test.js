import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEuchreLeagueSeason, enrollEuchreLeaguePlayer, startEuchreLeagueSeason,
  assignEuchreLeagueGame, recordEuchreLeagueGame, euchreLeagueStandings, euchreLeagueWeekDate,
} from '../src/lib/euchreLeagueSeason.js';

const NOW = new Date('2026-10-18T12:00:00Z');
function populated(count = 32, divisions = 4) {
  let league = createEuchreLeagueSeason({ id: 'test-euchre', name: 'Disposable Euchre League',
    playerCap: count, divisionCount: divisions, playoffSize: divisions * 2,
    firstRoundDate: '2026-10-25', weeklyPlayTime: '18:00', timeZone: 'America/New_York' }, 'host-test', NOW);
  for (let i = 1; i <= count; i += 1) league = enrollEuchreLeaguePlayer(league, {
    canonicalAccountId: `test-${String(i).padStart(3, '0')}`, username: `tester_${String(i).padStart(3, '0')}`,
  }, NOW);
  return startEuchreLeagueSeason(league, NOW);
}
function game(league, matchId, homeWins = true, suffix = '') {
  const match = league.matches.find(m => m.id === matchId);
  const index = match.series.games.length + 1;
  const assignment = { tournamentSlug: `disposable-game-${matchId}-${index}${suffix}`, tournamentMatchId: `${matchId}-g${index}` };
  const assigned = assignEuchreLeagueGame(league, matchId, assignment, NOW);
  const completion = { ...assignment, completionId: `${matchId}-completion-${index}${suffix}`,
    winnerCanonicalAccountId: (homeWins ? match.homeTeam : match.awayTeam).canonicalAccountId,
    scores: homeWins ? { north: 10, south: 7 } : { north: 6, south: 11 } };
  return { ...recordEuchreLeagueGame(assigned, matchId, completion, NOW), completion };
}

test('32 players produce four eight-player divisions and seven full weekly rounds', () => {
  const league = populated();
  assert.equal(league.divisions.length, 4);
  assert.ok(league.divisions.every(d => d.participantIds.length === 8));
  assert.equal(league.schedule.length, 7);
  assert.equal(league.matches.length, 112);
  const seen = new Set();
  for (const week of league.schedule) {
    const fixtures = league.matches.filter(m => m.weekIndex === week.week);
    assert.equal(fixtures.length, 16);
    const appearances = fixtures.flatMap(m => [m.homePlayerId, m.awayPlayerId]);
    assert.equal(new Set(appearances).size, 32);
    for (const match of fixtures) {
      const pair = [match.homePlayerId, match.awayPlayerId].sort().join(':');
      assert.ok(!seen.has(pair)); seen.add(pair);
      assert.ok(league.divisions.find(d => d.id === match.divisionId).participantIds.includes(match.homePlayerId));
      assert.ok(league.divisions.find(d => d.id === match.divisionId).participantIds.includes(match.awayPlayerId));
    }
  }
});

test('weekly scheduling preserves local play time across DST and rejects invalid dates/zones', () => {
  assert.equal(euchreLeagueWeekDate('2026-10-25', '18:00', 'America/New_York', 1), '2026-10-25T22:00:00.000Z');
  assert.equal(euchreLeagueWeekDate('2026-10-25', '18:00', 'America/New_York', 2), '2026-11-01T23:00:00.000Z');
  assert.throws(() => euchreLeagueWeekDate('2026-02-30', '18:00', 'UTC'), /real calendar/);
  assert.throws(() => euchreLeagueWeekDate('2026-03-08', '02:30', 'America/New_York'), /does not exist/);
  assert.throws(() => euchreLeagueWeekDate('2026-10-25', '18:00', 'not-a-zone'), /IANA/);
});

test('odd divisions receive byes without repeated opponents, and 128-player round robin is not truncated', () => {
  const odd = populated(9, 2);
  assert.equal(odd.schedule.length, 5);
  for (const division of odd.divisions) {
    const matches = odd.matches.filter(m => m.divisionId === division.id);
    assert.equal(matches.length, division.participantIds.length * (division.participantIds.length - 1) / 2);
    for (const participantId of division.participantIds) {
      assert.equal(matches.filter(m => [m.homePlayerId, m.awayPlayerId].includes(participantId)).length,
        division.participantIds.length - 1);
    }
  }
  const large = populated(128, 1);
  assert.equal(large.schedule.length, 127);
  assert.equal(large.matches.length, 128 * 127 / 2);
});

test('roster boundaries include 8 and 128, prohibit guest identities and season regeneration', () => {
  for (const [count, divisions] of [[8, 1], [128, 16]]) {
    const league = populated(count, divisions);
    assert.equal(league.participants.length, count);
    assert.ok(league.matches.length > 0);
    assert.throws(() => startEuchreLeagueSeason(league, NOW), /cannot be regenerated/);
    assert.throws(() => enrollEuchreLeaguePlayer(league, { canonicalAccountId: 'late', username: 'late_user' }, NOW), /closed/);
  }
  assert.throws(() => createEuchreLeagueSeason({ id: 'bad', name: 'Bad', playerCap: 7 }, 'host', NOW), /capacity/);
  let league = createEuchreLeagueSeason({ id: 'test', name: 'Test', playerCap: 8, divisionCount: 1, playoffSize: 2,
    firstRoundDate: '2026-10-25' }, 'host', NOW);
  assert.throws(() => enrollEuchreLeaguePlayer(league, { username: 'guest_name' }, NOW), /canonical account/);
  for (let i = 0; i < 8; i += 1) league = enrollEuchreLeaguePlayer(league, { canonicalAccountId: `p-${i}`, username: `user_${i}` }, NOW);
  assert.throws(() => enrollEuchreLeaguePlayer(league, { canonicalAccountId: 'extra', username: 'extra_user' }, NOW), /capacity/);
});

test('series requires two verified assigned games; duplicate retries survive JSON restart', () => {
  let league = populated();
  const matchId = league.matches[0].id;
  const first = game(league, matchId);
  league = JSON.parse(JSON.stringify(first.league));
  assert.equal(league.matches[0].status, 'playing');
  assert.equal(euchreLeagueStandings(league)[0].standings.reduce((sum, r) => sum + r.wins, 0), 0);
  const retry = recordEuchreLeagueGame(league, matchId, first.completion, NOW);
  assert.equal(retry.duplicate, true);
  assert.throws(() => recordEuchreLeagueGame(league, matchId, { ...first.completion, scores: { north: 10, south: 8 } }, NOW), /cannot be changed/);
  const second = game(league, matchId);
  league = second.league;
  assert.equal(league.matches[0].status, 'complete');
  assert.equal(league.matches[0].series.homeWins, 2);
  assert.equal(recordEuchreLeagueGame(league, matchId, first.completion, NOW).duplicate, true);
  assert.throws(() => assignEuchreLeagueGame(league, matchId, { tournamentSlug: 'extra-game', tournamentMatchId: 'extra' }, NOW), /already has a winner/);
  const leader = euchreLeagueStandings(league)[0].standings[0];
  assert.equal(leader.wins, 1);
  assert.equal(leader.gamesWon, 2);
  assert.equal(leader.pointsFor, 20);
});

test('a split series requires a third game and rejects unassigned, wrong-seat, or unfinished results', () => {
  let league = populated();
  const matchId = league.matches[0].id;
  league = game(league, matchId).league;
  league = game(league, matchId, false).league;
  assert.equal(league.matches[0].status, 'playing');
  const assignment = { tournamentSlug: 'disposable-decider', tournamentMatchId: 'disposable-decider-r1-m1' };
  league = assignEuchreLeagueGame(league, matchId, assignment, NOW);
  const completion = { ...assignment, completionId: 'decider', winnerCanonicalAccountId: league.matches[0].homePlayerId, scores: { north: 13, south: 9 } };
  assert.throws(() => recordEuchreLeagueGame(league, matchId, { ...completion, tournamentSlug: 'unassigned' }, NOW), /next assigned/);
  assert.throws(() => recordEuchreLeagueGame(league, matchId, { ...completion, winnerCanonicalAccountId: 'outsider' }, NOW), /not assigned/);
  assert.throws(() => recordEuchreLeagueGame(league, matchId, { ...completion, scores: { north: 9, south: 8 } }, NOW), /must reach 10/);
  assert.throws(() => recordEuchreLeagueGame(league, matchId, { ...completion, scores: { north: 13, south: 10 } }, NOW), /must reach 10/);
  league = recordEuchreLeagueGame(league, matchId, completion, NOW).league;
  assert.equal(league.matches[0].series.games.length, 3);
  assert.equal(league.matches[0].result.homeScore, 2);
  assert.equal(league.matches[0].result.awayScore, 1);
});

test('standings are deterministic under participant and result delivery permutations', () => {
  let league = populated();
  for (const fixture of league.matches.slice(0, 28)) {
    league = game(league, fixture.id).league;
    league = game(league, fixture.id).league;
  }
  const expected = euchreLeagueStandings(league);
  const shuffled = { ...league, participants: [...league.participants].reverse(), matches: [...league.matches].reverse() };
  assert.deepEqual(euchreLeagueStandings(shuffled), expected);
});

test('tied-group head-to-head outranks game differential, then canonical identity resolves exact ties', () => {
  let league = populated();
  const [a, b, c, d] = league.divisions[0].participantIds;
  const playSeries = (first, second, winner, split = false) => {
    const match = league.matches.find(m => [m.homePlayerId, m.awayPlayerId].includes(first)
      && [m.homePlayerId, m.awayPlayerId].includes(second));
    const homeWins = match.homePlayerId === winner;
    league = game(league, match.id, homeWins).league;
    if (split) league = game(league, match.id, !homeWins).league;
    league = game(league, match.id, homeWins).league;
  };
  playSeries(a, b, a, true);
  playSeries(b, c, b);
  playSeries(d, a, d);
  const standings = euchreLeagueStandings(league)[0].standings;
  const rowA = standings.find(row => row.canonicalAccountId === a);
  const rowB = standings.find(row => row.canonicalAccountId === b);
  assert.equal(rowA.wins, 1); assert.equal(rowA.losses, 1);
  assert.equal(rowB.wins, 1); assert.equal(rowB.losses, 1);
  assert.ok(rowA.gameDifferential < rowB.gameDifferential);
  assert.ok(rowA.rank < rowB.rank);
  const fresh = populated();
  assert.deepEqual(euchreLeagueStandings(fresh)[0].standings.map(row => row.canonicalAccountId),
    [...fresh.divisions[0].participantIds].sort());
});
