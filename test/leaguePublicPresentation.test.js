import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handleLeagueReadRequest,
  publicLeagueReadPayload,
  publicLeagueRecord,
  publicLeagueViewer,
  publicLeaguesReadPayload,
} from '../netlify/functions/leagues.mjs';
import { buildLeagueRecord, buildLeagueStandings } from '../src/lib/leagueCatalog.js';

function leagueFixture() {
  const record = buildLeagueRecord({
    id: 'spades-fall',
    name: 'Spades Fall League',
    visibility: 'public',
    gameSlug: 'spades',
    participants: [
      {
        canonicalAccountId: 'canonical-alice',
        accountId: 'account-alice',
        accountEmail: 'alice@example.test',
        displayName: 'Alice',
      },
      {
        canonicalAccountId: 'canonical-bob',
        accountId: 'account-bob',
        accountEmail: 'bob@example.test',
        displayName: 'Bob',
      },
    ],
    matches: [{
      id: 'week-1-alice-bob',
      homeTeam: { canonicalAccountId: 'canonical-alice', accountId: 'account-alice', displayName: 'Alice' },
      awayTeam: { canonicalAccountId: 'canonical-bob', accountId: 'account-bob', displayName: 'Bob' },
      roomUrl: 'https://match.example.test/private-room',
      callbackIds: ['callback-private'],
      status: 'complete',
      result: {
        winner: 'home',
        winnerId: 'canonical-alice',
        homeScore: 11,
        awayScore: 8,
        source: 'tournament-authoritative-result',
        sourceTournamentSlug: 'fall-spades-final',
        sourceTournamentMatchId: 'tournament-match-private',
        sourceCompletionId: 'completion-private',
        callbackId: 'callback-private',
      },
    }],
  });

  return { ...record, standings: buildLeagueStandings(record) };
}

test('public league record preserves competition state without exposing private identities or callbacks', () => {
  const league = publicLeagueRecord(leagueFixture());

  const match = league.matches[0];
  assert.deepEqual(Object.keys(match).sort(), [
    'awayTeam', 'divisionId', 'gameSlug', 'homeTeam', 'id', 'result',
    'scheduledFor', 'seasonId', 'seasonWeek', 'status', 'venue', 'weekIndex',
  ]);
  assert.deepEqual(match.homeTeam, { displayName: 'Alice' });
  assert.deepEqual(match.awayTeam, { displayName: 'Bob' });
  assert.equal(match.result.sourceTournamentSlug, 'fall-spades-final');
  assert.equal(match.result.source, 'tournament-authoritative-result');
  assert.match(match.result.completedAt, /^\d{4}-\d\d-\d\dT/);

  const browserPayload = JSON.stringify(league);
  assert.doesNotMatch(browserPayload, /canonical-alice|account-alice|alice@example|private-room|callback-private|tournament-match-private|completion-private/);
});

test('league viewer receives only their own membership, standing, and match room access', () => {
  const rawLeague = leagueFixture();
  const alice = publicLeagueViewer(rawLeague, { canonicalAccountId: 'canonical-alice' });
  const outsider = publicLeagueViewer(rawLeague, { canonicalAccountId: 'canonical-outsider' });

  assert.deepEqual(alice.membership, { status: 'enrolled', division: 'Open' });
  assert.equal(alice.standing.displayName, 'Alice');
  assert.deepEqual(alice.matchAccess, [{
    matchId: 'week-1-alice-bob',
    seat: 'home',
    roomUrl: 'https://match.example.test/private-room',
  }]);
  assert.deepEqual(outsider, { membership: null, standing: null, matchAccess: [] });
});

test('public league and viewer schedule payloads stay scoped to the current season', () => {
  const rawLeague = leagueFixture();
  rawLeague.currentSeasonId = 'summer-2026';
  rawLeague.season = { id: 'summer-2026', name: 'Summer 2026' };
  rawLeague.matches = [
    { ...rawLeague.matches[0], id: 'spring-match', seasonId: 'spring-2026', roomUrl: 'https://match.example.test/spring' },
    { ...rawLeague.matches[0], id: 'summer-match', seasonId: 'summer-2026', roomUrl: 'https://match.example.test/summer' },
  ];

  assert.deepEqual(publicLeagueRecord(rawLeague).matches.map((match) => match.id), ['summer-match']);
  assert.deepEqual(publicLeagueViewer(rawLeague, { canonicalAccountId: 'canonical-alice' }).matchAccess, [{
    matchId: 'summer-match',
    seat: 'home',
    roomUrl: 'https://match.example.test/summer',
  }]);
});

test('public league reads omit private and unlisted records before serializing a browser response', () => {
  const publicLeague = leagueFixture();
  const privateLeague = { ...leagueFixture(), id: 'private-league', visibility: 'private' };
  const unlistedLeague = { ...leagueFixture(), id: 'unlisted-league', visibility: 'unlisted' };
  const account = { canonicalAccountId: 'canonical-alice' };

  assert.equal(publicLeagueReadPayload(privateLeague, account), null);
  assert.deepEqual(
    publicLeaguesReadPayload([publicLeague, privateLeague, unlistedLeague], account).leagues.map((league) => league.id),
    ['spades-fall'],
  );
});

test('GET league handler applies the safe DTO and rejects direct private reads', async () => {
  const publicLeague = leagueFixture();
  const privateLeague = { ...leagueFixture(), id: 'private-league', visibility: 'private' };
  let listOptions = null;
  const dependencies = {
    getAccountFromEvent: async () => null,
    listLeagues: async (options) => {
      listOptions = options;
      return [publicLeague, privateLeague];
    },
    loadLeagueById: async (id) => id === 'private-league' ? privateLeague : publicLeague,
    requireTournamentAdmin: async () => ({ error: { statusCode: 403, message: 'Host access required.' } }),
  };

  const collection = await handleLeagueReadRequest({
    queryStringParameters: { includeArchived: 'true' },
  }, dependencies);
  const collectionBody = JSON.parse(collection.body);
  assert.equal(collection.statusCode, 200);
  assert.deepEqual(listOptions, { includeArchived: false });
  assert.deepEqual(collectionBody.leagues.map((league) => league.id), ['spades-fall']);
  assert.doesNotMatch(collection.body, /canonical-alice|alice@example|private-room/);

  const privateRead = await handleLeagueReadRequest({
    queryStringParameters: { leagueId: 'private-league' },
  }, dependencies);
  assert.equal(privateRead.statusCode, 404);
});

test('GET league handler requires host authorization before a raw admin read', async () => {
  let listCalled = false;
  const response = await handleLeagueReadRequest({
    queryStringParameters: { admin: 'true' },
  }, {
    getAccountFromEvent: async () => null,
    requireTournamentAdmin: async () => ({ error: { statusCode: 403, message: 'Host access required.' } }),
    listLeagues: async () => {
      listCalled = true;
      return [];
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(listCalled, false);
});
