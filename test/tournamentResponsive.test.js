import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const tournamentScreenFile = fileURLToPath(new URL('../src/screens/TournamentScreen.jsx', import.meta.url));
const tournamentScreenSource = readFileSync(tournamentScreenFile, 'utf8');

test('the Twitch arrival actions take the available row at phone widths', () => {
  assert.match(tournamentScreenSource, /const usePhoneActionLayout = width > 0 && width <= 430;/);
  assert.match(
    tournamentScreenSource,
    /style=\{\[styles\.arrivalActions, usePhoneActionLayout && styles\.arrivalActionsPhone\]\}/,
  );
  assert.match(
    tournamentScreenSource,
    /arrivalActionsPhone:\s*\{\s*flexBasis: '100%',\s*width: '100%',\s*\}/,
  );
  assert.match(tournamentScreenSource, /arrivalActions:\s*\{[\s\S]*?flexWrap: 'wrap'/);
});

test('every Twitch arrival action preserves a 44px minimum touch target', () => {
  assert.equal((tournamentScreenSource.match(/style=\{styles\.arrivalAction\}/g) || []).length, 3);
  assert.match(tournamentScreenSource, /arrivalAction:\s*\{\s*minHeight: 44,\s*\}/);
});
