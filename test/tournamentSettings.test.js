import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dateToScheduleFields,
  getEffectiveRegistrationStatus,
  getRegistrationStatusMeta,
  mergeTournamentSettings,
  zonedDateTimeToIso,
} from '../src/lib/tournamentSettings.js';

const tournament = {
  slug: 'spades-summer-series',
  date: '2026-07-18T22:00:00.000Z',
  timeZone: 'America/New_York',
  timeZoneLabel: 'ET',
  checkIn: {
    status: 'Registration open',
    preview: '30 min early',
    window: 'Opens 30 minutes before the start time.',
  },
  agenda: [],
};

test('live tournament settings override public schedule copy', () => {
  const merged = mergeTournamentSettings(tournament, {
    date: '2026-07-26T00:30:00.000Z',
    timeZone: 'America/New_York',
    timeZoneLabel: 'ET',
    registrationStatus: 'closed',
    checkInLeadMinutes: 45,
  });

  assert.equal(merged.date, '2026-07-26T00:30:00.000Z');
  assert.equal(merged.registrationStatus, 'closed');
  assert.equal(merged.checkIn.status, 'Registration closed');
  assert.equal(merged.checkIn.window, 'Registration is closed by the host.');
  assert.equal(merged.checkIn.preview, '45 min early');
  assert.equal(merged.agenda[0].label, 'Check-in opens');
});

test('schedule form fields round-trip through a named timezone', () => {
  const iso = zonedDateTimeToIso('2026-07-18', '18:00', 'America/New_York');

  assert.equal(iso, '2026-07-18T22:00:00.000Z');
  assert.deepEqual(dateToScheduleFields(iso, 'America/New_York'), {
    date: '2026-07-18',
    time: '18:00',
  });
});

test('unknown registration states fall back to open', () => {
  assert.equal(getRegistrationStatusMeta('surprise').value, 'open');
});

test('effective registration closes after the event start time', () => {
  const status = getEffectiveRegistrationStatus(tournament, {
    now: new Date('2026-07-18T22:01:00.000Z'),
  });

  assert.equal(status.value, 'closed');
  assert.equal(status.reason, 'event-started');
});

test('effective registration closes when a live bracket exists', () => {
  const status = getEffectiveRegistrationStatus(tournament, {
    hasLiveBracket: true,
    now: new Date('2026-07-18T20:00:00.000Z'),
  });

  assert.equal(status.value, 'closed');
  assert.equal(status.reason, 'bracket-live');
});
