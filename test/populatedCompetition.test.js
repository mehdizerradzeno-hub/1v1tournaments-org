import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createPopulatedCompetitionResults, populatedFixturePlayers } from './fixtures/populatedCompetition.js';
import { buildTournamentLeaderboard, summarizeTournamentLeaderboard } from '../src/lib/tournamentLeaderboard.js';

const leaderboardScreenSource = await readFile(new URL('../src/screens/LeaderboardScreen.jsx', import.meta.url), 'utf8');
const resultsScreenSource = await readFile(new URL('../src/screens/ResultsScreen.jsx', import.meta.url), 'utf8');
const hubUiSource = await readFile(new URL('../src/components/hub-ui.jsx', import.meta.url), 'utf8');

test('rankings remain deterministic with 32 players across 18 populated events', () => {
  const results = createPopulatedCompetitionResults();
  const leaderboard = buildTournamentLeaderboard(results);
  const summary = summarizeTournamentLeaderboard(leaderboard, results);

  assert.equal(results.length, 18);
  assert.equal(leaderboard.length, populatedFixturePlayers.length);
  assert.equal(summary.eventCount, 18);
  assert.equal(summary.gameCount, 2);
  assert.deepEqual(leaderboard.map((entry) => entry.rank), Array.from({ length: 32 }, (_, index) => index + 1));
  assert.ok(leaderboard.every((entry, index) => (
    index === 0 || leaderboard[index - 1].tournamentWins >= entry.tournamentWins
  )));
  assert.ok(leaderboard.every((entry) => entry.eventsPlayed > 0));
  assert.ok(leaderboard.some((entry) => entry.name === populatedFixturePlayers[0]));
});

test('rankings merge whitespace and casing variants without double-counting one event', () => {
  const results = [{
    slug: 'fixture-normalization',
    tournamentSlug: 'fixture-normalization',
    gameSlug: 'spades',
    title: 'Fixture Normalization Results',
    date: '2026-08-22T20:00:00.000Z',
    placements: [
      { place: 1, name: 'Fixture   Player' },
      { place: 2, name: ' fixture player ' },
    ],
    matchRecords: [
      { name: 'FIXTURE PLAYER', wins: 1, losses: 0 },
    ],
  }];

  const leaderboard = buildTournamentLeaderboard(results);

  assert.equal(leaderboard.length, 1);
  assert.equal(leaderboard[0].name, 'Fixture Player');
  assert.equal(leaderboard[0].eventsPlayed, 1);
  assert.equal(leaderboard[0].tournamentWins, 1);
  assert.equal(leaderboard[0].matchWins, 1);
});

test('rankings and results cards preserve responsive wrapping under populated content', () => {
  assert.match(leaderboardScreenSource, /rowCard:\s*\{[\s\S]*?flexWrap: 'wrap'/);
  assert.match(leaderboardScreenSource, /playerBlock:\s*\{[\s\S]*?flex: 1,[\s\S]*?minWidth: 220/);
  assert.match(leaderboardScreenSource, /rowStats:\s*\{[\s\S]*?flexWrap: 'wrap'/);
  assert.match(resultsScreenSource, /filteredResults\.map/);
  assert.match(hubUiSource, /resultScoreRow:\s*\{[\s\S]*?flexWrap: 'wrap'/);
  assert.match(hubUiSource, /placementName:\s*\{[\s\S]*?flex: 1/);
  assert.match(hubUiSource, /placement, index/);
});
