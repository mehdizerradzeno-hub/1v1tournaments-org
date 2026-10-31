import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const adminHomeSource = readFileSync(
  fileURLToPath(new URL('../src/screens/AdminHomeScreen.jsx', import.meta.url)),
  'utf8',
);
const hubScreenSource = readFileSync(
  fileURLToPath(new URL('../src/components/hub-ui.jsx', import.meta.url)),
  'utf8',
);

test('the admin dashboard explicitly rehydrates the current server account', () => {
  assert.match(adminHomeSource, /import \{ useEffect, useState \} from 'react';/);
  assert.match(adminHomeSource, /import \{ fetchPlayerAccount \} from '\.\.\/lib\/tournamentHostingClient\.js';/);
  assert.match(adminHomeSource, /void fetchPlayerAccount\(\)/);
  assert.match(adminHomeSource, /setPlayerAccount\(result\.account \|\| null\)/);
  assert.match(adminHomeSource, /<HubScreen accountOverride=\{playerAccount\} accountLoadingOverride=\{playerAccountLoading\}/);
});

test('an explicit dashboard account state disables the shell fallback fetch', () => {
  assert.match(hubScreenSource, /const hasAccountOverride = accountOverride !== undefined \|\| accountLoadingOverride !== undefined;/);
  assert.match(hubScreenSource, /if \(!isHydrated \|\| hasAccountOverride\)/);
  assert.match(hubScreenSource, /resolvedPlayerAccountLoading = hasAccountOverride/);
});
