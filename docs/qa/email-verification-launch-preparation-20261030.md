# Genuine email verification launch preparation — 2026-10-30

## Scope and preservation

This is a local candidate based on production Hub commit
`a2449c43a435c73197eecf7a9d8fcbd18a2a10ef`. It changes neither a hosted site nor
existing accounts, sessions, secrets, signing keys, tournament results, or entitlement
accounting. Canonical repository generated-file changes remain outside this worktree.
The published QA fixture branches and their origins are not part of this candidate.

## Historical behavior and evidence

The production code used `REQUIRE_VERIFIED_PLAYER_EMAILS === 'true'` to decide whether
new accounts were marked verified. With that absent configuration, account creation
assigned `emailVerified=true` without requiring a code. Shared account projection also
treated missing flags as true. A true flag therefore does not demonstrate email delivery
or challenge completion.

A bounded, GET-only production Blobs audit at 2026-10-30T13:08:37.926Z found 102 active
account records: 89 true flags, 13 missing flags, zero false flags, zero structured
challenge-provenance records, and zero retained consumed verification-code records.
All 102 have **UNKNOWN historical verification provenance**. This does not establish that
all were automatically verified or that none ever completed verification. Overwritten,
deleted, or absent old code records cannot establish that negative. Canonical-ID uniqueness
and other record-integrity counts were not captured by this audit and remain unchecked.
Only aggregate counts were saved; no raw account, password, token, email, or code records
were persisted. The audit performed 409 GET requests and no writes.

Private aggregate receipt:
`/private/tmp/spades-launch-preparation-20261030/hub-verification/production-account-verification-aggregate.json`.
The prepared audit helper uses existing protected Netlify CLI authentication in memory,
fixed production site `40b28364-a127-4f5a-ad5d-d5b364612ace`, GET-only request enforcement,
and a bounded account/page limit. It does not create a production diagnostic function.
Do not repeat a production export merely to enrich these aggregates.

## Candidate behavior

- New registrations persist `emailVerified=false`. Browser claims and the legacy
  environment flag cannot bypass this. The normal signed session may still be created
  so the customer can manage their account and complete the challenge.
- The ordinary verification email is six digits, expires after 15 minutes, stores a
  hash rather than the raw code, and binds the challenge to the canonical account ID
  and normalized email. Concurrent/repeated consumption remains rejected atomically.
- Only successful code consumption writes server-owned provenance. Browser fields
  named `emailVerified`, `emailVerification`, or `canonicalAccountId` cannot create it.
- New explicitly unverified accounts cannot join a native Hub tournament when the
  legacy environment flag is absent or false. Existing true/missing accounts retain
  their admission behavior. Existing participants and historical records are untouched.
- The account profile exposes normal send-code and verify-code operations. Delivery
  and unknown-account responses preserve the existing anti-enumeration behavior.
  Generic request success is not presented as proof of verification.
- Password recovery, canonical IDs, usernames, aliases, signed session format and
  restoration, one-use game codes, game audiences, and shared signing secrets retain
  their existing contracts.

The public account and server-authenticated shared identity add:

```json
{
  "emailVerification": {
    "protocolVersion": "2026-10-30-email-challenge-1",
    "status": "verified | required | legacy_unknown",
    "method": "email-code | null",
    "verifiedAt": "ISO timestamp | null"
  }
}
```

The server validates stored evidence against the current canonical ID and normalized
email key, method/protocol and timestamp. Internal email hashes, challenge hashes,
codes and other bearer credentials are never projected. A changed email/canonical
identity or malformed evidence does not receive `status=verified`.

## Safe legacy policy

Do not mass-change legacy flags, revoke sessions, rebuild accounts, reissue canonical
IDs, or treat boolean true as demonstrated verification. Legacy true/missing accounts
continue ordinary login, existing game access, and existing entitlement workflows.
Their additive claim is `legacy_unknown` until a fresh challenge succeeds.

New owner-issued Spades hosting licenses require a **fresh server-authenticated Hub
canonical lookup** with the genuine verified claim and exact intended canonical ID.
The Spades candidate implements that issuance gate separately; browser assertions or
old session projections are not sufficient. Existing inventory, redemption and started
tournament continuation are not mass-blocked by this new issuance requirement.

Before-upgrade verification codes without canonical binding cannot earn this new
provenance. The customer requests a fresh ordinary code; no password/key reset or
account migration is required. If code consumption succeeds but account persistence
fails, do not claim success or reset anything automatically: request a new normal
challenge after reconciling the account's current state.

## Local acceptance and exact operator sequence

Focused tests demonstrate failure of the original automatic-verification behavior and
passing candidate registration, challenge expiry/replay/concurrency, wrong-account
rejection, forged browser claim rejection, legacy login/session compatibility,
canonical lookup, server signing, audience separation, and ordinary one-use handoff.
All email sends in local acceptance are mocked; no production account/session writes
or real verification emails are generated by these tests.

This task does **not** authorize deployment. A later operator activation must:

1. Review the exact Hub and Spades commits together. Retain the existing protected
   signing/session/Resend values and verify their presence without revealing values.
2. Confirm the existing verified sending domain/sender and provider quotas. Set the
   historical verification flag explicitly true if an approved configuration change
   is part of activation, while recognizing the candidate does not rely on it.
3. Deploy the exact reviewed Hub candidate only through the separately approved
   production deployment procedure; preserve a rollback to the prior exact commit.
4. With explicit smoke-test authorization, use one legitimate existing legacy account
   to confirm ordinary login/session restoration and existing entitlement access.
5. Complete a fresh normal email challenge for the intended pilot organizer. Verify
   delivery and genuine challenge consumption; observe the same canonical ID and
   server-resolved verified claim. Do not modify a verification flag directly.
6. Confirm normal Hub-to-Spades exchange and the new-issuance proof gate. Do not issue
   a license unless the separately authorized pilot fulfillment calls for one.
7. Separately authorize one genuine new-account smoke test if needed; verify false
   before challenge, blocked unverified admission, and true/provenance after challenge.
8. Stop on delivery, identity, signing, permission, or account-integrity failure.
   Preserve evidence; do not rotate working infrastructure as a diagnostic shortcut.

The existing semantically read-only production empty-identity lookup demonstrates
shared signing compatibility only. It does not demonstrate a customer's canonical
authentication, session restoration, email verification, or license issuance.

## Rollback and remaining uncertainty

Rollback is a reviewed code deployment to the prior exact Hub commit; no mass-data
rollback is needed. Added proof fields may remain on records and are ignored by old
code. Preserve all account and challenge history. Older code would again allow
automatic verification for newly registered accounts when its legacy flag is absent,
so a rollback is a security regression requiring an explicit release decision.

Actual production historical verification remains UNKNOWN. Local tests and read-only
signing evidence are not a replacement for an authorized real account/email smoke test.
No claim of production deployment or completed production onboarding is made here.
