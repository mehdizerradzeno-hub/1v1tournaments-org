import { connectLambda, getStore } from '@netlify/blobs';

import { requireTournamentAdmin } from './_host-auth.mjs';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

function getStoreWithFallback(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;

  if (siteID && token) {
    return getStore({
      name,
      siteID,
      token,
    });
  }

  return getStore(name);
}

function getSignupStore() {
  return getStoreWithFallback('tournament-signups');
}

function getBracketStore() {
  return getStoreWithFallback('tournament-brackets');
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

async function deleteTournamentSignups(store, tournamentSlug) {
  const { blobs } = await store.list({ prefix: `${tournamentSlug}/` });

  await Promise.all(blobs.map((blob) => store.delete(blob.key)));

  return blobs.length;
}

async function clearTournament(tournamentSlug) {
  const signupStore = getSignupStore();
  const bracketStore = getBracketStore();
  const deletedSignupCount = await deleteTournamentSignups(signupStore, tournamentSlug);

  await bracketStore.delete(`${tournamentSlug}.json`);

  return {
    deletedSignupCount,
    rosters: [{ tournamentSlug, signups: [] }],
  };
}

export async function handler(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return json(405, { error: 'Use GET to load the admin roster or POST to clear a tournament.' });
  }

  const adminCheck = await requireTournamentAdmin(event);

  if (adminCheck.error) {
    return json(adminCheck.error.statusCode, { error: adminCheck.error.message });
  }

  const requestedSlug = cleanSlug(event.queryStringParameters?.slug);

  try {
    if (event.httpMethod === 'POST') {
      let payload;

      try {
        payload = JSON.parse(event.body || '{}');
      } catch {
        return json(400, { error: 'Roster admin payload must be valid JSON.' });
      }

      const tournamentSlug = cleanSlug(requestedSlug || payload.tournamentSlug);

      if (payload.action !== 'clear-tournament') {
        return json(400, { error: 'Choose a supported roster admin action.' });
      }

      if (!tournamentSlug) {
        return json(400, { error: 'Choose a tournament before clearing test data.' });
      }

      const result = await clearTournament(tournamentSlug);

      return json(200, {
        ok: true,
        hostAuth: adminCheck.method,
        ...result,
        bracket: null,
      });
    }

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
