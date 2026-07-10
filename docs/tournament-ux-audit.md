# Tournament UX Audit

Date: 2026-07-10
Scope: tournament website and tournament-related player flows only. This audit does not cover gameplay, native app work, non-tournament account areas, or unrelated site sections.

## Executive Summary

The tournament site already contains most of the raw pieces a player needs: next event, countdown, roster, signup, player status, bracket, match ticketing, stream links, and results. The main UX problem is not missing content. The problem is that the same jobs are spread across too many routes and repeated with different button labels.

The highest-risk issues are:

1. Links to `#my-match`, `#registered-players`, and `#live-bracket` can land on hidden tab content.
2. Global navigation and sticky actions point to the seeded primary tournament instead of the hosted/current tournament.
3. `/live` is linked like a spectator page but reads like a host/broadcast cockpit.
4. "Check-in" is described, but there is no actual check-in action or checked-in state.
5. Player elimination/advancement status can be wrong for double-elimination and two-life formats.
6. The tournament detail page hides global navigation and sticky actions on mobile.
7. CTA language is inconsistent: `Sign up`, `Join`, `Join roster`, `Join tournament roster`, `My match`, and `Find my match` compete.

## Current Tournament Site Map

| Route | Current Role | Notes |
|---|---|---|
| `/` | Public homepage | Contains front door, countdown hero, Twitch tournament board, downloads, upcoming events, game spotlight. Multiple tournament entry points compete. |
| `/next` | Compact next-event lobby | Shows countdown, join action, match link, details, roster, open seats, commands, QR-oriented content. |
| `/tournaments/[slug]` | Tournament detail and player command center | Contains lobby, action rail, tabbed Play/Roster/Bracket/Info content, player status, roster, bracket, match access. |
| `/check-in/[slug]` | Account creation, login, and roster signup | Real join flow. Handles account create/login, signup confirmation, roster state, and tournament format education. |
| `/stream` | Public stream/viewer board | Shows next event, join QR, public roster, commands, queue. This is closer to a spectator page than `/live`. |
| `/live` | Broadcast command center | Contains Twitch/Discord links, OBS scene map, overlays, announcements, runtime health, admin-ish stream operation content. It is linked from player surfaces as `Watch live`. |
| `/rules` | Tournament rules | Covers free-entry/no-wagering and event flow. Lacks detailed match operations rules. |
| `/results` | Results/history | Relevant after tournament completion. |
| `/leaderboard` | Tournament ranking | Relevant after repeated events; not necessary for initial registration. |
| `/admin` | Host controls | Relevant to host workflow; included only where it affects published player flow. |
| `/overlay`, `/overlay/compact`, `/overlay/bracket` | OBS overlays | Stream production surfaces, not primary player flow. |

## Current First-Time User Flow

Best intended path:

1. User lands on `/` or `/next`.
2. User identifies the next tournament.
3. User clicks `Join now`, `Sign up`, or `Join this tournament`.
4. User lands on `/check-in/[slug]`.
5. User chooses `New player` or `Already have account`.
6. New player enters player name, email, password, confirm password, optional handle.
7. Existing player enters email and password.
8. User clicks `Create account + join tournament` or `Sign in + join tournament`.
9. Signup confirmation appears.
10. User clicks `Find my match`.
11. Tournament page player command center shows status.
12. When bracket is live, user opens match.

Current click count estimates:

| Flow | Clicks | Form Inputs | Decisions |
|---|---:|---:|---:|
| Homepage to new-player registration | 3 | 4 required | Join path, create vs login |
| `/next` to new-player registration | 3 | 4 required | Create vs login |
| Existing-player registration | 4 | 2 required | Create vs login |
| Signed-in player registration | 1-2 | Optional notes | Whether to join now or view tournament |
| Find bracket from tournament page | 2-3 | 0 | Which tab/status link to use |

The underlying funnel can be short, but the visible interface adds decision friction with repeated CTAs and duplicated destinations.

