import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyLeagueMatchResult,
  buildLeagueMatchRoomUrl,
  buildLeagueRecord,
  buildLeagueStandings,
  generateLeagueSchedule,
  joinLeagueRecord,
  leaveLeagueRecord,
  leagueWeekLabel,
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
  assert.equal(league.weeklyPlayDay, 'Sunday');
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

  assert.equal(joined.waitlisted, true);
  assert.equal(joined.league.participants.length, 3);
  assert.equal(joined.league.participants[2].status, 'waitlist');
});

test('leaveLeagueRecord removes matching player by canonical id and promotes waitlist first seat', () => {
  const league = buildLeagueRecord({
    name: 'Leave League',
    playerCap: 3,
    participants: [
      { accountId: 'acct-1', canonicalAccountId: 'canon-1', displayName: 'Player One' },
      { accountId: 'acct-2', canonicalAccountId: 'canon-2', displayName: 'Player Two', status: 'waitlist' },
      { accountId: 'acct-3', canonicalAccountId: 'canon-3', displayName: 'Player Three' },
    ],
  });

  const updated = leaveLeagueRecord(league, { canonicalAccountId: 'canon-1' });
  const promoted = updated.league.participants.find((participant) => participant.canonicalAccountId === 'canon-2');

  assert.equal(updated.changed, true);
  assert.equal(updated.league.participants.length, 2);
  assert.equal(promoted?.status, 'enrolled');
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
        result: { winner: 'home', winnerId: 'a1', homeScore: '11', awayScore: '7' },
        status: 'complete',
      },
      {
        id: 'm2',
        homeTeam: { canonicalAccountId: 'a1', displayName: 'Alice' },
        awayTeam: { canonicalAccountId: 'a3', displayName: 'Cara' },
        result: { winner: 'away', winnerId: 'a3', homeScore: '5', awayScore: '13' },
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
    players: 4,
    participants: [
      { displayName: 'A', accountId: 'a1', canonicalAccountId: 'a1', status: 'enrolled' },
      { displayName: 'B', accountId: 'a2', canonicalAccountId: 'a2', status: 'enrolled' },
      { displayName: 'C', accountId: 'a3', canonicalAccountId: 'a3', status: 'enrolled' },
      { displayName: 'D', accountId: 'a4', canonicalAccountId: 'a4', status: 'enrolled' },
    ],
  });

  const scheduled = generateLeagueSchedule(league, { weekCount: 2 });
  assert.equal(scheduled.schedule.length, 2);
  assert.ok(scheduled.matches.length >= 2);
  assert.equal(scheduled.schedule[0].matches.length > 0, true);
  assert.equal(scheduled.schedule[1].matches.length > 0, true);
});

test('applyLeagueMatchResult is idempotent for repeated callback IDs', () => {
  const league = buildLeagueRecord({
    name: 'Callback Safety',
    matches: [
      {
        id: 'm1',
        homeTeam: { canonicalAccountId: 'a1', displayName: 'Alice' },
        awayTeam: { canonicalAccountId: 'a2', displayName: 'Bob' },
        status: 'scheduled',
      },
    ],
  });

  const first = applyLeagueMatchResult(league, 'm1', { winner: 'home', homeScore: '11', awayScore: '8' }, {
    callbackId: 'cb-1',
    source: 'identity-callback',
  });

  const second = applyLeagueMatchResult(first.league, 'm1', { winner: 'home', homeScore: '11', awayScore: '8' }, {
    callbackId: 'cb-1',
    source: 'identity-callback',
  });

  assert.equal(first.changed, true);
  assert.equal(first.league.matches[0].status, 'complete');
  assert.equal(second.changed, false);
  assert.equal(second.completeIgnored, true);
  assert.equal(second.duplicate, true);
});

test('league match launch routing preserves Spades and rejects unconfigured games', () => {
  assert.equal(
    buildLeagueMatchRoomUrl({ id: 'league-1', gameSlug: 'spades' }, { id: 'week-1' }),
    'https://1v1spades.com/match/league-1-week-1',
  );
  assert.equal(
    buildLeagueMatchRoomUrl({ id: 'league-1', gameSlug: 'euchre' }, { id: 'week-1' }),
    '',
  );
  assert.equal(
    buildLeagueMatchRoomUrl(
      { id: 'league-1', gameSlug: 'euchre' },
      { id: 'week-1' },
      { gameMatchBaseUrls: { euchre: 'https://euchre.example/match/' } },
    ),
    'https://euchre.example/match/league-1-week-1',
  );
});

test('league results prefer canonical identity when callbacks use a legacy account ID', () => {
  const result = applyLeagueMatchResult(buildLeagueRecord({
    id: 'identity-league',
    matches: [{
      id: 'match-1',
      status: 'scheduled',
      homeTeam: { accountId: 'legacy-home', canonicalAccountId: 'canonical-home', displayName: 'Home' },
      awayTeam: { accountId: 'legacy-away', canonicalAccountId: 'canonical-away', displayName: 'Away' },
    }],
  }), 'match-1', {
    winner: 'home',
    winnerId: 'legacy-home',
    homeScore: 10,
    awayScore: 5,
  }, { callbackId: 'canonical-callback' });

  assert.equal(result.match.result.winnerId, 'canonical-home');
});

test('Euchre schedule generation never silently creates Spades room URLs', () => {
  const league = generateLeagueSchedule(buildLeagueRecord({
    id: 'euchre-league',
    gameSlug: 'euchre',
    participants: [
      { accountId: 'one', canonicalAccountId: 'canonical-one', displayName: 'One' },
      { accountId: 'two', canonicalAccountId: 'canonical-two', displayName: 'Two' },
    ],
  }), { weekCount: 1 });

  assert.equal(league.matches[0].roomUrl, '');
  assert.equal(league.matches[0].homeTeam.accountId.length > 0, true);
  assert.equal(league.matches[0].homeTeam.canonicalAccountId.length > 0, true);
});

test('generateLeagueSchedule preserves completed match results on regeneration', () => {
  const league = buildLeagueRecord({
    name: 'Replay Safety',
    playerCap: 4,
    participants: [
      { displayName: 'A', accountId: 'a1', canonicalAccountId: 'a1', status: 'enrolled' },
      { displayName: 'B', accountId: 'a2', canonicalAccountId: 'a2', status: 'enrolled' },
      { displayName: 'C', accountId: 'a3', canonicalAccountId: 'a3', status: 'enrolled' },
      { displayName: 'D', accountId: 'a4', canonicalAccountId: 'a4', status: 'enrolled' },
    ],
    matches: [
      {
        id: 'league-1-w1-1',
        leagueId: 'league-1',
        status: 'complete',
        homeTeam: { canonicalAccountId: 'a1', displayName: 'A' },
        awayTeam: { canonicalAccountId: 'a2', displayName: 'B' },
        result: { winner: 'home', winnerId: 'a1', homeScore: '9', awayScore: '1' },
      },
    ],
  });

  const scheduled = generateLeagueSchedule(league, { weekCount: 1 });
  assert.equal(scheduled.matches.some((match) => match.status === 'complete'), true);
  const complete = scheduled.matches.find((match) => match.id === 'league-1-w1-1');
  assert.equal(complete?.result?.winnerId, 'a1');
});

test('leagueWeekLabel formats a date string', () => {
  const label = leagueWeekLabel(new Date('2026-10-01T15:00:00.000Z').toISOString());
  assert.equal(typeof label, 'string');
  assert.equal(label.includes('Oct'), true);
});
