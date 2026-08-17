import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateTournamentOccurrences,
  normalizeTournamentRecurrence,
  resolveZonedLocalDateTime,
} from '../src/lib/tournamentRecurrence.js';
import {
  applyTournamentSeriesOperation,
  createTournamentSeries,
  previewTournamentSeries,
  previewTournamentSeriesOperation,
} from '../netlify/functions/_tournament-series-utils.mjs';
import { listHostedTournaments, saveHostedTournament } from '../netlify/functions/_tournament-events-utils.mjs';
import { handler as tournamentSeriesHandler } from '../netlify/functions/tournament-series.mjs';

class MemoryStore {
  constructor(records = {}, { failWritesAfter = Infinity } = {}) {
    this.records = new Map(Object.entries(records));
    this.etags = new Map([...this.records.keys()].map((key) => [key, 'etag-1']));
    this.failWritesAfter = failWritesAfter;
    this.writes = 0;
  }

  async get(key) { return structuredClone(this.records.get(key) || null); }
  async getWithMetadata(key) {
    const data = await this.get(key);
    return data ? { data, etag: this.etags.get(key) } : null;
  }
  async list({ prefix = '' } = {}) {
    return { blobs: [...this.records.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
  }
  async set(key, text, options = {}) {
    if (this.writes >= this.failWritesAfter) throw new Error('simulated interruption');
    const exists = this.records.has(key);
    if (options.onlyIfNew && exists) return { modified: false };
    if (options.onlyIfMatch && this.etags.get(key) !== options.onlyIfMatch) return { modified: false };
    this.writes += 1;
    const nextEtag = `etag-${this.writes + 1}`;
    this.records.set(key, JSON.parse(text));
    this.etags.set(key, nextEtag);
    return { etag: nextEtag, modified: true };
  }
  async setJSON(key, value) {
    this.writes += 1;
    this.records.set(key, structuredClone(value));
    this.etags.set(key, `etag-${this.writes + 1}`);
  }
}

const account = { id: 'acct_host' };
const basePayload = {
  idempotencyKey: 'stable-request-1',
  localTime: '18:00',
  recurrence: { count: 4, frequency: 'weekly', limitMode: 'count', weekdays: [0] },
  startLocalDate: '2026-03-01',
  timeZone: 'America/New_York',
  tournament: {
    date: '2026-03-01T23:00:00.000Z',
    gameSlug: 'spades',
    registrationStatus: 'open',
    rosterCap: 8,
    slug: 'sunday-cup',
    status: 'upcoming',
    title: 'Sunday Cup',
  },
};

function stores(options = {}) {
  return {
    bracketStore: options.bracketStore || new MemoryStore(),
    eventStore: options.eventStore || new MemoryStore(),
    seriesStore: options.seriesStore || new MemoryStore(),
    signupStore: options.signupStore || new MemoryStore(),
  };
}

test('one-time remains the default and finite bounds are enforced', () => {
  assert.equal(normalizeTournamentRecurrence({}).frequency, 'none');
  assert.throws(() => normalizeTournamentRecurrence({ frequency: 'daily', count: 1 }), /2-52/);
  assert.throws(() => normalizeTournamentRecurrence({ frequency: 'daily', count: 53 }), /2-52/);
  assert.equal(normalizeTournamentRecurrence({ frequency: 'daily', count: 52 }).count, 52);
});

test('daily, weekly, multiple weekdays, and inclusive end date generate finite previews', () => {
  const daily = generateTournamentOccurrences({
    ...basePayload,
    baseSlug: basePayload.tournament.slug,
    baseTournament: basePayload.tournament,
    idSuffix: 'series-daily',
    recurrence: { count: 3, frequency: 'daily' },
  });
  assert.deepEqual(daily.occurrences.map((item) => item.localDate), ['2026-03-01', '2026-03-02', '2026-03-03']);

  const weekly = generateTournamentOccurrences({
    ...basePayload,
    baseSlug: basePayload.tournament.slug,
    baseTournament: basePayload.tournament,
    idSuffix: 'series-weekly',
    recurrence: { endLocalDate: '2026-03-08', frequency: 'weekly', limitMode: 'end-date', weekdays: [0, 3] },
  });
  assert.deepEqual(weekly.occurrences.map((item) => item.localDate), ['2026-03-01', '2026-03-04', '2026-03-08']);
});

test('local wall time is preserved across DST while nonexistent and ambiguous times are rejected', () => {
  const weekly = generateTournamentOccurrences({
    ...basePayload,
    baseSlug: basePayload.tournament.slug,
    baseTournament: basePayload.tournament,
    idSuffix: 'series-dst',
    recurrence: { count: 2, frequency: 'weekly', weekdays: [0] },
  });
  assert.deepEqual(weekly.occurrences.map((item) => item.date), ['2026-03-01T23:00:00.000Z', '2026-03-08T22:00:00.000Z']);
  assert.throws(() => resolveZonedLocalDateTime('2026-03-08', '02:30', 'America/New_York'), /does not exist/);
  assert.throws(() => resolveZonedLocalDateTime('2026-11-01', '01:30', 'America/New_York'), /ambiguous/);
});

test('preview and creation use the same plan and create independent empty tournaments', async () => {
  const memory = stores();
  const preview = previewTournamentSeries(basePayload, account);
  const result = await createTournamentSeries({ ...basePayload, previewFingerprint: preview.fingerprint }, account, memory);

  assert.equal(result.created, true);
  assert.equal(result.tournaments.length, 4);
  assert.deepEqual(result.tournaments.map((item) => item.slug), preview.occurrences.map((item) => item.slug));
  assert.equal(new Set(result.tournaments.map((item) => item.seriesLocalDate)).size, 4);
  assert.equal(result.tournaments.every((item) => !item.players && !item.signups && !item.result), true);
  assert.equal(memory.bracketStore.records.size, 0);
});

test('creation is retry-safe, concurrent-safe, and hidden until the manifest is complete', async () => {
  const eventStore = new MemoryStore();
  const seriesStore = new MemoryStore();
  const memory = stores({ eventStore, seriesStore });
  const preview = previewTournamentSeries(basePayload, account);
  const payload = { ...basePayload, previewFingerprint: preview.fingerprint };
  const [first, second] = await Promise.all([
    createTournamentSeries(payload, account, memory),
    createTournamentSeries(payload, account, memory),
  ]);

  assert.equal([first, second].filter((item) => item.created).length, 1);
  assert.equal(eventStore.records.size, 4);
  assert.equal((await listHostedTournaments({ ...memory, store: eventStore })).length, 4);

  const interruptedEventStore = new MemoryStore({}, { failWritesAfter: 2 });
  const interruptedSeriesStore = new MemoryStore();
  const interrupted = stores({ eventStore: interruptedEventStore, seriesStore: interruptedSeriesStore });
  await assert.rejects(() => createTournamentSeries(payload, account, interrupted), /simulated interruption/);
  assert.equal((await listHostedTournaments({ ...interrupted, store: interruptedEventStore })).length, 0);
  interruptedEventStore.failWritesAfter = Infinity;
  const resumed = await createTournamentSeries(payload, account, interrupted);
  assert.equal(resumed.created, false);
  assert.equal(resumed.idempotent, true);
  assert.equal((await listHostedTournaments({ ...interrupted, store: interruptedEventStore })).length, 4);
});

test('preview confirmation and idempotency key conflicts are enforced', async () => {
  const memory = stores();
  const preview = previewTournamentSeries(basePayload, account);
  const missingPreview = await createTournamentSeries(basePayload, account, memory);
  assert.equal(missingPreview.code, 'preview_required');
  await createTournamentSeries({ ...basePayload, previewFingerprint: preview.fingerprint }, account, memory);
  const changed = { ...basePayload, tournament: { ...basePayload.tournament, title: 'Changed title' } };
  const changedPreview = previewTournamentSeries(changed, account);
  const conflict = await createTournamentSeries({ ...changed, previewFingerprint: changedPreview.fingerprint }, account, memory);
  assert.equal(conflict.code, 'idempotency_conflict');
});

test('series endpoint requires configured host authorization', async () => {
  const previousToken = process.env.TOURNAMENT_ADMIN_TOKEN;
  process.env.TOURNAMENT_ADMIN_TOKEN = 'test-host-token';

  try {
    const response = await tournamentSeriesHandler({
      body: JSON.stringify({ action: 'preview-create' }),
      headers: {},
      httpMethod: 'POST',
    });
    assert.equal(response.statusCode, 401);
  } finally {
    if (previousToken === undefined) delete process.env.TOURNAMENT_ADMIN_TOKEN;
    else process.env.TOURNAMENT_ADMIN_TOKEN = previousToken;
  }
});

test('interrupted future edits remain hidden and resume exactly once after restart', async () => {
  const memory = stores();
  const createPreview = previewTournamentSeries(basePayload, account);
  const created = await createTournamentSeries({
    ...basePayload,
    previewFingerprint: createPreview.fingerprint,
  }, account, memory);
  const operationPayload = {
    expectedRevision: 1,
    fromLocalDate: created.tournaments[0].seriesLocalDate,
    operation: 'update-future',
    patch: { localTime: '19:00', title: 'Restart-safe title' },
    seriesId: created.series.id,
  };
  const operationPreview = await previewTournamentSeriesOperation(
    operationPayload,
    account,
    { ...memory, now: '2026-02-01T00:00:00.000Z' },
  );
  const applyPayload = { ...operationPayload, previewFingerprint: operationPreview.fingerprint };
  memory.eventStore.failWritesAfter = memory.eventStore.writes + 1;

  await assert.rejects(
    () => applyTournamentSeriesOperation(applyPayload, account, { ...memory, now: '2026-02-01T00:00:00.000Z' }),
    /simulated interruption/,
  );
  assert.equal((await listHostedTournaments({ ...memory, store: memory.eventStore })).length, 0);

  memory.eventStore.failWritesAfter = Infinity;
  const resumed = await applyTournamentSeriesOperation(
    applyPayload,
    account,
    { ...memory, now: '2026-02-01T00:00:00.000Z' },
  );
  assert.equal(resumed.idempotent, true);
  assert.equal(resumed.applied.length, 4);
  assert.equal((await listHostedTournaments({ ...memory, store: memory.eventStore })).length, 4);
  assert.equal(
    [...memory.eventStore.records.values()].every((event) => event.title === 'Restart-safe title'),
    true,
  );

  const duplicate = await applyTournamentSeriesOperation(
    applyPayload,
    account,
    { ...memory, now: '2026-02-01T00:00:00.000Z' },
  );
  assert.equal(duplicate.idempotent, true);
  assert.equal(duplicate.revision, 2);
});

test('individual edits are marked and future bulk changes skip locked or overridden events', async () => {
  const memory = stores();
  const preview = previewTournamentSeries(basePayload, account);
  const created = await createTournamentSeries({ ...basePayload, previewFingerprint: preview.fingerprint }, account, memory);
  const first = created.tournaments[0];
  await saveHostedTournament({ ...first, title: 'Individually edited' }, account, { store: memory.eventStore });
  memory.signupStore.records.set(`${created.tournaments[1].slug}/player.json`, { id: 'player' });

  const operation = await previewTournamentSeriesOperation({
    expectedRevision: 1,
    fromLocalDate: first.seriesLocalDate,
    operation: 'update-future',
    patch: { localTime: '19:00', title: 'Future title' },
    seriesId: created.series.id,
  }, account, { ...memory, now: '2026-02-01T00:00:00.000Z' });

  assert.equal(operation.eligible.length, 2);
  assert.deepEqual(operation.skipped.map((item) => item.reason).sort(), ['individually-edited', 'registered']);
  const applied = await applyTournamentSeriesOperation({
    expectedRevision: 1,
    fromLocalDate: first.seriesLocalDate,
    operation: 'update-future',
    patch: { localTime: '19:00', title: 'Future title' },
    previewFingerprint: operation.fingerprint,
    seriesId: created.series.id,
  }, account, { ...memory, now: '2026-02-01T00:00:00.000Z' });
  assert.equal(applied.applied.length, 2);
  assert.equal(applied.revision, 2);
});

test('occurrence and future cancellation are soft, audited, and revision protected', async () => {
  const memory = stores();
  const preview = previewTournamentSeries(basePayload, account);
  const created = await createTournamentSeries({ ...basePayload, previewFingerprint: preview.fingerprint }, account, memory);
  const target = created.tournaments[2];
  const operation = await previewTournamentSeriesOperation({
    expectedRevision: 1,
    localDate: target.seriesLocalDate,
    operation: 'cancel-occurrence',
    seriesId: created.series.id,
  }, account, { ...memory, now: '2026-02-01T00:00:00.000Z' });
  const applied = await applyTournamentSeriesOperation({
    expectedRevision: 1,
    localDate: target.seriesLocalDate,
    operation: 'cancel-occurrence',
    previewFingerprint: operation.fingerprint,
    seriesId: created.series.id,
  }, account, { ...memory, now: '2026-02-01T00:00:00.000Z' });

  assert.equal(applied.applied.length, 1);
  assert.equal((await memory.eventStore.get(`${target.slug}.json`)).status, 'cancelled');
  const stale = await previewTournamentSeriesOperation({
    expectedRevision: 1,
    fromLocalDate: target.seriesLocalDate,
    operation: 'cancel-future',
    seriesId: created.series.id,
  }, account, memory);
  assert.equal(stale.code, 'revision_conflict');
});

test('explicitly recurring Euchre occurrences remain unlisted while legacy events stay Spades', async () => {
  const euchre = {
    ...basePayload,
    idempotencyKey: 'euchre-series',
    tournament: { ...basePayload.tournament, gameSlug: 'euchre' },
  };
  const preview = previewTournamentSeries(euchre, account);
  const memory = stores();
  const result = await createTournamentSeries({ ...euchre, previewFingerprint: preview.fingerprint }, account, memory);
  assert.equal(result.tournaments.every((item) => item.gameSlug === 'euchre' && item.visibility === 'unlisted' && item.publicDiscovery === false), true);
  assert.equal(normalizeTournamentRecurrence({}).frequency, 'none');
});
