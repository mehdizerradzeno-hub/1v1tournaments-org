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
