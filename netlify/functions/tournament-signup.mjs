import { createHash, randomUUID } from 'node:crypto';

import { getStore } from '@netlify/blobs';

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

function getSignupStore() {
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
    const store = getSignupStore();
    const key = signupKey(tournamentSlug, contactEmail);
    const existing = await store.get(key, { type: 'json' });

    if (existing) {
      return json(409, { error: 'That email is already signed up for this tournament.' });
    }

    const signup = {
      id: randomUUID(),
      tournamentSlug,
      playerName,
      contactEmail,
      playerHandle,
      notes,
      status: 'registered',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await store.setJSON(key, signup, {
      metadata: {
        tournamentSlug,
        status: signup.status,
        createdAt: signup.createdAt,
      },
    });

    return json(201, {
      ok: true,
      signup: publicSignup(signup),
    });
  } catch (error) {
    console.error('Tournament signup failed', error);
    return json(500, { error: 'Signup storage is not available yet.' });
  }
}
