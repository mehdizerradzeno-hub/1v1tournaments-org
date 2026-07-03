const SIGNUP_ENDPOINT = '/.netlify/functions/tournament-signup';
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
