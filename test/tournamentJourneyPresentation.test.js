import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getTournamentDiscoveryPresentation,
  getTournamentPlayerPresentation,
  TOURNAMENT_MASTER_JOURNEY,
  TOURNAMENT_PLAYER_PRESENTATION_STATES,
} from '../src/lib/tournamentJourneyPresentation.js';

test('discovery CTAs respect the authenticated player registration state', () => {
  const common = {
    registrationStatus: 'open',
    signupPath: '/check-in/sunday-cup',
    tournamentPath: '/tournaments/sunday-cup',
  };
  const unregistered = getTournamentDiscoveryPresentation({
    ...common,
    signupSummary: { signups: [{ id: 'other', currentPlayer: false }] },
  });
  const registered = getTournamentDiscoveryPresentation({
    ...common,
    signupSummary: { signups: [{ id: 'mine', currentPlayer: true }] },
  });
  const registeredLive = getTournamentDiscoveryPresentation({
    ...common,
    hasBracket: true,
    signupSummary: { signups: [{ id: 'mine', currentPlayer: true }] },
  });

  assert.equal(unregistered.primaryAction.label, 'REGISTER');
  assert.equal(registered.statusLabel, 'REGISTERED');
  assert.equal(registered.primaryAction.label, 'VIEW TOURNAMENT');
  assert.equal(registered.secondaryAction, null);
  assert.equal(registeredLive.primaryAction.label, 'VIEW TOURNAMENT');
  assert.equal(registeredLive.secondaryAction.label, 'VIEW BRACKET');
});

const paths = Object.freeze({
  signInPath: '/account?mode=signin',
  signupPath: '/check-in/sunday-cup',
  matchPath: '/tournaments/sunday-cup#my-match',
  bracketPath: '/tournaments/sunday-cup#live-bracket',
});

function present(data, overrides = {}) {
  return getTournamentPlayerPresentation({
    ...paths,
    registrationStatus: 'open',
    playerStatus: { data },
    ...overrides,
  });
}

test('master tournament journey stays concise and ordered as SIGN UP, CHECK IN, PLAY', () => {
  assert.deepEqual(
    TOURNAMENT_MASTER_JOURNEY.map(({ number, label }) => ({ number, label })),
    [
      { number: '1', label: 'SIGN UP' },
      { number: '2', label: 'CHECK IN' },
      { number: '3', label: 'PLAY' },
    ],
  );
  assert.ok(Object.isFrozen(TOURNAMENT_MASTER_JOURNEY));
  assert.ok(TOURNAMENT_MASTER_JOURNEY.every(Object.isFrozen));
});

test('signed-out and signed-in players receive the correct sign-in or sign-up action', () => {
  const signedOut = present({ account: null, nextStep: 'sign-in' });
  const signUp = present({ account: { id: 'account-a' }, nextStep: 'sign-up' });

  assert.equal(signedOut.state, TOURNAMENT_PLAYER_PRESENTATION_STATES.SIGNED_OUT);
  assert.deepEqual(signedOut.primaryAction, {
    label: 'SIGN IN',
    href: paths.signInPath,
  });
  assert.equal(signUp.state, TOURNAMENT_PLAYER_PRESENTATION_STATES.SIGN_UP);
  assert.deepEqual(signUp.primaryAction, {
    label: 'SIGN UP',
    href: paths.signupPath,
  });
});

test('registered players stay registered without an invented per-player check-in action', () => {
  const registered = present({
    account: { id: 'account-a' },
    signup: { id: 'signup-a', status: 'registered' },
    nextStep: 'wait-bracket',
  });
  const checkInWindow = present(
    {
      account: { id: 'account-a' },
      signup: { id: 'signup-a', status: 'registered' },
      nextStep: 'wait-bracket',
    },
    { registrationStatus: 'check-in' },
  );

  assert.equal(registered.state, TOURNAMENT_PLAYER_PRESENTATION_STATES.REGISTERED);
  assert.equal(registered.label, 'REGISTERED');
  assert.equal(registered.primaryAction, null);
  assert.equal(checkInWindow.state, TOURNAMENT_PLAYER_PRESENTATION_STATES.WAITING);
  assert.equal(checkInWindow.primaryAction, null);
  assert.doesNotMatch(checkInWindow.description, /press|tap|check in/i);
});

