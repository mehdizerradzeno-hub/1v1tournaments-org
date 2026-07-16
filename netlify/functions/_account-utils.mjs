import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { Buffer } from 'node:buffer';

import { getStore } from '@netlify/blobs';

export const PLAYER_SESSION_COOKIE = 'one_v_one_player_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const MAX_FIELD_LENGTH = 500;

export function getStoreWithFallback(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;

  if (siteID && token) {
    return getStore({ name, siteID, token });
  }

  return getStore(name);
}

export function cleanText(value) {
  return String(value || '').trim().slice(0, MAX_FIELD_LENGTH);
}

export function cleanEmail(value) {
  return cleanText(value).toLowerCase();
}

export function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function identityKey(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 40);
}

export function accountKey(email) {
  return `${identityKey(cleanEmail(email))}.json`;
}

export function sessionKey(sessionId) {
  return `${identityKey(sessionId)}.json`;
}

export function parseCookies(cookieHeader = '') {
  return String(cookieHeader)
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const separatorIndex = item.indexOf('=');
      if (separatorIndex === -1) return cookies;

      const key = item.slice(0, separatorIndex);
      const value = item.slice(separatorIndex + 1);
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

export function getSessionId(event) {
  const cookies = parseCookies(event.headers.cookie || event.headers.Cookie || '');
  return cleanText(cookies[PLAYER_SESSION_COOKIE]);
}

export function sessionCookie(sessionId) {
  return [
    `${PLAYER_SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ].join('; ');
}

export function clearSessionCookie() {
  return [
    `${PLAYER_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ');
}

export function withCookie(response, cookie) {
  return {
    ...response,
    headers: {
      ...response.headers,
      'Set-Cookie': cookie,
    },
  };
}

function passwordRecord(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');

  return { hash, salt };
}

export function createPasswordRecord(password) {
  return passwordRecord(password);
}

export function verifyPassword(password, storedPassword = {}) {
  if (!storedPassword.hash || !storedPassword.salt) return false;

  const expected = Buffer.from(storedPassword.hash, 'hex');
  const actual = scryptSync(password, storedPassword.salt, 64);

  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function publicAccount(account) {
  if (!account) return null;

  return {
    id: account.id,
    email: account.email,
    playerName: account.playerName,
    playerHandle: account.playerHandle || '',
    emailVerified: account.emailVerified !== false,
    createdAt: account.createdAt,
  };
}

export async function getAccountByEmail(email) {
  const accountStore = getStoreWithFallback('player-accounts');
  return accountStore.get(accountKey(email), {
    consistency: 'strong',
    type: 'json',
  });
}

export async function saveAccount(account, options = {}) {
  const accountStore = getStoreWithFallback('player-accounts');
  await accountStore.setJSON(accountKey(account.email), account, options);
}

export async function createSession(account) {
  const sessionId = randomUUID();
  const now = Date.now();
  const session = {
    id: sessionId,
    accountId: account.id,
    accountEmail: account.email,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
  };
  const sessionStore = getStoreWithFallback('player-sessions');

  await sessionStore.setJSON(sessionKey(sessionId), session, {
    metadata: {
      accountId: account.id,
      accountEmail: account.email,
      expiresAt: session.expiresAt,
    },
  });

  return session;
}

export async function deleteSession(sessionId) {
  if (!sessionId) return;

  const sessionStore = getStoreWithFallback('player-sessions');
  await sessionStore.delete(sessionKey(sessionId));
}

export async function getAccountFromEvent(event) {
  const sessionId = getSessionId(event);

  if (!sessionId) {
    return null;
  }

  const sessionStore = getStoreWithFallback('player-sessions');
  const session = await sessionStore.get(sessionKey(sessionId), {
    consistency: 'strong',
    type: 'json',
  });

  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    await deleteSession(sessionId);
    return null;
  }

  const account = await getAccountByEmail(session.accountEmail);

  if (!account || account.id !== session.accountId) {
    return null;
  }

  return account;
}
