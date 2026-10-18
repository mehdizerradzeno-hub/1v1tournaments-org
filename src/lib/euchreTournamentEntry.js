export const EUCHRE_TOURNAMENT_ENTRY_PATHS = Object.freeze({
  browseEvents: '/euchre#events',
  hostTournament: '/admin?game=euchre#host-event',
  playMyMatch: '/euchre?view=my-match#my-match',
});

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function getRequestedHostTournamentGame(value) {
  const game = String(firstValue(value) || '').trim().toLowerCase();
  return ['euchre', 'gin'].includes(game) ? game : null;
}

export function collectReadyEuchreMatches(events = [], playerStatuses = []) {
  const statusBySlug = new Map(
    playerStatuses
      .filter((entry) => entry?.slug && entry?.status)
      .map((entry) => [entry.slug, entry.status]),
  );

  return events.flatMap((event) => {
    if (event?.gameSlug !== 'euchre') return [];
    const currentMatch = statusBySlug.get(event.slug)?.currentMatch;

    return currentMatch ? [{
      event,
      match: currentMatch,
      href: `/tournaments/${event.slug}#my-match`,
    }] : [];
  });
}
