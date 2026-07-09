const SIGNUP_ENDPOINT = '/.netlify/functions/tournament-signup';
const ACCOUNT_ENDPOINT = '/.netlify/functions/player-account';
const ROSTER_ENDPOINT = '/.netlify/functions/admin-roster';
const BRACKET_ENDPOINT = '/.netlify/functions/tournament-bracket';
const MATCH_ACCESS_ENDPOINT = '/.netlify/functions/tournament-match-access';
const PLAYER_STATUS_ENDPOINT = '/.netlify/functions/tournament-player-status';
const SETTINGS_ENDPOINT = '/.netlify/functions/tournament-settings';
const EVENTS_ENDPOINT = '/.netlify/functions/tournament-events';
const DISCORD_ALERT_ENDPOINT = '/.netlify/functions/discord-alert';
const STREAM_COMMANDS_ENDPOINT = '/.netlify/functions/stream-commands';
const HEALTH_ENDPOINT = '/.netlify/functions/health';
const PRODUCTION_API_ORIGIN = 'https://1v1tournaments.org';

function isLocalStaticPreview() {
  const hostname = globalThis.location?.hostname;

  return hostname === '127.0.0.1' || hostname === 'localhost';
}

function readEndpoint(endpoint) {
  return isLocalStaticPreview() ? `${PRODUCTION_API_ORIGIN}${endpoint}` : endpoint;
}

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

function adminHeaders(token, headers = {}) {
  const nextHeaders = { ...headers };

  if (token) {
    nextHeaders.Authorization = `Bearer ${token}`;
  }

  return nextHeaders;
}

export async function submitTournamentSignup(payload) {
  const response = await fetch(SIGNUP_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Signup could not be saved.');
  }

  return result;
}

export async function fetchPlayerAccount() {
  const response = await fetch(ACCOUNT_ENDPOINT, {
    credentials: 'include',
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Player account could not be loaded.');
  }

  return result;
}

export async function createPlayerAccount(payload) {
  const response = await fetch(ACCOUNT_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...payload, action: 'create' }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Player account could not be created.');
  }

  return result;
}

export async function loginPlayerAccount(payload) {
  const response = await fetch(ACCOUNT_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...payload, action: 'login' }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Player account could not be opened.');
  }

  return result;
}

export async function logoutPlayerAccount() {
  const response = await fetch(ACCOUNT_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'logout' }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Player account could not be signed out.');
  }

  return result;
}

export async function fetchSignupSummary({ slug }) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const endpoint = `${readEndpoint(SIGNUP_ENDPOINT)}${query}`;
  const response = await fetch(endpoint, {
    credentials: readCredentials(endpoint),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Signup count could not be loaded.');
  }

  return result;
}

export async function fetchTournamentSettings({ slug }) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const response = await fetch(`${readEndpoint(SETTINGS_ENDPOINT)}${query}`);
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Tournament schedule settings could not be loaded.');
  }

  return result;
}

export async function fetchTournamentEvents({ slug } = {}) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const response = await fetch(`${readEndpoint(EVENTS_ENDPOINT)}${query}`);
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Tournament events could not be loaded.');
  }

  return result;
}

export async function fetchTournamentEvent({ slug }) {
  const result = await fetchTournamentEvents({ slug });

  return {
    ...result,
    tournament: result.tournament || result.tournaments?.[0] || null,
  };
}

export async function saveTournamentEvent({ token, tournament }) {
  const response = await fetch(EVENTS_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: adminHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      action: 'save',
      tournament,
    }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Tournament event could not be saved.');
  }

  return result;
}

export async function deleteTournamentEvent({ token, slug }) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const response = await fetch(`${EVENTS_ENDPOINT}${query}`, {
    method: 'POST',
    credentials: 'include',
    headers: adminHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      action: 'delete',
      tournamentSlug: slug,
    }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Tournament event could not be deleted.');
  }

  return result;
}

export async function saveTournamentSettings({ token, slug, settings }) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const response = await fetch(`${SETTINGS_ENDPOINT}${query}`, {
    method: 'POST',
    credentials: 'include',
    headers: adminHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      action: 'save',
      tournamentSlug: slug,
      settings,
    }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Tournament schedule settings could not be saved.');
  }

  return result;
}

