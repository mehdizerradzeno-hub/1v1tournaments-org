import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveTournamentLifecycle } from '../src/lib/tournamentLifecycle.js';

const now = new Date('2026-07-16T12:00:00.000Z');

function event(overrides = {}) {
  return {
    slug: 'friday-cup',
    title: 'Friday Cup',
    status: 'upcoming',
    registrationStatus: 'open',
    date: '2026-07-17T00:00:00.000Z',
    ...overrides,
  };
}

test('future tournaments remain upcoming and keep host registration state', () => {
  const result = deriveTournamentLifecycle(event(), null, now);

  assert.equal(result.status, 'upcoming');
  assert.equal(result.registrationStatus, 'open');
  assert.equal(result.lifecycle.reason, 'scheduled');
});

test('elapsed tournaments without a bracket expire and close registration', () => {
  const result = deriveTournamentLifecycle(event({ date: '2026-07-14T00:00:00.000Z' }), null, now);

  assert.equal(result.status, 'expired');
  assert.equal(result.registrationStatus, 'closed');
  assert.equal(result.lifecycle.reason, 'event-started');
});

test('published brackets make a tournament live even after its scheduled time', () => {
  const result = deriveTournamentLifecycle(
    event({ date: '2026-07-14T00:00:00.000Z' }),
    { status: 'published' },
    now,
  );

  assert.equal(result.status, 'live');
  assert.equal(result.registrationStatus, 'closed');
});

test('completed brackets close and complete the tournament', () => {
  const result = deriveTournamentLifecycle(event(), { status: 'complete' }, now);

  assert.equal(result.status, 'complete');
  assert.equal(result.registrationStatus, 'closed');
  assert.equal(result.lifecycle.reason, 'bracket-complete');
});

test('host archives and deletion tombstones remain authoritative', () => {
  assert.equal(deriveTournamentLifecycle(event({ status: 'archived' }), null, now).status, 'archived');
  assert.equal(deriveTournamentLifecycle(event({ deleted: true }), null, now).status, 'deleted');
});
