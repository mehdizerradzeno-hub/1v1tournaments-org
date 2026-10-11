import { createHash, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

import { getStoreWithFallback } from './_account-utils.mjs';

export const GAME_RANK_PROJECTION_CONTRACT_VERSION = '2026-10-11-rank-projection-1';
export const GAME_RANK_PROJECTION_STORE = 'game-rank-projections';
export const GAME_RANKING_INDEX_PREFIX = 'ranking-index';

const GAMES = new Set(['spades', 'euchre']);
const STATUSES = new Set(['ranked', 'unranked']);
const MAX_LOOKUP_ACCOUNTS = 50;
const WRITE_ATTEMPTS = 3;

export class GameRankProjectionError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'GameRankProjectionError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function text(value, maxLength = 128) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength) : '';
}

function canonicalAccountId(value) {
  const canonical = text(value, 240);
  if (!canonical || /\s/.test(canonical)) {
    throw new GameRankProjectionError('invalid_principal', 'A canonical account ID is required.');
  }
  return canonical;
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function accountHash(value) {
  return hash(value).slice(0, 48);
}

function game(value) {
  const normalized = text(value, 16).toLowerCase();
  if (!GAMES.has(normalized)) {
    throw new GameRankProjectionError('unsupported_game', 'Choose Spades or Euchre.');
  }
  return normalized;
}

function leaderboard(value) {
  const normalized = text(value, 64).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized)) {
    throw new GameRankProjectionError('invalid_leaderboard', 'A stable leaderboard identifier is required.');
  }
  return normalized;
}

function season(value) {
  const normalized = text(value, 80).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(normalized)) {
    throw new GameRankProjectionError('invalid_season', 'A stable season identifier is required.');
  }
  return normalized;
}

function nonNegativeInteger(value, field, { required = false, maximum = 1_000_000_000 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new GameRankProjectionError('invalid_rank', `${field} is required for a ranked projection.`);
    return null;
  }
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0 || normalized > maximum) {
    throw new GameRankProjectionError('invalid_projection', `${field} must be a non-negative whole number.`);
  }
  return normalized;
}

function timestamp(value) {
  const date = new Date(text(value, 64));
  if (!Number.isFinite(date.getTime())) {
    throw new GameRankProjectionError('invalid_timestamp', 'A valid projection timestamp is required.');
  }
  return date.toISOString();
}

export function normalizeGameRankProjection(payload = {}) {
  const status = text(payload.status, 16).toLowerCase();
  if (!STATUSES.has(status)) {
    throw new GameRankProjectionError('invalid_status', 'A projection must be ranked or unranked.');
  }

  const normalized = {
    contractVersion: GAME_RANK_PROJECTION_CONTRACT_VERSION,
    canonicalAccountId: canonicalAccountId(payload.canonicalAccountId),
    game: game(payload.game),
    leaderboard: leaderboard(payload.leaderboard),
    season: season(payload.season),
    status,
    rank: nonNegativeInteger(payload.rank, 'rank', { required: status === 'ranked', maximum: 10_000_000 }),
    rating: nonNegativeInteger(payload.rating, 'rating'),
    wins: nonNegativeInteger(payload.wins, 'wins'),
    losses: nonNegativeInteger(payload.losses, 'losses'),
    provisional: payload.provisional === true,
    asOf: timestamp(payload.asOf),
  };

  if (status === 'ranked' && normalized.rank === 0) {
    throw new GameRankProjectionError('invalid_rank', 'A ranked projection must have a positive rank.');
  }
  if (status === 'unranked' && normalized.rank !== null) {
    throw new GameRankProjectionError('invalid_rank', 'An unranked projection cannot include a rank.');
  }
  return normalized;
}

export function gameRankProjectionKey(projection) {
  const normalized = normalizeGameRankProjection(projection);
  return gameRankProjectionKeyFromHashes(
    accountHash(normalized.canonicalAccountId),
    normalized.game,
    normalized.leaderboard,
    normalized.season,
  );
}

function gameRankProjectionKeyFromHashes(canonicalHash, gameValue, leaderboardValue, seasonValue) {
  return `${canonicalHash}/${gameValue}/${hash(leaderboardValue).slice(0, 24)}-${hash(seasonValue).slice(0, 24)}.json`;
}

