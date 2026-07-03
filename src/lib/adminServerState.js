import { siteData } from './siteData.js';
import { normalizeDrafts } from './adminStorage.js';

const DEFAULT_VERSION = 1;

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

export function parseAccountIds(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeAccountIds(value) {
  const seen = new Set();
  const accountIds = [];

  for (const item of parseAccountIds(value)) {
    const normalized = normalizeText(item);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    accountIds.push(normalized);
  }

  return accountIds;
}

export function createDefaultAdminServerState() {
  return {
    version: DEFAULT_VERSION,
    updatedAt: new Date().toISOString(),
    allowlistAccountIds: normalizeAccountIds(siteData.admin?.bootstrapAllowlistAccountIds || []),
    draftTournaments: normalizeDrafts(siteData.admin?.draftTournaments || []),
  };
}

export function normalizeAdminServerState(input) {
  const fallback = createDefaultAdminServerState();

  if (!input || typeof input !== 'object') {
    return fallback;
  }

  const allowlistSource =
    input.allowlistAccountIds ??
    input.allowlist ??
    input.accountIds ??
    fallback.allowlistAccountIds;
  const draftSource = input.draftTournaments ?? input.drafts ?? fallback.draftTournaments;

  return {
    version: typeof input.version === 'number' && input.version > 0 ? input.version : DEFAULT_VERSION,
    updatedAt: normalizeText(input.updatedAt) || fallback.updatedAt,
    allowlistAccountIds: normalizeAccountIds(allowlistSource),
    draftTournaments: normalizeDrafts(draftSource),
  };
}

export function isAccountIdAllowed(accountId, state) {
  const normalizedAccountId = normalizeText(accountId);

  if (!normalizedAccountId) {
    return false;
  }

  return normalizeAdminServerState(state).allowlistAccountIds.includes(normalizedAccountId);
}

export function buildAdminServerPacket(state) {
  const normalized = normalizeAdminServerState(state);

  return {
    exportedAt: new Date().toISOString(),
    source: '1v1 Tournaments admin server',
    note: 'Store this in the local allowlist server data file.',
    state: normalized,
    allowlistCount: normalized.allowlistAccountIds.length,
    draftCount: normalized.draftTournaments.length,
  };
}

export function serializeAdminServerPacket(state) {
  return JSON.stringify(buildAdminServerPacket(state), null, 2);
}