## Complete Button and Interaction Inventory

| Screen / Route | Current Label | Purpose | Priority | Visibility | Mobile Placement | Desktop Placement | Enabled / Disabled | Loading | Success | Error | Destination / Action | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Global header / sticky actions | `Sign up` / `Join` | Enter primary tournament signup | Primary | Global where navigation is shown | Bottom sticky / nav | Header nav | Enabled, hardcoded to primary tournament | None | Lands on check-in | Unknown tournament possible if stale slug | `/check-in/{primarySlug}` | Rename to `Join tournament`; make current hosted event-aware. |
| Global header | `My match` | Check player status | Secondary | Global where navigation is shown | Bottom sticky / nav | Header nav | Enabled, hardcoded primary slug | Status loads on page | Shows player command center | May show not registered | `/tournaments/{primarySlug}#my-match` | Keep but only after user has context; route to current tournament. |
| Global header | `Watch` / `Watch live` | Stream viewing | Secondary | Global | Bottom sticky / nav | Header nav | Enabled | None | Opens page | Wrong page semantics | `/stream` or `/live` depending source | Use `/stream` for public watch; reserve `/live` for host/broadcast. |
| Homepage front door | `Open next tournament` | Details page | Primary-like | Visible above fold | Card CTA | Card CTA | Enabled | None | Opens event | None | `/tournaments/[slug]` | Demote to secondary if `Join tournament` is available. |
| Homepage front door | `Watch live` | Stream page | Primary-like | Visible above fold | Card CTA | Card CTA | Enabled | None | Opens live page | `/live` is host-ish | `/live` | Move below registration; point to public stream page. |
| Homepage front door | `Join now` | Signup | Primary-like | Visible above fold | Card CTA | Card CTA | Enabled if registration open | None | Opens signup | None | `/check-in/[slug]` | Make this the single dominant homepage CTA. |
| Homepage secondary row | `My match` | Player status | Secondary | Below front door cards | Row/wrap | Row | Enabled | Status loads on destination | Shows status | Premature dead-end for new users | `/tournaments/[slug]#my-match` | Rename `Check match status`; demote pre-registration. |
| Homepage secondary row | `Compact lobby` | Next page | Secondary | Below front door | Row/wrap | Row | Enabled | None | Opens `/next` | Duplicates homepage | `/next` | Remove or fold into tournament page. |
| Homepage secondary row | `Tournament leaderboard` | Rankings | Secondary | Below front door | Row/wrap | Row | Enabled | None | Opens leaderboard | Distracts from registration | `/leaderboard` | Move below core signup flow. |
| Homepage upcoming list | `Sign up` | Join specific event | Primary | Each tournament row | Row action | Right column | Enabled if registration open | None | Opens check-in | None | `/check-in/[slug]` | Rename `Join tournament`; keep. |
| Homepage upcoming list | `Details` | Event details | Primary if closed | Each tournament row | Row action | Right column | Enabled | None | Opens details | None | `/tournaments/[slug]` | Keep as secondary when registration open. |
| Homepage upcoming list | `My match` | Player status | Secondary | Each row | Row action | Right column | Enabled | None | Opens status anchor | Hidden tab risk | `/tournaments/[slug]#my-match` | Rename `Check status`; keep after join/live. |
| `/next` hero | `Join now` | Signup | Primary | Hero | Top action stack | Hero actions | Enabled if registration open | None | Opens signup | None | `/check-in/[slug]` | Rename `Join tournament`; keep as only primary. |
| `/next` hero | `Open signup` | Signup when closed | Primary | Hero | Top action stack | Hero actions | Enabled | None | Opens signup | May imply signup is possible while closed | `/check-in/[slug]` | Use state label: `View registration status`. |
| `/next` hero | `My match` | Player status | Secondary | Hero | Top action stack | Hero actions | Enabled | None | Opens status | Premature for first-time users | `/tournaments/[slug]#my-match` | Rename `Check match status`; demote. |
| `/next` hero | `Details` | Details page | Secondary | Hero | Top action stack | Hero actions | Enabled | None | Opens details | None | `/tournaments/[slug]` | Keep. |
| `/tournaments/[slug]` hero | `Join tournament` / `Sign up` | Signup | Primary | Hero and repeated cards | Top actions | Top actions | Enabled while open | None | Opens check-in | None | `/check-in/[slug]` | Canonical pre-bracket primary. |
| `/tournaments/[slug]` hero | `Find my match` / `My match` | Status | Secondary/primary depending state | Repeated | Top and cards | Top and cards | Enabled | Player status fetch | Shows match/status | Hidden anchor risk | `#my-match` | Use only as primary after registration or bracket live. |
| `/tournaments/[slug]` | `Play my match` | Open assigned match | Primary | Player status / bracket cards | In card, not sticky | In card | Enabled when current match exists | `Opening...` | Redirect to room | Ticket error inline | `issueTournamentMatchTicket` | Keep; add persistent bottom CTA when ready. |
| `/tournaments/[slug]` | `View roster` | Roster section | Secondary | Dashboard/tab cards | In page | In page | Enabled | None | Opens roster tab/anchor | Hidden tab risk | `#registered-players` | Make tab/hash aware. |
| `/tournaments/[slug]` | `View bracket` / `Live bracket` | Bracket section | Secondary | Dashboard/tab cards | In page | In page | Enabled when relevant | None | Opens bracket | Hidden tab risk | `#live-bracket` | Make tab/hash aware. |
| `/tournaments/[slug]` | `Watch live` | Stream page | Secondary | Hero/dashboard | In page | In page | Enabled when stream exists | None | Opens live | `/live` mismatch | `/live` | Point to public stream/Twitch. |
| `/tournaments/[slug]` tabs | `Play`, `Roster`, `Bracket`, `Info` | Switch content | Tertiary/navigation | Event console | Non-sticky row | Row | Enabled | None | Switches tab | Selected state only visual | `setActiveTab` | Make sticky on mobile and accessible as tabs. |
| `/check-in/[slug]` | `New player` | Select create mode | Tertiary/segmented | Join section | Above form | Above form | Enabled unless submitting | None | Changes mode | None | `setAccountMode('create')` | Style as segmented control, not primary CTA. |
| `/check-in/[slug]` | `Already have account` | Select login mode | Tertiary/segmented | Join section | Above form | Above form | Enabled unless submitting | None | Changes mode | None | `setAccountMode('login')` | Style as segmented control. |
| `/check-in/[slug]` | `Create account + join tournament` | Create account and register | Primary | Form bottom | Below required fields | Form bottom | Disabled when submitting/loading | `Creating...` | Account message + signup | Inline error text | `handleCreateAccount` | Rename `Create account and join`; preserve entered values. |
| `/check-in/[slug]` | `Sign in + join tournament` | Login and register | Primary | Form bottom | Below fields | Form bottom | Disabled when submitting/loading | `Opening...` | Account message + signup | Inline error text | `handleLoginAccount` | Rename `Sign in and join`. |
| `/check-in/[slug]` | `Join tournament roster` | Register signed-in account | Primary | Account panel | Below account status | Account panel | Disabled when registration closed/submitting | `Saving...` | Signup confirmation | Inline signup error | `submitTournamentSignup` | Rename `Join tournament`. |
| `/check-in/[slug]` | `Find my match` | Post-registration next step | Primary | After confirmation | Button row | Button row | Enabled | Status loads on destination | Status found | Could be waiting | `/tournaments/[slug]#my-match` | Rename `Check match status`; add return/check-in time copy. |
| `/check-in/[slug]` | `Tournament page` | Back to event | Secondary | Button row | Button row | Button row | Enabled | None | Opens event | None | `/tournaments/[slug]` | Rename `View tournament`; keep secondary. |
| `/check-in/[slug]` | `Sign out` | Account switch | Tertiary | Button row | Button row | Button row | Enabled | `Signing out...` | Account cleared | Error possible | `handleLogoutAccount` | Keep tertiary. |
| `/check-in/[slug]` | `Sign out to switch` | Account switch | Primary in switch panel | Switch account panel | Panel | Panel | Enabled | `Signing out...` | Account cleared | Error possible | `handleLogoutAccount` | Keep only in explicit switch flow. |
| `/check-in/[slug]` | `Continue as {name}` | Continue with current account | Secondary | Switch panel | Panel | Panel | Enabled | None | Opens tournament page | Does not join directly | `/tournaments/[slug]` | Rename `Keep this account`; clarify not registration. |
| `/live` | `Open Twitch`, `Open Discord`, `Tournament page`, `Compact overlay`, etc. | Broadcast operations | Secondary/admin | Many sections | Dense | Dense | Mixed | Mixed | Opens links/copies | Mixed | External/internal | Move public watcher needs to `/stream`; keep `/live` as host surface. |
| `/admin` | `Save event`, `Generate bracket`, `Clear tournament`, `Report winner` | Host operations | Primary/destructive | Admin only | Dense | Dense | Disabled based on host/readiness | Saving/generating | Feedback text | Feedback text | Netlify functions | Out of public flow; keep audited separately. |

