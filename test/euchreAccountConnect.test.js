import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveAccountConnectMode, runAccountHandoffOnce } from '../src/lib/accountConnect.js';
import {
  EUCHRE_ACCOUNT_DESTINATION,
  EUCHRE_ACCOUNT_ENTRY_ROUTE,
  EUCHRE_SIGNED_OUT_ACCOUNT_ACTIONS,
  normalizeEuchreAccountMode,
  prepareEuchreAccountReturn,
} from '../src/lib/euchreAccountConnect.js';

test('Euchre account entry exposes sign in, create, reset, manage, and safe invalid-mode fallback', () => {
  assert.equal(EUCHRE_ACCOUNT_ENTRY_ROUTE, '/connect/euchre');
  assert.deepEqual(EUCHRE_SIGNED_OUT_ACCOUNT_ACTIONS, [
    { id: 'signin', label: 'Sign In' },
    { id: 'create', label: 'Create Account' },
    { id: 'reset', label: 'Forgot / Reset Password' },
  ]);
  assert.equal(normalizeEuchreAccountMode('signin'), 'signin');
  assert.equal(normalizeEuchreAccountMode('create'), 'create');
  assert.equal(normalizeEuchreAccountMode('reset'), 'reset');
  assert.equal(normalizeEuchreAccountMode('manage'), 'manage');
  assert.equal(normalizeEuchreAccountMode('unknown'), 'signin');
});

test('signed-in Euchre uses manage mode and signed-out manage safely returns to sign in', () => {
  assert.equal(resolveAccountConnectMode('signin', { hasAccount: true, signedOutManageFallback: true }), 'manage');
  assert.equal(resolveAccountConnectMode('manage', { hasAccount: false, signedOutManageFallback: true }), 'signin');
});

test('successful Euchre auth issues only the established one-time Euchre handoff', async () => {
  const requests = [];
  const launch = await prepareEuchreAccountReturn(async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({
      authorization: {
        authorizationCode: 'opaque-one-time-euchre-code',
        audience: 'euchre',
        protocolVersion: '2026-08-04',
        expiresAt: '2026-08-08T15:00:00.000Z',
      },
    }), { status: 200 });
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/.netlify/functions/shared-account');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    action: 'issue-game-authorization',
    audience: 'euchre',
  });
  assert.equal(launch.authorized, true);
  assert.equal(new URL(launch.url).origin, 'https://onev1-euchre-preview.onrender.com');
  assert.equal(new URL(launch.url).searchParams.get('sharedAccountCode'), 'opaque-one-time-euchre-code');
});

test('Euchre return target is fixed and never falls back to Tournaments root or an arbitrary redirect', () => {
  assert.equal(EUCHRE_ACCOUNT_DESTINATION, 'https://onev1-euchre-preview.onrender.com/');
  assert.notEqual(EUCHRE_ACCOUNT_DESTINATION, 'https://1v1tournaments.org/');
  assert.equal(prepareEuchreAccountReturn.length, 0);
});

test('authorization handoff executes exactly once and releases the gate after failure', async () => {
  const gate = { current: false };
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const operation = async () => {
    calls += 1;
    await pending;
    return 'ok';
  };
  const first = runAccountHandoffOnce(gate, operation);
  const second = await runAccountHandoffOnce(gate, operation);

  assert.equal(second.executed, false);
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await first, { executed: true, value: 'ok' });

  const retryGate = { current: false };
  await assert.rejects(() => runAccountHandoffOnce(retryGate, async () => {
    throw new Error('temporary failure');
  }), /temporary failure/);
  assert.equal(retryGate.current, false);
});
