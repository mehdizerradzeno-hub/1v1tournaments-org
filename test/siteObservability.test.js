import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSiteEvent,
  sanitizeLinkDestination,
  sanitizeSitePath,
} from '../src/lib/siteObservability.js';

test('site telemetry strips query strings, hashes, and external URL details', () => {
  assert.equal(sanitizeSitePath('/check-in/event?email=player@example.com#account'), '/check-in/event');
  assert.equal(sanitizeLinkDestination('https://example.com/private/path?token=secret'), 'https://example.com');
  assert.equal(sanitizeLinkDestination('mailto:private@example.com'), '');
});

test('site telemetry only accepts an anonymous allowlisted schema', () => {
  const event = buildSiteEvent('link_click', {
    external: false,
    from: '/next?mode=private',
    to: '/check-in/event?email=player@example.com',
    playerName: 'Private Player',
  });

  assert.deepEqual(event.properties, {
    external: false,
    from: '/next',
    to: '/check-in/event',
  });
  assert.equal(buildSiteEvent('player_identity', { playerName: 'Private Player' }), null);
});
