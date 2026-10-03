/**
 * Read-only public presentation data.
 *
 * This deliberately does not share tournamentCatalog's writer normalization.
 * A public card or filter is never an authorization decision, and an unknown
 * game is never silently represented as Spades.
 */
export const PUBLIC_GAME_PRESENTATIONS = Object.freeze([
  Object.freeze({
    slug: 'spades',
    aliases: Object.freeze(['spades-1v1']),
    name: 'Spades 1V1',
    cardName: 'SPADES',
    shortName: 'Spades',
    accent: '#e3ad4f',
    ink: '#8f111b',
    art: 'spade',
    availability: 'Public tournament availability is confirmed when a published event appears.',
    tournamentReady: true,
    webReady: true,
    infoPath: '/games/spades',
    playPath: '/spades',
    summary: 'Head-to-head trick taking for players who want every hand to matter.',
    facts: Object.freeze(['Ranked head-to-head', 'Public events when posted']),
  }),
  Object.freeze({
    slug: 'euchre',
    aliases: Object.freeze(['euchre-1v1']),
    name: 'Euchre 1V1',
    cardName: 'EUCHRE',
    shortName: 'Euchre',
    accent: '#91b9d5',
    ink: '#102d51',
    art: 'euchre',
    availability: 'Game information is available. Public tournament availability is not confirmed here.',
    tournamentReady: false,
    webReady: true,
    infoPath: '/games/euchre',
    playPath: '/euchre',
    summary: 'A compact trump game with a court-card focus and one opponent across the table.',
    facts: Object.freeze(['Head-to-head game', 'Tournament status announced per event']),
  }),
  Object.freeze({
    slug: 'gin-rummy',
    aliases: Object.freeze(['gin', 'ginrummy']),
    name: 'Gin Rummy 1V1',
    cardName: 'GIN RUMMY',
    shortName: 'Gin Rummy',
    accent: '#d7bd64',
    ink: '#0e5436',
    art: 'gin',
    availability: 'Information page available. Public tournament and web-play availability have not yet been provided.',
    tournamentReady: false,
    webReady: false,
    infoPath: '/games/gin-rummy',
    playPath: null,
    summary: 'A meld-building table game presented here without implying a released tournament integration.',
    facts: Object.freeze(['Information available', 'No public event announced']),
  }),
  Object.freeze({
    slug: 'cribbage',
    aliases: Object.freeze(['cribbage-1v1']),
    name: 'Cribbage 1V1',
    cardName: 'CRIBBAGE',
    shortName: 'Cribbage',
    accent: '#dda957',
    ink: '#633514',
    art: 'cribbage',
    availability: 'Information page available. Public tournament and web-play availability have not yet been provided.',
    tournamentReady: false,
    webReady: false,
    infoPath: '/games/cribbage',
    playPath: null,
    summary: 'A pegging-and-counting classic shown as a public game lane, not as a claimed live integration.',
    facts: Object.freeze(['Information available', 'No public event announced']),
  }),
]);

// An event that has just reached its scheduled time may still be awaiting a
// host-confirmed lifecycle update. Keep that state visible briefly, but never
// let an old, unmaintained schedule become a permanent "starting" claim.
export const PUBLIC_AWAITING_START_GRACE_MS = 2 * 60 * 60 * 1000;

const presentationByAlias = new Map(
  PUBLIC_GAME_PRESENTATIONS.flatMap((game) => [game.slug, ...game.aliases]
    .map((alias) => [alias, game])),
);

export function normalizePublicGameSlug(value) {
  const normalized = String(Array.isArray(value) ? value[0] : value || '')
    .trim()
    .toLowerCase();

  return presentationByAlias.get(normalized)?.slug || null;
}

export function getPublicGamePresentation(value) {
  const slug = normalizePublicGameSlug(value);

  return slug ? presentationByAlias.get(slug) || null : null;
}

export function getPublicGames() {
  return [...PUBLIC_GAME_PRESENTATIONS];
}

export function getPublicGamePath(value) {
  return getPublicGamePresentation(value)?.infoPath || '/games';
}

export function getPublicGameFilterItems() {
  return [
    { id: 'all', label: 'All games' },
    ...getPublicGames().map((game) => ({ id: game.slug, label: game.name })),
  ];
}

function publicVisibility(tournament, seeded = false) {
  const visibility = String(tournament?.visibility || '').trim().toLowerCase();

  if (seeded) return true;
  return visibility === 'public' || visibility === 'published';
}

export function isPublicPresentationEvent(tournament, { seeded = false } = {}) {
  const status = String(tournament?.status || '').trim().toLowerCase();
  const dateMs = new Date(tournament?.date || tournament?.startAt || '').getTime();

  return Boolean(tournament?.slug)
    && Boolean(getPublicGamePresentation(tournament.gameSlug || tournament.game))
    && Number.isFinite(dateMs)
    && !tournament.deleted
    && !tournament.deletedAt
    && !tournament.cancelledAt
    && tournament.publicDiscovery !== false
    && !['complete', 'completed', 'cancelled', 'deleted', 'draft', 'private', 'unlisted', 'archived'].includes(status)
    && !['private', 'unlisted', 'draft'].includes(String(tournament.visibility || '').trim().toLowerCase())
    && publicVisibility(tournament, seeded);
}

