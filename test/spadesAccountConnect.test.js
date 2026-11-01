import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  normalizeSpadesAccountMode,
  prepareSpadesAccountReturn,
  resolveSpadesAccountDestination,
  SPADES_ACCOUNT_ENTRY_ROUTE,
  SPADES_ACCOUNT_DESTINATION,
  SPADES_ACCOUNT_QA_DESTINATION,
  SPADES_SIGNED_OUT_ACCOUNT_ACTIONS,
} from '../src/lib/spadesAccountConnect.js';
import {
  accountActionTimeoutMs,
  createPlayerAccount,
  deletePlayerAccount,
  loginPlayerAccount,
  logoutPlayerAccount,
  fetchPlayerAccount,
  requestPlayerPasswordReset,
  resetPlayerPassword,
} from '../src/lib/tournamentHostingClient.js';
import { signOutAccountConnectSession, verifiedAccountReturnCopy } from '../src/lib/accountConnect.js';

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

test('Spades account return allows only production and the explicit QA origin', () => {
  assert.equal(
    resolveSpadesAccountDestination('https://1v1spades.com/anything'),
    SPADES_ACCOUNT_DESTINATION,
  );
  assert.equal(
    resolveSpadesAccountDestination(
      'https://onev1-spades-phase1-qa-20260923.onrender.com/anything?x=1',
    ),
    SPADES_ACCOUNT_QA_DESTINATION,
  );
  assert.equal(
    resolveSpadesAccountDestination('https://evil.example/phish'),
    SPADES_ACCOUNT_DESTINATION,
  );
  assert.equal(
    resolveSpadesAccountDestination(
      'https://onev1-spades-phase1-qa-20260923.onrender.com.evil.example/',
    ),
    SPADES_ACCOUNT_DESTINATION,
  );
  assert.equal(
    resolveSpadesAccountDestination('javascript:alert(1)'),
    SPADES_ACCOUNT_DESTINATION,
  );
});

test('Spades QA account auth returns the authorization code to the QA origin', async () => {
  const launch = await prepareSpadesAccountReturn(
    async () =>
      new Response(
        JSON.stringify({
          authorization: {
            authorizationCode: 'opaque-qa-code',
            audience: 'spades',
            protocolVersion: '2026-08-04',
            expiresAt: '2026-09-25T15:00:00.000Z',
          },
        }),
        { status: 200 },
      ),
    SPADES_ACCOUNT_QA_DESTINATION,
  );

  const url = new URL(launch.url);

  assert.equal(url.origin, new URL(SPADES_ACCOUNT_QA_DESTINATION).origin);
  assert.equal(url.pathname, '/');
  assert.equal(url.searchParams.get('sharedAccountCode'), 'opaque-qa-code');
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
    username: 'test_player',
    contactEmail: 'player@example.com',
    password: 'safe-test-password',
    confirmPassword: 'safe-test-password',
  }));

  assert.equal(body.action, 'create');
  assert.equal(body.username, 'test_player');
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
  assert.equal(verifiedAccountReturnCopy('Spades'), 'Your 1v1 account is ready to return to Spades.');
});

test('Spades manage mode stops auto handoff and offers server logout before another account signs in', async () => {
  const screen = await readFile(new URL('../src/screens/SpadesAccountConnectScreen.jsx', import.meta.url), 'utf8');
  assert.match(screen, /requireAccountSelection=\{initialMode === 'manage'\}/);
  assert.match(screen, /switchAccountActionLabel=\{initialMode === 'manage' \? 'Use another account'/);
  assert.match(screen, /signOutAccountConnectSession\(logoutPlayerAccount\)/);

  const previousFetch = globalThis.fetch;
  const accountA = { id: 'acct-A', playerHandle: 'player_a', emailVerified: true };
  const accountB = { id: 'acct-B', playerHandle: 'player_b', emailVerified: true };
  let hubSession = accountA;
  const actions = [];
  globalThis.fetch = async (url, init = {}) => {
    const payload = init.body ? JSON.parse(init.body) : null;
    actions.push({ url: String(url), action: payload?.action ?? 'read', credentials: init.credentials });
    if (payload?.action === 'logout') {
      hubSession = null;
      return new Response(JSON.stringify({ ok: true, account: null }), { status: 200 });
    }
    if (payload?.action === 'login') {
      hubSession = payload.contactEmail === 'b@example.test' ? accountB : accountA;
      return new Response(JSON.stringify({ ok: true, account: hubSession }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true, account: hubSession }), { status: 200 });
  };
  try {
    assert.equal((await fetchPlayerAccount()).account.id, 'acct-A');
    assert.deepEqual(await signOutAccountConnectSession(logoutPlayerAccount), { account: null, mode: 'signin' });
    assert.equal((await fetchPlayerAccount()).account, null);
    assert.equal((await loginPlayerAccount({ contactEmail: 'b@example.test', password: 'synthetic' })).account.id, 'acct-B');
    assert.equal((await fetchPlayerAccount()).account.id, 'acct-B');
    assert.deepEqual(await signOutAccountConnectSession(logoutPlayerAccount), { account: null, mode: 'signin' });
    assert.equal((await loginPlayerAccount({ contactEmail: 'a@example.test', password: 'synthetic' })).account.id, 'acct-A');
    assert.ok(actions.every(entry => entry.credentials === 'include'));
    assert.deepEqual(actions.filter(entry => entry.action !== 'read').map(entry => entry.action), ['logout', 'login', 'logout', 'login']);
  } finally {
    globalThis.fetch = previousFetch;
  }
});


test('password reset receives the longer account-action request window', () => {
  assert.equal(accountActionTimeoutMs('reset-password'), 45_000);
  assert.equal(accountActionTimeoutMs('request-password-reset'), 8_000);
  assert.equal(accountActionTimeoutMs('login'), 8_000);
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
