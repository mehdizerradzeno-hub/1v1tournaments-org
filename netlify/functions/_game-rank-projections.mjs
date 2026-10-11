import { createHash, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

import { getStoreWithFallback } from './_account-utils.mjs';

export const GAME_RANK_PROJECTION_CONTRACT_VERSION = '2026-10-11-rank-projection-1';
export const GAME_RANK_PROJECTION_STORE = 'game-rank-projections';

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
  return `${hash(normalized.canonicalAccountId).slice(0, 48)}/${normalized.game}/${hash(normalized.leaderboard).slice(0, 24)}-${hash(normalized.season).slice(0, 24)}.json`;
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
