import {
  loadLeagueById,
  upsertLeagueMatchResult,
} from './_league-utils.mjs';

function cleanText(value) {
  return String(value || '').trim();
}

function canonicalAccountId(value) {
  return cleanText(value?.canonicalAccountId || value?.accountId || value?.id);
}

function competitionMeta(tournament = {}) {
  const meta = tournament?.competitionMeta || tournament?.leagueMeta || {};
  return {
    competitionMode: cleanText(meta.competitionMode || tournament?.competitionMode || 'tournament'),
    leagueId: cleanText(meta.leagueId || tournament?.leagueId),
    matchAssignmentId: cleanText(meta.matchAssignmentId || tournament?.matchAssignmentId),
  };
}

export class LinkedLeagueResultError extends Error {
  constructor(statusCode, code, message) {
    super(message || code);
    this.name = 'LinkedLeagueResultError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function validateLinkedLeagueTournamentAssignment({
  tournament,
  tournamentMatch,
  league,
  completionId = '',
}) {
  const assignment = competitionMeta(tournament);
  if (assignment.competitionMode !== 'league') return { linked: false };

  if (!assignment.leagueId || !assignment.matchAssignmentId) {
    throw new LinkedLeagueResultError(
      409,
      'invalid_league_assignment',
      'A league tournament must name its league and scheduled fixture.',
    );
  }

  if (!league || cleanText(league.id || league.leagueId) !== assignment.leagueId) {
    throw new LinkedLeagueResultError(404, 'league_not_found', 'The linked league was not found.');
  }

  if (cleanText(league.gameSlug) !== cleanText(tournament?.gameSlug)) {
    throw new LinkedLeagueResultError(409, 'league_game_mismatch', 'The linked league is for a different game.');
  }

  const leagueMatch = (league.matches || []).find((match) => (
    cleanText(match?.id) === assignment.matchAssignmentId
  ));
  if (!leagueMatch) {
    throw new LinkedLeagueResultError(404, 'league_match_not_found', 'The linked league fixture was not found.');
  }

  const ticketedPlayers = Array.isArray(tournamentMatch?.players) ? tournamentMatch.players : [];
  const homeCanonicalAccountId = canonicalAccountId(leagueMatch.homeTeam) || cleanText(leagueMatch.homePlayerId);
  const awayCanonicalAccountId = canonicalAccountId(leagueMatch.awayTeam) || cleanText(leagueMatch.awayPlayerId);
  const northCanonicalAccountId = canonicalAccountId(ticketedPlayers[0]);
  const southCanonicalAccountId = canonicalAccountId(ticketedPlayers[1]);

  if (
    !homeCanonicalAccountId
    || !awayCanonicalAccountId
    || homeCanonicalAccountId === awayCanonicalAccountId
    || northCanonicalAccountId !== homeCanonicalAccountId
    || southCanonicalAccountId !== awayCanonicalAccountId
  ) {
    throw new LinkedLeagueResultError(
      409,
      'league_assignment_participant_mismatch',
      'The tournament assignment does not match the league fixture participants.',
    );
  }

  const seenCallbackIds = Array.isArray(leagueMatch.callbackIds) ? leagueMatch.callbackIds.map(cleanText) : [];
  if (leagueMatch.status === 'complete' && !seenCallbackIds.includes(cleanText(completionId))) {
    throw new LinkedLeagueResultError(
      409,
      'league_match_already_completed',
      'The linked league fixture already has a different final result.',
    );
  }

  return {
    linked: true,
    leagueId: assignment.leagueId,
    matchId: assignment.matchAssignmentId,
    leagueMatch,
    homeCanonicalAccountId,
    awayCanonicalAccountId,
  };
}

/**
 * Turns one already-authoritative tournament completion into the matching
 * Hub league fixture result. This deliberately supports a two-player fixture
 * event only: bracket seat 0 is the scheduled home player and seat 1 is away.
 * Larger tournament placement-to-points policies need their own versioned
 * rules rather than silently reusing head-to-head standings.
 */
