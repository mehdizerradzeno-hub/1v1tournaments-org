import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LinkedLeagueResultError,
  buildLinkedLeagueTournamentResult,
  syncLinkedLeagueTournamentResult,
  validateLinkedLeagueTournamentSetup,
} from '../netlify/functions/_linked-league-result.mjs';
import {
  buildBracket,
  reportAuthoritativeResultWithRetry,
} from '../netlify/functions/tournament-bracket.mjs';

const tournament = {
  slug: 'euchre-league-week-one',
  gameSlug: 'euchre',
  competitionMeta: {
    competitionMode: 'league',
    leagueId: 'euchre-league',
    matchAssignmentId: 'euchre-league-w1-1',
  },
};

const tournamentMatch = {
  id: 'euchre-league-week-one-r1-m1',
  players: [
    { id: 'signup-home', canonicalAccountId: 'canonical-home' },
    { id: 'signup-away', canonicalAccountId: 'canonical-away' },
  ],
};

const result = {
  game: 'euchre',
  matchId: tournamentMatch.id,
  completionId: 'completion-001',
  winnerParticipantId: 'signup-home',
  winnerCanonicalAccountId: 'canonical-home',
  scores: { north: 10, south: 7 },
  forfeit: false,
};

function league(overrides = {}) {
  return {
    id: 'euchre-league',
    gameSlug: 'euchre',
    matches: [{
      id: 'euchre-league-w1-1',
      status: 'scheduled',
      callbackIds: [],
      homeTeam: { canonicalAccountId: 'canonical-home' },
      awayTeam: { canonicalAccountId: 'canonical-away' },
    }],
    ...overrides,
  };
}

test('a linked authoritative Euchre completion produces an auditable league fixture result', () => {
  const linked = buildLinkedLeagueTournamentResult({
    tournament,
    tournamentMatch,
    result,
    league: league(),
  });

  assert.deepEqual(linked, {
    linked: true,
    leagueId: 'euchre-league',
    matchId: 'euchre-league-w1-1',
    result: {
      winner: 'home',
      winnerId: 'canonical-home',
      homeScore: 10,
      awayScore: 7,
      forfeit: false,
      source: 'tournament-authoritative-result',
      callbackId: 'completion-001',
      sourceTournamentSlug: 'euchre-league-week-one',
      sourceTournamentMatchId: 'euchre-league-week-one-r1-m1',
      sourceCompletionId: 'completion-001',
    },
  });
});

test('a linked authoritative Spades completion maps bracket seats to home and away scores', () => {
  const linked = buildLinkedLeagueTournamentResult({
    tournament: {
      ...tournament,
      slug: 'spades-league-week-one',
      gameSlug: 'spades',
      competitionMeta: {
        competitionMode: 'league',
        leagueId: 'spades-league',
        matchAssignmentId: 'spades-league-w1-1',
      },
    },
    tournamentMatch: {
      ...tournamentMatch,
      id: 'spades-league-week-one-r1-m1',
    },
    result: {
      game: 'spades',
      matchId: 'spades-league-week-one-r1-m1',
      completionId: 'spades-completion-001',
      winnerParticipantId: 'signup-away',
      winnerCanonicalAccountId: 'canonical-away',
      // Spades penalties can leave one final score below zero. The linked
      // league projection must retain the signed game-authoritative score.
      scores: { seat0: -100, seat1: 250 },
      forfeit: false,
    },
    league: league({
      id: 'spades-league',
      gameSlug: 'spades',
      matches: [{
        ...league().matches[0],
        id: 'spades-league-w1-1',
      }],
    }),
  });

  assert.equal(linked.result.winner, 'away');
  assert.equal(linked.result.homeScore, -100);
  assert.equal(linked.result.awayScore, 250);
});

