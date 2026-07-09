import { connectLambda, getStore } from '@netlify/blobs';

import { requireTournamentAdmin } from './_host-auth.mjs';
import { buildDefaultStreamCommands, normalizeStreamCommands } from '../../src/lib/streamCommands.js';

const STORE_NAME = 'stream-commands';
const COMMAND_KEY = 'current.json';

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

function getStoreWithFallback() {
  return getStore(STORE_NAME);
}

async function loadSavedCommands() {
  const store = getStoreWithFallback();
  return store.get(COMMAND_KEY, { type: 'json' });
}

async function saveCommands(commands, account = null) {
  const store = getStoreWithFallback();
  const savedAt = new Date().toISOString();
  const payload = {
    commands,
    savedAt,
    savedBy: account?.id || account?.email || 'token',
  };

  await store.setJSON(COMMAND_KEY, payload, {
    metadata: {
      savedAt,
      commandCount: commands.length,
    },
  });

  return payload;
}

async function deleteCommands() {
  const store = getStoreWithFallback();
  await store.delete(COMMAND_KEY);
}

export async function handler(event) {
  if (event.blobs) {
    connectLambda(event);
  }

  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  if (event.httpMethod === 'GET') {
    const saved = await loadSavedCommands();
    const defaultCommands = buildDefaultStreamCommands();
    const commands = normalizeStreamCommands(saved?.commands).length
      ? normalizeStreamCommands(saved.commands)
      : defaultCommands;

    return json(200, {
      commands,
      defaultCommands,
      source: saved?.commands?.length ? 'saved' : 'default',
      savedAt: saved?.savedAt || null,
      botEndpoint: 'https://1v1tournaments.org/.netlify/functions/stream-commands',
    });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use GET to load stream commands or POST to save them.' });
  }

  const adminCheck = await requireTournamentAdmin(event);

  if (adminCheck.error) {
    return json(adminCheck.error.statusCode, { error: adminCheck.error.message });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Stream command payload must be valid JSON.' });
  }

  if (payload.action === 'reset') {
    await deleteCommands();
    return json(200, {
      ok: true,
      commands: buildDefaultStreamCommands(),
      hostAuth: adminCheck.method,
      source: 'default',
    });
  }

  const commands = normalizeStreamCommands(payload.commands);

  if (!commands.length) {
    return json(400, { error: 'Add at least one valid command like !join with a response.' });
  }

  const saved = await saveCommands(commands, adminCheck.account);

  return json(200, {
    ok: true,
    ...saved,
    hostAuth: adminCheck.method,
    source: 'saved',
  });
}
