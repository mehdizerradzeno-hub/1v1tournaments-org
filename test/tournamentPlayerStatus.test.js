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
  findReadyEuchreAssignments,
  loadTournamentSignups,
} from '../netlify/functions/tournament-player-status.mjs';

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

test('ready-match discovery includes only the signed-in player’s private Euchre assignment', async () => {
  const account = { id: 'account-1', canonicalAccountId: 'account-1', email: 'alex@example.com' };
  const ownSignup = signup(1, 'Alex');
  const otherSignup = signup(2, 'Blake');
  const readyBracket = {
    rounds: [{
      index: 1,
      title: 'Final',
      matches: [{
        id: 'private-euchre-r1-m1',
        label: 'Final',
        status: 'ready',
        roomUrl: 'https://private.example/match',
        matchIndex: 1,
        players: [
          { id: ownSignup.id, accountId: ownSignup.accountId, name: ownSignup.playerName },
          { id: otherSignup.id, accountId: otherSignup.accountId, name: otherSignup.playerName },
        ],
      }],
    }],
  };
  const events = [
    { slug: 'private-euchre', title: 'Private Euchre pilot', gameSlug: 'euchre', status: 'live', visibility: 'private' },
    { slug: 'other-private-euchre', title: 'Another private pilot', gameSlug: 'euchre', status: 'live', visibility: 'private' },
    { slug: 'public-spades', title: 'Public Spades', gameSlug: 'spades', status: 'live' },
  ];

  const matches = await findReadyEuchreAssignments(account, {
    events,
    loadBracket: async () => readyBracket,
    loadSignups: async (slug) => slug === 'private-euchre' ? [ownSignup, otherSignup] : [otherSignup],
  });

  assert.deepEqual(matches, [{
    event: { slug: 'private-euchre', title: 'Private Euchre pilot' },
    match: {
      id: 'private-euchre-r1-m1',
      label: 'Final',
      status: 'ready',
      round: { index: 1, title: 'Final' },
      matchIndex: 1,
    },
  }]);
  assert.equal(JSON.stringify(matches).includes('Blake'), false);
  assert.equal(JSON.stringify(matches).includes('private.example'), false);
});

test('ready-match discovery reveals nothing without an authenticated account', async () => {
  const matches = await findReadyEuchreAssignments(null, {
    events: [{ slug: 'private-euchre', title: 'Private Euchre pilot', gameSlug: 'euchre', status: 'live' }],
  });

  assert.deepEqual(matches, []);
});

test('signup lookup reads every Blob page with bounded record concurrency', async () => {
  const keys = Array.from({ length: 35 }, (_, index) => `pilot/entry-${index}`);
  let activeReads = 0;
  let peakReads = 0;
  const store = {
    list: ({ prefix, paginate }) => {
      assert.equal(prefix, 'pilot/');
      assert.equal(paginate, true);
      return (async function* listPages() {
        yield { blobs: keys.slice(0, 20).map((key) => ({ key })) };
        yield { blobs: keys.slice(20).map((key) => ({ key })) };
      })();
    },
    get: async (key) => {
      activeReads += 1;
      peakReads = Math.max(peakReads, activeReads);
      await new Promise((resolve) => setImmediate(resolve));
      activeReads -= 1;
      return { id: key, createdAt: key };
    },
  };

  const signups = await loadTournamentSignups('pilot', { store });

  assert.equal(signups.length, 35);
  assert.ok(peakReads <= 16);
});

test('ready-match discovery bounds live Euchre event fan-out', async () => {
  const events = Array.from({ length: 9 }, (_, index) => ({
    slug: `pilot-${index}`,
    title: `Pilot ${index}`,
    gameSlug: 'euchre',
    status: 'live',
  }));
  let activeEvents = 0;
  let peakEvents = 0;
  let loadedEvents = 0;

  const matches = await findReadyEuchreAssignments({ id: 'account-1' }, {
    events,
    loadBracket: async () => null,
    loadSignups: async () => {
      activeEvents += 1;
      peakEvents = Math.max(peakEvents, activeEvents);
      await new Promise((resolve) => setImmediate(resolve));
      activeEvents -= 1;
      loadedEvents += 1;
      return [];
    },
  });

  assert.deepEqual(matches, []);
  assert.equal(loadedEvents, 9);
  assert.ok(peakEvents <= 4);
});
