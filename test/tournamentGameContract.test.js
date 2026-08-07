import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TOURNAMENT_GAME_PROTOCOL_VERSION,
  TOURNAMENT_MATCH_TICKET_TTL_MS,
  TournamentGameContractError,
  assertTournamentTicketAccess,
  buildTournamentLaunchUrl,
  normalizeTournamentResultCallback,
} from '../netlify/functions/_tournament-game-contract.mjs';
import {
  applyAuthoritativeTournamentResult,
  buildBracket,
  findMatch,
  handler as bracketHandler,
} from '../netlify/functions/tournament-bracket.mjs';
import { ticketKey } from '../netlify/functions/tournament-match-access.mjs';

function signup(index) {
  return {
    id: `signup-${index}`,
    accountId: `legacy-${index}`,
    canonicalAccountId: `acct-${index}`,
    playerName: `Player ${index}`,
    playerHandle: `player${index}`,
    createdAt: `2026-08-0${index}T12:00:00.000Z`,
  };
}

function fixture() {
  const bracket = buildBracket({
    tournamentSlug: 'euchre-season-one',
    gameSlug: 'euchre',
    signups: [signup(1), signup(2)],
  });
  const match = findMatch(bracket, 'euchre-season-one-r1-m1');
  const record = {
    protocolVersion: TOURNAMENT_GAME_PROTOCOL_VERSION,
    game: 'euchre',
    tournamentId: bracket.tournamentSlug,
    tournamentSlug: bracket.tournamentSlug,
    matchId: match.id,
    roomId: match.id,
    playerId: match.players[0].id,
    accountId: match.players[0].accountId,
    canonicalAccountId: match.players[0].canonicalAccountId,
    signupId: match.players[0].id,
    seatIndex: 0,
    seat: 'north',
    participantIds: match.players.map((player) => player.id),
    expiresAt: new Date(Date.now() + TOURNAMENT_MATCH_TICKET_TTL_MS).toISOString(),
  };

  return { bracket, match, record, player: match.players[0] };
}

function resultPayload(overrides = {}) {
  return {
    action: 'report-result',
    protocolVersion: TOURNAMENT_GAME_PROTOCOL_VERSION,
    game: 'euchre',
    tournamentId: 'euchre-season-one',
    matchId: 'euchre-season-one-r1-m1',
    completionId: 'euchre-room-1-completion-1',
    winnerParticipantId: 'signup-1',
    winnerCanonicalAccountId: 'acct-1',
    scores: { north: 10, south: 7 },
    forfeit: false,
    ...overrides,
  };
}

test('Euchre launch uses the configured route without inventing a match path', () => {
  const launch = new URL(buildTournamentLaunchUrl({
    game: 'euchre',
    matchId: 'euchre-season-one-r1-m1',
    ticket: 'opaque-ticket',
    euchreBaseUrl: 'https://onev1-euchre-preview.onrender.com/',
  }));

  assert.equal(launch.pathname, '/');
  assert.equal(launch.searchParams.get('matchId'), 'euchre-season-one-r1-m1');
  assert.equal(launch.searchParams.get('ticket'), 'opaque-ticket');
  assert.throws(() => buildTournamentLaunchUrl({
    game: 'euchre',
    matchId: 'match-1',
    ticket: 'opaque-ticket',
    euchreBaseUrl: '',
  }), (error) => error instanceof TournamentGameContractError && error.code === 'game_unavailable');
});

test('Spades launch path and opaque ticket hashing remain unchanged', () => {
  const launch = new URL(buildTournamentLaunchUrl({
    game: 'spades',
    matchId: 'summer-r1-m1',
    ticket: 'opaque-ticket',
    spadesBaseUrl: 'https://1v1spades.com/match',
  }));

  assert.equal(launch.pathname, '/match/summer-r1-m1');
  assert.equal(launch.searchParams.get('ticket'), 'opaque-ticket');
  assert.equal(ticketKey('opaque-ticket'), 'f13ee9b2677f32949e09f039d588b7b401291659f611ee9a1881283f5a3ba481.json');
});

test('valid Euchre ticket is player, canonical identity, game, match, and seat bound', () => {
  const { bracket, match, record, player } = fixture();
  const access = assertTournamentTicketAccess({
    bracket,
    match,
    record,
    player,
    request: {
      game: 'euchre',
      matchId: match.id,
      canonicalAccountId: 'acct-1',
      seat: 'north',
    },
  });

  assert.deepEqual(access.participantIds, ['signup-1', 'signup-2']);
  assert.equal(access.canonicalAccountId, 'acct-1');
  assert.equal(access.seat, 'north');
  assert.equal(access.roomId, match.id);
});

test('Euchre ticket rejects wrong game, player, canonical identity, seat, expiry, and completion', () => {
  const { bracket, match, record, player } = fixture();
  const expectCode = (code, values = {}) => assert.throws(
    () => assertTournamentTicketAccess({ bracket, match, record, player, ...values }),
    (error) => error instanceof TournamentGameContractError && error.code === code,
  );

  expectCode('wrong_game', { request: { game: 'spades' } });
  expectCode('wrong_match', { request: { matchId: 'euchre-season-one-r2-m1' } });
  expectCode('wrong_player', { player: match.players[1] });
  expectCode('wrong_identity', { request: { canonicalAccountId: 'acct-2' } });
  expectCode('wrong_seat', { request: { seat: 'south' } });
  expectCode('expired_ticket', { now: new Date(record.expiresAt).getTime() });
  match.status = 'final';
  expectCode('completed_match');
});

