import test from 'node:test';
import assert from 'node:assert/strict';

import { upsertLeagueMatchResult } from '../netlify/functions/_league-utils.mjs';
import { applyLeagueMatchResult, buildLeagueRecord } from '../src/lib/leagueCatalog.js';

function league() {
  return buildLeagueRecord({
    id: 'concurrent-results',
    gameSlug: 'euchre',
    matches: [
      {
        id: 'fixture-one',
        status: 'scheduled',
        homeTeam: { canonicalAccountId: 'home-one', displayName: 'Home One' },
        awayTeam: { canonicalAccountId: 'away-one', displayName: 'Away One' },
      },
      {
        id: 'fixture-two',
        status: 'scheduled',
        homeTeam: { canonicalAccountId: 'home-two', displayName: 'Home Two' },
        awayTeam: { canonicalAccountId: 'away-two', displayName: 'Away Two' },
      },
    ],
  });
}

test('league result writes retry an ETag conflict without dropping another completed fixture', async () => {
  let stored = league();
  let etag = 1;
  let conflictOnce = true;
  const store = {
    async getWithMetadata() {
      return { data: structuredClone(stored), etag: String(etag) };
    },
    async set(_key, body, options) {
      if (conflictOnce) {
        conflictOnce = false;
        stored = applyLeagueMatchResult(stored, 'fixture-two', {
          winner: 'away',
          winnerId: 'away-two',
          homeScore: 7,
          awayScore: 10,
        }, { callbackId: 'completion-two' }).league;
        etag += 1;
        return { modified: false };
      }

      assert.equal(options.onlyIfMatch, String(etag));
      stored = JSON.parse(body);
      etag += 1;
      return { modified: true };
    },
  };

  const updated = await upsertLeagueMatchResult('concurrent-results', 'fixture-one', {
    winner: 'home',
    winnerId: 'home-one',
    homeScore: 10,
    awayScore: 8,
    callbackId: 'completion-one',
  }, {
    source: 'tournament-authoritative-result',
    callbackId: 'completion-one',
    rejectConflictingCompleted: true,
    store,
  });

  assert.equal(updated.changed, true);
  assert.equal(stored.matches.find((match) => match.id === 'fixture-one')?.result.callbackId, 'completion-one');
  assert.equal(stored.matches.find((match) => match.id === 'fixture-two')?.result.callbackId, 'completion-two');
});

test('an authoritative callback cannot replace a differently completed fixture', async () => {
  let stored = applyLeagueMatchResult(league(), 'fixture-one', {
    winner: 'home',
    winnerId: 'home-one',
    homeScore: 10,
    awayScore: 8,
  }, { callbackId: 'first-completion' }).league;
  const store = {
    async getWithMetadata() {
      return { data: structuredClone(stored), etag: 'one' };
    },
    async set() {
      throw new Error('a conflict must never be written');
    },
  };

  const outcome = await upsertLeagueMatchResult('concurrent-results', 'fixture-one', {
    winner: 'away',
    winnerId: 'away-one',
    homeScore: 2,
    awayScore: 10,
    callbackId: 'different-completion',
  }, {
    callbackId: 'different-completion',
    rejectConflictingCompleted: true,
    store,
  });

  assert.equal(outcome.conflict, true);
  assert.equal(stored.matches.find((match) => match.id === 'fixture-one')?.result.callbackId, 'first-completion');
});
