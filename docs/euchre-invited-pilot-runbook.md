# Invited Euchre pilot host runbook

Public Euchre tournament discovery stays off throughout this pilot. Use only the invited tournament URL and the host-approved admin session.

## Before players arrive

1. Open `/admin` with a host-approved Tournaments account.
2. Create a hosted tournament with game `euchre`, a 4- or 8-player roster cap, and the intended bracket mode.
3. Keep the event link private. Do not change the public Euchre coming-soon lane.
4. Open `/admin/euchre-pilot`.
5. Enter the tournament slug, choose 4 or 8 seats, and add each invited player's exact `acct_` canonical account ID.
6. Save the pilot policy. Never use display names, email addresses, or game-local IDs as admission authority.
7. Send each admitted player the normal Tournaments event URL. Do not send room URLs or tickets.

## Registration and check-in

1. Each player signs into their own Tournaments account and registers from the event page.
2. Refresh the pilot console. An unlisted canonical account is rejected even if it knows the event URL.
3. Confirm the displayed account identity with each player at the venue.
4. Mark that registered player checked in.
5. Do not seed until the console shows every admitted seat registered and checked in.

## Start the bracket

1. Return to `/admin` and refresh the private roster.
2. Confirm the roster count is exactly 4 or 8 and matches the admitted list.
3. Generate the bracket using the configured tournament mode.
4. Return to the pilot console and refresh readiness.
5. Confirm every ready match shows deterministic participant IDs and North/South assignments.
6. Players open `Play My Match` from their own Tournaments event page. Never copy tickets between players.

## Monitor rooms and results

1. The pilot console reports assignment, bracket, completion, callback, and advancement state.
2. Live socket presence is not exported by Euchre yet. A `telemetry-unavailable` room status is not a failure; confirm presence with the players.
3. A result with `callback: confirmed` came from the authenticated Euchre callback.
4. A result with `callback: host-resolved` was finalized manually by a host.
5. Refresh after each match and confirm the next bracket assignment appears exactly once.

## Disconnect recovery

1. Keep the match active during the venue's reconnect grace period.
2. Ask the player to reopen the tournament page and press `Play My Match` again.
3. The Tournaments ticket remains match-, player-, game-, and seat-bound; Euchre restores the deterministic room while it is active.
4. Do not create a private room and do not move a player to the opponent's seat.

## Failed callback recovery

1. Do not report a browser-selected winner.
2. Leave the finalized Euchre match intact. Euchre's durable outbox owns callback retry.
3. Refresh the pilot console until `callback: confirmed` appears.
4. If it does not appear, record the match ID and escalate to an operator with Euchre service access. Tournaments intentionally has no control that can forge or replay the game callback.
5. Repeated delivery of the same completion remains idempotent; a conflicting winner remains rejected.

## No-show resolution

1. Apply the venue's published no-show grace period.
2. Confirm which assigned player is present.
3. In the pilot console, choose `Advance <player> (no-show)` and accept the destructive confirmation.
4. Refresh and verify the match is final once and the expected player advances once.
5. Never use the no-show control to rewrite an authoritative finalized result.

## Confirm the champion

1. Continue until the pilot console shows `champion-confirmed`.
2. Confirm all completed matches and callback statuses.
3. Copy the bracket JSON from `/admin` for the event record if required by venue operations.
4. Record the final bracket and champion in the venue's Season 1 log.
5. Keep the event available for history; do not clear the roster or reset the bracket after completion.

## Known operational boundary

Tournaments can verify invitations, registrations, host check-in, deterministic assignments, immutable results, callback delivery, and advancement. Current Euchre staging does not expose host-readable live socket presence or an operator callback-retry endpoint. Those are Euchre-side follow-ups and are not simulated in the Tournaments UI.