function rankingBucketPrefix(gameValue, leaderboardValue, seasonValue) {
  return `${GAME_RANKING_INDEX_PREFIX}/${gameValue}/${hash(leaderboardValue).slice(0, 24)}-${hash(seasonValue).slice(0, 24)}`;
}

function rankingBoardKey(projection) {
  return `${rankingBucketPrefix(projection.game, projection.leaderboard, projection.season)}/board.json`;
}

function rankingEntryKey(projection) {
  if (projection.status !== 'ranked' || !projection.rank) return '';
  return `${rankingBucketPrefix(projection.game, projection.leaderboard, projection.season)}/entries/${String(projection.rank).padStart(8, '0')}-${accountHash(projection.canonicalAccountId)}.json`;
}

function keyPrefix(canonical) {
  return `${hash(canonicalAccountId(canonical)).slice(0, 48)}/`;
}

function fingerprint(projection) {
  return JSON.stringify({
    game: projection.game,
    leaderboard: projection.leaderboard,
    season: projection.season,
    status: projection.status,
    rank: projection.rank,
    rating: projection.rating,
    wins: projection.wins,
    losses: projection.losses,
    provisional: projection.provisional,
    asOf: projection.asOf,
  });
}

function projectionStore(options = {}) {
  return options.store || getStoreWithFallback(GAME_RANK_PROJECTION_STORE);
}

async function loadWithMetadata(store, key) {
  if (typeof store.getWithMetadata === 'function') {
    return store.getWithMetadata(key, { type: 'json' });
  }
  const data = await store.get(key, { type: 'json' });
  return data ? { data, etag: null } : null;
}

async function writeWithEtag(store, key, value, etag) {
  const options = {
    ...(etag ? { onlyIfMatch: etag } : { onlyIfNew: true }),
    metadata: {
      contractVersion: GAME_RANK_PROJECTION_CONTRACT_VERSION,
      game: value.game,
      leaderboard: value.leaderboard,
      season: value.season,
      status: value.status,
      asOf: value.asOf,
    },
  };
  const result = await store.setJSON(key, value, options);
  return result?.modified !== false;
}

function rankingBoard(projection, prior = null) {
  const priorAsOf = new Date(prior?.asOf || 0).getTime();
  const nextAsOf = new Date(projection.asOf).getTime();

  return {
    contractVersion: GAME_RANK_PROJECTION_CONTRACT_VERSION,
    game: projection.game,
    leaderboard: projection.leaderboard,
    season: projection.season,
    asOf: Number.isFinite(priorAsOf) && priorAsOf > nextAsOf ? prior.asOf : projection.asOf,
  };
}

/**
 * The primary projection remains account-private. The secondary board index
 * contains only a one-way account hash and a rank; public callers reload and
 * validate the primary record before a username can be returned.
 */
async function syncRankingIndex(store, projection, previous = null) {
  const boardKey = rankingBoardKey(projection);
  const currentBoard = await store.get(boardKey, { type: 'json' });
  const board = rankingBoard(projection, currentBoard);
  await store.setJSON(boardKey, board, {
    metadata: {
      contractVersion: GAME_RANK_PROJECTION_CONTRACT_VERSION,
      game: board.game,
      leaderboard: board.leaderboard,
      season: board.season,
      asOf: board.asOf,
    },
  });

  const nextKey = rankingEntryKey(projection);
  const previousKey = previous ? rankingEntryKey(previous) : '';
  if (nextKey) {
    await store.setJSON(nextKey, {
      contractVersion: GAME_RANK_PROJECTION_CONTRACT_VERSION,
      accountHash: accountHash(projection.canonicalAccountId),
      rank: projection.rank,
      asOf: projection.asOf,
    }, {
      metadata: { contractVersion: GAME_RANK_PROJECTION_CONTRACT_VERSION, asOf: projection.asOf },
    });
  }
  if (previousKey && previousKey !== nextKey && typeof store.delete === 'function') {
    await store.delete(previousKey);
  }
}

/**
 * Persists only the latest snapshot for one game/leaderboard/season key.
 * Older replays are harmless, and a same-timestamp mutation is rejected so a
 * completion can never silently revise a displayed rank snapshot.
 */
