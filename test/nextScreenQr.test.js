import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const nextScreenFile = fileURLToPath(new URL('../src/screens/NextScreen.jsx', import.meta.url));

test('tournament discovery removes QR clutter from the mobile player path', () => {
  const source = readFileSync(nextScreenFile, 'utf8');

  assert.match(source, /TournamentJourney/);
  assert.match(source, /MasterTournamentCard/);
  assert.match(source, /TournamentDiscoveryList/);
  assert.doesNotMatch(source, /StreamQrGrid/);
  assert.doesNotMatch(source, /QR code for the next tournament signup/);
});
