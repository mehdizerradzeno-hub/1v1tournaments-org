import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFourPlayerDoubleEliminationBracket,
  buildThreePlayerTwoLifeBracket,
  findMatch,
  setMatchWinner,
} from '../netlify/functions/tournament-bracket.mjs';
import {
  findPlayerMatchStatus,
  handler as playerStatusHandler,
} from '../netlify/functions/tournament-player-status.mjs';
import {
  getActiveTournamentMatchPath,
  getActiveTournamentPath,
} from '../src/lib/activeTournamentMatch.js';

function signup(index, name) {
  return {
    id: `signup-${index}`,
    accountId: `account-${index}`,
    playerName: name,
    playerHandle: `p${index}`,
    contactEmail: `player${index}@example.com`,
    createdAt: `2026-07-10T18:0${index}:00.000Z`,
  };
}

function winner(bracket, matchId, slot = 0) {
  const match = findMatch(bracket, matchId);

  assert.ok(match, `Expected ${matchId} to exist`);
  assert.ok(match.players[slot], `Expected ${matchId} slot ${slot} to have a player`);

  setMatchWinner(bracket, match, match.players[slot]);

  return match.players[slot];
}

function externalBracket(tournamentSlug, firstSignup, secondSignup, options = {}) {
  const matchStatus = options.matchStatus || 'ready';
  const bracketStatus = options.bracketStatus || 'live';
  const winnerSignup = options.winnerSignup || null;

  return {
    tournamentSlug,
    status: bracketStatus,
    participantCount: 2,
    createdAt: '2026-08-26T12:00:00.000Z',
    updatedAt: options.updatedAt || '2026-08-26T12:05:00.000Z',
    winner: winnerSignup
      ? { id: winnerSignup.id, accountId: winnerSignup.accountId }
      : null,
    rounds: [
      {
        index: 1,
        title: 'Final',
        matches: [
          {
            id: `${tournamentSlug}-r1-m1`,
            label: 'Final',
            status: matchStatus,
            roomUrl: `https://qa.example/match/${tournamentSlug}-r1-m1`,
            matchIndex: 0,
            players: [
              {
                id: firstSignup.id,
                accountId: firstSignup.accountId,
                canonicalAccountId: firstSignup.canonicalAccountId,
                seed: 1,
                name: firstSignup.playerName,
                handle: firstSignup.playerHandle,
              },
              {
                id: secondSignup.id,
                accountId: secondSignup.accountId,
                canonicalAccountId: secondSignup.canonicalAccountId,
                seed: 2,
                name: secondSignup.playerName,
                handle: secondSignup.playerHandle,
              },
            ],
            winnerId: winnerSignup?.id || '',
            winnerName: winnerSignup?.playerName || '',
          },
        ],
      },
    ],
  };
}

function parseResponse(response) {
  return JSON.parse(response.body);
}

test('4-player double-elimination keeps a player alive after first loss', () => {
  const signups = [
    signup(1, 'Alex'),
    signup(2, 'Blake'),
    signup(3, 'Casey'),
    signup(4, 'Drew'),
  ];
  const bracket = buildFourPlayerDoubleEliminationBracket({
    tournamentSlug: 'friends-test',
    signups,
  });

  winner(bracket, 'friends-test-r1-m1', 0);

  const blakeStatus = findPlayerMatchStatus(bracket, signups[1]);

  assert.equal(blakeStatus.nextStep, 'wait-opponent');
  assert.equal(blakeStatus.waitingMatch.label, 'Losers Round 1');
});

test('4-player double-elimination eliminates a player after second loss', () => {
  const signups = [
    signup(1, 'Alex'),
    signup(2, 'Blake'),
    signup(3, 'Casey'),
    signup(4, 'Drew'),
  ];
  const bracket = buildFourPlayerDoubleEliminationBracket({
    tournamentSlug: 'friends-test',
    signups,
  });

  winner(bracket, 'friends-test-r1-m1', 0);
  winner(bracket, 'friends-test-r1-m2', 0);
  winner(bracket, 'friends-test-r2-m2', 1);

  const blakeStatus = findPlayerMatchStatus(bracket, signups[1]);

  assert.equal(blakeStatus.nextStep, 'eliminated');
  assert.equal(blakeStatus.finalMatch.label, 'Losers Round 1');
});

