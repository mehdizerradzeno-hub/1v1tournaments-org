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

function playerMatchesSignup(player, signup) {
  if (!player || !signup) return false;

  return Boolean(
    (player.accountId && signup.accountId && player.accountId === signup.accountId)
      || player.id === signup.id
      || (player.signupId && player.signupId === signup.id),
  );
}

function getMatchLoser(match) {
  if (!match?.winnerId) return null;

  if (match.loserId) {
    return match.players.find((player) => playerMatchesSignup(player, { id: match.loserId, accountId: match.loserAccountId })) || {
      id: match.loserId,
      accountId: match.loserAccountId || '',
    };
  }

  return match.players.find((player) => player && player.id !== match.winnerId) || null;
}

function playerLostMatch(match, signup) {
  if (!match || match.status !== 'final' || !match.winnerId || !signup) {
    return false;
  }

  const loser = getMatchLoser(match);

  return playerMatchesSignup(loser, signup);
}

function countPlayerLosses(playerMatches, signup) {
  return playerMatches.filter(({ match }) => playerLostMatch(match, signup)).length;
}

function getTwoLifeStanding(bracket, signup) {
  return (bracket?.standings || []).find((standing) => {
    return standing.id === signup?.id || standing.accountId === signup?.accountId;
  }) || null;
}

function isPlayerEliminated(bracket, playerMatches, signup) {
  if (!bracket || !signup) return false;

  if (bracket.winner?.id === signup.id) {
    return false;
  }

  if (bracket.status === 'complete') {
    return true;
  }

  if (bracket.format === 'three-player-two-life') {
    const standing = getTwoLifeStanding(bracket, signup);

    return Boolean(standing && (standing.status === 'out' || Number(standing.lives) <= 0));
  }

  if (bracket.format === 'four-player-double-elimination') {
    return countPlayerLosses(playerMatches, signup) >= 2;
  }

  return playerMatches.some(({ match }) => playerLostMatch(match, signup));
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
  return store.get(`${tournamentSlug}.json`, {
    consistency: 'strong',
    type: 'json',
  });
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

export function findPlayerMatchStatus(bracket, signup) {
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
      const seatIndex = match.players.findIndex((player) => playerMatchesSignup(player, signup));

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

  if (isPlayerEliminated(bracket, playerMatches, signup)) {
    const lostMatch = [...playerMatches].reverse().find(({ match }) => playerLostMatch(match, signup));

    return {
      currentMatch: null,
      waitingMatch: null,
      finalMatch: lostMatch ? publicMatch(lostMatch.round, lostMatch.match) : null,
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
