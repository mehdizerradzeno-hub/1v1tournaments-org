import { prepareSharedAccountLaunch } from './sharedAccountLaunch.js';

export const SPADES_ACCOUNT_ENTRY_ROUTE = '/connect/spades';
const PRODUCTION_SPADES_ACCOUNT_DESTINATION = 'https://1v1spades.com/';
export const SPADES_ACCOUNT_RETURN_ORIGINS = Object.freeze([
  'https://1v1spades.com',
  'https://onev1-spades-phase1-qa-20260923.onrender.com',
  'https://onev1-spades-c5e-accepted-qa.onrender.com',
]);
const SPADES_ACCOUNT_RETURN_ORIGIN_SET = new Set(SPADES_ACCOUNT_RETURN_ORIGINS);

function normalizeSpadesAccountDestination(value, label) {
  try {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${label} must be configured`);
    }
    const url = new URL(value.trim());
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.search
      || url.hash
      || url.pathname !== '/'
      || !SPADES_ACCOUNT_RETURN_ORIGIN_SET.has(url.origin)
    ) {
      throw new Error('Spades account destination must be an approved credential-free HTTPS origin');
    }
    return `${url.origin}/`;
  } catch (error) {
    throw new Error(`Invalid ${label}`, { cause: error });
  }
}

export function spadesAccountDestination(
  configuredValue = process.env.EXPO_PUBLIC_SPADES_ACCOUNT_DESTINATION,
  qaEnvironment = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase().includes('qa') === true,
) {
  if (!configuredValue) {
    if (qaEnvironment) {
      throw new Error('EXPO_PUBLIC_SPADES_ACCOUNT_DESTINATION is required in QA');
    }
    return PRODUCTION_SPADES_ACCOUNT_DESTINATION;
  }

  const destination = normalizeSpadesAccountDestination(
    configuredValue,
    'EXPO_PUBLIC_SPADES_ACCOUNT_DESTINATION',
  );
  if (qaEnvironment && destination === PRODUCTION_SPADES_ACCOUNT_DESTINATION) {
    throw new Error('Invalid EXPO_PUBLIC_SPADES_ACCOUNT_DESTINATION');
  }
  return destination;
}

export const SPADES_ACCOUNT_DESTINATION = spadesAccountDestination();
export const SPADES_SIGNED_OUT_ACCOUNT_ACTIONS = Object.freeze([
  { id: 'signin', label: 'Sign In' },
  { id: 'create', label: 'Create Account' },
  { id: 'reset', label: 'Forgot / Reset Password' },
]);

export function normalizeSpadesAccountMode(value) {
  const mode = Array.isArray(value) ? value[0] : value;
  return mode === 'create' || mode === 'reset' || mode === 'manage' ? mode : 'signin';
}

/**
 * Browser query parameters are untrusted. A Spades account code may only be
 * returned to one of the explicitly reviewed game origins, never to an
 * arbitrary URL that happens to be supplied to the Account Hub route.
 */
export function resolveSpadesAccountReturnDestination(returnTo) {
  if (returnTo === undefined) return SPADES_ACCOUNT_DESTINATION;
  if (Array.isArray(returnTo)) {
    throw new Error('Invalid Spades account return target');
  }
  return normalizeSpadesAccountDestination(returnTo, 'Spades account return target');
}

export function prepareSpadesAccountReturn(
  fetchImpl = globalThis.fetch,
  destination = SPADES_ACCOUNT_DESTINATION,
) {
  return prepareSharedAccountLaunch({
    audience: 'spades',
    destinationUrl: normalizeSpadesAccountDestination(destination, 'Spades account return target'),
    fetchImpl,
    requireAccount: true,
  });
}
