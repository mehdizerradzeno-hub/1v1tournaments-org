import { accountCanonicalId, accountKey, hasClaimedPlayerUsername, playerUsernameForAccount } from './_account-utils.mjs';
import {
  requireTournamentAdmin, isHostAccount,
  HOST_ACCOUNT_PLAYER_BLOCK_CODE, HOST_ACCOUNT_PLAYER_BLOCK_MESSAGE,
} from './_host-auth.mjs';
import { EuchreLeagueError, isEuchreLeagueUsername } from '../../src/lib/euchreLeagueSeason.js';

/** Reuse the existing host key/allowlist gate, then narrow account hosts to ownership. */
export async function requireEuchreLeagueHost(event, league = null, dependencies = {}) {
  const check = await (dependencies.requireTournamentAdmin || requireTournamentAdmin)(event);
  if (check.error) throw new EuchreLeagueError('host_entitlement_required', check.error.message, check.error.statusCode);
  if (check.method !== 'token' && check.method !== 'account') {
    throw new EuchreLeagueError('host_entitlement_required', 'Host entitlement could not be verified.', 403);
  }
  const canonicalAccountId = check.method === 'token' ? 'hub-host-key' : accountCanonicalId(check.account);
  if (!canonicalAccountId) throw new EuchreLeagueError('host_identity_required', 'A canonical host identity is required.', 403);
  if (league && check.method !== 'token' && league.ownerCanonicalAccountId !== canonicalAccountId) {
    throw new EuchreLeagueError('league_owner_required', 'Only this league’s organizer may manage it.', 403);
  }
  return { method: check.method, account: check.account, canonicalAccountId };
}

/** Enrollment must use the shared account, never a browser-provided display name. */
export function euchreLeaguePlayerIdentity(account, dependencies = {}) {
  if (!account) throw new EuchreLeagueError('authentication_required', 'Sign in to your 1v1 account before joining.', 401);
  if ((dependencies.isHostAccount || isHostAccount)(account)) {
    throw new EuchreLeagueError(HOST_ACCOUNT_PLAYER_BLOCK_CODE, HOST_ACCOUNT_PLAYER_BLOCK_MESSAGE, 403);
  }
  const canonicalAccountId = accountCanonicalId(account);
  const username = playerUsernameForAccount(account);
  if (!canonicalAccountId || !isEuchreLeagueUsername(username) || !hasClaimedPlayerUsername(account)) {
    throw new EuchreLeagueError('username_required', 'Claim your unique 1v1 username before joining.', 409);
  }
  return { canonicalAccountId, accountId: account.id, username,
    ...(account.email ? { accountRecordKey: accountKey(account.email) } : {}) };
}