## Click-Count Analysis

The current minimum click count is acceptable. The mental count is not.

| Scenario | Current Minimum | Problem |
|---|---:|---|
| New user joins from homepage | 2-3 clicks + form | Too many competing first-click options. |
| Existing user joins | 3-4 clicks + form | Mode selector and join button are clear, but `Already have account` competes visually. |
| Signed-in user joins | 1 click from check-in | Good, but label `Join tournament roster` is clunky. |
| Registered user finds match before bracket | 1 click | Feels like a dead end because no match exists yet. |
| Registered user finds match after bracket | 1 click | Good if anchor/tab resolves; risky if hidden tab state fails. |
| Spectator watches tournament | 1-2 clicks | `/live` vs `/stream` semantics are confusing. |

## Confusion and Dead-End Report

| Severity | Issue | Impact |
|---|---|---|
| High | Hash links target content hidden behind tabs. | Players clicking `My match`, `View roster`, or `View bracket` may not see the promised section. |
| High | Global nav uses seeded `primaryTournamentSlug`. | Hosted/current tournaments can be bypassed by stale sign-up links. |
| High | `/live` is public-labeled but host-oriented. | Spectators and players may land in OBS/bot/admin language instead of watch flow. |
| High | Non-single-elim player status can call a continuing player eliminated. | Players in double-elim or two-life events may be misinformed. |
| Medium | Check-in exists as copy but not as action/state. | Players cannot know if they are checked in or merely registered. |
| Medium | Capacity is shown but not enforced by signup. | Full events can keep accepting signups while UI says full/open seats zero. |
| Medium | Confirmation lacks return/check-in time. | Registered players know they are in, but not exactly when to come back. |
| Medium | Public bracket cards can show `Play match` to viewers. | Unauthorized users can hit access errors instead of being guided to sign in. |
| Medium | Example bracket seeds can be misread. | Fast scanners may think preview matches are real assignments. |
| Low | Tournament rules are too general for operations. | Players may ask Discord about disputes, disconnects, scoring target, or table settings. |

