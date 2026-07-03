import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createDefaultAdminServerState,
  isAccountIdAllowed,
  normalizeAdminServerState,
} from '../src/lib/adminServerState.js';

const SERVER_PORT = Number(process.env.ONE_V_ONE_TOURNAMENTS_ADMIN_PORT || 8787);
const SERVER_HOST = process.env.ONE_V_ONE_TOURNAMENTS_ADMIN_HOST || '127.0.0.1';
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(CURRENT_DIR, '..', '.data');
const STATE_FILE = join(DATA_DIR, 'admin-state.json');

async function ensureStateFile() {
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    return normalizeAdminServerState(JSON.parse(raw));
  } catch {
    const state = createDefaultAdminServerState();
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    return state;
  }
}

async function saveState(nextState) {
  const normalized = normalizeAdminServerState(nextState);

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STATE_FILE, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');

  return normalized;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

async function readBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

await ensureStateFile();

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || `${SERVER_HOST}:${SERVER_PORT}`}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/status') {
    const state = await ensureStateFile();

    sendJson(response, 200, {
      ok: true,
      server: '1v1 Tournaments admin server',
      host: SERVER_HOST,
      port: SERVER_PORT,
      stateFile: '.data/admin-state.json',
      allowlistCount: state.allowlistAccountIds.length,
      draftCount: state.draftTournaments.length,
      updatedAt: state.updatedAt,
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/state') {
    const state = await ensureStateFile();

    sendJson(response, 200, state);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/session') {
    const body = await readBody(request);

    if (!body || typeof body !== 'object') {
      sendJson(response, 400, { ok: false, error: 'Request body must be JSON.' });
      return;
    }

    const state = await ensureStateFile();
    const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';

    if (!isAccountIdAllowed(accountId, state)) {
      sendJson(response, 403, { ok: false, error: 'That account ID is not on the allowlist.' });
      return;
    }

    sendJson(response, 200, {
      ok: true,
      accountId,
      allowed: true,
      note: 'Allowlist matched on the local admin server.',
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/state') {
    const body = await readBody(request);

    if (!body || typeof body !== 'object') {
      sendJson(response, 400, { ok: false, error: 'Request body must be JSON.' });
      return;
    }

    const currentState = await ensureStateFile();
    const nextState = await saveState({
      ...currentState,
      ...body,
      updatedAt: new Date().toISOString(),
    });

    sendJson(response, 200, {
      ok: true,
      ...nextState,
      allowlistCount: nextState.allowlistAccountIds.length,
      draftCount: nextState.draftTournaments.length,
    });
    return;
  }

  sendJson(response, 404, { ok: false, error: 'Route not found.' });
});

server.listen(SERVER_PORT, SERVER_HOST, () => {
  console.log(`1v1 Tournaments admin server running at http://${SERVER_HOST}:${SERVER_PORT}`);
  console.log(`State file: ${STATE_FILE}`);
});
