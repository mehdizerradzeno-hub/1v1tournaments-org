# Shared Friends database rollout

## Decision

Shared Friends relationship and coarse presence state move from the current
test-only in-memory authority to Netlify Database (managed Postgres). Player
accounts remain in their current private Netlify Blob store; they are resolved
server-side solely to validate an active human account and project a public
handle/display name. Netlify Blobs are not used for relationship or presence
writes.

This follows the existing `netlify/database/migrations/` convention. The
official Netlify Database client supplies the deploy-appropriate database
connection, including isolated deploy-preview branches. No database is
provisioned and no migration is applied by this local code change.

## Schema and invariants

`0002_shared_friends_authority.sql` adds only new tables:

- `friends_relationships` stores a normalized unordered pair and exactly one
  requester. Its primary key prevents duplicate/crossed edges.
- `friends_idempotency` keys a mutation response by actor, action, and client
  idempotency key.
- `friends_presence` holds a single game label and expiry per canonical
  account. It stores neither a room nor a match locator.
- `friends_authority_state` supplies a monotonic Friends snapshot version.
- `friends_audit_events` keeps only one-way fingerprints, never canonical IDs.

Every request takes a short transaction-scoped Postgres advisory lock, reads
the authority state, applies the established domain rules, persists the
changed rows, and commits. This is intentionally conservative for the initial
bounded Friends rollout: it makes crossed requests, idempotency, relationship
deletion, presence updates, and version changes atomic. The public projection
continues to expose only `online_spades`, `online_euchre`, or `offline` to
accepted friends.

## Release phases

1. Keep all three feature flags false. Review this additive migration and run
   local unit/integration gates.
2. Create a deploy preview. Netlify applies the migration to the preview
   database branch before publishing the preview. Validate two test accounts:
   request/accept, Spades-to-Euchre presence, Euchre-to-Spades presence,
   expiry, sign-out, account deletion, and feature-off behavior.
3. Keep the Hub flag off while production deploys the additive schema. No
   relationship traffic reaches the database until `HUB_FRIENDS_ENABLED` is
   explicitly enabled with both game service credentials configured.
4. Enable the Hub plus one game in a controlled environment, verify 503
   fail-closed behavior when storage is unavailable, then enable the second
   game. Monitor error rate and transaction latency without logging account
   IDs.

## Rollback

Disable `HUB_FRIENDS_ENABLED`, `SPADES_HUB_FRIENDS_ENABLED`, and
`EUCHRE_HUB_FRIENDS_ENABLED` first. The old code and flags fail closed, so the
Friends UI cannot expose stale state. This migration is additive: do not drop
the new tables during an incident. Preserve them for investigation or restore
from a platform snapshot only through an approved recovery procedure.
