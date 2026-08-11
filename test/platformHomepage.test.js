import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rootRoute = await readFile(new URL('../app/index.jsx', import.meta.url), 'utf8');
const homeScreen = await readFile(new URL('../src/screens/HomeScreen.jsx', import.meta.url), 'utf8');
const hubUi = await readFile(new URL('../src/components/hub-ui.jsx', import.meta.url), 'utf8');

test('root route renders the multi-game platform hub', () => {
  assert.match(rootRoute, /HomeScreen/);
  assert.match(homeScreen, /1V1 Competitive/);
  assert.match(homeScreen, /Spades &amp; Euchre/);
  assert.match(homeScreen, /No partner\. No excuses\./);
  assert.match(homeScreen, /PLATFORM_GAME_PRESENTATION/);
});

test('platform navigation keeps competition, account, and My Match visible', () => {
  for (const label of ['Compete', 'Tournaments', 'Leagues', 'Rankings', 'Results', 'Profile', 'My Match']) {
    assert.match(hubUi, new RegExp(`label: '${label}'`));
  }
  assert.match(hubUi, /playerAccount\?\.hostApproved/);
});

test('homepage does not advertise public Euchre discovery or invent an App Store URL', () => {
  assert.doesNotMatch(homeScreen, /Euchre.*Public tournaments/s);
  assert.doesNotMatch(homeScreen, /apps\.apple\.com[^'\"\s]*euchre/i);
  assert.match(homeScreen, /PLATFORM_SUBMISSION_STATEMENT/);
});
