import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildBroadcastBracketModel } from '../src/lib/broadcastBracketPresentation.js';

const event = {
  slug: 'reddit-sunday-spades-20260816',
  title: 'Reddit Sunday Spades Tournament',
  badge: 'Reddit weekly',
  gameSlug: 'spades',
  status: 'upcoming',
  registrationStatus: 'open',
  rosterCap: 8,
  date: '2026-08-16T22:00:00.000Z',
  timeZoneLabel: 'ET',
  entryLine: 'Free entry, no buy-in, no wagering.',
};

function player(id, seed, name) {
  return { id, seed, name, canonicalAccountId: `private-${id}`, email: `${id}@example.test` };
}

function eightPlayerBracket() {
  const players = Array.from({ length: 8 }, (_, index) => player(`p${index + 1}`, index + 1, `Player ${index + 1}`));
  return {
    status: 'live',
    gameSlug: 'spades',
    participantCount: 8,
    participants: players,
    rounds: [
      { title: 'Round 1', matches: Array.from({ length: 4 }, (_, index) => ({ id: `q${index}`, label: `Match ${index + 1}`, status: 'final', players: players.slice(index * 2, index * 2 + 2), winnerId: players[index * 2].id, winnerName: players[index * 2].name, nextMatchId: `s${Math.floor(index / 2)}` })) },
      { title: 'Round 2', matches: [
        { id: 's0', label: 'Match 5', status: 'ready', players: [players[0], players[2]], nextMatchId: 'f0' },
        { id: 's1', label: 'Match 6', status: 'ready', players: [players[4], players[6]], nextMatchId: 'f0' },
      ] },
      { title: 'Final', matches: [{ id: 'f0', label: 'Match 7', status: 'pending', players: [] }] },
    ],
  };
}

test('broadcast model presents an authentic populated eight-player bracket without private identity fields', () => {
  const model = buildBroadcastBracketModel({ event, bracket: eightPlayerBracket() });
  assert.deepEqual(model.rounds.map((round) => round.title), ['Quarterfinals', 'Semifinals', 'Championship']);
  assert.equal(model.rounds[0].matches.length, 4);
  assert.equal(model.rounds[1].matches[0].players[0].winner, false);
  assert.equal(model.series, 'Reddit Community Cup');
  assert.equal(JSON.stringify(model).includes('canonicalAccountId'), false);
  assert.equal(JSON.stringify(model).includes('@example.test'), false);
  assert.equal(JSON.stringify(model).includes('private-p1'), false);
  assert.equal(model.featured.kind, 'featured-match');
  assert.equal(model.featured.title, 'Player 1 vs Player 3');
  assert.equal(model.featured.detail, 'Winner advances to the next round');
});

test('broadcast model preserves byes, TBD slots, winners, and completed champion state', () => {
  const bracket = eightPlayerBracket();
  bracket.rounds[0].matches[0] = { label: 'Match 1', status: 'final', players: [player('p1', 1, 'Top Seed')], winnerId: 'p1', winnerName: 'Top Seed', nextMatchId: 's0' };
  bracket.status = 'complete';
  bracket.winner = { ...player('p1', 1, 'Top Seed (@top-seed)'), handle: '@top-seed' };
  bracket.rounds[2].matches[0] = {
    label: 'Match 7',
    status: 'final',
    players: [player('p1', 1, 'Top Seed (@top-seed)'), player('p2', 2, 'Finalist')],
    winnerId: 'p1',
    winnerName: 'Top Seed (@top-seed)',
    completion: { scores: { north: 11, south: 7 } },
  };
  const model = buildBroadcastBracketModel({ event: { ...event, status: 'complete' }, bracket });
  assert.equal(model.rounds[0].matches[0].players[1].name, 'Bye');
  assert.equal(model.rounds[2].matches[0].players[0].score, 11);
  assert.equal(model.rounds[2].matches[0].players[0].name, 'Top Seed (@top-seed)');
  assert.equal(model.featured.kind, 'champion');
  assert.equal(model.featured.title, 'Top Seed');
  assert.equal(model.featured.detail, 'Final opponent: Finalist');
  assert.notEqual(model.featured.title, model.featured.detail.replace('Final opponent: ', ''));
  assert.doesNotMatch(model.featured.title, /top-seed/i);
  assert.equal(model.featured.match, null);
});

