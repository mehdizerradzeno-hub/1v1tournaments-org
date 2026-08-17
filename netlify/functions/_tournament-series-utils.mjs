import { createHash } from 'node:crypto';

import { accountCanonicalId, cleanText, getStoreWithFallback } from './_account-utils.mjs';
import {
  loadHostedTournamentRecord,
  normalizeHostedTournament,
} from './_tournament-events-utils.mjs';
import {
  generateTournamentOccurrences,
  recurrenceOccurrenceIsIndividuallyManaged,
  resolveZonedLocalDateTime,
} from '../../src/lib/tournamentRecurrence.js';

export const TOURNAMENT_SERIES_STORE_NAME = 'tournament-series';
const EVENT_STORE_NAME = 'tournament-events';
const SIGNUP_STORE_NAME = 'tournament-signups';
const BRACKET_STORE_NAME = 'tournament-brackets';

function seriesKey(seriesId) {
  return `${cleanText(seriesId)}.json`;
}

function eventKey(slug) {
  return `${cleanText(slug)}.json`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function digest(value, length = 64) {
  return createHash('sha256').update(stableJson(value)).digest('hex').slice(0, length);
}

function actorId(account, fallback = 'host-token') {
  return accountCanonicalId(account) || cleanText(account?.email) || fallback;
}

function getStores(options = {}) {
  return {
    bracketStore: options.bracketStore || getStoreWithFallback(BRACKET_STORE_NAME),
    eventStore: options.eventStore || getStoreWithFallback(EVENT_STORE_NAME),
    seriesStore: options.seriesStore || getStoreWithFallback(TOURNAMENT_SERIES_STORE_NAME),
    signupStore: options.signupStore || getStoreWithFallback(SIGNUP_STORE_NAME),
  };
}

async function readWithEtag(store, key) {
  if (typeof store.getWithMetadata === 'function') {
    return store.getWithMetadata(key, { type: 'json' });
  }

  const data = await store.get(key, { type: 'json' });
  return data ? { data, etag: cleanText(data.__testEtag, 'test-etag') } : null;
}

async function conditionalWrite(store, key, value, options = {}) {
  if (typeof store.set === 'function') {
    return store.set(key, JSON.stringify(value), options);
  }

  const existing = await store.get(key, { type: 'json' });

  if (options.onlyIfNew && existing) return { modified: false };
  if (options.onlyIfMatch && (!existing || cleanText(existing.__testEtag, 'test-etag') !== options.onlyIfMatch)) {
    return { modified: false };
  }

  await store.setJSON(key, value, options);
  return { etag: 'test-etag', modified: true };
}

function seriesIdFor(account, idempotencyKey) {
  const owner = actorId(account);
  return `series_${digest({ idempotencyKey, owner }, 24)}`;
}

function previewFingerprint(value) {
  return `preview_${digest(value, 48)}`;
}

function normalizeCreatePayload(payload = {}, account = null) {
  const idempotencyKey = cleanText(payload.idempotencyKey).slice(0, 200);

  if (!idempotencyKey) {
    throw new Error('A stable idempotency key is required before previewing a tournament series.');
  }

  const seriesId = seriesIdFor(account, idempotencyKey);
  const generated = generateTournamentOccurrences({
    baseSlug: payload.tournament?.slug,
    baseTournament: payload.tournament,
    idSuffix: seriesId,
    localTime: payload.localTime,
    recurrence: payload.recurrence,
    startLocalDate: payload.startLocalDate,
    timeZone: payload.timeZone,
  });
  const tournaments = generated.occurrences.map((occurrence) => {
    const normalized = normalizeHostedTournament({
      ...payload.tournament,
      date: occurrence.date,
      gameSlug: payload.tournament?.gameSlug || 'spades',
      publicDiscovery: payload.tournament?.gameSlug === 'euchre' ? false : payload.tournament?.publicDiscovery,
      slug: occurrence.slug,
      status: 'upcoming',
      visibility: payload.tournament?.gameSlug === 'euchre' ? 'unlisted' : payload.tournament?.visibility,
    });

    if (normalized.error) throw new Error(normalized.error);

    return {
      ...normalized,
      recurrence: {
        cancelledAt: null,
        individuallyEditedAt: null,
        localDate: occurrence.localDate,
        localTime: occurrence.localTime,
        managed: true,
      },
      seriesId,
      seriesIndex: occurrence.index,
      seriesLocalDate: occurrence.localDate,
      seriesPending: true,
      seriesRevision: 1,
    };
  });
  const contract = {
    generated,
    owner: actorId(account),
    seriesId,
    tournaments: tournaments.map((tournament) => ({
      date: tournament.date,
      gameSlug: tournament.gameSlug,
      seriesIndex: tournament.seriesIndex,
      seriesLocalDate: tournament.seriesLocalDate,
      slug: tournament.slug,
      title: tournament.title,
    })),
  };

  return {
    contract,
    fingerprint: previewFingerprint(contract),
    generated,
    idempotencyKeyHash: digest(idempotencyKey),
    seriesId,
    tournaments,
  };
}

export function previewTournamentSeries(payload = {}, account = null) {
  const preview = normalizeCreatePayload(payload, account);

  return {
    fingerprint: preview.fingerprint,
    occurrenceCount: preview.tournaments.length,
    occurrences: preview.tournaments.map((tournament) => ({
      date: tournament.date,
      gameSlug: tournament.gameSlug,
      index: tournament.seriesIndex,
      localDate: tournament.seriesLocalDate,
      localTime: tournament.recurrence.localTime,
      slug: tournament.slug,
      timeZone: preview.generated.timeZone,
      title: tournament.title,
    })),
    recurrence: preview.generated.recurrence,
    seriesId: preview.seriesId,
  };
}

export async function createTournamentSeries(payload = {}, account = null, options = {}) {
  const preview = normalizeCreatePayload(payload, account);

  if (cleanText(payload.previewFingerprint) !== preview.fingerprint) {
    return { code: 'preview_required', conflict: true, error: 'Preview this exact tournament series before creating it.' };
  }

  const { eventStore, seriesStore } = getStores(options);
  const now = new Date(options.now || Date.now()).toISOString();
  const key = seriesKey(preview.seriesId);
  const initialManifest = {
    audit: [{ action: 'create-requested', at: now, by: actorId(account), revision: 1 }],
    createdAt: now,
    createdBy: actorId(account),
    fingerprint: preview.fingerprint,
    id: preview.seriesId,
    idempotencyKeyHash: preview.idempotencyKeyHash,
    occurrences: preview.tournaments.map((tournament) => ({
      date: tournament.date,
      index: tournament.seriesIndex,
      localDate: tournament.seriesLocalDate,
      slug: tournament.slug,
    })),
    recurrence: preview.generated.recurrence,
    revision: 1,
    status: 'creating',
    template: {
      gameSlug: preview.tournaments[0].gameSlug,
      title: preview.tournaments[0].title,
    },
    timeZone: preview.generated.timeZone,
    updatedAt: now,
  };
  const created = await conditionalWrite(seriesStore, key, initialManifest, {
    metadata: { seriesId: preview.seriesId, status: 'creating' },
    onlyIfNew: true,
  });
  let persisted = await readWithEtag(seriesStore, key);

  if (!created.modified && persisted?.data?.fingerprint !== preview.fingerprint) {
    return { code: 'idempotency_conflict', conflict: true, error: 'That idempotency key is already assigned to a different series.' };
  }

  if (persisted?.data?.status === 'complete') {
    return {
      created: Boolean(created.modified),
      idempotent: !created.modified,
      series: persisted.data,
      tournaments: preview.tournaments,
    };
  }

  for (const tournament of preview.tournaments) {
    const result = await conditionalWrite(eventStore, eventKey(tournament.slug), tournament, {
      metadata: {
        date: tournament.date,
        gameSlug: tournament.gameSlug,
        seriesId: preview.seriesId,
        seriesLocalDate: tournament.seriesLocalDate,
        status: tournament.status,
        tournamentSlug: tournament.slug,
      },
      onlyIfNew: true,
    });

    if (!result.modified) {
      const existing = await loadHostedTournamentRecord(tournament.slug, { store: eventStore });

      if (existing?.seriesId !== preview.seriesId || existing?.seriesLocalDate !== tournament.seriesLocalDate) {
        throw new Error(`Tournament occurrence ${tournament.slug} conflicts with an existing event.`);
      }
    }
  }

  persisted = await readWithEtag(seriesStore, key);
  const completedAt = new Date(options.now || Date.now()).toISOString();
  const completeManifest = {
    ...persisted.data,
    audit: [
      ...(persisted.data.audit || []),
      { action: 'created', at: completedAt, by: actorId(account), revision: 1 },
    ],
    completedAt,
    status: 'complete',
    updatedAt: completedAt,
  };
  const completed = await conditionalWrite(seriesStore, key, completeManifest, {
    metadata: { seriesId: preview.seriesId, status: 'complete' },
    onlyIfMatch: persisted.etag,
  });

  if (!completed.modified) {
    const concurrent = await readWithEtag(seriesStore, key);
    if (concurrent?.data?.status !== 'complete') {
      throw new Error('Tournament series creation was changed by another host. Retry safely with the same request.');
    }
    return { created: false, idempotent: true, series: concurrent.data, tournaments: preview.tournaments };
  }

  return {
    created: Boolean(created.modified),
    idempotent: !created.modified,
    series: completeManifest,
    tournaments: preview.tournaments,
  };
}

export async function loadTournamentSeries(seriesId, options = {}) {
  const { eventStore, seriesStore } = getStores(options);
  const series = await seriesStore.get(seriesKey(seriesId), { type: 'json' });

  if (!series) return null;

  const occurrences = await Promise.all(
    (series.occurrences || []).map((occurrence) => eventStore.get(eventKey(occurrence.slug), { type: 'json' })),
  );

  return { ...series, occurrenceRecords: occurrences.filter(Boolean) };
}

async function occurrenceLock(record, stores, now) {
  if (!record) return 'missing';
  if (record.cancelledAt || record.recurrence?.cancelledAt) return 'already-cancelled';
  if (recurrenceOccurrenceIsIndividuallyManaged(record)) return 'individually-edited';
  if (new Date(record.date).getTime() <= now.getTime()) return 'started';

  const [signupList, bracket] = await Promise.all([
    stores.signupStore.list({ prefix: `${record.slug}/` }),
    stores.bracketStore.get(eventKey(record.slug), { type: 'json' }),
  ]);

  if ((signupList?.blobs || []).length > 0) return 'registered';
  if (bracket) return 'bracketed';
  return '';
}

function operationContract({ action, eligible, expectedRevision, patch, seriesId, skipped }) {
  return {
    action,
    eligible: eligible.map((item) => ({ after: item.after, localDate: item.localDate, slug: item.slug })),
    expectedRevision,
    patch,
    seriesId,
    skipped,
  };
}

export async function previewTournamentSeriesOperation(payload = {}, account = null, options = {}) {
  const stores = getStores(options);
  const series = await loadTournamentSeries(payload.seriesId, stores);

  if (!series) return { code: 'not_found', error: 'That tournament series was not found.', notFound: true };

  const action = cleanText(payload.operation || payload.action);
  if (!['cancel-future', 'cancel-occurrence', 'update-future'].includes(action)) {
    return { code: 'invalid_operation', error: 'Choose edit future, cancel occurrence, or cancel future.' };
  }

  const expectedRevision = Number.parseInt(payload.expectedRevision ?? series.revision, 10);
  if (expectedRevision !== series.revision) {
    return { code: 'revision_conflict', conflict: true, error: 'This series changed after it was loaded. Refresh before continuing.' };
  }

  const fromLocalDate = cleanText(payload.fromLocalDate);
  const targetLocalDate = cleanText(payload.localDate || fromLocalDate);
  const now = new Date(options.now || Date.now());
  const patch = action === 'update-future' ? {
    detail: payload.patch?.detail,
    localTime: cleanText(payload.patch?.localTime),
    registrationStatus: cleanText(payload.patch?.registrationStatus),
    summary: payload.patch?.summary,
    timeZone: cleanText(payload.patch?.timeZone),
    timeZoneLabel: cleanText(payload.patch?.timeZoneLabel),
    title: cleanText(payload.patch?.title),
  } : {};
  const eligible = [];
  const skipped = [];

  for (const record of series.occurrenceRecords || []) {
    const localDate = cleanText(record.seriesLocalDate || record.recurrence?.localDate);
    const inScope = action === 'cancel-occurrence'
      ? localDate === targetLocalDate
      : !fromLocalDate || localDate >= fromLocalDate;

    if (!inScope) continue;

    const reason = await occurrenceLock(record, stores, now);
    if (reason) {
      skipped.push({ localDate, reason, slug: record.slug });
      continue;
    }

    let after;
    if (action === 'update-future') {
      const localTime = patch.localTime || record.recurrence?.localTime;
      const timeZone = patch.timeZone || record.timeZone || series.timeZone;
      const date = resolveZonedLocalDateTime(localDate, localTime, timeZone);
      after = {
        date,
        detail: patch.detail ?? record.detail,
        localTime,
        registrationStatus: patch.registrationStatus || record.registrationStatus,
        summary: patch.summary ?? record.summary,
        timeZone,
        timeZoneLabel: patch.timeZoneLabel || record.timeZoneLabel,
        title: patch.title || record.title,
      };
    } else {
      after = { cancelled: true, registrationStatus: 'closed', status: 'cancelled' };
    }

    eligible.push({ after, localDate, record, slug: record.slug });
  }

  const contract = operationContract({ action, eligible, expectedRevision, patch, seriesId: series.id, skipped });

  return {
    action,
    eligible: eligible.map(({ after, localDate, slug }) => ({ after, localDate, slug })),
    expectedRevision,
    fingerprint: previewFingerprint(contract),
    seriesId: series.id,
    skipped,
  };
}

export async function applyTournamentSeriesOperation(payload = {}, account = null, options = {}) {
  const stores = getStores(options);
  const requestedSeriesId = cleanText(payload.seriesId);
  const suppliedFingerprint = cleanText(payload.previewFingerprint);
  const key = seriesKey(requestedSeriesId);
  let loaded = await readWithEtag(stores.seriesStore, key);

  if (!loaded) return { code: 'not_found', error: 'That tournament series was not found.', notFound: true };

  const priorAudit = [...(loaded.data.audit || [])].reverse().find((entry) => entry.fingerprint === suppliedFingerprint);
  if (
    loaded.data.status === 'complete'
    && priorAudit
    && Number.parseInt(payload.expectedRevision, 10) === priorAudit.previousRevision
  ) {
    return {
      applied: priorAudit.applied || [],
      idempotent: true,
      revision: priorAudit.revision,
      series: loaded.data,
      skipped: priorAudit.skipped || [],
    };
  }

  const pending = loaded.data.pendingOperation;
  const resuming = ['updating', 'cancelling'].includes(loaded.data.status)
    && pending?.fingerprint === suppliedFingerprint
    && pending?.expectedRevision === Number.parseInt(payload.expectedRevision, 10);
  let preview;

  if (resuming) {
    preview = {
      action: pending.action,
      eligible: pending.eligible || [],
      expectedRevision: pending.expectedRevision,
      fingerprint: pending.fingerprint,
      seriesId: loaded.data.id,
      skipped: pending.skipped || [],
    };
  } else {
    preview = await previewTournamentSeriesOperation(payload, account, options);
    if (preview.error) return preview;
    if (suppliedFingerprint !== preview.fingerprint) {
      return { code: 'preview_required', conflict: true, error: 'Preview these exact changes before applying them.' };
    }
  }

  const now = new Date(options.now || Date.now()).toISOString();
  const nextRevision = resuming ? loaded.data.revision : loaded.data.revision + 1;

  if (!resuming) {
    const operation = {
      action: preview.action,
      by: actorId(account),
      eligible: preview.eligible,
      expectedRevision: preview.expectedRevision,
      fingerprint: preview.fingerprint,
      skipped: preview.skipped,
      startedAt: now,
    };
    const pendingManifest = {
      ...loaded.data,
      pendingOperation: operation,
      revision: nextRevision,
      status: preview.action.startsWith('cancel') ? 'cancelling' : 'updating',
      updatedAt: now,
    };
    const claimed = await conditionalWrite(stores.seriesStore, key, pendingManifest, {
      metadata: { seriesId: preview.seriesId, status: pendingManifest.status },
      onlyIfMatch: loaded.etag,
    });

    if (!claimed.modified) {
      return { code: 'revision_conflict', conflict: true, error: 'Another host changed this series. Refresh before continuing.' };
    }

    loaded = await readWithEtag(stores.seriesStore, key);
  }

  const applied = [];
  const skipped = [...preview.skipped];
  for (const change of preview.eligible) {
    const currentEvent = await readWithEtag(stores.eventStore, eventKey(change.slug));
    const existing = currentEvent?.data;

    if (existing?.seriesRevision === nextRevision) {
      applied.push(change.slug);
      continue;
    }

    const lockReason = await occurrenceLock(existing, stores, new Date(options.now || Date.now()));
    if (lockReason) {
      skipped.push({ localDate: change.localDate, reason: lockReason, slug: change.slug });
      continue;
    }

    const cancelled = preview.action.startsWith('cancel');
    const next = {
      ...existing,
      ...change.after,
      cancelledAt: cancelled ? now : existing.cancelledAt,
      cancelledBy: cancelled ? actorId(account) : existing.cancelledBy,
      recurrence: {
        ...(existing.recurrence || {}),
        cancelledAt: cancelled ? now : existing.recurrence?.cancelledAt,
        cancelledBy: cancelled ? actorId(account) : existing.recurrence?.cancelledBy,
        localTime: change.after.localTime || existing.recurrence?.localTime,
      },
      seriesRevision: nextRevision,
      updatedAt: now,
    };
    const saved = await conditionalWrite(stores.eventStore, eventKey(change.slug), next, {
      metadata: {
        date: next.date,
        gameSlug: next.gameSlug,
        seriesId: next.seriesId,
        seriesLocalDate: next.seriesLocalDate,
        status: next.status,
        tournamentSlug: next.slug,
      },
      onlyIfMatch: currentEvent.etag,
    });

    if (!saved.modified) {
      const concurrent = await loadHostedTournamentRecord(change.slug, { store: stores.eventStore });
      if (concurrent?.seriesRevision === nextRevision) {
        applied.push(change.slug);
      } else {
        skipped.push({ localDate: change.localDate, reason: 'concurrent-change', slug: change.slug });
      }
      continue;
    }

    applied.push(change.slug);
  }

  const current = await readWithEtag(stores.seriesStore, key);
  const completeManifest = {
    ...current.data,
    audit: [
      ...(current.data.audit || []),
      {
        action: preview.action,
        applied,
        at: now,
        by: actorId(account),
        fingerprint: preview.fingerprint,
        previousRevision: preview.expectedRevision,
        revision: nextRevision,
        skipped,
      },
    ].slice(-100),
    pendingOperation: null,
    status: 'complete',
    updatedAt: now,
  };
  const completed = await conditionalWrite(stores.seriesStore, key, completeManifest, {
    metadata: { seriesId: preview.seriesId, status: 'complete' },
    onlyIfMatch: current.etag,
  });

  if (!completed.modified) {
    const concurrent = await readWithEtag(stores.seriesStore, key);
    const matchingAudit = [...(concurrent?.data?.audit || [])].reverse().find((entry) => entry.fingerprint === preview.fingerprint);
    if (!matchingAudit || concurrent?.data?.status !== 'complete') {
      throw new Error('Series occurrences were updated, but the audit manifest needs a safe retry.');
    }
    return {
      applied: matchingAudit.applied || [],
      idempotent: true,
      revision: matchingAudit.revision,
      series: concurrent.data,
      skipped: matchingAudit.skipped || [],
    };
  }

  return {
    applied,
    idempotent: resuming,
    revision: nextRevision,
    series: completeManifest,
    skipped,
  };
}
