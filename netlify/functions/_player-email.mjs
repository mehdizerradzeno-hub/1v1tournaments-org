import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { Buffer } from 'node:buffer';

import { accountKey, cleanEmail, getStoreWithFallback } from './_account-utils.mjs';

const CODE_STORE = 'player-account-codes';
const CODE_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RECOVERY_ORIGIN = 'https://1v1tournaments.org';
const RESET_TOKEN_BYTES = 32;
const MAX_CREDENTIAL_LENGTH = 512;

function codeKey(purpose, email) {
  return `${purpose}/${accountKey(cleanEmail(email))}`;
}

function codeHash(purpose, email, code) {
  return createHash('sha256')
    .update(`${purpose}:${cleanEmail(email)}:${String(code || '').trim()}`)
    .digest('hex');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'hex');
  const rightBuffer = Buffer.from(String(right || ''), 'hex');

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function emailProviderConfigured() {
  return Boolean(process.env.RESEND_API_KEY && (process.env.TOURNAMENT_EMAIL_FROM || process.env.EMAIL_FROM));
}

export function verifiedEmailsRequired() {
  return String(process.env.REQUIRE_VERIFIED_PLAYER_EMAILS || '').trim().toLowerCase() === 'true';
}

export async function sendPlayerEmail({ to, subject, text, idempotencyKey = '' }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TOURNAMENT_EMAIL_FROM || process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    return { configured: false, ok: false };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({ from, to: [cleanEmail(to)], subject, text }),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const providerMessage = body?.message || body?.error || `Resend returned HTTP ${response.status}.`;
    throw new Error(`Email provider could not send the message: ${providerMessage}`);
  }

  return { configured: true, id: body.id || '', ok: true };
}

export function buildPasswordResetUrl({ email, token }) {
  const url = new URL('/account?mode=reset', PASSWORD_RECOVERY_ORIGIN);
  url.hash = new URLSearchParams({
    email: cleanEmail(email),
    token: String(token || '').trim(),
  }).toString();
  return url.toString();
}

function recoveryCredential(purpose, options = {}) {
  if (purpose === 'reset-password') {
    return options.createResetToken?.()
      || randomBytes(RESET_TOKEN_BYTES).toString('base64url');
  }

  return String(options.createEmailCode?.() || randomInt(100000, 1000000));
}

export async function issuePlayerEmailCode(
  { email, playerName = 'Player', purpose },
  options = {},
) {
  const providerConfigured = options.providerConfigured ?? emailProviderConfigured();

  if (!providerConfigured) {
    return { configured: false, ok: false };
  }

  const credential = recoveryCredential(purpose, options);
  const now = options.now?.() ?? Date.now();
  const record = {
    email: cleanEmail(email),
    purpose,
    codeHash: codeHash(purpose, email, credential),
    credentialType: purpose === 'reset-password' ? 'opaque-link-token' : 'six-digit-code',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CODE_TTL_MS).toISOString(),
  };
  const store = options.store || getStoreWithFallback(CODE_STORE);
  const key = codeKey(purpose, email);

  await store.setJSON(key, record, {
    metadata: {
      purpose,
      expiresAt: record.expiresAt,
    },
  });

  try {
    const deliver = options.sendPlayerEmail || sendPlayerEmail;
    const delivery = purpose === 'reset-password'
      ? await deliver({
        to: email,
        subject: 'Reset your 1v1 Tournaments password',
        text: [
          `Hi ${playerName || 'Player'},`,
          '',
          'Use this secure, one-time link to reset your 1v1 Tournaments password:',
          buildPasswordResetUrl({ email, token: credential }),
          '',
          'This link expires in 15 minutes and can be used only once.',
          'If it expires, request a new reset link from 1v1tournaments.org/account.',
          '',
          'If you did not request this, you can ignore this email.',
        ].join('\n'),
      })
      : await deliver({
        to: email,
        subject: 'Verify your 1v1 Tournaments email',
        text: `Hi ${playerName || 'Player'},\n\nUse code ${credential} to verify your player email. It expires in 15 minutes.\n\nIf you did not request this, you can ignore this email.`,
      });

    return { ...delivery, expiresAt: record.expiresAt };
  } catch (error) {
    await store.delete(key).catch(() => {});
    throw error;
  }
}

export async function consumePlayerEmailCode(
  { email, purpose, code, token },
  options = {},
) {
  const store = options.store || getStoreWithFallback(CODE_STORE);
  const key = codeKey(purpose, email);
  const supportsAtomicClaim = typeof store.getWithMetadata === 'function';
  // Newly created blobs are immediately available under Netlify's eventual
  // consistency model. Use the returned ETag for the conditional claim below
  // so stale edge reads still cannot make a recovery credential reusable.
  // Lambda-compatible Blob contexts do not expose the uncached edge URL that
  // the client requires for an explicit strong-consistency read.
  const readOptions = { consistency: 'eventual', type: 'json' };
  const loaded = supportsAtomicClaim
    ? await store.getWithMetadata(key, readOptions)
    : null;
  const record = loaded?.data || await store.get(key, readOptions);
  const expiresAt = new Date(record?.expiresAt || 0).getTime();
  const suppliedCredential = String(token || code || '').trim().slice(0, MAX_CREDENTIAL_LENGTH);
  const suppliedHash = codeHash(purpose, email, suppliedCredential);

  if (
    !record
    || record.consumedAt
    || !suppliedCredential
    || !Number.isFinite(expiresAt)
    || expiresAt <= (options.now?.() ?? Date.now())
    || !safeEqual(record.codeHash, suppliedHash)
  ) {
    return false;
  }

  if (supportsAtomicClaim && !loaded?.etag) {
    return false;
  }

  if (loaded?.etag) {
    const claimed = await store.setJSON(key, {
      ...record,
      consumedAt: new Date(options.now?.() ?? Date.now()).toISOString(),
    }, {
      onlyIfMatch: loaded.etag,
      metadata: {
        consumed: true,
        expiresAt: record.expiresAt,
        purpose,
      },
    });

    return claimed?.modified === true;
  }

  await store.delete(key);
  return true;
}
