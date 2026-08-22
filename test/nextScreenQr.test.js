import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const nextScreenFile = fileURLToPath(new URL('../src/screens/NextScreen.jsx', import.meta.url));

test('next-event hero keeps QR codes off the phone conversion path', () => {
  const source = readFileSync(nextScreenFile, 'utf8');
  const countdownIndex = source.indexOf('styles.countdownPanel');
  const qrGridIndex = source.indexOf('<StreamQrGrid');
  const supportingContentIndex = source.indexOf('styles.heroBadgeRow');

  assert.ok(countdownIndex >= 0, 'Expected the next-event countdown panel.');
  assert.ok(qrGridIndex > countdownIndex, 'Expected the desktop QR grid inside the countdown hero.');
  assert.ok(
    qrGridIndex < supportingContentIndex,
    'Expected both QR codes before the below-fold roster and Twitch content.',
  );
  assert.doesNotMatch(source, /isPhone\s*\?\s*\(\s*<StreamQrGrid/);
  assert.match(source, /\{isPhone \? null : \(\s*<StreamQrGrid/);
  assert.match(source, /QR code for the next tournament signup/);
  assert.match(source, /QR code for 1v1 Spades on the App Store/);
  assert.match(source, /downloadLinks\.appStoreSpades/);
});
