import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultAdminServerState,
  isAccountIdAllowed,
  normalizeAdminServerState,
  parseAccountIds,
  serializeAdminServerPacket,
} from '../src/lib/adminServerState.js';
import { siteData } from '../src/lib/siteData.js';

test('server allowlist state keeps account IDs normalized and deduped', () => {
  const state = normalizeAdminServerState({
    allowlistAccountIds: ['  mehdizerrad  ', 'mehdizerrad', '', 'admin-2'],
    draftTournaments: siteData.admin.draftTournaments,
  });

  assert.deepEqual(state.allowlistAccountIds, ['mehdizerrad', 'admin-2']);
  assert.equal(isAccountIdAllowed('mehdizerrad', state), true);
  assert.equal(isAccountIdAllowed('missing', state), false);
});

test('server state defaults to the seeded draft placeholders', () => {
  const state = createDefaultAdminServerState();

  assert.equal(state.version, 1);
  assert.ok(state.updatedAt);
  assert.ok(state.draftTournaments.length > 0);
  assert.equal(state.draftTournaments[0].entryLine, 'Free entry, no buy-in, no wagering.');
});

test('server packets stay copyable as JSON for the local admin server', () => {
  const packet = JSON.parse(
    serializeAdminServerPacket({
      allowlistAccountIds: parseAccountIds('account-one\naccount-two'),
      draftTournaments: siteData.admin.draftTournaments,
    }),
  );

  assert.equal(packet.source, '1v1 Tournaments admin server');
  assert.equal(packet.allowlistCount, 2);
  assert.equal(packet.draftCount, siteData.admin.draftTournaments.length);
  assert.equal(packet.state.allowlistAccountIds[1], 'account-two');
});
