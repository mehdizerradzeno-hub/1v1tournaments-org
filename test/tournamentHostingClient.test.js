import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchTournamentPlayerStatus } from '../src/lib/tournamentHostingClient.js';

test('hosting client never exposes an HTML response as a user-facing error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<!doctype html><html><body>private markup</body></html>', { status: 404 });

  try {
    await assert.rejects(
      fetchTournamentPlayerStatus({ slug: 'test-event' }),
      /The server returned an unreadable response\./,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('hosting client requests authenticated global active-match discovery without a tournament slug', async () => {
  const originalFetch = globalThis.fetch;
  let request = null;
  globalThis.fetch = async (input, init) => {
    request = { input, init };
    return new Response(JSON.stringify({
      ok: true,
      scope: 'active-match',
      activeMatch: null,
      activeMatchCount: 0,
    }), { status: 200 });
  };

  try {
    const result = await fetchTournamentPlayerStatus({});

    assert.equal(request.input, '/.netlify/functions/tournament-player-status');
    assert.equal(request.init.credentials, 'include');
    assert.equal(result.scope, 'active-match');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
