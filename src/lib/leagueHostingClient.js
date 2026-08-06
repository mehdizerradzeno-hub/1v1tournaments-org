const LEAGUE_ENDPOINT = '/.netlify/functions/leagues';

function readCredentials(endpoint) {
  return endpoint.startsWith('http') ? 'omit' : 'include';
}

async function readJsonResponse(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || 'The server returned an unreadable response.' };
  }
}

export async function fetchLeagues({ includeArchived = false } = {}) {
  const query = includeArchived ? '?includeArchived=true' : '';
  const response = await fetch(`${LEAGUE_ENDPOINT}${query}`, {
    credentials: readCredentials(LEAGUE_ENDPOINT),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Leagues could not be loaded.');
  }

  return result;
}

export async function fetchLeague(leagueId) {
  const query = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : '';
  const response = await fetch(`${LEAGUE_ENDPOINT}${query}`, {
    credentials: readCredentials(LEAGUE_ENDPOINT),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'League could not be loaded.');
  }

  return result;
}

export async function saveLeague({ token, league }) {
  const response = await fetch(LEAGUE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'save',
      league,
    }),
  });
  const result = await readJsonResponse(response);
  if (!response.ok) throw new Error(result?.error || 'League could not be saved.');
  return result;
}

export async function archiveLeague({ token, leagueId }) {
  const response = await fetch(LEAGUE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'archive', leagueId }),
  });
  const result = await readJsonResponse(response);
  if (!response.ok) throw new Error(result?.error || 'League could not be archived.');
  return result;
}

export async function joinLeague({ leagueId, displayName = '' }) {
  const response = await fetch(LEAGUE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'join', leagueId, displayName }),
  });
  const result = await readJsonResponse(response);
  if (!response.ok) throw new Error(result?.error || 'League join failed.');
  return result;
}

export async function leaveLeague(leagueId) {
  const response = await fetch(LEAGUE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'leave', leagueId }),
  });
  const result = await readJsonResponse(response);
  if (!response.ok) throw new Error(result?.error || 'League leave failed.');
  return result;
}

export async function setRegistrationOpen({ token, leagueId, registrationOpen }) {
  const response = await fetch(LEAGUE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'set-registration', leagueId, registrationOpen }),
  });
  const result = await readJsonResponse(response);
  if (!response.ok) throw new Error(result?.error || 'League registration update failed.');
  return result;
}

export async function generateLeagueScheduleAction({ token, leagueId, weekCount = 6, doubleRoundRobin = false }) {
  const response = await fetch(LEAGUE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'generate-schedule',
      leagueId,
      weekCount,
      doubleRoundRobin,
    }),
  });
  const result = await readJsonResponse(response);
  if (!response.ok) throw new Error(result?.error || 'League schedule could not be generated.');
  return result;
}

export async function launchLeagueMatch({ token, leagueId, matchId, roomUrl = '' }) {
  const response = await fetch(LEAGUE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'launch-match', leagueId, matchId, roomUrl }),
  });
  const result = await readJsonResponse(response);
  if (!response.ok) throw new Error(result?.error || 'Match launch URL could not be saved.');
  return result;
}

export async function reportLeagueResult({ token, leagueId, matchId, result, callbackId = '', force = false }) {
  const response = await fetch(LEAGUE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: force ? 'force-result' : 'submit-result',
      leagueId,
      matchId,
      result,
      callbackId,
      source: 'league-admin',
    }),
  });
  const next = await readJsonResponse(response);
  if (!response.ok) throw new Error(next?.error || 'League result could not be reported.');
  return next;
}

export async function removeLeaguePlayer({ token, leagueId, canonicalAccountId, accountId }) {
  const response = await fetch(LEAGUE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'remove-participant',
      leagueId,
      canonicalAccountId,
      accountId,
    }),
  });
  const result = await readJsonResponse(response);
  if (!response.ok) throw new Error(result?.error || 'Player could not be removed.');
  return result;
}

export async function promoteLeagueWaitlist({ token, leagueId, canonicalAccountId, accountId }) {
  const response = await fetch(LEAGUE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'promote-waitlist',
      leagueId,
      canonicalAccountId,
      accountId,
    }),
  });
  const result = await readJsonResponse(response);
  if (!response.ok) throw new Error(result?.error || 'Player could not be promoted.');
  return result;
}

export async function exportLeagueStandingsAction({ token, leagueId }) {
  const response = await fetch(LEAGUE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'export-standings', leagueId }),
  });
  const result = await readJsonResponse(response);
  if (!response.ok) throw new Error(result?.error || 'Standings could not be exported.');
  return result;
}
