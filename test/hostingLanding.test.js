import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildTournamentAccountPath, SPADES_HOSTING_DESTINATION } from '../src/lib/accountConnect.js';
import {
  HOSTING_DASHBOARD_PATH,
  HOSTING_FAQS,
  HOSTING_PASS,
  HOSTING_REQUEST_HREF,
  HOSTING_SUPPORT_EMAIL,
} from '../src/lib/hostingLandingContent.js';

const [route, page, nav, home] = await Promise.all([
  readFile(new URL('../app/hosting.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/HostingLandingScreen.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/hub-ui.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/HomeScreen.jsx', import.meta.url), 'utf8'),
]);

test('public hosting route and both public navigation modes expose the page', () => {
  assert.match(route, /HostingLandingScreen/);
  assert.equal(nav.match(/\{ label: 'Host', href: '\/hosting' \}/g)?.length, 2);
  assert.match(home, /href="\/hosting"[^>]*>Host a tournament/);
  assert.match(page, /publicShell/);
  assert.match(page, /stickyActions=\{false\}/);
});

test('pilot copy and request action retain the approved scope', () => {
  assert.deepEqual(HOSTING_PASS, {
    name: 'Single-Event Hosting Pass',
    priceUsd: 15,
    includedEvents: 1,
    playerCapacity: 8,
    originalValidityDays: 30,
    automaticRenewal: false,
  });
  assert.equal(HOSTING_SUPPORT_EMAIL, 'mehdi.zerrad@1v1spades.com');
  assert.equal(new URL(HOSTING_REQUEST_HREF).protocol, 'mailto:');
  assert.match(page, /Request Hosting Access/);
  assert.match(page, /No checkout is live/);
  assert.match(page, /ILLUSTRATIVE/);
  assert.match(page, /not a tournament result or product screenshot/);
  assert.match(HOSTING_FAQS.find(({ id }) => id === 'delivery').answer, /1–3 business days/);
  assert.match(HOSTING_FAQS.find(({ id }) => id === 'expired').answer, /revoked or superseded/);
  assert.equal(new Set(HOSTING_FAQS.map(({ id }) => id)).size, HOSTING_FAQS.length);
});

test('existing-customer action uses the verified Hub account handoff', () => {
  assert.equal(HOSTING_DASHBOARD_PATH, buildTournamentAccountPath(SPADES_HOSTING_DESTINATION, 'signin'));
  assert.equal(HOSTING_DASHBOARD_PATH, '/account?mode=signin&returnTo=https%3A%2F%2F1v1spades.com%2Fhosting');
  assert.match(page, /href=\{HOSTING_DASHBOARD_PATH\}/);
  assert.match(page, /accessibilityState=\{\{ expanded: open \}\}/);
  assert.match(page, /aria-controls=\{panelId\}/);
  assert.match(page, /aria-expanded=\{open\}/);
});
