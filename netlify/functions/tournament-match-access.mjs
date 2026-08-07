import { createHash, randomBytes } from 'node:crypto';

import { connectLambda } from '@netlify/blobs';

import {
  cleanEmail,
  cleanText,
  accountCanonicalId,
  getAccountFromEvent,
  getJsonWithRetry,
  getStoreWithFallback,
  publicAccount,
} from './_account-utils.mjs';
import { SHARED_IDENTITY_PROTOCOL_VERSION } from './_shared-account-utils.mjs';
import {
  TOURNAMENT_MATCH_TICKET_TTL_MS,
  TournamentGameContractError,
  assertTournamentTicketAccess,
  buildTournamentLaunchUrl,
  normalizeTournamentGame,
  tournamentSeat,
} from './_tournament-game-contract.mjs';

const SPADES_MATCH_BASE_URL = process.env.SPADES_MATCH_BASE_URL || 'https://1v1spades.com/match';
const EUCHRE_MATCH_BASE_URL = process.env.EUCHRE_MATCH_BASE_URL || '';
const MATCH_ID_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*)-r([1-9]\d*)-m([1-9]\d*)$/i;

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

function cleanMatchId(value) {
  const matchId = cleanText(value).toLowerCase();
  return MATCH_ID_RE.test(matchId) ? matchId : '';
}

function tournamentSlugFromMatchId(matchId) {
  const match = cleanMatchId(matchId).match(MATCH_ID_RE);
  return match ? match[1] : '';
}

export function ticketKey(ticket) {
  return `${createHash('sha256').update(ticket).digest('hex')}.json`;
}

function publicPlayer(player) {
  if (!player) return null;

  return {
    id: player.id,
    accountId: player.accountId || '',
    canonicalAccountId: player.canonicalAccountId || player.accountId || '',
    seed: player.seed,
    name: player.name,
    handle: player.handle || '',
  };
}

function findMatch(bracket, matchId) {
  for (const round of bracket?.rounds || []) {
    const match = round.matches.find((item) => item.id === matchId);

    if (match) {
      return { round, match };
    }
  }

  return null;
}

function signupMatchesAccount(signup, account) {
  if (!signup || !account) return false;

  const accountId = cleanText(account.id);
  const canonicalAccountId = accountCanonicalId(account);
  const accountEmail = cleanEmail(account.email);

  if (accountId && cleanText(signup.accountId) === accountId) {
    return true;
  }

  if (canonicalAccountId && cleanText(signup.canonicalAccountId || signup.accountCanonicalId) === canonicalAccountId) {
    return true;
  }

  return Boolean(
    accountEmail
      && (
        cleanEmail(signup.accountEmail) === accountEmail
        || cleanEmail(signup.contactEmail) === accountEmail
      ),
  );
}

function findPlayerSeat(match, account, signup = null) {
  const accountId = cleanText(account?.id);
  const canonicalAccountId = accountCanonicalId(account);
  const signupId = cleanText(signup?.id);
  const accountSeatIndex = match.players.findIndex((player) => {
    return player?.accountId && cleanText(player.accountId) === accountId;
  });

  if (accountSeatIndex === 0 || accountSeatIndex === 1) {
    return accountSeatIndex;
  }

  const canonicalSeatIndex = match.players.findIndex((player) => {
    return canonicalAccountId && cleanText(player?.canonicalAccountId) === canonicalAccountId;
  });

  if (canonicalSeatIndex === 0 || canonicalSeatIndex === 1) {
    return canonicalSeatIndex;
  }

  const signupSeatIndex = match.players.findIndex((player) => {
    return signupId && cleanText(player?.id) === signupId;
  });

  if (signupSeatIndex === 0 || signupSeatIndex === 1) {
    return signupSeatIndex;
  }

  return -1;
}

async function loadTournamentSignups(tournamentSlug) {
  const store = getStoreWithFallback('tournament-signups');
  const { blobs } = await store.list({ prefix: `${tournamentSlug}/` });
  const signups = await Promise.all(blobs.map((blob) => store.get(blob.key, { type: 'json' })));

  return signups.filter(Boolean);
}

async function findSignupForAccount(tournamentSlug, account) {
  const signups = await loadTournamentSignups(tournamentSlug);
  return signups.find((signup) => signupMatchesAccount(signup, account)) || null;
}

async function loadBracket(tournamentSlug) {
  const store = getStoreWithFallback('tournament-brackets');
  return getJsonWithRetry(store, `${tournamentSlug}.json`);
}

async function saveTicket(ticket, record) {
  const store = getStoreWithFallback('tournament-match-tickets');
  await store.setJSON(ticketKey(ticket), record, {
    metadata: {
      matchId: record.matchId,
      tournamentSlug: record.tournamentSlug,
      accountId: record.accountId,
      accountCanonicalId: record.accountCanonicalId,
      canonicalAccountId: record.canonicalAccountId || record.accountCanonicalId,
      expiresAt: record.expiresAt,
    },
  });
}

async function loadTicket(ticket) {
  const store = getStoreWithFallback('tournament-match-tickets');
  return getJsonWithRetry(store, ticketKey(ticket));
}

async function deleteTicket(ticket) {
  const store = getStoreWithFallback('tournament-match-tickets');
  await store.delete(ticketKey(ticket));
}

