import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const nextScreenSource = await readFile(new URL('../src/screens/NextScreen.jsx', import.meta.url), 'utf8');
const leaguesScreenSource = await readFile(new URL('../src/screens/LeaguesScreen.jsx', import.meta.url), 'utf8');
const hubUiSource = await readFile(new URL('../src/components/hub-ui.jsx', import.meta.url), 'utf8');

test('Tournaments keeps platform navigation and routes empty-state players to active competition', () => {
  assert.doesNotMatch(nextScreenSource, /showNavigation=\{false\}/);
  assert.match(nextScreenSource, /View leagues/);
  assert.match(nextScreenSource, /League Seasons/);
  assert.match(hubUiSource, /Spades • Euchre • Competitive Play/);
});

test('public Leagues stays player-focused while host controls remain on the admin route', () => {
  assert.doesNotMatch(leaguesScreenSource, /PlayerRouteStrip/);
  assert.match(leaguesScreenSource, /const canManageLeague = Boolean\(isAdminRoute && account\?\.hostApproved\)/);
  assert.match(leaguesScreenSource, /accountHref="\/account"/);
  assert.match(leaguesScreenSource, /formatShortDate\(match\.scheduledFor\) \|\| 'TBD'/);
  assert.match(leaguesScreenSource, /canManageLeague && resultMatchId/);
  assert.match(leaguesScreenSource, /\{canManageLeague \? \(/);
});
