import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLeagueRecord,
  buildLeagueStandings,
  generateLeagueSchedule,
  joinLeagueRecord,
  leaveLeagueRecord,
} from '../src/lib/leagueCatalog.js';

test('buildLeagueRecord normalizes optional league fields', () => {
  const league = buildLeagueRecord({
    name: 'Friday Night',
    gameSlug: 'spades',
    startDate: '2026-10-01T00:00:00.000Z',
    playerCap: 4,
    status: 'active',
    participants: [
      { accountId: 'acct-1', displayName: 'Player One', canonicalAccountId: 'canon-1' },
      { accountId: 'acct-2', displayName: 'Player Two', canonicalAccountId: 'canon-2' },
    ],
  });

  assert.equal(league.name, 'Friday Night');
  assert.equal(league.gameSlug, 'spades');
  assert.equal(league.playerCap, 4);
  assert.equal(league.status, 'active');
  assert.equal(league.participants.length, 2);
});

test('joinLeagueRecord marks waitlist when player cap is reached', () => {
  const league = buildLeagueRecord({
    name: 'Full League',
    playerCap: 2,
    participants: [
      { accountId: 'acct-1', canonicalAccountId: 'canon-1', displayName: 'Player One', status: 'enrolled' },
      { accountId: 'acct-2', canonicalAccountId: 'canon-2', displayName: 'Player Two', status: 'enrolled' },
    ],
  });

  const joined = joinLeagueRecord(league, {
    accountId: 'acct-3',
    canonicalAccountId: 'canon-3',
    displayName: 'Player Three',
  });

  assert.ok(joined.waitlisted, 'Third player should be waitlisted');
  assert.equal(joined.league.participants.length, 3);
  assert.equal(joined.league.participants[2].status, 'waitlist');
});

test('leaveLeagueRecord removes the matching player by canonical id first', () => {
  const league = buildLeagueRecord({
    name: 'Leave League',
    playerCap: 8,
    participants: [
      { accountId: 'acct-1', canonicalAccountId: 'canon-1', displayName: 'Player One' },
      { accountId: 'acct-2', canonicalAccountId: 'canon-2', displayName: 'Player Two' },
    ],
  });

  const updated = leaveLeagueRecord(league, { canonicalAccountId: 'canon-1' });
  assert.equal(updated.changed, true);
  assert.equal(updated.league.participants.length, 1);
  assert.equal(updated.league.participants[0].displayName, 'Player Two');
});

test('buildLeagueStandings computes wins, losses and win percent', () => {
  const league = buildLeagueRecord({
    name: 'Scoring',
    gameSlug: 'spades',
    matches: [
      {
        id: 'm1',
        homeTeam: { canonicalAccountId: 'a1', displayName: 'Alice' },
        awayTeam: { canonicalAccountId: 'a2', displayName: 'Bob' },
        result: { winner: 'home', homeScore: '11', awayScore: '7' },
        status: 'complete',
      },
      {
        id: 'm2',
        homeTeam: { canonicalAccountId: 'a1', displayName: 'Alice' },
        awayTeam: { canonicalAccountId: 'a3', displayName: 'Cara' },
        result: { winner: 'away', homeScore: '5', awayScore: '13' },
        status: 'complete',
      },
    ],
  });

  const standings = buildLeagueStandings(league);
  const alice = standings.find((entry) => entry.canonicalAccountId === 'a1');
  const bob = standings.find((entry) => entry.canonicalAccountId === 'a2');

  assert.equal(alice?.wins, 1);
  assert.equal(alice?.losses, 1);
  assert.equal(alice?.pointsFor, 16);
  assert.equal(alice?.pointsAgainst, 20);
  assert.equal(Math.round(alice?.winPercent), 50);
  assert.equal(bob?.wins, 0);
  assert.equal(bob?.losses, 1);
});

test('generateLeagueSchedule creates matches for multiple weeks', () => {
  const league = buildLeagueRecord({
    name: 'Schedule Test',
    playerCap: 4,
    participants: [
      { displayName: 'A', accountId: 'a1', canonicalAccountId: 'a1', status: 'enrolled' },
      { displayName: 'B', accountId: 'a2', canonicalAccountId: 'a2', status: 'enrolled' },
      { displayName: 'C', accountId: 'a3', canonicalAccountId: 'a3', status: 'enrolled' },
      { displayName: 'D', accountId: 'a4', canonicalAccountId: 'a4', status: 'enrolled' },
    ],
  });

  const scheduled = generateLeagueSchedule(league, { weekCount: 2 });
  assert.equal(scheduled.schedule.length, 2);
  assert.equal(scheduled.matches.length >= 2, true);
  assert.equal(scheduled.schedule[0].matches.length > 0, true);
  assert.equal(scheduled.schedule[1].matches.length > 0, true);
});
