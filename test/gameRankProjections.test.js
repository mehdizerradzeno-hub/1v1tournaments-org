import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GameRankProjectionError,
  listPublishedGameRankBoards,
  listRankedGameProjections,
  lookupGameRankProjections,
  normalizeGameRankProjection,
  upsertGameRankProjection,
} from '../netlify/functions/_game-rank-projections.mjs';
import { handleRankProjectionRequest } from '../netlify/functions/rank-projections.mjs';
import { handleGameRankingsRequest } from '../netlify/functions/game-rankings.mjs';

class ProjectionStore {
  constructor() {
    this.records = new Map();
    this.version = 0;
  }

  async getWithMetadata(key) {
    const record = this.records.get(key);
    return record ? { data: structuredClone(record.data), etag: record.etag } : null;
  }

  async get(key) {
    const record = this.records.get(key);
    return record ? structuredClone(record.data) : null;
  }

  async setJSON(key, value, options = {}) {
    const existing = this.records.get(key);
    if (options.onlyIfNew && existing) return { modified: false };
    if (options.onlyIfMatch && existing?.etag !== options.onlyIfMatch) return { modified: false };
    if (options.onlyIfMatch && !existing) return { modified: false };
    this.version += 1;
    this.records.set(key, { data: structuredClone(value), etag: `etag-${this.version}` });
    return { modified: true, etag: `etag-${this.version}` };
  }

  async delete(key) {
    this.records.delete(key);
  }

  async list({ prefix = '' } = {}) {
    return {
      blobs: [...this.records.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })),
      hasMore: false,
    };
  }
}

function spadesProjection(overrides = {}) {
  return {
    canonicalAccountId: 'canonical-alice',
    game: 'spades',
    leaderboard: 'v1_1_ranked',
    season: '2026-q4',
    status: 'ranked',
    rank: 4,
    rating: 1728,
    wins: 18,
    losses: 4,
    provisional: false,
    asOf: '2026-10-11T16:00:00.000Z',
    ...overrides,
  };
}

test('projection normalization preserves game-specific stats but requires a safe ranked card', () => {
  const normalized = normalizeGameRankProjection(spadesProjection());
  assert.equal(normalized.rank, 4);
  assert.equal(normalized.rating, 1728);
  assert.throws(
    () => normalizeGameRankProjection(spadesProjection({ status: 'unranked', rank: 4 })),
    (error) => error instanceof GameRankProjectionError && error.code === 'invalid_rank',
  );
  assert.throws(
    () => normalizeGameRankProjection(spadesProjection({ game: 'hearts' })),
    (error) => error instanceof GameRankProjectionError && error.code === 'unsupported_game',
  );
});

test('rank projections are idempotent, reject same-time revisions, and ignore stale replays', async () => {
  const store = new ProjectionStore();
  const first = await upsertGameRankProjection(spadesProjection(), { store });
  const duplicate = await upsertGameRankProjection(spadesProjection(), { store });
  const stale = await upsertGameRankProjection(spadesProjection({ rank: 9, asOf: '2026-10-11T15:59:59.000Z' }), { store });

  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(stale.stale, true);
  assert.equal(stale.projection.rank, 4);
  await assert.rejects(
    upsertGameRankProjection(spadesProjection({ rank: 5 }), { store }),
    (error) => error instanceof GameRankProjectionError && error.code === 'conflicting_projection',
  );
});

test('trusted lookup returns only safe rank cards while retaining canonical IDs for the game server mapping', async () => {
  const store = new ProjectionStore();
  await upsertGameRankProjection(spadesProjection(), { store });
  await upsertGameRankProjection({
    canonicalAccountId: 'canonical-alice',
    game: 'euchre',
    leaderboard: 'human_elo',
    season: '2026-q4',
    status: 'unranked',
    asOf: '2026-10-11T16:05:00.000Z',
  }, { store });

  const lookup = await lookupGameRankProjections(['canonical-alice'], { store });
  assert.deepEqual(lookup.projections, [{
    canonicalAccountId: 'canonical-alice',
    ranks: [
      { game: 'euchre', leaderboard: 'human_elo', season: '2026-q4', status: 'unranked', rank: null, provisional: false, asOf: '2026-10-11T16:05:00.000Z' },
      { game: 'spades', leaderboard: 'v1_1_ranked', season: '2026-q4', status: 'ranked', rank: 4, provisional: false, asOf: '2026-10-11T16:00:00.000Z' },
    ],
  }]);
  assert.doesNotMatch(JSON.stringify(lookup.projections[0].ranks), /1728|18|4.*losses/);
});

