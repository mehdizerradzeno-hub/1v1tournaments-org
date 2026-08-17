import { getStore } from '@netlify/blobs';

import { getJsonWithRetry, getStoreWithFallback } from './_account-utils.mjs';

const REVOCATION_STORE = 'tournament-match-revocations';
const TEARDOWN_STORE = 'tournament-match-teardowns';
const MATCH_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*-r[1-9]\d*-m[1-9]\d*$/i;

export class TournamentTeardownError extends Error {
  constructor(message, code, statusCode = 400, details = null) {
    super(message);
    this.name = 'TournamentTeardownError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function clean(value) {
  return String(value || '').trim();
}

function matchKey(matchId) {
  const normalized = clean(matchId);
  if (!MATCH_ID_PATTERN.test(normalized)) {
    throw new TournamentTeardownError('A valid tournament match is required.', 'invalid_match', 400);
  }
  return normalized + '.json';
}

function operationKey(tournamentSlug) {
  const normalized = clean(tournamentSlug);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(normalized)) {
    throw new TournamentTeardownError('A valid tournament is required.', 'invalid_tournament', 400);
  }
  return normalized + '.json';
}

function storeWithFallback(name) {
  if (typeof getStoreWithFallback === 'function') {
    return getStoreWithFallback(name);
  }
  return getStore(name);
}

export async function loadTournamentMatchRevocation(matchId, store = storeWithFallback(REVOCATION_STORE)) {
  return getJsonWithRetry(store, matchKey(matchId));
}

export async function revokeTournamentMatch({
  tournamentSlug,
  matchId,
  roomId,
  game = 'spades',
  revokedBy = 'tournament-admin',
  now = new Date(),
}, store = storeWithFallback(REVOCATION_STORE)) {
  const key = matchKey(matchId);
  const existing = await getJsonWithRetry(store, key);
  if (existing) {
    if (
      existing.tournamentSlug !== tournamentSlug
      || existing.roomId !== roomId
      || existing.game !== game
    ) {
      throw new TournamentTeardownError(
        'That match already has a conflicting revocation record.',
        'revocation_conflict',
        409,
      );
    }
    return { record: existing, duplicate: true };
  }

  const record = {
    version: 1,
    tournamentSlug,
    matchId,
    roomId,
    game,
    revokedAt: now.toISOString(),
    revokedBy,
  };
  await store.setJSON(key, record, {
    metadata: { tournamentSlug, matchId, roomId, game },
  });
  return { record, duplicate: false };
}

export function assertTournamentMatchNotRevoked(revocation) {
  if (revocation) {
    throw new TournamentTeardownError(
      'This tournament match was closed by the host. A previous ticket cannot be used.',
      'ticket_revoked',
      410,
    );
  }
}

export function collectSpadesTeardownTargets(bracket) {
  const game = clean(bracket?.gameSlug || bracket?.game || 'spades').toLowerCase();
  const matches = (bracket?.rounds || []).flatMap((round) => round?.matches || []);
  if (matches.some((match) => match?.status === 'final' || match?.winnerId || match?.completion)) {
    throw new TournamentTeardownError(
      'Completed tournament results must be archived and cannot be cleared.',
      'completed_results_preserved',
      409,
    );
  }

  const active = matches.filter((match) => (
    match
    && match.status !== 'final'
    && Array.isArray(match.players)
    && match.players.filter(Boolean).length === 2
  ));
  if (active.length > 0 && game !== 'spades') {
    throw new TournamentTeardownError(
      'Safe room teardown is not configured for this tournament game.',
      'game_teardown_unavailable',
      409,
    );
  }

  return active.map((match) => ({
    tournamentSlug: clean(bracket.tournamentSlug),
    matchId: clean(match.id),
    roomId: clean(match.roomId || match.id),
    game,
  }));
}

