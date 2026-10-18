# Euchre 1V1 Leagues implementation and evidence

## Scope and safety

Build 8–128-player weekly divisional round-robin seasons, first-to-two game
series (every game first to 10), verified results, deterministic standings,
seeded playoffs, public schedules/standings, and organizer management. The
acceptance gate is a persisted/restarted 32-player season: four divisions,
seven regular rounds, eight qualifiers, one champion, plus permission and
tournament regression coverage. Code, screenshots, results, and a release
readiness report are required. None of these gates is waived by a unit test.

Worktree: `work/hub-euchre-leagues`, detached from Hub commit
`a3e230bda972eabf1e1d1af93eab958db22acec2` (local `origin/main`). Remote
freshness was checked through the connected GitHub service after terminal
DNS failed. Release preparation preserves both upstream commits through
`98b9219f3997b6430d86732d437bcb9ff4b5b1dd`, changing only the shared Friends
contract and its test fixture. The reconciled source passes all 414 tests.
The user authorized deployment on October 18, 2026. Production/QA data writes
remain excluded. Tests must inject disposable stores; never obtain a
live Blobs store to simulate a season. Do not copy environment secrets.

## Audited architecture

| Existing path | Reuse / gap |
| --- | --- |
| `src/lib/leagueCatalog.js` | Existing records, enrollment, round-robin circle scheduling, legacy standings. Existing scheduler is global, not divisional. |
| `netlify/functions/_league-utils.mjs` | Netlify Blobs `leagues` collection; result ETag retries. Other writes are unconditional and need a transactional path for the new version. |
| `netlify/functions/leagues.mjs` | Public privacy projections, session-derived usernames, host mutations. New format needs explicit ownership/entitlement checks and no manual authoritative-result forgery. |
| `netlify/functions/_host-auth.mjs` | Existing approved-host account allowlists and `TOURNAMENT_ADMIN_TOKEN` key. No separate purchasable host-key/entitlement subsystem found in this checkout. Reuse this gate, without inventing billing or widening host rights. |
| `netlify/functions/tournament-bracket.mjs` | Existing two-player game brackets and winner advancement; reuse for authoritative game launches and seeded championship advancement. Do not change existing tournament modes. |
| `netlify/functions/_tournament-game-contract.mjs` | Existing Euchre identity-bound tickets, launch URLs, dedicated authoritative reporter protocol. Preserve game callback/seat semantics. |
| `netlify/functions/_linked-league-result.mjs` | Existing validated two-player tournament-to-league linkage and callback retry. Currently completes a fixture after one game; version-gated best-of-3 aggregation is required. |
| `src/screens/LeaguesScreen.jsx` | Public and organizer routes already exist, but creation is hardcoded to Spades, and playoffs/series/division UI is absent. |
| `test/league*.test.js`, `test/linkedLeagueResult.test.js`, `test/tournament*.test.js` | Preserve existing tests; add endpoint, concurrency, restart, permission, and full season coverage. |

## Implementation sequence and gates

1. Versioned, pure Euchre season domain: validation, divisions, weekly dates
   including DST, reuse circle scheduling, verified sequential games, standings.
2. Conditional-write persistence, host entitlement + owner checks, public and
   viewer projections, enrollment/management endpoints.
3. Existing tournament bracket/ticket/result integration for each series game;
   seeded championship creation and automatic advancement, retry/restart safe.
4. Public league detail/schedule/divisional standings/playoffs and organizer
   controls, using existing Hub components and account flows.
5. Disposable full 32-player HTTP/persistence simulation and restarts;
   negative authorization, stale/concurrent callbacks, privacy, all existing
   tournament tests, lint, typecheck, build, and rendered screenshots.
6. Requirement-by-requirement release report with explicit limitations.

## Non-negotiable compatibility

Do not modify Euchre engine/gameplay, Sweep scoring, sockets, Elo, recordings,
existing tournament scoring/protocols, host allowlists, pricing, or billing.
The new format is opt-in and versioned. Old league records and legacy linked
results must retain their previous semantics. A boolean supplied by a browser
must never be sufficient proof of a verified game result.

## Current evidence and remaining work

- Implemented a versioned season domain, reusing the Hub circle pairing
  algorithm. Boundary tests include odd divisions and an untruncated 127-round,
  128-player season, with local weekly times preserved across DST.
- Best-of-3 aggregation accepts only the next registered tournament assignment,
  validates scores/participants, rejects conflicting/reused completions, and
  accepts identical retries after serialization. Normal games can finish at
  10–13 points, preserving Sweep overshoot; authoritative forfeits require a
  reason instead of changing the underlying game's rules.
- Conditional-write repository uses strong reads, ETags, collision checks, and
  retries that re-check authorization. Tests inject an in-memory serialized
  store, never a production or QA store.