export async function upsertGameRankProjection(payload, options = {}) {
  const incoming = normalizeGameRankProjection(payload);
  const store = projectionStore(options);
  const key = gameRankProjectionKey(incoming);

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    const current = await loadWithMetadata(store, key);
    const existing = current?.data ? normalizeGameRankProjection(current.data) : null;
    if (existing) {
      const existingAt = new Date(existing.asOf).getTime();
      const incomingAt = new Date(incoming.asOf).getTime();
      if (incomingAt < existingAt) {
        return { projection: existing, duplicate: false, stale: true };
      }
      if (incomingAt === existingAt) {
        if (fingerprint(existing) === fingerprint(incoming)) {
          await syncRankingIndex(store, existing, existing);
          return { projection: existing, duplicate: true, stale: false };
        }
        throw new GameRankProjectionError(
          'conflicting_projection',
          'A different rank snapshot already exists for this timestamp.',
          409,
        );
      }
    }

    if (await writeWithEtag(store, key, incoming, current?.etag)) {
      await syncRankingIndex(store, incoming, existing);
      return { projection: incoming, duplicate: false, stale: false };
    }
  }

  throw new GameRankProjectionError('projection_busy', 'Rank projection storage was busy. Retry the same snapshot.', 503);
}

/** A game service reads these cards server-to-server, then strips canonical IDs before its browser DTO. */
export function publicGameRankCard(projection) {
  const normalized = normalizeGameRankProjection(projection);
  return {
    game: normalized.game,
    leaderboard: normalized.leaderboard,
    season: normalized.season,
    status: normalized.status,
    rank: normalized.rank,
    provisional: normalized.provisional,
    asOf: normalized.asOf,
  };
}

async function listProjectionRecords(store, canonical) {
  const records = [];
  let cursor = '';
  do {
    const page = await store.list({ prefix: keyPrefix(canonical), ...(cursor ? { cursor } : {}) });
    const loaded = await Promise.all((page.blobs || []).map((blob) => store.get(blob.key, { type: 'json' })));
    records.push(...loaded.filter(Boolean));
    cursor = page.hasMore ? text(page.cursor, 240) : '';
  } while (cursor);
  return records;
}

export async function lookupGameRankProjections(canonicalAccountIds, options = {}) {
  const identities = [...new Set((Array.isArray(canonicalAccountIds) ? canonicalAccountIds : [])
    .map((value) => canonicalAccountId(value)))];
  if (identities.length > MAX_LOOKUP_ACCOUNTS) {
    throw new GameRankProjectionError('lookup_too_large', `Lookup is limited to ${MAX_LOOKUP_ACCOUNTS} accounts.`);
  }
  const store = projectionStore(options);
  const projections = await Promise.all(identities.map(async (canonical) => ({
    canonicalAccountId: canonical,
    ranks: (await listProjectionRecords(store, canonical))
      .map(publicGameRankCard)
      .sort((left, right) => (
        left.game.localeCompare(right.game)
        || left.leaderboard.localeCompare(right.leaderboard)
        || left.season.localeCompare(right.season)
      )),
  })));
  return { contractVersion: GAME_RANK_PROJECTION_CONTRACT_VERSION, projections };
}

function publicBoard(value) {
  const normalized = {
    game: game(value?.game),
    leaderboard: leaderboard(value?.leaderboard),
    season: season(value?.season),
    asOf: timestamp(value?.asOf),
  };
  return { contractVersion: GAME_RANK_PROJECTION_CONTRACT_VERSION, ...normalized };
}

function rankingLimit(value) {
  if (value === undefined || value === null || value === '') return 25;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new GameRankProjectionError('invalid_limit', 'Ranking limit must be a whole number from 1 to 100.');
  }
  return parsed;
}

function rankingCursor(value) {
  const cursor = text(value, 512);
  if (cursor && /[\u0000-\u001f\u007f]/.test(cursor)) {
    throw new GameRankProjectionError('invalid_cursor', 'Ranking cursor is invalid.');
  }
  return cursor;
}

