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
import { isHostAccount } from './_host-auth.mjs';
import {
  consumePlayerEmailCode,
  emailProviderConfigured,
  issuePlayerEmailCode,
  verifiedEmailsRequired,
} from './_player-email.mjs';
import { enforceRateLimit } from './_rate-limit.mjs';

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

function rateLimited(result, message) {
  return {
    statusCode: 429,
    headers: {
      ...headers,
      'Retry-After': String(result.retryAfterSeconds),
    },
    body: JSON.stringify({ error: message }),
  };
}

function requirePassword(value, confirmation) {
  const password = String(value || '');
  const confirmPassword = String(confirmation || '');

  if (password.length < 8) {
    return { error: 'Use at least 8 characters for your account password.' };
  }

  if (!/[0-9\W_]/.test(password)) {
    return { error: 'Include at least one number or symbol in your account password.' };
  }

  if (password !== confirmPassword) {
    return { error: 'Enter the same password in both password fields.' };
  }

  return { password };
}

function publicPlayerAccount(account) {
  const publicProfile = publicAccount(account);

  if (!publicProfile) {
    return null;
  }

  return {
    ...publicProfile,
    hostApproved: isHostAccount(account),
  };
}

async function createAccount(payload) {
  const email = cleanEmail(payload.contactEmail || payload.email);
  const playerName = cleanText(payload.playerName);
  const playerHandle = cleanText(payload.playerHandle);
  const passwordCheck = requirePassword(payload.password, payload.confirmPassword);

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
    emailVerified: !verifiedEmailsRequired(),
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

  let verificationDelivery = null;

  if (!account.emailVerified && emailProviderConfigured()) {
    verificationDelivery = await issuePlayerEmailCode({
      email: account.email,
      playerName: account.playerName,
      purpose: 'verify-email',
    }).catch((error) => ({ error: error.message, ok: false }));
  }

  return withCookie(json(201, {
    ok: true,
    account: publicPlayerAccount(account),
    verificationRequired: !account.emailVerified,
    verificationDelivery,
  }), sessionCookie(session.token || session.id));
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

  return withCookie(
    json(200, { ok: true, account: publicPlayerAccount(account) }),
    sessionCookie(session.token || session.id),
  );
}

async function logoutAccount(event) {
  await deleteSession(getSessionId(event));

  return withCookie(json(200, { ok: true, account: null }), clearSessionCookie());
}

async function requestEmailCode(payload, purpose) {
  const email = cleanEmail(payload.contactEmail || payload.email);
  const account = isEmailLike(email) ? await getAccountByEmail(email) : null;

  if (account) {
    await issuePlayerEmailCode({
      email,
      playerName: account.playerName,
      purpose,
    });
  }

  return json(200, {
    ok: true,
    configured: emailProviderConfigured(),
    message: emailProviderConfigured()
      ? 'If that player account exists, a code was sent.'
      : 'Email recovery is not configured yet. Contact the tournament host.',
  });
}

async function verifyAccountEmail(payload) {
  const email = cleanEmail(payload.contactEmail || payload.email);
  const account = await getAccountByEmail(email);
  const valid = account && await consumePlayerEmailCode({
    code: payload.code,
    email,
    purpose: 'verify-email',
  });

  if (!valid) {
    return json(400, { error: 'That verification code is invalid or expired.' });
  }

  const updated = {
    ...account,
    emailVerified: true,
    updatedAt: new Date().toISOString(),
  };

  await saveAccount(updated);
  return json(200, { ok: true, account: publicPlayerAccount(updated) });
}

async function resetAccountPassword(payload) {
  const email = cleanEmail(payload.contactEmail || payload.email);
  const passwordCheck = requirePassword(payload.password, payload.confirmPassword);

  if (passwordCheck.error) {
    return json(400, { error: passwordCheck.error });
  }

  const account = await getAccountByEmail(email);
  const valid = account && await consumePlayerEmailCode({
    code: payload.code,
    email,
    purpose: 'reset-password',
  });

  if (!valid) {
    return json(400, { error: 'That recovery code is invalid or expired.' });
  }

  const updated = {
    ...account,
    password: createPasswordRecord(passwordCheck.password),
    updatedAt: new Date().toISOString(),
  };

  await saveAccount(updated);
  const session = await createSession(updated);

  return withCookie(
    json(200, { ok: true, account: publicPlayerAccount(updated) }),
    sessionCookie(session.token || session.id),
  );
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
      account: publicPlayerAccount(account),
      capabilities: {
        emailRecovery: emailProviderConfigured(),
      },
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
    const email = cleanEmail(payload.contactEmail || payload.email);
    const limits = {
      create: { limit: 5, windowMs: 60 * 60 * 1000 },
      login: { limit: 10, windowMs: 15 * 60 * 1000 },
      'request-password-reset': { limit: 5, windowMs: 60 * 60 * 1000 },
      'request-email-verification': { limit: 5, windowMs: 60 * 60 * 1000 },
      'reset-password': { limit: 8, windowMs: 60 * 60 * 1000 },
      'verify-email': { limit: 8, windowMs: 60 * 60 * 1000 },
    };
    const rateLimit = limits[payload.action];

    if (rateLimit) {
      const limitResult = await enforceRateLimit(event, {
        action: payload.action,
        identity: email,
        ...rateLimit,
      });

      if (!limitResult.allowed) {
        return rateLimited(limitResult, 'Too many account attempts. Wait a few minutes and try again.');
      }
    }

    if (payload.action === 'create') {
      return createAccount(payload);
    }

    if (payload.action === 'login') {
      return loginAccount(payload);
    }

    if (payload.action === 'logout') {
      return logoutAccount(event);
    }

    if (payload.action === 'request-password-reset') {
      return requestEmailCode(payload, 'reset-password');
    }

    if (payload.action === 'reset-password') {
      return resetAccountPassword(payload);
    }

    if (payload.action === 'request-email-verification') {
      return requestEmailCode(payload, 'verify-email');
    }

    if (payload.action === 'verify-email') {
      return verifyAccountEmail(payload);
    }

    return json(400, { error: 'Choose a supported player account action.' });
  } catch (error) {
    console.error('Player account action failed', error);
    return json(500, { error: 'Player accounts are not available yet.' });
  }
}
