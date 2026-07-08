import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTournamentLeaderboard, summarizeTournamentLeaderboard } from '../src/lib/tournamentLeaderboard.js';

test('tournament leaderboard ranks hosted event performance separately', () => {
  const results = [
    {
      slug: 'spades-final',
      tournamentSlug: 'spades-final',
      gameSlug: 'spades',
      title: 'Spades Final Results',
      date: '2026-07-08T20:00:00-04:00',
      placements: [
        { place: 1, name: 'OgSoloSpader' },
        { place: 2, name: 'Mehdi Zerrad' },
      ],
      matchRecords: [
        { name: 'OgSoloSpader', wins: 1, losses: 0 },
        { name: 'Mehdi Zerrad', wins: 0, losses: 1 },
      ],
    },
    {
      slug: 'spades-night',
      tournamentSlug: 'spades-night',
      gameSlug: 'spades',
      title: 'Spades Night Results',
      date: '2026-07-09T20:00:00-04:00',
      placements: [
        { place: 1, name: 'Mehdi Zerrad' },
        { place: 2, name: 'OgSoloSpader' },
      ],
      matchRecords: [
        { name: 'Mehdi Zerrad', wins: 2, losses: 0 },
        { name: 'OgSoloSpader', wins: 1, losses: 1 },
      ],
    },
  ];

  const leaderboard = buildTournamentLeaderboard(results);

  assert.equal(leaderboard.length, 2);
  assert.equal(leaderboard[0].name, 'Mehdi Zerrad');
  assert.equal(leaderboard[0].tournamentWins, 1);
  assert.equal(leaderboard[0].finalsMade, 2);
  assert.equal(leaderboard[0].matchWins, 2);
  assert.equal(leaderboard[0].matchLosses, 1);
  assert.equal(leaderboard[0].winRate, 67);
  assert.deepEqual(leaderboard[0].gameSlugs, ['spades']);

  const summary = summarizeTournamentLeaderboard(leaderboard, results);
  assert.equal(summary.playerCount, 2);
  assert.equal(summary.eventCount, 2);
  assert.equal(summary.gameCount, 1);
  assert.equal(summary.topPlayer, 'Mehdi Zerrad');
});

test('tournament leaderboard can filter by game', () => {
  const results = [
    {
      slug: 'spades-final',
      gameSlug: 'spades',
      title: 'Spades Final Results',
      date: '2026-07-08T20:00:00-04:00',
      placements: [{ place: 1, name: 'Spades Player' }],
    },
    {
      slug: 'euchre-final',
      gameSlug: 'euchre',
      title: 'Euchre Final Results',
      date: '2026-07-09T20:00:00-04:00',
      placements: [{ place: 1, name: 'Euchre Player' }],
    },
  ];

  const spadesOnly = buildTournamentLeaderboard(results, { gameSlug: 'spades' });

  assert.equal(spadesOnly.length, 1);
  assert.equal(spadesOnly[0].name, 'Spades Player');
  assert.equal(spadesOnly[0].eventsPlayed, 1);
});
