import { createHash, randomUUID } from 'node:crypto';

import { connectLambda, getStore } from '@netlify/blobs';

import { getAccountFromEvent } from './_account-utils.mjs';
import { loadHostedTournament } from './_tournament-events-utils.mjs';
import { loadTournamentSettings, normalizeRegistrationStatus } from './_tournament-settings-utils.mjs';
import { siteData } from '../../src/lib/siteData.js';

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

function publicTournamentDate(tournamentSlug) {
  return siteData.tournaments.find((tournament) => tournament.slug === tournamentSlug)?.date || '';
}

async function getTournamentDate(tournamentSlug) {
  const settings = await loadTournamentSettings(tournamentSlug);
  const hostedTournament = await loadHostedTournament(tournamentSlug);

  return {
    settings,
    date: settings?.date || hostedTournament?.date || publicTournamentDate(tournamentSlug),
  };
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

function getBracketStore() {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;

  if (siteID && token) {
    return getStore({
      name: 'tournament-brackets',
      siteID,
      token,
    });
  }

  return getStore('tournament-brackets');
}

function emailKey(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function signupKey(tournamentSlug, contactEmail) {
  return `${tournamentSlug}/${emailKey(contactEmail)}.json`;
}

function publicSignup(signup, currentAccount = null) {
  return {
    id: signup.id,
    tournamentSlug: signup.tournamentSlug,
    playerName: signup.playerName,
    playerHandle: signup.playerHandle,
    status: signup.status,
    createdAt: signup.createdAt,
    currentPlayer: Boolean(
      currentAccount?.id
        && (
          signup.accountId === currentAccount.id
          || signup.accountEmail === currentAccount.email
          || signup.contactEmail === currentAccount.email
        ),
    ),
  };
}

async function loadTournamentSignups(store, tournamentSlug) {
  const { blobs } = await store.list({ prefix: `${tournamentSlug}/` });
  const signups = await Promise.all(blobs.map((blob) => store.get(blob.key, { type: 'json' })));

  return signups.filter(Boolean).sort((first, second) => {
    return String(first.createdAt || '').localeCompare(String(second.createdAt || ''));
  });
}

async function publicSignupSummary(store, tournamentSlug, currentAccount = null) {
  const signups = await loadTournamentSignups(store, tournamentSlug);
  const { settings } = await getTournamentDate(tournamentSlug);

  return {
    tournamentSlug,
    signupCount: signups.length,
    signups: signups.map((signup) => publicSignup(signup, currentAccount)),
    settings,
  };
}

async function loadTournamentBracket(tournamentSlug) {
  const store = getBracketStore();
  return store.get(`${tournamentSlug}.json`, {
    consistency: 'strong',
    type: 'json',
  });
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

function tournamentStartedMessage(dateValue) {
  const startDate = new Date(cleanText(dateValue));

  if (Number.isNaN(startDate.getTime())) {
    return '';
  }

  return startDate.getTime() <= Date.now()
    ? 'This event has already started. Registration is closed.'
    : '';
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
      let account = null;

      try {
        account = await getAccountFromEvent(event);
      } catch (accountError) {
        console.error('Account lookup failed during signup summary', accountError);
      }

      const summary = await publicSignupSummary(store, tournamentSlug, account);

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

  if (String(process.env.REQUIRE_VERIFIED_PLAYER_EMAILS || '').trim().toLowerCase() === 'true' && account.emailVerified === false) {
    return json(403, { error: 'Verify this player account email before joining a tournament.' });
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
    const { settings, date: tournamentDate } = await getTournamentDate(tournamentSlug);
    const key = signupKey(tournamentSlug, account.id);
    const legacyEmailKey = signupKey(tournamentSlug, contactEmail);
    const existingByAccount = await store.get(key, { consistency: 'strong', type: 'json' });
    const existingByLegacyEmail = existingByAccount
      ? null
      : await store.get(legacyEmailKey, { consistency: 'strong', type: 'json' });
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
        signup: publicSignup(linkedSignup, account),
        summary: await publicSignupSummary(store, tournamentSlug, account),
      });
    }

    const registrationStatus = normalizeRegistrationStatus(settings?.registrationStatus);
    const blockedMessage = registrationClosedMessage(registrationStatus);

    if (blockedMessage) {
      return json(403, { error: blockedMessage, settings });
    }

    const startedMessage = tournamentStartedMessage(tournamentDate || payload.tournamentDate || payload.date);

    if (startedMessage) {
      return json(403, { error: startedMessage, settings });
    }

    const liveBracket = await loadTournamentBracket(tournamentSlug);

    if (liveBracket) {
      return json(403, {
        error: 'The bracket is already live. Ask the host to reset or clear this tournament before new players join.',
        settings,
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
      signup: publicSignup(signup, account),
      summary: await publicSignupSummary(store, tournamentSlug, account),
    });
  } catch (error) {
    console.error('Tournament signup failed', error);
    return json(500, { error: 'Signup storage is not available yet.' });
  }
}