function adaptPublicEvent(tournament) {
  const game = getPublicGamePresentation(tournament.gameSlug || tournament.game);
  const rosterCap = Number(tournament.rosterCap);
  const registered = Number(tournament.registeredCount ?? tournament.signupCount);

  return {
    slug: String(tournament.slug),
    title: String(tournament.title || 'Tournament').trim(),
    gameSlug: game.slug,
    gameName: game.name,
    status: String(tournament.status || 'upcoming').trim().toLowerCase(),
    date: tournament.date || tournament.startAt,
    timeZone: String(tournament.timeZone || '').trim(),
    timeZoneLabel: String(tournament.timeZoneLabel || '').trim(),
    format: String(tournament.format || tournament.mode || '').trim(),
    location: String(tournament.location || '').trim(),
    registrationStatus: String(tournament.registrationStatus || '').trim().toLowerCase(),
    rosterCap: Number.isFinite(rosterCap) && rosterCap > 0 ? rosterCap : null,
    registeredCount: Number.isFinite(registered) && registered >= 0 ? registered : null,
  };
}

/**
 * Merges presentation data without writer normalizers that coerce game IDs or
 * clamp capacity. Hosted records require an explicit public/published state.
 */
export function getPublicPresentationEvents(seededEvents = [], hostedEvents = []) {
  const bySlug = new Map();

  seededEvents.filter(Boolean).forEach((event) => {
    if (isPublicPresentationEvent(event, { seeded: true })) {
      bySlug.set(event.slug, adaptPublicEvent(event));
    }
  });

  hostedEvents.filter(Boolean).forEach((event) => {
    if (!event.slug) return;
    if (!isPublicPresentationEvent(event)) {
      bySlug.delete(event.slug);
      return;
    }
    bySlug.set(event.slug, adaptPublicEvent(event));
  });

  return [...bySlug.values()].sort((left, right) => {
    const dateDifference = new Date(left.date).getTime() - new Date(right.date).getTime();
    return dateDifference || left.slug.localeCompare(right.slug);
  });
}

export function getNextEligiblePublicEvent(events = [], nowMs = Date.now()) {
  return events.find((event) => new Date(event.date).getTime() > nowMs) || null;
}

/**
 * A scheduled event that has just reached its start time is not automatically
 * live. This read-only helper gives the strip a short, truthful "awaiting
 * start" state after its deadline when there is no later future event.
 */
export function getAwaitingStartPublicEvent(
  events = [],
  nowMs = Date.now(),
  graceMs = PUBLIC_AWAITING_START_GRACE_MS,
) {
  return [...events]
    .filter((event) => {
      const eventMs = new Date(event.date).getTime();

      return ['upcoming', 'scheduled'].includes(event.status)
        && Number.isFinite(eventMs)
        && eventMs <= nowMs
        && nowMs - eventMs <= graceMs;
    })
    .sort((left, right) => {
      const dateDifference = new Date(right.date).getTime() - new Date(left.date).getTime();
      return dateDifference || right.slug.localeCompare(left.slug);
    })[0] || null;
}

export function filterPublicEventsByGame(events = [], gameSlug = 'all') {
  const normalized = normalizePublicGameSlug(gameSlug);
  return normalized ? events.filter((event) => event.gameSlug === normalized) : [...events];
}

/**
 * Presentation-only action selection. A public event never gains a signup
 * action unless the game lane and its event metadata independently support it.
 */
export function getPublicEventAction(event, game) {
  const capacityReached = event?.registeredCount !== null
    && event?.rosterCap !== null
    && Number(event.registeredCount) >= Number(event.rosterCap);
  const canRegister = Boolean(game?.tournamentReady)
    && event?.registrationStatus === 'open'
    && !capacityReached;

  return canRegister
    ? { href: `/check-in/${event.slug}`, label: 'Register', variant: 'primary' }
    : { href: `/tournaments/${event.slug}`, label: 'View event', variant: 'secondary' };
}

export function getCountdownParts(deadline, nowMs = Date.now()) {
  const deadlineMs = new Date(deadline || '').getTime();

  if (!Number.isFinite(deadlineMs)) {
    return [
      { label: 'Days', value: '--' },
      { label: 'Hours', value: '--' },
      { label: 'Minutes', value: '--' },
      { label: 'Seconds', value: '--' },
    ];
  }

  const seconds = Math.max(0, Math.floor((deadlineMs - nowMs) / 1000));
  return [
    { label: 'Days', value: String(Math.floor(seconds / 86400)) },
    { label: 'Hours', value: String(Math.floor((seconds % 86400) / 3600)).padStart(2, '0') },
    { label: 'Minutes', value: String(Math.floor((seconds % 3600) / 60)).padStart(2, '0') },
    { label: 'Seconds', value: String(seconds % 60).padStart(2, '0') },
  ];
}
