const SAFE_FAILURE_CLASSES = new Set([
  'account_hub_unavailable',
  'authorization_issue_failed',
  'authorization_contract_mismatch',
  'callback_contract_mismatch',
  'callback_not_allowlisted',
  'callback_state_invalid',
  'destination_unavailable',
  'malformed_destination',
  'unauthenticated',
]);

export function classifyReturnTarget(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol === 'spades-freeplay:') return url.host === 'shared-account-callback' ? 'custom-scheme-callback' : 'custom-scheme-other';
    if (url.protocol !== 'https:') return 'other';
    if (url.hostname === 'onev1-spades-native-auth-qa-20260903.onrender.com') return 'qa-spades';
    if (url.hostname === '1v1spades.com' || url.hostname === 'www.1v1spades.com') return 'production-spades';
    if (url.hostname.endsWith('.netlify.app')) return 'qa-hub-or-other-netlify';
    return 'other-https';
  } catch {
    return 'unknown';
  }
}

export function safeReturnFailureClass(error) {
  return SAFE_FAILURE_CLASSES.has(error?.code) ? error.code : 'unknown';
}

export function persistDevReturnStatus(status, storage = globalThis.sessionStorage) {
  if (process.env.APP_ENV !== 'qa-native-auth') return;
  try {
    storage?.setItem('qa-native-return-status', JSON.stringify(status));
  } catch {
    // Diagnostics must never affect the handoff.
  }
}
