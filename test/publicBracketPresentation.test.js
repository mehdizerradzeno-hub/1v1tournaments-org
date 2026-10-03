import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { getPublicBracketPresentation } from '../src/lib/publicBracketPresentation.js';

test('public bracket labels distinguish preview, published, live, and complete', () => {
  assert.deepEqual(getPublicBracketPresentation(), { state: 'preview', label: 'Bracket preview', statusLabel: 'Preview' });
  assert.deepEqual(getPublicBracketPresentation({ hasBracket: true }), { state: 'published', label: 'Published bracket', statusLabel: 'Published' });
  assert.deepEqual(getPublicBracketPresentation({ hasBracket: true, isLive: true }), { state: 'live', label: 'Live bracket', statusLabel: 'Live' });
  assert.deepEqual(getPublicBracketPresentation({ hasBracket: true, isComplete: true, isLive: true }), { state: 'complete', label: 'Final bracket', statusLabel: 'Complete' });
  assert.equal(getPublicBracketPresentation({ isComplete: true, isLive: true }).state, 'preview');
});

test('tournament bracket heading, dashboard, format and roster share the same presentation labels', async () => {
  const source = await readFile(new URL('../src/screens/TournamentScreen.jsx', import.meta.url), 'utf8');

  assert.match(source, /getPublicBracketPresentation\(\{/);
  assert.match(source, /const bracketSectionTitle = bracketPresentation\.label;/);
  assert.match(source, /\{bracketPresentation\.statusLabel\}<\/Badge>/);
  assert.match(source, /seeded in the \$\{bracketPresentation\.label\.toLowerCase\(\)\}/);
  assert.match(source, /\$\{bracketPresentation\.label\}: \$\{bracketSizeLabel/);
  assert.match(source, /dashboardTileMeta\}>\{liveBracket \? bracketPresentation\.label\.toLowerCase\(\)/);
  assert.doesNotMatch(source, /seeded in the live bracket|\? `Live bracket:|liveBracket \? 'live bracket'/);
});
