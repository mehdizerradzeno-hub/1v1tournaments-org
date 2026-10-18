# Euchre 1V1 Leagues release readiness

Status: deployment authorized by the user on October 18, 2026, but not published.
The session rejected GitHub writes because its approval policy disallows them.
No production/QA database writes or migrations are part of this release.
Desktop browser verification and actual screenshots are complete. Mobile
verification and a real deployed-game smoke remain release gates.

## Requirement evidence

| Requirement | Implementation / verification |
| --- | --- |
| 8–128 players | Server validation, claimed canonical accounts, capacity enforcement, ownership, registration/roster management. Tests cover 8 and 128, overflow, duplicate names/accounts, locked rosters. |
| Weekly divisions and scheduling | Existing Hub circle pairing algorithm; balanced divisions; unique division opponents; odd-division byes; IANA local weekly times across DST. Tests cover 32/4/7 and the untruncated 128-player single-division 127-round/8,128-series boundary. |
| Best-of-3, games first to 10 | Two or three ordinary identity-bound Euchre tournament games per series, first to two wins. Normal scores allow 10–13 to preserve Sweep overshoot; verified forfeits retain existing semantics. No engine changes. |
| Verified results and standings | Existing dedicated authoritative tournament reporter; preflight score validation before bracket finalization; retry-safe linked aggregation; ETag persistence. Win percentage, tied-group head-to-head, game differential, point differential, canonical ID. Public output excludes private identities. |
| Seeded playoffs | Equal top qualifiers per division, division-rank-first cross-division seeding, standard seeded slots; existing bracket builder/winner advancement; best-of-3 each round; one champion. |
| Public and organizer pages | New opt-in Hub routes with standings, schedule, roster, playoffs, player launches and host controls. Expo export and synthetic desktop interaction checks pass; screenshots below. Mobile layout remains unverified. |
| Existing host entitlement | Existing approved-host allowlists or operator admin key, plus owner-only account management. Existing operator-wide scope is retained; no new billing or entitlement scheme. Negative authorization tests pass. |
| Persistence and restart | Strong reads/conditional writes; unique deterministic assignments; idempotent event/signup/bracket materialization. Real child-process restarts after one game and after a bracket-final/league-pending interruption, and before playoffs. Synthetic local stores only. |
| Tournament compatibility | Marker/version-gated changes only; legacy record mutation/downgrade guards; race-safe legacy creation; internal game metadata/deletion and reserved-namespace guards; existing tournament regression tests retained. Actual game ticket consumer accepts both new league seats in a read-only cross-repository test. |

## Acceptance outcome

The synthetic HTTP-handler + existing ticket/result pipeline completes:

- 32 players, four divisions, seven regular-season rounds.
- 112 regular series, each split 1–1 before its decider: 336 games.
- Eight unique qualifiers; seven playoff series: 14 games.
- 119 completed series, 350 game brackets, exactly one champion.
- Separate processes recover a final bracket whose linked league write was
  interrupted, then resume playoffs from persisted files. Identical old
  completions remain idempotent after later games/series finish.

This is not a deployed smoke test or a claim that 350 browser games were
played. Callbacks are synthetic, using the existing normalized game contract.
The cross-repository witness imports only the real ticket parser; it does not
start the Euchre server, change engine files, or write game databases.

## Routes and operator workflow

- Public: `/leagues/euchre?league=<league-id>`.
- Organizer: `/admin/euchre-leagues?league=<league-id>`.
- API: `/.netlify/functions/euchre-leagues` (session cookies; optional existing
  operator key in the Authorization header, never URL or persistent storage).
- Each game is a two-player unlisted event, with a “Return to league” link.
  Current tournament launch, account handoff, match verification and completion
  protocols remain unchanged.
- Starting locks competitive settings and the roster. Pausing blocks new
  launches but permits an already-assigned game to complete/reconnect.
  Archiving is read-only and blocked while an assigned game is unfinished.
  There is intentionally no browser/admin manual-result override.
- Create a separately identified league record for the next named season;
  completed history is never regenerated or overwritten.
- The client clears cached private league records, viewer data and exports
  on read/access failures, account changes and operator-key verification.
  Responses and game-launch callbacks from an earlier access context are
  ignored. Source-level regression checks cover this wiring; a real browser
  account-switch smoke remains part of the authorized release review.

## Local browser review

The user started the loopback preview in Terminal. All browser mutations used
synthetic in-memory data; the organizer view uses a privileged test fixture,
not a production host login. The preview clock is December 31, 2026.

At the actual 1280 × 720 viewport, verified:

- Public league metadata, 32 username-only players, four division tables,
  completed-game scores, the playoff empty state and next-game controls.
- Week/division filters and chronological scheduling across divisions.
- Organizer creation of two disposable leagues; disabled start below eight
  players; capacity update from 8 to 128; registration open/close; claimed-name
  join/leave; private visibility; pause/resume; confirmed read-only archive.
- Future rescheduling, rejection of a date before the synthetic clock and
  chronological reordering after a valid update.
