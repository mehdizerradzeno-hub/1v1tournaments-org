import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCheckInPath,
  getGamePath,
  getTournamentBySlug,
  getTournamentPath,
  siteData,
} from '../src/lib/siteData.js';

const spadesRouteFile = fileURLToPath(new URL('../app/spades.jsx', import.meta.url));
const euchreRouteFile = fileURLToPath(new URL('../app/euchre.jsx', import.meta.url));
const aboutRouteFile = fileURLToPath(new URL('../app/about.jsx', import.meta.url));
const contactRouteFile = fileURLToPath(new URL('../app/contact.jsx', import.meta.url));
const tournamentRouteFile = fileURLToPath(new URL('../app/tournaments/[slug].jsx', import.meta.url));
const checkInRouteFile = fileURLToPath(new URL('../app/check-in/[slug].jsx', import.meta.url));
const adminRouteFile = fileURLToPath(new URL('../app/admin.jsx', import.meta.url));
const adminScreenFile = fileURLToPath(new URL('../src/screens/AdminScreen.jsx', import.meta.url));
const signupFunctionFile = fileURLToPath(new URL('../netlify/functions/tournament-signup.mjs', import.meta.url));
const playerAccountFunctionFile = fileURLToPath(new URL('../netlify/functions/player-account.mjs', import.meta.url));
const accountUtilsFunctionFile = fileURLToPath(new URL('../netlify/functions/_account-utils.mjs', import.meta.url));
const adminRosterFunctionFile = fileURLToPath(new URL('../netlify/functions/admin-roster.mjs', import.meta.url));
const tournamentBracketFunctionFile = fileURLToPath(new URL('../netlify/functions/tournament-bracket.mjs', import.meta.url));
const tournamentMatchAccessFunctionFile = fileURLToPath(new URL('../netlify/functions/tournament-match-access.mjs', import.meta.url));
const tournamentPlayerStatusFunctionFile = fileURLToPath(new URL('../netlify/functions/tournament-player-status.mjs', import.meta.url));
const hostingClientFile = fileURLToPath(new URL('../src/lib/tournamentHostingClient.js', import.meta.url));

test('/spades stays wired to the dedicated Spades route file', () => {
  assert.equal(getGamePath('spades'), '/spades');
  assert.ok(existsSync(spadesRouteFile));
});

test('/euchre stays wired to the dedicated Euchre route file', () => {
  assert.equal(getGamePath('euchre'), '/euchre');
  assert.ok(existsSync(euchreRouteFile));
});

test('/about stays wired to the public organization page', () => {
  assert.ok(existsSync(aboutRouteFile));
});

test('/contact stays wired to the public contact page', () => {
  assert.ok(existsSync(contactRouteFile));
});

test('the featured tournament route stays wired to the Spades launch event', () => {
  const featuredSlug = siteData.site.primaryTournamentSlug;
  const tournament = getTournamentBySlug(featuredSlug);

  assert.equal(getTournamentPath(featuredSlug), '/tournaments/spades-summer-series');
  assert.ok(existsSync(tournamentRouteFile));
  assert.ok(tournament);
  assert.equal(tournament?.gameSlug, 'spades');
  assert.deepEqual(tournament?.streamSlugs, ['main-live', 'replay-archive']);
});

test('dynamic public routes declare static export params for Netlify deep links', () => {
  const tournamentRouteSource = readFileSync(tournamentRouteFile, 'utf8');
  const checkInRouteSource = readFileSync(checkInRouteFile, 'utf8');

  assert.match(tournamentRouteSource, /export function generateStaticParams/);
  assert.match(tournamentRouteSource, /siteData\.tournaments\.map/);
  assert.match(checkInRouteSource, /export function generateStaticParams/);
  assert.match(checkInRouteSource, /siteData\.tournaments\.map/);
});

test('the signup route stays wired to the public tournament path', () => {
  assert.equal(getCheckInPath('spades-summer-series'), '/check-in/spades-summer-series');
  assert.ok(existsSync(checkInRouteFile));
});

