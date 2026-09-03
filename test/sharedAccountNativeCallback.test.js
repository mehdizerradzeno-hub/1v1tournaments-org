import assert from 'node:assert/strict';
import test from 'node:test';

import {
  nativeStateShapeDiagnostic,
  SPADES_NATIVE_CALLBACK_URI,
  validateNativeGameCallback,
} from '../netlify/functions/_shared-account-utils.mjs';

const state = '0123456789abcdef0123456789abcdef';

test('Spades native callback accepts only the registered scheme and state', () => {
  assert.deepEqual(validateNativeGameCallback({
    audience: 'spades',
    redirectUri: SPADES_NATIVE_CALLBACK_URI,
    source: 'spades-native',
    state,
  }), { redirectUri: SPADES_NATIVE_CALLBACK_URI, state });
});

test('native callback rejects wrong scheme, host, path, game, and state', () => {
  for (const redirectUri of [
    'https://1v1spades.com/',
    'spades-freeplay://wrong-path',
    'euchre-freeplay://shared-account-callback',
  ]) {
    assert.throws(
      () => validateNativeGameCallback({ audience: 'spades', redirectUri, source: 'spades-native', state }),
      /allowlisted|different game/,
    );
  }
  assert.throws(
    () => validateNativeGameCallback({ audience: 'euchre', redirectUri: SPADES_NATIVE_CALLBACK_URI, source: 'spades-native', state }),
    /different game/,
  );
  assert.throws(
    () => validateNativeGameCallback({ audience: 'spades', redirectUri: SPADES_NATIVE_CALLBACK_URI, source: 'spades-native', state: 'short' }),
    /state is invalid/,
  );
});

test('web shared-account requests retain no native callback', () => {
  assert.equal(validateNativeGameCallback({ audience: 'spades' }), null);
});

test('QA native state diagnostics expose shape only', () => {
  const valid = nativeStateShapeDiagnostic(state);
  assert.deepEqual(valid, {
    stateValidatorDiagnosticVersion: 'qa-native-state-v1',
    statePresent: true,
    stateTypeClass: 'string',
    stateLength: 32,
    stateLengthInRange: true,
    stateHasWhitespace: false,
    stateValidationPassed: true,
  });
  assert.equal(JSON.stringify(valid).includes(state), false);
  assert.equal(nativeStateShapeDiagnostic('x'.repeat(31)).stateValidationPassed, false);
  assert.equal(nativeStateShapeDiagnostic('x'.repeat(129)).stateValidationPassed, false);
  assert.equal(nativeStateShapeDiagnostic(`valid ${state}`).stateValidationPassed, false);
  assert.equal(nativeStateShapeDiagnostic(undefined).stateValidationPassed, false);
});

test('QA validator returns shape diagnostic without changing validation', () => {
  const previous = process.env.APP_ENV;
  process.env.APP_ENV = 'qa-native-auth';
  try {
    const result = validateNativeGameCallback({
      audience: 'spades',
      redirectUri: SPADES_NATIVE_CALLBACK_URI,
      source: 'spades-native',
      state,
    });
    assert.deepEqual(result, {
      redirectUri: SPADES_NATIVE_CALLBACK_URI,
      state,
      qaNativeStateDiagnostic: nativeStateShapeDiagnostic(state),
    });
  } finally {
    if (previous === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous;
  }
});
