import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GIN_ACCOUNT_DESTINATION,
  GIN_ACCOUNT_ENTRY_ROUTE,
  normalizeGinAccountMode,
  prepareGinAccountReturn,
} from '../src/lib/ginAccountConnect.js';

test('Gin account entry preserves supported modes and targets protected staging', () => {
  assert.equal(GIN_ACCOUNT_ENTRY_ROUTE, '/connect/gin');
  assert.equal(GIN_ACCOUNT_DESTINATION, 'https://onev1-gin-staging.onrender.com/');
  assert.equal(normalizeGinAccountMode('create'), 'create');
  assert.equal(normalizeGinAccountMode(['reset']), 'reset');
  assert.equal(normalizeGinAccountMode('unknown'), 'signin');
});

test('Gin account entry requests a Gin-only, one-time shared-account launch', async () => {
  let request;
  const launch = await prepareGinAccountReturn(async (_endpoint, options) => {
    request = JSON.parse(options.body);
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        authorization: {
          protocolVersion: '2026-08-04',
          authorizationCode: 'gin-code',
          audience: 'gin',
          expiresAt: '2026-08-22T00:02:00.000Z',
        },
      }),
    };
  });

  assert.deepEqual(request, { action: 'issue-game-authorization', audience: 'gin' });
  assert.equal(new URL(launch.url).searchParams.get('sharedAccountCode'), 'gin-code');
});
