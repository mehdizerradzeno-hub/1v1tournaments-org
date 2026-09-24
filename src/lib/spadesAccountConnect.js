import { prepareSharedAccountLaunch } from './sharedAccountLaunch.js';

export const SPADES_ACCOUNT_ENTRY_ROUTE = '/connect/spades';
export const SPADES_ACCOUNT_DESTINATION = 'https://1v1spades.com/';
export const SPADES_ACCOUNT_QA_DESTINATION =
  'https://onev1-spades-phase1-qa-20260923.onrender.com/';

const SPADES_ACCOUNT_ALLOWED_RETURN_ORIGINS = new Set([
  new URL(SPADES_ACCOUNT_DESTINATION).origin,
  new URL(SPADES_ACCOUNT_QA_DESTINATION).origin,
]);

export function resolveSpadesAccountDestination(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return SPADES_ACCOUNT_DESTINATION;

  try {
    const url = new URL(String(candidate).trim());

    if (
      url.protocol !== 'https:'
      || !SPADES_ACCOUNT_ALLOWED_RETURN_ORIGINS.has(url.origin)
    ) {
      return SPADES_ACCOUNT_DESTINATION;
    }

    return `${url.origin}/`;
  } catch {
    return SPADES_ACCOUNT_DESTINATION;
  }
}
export const SPADES_SIGNED_OUT_ACCOUNT_ACTIONS = Object.freeze([
  { id: 'signin', label: 'Sign In' },
  { id: 'create', label: 'Create Account' },
  { id: 'reset', label: 'Forgot / Reset Password' },
]);

export function normalizeSpadesAccountMode(value) {
  const mode = Array.isArray(value) ? value[0] : value;
  return mode === 'create' || mode === 'reset' || mode === 'manage' ? mode : 'signin';
}

export function prepareSpadesAccountReturn(
  fetchImpl = globalThis.fetch,
  destinationUrl = SPADES_ACCOUNT_DESTINATION,
) {
  return prepareSharedAccountLaunch({
    audience: 'spades',
    destinationUrl: resolveSpadesAccountDestination(destinationUrl),
    fetchImpl,
    requireAccount: true,
  });
}
