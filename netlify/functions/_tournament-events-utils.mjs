import { cleanText, getStoreWithFallback } from './_account-utils.mjs';
import { createTournamentRecord, slugifyTournamentTitle } from '../../src/lib/tournamentCatalog.js';

const STORE_NAME = 'tournament-events';

function eventKey(tournamentSlug) {
  return `${cleanText(tournamentSlug)}.json`;
}

function byDateAsc(left, right) {
  const leftTime = new Date(left.date).getTime();
  const rightTime = new Date(right.date).getTime();

  if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return 0;
  if (!Number.isFinite(leftTime)) return 1;
  if (!Number.isFinite(rightTime)) return -1;
  return leftTime - rightTime;
}

export function normalizeHostedTournament(payload = {}) {
  const title = cleanText(payload.title);
  const slug = slugifyTournamentTitle(payload.slug || title);
  const date = cleanText(payload.date || payload.startAt);
  const parsedDate = new Date(date);

  if (!title) {
    return { error: 'Enter a tournament title before saving.' };
  }

  if (!slug) {
    return { error: 'Enter a URL slug before saving.' };
  }

  if (!date || Number.isNaN(parsedDate.getTime())) {
    return { error: 'Enter a valid tournament date and time.' };
  }

  return createTournamentRecord({
    ...payload,
    slug,
    title,
    date: parsedDate.toISOString(),
    hosted: true,
  });
}

export async function listHostedTournaments() {
  const store = getStoreWithFallback(STORE_NAME);
  const { blobs } = await store.list();
  const tournaments = await Promise.all(
    blobs.map((blob) => store.get(blob.key, { type: 'json' })),
  );

  return tournaments.filter(Boolean).sort(byDateAsc);
}

export async function loadHostedTournament(tournamentSlug) {
  const slug = cleanText(tournamentSlug);

  if (!slug) {
    return null;
  }

  const store = getStoreWithFallback(STORE_NAME);
  return store.get(eventKey(slug), { type: 'json' });
}

export async function saveHostedTournament(tournament, account = null) {
  const store = getStoreWithFallback(STORE_NAME);
  const updatedAt = new Date().toISOString();
  const nextTournament = {
    ...tournament,
    updatedAt,
    updatedBy: account?.email || 'token',
  };

  await store.setJSON(eventKey(nextTournament.slug), nextTournament, {
    metadata: {
      tournamentSlug: nextTournament.slug,
      gameSlug: nextTournament.gameSlug,
      date: nextTournament.date,
      status: nextTournament.status,
      updatedAt,
    },
  });

  return nextTournament;
}
