import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareTournamentAccountReturn } from '../src/lib/accountConnect.js';
import { SharedAccountLaunchError } from '../src/lib/sharedAccountLaunch.js';

test('Hub account sign-in returns to Spades hosting with a one-time account code', async () => {
  const requests = [];
  const launch = await prepareTournamentAccountReturn(
    'https://1v1spades.com/hosting',
    async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({
        authorization: {
          authorizationCode: 'opaque-hosting-code',
          audience: 'spades',
          protocolVersion: '2026-08-04',
          expiresAt: '2026-10-27T23:02:00.000Z',
        },
      }), { status: 201 });
    },
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/.netlify/functions/shared-account');
  assert.equal(requests[0].init.credentials, 'include');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    action: 'issue-game-authorization',
    audience: 'spades',
  });
  assert.equal(launch.authorized, true);
  const url = new URL(launch.url);
  assert.equal(url.origin, 'https://1v1spades.com');
  assert.equal(url.pathname, '/hosting');
  assert.equal(url.searchParams.get('sharedAccountCode'), 'opaque-hosting-code');
});

test('an unauthenticated hosting return fails instead of redirecting without a handoff', async () => {
  await assert.rejects(
    prepareTournamentAccountReturn(
      'https://1v1spades.com/hosting',
      async () => new Response(JSON.stringify({ error: 'Sign in before authorizing a game.' }), {
        status: 401,
      }),
    ),
    (error) => error instanceof SharedAccountLaunchError && error.code === 'unauthenticated',
  );
});

test('internal Hub returns and rejected external destinations never issue a game authorization', async () => {
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    throw new Error('No game authorization should be requested.');
  };

  for (const [returnTo, destination] of [
    ['/', '/'],
    ['/check-in/weekly-spades', '/check-in/weekly-spades'],
    ['https://attacker.example/hosting', '/'],
    ['https://1v1spades.com.attacker.example/hosting', '/'],
    ['https://1v1spades.com/hosting?returnTo=https://attacker.example', '/'],
    ['https://1v1spades.com/hosting#untrusted', '/'],
  ]) {
    assert.deepEqual(await prepareTournamentAccountReturn(returnTo, fetchImpl), {
      authorized: true,
      url: destination,
    });
  }

  assert.equal(requests, 0);
});