export async function orchestrateSpadesTournamentTeardown({
  tournamentSlug,
  targets,
  actor = 'tournament-admin',
  now = () => new Date(),
  dependencies = {},
}) {
  const operationStore = dependencies.operationStore;
  const revocationStore = dependencies.revocationStore;
  const loadOperation = dependencies.loadOperation
    || ((slug) => getJsonWithRetry(operationStore || storeWithFallback(TEARDOWN_STORE), operationKey(slug)));
  const saveOperation = dependencies.saveOperation
    || ((operation) => (operationStore || storeWithFallback(TEARDOWN_STORE))
      .setJSON(operationKey(operation.tournamentSlug), operation));
  const revoke = dependencies.revoke
    || ((target) => revokeTournamentMatch(
      { ...target, revokedBy: actor, now: now() },
      revocationStore || storeWithFallback(REVOCATION_STORE),
    ));
  const abandonRoom = dependencies.abandonRoom;

  if (typeof abandonRoom !== 'function' && targets.length > 0) {
    throw new TournamentTeardownError(
      'Spades room teardown is not configured.',
      'spades_teardown_unavailable',
      503,
    );
  }

  const previous = await loadOperation(tournamentSlug);
  const operation = previous || {
    version: 1,
    tournamentSlug,
    status: 'pending',
    createdAt: now().toISOString(),
    updatedAt: now().toISOString(),
    matches: targets.map((target) => ({
      ...target,
      ticketRevokedAt: null,
      roomAbandonedAt: null,
    })),
  };
  if (operation.status === 'completed') {
    return { operation, duplicate: true };
  }

  try {
    for (const target of operation.matches) {
      if (!target.ticketRevokedAt) {
        const revoked = await revoke(target);
        target.ticketRevokedAt = revoked.record.revokedAt;
        operation.updatedAt = now().toISOString();
        operation.status = 'ticket_revoked';
        await saveOperation(operation);
      }
      if (!target.roomAbandonedAt) {
        const result = await abandonRoom(target);
        target.roomAbandonedAt = result.abandonedAt || now().toISOString();
        target.roomStatus = result.status || 'abandoned';
        operation.updatedAt = now().toISOString();
        operation.status = 'room_abandoned';
        await saveOperation(operation);
      }
    }
    operation.status = 'remote_complete';
    operation.lastError = null;
    operation.updatedAt = now().toISOString();
    await saveOperation(operation);
    return { operation, duplicate: false };
  } catch (error) {
    operation.status = 'partial_failure';
    operation.lastError = {
      code: error?.code || 'room_abandon_failed',
      message: error instanceof Error ? error.message : 'Spades room teardown failed.',
      at: now().toISOString(),
    };
    operation.updatedAt = now().toISOString();
    await saveOperation(operation);
    throw new TournamentTeardownError(
      'Ticket access is revoked, but the Spades room could not be confirmed closed. Retry this operation.',
      'partial_teardown',
      502,
      operation,
    );
  }
}

export async function markTournamentTeardownComplete(
  operation,
  store = storeWithFallback(TEARDOWN_STORE),
  now = new Date(),
) {
  const completed = {
    ...operation,
    status: 'completed',
    localCleanupAt: operation.localCleanupAt || now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await store.setJSON(operationKey(completed.tournamentSlug), completed);
  return completed;
}

export async function loadTournamentTeardown(tournamentSlug, store = storeWithFallback(TEARDOWN_STORE)) {
  return getJsonWithRetry(store, operationKey(tournamentSlug));
}

export function spadesTournamentTeardownEndpoint(baseUrl = process.env.SPADES_MATCH_BASE_URL) {
  try {
    const url = new URL(clean(baseUrl));
    return new URL('/api/tournament/abandon', url.origin).toString();
  } catch {
    throw new TournamentTeardownError(
      'Spades room teardown is not configured.',
      'spades_teardown_unavailable',
      503,
    );
  }
}

export async function requestSpadesRoomAbandonment(
  target,
  fetchImpl = globalThis.fetch,
  token = process.env.TOURNAMENT_MATCH_RESULT_TOKEN,
) {
  if (!clean(token)) {
    throw new TournamentTeardownError(
      'Spades room teardown authentication is not configured.',
      'spades_teardown_unavailable',
      503,
    );
  }
  const response = await fetchImpl(spadesTournamentTeardownEndpoint(), {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'abandon-match',
      game: 'spades',
      tournamentSlug: target.tournamentSlug,
      matchId: target.matchId,
      roomId: target.roomId,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok !== true) {
    throw new TournamentTeardownError(
      result?.error || 'Spades did not confirm room teardown.',
      result?.code || 'room_abandon_failed',
      response.status || 502,
    );
  }
  return result;
}
