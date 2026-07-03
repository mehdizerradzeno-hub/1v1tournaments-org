import { siteData } from './siteData.js';

const STORAGE_KEYS = {
  drafts: 'one-v-one-tournaments.admin.drafts.v1',
  secret: 'one-v-one-tournaments.admin.secret.v1',
  session: 'one-v-one-tournaments.admin.session.v1',
};

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const DEFAULT_DRAFTS = siteData.admin?.draftTournaments || [];

function getStorage() {
  try {
    return globalThis?.localStorage || null;
  } catch {
    return null;
  }
}

export function hasAdminStorage() {
  return Boolean(getStorage());
}

function readJson(key, fallback) {
  const storage = getStorage();
  if (!storage) {
    return fallback;
  }

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  const storage = getStorage();
  if (!storage) {
    return false;
  }

  storage.setItem(key, JSON.stringify(value));
  return true;
}

function removeKey(key) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(key);
}

function hashString(input) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = (hash * 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

function normalizeText(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim().length > 0) : [];
}

function normalizeLinkList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      label: normalizeText(item.label, 'Link'),
      href: normalizeText(item.href, '/'),
    }))
    .filter((item) => item.href.length > 0);
}

function normalizeAgenda(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      time: normalizeText(item.time, 'TBD'),
      label: normalizeText(item.label, 'TBD'),
    }));
}

function normalizeBracket(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const rounds = Array.isArray(value.rounds)
    ? value.rounds
        .filter((round) => round && typeof round === 'object')
        .map((round) => ({
          title: normalizeText(round.title, 'Round'),
          matches: Array.isArray(round.matches)
            ? round.matches
                .filter((match) => match && typeof match === 'object')
                .map((match) => ({
                  label: normalizeText(match.label, 'Match'),
                  teams: normalizeList(match.teams),
                  note: normalizeText(match.note, ''),
                  winner: normalizeText(match.winner, ''),
                }))
            : [],
        }))
    : [];

  if (!rounds.length) {
    return null;
  }

  return {
    title: normalizeText(value.title, 'Bracket preview'),
    note: normalizeText(value.note, ''),
    rounds,
  };
}

function normalizeCheckIn(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const steps = normalizeList(value.steps);

  return {
    title: normalizeText(value.title, 'Signup and check-in'),
    status: normalizeText(value.status, 'Placeholder flow'),
    preview: normalizeText(value.preview, 'TBD'),
    window: normalizeText(value.window, 'TBD'),
    note: normalizeText(value.note, ''),
    steps,
  };
}

export function hashAdminPassphrase(passphrase) {
  return hashString(passphrase);
}

export function createAdminSessionRecord(passphraseFingerprint) {
  return {
    expiresAt: Date.now() + DEFAULT_SESSION_TTL_MS,
    fingerprint: passphraseFingerprint,
    token: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  };
}

export function getAdminSecretRecord() {
  return readJson(STORAGE_KEYS.secret, null);
}

export function setAdminSecretRecord(passphrase) {
  const fingerprint = hashAdminPassphrase(passphrase);
  writeJson(STORAGE_KEYS.secret, {
    createdAt: new Date().toISOString(),
    fingerprint,
  });
  return fingerprint;
}

export function hasAdminSecretRecord() {
  return Boolean(getAdminSecretRecord()?.fingerprint);
}

export function verifyAdminPassphrase(passphrase) {
  const secret = getAdminSecretRecord();

  if (!secret?.fingerprint) {
    return false;
  }

  return secret.fingerprint === hashAdminPassphrase(passphrase);
}

export function getAdminSessionRecord() {
  const session = readJson(STORAGE_KEYS.session, null);

  if (!session || typeof session !== 'object') {
    return null;
  }

  if (typeof session.expiresAt !== 'number' || session.expiresAt <= Date.now()) {
    removeKey(STORAGE_KEYS.session);
    return null;
  }

  return session;
}

export function setAdminSessionRecord(passphraseFingerprint) {
  const session = createAdminSessionRecord(passphraseFingerprint);
  writeJson(STORAGE_KEYS.session, session);
  return session;
}

export function clearAdminSessionRecord() {
  removeKey(STORAGE_KEYS.session);
}

export function isAdminSessionValid() {
  const secret = getAdminSecretRecord();
  const session = getAdminSessionRecord();

  return Boolean(secret?.fingerprint && session?.token && session.fingerprint === secret.fingerprint);
}

