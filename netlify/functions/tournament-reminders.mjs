import { getStoreWithFallback, isEmailLike } from './_account-utils.mjs';
import { emailProviderConfigured, sendPlayerEmail } from './_player-email.mjs';
import {
  buildReminderMessage,
  reminderDeliveryKey,
  reminderIdempotencyKey,
  remindersEnabled,
  reminderWindowStatus,
} from './_scheduled-ops-utils.mjs';
import { listHostedTournaments } from './_tournament-events-utils.mjs';

const MAX_PER_RUN = Math.min(100, Math.max(1, Number(process.env.TOURNAMENT_REMINDER_BATCH_SIZE) || 50));

async function loadSignups(tournamentSlug) {
  const store = getStoreWithFallback('tournament-signups');
  const { blobs } = await store.list({ prefix: `${tournamentSlug}/` });
  const records = await Promise.all(blobs.map((blob) => store.get(blob.key, { type: 'json' })));
  return records.filter((record) => record?.status !== 'withdrawn' && isEmailLike(record?.contactEmail));
}

export async function runTournamentReminders(now = new Date()) {
  if (!remindersEnabled()) {
    return { enabled: false, configured: emailProviderConfigured(), dueEvents: 0, sent: 0, failed: 0 };
  }

  if (!emailProviderConfigured()) {
    throw new Error('Tournament reminders are enabled, but the email provider is not configured.');
  }

  const tournaments = await listHostedTournaments();
  const dueTournaments = tournaments.filter((tournament) => reminderWindowStatus(tournament, now).due);
  const deliveries = [];

  for (const tournament of dueTournaments) {
    const signups = await loadSignups(tournament.slug);
    for (const signup of signups) {
      deliveries.push({ tournament, signup });
    }
  }

  const markerStore = getStoreWithFallback('tournament-reminders');
  let sent = 0;
  let failed = 0;
  let alreadySent = 0;

  for (const { tournament, signup } of deliveries.slice(0, MAX_PER_RUN)) {
    const key = reminderDeliveryKey(tournament, signup);
    const existing = await markerStore.get(key, { type: 'json' });

    if (existing?.sentAt) {
      alreadySent += 1;
      continue;
    }

    const message = buildReminderMessage(tournament, signup);

    try {
      const delivery = await sendPlayerEmail({
        to: signup.contactEmail,
        ...message,
        idempotencyKey: reminderIdempotencyKey(tournament, signup),
      });
      const sentAt = new Date().toISOString();
      await markerStore.setJSON(key, {
        tournamentSlug: tournament.slug,
        signupId: signup.id,
        providerId: delivery.id || '',
        sentAt,
      }, {
        metadata: { tournamentSlug: tournament.slug, sentAt },
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error('Tournament reminder delivery failed', {
        tournamentSlug: tournament.slug,
        message: error instanceof Error ? error.message : 'Unknown email provider error',
      });
    }
  }

  return {
    enabled: true,
    configured: true,
    dueEvents: dueTournaments.length,
    queued: deliveries.length,
    processed: Math.min(deliveries.length, MAX_PER_RUN),
    alreadySent,
    sent,
    failed,
  };
}

export default async function tournamentReminders() {
  try {
    const result = await runTournamentReminders();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error('Tournament reminder run failed', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export const config = {
  schedule: '*/5 * * * *',
};
