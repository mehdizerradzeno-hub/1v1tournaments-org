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
