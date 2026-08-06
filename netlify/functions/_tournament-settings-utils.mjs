import { getStoreWithFallback, cleanText } from './_account-utils.mjs';

export const REGISTRATION_STATUSES = new Set(['open', 'closed', 'coming-soon']);
export const TOURNAMENT_SETTINGS_SCHEMA_VERSION = 1;

const COMPETITION_MODES = new Set(['tournament', 'league']);
const DEFAULT_COMPETITION_MODE = 'tournament';
const DEFAULT_LEAGUE_META = Object.freeze({
  schemaVersion: TOURNAMENT_SETTINGS_SCHEMA_VERSION,
  competitionMode: DEFAULT_COMPETITION_MODE,
  leagueId: null,
  seasonId: null,
  scheduleId: null,
  divisionId: null,
  venueId: null,
  matchAssignmentId: null,
});

function normalizeText(value, fallback = '') {
  const text = cleanText(value);
  return text || fallback;
}

function normalizeLeagueMeta(value = {}) {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_LEAGUE_META };
  }

  const competitionMode = COMPETITION_MODES.has(value.competitionMode) ? value.competitionMode : DEFAULT_COMPETITION_MODE;

  return {
    ...DEFAULT_LEAGUE_META,
    competitionMode,
    leagueId: normalizeText(value.leagueId, null),
    seasonId: normalizeText(value.seasonId, null),
    scheduleId: normalizeText(value.scheduleId, null),
    divisionId: normalizeText(value.divisionId, null),
    venueId: normalizeText(value.venueId, null),
    matchAssignmentId: normalizeText(value.matchAssignmentId, null),
    raw: value.raw && typeof value.raw === 'object' ? value.raw : undefined,
    schemaVersion: TOURNAMENT_SETTINGS_SCHEMA_VERSION,
  };
}

function normalizeStoredSettings(settings = {}) {
  if (!settings || typeof settings !== 'object') {
    return settings;
  }

  return {
    ...settings,
    competitionMeta: normalizeLeagueMeta(settings.competitionMeta),
  };
}

function settingsKey(tournamentSlug) {
  return `${cleanText(tournamentSlug)}.json`;
}

function cleanShortText(value, fallback = '') {
  return cleanText(value || fallback).slice(0, 80);
}

export function normalizeRegistrationStatus(value) {
  const status = cleanText(value).toLowerCase();
  return REGISTRATION_STATUSES.has(status) ? status : 'open';
}

export function normalizeCheckInLeadMinutes(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return 30;
  }

  return Math.min(Math.max(parsed, 0), 1440);
}

export function normalizeTournamentSettings(payload = {}, fallbackSlug = '') {
  const tournamentSlug = cleanText(payload.tournamentSlug || fallbackSlug);
  const date = cleanText(payload.date || payload.startAt);
  const parsedDate = new Date(date);

  if (!tournamentSlug) {
    return { error: 'Choose a tournament before saving schedule settings.' };
  }

  if (!date || Number.isNaN(parsedDate.getTime())) {
    return { error: 'Enter a valid tournament date and time.' };
  }

  return {
    tournamentSlug,
    date: parsedDate.toISOString(),
    timeZone: cleanShortText(payload.timeZone, 'America/New_York'),
    timeZoneLabel: cleanShortText(payload.timeZoneLabel, 'ET').slice(0, 12),
    registrationStatus: normalizeRegistrationStatus(payload.registrationStatus),
    checkInLeadMinutes: normalizeCheckInLeadMinutes(payload.checkInLeadMinutes),
    schemaVersion: TOURNAMENT_SETTINGS_SCHEMA_VERSION,
    competitionMeta: normalizeLeagueMeta({
      ...(payload.competitionMeta || payload.leagueMeta || payload.league),
      ...(typeof payload !== 'object' || !payload ? {} : payload),
    }),
  };
}

export async function loadTournamentSettings(tournamentSlug) {
  const slug = cleanText(tournamentSlug);

  if (!slug) {
    return null;
  }

  const store = getStoreWithFallback('tournament-settings');
  const settings = await store.get(settingsKey(slug), { type: 'json' });
  return normalizeStoredSettings(settings);
}

export async function saveTournamentSettings(settings, account = null) {
  const store = getStoreWithFallback('tournament-settings');
  const updatedAt = new Date().toISOString();
  const nextSettings = {
    ...settings,
    updatedAt,
    updatedBy: account?.email || 'token',
  };

  await store.setJSON(settingsKey(settings.tournamentSlug), nextSettings, {
    metadata: {
      tournamentSlug: settings.tournamentSlug,
      registrationStatus: settings.registrationStatus,
      updatedAt,
    },
  });

  return nextSettings;
}

export async function deleteTournamentSettings(tournamentSlug) {
  const slug = cleanText(tournamentSlug);

  if (!slug) {
    return;
  }

  const store = getStoreWithFallback('tournament-settings');
  await store.delete(settingsKey(slug));
}
