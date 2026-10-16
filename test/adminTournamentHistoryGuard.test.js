import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const protectedFunctionFiles = [
  '../netlify/functions/admin-roster.mjs',
  '../netlify/functions/tournament-bracket.mjs',
  '../netlify/functions/tournament-events.mjs',
  '../netlify/functions/tournament-settings.mjs',
];

test('every event-specific admin mutation API rejects read-only tournament history', () => {
  protectedFunctionFiles.forEach((relativePath) => {
    const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

    assert.match(source, /isTournamentReadOnlyHistory/);
    assert.match(source, /tournament_history_read_only/);
  });
});
