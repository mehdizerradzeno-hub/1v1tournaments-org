const sharedCheckIn = {
  title: 'Signup',
  status: 'Registration open',
  preview: '30 min early',
  window: 'Opens 30 minutes before the start time.',
  note: 'Submit the form once. The host uses this roster to generate your match link.',
  steps: [
    'Enter your player name and email.',
    'Wait for the host to publish the bracket.',
    'Open your Spades match link when the bracket is ready.',
  ],
};

const sharedBracket = {
  title: 'Bracket preview',
  note: 'The live bracket appears here after the host generates it from signups.',
  rounds: [
    {
      title: 'Round 1',
      matches: [
        {
          label: 'Match 1',
          teams: ['North Table', 'South Table'],
          note: 'Winner advances to the final table.',
        },
        {
          label: 'Match 2',
          teams: ['East Table', 'West Table'],
          note: 'Winner advances to the final table.',
        },
      ],
    },
    {
      title: 'Final table',
      matches: [
        {
          label: 'Championship',
          teams: ['Winner of Match 1', 'Winner of Match 2'],
          note: 'Champion is posted on the results page.',
        },
      ],
    },
  ],
};

export const siteData = {
  site: {
    name: '1v1 Tournaments',
    domain: '1v1tournaments.org',
    headline: 'Official organization website for 1v1 Tournaments.',
    tagline: 'Spades tournaments are live now, and Euchre is coming soon.',
    entryPolicy: 'Free entry, no buy-in, no wagering.',
    adminNote: 'Public schedules, stream URLs, and event copy are maintained here by hand. Player signups are stored by the Phase 1 roster backend.',
    contactEmail: 'hello@1v1tournaments.org',
    primaryGameSlug: 'spades',
    primaryTournamentSlug: 'spades-summer-series',
  },
  organization: {
    summary: '1v1 Tournaments is the public home for free-entry, skill-based card-game events.',
    mission: 'Give Spades a clean public launch site now and add Euchre and future games later without rebuilding the website.',
    focus: [
      'Spades tournaments and posted results',
      'Euchre coming soon',
      'Stream links, signups, replays, and tournament pages in one place',
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
    draftTournaments: [
      {
        slug: 'euchre-launch-night',
        gameSlug: 'euchre',
        title: 'Euchre Launch Night',
        badge: 'Admin draft',
        status: 'draft',
        date: '2026-09-05T19:00:00-04:00',
        timeZone: 'America/New_York',
        timeZoneLabel: 'ET',
        location: 'Online',
        format: 'To be announced',
        entryLine: 'Free entry, no buy-in, no wagering.',
        summary: 'Private draft placeholder for the first Euchre event.',
        detail: 'Keep this event hidden until the secure admin flow is ready.',
        callout: 'Admin-only draft event.',
        agenda: [
          { time: 'TBD', label: 'Check-in' },
          { time: 'TBD', label: 'Bracket start' },
        ],
        highlights: [
          'Hidden from public pages',
          'Reserved for future admin review',
        ],
        streamSlugs: [],
        links: [],
      },
    ],
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
      heroCopy: 'The /spades route is the launch point, with stream links, rules, and result notes in one clean card flow.',
      accent: '#D6A24E',
      featuredTournamentSlug: 'spades-summer-series',
      quickFacts: [
        { label: 'Entry', value: 'Free' },
        { label: 'Buy-in', value: 'None' },
        { label: 'Status', value: 'Active' },
      ],
      highlights: [
        'The /spades shortcut is the launch point for the hub.',
        'Rules, results, and live links all come from the same editable data file.',
        'The same structure can support future games without changing the layout.',
      ],
      ruleSections: [
        {
          title: 'Event setup',
          items: [
            'Spades is the first live game on the hub.',
            'Each tournament page shows the schedule, stream links, and result notes together.',
            'Admins can update copy and dates in this file without wiring a backend.',
          ],
        },
        {
          title: 'Match flow',
          items: [
            'Use the tournament page for check-in, start time, and format details.',
            'Results are posted after play ends and the results page updates from the same data source.',
            'The layout stays mobile-first for quick updates from a phone.',
          ],
        },
        {
          title: 'Future-ready model',
          items: [
            'New games only need another game object and related tournament entries.',
            'Future games are already reserved in the content structure.',
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
      summary: 'A reserved game slot for Euchre so the site can grow without a rebuild.',
      heroCopy: 'Euchre is coming soon. The route is ready, but no public tournaments are posted yet.',
      accent: '#6CC7FF',
      featuredTournamentSlug: null,
      quickFacts: [
        { label: 'Entry', value: 'Free' },
        { label: 'Buy-in', value: 'None' },
        { label: 'Status', value: 'Coming soon' },
      ],
      highlights: [
        'The same tournament page template will work for future Euchre events.',
        'Only Spades tournaments are public for now.',
        'The site is already prepared for Euchre without any production data connection.',
      ],
      ruleSections: [
        {
          title: 'Coming soon',
          items: [
            'Euchre will use the same dark, mobile-first card layout as the Spades pages.',
            'The first public event can be added from the shared content file without a backend.',
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
      entryLine: 'Free entry, no buy-in, no wagering.',
      summary: 'The launch event for the hub with live coverage and posted results.',
      detail: 'A focused showcase bracket with a clean event page, stream links, and a post-match summary.',
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
    {
      slug: 'spades-friday-night-cup',
      gameSlug: 'spades',
      title: 'Spades Friday Night Cup',
      badge: 'Weekly run',
      status: 'upcoming',
      date: '2026-08-01T19:00:00-04:00',
      timeZone: 'America/New_York',
      timeZoneLabel: 'ET',
      location: 'Online',
      format: 'Best-of-three final table',
      entryLine: 'Free entry, no buy-in, no wagering.',
      summary: 'A recurring Friday bracket with room for more rounds and more live coverage.',
      detail: 'This event is a placeholder example of how the hub can handle a regular series.',
      callout: 'Registration closes before the first round is seeded.',
      checkIn: sharedCheckIn,
      bracket: sharedBracket,
      agenda: [
        { time: '6:15 PM ET', label: 'Final check-in window' },
        { time: '7:00 PM ET', label: 'Bracket begins' },
        { time: 'Late night', label: 'Results posted' },
      ],
      highlights: [
        'Recurring event template',
        'Bracket updates from the same content file',
        'Easy to swap in future live links',
      ],
      streamSlugs: ['main-live', 'replay-archive'],
      links: [
        { label: 'Tournament page', href: '/tournaments/spades-friday-night-cup' },
        { label: 'Results', href: '/results' },
        { label: 'Watch live', href: '/live' },
      ],
    },
    {
      slug: 'spades-community-showcase',
      gameSlug: 'spades',
      title: 'Spades Community Showcase',
      badge: 'Watch party',
      status: 'upcoming',
      date: '2026-08-22T17:30:00-04:00',
      timeZone: 'America/New_York',
      timeZoneLabel: 'ET',
      location: 'Online',
      format: 'Showcase bracket',
      entryLine: 'Free entry, no buy-in, no wagering.',
      summary: 'A lighter event slot that keeps the stream layout ready for more games later.',
      detail: 'Use this event to test the content flow for a shorter showcase with a live audience.',
      callout: 'Results can be posted right after the final table ends.',
      checkIn: sharedCheckIn,
      bracket: sharedBracket,
      agenda: [
        { time: '5:00 PM ET', label: 'Stream opens' },
        { time: '5:30 PM ET', label: 'Showcase begins' },
        { time: 'After final table', label: 'Results posted' },
      ],
      highlights: [
        'Good slot for a shorter broadcast',
        'Reuses the same tournament template',
        'Ready for future game branding',
      ],
      streamSlugs: ['main-live', 'replay-archive'],
      links: [
        { label: 'Tournament page', href: '/tournaments/spades-community-showcase' },
        { label: 'Rules', href: '/rules' },
        { label: 'Results', href: '/results' },
      ],
    },
  ],
  results: [
    {
      slug: 'spades-preview-night',
      gameSlug: 'spades',
      tournamentSlug: 'spades-preview-night',
      title: 'Spades Preview Night',
      badge: 'Completed',
      status: 'complete',
      date: '2026-06-22',
      winner: 'North Table',
      score: '250-211',
      summary: 'A practice bracket used to validate the hub flow before the launch events.',
      placements: [
        { place: 1, name: 'North Table' },
        { place: 2, name: 'South Table' },
        { place: 3, name: 'East Table' },
      ],
      notes: [
        'The event page format held up well on mobile.',
        'Stream links and results copy were both easy to update.',
      ],
    },
    {
      slug: 'spades-stream-test',
      gameSlug: 'spades',
      tournamentSlug: 'spades-stream-test',
      title: 'Spades Stream Test',
      badge: 'Completed',
      status: 'complete',
      date: '2026-06-14',
      winner: 'South Table',
      score: '250-198',
      summary: 'A private test run for the live and replay links.',
      placements: [
        { place: 1, name: 'South Table' },
        { place: 2, name: 'West Table' },
      ],
      notes: [
        'The live link card is ready to swap to a real YouTube URL later.',
        'No backend work is required to update this result copy.',
      ],
    },
  ],
  streams: [
    {
      slug: 'main-live',
      label: 'Live table',
      title: 'Watch the Spades live table',
      href: 'https://www.youtube.com/@1v1Tournaments/live',
      description: 'Primary live coverage for Spades launch matches.',
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
          'The event pages are maintained by hand until live data is wired in later.',
        ],
      },
      {
        title: 'Admin workflow',
        items: [
          'Edit this file to change dates, links, and copy.',
          'Add another game object when a new game is ready.',
          'Add another tournament object whenever a new public event is scheduled, or keep a draft in the admin section first.',
        ],
      },
      {
        title: 'Site scope',
        items: [
          'The hub does not connect to production game databases yet.',
          'The current setup is intentionally simple so it can be maintained by hand.',
          'The same layout works for a future, data-backed version of the site.',
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
  return [...siteData.results].sort(byDateDesc);
}

export function getResultsForGame(gameSlug) {
  return getResults().filter((result) => result.gameSlug === gameSlug);
}

export function getResultByTournamentSlug(tournamentSlug) {
  return siteData.results.find((result) => result.tournamentSlug === tournamentSlug) || null;
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
