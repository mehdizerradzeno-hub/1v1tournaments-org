import { createHash } from 'node:crypto';

const MINUTE_MS = 60 * 1000;

export function remindersEnabled() {
  return String(process.env.TOURNAMENT_REMINDERS_ENABLED || '').trim().toLowerCase() === 'true';
}

export function reminderWindowStatus(tournament, now = new Date()) {
  const startAt = new Date(tournament?.date || tournament?.startAt || '').getTime();
  const nowAt = new Date(now).getTime();
  const minutesUntilStart = (startAt - nowAt) / MINUTE_MS;
  const due = tournament?.status === 'upcoming'
    && tournament?.registrationStatus !== 'closed'
    && Number.isFinite(minutesUntilStart)
    && minutesUntilStart >= 25
    && minutesUntilStart <= 35;

  return {
    due,
    minutesUntilStart: Number.isFinite(minutesUntilStart) ? minutesUntilStart : null,
  };
}

export function reminderDeliveryKey(tournament, signup) {
  const identity = [
    tournament?.slug,
    tournament?.date || tournament?.startAt,
    signup?.accountId || signup?.id || signup?.contactEmail,
  ].join(':');
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 40);

  return `${tournament?.slug || 'tournament'}/${digest}.json`;
}

export function reminderIdempotencyKey(tournament, signup) {
  return `tournament-reminder-${createHash('sha256')
    .update(reminderDeliveryKey(tournament, signup))
    .digest('hex')}`;
}

export function buildReminderMessage(tournament, signup) {
  const startLabel = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  }).format(new Date(tournament.date || tournament.startAt));
  const eventUrl = `https://1v1tournaments.org/tournaments/${encodeURIComponent(tournament.slug)}`;

  return {
    subject: `${tournament.title} starts in about 30 minutes`,
    text: `Hi ${signup.playerName || 'Player'},\n\n${tournament.title} starts at ${startLabel} ET. Open the tournament hub to check your roster status and find your match when the bracket is ready:\n\n${eventUrl}\n\nGood luck!`,
  };
}

export function backupStoreNames() {
  return [
    'tournament-events',
    'tournament-settings',
    'tournament-signups',
    'tournament-brackets',
    'sponsor-inquiries',
    'sponsor-prospects',
    'sponsor-outreach-drafts',
    'sponsor-deals',
  ];
}

export function backupKey(createdAt = new Date()) {
  const date = new Date(createdAt);
  const iso = date.toISOString();
  return `${iso.slice(0, 10)}/${iso.replaceAll(':', '-')}.json`;
}
