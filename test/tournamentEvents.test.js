import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createHostedTournament,
  deleteHostedTournament,
  isHostedTournamentDeleted,
  listHostedTournaments,
  listPublicHostedTournaments,
  normalizeHostedTournament,
  saveHostedTournament,
} from '../netlify/functions/_tournament-events-utils.mjs';

const baseEvent = {
  title: 'Hosted tournament',
  slug: 'hosted-tournament',
  date: '2026-08-08T20:30:00.000Z',
};

class MemoryStore {
  constructor(records = {}) {
    this.records = new Map(Object.entries(records));
  }

  async get(key) {
    return this.records.get(key) || null;
  }

  async list() {
    return { blobs: [...this.records.keys()].map((key) => ({ key })) };
  }

  async set(key, value, options = {}) {
    if (options.onlyIfNew && this.records.has(key)) return { modified: false };
    this.records.set(key, JSON.parse(value));
    return { modified: true };
  }

  async setJSON(key, value) {
    this.records.set(key, structuredClone(value));
  }
}

test('public event listing excludes private recurrence records without hiding public history', async () => {
  const store = new MemoryStore({
    'legacy-public.json': { ...baseEvent, slug: 'legacy-public', status: 'upcoming' },
    'completed-public.json': { ...baseEvent, slug: 'completed-public', status: 'complete' },
    'private-event.json': { ...baseEvent, slug: 'private-event', status: 'upcoming', visibility: 'private' },
    'unlisted-event.json': { ...baseEvent, slug: 'unlisted-event', status: 'upcoming', visibility: 'unlisted' },
    'opted-out.json': { ...baseEvent, slug: 'opted-out', status: 'upcoming', publicDiscovery: false },
  });
  const tournaments = await listPublicHostedTournaments({
    bracketStore: new MemoryStore(),
    seriesStore: new MemoryStore(),
    store,
  });

  assert.deepEqual(
    tournaments.map((tournament) => tournament.slug),
    ['legacy-public', 'completed-public'],
  );
});

test('hosted event listing reads every Blob page with bounded record concurrency', async () => {
  const records = Object.fromEntries(Array.from({ length: 35 }, (_, index) => {
    const slug = `euchre-event-${index}`;
    return [`${slug}.json`, { ...baseEvent, slug, gameSlug: 'euchre', status: 'upcoming' }];
  }));
  const store = new MemoryStore(records);
  const keys = [...store.records.keys()];
  let activeReads = 0;
  let peakReads = 0;
  store.list = ({ paginate }) => {
    assert.equal(paginate, true);
    return (async function* listPages() {
      yield { blobs: keys.slice(0, 20).map((key) => ({ key })) };
      yield { blobs: keys.slice(20).map((key) => ({ key })) };
    })();
  };
  store.get = async (key) => {
    activeReads += 1;
    peakReads = Math.max(peakReads, activeReads);
    await new Promise((resolve) => setImmediate(resolve));
    activeReads -= 1;
    return store.records.get(key) || null;
  };

  const tournaments = await listHostedTournaments({
    bracketStore: new MemoryStore(),
    seriesStore: new MemoryStore(),
    store,
  });

  assert.equal(tournaments.length, 35);
  assert.ok(peakReads <= 16);
});

test('hosted tournament event normalization defaults legacy records to Spades', () => {
  assert.equal(normalizeHostedTournament(baseEvent).gameSlug, 'spades');
});

test('hosted tournament event normalization persists canonical Spades and Euchre games', () => {
  assert.equal(normalizeHostedTournament({ ...baseEvent, gameSlug: 'spades' }).gameSlug, 'spades');
  assert.equal(normalizeHostedTournament({ ...baseEvent, gameSlug: 'euchre' }).gameSlug, 'euchre');
});

test('hosted tournament event normalization rejects unsupported game values', () => {
  assert.deepEqual(normalizeHostedTournament({ ...baseEvent, gameSlug: 'hearts' }), {
    error: 'Tournament game must be spades or euchre.',
  });
});

test('new hosted events use an atomic create and cannot replace an existing slug', async () => {
  const store = new MemoryStore();
  const original = { ...baseEvent, gameSlug: 'euchre', title: 'Euchre tournament 1' };
  const replacement = { ...original, title: 'Different host event' };
  const [first, second] = await Promise.all([
    createHostedTournament(original, { email: 'first@example.com' }, { store }),
    createHostedTournament(replacement, { email: 'second@example.com' }, { store }),
  ]);

  assert.equal([first, second].filter((result) => result.created).length, 1);
  assert.equal([first, second].filter((result) => result.conflict).length, 1);
  assert.equal((await store.get('hosted-tournament.json')).title, 'Euchre tournament 1');

  const edited = await saveHostedTournament({
    ...(await store.get('hosted-tournament.json')),
    title: 'Intentional host edit',
  }, { email: 'first@example.com' }, { store });

  assert.equal(edited.title, 'Intentional host edit');
  assert.equal((await store.get('hosted-tournament.json')).title, 'Intentional host edit');
});

test('new hosted events cannot replace a seeded tournament record', async () => {
  const result = await createHostedTournament({
    ...baseEvent,
    slug: 'spades-summer-series',
  }, null, { store: new MemoryStore() });

  assert.equal(result.created, false);
  assert.equal(result.conflict, true);
  assert.equal(result.code, 'tournament_slug_conflict');
});

test('expired empty events are soft-deleted with an auditable tombstone', async () => {
  const store = new MemoryStore({
    'expired-test.json': {
      ...baseEvent,
      slug: 'expired-test',
      status: 'expired',
    },
  });
  const bracketStore = new MemoryStore();
  const result = await deleteHostedTournament('expired-test', {
    bracketStore,
    deletedBy: 'acct_host',
    now: new Date('2026-08-09T12:00:00.000Z'),
    store,
  });
  const tombstone = await store.get('expired-test.json');

  assert.equal(result.deleted, true);
  assert.equal(tombstone.deleted, true);
  assert.equal(tombstone.hideSeeded, true);
  assert.equal(tombstone.status, 'deleted');
  assert.equal(tombstone.registrationStatus, 'closed');
  assert.equal(tombstone.deletedAt, '2026-08-09T12:00:00.000Z');
  assert.equal(tombstone.deletedBy, 'acct_host');
  assert.equal(await isHostedTournamentDeleted('expired-test', { store }), true);
});

test('active matches block deletion and completed bracket results remain intact', async () => {
  const store = new MemoryStore({
    'active-event.json': { ...baseEvent, slug: 'active-event' },
    'complete-event.json': { ...baseEvent, slug: 'complete-event', status: 'complete' },
  });
  const activeBracket = {
    status: 'published',
    rounds: [{ matches: [{ status: 'ready', players: [{ id: 'north' }, { id: 'south' }] }] }],
  };
  const completeBracket = {
    status: 'complete',
    rounds: [{
      matches: [{
        status: 'final',
        players: [{ id: 'north' }, { id: 'south' }],
        winnerId: 'south',
        completion: { completionId: 'completion-1' },
      }],
    }],
  };
  const bracketStore = new MemoryStore({
    'active-event.json': activeBracket,
    'complete-event.json': completeBracket,
  });

  const blocked = await deleteHostedTournament('active-event', { bracketStore, store });
  assert.equal(blocked.blocked, true);
  assert.equal((await store.get('active-event.json')).deleted, undefined);

  const deleted = await deleteHostedTournament('complete-event', { bracketStore, store });
  assert.equal(deleted.deleted, true);
  assert.deepEqual(await bracketStore.get('complete-event.json'), completeBracket);
});
