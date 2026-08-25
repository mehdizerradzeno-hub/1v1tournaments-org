import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSpadesAccountMode,
  prepareSpadesAccountReturn,
  spadesAccountDestination,
  SPADES_ACCOUNT_ENTRY_ROUTE,
  SPADES_SIGNED_OUT_ACCOUNT_ACTIONS,
} from '../src/lib/spadesAccountConnect.js';
import {
  createPlayerAccount,
  deletePlayerAccount,
  loginPlayerAccount,
  logoutPlayerAccount,
  requestPlayerPasswordReset,
  resetPlayerPassword,
} from '../src/lib/tournamentHostingClient.js';
import { verifiedAccountReturnCopy } from '../src/lib/accountConnect.js';

async function captureAccountAction(run, payload = { ok: true, account: { playerName: 'Test Player' } }) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
  return JSON.parse(requests[0].init.body);
}

test('Spades account entry exposes the three required signed-out actions', () => {
  assert.equal(SPADES_ACCOUNT_ENTRY_ROUTE, '/connect/spades');
  assert.deepEqual(SPADES_SIGNED_OUT_ACCOUNT_ACTIONS, [
    { id: 'signin', label: 'Sign In' },
    { id: 'create', label: 'Create Account' },
    { id: 'reset', label: 'Forgot / Reset Password' },
  ]);
  assert.equal(normalizeSpadesAccountMode('signin'), 'signin');
  assert.equal(normalizeSpadesAccountMode('create'), 'create');
  assert.equal(normalizeSpadesAccountMode('reset'), 'reset');
  assert.equal(normalizeSpadesAccountMode('unknown'), 'signin');
});

test('Spades account destination preserves production by default and accepts only a QA HTTPS origin', () => {
  assert.equal(spadesAccountDestination(undefined), 'https://1v1spades.com/');
  assert.equal(
    spadesAccountDestination('https://onev1-spades-tournament-qa.onrender.com', true),
    'https://onev1-spades-tournament-qa.onrender.com/',
  );

  assert.throws(
    () => spadesAccountDestination(undefined, true),
    /required in QA/,
  );

  for (const invalid of [
    'http://onev1-spades-tournament-qa.onrender.com',
    'https://user:password@onev1-spades-tournament-qa.onrender.com',
    'https://onev1-spades-tournament-qa.onrender.com/account',
    'https://onev1-spades-tournament-qa.onrender.com/?redirect=production',
  ]) {
    assert.throws(
      () => spadesAccountDestination(invalid),
      /Invalid EXPO_PUBLIC_SPADES_ACCOUNT_DESTINATION/,
    );
  }
  assert.throws(
    () => spadesAccountDestination('https://1v1spades.com', true),
    /Invalid EXPO_PUBLIC_SPADES_ACCOUNT_DESTINATION/,
  );
});

test('successful account auth issues the established one-time Spades handoff', async () => {
  const requests = [];
  const launch = await prepareSpadesAccountReturn(async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({
      authorization: {
        authorizationCode: 'opaque-one-time-code',
        audience: 'spades',
        protocolVersion: '2026-08-04',
        expiresAt: '2026-08-07T15:00:00.000Z',
      },
    }), { status: 200 });
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/.netlify/functions/shared-account');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    action: 'issue-game-authorization',
    audience: 'spades',
  });
  assert.equal(launch.authorized, true);
  assert.equal(new URL(launch.url).origin, 'https://1v1spades.com');
  assert.equal(new URL(launch.url).searchParams.get('sharedAccountCode'), 'opaque-one-time-code');
});

test('Sign In uses the existing shared player-account login action', async () => {
  const body = await captureAccountAction(() => loginPlayerAccount({
    contactEmail: 'player@example.com',
    password: 'safe-test-password',
  }));

  assert.equal(body.action, 'login');
  assert.equal(body.contactEmail, 'player@example.com');
});

test('Create Account uses the existing shared player-account registration action', async () => {
  const body = await captureAccountAction(() => createPlayerAccount({
    playerName: 'Test Player',
    contactEmail: 'player@example.com',
    password: 'safe-test-password',
    confirmPassword: 'safe-test-password',
  }));

  assert.equal(body.action, 'create');
  assert.equal(body.playerName, 'Test Player');
});

test('Forgot and Reset Password use the existing recovery actions', async () => {
  const requestBody = await captureAccountAction(
    () => requestPlayerPasswordReset({ contactEmail: 'player@example.com' }),
    { ok: true, configured: true },
  );
  const resetBody = await captureAccountAction(() => resetPlayerPassword({
    contactEmail: 'player@example.com',
    token: 'opaque-recovery-token',
    password: 'new-safe-password',
    confirmPassword: 'new-safe-password',
  }));

  assert.equal(requestBody.action, 'request-password-reset');
  assert.equal(resetBody.action, 'reset-password');
  assert.equal(resetBody.token, 'opaque-recovery-token');
});

test('Sign Out uses the authoritative shared player-account logout action', async () => {
  const body = await captureAccountAction(
    () => logoutPlayerAccount(),
    { ok: true, account: null },
  );

  assert.deepEqual(body, { action: 'logout' });
  assert.equal(verifiedAccountReturnCopy('Spades'), 'Your verified 1v1 account is ready to return to Spades.');
});


test('Delete Account uses the canonical shared account deletion action', async () => {
  const body = await captureAccountAction(
    () => deletePlayerAccount('DELETE'),
    { ok: true, account: null, deleted: true },
  );

  assert.deepEqual(body, {
    action: 'delete-account',
    confirmation: 'DELETE',
  });
});
