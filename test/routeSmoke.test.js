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
const signupFunctionFile = fileURLToPath(new URL('../netlify/functions/tournament-signup.mjs', import.meta.url));
const adminRosterFunctionFile = fileURLToPath(new URL('../netlify/functions/admin-roster.mjs', import.meta.url));
const tournamentBracketFunctionFile = fileURLToPath(new URL('../netlify/functions/tournament-bracket.mjs', import.meta.url));
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

test('the check-in placeholder route stays wired to the public tournament path', () => {
  assert.equal(getCheckInPath('spades-summer-series'), '/check-in/spades-summer-series');
  assert.ok(existsSync(checkInRouteFile));
});

test('phase 1 signup capture stays wired through Netlify Functions and Blobs', () => {
  assert.ok(existsSync(signupFunctionFile));
  assert.ok(existsSync(adminRosterFunctionFile));
  assert.ok(existsSync(tournamentBracketFunctionFile));
  assert.ok(existsSync(hostingClientFile));

  const signupFunctionSource = readFileSync(signupFunctionFile, 'utf8');
  const adminRosterSource = readFileSync(adminRosterFunctionFile, 'utf8');
  const tournamentBracketSource = readFileSync(tournamentBracketFunctionFile, 'utf8');
  const hostingClientSource = readFileSync(hostingClientFile, 'utf8');

  assert.match(signupFunctionSource, /@netlify\/blobs/);
  assert.match(adminRosterSource, /@netlify\/blobs/);
  assert.match(tournamentBracketSource, /tournament-brackets/);
  assert.match(hostingClientSource, /generateTournamentBracket/);
});

test('Spades match results can report winners through a narrow callback token', () => {
  const tournamentBracketSource = readFileSync(tournamentBracketFunctionFile, 'utf8');
  const readmeSource = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8');

  assert.match(tournamentBracketSource, /TOURNAMENT_MATCH_RESULT_TOKEN/);
  assert.match(tournamentBracketSource, /requireMatchReporter/);
  assert.match(tournamentBracketSource, /reportWinnerWithRetry/);
  assert.match(readmeSource, /Spades Match Result Callback/);
  assert.match(readmeSource, /"action": "report-winner"/);
});

test('the private admin route stays wired to the hub editor shell', () => {
  assert.ok(existsSync(adminRouteFile));
});
