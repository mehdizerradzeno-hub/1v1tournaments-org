import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createPlayerAccount,
  loginPlayerAccount,
  requestPlayerPasswordReset,
  resetPlayerPassword,
} from '../src/lib/tournamentHostingClient.js';

const spadesScreenPath = new URL('../src/screens/SpadesAccountConnectScreen.jsx', import.meta.url);
const checkInScreenPath = new URL('../src/screens/CheckInScreen.jsx', import.meta.url);

async function withFakeAccountApi(responses, run) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let responseIndex = 0;

  globalThis.fetch = async (input, init) => {
    requests.push({
      body: JSON.parse(init.body),
      url: String(input),
    });
    const next = responses[Math.min(responseIndex++, responses.length - 1)];
    return new Response(JSON.stringify(next.body || {}), {
      status: next.status || 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    return await run(requests);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('account client sends one correct action for create, login, and both reset paths', async () => {
  await withFakeAccountApi([
    { body: { account: { id: 'created' } } },
    { body: { account: { id: 'signed-in' } } },
    { body: { configured: true, message: 'Reset link sent.' } },
    { body: { account: { id: 'reset' } } },
  ], async (requests) => {
    await createPlayerAccount({ contactEmail: 'player@example.com', password: 'Password1!', confirmPassword: 'Password1!' });
    await loginPlayerAccount({ contactEmail: 'player@example.com', password: 'Password1!' });
    await requestPlayerPasswordReset({ contactEmail: 'player@example.com' });
    await resetPlayerPassword({ contactEmail: 'player@example.com', token: 'token-1', password: 'Password2!', confirmPassword: 'Password2!' });

    assert.deepEqual(requests.map(({ body }) => body.action), [
      'create',
      'login',
      'request-password-reset',
      'reset-password',
    ]);
  });
});

test('a successful reset-link request remains a request-password-reset on retry, and failed requests can retry', async () => {
  await withFakeAccountApi([
    { body: { configured: true, message: 'Reset link sent.' } },
    { status: 503, body: { error: 'Temporary failure.' } },
    { body: { configured: true, message: 'Reset link sent again.' } },
  ], async (requests) => {
    await requestPlayerPasswordReset({ contactEmail: 'player@example.com' });
    await assert.rejects(requestPlayerPasswordReset({ contactEmail: 'player@example.com' }), /Temporary failure/);
    await requestPlayerPasswordReset({ contactEmail: 'player@example.com' });

    assert.equal(requests.length, 3);
    assert.deepEqual(requests.map(({ body }) => body.action), [
      'request-password-reset',
      'request-password-reset',
      'request-password-reset',
    ]);
  });
});

test('account and check-in screens keep keyboard/button guards aligned without consuming note returns', async () => {
  const [spadesSource, checkInSource] = await Promise.all([
    readFile(spadesScreenPath, 'utf8'),
    readFile(checkInScreenPath, 'utf8'),
  ]);

  assert.match(spadesSource, /recoveryToken \? resetPassword\(\) : requestReset\(\)/);
  assert.match(spadesSource, /onPress=\{submitAccountForm\}/);
  assert.match(spadesSource, /onSubmitEditing=\{submitAccountForm\}/);
  assert.match(spadesSource, /accountSubmissionRef\.current/);
  assert.match(spadesSource, /if \(submitting \|\| usernameSubmissionRef\.current\) return;/);
  assert.match(spadesSource, /if \(account && usernameDraft\.trim\(\) === account\.playerHandle\) return;/);

  assert.match(checkInSource, /function handleSubmitAccount\(\)/);
  assert.match(checkInSource, /onSubmitEditing=\{handleSubmitAccount\}/);
  assert.match(checkInSource, /onSubmitEditing=\{handleClaimUsername\}/);
  assert.match(checkInSource, /verificationCode\.trim\(\)\.length === 6/);
  assert.match(checkInSource, /if \(verificationSubmitting \|\| verificationSubmissionRef\.current\) return;/);
  assert.match(checkInSource, /if \(accountSubmitting \|\| accountSubmissionRef\.current\) return;/);
  assert.match(checkInSource, /if \(submitting\) return;/);

  const notesStart = checkInSource.indexOf('label: \'Optional availability note\'');
  const notesEnd = checkInSource.indexOf('value={notes}', notesStart);
  assert.ok(notesStart >= 0 && notesEnd > notesStart);
  assert.match(checkInSource.slice(notesStart, notesEnd), /multiline/);
  assert.doesNotMatch(checkInSource.slice(notesStart, notesEnd), /onSubmitEditing/);
});
