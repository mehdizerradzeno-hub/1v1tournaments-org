import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOST_ACCOUNT_PLAYER_BLOCK_CODE,
  HOST_ACCOUNT_PLAYER_BLOCK_MESSAGE,
  isHostAccount,
  isHostSignup,
} from '../netlify/functions/_host-auth.mjs';

const checkInSource = readFileSync(
  fileURLToPath(new URL('../src/screens/CheckInScreen.jsx', import.meta.url)),
  'utf8',
);
const tournamentSource = readFileSync(
  fileURLToPath(new URL('../src/screens/TournamentScreen.jsx', import.meta.url)),
  'utf8',
);
const signupSource = readFileSync(
  fileURLToPath(new URL('../netlify/functions/tournament-signup.mjs', import.meta.url)),
  'utf8',
);
const bracketSource = readFileSync(
  fileURLToPath(new URL('../netlify/functions/tournament-bracket.mjs', import.meta.url)),
  'utf8',
);
const statusSource = readFileSync(
  fileURLToPath(new URL('../netlify/functions/tournament-player-status.mjs', import.meta.url)),
  'utf8',
);
const accessSource = readFileSync(
  fileURLToPath(new URL('../netlify/functions/tournament-match-access.mjs', import.meta.url)),
  'utf8',
);

test('host allowlist identifies the admin account without treating ordinary players as hosts', () => {
  const previousIds = process.env.TOURNAMENT_HOST_ACCOUNT_IDS;
  const previousEmails = process.env.TOURNAMENT_HOST_ACCOUNT_EMAILS;

  try {
    process.env.TOURNAMENT_HOST_ACCOUNT_IDS = 'acct-host';
    process.env.TOURNAMENT_HOST_ACCOUNT_EMAILS = 'host@example.com';

    assert.equal(isHostAccount({ id: 'acct-host', email: 'not-the-email@example.com' }), true);
    assert.equal(isHostAccount({ id: 'acct-player', email: 'host@example.com' }), true);
    assert.equal(isHostAccount({ id: 'acct-player', email: 'player@example.com' }), false);
    assert.equal(isHostSignup({ accountId: 'acct-host', accountEmail: 'host@example.com' }), true);
    assert.equal(isHostSignup({ accountId: 'acct-player', accountEmail: 'player@example.com' }), false);
  } finally {
    if (previousIds === undefined) delete process.env.TOURNAMENT_HOST_ACCOUNT_IDS;
    else process.env.TOURNAMENT_HOST_ACCOUNT_IDS = previousIds;
    if (previousEmails === undefined) delete process.env.TOURNAMENT_HOST_ACCOUNT_EMAILS;
    else process.env.TOURNAMENT_HOST_ACCOUNT_EMAILS = previousEmails;
  }
});

test('host player admission has one explicit fail-closed contract', () => {
  assert.equal(HOST_ACCOUNT_PLAYER_BLOCK_CODE, 'host_account_cannot_play');
  assert.match(HOST_ACCOUNT_PLAYER_BLOCK_MESSAGE, /cannot join them as players/i);
  assert.match(signupSource, /isHostAccount\(account\)/);
  assert.match(signupSource, /HOST_ACCOUNT_PLAYER_BLOCK_CODE/);
  assert.match(bracketSource, /!isHostSignup\(signup\)/);
  assert.match(statusSource, /isHostAccount\(account\)/);
  assert.match(statusSource, /HOST_ACCOUNT_PLAYER_BLOCK_CODE/);
  assert.match(accessSource, /isHostAccount\(account\)/);
  assert.match(accessSource, /HOST_ACCOUNT_PLAYER_BLOCK_CODE/);
  assert.match(accessSource, /isHostAccount\(\{ id: record\.accountId, email: record\.accountEmail \}\)/);
});

test('host UI removes the player action and routes the account to host controls', () => {
  assert.match(checkInSource, /const hostAccount = Boolean\(account\?\.hostApproved\)/);
  assert.match(checkInSource, /Host account — player signup disabled/);
  assert.match(checkInSource, /Open Host controls/);
  assert.match(tournamentSource, /account\?\.hostApproved/);
  assert.match(tournamentSource, /Host account cannot play/);
  assert.match(tournamentSource, /href="\/admin"/);
});