- Championship adapter reuses `buildBracket` and `setMatchWinner` unchanged.
  The simulation completed 112 regular series (336 games), eight qualifiers,
  seven playoff series (14 games), and one champion. Standings exclude playoffs.
- Permission helpers reuse the existing approved-host/admin-key gate and
  narrow account organizers to their own leagues; enrollment requires the
  claimed shared username and retains the existing host/player role guard.
- Typecheck and web export passed. Lint has no errors, with three existing
  warnings in Friends imports/AdminScreen. Generated `dist/` changes are build
  output, not source deliverables, and must not be staged.
- Initial full-suite run: 387/388 passed. The failing unchanged Friends fixture
  used the removed legacy profile fields; its fixture was aligned with the
  existing username-only endpoint, retaining/strengthening its original
  authorization and no-store-access assertions. Subsequent complete run passed
  392/392 tests (report: `/private/tmp/euchre-league-gates.mQyzD5/full-suite-current.log`).
- `scripts/simulate-euchre-leagues.mjs` now supports separate init/regular/playoff
  processes against marker-protected files in a system-temporary directory.
  Two additional restart/safety tests passed after the full-suite discovery:
  restart after the first game, restart before playoffs, 350 total games,
  exactly one champion, and rejection of unmarked data directories. These are
  real process restarts, but not HTTP/game-service or deployed recovery tests.

The subsequent implementation added the authenticated versioned endpoint,
explicit public/organizer projections, full management controls, an idempotent
tournament-resource reservation/materialization bridge, ordinary player
tickets, and version-gated authoritative callbacks. The disposable 32-player
HTTP-handler/ticket/result simulation finished 350 games, 119 series, seven
regular rounds, eight qualifiers, and one champion. A separate three-process
file-backed simulation additionally recovered a bracket-final / league-pending
write interruption, then restarted before playoffs, with the same outcome.
Neither simulation starts a live game service or touches remote data.

Public `/leagues/euchre` and organizer `/admin/euchre-leagues` screens now use
the Hub shell, session cookies, host gate, shared-account launch, and existing
tournament return routing. They expose divisions, standings, schedules, players,
seeded playoffs, next games, creation, registration, roster removal, start,
pause/resume, future unassigned-match rescheduling, archive, and CSV export.
Stable generic league screens only gain links to the opt-in Euchre routes.

Between games, current claimed usernames are resolved through private hashed
account-record keys and snapshotted in the conditional game assignment. A
retry preserves that snapshot; a mid-game rename fails with a clear reconnect
message instead of silently issuing unusable tickets. Temporary guest-style
names are rejected consistently with the actual Euchre consumer. A read-only
cross-repository test imports that consumer and accepts both real Hub ticket
payloads without modifying game source.

Generic tournament metadata edits/deletion and the reserved internal-game
creation namespace are also guarded. They cannot replace a league game's
linkage or bypass the league organizer path. Existing ordinary events retain
their previous mutation behavior. Regression tests cover these boundaries,
legacy record downgrade/force-result attempts, a legacy/new create race, and
archived-season read-only enforcement through direct API actions.

Automated gates include the complete season/restart simulations, the real
Euchre ticket-consumer witness, existing tournament regressions, privacy
checks, typecheck, lint, web export and whitespace. See
`RELEASE_READINESS.md` for the latest counts and exact log names.

The follow-up audit fixed client retention of private league data after access
failure or account/operator-key changes. Cached records, viewers, confirmations
and CSV exports clear immediately; late action results and launch callbacks
from the preceding access context are ignored. Source-level wiring tests
complement the browser and endpoint checks.

## Browser review and remaining release work

The user started the loopback synthetic preview from Terminal. Actual desktop
browser checks now cover creation, registration open/close, claimed-name
join/leave, privacy, pause/resume, capacity updates, rescheduling, CSV export,
archive, standings, filters, roster and playoff empty states. Five real browser
screenshots are saved under `screenshots/`; the release report links them.
These are synthetic fixture sessions, not real production host/player logins.

Browser review repaired cross-division chronological schedule ordering,
cross-league CSV display after creation, and oversized personal match cards.
The final cards were verified in the browser after rebuilding. Source-level
regressions cover the layout and export bindings, and a pure schedule-selector
test verifies filtering, ordering, reschedules and source immutability.

The browser viewport API did not apply a phone-width override: measured
dimensions stayed 1280 × 720. It was reset, and manual resizing was requested.
Actual mobile QA remains open. The upstream changes are reconciled in release
source. Publication and a read-only production smoke are now authorized;
a full league/game rehearsal that writes production records is not included.

Source dependencies are a symlink to the already-installed Hub dependencies.
Full-suite reruns unset live Blobs credentials. Current gate logs are under
`/private/tmp/euchre-league-current-gates.4ExKTz`; web exports go outside source
to `/private/tmp/euchre-leagues-web-preview`. Generated `dist/` changes and the
`node_modules` symlink must not be staged as source deliverables.
