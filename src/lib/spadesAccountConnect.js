import { prepareSharedAccountLaunch } from './sharedAccountLaunch.js';

export const SPADES_ACCOUNT_ENTRY_ROUTE = '/connect/spades';
const PRODUCTION_SPADES_ACCOUNT_DESTINATION = 'https://1v1spades.com/';

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

  try {
    const url = new URL(configuredValue);
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.search
      || url.hash
      || (url.pathname !== '/' && url.pathname !== '')
      || (qaEnvironment && ['1v1spades.com', 'www.1v1spades.com'].includes(url.hostname))
    ) {
      throw new Error('Spades account destination must be a credential-free HTTPS origin');
    }
    return `${url.origin}/`;
  } catch (error) {
    throw new Error('Invalid EXPO_PUBLIC_SPADES_ACCOUNT_DESTINATION', { cause: error });
  }
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

export function prepareSpadesAccountReturn(fetchImpl = globalThis.fetch) {
  return prepareSharedAccountLaunch({
    audience: 'spades',
    destinationUrl: SPADES_ACCOUNT_DESTINATION,
    fetchImpl,
    requireAccount: true,
  });
}
