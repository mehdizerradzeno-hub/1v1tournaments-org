import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeHostedTournament } from '../netlify/functions/_tournament-events-utils.mjs';

const baseEvent = {
  title: 'Hosted tournament',
  slug: 'hosted-tournament',
  date: '2026-08-08T20:30:00.000Z',
};

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