export function getAdminDrafts() {
  const stored = readJson(STORAGE_KEYS.drafts, null);

  if (!stored) {
    return [...DEFAULT_DRAFTS];
  }

  if (Array.isArray(stored)) {
    return normalizeDrafts(stored);
  }

  if (Array.isArray(stored.drafts)) {
    return normalizeDrafts(stored.drafts);
  }

  return [...DEFAULT_DRAFTS];
}

export function getAdminDraftBySlug(slug) {
  return getAdminDrafts().find((draft) => draft.slug === slug) || null;
}

export function setAdminDrafts(drafts) {
  return writeJson(STORAGE_KEYS.drafts, {
    drafts: normalizeDrafts(drafts),
    updatedAt: new Date().toISOString(),
  });
}

export function resetAdminDrafts() {
  return setAdminDrafts(DEFAULT_DRAFTS);
}

export function createDraftTemplate(overrides = {}) {
  const timestamp = Date.now();
  const gameSlug = normalizeText(overrides.gameSlug, siteData.site.primaryGameSlug);
  const slug = normalizeText(overrides.slug, `draft-${timestamp}`);

  return normalizeDrafts([
    {
      slug,
      gameSlug,
      title: normalizeText(overrides.title, 'New draft event'),
      badge: normalizeText(overrides.badge, 'Admin draft'),
      status: normalizeText(overrides.status, 'draft'),
      date: normalizeText(overrides.date, new Date(timestamp + 1000 * 60 * 60 * 24 * 14).toISOString()),
      timeZone: normalizeText(overrides.timeZone, 'America/New_York'),
      timeZoneLabel: normalizeText(overrides.timeZoneLabel, 'ET'),
      location: normalizeText(overrides.location, 'Online'),
      format: normalizeText(overrides.format, 'To be announced'),
      entryLine: normalizeText(overrides.entryLine, 'Free entry, no buy-in, no wagering.'),
      summary: normalizeText(overrides.summary, 'Private draft placeholder.'),
      detail: normalizeText(overrides.detail, 'Edit this draft when the event is ready for publishing.'),
      callout: normalizeText(overrides.callout, 'Private draft'),
      agenda: normalizeAgenda(overrides.agenda),
      highlights: normalizeList(overrides.highlights),
      streamSlugs: normalizeList(overrides.streamSlugs),
      links: normalizeLinkList(overrides.links),
      checkIn: normalizeCheckIn(overrides.checkIn),
      bracket: normalizeBracket(overrides.bracket),
    },
  ])[0];
}

export function buildAdminDraftPacket(draft) {
  const normalized = normalizeDrafts([draft])[0] || null;

  if (!normalized) {
    return null;
  }

  return {
    exportedAt: new Date().toISOString(),
    source: '1v1 Tournaments private admin',
    draft: normalized,
    note: 'Copy this into the local allowlist server flow when it is ready.',
  };
}

export function serializeAdminDraftPacket(draft) {
  const packet = buildAdminDraftPacket(draft);

  return packet ? JSON.stringify(packet, null, 2) : '';
}

export function normalizeDrafts(input) {
  if (!Array.isArray(input)) {
    return [...DEFAULT_DRAFTS];
  }

  return input.map((item, index) => {
    const gameSlug = normalizeText(item?.gameSlug, index === 0 ? siteData.site.primaryGameSlug : 'spades');
    const slug = normalizeText(item?.slug, `draft-${index + 1}`);
    const title = normalizeText(item?.title, `Draft event ${index + 1}`);

    return {
      slug,
      gameSlug,
      title,
      badge: normalizeText(item?.badge, 'Admin draft'),
      status: normalizeText(item?.status, 'draft'),
      date: normalizeText(item?.date, new Date(Date.now() + (index + 1) * 1000 * 60 * 60 * 24).toISOString()),
      timeZone: normalizeText(item?.timeZone, 'America/New_York'),
      timeZoneLabel: normalizeText(item?.timeZoneLabel, 'ET'),
      location: normalizeText(item?.location, 'Online'),
      format: normalizeText(item?.format, 'To be announced'),
      entryLine: normalizeText(item?.entryLine, 'Free entry, no buy-in, no wagering.'),
      summary: normalizeText(item?.summary, 'Private draft placeholder.'),
      detail: normalizeText(item?.detail, 'Edit this draft when the event is ready for publishing.'),
      callout: normalizeText(item?.callout, 'Private draft'),
      agenda: normalizeAgenda(item?.agenda),
      highlights: normalizeList(item?.highlights),
      streamSlugs: normalizeList(item?.streamSlugs),
      links: normalizeLinkList(item?.links),
      checkIn: normalizeCheckIn(item?.checkIn),
      bracket: normalizeBracket(item?.bracket),
    };
  });
}