## Mobile Layout Report

High-risk mobile observations:

- Tournament detail disables shared navigation and sticky actions, so the primary action disappears after scroll.
- Tabs are not sticky, yet they hide large content sections.
- First viewport contains event hero, arrival rail, event console, metrics, actions, and preview content before the player command center.
- Many button groups rely on wrapping rows, which can create uneven thumb targets.
- Form submit buttons appear below long forms; this is acceptable for account creation but should be visually singular and full-width.
- Ready match names use one-line truncation, which can hide player identity on phone widths.

Mobile recommendation:

1. Add a state-aware persistent bottom tournament action bar.
2. Make the tournament tab bar sticky on mobile.
3. Order first viewport as: status/date, title, one primary CTA, player status, countdown/start time, key stats.
4. Make primary CTA full width under 420px.
5. Keep details, streams, leaderboards, and rules below the conversion path.

## Accessibility Report

High-priority accessibility issues:

- Form labels are visual `Text` siblings, not programmatic labels.
- Errors and success messages are not announced as status/alert content.
- Tabs and segmented controls do not expose selected state.
- Disabled buttons often lack an accessible reason.
- Focus order can put visually sticky actions at the end of the DOM.
- Custom focus styles are not apparent.
- Placeholder contrast is weak and placeholders carry meaningful examples.
- Bracket and roster groups are visually structured but likely read as flat text.
- Polling updates such as `Match ready` and `Bracket published` are not announced.
- Repeated generic labels such as `Play match`, `Tournament page`, and `Open link` need context.