test('public board index exposes claimed usernames and rank cards without canonical IDs or game statistics', async () => {
  const store = new ProjectionStore();
  await upsertGameRankProjection(spadesProjection(), { store });
  await upsertGameRankProjection(spadesProjection({
    canonicalAccountId: 'canonical-bob',
    rank: 1,
    rating: 1810,
    wins: 22,
    losses: 3,
    asOf: '2026-10-11T16:01:00.000Z',
  }), { store });

  const boards = await listPublishedGameRankBoards({ store, game: 'spades' });
  assert.deepEqual(boards, [{
    contractVersion: '2026-10-11-rank-projection-1',
    game: 'spades',
    leaderboard: 'v1_1_ranked',
    season: '2026-q4',
    asOf: '2026-10-11T16:01:00.000Z',
  }]);
  assert.doesNotMatch(JSON.stringify(boards), /canonical|rating|wins|losses/);

  const serverRanking = await listRankedGameProjections({
    store,
    game: 'spades',
    leaderboard: 'v1_1_ranked',
    season: '2026-q4',
  });
  assert.deepEqual(serverRanking.projections.map((projection) => projection.rank), [1, 4]);
  assert.equal(serverRanking.projections[0].canonicalAccountId, 'canonical-bob');

  const response = await handleGameRankingsRequest({
    httpMethod: 'GET',
    queryStringParameters: {
      game: 'spades',
      leaderboard: 'v1_1_ranked',
      season: '2026-q4',
    },
  }, {
    projectionStore: store,
    resolveAccounts: async () => [
      {
        canonicalAccountId: 'canonical-alice',
        playerHandle: 'alice_ranked',
        usernameClaimedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        canonicalAccountId: 'canonical-bob',
        playerHandle: 'legacy-bob',
      },
    ],
  });

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.deepEqual(body.entries, [{
    rank: 4,
    player: { handle: 'alice_ranked', displayName: 'alice_ranked' },
    provisional: false,
    asOf: '2026-10-11T16:00:00.000Z',
  }]);
  assert.doesNotMatch(response.body, /canonical|rating|wins|losses|legacy-bob/);
});

test('rank index removes a player’s old slot after a newer projection', async () => {
  const store = new ProjectionStore();
  await upsertGameRankProjection(spadesProjection({ rank: 8 }), { store });
  await upsertGameRankProjection(spadesProjection({
    rank: 2,
    asOf: '2026-10-11T16:02:00.000Z',
  }), { store });

  const ranking = await listRankedGameProjections({
    store,
    game: 'spades',
    leaderboard: 'v1_1_ranked',
    season: '2026-q4',
  });
  assert.deepEqual(ranking.projections.map((projection) => projection.rank), [2]);
});

test('HTTP contract is service-authenticated, game-bound, and account-checked', async () => {
  const store = new ProjectionStore();
  const env = { SPADES_RANK_PROJECTION_TOKEN: 's'.repeat(32) };
  const baseEvent = {
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${'s'.repeat(32)}` },
  };
  const upsert = await handleRankProjectionRequest({
    ...baseEvent,
    body: JSON.stringify({ audience: 'spades', action: 'upsert', projection: spadesProjection() }),
  }, {
    env,
    projectionStore: store,
    resolveAccounts: async () => [{ canonicalAccountId: 'canonical-alice' }],
  });
  assert.equal(upsert.statusCode, 200);
  assert.equal(JSON.parse(upsert.body).projection.rank, 4);

  const wrongAudience = await handleRankProjectionRequest({
    ...baseEvent,
    body: JSON.stringify({ audience: 'spades', action: 'upsert', projection: spadesProjection({ game: 'euchre' }) }),
  }, {
    env,
    projectionStore: store,
    resolveAccounts: async () => [{ canonicalAccountId: 'canonical-alice' }],
  });
  assert.equal(wrongAudience.statusCode, 403);
  assert.equal(JSON.parse(wrongAudience.body).code, 'wrong_audience');

  const lookup = await handleRankProjectionRequest({
    ...baseEvent,
    body: JSON.stringify({ audience: 'spades', action: 'lookup', canonicalAccountIds: ['canonical-alice'] }),
  }, { env, projectionStore: store });
  assert.equal(lookup.statusCode, 200);
  assert.equal(JSON.parse(lookup.body).projections[0].ranks[0].rank, 4);

  const browserAttempt = await handleRankProjectionRequest({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ audience: 'spades', action: 'lookup', canonicalAccountIds: ['canonical-alice'] }),
  }, { env, projectionStore: store });
  assert.equal(browserAttempt.statusCode, 401);
  assert.equal(JSON.parse(browserAttempt.body).code, 'service_not_authorized');
});
