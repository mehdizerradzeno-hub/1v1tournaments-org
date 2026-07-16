import { connectLambda, getStore } from '@netlify/blobs';

import {
  getAdminToken,
  getBearerToken,
  requireTournamentAdmin,
} from './_host-auth.mjs';
import { loadHostedTournament } from './_tournament-events-utils.mjs';
import { siteData } from '../../src/lib/siteData.js';
import { canGenerateTournamentMode, getTournamentMode } from '../../src/lib/tournamentModes.js';
import { normalizeCheckInLeadMinutes } from '../../src/lib/tournamentSettings.js';

const SPADES_MATCH_BASE_URL = 'https://1v1spades.com/match';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

function getMatchResultToken() {
  return process.env.TOURNAMENT_MATCH_RESULT_TOKEN || getAdminToken();
}

function getStoreWithFallback(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;

  if (siteID && token) {
    return getStore({ name, siteID, token });
  }

  return getStore(name);
}

function cleanText(value) {
  return String(value || '').trim();
}

function getTournamentSlug(event, payload = {}) {
  const explicitSlug = cleanText(event.queryStringParameters?.slug || payload.tournamentSlug);

  if (explicitSlug) {
    return explicitSlug;
  }

  const matchId = cleanText(event.queryStringParameters?.matchId || payload.matchId);
  const match = matchId.match(/^(.+)-r\d+-m\d+$/);

  return match ? match[1] : '';
}

function nextPowerOfTwo(value) {
  let power = 1;

  while (power < value) {
    power *= 2;
  }

  return power;
}

function roundName(index, totalRounds) {
  if (index === totalRounds) return 'Final';
  if (index === totalRounds - 1) return 'Semifinals';
  if (index === totalRounds - 2) return 'Quarterfinals';
  return `Round ${index}`;
}

function publicParticipant(signup, index) {
  return {
    id: signup.id,
    accountId: signup.accountId || '',
    seed: index + 1,
    name: signup.playerName,
    handle: signup.playerHandle || '',
  };
}

function adminParticipant(signup, index) {
  return {
    ...publicParticipant(signup, index),
    accountEmail: signup.accountEmail || '',
    contactEmail: signup.contactEmail,
    notes: signup.notes || '',
  };
}

function roomUrl(tournamentSlug, roundIndex, matchIndex) {
  return `${SPADES_MATCH_BASE_URL}/${tournamentSlug}-r${roundIndex}-m${matchIndex}`;
}

function pairSlots(participants, size) {
  const pairs = [];
  let participantIndex = 0;
  let remainingByes = size - participants.length;

  while (participantIndex < participants.length) {
    const first = participants[participantIndex] || null;
    participantIndex += 1;

    if (remainingByes > 0) {
      pairs.push([first, null]);
      remainingByes -= 1;
    } else {
      pairs.push([first, participants[participantIndex] || null]);
      participantIndex += 1;
    }
  }

  return pairs;
}

export function findMatch(bracket, matchId) {
  for (const round of bracket.rounds) {
    const match = round.matches.find((item) => item.id === matchId);

    if (match) {
      return match;
    }
  }

  return null;
}

function getPlayerName(player) {
  if (!player) return 'TBD';
  return player.handle ? `${player.name} (${player.handle})` : player.name;
}

function markReadyIfFilled(match) {
  const filledPlayers = match.players.filter(Boolean);

  if (filledPlayers.length === 2 && match.status === 'pending') {
    match.status = 'ready';
  }
}

function placePlayerInMatch(bracket, matchId, slot, player) {
  const nextMatch = findMatch(bracket, matchId);

  if (!nextMatch || !player) {
    return null;
  }

  nextMatch.players[slot] = player;
  markReadyIfFilled(nextMatch);

  return nextMatch;
}

