import test from 'node:test';
import assert from 'node:assert/strict';

import {
  backupKey,
  backupStoreNames,
  buildReminderMessage,
  reminderDeliveryKey,
  reminderWindowStatus,
} from '../netlify/functions/_scheduled-ops-utils.mjs';

const tournament = {
  slug: 'spades-friday-cup',
  title: 'Spades Friday Cup',
  date: '2026-07-17T22:00:00.000Z',
  status: 'upcoming',
  registrationStatus: 'open',
};

test('30-minute reminders only become due inside the guarded window', () => {
  assert.equal(reminderWindowStatus(tournament, '2026-07-17T21:30:00.000Z').due, true);
  assert.equal(reminderWindowStatus(tournament, '2026-07-17T21:20:00.000Z').due, false);
  assert.equal(reminderWindowStatus(tournament, '2026-07-17T21:40:00.000Z').due, false);
  assert.equal(reminderWindowStatus({ ...tournament, status: 'complete' }, '2026-07-17T21:30:00.000Z').due, false);
});

test('reminder delivery keys are stable without exposing player email', () => {
  const signup = { id: 'signup-1', contactEmail: 'player@example.com', playerName: 'Player One' };
  const key = reminderDeliveryKey(tournament, signup);

  assert.equal(key, reminderDeliveryKey(tournament, signup));
  assert.doesNotMatch(key, /player@example\.com/);
});

test('reminder copy points players to the tournament hub', () => {
  const message = buildReminderMessage(tournament, { playerName: 'Player One' });
  assert.match(message.subject, /starts in about 30 minutes/);
  assert.match(message.text, /https:\/\/1v1tournaments\.org\/tournaments\/spades-friday-cup/);
});

test('daily backups exclude account credentials and use dated keys', () => {
  const stores = backupStoreNames();

  assert.ok(stores.includes('tournament-events'));
  assert.ok(stores.includes('tournament-brackets'));
  assert.ok(stores.includes('sponsor-inquiries'));
  assert.ok(!stores.includes('player-accounts'));
  assert.ok(!stores.includes('player-sessions'));
  assert.equal(backupKey('2026-07-16T12:34:56.000Z'), '2026-07-16/2026-07-16T12-34-56.000Z.json');
});
