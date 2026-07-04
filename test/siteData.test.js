import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAdminDraftTournamentBySlug,
  getAdminDraftTournaments,
  getCheckInPath,
  getGameBySlug,
  getGamePath,
  getGames,
  getGeneralRules,
  getStreams,
  getTournamentBySlug,
  getTournamentsForGame,
  getUpcomingTournaments,
  siteData,
} from '../src/lib/siteData.js';

test('the site policy copy stays free-entry and no-wagering', () => {
  assert.equal(siteData.site.entryPolicy, 'Free entry, no buy-in, no wagering.');
  assert.match(siteData.site.tagline, /Spades tournaments are live now/i);
  assert.match(siteData.site.tagline, /Euchre is coming soon/i);
  assert.equal(siteData.site.contactEmail, 'hello@1v1tournaments.org');
});

test('game paths keep Spades and Euchre on short routes', () => {
  assert.equal(getGamePath('spades'), '/spades');
  assert.equal(getGamePath('euchre'), '/euchre');
});

test('games are sorted for the lineup page and only include Spades and Euchre', () => {
  assert.deepEqual(
    getGames().map((game) => game.slug),
    ['spades', 'euchre'],
  );
});

test('the upcoming tournament list only includes the public Spades events', () => {
  assert.deepEqual(
    getUpcomingTournaments().map((tournament) => tournament.slug),
    [
      'spades-summer-series',
      'spades-friday-night-cup',
      'spades-community-showcase',
    ],
  );
});

test('the Euchre lane stays public-but-coming-soon', () => {
  assert.equal(getTournamentBySlug('euchre-preview-night'), null);
  assert.equal(getGameBySlug('euchre')?.status, 'coming soon');
  assert.equal(getGameBySlug('euchre')?.featuredTournamentSlug, null);
  assert.deepEqual(getTournamentsForGame('euchre').map((tournament) => tournament.slug), []);
});

test('the YouTube channel link points at the new channel URL', () => {
  const channel = getStreams().find((stream) => stream.slug === 'youtube-channel');

  assert.equal(channel?.href, 'https://m.youtube.com/channel/UCkqnaYQ2I47O8e20sIsHpfQ?ra=m');
});

test('general rules keep the no-buy-in wording visible in one place', () => {
  const sections = getGeneralRules();

  assert.ok(sections.some((section) => section.items.some((item) => /no buy-in/i.test(item))));
  assert.ok(sections.some((section) => section.title === 'Platform note'));
  assert.ok(sections.some((section) => section.items.some((item) => /Apple is not a sponsor or involved/i.test(item))));
});

test('public tournaments expose the signup and bracket flow', () => {
  const tournament = getTournamentBySlug('spades-summer-series');

  assert.equal(getCheckInPath('spades-summer-series'), '/check-in/spades-summer-series');
  assert.equal(tournament?.checkIn?.preview, '30 min early');
  assert.equal(tournament?.checkIn?.window, 'Opens 30 minutes before the start time.');
  assert.match(tournament?.checkIn?.note || '', /match link/i);
  assert.ok((tournament?.bracket?.rounds || []).length > 0);
});

test('admin drafts stay separated from public tournament pages', () => {
  assert.match(siteData.admin.accessModel, /server-side account allowlist/i);
  assert.match(siteData.admin.futureAccessModel, /localhost allowlist server/i);
  assert.equal(siteData.admin.serverUrl, 'http://127.0.0.1:8787');
  assert.equal(siteData.admin.serverStateFile, '.data/admin-state.json');
  assert.equal(getTournamentBySlug('euchre-launch-night'), null);
  assert.deepEqual(getAdminDraftTournaments().map((tournament) => tournament.slug), ['euchre-launch-night']);
  assert.equal(getAdminDraftTournamentBySlug('euchre-launch-night')?.gameSlug, 'euchre');
});
