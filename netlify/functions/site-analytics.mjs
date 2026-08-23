import { Buffer } from 'node:buffer';

import { connectLambda } from '@netlify/blobs';

import { getStoreWithFallback } from './_account-utils.mjs';
import { requireTournamentAdmin } from './_host-auth.mjs';
import {
  applySiteAnalyticsEvent,
  createDailySiteAnalytics,
  normalizeSiteAnalyticsEvent,
  summarizeSiteAnalytics,
} from './_site-analytics-utils.mjs';

const STORE_NAME = 'site-analytics';
const DAILY_PREFIX = 'day/';
const MAX_BODY_BYTES = 2_048;
const MAX_WRITE_ATTEMPTS = 6;

function requestOrigin(event) {
  const value = event.headers?.origin || event.headers?.Origin || '';

  try {
    return value ? new URL(value).origin : '';
  } catch {
    return '';
  }
}

function requestHost(event) {
  return String(
    event.headers?.['x-forwarded-host']
    || event.headers?.['X-Forwarded-Host']
    || event.headers?.host
    || event.headers?.Host
    || '',
  ).split(',', 1)[0].trim().toLowerCase().split(':', 1)[0];
}

function isAllowedOrigin(origin, event) {
  if (!origin) return false;

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    const isProduction = hostname === '1v1tournaments.org' || hostname === 'www.1v1tournaments.org';
    const isSamePreview = hostname.endsWith('.netlify.app') && hostname === requestHost(event);

    return url.protocol === 'https:' && (isProduction || isSamePreview);
  } catch {
    return false;
  }
}

function responseHeaders(event) {
  const origin = requestOrigin(event);
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };

  if (isAllowedOrigin(origin, event)) {
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function json(event, statusCode, body) {
  return {
    statusCode,
    headers: responseHeaders(event),
    body: JSON.stringify(body),
  };
}

function isTrustedTelemetryRequest(event) {
  const fetchSite = String(event.headers?.['sec-fetch-site'] || event.headers?.['Sec-Fetch-Site'] || '').toLowerCase();
  const origin = requestOrigin(event);

  if (fetchSite && fetchSite !== 'same-origin') {
    return false;
  }

  if (origin) {
    return isAllowedOrigin(origin, event);
  }

  return fetchSite === 'same-origin';
}

function analyticsStore() {
  return getStoreWithFallback(STORE_NAME);
}

async function updateDailyAggregate(store, normalizedEvent, now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const key = `${DAILY_PREFIX}${date}.json`;

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const current = await store.getWithMetadata(key, {
      consistency: 'strong',
      type: 'json',
    });
    const aggregate = applySiteAnalyticsEvent(
      current?.data || createDailySiteAnalytics(date),
      normalizedEvent,
      { now },
    );
    const result = await store.setJSON(key, aggregate, {
      ...(current?.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true }),
      metadata: {
        date,
        recordType: 'anonymous-daily-aggregate',
        version: 1,
      },
    });

    if (result.modified) {
      return aggregate;
    }
  }

  throw new Error('Analytics aggregate was busy.');
}

function parseDays(event) {
  const value = Number(event.queryStringParameters?.days);
  return Number.isFinite(value) ? Math.max(1, Math.min(90, Math.round(value))) : 30;
}

async function loadRecentAggregates(store, days) {
  const list = await store.list({ prefix: DAILY_PREFIX });
  const keys = list.blobs
    .map((blob) => blob.key)
    .filter((key) => /^day\/\d{4}-\d{2}-\d{2}\.json$/.test(key))
    .sort()
    .slice(-days);
  const records = await Promise.all(keys.map((key) => (
    store.get(key, { consistency: 'strong', type: 'json' })
  )));

  return records.filter(Boolean);
}

async function handleRead(event) {
  const access = await requireTournamentAdmin(event);

  if (access.error) {
    return json(event, access.error.statusCode, { error: access.error.message });
  }

  const days = parseDays(event);
  const summary = summarizeSiteAnalytics(await loadRecentAggregates(analyticsStore(), days), { days });

  return json(event, 200, {
    ok: true,
    privacy: {
      anonymous: true,
      rawEventsStored: false,
      uniqueVisitorsTracked: false,
    },
    summary,
  });
}

async function handleWrite(event) {
  if (!isTrustedTelemetryRequest(event)) {
    return json(event, 403, { error: 'Telemetry origin was rejected.' });
  }

  if (Buffer.byteLength(event.body || '', 'utf8') > MAX_BODY_BYTES) {
    return json(event, 413, { error: 'Telemetry payload is too large.' });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(event, 400, { error: 'Telemetry payload must be valid JSON.' });
  }

  const normalizedEvent = normalizeSiteAnalyticsEvent(payload);

  if (!normalizedEvent) {
    return json(event, 400, { error: 'Telemetry event is not supported.' });
  }

  await updateDailyAggregate(analyticsStore(), normalizedEvent);
  return json(event, 202, { ok: true });
}

export async function handler(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(event, 204, {});
  }

  try {
    if (event.httpMethod === 'GET') {
      return await handleRead(event);
    }

    if (event.httpMethod === 'POST') {
      return await handleWrite(event);
    }

    return json(event, 405, { error: 'Use GET for host reports or POST for anonymous telemetry.' });
  } catch (error) {
    console.error('Site analytics request failed', error);
    return json(event, 503, { error: 'Site analytics are temporarily unavailable.' });
  }
}
