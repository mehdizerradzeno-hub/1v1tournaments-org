import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertTournamentMatchNotRevoked,
  collectSpadesTeardownTargets,
  orchestrateSpadesTournamentTeardown,
  TournamentTeardownError,
} from '../netlify/functions/_tournament-teardown-utils.mjs';

function activeBracket(overrides = {}) {
  return {
    tournamentSlug: 'safe-spades-event',
    gameSlug: 'spades',
    rounds: [{
      matches: [{
        id: 'safe-spades-event-r1-m1',
        status: 'ready',
        players: [{ id: 'a' }, { id: 'b' }],
      }],
    }],
    ...overrides,
  };
}

test('ticket revocation rejects all old tickets without storing raw ticket values', () => {
  assert.throws(
    () => assertTournamentMatchNotRevoked({
      matchId: 'safe-spades-event-r1-m1',
      revokedAt: '2026-08-12T12:00:00.000Z',
    }),
    (error) => error instanceof TournamentTeardownError
      && error.code === 'ticket_revoked'
      && error.statusCode === 410,
  );
});

test('active Spades matches produce exact match and room-bound teardown targets', () => {
  assert.deepEqual(collectSpadesTeardownTargets(activeBracket()), [{
    tournamentSlug: 'safe-spades-event',
    matchId: 'safe-spades-event-r1-m1',
    roomId: 'safe-spades-event-r1-m1',
    game: 'spades',
  }]);
});

test('completed result metadata blocks destructive cleanup', () => {
  const bracket = activeBracket();
  bracket.rounds[0].matches[0].status = 'final';
  bracket.rounds[0].matches[0].winnerId = 'a';
  assert.throws(
    () => collectSpadesTeardownTargets(bracket),
    (error) => error.code === 'completed_results_preserved' && error.statusCode === 409,
  );
});

test('teardown persists revocation before remote abandon and retries only the failed phase', async () => {
  let operation = null;
  let revokeCalls = 0;
  let abandonCalls = 0;
  const targets = collectSpadesTeardownTargets(activeBracket());
  const dependencies = {
    loadOperation: async () => operation,
    saveOperation: async (next) => {
      operation = structuredClone(next);
    },
    revoke: async () => {
      revokeCalls += 1;
      return { record: { revokedAt: '2026-08-12T12:00:00.000Z' }, duplicate: false };
    },
    abandonRoom: async () => {
      abandonCalls += 1;
      if (abandonCalls === 1) throw new Error('temporary outage');
      return { ok: true, status: 'abandoned', abandonedAt: '2026-08-12T12:00:01.000Z' };
    },
  };

  await assert.rejects(
    orchestrateSpadesTournamentTeardown({
      tournamentSlug: 'safe-spades-event',
      targets,
      dependencies,
    }),
    (error) => error.code === 'partial_teardown' && error.statusCode === 502,
  );
  assert.equal(operation.matches[0].ticketRevokedAt, '2026-08-12T12:00:00.000Z');
  assert.equal(operation.matches[0].roomAbandonedAt, null);

  const retry = await orchestrateSpadesTournamentTeardown({
    tournamentSlug: 'safe-spades-event',
    targets,
    dependencies,
  });
  assert.equal(revokeCalls, 1);
  assert.equal(abandonCalls, 2);
  assert.equal(retry.operation.status, 'remote_complete');
  assert.equal(retry.operation.matches[0].roomStatus, 'abandoned');
  assert.equal('winnerId' in retry.operation, false);
  assert.equal('result' in retry.operation, false);
});

test('a completed teardown retry is an idempotent no-op', async () => {
  const operation = {
    tournamentSlug: 'safe-spades-event',
    status: 'completed',
    matches: [],
  };
  const result = await orchestrateSpadesTournamentTeardown({
    tournamentSlug: 'safe-spades-event',
    targets: [],
    dependencies: {
      loadOperation: async () => operation,
      saveOperation: async () => {
        throw new Error('must not write');
      },
    },
  });
  assert.equal(result.duplicate, true);
  assert.equal(result.operation, operation);
});
