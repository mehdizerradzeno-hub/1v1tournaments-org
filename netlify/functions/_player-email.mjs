import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

import { accountKey, cleanEmail, getStoreWithFallback } from './_account-utils.mjs';

const CODE_STORE = 'player-account-codes';
const CODE_TTL_MS = 15 * 60 * 1000;

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

export async function issuePlayerEmailCode({ email, playerName = 'Player', purpose }) {
  if (!emailProviderConfigured()) {
    return { configured: false, ok: false };
  }

  const code = String(randomInt(100000, 1000000));
  const now = Date.now();
  const record = {
    email: cleanEmail(email),
    purpose,
    codeHash: codeHash(purpose, email, code),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CODE_TTL_MS).toISOString(),
  };
  const store = getStoreWithFallback(CODE_STORE);
  const key = codeKey(purpose, email);

  await store.setJSON(key, record, {
    metadata: {
      purpose,
      expiresAt: record.expiresAt,
    },
  });

  const purposeCopy = purpose === 'verify-email' ? 'verify your player email' : 'reset your player password';

  try {
    const delivery = await sendPlayerEmail({
      to: email,
      subject: `1v1 Tournaments code: ${code}`,
      text: `Hi ${playerName || 'Player'},\n\nUse code ${code} to ${purposeCopy}. It expires in 15 minutes.\n\nIf you did not request this, you can ignore this email.`,
    });

    return { ...delivery, expiresAt: record.expiresAt };
  } catch (error) {
    await store.delete(key).catch(() => {});
    throw error;
  }
}

export async function consumePlayerEmailCode({ email, purpose, code }) {
  const store = getStoreWithFallback(CODE_STORE);
  const key = codeKey(purpose, email);
  const record = await store.get(key, { type: 'json' });
  const expiresAt = new Date(record?.expiresAt || 0).getTime();
  const suppliedHash = codeHash(purpose, email, code);

  if (!record || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || !safeEqual(record.codeHash, suppliedHash)) {
    return false;
  }

  await store.delete(key);
  return true;
}
