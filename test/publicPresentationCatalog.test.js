import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterPublicEventsByGame,
  getAwaitingStartPublicEvent,
  getCountdownParts,
  getPublicEventAction,
  getLivePublicEvent,
  getNextEligiblePublicEvent,
  getPublicGames,
  getPublicPresentationEvents,
  normalizePublicGameSlug,
} from '../src/lib/publicPresentationCatalog.js';

test('public presentation exposes four games and maps only explicit aliases', () => {
  const games = getPublicGames();

  assert.deepEqual(games.map((game) => game.slug), ['spades', 'euchre', 'gin-rummy', 'cribbage']);
  assert.equal(games.find((game) => game.slug === 'spades')?.playPath, 'https://1v1spades.com');
  assert.equal(games.find((game) => game.slug === 'euchre')?.playPath, 'https://1v1euchre.com');
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

test('public adapter keeps legacy public records while rejecting private and invalid records', () => {
  const events = getPublicPresentationEvents([], [
    { slug: 'published-large', gameSlug: 'spades', title: 'Large public event', status: 'upcoming', visibility: 'public', date: '2027-01-01T20:00:00.000Z', rosterCap: 512 },
    { slug: 'legacy-public', gameSlug: 'spades', title: 'Legacy public event', status: 'upcoming', date: '2027-01-02T20:00:00.000Z' },
    { slug: 'unknown-game', gameSlug: 'hearts', title: 'Unknown game', status: 'upcoming', visibility: 'public', date: '2027-01-03T20:00:00.000Z' },
    { slug: 'draft-event', gameSlug: 'spades', title: 'Draft', status: 'draft', visibility: 'public', date: '2027-01-04T20:00:00.000Z' },
    { slug: 'private-event', gameSlug: 'spades', title: 'Private', status: 'upcoming', visibility: 'private', date: '2027-01-05T20:00:00.000Z' },
    { slug: 'unlisted-event', gameSlug: 'spades', title: 'Unlisted', status: 'upcoming', visibility: 'unlisted', date: '2027-01-06T20:00:00.000Z' },
    { slug: 'opted-out-event', gameSlug: 'spades', title: 'Opted out', status: 'upcoming', visibility: 'public', publicDiscovery: false, date: '2027-01-07T20:00:00.000Z' },
  ]);

  assert.deepEqual(events.map((event) => event.slug), ['published-large', 'legacy-public']);
  assert.equal(events[0].gameSlug, 'spades');
  assert.equal(events[0].rosterCap, 512);

  const overrides = getPublicPresentationEvents(
    [{ slug: 'same-event', gameSlug: 'spades', title: 'Seeded', status: 'upcoming', date: '2027-01-08T20:00:00.000Z' }],
    [{ slug: 'same-event', gameSlug: 'spades', title: 'Hosted override', status: 'upcoming', visibility: ' ', date: '2027-01-08T20:00:00.000Z' }],
  );
  assert.equal(overrides[0]?.title, 'Hosted override');
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

test('future countdown ignores verified live events while preserving separate live selection', () => {
  const nowMs = Date.parse('2027-01-01T12:00:00.000Z');
  const events = getPublicPresentationEvents([], [
    { slug: 'later-future', gameSlug: 'spades', status: 'upcoming', date: '2027-01-03T12:00:00.000Z' },
    { slug: 'live-future-date', gameSlug: 'spades', status: 'live', date: '2027-01-01T13:00:00.000Z' },
    { slug: 'earliest-future', gameSlug: 'euchre', status: 'scheduled', date: '2027-01-02T12:00:00.000Z' },
    { slug: 'live-past-date', gameSlug: 'spades', status: 'live', date: '2027-01-01T11:00:00.000Z' },
  ]);

  assert.equal(getNextEligiblePublicEvent(events, nowMs)?.slug, 'earliest-future');
  assert.equal(getNextEligiblePublicEvent(events, Date.parse('2027-01-02T12:00:00.000Z'))?.slug, 'later-future');
  assert.equal(getNextEligiblePublicEvent(events.filter((event) => event.status === 'live'), nowMs), null);
  assert.equal(getLivePublicEvent(events)?.slug, 'live-future-date');
});

test('only a recent scheduled event can await confirmation after its deadline', () => {
  const nowMs = Date.parse('2027-01-01T12:00:00.000Z');
  const events = getPublicPresentationEvents([], [
    { slug: 'just-started', gameSlug: 'spades', title: 'Just started', status: 'scheduled', visibility: 'public', date: '2027-01-01T11:59:30.000Z' },
    { slug: 'old-event', gameSlug: 'spades', title: 'Old event', status: 'upcoming', visibility: 'public', date: '2026-12-20T11:59:30.000Z' },
    { slug: 'live-event', gameSlug: 'spades', title: 'Live event', status: 'live', visibility: 'public', date: '2027-01-01T11:59:45.000Z' },
    { slug: 'newer-live-event', gameSlug: 'spades', title: 'Newer live event', status: 'live', visibility: 'public', date: '2027-01-01T11:59:50.000Z' },
  ]);

  assert.equal(getAwaitingStartPublicEvent(events, nowMs)?.slug, 'just-started');
  assert.equal(getAwaitingStartPublicEvent(events, nowMs + (3 * 60 * 60 * 1000)), null);
  assert.equal(getLivePublicEvent(events)?.slug, 'newer-live-event');
  assert.equal(getLivePublicEvent(events.filter((event) => event.status !== 'live')), null);
});
