import { connectLambda, getStore } from '@netlify/blobs';

import { requireTournamentAdmin } from './_host-auth.mjs';

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

function cleanSlug(value) {
  return String(value || '').trim();
}

function getSignupStore() {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;

  if (siteID && token) {
    return getStore({
      name: 'tournament-signups',
      siteID,
      token,
    });
  }

  return getStore('tournament-signups');
}

function groupSignups(signups) {
  const lookup = new Map();

  signups.forEach((signup) => {
    if (!lookup.has(signup.tournamentSlug)) {
      lookup.set(signup.tournamentSlug, {
        tournamentSlug: signup.tournamentSlug,
        signups: [],
      });
    }

    lookup.get(signup.tournamentSlug).signups.push({
      id: signup.id,
      tournamentSlug: signup.tournamentSlug,
      accountId: signup.accountId || '',
      accountEmail: signup.accountEmail || '',
      playerName: signup.playerName,
      contactEmail: signup.contactEmail,
      playerHandle: signup.playerHandle,
      notes: signup.notes,
      status: signup.status,
      createdAt: signup.createdAt,
    });
  });

  return [...lookup.values()].map((roster) => ({
    ...roster,
    signups: roster.signups.sort((first, second) => first.createdAt.localeCompare(second.createdAt)),
  }));
}

async function loadSignups(store, requestedSlug) {
  const prefix = requestedSlug ? `${requestedSlug}/` : undefined;
  const { blobs } = await store.list(prefix ? { prefix } : {});
  const signups = await Promise.all(
    blobs.map((blob) => store.get(blob.key, { type: 'json' })),
  );

  return signups.filter(Boolean);
}

export async function handler(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Use GET to load the admin roster.' });
  }

  const adminCheck = await requireTournamentAdmin(event);

  if (adminCheck.error) {
    return json(adminCheck.error.statusCode, { error: adminCheck.error.message });
  }

  const requestedSlug = cleanSlug(event.queryStringParameters?.slug);

  try {
    const store = getSignupStore();
    const signups = await loadSignups(store, requestedSlug);

    return json(200, {
      ok: true,
      hostAuth: adminCheck.method,
      rosters: requestedSlug && signups.length === 0
        ? [{ tournamentSlug: requestedSlug, signups: [] }]
        : groupSignups(signups),
    });
  } catch (error) {
    console.error('Admin roster load failed', error);
    return json(500, { error: 'Roster storage is not available yet.' });
  }
}
