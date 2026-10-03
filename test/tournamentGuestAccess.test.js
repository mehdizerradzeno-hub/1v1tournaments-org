import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGuestCookie,
  createGuestKey,
  guestKeyDigest,
  guestKeyMatches,
  parseGuestCookie,
} from '../netlify/functions/_tournament-guest-auth.mjs';

const previousSecret = process.env.TOURNAMENT_SESSION_SECRET;

test.before(() => {
  process.env.TOURNAMENT_SESSION_SECRET = 'test-only-secret-that-is-at-least-32-characters';
});

test.after(() => {
  if (previousSecret === undefined) delete process.env.TOURNAMENT_SESSION_SECRET;
  else process.env.TOURNAMENT_SESSION_SECRET = previousSecret;
});

test('guest key is random, digest-only compatible, and one-time cookie parseable', () => {
  const key = createGuestKey();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const cookie = createGuestCookie('private-event', expiresAt);
  const parsed = parseGuestCookie(cookie);

  assert.match(key, /^guest-[A-Za-z0-9_-]+$/);
  assert.equal(guestKeyMatches(key, { keyHash: guestKeyDigest(key) }), true);
  assert.equal(guestKeyMatches('guest-wrong', { keyHash: guestKeyDigest(key) }), false);
  assert.deepEqual(parsed.slug, 'private-event');
});

test('expired guest cookies are rejected', () => {
  const cookie = createGuestCookie('private-event', new Date(Date.now() - 1_000).toISOString());
  assert.equal(parseGuestCookie(cookie), null);
});
