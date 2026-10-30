import { createHash } from 'node:crypto';

export const EMAIL_VERIFICATION_PROTOCOL_VERSION = '2026-10-30-email-challenge-1';

function identityFor(account) {
  return String(account?.canonicalAccountId || '').trim() || String(account?.id || '').trim();
}

function emailKeyFor(account) {
  const email = String(account?.email || '').trim().slice(0, 500).toLowerCase();
  return email
    ? `${createHash('sha256').update(email).digest('hex').slice(0, 40)}.json`
    : '';
}

// Called by the server only after atomically consuming a code issued for this
// exact canonical account. Never accept this object from a browser payload.
export function emailVerificationEvidenceForAccount(account, verifiedAt) {
  return {
    protocolVersion: EMAIL_VERIFICATION_PROTOCOL_VERSION,
    method: 'email-code',
    verifiedAt,
    canonicalAccountId: identityFor(account),
    emailKey: emailKeyFor(account),
  };
}

export function emailVerificationForAccount(account) {
  const evidence = account?.emailVerification;
  const verifiedAt = evidence?.verifiedAt;
  const at = typeof verifiedAt === 'string' ? Date.parse(verifiedAt) : NaN;
  const createdAt = Date.parse(account?.createdAt || '');
  const verified = account?.emailVerified === true
    && evidence?.protocolVersion === EMAIL_VERIFICATION_PROTOCOL_VERSION
    && evidence?.method === 'email-code'
    && identityFor(account) !== ''
    && evidence?.canonicalAccountId === identityFor(account)
    && emailKeyFor(account) !== ''
    && evidence?.emailKey === emailKeyFor(account)
    && Number.isFinite(at)
    && at <= Date.now()
    && (!Number.isFinite(createdAt) || at >= createdAt);

  // Historical emailVerified=true (or missing) is not evidence of delivery or
  // challenge completion. Preserve that legacy login flag while distinguishing
  // it from a freshly demonstrated, account-bound verification.
  return {
    protocolVersion: EMAIL_VERIFICATION_PROTOCOL_VERSION,
    status: verified ? 'verified' : account?.emailVerified === false ? 'required' : 'legacy_unknown',
    method: verified ? 'email-code' : null,
    verifiedAt: verified ? verifiedAt : null,
  };
}
