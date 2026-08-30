import { connectLambda } from '@netlify/blobs';

import {
  cleanEmail,
  cleanText,
  accountCanonicalId,
  getAccountFromEvent,
  getStoreWithFallback,
  publicAccount,
} from './_account-utils.mjs';
import { buildTournamentReturnPath } from './_tournament-game-contract.mjs';

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

async function loadAllTournamentSignups() {
  const store = getStoreWithFallback('tournament-signups');
  const signups = [];
  let cursor;

  do {
    const page = await store.list(cursor ? { cursor } : {});
    const records = await Promise.all(
      (page.blobs || []).map((blob) => store.get(blob.key, { type: 'json' })),
    );

    signups.push(...records.filter(Boolean));
    cursor = page.hasMore ? cleanText(page.cursor) : '';
  } while (cursor);

  return signups;
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

function activeMatchMetadata(tournamentSlug, bracket, currentMatch) {
  if (!tournamentSlug || !currentMatch?.id || currentMatch.status !== 'ready') {
    return null;
  }

  let tournamentPath;

  try {
    tournamentPath = buildTournamentReturnPath(tournamentSlug);
  } catch {
    return null;
  }

  return {
    tournamentSlug,
    matchId: currentMatch.id,
    bracketStatus: bracket?.status || null,
    tournamentPath,
    matchPath: `${tournamentPath}#my-match`,
    updatedAt: bracket?.updatedAt || bracket?.createdAt || '',
  };
}

export async function findActivePlayerMatches(account, dependencies = {}) {
  if (!account) return [];

  const listSignups = dependencies.loadAllTournamentSignups || loadAllTournamentSignups;
  const readBracket = dependencies.loadBracket || loadBracket;
  const signups = await listSignups();
  const ownedSignupsByTournament = new Map();

  for (const signup of signups) {
    const tournamentSlug = cleanText(signup?.tournamentSlug);

    if (tournamentSlug && signupMatchesAccount(signup, account)) {
      const tournamentSignups = ownedSignupsByTournament.get(tournamentSlug) || [];
      tournamentSignups.push(signup);
      ownedSignupsByTournament.set(tournamentSlug, tournamentSignups);
    }
  }

  const bracketResults = await Promise.allSettled(
    [...ownedSignupsByTournament.entries()].map(async ([tournamentSlug, tournamentSignups]) => {
      const bracket = await readBracket(tournamentSlug);

      if (!bracket || bracket.status === 'complete') {
        return null;
      }

      for (const signup of tournamentSignups) {
        const matchStatus = findPlayerMatchStatus(bracket, signup);
        const metadata = activeMatchMetadata(tournamentSlug, bracket, matchStatus.currentMatch);

        if (metadata) return metadata;
      }

      return null;
    }),
  );

  return bracketResults
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value)
    .sort((first, second) => {
      return String(second.updatedAt || '').localeCompare(String(first.updatedAt || ''))
        || first.tournamentSlug.localeCompare(second.tournamentSlug)
        || first.matchId.localeCompare(second.matchId);
    })
    .map((candidate) => ({
      tournamentSlug: candidate.tournamentSlug,
      matchId: candidate.matchId,
      bracketStatus: candidate.bracketStatus,
      tournamentPath: candidate.tournamentPath,
      matchPath: candidate.matchPath,
    }));
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
    case 'no-active-match':
      return 'You do not have an unresolved tournament match right now.';
    default:
      return 'You are signed up. Wait for the host to publish your match.';
  }
}

export async function handler(event, dependencies = {}) {
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

  try {
    const resolveAccount = dependencies.getAccountFromEvent || getAccountFromEvent;
    const readTournamentSignups = dependencies.loadTournamentSignups || loadTournamentSignups;
    const readBracket = dependencies.loadBracket || loadBracket;
    const account = await resolveAccount(event);

    if (!tournamentSlug) {
      if (!account) {
        return json(200, {
          ok: true,
          scope: 'active-match',
          account: null,
          activeMatch: null,
          activeMatchCount: 0,
          nextStep: 'sign-in',
          statusLabel: statusLabel('sign-in'),
        });
      }

      const activeMatches = await findActivePlayerMatches(account, {
        loadAllTournamentSignups: dependencies.loadAllTournamentSignups,
        loadBracket: readBracket,
      });
      const activeMatch = activeMatches[0] || null;
      const nextStep = activeMatch ? 'ready-match' : 'no-active-match';

      return json(200, {
        ok: true,
        scope: 'active-match',
        account: publicAccount(account),
        activeMatch,
        activeMatchCount: activeMatches.length,
        nextStep,
        statusLabel: statusLabel(nextStep),
      });
    }

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
      readTournamentSignups(tournamentSlug),
      readBracket(tournamentSlug),
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
