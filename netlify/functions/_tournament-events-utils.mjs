import { accountCanonicalId, cleanText, getStoreWithFallback } from './_account-utils.mjs';
import {
  TOURNAMENT_CONTEXT_SCHEMA_VERSION,
  TOURNAMENT_GAME_SLUGS,
  createTournamentRecord,
  isPublicTournamentVisible,
  normalizeTournamentGameSlug,
  slugifyTournamentTitle,
} from '../../src/lib/tournamentCatalog.js';
import {
  deriveTournamentLifecycle,
  hasActiveTournamentMatches,
  isTournamentDeleted,
} from '../../src/lib/tournamentLifecycle.js';
import { siteData } from '../../src/lib/siteData.js';
import { EUCHRE_LEAGUE_VERSION, EuchreLeagueError } from '../../src/lib/euchreLeagueSeason.js';

/** Internal game resources are created by the league outbox, never generic host editing. */
export function assertManualTournamentMutationAllowed(tournament) {
  if (tournament?.competitionMeta?.raw?.leagueFormatVersion === EUCHRE_LEAGUE_VERSION
    || /^elg-[a-f0-9]{32}$/.test(tournament?.slug || '')) {
    throw new EuchreLeagueError('league_managed_tournament', 'This game is managed by its Euchre league. Use the league organizer dashboard.');
  }
}

const STORE_NAME = 'tournament-events';
const SERIES_STORE_NAME = 'tournament-series';
const TOURNAMENT_READ_BATCH_SIZE = 16;

async function mapInBatches(items, mapper, { settle = false } = {}) {
  const results = [];

  for (let index = 0; index < items.length; index += TOURNAMENT_READ_BATCH_SIZE) {
    const batch = items.slice(index, index + TOURNAMENT_READ_BATCH_SIZE).map(mapper);
    results.push(...await (settle ? Promise.allSettled(batch) : Promise.all(batch)));
  }

  return results;
}

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

function hostedTournamentMetadata(tournament) {
  return {
    tournamentSlug: tournament.slug,
    gameSlug: tournament.gameSlug,
    date: tournament.date,
    status: tournament.status,
    updatedAt: tournament.updatedAt,
  };
}

function tournamentForWrite(tournament, account, updatedAt) {
  return {
    ...tournament,
    competitionMeta: normalizeCompetitionMeta(tournament?.competitionMeta || tournament?.leagueMeta || {}),
    updatedAt,
    updatedBy: account?.email || 'token',
  };
}

async function writeNewTournament(store, key, tournament) {
  const options = {
    onlyIfNew: true,
    metadata: hostedTournamentMetadata(tournament),
  };

  if (typeof store.set === 'function') {
    return store.set(key, JSON.stringify(tournament), options);
  }

  if (await store.get(key, { type: 'json' })) {
    return { modified: false };
  }

  await store.setJSON(key, tournament, options);
  return { modified: true };
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
    return { error: 'Tournament game must be Spades, Euchre, or Gin Rummy.' };
  }

  const record = createTournamentRecord({
    ...payload,
    gameSlug: requestedGameSlug || 'spades',
    competitionMeta: normalizeCompetitionMeta(payload.competitionMeta || payload.leagueMeta || payload),
    slug,
    title,
    date: parsedDate.toISOString(),
    hosted: true,
  });

  return {
    ...record,
    ...(payload.cancelledAt ? { cancelledAt: payload.cancelledAt } : {}),
    ...(payload.cancelledBy ? { cancelledBy: payload.cancelledBy } : {}),
    ...(payload.recurrence ? { recurrence: payload.recurrence } : {}),
    ...(payload.seriesId ? { seriesId: cleanText(payload.seriesId) } : {}),
    ...(payload.seriesIndex ? { seriesIndex: Number.parseInt(payload.seriesIndex, 10) } : {}),
    ...(payload.seriesLocalDate ? { seriesLocalDate: cleanText(payload.seriesLocalDate) } : {}),
    ...(payload.seriesPending ? { seriesPending: true } : {}),
    ...(payload.seriesRevision ? { seriesRevision: Number.parseInt(payload.seriesRevision, 10) } : {}),
    ...(payload.visibility ? { visibility: cleanText(payload.visibility) } : {}),
    ...(payload.publicDiscovery === false ? { publicDiscovery: false } : {}),
  };
}

async function seriesIsVisible(tournament, seriesStore) {
  if (!tournament?.seriesId) return true;
  const series = await seriesStore.get(`${tournament.seriesId}.json`, { type: 'json' });
  return series?.status === 'complete';
}

export async function listHostedTournaments(options = {}) {
  const store = options.store || getStoreWithFallback(STORE_NAME);
  const bracketStore = options.bracketStore || getStoreWithFallback('tournament-brackets');
  const seriesStore = options.seriesStore || getStoreWithFallback(SERIES_STORE_NAME);
  const listedPages = store.list({ paginate: true });
  const pages = typeof listedPages?.[Symbol.asyncIterator] === 'function'
    ? listedPages
    : [await listedPages];
  const tournaments = [];

  for await (const { blobs = [] } of pages) {
    const reads = await mapInBatches(blobs, (blob) => store.get(blob.key, { type: 'json' }), { settle: true });
    tournaments.push(...reads
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value)
      .filter(Boolean));
  }

  const visibility = await mapInBatches(tournaments, (tournament) => seriesIsVisible(tournament, seriesStore));
  const visibleTournaments = tournaments.filter((tournament, index) => (
    visibility[index]
    && !tournament.cancelledAt
    && tournament.status !== 'cancelled'
  ));
  const hydratedReads = await mapInBatches(visibleTournaments, async (tournament) => {
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
  }, { settle: true });

  return hydratedReads
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter(Boolean)
    .sort(byDateAsc);
}

