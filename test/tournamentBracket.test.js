import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFourPlayerDoubleEliminationBracket,
  buildThreePlayerTwoLifeBracket,
  findMatch,
  setMatchWinner,
} from '../netlify/functions/tournament-bracket.mjs';

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

test('4-player double-elimination bracket requires exactly four players', () => {
  assert.throws(() => buildFourPlayerDoubleEliminationBracket({
    tournamentSlug: 'friends-test',
    signups: [signup(1, 'One'), signup(2, 'Two'), signup(3, 'Three')],
  }), /exactly four registered players/);
});

test('4-player double-elimination bracket advances winners, losers, and reset final', () => {
  const bracket = buildFourPlayerDoubleEliminationBracket({
    tournamentSlug: 'friends-test',
    signups: [
      signup(1, 'Alex'),
      signup(2, 'Blake'),
      signup(3, 'Casey'),
      signup(4, 'Drew'),
    ],
  });

  assert.equal(bracket.format, 'four-player-double-elimination');
  assert.equal(bracket.participantCount, 4);
  assert.equal(bracket.rounds.length, 5);
  assert.equal(findMatch(bracket, 'friends-test-r1-m1').status, 'ready');
  assert.equal(findMatch(bracket, 'friends-test-r1-m2').status, 'ready');

  const alex = winner(bracket, 'friends-test-r1-m1', 0);
  const casey = winner(bracket, 'friends-test-r1-m2', 0);

  const winnersFinal = findMatch(bracket, 'friends-test-r2-m1');
  const losersRound = findMatch(bracket, 'friends-test-r2-m2');

  assert.equal(winnersFinal.status, 'ready');
  assert.deepEqual(winnersFinal.players.map((player) => player?.id), [alex.id, casey.id]);
  assert.equal(losersRound.status, 'ready');
  assert.deepEqual(losersRound.players.map((player) => player?.name), ['Blake', 'Drew']);

  winner(bracket, 'friends-test-r2-m1', 0);
  winner(bracket, 'friends-test-r2-m2', 0);

  const losersFinal = findMatch(bracket, 'friends-test-r3-m1');
  assert.equal(losersFinal.status, 'ready');
  assert.deepEqual(losersFinal.players.map((player) => player?.name), ['Blake', 'Casey']);

  const blake = winner(bracket, 'friends-test-r3-m1', 0);
  const grandFinal = findMatch(bracket, 'friends-test-r4-m1');

  assert.equal(grandFinal.status, 'ready');
  assert.deepEqual(grandFinal.players.map((player) => player?.id), [alex.id, blake.id]);

  winner(bracket, 'friends-test-r4-m1', 1);

  const resetFinal = findMatch(bracket, 'friends-test-r5-m1');
  assert.equal(bracket.status, 'published');
  assert.equal(resetFinal.status, 'ready');
  assert.deepEqual(resetFinal.players.map((player) => player?.id), [alex.id, blake.id]);

  winner(bracket, 'friends-test-r5-m1', 0);

  assert.equal(bracket.status, 'complete');
  assert.equal(bracket.winner.id, alex.id);
});

test('4-player double-elimination completes without reset when winners-side player wins grand final', () => {
  const bracket = buildFourPlayerDoubleEliminationBracket({
    tournamentSlug: 'friends-clean-final',
    signups: [
      signup(1, 'Alex'),
      signup(2, 'Blake'),
      signup(3, 'Casey'),
      signup(4, 'Drew'),
    ],
  });

  const alex = winner(bracket, 'friends-clean-final-r1-m1', 0);
  winner(bracket, 'friends-clean-final-r1-m2', 0);
  winner(bracket, 'friends-clean-final-r2-m1', 0);
  winner(bracket, 'friends-clean-final-r2-m2', 0);
  winner(bracket, 'friends-clean-final-r3-m1', 0);
  winner(bracket, 'friends-clean-final-r4-m1', 0);

  assert.equal(bracket.status, 'complete');
  assert.equal(bracket.winner.id, alex.id);
  assert.equal(findMatch(bracket, 'friends-clean-final-r5-m1').status, 'pending');
});

test('3-player two-life bracket requires exactly three players', () => {
  assert.throws(() => buildThreePlayerTwoLifeBracket({
    tournamentSlug: 'three-life-short',
    signups: [signup(1, 'One'), signup(2, 'Two')],
  }), /exactly three registered players/);
});

test('3-player two-life bracket rotates waiting player and tracks lives', () => {
  const bracket = buildThreePlayerTwoLifeBracket({
    tournamentSlug: 'three-life',
    signups: [
      signup(1, 'Alex'),
      signup(2, 'Blake'),
      signup(3, 'Casey'),
    ],
  });

  assert.equal(bracket.format, 'three-player-two-life');
  assert.equal(bracket.participantCount, 3);
  assert.equal(bracket.standings.length, 3);
  assert.equal(findMatch(bracket, 'three-life-r1-m1').status, 'ready');
  assert.equal(findMatch(bracket, 'three-life-r1-m2').status, 'pending');

  winner(bracket, 'three-life-r1-m1', 0);

  const match2 = findMatch(bracket, 'three-life-r1-m2');
  assert.equal(match2.status, 'ready');
  assert.deepEqual(match2.players.map((player) => player?.name), ['Casey', 'Blake']);
  assert.equal(bracket.standings.find((standing) => standing.name.startsWith('Blake')).lives, 1);

  winner(bracket, 'three-life-r1-m2', 1);

  const match3 = findMatch(bracket, 'three-life-r2-m1');
  assert.equal(match3.status, 'ready');
  assert.deepEqual(match3.players.map((player) => player?.name), ['Alex', 'Casey']);

  winner(bracket, 'three-life-r2-m1', 0);

  const match4 = findMatch(bracket, 'three-life-r2-m2');
  assert.equal(match4.status, 'ready');
  assert.deepEqual(match4.players.map((player) => player?.name), ['Blake', 'Alex']);
  assert.equal(bracket.standings.find((standing) => standing.name.startsWith('Casey')).status, 'out');

  winner(bracket, 'three-life-r2-m2', 0);

  const match5 = findMatch(bracket, 'three-life-r3-m1');
  assert.equal(match5.status, 'ready');
  assert.deepEqual(match5.players.map((player) => player?.name), ['Alex', 'Blake']);

  winner(bracket, 'three-life-r3-m1', 0);

  assert.equal(bracket.status, 'complete');
  assert.equal(bracket.winner.name, 'Alex (p1)');
  assert.equal(bracket.standings.find((standing) => standing.name.startsWith('Blake')).status, 'out');
});
