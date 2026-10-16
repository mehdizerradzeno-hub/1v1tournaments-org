import { connectLambda } from '@netlify/blobs';

import {
  cleanEmail,
  cleanText,
  accountCanonicalId,
  getAccountFromEvent,
  getStoreWithFallback,
  publicAccount,
} from './_account-utils.mjs';
import { listHostedTournaments } from './_tournament-events-utils.mjs';
import {
  HOST_ACCOUNT_PLAYER_BLOCK_CODE,
  HOST_ACCOUNT_PLAYER_BLOCK_MESSAGE,
  isHostAccount,
  isHostSignup,
} from './_host-auth.mjs';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
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
    accountId: signup.accountId || '',
    canonicalAccountId: signup.canonicalAccountId || signup.accountCanonicalId || signup.accountId || '',
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
    accountId: player.accountId || '',
    canonicalAccountId: player.canonicalAccountId || player.accountId || '',
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

function privateReadyMatch(match) {
  if (!match) return null;

  return {
    id: match.id,
    label: match.label,
    status: match.status,
    round: match.round,
    matchIndex: match.matchIndex,
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

export async function loadTournamentSignups(tournamentSlug, options = {}) {
  const store = options.store || getStoreWithFallback('tournament-signups');
  const listedPages = store.list({ prefix: `${tournamentSlug}/`, paginate: true });
  const pages = typeof listedPages?.[Symbol.asyncIterator] === 'function'
    ? listedPages
    : [await listedPages];
  const signups = [];

  for await (const { blobs = [] } of pages) {
    for (let index = 0; index < blobs.length; index += 16) {
      const batch = blobs.slice(index, index + 16);
      signups.push(...await Promise.all(batch.map((blob) => store.get(blob.key, { type: 'json' }))));
    }
  }

  return signups.filter((signup) => signup && !isHostSignup(signup)).sort((first, second) => {
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

export async function findReadyEuchreAssignments(account, options = {}) {
  if (!account) return [];

  const events = options.events || await listHostedTournaments();
  const loadSignups = options.loadSignups || loadTournamentSignups;
  const loadEventBracket = options.loadBracket || loadBracket;
  const candidates = events.filter((event) => (
    event?.gameSlug === 'euchre' && event.status === 'live'
  ));
  const resolved = [];

  for (let index = 0; index < candidates.length; index += 4) {
    const batch = candidates.slice(index, index + 4);
    resolved.push(...await Promise.all(batch.map(async (event) => {
      const [signups, bracket] = await Promise.all([
        loadSignups(event.slug),
        loadEventBracket(event.slug),
      ]);
      const signup = signups.find((item) => signupMatchesAccount(item, account));

      if (!signup) return null;

      const currentMatch = findPlayerMatchStatus(bracket, signup).currentMatch;

      if (!currentMatch) return null;

      return {
        event: {
          slug: event.slug,
          title: event.title,
        },
        match: privateReadyMatch(currentMatch),
      };
    })));
  }

  return resolved.filter(Boolean);
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
  const scope = cleanText(event.queryStringParameters?.scope).toLowerCase();

  if (scope === 'ready-matches') {
    const gameSlug = cleanText(event.queryStringParameters?.game).toLowerCase();

    if (gameSlug && gameSlug !== 'euchre') {
      return json(400, { error: 'Ready-match discovery is available only for Euchre.' });
    }

    try {
      const account = await getAccountFromEvent(event);

      if (!account) {
        return json(200, {
          ok: true,
          account: null,
          gameSlug: 'euchre',
          matches: [],
          nextStep: 'sign-in',
        });
      }

      const matches = await findReadyEuchreAssignments(account);

      return json(200, {
        ok: true,
        account: publicAccount(account),
        gameSlug: 'euchre',
        matches,
        nextStep: matches.length ? 'ready-match' : 'no-ready-match',
      });
    } catch (error) {
      console.error('Tournament ready-match discovery failed', error);
      return json(500, { error: 'Player tournament matches are not available yet.' });
    }
  }

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

    if (isHostAccount(account)) {
      return json(200, {
        ok: true,
        tournamentSlug,
        account: {
          ...publicAccount(account),
          hostApproved: true,
        },
        signup: null,
        bracketStatus: null,
        participantCount: 0,
        currentMatch: null,
        waitingMatch: null,
        finalMatch: null,
        nextStep: HOST_ACCOUNT_PLAYER_BLOCK_CODE,
        statusLabel: HOST_ACCOUNT_PLAYER_BLOCK_MESSAGE,
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
