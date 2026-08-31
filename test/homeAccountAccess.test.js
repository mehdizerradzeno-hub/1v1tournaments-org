import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  normalizeTournamentAccountMode,
  readPasswordRecoveryFragment,
} from '../src/lib/accountConnect.js';

const homeSource = await readFile(new URL('../src/screens/HomeScreen.jsx', import.meta.url), 'utf8');
const nextSource = await readFile(new URL('../src/screens/NextScreen.jsx', import.meta.url), 'utf8');
const hubSource = await readFile(new URL('../src/components/hub-ui.jsx', import.meta.url), 'utf8');
const accountRouteSource = await readFile(new URL('../app/account.jsx', import.meta.url), 'utf8');
const accountScreenSource = await readFile(new URL('../src/screens/TournamentAccountScreen.jsx', import.meta.url), 'utf8');
const sharedAccountScreenSource = await readFile(new URL('../src/screens/SpadesAccountConnectScreen.jsx', import.meta.url), 'utf8');

test('Home always exposes the authoritative Shared Account control', () => {
  assert.match(homeSource, /accountHref="\/account"/);
  assert.match(hubSource, /fetchPlayerAccount/);
  assert.match(hubSource, /playerAccount/);
  assert.match(hubSource, /Sign in/i);
});

test('loading, empty, and live next-event states retain account access', () => {
  assert.equal(nextSource.match(/accountHref="\/account"/g)?.length, 3);
  assert.doesNotMatch(nextSource, /showHeader=\{false\}/);
  assert.match(nextSource, /No upcoming tournament is published yet/);
  assert.match(nextSource, /TournamentJourney/);
  assert.match(nextSource, /MasterTournamentCard/);
});

test('Tournament Hub account route reuses the existing authoritative account flow', () => {
  assert.match(accountRouteSource, /TournamentAccountScreen/);
  assert.match(accountScreenSource, /GameAccountConnectScreen/);
  assert.match(accountScreenSource, /SHARED_ACCOUNT_ACTIONS/);
  assert.match(accountScreenSource, /destination=\{TOURNAMENT_HOME_DESTINATION\}/);
  assert.match(accountScreenSource, /returnAfterSignOut/);
  assert.match(accountScreenSource, /useHubShell/);
  assert.match(sharedAccountScreenSource, /title="Profile"/);
  assert.match(sharedAccountScreenSource, /fetchPlayerAccount/);
  assert.match(sharedAccountScreenSource, /loginPlayerAccount/);
  assert.match(sharedAccountScreenSource, /logoutPlayerAccount/);
  assert.equal(normalizeTournamentAccountMode('reset'), 'reset');
  assert.deepEqual(
    readPasswordRecoveryFragment('#email=player%40example.com&token=opaque-token'),
    { email: 'player@example.com', token: 'opaque-token' },
  );
});

test('mobile header remains compact and exposes only one Sign Out action', () => {
  assert.match(hubSource, /const hasHydratedViewport = isHydrated && width > 0;/);
  assert.match(hubSource, /showTinyHeader = hasHydratedViewport && width < 520/);
  assert.equal(sharedAccountScreenSource.match(/'Sign Out'/g)?.length, 1);
});