export async function resetTournamentSettings({ token, slug }) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const response = await fetch(`${SETTINGS_ENDPOINT}${query}`, {
    method: 'POST',
    credentials: 'include',
    headers: adminHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      action: 'reset',
      tournamentSlug: slug,
    }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Tournament schedule settings could not be reset.');
  }

  return result;
}

export async function fetchTournamentRoster({ token, slug }) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const response = await fetch(`${ROSTER_ENDPOINT}${query}`, {
    credentials: 'include',
    headers: adminHeaders(token),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Roster could not be loaded.');
  }

  return result;
}

export async function clearTournamentData({ token, slug }) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const response = await fetch(`${ROSTER_ENDPOINT}${query}`, {
    method: 'POST',
    credentials: 'include',
    headers: adminHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      action: 'clear-tournament',
      tournamentSlug: slug,
    }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Tournament test data could not be cleared.');
  }

  return result;
}

export async function fetchTournamentBracket({ slug }) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const response = await fetch(`${readEndpoint(BRACKET_ENDPOINT)}${query}`);
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Bracket could not be loaded.');
  }

  return result;
}

export async function fetchTournamentMatch({ slug, matchId }) {
  const params = new URLSearchParams();

  if (slug) {
    params.set('slug', slug);
  }

  if (matchId) {
    params.set('matchId', matchId);
  }

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${readEndpoint(BRACKET_ENDPOINT)}${query}`);
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Match could not be loaded.');
  }

  return result;
}

export async function fetchTournamentPlayerStatus({ slug }) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const response = await fetch(`${PLAYER_STATUS_ENDPOINT}${query}`, {
    credentials: 'include',
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Player tournament status could not be loaded.');
  }

  return result;
}

export async function issueTournamentMatchTicket({ slug, matchId }) {
  const response = await fetch(MATCH_ACCESS_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'issue-ticket',
      tournamentSlug: slug,
      matchId,
    }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Match access could not be opened.');
  }

  return result;
}

export async function generateTournamentBracket({ token, slug }) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const response = await fetch(`${BRACKET_ENDPOINT}${query}`, {
    method: 'POST',
    credentials: 'include',
    headers: adminHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ action: 'generate' }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Bracket could not be generated.');
  }

  return result;
}

export async function resetTournamentBracket({ token, slug }) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const response = await fetch(`${BRACKET_ENDPOINT}${query}`, {
    method: 'POST',
    credentials: 'include',
    headers: adminHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ action: 'reset' }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Bracket could not be reset.');
  }

  return result;
}

export async function reportTournamentMatchWinner({ token, slug, matchId, winnerId }) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const response = await fetch(`${BRACKET_ENDPOINT}${query}`, {
    method: 'POST',
    credentials: 'include',
    headers: adminHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ action: 'report-winner', matchId, winnerId }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Winner could not be saved.');
  }

  return result;
}

export async function sendDiscordAlert({ token, message }) {
  const response = await fetch(DISCORD_ALERT_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: adminHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      message,
    }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Discord alert could not be sent.');
  }

  return result;
}

export async function fetchStreamCommands() {
  const response = await fetch(readEndpoint(STREAM_COMMANDS_ENDPOINT), {
    credentials: readCredentials(readEndpoint(STREAM_COMMANDS_ENDPOINT)),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Stream commands could not be loaded.');
  }

  return result;
}

export async function fetchRuntimeHealth() {
  const endpoint = readEndpoint(HEALTH_ENDPOINT);
  const response = await fetch(endpoint, {
    credentials: readCredentials(endpoint),
  });
  const result = await readJsonResponse(response);

  if (!response.ok && response.status !== 503) {
    throw new Error(result?.error || 'Runtime health could not be loaded.');
  }

  return result;
}

export async function saveStreamCommands({ token, commands }) {
  const response = await fetch(STREAM_COMMANDS_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: adminHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ commands }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Stream commands could not be saved.');
  }

  return result;
}

export async function resetStreamCommands({ token }) {
  const response = await fetch(STREAM_COMMANDS_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: adminHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ action: 'reset' }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Stream commands could not be reset.');
  }

  return result;
}