Positive notes:

- Core text/accent colors mostly pass contrast on dark surfaces.
- Primary button touch target sizing appears mostly acceptable, but chips should be checked at 320px.

## Competitive Gaming Product Design Review

The site feels active and ambitious, with a strong dark/gold competitive identity, countdowns, roster panels, and stream-aware surfaces. The product credibility gap is operational clarity:

- A serious tournament product must always answer "Am I in?", "When do I return?", "Who do I play?", and "What do I do now?" without Discord.
- The current experience looks rich, but richness sometimes reduces confidence because repeated panels say similar things with different labels.
- The countdown should be the hero, but the player state CTA should be the command.
- The public stream/viewer route and host control route should feel like different products.

Premium direction:

- One event hero, one state badge, one dominant action.
- Player status before education.
- Roster and bracket as evidence, not competing destinations.
- Fewer decorative panels; stronger hierarchy.

## UI Consistency Audit

Current inconsistencies:

- Button labels: `Join now`, `Join this tournament`, `Sign up`, `Join roster`, `Join tournament roster`, `Create account + join tournament`.
- Match labels: `My match`, `Find my match`, `Play my match`, `Check match status` is not used consistently.
- Stream labels: `Watch`, `Watch live`, `Stream`, `/live`, `/stream`.
- Status labels: `Registration open`, `Roster confirmed`, `Signup saved`, `Account linked`, `Bracket live`, `Match ready`, but no canonical state machine.
- Cards: hero cards, front-door cards, command cards, dashboard cards, roster cards, bracket cards use similar surfaces but different action hierarchy.
- Badges are useful but sometimes carry primary status, category, or decorative metadata interchangeably.
- Inputs have consistent visual style but inconsistent accessibility semantics.

## Ranked Issue List

| Rank | Severity | Issue | Impact |
|---:|---|---|---|
| 1 | Critical | Hidden-tab hash links | Breaks `My match`, roster, bracket promise. |
| 2 | Critical | No canonical dynamic tournament route in global nav | Users may join/check stale seeded tournament. |
| 3 | Critical | Player status wrong for double-elim/two-life | Directly misleads active competitors. |
| 4 | High | No actual check-in state | Players cannot know if registration is enough. |
| 5 | High | `/live` public/host mismatch | Watchers land in operational clutter. |
| 6 | High | Multiple competing primary buttons | Reduces first-time conversion confidence. |
| 7 | High | Mobile lacks persistent tournament CTA | Hard to recover action after scroll. |
| 8 | Medium | Capacity not enforced | Full event can over-register. |
| 9 | Medium | Signup confirmation lacks "return at" instruction | Players still need Discord or memory. |
| 10 | Medium | Accessibility labels/live regions missing | Screen-reader and keyboard experience is weaker than visual UI. |

## Recommended Audit Conclusion

Do not redesign the tournament website by adding more surfaces. Reduce and connect what exists. The product should have one canonical public tournament page that adapts by user state, one signup/auth flow, one spectator stream board, and one host control surface.