export async function listPublicHostedTournaments(options = {}) {
  return (await listHostedTournaments(options)).filter(isPublicTournamentVisible);
}

export async function loadHostedTournament(tournamentSlug, options = {}) {
  const slug = cleanText(tournamentSlug);

  if (!slug) {
    return null;
  }

  const store = options.store || getStoreWithFallback(STORE_NAME);
  const tournament = await store.get(eventKey(slug), { type: 'json' });

  if (!tournament || tournament.deleted || tournament.cancelledAt || tournament.status === 'cancelled') {
    return null;
  }

  const seriesStore = options.seriesStore || getStoreWithFallback(SERIES_STORE_NAME);
  if (!(await seriesIsVisible(tournament, seriesStore))) return null;

  const bracketStore = options.bracketStore || getStoreWithFallback('tournament-brackets');
  const bracket = await bracketStore.get(`${slug}.json`, { type: 'json' });

  return deriveTournamentLifecycle(hydrateCompetitionContext(tournament), bracket);
}

export async function loadHostedTournamentRecord(tournamentSlug, options = {}) {
  const slug = cleanText(tournamentSlug);

  if (!slug) {
    return null;
  }

  const store = options.store || getStoreWithFallback(STORE_NAME);
  return store.get(eventKey(slug), { type: 'json' });
}

export async function isHostedTournamentDeleted(tournamentSlug, options = {}) {
  return isTournamentDeleted(await loadHostedTournamentRecord(tournamentSlug, options));
}

export async function deleteHostedTournament(tournamentSlug, options = {}) {
  const slug = cleanText(tournamentSlug);

  if (!slug) {
    return { deleted: false, notFound: true, tournament: null };
  }

  const store = options.store || getStoreWithFallback(STORE_NAME);
  const bracketStore = options.bracketStore || getStoreWithFallback('tournament-brackets');
  const existing = await store.get(eventKey(slug), { type: 'json' });
  const seededTournament = siteData.tournaments.find((tournament) => tournament.slug === slug) || null;
  assertManualTournamentMutationAllowed(existing || { slug });

  if (isTournamentDeleted(existing)) {
    return { alreadyDeleted: true, deleted: true, tournament: existing };
  }

  if (!existing && !seededTournament) {
    return { deleted: false, notFound: true, tournament: null };
  }

  const bracket = await bracketStore.get(`${slug}.json`, { type: 'json' });

  if (hasActiveTournamentMatches(bracket)) {
    return {
      blocked: true,
      code: 'active_matches',
      deleted: false,
      tournament: existing || seededTournament,
    };
  }

  const date = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const deletedAt = date.toISOString();
  const deletedBy = cleanText(options.deletedBy) || 'host-token';
  const tombstone = {
    ...(seededTournament || {}),
    ...(existing || {}),
    slug,
    deleted: true,
    hideSeeded: true,
    status: 'deleted',
    registrationStatus: 'closed',
    deletedAt,
    deletedBy,
    updatedAt: deletedAt,
    updatedBy: deletedBy,
  };

  await store.setJSON(eventKey(slug), tombstone, {
    metadata: {
      tournamentSlug: slug,
      hideSeeded: true,
      status: 'deleted',
      deletedAt,
    },
  });

  return { deleted: true, tournament: tombstone };
}

export async function saveHostedTournament(tournament, account = null, options = {}) {
  const store = options.store || getStoreWithFallback(STORE_NAME);
  const updatedAt = options.updatedAt || new Date().toISOString();
  const existing = await store.get(eventKey(tournament?.slug), { type: 'json' });
  assertManualTournamentMutationAllowed(existing);
  assertManualTournamentMutationAllowed(tournament);
  const existingRecurrence = existing?.recurrence || tournament?.recurrence;
  const nextTournament = tournamentForWrite({
    ...tournament,
    ...(existing?.seriesId ? {
      recurrence: {
        ...(existingRecurrence || {}),
        ...(tournament?.recurrence || {}),
        ...(!options.seriesOperation ? {
          individuallyEditedAt: updatedAt,
          individuallyEditedBy: accountCanonicalId(account) || account?.email || 'token',
        } : {}),
      },
      seriesId: existing.seriesId,
      seriesIndex: existing.seriesIndex,
      seriesLocalDate: existing.seriesLocalDate,
      seriesPending: existing.seriesPending,
      seriesRevision: tournament?.seriesRevision || existing.seriesRevision,
    } : {}),
  }, account, updatedAt);

  await store.setJSON(eventKey(nextTournament.slug), nextTournament, {
    metadata: hostedTournamentMetadata(nextTournament),
  });

  return nextTournament;
}

export async function createHostedTournament(tournament, account = null, options = {}) {
  const slug = cleanText(tournament?.slug);

  if (!slug) {
    return { conflict: false, created: false, error: 'Enter a URL slug before creating a tournament.', tournament: null };
  }

  const seededTournament = siteData.tournaments.find((item) => item.slug === slug);

  if (seededTournament) {
    return {
      code: 'tournament_slug_conflict',
      conflict: true,
      created: false,
      error: 'A tournament already uses this URL slug. Choose a different title or slug.',
      tournament: seededTournament,
    };
  }

  const store = options.store || getStoreWithFallback(STORE_NAME);
  const updatedAt = options.updatedAt || new Date().toISOString();
  const nextTournament = tournamentForWrite(tournament, account, updatedAt);
  const result = await writeNewTournament(store, eventKey(slug), nextTournament);

  if (!result?.modified) {
    return {
      code: 'tournament_slug_conflict',
      conflict: true,
      created: false,
      error: 'A tournament already uses this URL slug. Choose a different title or slug.',
      tournament: null,
    };
  }

  return { conflict: false, created: true, tournament: nextTournament };
}
