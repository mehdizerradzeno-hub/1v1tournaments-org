export const SHARED_ACCOUNT_ACTIONS = Object.freeze([
  { id: 'signin', label: 'Sign In' },
  { id: 'create', label: 'Create Account' },
  { id: 'reset', label: 'Reset Password' },
]);

const TOURNAMENT_CHECK_IN_PATH = /^\/check-in\/[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const SPADES_HOSTING_DESTINATION = 'https://1v1spades.com/hosting';

export function resolveTournamentAccountDestination(value) {
  const destination = Array.isArray(value) ? value[0] : value;

  if (typeof destination !== 'string') return '/';

  const normalizedDestination = destination.trim();
  if (normalizedDestination === SPADES_HOSTING_DESTINATION) {
    return normalizedDestination;
  }
  return TOURNAMENT_CHECK_IN_PATH.test(normalizedDestination)
    ? normalizedDestination
    : '/';
}

export function buildTournamentAccountPath(returnTo = '/', mode = 'signin') {
  const destination = resolveTournamentAccountDestination(returnTo);
  const accountMode = normalizeTournamentAccountMode(mode);
  const search = new URLSearchParams({ mode: accountMode });

  if (destination !== '/') {
    search.set('returnTo', destination);
  }

  return `/account?${search.toString()}`;
}

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

export function resolveAccountConnectMode(
  requestedMode,
  {
    hasAccount = false,
    hasRecoveryCredential = false,
    signedOutManageFallback = false,
  } = {},
) {
  if (requestedMode === 'reset' && hasRecoveryCredential) return 'reset';
  if (hasAccount) return 'manage';
  if (requestedMode === 'manage' && signedOutManageFallback) return 'signin';
  return requestedMode;
}

export function shouldShowConnectedAccount(account, mode) {
  return Boolean(account) && mode !== 'reset';
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
