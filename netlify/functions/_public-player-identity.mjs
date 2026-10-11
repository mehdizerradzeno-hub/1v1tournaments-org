import {
  hasClaimedPlayerUsername,
  playerUsernameForAccount,
} from './_account-utils.mjs';

/**
 * Browser-facing competitive identity is always the claimed permanent
 * username. Legacy display names are intentionally not linkable profiles.
 */
export function normalizePublicPlayerHandle(value) {
  const handle = String(value || '').trim().replace(/^@/, '').toLowerCase();
  return handle.length >= 3 && handle.length <= 20 && /^[a-z0-9_]+$/.test(handle)
    ? handle
    : '';
}

export function publicPlayerIdentity(account) {
  if (!hasClaimedPlayerUsername(account)) return null;
  const handle = normalizePublicPlayerHandle(playerUsernameForAccount(account));
  return handle ? { handle, displayName: handle } : null;
}