/** Lists public board descriptors only; these records never include players. */
export async function listPublishedGameRankBoards(options = {}) {
  const store = projectionStore(options);
  const requestedGame = options.game === undefined || options.game === null || options.game === ''
    ? ''
    : game(options.game);
  const prefix = requestedGame
    ? `${GAME_RANKING_INDEX_PREFIX}/${requestedGame}/`
    : `${GAME_RANKING_INDEX_PREFIX}/`;
  const boards = [];
  let cursor = '';

  do {
    const page = await store.list({ prefix, ...(cursor ? { cursor } : {}) });
    const keys = (page.blobs || [])
      .map((blob) => text(blob?.key, 1_000))
      .filter((key) => key.endsWith('/board.json'));
    const records = await Promise.all(keys.map((key) => store.get(key, { type: 'json' })));
    records.forEach((record) => {
      try {
        const board = publicBoard(record);
        if (!requestedGame || board.game === requestedGame) boards.push(board);
      } catch {
        // One corrupt index record cannot make all public boards unavailable.
      }
    });
    cursor = page.hasMore ? text(page.cursor, 512) : '';
  } while (cursor);

  return boards.sort((left, right) => (
    left.game.localeCompare(right.game)
    || right.asOf.localeCompare(left.asOf)
    || left.leaderboard.localeCompare(right.leaderboard)
    || right.season.localeCompare(left.season)
  ));
}

/**
 * Server-only ranking lookup for one board. The HTTP route must resolve these
 * canonical identities to claimed usernames and strip all private fields.
 */
export async function listRankedGameProjections(options = {}) {
  const requestedGame = game(options.game);
  const requestedLeaderboard = leaderboard(options.leaderboard);
  const requestedSeason = season(options.season);
  const limit = rankingLimit(options.limit);
  const cursor = rankingCursor(options.cursor);
  const store = projectionStore(options);
  const prefix = `${rankingBucketPrefix(requestedGame, requestedLeaderboard, requestedSeason)}/entries/`;
  const page = await store.list({ prefix, ...(cursor ? { cursor } : {}) });
  const projections = await Promise.all((page.blobs || []).map(async (blob) => {
    const entryKey = text(blob?.key, 1_000);
    const indexEntry = await store.get(entryKey, { type: 'json' });
    const match = /entries\/\d{8}-([a-f0-9]{48})\.json$/.exec(entryKey);
    if (!indexEntry || !match) return null;
    const primaryKey = gameRankProjectionKeyFromHashes(
      match[1], requestedGame, requestedLeaderboard, requestedSeason,
    );
    const projection = await store.get(primaryKey, { type: 'json' });
    if (!projection) return null;
    try {
      const normalized = normalizeGameRankProjection(projection);
      return normalized.game === requestedGame
        && normalized.leaderboard === requestedLeaderboard
        && normalized.season === requestedSeason
        && normalized.status === 'ranked'
        && normalized.rank === Number(indexEntry.rank)
        ? normalized
        : null;
    } catch {
      return null;
    }
  }));
  const byAccount = new Map();
  projections.filter(Boolean).forEach((projection) => {
    const existing = byAccount.get(projection.canonicalAccountId);
    if (!existing || projection.rank < existing.rank) byAccount.set(projection.canonicalAccountId, projection);
  });

  return {
    contractVersion: GAME_RANK_PROJECTION_CONTRACT_VERSION,
    board: { game: requestedGame, leaderboard: requestedLeaderboard, season: requestedSeason },
    projections: [...byAccount.values()]
      .sort((left, right) => left.rank - right.rank || left.asOf.localeCompare(right.asOf))
      .slice(0, limit),
    nextCursor: page.hasMore ? text(page.cursor, 512) || null : null,
  };
}

function expectedServiceToken(audience, env) {
  return audience === 'spades'
    ? text(env.SPADES_RANK_PROJECTION_TOKEN, 8_192)
    : text(env.EUCHRE_RANK_PROJECTION_TOKEN, 8_192);
}

export function validateGameRankProjectionServiceCaller(event, audienceValue, { env = process.env } = {}) {
  const audience = game(audienceValue);
  const expected = expectedServiceToken(audience, env);
  if (expected.length < 32) {
    throw new GameRankProjectionError('projection_service_unconfigured', 'Rank projection service authorization is not configured.', 503);
  }
  const authorization = text(event.headers?.authorization || event.headers?.Authorization, 8_192);
  const received = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new GameRankProjectionError('service_not_authorized', 'Rank projection service authorization was rejected.', 401);
  }
  return audience;
}