test('3-player two-life keeps a player alive after first lost life', () => {
  const signups = [
    signup(1, 'Alex'),
    signup(2, 'Blake'),
    signup(3, 'Casey'),
  ];
  const bracket = buildThreePlayerTwoLifeBracket({
    tournamentSlug: 'three-life',
    signups,
  });

  winner(bracket, 'three-life-r1-m1', 0);

  const blakeStatus = findPlayerMatchStatus(bracket, signups[1]);

  assert.equal(blakeStatus.nextStep, 'ready-match');
  assert.equal(blakeStatus.currentMatch.label, 'Match 2');
});

test('3-player two-life eliminates a player only when lives reach zero', () => {
  const signups = [
    signup(1, 'Alex'),
    signup(2, 'Blake'),
    signup(3, 'Casey'),
  ];
  const bracket = buildThreePlayerTwoLifeBracket({
    tournamentSlug: 'three-life',
    signups,
  });

  winner(bracket, 'three-life-r1-m1', 0);
  winner(bracket, 'three-life-r1-m2', 1);
  winner(bracket, 'three-life-r2-m1', 0);

  const caseyStatus = findPlayerMatchStatus(bracket, signups[2]);

  assert.equal(caseyStatus.nextStep, 'eliminated');
  assert.equal(caseyStatus.finalMatch.label, 'Match 3');
});

test('authenticated global status discovers only the account owned unresolved match', async () => {
  const account = {
    id: 'account-1',
    canonicalAccountId: 'canonical-1',
    email: 'player1@example.com',
    playerName: 'Alex',
    playerHandle: 'alex',
  };
  const alexSignup = {
    ...signup(1, 'Alex'),
    canonicalAccountId: 'canonical-1',
    tournamentSlug: 'qa-active-event',
  };
  const blakeSignup = {
    ...signup(2, 'Blake'),
    canonicalAccountId: 'canonical-2',
    tournamentSlug: 'qa-active-event',
  };
  const unrelatedSignup = {
    ...signup(3, 'Casey'),
    canonicalAccountId: 'canonical-3',
    tournamentSlug: 'other-event',
  };
  const brackets = new Map([
    ['qa-active-event', externalBracket('qa-active-event', alexSignup, blakeSignup)],
    ['other-event', externalBracket('other-event', unrelatedSignup, blakeSignup)],
  ]);

  const response = await playerStatusHandler(
    { httpMethod: 'GET', queryStringParameters: {} },
    {
      getAccountFromEvent: async () => account,
      loadAllTournamentSignups: async () => [alexSignup, blakeSignup, unrelatedSignup],
      loadBracket: async (tournamentSlug) => brackets.get(tournamentSlug) || null,
    },
  );
  const body = parseResponse(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.scope, 'active-match');
  assert.equal(body.nextStep, 'ready-match');
  assert.equal(body.activeMatchCount, 1);
  assert.deepEqual(body.activeMatch, {
    tournamentSlug: 'qa-active-event',
    matchId: 'qa-active-event-r1-m1',
    bracketStatus: 'live',
    tournamentPath: '/tournaments/qa-active-event',
    matchPath: '/tournaments/qa-active-event#my-match',
  });
  assert.deepEqual(Object.keys(body.activeMatch).sort(), [
    'bracketStatus',
    'matchId',
    'matchPath',
    'tournamentPath',
    'tournamentSlug',
  ]);
});

test('authenticated global status reports no active match when assignment is waiting', async () => {
  const account = { id: 'account-1', email: 'player1@example.com' };
  const alexSignup = { ...signup(1, 'Alex'), tournamentSlug: 'waiting-event' };
  const blakeSignup = { ...signup(2, 'Blake'), tournamentSlug: 'waiting-event' };
  const bracket = externalBracket('waiting-event', alexSignup, blakeSignup, { matchStatus: 'pending' });

  const response = await playerStatusHandler(
    { httpMethod: 'GET', queryStringParameters: {} },
    {
      getAccountFromEvent: async () => account,
      loadAllTournamentSignups: async () => [alexSignup, blakeSignup],
      loadBracket: async () => bracket,
    },
  );
  const body = parseResponse(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.activeMatch, null);
  assert.equal(body.activeMatchCount, 0);
  assert.equal(body.nextStep, 'no-active-match');
});

