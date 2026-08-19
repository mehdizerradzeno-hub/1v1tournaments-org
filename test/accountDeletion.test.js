import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deleteCanonicalAccountFootprint,
} from '../netlify/functions/_account-deletion.mjs';

class MemoryStore {
  constructor(records = {}) {
    this.records = new Map(
      Object.entries(records).map(([key, value]) => [
        key,
        structuredClone(value),
      ]),
    );
  }

  async get(key) {
    const value = this.records.get(key);
    return value == null ? null : structuredClone(value);
  }

  async setJSON(key, value) {
    this.records.set(key, structuredClone(value));
  }

  async list({ prefix = '' } = {}) {
    return {
      blobs: [...this.records.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key })),
    };
  }

  async delete(key) {
    this.records.delete(key);
  }
}

const account = {
  id: 'acct_target',
  canonicalAccountId: 'acct_target',
  email: 'target@example.com',
  playerName: 'Target Player',
  playerHandle: '@target',
};

function stores() {
  return {
    'shared-account-aliases': new MemoryStore({
      'by-alias/spades/target.json': {
        provider: 'spades',
        legacyAccountId: 'legacy-target',
        canonicalAccountId: 'acct_target',
      },
      'by-alias/spades/other.json': {
        provider: 'spades',
        legacyAccountId: 'legacy-other',
        canonicalAccountId: 'acct_other',
      },
    }),

    'shared-account-authorizations': new MemoryStore({
      'codes/target-code': {
        identity: {
          canonicalAccountId: 'acct_target',
          displayName: 'Target Player',
        },
      },
      'claims/target-code': {
        claimedAt: '2026-08-19T00:00:00.000Z',
      },
      'codes/other-code': {
        identity: {
          canonicalAccountId: 'acct_other',
          displayName: 'Other Player',
        },
      },
    }),

    'tournament-signups': new MemoryStore({
      'summer-cup/target.json': {
        id: 'signup-target',
        tournamentSlug: 'summer-cup',
        accountId: 'acct_target',
        accountCanonicalId: 'acct_target',
        canonicalAccountId: 'acct_target',
        accountEmail: 'target@example.com',
        contactEmail: 'target@example.com',
        playerName: 'Target Player',
        playerHandle: '@target',
        notes: 'private note',
        status: 'registered',
        createdAt: '2026-08-19T00:00:00.000Z',
      },
      'summer-cup/other.json': {
        id: 'signup-other',
        tournamentSlug: 'summer-cup',
        canonicalAccountId: 'acct_other',
        accountEmail: 'other@example.com',
        playerName: 'Other Player',
        playerHandle: '@other',
        status: 'registered',
      },
    }),

    'tournament-brackets': new MemoryStore({
      'summer-cup.json': {
        tournamentSlug: 'summer-cup',
        participants: [
          {
            id: 'signup-target',
            canonicalAccountId: 'acct_target',
            name: 'Target Player',
            handle: '@target',
            accountEmail: 'target@example.com',
            contactEmail: 'target@example.com',
            seed: 1,
          },
          {
            id: 'signup-other',
            canonicalAccountId: 'acct_other',
            name: 'Other Player',
            handle: '@other',
            accountEmail: 'other@example.com',
            seed: 2,
          },
        ],
        rounds: [
          {
            matches: [
              {
                id: 'match-1',
                status: 'final',
                winnerId: 'acct_target',
                winnerName: 'Target Player (@target)',
                homeScore: '250',
                awayScore: '190',
              },
            ],
          },
        ],
        winner: {
          canonicalAccountId: 'acct_target',
          name: 'Target Player',
        },
      },
    }),

    leagues: new MemoryStore({
      'season-one.json': {
        id: 'season-one',
        players: [
          {
            accountId: 'acct_target',
            canonicalAccountId: 'acct_target',
            accountEmail: 'target@example.com',
            displayName: 'Target Player',
          },
          {
            accountId: 'acct_other',
            canonicalAccountId: 'acct_other',
            accountEmail: 'other@example.com',
            displayName: 'Other Player',
          },
        ],
        matches: [
          {
            id: 'league-match-1',
            homeTeam: {
              canonicalAccountId: 'acct_target',
              displayName: 'Target Player',
            },
            awayTeam: {
              canonicalAccountId: 'acct_other',
              displayName: 'Other Player',
            },
            result: {
              winnerId: 'acct_target',
              homeScore: '10',
              awayScore: '7',
            },
          },
        ],
      },
    }),

    'tournament-match-tickets': new MemoryStore({
      'target-ticket.json': {
        canonicalAccountId: 'acct_target',
        accountEmail: 'target@example.com',
      },
      'other-ticket.json': {
        canonicalAccountId: 'acct_other',
        accountEmail: 'other@example.com',
      },
    }),
  };
}