export function buildLinkedLeagueTournamentResult({ tournament, tournamentMatch, result, league }) {
  if (cleanText(tournament?.gameSlug) !== cleanText(result.game)) {
    throw new LinkedLeagueResultError(409, 'league_game_mismatch', 'The linked league is for a different game.');
  }
  const linked = validateLinkedLeagueTournamentAssignment({
    tournament,
    tournamentMatch,
    league,
    completionId: result.completionId,
  });
  if (!linked.linked) return linked;

  if (
    cleanText(result.winnerCanonicalAccountId) !== linked.homeCanonicalAccountId
    && cleanText(result.winnerCanonicalAccountId) !== linked.awayCanonicalAccountId
  ) {
    throw new LinkedLeagueResultError(
      409,
      'league_result_winner_mismatch',
      'The authoritative winner is not assigned to the linked league fixture.',
    );
  }

  const scores = result.scores && typeof result.scores === 'object' ? result.scores : null;
  return {
    linked: true,
    leagueId: linked.leagueId,
    matchId: linked.matchId,
    result: {
      winner: cleanText(result.winnerCanonicalAccountId) === linked.homeCanonicalAccountId ? 'home' : 'away',
      winnerId: cleanText(result.winnerCanonicalAccountId),
      homeScore: Number.isInteger(scores?.north)
        ? scores.north
        : Number.isInteger(scores?.seat0) ? scores.seat0 : 0,
      awayScore: Number.isInteger(scores?.south)
        ? scores.south
        : Number.isInteger(scores?.seat1) ? scores.seat1 : 0,
      forfeit: result.forfeit === true,
      source: 'tournament-authoritative-result',
      callbackId: cleanText(result.completionId),
      sourceTournamentSlug: cleanText(tournament?.slug || tournament?.tournamentSlug || tournamentMatch?.tournamentSlug),
      sourceTournamentMatchId: cleanText(tournamentMatch?.id || result.matchId),
      sourceCompletionId: cleanText(result.completionId),
    },
  };
}

export async function syncLinkedLeagueTournamentResult(
  { tournament, tournamentMatch, result },
  dependencies = {},
) {
  const assignment = competitionMeta(tournament);
  if (assignment.competitionMode !== 'league') return { linked: false };

  const loadLeague = dependencies.loadLeagueById || loadLeagueById;
  const writeLeagueResult = dependencies.upsertLeagueMatchResult || upsertLeagueMatchResult;
  const league = await loadLeague(assignment.leagueId);
  const linked = buildLinkedLeagueTournamentResult({ tournament, tournamentMatch, result, league });
  const updated = await writeLeagueResult(linked.leagueId, linked.matchId, linked.result, {
    source: linked.result.source,
    callbackId: linked.result.callbackId,
    updatedBy: 'tournament-authoritative-result',
    rejectConflictingCompleted: true,
  });

  if (!updated) {
    throw new LinkedLeagueResultError(404, 'league_match_not_found', 'The linked league fixture was not found.');
  }
  if (updated.conflict) {
    throw new LinkedLeagueResultError(
      409,
      'league_match_already_completed',
      'The linked league fixture already has a different final result.',
    );
  }

  return {
    linked: true,
    leagueId: linked.leagueId,
    matchId: linked.matchId,
    duplicate: Boolean(updated.duplicate),
  };
}

export async function validateLinkedLeagueTournamentSetup(
  { tournament, tournamentMatch, entrantCount },
  dependencies = {},
) {
  const assignment = competitionMeta(tournament);
  if (assignment.competitionMode !== 'league') return { linked: false };
  if (entrantCount !== 2) {
    throw new LinkedLeagueResultError(
      409,
      'league_fixture_requires_two_players',
      'A linked league fixture must be generated from exactly its two scheduled players.',
    );
  }
  const loadLeague = dependencies.loadLeagueById || loadLeagueById;
  const league = await loadLeague(assignment.leagueId);
  return validateLinkedLeagueTournamentAssignment({ tournament, tournamentMatch, league });
}
