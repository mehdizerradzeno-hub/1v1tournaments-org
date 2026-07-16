import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSignedSessionToken,
  getSessionId,
  parseSignedSessionToken,
} from '../netlify/functions/_account-utils.mjs';

const ORIGINAL_SESSION_SECRET = process.env.TOURNAMENT_SESSION_SECRET;
const TEST_SESSION_SECRET = 'test-only-session-secret-with-more-than-32-characters';

function restoreSessionSecret() {
  if (ORIGINAL_SESSION_SECRET === undefined) {
    delete process.env.TOURNAMENT_SESSION_SECRET;
  } else {
    process.env.TOURNAMENT_SESSION_SECRET = ORIGINAL_SESSION_SECRET;
  }
}

test.afterEach(restoreSessionSecret);

test('signed player sessions round-trip trusted account claims', () => {
  process.env.TOURNAMENT_SESSION_SECRET = TEST_SESSION_SECRET;
  const session = {
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    id: 'session-1',
  };
  const account = {
    createdAt: new Date().toISOString(),
    email: 'player@example.com',
    emailVerified: true,
    id: 'account-1',
    playerHandle: '@player',
    playerName: 'Player One',
  };

  const token = createSignedSessionToken(session, account);
  const parsed = parseSignedSessionToken(token);

  assert.ok(token.startsWith('v1.'));
  assert.equal(parsed?.sessionId, session.id);
  assert.equal(parsed?.accountId, account.id);
  assert.equal(parsed?.accountEmail, account.email);
  assert.equal(parsed?.playerName, account.playerName);
});

test('session cookies preserve signed tokens longer than generic form fields', () => {
  process.env.TOURNAMENT_SESSION_SECRET = TEST_SESSION_SECRET;
  const token = createSignedSessionToken({
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    id: 'session-long-token',
  }, {
    createdAt: new Date().toISOString(),
    email: 'long-token@example.com',
    emailVerified: true,
    id: 'account-long-token',
    playerHandle: `@${'handle'.repeat(60)}`,
    playerName: 'Long Token Player',
  });
  const event = {
    headers: {
      cookie: `other_cookie=1; one_v_one_player_session=${encodeURIComponent(token)}`,
    },
  };

  assert.ok(token.length > 500);
  assert.equal(getSessionId(event), token);
  assert.equal(parseSignedSessionToken(getSessionId(event))?.sessionId, 'session-long-token');
});

test('signed player sessions reject tampering and expiration', () => {
  process.env.TOURNAMENT_SESSION_SECRET = TEST_SESSION_SECRET;
  const account = {
    createdAt: new Date().toISOString(),
    email: 'player@example.com',
    id: 'account-1',
    playerName: 'Player One',
  };
  const validToken = createSignedSessionToken({
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    id: 'session-1',
  }, account);
  const expiredToken = createSignedSessionToken({
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
    id: 'session-2',
  }, account);
  const tamperedToken = `${validToken.slice(0, -1)}${validToken.endsWith('a') ? 'b' : 'a'}`;

  assert.equal(parseSignedSessionToken(tamperedToken), null);
  assert.equal(parseSignedSessionToken(expiredToken), null);
});
