import { cleanText } from './_account-utils.mjs';
import { SHARED_IDENTITY_PROTOCOL_VERSION } from './_shared-account-utils.mjs';

export const TOURNAMENT_GAME_PROTOCOL_VERSION = SHARED_IDENTITY_PROTOCOL_VERSION;
export const TOURNAMENT_MATCH_TICKET_TTL_MS = 30 * 60 * 1000;

const SUPPORTED_GAMES = new Set(['spades', 'euchre']);
const EUCHRE_SEATS = ['north', 'south'];

export class TournamentGameContractError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.name = 'TournamentGameContractError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function normalizeTournamentGame(value, fallback = 'spades') {
  const game = cleanText(value).toLowerCase() || fallback;

  if (!SUPPORTED_GAMES.has(game)) {
    throw new TournamentGameContractError(400, 'Choose a supported tournament game.', 'unsupported_game');
  }

  return game;
}

export function tournamentSeat(game, seatIndex) {
  const normalizedGame = normalizeTournamentGame(game);

  if (seatIndex !== 0 && seatIndex !== 1) {
    throw new TournamentGameContractError(403, 'This ticket has an invalid player assignment.', 'invalid_seat');
  }

  return normalizedGame === 'euchre' ? EUCHRE_SEATS[seatIndex] : `player-${seatIndex + 1}`;
}

export function buildTournamentLaunchUrl({ game, matchId, ticket, spadesBaseUrl, euchreBaseUrl }) {
  const normalizedGame = normalizeTournamentGame(game);
  const cleanId = cleanText(matchId);
  const cleanTicket = cleanText(ticket);

  if (!cleanId || !cleanTicket) {
    throw new TournamentGameContractError(400, 'A match and ticket are required to launch a game.', 'invalid_launch');
  }

  if (normalizedGame === 'spades') {
    const base = cleanText(spadesBaseUrl) || 'https://1v1spades.com/match';
    const url = new URL(`${base.replace(/\/$/, '')}/${encodeURIComponent(cleanId)}`);
    url.searchParams.set('ticket', cleanTicket);
    return url.toString();
  }

  const base = cleanText(euchreBaseUrl);

  if (!base) {
    throw new TournamentGameContractError(
      409,
      'Euchre tournament launch is not configured yet.',
      'game_unavailable',
    );
  }

  const url = new URL(base);
  url.searchParams.set('matchId', cleanId);
  url.searchParams.set('ticket', cleanTicket);
  return url.toString();
}

export function assertTournamentTicketAccess({ record, bracket, match, player, request = {}, now = Date.now() }) {
  const game = normalizeTournamentGame(bracket?.gameSlug || record?.game || 'spades');
  const recordGame = normalizeTournamentGame(record?.game || 'spades');
  const seatIndex = Number(record?.seatIndex);
  const seat = tournamentSeat(game, seatIndex);
  const canonicalAccountId = cleanText(record?.canonicalAccountId || record?.accountCanonicalId || record?.accountId);
  const participantIds = (match?.players || []).filter(Boolean).map((participant) => cleanText(participant.id));
  const playerMatches = Boolean(
    player
      && cleanText(player.id) === cleanText(record?.playerId)
      && (
        cleanText(player.accountId) === cleanText(record?.accountId)
        || cleanText(player.canonicalAccountId) === canonicalAccountId
        || (cleanText(record?.signupId) && cleanText(player.id) === cleanText(record.signupId))
      ),
  );

  if (new Date(record?.expiresAt).getTime() <= now) {
    throw new TournamentGameContractError(401, 'This match ticket expired. Open the match from 1v1 Tournaments again.', 'expired_ticket');
  }

  if (recordGame !== game || (request.game && normalizeTournamentGame(request.game) !== game)) {
    throw new TournamentGameContractError(403, 'This match ticket belongs to a different game.', 'wrong_game');
  }

  if (cleanText(request.matchId) && cleanText(request.matchId) !== cleanText(record.matchId)) {
    throw new TournamentGameContractError(403, 'This match ticket belongs to a different match.', 'wrong_match');
  }

  if (!playerMatches) {
    throw new TournamentGameContractError(403, 'This match ticket no longer matches the bracket assignment.', 'wrong_player');
  }

  if (request.canonicalAccountId && cleanText(request.canonicalAccountId) !== canonicalAccountId) {
    throw new TournamentGameContractError(403, 'This match ticket belongs to a different account.', 'wrong_identity');
  }

  if (request.seat && cleanText(request.seat).toLowerCase() !== seat) {
    throw new TournamentGameContractError(403, 'This match ticket belongs to a different seat.', 'wrong_seat');
  }

  if (match?.status === 'final') {
    throw new TournamentGameContractError(409, 'This match already has a final result.', 'completed_match');
  }

  return {
    game,
    seat,
    seatIndex,
    roomId: cleanText(record?.roomId || record?.matchId),
    participantIds,
    canonicalAccountId,
  };
}

function cleanScore(value) {
  if (value === undefined || value === null || value === '') return null;
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 ? score : NaN;
}

export function normalizeTournamentResultCallback(payload, tournamentSlug) {
  const protocolVersion = cleanText(payload?.protocolVersion);
  const game = normalizeTournamentGame(payload?.game, '');
  const tournamentId = cleanText(payload?.tournamentId);
  const matchId = cleanText(payload?.matchId);
  const completionId = cleanText(payload?.completionId);
  const winnerParticipantId = cleanText(payload?.winnerParticipantId);
  const winnerCanonicalAccountId = cleanText(payload?.winnerCanonicalAccountId);

  if (protocolVersion !== TOURNAMENT_GAME_PROTOCOL_VERSION) {
    throw new TournamentGameContractError(400, 'Use the current tournament game protocol version.', 'wrong_protocol');
  }

  if (game !== 'euchre') {
    throw new TournamentGameContractError(400, 'This callback is not an Euchre tournament result.', 'wrong_game');
  }

  if (!tournamentId || tournamentId !== cleanText(tournamentSlug)) {
    throw new TournamentGameContractError(400, 'The tournament result does not match this tournament.', 'wrong_tournament');
  }

  if (!matchId || !completionId || !winnerParticipantId || !winnerCanonicalAccountId) {
    throw new TournamentGameContractError(400, 'The result callback is missing required match identity fields.', 'malformed_result');
  }

  const north = cleanScore(payload?.scores?.north);
  const south = cleanScore(payload?.scores?.south);

  if (Number.isNaN(north) || Number.isNaN(south)) {
    throw new TournamentGameContractError(400, 'Euchre scores must be non-negative whole numbers.', 'malformed_scores');
  }

  const isForfeit = payload?.forfeit === true;
  const forfeitReason = cleanText(payload?.forfeitReason);

  if (isForfeit && !forfeitReason) {
    throw new TournamentGameContractError(400, 'A forfeited match requires an authoritative reason.', 'malformed_forfeit');
  }

  return {
    protocolVersion,
    game,
    tournamentId,
    matchId,
    completionId,
    winnerParticipantId,
    winnerCanonicalAccountId,
    scores: north === null && south === null ? null : { north, south },
    forfeit: isForfeit,
    forfeitReason: isForfeit ? forfeitReason : '',
  };
}
