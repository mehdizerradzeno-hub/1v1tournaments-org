import { connectLambda } from '@netlify/blobs';

import { listAccountsByCanonicalIds } from './_account-utils.mjs';
import { publicPlayerIdentity } from './_public-player-identity.mjs';
import {
  GameRankProjectionError,
  listPublishedGameRankBoards,
  listRankedGameProjections,
} from './_game-rank-projections.mjs';

const headers = {
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=60',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function query(event, key) {
  return String(event?.queryStringParameters?.[key] || '').trim();
}

function publicEntry(projection, accountsByCanonical) {
  const identity = publicPlayerIdentity(accountsByCanonical.get(projection.canonicalAccountId));
  if (!identity) return null;
  return {
    rank: projection.rank,
    player: identity,
    provisional: projection.provisional,
    asOf: projection.asOf,
  };
}

/**
 * Public rank-only read surface. It deliberately does not accept account IDs
 * and never exposes rating, wins, losses, or a canonical account identifier.
 */
export async function handleGameRankingsRequest(event, dependencies = {}) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'GET') return json(405, { ok: false, code: 'method_not_allowed' });

  try {
    const game = query(event, 'game');
    const leaderboard = query(event, 'leaderboard');
    const season = query(event, 'season');
    if (Boolean(leaderboard || season) && (!leaderboard || !season)) {
      throw new GameRankProjectionError('incomplete_board', 'Leaderboard and season must be requested together.');
    }

    if (!leaderboard && !season) {
      const boards = await (dependencies.listBoards || listPublishedGameRankBoards)({
        game: game || undefined,
        store: dependencies.projectionStore,
      });
      return json(200, { ok: true, boards });
    }

    const ranking = await (dependencies.listRankings || listRankedGameProjections)({
      game,
      leaderboard,
      season,
      limit: query(event, 'limit') || undefined,
      cursor: query(event, 'cursor') || undefined,
      store: dependencies.projectionStore,
    });
    const accounts = await (dependencies.resolveAccounts || listAccountsByCanonicalIds)(
      ranking.projections.map((projection) => projection.canonicalAccountId),
    );
    const accountsByCanonical = new Map(accounts.map((account) => [
      String(account?.canonicalAccountId || account?.id || '').trim(),
      account,
    ]));
    return json(200, {
      ok: true,
      board: ranking.board,
      entries: ranking.projections
        .map((projection) => publicEntry(projection, accountsByCanonical))
        .filter(Boolean),
      nextCursor: ranking.nextCursor,
    });
  } catch (error) {
    if (error instanceof GameRankProjectionError) {
      return json(error.statusCode, { ok: false, code: error.code, message: error.message });
    }
    console.error('Public game rankings failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      code: typeof error?.code === 'string' ? error.code : undefined,
    });
    return json(503, { ok: false, code: 'rankings_unavailable' });
  }
}

export async function handler(event) {
  if (event.blobs) connectLambda(event);
  return handleGameRankingsRequest(event);
}