- Username-only CSV export and isolation of the export when creating and
  automatically selecting a different league.
- Safe rejection of the preview's intentionally incomplete account-handoff
  response, without navigating out of Hub. This does not verify a real game
  session; both actual ticket-consumer seats pass in the automated witness.

Browser review repaired cross-division schedule ordering, an old league's CSV
remaining visible after creation selected a new league, and excessive empty
space in personal match cards. Personal cards now use the same wrapping grid
as the schedule; grid cards may shrink at narrow widths. Regression tests
cover these changes. No game rules or engine files changed.

The mobile viewport API returned without changing the measured 1280 × 720
viewport. Its override was reset; mobile success is not claimed. A manual
phone-width resize has been requested. No raw debugger workaround was used.

Actual standard browser captures, with synthetic data only:

- [Public overview](screenshots/public-desktop.jpg).
- [Player fixtures](screenshots/player-matches-desktop.jpg).
- [Division standings](screenshots/standings-desktop.jpg).
- [Organizer creation settings](screenshots/organizer-create-desktop.jpg).
- [Organizer management](screenshots/organizer-manage-desktop.jpg).

## Safety and remaining release gates

1. Finish actual phone-width verification and capture a mobile screenshot.
   Desktop review is complete. Keep the preview loopback-only with synthetic
   data; the user-owned Terminal process is running it outside the sandbox.
2. Release source includes both upstream commits through
   `98b9219f3997b6430d86732d437bcb9ff4b5b1dd`, preserving the username-only
   Friends contract and its transport test, plus the stronger local assertion.
   All required gates pass on the reconciled source.
3. Verify the release PR checks and Netlify publication. Existing `dist/`
   changes in this isolated worktree are generated build output, not source
   deliverables. The `node_modules` symlink is local setup, not a deliverable.
4. Netlify has the existing shared-account, host/session and dedicated
   game-result variables. Its production `EUCHRE_MATCH_BASE_URL` is
   `https://onev1-euchre-preview.onrender.com/`, which opens the landing page.
   Change only the production value to
   `https://onev1-euchre-preview.onrender.com/play`, preserving every
   non-production value. The edit was canceled without saving when source
   publication was blocked. No new secret or billing setting is required.
   Confirm game-service feature availability in the live smoke.
5. Run a read-only production smoke after publication. A real two-account
   league rehearsal would write production league/game records and needs
   explicit data-write approval. Maximum-roster scheduling is unit-tested, but
   maximum-size completed-season performance has not been load-tested.

No production migration is needed: the new opt-in format shares the existing
`leagues` Blobs collection and ordinary tournament resource collections. A
rollback must not downgrade new records or enable manual legacy writes to
them. Hide/disable the new entry points if necessary and retain all records
and assigned games until an approved recovery plan is reviewed.

## Reproduce safely

From this isolated worktree:

```sh
env -u NETLIFY_BLOBS_CONTEXT -u NETLIFY_AUTH_TOKEN -u NETLIFY_SITE_ID \
  -u BLOBS_TOKEN -u BLOBS_SITE_ID npm test
npm run lint
npx tsc --noEmit
CI=1 EXPO_NO_TELEMETRY=1 npm run build:web -- \
  --output-dir /private/tmp/euchre-leagues-web-preview
git diff --check
node scripts/preview-euchre-leagues.mjs
```

Cross-repository verification runs when the actual Euchre checkout is
available; in a standalone Hub checkout, set `EUCHRE_LEAGUE_ENGINE_WORKTREE`
to that read-only checkout. Otherwise that optional witness is explicitly
skipped, not represented as passing. In this workspace both seats passed.

## Final automated checkpoint (2026-10-18)

Latest evidence logs: `/private/tmp/euchre-league-current-gates.4ExKTz`.

| Check | Result / log |
| --- | --- |
| Complete reconciled-source suite | **414 passed, 0 failed, 0 skipped**; `release-reconciled-suite.log`, 80.18 seconds. Includes the upstream Friends transport test, final card-layout regression, real process-restored acceptance and both actual game ticket-consumer seats. |
| Expo web export | Passed; 42 static routes including both new league routes; `release-reconciled-build.log`. Output is `/private/tmp/euchre-leagues-web-preview`, outside source. |
| Lint | 0 errors and three pre-existing warnings (Friends duplicate imports and AdminScreen effect dependency); `release-reconciled-lint.log`. |
| TypeScript | Passed, no diagnostics; `release-reconciled-types.log`. |
| Whitespace | Passed; direct `git diff --check`. |
| Browser/screenshots | Synthetic desktop checks passed; five actual screenshots saved above. Mobile remains unverified because the viewport override did not apply. |

No branch or PR was published by this session, and the Netlify URL setting
was left unchanged. Use the prepared source-only release bundle from a
normal Terminal to create the release branch/PR. It starts from the exact
upstream commit tested above and stops if `main` has moved. Desktop evidence
is ready for review; mobile and live-smoke limitations remain.
