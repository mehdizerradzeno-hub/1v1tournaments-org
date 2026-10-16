import test from 'node:test';
import assert from 'node:assert/strict';

import { getTournamentPlayerAction, getTournamentPlayerSteps } from '../src/lib/tournamentPlayerFlow.js';

const paths = {
  checkInPath: '/check-in/friday-cup',
  matchStatusPath: '/tournaments/friday-cup#my-match',
  tournamentPath: '/tournaments/friday-cup',
};

test('player flow starts with one account action when no account is present', () => {
  const action = getTournamentPlayerAction({ ...paths, isBracketLive: false, registrationOpen: true });
  const steps = getTournamentPlayerSteps({});

  assert.deepEqual(action, { label: 'Create or sign in', href: paths.checkInPath, state: 'account' });
  assert.equal(steps.length, 3);
  assert.equal(steps[0].current, true);
  assert.equal(steps[1].title, 'Join');
  assert.equal(steps[2].title, 'Open match');
});

test('a signed-in player advances to joining before match access', () => {
  const account = { playerName: 'Jordan' };
  const action = getTournamentPlayerAction({ ...paths, account, isBracketLive: false, registrationOpen: true });
  const steps = getTournamentPlayerSteps({ account });

  assert.equal(action.label, 'Join Tournament');
  assert.equal(steps[0].complete, true);
  assert.equal(steps[1].current, true);
  assert.equal(steps[2].complete, false);
});

test('only a signed-up player with an assigned match receives the match-opening state', () => {
  const account = { playerName: 'Jordan' };
  const signup = { playerName: 'Jordan' };
  const currentMatch = { id: 'friday-cup-r1-m1' };
  const action = getTournamentPlayerAction({
    ...paths,
    account,
    currentMatch,
    isBracketLive: true,
    registrationOpen: false,
    signup,
  });
  const steps = getTournamentPlayerSteps({ account, currentMatch, signup });

  assert.equal(action.label, 'Open My Match');
  assert.equal(action.href, paths.matchStatusPath);
  assert.deepEqual(steps.map((step) => step.complete), [true, true, true]);
});
