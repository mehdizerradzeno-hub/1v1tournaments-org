import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EUCHRE_TOURNAMENT_ENTRY_PATHS,
  collectReadyEuchreMatches,
  getRequestedHostTournamentGame,
} from '../src/lib/euchreTournamentEntry.js';

test('Euchre entry paths keep discovery, host creation, and assigned matches in the Hub', () => {
  assert.deepEqual(EUCHRE_TOURNAMENT_ENTRY_PATHS, {
    browseEvents: '/euchre#events',
    hostTournament: '/admin?game=euchre#host-event',
    playMyMatch: '/euchre?view=my-match#my-match',
  });
  assert.equal(getRequestedHostTournamentGame('euchre'), 'euchre');
  assert.equal(getRequestedHostTournamentGame(['euchre', 'spades']), 'euchre');
  assert.equal(getRequestedHostTournamentGame('spades'), null);
});

test('My Euchre Match returns only Hub-owned ready Euchre assignments', () => {
  const events = [
    { slug: 'euchre-live', gameSlug: 'euchre' },
    { slug: 'spades-live', gameSlug: 'spades' },
    { slug: 'euchre-waiting', gameSlug: 'euchre' },
  ];
  const matches = collectReadyEuchreMatches(events, [
    { slug: 'euchre-live', status: { currentMatch: { id: 'euchre-live-r1-m1', label: 'Match 1' } } },
    { slug: 'spades-live', status: { currentMatch: { id: 'spades-live-r1-m1' } } },
    { slug: 'euchre-waiting', status: { currentMatch: null } },
  ]);

  assert.deepEqual(matches.map(({ href, match }) => ({ href, matchId: match.id })), [{
    href: '/tournaments/euchre-live#my-match',
    matchId: 'euchre-live-r1-m1',
  }]);
});
