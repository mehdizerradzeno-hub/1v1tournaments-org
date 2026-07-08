const DEFAULT_GAME_SLUG = 'spades';
const DEFAULT_TIME_ZONE = 'America/New_York';
const DEFAULT_TIME_ZONE_LABEL = 'ET';
const DEFAULT_ROSTER_CAP = 8;
const DEFAULT_MINIMUM_PLAYERS = 2;
const DEFAULT_CHECK_IN_LEAD_MINUTES = 30;

const DEFAULT_CHECK_IN = {
  title: 'Signup',
  status: 'Registration open',
  preview: '30 min early',
  window: 'Opens 30 minutes before the start time.',
  note: 'Submit the form once. The host uses this roster to generate your match link.',
  steps: [
    'Create or sign in to your player account.',
    'Join the roster for the tournament.',
    'Open your Spades match link after the bracket is published.',
  ],
};

const DEFAULT_BRACKET = {
  title: 'Bracket preview',
  note: 'The live bracket appears here after the host generates it from signups.',
  rounds: [
    {
      title: 'Example first round',
      matches: [
        {
          label: 'Match 1',
          teams: ['Seed 1', 'Seed 4'],
          note: 'Example only. Real player names appear after the host generates the bracket.',
        },
        {
          label: 'Match 2',
          teams: ['Seed 2', 'Seed 3'],
          note: 'Example only. Real player names appear after the host generates the bracket.',
        },
      ],
    },
    {
      title: 'Example final',
      matches: [
        {
          label: 'Championship',
          teams: ['Winner of Match 1', 'Winner of Match 2'],
          note: 'The live bracket replaces this preview once the tournament is seeded.',
        },
      ],
    },
  ],
};

function cleanText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function cleanShortText(value, fallback = '') {
  return cleanText(value, fallback).slice(0, 160);
}

function positiveInteger(value, fallback, min = 1, max = 128) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function cleanDate(value, fallback = '') {
  const raw = cleanText(value, fallback);
  const parsed = new Date(raw);

  if (!raw || Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toISOString();
}

function arrayOfText(value, fallback = []) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return value.map((item) => cleanText(item)).filter(Boolean);
}

function normalizeLinks(links, slug) {
  const incoming = Array.isArray(links) ? links : [];
  const normalized = incoming
    .map((link) => ({
      label: cleanShortText(link?.label),
      href: cleanShortText(link?.href),
    }))
    .filter((link) => link.label && link.href);

  if (normalized.length) {
    return normalized;
  }

  return [
    { label: 'Tournament page', href: `/tournaments/${slug}` },
    { label: 'Rules', href: '/rules' },
    { label: 'Live links', href: '/live' },
  ];
}

export function slugifyTournamentTitle(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function createTournamentRecord(payload = {}) {
  const title = cleanShortText(payload.title, 'Spades tournament');
  const slug = slugifyTournamentTitle(payload.slug || title) || 'spades-tournament';
  const rosterCap = positiveInteger(payload.rosterCap, DEFAULT_ROSTER_CAP, 2, 128);
  const minimumPlayers = Math.min(
    positiveInteger(payload.minimumPlayers, DEFAULT_MINIMUM_PLAYERS, 2, rosterCap),
    rosterCap,
  );
  const gameSlug = cleanShortText(payload.gameSlug, DEFAULT_GAME_SLUG);
  const date = cleanDate(payload.date || payload.startAt, '');
  const timeZone = cleanShortText(payload.timeZone, DEFAULT_TIME_ZONE);
  const timeZoneLabel = cleanShortText(payload.timeZoneLabel, DEFAULT_TIME_ZONE_LABEL).slice(0, 12);
  const checkInLeadMinutes = positiveInteger(payload.checkInLeadMinutes, DEFAULT_CHECK_IN_LEAD_MINUTES, 0, 1440);
  const summary = cleanShortText(payload.summary, `A hosted ${gameSlug} bracket with live signup, match links, and posted results.`);
  const detail = cleanText(
    payload.detail,
    `${title} uses account-based signup, hosted match links, automatic result reporting, and a post-match summary.`,
  ).slice(0, 500);

  return {
    slug,
    gameSlug,
    title,
    badge: cleanShortText(payload.badge, 'Host event'),
    status: cleanShortText(payload.status, 'upcoming'),
    date,
    timeZone,
    timeZoneLabel,
    registrationStatus: cleanShortText(payload.registrationStatus, 'open'),
    checkInLeadMinutes,
    location: cleanShortText(payload.location, 'Online'),
    format: cleanShortText(payload.format, 'Single-elimination bracket'),
    rosterCap,
    minimumPlayers,
    bracketFlexPolicy: cleanText(
      payload.bracketFlexPolicy,
      `Advertised ${rosterCap}-player bracket. Actual bracket flexes to the checked-in roster: runs with ${minimumPlayers}+ players and fills open seats with byes.`,
    ).slice(0, 500),
    entryLine: cleanShortText(payload.entryLine, 'Free entry, no buy-in, no wagering.'),
    summary,
    detail,
    callout: cleanShortText(payload.callout, 'Check-in opens before the start time.'),
    checkIn: {
      ...DEFAULT_CHECK_IN,
      ...(payload.checkIn || {}),
    },
    bracket: {
      ...DEFAULT_BRACKET,
      ...(payload.bracket || {}),
    },
    agenda: Array.isArray(payload.agenda) ? payload.agenda : [],
    highlights: arrayOfText(payload.highlights, [
      'Account-based tournament signup',
      'Hosted bracket and match links',
      'Results posted after play completes',
    ]),
    streamSlugs: arrayOfText(payload.streamSlugs, ['main-live', 'replay-archive']),
    links: normalizeLinks(payload.links, slug),
    hosted: Boolean(payload.hosted ?? true),
  };
}

export function mergeTournamentLists(baseTournaments = [], hostedTournaments = []) {
  const lookup = new Map();

  baseTournaments.filter(Boolean).forEach((tournament) => {
    lookup.set(tournament.slug, tournament);
  });

  hostedTournaments.filter(Boolean).forEach((tournament) => {
    const normalized = createTournamentRecord(tournament);
    const existing = lookup.get(normalized.slug) || {};
    lookup.set(normalized.slug, {
      ...existing,
      ...normalized,
      checkIn: {
        ...(existing.checkIn || {}),
        ...(normalized.checkIn || {}),
      },
      bracket: {
        ...(existing.bracket || {}),
        ...(normalized.bracket || {}),
      },
      links: normalized.links?.length ? normalized.links : existing.links,
      streamSlugs: normalized.streamSlugs?.length ? normalized.streamSlugs : existing.streamSlugs,
    });
  });

  return [...lookup.values()].sort((left, right) => {
    const leftTime = new Date(left.date).getTime();
    const rightTime = new Date(right.date).getTime();

    if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return 0;
    if (!Number.isFinite(leftTime)) return 1;
    if (!Number.isFinite(rightTime)) return -1;
    return leftTime - rightTime;
  });
}
