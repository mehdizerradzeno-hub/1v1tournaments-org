import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTournamentRecord,
  getActiveOrFutureTournaments,
  getNextFutureTournament,
  getNextPublicTournament,
  getPublicTournamentCatalog,
  getPublicTournamentFeedStatus,
  mergeTournamentLists,
  normalizeTournamentGameSlug,
  slugifyTournamentTitle,
} from '../src/lib/tournamentCatalog.js';
import { canGenerateTournamentMode, getTournamentMode, TOURNAMENT_MODES } from '../src/lib/tournamentModes.js';

test('hosted tournament records get the full public page shape from simple input', () => {
  const tournament = createTournamentRecord({
    title: 'Spades Friday Night Cup',
    date: '2026-07-24T20:00:00-04:00',
    rosterCap: '16',
    minimumPlayers: '2',
  });

  assert.equal(tournament.slug, 'spades-friday-night-cup');
  assert.equal(tournament.gameSlug, 'spades');
  assert.equal(tournament.rosterCap, 16);
  assert.equal(tournament.minimumPlayers, 2);
  assert.equal(tournament.mode, 'single-elimination');
  assert.equal(tournament.status, 'upcoming');
  assert.equal(tournament.links[0].href, '/tournaments/spades-friday-night-cup');
  assert.match(tournament.bracketFlexPolicy, /Advertised 16-player bracket/);
});

test('tournament game defaults to Spades and preserves explicit canonical games', () => {
  assert.equal(normalizeTournamentGameSlug(), 'spades');
  assert.equal(normalizeTournamentGameSlug('spades'), 'spades');
  assert.equal(normalizeTournamentGameSlug('euchre'), 'euchre');
  assert.equal(normalizeTournamentGameSlug('hearts'), 'spades');
  assert.equal(createTournamentRecord({ title: 'Legacy event' }).gameSlug, 'spades');
  assert.equal(createTournamentRecord({ title: 'Spades event', gameSlug: 'spades' }).gameSlug, 'spades');
  assert.equal(createTournamentRecord({ title: 'Euchre event', gameSlug: 'euchre' }).gameSlug, 'euchre');
});

test('generated bracket policy copy updates when hosted event capacity changes', () => {
  const tournament = createTournamentRecord({
    title: 'Four Player Spades',
    date: '2026-07-24T20:00:00-04:00',
    rosterCap: 4,
    minimumPlayers: 4,
    mode: 'four-player-double-elimination',
    bracketFlexPolicy: 'Advertised 8-player bracket. Actual bracket flexes to the checked-in roster: runs with 2+ players and fills open seats with byes.',
  });

  assert.equal(tournament.rosterCap, 4);
  assert.equal(tournament.minimumPlayers, 4);
  assert.match(tournament.bracketFlexPolicy, /Advertised 4-player bracket/);
  assert.match(tournament.bracketFlexPolicy, /runs with 4\+ players/);
});

test('custom bracket policy copy is preserved', () => {
  const tournament = createTournamentRecord({
    title: 'Custom Copy Cup',
    date: '2026-07-24T20:00:00-04:00',
    rosterCap: 4,
    minimumPlayers: 4,
    bracketFlexPolicy: 'Bring exactly four players. The host may add alternates manually.',
  });

  assert.equal(tournament.bracketFlexPolicy, 'Bring exactly four players. The host may add alternates manually.');
});

test('recommended tournament modes expose wired and planned generation state', () => {
  const values = TOURNAMENT_MODES.map((mode) => mode.value);
  const doubleElim = getTournamentMode('four-player-double-elimination');
  const twoLife = getTournamentMode('three-player-two-life');
  const bestOf3 = getTournamentMode('best-of-3-single-elimination');

  assert.ok(values.includes('single-elimination'));
  assert.ok(values.includes('best-of-3-single-elimination'));
  assert.ok(values.includes('round-robin'));
  assert.ok(values.includes('king-of-the-table'));
  assert.ok(values.includes('four-player-double-elimination'));
  assert.ok(values.includes('three-player-two-life'));
  assert.equal(doubleElim.rosterCap, 4);
  assert.equal(doubleElim.minimumPlayers, 4);
  assert.equal(doubleElim.format, '4-player double-elimination bracket');
  assert.equal(twoLife.rosterCap, 3);
  assert.equal(twoLife.minimumPlayers, 3);
  assert.equal(twoLife.format, '3-player two-life ladder');
  assert.equal(bestOf3.format, 'Best-of-3 single-elimination bracket');
  assert.equal(canGenerateTournamentMode('single-elimination'), true);
  assert.equal(canGenerateTournamentMode('four-player-double-elimination'), true);
  assert.equal(canGenerateTournamentMode('three-player-two-life'), true);
  assert.equal(canGenerateTournamentMode('round-robin'), false);
});

