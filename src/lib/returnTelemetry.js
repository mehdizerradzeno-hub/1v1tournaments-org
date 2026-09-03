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

export const QA_RETURN_TELEMETRY_KEY = 'qa-spades-native-return-telemetry-v1';
export const DEFAULT_RETURN_STATUS = Object.freeze({
  returnClicked: false, sourceClass: 'none', nativeContextPresent: false, statePresent: false,
  authorizationIssueAttempted: false, authorizationIssueSucceeded: false, authorizationCodePresent: false,
  returnedStatePresent: false, finalTargetClass: 'none', navigationAttempted: false,
  navigationMethod: 'none', safeFailureClass: '',
  hubInitialQueryCaptured: false, hubInitialStatePresent: false, hubInitialStateLength: 0,
  hubInitialSourceClass: 'none', hubInitialRedirectUriPresent: false,
  hubCurrentStatePresent: false, hubCurrentStateLength: 0,
  hubCurrentSourceClass: 'none', hubCurrentRedirectUriPresent: false,
  telemetryAttemptActive: false, hubTelemetryAttemptMatched: false, staleHubTelemetryIgnored: false,
  hubTelemetryAttemptParamPresent: false,
});

export function isQaReturnTelemetryEnvironment() {
  return process.env.APP_ENV === 'qa-native-auth'
    || globalThis.location?.hostname === '1v1tournaments-native-auth-qa-20260903.netlify.app';
}

export function loadDevReturnStatus(storage = globalThis.localStorage, telemetryAttemptId = '') {
  if (!isQaReturnTelemetryEnvironment()) return null;
  try {
    const value = JSON.parse(storage?.getItem(QA_RETURN_TELEMETRY_KEY) || 'null');
    if (!value || typeof value !== 'object' || value.telemetryAttemptId !== telemetryAttemptId) {
      return value ? { ...DEFAULT_RETURN_STATUS, telemetryAttemptActive: Boolean(telemetryAttemptId), staleHubTelemetryIgnored: true } : null;
    }
    return { ...DEFAULT_RETURN_STATUS, ...value.data, telemetryAttemptActive: true, hubTelemetryAttemptMatched: true, hubTelemetryAttemptParamPresent: true };
  } catch { return null; }
}

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

export function persistDevReturnStatus(status, storage = globalThis.localStorage, telemetryAttemptId = '') {
  if (!isQaReturnTelemetryEnvironment()) return;
  if (!telemetryAttemptId) return;
  try {
    storage?.setItem(QA_RETURN_TELEMETRY_KEY, JSON.stringify({ telemetryAttemptId, data: { ...DEFAULT_RETURN_STATUS, ...status } }));
  } catch {
    // Diagnostics must never affect the handoff.
  }
}

export function clearDevReturnStatus(storage = globalThis.localStorage) {
  if (!isQaReturnTelemetryEnvironment()) return;
  try { storage?.removeItem(QA_RETURN_TELEMETRY_KEY); } catch { /* Diagnostics must never affect the handoff. */ }
}
