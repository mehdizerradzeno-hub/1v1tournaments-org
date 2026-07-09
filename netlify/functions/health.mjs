import { connectLambda, getStore } from '@netlify/blobs';

const STORE_NAME = 'runtime-health';
const BOT_HEARTBEAT_KEY = 'twitch-bot.json';
const BOT_STALE_MS = 120_000;

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
  return String(value || '').trim();
}

function configuredToken() {
  return cleanText(process.env.HEALTH_MONITOR_TOKEN);
}

function bearerToken(event) {
  const header = event.headers?.authorization || event.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? cleanText(match[1]) : '';
}

function isAuthorized(event) {
  const token = configuredToken();
  return Boolean(token) && bearerToken(event) === token;
}

function getHealthStore() {
  return getStore(STORE_NAME);
}

async function loadBotHeartbeat() {
  const store = getHealthStore();
  return store.get(BOT_HEARTBEAT_KEY, { type: 'json' });
}

async function saveBotHeartbeat(payload) {
  const store = getHealthStore();
  const checkedInAt = new Date().toISOString();
  const heartbeat = {
    bot: 'twitch-chat',
    status: cleanText(payload.status) || 'online',
    channel: cleanText(payload.channel),
    username: cleanText(payload.username),
    commandCount: Number.isFinite(Number(payload.commandCount)) ? Number(payload.commandCount) : null,
    uptimeSeconds: Number.isFinite(Number(payload.uptimeSeconds)) ? Math.max(0, Number(payload.uptimeSeconds)) : null,
    checkedInAt,
  };

  await store.setJSON(BOT_HEARTBEAT_KEY, heartbeat, {
    metadata: {
      checkedInAt,
      status: heartbeat.status,
      bot: heartbeat.bot,
    },
  });

  return heartbeat;
}

function publicBotStatus(heartbeat) {
  if (!heartbeat?.checkedInAt) {
    return {
      ok: false,
      status: 'missing',
      label: 'No heartbeat yet',
      checkedInAt: null,
      ageSeconds: null,
    };
  }

  const checkedInMs = new Date(heartbeat.checkedInAt).getTime();
  const ageMs = Number.isFinite(checkedInMs) ? Date.now() - checkedInMs : Number.POSITIVE_INFINITY;
  const stale = ageMs > BOT_STALE_MS;
  const status = cleanText(heartbeat.status) || 'unknown';
  const ok = !stale && status === 'online';

  return {
    ok,
    status: stale ? 'stale' : status,
    label: ok ? 'Bot online' : stale ? 'Heartbeat stale' : 'Bot not online',
    checkedInAt: heartbeat.checkedInAt,
    ageSeconds: Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 1000)) : null,
    channel: heartbeat.channel || null,
    username: heartbeat.username || null,
    commandCount: heartbeat.commandCount,
    uptimeSeconds: heartbeat.uptimeSeconds,
  };
}

export async function handler(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  if (event.httpMethod === 'GET') {
    const heartbeat = await loadBotHeartbeat();
    const bot = publicBotStatus(heartbeat);

    return json(bot.ok ? 200 : 503, {
      ok: bot.ok,
      site: {
        ok: true,
        status: 'online',
        checkedAt: new Date().toISOString(),
      },
      bot,
    });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use GET for health or POST to send a bot heartbeat.' });
  }

  if (!isAuthorized(event)) {
    return json(401, { error: 'Health heartbeat is not authorized.' });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Heartbeat payload must be valid JSON.' });
  }

  const heartbeat = await saveBotHeartbeat(payload);

  return json(200, {
    ok: true,
    bot: publicBotStatus(heartbeat),
  });
}