export function setMatchWinner(bracket, match, player) {
  if (bracket.format === 'three-player-two-life') {
    setThreePlayerTwoLifeMatchWinner(bracket, match, player);
    return;
  }

  const winnerSlot = match.players.findIndex((candidate) => candidate?.id === player.id);
  const loser = match.players.find((candidate) => candidate && candidate.id !== player.id) || null;

  match.winnerId = player.id;
  match.winnerName = getPlayerName(player);
  match.status = 'final';

  if (match.nextMatchId) {
    placePlayerInMatch(bracket, match.nextMatchId, match.nextSlot, player);
  }

  if (match.loserNextMatchId && loser) {
    placePlayerInMatch(bracket, match.loserNextMatchId, match.loserNextSlot, loser);
  }

  if (match.resetMatchId && winnerSlot === match.resetOnWinnerSlot) {
    placePlayerInMatch(bracket, match.resetMatchId, 0, match.players[0]);
    placePlayerInMatch(bracket, match.resetMatchId, 1, match.players[1]);
    return;
  }

  if (!match.nextMatchId && (!match.resetMatchId || winnerSlot !== match.resetOnWinnerSlot)) {
    bracket.status = 'complete';
    bracket.winner = {
      id: player.id,
      name: getPlayerName(player),
    };
  }
}

function getThreePlayerStandings(bracket) {
  if (Array.isArray(bracket.standings) && bracket.standings.length) {
    return bracket.standings;
  }

  bracket.standings = bracket.participants.map((participant) => ({
    id: participant.id,
    name: getPlayerName(participant),
    lives: 2,
    status: 'alive',
  }));

  return bracket.standings;
}

function setThreePlayerTwoLifeMatchWinner(bracket, match, player) {
  const loser = match.players.find((candidate) => candidate && candidate.id !== player.id) || null;
  const standings = getThreePlayerStandings(bracket);
  const loserStanding = standings.find((standing) => standing.id === loser?.id);

  match.winnerId = player.id;
  match.winnerName = getPlayerName(player);
  match.loserId = loser?.id || null;
  match.loserName = loser ? getPlayerName(loser) : '';
  match.status = 'final';

  if (loserStanding) {
    loserStanding.lives = Math.max(loserStanding.lives - 1, 0);
    loserStanding.status = loserStanding.lives > 0 ? 'alive' : 'out';
  }

  bracket.standings = standings.sort((left, right) => {
    if (right.lives !== left.lives) return right.lives - left.lives;
    return left.name.localeCompare(right.name);
  });

  const alivePlayers = bracket.participants.filter((participant) =>
    standings.some((standing) => standing.id === participant.id && standing.lives > 0),
  );

  if (alivePlayers.length === 1) {
    bracket.status = 'complete';
    bracket.winner = {
      id: alivePlayers[0].id,
      name: getPlayerName(alivePlayers[0]),
    };
    return;
  }

  const nextMatch = bracket.rounds
    .flatMap((round) => round.matches)
    .find((candidate) => candidate.status === 'pending' && candidate.players.every((candidatePlayer) => !candidatePlayer));

  if (!nextMatch) {
    return;
  }

  const sittingPlayer = alivePlayers.find((participant) =>
    !match.players.some((matchPlayer) => matchPlayer?.id === participant.id),
  );
  const opponent = sittingPlayer
    ? (loser && loserStanding?.lives > 0 ? loser : player)
    : alivePlayers[0];
  const firstPlayer = sittingPlayer || alivePlayers[0];
  const secondPlayer = opponent?.id === firstPlayer?.id
    ? alivePlayers.find((participant) => participant.id !== firstPlayer.id)
    : opponent;

  nextMatch.players = [firstPlayer || null, secondPlayer || null];
  markReadyIfFilled(nextMatch);
}

function initializeByes(bracket) {
  bracket.rounds[0]?.matches.forEach((match) => {
    const players = match.players.filter(Boolean);

    if (players.length === 2) {
      match.status = 'ready';
    }

    if (players.length === 1) {
      setMatchWinner(bracket, match, players[0]);
    }
  });
}