test('hosted tournaments merge over seeded tournaments by slug', () => {
  const merged = mergeTournamentLists(
    [
      createTournamentRecord({
        title: 'Spades Summer Series',
        slug: 'spades-summer-series',
        date: '2026-07-18T18:00:00-04:00',
        rosterCap: 8,
      }),
    ],
    [
      {
        title: 'Spades Summer Series Reloaded',
        slug: 'spades-summer-series',
        date: '2026-07-25T18:00:00-04:00',
        rosterCap: 16,
      },
      {
        title: 'Spades Midnight Cup',
        date: '2026-07-19T00:00:00-04:00',
      },
    ],
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].slug, 'spades-midnight-cup');
  assert.equal(merged[1].title, 'Spades Summer Series Reloaded');
  assert.equal(merged[1].rosterCap, 16);
});

test('plain hosted tournament tombstones restore seeded defaults', () => {
  const merged = mergeTournamentLists(
    [
      createTournamentRecord({
        title: 'Spades Summer Series',
        slug: 'spades-summer-series',
        date: '2026-07-18T18:00:00-04:00',
      }),
      createTournamentRecord({
        title: '10 PM 4-Man Spades Test',
        slug: '10-pm-4-man-spades-test',
        date: '2026-07-10T22:00:00-04:00',
        rosterCap: 4,
        minimumPlayers: 4,
        mode: 'four-player-double-elimination',
      }),
    ],
    [
      {
        slug: 'spades-summer-series',
        deleted: true,
        status: 'deleted',
      },
    ],
  );

  assert.deepEqual(
    merged.map((tournament) => tournament.slug),
    ['10-pm-4-man-spades-test', 'spades-summer-series'],
  );
});

test('explicit hideSeeded tournament tombstones hide seeded defaults', () => {
  const merged = mergeTournamentLists(
    [
      createTournamentRecord({
        title: 'Spades Summer Series',
        slug: 'spades-summer-series',
        date: '2026-07-18T18:00:00-04:00',
      }),
      createTournamentRecord({
        title: '10 PM 4-Man Spades Test',
        slug: '10-pm-4-man-spades-test',
        date: '2026-07-10T22:00:00-04:00',
        rosterCap: 4,
        minimumPlayers: 4,
        mode: 'four-player-double-elimination',
      }),
    ],
    [
      {
        slug: 'spades-summer-series',
        deleted: true,
        hideSeeded: true,
        status: 'deleted',
      },
    ],
  );

  assert.deepEqual(
    merged.map((tournament) => tournament.slug),
    ['10-pm-4-man-spades-test'],
  );
});

test('public tournament selection ignores expired events without a live bracket', () => {
  const tournaments = [
    createTournamentRecord({
      title: 'Past Test',
      slug: 'past-test',
      date: '2026-07-10T20:00:00-04:00',
    }),
    createTournamentRecord({
      title: 'Future Cup',
      slug: 'future-cup',
      date: '2026-07-24T20:00:00-04:00',
    }),
  ];
  const nowMs = new Date('2026-07-12T12:00:00-04:00').getTime();

  assert.deepEqual(
    getActiveOrFutureTournaments(tournaments, {}, nowMs).map((tournament) => tournament.slug),
    ['future-cup'],
  );
  assert.equal(getNextPublicTournament(tournaments, {}, nowMs)?.slug, 'future-cup');
  assert.equal(getNextFutureTournament(tournaments, nowMs)?.slug, 'future-cup');
});

