import { getStoreWithFallback } from './_account-utils.mjs';
import {
  buildEuchrePilotReadiness,
  normalizeEuchrePilotPolicy,
} from '../../src/lib/euchrePilot.js';

const PILOT_STORE_NAME = 'euchre-tournament-pilots';

function pilotKey(tournamentSlug) {
  return `${String(tournamentSlug || '').trim()}.json`;
}

export async function loadEuchrePilotPolicy(tournamentSlug) {
  const slug = String(tournamentSlug || '').trim();

  if (!slug) return null;

  const store = getStoreWithFallback(PILOT_STORE_NAME);
  const policy = await store.get(pilotKey(slug), { type: 'json' });

  return policy ? normalizeEuchrePilotPolicy(policy) : null;
}

export async function saveEuchrePilotPolicy(policy) {
  const normalized = normalizeEuchrePilotPolicy(policy);
  const store = getStoreWithFallback(PILOT_STORE_NAME);

  await store.setJSON(pilotKey(normalized.tournamentSlug), normalized, {
    metadata: {
      tournamentSlug: normalized.tournamentSlug,
      game: 'euchre',
      access: 'invite-only',
      capacity: normalized.capacity,
      updatedAt: normalized.updatedAt,
    },
  });

  return normalized;
}

export async function loadEuchrePilotReadiness(policy) {
  const signupStore = getStoreWithFallback('tournament-signups');
  const bracketStore = getStoreWithFallback('tournament-brackets');
  const { blobs } = await signupStore.list({ prefix: `${policy.tournamentSlug}/` });
  const [signupReads, bracket] = await Promise.all([
    Promise.all(blobs.map((blob) => signupStore.get(blob.key, { type: 'json' }))),
    bracketStore.get(`${policy.tournamentSlug}.json`, { type: 'json' }),
  ]);

  return buildEuchrePilotReadiness({
    policy,
    signups: signupReads.filter(Boolean),
    bracket,
  });
}
