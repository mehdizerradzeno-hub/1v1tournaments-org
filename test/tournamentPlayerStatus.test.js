import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFourPlayerDoubleEliminationBracket,
  buildThreePlayerTwoLifeBracket,
  findMatch,
  setMatchWinner,
} from '../netlify/functions/tournament-bracket.mjs';
import { findPlayerMatchStatus } from '../netlify/functions/tournament-player-status.mjs';

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