test('active Euchre ticket can be reused for reconnect without being consumed', () => {
  const { bracket, match, record, player } = fixture();
  const first = assertTournamentTicketAccess({ bracket, match, record, player });
  const reconnect = assertTournamentTicketAccess({ bracket, match, record, player });

  assert.deepEqual(reconnect, first);
});

test('Euchre result callback validates protocol, required fields, scores, and forfeit reason', () => {
  const result = normalizeTournamentResultCallback(resultPayload(), 'euchre-season-one');
  assert.equal(result.game, 'euchre');
  assert.deepEqual(result.scores, { north: 10, south: 7 });

  assert.throws(
    () => normalizeTournamentResultCallback(resultPayload({ game: 'spades' }), 'euchre-season-one'),
    (error) => error.code === 'wrong_game',
  );
  assert.throws(
    () => normalizeTournamentResultCallback(resultPayload({ completionId: '' }), 'euchre-season-one'),
    (error) => error.code === 'malformed_result',
  );
  assert.throws(
    () => normalizeTournamentResultCallback(resultPayload({ scores: { north: -1, south: 10 } }), 'euchre-season-one'),
    (error) => error.code === 'malformed_scores',
  );
  assert.throws(
    () => normalizeTournamentResultCallback(resultPayload({ forfeit: true }), 'euchre-season-one'),
    (error) => error.code === 'malformed_forfeit',
  );
});

test('authoritative Euchre result advances once, preserves audit fields, and rejects conflict', () => {
  const { bracket, match } = fixture();
  const result = normalizeTournamentResultCallback(resultPayload(), bracket.tournamentSlug);
  const first = applyAuthoritativeTournamentResult(bracket, result, new Date('2026-08-31T20:00:00.000Z'));
  const completionAfterFirstCallback = structuredClone(match.completion);
  const duplicate = applyAuthoritativeTournamentResult(bracket, result);

  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(match.winnerId, 'signup-1');
  assert.equal(match.completion.completionId, 'euchre-room-1-completion-1');
  assert.deepEqual(match.completion.scores, { north: 10, south: 7 });

  const conflict = normalizeTournamentResultCallback(resultPayload({
    completionId: 'conflicting-completion',
    winnerParticipantId: 'signup-2',
    winnerCanonicalAccountId: 'acct-2',
  }), bracket.tournamentSlug);
  assert.throws(
    () => applyAuthoritativeTournamentResult(bracket, conflict),
    (error) => error.code === 'conflicting_result',
  );
  assert.equal(match.winnerId, 'signup-1');
  assert.deepEqual(match.completion, completionAfterFirstCallback);
});

test('authoritative Euchre forfeit is recorded and advances only the assigned winner', () => {
  const { bracket, match } = fixture();
  const result = normalizeTournamentResultCallback(resultPayload({
    completionId: 'forfeit-completion',
    forfeit: true,
    forfeitReason: 'disconnect-timeout',
    scores: null,
  }), bracket.tournamentSlug);

  applyAuthoritativeTournamentResult(bracket, result);

  assert.equal(match.status, 'final');
  assert.equal(match.winnerId, 'signup-1');
  assert.equal(match.completion.forfeit, true);
  assert.equal(match.completion.forfeitReason, 'disconnect-timeout');
});

test('authoritative Euchre result rejects a canonical identity mismatch', () => {
  const { bracket } = fixture();
  const result = normalizeTournamentResultCallback(resultPayload({
    winnerCanonicalAccountId: 'acct-other',
  }), bracket.tournamentSlug);

  assert.throws(
    () => applyAuthoritativeTournamentResult(bracket, result),
    (error) => error.code === 'wrong_identity',
  );
});

test('Euchre result callback rejects missing server authentication and malformed payloads', async () => {
  const previousToken = process.env.TOURNAMENT_MATCH_RESULT_TOKEN;
  const previousAdminToken = process.env.TOURNAMENT_ADMIN_TOKEN;
  process.env.TOURNAMENT_MATCH_RESULT_TOKEN = 'test-only-result-token';
  process.env.TOURNAMENT_ADMIN_TOKEN = 'test-only-admin-token';

  try {
    const unauthorized = await bracketHandler({
      httpMethod: 'POST',
      headers: {},
      queryStringParameters: { slug: 'euchre-season-one' },
      body: JSON.stringify(resultPayload()),
    });
    const adminTokenCannotReportGameResult = await bracketHandler({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer test-only-admin-token' },
      queryStringParameters: { slug: 'euchre-season-one' },
      body: JSON.stringify(resultPayload()),
    });
    const malformed = await bracketHandler({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer test-only-result-token' },
      queryStringParameters: { slug: 'euchre-season-one' },
      body: JSON.stringify(resultPayload({ completionId: '' })),
    });

    assert.equal(unauthorized.statusCode, 401);
    assert.equal(adminTokenCannotReportGameResult.statusCode, 401);
    assert.equal(malformed.statusCode, 400);
    assert.equal(JSON.parse(malformed.body).code, 'malformed_result');
  } finally {
    if (previousToken === undefined) {
      delete process.env.TOURNAMENT_MATCH_RESULT_TOKEN;
    } else {
      process.env.TOURNAMENT_MATCH_RESULT_TOKEN = previousToken;
    }

    if (previousAdminToken === undefined) {
      delete process.env.TOURNAMENT_ADMIN_TOKEN;
    } else {
      process.env.TOURNAMENT_ADMIN_TOKEN = previousAdminToken;
    }
  }
});
