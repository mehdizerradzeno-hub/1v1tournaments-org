import { connectLambda, getStore } from '@netlify/blobs';

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

function getAdminToken() {
  return process.env.TOURNAMENT_ADMIN_TOKEN || '';
}

function getBearerToken(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
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
    seed: index + 1,
    name: signup.playerName,
    handle: signup.playerHandle || '',
  };
}

function adminParticipant(signup, index) {
  return {
    ...publicParticipant(signup, index),
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

function findMatch(bracket, matchId) {
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

function setMatchWinner(bracket, match, player) {
  match.winnerId = player.id;
  match.winnerName = getPlayerName(player);
  match.status = 'final';

  if (match.nextMatchId) {
    const nextMatch = findMatch(bracket, match.nextMatchId);

    if (nextMatch) {
      nextMatch.players[match.nextSlot] = player;

      const filledPlayers = nextMatch.players.filter(Boolean);
      if (filledPlayers.length === 2 && nextMatch.status === 'pending') {
        nextMatch.status = 'ready';
      }

    }
  } else {
    bracket.status = 'complete';
    bracket.winner = {
      id: player.id,
      name: getPlayerName(player),
    };
  }
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

function buildBracket({ tournamentSlug, signups, includeAdminFields = false }) {
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

async function loadBracket(tournamentSlug) {
  const store = getStoreWithFallback('tournament-brackets');
  return store.get(`${tournamentSlug}.json`, { type: 'json' });
}

async function loadBracketWithMetadata(tournamentSlug) {
  const store = getStoreWithFallback('tournament-brackets');
  const result = await store.getWithMetadata(`${tournamentSlug}.json`, { type: 'json' });

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

function requireAdmin(event) {
  const adminToken = getAdminToken();

  if (!adminToken) {
    return { error: json(503, { error: 'Tournament admin token is not configured on Netlify.' }) };
  }

  if (getBearerToken(event) !== adminToken) {
    return { error: json(401, { error: 'Enter the tournament admin token to manage brackets.' }) };
  }

  return { ok: true };
}

export async function handler(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  const tournamentSlug = cleanText(event.queryStringParameters?.slug);

  if (!tournamentSlug) {
    return json(400, { error: 'Choose a tournament before loading a bracket.' });
  }

  if (event.httpMethod === 'GET') {
    try {
      const bracket = await loadBracket(tournamentSlug);
      return json(200, { ok: true, bracket: publicBracket(bracket) });
    } catch (error) {
      console.error('Public bracket load failed', error);
      return json(500, { error: 'Bracket storage is not available yet.' });
    }
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use GET to load a bracket or POST to manage one.' });
  }

  const adminCheck = requireAdmin(event);

  if (adminCheck.error) {
    return adminCheck.error;
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Bracket payload must be valid JSON.' });
  }

  try {
    if (payload.action === 'generate') {
      const signups = await loadTournamentSignups(tournamentSlug);

      if (signups.length < 2) {
        return json(400, { error: 'At least two signups are required before generating a bracket.' });
      }

      const bracket = buildBracket({ tournamentSlug, signups, includeAdminFields: true });
      const savedBracket = await saveBracket(bracket);

      return json(201, { ok: true, bracket: savedBracket });
    }

    if (payload.action === 'report-winner') {
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
