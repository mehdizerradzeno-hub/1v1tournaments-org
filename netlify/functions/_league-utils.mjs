import { getStoreWithFallback } from './_account-utils.mjs';
import {
  applyLeagueMatchResult,
  buildLeagueMatchRoomUrl,
  buildLeagueRecord,
  buildLeagueStandings,
  generateLeagueSchedule,
  joinLeagueRecord,
  leaveLeagueRecord,
  promoteFromWaitlist,
  standingsToCsv,
} from '../../src/lib/leagueCatalog.js';

const STORE_NAME = 'leagues';
const LEAGUE_RESULT_WRITE_ATTEMPTS = 3;

function cleanText(value, fallback = '') {
  return String(value || '').trim().slice(0, 240);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeMatchResult(value = {}) {
  const homeScore = Number.parseInt(value.homeScore, 10);
  const awayScore = Number.parseInt(value.awayScore, 10);

  return {
    winner: cleanText(value.winner, value.winnerId ? 'home' : ''),
    winnerId: cleanText(value.winnerId),
    homeScore: Number.isFinite(homeScore) ? String(homeScore) : '0',
    awayScore: Number.isFinite(awayScore) ? String(awayScore) : '0',
    tie: Boolean(value.tie),
    forfeit: Boolean(value.forfeit),
    noShow: Boolean(value.noShow),
    dispute: Boolean(value.dispute),
    source: cleanText(value.source),
    callbackId: cleanText(value.callbackId),
    sourceTournamentSlug: cleanText(value.sourceTournamentSlug),
    sourceTournamentMatchId: cleanText(value.sourceTournamentMatchId),
    sourceCompletionId: cleanText(value.sourceCompletionId),
  };
}

function getLeagueStore() {
  return getStoreWithFallback(STORE_NAME);
}

function leagueKey(leagueId) {
  return `${cleanText(leagueId).toLowerCase()}.json`;
}

async function loadLeague(store, leagueId) {
  return store.get(leagueKey(leagueId), { type: 'json' });
}

async function loadLeagueWithMetadata(store, leagueId) {
  const key = leagueKey(leagueId);
  if (typeof store.getWithMetadata === 'function') {
    const result = await store.getWithMetadata(key, { type: 'json' });
    return result ? { league: result.data, etag: result.etag } : null;
  }

  const league = await store.get(key, { type: 'json' });
  return league ? { league, etag: null } : null;
}

async function saveLeagueResult(store, league, etag) {
  const key = leagueKey(league.id);
  const options = {
    metadata: {
      leagueId: league.id,
      status: league.status,
      updatedAt: league.updatedAt,
      gameSlug: league.gameSlug,
    },
    ...(etag ? { onlyIfMatch: etag } : {}),
  };

  if (typeof store.set === 'function') {
    const result = await store.set(key, JSON.stringify(league), options);
    return { modified: result?.modified !== false };
  }

  const result = await store.setJSON(key, league, options);
  return { modified: result?.modified !== false };
}

function withStandings(record) {
  return {
    ...buildLeagueRecord(record),
    standings: buildLeagueStandings(record),
  };
}

export async function listLeagues({ includeArchived = false } = {}) {
  const store = getLeagueStore();
  const { blobs } = await store.list();
  const leagues = await Promise.all(blobs.map((blob) => store.get(blob.key, { type: 'json' })));
  return leagues
    .filter(Boolean)
    .filter((league) => includeArchived || league.status !== 'archived')
    .map((league) => ({
      ...withStandings(league),
    }))
    .sort((left, right) => new Date(left.createdAt || '').getTime() - new Date(right.createdAt || '').getTime());
}

export async function loadLeagueById(leagueId) {
  const store = getLeagueStore();
  const league = await loadLeague(store, leagueId);
  return league ? withStandings(league) : null;
}

export async function saveLeague(record = {}, account = null) {
  const store = getLeagueStore();
  const next = buildLeagueRecord(record);
  const existing = await loadLeague(store, next.id);

  const updated = {
    ...buildLeagueRecord(existing || {}),
    ...next,
    id: next.id,
    updatedBy: account?.email || account?.id || 'system',
    updatedAt: nowIso(),
    createdAt: existing?.createdAt || nowIso(),
  };

  await store.setJSON(leagueKey(updated.id), updated, {
    metadata: {
      leagueId: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt,
      gameSlug: updated.gameSlug,
    },
  });

  return {
    ...withStandings(updated),
  };
}

export async function archiveLeague(leagueId, account = null) {
  const store = getLeagueStore();
  const existing = await loadLeague(store, leagueId);

  if (!existing) return null;

  const next = {
    ...existing,
    status: 'archived',
    archivedAt: nowIso(),
    updatedAt: nowIso(),
    updatedBy: account?.email || account?.id || 'system',
  };

  await store.setJSON(leagueKey(existing.id), next);
  return withStandings(next);
}

export async function setLeagueRegistration(leagueId, isOpen, account = null) {
  const store = getLeagueStore();
  const existing = await loadLeague(store, leagueId);

  if (!existing) return null;

  const next = {
    ...existing,
    registrationOpen: Boolean(isOpen),
    updatedAt: nowIso(),
    updatedBy: account?.email || account?.id || 'system',
  };

  await store.setJSON(leagueKey(existing.id), next);
  return withStandings(next);
}

export async function addLeagueParticipant(leagueId, accountIdentity = {}, options = {}) {
  const store = getLeagueStore();
  const league = await loadLeague(store, leagueId);
  if (!league) return null;

  if (league.status === 'archived') {
    return {
      league: withStandings(league),
      waitlisted: false,
      blocked: 'archived',
    };
  }

  if (league.registrationOpen === false) {
    return {
      league: withStandings(league),
      waitlisted: false,
      blocked: 'registration-closed',
    };
  }

  const update = joinLeagueRecord(league, accountIdentity, options);
  if (!update.changed) {
    return {
      league: withStandings(league),
      waitlisted: update.waitlisted,
      blocked: null,
    };
  }

  const next = {
    ...update.league,
    id: league.id,
    updatedBy: accountIdentity?.email || accountIdentity?.accountEmail || accountIdentity?.id || league.createdBy,
    updatedAt: nowIso(),
  };

  await store.setJSON(leagueKey(league.id), next);
  return {
    league: withStandings(next),
    waitlisted: update.waitlisted,
    blocked: null,
  };
}

export async function removeLeagueParticipant(leagueId, accountIdentity = {}, options = {}) {
  const store = getLeagueStore();
  const league = await loadLeague(store, leagueId);
  if (!league) return null;

  const update = leaveLeagueRecord(league, accountIdentity, options);
  if (!update.changed) return withStandings(league);

  const next = {
    ...update.league,
    id: league.id,
    updatedBy: accountIdentity?.email || accountIdentity?.accountEmail || accountIdentity?.id || league.updatedBy || 'system',
    updatedAt: nowIso(),
  };

  await store.setJSON(leagueKey(league.id), next);
  return {
    ...withStandings(next),
    promoted: update.promoted,
  };
}

export async function replaceLeagueParticipant(leagueId, targetIdentity, accountIdentity = {}) {
  const league = await loadLeague(getLeagueStore(), leagueId);
  if (!league) return null;

  const players = [...(league.participants || [])];
  const canonicalTarget = String(targetIdentity?.canonicalAccountId || targetIdentity?.accountId || targetIdentity?.id || '').trim();

  const nextPlayers = players.filter((player) => player.canonicalAccountId !== canonicalTarget && player.accountId !== canonicalTarget);
  const next = {
    ...league,
    participants: nextPlayers,
    players: nextPlayers.length,
    updatedAt: nowIso(),
    updatedBy: accountIdentity?.email || accountIdentity?.accountEmail || accountIdentity?.id || league.updatedBy || 'system',
  };

  await getLeagueStore().setJSON(leagueKey(league.id), next);
  return withStandings(next);
}

export async function promoteLeagueWaitlist(leagueId, accountIdentity = {}) {
  const store = getLeagueStore();
  const league = await loadLeague(store, leagueId);
  if (!league) return null;

  const update = promoteFromWaitlist(league, accountIdentity);
  if (!update.changed) return withStandings(league);

  const next = {
    ...update.league,
    id: league.id,
    updatedAt: nowIso(),
    updatedBy: accountIdentity?.email || accountIdentity?.accountEmail || accountIdentity?.id || league.updatedBy || 'system',
  };

  await store.setJSON(leagueKey(league.id), next);
  return withStandings(next);
}

export async function upsertLeagueMatchResult(leagueId, matchId, result = {}, options = {}) {
  const store = options.store || getLeagueStore();
  const resolvedResult = {
    ...normalizeMatchResult(result),
    source: cleanText(result.source, options.source),
    callbackId: cleanText(result.callbackId || options.callbackId),
  };

  for (let attempt = 0; attempt < LEAGUE_RESULT_WRITE_ATTEMPTS; attempt += 1) {
    const loaded = await loadLeagueWithMetadata(store, leagueId);
    if (!loaded?.league) return null;

    const updated = applyLeagueMatchResult(loaded.league, matchId, resolvedResult, {
      force: Boolean(options.force),
      callbackId: resolvedResult.callbackId,
      source: cleanText(options.source || result.source),
      updatedBy: cleanText(options.updatedBy),
      skipHistory: false,
    });

    const currentMatch = (loaded.league.matches || []).find((match) => match.id === cleanText(matchId));
    if (options.rejectConflictingCompleted && currentMatch?.status === 'complete' && !updated.duplicate) {
      return {
        ...withStandings(loaded.league),
        changed: false,
        duplicate: false,
        completeIgnored: true,
        conflict: true,
        match: currentMatch,
      };
    }

    const next = {
      ...updated.league,
      id: loaded.league.id,
      updatedAt: nowIso(),
    };
    const saved = await saveLeagueResult(store, next, loaded.etag);
    if (!saved.modified) continue;

    return {
      ...withStandings(next),
      changed: updated.changed,
      duplicate: updated.duplicate,
      completeIgnored: updated.completeIgnored,
      conflict: false,
      match: updated.match,
    };
  }

  throw new Error('League result write conflicted repeatedly; retry the authoritative callback.');
}

export async function launchLeagueMatch(leagueId, matchId, roomUrl = '', account = null) {
  const store = getLeagueStore();
  const league = await loadLeague(store, leagueId);
  if (!league) return null;

  const matches = [...(league.matches || [])];
  const index = matches.findIndex((match) => match.id === cleanText(matchId));
  if (index < 0) return null;

  const now = nowIso();
  const nextUrl = cleanText(roomUrl) || buildLeagueMatchRoomUrl(league, matches[index], {
    gameMatchBaseUrls: {
      spades: process.env.SPADES_MATCH_BASE_URL,
      euchre: process.env.EUCHRE_MATCH_BASE_URL,
    },
  });

  if (!nextUrl) {
    return {
      ...withStandings(league),
      launchUnavailable: true,
      match: matches[index],
    };
  }
  matches[index] = {
    ...matches[index],
    roomUrl: nextUrl,
    roomLaunchedAt: now,
    updatedAt: now,
  };

  const next = {
    ...buildLeagueRecord(league),
    matches,
    updatedAt: now,
    updatedBy: account?.email || account?.id || 'system',
  };

  await store.setJSON(leagueKey(league.id), next);
  return {
    ...withStandings(next),
    match: matches[index],
  };
}

export async function regenerateLeagueSchedule(leagueId, options = {}) {
  const store = getLeagueStore();
  const league = await loadLeague(store, leagueId);
  if (!league) return null;

  const next = generateLeagueSchedule(league, {
    weekCount: options.weekCount,
    doubleRoundRobin: Boolean(options.doubleRoundRobin),
  });

  await store.setJSON(leagueKey(league.id), next);
  return withStandings(next);
}

export async function exportLeagueStandings(leagueId) {
  const league = await loadLeagueById(leagueId);
  if (!league) return '';

  return standingsToCsv(league);
}
