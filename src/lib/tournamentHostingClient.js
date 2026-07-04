const SIGNUP_ENDPOINT = '/.netlify/functions/tournament-signup';
const ACCOUNT_ENDPOINT = '/.netlify/functions/player-account';
const ROSTER_ENDPOINT = '/.netlify/functions/admin-roster';
const BRACKET_ENDPOINT = '/.netlify/functions/tournament-bracket';

async function readJsonResponse(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || 'The server returned an unreadable response.' };
  }
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
  const response = await fetch(`${SIGNUP_ENDPOINT}${query}`);
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Signup count could not be loaded.');
  }

  return result;
}

export async function fetchTournamentRoster({ token, slug }) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const response = await fetch(`${ROSTER_ENDPOINT}${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Roster could not be loaded.');
  }

  return result;
}

export async function fetchTournamentBracket({ slug }) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const response = await fetch(`${BRACKET_ENDPOINT}${query}`);
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
  const response = await fetch(`${BRACKET_ENDPOINT}${query}`);
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Match could not be loaded.');
  }

  return result;
}

export async function generateTournamentBracket({ token, slug }) {
  const query = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const response = await fetch(`${BRACKET_ENDPOINT}${query}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
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
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
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
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'report-winner', matchId, winnerId }),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(result?.error || 'Winner could not be saved.');
  }

  return result;
}
