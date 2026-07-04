import { createHash, randomBytes } from 'node:crypto';

import { connectLambda } from '@netlify/blobs';

import {
  cleanText,
  getAccountFromEvent,
  getStoreWithFallback,
  publicAccount,
} from './_account-utils.mjs';

const SPADES_MATCH_BASE_URL = process.env.SPADES_MATCH_BASE_URL || 'https://1v1spades.com/match';
const MATCH_TICKET_TTL_MS = 30 * 60 * 1000;
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

function ticketKey(ticket) {
  return `${createHash('sha256').update(ticket).digest('hex')}.json`;
}

function publicPlayer(player) {
  if (!player) return null;

  return {
    id: player.id,
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

function findPlayerSeat(match, accountId) {
  const seatIndex = match.players.findIndex((player) => player?.accountId === accountId);
  return seatIndex === 0 || seatIndex === 1 ? seatIndex : -1;
}

async function loadBracket(tournamentSlug) {
  const store = getStoreWithFallback('tournament-brackets');
  return store.get(`${tournamentSlug}.json`, { type: 'json' });
}

async function saveTicket(ticket, record) {
  const store = getStoreWithFallback('tournament-match-tickets');
  await store.setJSON(ticketKey(ticket), record, {
    metadata: {
      matchId: record.matchId,
      tournamentSlug: record.tournamentSlug,
      accountId: record.accountId,
      expiresAt: record.expiresAt,
    },
  });
}

async function loadTicket(ticket) {
  const store = getStoreWithFallback('tournament-match-tickets');
  return store.get(ticketKey(ticket), { type: 'json' });
}

async function deleteTicket(ticket) {
  const store = getStoreWithFallback('tournament-match-tickets');
  await store.delete(ticketKey(ticket));
}

function roomUrl(matchId, ticket) {
  const url = new URL(`${SPADES_MATCH_BASE_URL}/${matchId}`);
  url.searchParams.set('ticket', ticket);
  return url.toString();
}

function matchAccessPayload({ bracket, round, match, seatIndex, ticketRecord = null }) {
  const player = match.players[seatIndex];

  return {
    ok: true,
    matchId: match.id,
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
    player: publicPlayer(player),
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

  if (match.status === 'final') {
    return json(409, { error: 'This match already has a final result.' });
  }

  const readyPlayers = match.players.filter(Boolean);

  if (readyPlayers.length !== 2) {
    return json(409, { error: 'This match is not ready yet.' });
  }

  const seatIndex = findPlayerSeat(match, account.id);

  if (seatIndex === -1) {
    return json(403, { error: 'This account is not assigned to that match.' });
  }

  const now = Date.now();
  const ticket = randomBytes(32).toString('base64url');
  const record = {
    matchId,
    tournamentSlug,
    accountId: account.id,
    accountEmail: account.email,
    playerId: match.players[seatIndex].id,
    seatIndex,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + MATCH_TICKET_TTL_MS).toISOString(),
  };

  await saveTicket(ticket, record);

  return json(201, {
    ...matchAccessPayload({ bracket, round, match, seatIndex, ticketRecord: record }),
    account: publicAccount(account),
    ticket,
    roomUrl: roomUrl(matchId, ticket),
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

  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    await deleteTicket(ticket).catch(() => {});
    return json(401, { error: 'This match ticket expired. Open the match from 1v1 Tournaments again.' });
  }

  if (requestedMatchId && requestedMatchId !== record.matchId) {
    return json(403, { error: 'This match ticket belongs to a different match.' });
  }

  const bracket = await loadBracket(record.tournamentSlug);
  const matchLookup = findMatch(bracket, record.matchId);

  if (!bracket || !matchLookup) {
    return json(404, { error: 'That match was not found in this bracket.' });
  }

  const { round, match } = matchLookup;
  const seatIndex = Number(record.seatIndex);
  const player = seatIndex === 0 || seatIndex === 1 ? match.players[seatIndex] : null;

  if (!player || player.accountId !== record.accountId || player.id !== record.playerId) {
    return json(403, { error: 'This match ticket no longer matches the bracket assignment.' });
  }

  if (match.status === 'final') {
    return json(409, { error: 'This match already has a final result.' });
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
