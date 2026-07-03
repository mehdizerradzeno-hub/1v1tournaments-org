import { getDatabase } from '@netlify/database';

const MAX_FIELD_LENGTH = 500;

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function cleanText(value) {
  return String(value || '').trim().slice(0, MAX_FIELD_LENGTH);
}

function cleanEmail(value) {
  return cleanText(value).toLowerCase();
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function publicSignup(row) {
  return {
    id: row.id,
    tournamentSlug: row.tournament_slug,
    playerName: row.player_name,
    playerHandle: row.player_handle,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use POST to submit a tournament signup.' });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Signup payload must be valid JSON.' });
  }

  const tournamentSlug = cleanText(payload.tournamentSlug);
  const playerName = cleanText(payload.playerName);
  const contactEmail = cleanEmail(payload.contactEmail);
  const playerHandle = cleanText(payload.playerHandle);
  const notes = cleanText(payload.notes);

  if (!tournamentSlug) {
    return json(400, { error: 'Choose a tournament before signing up.' });
  }

  if (!playerName) {
    return json(400, { error: 'Enter the player name for this signup.' });
  }

  if (!isEmailLike(contactEmail)) {
    return json(400, { error: 'Enter a valid contact email.' });
  }

  try {
    const { pool } = getDatabase();
    const result = await pool.query(
      `
        INSERT INTO tournament_signups (
          tournament_slug,
          player_name,
          contact_email,
          player_handle,
          notes
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, tournament_slug, player_name, player_handle, status, created_at
      `,
      [tournamentSlug, playerName, contactEmail, playerHandle, notes],
    );

    return json(201, {
      ok: true,
      signup: publicSignup(result.rows[0]),
    });
  } catch (error) {
    if (error?.code === '23505') {
      return json(409, { error: 'That email is already signed up for this tournament.' });
    }

    return json(500, {
      error: 'Signup storage is not available yet.',
      diagnostic: {
        errorName: error?.name || 'UnknownError',
        hasDatabaseUrl: Boolean(process.env.NETLIFY_DB_URL),
        hasDatabaseDriver: Boolean(process.env.NETLIFY_DB_DRIVER),
      },
    });
  }
}
