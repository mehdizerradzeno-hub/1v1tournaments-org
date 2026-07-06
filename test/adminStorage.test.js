import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAdminDraftPacket,
  createDraftTemplate,
  serializeAdminDraftPacket,
} from '../src/lib/adminStorage.js';
import { siteData } from '../src/lib/siteData.js';

test('draft templates stay on the primary game with safe placeholder wording', () => {
  const draft = createDraftTemplate({
    slug: 'private-draft-night',
    title: 'Private Draft Night',
  });

  assert.equal(draft.slug, 'private-draft-night');
  assert.equal(draft.gameSlug, siteData.site.primaryGameSlug);
  assert.equal(draft.entryLine, 'Free entry, no buy-in, no wagering.');
  assert.equal(draft.status, 'draft');
});

test('draft packets wrap the normalized draft with export metadata', () => {
  const packet = buildAdminDraftPacket({
    slug: 'spades-private-draft',
    gameSlug: 'spades',
    title: 'Spades Private Draft',
    entryLine: 'Free entry, no buy-in, no wagering.',
    checkIn: {
      title: 'Signup and check-in',
      status: 'Placeholder flow',
      preview: '30 min early',
      window: 'Opens 30 minutes before the start time.',
      note: 'Draft only',
      steps: ['Review the event page first.'],
    },
    bracket: {
      title: 'Bracket preview',
      note: 'Draft only',
      rounds: [
        {
          title: 'Round 1',
          matches: [
            {
              label: 'Match 1',
              teams: ['Seed 1', 'Seed 2'],
              note: 'Winner advances.',
            },
          ],
        },
      ],
    },
  });

  assert.ok(packet);
  assert.equal(packet.source, '1v1 Tournaments private admin');
  assert.equal(packet.draft.slug, 'spades-private-draft');
  assert.equal(packet.draft.gameSlug, 'spades');
  assert.equal(packet.draft.checkIn.preview, '30 min early');
  assert.equal(packet.draft.bracket.rounds.length, 1);
  assert.match(packet.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('serialized draft packets stay copyable as JSON', () => {
  const json = serializeAdminDraftPacket({
    slug: 'spades-preview-night',
    title: 'Spades Preview Night',
  });

  const packet = JSON.parse(json);

  assert.equal(packet.draft.slug, 'spades-preview-night');
  assert.equal(packet.draft.title, 'Spades Preview Night');
  assert.equal(packet.draft.entryLine, 'Free entry, no buy-in, no wagering.');
  assert.equal(packet.note, 'Copy this into the local allowlist server flow when it is ready.');
});
