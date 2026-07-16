import { createHash } from 'node:crypto';

import { getStoreWithFallback } from './_account-utils.mjs';

function hashValue(value) {
  return createHash('sha256').update(String(value || 'unknown')).digest('hex').slice(0, 40);
}

function clientAddress(event) {
  return event.headers['x-nf-client-connection-ip']
    || event.headers['x-forwarded-for']?.split(',')[0]
    || event.headers['client-ip']
    || 'unknown';
}

export async function enforceRateLimit(event, options = {}) {
  const {
    action = 'request',
    identity = '',
    limit = 10,
    storeName = 'request-rate-limits',
    windowMs = 15 * 60 * 1000,
  } = options;
  const now = Date.now();
  const windowId = Math.floor(now / windowMs);
  const fingerprint = `${clientAddress(event)}:${String(identity || '').trim().toLowerCase()}`;
  const key = `${action}/${windowId}/${hashValue(fingerprint)}.json`;
  const store = getStoreWithFallback(storeName);
  const current = await store.get(key, { type: 'json' });
  const count = Number(current?.count || 0) + 1;

  await store.setJSON(key, {
    action,
    count,
    updatedAt: new Date(now).toISOString(),
  }, {
    metadata: {
      action,
      count,
      windowId,
    },
  });

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(limit - count, 0),
    retryAfterSeconds: Math.max(1, Math.ceil(((windowId + 1) * windowMs - now) / 1000)),
  };
}
