import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SHARED_ACCOUNT_CODE_QUERY_PARAMETER,
  SHARED_ACCOUNT_ENDPOINT,
  SharedAccountLaunchError,
  openSharedAccountGame,
  prepareSharedAccountLaunch,
} from '../src/lib/sharedAccountLaunch.js';

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function issueResponse(audience, authorizationCode = 'opaque-code') {
  return response(201, {
    ok: true,
    authorization: {
      protocolVersion: '2026-08-04',
      authorizationCode,
      audience,
      expiresAt: '2026-08-07T12:02:00.000Z',
    },
  });
}

test('authenticated Spades issues immediately before opening with sharedAccountCode', async () => {
  const operations = [];
  const launch = await openSharedAccountGame({
    audience: 'spades',
    destinationUrl: 'https://1v1spades.com',
    fetchImpl: async (endpoint, options) => {
      operations.push({ type: 'issue', endpoint, body: JSON.parse(options.body) });
      return issueResponse('spades', 'spades-code');
    },
    openUrl: async (url) => operations.push({ type: 'open', url }),
  });

  assert.deepEqual(operations.map((operation) => operation.type), ['issue', 'open']);
  assert.equal(operations[0].endpoint, SHARED_ACCOUNT_ENDPOINT);
  assert.deepEqual(operations[0].body, { action: 'issue-game-authorization', audience: 'spades' });
  assert.equal(new URL(launch.url).searchParams.get(SHARED_ACCOUNT_CODE_QUERY_PARAMETER), 'spades-code');
});

test('authenticated Euchre uses only the Euchre audience', async () => {
  let requestBody;
  const launch = await prepareSharedAccountLaunch({
    audience: 'euchre',
    destinationUrl: 'https://1v1euchre.com/play',
    fetchImpl: async (_endpoint, options) => {
      requestBody = JSON.parse(options.body);
      return issueResponse('euchre', 'euchre-code');
    },
  });

  assert.equal(requestBody.audience, 'euchre');
  assert.equal(new URL(launch.url).searchParams.get('sharedAccountCode'), 'euchre-code');
  assert.equal(launch.url.includes('1v1spades.com'), false);
});

test('tournament launch preserves ticket and URL-encodes a distinct account code', async () => {
  const launch = await prepareSharedAccountLaunch({
    audience: 'spades',
    destinationUrl: 'https://1v1spades.com/match/match-1?ticket=tournament-ticket',
    fetchImpl: async () => issueResponse('spades', 'account+code/with?symbols='),
    requireAccount: true,
  });
  const url = new URL(launch.url);

  assert.equal(url.searchParams.get('ticket'), 'tournament-ticket');
  assert.equal(url.searchParams.get('sharedAccountCode'), 'account+code/with?symbols=');
  assert.match(launch.url, /sharedAccountCode=account%2Bcode%2Fwith%3Fsymbols%3D/);
});

test('signed-out normal launch retains guest behavior without fabricating identity claims', async () => {
  const destinationUrl = 'https://1v1spades.com/guest';
  const launch = await prepareSharedAccountLaunch({
    audience: 'spades',
    destinationUrl,
    fetchImpl: async () => response(401, { error: 'Sign in before authorizing a game.' }),
  });

  assert.equal(launch.authorized, false);
  assert.equal(launch.url, destinationUrl);
  assert.equal(launch.url.includes('sharedAccountCode'), false);
  assert.equal(launch.url.includes('canonicalAccountId'), false);
  assert.equal(launch.url.includes('aliases'), false);
});

test('unsupported audience is rejected before contacting the Hub', async () => {
  let contacted = false;
  await assert.rejects(
    prepareSharedAccountLaunch({
      audience: 'hearts',
      destinationUrl: 'https://game.example',
      fetchImpl: async () => {
        contacted = true;
        return issueResponse('spades');
      },
    }),
    (error) => error instanceof SharedAccountLaunchError && error.code === 'unsupported_audience',
  );
  assert.equal(contacted, false);
});

test('issue failures return a retryable safe error and do not open a game', async () => {
  let opened = false;
  await assert.rejects(
    openSharedAccountGame({
      audience: 'spades',
      destinationUrl: 'https://1v1spades.com',
      fetchImpl: async () => response(503, { error: 'Account Hub unavailable.' }),
      openUrl: async () => { opened = true; },
    }),
    (error) => error instanceof SharedAccountLaunchError && error.retryable,
  );
  assert.equal(opened, false);
});

test('audience mismatch cannot cross-authorize Spades and Euchre', async () => {
  await assert.rejects(
    prepareSharedAccountLaunch({
      audience: 'spades',
      destinationUrl: 'https://1v1spades.com',
      fetchImpl: async () => issueResponse('euchre', 'wrong-game-code'),
    }),
    (error) => error instanceof SharedAccountLaunchError && error.code === 'authorization_contract_mismatch',
  );
});

test('launch URL contains no game secret or client-trusted canonical identity', async () => {
  const launch = await prepareSharedAccountLaunch({
    audience: 'spades',
    destinationUrl: 'https://1v1spades.com/play',
    fetchImpl: async (_endpoint, options) => {
      assert.equal(options.headers.Authorization, undefined);
      return issueResponse('spades', 'public-opaque-code');
    },
  });

  assert.equal(launch.url.includes('SHARED_ACCOUNT_SPADES_SECRET'), false);
  assert.equal(launch.url.includes('canonicalAccountId'), false);
  assert.equal(launch.url.includes('aliases'), false);
});

test('unavailable and malformed destinations fail before issuing a code', async () => {
  let contacted = false;
  const fetchImpl = async () => {
    contacted = true;
    return issueResponse('spades');
  };

  await assert.rejects(
    prepareSharedAccountLaunch({ audience: 'spades', destinationUrl: '', fetchImpl }),
    (error) => error.code === 'destination_unavailable',
  );
  await assert.rejects(
    prepareSharedAccountLaunch({ audience: 'spades', destinationUrl: 'not-a-url', fetchImpl }),
    (error) => error.code === 'malformed_destination',
  );
  assert.equal(contacted, false);
});
