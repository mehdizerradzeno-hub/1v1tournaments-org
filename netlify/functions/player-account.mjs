import { randomUUID } from 'node:crypto';

import { connectLambda } from '@netlify/blobs';

import {
  cleanEmail,
  cleanText,
  clearSessionCookie,
  createPasswordRecord,
  createSession,
  deleteSession,
  getAccountFromEvent,
  getAccountByEmail,
  getSessionId,
  isEmailLike,
  publicAccount,
  saveAccount,
  sessionCookie,
  verifyPassword,
  withCookie,
} from './_account-utils.mjs';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

function requirePassword(value) {
  const password = String(value || '');

  if (password.length < 8) {
    return { error: 'Use at least 8 characters for your account password.' };
  }

  return { password };
}

async function createAccount(payload) {
  const email = cleanEmail(payload.contactEmail || payload.email);
  const playerName = cleanText(payload.playerName);
  const playerHandle = cleanText(payload.playerHandle);
  const passwordCheck = requirePassword(payload.password);

  if (!playerName) {
    return json(400, { error: 'Enter the player name for this account.' });
  }

  if (!isEmailLike(email)) {
    return json(400, { error: 'Enter a valid email for this account.' });
  }

  if (passwordCheck.error) {
    return json(400, { error: passwordCheck.error });
  }

  const existing = await getAccountByEmail(email);

  if (existing) {
    return json(409, { error: 'That email already has a player account. Sign in instead.' });
  }

  const now = new Date().toISOString();
  const account = {
    id: `acct_${randomUUID()}`,
    email,
    playerName,
    playerHandle,
    password: createPasswordRecord(passwordCheck.password),
    createdAt: now,
    updatedAt: now,
  };

  await saveAccount(account, {
    onlyIfNew: true,
    metadata: {
      accountId: account.id,
      email,
      playerName,
      createdAt: account.createdAt,
    },
  });

  const session = await createSession(account);

  return withCookie(json(201, { ok: true, account: publicAccount(account) }), sessionCookie(session.id));
}

async function loginAccount(payload) {
  const email = cleanEmail(payload.contactEmail || payload.email);
  const password = String(payload.password || '');

  if (!isEmailLike(email) || !password) {
    return json(400, { error: 'Enter your account email and password.' });
  }

  const account = await getAccountByEmail(email);

  if (!account || !verifyPassword(password, account.password)) {
    return json(401, { error: 'That email and password did not match a player account.' });
  }

  const session = await createSession(account);

  return withCookie(json(200, { ok: true, account: publicAccount(account) }), sessionCookie(session.id));
}

async function logoutAccount(event) {
  await deleteSession(getSessionId(event));

  return withCookie(json(200, { ok: true, account: null }), clearSessionCookie());
}

export async function handler(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  if (event.httpMethod === 'GET') {
    const account = await getAccountFromEvent(event);

    return json(200, {
      ok: true,
      account: publicAccount(account),
    });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use GET for the current account or POST to create, sign in, or sign out.' });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Account payload must be valid JSON.' });
  }

  try {
    if (payload.action === 'create') {
      return createAccount(payload);
    }

    if (payload.action === 'login') {
      return loginAccount(payload);
    }

    if (payload.action === 'logout') {
      return logoutAccount(event);
    }

    return json(400, { error: 'Choose create, login, or logout for the account action.' });
  } catch (error) {
    console.error('Player account action failed', error);
    return json(500, { error: 'Player accounts are not available yet.' });
  }
}
