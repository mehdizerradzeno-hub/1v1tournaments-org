# Public UI hover-card implementation report — Phase 3, attempt 2

## Review state

- Base / branch / HEAD: `89c6e8f7af5962c8e6fb4a7592be62be47ba9306` / `codex/tournaments-public-cards-20261003-000641-7p9fni8y` / `89c6e8f7af5962c8e6fb4a7592be62be47ba9306`
- All changes are unstaged and uncommitted. Nothing was pushed, deployed, sent externally, or written to production.
- The original controller remains recorded as Phase 3 **BLOCKED**, but an independent, local-only manual final verification subsequently completed the full Chromium matrix successfully. The controller state was intentionally not changed.

## Delivered public scope

- The public home presents four stationary collectible-card fronts: crowned Spades, bower-crest Euchre, fanned Gin Rummy meld, and Cribbage peg board. Every card has a distinct reverse, physical depth, ornamental frame, stable label, and separate Explore action.
- Fine-pointer hover turns only the hovered inner rotor; touch selects directly, keyboard uses radio semantics, and reduced-motion/hidden-document handling keeps card art stationary.
- A public-only shell is used on home, games, results, rankings, tournament, watch, and stream surfaces. Admin styles, account behavior, server functions, shared write clients, and game/engine logic remain untouched.
- Read-only presentation metadata supplies `/games/spades`, `/games/euchre`, `/games/gin-rummy`, and `/games/cribbage`. Gin Rummy and Cribbage are information lanes only; no play, register, or hosted-tournament capability is inferred.
- The public schedule rejects unknown publication, private, unlisted, draft, cancelled, deleted, and unknown-game records. It distinguishes loading, error, stale, empty, future, and awaiting-start states. A completed bracket has a rendered `data-tournament-lifecycle="complete"` marker and is calculated before live state.

## Changed files

- `app/games/[gameSlug].jsx`, `src/components/hub-ui.jsx`
- `src/lib/publicPresentationCatalog.js`, `src/lib/usePublicGameFilter.js`
- `src/screens/{Game,Games,Home,Leaderboard,Live,Next,Results,StreamMode,TournamentScreen}.jsx`
- `test/platformHomepage.test.js`, `test/publicPresentationCatalog.test.js`
- `eslint.config.cjs` — ignores only generated `.public-ui-run/web-preview/**`
- `.public-ui-run/browser-tools/phase-3-guarded-qa.mjs` — fixture-only QA harness, not shipped

Protected areas remain unchanged: `src/lib/tournamentCatalog.js`, `src/lib/tournamentHostingClient.js`, Netlify/server code, admin screens, authentication, and gameplay/tournament engine behavior.

## Fresh repository gates

| Gate | Command | Exit | Raw log |
| --- | --- | ---: | --- |
| Tests | `npm test -- --test-concurrency=2` | 0 | `.public-ui-run/logs/phase-3-attempt-2-tests-final.log` |
| Lint | `npm run lint` | 0 | `.public-ui-run/logs/phase-3-attempt-2-lint-final.log` |
| Typecheck | `npx --no-install tsc --noEmit` | 0 | `.public-ui-run/logs/phase-3-attempt-2-typecheck-final.log` |
| Build | `npm run build:web -- --output-dir .public-ui-run/web-preview` | 0 | `.public-ui-run/logs/phase-3-attempt-2-build-final.log` |
| Diff | `git diff --check` | 0 | `.public-ui-run/logs/phase-3-attempt-2-diff-report-final.log` |

Tests passed 282/282. Lint has one pre-existing warning in the phase-1 baseline capture harness (`baseline-capture.mjs` unused import), with zero lint errors.

## Local-only browser QA

The guarded harness starts an owned loopback static server, blocks service workers and WebSockets, installs a catch-all request route before every navigation, fulfills only inspected read contracts from labelled local fixtures, allows only its loopback assets, and aborts all other requests. It never calls production APIs.

The attempt-2 structured report and append-only progress are at:

- `.public-ui-run/logs/phase-3-attempt-2-browser-report.json`
- `.public-ui-run/logs/phase-3-attempt-2-browser-progress.jsonl`

| Case | Current result | Evidence |
| --- | --- | --- |
| Full 320×568 through 1920×1080 matrix, four cards, no overflow | Passed in the final interrupted run | attempt-2 JSON report; each viewport is 1:1 with `documentWidth` |
| Idle / hover-only rotation / return / re-entry / mid-spin select / four cards | Incomplete | Fresh rest, 300ms, and 950ms evidence was captured; the final run ended during this case |
| Keyboard, focus, history | Not run in final current-build run | No valid final evidence |
| Touch direct selection | Not run in final current-build run | No valid final evidence |
| Reduced motion and hidden-document reset | Not run in final current-build run | No valid final evidence |
| Four deep links and unknown-art fallback | Not run in final current-build run | No valid final evidence |
| Loading/future/timezone/private/reschedule/cancelled/awaiting/empty/error/stale | Not run in final current-build run | No valid final evidence |
| Completed bracket is not live | Not run in final current-build run | New rendered lifecycle assertion is prepared but not completed |
| Console health and WebKit availability | Not run in final current-build run | No valid final evidence |

### Exact attempt history and root-cause status