export function buildBracket({ tournamentSlug, signups, includeAdminFields = false }) {
  const sortedSignups = [...signups].sort((left, right) => {
    const leftDate = new Date(left.createdAt || 0).getTime();
    const rightDate = new Date(right.createdAt || 0).getTime();
    return leftDate - rightDate;
  });
  const participants = sortedSignups.map(includeAdminFields ? adminParticipant : publicParticipant);
  const bracketSize = nextPowerOfTwo(Math.max(participants.length, 2));
  const totalRounds = Math.log2(bracketSize);
  const rounds = [];

  for (let roundIndex = 1; roundIndex <= totalRounds; roundIndex += 1) {
    const matchCount = bracketSize / 2 ** roundIndex;
    rounds.push({
      index: roundIndex,
      title: roundName(roundIndex, totalRounds),
      matches: Array.from({ length: matchCount }, (_, matchOffset) => {
        const matchIndex = matchOffset + 1;
        const id = `${tournamentSlug}-r${roundIndex}-m${matchIndex}`;
        const nextMatchIndex = Math.ceil(matchIndex / 2);
        const nextMatchId = roundIndex < totalRounds
          ? `${tournamentSlug}-r${roundIndex + 1}-m${nextMatchIndex}`
          : null;

        return {
          id,
          label: `Match ${matchIndex}`,
          roundIndex,
          matchIndex,
          status: 'pending',
          players: [null, null],
          winnerId: null,
          winnerName: '',
          nextMatchId,
          nextSlot: matchIndex % 2 === 1 ? 0 : 1,
          roomUrl: roomUrl(tournamentSlug, roundIndex, matchIndex),
        };
      }),
    });
  }

  const firstRoundPairs = pairSlots(participants, bracketSize);
  firstRoundPairs.forEach((players, index) => {
    rounds[0].matches[index].players = players;
  });

  const now = new Date().toISOString();
  const bracket = {
    tournamentSlug,
    status: 'published',
    format: 'single-elimination',
    gameSlug: 'spades',
    matchBaseUrl: SPADES_MATCH_BASE_URL,
    participantCount: participants.length,
    participants,
    rounds,
    winner: null,
    createdAt: now,
    updatedAt: now,
  };

  initializeByes(bracket);

  return bracket;
}

