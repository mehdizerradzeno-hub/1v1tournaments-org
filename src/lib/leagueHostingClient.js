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
    headers: token ? { Authorization: `Bearer ${token}` , 'Content-Type': 'application/json' } : {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'save',
      league,
    }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'League could not be saved.');
  }

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

  if (!response.ok) {
    throw new Error(result?.error || 'League could not be archived.');
  }

  return result;
}

export async function joinLeague({ leagueId, displayName = '' }) {
  const response = await fetch(LEAGUE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'join',
      leagueId,
      displayName,
    }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'League join failed.');
  }

  return result;
}

export async function leaveLeague(leagueId) {
  const response = await fetch(LEAGUE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'leave', leagueId }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'League leave failed.');
  }

  return result;
}

export async function generateLeagueScheduleAction({ token, leagueId, weekCount = 6 }) {
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
    }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'League schedule could not be generated.');
  }

  return result;
}
