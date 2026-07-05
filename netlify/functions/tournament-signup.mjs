import { createHash, randomUUID } from 'node:crypto';

import { connectLambda, getStore } from '@netlify/blobs';

import { getAccountFromEvent } from './_account-utils.mjs';
import { loadTournamentSettings, normalizeRegistrationStatus } from './_tournament-settings-utils.mjs';

const MAX_FIELD_LENGTH = 500;

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

function cleanText(value) {
  return String(value || '').trim().slice(0, MAX_FIELD_LENGTH);
}

function cleanEmail(value) {
  return cleanText(value).toLowerCase();
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

function emailKey(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function signupKey(tournamentSlug, contactEmail) {
  return `${tournamentSlug}/${emailKey(contactEmail)}.json`;
}

function publicSignup(signup) {
  return {
    id: signup.id,
    tournamentSlug: signup.tournamentSlug,
    playerName: signup.playerName,
    playerHandle: signup.playerHandle,
    status: signup.status,
    createdAt: signup.createdAt,
  };
}

async function loadTournamentSignups(store, tournamentSlug) {
  const { blobs } = await store.list({ prefix: `${tournamentSlug}/` });
  const signups = await Promise.all(blobs.map((blob) => store.get(blob.key, { type: 'json' })));

  return signups.filter(Boolean).sort((first, second) => {
    return String(first.createdAt || '').localeCompare(String(second.createdAt || ''));
  });
}

async function publicSignupSummary(store, tournamentSlug) {
  const signups = await loadTournamentSignups(store, tournamentSlug);
  const settings = await loadTournamentSettings(tournamentSlug);

  return {
    tournamentSlug,
    signupCount: signups.length,
    signups: signups.map(publicSignup),
    settings,
  };
}

function registrationClosedMessage(status) {
  if (status === 'closed') {
    return 'Registration is closed for this tournament.';
  }

  if (status === 'coming-soon') {
    return 'Registration is not open for this tournament yet.';
  }

  return '';
}

export async function handler(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  if (event.httpMethod === 'GET') {
    const tournamentSlug = cleanText(event.queryStringParameters?.slug);

    if (!tournamentSlug) {
      return json(400, { error: 'Choose a tournament before loading signups.' });
    }

    try {
      const store = getSignupStore();
      const summary = await publicSignupSummary(store, tournamentSlug);

      return json(200, {
        ok: true,
        ...summary,
      });
    } catch (error) {
      console.error('Tournament signup summary failed', error);
      return json(500, { error: 'Signup storage is not available yet.' });
    }
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use GET to load signups or POST to submit a tournament signup.' });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Signup payload must be valid JSON.' });
  }

  const tournamentSlug = cleanText(payload.tournamentSlug);
  let account;

  try {
    account = await getAccountFromEvent(event);
  } catch (accountError) {
    console.error('Account lookup failed during signup', accountError);
    return json(500, { error: 'Player account lookup is not available yet.' });
  }

  if (!account) {
    return json(401, { error: 'Create or sign in to a player account before signing up.' });
  }

  const playerName = cleanText(account.playerName || payload.playerName);
  const contactEmail = cleanEmail(account.email);
  const playerHandle = cleanText(account.playerHandle || payload.playerHandle);
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
    const store = getSignupStore();
    const settings = await loadTournamentSettings(tournamentSlug);
    const registrationStatus = normalizeRegistrationStatus(settings?.registrationStatus);
    const blockedMessage = registrationClosedMessage(registrationStatus);

    if (blockedMessage) {
      return json(403, { error: blockedMessage, settings });
    }

    const key = signupKey(tournamentSlug, account.id);
    const legacyEmailKey = signupKey(tournamentSlug, contactEmail);
    const existingByAccount = await store.get(key, { type: 'json' });
    const existingByLegacyEmail = existingByAccount ? null : await store.get(legacyEmailKey, { type: 'json' });
    const existing = existingByAccount || existingByLegacyEmail;

    if (existing) {
      const now = new Date().toISOString();
      const linkedSignup = {
        ...existing,
        tournamentSlug,
        accountId: account.id,
        accountEmail: account.email,
        playerName: existing.playerName || playerName,
        contactEmail,
        playerHandle: existing.playerHandle || playerHandle,
        status: existing.status || 'registered',
        createdAt: existing.createdAt || now,
        updatedAt: now,
      };

      await store.setJSON(key, linkedSignup, {
        metadata: {
          tournamentSlug,
          status: linkedSignup.status,
          createdAt: linkedSignup.createdAt,
        },
      });

      if (existingByLegacyEmail && legacyEmailKey !== key) {
        await store.delete(legacyEmailKey).catch(() => {});
      }

      return json(200, {
        ok: true,
        signup: publicSignup(linkedSignup),
        summary: await publicSignupSummary(store, tournamentSlug),
      });
    }

    const signup = {
      id: randomUUID(),
      tournamentSlug,
      accountId: account.id,
      accountEmail: account.email,
      playerName,
      contactEmail,
      playerHandle,
      notes,
      status: 'registered',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await store.setJSON(key, signup, {
      onlyIfNew: true,
      metadata: {
        tournamentSlug,
        status: signup.status,
        createdAt: signup.createdAt,
      },
    });

    return json(201, {
      ok: true,
      signup: publicSignup(signup),
      summary: await publicSignupSummary(store, tournamentSlug),
    });
  } catch (error) {
    console.error('Tournament signup failed', error);
    return json(500, { error: 'Signup storage is not available yet.' });
  }
}
