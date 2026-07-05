import { connectLambda } from '@netlify/blobs';

import {
  cleanEmail,
  cleanText,
  getAccountFromEvent,
  getStoreWithFallback,
  publicAccount,
} from './_account-utils.mjs';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

function publicSignup(signup) {
  if (!signup) return null;

  return {
    id: signup.id,
    tournamentSlug: signup.tournamentSlug,
    playerName: signup.playerName,
    playerHandle: signup.playerHandle || '',
    status: signup.status,
    createdAt: signup.createdAt,
  };
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

function publicMatch(round, match) {
  if (!match) return null;

  return {
    id: match.id,
    label: match.label,
    status: match.status,
    roomUrl: match.roomUrl,
    round: {
      index: round.index,
      title: round.title,
    },
    matchIndex: match.matchIndex,
    players: match.players.map(publicPlayer),
    winnerName: match.winnerName || '',
  };
}

async function loadTournamentSignups(tournamentSlug) {
  const store = getStoreWithFallback('tournament-signups');
  const { blobs } = await store.list({ prefix: `${tournamentSlug}/` });
  const signups = await Promise.all(blobs.map((blob) => store.get(blob.key, { type: 'json' })));

  return signups.filter(Boolean).sort((first, second) => {
    return String(first.createdAt || '').localeCompare(String(second.createdAt || ''));
  });
}

async function loadBracket(tournamentSlug) {
  const store = getStoreWithFallback('tournament-brackets');
  return store.get(`${tournamentSlug}.json`, { type: 'json' });
}

function signupMatchesAccount(signup, account) {
  if (!signup || !account) return false;

  const accountId = cleanText(account.id);
  const accountEmail = cleanEmail(account.email);

  if (accountId && cleanText(signup.accountId) === accountId) {
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

function findPlayerMatchStatus(bracket, signup) {
  if (!bracket || !signup) {
    return {
      currentMatch: null,
      waitingMatch: null,
      finalMatch: null,
      nextStep: signup ? 'wait-bracket' : 'sign-up',
    };
  }

  const playerMatches = [];

  for (const round of bracket.rounds || []) {
    for (const match of round.matches || []) {
      const seatIndex = match.players.findIndex((player) => player?.accountId === signup.accountId || player?.id === signup.id);

      if (seatIndex !== -1) {
        playerMatches.push({ round, match, seatIndex });
      }
    }
  }

  const current = playerMatches.find(({ match }) => match.status === 'ready');
  if (current) {
    return {
      currentMatch: publicMatch(current.round, current.match),
      waitingMatch: null,
      finalMatch: null,
      nextStep: 'ready-match',
    };
  }

  const waiting = playerMatches.find(({ match }) => match.status === 'pending' && !match.winnerId);
  if (waiting) {
    return {
      currentMatch: null,
      waitingMatch: publicMatch(waiting.round, waiting.match),
      finalMatch: null,
      nextStep: 'wait-opponent',
    };
  }

  const lostMatch = playerMatches.find(({ match }) => match.status === 'final' && match.winnerId && match.winnerId !== signup.id);
  if (lostMatch) {
    return {
      currentMatch: null,
      waitingMatch: null,
      finalMatch: publicMatch(lostMatch.round, lostMatch.match),
      nextStep: 'eliminated',
    };
  }

  if (bracket.winner?.id === signup.id) {
    return {
      currentMatch: null,
      waitingMatch: null,
      finalMatch: null,
      nextStep: 'champion',
    };
  }

  return {
    currentMatch: null,
    waitingMatch: null,
    finalMatch: null,
    nextStep: bracket.status === 'complete' ? 'complete' : 'wait-bracket',
  };
}

function statusLabel(nextStep) {
  switch (nextStep) {
    case 'sign-in':
      return 'Sign in to see your tournament status.';
    case 'sign-up':
      return 'Create or open your player account, then sign up for this tournament.';
    case 'ready-match':
      return 'Your match is ready.';
    case 'wait-opponent':
      return 'You are waiting for the next opponent to be set.';
    case 'eliminated':
      return 'Your tournament run is complete.';
    case 'champion':
      return 'You won this tournament.';
    case 'complete':
      return 'This tournament is complete.';
    default:
      return 'You are signed up. Wait for the host to publish your match.';
  }
}

export async function handler(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Use GET to load player tournament status.' });
  }

  const tournamentSlug = cleanText(event.queryStringParameters?.slug);

  if (!tournamentSlug) {
    return json(400, { error: 'Choose a tournament before loading player status.' });
  }

  try {
    const account = await getAccountFromEvent(event);

    if (!account) {
      return json(200, {
        ok: true,
        tournamentSlug,
        account: null,
        signup: null,
        bracketStatus: null,
        participantCount: 0,
        currentMatch: null,
        waitingMatch: null,
        finalMatch: null,
        nextStep: 'sign-in',
        statusLabel: statusLabel('sign-in'),
      });
    }

    const [signups, bracket] = await Promise.all([
      loadTournamentSignups(tournamentSlug),
      loadBracket(tournamentSlug),
    ]);
    const signup = signups.find((item) => signupMatchesAccount(item, account)) || null;
    const matchStatus = findPlayerMatchStatus(bracket, signup);
    const nextStep = signup ? matchStatus.nextStep : 'sign-up';

    return json(200, {
      ok: true,
      tournamentSlug,
      account: publicAccount(account),
      signup: publicSignup(signup),
      bracketStatus: bracket?.status || null,
      participantCount: bracket?.participantCount || signups.length,
      ...matchStatus,
      nextStep,
      statusLabel: statusLabel(nextStep),
    });
  } catch (error) {
    console.error('Tournament player status failed', error);
    return json(500, { error: 'Player tournament status is not available yet.' });
  }
}
