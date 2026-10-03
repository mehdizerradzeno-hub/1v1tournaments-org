import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const matrix = readFileSync(`${root}/docs/tournament-button-matrix.md`, 'utf8');
const hostingClient = readFileSync(`${root}/src/lib/tournamentHostingClient.js`, 'utf8');
const eventsFunction = readFileSync(`${root}/netlify/functions/tournament-events.mjs`, 'utf8');
const guestFunction = readFileSync(`${root}/netlify/functions/tournament-guest-access.mjs`, 'utf8');
const hubUi = readFileSync(`${root}/src/components/hub-ui.jsx`, 'utf8');

test('button matrix covers public, guest, and admin action contracts', () => {
  for (const label of [
    'Spades game card',
    'Euchre game card',
    'Join Tournament',
    'View Roster / Players tab',
    'View Bracket / Bracket tab',
    'Open My Match',
    'Unlock event',
    'Create / rotate guest key',
    'Revoke guest access',
    'Generate bracket',
    'Reset bracket',
    'Report winner',
  ]) {
    assert.match(matrix, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('guest key wiring is separate from admin token wiring', () => {
  assert.match(hostingClient, /tournament-guest-access/);
  assert.match(guestFunction, /action === 'exchange'/);
  assert.match(guestFunction, /action === 'create' \|\| action === 'rotate'/);
  assert.match(guestFunction, /action === 'revoke'/);
  assert.match(eventsFunction, /requireTournamentEventAccess/);
  assert.match(guestFunction, /requireTournamentAdmin/);
  assert.doesNotMatch(guestFunction, /guestKey.*TOURNAMENT_ADMIN_TOKEN/);
});

test('external link shell supports keyboard activation', () => {
  assert.match(hubUi, /onKeyDown=\{\(event\) =>/);
  assert.match(hubUi, /event\?\.key !== 'Enter'/);
  assert.match(hubUi, /Linking\.openURL\(href\)/);
});