test('linked league sync passes only the authoritative result and stable completion id to the writer', async () => {
  const calls = [];
  const outcome = await syncLinkedLeagueTournamentResult(
    { tournament, tournamentMatch, result },
    {
      loadLeagueById: async (leagueId) => {
        assert.equal(leagueId, 'euchre-league');
        return league();
      },
      upsertLeagueMatchResult: async (...args) => {
        calls.push(args);
        return { duplicate: false };
      },
    },
  );

  assert.deepEqual(outcome, {
    linked: true,
    leagueId: 'euchre-league',
    matchId: 'euchre-league-w1-1',
    duplicate: false,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'euchre-league');
  assert.equal(calls[0][1], 'euchre-league-w1-1');
  assert.equal(calls[0][2].callbackId, 'completion-001');
  assert.equal(calls[0][2].sourceCompletionId, 'completion-001');
  assert.equal(calls[0][3].updatedBy, 'tournament-authoritative-result');
});

test('a mismatched tournament assignment cannot update league standings', () => {
  assert.throws(
    () => buildLinkedLeagueTournamentResult({
      tournament,
      tournamentMatch: {
        ...tournamentMatch,
        players: [tournamentMatch.players[1], tournamentMatch.players[0]],
      },
      result,
      league: league(),
    }),
    (error) => error instanceof LinkedLeagueResultError
      && error.code === 'league_assignment_participant_mismatch',
  );
});

test('a completed fixture only accepts the completion that originally finalized it', () => {
  assert.throws(
    () => buildLinkedLeagueTournamentResult({
      tournament,
      tournamentMatch,
      result,
      league: league({
        matches: [{
          ...league().matches[0],
          status: 'complete',
          callbackIds: ['other-completion'],
        }],
      }),
    }),
    (error) => error instanceof LinkedLeagueResultError
      && error.code === 'league_match_already_completed',
  );
});

test('a linked league event can only be generated for its single scheduled head-to-head fixture', async () => {
  await assert.rejects(
    () => validateLinkedLeagueTournamentSetup(
      { tournament, tournamentMatch, entrantCount: 4 },
      { loadLeagueById: async () => league() },
    ),
    (error) => error instanceof LinkedLeagueResultError
      && error.code === 'league_fixture_requires_two_players',
  );

  const valid = await validateLinkedLeagueTournamentSetup(
    { tournament, tournamentMatch, entrantCount: 2 },
    { loadLeagueById: async () => league() },
  );
  assert.equal(valid.linked, true);
});

test('a retry after a league write outage syncs the already-final bracket exactly once', async () => {
  let stored = buildBracket({
    tournamentSlug: tournament.slug,
    gameSlug: 'euchre',
    signups: [
      { id: 'signup-home', canonicalAccountId: 'canonical-home', playerName: 'Home', createdAt: '2026-10-11T00:00:00.000Z' },
      { id: 'signup-away', canonicalAccountId: 'canonical-away', playerName: 'Away', createdAt: '2026-10-11T00:01:00.000Z' },
    ],
  });
  const hubResult = {
    protocolVersion: '2026-08-04',
    ...result,
  };
  const options = {
    loadBracketWithMetadata: async () => ({ bracket: structuredClone(stored), etag: 'test-etag' }),
    saveBracket: async (bracket) => {
      stored = structuredClone(bracket);
      return structuredClone(bracket);
    },
    loadTournamentForBracket: async () => tournament,
  };

  const failed = await reportAuthoritativeResultWithRetry(tournament.slug, hubResult, {
    ...options,
    syncLinkedLeagueTournamentResult: async () => {
      throw new Error('league store temporarily unavailable');
    },
  });
  assert.equal(failed.error.statusCode, 503);
  assert.equal(stored.rounds[0].matches[0].completion.completionId, 'completion-001');

  let retryCalls = 0;
  const retried = await reportAuthoritativeResultWithRetry(tournament.slug, hubResult, {
    ...options,
    syncLinkedLeagueTournamentResult: async () => {
      retryCalls += 1;
      return { linked: true, duplicate: false };
    },
  });
  assert.equal(retried.duplicate, true);
  assert.equal(retried.leagueSync.linked, true);
  assert.equal(retryCalls, 1);
});
