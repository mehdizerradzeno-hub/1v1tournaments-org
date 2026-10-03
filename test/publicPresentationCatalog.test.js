import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterPublicEventsByGame,
  getAwaitingStartPublicEvent,
  getCountdownParts,
  getPublicEventAction,
  getNextEligiblePublicEvent,
  getPublicGames,
  getPublicPresentationEvents,
  normalizePublicGameSlug,
} from '../src/lib/publicPresentationCatalog.js';

test('public presentation exposes four games and maps only explicit aliases', () => {
  assert.deepEqual(getPublicGames().map((game) => game.slug), ['spades', 'euchre', 'gin-rummy', 'cribbage']);
  assert.equal(normalizePublicGameSlug('gin'), 'gin-rummy');
  assert.equal(normalizePublicGameSlug('ginrummy'), 'gin-rummy');
  assert.equal(normalizePublicGameSlug('cribbage-1v1'), 'cribbage');
  assert.equal(normalizePublicGameSlug('hearts'), null);
  assert.equal(normalizePublicGameSlug(''), null);
});

test('public event actions preserve a full or unknown lane as view-only', () => {
  const spades = getPublicGames().find((game) => game.slug === 'spades');
  const gin = getPublicGames().find((game) => game.slug === 'gin-rummy');

  assert.deepEqual(
    getPublicEventAction({ slug: 'open-spades', registrationStatus: 'open', registeredCount: 4, rosterCap: 8 }, spades),
    { href: '/check-in/open-spades', label: 'Register', variant: 'primary' },
  );
  assert.deepEqual(
    getPublicEventAction({ slug: 'full-spades', registrationStatus: 'open', registeredCount: 8, rosterCap: 8 }, spades),
    { href: '/tournaments/full-spades', label: 'View event', variant: 'secondary' },
  );
  assert.deepEqual(
    getPublicEventAction({ slug: 'gin-event', registrationStatus: 'open' }, gin),
    { href: '/tournaments/gin-event', label: 'View event', variant: 'secondary' },
  );
});

test('public adapter rejects unknown publication and preserves authoritative capacity', () => {
  const events = getPublicPresentationEvents([], [
    { slug: 'published-large', gameSlug: 'spades', title: 'Large public event', status: 'upcoming', visibility: 'public', date: '2027-01-01T20:00:00.000Z', rosterCap: 512 },
    { slug: 'unknown-publication', gameSlug: 'spades', title: 'Unknown publication', status: 'upcoming', date: '2027-01-02T20:00:00.000Z' },
    { slug: 'unknown-game', gameSlug: 'hearts', title: 'Unknown game', status: 'upcoming', visibility: 'public', date: '2027-01-03T20:00:00.000Z' },
    { slug: 'draft-event', gameSlug: 'spades', title: 'Draft', status: 'draft', visibility: 'public', date: '2027-01-04T20:00:00.000Z' },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].gameSlug, 'spades');
  assert.equal(events[0].rosterCap, 512);
});

test('public selection, countdown, invalid dates, and tied events stay deterministic', () => {
  const events = getPublicPresentationEvents([], [
    { slug: 'zeta', gameSlug: 'cribbage', title: 'Zeta', status: 'upcoming', visibility: 'public', date: '2027-01-02T00:00:00.000Z' },
    { slug: 'alpha', gameSlug: 'gin-rummy', title: 'Alpha', status: 'upcoming', visibility: 'public', date: '2027-01-02T00:00:00.000Z' },
    { slug: 'bad-date', gameSlug: 'spades', title: 'Bad date', status: 'upcoming', visibility: 'public', date: 'nope' },
  ]);

  assert.deepEqual(events.map((event) => event.slug), ['alpha', 'zeta']);
  assert.equal(getNextEligiblePublicEvent(events, Date.parse('2027-01-01T00:00:00.000Z')).slug, 'alpha');
  assert.deepEqual(filterPublicEventsByGame(events, 'gin-rummy').map((event) => event.slug), ['alpha']);
  assert.deepEqual(getCountdownParts('2027-01-01T00:00:00.000Z', Date.parse('2027-01-02T00:00:00.000Z')).map((part) => part.value), ['0', '00', '00', '00']);
  assert.deepEqual(getCountdownParts('bad-date').map((part) => part.value), ['--', '--', '--', '--']);
});

test('only a recent scheduled event can await confirmation after its deadline', () => {
  const nowMs = Date.parse('2027-01-01T12:00:00.000Z');
  const events = getPublicPresentationEvents([], [
    { slug: 'just-started', gameSlug: 'spades', title: 'Just started', status: 'scheduled', visibility: 'public', date: '2027-01-01T11:59:30.000Z' },
    { slug: 'old-event', gameSlug: 'spades', title: 'Old event', status: 'upcoming', visibility: 'public', date: '2026-12-20T11:59:30.000Z' },
    { slug: 'live-event', gameSlug: 'spades', title: 'Live event', status: 'live', visibility: 'public', date: '2027-01-01T11:59:45.000Z' },
  ]);

  assert.equal(getAwaitingStartPublicEvent(events, nowMs)?.slug, 'just-started');
  assert.equal(getAwaitingStartPublicEvent(events, nowMs + (3 * 60 * 60 * 1000)), null);
});