export function buildFourPlayerDoubleEliminationBracket({ tournamentSlug, signups, includeAdminFields = false }) {
  const sortedSignups = [...signups].sort((left, right) => {
    const leftDate = new Date(left.createdAt || 0).getTime();
    const rightDate = new Date(right.createdAt || 0).getTime();
    return leftDate - rightDate;
  });
  const participants = sortedSignups.slice(0, 4).map(includeAdminFields ? adminParticipant : publicParticipant);

  if (participants.length !== 4) {
    throw new Error('4-Man Double Elimination requires exactly four registered players.');
  }

  const match = ({ id, label, roundIndex, matchIndex, players = [null, null], nextMatchId = null, nextSlot = null, loserNextMatchId = null, loserNextSlot = null, resetMatchId = null, resetOnWinnerSlot = null }) => ({
    id,
    label,
    roundIndex,
    matchIndex,
    status: players.filter(Boolean).length === 2 ? 'ready' : 'pending',
    players,
    winnerId: null,
    winnerName: '',
    nextMatchId,
    nextSlot,
    loserNextMatchId,
    loserNextSlot,
    resetMatchId,
    resetOnWinnerSlot,
    roomUrl: roomUrl(tournamentSlug, roundIndex, matchIndex),
  });

  const rounds = [
    {
      index: 1,
      title: 'Winners Round 1',
      matches: [
        match({
          id: `${tournamentSlug}-r1-m1`,
          label: 'Winners Match 1',
          roundIndex: 1,
          matchIndex: 1,
          players: [participants[0], participants[1]],
          nextMatchId: `${tournamentSlug}-r2-m1`,
          nextSlot: 0,
          loserNextMatchId: `${tournamentSlug}-r2-m2`,
          loserNextSlot: 0,
        }),
        match({
          id: `${tournamentSlug}-r1-m2`,
          label: 'Winners Match 2',
          roundIndex: 1,
          matchIndex: 2,
          players: [participants[2], participants[3]],
          nextMatchId: `${tournamentSlug}-r2-m1`,
          nextSlot: 1,
          loserNextMatchId: `${tournamentSlug}-r2-m2`,
          loserNextSlot: 1,
        }),
      ],
    },
    {
      index: 2,
      title: 'Winners Final + Losers Round 1',
      matches: [
        match({
          id: `${tournamentSlug}-r2-m1`,
          label: 'Winners Final',
          roundIndex: 2,
          matchIndex: 1,
          nextMatchId: `${tournamentSlug}-r4-m1`,
          nextSlot: 0,
          loserNextMatchId: `${tournamentSlug}-r3-m1`,
          loserNextSlot: 1,
        }),
        match({
          id: `${tournamentSlug}-r2-m2`,
          label: 'Losers Round 1',
          roundIndex: 2,
          matchIndex: 2,
          nextMatchId: `${tournamentSlug}-r3-m1`,
          nextSlot: 0,
        }),
      ],
    },
    {
      index: 3,
      title: 'Losers Final',
      matches: [
        match({
          id: `${tournamentSlug}-r3-m1`,
          label: 'Losers Final',
          roundIndex: 3,
          matchIndex: 1,
          nextMatchId: `${tournamentSlug}-r4-m1`,
          nextSlot: 1,
        }),
      ],
    },
    {
      index: 4,
      title: 'Grand Final',
      matches: [
        match({
          id: `${tournamentSlug}-r4-m1`,
          label: 'Grand Final',
          roundIndex: 4,
          matchIndex: 1,
          resetMatchId: `${tournamentSlug}-r5-m1`,
          resetOnWinnerSlot: 1,
        }),
      ],
    },
    {
      index: 5,
      title: 'Reset Final',
      matches: [
        match({
          id: `${tournamentSlug}-r5-m1`,
          label: 'Reset Final',
          roundIndex: 5,
          matchIndex: 1,
        }),
      ],
    },
  ];

  const now = new Date().toISOString();

  return {
    tournamentSlug,
    status: 'published',
    format: 'four-player-double-elimination',
    gameSlug: 'spades',
    matchBaseUrl: SPADES_MATCH_BASE_URL,
    participantCount: participants.length,
    participants,
    rounds,
    winner: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildThreePlayerTwoLifeBracket({ tournamentSlug, signups, includeAdminFields = false }) {
  const sortedSignups = [...signups].sort((left, right) => {
    const leftDate = new Date(left.createdAt || 0).getTime();
    const rightDate = new Date(right.createdAt || 0).getTime();
    return leftDate - rightDate;
  });
  const participants = sortedSignups.slice(0, 3).map(includeAdminFields ? adminParticipant : publicParticipant);

  if (participants.length !== 3) {
    throw new Error('3-Man Two-Life requires exactly three registered players.');
  }

  const match = ({ id, label, roundIndex, matchIndex, players = [null, null] }) => ({
    id,
    label,
    roundIndex,
    matchIndex,
    status: players.filter(Boolean).length === 2 ? 'ready' : 'pending',
    players,
    winnerId: null,
    winnerName: '',
    loserId: null,
    loserName: '',
    nextMatchId: null,
    nextSlot: null,
    roomUrl: roomUrl(tournamentSlug, roundIndex, matchIndex),
  });

  const rounds = [
    {
      index: 1,
      title: 'Opening Rotation',
      matches: [
        match({
          id: `${tournamentSlug}-r1-m1`,
          label: 'Match 1',
          roundIndex: 1,
          matchIndex: 1,
          players: [participants[0], participants[1]],
        }),
        match({
          id: `${tournamentSlug}-r1-m2`,
          label: 'Match 2',
          roundIndex: 1,
          matchIndex: 2,
        }),
      ],
    },
    {
      index: 2,
      title: 'Lives Round',
      matches: [
        match({
          id: `${tournamentSlug}-r2-m1`,
          label: 'Match 3',
          roundIndex: 2,
          matchIndex: 1,
        }),
        match({
          id: `${tournamentSlug}-r2-m2`,
          label: 'Match 4',
          roundIndex: 2,
          matchIndex: 2,
        }),
      ],
    },
    {
      index: 3,
      title: 'Last Life Final',
      matches: [
        match({
          id: `${tournamentSlug}-r3-m1`,
          label: 'Match 5',
          roundIndex: 3,
          matchIndex: 1,
        }),
      ],
    },
  ];
  const now = new Date().toISOString();

  return {
    tournamentSlug,
    status: 'published',
    format: 'three-player-two-life',
    gameSlug: 'spades',
    matchBaseUrl: SPADES_MATCH_BASE_URL,
    participantCount: participants.length,
    participants,
    standings: participants.map((participant) => ({
      id: participant.id,
      name: getPlayerName(participant),
      lives: 2,
      status: 'alive',
    })),
    rounds,
    winner: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function loadTournamentSignups(tournamentSlug) {
  const store = getStoreWithFallback('tournament-signups');
  const { blobs } = await store.list({ prefix: `${tournamentSlug}/` });
  const signups = await Promise.all(blobs.map((blob) => store.get(blob.key, { type: 'json' })));

  return signups.filter(Boolean);
}

function publicBracket(bracket) {
  if (!bracket) {
    return null;
  }

  return {
    ...bracket,
    participants: bracket.participants.map((participant) => ({
      id: participant.id,
      seed: participant.seed,
      name: participant.name,
      handle: participant.handle || '',
    })),
    rounds: bracket.rounds.map((round) => ({
      ...round,
      matches: round.matches.map((match) => ({
        ...match,
        players: match.players.map((player) =>
          player
            ? {
                id: player.id,
                seed: player.seed,
                name: player.name,
                handle: player.handle || '',
              }
            : null,
        ),
      })),
    })),
  };
}

function publicMatchDetails(bracket, matchId) {
  if (!bracket) {
    return null;
  }

  for (const round of bracket.rounds) {
    const match = round.matches.find((item) => item.id === matchId);

    if (match) {
      return {
        tournamentSlug: bracket.tournamentSlug,
        bracketStatus: bracket.status,
        gameSlug: bracket.gameSlug,
        round: {
          index: round.index,
          title: round.title,
        },
        match: {
          ...match,
          players: match.players.map((player) =>
            player
              ? {
                  id: player.id,
                  seed: player.seed,
                  name: player.name,
                  handle: player.handle || '',
                }
              : null,
          ),
        },
        resultCallback: {
          endpoint: `https://1v1tournaments.org/.netlify/functions/tournament-bracket?slug=${encodeURIComponent(bracket.tournamentSlug)}`,
          method: 'POST',
          tokenEnv: 'TOURNAMENT_MATCH_RESULT_TOKEN',
          bodyTemplate: {
            action: 'report-winner',
            matchId,
            winnerId: 'winner-player-id-from-this-match',
          },
        },
      };
    }
  }

  return null;
}

async function loadBracket(tournamentSlug) {
  const store = getStoreWithFallback('tournament-brackets');
  return store.get(`${tournamentSlug}.json`, {
    consistency: 'strong',
    type: 'json',
  });
}

async function loadBracketWithMetadata(tournamentSlug) {
  const store = getStoreWithFallback('tournament-brackets');
  const result = await store.getWithMetadata(`${tournamentSlug}.json`, {
    consistency: 'strong',
    type: 'json',
  });

  if (!result) {
    return null;
  }

  return {
    bracket: result.data,
    etag: result.etag,
  };
}

async function saveBracket(bracket, options = {}) {
  const store = getStoreWithFallback('tournament-brackets');
  const updatedBracket = {
    ...bracket,
    updatedAt: new Date().toISOString(),
  };

  const writeResult = await store.set(`${bracket.tournamentSlug}.json`, JSON.stringify(updatedBracket), {
    metadata: {
      tournamentSlug: bracket.tournamentSlug,
      status: updatedBracket.status,
      updatedAt: updatedBracket.updatedAt,
    },
    ...options,
  });

  if (writeResult.modified === false) {
    return { modified: false };
  }

  return updatedBracket;
}

async function loadTournamentMode(tournamentSlug) {
  const hostedTournament = await loadHostedTournament(tournamentSlug);
  const seededTournament = siteData.tournaments.find((tournament) => tournament.slug === tournamentSlug) || null;

  return getTournamentMode(hostedTournament?.mode || seededTournament?.mode);
}

async function loadTournamentForBracket(tournamentSlug) {
  const hostedTournament = await loadHostedTournament(tournamentSlug);
  const seededTournament = siteData.tournaments.find((tournament) => tournament.slug === tournamentSlug) || null;

  return hostedTournament ? { ...(seededTournament || {}), ...hostedTournament } : seededTournament;
}

function checkInOpenStatus(tournament, now = new Date()) {
  const startDate = new Date(tournament?.date);

  if (Number.isNaN(startDate.getTime())) {
    return { open: true };
  }

  const leadMinutes = normalizeCheckInLeadMinutes(tournament?.checkInLeadMinutes);
  const opensAt = new Date(startDate.getTime() - leadMinutes * 60 * 1000);

  if (opensAt.getTime() <= now.getTime()) {
    return { open: true, opensAt };
  }

  return {
    open: false,
    opensAt,
    error: `Check-in has not opened yet. Bracket generation opens at ${opensAt.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
      timeZone: tournament?.timeZone || 'America/New_York',
      timeZoneName: 'short',
    })}.`,
  };
}

async function deleteBracket(tournamentSlug) {
  const store = getStoreWithFallback('tournament-brackets');
  await store.delete(`${tournamentSlug}.json`);
}

async function reportWinnerWithRetry(tournamentSlug, matchId, winnerId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loaded = await loadBracketWithMetadata(tournamentSlug);

    if (!loaded) {
      return { error: json(404, { error: 'Generate a bracket before reporting winners.' }) };
    }

    const match = findMatch(loaded.bracket, matchId);

    if (!match) {
      return { error: json(404, { error: 'That match was not found in this bracket.' }) };
    }

    const winner = match.players.find((player) => player?.id === winnerId);

    if (!winner) {
      return { error: json(400, { error: 'Choose one of the players in this match as the winner.' }) };
    }

    setMatchWinner(loaded.bracket, match, winner);
    const savedBracket = await saveBracket(loaded.bracket, { onlyIfMatch: loaded.etag });

    if (savedBracket.modified !== false) {
      return { bracket: savedBracket };
    }
  }

  return { error: json(409, { error: 'The bracket changed while saving this result. Try reporting the winner again.' }) };
}

async function requireAdmin(event) {
  const adminCheck = await requireTournamentAdmin(event);

  if (adminCheck.error) {
    return { error: json(adminCheck.error.statusCode, { error: adminCheck.error.message }) };
  }

  return adminCheck;
}

async function requireMatchReporter(event) {
  const adminToken = getAdminToken();
  const matchResultToken = getMatchResultToken();
  const bearerToken = getBearerToken(event);

  if ((matchResultToken && bearerToken === matchResultToken) || (adminToken && bearerToken === adminToken)) {
    return { ok: true, method: 'token' };
  }

  const adminCheck = await requireTournamentAdmin(event);

  if (adminCheck.ok) {
    return adminCheck;
  }

  if (!matchResultToken) {
    return { error: json(503, { error: 'Tournament match result token is not configured on Netlify.' }) };
  }

  return { error: json(401, { error: 'Enter the tournament match result token or sign in with a host-approved account.' }) };
}

export async function handler(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  const requestedMatchId = cleanText(event.queryStringParameters?.matchId);

  if (event.httpMethod === 'GET') {
    const tournamentSlug = getTournamentSlug(event);

    if (!tournamentSlug) {
      return json(400, { error: 'Choose a tournament before loading a bracket.' });
    }

    try {
      const bracket = await loadBracket(tournamentSlug);

      if (requestedMatchId) {
        const matchDetails = publicMatchDetails(bracket, requestedMatchId);

        if (!matchDetails) {
          return json(404, { error: 'That match was not found in this bracket.' });
        }

        return json(200, { ok: true, match: matchDetails });
      }

      return json(200, { ok: true, bracket: publicBracket(bracket) });
    } catch (error) {
      console.error('Public bracket load failed', error);
      return json(500, { error: 'Bracket storage is not available yet.' });
    }
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use GET to load a bracket or POST to manage one.' });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Bracket payload must be valid JSON.' });
  }

  const tournamentSlug = getTournamentSlug(event, payload);

  if (!tournamentSlug) {
    return json(400, { error: 'Choose a tournament before loading a bracket.' });
  }

  try {
    if (payload.action === 'generate') {
      const adminCheck = await requireAdmin(event);

      if (adminCheck.error) {
        return adminCheck.error;
      }

      const tournament = await loadTournamentForBracket(tournamentSlug);
      const checkInStatus = checkInOpenStatus(tournament);

      if (!checkInStatus.open) {
        return json(403, {
          error: checkInStatus.error,
          opensAt: checkInStatus.opensAt?.toISOString(),
        });
      }

      const signups = await loadTournamentSignups(tournamentSlug);

      if (signups.length < 2) {
        return json(400, { error: 'At least two signups are required before generating a bracket.' });
      }

      const tournamentMode = await loadTournamentMode(tournamentSlug);

      if (tournamentMode.value === 'four-player-double-elimination' && signups.length !== 4) {
        return json(400, {
          error: '4-Man Double Elimination requires exactly four registered players before generating a bracket.',
        });
      }

      if (tournamentMode.value === 'three-player-two-life' && signups.length !== 3) {
        return json(400, {
          error: '3-Man Two-Life requires exactly three registered players before generating a bracket.',
        });
      }

      if (!canGenerateTournamentMode(tournamentMode.value)) {
        return json(400, {
          error: `${tournamentMode.label} is saved for this event, but bracket generation for that mode is not wired yet.`,
        });
      }

      const bracket = tournamentMode.value === 'four-player-double-elimination'
        ? buildFourPlayerDoubleEliminationBracket({ tournamentSlug, signups, includeAdminFields: true })
        : tournamentMode.value === 'three-player-two-life'
          ? buildThreePlayerTwoLifeBracket({ tournamentSlug, signups, includeAdminFields: true })
          : buildBracket({ tournamentSlug, signups, includeAdminFields: true });
      const savedBracket = await saveBracket(bracket);

      return json(201, { ok: true, bracket: savedBracket });
    }

    if (payload.action === 'reset') {
      const adminCheck = await requireAdmin(event);

      if (adminCheck.error) {
        return adminCheck.error;
      }

      await deleteBracket(tournamentSlug);

      return json(200, { ok: true, bracket: null });
    }

    if (payload.action === 'report-winner') {
      const reporterCheck = await requireMatchReporter(event);

      if (reporterCheck.error) {
        return reporterCheck.error;
      }

      const matchId = cleanText(payload.matchId);
      const winnerId = cleanText(payload.winnerId);
      const result = await reportWinnerWithRetry(tournamentSlug, matchId, winnerId);

      if (result.error) {
        return result.error;
      }

      return json(200, { ok: true, bracket: result.bracket });
    }

    return json(400, { error: 'Choose a supported bracket action.' });
  } catch (error) {
    console.error('Bracket management failed', error);
    return json(500, { error: 'Bracket storage is not available yet.' });
  }
}
