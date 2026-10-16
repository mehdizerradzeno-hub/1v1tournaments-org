import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  getPublicBracketPresentation,
  getPublicChampionLabel,
  getPublicMatchPlayerLabel,
  getPublicMatchWinnerLabel,
  isPublicMatchWinner,
} from '../src/lib/publicBracketPresentation.js';

test('public bracket labels distinguish preview, published, live, and complete', () => {
  assert.deepEqual(getPublicBracketPresentation(), { state: 'preview', label: 'Bracket preview', statusLabel: 'Preview' });
  assert.deepEqual(getPublicBracketPresentation({ hasBracket: true }), { state: 'published', label: 'Published bracket', statusLabel: 'Published' });
  assert.deepEqual(getPublicBracketPresentation({ hasBracket: true, isLive: true }), { state: 'live', label: 'Live bracket', statusLabel: 'Live' });
  assert.deepEqual(getPublicBracketPresentation({ hasBracket: true, isComplete: true, isLive: true }), { state: 'complete', label: 'Final bracket', statusLabel: 'Complete' });
  assert.equal(getPublicBracketPresentation({ isComplete: true, isLive: true }).state, 'preview');
});

test('same-name players are distinguished by participant ID for winner highlighting', () => {
  const players = [
    { id: 'signup-north', name: 'Alex' },
    { id: 'signup-south', name: 'Alex' },
  ];
  const match = { players, winnerId: 'signup-south', winnerName: 'Alex' };

  assert.equal(getPublicMatchPlayerLabel(players[0]), 'Alex');
  assert.equal(getPublicMatchPlayerLabel(players[1]), 'Alex');
  assert.equal(isPublicMatchWinner(match, 0), false);
  assert.equal(isPublicMatchWinner(match, 1), true);
  assert.equal(isPublicMatchWinner({ ...match, winnerId: '', winnerName: 'Alex' }, 0), false);
  assert.equal(isPublicMatchWinner({ ...match, winnerId: '', winnerName: 'Alex' }, 1), false);
  assert.equal(isPublicMatchWinner({ ...match, winnerId: '', winnerName: '' }, 0), false);
  assert.equal(isPublicMatchWinner({ players: [null, players[1]], winnerId: 'signup-south' }, 0), false);
  assert.equal(isPublicMatchWinner({ players: [players[0], { ...players[1], name: 'Bailey' }], winnerName: 'Bailey' }, 1), true);
  assert.equal(getPublicMatchWinnerLabel({ ...match, players: players.map((player, index) => ({ ...player, seed: index + 1 })) }), 'Alex · Seed #2');
  assert.equal(getPublicMatchWinnerLabel({ ...match, winnerId: '' }), 'Alex (identity not recorded)');
  assert.equal(getPublicChampionLabel({ participants: players.map((player, index) => ({ ...player, seed: index + 1 })), winner: { id: 'signup-south', name: 'Alex' } }), 'Alex · Seed #2');
  assert.equal(getPublicChampionLabel({ participants: [players[0], { ...players[1], name: 'Bailey' }], winner: { id: 'signup-south', name: 'Bailey' } }), 'Bailey');
});

test('tournament bracket heading, format and roster share the same presentation labels', async () => {
  const source = await readFile(new URL('../src/screens/TournamentScreen.jsx', import.meta.url), 'utf8');

  assert.match(source, /getPublicBracketPresentation\(\{/);
  assert.match(source, /isWinner: isPublicMatchWinner\(match, index\)/);
  assert.match(source, /getPublicChampionLabel\(bracket\)/);
  assert.match(source, /getPublicMatchWinnerLabel\(match\)/);
  assert.match(source, /const bracketSectionTitle = bracketPresentation\.label;/);
  assert.match(source, /\{bracketPresentation\.statusLabel\}<\/Badge>/);
  assert.match(source, /seeded in the \$\{bracketPresentation\.label\.toLowerCase\(\)\}/);
  assert.match(source, /\$\{bracketPresentation\.label\}: \$\{bracketSizeLabel/);
  assert.doesNotMatch(source, /seeded in the live bracket|\? `Live bracket:|liveBracket \? 'live bracket'/);
});
