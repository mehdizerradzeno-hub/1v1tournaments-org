import { prepareSharedAccountLaunch } from './sharedAccountLaunch.js';

export const EUCHRE_ACCOUNT_ENTRY_ROUTE = '/connect/euchre';
export const EUCHRE_ACCOUNT_DESTINATION = 'https://onev1-euchre-preview.onrender.com/';
export const EUCHRE_SIGNED_OUT_ACCOUNT_ACTIONS = Object.freeze([
  { id: 'signin', label: 'Sign In' },
  { id: 'create', label: 'Create Account' },
  { id: 'reset', label: 'Forgot / Reset Password' },
]);

export function normalizeEuchreAccountMode(value) {
  const mode = Array.isArray(value) ? value[0] : value;
  return mode === 'create' || mode === 'reset' || mode === 'manage' ? mode : 'signin';
}

export function prepareEuchreAccountReturn(fetchImpl = globalThis.fetch) {
  return prepareSharedAccountLaunch({
    audience: 'euchre',
    destinationUrl: EUCHRE_ACCOUNT_DESTINATION,
    fetchImpl,
    requireAccount: true,
  });
}
