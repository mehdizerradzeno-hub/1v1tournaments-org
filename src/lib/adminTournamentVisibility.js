export const ADMIN_EDIT_WINDOW_DAYS = 7;
export const ADMIN_EDIT_WINDOW_MS = ADMIN_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function tournamentStartMs(tournament) {
  const value = Date.parse(tournament?.date || '');
  return Number.isFinite(value) ? value : null;
}

export function isTournamentInAdminEditWindow(tournament, { nowMs = Date.now() } = {}) {
  const startMs = tournamentStartMs(tournament);

  // Undated drafts remain editable so a host can finish scheduling them.
  return startMs === null || startMs >= nowMs - ADMIN_EDIT_WINDOW_MS;
}

export function isTournamentReadOnlyHistory(tournament, options) {
  return !isTournamentInAdminEditWindow(tournament, options);
}

export function partitionAdminTournaments(tournaments = [], options) {
  return tournaments.reduce(
    (groups, tournament) => {
      if (isTournamentInAdminEditWindow(tournament, options)) {
        groups.current.push(tournament);
      } else {
        groups.previous.push(tournament);
      }

      return groups;
    },
    { current: [], previous: [] },
  );
}