test('phase 1 signup capture and public counts stay wired through Netlify Functions and Blobs', () => {
  assert.ok(existsSync(signupFunctionFile));
  assert.ok(existsSync(playerAccountFunctionFile));
  assert.ok(existsSync(accountUtilsFunctionFile));
  assert.ok(existsSync(adminRosterFunctionFile));
  assert.ok(existsSync(tournamentBracketFunctionFile));
  assert.ok(existsSync(tournamentMatchAccessFunctionFile));
  assert.ok(existsSync(tournamentPlayerStatusFunctionFile));
  assert.ok(existsSync(hostingClientFile));

  const signupFunctionSource = readFileSync(signupFunctionFile, 'utf8');
  const playerAccountSource = readFileSync(playerAccountFunctionFile, 'utf8');
  const accountUtilsSource = readFileSync(accountUtilsFunctionFile, 'utf8');
  const adminRosterSource = readFileSync(adminRosterFunctionFile, 'utf8');
  const tournamentBracketSource = readFileSync(tournamentBracketFunctionFile, 'utf8');
  const tournamentMatchAccessSource = readFileSync(tournamentMatchAccessFunctionFile, 'utf8');
  const tournamentPlayerStatusSource = readFileSync(tournamentPlayerStatusFunctionFile, 'utf8');
  const hostingClientSource = readFileSync(hostingClientFile, 'utf8');

  assert.match(signupFunctionSource, /@netlify\/blobs/);
  assert.match(signupFunctionSource, /event\.httpMethod === 'GET'/);
  assert.match(signupFunctionSource, /signupCount/);
  assert.match(signupFunctionSource, /getAccountFromEvent/);
  assert.match(signupFunctionSource, /accountId/);
  assert.match(playerAccountSource, /createPasswordRecord/);
  assert.match(playerAccountSource, /sessionCookie/);
  assert.match(accountUtilsSource, /player-accounts/);
  assert.match(accountUtilsSource, /player-sessions/);
  assert.match(adminRosterSource, /@netlify\/blobs/);
  assert.match(adminRosterSource, /accountId/);
  assert.match(tournamentBracketSource, /tournament-brackets/);
  assert.match(tournamentBracketSource, /accountId/);
  assert.match(tournamentMatchAccessSource, /tournament-match-tickets/);
  assert.match(tournamentMatchAccessSource, /getAccountFromEvent/);
  assert.match(tournamentMatchAccessSource, /issue-ticket/);
  assert.match(tournamentMatchAccessSource, /verify-ticket/);
  assert.match(tournamentPlayerStatusSource, /getAccountFromEvent/);
  assert.match(tournamentPlayerStatusSource, /currentMatch/);
  assert.match(tournamentPlayerStatusSource, /ready-match/);
  assert.match(hostingClientSource, /fetchPlayerAccount/);
  assert.match(hostingClientSource, /createPlayerAccount/);
  assert.match(hostingClientSource, /fetchSignupSummary/);
  assert.match(hostingClientSource, /fetchTournamentPlayerStatus/);
  assert.match(hostingClientSource, /generateTournamentBracket/);
  assert.match(hostingClientSource, /fetchTournamentMatch/);
  assert.match(hostingClientSource, /issueTournamentMatchTicket/);
});

test('Spades match results can report winners through a narrow callback token', () => {
  const tournamentBracketSource = readFileSync(tournamentBracketFunctionFile, 'utf8');
  const readmeSource = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8');

  assert.match(tournamentBracketSource, /TOURNAMENT_MATCH_RESULT_TOKEN/);
  assert.match(tournamentBracketSource, /requireMatchReporter/);
  assert.match(tournamentBracketSource, /reportWinnerWithRetry/);
  assert.match(tournamentBracketSource, /publicMatchDetails/);
  assert.match(tournamentBracketSource, /resultCallback/);
  assert.match(tournamentBracketSource, /getTournamentSlug/);
  assert.match(tournamentBracketSource, /payload\.action === 'reset'/);
  assert.match(readmeSource, /Spades Match Result Callback/);
  assert.match(readmeSource, /GET https:\/\/1v1tournaments\.org\/\.netlify\/functions\/tournament-bracket\?matchId=/);
  assert.match(readmeSource, /"action": "report-winner"/);
});

test('the private admin route stays wired to the hub editor shell', () => {
  assert.ok(existsSync(adminRouteFile));
  assert.ok(existsSync(adminScreenFile));
  const adminScreenSource = readFileSync(adminScreenFile, 'utf8');
  const hostingClientSource = readFileSync(hostingClientFile, 'utf8');

  assert.match(adminScreenSource, /resetTournamentBracket/);
  assert.match(adminScreenSource, /handleCopyMatchCallback/);
  assert.match(adminScreenSource, /Run command center/);
  assert.match(adminScreenSource, /handleCopyPlayerInstructions/);
  assert.match(hostingClientSource, /resetTournamentBracket/);
});
