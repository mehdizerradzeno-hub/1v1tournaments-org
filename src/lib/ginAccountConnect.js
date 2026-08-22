import { prepareSharedAccountLaunch } from './sharedAccountLaunch.js';

export const GIN_ACCOUNT_ENTRY_ROUTE = '/connect/gin';
export const GIN_ACCOUNT_DESTINATION = 'https://onev1-gin-staging.onrender.com/';
export const GIN_SIGNED_OUT_ACCOUNT_ACTIONS = Object.freeze([
  { id: 'signin', label: 'Sign In' },
  { id: 'create', label: 'Create Account' },
  { id: 'reset', label: 'Forgot / Reset Password' },
]);

export function normalizeGinAccountMode(value) {
  const mode = Array.isArray(value) ? value[0] : value;
  return mode === 'create' || mode === 'reset' || mode === 'manage' ? mode : 'signin';
}

export function prepareGinAccountReturn(fetchImpl = globalThis.fetch) {
  return prepareSharedAccountLaunch({
    audience: 'gin',
    destinationUrl: GIN_ACCOUNT_DESTINATION,
    fetchImpl,
    requireAccount: true,
  });
}