test('public tournament selection keeps expired events only while their bracket is live', () => {
  const tournaments = [
    createTournamentRecord({
      title: 'Live Past Test',
      slug: 'live-past-test',
      date: '2026-07-10T20:00:00-04:00',
    }),
    createTournamentRecord({
      title: 'Future Cup',
      slug: 'future-cup',
      date: '2026-07-24T20:00:00-04:00',
    }),
  ];
  const nowMs = new Date('2026-07-12T12:00:00-04:00').getTime();

  assert.deepEqual(
    getActiveOrFutureTournaments(
      tournaments,
      {
        'live-past-test': {
          bracket: { status: 'published' },
        },
      },
      nowMs,
    ).map((tournament) => tournament.slug),
    ['live-past-test', 'future-cup'],
  );
});

test('completed expired brackets are not treated as upcoming', () => {
  const tournaments = [
    createTournamentRecord({
      title: 'Complete Past Test',
      slug: 'complete-past-test',
      date: '2026-07-10T20:00:00-04:00',
    }),
  ];
  const nowMs = new Date('2026-07-12T12:00:00-04:00').getTime();

  assert.deepEqual(
    getActiveOrFutureTournaments(
      tournaments,
      {
        'complete-past-test': {
          bracket: { status: 'complete' },
        },
      },
      nowMs,
    ),
    [],
  );
  assert.equal(getNextPublicTournament(tournaments, {}, nowMs), null);
});

test('API-derived live tournaments stay public before bracket hydration', () => {
  const tournaments = [
    createTournamentRecord({
      title: 'Live Hosted Cup',
      slug: 'live-hosted-cup',
      date: '2026-07-10T20:00:00-04:00',
      status: 'live',
    }),
    createTournamentRecord({
      title: 'Future Cup',
      slug: 'future-cup',
      date: '2026-07-24T20:00:00-04:00',
    }),
  ];
  const nowMs = new Date('2026-07-12T12:00:00-04:00').getTime();

  assert.deepEqual(
    getActiveOrFutureTournaments(tournaments, {}, nowMs).map((tournament) => tournament.slug),
    ['live-hosted-cup', 'future-cup'],
  );
});

test('a completed hydrated bracket overrides a stale live catalog status', () => {
  const tournament = createTournamentRecord({
    title: 'Completed Hosted Cup',
    slug: 'completed-hosted-cup',
    date: '2026-07-10T20:00:00-04:00',
    status: 'live',
  });
  const nowMs = new Date('2026-07-12T12:00:00-04:00').getTime();

  assert.deepEqual(
    getActiveOrFutureTournaments(
      [tournament],
      {
        'completed-hosted-cup': {
          bracket: { status: 'complete' },
        },
      },
      nowMs,
    ),
    [],
  );
});

test('public catalog merges hosted upcoming and live events over seeded records', () => {
  const catalog = getPublicTournamentCatalog(
    [
      createTournamentRecord({
        title: 'Expired Seeded Event',
        slug: 'expired-seeded-event',
        date: '2026-07-10T20:00:00-04:00',
      }),
    ],
    [
      {
        title: 'Rudino Hosted Event',
        slug: 'rudino-hosted-event',
        date: '2026-07-29T19:00:00-04:00',
        status: 'upcoming',
      },
      {
        title: 'Live Hosted Event',
        slug: 'live-hosted-event',
        date: '2026-07-11T19:00:00-04:00',
        status: 'live',
      },
      {
        title: 'Completed Hosted Event',
        slug: 'completed-hosted-event',
        date: '2026-07-09T19:00:00-04:00',
        status: 'complete',
      },
    ],
  );

  assert.deepEqual(
    catalog.map((tournament) => tournament.slug),
    ['expired-seeded-event', 'live-hosted-event', 'rudino-hosted-event'],
  );
});

test('public tournament feed distinguishes loading, failure, empty, ready, and stale data', () => {
  assert.equal(getPublicTournamentFeedStatus(), 'loading');
  assert.equal(getPublicTournamentFeedStatus({ loaded: true, error: 'offline' }), 'error');
  assert.equal(getPublicTournamentFeedStatus({ loaded: true }), 'empty');
  assert.equal(getPublicTournamentFeedStatus({ loaded: true, tournament: { slug: 'cup' } }), 'ready');
  assert.equal(
    getPublicTournamentFeedStatus({
      loaded: true,
      error: 'refresh failed',
      tournament: { slug: 'cup' },
    }),
    'stale',
  );
});

test('tournament slugs stay URL safe', () => {
  assert.equal(slugifyTournamentTitle('Friday Night: Spades & Chill!'), 'friday-night-spades-and-chill');
});
