import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { Buffer } from 'node:buffer';

import { getStore } from '@netlify/blobs';

export const PLAYER_SESSION_COOKIE = 'one_v_one_player_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_PROPAGATION_GRACE_MS = 5 * 60 * 1000;
const SESSION_TOKEN_PREFIX = 'v1';
const MAX_FIELD_LENGTH = 500;
const IMMEDIATE_READ_RETRY_DELAYS_MS = [0, 75, 150, 300, 600, 1200];

export function getStoreWithFallback(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;

  if (siteID && token) {
    return getStore({ name, siteID, token });
  }

  return getStore(name);
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function getJsonWithRetry(store, key, options = {}) {
  const delays = options.delays || IMMEDIATE_READ_RETRY_DELAYS_MS;

  for (const delayMs of delays) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    const value = await store.get(key, { type: 'json' });

    if (value) {
      return value;
    }
  }

  return null;
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

function sessionSigningSecret() {
  return String(process.env.TOURNAMENT_SESSION_SECRET || '').trim();
}

function sessionSignature(encodedPayload, secret) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function createSignedSessionToken(session, account) {
  const secret = sessionSigningSecret();

  if (!secret) {
    return '';
  }

  if (secret.length < 32) {
    throw new Error('TOURNAMENT_SESSION_SECRET must contain at least 32 characters.');
  }

  const payload = {
    accountCreatedAt: account.createdAt,
    accountEmail: account.email,
    accountId: account.id,
    emailVerified: account.emailVerified !== false,
    expiresAt: session.expiresAt,
    playerHandle: account.playerHandle || '',
    playerName: account.playerName,
    sessionCreatedAt: session.createdAt,
    sessionId: session.id,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sessionSignature(encodedPayload, secret);

  return `${SESSION_TOKEN_PREFIX}.${encodedPayload}.${signature}`;
}

export function parseSignedSessionToken(token) {
  const secret = sessionSigningSecret();
  const [prefix, encodedPayload, providedSignature, ...extraParts] = String(token || '').split('.');

  if (!secret || prefix !== SESSION_TOKEN_PREFIX || !encodedPayload || !providedSignature || extraParts.length) {
    return null;
  }

  const expectedSignature = Buffer.from(sessionSignature(encodedPayload, secret));
  const actualSignature = Buffer.from(providedSignature);

  if (
    expectedSignature.length !== actualSignature.length
    || !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const expiresAt = new Date(payload.expiresAt).getTime();

    if (
      !payload.sessionId
      || !payload.accountId
      || !isEmailLike(payload.accountEmail)
      || !Number.isFinite(expiresAt)
      || expiresAt <= Date.now()
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
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

export async function getAccountByEmail(email, options = {}) {
  const accountStore = getStoreWithFallback('player-accounts');

  if (options.retry) {
    return getJsonWithRetry(accountStore, accountKey(email));
  }

  return accountStore.get(accountKey(email), { type: 'json' });
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

  return {
    ...session,
    token: createSignedSessionToken(session, account),
  };
}

export async function deleteSession(sessionToken) {
  if (!sessionToken) return;

  const signedSession = parseSignedSessionToken(sessionToken);
  const sessionId = signedSession?.sessionId || sessionToken;

  const sessionStore = getStoreWithFallback('player-sessions');
  await sessionStore.delete(sessionKey(sessionId));
}

export async function getAccountFromEvent(event) {
  const sessionToken = getSessionId(event);
  const smokeProbe = cleanText(event.headers['x-tournament-smoke']);
  const smokeTokenDigest = cleanText(event.headers['x-tournament-smoke-cookie-digest']);
  const logSmokeStage = (stage, detail = {}) => {
    if (!smokeProbe) return;

    console.info('Tournament session smoke', {
      ...detail,
      probe: smokeProbe,
      stage,
    });
  };

  if (!sessionToken) {
    logSmokeStage('session-cookie-missing');
    return null;
  }

  const signedSession = parseSignedSessionToken(sessionToken);
  const sessionId = signedSession?.sessionId || sessionToken;
  const sessionStore = getStoreWithFallback('player-sessions');
  const storedSession = await getJsonWithRetry(sessionStore, sessionKey(sessionId));
  let session = storedSession;
  const signedSessionCreatedAt = new Date(signedSession?.sessionCreatedAt).getTime();
  const signedSessionInGrace = Boolean(
    signedSession
    && Number.isFinite(signedSessionCreatedAt)
    && signedSessionCreatedAt + SESSION_PROPAGATION_GRACE_MS > Date.now()
  );

  if (!session && signedSessionInGrace) {
    session = {
      accountEmail: signedSession.accountEmail,
      accountId: signedSession.accountId,
      expiresAt: signedSession.expiresAt,
      id: signedSession.sessionId,
    };
  }

  logSmokeStage('session-resolved', {
    signedSessionInGrace,
    signedSessionValid: Boolean(signedSession),
    storedSessionFound: Boolean(storedSession),
    tokenDigestMatches: smokeTokenDigest
      ? identityKey(sessionToken) === smokeTokenDigest
      : null,
    tokenKind: sessionToken.startsWith(`${SESSION_TOKEN_PREFIX}.`) ? 'signed' : 'legacy',
    tokenLength: sessionToken.length,
  });

  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    await deleteSession(sessionToken);
    logSmokeStage('session-rejected');
    return null;
  }

  const account = await getAccountByEmail(session.accountEmail, { retry: true });

  if (!account && signedSessionInGrace && signedSession.accountId === session.accountId) {
    logSmokeStage('signed-claims-fallback');
    return {
      createdAt: signedSession.accountCreatedAt,
      email: signedSession.accountEmail,
      emailVerified: signedSession.emailVerified,
      id: signedSession.accountId,
      playerHandle: signedSession.playerHandle || '',
      playerName: signedSession.playerName,
    };
  }

  if (!account || account.id !== session.accountId) {
    logSmokeStage('account-rejected', { storedAccountFound: Boolean(account) });
    return null;
  }

  logSmokeStage('stored-account-resolved');
  return account;
}