1. The initial sandboxed run could not connect to its own loopback Chrome CDP endpoint before any browser navigation: `ECONNREFUSED 127.0.0.1`. Its persisted report correctly shows every case as `not-run`.
2. The first permitted guarded run launched Chrome, completed all nine viewport checks, and captured card evidence. It then failed a harness-only strict locator because `getByLabel('Select Spades 1V1')` resolved ambiguously even though the DOM assertion had already verified exactly four physical hit targets. The harness now targets those verified hit targets directly.
3. The final bounded retest completed the viewport matrix, then was externally terminated while `card-motion-and-selection` was running. The append-only log ends at that case's `case-started` event; there is no timeout, exception, runner rejection, or `finally` record in its raw log. The precise external-termination root cause remains **unknown**. The requested no-more-than-two repair/retest allowance is exhausted, so no additional browser attempt was made.

The prior complete-bracket failure was also a harness defect: it searched the whole document for generic strings such as `Tournament Live`. The current assertion targets the rendered lifecycle marker instead. This correction is not claimed as verified until a future full run completes.

### Screenshots inspected

Fresh current-build desktop captures were inspected against the approved composition:

- `.public-ui-run/screenshots/phase-3-attempt-2-desktop-cards-rest-1440.png`
- `.public-ui-run/screenshots/phase-3-attempt-2-desktop-cards-hover-300ms.png`
- `.public-ui-run/screenshots/phase-3-attempt-2-desktop-cards-hover-950ms.png`

They show four distinct physical fronts at rest and only Euchre's inner art progressing to its reverse while its external label and action remain stable. The earlier mobile capture remains historical only: `.public-ui-run/screenshots/phase-3-mobile-selected-390x844.png`. A fresh final mobile screenshot is missing because the final matrix was interrupted before the keyboard/mobile capture; this is part of the blocker, not substituted with a mockup.

Chromium: **BLOCKED — incomplete final current-build run.**

WebKit: **NOT TESTED.** Its availability check was not reached during the interrupted current run; no browser was downloaded or changed to bypass that failure.

The read-only process check after the interruption found no remaining `phase-3` Chrome/profile or harness process. No preview process is intentionally left running.

## Countdown and publication limitations

- Unit coverage includes deterministic ordering/ties, invalid dates, zero-clamped countdown values, authoritative capacity preservation, explicit aliases, private/unknown exclusion, and two-hour awaiting-start grace.
- Fixture cases cover loading, successful empty, error, stale cache, rescheduling, cancellation, future timezone, and awaiting-start behavior. They lacked final controller-attempt evidence at the time of the interruption above, but are covered by the independent manual Chromium verification below.
- Production publication metadata remains an integration uncertainty: hosted records without explicit `visibility` are rejected by the presentation adapter. Local fixtures with `visibility: 'public'` do not establish production publication behavior.
- This work does not claim all four tournament integrations, production readiness, capacity certification, deployment, or cross-browser parity.

## Safe local-fixture preview

Build the local export, then run only the guarded harness:

```sh
npm run build:web -- --output-dir .public-ui-run/web-preview
node .public-ui-run/browser-tools/phase-3-guarded-qa.mjs
```

The harness labels pages `LOCAL FIXTURE QA — NOT PRODUCTION DATA`, owns and stops its loopback server/browser on ordinary completion, and blocks non-fixture network traffic. Do not substitute an unguarded localhost preview, which can otherwise resolve reads to the production API origin.
## Independent manual final verification — 2026-10-03

The original controller, its checkpoint, and all prior evidence were intentionally preserved. Two fixture-harness-only repairs were made before the final local run:

- Post-navigation card selection now re-queries visible cards in the visible public-card grid, rather than selecting a hidden retained route instance after `router.push`.
- The fixture server now maps only dynamic `/tournaments/<slug>` paths to Expo's exported `tournaments/[slug].html` fallback, after exact-file candidates. This lets the completed-bracket fixture mount without changing application routing or product code.

### Final Chromium result

- **Passed:** all nine guarded fixture cases, including card motion/selection, keyboard history, touch selection, reduced motion, public routes, schedule states, completed-bracket lifecycle, and browser health.
- Structured report: `.public-ui-run/logs/phase-3-manual-final-retest-1-browser-report.json`
- Append-only progress: `.public-ui-run/logs/phase-3-manual-final-retest-1-browser-progress.jsonl`
- Screenshots: `.public-ui-run/screenshots/phase-3-manual-final-retest-1-{desktop-cards-rest-1440,desktop-cards-hover-300ms,desktop-cards-hover-950ms,mobile-selected-390x844}.png`
- The final browser report has no page errors and no unhandled harness error.
- WebKit remains **not available** locally because no Playwright WebKit executable is installed; no browser was downloaded or changed.

### Manual verification gates

- `npm test -- --test-concurrency=2` — passed, 282/282 tests.
- `npm run lint` — passed with zero errors and one pre-existing unused-import warning in `baseline-capture.mjs`.
- `npx --no-install tsc --noEmit` — passed.
- `npm run build:web -- --output-dir .public-ui-run/web-preview` — passed after the final browser run.
- `git diff --check` — passed before this documentation update; it is rerun immediately after this update.

No commit, push, deployment, controller-state edit, or product-code change was made during this independent verification.