test('completed champion presentation fails safely when the final opponent is unavailable', () => {
  const bracket = eightPlayerBracket();
  bracket.status = 'complete';
  bracket.winner = { ...player('p1', 1, 'Top Seed (@top-seed)'), handle: '@top-seed' };
  bracket.rounds[2].matches[0] = {
    label: 'Match 7',
    status: 'final',
    players: [player('p1', 1, 'Top Seed (@top-seed)')],
    winnerId: 'p1',
    winnerName: 'Top Seed (@top-seed)',
  };

  const model = buildBroadcastBracketModel({ event: { ...event, status: 'complete' }, bracket });
  assert.equal(model.featured.title, 'Top Seed');
  assert.equal(model.featured.detail, 'Official champion');
  assert.doesNotMatch(model.featured.detail, /Top Seed|top-seed/i);
  assert.equal(model.featured.match, null);
});

test('pre-bracket model is explicit rather than inventing an empty bracket', () => {
  const model = buildBroadcastBracketModel({ event, bracket: null });
  assert.equal(model.rounds.length, 0);
  assert.equal(model.featured.kind, 'pre-bracket');
  assert.equal(model.featured.title, 'Reddit Sunday Spades Tournament');
  assert.equal(model.featured.detail, 'Bracket generates after check-in');
});

test('broadcast route is public, read-only, mobile-aware, and contains no host controls', async () => {
  const [routeSource, screenSource, responsiveSource] = await Promise.all([
    readFile(new URL('../app/overlay/bracket.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/screens/BroadcastBracketScreen.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/tournamentResponsive.css', import.meta.url), 'utf8'),
  ]);
  assert.match(routeSource, /BroadcastBracketScreen/);
  assert.match(routeSource, /useGlobalSearchParams/);
  assert.match(screenSource, /mobileRoundTabs/);
  assert.match(screenSource, /accessibilityRole="tab"/);
  assert.match(screenSource, /LIVE DATA \/ 15S REFRESH/);
  assert.match(screenSource, /eventsResult\?\.events\?\.find/);
  assert.doesNotMatch(screenSource, /Admin|Host control|canonicalAccountId|email|ticket|token/);
  assert.match(responsiveSource, /max-width: 430px/);
  assert.match(responsiveSource, /min-width: 0 !important/);
  assert.doesNotMatch(responsiveSource, /overflow-x:\s*(hidden|clip)/);
});

test('stacked broadcast brackets expand around every match before the footer', async () => {
  const screenSource = await readFile(new URL('../src/screens/BroadcastBracketScreen.jsx', import.meta.url), 'utf8');

  assert.match(screenSource, /styles\.bracketPanel, stacked && styles\.bracketPanelStacked/);
  assert.match(screenSource, /styles\.rounds, stacked && styles\.roundsStacked/);
  assert.match(screenSource, /styles\.matchStack, stacked && styles\.matchStackStacked/);
  assert.match(screenSource, /mainStageStacked:\s*\{ flexGrow: 0, flexShrink: 0, flexBasis: 'auto'/);
  assert.match(screenSource, /bracketPanelStacked:\s*\{ flexGrow: 0, flexShrink: 0, flexBasis: 'auto' \}/);
  assert.match(screenSource, /roundsStacked:\s*\{ flexGrow: 0, flexShrink: 0, flexBasis: 'auto' \}/);
  assert.match(screenSource, /matchStackStacked:\s*\{ flexGrow: 0, flexShrink: 0, flexBasis: 'auto' \}/);
  assert.match(screenSource, /<\/View>\s*<View style=\{styles\.footer\}>/);
  assert.doesNotMatch(screenSource, /(bracketPanel|rounds|matchStack)Stacked:\s*\{[^}]*\bheight\s*:/);
  assert.doesNotMatch(screenSource, /(bracketPanel|rounds|matchStack)Stacked:\s*\{[^}]*overflow:\s*'hidden'/);
});