test(
  'canonical deletion removes active account footprint while preserving competitive history',
  async () => {
    const testStores = stores();

    const result = await deleteCanonicalAccountFootprint(account, {
      stores: testStores,
      tombstoneId: 'deleted_test_player',
      syncSpadesDeletion: async ({
        canonicalAccountId,
        legacyV11AccountId,
      }) => {
        assert.equal(canonicalAccountId, 'acct_target');
        assert.equal(legacyV11AccountId, 'legacy-target');
        return {
          ok: true,
          sessionsRevoked: 0,
        };
      },
    });

    assert.deepEqual(result, {
      aliasesDeleted: 1,
      authorizationsDeleted: 1,
      bracketsAnonymized: 1,
      leaguesAnonymized: 1,
      matchTicketsDeleted: 1,
      signupsAnonymized: 1,
      tombstoneId: 'deleted_test_player',
      spadesCleanup: {
        ok: true,
        sessionsRevoked: 0,
      },
    });

    const aliasStore = testStores['shared-account-aliases'];

    assert.equal(
      await aliasStore.get('by-alias/spades/target.json'),
      null,
    );

    assert.ok(
      await aliasStore.get('by-alias/spades/other.json'),
    );

    const authorizationStore =
      testStores['shared-account-authorizations'];

    assert.equal(
      await authorizationStore.get('codes/target-code'),
      null,
    );

    assert.equal(
      await authorizationStore.get('claims/target-code'),
      null,
    );

    assert.ok(
      await authorizationStore.get('codes/other-code'),
    );

    const signupStore = testStores['tournament-signups'];

    assert.equal(
      await signupStore.get('summer-cup/target.json'),
      null,
    );

    const signupEntries = [
      ...signupStore.records.entries(),
    ];

    const deletedSignup = signupEntries
      .map(([, value]) => value)
      .find(
        (value) =>
          value.canonicalAccountId === 'deleted_test_player',
      );

    assert.ok(deletedSignup);
    assert.equal(deletedSignup.playerName, 'Deleted Player');
    assert.equal(deletedSignup.playerHandle, '');
    assert.equal(deletedSignup.accountEmail, '');
    assert.equal(deletedSignup.contactEmail, '');
    assert.equal(deletedSignup.notes, '');

    const bracket = await testStores[
      'tournament-brackets'
    ].get('summer-cup.json');

    const bracketText = JSON.stringify(bracket);

    assert.doesNotMatch(bracketText, /target@example\.com/i);
    assert.doesNotMatch(bracketText, /Target Player/i);
    assert.doesNotMatch(bracketText, /@target/i);
    assert.doesNotMatch(bracketText, /acct_target/i);

    assert.equal(
      bracket.rounds[0].matches[0].winnerId,
      'deleted_test_player',
    );

    assert.equal(
      bracket.rounds[0].matches[0].winnerName,
      'Deleted Player',
    );

    // Competitive result remains intact.
    assert.equal(
      bracket.rounds[0].matches[0].homeScore,
      '250',
    );

    assert.equal(
      bracket.rounds[0].matches[0].awayScore,
      '190',
    );

    assert.equal(
      bracket.participants[1].name,
      'Other Player',
    );

    const league = await testStores.leagues.get(
      'season-one.json',
    );

    const leagueText = JSON.stringify(league);

    assert.doesNotMatch(leagueText, /target@example\.com/i);
    assert.doesNotMatch(leagueText, /Target Player/i);
    assert.doesNotMatch(leagueText, /acct_target/i);

    assert.equal(
      league.matches[0].result.winnerId,
      'deleted_test_player',
    );

    // League result remains intact.
    assert.equal(
      league.matches[0].result.homeScore,
      '10',
    );

    assert.equal(
      league.matches[0].result.awayScore,
      '7',
    );

    const ticketStore =
      testStores['tournament-match-tickets'];

    assert.equal(
      await ticketStore.get('target-ticket.json'),
      null,
    );

    assert.ok(
      await ticketStore.get('other-ticket.json'),
    );
  },
);

test(
  'canonical deletion synchronizes Spades before removing Hub identity',
  async () => {
    const testStores = stores();
    const order = [];

    const result = await deleteCanonicalAccountFootprint(account, {
      stores: testStores,
      tombstoneId: 'deleted_bridge_test',
      syncSpadesDeletion: async ({
        canonicalAccountId,
        legacyV11AccountId,
      }) => {
        order.push('spades');

        assert.equal(
          canonicalAccountId,
          'acct_target',
        );

        assert.equal(
          legacyV11AccountId,
          'legacy-target',
        );

        assert.ok(
          await testStores[
            'shared-account-aliases'
          ].get('by-alias/spades/target.json'),
        );

        return {
          ok: true,
          sessionsRevoked: 2,
        };
      },
    });

    order.push('finished');

    assert.deepEqual(order, [
      'spades',
      'finished',
    ]);

    assert.equal(
      result.spadesCleanup.sessionsRevoked,
      2,
    );

    assert.equal(
      await testStores[
        'shared-account-aliases'
      ].get('by-alias/spades/target.json'),
      null,
    );
  },
);

test(
  'canonical deletion fails closed when Spades cleanup fails',
  async () => {
    const testStores = stores();

    await assert.rejects(
      () =>
        deleteCanonicalAccountFootprint(account, {
          stores: testStores,
          syncSpadesDeletion: async () => {
            throw new Error('Spades unavailable');
          },
        }),
      /Spades unavailable/,
    );

    // Canonical alias remains because deletion stopped before Hub cleanup.
    assert.ok(
      await testStores[
        'shared-account-aliases'
      ].get('by-alias/spades/target.json'),
    );

    // Tournament identity has not been anonymized either.
    assert.ok(
      await testStores[
        'tournament-signups'
      ].get('summer-cup/target.json'),
    );
  },
);
