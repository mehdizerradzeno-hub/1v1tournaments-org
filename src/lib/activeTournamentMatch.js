const TOURNAMENT_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MATCH_ID_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*)-r[1-9]\d*-m[1-9]\d*$/;
const GENERIC_TOURNAMENT_PATH = '/tournaments';

function cleanText(value) {
  return String(value || '').trim();
}

function normalizePathname(value) {
  const pathname = cleanText(value).split(/[?#]/, 1)[0] || '/';

  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

export function getActiveTournamentMatchPath(activeMatch, fallbackPath = '/next') {
  const tournamentSlug = String(activeMatch?.tournamentSlug || '').trim().toLowerCase();
  const matchId = String(activeMatch?.matchId || '').trim().toLowerCase();
  const match = matchId.match(MATCH_ID_RE);

  if (!TOURNAMENT_SLUG_RE.test(tournamentSlug) || !match || match[1] !== tournamentSlug) {
    return fallbackPath;
  }

  return `/tournaments/${tournamentSlug}#my-match`;
}

export function getActiveTournamentPath(activeMatch, fallbackPath = '/next') {
  const matchPath = getActiveTournamentMatchPath(activeMatch, '');

  return matchPath ? matchPath.slice(0, matchPath.indexOf('#')) : fallbackPath;
}

export function getColdStartRestoreRequest({ accountId, discovery, pathname }) {
  const normalizedAccountId = cleanText(accountId);
  const discoveryAccountId = cleanText(discovery?.accountId);
  const activeMatch = discovery?.activeMatch || null;

  if (
    normalizePathname(pathname) !== GENERIC_TOURNAMENT_PATH
    || !normalizedAccountId
    || discoveryAccountId !== normalizedAccountId
    || discovery?.scope !== 'active-match'
    || Number(discovery?.activeMatchCount) !== 1
    || discovery?.nextStep !== 'ready-match'
    || activeMatch?.bracketStatus === 'complete'
  ) {
    return null;
  }

  const tournamentSlug = cleanText(activeMatch?.tournamentSlug).toLowerCase();
  const matchId = cleanText(activeMatch?.matchId).toLowerCase();
  const tournamentPath = getActiveTournamentPath({ tournamentSlug, matchId }, '');

  if (!tournamentPath) {
    return null;
  }

  return {
    key: `${normalizedAccountId}:${tournamentSlug}:${matchId}`,
    tournamentSlug,
    matchId,
  };
}

export function createTournamentRestoreLauncher() {
  let inFlightKey = '';
  let launchedKey = '';

  return {
    async launch(request, {
      isCurrent = () => true,
      issueTicket,
      navigate,
    } = {}) {
      if (!request) {
        return { status: 'skipped' };
      }

      if (request.key === inFlightKey || request.key === launchedKey) {
        return { status: 'duplicate' };
      }

      if (typeof issueTicket !== 'function' || typeof navigate !== 'function') {
        throw new TypeError('Tournament restore requires ticket issuance and navigation.');
      }

      inFlightKey = request.key;

      try {
        const result = await issueTicket({
          slug: request.tournamentSlug,
          matchId: request.matchId,
        });

        if (!isCurrent()) {
          return { status: 'stale' };
        }

        const roomUrl = cleanText(result?.roomUrl);

        if (!roomUrl) {
          throw new Error('Match access did not return a launch URL.');
        }

        navigate(roomUrl);
        launchedKey = request.key;

        return { status: 'launched' };
      } finally {
        if (inFlightKey === request.key) {
          inFlightKey = '';
        }
      }
    },
  };
}
