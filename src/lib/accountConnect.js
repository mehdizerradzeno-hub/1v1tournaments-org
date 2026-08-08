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
