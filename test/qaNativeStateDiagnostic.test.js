import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('native state diagnostic is read only after the launch resolves', async () => {
  const source = await readFile(new URL('../src/screens/SpadesAccountConnectScreen.jsx', import.meta.url), 'utf8');
  const launchDeclaration = source.indexOf('const launch = isNativeSpadesHandoff');
  const launchDiagnosticRead = source.indexOf('setNativeStateDiagnostic(launch.qaNativeStateDiagnostic || null);');
  assert.notEqual(launchDeclaration, -1);
  assert.equal(launchDiagnosticRead > launchDeclaration, true);
  assert.equal(source.indexOf('setNativeStateDiagnostic(launch.qaNativeStateDiagnostic || null);', launchDiagnosticRead + 1), -1);
});
