import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import { ADMIN_COMPETITION_WORKSPACES, getAdminEntryView } from '../src/lib/adminNavigation.js';

const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('admin defaults to the dashboard and preserves existing private tournament game links', () => {
  assert.equal(getAdminEntryView(), 'dashboard');
  for (const game of ['euchre', 'gin', ['euchre'], ['gin']]) {
    assert.equal(getAdminEntryView({ game }), 'tournaments');
  }
  for (const game of ['', 'unknown', null]) assert.equal(getAdminEntryView({ game }), 'dashboard');
  for (const event of ['private-euchre-cup', ['private-euchre-cup']]) {
    assert.equal(getAdminEntryView({ event }), 'tournaments');
  }
  for (const event of ['', ' ', null, undefined]) assert.equal(getAdminEntryView({ event }), 'dashboard');
  const entry = source('app/admin.jsx');
  assert.match(entry, /getAdminEntryView\(query\).*<AdminScreen \/>.*<AdminHomeScreen \/>/);
  assert.match(source('app/admin/tournaments.jsx'), /screens\/AdminScreen\.jsx/);
});

test('tournaments and leagues have distinct existing workspace destinations', () => {
  assert.deepEqual(ADMIN_COMPETITION_WORKSPACES.map(item => item.id), ['tournaments', 'leagues']);
  const [tournaments, leagues] = ADMIN_COMPETITION_WORKSPACES;
  assert.equal(tournaments.href, '/admin/tournaments');
  assert.deepEqual(leagues.links.map(link => link.href), ['/admin/euchre-leagues', '/admin/leagues']);
  for (const href of [tournaments.href, ...leagues.links.map(link => link.href)]) {
    assert.ok(existsSync(new URL(`../app${href}.jsx`, import.meta.url)), href);
  }
});

test('dashboard is navigation only, with responsive cards and no competition writes', () => {
  const home = source('src/screens/AdminHomeScreen.jsx');
  assert.match(home, /ADMIN_COMPETITION_WORKSPACES\.map/);
  assert.match(home, /title="Site tools"/);
  assert.match(home, /flexWrap: 'wrap'/);
  assert.match(home, /flexBasis: 420, minWidth: 0/);
  assert.doesNotMatch(home, /fetch\(|useEffect|onPress=|tournamentHostingClient|euchreLeagueClient/);
  assert.match(source('src/screens/AdminScreen.jsx'), /label: 'Admin dashboard', href: '\/admin'/);
  assert.match(source('src/screens/EuchreLeaguesScreen.jsx'), /label: 'Admin dashboard', href: '\/admin'/);
  for (const file of ['CheckInScreen', 'TournamentScreen', 'EuchrePilotAdminScreen']) {
    assert.match(source(`src/screens/${file}.jsx`), /href="\/admin\/tournaments"/);
  }
});
