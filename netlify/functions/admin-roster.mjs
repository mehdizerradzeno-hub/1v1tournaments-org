import { getDatabase } from '@netlify/database';

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

function getAdminToken() {
  return process.env.TOURNAMENT_ADMIN_TOKEN || '';
}

function getBearerToken(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function cleanSlug(value) {
  return String(value || '').trim();
}

function groupRows(rows) {
  const lookup = new Map();

  rows.forEach((row) => {
    if (!lookup.has(row.tournament_slug)) {
      lookup.set(row.tournament_slug, {
        tournamentSlug: row.tournament_slug,
        signups: [],
      });
    }

    lookup.get(row.tournament_slug).signups.push({
      id: row.id,
      tournamentSlug: row.tournament_slug,
      playerName: row.player_name,
      contactEmail: row.contact_email,
      playerHandle: row.player_handle,
      notes: row.notes,
      status: row.status,
      createdAt: row.created_at,
    });
  });

  return [...lookup.values()];
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Use GET to load the admin roster.' });
  }

  const adminToken = getAdminToken();

  if (!adminToken) {
    return json(503, { error: 'Tournament admin token is not configured on Netlify.' });
  }

  if (getBearerToken(event) !== adminToken) {
    return json(401, { error: 'Enter the tournament admin token to view signups.' });
  }

  const requestedSlug = cleanSlug(event.queryStringParameters?.slug);

  try {
    const { pool } = getDatabase();
    const result = requestedSlug
      ? await pool.query(
          `
            SELECT id, tournament_slug, player_name, contact_email, player_handle, notes, status, created_at
            FROM tournament_signups
            WHERE tournament_slug = $1
            ORDER BY created_at ASC
          `,
          [requestedSlug],
        )
      : await pool.query(
          `
            SELECT id, tournament_slug, player_name, contact_email, player_handle, notes, status, created_at
            FROM tournament_signups
            ORDER BY tournament_slug ASC, created_at ASC
          `,
        );

    return json(200, {
      ok: true,
      rosters: requestedSlug && result.rows.length === 0
        ? [{ tournamentSlug: requestedSlug, signups: [] }]
        : groupRows(result.rows),
    });
  } catch (error) {
    return json(500, {
      error: 'Roster storage is not available yet.',
      diagnostic: {
        errorName: error?.name || 'UnknownError',
        hasDatabaseUrl: Boolean(process.env.NETLIFY_DB_URL),
        hasDatabaseDriver: Boolean(process.env.NETLIFY_DB_DRIVER),
      },
    });
  }
}
