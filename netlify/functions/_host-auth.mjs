import { cleanEmail, cleanText, getAccountFromEvent } from './_account-utils.mjs';

function parseAllowlist(value) {
  return String(value || '')
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getAdminToken() {
  return process.env.TOURNAMENT_ADMIN_TOKEN || '';
}

export function getBearerToken(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export function getHostAllowlist() {
  return {
    accountIds: parseAllowlist(process.env.TOURNAMENT_HOST_ACCOUNT_IDS),
    emails: parseAllowlist(process.env.TOURNAMENT_HOST_ACCOUNT_EMAILS).map(cleanEmail),
  };
}

export function isHostAccount(account) {
  if (!account) {
    return false;
  }

  const allowlist = getHostAllowlist();
  const accountId = cleanText(account.id);
  const accountEmail = cleanEmail(account.email);

  return (
    (accountId && allowlist.accountIds.includes(accountId)) ||
    (accountEmail && allowlist.emails.includes(accountEmail))
  );
}

export function hasHostAllowlist() {
  const allowlist = getHostAllowlist();
  return allowlist.accountIds.length > 0 || allowlist.emails.length > 0;
}

export async function requireTournamentAdmin(event) {
  const adminToken = getAdminToken();
  const bearerToken = getBearerToken(event);

  if (adminToken && bearerToken === adminToken) {
    return { ok: true, method: 'token', account: null };
  }

  const account = await getAccountFromEvent(event);

  if (isHostAccount(account)) {
    return { ok: true, method: 'account', account };
  }

  if (!adminToken && !hasHostAllowlist()) {
    return {
      error: {
        statusCode: 503,
        message: 'Tournament host access is not configured on Netlify.',
      },
    };
  }

  if (account) {
    return {
      error: {
        statusCode: 403,
        message: 'This signed-in player account is not approved for host controls.',
      },
    };
  }

  return {
    error: {
      statusCode: 401,
      message: 'Sign in with a host-approved account or enter the tournament admin token.',
    },
  };
}