test('pending assignment never becomes playable without an authoritative currentMatch', () => {
  const pending = present(
    {
      account: { id: 'account-a' },
      signup: { id: 'signup-a' },
      waitingMatch: { id: 'sunday-cup-r2-m1', status: 'pending' },
      nextStep: 'wait-opponent',
    },
    { hasBracket: true },
  );
  const incompleteReadyStatus = present(
    {
      account: { id: 'account-a' },
      signup: { id: 'signup-a' },
      nextStep: 'ready-match',
    },
    { hasBracket: true },
  );

  for (const state of [pending, incompleteReadyStatus]) {
    assert.equal(state.state, TOURNAMENT_PLAYER_PRESENTATION_STATES.PENDING_MATCH);
    assert.equal(state.description, 'Preparing match…');
    assert.equal(state.primaryAction, null);
  }
});

test('only an authoritative currentMatch exposes one PLAY MATCH action', () => {
  const ready = present(
    {
      account: { id: 'account-a' },
      signup: { id: 'signup-a' },
      currentMatch: { id: 'sunday-cup-r1-m1', status: 'ready' },
      nextStep: 'ready-match',
    },
    { hasBracket: true },
  );

  assert.equal(ready.state, TOURNAMENT_PLAYER_PRESENTATION_STATES.READY_MATCH);
  assert.equal(ready.title, 'YOUR MATCH IS READY');
  assert.deepEqual(ready.primaryAction, {
    label: 'PLAY MATCH',
    href: paths.matchPath,
  });
  assert.equal('actions' in ready, false);
});

test('eliminated, champion, and complete states expose VIEW BRACKET and never a match launch', () => {
  const shared = {
    account: { id: 'account-a' },
    signup: { id: 'signup-a' },
  };
  const cases = [
    {
      expected: TOURNAMENT_PLAYER_PRESENTATION_STATES.ELIMINATED,
      value: present({ ...shared, nextStep: 'eliminated' }, { hasBracket: true }),
    },
    {
      expected: TOURNAMENT_PLAYER_PRESENTATION_STATES.CHAMPION,
      value: present(
        { ...shared, nextStep: 'champion', bracketStatus: 'complete' },
        { hasBracket: true },
      ),
    },
    {
      expected: TOURNAMENT_PLAYER_PRESENTATION_STATES.COMPLETE,
      value: present(
        { ...shared, nextStep: 'complete', bracketStatus: 'complete' },
        { tournamentStatus: 'completed', hasBracket: true },
      ),
    },
  ];

  for (const { expected, value } of cases) {
    assert.equal(value.state, expected);
    assert.deepEqual(value.primaryAction, {
      label: 'VIEW BRACKET',
      href: paths.bracketPath,
    });
  }
});

test('completed tournament state suppresses a stale currentMatch launch', () => {
  const complete = present(
    {
      account: { id: 'account-a' },
      signup: { id: 'signup-a' },
      currentMatch: { id: 'sunday-cup-r1-m1', status: 'ready' },
      nextStep: 'complete',
      bracketStatus: 'complete',
    },
    { tournamentStatus: 'completed', hasBracket: true },
  );

  assert.equal(complete.state, TOURNAMENT_PLAYER_PRESENTATION_STATES.COMPLETE);
  assert.equal(complete.primaryAction.label, 'VIEW BRACKET');
});

test('every player-facing state has at most one primary action', () => {
  const samples = [
    present({ account: null, nextStep: 'sign-in' }),
    present({ account: { id: 'account-a' }, nextStep: 'sign-up' }),
    present({ account: { id: 'account-a' }, signup: { id: 'signup-a' } }),
    present(
      {
        account: { id: 'account-a' },
        signup: { id: 'signup-a' },
        nextStep: 'wait-bracket',
      },
      { registrationStatus: 'check-in' },
    ),
    present(
      {
        account: { id: 'account-a' },
        signup: { id: 'signup-a' },
        waitingMatch: { id: 'sunday-cup-r2-m1' },
      },
      { hasBracket: true },
    ),
    present(
      {
        account: { id: 'account-a' },
        signup: { id: 'signup-a' },
        currentMatch: { id: 'sunday-cup-r1-m1' },
      },
      { hasBracket: true },
    ),
  ];

  for (const sample of samples) {
    assert.ok(sample.primaryAction === null || !Array.isArray(sample.primaryAction));
    assert.equal('secondaryAction' in sample, false);
  }
});
