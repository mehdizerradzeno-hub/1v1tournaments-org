import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PlayerProfileError,
  loadPublicPlayerProfile,
} from '../netlify/functions/_player-profile.mjs';
import { handlePlayerProfileRequest } from '../netlify/functions/player-profile.mjs';
import { TOURNAMENT_GAME_PROTOCOL_VERSION } from '../netlify/functions/_tournament-game-contract.mjs';

const alice = {
  canonicalAccountId: 'canonical-alice-private',
  email: 'alice@example.test',
  playerName: 'Legacy Alice',
  playerHandle: 'alice_ranked',
  usernameClaimedAt: '2026-10-01T00:00:00.000Z',
};

function dependencies(overrides = {}) {
  return {
    resolveByHandle: async () => [alice],
    lookupRanks: async () => ({
      projections: [{
        canonicalAccountId: alice.canonicalAccountId,
        ranks: [{
          game: 'spades',
          leaderboard: 'v1_1_ranked',
          season: 'season-2',
          status: 'ranked',
          rank: 3,
          rating: 1902,
          wins: 91,
          losses: 11,
          provisional: false,
          asOf: '2026-10-11T17:00:00.000Z',
        }],
      }],
    }),
    listLeagues: async () => [{
      id: 'spades-season-2',
      name: 'Spades Season 2',
      gameSlug: 'spades',
      visibility: 'public',
      status: 'active',
      season: { id: 'season-2', name: 'Season 2' },
      updatedAt: '2026-10-11T17:02:00.000Z',
      standings: [{
        canonicalAccountId: alice.canonicalAccountId,
        rank: 2,
        wins: 8,
        losses: 2,
        ties: 0,
      }],
    }, {
      id: 'private-league',
      name: 'Private league',
      gameSlug: 'spades',
      visibility: 'private',
      standings: [{ canonicalAccountId: alice.canonicalAccountId, rank: 1 }],
    }],
    listPublicTournaments: async () => [{
      slug: 'spades-october',
      title: 'Spades October Open',
      gameSlug: 'spades',
    }],
    loadBracket: async () => ({
      rounds: [{
        index: 1,
        title: 'Final',
        matches: [{
          status: 'final',
          winnerId: 'participant-a',
          players: [{
            id: 'participant-a',
            canonicalAccountId: alice.canonicalAccountId,
            handle: 'alice_ranked',
          }, {
            id: 'participant-b',
            canonicalAccountId: 'canonical-opponent-private',
            handle: 'old-opponent-name',
          }],
          completion: {
            protocolVersion: TOURNAMENT_GAME_PROTOCOL_VERSION,
            game: 'spades',
            completionId: 'private-completion-id',
            winnerParticipantId: 'participant-a',
            winnerCanonicalAccountId: alice.canonicalAccountId,
            scores: { seat0: 500, seat1: 438 },
            completedAt: '2026-10-11T17:05:00.000Z',
          },
        }],
      }],
    }),
    ...overrides,
  };
}

test('public player profile joins rank, public league, and verified tournament data without private identifiers', async () => {
  const profile = await loadPublicPlayerProfile('@alice_ranked', dependencies());

  assert.deepEqual(profile.player, { handle: 'alice_ranked', displayName: 'alice_ranked' });
  assert.deepEqual(profile.ranks, [{
    game: 'spades',
    leaderboard: 'v1_1_ranked',
    season: 'season-2',
    status: 'ranked',
    rank: 3,
    provisional: false,
    asOf: '2026-10-11T17:00:00.000Z',
  }]);
  assert.equal(profile.leagues.length, 1);
  assert.equal(profile.leagues[0].name, 'Spades Season 2');
  assert.equal(profile.tournaments.summary.wins, 1);
  assert.deepEqual(profile.tournaments.verifiedMatches[0], {
    tournament: { slug: 'spades-october', title: 'Spades October Open' },
    game: 'spades',
    round: { index: 1, title: 'Final' },
    outcome: 'win',
    scores: { seat0: 500, seat1: 438 },
    completedAt: '2026-10-11T17:05:00.000Z',
  });

  const serialized = JSON.stringify(profile);
  assert.doesNotMatch(serialized, /"canonicalAccountId"|"email"|"rating"|alice@example|Legacy Alice|old-opponent|private-completion-id|private-league/);
  assert.doesNotMatch(serialized, /1902|"wins":91|"losses":11/);
});

test('only a claimed, exact username can resolve a browser profile', async () => {
  await assert.rejects(
    loadPublicPlayerProfile('alice_ranked', dependencies({
      resolveByHandle: async () => [{ ...alice, usernameClaimedAt: '' }],
    })),
    (error) => error instanceof PlayerProfileError && error.code === 'player_not_found',
  );

  const response = await handlePlayerProfileRequest({
    httpMethod: 'GET',
    queryStringParameters: { handle: 'alice_ranked' },
  }, {
    loadProfile: async () => ({ player: { handle: 'alice_ranked' } }),
  });
  assert.equal(response.statusCode, 200);
  assert.doesNotMatch(response.body, /canonicalAccountId|email/);
});

test('unverified or malformed completed matches are omitted from public history', async () => {
  const profile = await loadPublicPlayerProfile('alice_ranked', dependencies({
    loadBracket: async () => ({
      rounds: [{ index: 1, title: 'Final', matches: [{
        status: 'final',
        winnerId: 'participant-a',
        players: [{ id: 'participant-a', canonicalAccountId: alice.canonicalAccountId }],
        completion: {
          protocolVersion: 'wrong-version',
          game: 'spades',
          completionId: 'not-trusted',
          winnerParticipantId: 'participant-a',
          winnerCanonicalAccountId: alice.canonicalAccountId,
          completedAt: '2026-10-11T17:05:00.000Z',
        },
      }] }],
    }),
  }));
  assert.deepEqual(profile.tournaments, {
    verifiedMatches: [],
    summary: { matchesPlayed: 0, wins: 0, losses: 0 },
  });
});
