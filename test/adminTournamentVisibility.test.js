import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ADMIN_EDIT_WINDOW_MS,
  isTournamentInAdminEditWindow,
  partitionAdminTournaments,
} from '../src/lib/adminTournamentVisibility.js';

const adminScreenFile = fileURLToPath(new URL('../src/screens/AdminScreen.jsx', import.meta.url));
const adminScreenSource = readFileSync(adminScreenFile, 'utf8');
const nowMs = Date.parse('2026-10-16T12:00:00.000Z');

test('admin edit window includes exactly seven days and moves older events to history', () => {
  const atBoundary = { slug: 'at-boundary', date: new Date(nowMs - ADMIN_EDIT_WINDOW_MS).toISOString() };
  const older = { slug: 'older', date: new Date(nowMs - ADMIN_EDIT_WINDOW_MS - 1).toISOString() };

  assert.equal(isTournamentInAdminEditWindow(atBoundary, { nowMs }), true);
  assert.equal(isTournamentInAdminEditWindow(older, { nowMs }), false);

  assert.deepEqual(
    partitionAdminTournaments([atBoundary, older, { slug: 'draft' }], { nowMs }),
    { current: [atBoundary, { slug: 'draft' }], previous: [older] },
  );
});

test('admin opens on current game-grouped events and leaves older events out of the host picker', () => {
  assert.match(adminScreenSource, /partitionAdminTournaments/);
  assert.match(adminScreenSource, /getInitialHostTournamentSlug/);
  assert.match(adminScreenSource, /TOURNAMENT_GAME_OPTIONS\.map/);
  assert.match(adminScreenSource, /New \{game\.label\} event/);
  assert.match(adminScreenSource, /No current \{game\.label\} events/);
  assert.match(adminScreenSource, /Past events stay in the public record, not in the host picker/);
  assert.doesNotMatch(adminScreenSource, /Previous tournaments \(\$\{previousTournaments\.length\}\)/);
  assert.equal((adminScreenSource.match(/<TournamentEventSelector/g) || []).length, 1);
  assert.match(adminScreenSource, /Choose Spades or Euchre first/);
});
