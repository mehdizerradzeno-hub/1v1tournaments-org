import { cleanText, getStoreWithFallback } from './_account-utils.mjs';
import {
  TOURNAMENT_CONTEXT_SCHEMA_VERSION,
  TOURNAMENT_GAME_SLUGS,
  createTournamentRecord,
  normalizeTournamentGameSlug,
  slugifyTournamentTitle,
} from '../../src/lib/tournamentCatalog.js';
import { deriveTournamentLifecycle } from '../../src/lib/tournamentLifecycle.js';
import { siteData } from '../../src/lib/siteData.js';

const STORE_NAME = 'tournament-events';

function normalizeCompetitionMeta(value = {}) {
  if (!value || typeof value !== 'object') {
    return {
      schemaVersion: TOURNAMENT_CONTEXT_SCHEMA_VERSION,
      competitionMode: 'tournament',
      leagueId: null,
      seasonId: null,
      scheduleId: null,
      divisionId: null,
      venueId: null,
      matchAssignmentId: null,
    };
  }

  return {
    schemaVersion: TOURNAMENT_CONTEXT_SCHEMA_VERSION,
    competitionMode: value.competitionMode === 'league' ? 'league' : 'tournament',
    leagueId: cleanText(value.leagueId, ''),
    seasonId: cleanText(value.seasonId, ''),
    scheduleId: cleanText(value.scheduleId, ''),
    divisionId: cleanText(value.divisionId, ''),
    venueId: cleanText(value.venueId, ''),
    matchAssignmentId: cleanText(value.matchAssignmentId, ''),
    raw: value.raw && typeof value.raw === 'object' ? value.raw : undefined,
  };
}

function hydrateCompetitionContext(record = {}) {
  const base = record?.competitionMeta || record?.leagueMeta || {
    competitionMode: record?.competitionMode,
    leagueId: record?.leagueId,
    seasonId: record?.seasonId,
    scheduleId: record?.scheduleId,
    divisionId: record?.divisionId,
    venueId: record?.venueId,
    matchAssignmentId: record?.matchAssignmentId,
  };

  return {
    ...record,
    gameSlug: normalizeTournamentGameSlug(record?.gameSlug),
    competitionMeta: normalizeCompetitionMeta(base),
  };
}

function eventKey(tournamentSlug) {
  return `${cleanText(tournamentSlug)}.json`;
}

function byDateAsc(left, right) {
  if (left?.deleted && !right?.deleted) return 1;
  if (!left?.deleted && right?.deleted) return -1;

  const leftTime = new Date(left.date).getTime();
  const rightTime = new Date(right.date).getTime();

  if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return 0;
  if (!Number.isFinite(leftTime)) return 1;
  if (!Number.isFinite(rightTime)) return -1;
  return leftTime - rightTime;
}

export function normalizeHostedTournament(payload = {}) {
  const title = cleanText(payload.title);
  const slug = slugifyTournamentTitle(payload.slug || title);
  const date = cleanText(payload.date || payload.startAt);
  const parsedDate = new Date(date);
  const requestedGameSlug = cleanText(payload.gameSlug);

  if (!title) {
    return { error: 'Enter a tournament title before saving.' };
  }

  if (!slug) {
    return { error: 'Enter a URL slug before saving.' };
  }

  if (!date || Number.isNaN(parsedDate.getTime())) {
    return { error: 'Enter a valid tournament date and time.' };
  }

  if (requestedGameSlug && !TOURNAMENT_GAME_SLUGS.includes(requestedGameSlug)) {
    return { error: 'Tournament game must be spades or euchre.' };
  }

  return createTournamentRecord({
    ...payload,
    gameSlug: requestedGameSlug || 'spades',
    competitionMeta: normalizeCompetitionMeta(payload.competitionMeta || payload.leagueMeta || payload),
    slug,
    title,
    date: parsedDate.toISOString(),
    hosted: true,
  });
}

export async function listHostedTournaments() {
  const store = getStoreWithFallback(STORE_NAME);
  const bracketStore = getStoreWithFallback('tournament-brackets');
  const { blobs } = await store.list();
  const tournamentReads = await Promise.allSettled(
    blobs.map((blob) => store.get(blob.key, { type: 'json' })),
  );
  const tournaments = tournamentReads
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter(Boolean);
  const hydratedReads = await Promise.allSettled(tournaments.map(async (tournament) => {
    if (!tournament.slug || tournament.deleted) {
      return deriveTournamentLifecycle(hydrateCompetitionContext(tournament));
    }

    let bracket = null;

    try {
      bracket = await bracketStore.get(`${tournament.slug}.json`, { type: 'json' });
    } catch (error) {
      console.error(`Tournament bracket hydration failed for ${tournament.slug}`, error);
    }

    return deriveTournamentLifecycle(hydrateCompetitionContext(tournament), bracket);
  }));

  return hydratedReads
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter(Boolean)
    .sort(byDateAsc);
}

export async function loadHostedTournament(tournamentSlug) {
  const slug = cleanText(tournamentSlug);

  if (!slug) {
    return null;
  }

  const store = getStoreWithFallback(STORE_NAME);
  const tournament = await store.get(eventKey(slug), { type: 'json' });

  if (!tournament || tournament.deleted) {
    return null;
  }

  const bracketStore = getStoreWithFallback('tournament-brackets');
  const bracket = await bracketStore.get(`${slug}.json`, { type: 'json' });

  return deriveTournamentLifecycle(hydrateCompetitionContext(tournament), bracket);
}

export async function deleteHostedTournament(tournamentSlug) {
  const slug = cleanText(tournamentSlug);

  if (!slug) {
    return false;
  }

  const store = getStoreWithFallback(STORE_NAME);
  const existing = await store.get(eventKey(slug), { type: 'json' });
  const seededTournament = siteData.tournaments.some((tournament) => tournament.slug === slug);

  await store.delete(eventKey(slug));

  if (seededTournament) {
    const updatedAt = new Date().toISOString();
    await store.setJSON(eventKey(slug), {
      slug,
      deleted: true,
      hideSeeded: true,
      status: 'deleted',
      updatedAt,
      updatedBy: 'host-clear',
    }, {
      metadata: {
        tournamentSlug: slug,
        hideSeeded: true,
        status: 'deleted',
        updatedAt,
      },
    });
  }

  return Boolean(existing) || seededTournament;
}

export async function saveHostedTournament(tournament, account = null) {
  const store = getStoreWithFallback(STORE_NAME);
  const updatedAt = new Date().toISOString();
  const nextTournament = {
    ...tournament,
    competitionMeta: normalizeCompetitionMeta(tournament?.competitionMeta || tournament?.leagueMeta || {}),
    updatedAt,
    updatedBy: account?.email || 'token',
  };

  await store.setJSON(eventKey(nextTournament.slug), nextTournament, {
    metadata: {
      tournamentSlug: nextTournament.slug,
      gameSlug: nextTournament.gameSlug,
      date: nextTournament.date,
      status: nextTournament.status,
      updatedAt,
    },
  });

  return nextTournament;
}
