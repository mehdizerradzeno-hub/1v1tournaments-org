import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchMyReadyTournamentMatches,
  fetchTournamentPlayerStatus,
} from '../src/lib/tournamentHostingClient.js';

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

test('ready-match discovery uses the authenticated player-status scope', async () => {
  const originalFetch = globalThis.fetch;
  let request = null;
  globalThis.fetch = async (input, init) => {
    request = { init, url: String(input) };
    return new Response(JSON.stringify({ account: { id: 'account-1' }, matches: [] }), { status: 200 });
  };

  try {
    await fetchMyReadyTournamentMatches();
    assert.match(request.url, /tournament-player-status\?game=euchre&scope=ready-matches/);
    assert.equal(request.init.credentials, 'include');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
