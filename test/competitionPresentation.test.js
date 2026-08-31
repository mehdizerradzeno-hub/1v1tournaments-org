import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const nextScreenSource = await readFile(new URL('../src/screens/NextScreen.jsx', import.meta.url), 'utf8');
const leaguesScreenSource = await readFile(new URL('../src/screens/LeaguesScreen.jsx', import.meta.url), 'utf8');
const tournamentScreenSource = await readFile(new URL('../src/screens/TournamentScreen.jsx', import.meta.url), 'utf8');
const hubUiSource = await readFile(new URL('../src/components/hub-ui.jsx', import.meta.url), 'utf8');

test('Tournaments keeps platform navigation and routes empty-state players to active competition', () => {
  assert.doesNotMatch(nextScreenSource, /showNavigation=\{false\}/);
  assert.match(nextScreenSource, /View leagues/);
  assert.match(nextScreenSource, /Join league play/);
  assert.match(nextScreenSource, /View past results/);
  assert.match(nextScreenSource, /Get event alerts/);
  assert.match(nextScreenSource, /TournamentJourney/);
  assert.match(nextScreenSource, /MasterTournamentCard/);
  assert.match(nextScreenSource, /TournamentDiscoveryList/);
  assert.match(hubUiSource, /Spades • Euchre • Competitive Play/);
  assert.match(nextScreenSource, /accountHref="\/account"/);
});

test('public Leagues stays player-focused while host controls remain on the admin route', () => {
  assert.doesNotMatch(leaguesScreenSource, /PlayerRouteStrip/);
  assert.match(leaguesScreenSource, /const canManageLeague = Boolean\(isAdminRoute && account\?\.hostApproved\)/);
  assert.match(leaguesScreenSource, /accountHref="\/account"/);
  assert.match(leaguesScreenSource, /formatShortDate\(match\.scheduledFor\) \|\| 'TBD'/);
  assert.match(leaguesScreenSource, /canManageLeague && resultMatchId/);
  assert.match(leaguesScreenSource, /\{canManageLeague \? \(/);
});

test('Leagues presents compact competition tabs and honest registration actions', () => {
  assert.match(leaguesScreenSource, /const LEAGUE_VIEWS = \[/);
  assert.match(leaguesScreenSource, /id: 'overview', label: 'Overview'/);
  assert.match(leaguesScreenSource, /Season overview/);
  assert.match(leaguesScreenSource, /Season finish/);
  assert.match(leaguesScreenSource, /accessibilityRole="tab"/);
  assert.match(leaguesScreenSource, /handleTabKeyNavigation/);
  assert.match(leaguesScreenSource, /handleRetryLoad/);
  assert.match(leaguesScreenSource, /Browse tournaments/);
  assert.match(leaguesScreenSource, /Leave Waitlist/);
  assert.match(leaguesScreenSource, /Registration Closed/);
  assert.match(leaguesScreenSource, /Join Waitlist/);
  assert.match(leaguesScreenSource, /result\.waitlisted \? 'Added to the league waitlist\.'/);
  assert.match(leaguesScreenSource, /leagues\.length > 1/);
  assert.match(leaguesScreenSource, /accessibilityRole="progressbar"/);
  assert.match(leaguesScreenSource, /const registrationSummary = !league\?\.registrationOpen/);
  assert.match(leaguesScreenSource, /canManageLeague \? <Text style=\{styles\.listMeta\}>Match ID:/);
});

test('Tournament detail uses accessible, shareable competition tabs', () => {
  assert.match(tournamentScreenSource, /label: 'Schedule & rules'/);
  assert.match(tournamentScreenSource, /id: 'results', label: 'Results'/);
  assert.match(tournamentScreenSource, /accessibilityRole="tablist"/);
  assert.match(tournamentScreenSource, /accessibilityRole="tab"/);
  assert.match(tournamentScreenSource, /accessibilityRole="tabpanel"/);
  assert.match(tournamentScreenSource, /aria-selected=\{selected\}/);
  assert.match(tournamentScreenSource, /globalThis\.history\.replaceState/);
  assert.match(tournamentScreenSource, /nativeID="results"/);
  assert.match(tournamentScreenSource, /aria-level=\{1\}/);
});
