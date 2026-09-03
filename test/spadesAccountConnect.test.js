import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSpadesAccountMode,
  prepareSpadesAccountReturn,
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
import { clearDevReturnStatus, DEFAULT_RETURN_STATUS, emitQaReturnTelemetry, emitQaWebViewBridgePing, loadDevReturnStatus, persistDevReturnStatus, QA_RETURN_TELEMETRY_KEY, sendNativeSpadesAuthCallback } from '../src/lib/returnTelemetry.js';
import { classifyReturnTarget, safeReturnFailureClass } from '../src/lib/returnTelemetry.js';

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

test('return telemetry classifies native and safe failure targets without sensitive data', () => {
  assert.equal(classifyReturnTarget('spades-freeplay://shared-account-callback?sharedAccountCode=opaque'), 'custom-scheme-callback');
  assert.equal(classifyReturnTarget('https://onev1-spades-native-auth-qa-20260903.onrender.com/'), 'qa-spades');
  assert.equal(classifyReturnTarget('https://1v1spades.com/'), 'production-spades');
  assert.equal(safeReturnFailureClass({ code: 'authorization_issue_failed', message: 'do not expose' }), 'authorization_issue_failed');
  assert.equal(safeReturnFailureClass({ code: 'unexpected', message: 'do not expose' }), 'unknown');
});

test('QA return telemetry persists across remount and resets only its key', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const previous = process.env.APP_ENV;
  process.env.APP_ENV = 'qa-native-auth';
  persistDevReturnStatus({ returnClicked: true, statePresent: true }, storage);
  assert.equal(loadDevReturnStatus(storage).returnClicked, true);
  assert.equal(JSON.parse(values.get(QA_RETURN_TELEMETRY_KEY)).statePresent, true);
  clearDevReturnStatus(storage);
  assert.equal(values.has(QA_RETURN_TELEMETRY_KEY), false);
  assert.equal(DEFAULT_RETURN_STATUS.returnClicked, false);
  if (previous === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = previous;
});

test('return telemetry is disabled outside the QA environment', () => {
  const values = new Map();
  const storage = { getItem: () => null, setItem: (key, value) => values.set(key, value), removeItem: () => values.clear() };
  const previous = process.env.APP_ENV;
  process.env.APP_ENV = 'production';
  persistDevReturnStatus({ returnClicked: true }, storage);
  assert.equal(values.size, 0);
  assert.equal(loadDevReturnStatus(storage), null);
  if (previous === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = previous;
});

test('QA WebView bridge emits only the allowlisted return telemetry payload', () => {
  const messages = [];
  const previous = process.env.APP_ENV;
  process.env.APP_ENV = 'qa-native-auth';
  assert.equal(emitQaReturnTelemetry({ returnClicked: true, authorizationCodePresent: true, state: 'secret' }, { ReactNativeWebView: { postMessage: (value) => messages.push(JSON.parse(value)) } }), true);
  assert.deepEqual(messages[0].type, 'qa-spades-native-return-telemetry');
  assert.equal(messages[0].payload.returnClicked, true);
  assert.equal(Object.hasOwn(messages[0].payload, 'state'), false);
  assert.equal(Object.hasOwn(messages[0].payload, 'authorizationCode'), false);
  if (previous === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = previous;
});

test('QA WebView bridge ping emits exactly once with only safe fields', () => {
  const messages = [];
  const previous = process.env.APP_ENV;
  process.env.APP_ENV = 'qa-native-auth';
  const status = emitQaWebViewBridgePing({ ReactNativeWebView: { postMessage: (value) => messages.push(JSON.parse(value)) } });
  assert.deepEqual(status, { pageMounted: true, reactNativeWebViewPresent: true, pingAttempted: true });
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0], { type: 'qa-spades-webview-bridge-ping', payload: status });
  process.env.APP_ENV = previous;
});

test('QA WebView bridge ping does not call absent browser bridge', () => {
  const status = emitQaWebViewBridgePing({});
  assert.deepEqual(status, { pageMounted: true, reactNativeWebViewPresent: false, pingAttempted: false });
});

test('native Spades handoff sends the existing callback URL through the WebView bridge', () => {
  const messages = [];
  const callbackUrl = 'spades-freeplay://shared-account-callback?sharedAccountCode=opaque&state=opaque';
  assert.equal(sendNativeSpadesAuthCallback(callbackUrl, { ReactNativeWebView: { postMessage: (value) => messages.push(JSON.parse(value)) } }), true);
  assert.deepEqual(messages, [{ type: 'spades-native-auth-callback', callbackUrl }]);
});

test('ordinary browser handoff has no native callback bridge side effect', () => {
  assert.equal(sendNativeSpadesAuthCallback('spades-freeplay://shared-account-callback?sharedAccountCode=opaque&state=opaque', {}), false);
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
