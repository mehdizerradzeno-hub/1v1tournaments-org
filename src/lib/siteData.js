const sharedCheckIn = {
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

const sharedBracket = {
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

export const siteData = {
  site: {
    name: '1v1 Tournaments',
    domain: '1v1tournaments.org',
    headline: 'Free-entry card tournaments with account-based signups, hosted brackets, and Spades match links.',
    tagline: 'Sign up, get seeded, open your match link, and play.',
    entryPolicy: 'Free entry, no buy-in, no wagering.',
    adminNote: 'Tournament pages manage signups, brackets, match links, and winner advancement. Spades remains the gameplay app.',
    contactEmail: 'hello@1v1tournaments.org',
    primaryGameSlug: 'spades',
    primaryTournamentSlug: 'spades-summer-series',
  },
  organization: {
    summary: '1v1 Tournaments is the public home for free-entry, skill-based card-game events.',
    mission: 'Run simple free-entry card tournaments with one clear path for players and one private path for the host.',
    focus: [
      'Account-based Spades signups',
      'Hosted brackets and match links',
      'Posted results and stream links',
      'Euchre coming soon',
    ],
    contactEmail: 'hello@1v1tournaments.org',
    responseNote: 'Replies are handled manually for now.',
  },
  admin: {
    accessModel: 'browser-local passphrase fallback with server-side account allowlist',
    futureAccessModel: 'localhost allowlist server',
    serverUrl: 'http://127.0.0.1:8787',
    serverStateFile: '.data/admin-state.json',
    accountIdRule: 'Use account IDs as server allowlist entries, not as secrets.',
    bootstrapAllowlistAccountIds: [],
    draftTournaments: [],
  },
  games: [
    {
      slug: 'spades',
      name: 'Spades',
      status: 'active',
      badge: 'Launch game',
      sortOrder: 1,
      shortPath: '/spades',
      summary: 'The first featured game on the hub, built for live tournament pages and posted results.',
      heroCopy: 'Spades is where matches are played. The hub owns signups, brackets, match IDs, and results.',
      accent: '#D6A24E',
      featuredTournamentSlug: 'spades-summer-series',
      quickFacts: [
        { label: 'Entry', value: 'Free' },
        { label: 'Buy-in', value: 'None' },
        { label: 'Status', value: 'Active' },
      ],
      highlights: [
        'Tournament match links open directly in Spades.',
        'The hub keeps bracket state separate from gameplay.',
        'Results and stream links stay attached to each event.',
      ],
      ruleSections: [
        {
          title: 'Event setup',
          items: [
            'Spades is the first live game on the hub.',
            'Each tournament page shows the schedule, stream links, and result notes together.',
            'The host loads account-linked signups before generating the bracket.',
          ],
        },
        {
          title: 'Match flow',
          items: [
            'Use the tournament page for check-in, start time, and format details.',
            'Use the Spades match link when your bracket card is ready.',
            'Results are posted after play ends.',
            'The layout stays mobile-first for quick updates from a phone.',
          ],
        },
        {
          title: 'Future-ready model',
          items: [
            'New games can reuse the same signup, bracket, and results flow.',
            'Future games stay separate from Spades gameplay rooms.',
          ],
        },
      ],
    },
    {
      slug: 'euchre',
      name: 'Euchre',
      status: 'coming soon',
      badge: 'Coming soon',
      sortOrder: 2,
      shortPath: '/euchre',
      summary: 'A coming-soon banner only. Current tournament operations are Spades-only.',
      heroCopy: 'Euchre is coming soon. There are no Euchre signups, brackets, or public events yet.',
      accent: '#6CC7FF',
      featuredTournamentSlug: null,
      quickFacts: [
        { label: 'Entry', value: 'Free' },
        { label: 'Buy-in', value: 'None' },
        { label: 'Status', value: 'Coming soon' },
      ],
      highlights: [
        'Only Spades tournaments are public for now.',
        'There are no Euchre events or signups yet.',
        'Euchre can reuse the account signup and bracket flow later.',
      ],
      ruleSections: [
        {
          title: 'Coming soon',
          items: [
            'Euchre will use the same dark, mobile-first card layout as the Spades pages.',
            'The first public event can use the same account-based signup path.',
            'Free-entry wording stays on every public page.',
          ],
        },
        {
          title: 'Match notes',
          items: [
            'Use this block for round structure, table count, or local house rules later.',
            'Keep the copy brief so it stays easy to update from a phone.',
          ],
        },
        {
          title: 'Expansion path',
          items: [
            'Once Euchre is ready, swap placeholder text for final rules and scoring notes.',
            'The same pattern can be reused if another game is added later.',
          ],
        },
      ],
    },
  ],
  tournaments: [
    {
      slug: 'spades-summer-series',
      gameSlug: 'spades',
      title: 'Spades Summer Series',
      badge: 'Featured event',
      status: 'upcoming',
      date: '2026-07-18T18:00:00-04:00',
      timeZone: 'America/New_York',
      timeZoneLabel: 'ET',
      location: 'Online',
      format: 'Single-elimination bracket',
      rosterCap: 8,
      minimumPlayers: 2,
      bracketFlexPolicy: 'Advertised 8-player bracket. Actual bracket flexes to the checked-in roster: runs with 2+ players and fills open seats with byes.',
      entryLine: 'Free entry, no buy-in, no wagering.',
      summary: 'The launch event for the hub with live coverage and posted results.',
      detail: 'A focused launch bracket with live account signup, hosted match links, automatic result reporting, and a post-match summary.',
      callout: 'Check-in opens 30 minutes before start.',
      checkIn: sharedCheckIn,
      bracket: sharedBracket,
      agenda: [
        { time: '5:30 PM ET', label: 'Check-in opens' },
        { time: '6:00 PM ET', label: 'Bracket begins' },
        { time: 'After final table', label: 'Results posted' },
      ],
      highlights: [
        'Featured Spades tournament page',
        'Live stream and replay links',
        'Results posted after play completes',
      ],
      streamSlugs: ['main-live', 'replay-archive'],
      links: [
        { label: 'Tournament page', href: '/tournaments/spades-summer-series' },
        { label: 'Rules', href: '/rules' },
        { label: 'Live links', href: '/live' },
      ],
    },
  ],
  results: [],
  streams: [
    {
      slug: 'main-live',
      label: 'Spectator table',
      title: 'Watch the current Spades table',
      href: 'https://1v1spades.com/room/spades-summer-series-r1-m1?spectator=1',
      description: 'Spectator view for the active tournament match. No player ticket is needed.',
      kind: 'live',
    },
    {
      slug: 'youtube-channel',
      label: 'YouTube channel',
      title: 'Open the Spades channel',
      href: 'https://m.youtube.com/channel/UCkqnaYQ2I47O8e20sIsHpfQ?ra=m',
      description: 'Channel home for uploads, highlights, and future Spades replays.',
      kind: 'channel',
    },
    {
      slug: 'replay-archive',
      label: 'Replay archive',
      title: 'View the Spades replay archive',
      href: 'https://www.youtube.com/@1v1Tournaments/videos',
      description: 'Replay page for posted Spades matches and clips once they are uploaded.',
      kind: 'archive',
    },
  ],
  rules: {
    general: [
      {
        title: 'Entry policy',
        items: [
          'Entries are free.',
          'No buy-in or wagering is used for this hub.',
          'Event pages show the current schedule, signup path, and match flow.',
        ],
      },
      {
        title: 'Admin workflow',
        items: [
          'Use the private admin page to load account-linked signups.',
          'Generate the bracket from the live roster.',
          'Let Spades report match winners automatically, then use manual advance only as a backup.',
        ],
      },
      {
        title: 'Site scope',
        items: [
          'The hub owns tournament registration and bracket state.',
          'Spades owns gameplay.',
          'Tournament match links require account-issued player tickets.',
        ],
      },
      {
        title: 'Platform note',
        items: [
          'These are free-entry tournaments for skill-based card game events.',
          'Participation rewards, if any are ever posted, must be sponsor or developer funded according to the published rules.',
          'Apple is not a sponsor or involved.',
        ],
      },
    ],
  },
};

const byDateAsc = (left, right) => new Date(left.date).getTime() - new Date(right.date).getTime();
const byDateDesc = (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime();
const getDraftTournaments = () => siteData.admin?.draftTournaments || [];

function playerDisplayName(player) {
  if (!player) return '';
  return player.handle ? `${player.name} (${player.handle})` : player.name || '';
}

function finalMatchFromBracket(bracket) {
  const rounds = bracket?.rounds || [];
  const matches = rounds.flatMap((round) => round.matches || []);

  return matches.find((match) => !match.nextMatchId && (match.winnerId || match.winnerName))
    || matches.find((match) => !match.nextMatchId)
    || matches.at(-1)
    || null;
}

function resultPlacementsFromBracket(bracket, finalMatch, winnerName) {
  const placements = [];
  const addPlacement = (name) => {
    if (!name || placements.some((placement) => placement.name === name)) {
      return;
    }

    placements.push({ place: placements.length + 1, name });
  };

  addPlacement(winnerName);

  (finalMatch?.players || [])
    .map(playerDisplayName)
    .filter((name) => name && name !== winnerName)
    .forEach(addPlacement);

  (bracket?.participants || [])
    .map(playerDisplayName)
    .filter((name) => name && name !== winnerName)
    .forEach(addPlacement);

  return placements;
}

export function buildResultFromTournamentBracket(tournament, bracket) {
  if (!tournament || !bracket) {
    return null;
  }

  const finalMatch = finalMatchFromBracket(bracket);
  const winnerName = bracket.winner?.name || finalMatch?.winnerName || '';
  const isComplete = bracket.status === 'complete' || (finalMatch?.status === 'final' && winnerName);

  if (!isComplete || !winnerName) {
    return null;
  }

  const finalLabel = finalMatch?.label || 'Final';
  const roundLabel = bracket.rounds?.find((round) => round.matches?.some((match) => match.id === finalMatch?.id))?.title || 'Final';

  return {
    slug: `${tournament.slug}-live-result`,
    tournamentSlug: tournament.slug,
    gameSlug: tournament.gameSlug,
    badge: 'Tournament result',
    status: 'complete',
    title: `${tournament.title} Results`,
    winner: winnerName,
    summary: `${winnerName} won ${tournament.title}.`,
    score: 'Champion',
    date: bracket.updatedAt || tournament.date,
    placements: resultPlacementsFromBracket(bracket, finalMatch, winnerName),
    notes: [
      `Final table: ${roundLabel} • ${finalLabel}.`,
      'Posted automatically from the live tournament bracket.',
    ],
  };
}

function getDerivedTournamentResults() {
  return siteData.tournaments
    .map((tournament) => buildResultFromTournamentBracket(tournament, tournament.bracket))
    .filter(Boolean);
}

export function mergeResults(baseResults, extraResults = []) {
  const incoming = Array.isArray(extraResults) ? extraResults : [extraResults].filter(Boolean);
  const resultsByKey = new Map();

  [...incoming, ...baseResults].filter(Boolean).forEach((result) => {
    const key = result.tournamentSlug || result.slug;

    if (!resultsByKey.has(key)) {
      resultsByKey.set(key, result);
    }
  });

  return [...resultsByKey.values()].sort(byDateDesc);
}

export function getGames() {
  return [...siteData.games].sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getGamePath(slug) {
  const game = getGameBySlug(slug);

  if (game?.shortPath) {
    return game.shortPath;
  }

  return slug === siteData.site.primaryGameSlug ? `/${slug}` : `/games/${slug}`;
}

export function getGameBySlug(slug) {
  return siteData.games.find((game) => game.slug === slug) || null;
}

export function getUpcomingTournaments() {
  return siteData.tournaments.filter((tournament) => tournament.status === 'upcoming').sort(byDateAsc);
}

export function getTournamentBySlug(slug) {
  return siteData.tournaments.find((tournament) => tournament.slug === slug) || null;
}

export function getTournamentPath(slug) {
  return `/tournaments/${slug}`;
}

export function getCheckInPath(slug) {
  return `/check-in/${slug}`;
}

export function getTournamentsForGame(gameSlug) {
  return siteData.tournaments.filter((tournament) => tournament.gameSlug === gameSlug).sort(byDateAsc);
}

export function getResults() {
  return mergeResults(siteData.results, getDerivedTournamentResults());
}

export function getResultsForGame(gameSlug) {
  return getResults().filter((result) => result.gameSlug === gameSlug);
}

export function getResultByTournamentSlug(tournamentSlug) {
  return getResults().find((result) => result.tournamentSlug === tournamentSlug) || null;
}

export function getStreams() {
  return siteData.streams;
}

export function getStreamBySlug(slug) {
  return siteData.streams.find((stream) => stream.slug === slug) || null;
}

export function getGeneralRules() {
  return siteData.rules.general;
}

export function getAdminDraftTournaments() {
  return [...getDraftTournaments()].sort(byDateAsc);
}

export function getAdminDraftTournamentBySlug(slug) {
  return getDraftTournaments().find((tournament) => tournament.slug === slug) || null;
}
