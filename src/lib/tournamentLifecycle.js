const CLOSED_STATUSES = new Set(['archived', 'complete', 'deleted', 'expired', 'live']);
const DEFAULT_COMPETITION_MODE = 'tournament';

function normalizedStatus(value, fallback = '') {
  return String(value || fallback).trim().toLowerCase();
}

function normalizeCompetitionMode(value) {
  return String(value || DEFAULT_COMPETITION_MODE).toLowerCase() === 'league'
    ? 'league'
    : DEFAULT_COMPETITION_MODE;
}

export function getTournamentCompetitionMeta(tournament = {}) {
  const meta = tournament?.competitionMeta || tournament?.leagueMeta || {};
  const competitionMode = normalizeCompetitionMode(meta.competitionMode);

  return {
    ...meta,
    competitionMode,
  };
}

export function isLeagueTournament(tournament = {}) {
  return getTournamentCompetitionMeta(tournament).competitionMode === 'league';
}

export function deriveTournamentLifecycle(tournament, bracket = null, now = new Date()) {
  if (!tournament) {
    return null;
  }

  const storedStatus = normalizedStatus(tournament.status, 'upcoming');
  const bracketStatus = normalizedStatus(bracket?.status);
  const startMs = new Date(tournament.date).getTime();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  let status = storedStatus;
  let reason = 'stored-status';

  if (storedStatus === 'deleted' || tournament.deleted) {
    status = 'deleted';
    reason = 'deleted';
  } else if (storedStatus === 'archived') {
    status = 'archived';
    reason = 'host-archived';
  } else if (bracketStatus === 'complete' || storedStatus === 'complete') {
    status = 'complete';
    reason = 'bracket-complete';
  } else if (bracket) {
    status = 'live';
    reason = 'bracket-live';
  } else if (Number.isFinite(startMs) && Number.isFinite(nowMs) && startMs <= nowMs) {
    status = 'expired';
    reason = 'event-started';
  } else {
    status = 'upcoming';
    reason = 'scheduled';
  }

  const registrationStatus = CLOSED_STATUSES.has(status)
    ? 'closed'
    : normalizedStatus(tournament.registrationStatus, 'open');

  return {
    ...tournament,
    status,
    registrationStatus,
    competitionMeta: getTournamentCompetitionMeta(tournament),
    lifecycle: {
      reason,
      storedStatus,
    },
  };
}

export function isUpcomingTournament(tournament) {
  return deriveTournamentLifecycle(tournament)?.status === 'upcoming';
}
