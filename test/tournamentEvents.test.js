import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deleteHostedTournament,
  isHostedTournamentDeleted,
  normalizeHostedTournament,
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

  async setJSON(key, value) {
    this.records.set(key, structuredClone(value));
  }
}

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
