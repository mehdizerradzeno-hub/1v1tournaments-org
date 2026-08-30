import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTournamentRestoreLauncher,
  getColdStartRestoreRequest,
} from '../src/lib/activeTournamentMatch.js';

const account = { id: 'account-a' };
const activeMatch = {
  tournamentSlug: 'qa-cold-start',
  matchId: 'qa-cold-start-r1-m1',
  bracketStatus: 'live',
};
const discovery = {
  accountId: account.id,
  activeMatch,
  activeMatchCount: 1,
  nextStep: 'ready-match',
  scope: 'active-match',
};
test('authenticated generic tournament entry restores exactly one active match', () => {
  const request = getColdStartRestoreRequest({
    accountId: account.id,
    discovery,
    pathname: '/tournaments/',
  });

  assert.deepEqual(request, {
    key: 'account-a:qa-cold-start:qa-cold-start-r1-m1',
    tournamentSlug: 'qa-cold-start',
    matchId: 'qa-cold-start-r1-m1',
  });
});

test('cold-start discovery does not guess or redirect ineligible state', () => {
  const cases = [
    { name: 'no active match', discovery: { ...discovery, activeMatch: null, activeMatchCount: 0 } },
    { name: 'multiple active matches', discovery: { ...discovery, activeMatchCount: 2 } },
    { name: 'wrong account', accountId: 'account-b' },
    { name: 'wrong response account', discovery: { ...discovery, accountId: 'account-b' } },
    { name: 'anonymous account', accountId: '' },
    { name: 'completed bracket', discovery: { ...discovery, activeMatch: { ...activeMatch, bracketStatus: 'complete' } } },
    { name: 'non-ready status', discovery: { ...discovery, nextStep: 'no-active-match' } },
    { name: 'wrong response scope', discovery: { ...discovery, scope: 'tournament' } },
    { name: 'non-generic route', pathname: '/account' },
    {
      name: 'mismatched match identifier',
      discovery: { ...discovery, activeMatch: { ...activeMatch, matchId: 'other-event-r1-m1' } },
    },
  ];

  for (const candidate of cases) {
    assert.equal(getColdStartRestoreRequest({
      accountId: Object.prototype.hasOwnProperty.call(candidate, 'accountId') ? candidate.accountId : account.id,
      discovery: candidate.discovery || discovery,
      pathname: candidate.pathname || '/tournaments',
    }), null, candidate.name);
  }
});

test('cold-start ticket launch is single-flight and navigates once', async () => {
  const launcher = createTournamentRestoreLauncher();
  const request = getColdStartRestoreRequest({ accountId: account.id, discovery, pathname: '/tournaments' });
  let resolveTicket;
  let issueCount = 0;
  let issueInput = null;
  const navigations = [];
  const issueTicket = async (input) => {
    issueCount += 1;
    issueInput = input;
    return new Promise((resolve) => {
      resolveTicket = resolve;
    });
  };

  const first = launcher.launch(request, {
    issueTicket,
    navigate: (url) => navigations.push(url),
  });
  const duplicate = await launcher.launch(request, {
    issueTicket,
    navigate: (url) => navigations.push(url),
  });

  assert.deepEqual(duplicate, { status: 'duplicate' });
  resolveTicket({ roomUrl: 'https://qa-spades.example/match/qa-cold-start-r1-m1?ticket=opaque' });
  assert.deepEqual(await first, { status: 'launched' });
  assert.equal(issueCount, 1);
  assert.deepEqual(issueInput, {
    slug: 'qa-cold-start',
    matchId: 'qa-cold-start-r1-m1',
  });
  assert.deepEqual(navigations, ['https://qa-spades.example/match/qa-cold-start-r1-m1?ticket=opaque']);
  assert.deepEqual(await launcher.launch(request, {
    issueTicket,
    navigate: (url) => navigations.push(url),
  }), { status: 'duplicate' });
  assert.equal(issueCount, 1);
  assert.equal(navigations.length, 1);
});

test('stale, revoked, and deleted restoration never navigate', async () => {
  const request = getColdStartRestoreRequest({ accountId: account.id, discovery, pathname: '/tournaments' });

  const staleNavigations = [];
  const stale = await createTournamentRestoreLauncher().launch(request, {
    isCurrent: () => false,
    issueTicket: async () => ({ roomUrl: 'https://qa-spades.example/match/stale?ticket=opaque' }),
    navigate: (url) => staleNavigations.push(url),
  });
  assert.deepEqual(stale, { status: 'stale' });
  assert.deepEqual(staleNavigations, []);

  for (const code of ['ticket_revoked', 'tournament_deleted']) {
    const navigations = [];
    await assert.rejects(
      createTournamentRestoreLauncher().launch(request, {
        issueTicket: async () => {
          const error = new Error(code);
          error.code = code;
          throw error;
        },
        navigate: (url) => navigations.push(url),
      }),
      new RegExp(code),
    );
    assert.deepEqual(navigations, [], code);
  }
});
