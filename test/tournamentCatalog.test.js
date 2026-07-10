import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTournamentRecord,
  mergeTournamentLists,
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

test('deleted hosted tournament tombstones hide seeded defaults', () => {
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
    ['10-pm-4-man-spades-test'],
  );
});

test('tournament slugs stay URL safe', () => {
  assert.equal(slugifyTournamentTitle('Friday Night: Spades & Chill!'), 'friday-night-spades-and-chill');
});
