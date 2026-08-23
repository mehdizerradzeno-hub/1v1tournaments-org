export const SHARED_ACCOUNT_ACTIONS = Object.freeze([
  { id: 'signin', label: 'Sign In' },
  { id: 'create', label: 'Create Account' },
  { id: 'reset', label: 'Reset Password' },
]);

export function normalizeTournamentAccountMode(value) {
  const mode = Array.isArray(value) ? value[0] : value;
  return mode === 'create' || mode === 'reset' || mode === 'manage' ? mode : 'signin';
}

export function readPasswordRecoveryFragment(hash = globalThis.location?.hash || '') {
  const fragment = String(hash || '').replace(/^#/, '');
  const params = new URLSearchParams(fragment);

  return {
    email: String(params.get('email') || '').trim().toLowerCase().slice(0, 500),
    token: String(params.get('token') || '').trim().slice(0, 512),
  };
}

export function clearPasswordRecoveryFragment(
  history = globalThis.history,
  location = globalThis.location,
) {
  if (!history?.replaceState || !location?.hash) return false;

  const search = new URLSearchParams(location.search || '');
  if (search.get('mode') === 'reset') search.delete('mode');
  const query = search.toString();

  history.replaceState(null, '', `${location.pathname || '/account'}${query ? `?${query}` : ''}`);
  return true;
}

export async function runAccountHandoffOnce(handoffRef, operation) {
  if (handoffRef.current) {
    return { executed: false, value: null };
  }

  handoffRef.current = true;

  try {
    return { executed: true, value: await operation() };
  } catch (error) {
    handoffRef.current = false;
    throw error;
  }
}

export function resolveAccountConnectMode(requestedMode, { hasAccount = false, signedOutManageFallback = false } = {}) {
  if (hasAccount) return 'manage';
  if (requestedMode === 'manage' && signedOutManageFallback) return 'signin';
  return requestedMode;
}

export function verifiedAccountReturnCopy(gameName) {
  return `Your verified 1v1 account is ready to return to ${gameName}.`;
}

export function returnToGameWithoutAccountChange(destination, location = globalThis.location) {
  location?.assign?.(destination);
}

export async function signOutAccountConnectSession(logoutOperation) {
  const result = await logoutOperation();

  if (result?.ok !== true || result.account !== null) {
    throw new Error('Player account could not be signed out.');
  }

  return { account: null, mode: 'signin' };
}