export function matchAccessPayload({ bracket, round, match, seatIndex, ticketRecord = null }) {
  const player = match.players[seatIndex];
  const game = normalizeTournamentGame(bracket.gameSlug || ticketRecord?.game || 'spades');

  return {
    ok: true,
    protocolVersion: SHARED_IDENTITY_PROTOCOL_VERSION,
    matchId: match.id,
    game,
    tournamentId: bracket.tournamentSlug,
    tournamentSlug: bracket.tournamentSlug,
    bracketStatus: bracket.status,
    round: {
      index: round.index,
      title: round.title,
    },
    match: {
      id: match.id,
      label: match.label,
      status: match.status,
      roomUrl: match.roomUrl,
      players: match.players.map(publicPlayer),
    },
    seatIndex,
    seat: ticketRecord?.seat || tournamentSeat(game, seatIndex),
    roomId: ticketRecord?.roomId || match.id,
    participantIds: match.players.filter(Boolean).map((participant) => participant.id),
    player: publicPlayer(player),
    identity: ticketRecord
      ? {
          accountId: ticketRecord.accountId,
          canonicalAccountId: ticketRecord.canonicalAccountId || ticketRecord.accountCanonicalId || ticketRecord.accountId,
        }
      : null,
    expiresAt: ticketRecord?.expiresAt || null,
  };
}

async function issueTicket(event, payload) {
  const account = await getAccountFromEvent(event);

  if (!account) {
    return json(401, { error: 'Sign in on 1v1 Tournaments before opening this match.' });
  }

  const matchId = cleanMatchId(payload.matchId);
  const tournamentSlug = cleanText(payload.tournamentSlug) || tournamentSlugFromMatchId(matchId);

  if (!matchId || !tournamentSlug) {
    return json(400, { error: 'Choose a valid tournament match before opening Spades.' });
  }

  const bracket = await loadBracket(tournamentSlug);
  const matchLookup = findMatch(bracket, matchId);

  if (!bracket || !matchLookup) {
    return json(404, { error: 'That match was not found in this bracket.' });
  }

  const { round, match } = matchLookup;
  const game = normalizeTournamentGame(bracket.gameSlug || 'spades');

  if (match.status === 'final') {
    return json(409, { error: 'This match already has a final result.' });
  }

  const readyPlayers = match.players.filter(Boolean);

  if (readyPlayers.length !== 2) {
    return json(409, { error: 'This match is not ready yet.' });
  }

  let signup = null;
  let seatIndex = findPlayerSeat(match, account);

  if (seatIndex === -1) {
    signup = await findSignupForAccount(tournamentSlug, account);
    seatIndex = findPlayerSeat(match, account, signup);
  }

  if (seatIndex === -1) {
    return json(403, { error: 'This account is not assigned to that match.' });
  }

  const now = Date.now();
  const ticket = randomBytes(32).toString('base64url');
  let launchUrl;

  try {
    launchUrl = buildTournamentLaunchUrl({
      game,
      matchId,
      ticket,
      spadesBaseUrl: SPADES_MATCH_BASE_URL,
      euchreBaseUrl: EUCHRE_MATCH_BASE_URL,
    });
  } catch (error) {
    if (error instanceof TournamentGameContractError) {
      return json(error.statusCode, { error: error.message, code: error.code });
    }

    throw error;
  }

  const record = {
    protocolVersion: SHARED_IDENTITY_PROTOCOL_VERSION,
    game,
    tournamentId: tournamentSlug,
    matchId,
    tournamentSlug,
    accountId: account.id,
    accountCanonicalId: accountCanonicalId(account),
    canonicalAccountId: accountCanonicalId(account),
    accountEmail: account.email,
    signupId: signup?.id || '',
    playerId: match.players[seatIndex].id,
    seatIndex,
    seat: tournamentSeat(game, seatIndex),
    roomId: match.id,
    participantIds: match.players.filter(Boolean).map((participant) => participant.id),
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TOURNAMENT_MATCH_TICKET_TTL_MS).toISOString(),
  };

  await saveTicket(ticket, record);

  return json(201, {
    ...matchAccessPayload({ bracket, round, match, seatIndex, ticketRecord: record }),
    account: publicAccount(account),
    ticket,
    roomUrl: launchUrl,
  });
}

async function verifyTicket(payload) {
  const ticket = cleanText(payload.ticket);
  const requestedMatchId = cleanMatchId(payload.matchId);

  if (!ticket) {
    return json(401, { error: 'Open this match from 1v1 Tournaments to get a player ticket.' });
  }

  const record = await loadTicket(ticket);

  if (!record) {
    return json(401, { error: 'This match ticket was not found. Open the match from 1v1 Tournaments again.' });
  }

  const bracket = await loadBracket(record.tournamentSlug);
  const matchLookup = findMatch(bracket, record.matchId);

  if (!bracket || !matchLookup) {
    return json(404, { error: 'That match was not found in this bracket.' });
  }

  const { round, match } = matchLookup;
  const seatIndex = Number(record.seatIndex);
  const player = seatIndex === 0 || seatIndex === 1 ? match.players[seatIndex] : null;

  try {
    assertTournamentTicketAccess({
      record,
      bracket,
      match,
      player,
      request: {
        matchId: requestedMatchId,
        game: payload.game,
        canonicalAccountId: payload.canonicalAccountId,
        seat: payload.seat,
      },
    });
  } catch (error) {
    if (error instanceof TournamentGameContractError) {
      if (error.code === 'expired_ticket') {
        await deleteTicket(ticket).catch(() => {});
      }

      return json(error.statusCode, { error: error.message, code: error.code });
    }

    throw error;
  }

  return json(200, matchAccessPayload({ bracket, round, match, seatIndex, ticketRecord: record }));
}

export async function handler(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use POST to issue or verify match access.' });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Match access payload must be valid JSON.' });
  }

  try {
    if (payload.action === 'issue-ticket') {
      return issueTicket(event, payload);
    }

    if (payload.action === 'verify-ticket') {
      return verifyTicket(payload);
    }

    return json(400, { error: 'Choose a supported match access action.' });
  } catch (error) {
    console.error('Tournament match access failed', error);
    return json(500, { error: 'Match access is not available yet.' });
  }
}
