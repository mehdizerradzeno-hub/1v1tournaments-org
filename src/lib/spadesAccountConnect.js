import { prepareSharedAccountLaunch } from './sharedAccountLaunch.js';

export const SPADES_ACCOUNT_ENTRY_ROUTE = '/connect/spades';
export const SPADES_ACCOUNT_DESTINATION = 'https://1v1spades.com/';
export const SPADES_SIGNED_OUT_ACCOUNT_ACTIONS = Object.freeze([
  { id: 'signin', label: 'Sign In' },
  { id: 'create', label: 'Create Account' },
  { id: 'reset', label: 'Forgot / Reset Password' },
]);

export function normalizeSpadesAccountMode(value) {
  const mode = Array.isArray(value) ? value[0] : value;
  return mode === 'create' || mode === 'reset' || mode === 'manage' ? mode : 'signin';
}

export function prepareSpadesAccountReturn(optionsOrFetch = globalThis.fetch) {
  const isFetch = typeof optionsOrFetch === 'function';
  const options = isFetch ? {} : optionsOrFetch || {};
  return prepareSharedAccountLaunch({
    audience: 'spades',
    destinationUrl: SPADES_ACCOUNT_DESTINATION,
    fetchImpl: isFetch ? optionsOrFetch : globalThis.fetch,
    requireAccount: true,
    redirectUri: options.redirectUri,
    source: options.source,
    state: options.state,
  });
}
