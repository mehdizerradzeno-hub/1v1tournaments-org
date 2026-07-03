import { siteData } from './siteData.js';

const DEFAULT_TIMEOUT_MS = 4000;

function normalizeServerUrl(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\/+$/, '');
}

export function getAdminServerBaseUrl() {
  return normalizeServerUrl(siteData.admin?.serverUrl || '');
}

async function readJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function requestJson(path, { method = 'GET', body, serverUrl = getAdminServerBaseUrl() } = {}) {
  const baseUrl = normalizeServerUrl(serverUrl);

  if (!baseUrl) {
    return {
      ok: false,
      status: 0,
      error: 'Admin server URL is not configured.',
    };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? globalThis.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
    : null;

  try {
    const response = await globalThis.fetch(`${baseUrl}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });
    const payload = await readJsonResponse(response);

    return {
      ok: response.ok,
      status: response.status,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Could not reach the admin server.',
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function fetchAdminServerStatus(serverUrl = getAdminServerBaseUrl()) {
  const result = await requestJson('/api/admin/status', { serverUrl });

  if (!result.ok) {
    return result;
  }

  return result.payload;
}

export async function fetchAdminServerState(serverUrl = getAdminServerBaseUrl()) {
  const result = await requestJson('/api/admin/state', { serverUrl });

  if (!result.ok) {
    return result;
  }

  return result.payload;
}

export async function saveAdminServerState(state, serverUrl = getAdminServerBaseUrl()) {
  const result = await requestJson('/api/admin/state', {
    method: 'POST',
    body: state,
    serverUrl,
  });

  if (!result.ok) {
    return result;
  }

  return result.payload;
}

export async function verifyAdminServerAccountId(accountId, serverUrl = getAdminServerBaseUrl()) {
  const result = await requestJson('/api/admin/session', {
    method: 'POST',
    body: { accountId },
    serverUrl,
  });

  if (!result.ok) {
    return result;
  }

  return result.payload;
}