test('authenticated global status reports all active matches so clients do not guess', async () => {
  const account = {
    id: 'account-1',
    canonicalAccountId: 'canonical-1',
    email: 'player1@example.com',
  };
  const firstSignup = {
    ...signup(1, 'Alex'),
    canonicalAccountId: 'canonical-1',
    tournamentSlug: 'first-active-event',
  };
  const secondSignup = {
    ...signup(1, 'Alex'),
    canonicalAccountId: 'canonical-1',
    tournamentSlug: 'second-active-event',
  };
  const opponent = {
    ...signup(2, 'Blake'),
    canonicalAccountId: 'canonical-2',
  };
  const brackets = new Map([
    [
      'first-active-event',
      externalBracket('first-active-event', firstSignup, opponent, {
        updatedAt: '2026-08-26T12:05:00.000Z',
      }),
    ],
    [
      'second-active-event',
      externalBracket('second-active-event', secondSignup, opponent, {
        updatedAt: '2026-08-26T12:10:00.000Z',
      }),
    ],
  ]);

  const response = await playerStatusHandler(
    { httpMethod: 'GET', queryStringParameters: {} },
    {
      getAccountFromEvent: async () => account,
      loadAllTournamentSignups: async () => [firstSignup, secondSignup],
      loadBracket: async (tournamentSlug) => brackets.get(tournamentSlug) || null,
    },
  );
  const body = parseResponse(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.activeMatchCount, 2);
  assert.equal(body.activeMatch.tournamentSlug, 'second-active-event');
  assert.equal(body.nextStep, 'ready-match');
});

test('authenticated global status excludes completed matches', async () => {
  const account = { id: 'account-1', email: 'player1@example.com' };
  const alexSignup = { ...signup(1, 'Alex'), tournamentSlug: 'complete-event' };
  const blakeSignup = { ...signup(2, 'Blake'), tournamentSlug: 'complete-event' };
  const bracket = externalBracket('complete-event', alexSignup, blakeSignup, {
    bracketStatus: 'complete',
    matchStatus: 'final',
    winnerSignup: alexSignup,
  });

  const response = await playerStatusHandler(
    { httpMethod: 'GET', queryStringParameters: {} },
    {
      getAccountFromEvent: async () => account,
      loadAllTournamentSignups: async () => [alexSignup, blakeSignup],
      loadBracket: async () => bracket,
    },
  );
  const body = parseResponse(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.activeMatch, null);
  assert.equal(body.activeMatchCount, 0);
  assert.equal(body.nextStep, 'no-active-match');
});

test('global status does not expose another account assignment', async () => {
  const account = { id: 'account-9', email: 'player9@example.com' };
  const alexSignup = { ...signup(1, 'Alex'), tournamentSlug: 'private-event' };
  const blakeSignup = { ...signup(2, 'Blake'), tournamentSlug: 'private-event' };
  let bracketRead = false;

  const response = await playerStatusHandler(
    { httpMethod: 'GET', queryStringParameters: {} },
    {
      getAccountFromEvent: async () => account,
      loadAllTournamentSignups: async () => [alexSignup, blakeSignup],
      loadBracket: async () => {
        bracketRead = true;
        return externalBracket('private-event', alexSignup, blakeSignup);
      },
    },
  );
  const body = parseResponse(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.activeMatch, null);
  assert.equal(body.activeMatchCount, 0);
  assert.equal(body.nextStep, 'no-active-match');
  assert.equal(bracketRead, false);
});

test('anonymous global status returns no assignment without scanning tournament state', async () => {
  let signupsRead = false;

  const response = await playerStatusHandler(
    { httpMethod: 'GET', queryStringParameters: {} },
    {
      getAccountFromEvent: async () => null,
      loadAllTournamentSignups: async () => {
        signupsRead = true;
        return [];
      },
    },
  );
  const body = parseResponse(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.account, null);
  assert.equal(body.activeMatch, null);
  assert.equal(body.activeMatchCount, 0);
  assert.equal(body.nextStep, 'sign-in');
  assert.equal(signupsRead, false);
});

test('active match routing resolves only matching tournament and match identifiers', () => {
  const activeMatch = {
    tournamentSlug: 'qa-active-event',
    matchId: 'qa-active-event-r2-m1',
  };

  assert.equal(
    getActiveTournamentMatchPath(activeMatch),
    '/tournaments/qa-active-event#my-match',
  );
  assert.equal(
    getActiveTournamentPath(activeMatch),
    '/tournaments/qa-active-event',
  );
  assert.equal(
    getActiveTournamentMatchPath({ ...activeMatch, matchId: 'other-event-r2-m1' }),
    '/next',
  );
  assert.equal(
    getActiveTournamentMatchPath({ tournamentSlug: '../admin', matchId: '../admin-r1-m1' }),
    '/next',
  );
});
