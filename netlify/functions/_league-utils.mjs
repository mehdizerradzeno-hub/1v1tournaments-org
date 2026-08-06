import { randomUUID } from 'node:crypto';

import { getStoreWithFallback } from './_account-utils.mjs';
import {
  buildLeagueRecord,
  generateLeagueSchedule,
  joinLeagueRecord,
  leaveLeagueRecord,
  buildLeagueStandings,
} from '../../src/lib/leagueCatalog.js';

const STORE_NAME = 'leagues';

function cleanText(value, fallback = '') {
  return String(value || '').trim().slice(0, 240);
}

function getLeagueStore() {
  return getStoreWithFallback(STORE_NAME);
}

function leagueKey(leagueId) {
  return `${cleanText(leagueId).toLowerCase()}.json`;
}

function nowIso() {
  return new Date().toISOString();
}

function loadLeague(store, leagueId) {
  return store.get(leagueKey(leagueId), { type: 'json' });
}

export async function listLeagues({ includeArchived = false } = {}) {
  const store = getLeagueStore();
  const { blobs } = await store.list();
  const leagues = await Promise.all(blobs.map((blob) => store.get(blob.key, { type: 'json' })));
  return leagues
    .filter(Boolean)
    .filter((league) => includeArchived || league.status !== 'archived')
    .map((league) => ({
      ...buildLeagueRecord(league),
      standings: buildLeagueStandings(league),
    }))
    .sort((left, right) => new Date(left.createdAt || '').getTime() - new Date(right.createdAt || '').getTime());
}

export async function loadLeagueById(leagueId) {
  const store = getLeagueStore();
  const league = await loadLeague(store, leagueId);

  if (!league) return null;

  return {
    ...buildLeagueRecord(league),
    standings: buildLeagueStandings(league),
  };
}

export async function saveLeague(record = {}, account = null) {
  const store = getLeagueStore();
  const next = buildLeagueRecord(record);
  const existing = await loadLeague(store, next.id);
  const updated = {
    ...buildLeagueRecord(existing || {}),
    ...next,
    id: next.id || randomUUID(),
    updatedBy: account?.email || account?.id || 'system',
    updatedAt: nowIso(),
    createdAt: existing?.createdAt || nowIso(),
  };

  await store.setJSON(leagueKey(updated.id), updated, {
    metadata: {
      leagueId: updated.id,
      gameSlug: updated.gameSlug,
      status: updated.status,
      updatedAt: updated.updatedAt,
    },
  });

  return {
    ...updated,
    standings: buildLeagueStandings(updated),
  };
}

export async function archiveLeague(leagueId, account = null) {
  const store = getLeagueStore();
  const existing = await loadLeague(store, leagueId);

  if (!existing) {
    return null;
  }

  const updated = {
    ...existing,
    status: 'archived',
    updatedAt: nowIso(),
    updatedBy: account?.email || account?.id || 'system',
  };

  await store.setJSON(leagueKey(existing.id), updated);

  return {
    ...buildLeagueRecord(updated),
    standings: buildLeagueStandings(updated),
  };
}

export async function addLeagueParticipant(leagueId, accountIdentity = {}) {
  const store = getLeagueStore();
  const league = await loadLeague(store, leagueId);

  if (!league) return null;

  const update = joinLeagueRecord(league, accountIdentity);
  if (!update.changed) {
    return {
      ...buildLeagueRecord(league),
      standings: buildLeagueStandings(league),
      waitlisted: update.waitlisted,
    };
  }

  const next = {
    ...update.league,
    id: league.id,
    updatedAt: nowIso(),
  };

  await store.setJSON(leagueKey(league.id), next);
  return {
    ...buildLeagueRecord(next),
    standings: buildLeagueStandings(next),
    waitlisted: update.waitlisted,
  };
}

export async function removeLeagueParticipant(leagueId, accountIdentity = {}) {
  const store = getLeagueStore();
  const league = await loadLeague(store, leagueId);

  if (!league) return null;

  const update = leaveLeagueRecord(league, accountIdentity);

  if (!update.changed) {
    return {
      ...buildLeagueRecord(league),
      standings: buildLeagueStandings(league),
    };
  }

  const next = {
    ...update.league,
    id: league.id,
    updatedAt: nowIso(),
  };

  await store.setJSON(leagueKey(league.id), next);
  return {
    ...buildLeagueRecord(next),
    standings: buildLeagueStandings(next),
  };
}

export async function upsertLeagueMatchResult(leagueId, matchId, result = {}) {
  const store = getLeagueStore();
  const league = await loadLeague(store, leagueId);
  if (!league) return null;

  const winner = cleanText(result.winner || '');
  const now = nowIso();
  const matches = [...(league.matches || [])];
  const index = matches.findIndex((match) => match.id === matchId);

  if (index === -1) return null;

  const nextMatch = {
    ...matches[index],
    result: {
      winner: winner || 'undecided',
      winnerId: cleanText(result.winnerId),
      homeScore: cleanText(result.homeScore || '0'),
      awayScore: cleanText(result.awayScore || '0'),
      forfeit: Boolean(result.forfeit),
      dispute: Boolean(result.dispute),
      completedAt: now,
    },
    status: winner ? 'complete' : 'scheduled',
    updatedAt: now,
  };

  matches[index] = nextMatch;

  const next = {
    ...league,
    matches,
    updatedAt: now,
  };

  await store.setJSON(leagueKey(leagueId), next);

  return {
    ...buildLeagueRecord(next),
    standings: buildLeagueStandings(next),
  };
}

export async function regenerateLeagueSchedule(leagueId, options = {}) {
  const store = getLeagueStore();
  const league = await loadLeague(store, leagueId);

  if (!league) return null;

  const next = generateLeagueSchedule(league, {
    weekCount: options.weekCount,
  });

  await store.setJSON(leagueKey(leagueId), next);

  return {
    ...buildLeagueRecord(next),
    standings: buildLeagueStandings(next),
  };
}
