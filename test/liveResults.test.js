import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCompletedLiveResults,
  mergeHostedTournamentCatalog,
} from '../src/lib/liveResults.js';

const hostedTournament = {
  slug: 'spades-4-man-smoke',
  title: 'Spades 4-Man Smoke',
  gameSlug: 'spades',
  date: '2026-07-13T23:45:00.000Z',
  format: '4-player double-elimination bracket',
  location: 'Online',
  entryLine: 'Free entry.',
  hosted: true,
};

const completedBracket = {
  tournamentSlug: 'spades-4-man-smoke',
  status: 'complete',
  participantCount: 4,
  updatedAt: '2026-07-14T01:12:00.000Z',
  winner: {
    id: 'smoke-player-2',
    name: 'Smoke Player 2 (@smoke4m2)',
  },
  participants: [
    { id: 'smoke-player-1', seed: 1, name: 'Smoke Player 1', handle: '@smoke4m1' },
    { id: 'smoke-player-2', seed: 2, name: 'Smoke Player 2', handle: '@smoke4m2' },
    { id: 'smoke-player-3', seed: 3, name: 'Smoke Player 3', handle: '@smoke4m3' },
    { id: 'smoke-player-4', seed: 4, name: 'Smoke Player 4', handle: '@smoke4m4' },
  ],
  rounds: [
    {
      index: 1,
      title: 'Grand Final Reset',
      matches: [
        {
          id: 'spades-4-man-smoke-r5-m1',
          label: 'Reset Final',
          status: 'final',
          players: [
            { id: 'smoke-player-2', seed: 2, name: 'Smoke Player 2', handle: '@smoke4m2' },
            { id: 'smoke-player-3', seed: 3, name: 'Smoke Player 3', handle: '@smoke4m3' },
          ],
          winnerId: 'smoke-player-2',
          winnerName: 'Smoke Player 2 (@smoke4m2)',
          nextMatchId: null,
        },
      ],
    },
  ],
};

test('hosted completed brackets become live public results', () => {
  const results = buildCompletedLiveResults([hostedTournament], {
    'spades-4-man-smoke': completedBracket,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].tournamentSlug, 'spades-4-man-smoke');
  assert.equal(results[0].winner, 'Smoke Player 2 (@smoke4m2)');
  assert.equal(results[0].score, 'Champion');
  assert.deepEqual(
    results[0].placements.slice(0, 2).map((placement) => placement.name),
    ['Smoke Player 2 (@smoke4m2)', 'Smoke Player 3 (@smoke4m3)'],
  );
});

test('hosted catalog entries override seeded tournaments and deleted tombstones hide them', () => {
  const seeded = [
    { slug: 'spades-summer-series', title: 'Seeded Summer Series', gameSlug: 'spades' },
  ];
  const hosted = [
    { slug: 'spades-summer-series', deleted: true, status: 'deleted' },
    hostedTournament,
  ];

  assert.deepEqual(
    mergeHostedTournamentCatalog(hosted, seeded).map((tournament) => tournament.slug),
    ['spades-4-man-smoke'],
  );
});
