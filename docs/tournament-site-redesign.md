# Tournament Site Redesign Proposal

Date: 2026-07-10
Scope: tournament website and tournament-related player flows only. This document is a proposal, not an implementation.

## Product Principle

The tournament site should answer one question at every moment:

What should this player do next?

Every tournament surface should use the same state machine, same status words, and same primary button.

## Proposed Tournament Information Architecture

Primary public IA:

1. `/`
   - Marketing-light tournament front door.
   - Shows next tournament first.
   - One dominant CTA based on visitor state.
   - Secondary links to rules, stream, results.

2. `/tournaments/[slug]`
   - Canonical event page.
   - Replaces most `/next` duties.
   - Contains event hero, player status, roster, bracket, rules snapshot, stream link.
   - Hash links must activate the correct section/tab.

3. `/check-in/[slug]`
   - Account and join flow only.
   - Preserves tournament context through auth.
   - Returns to tournament page with confirmation/status.

4. `/stream`
   - Public spectator/viewer board.
   - Twitch link, roster, bracket, commands, QR.

5. `/live`
   - Host/broadcast cockpit.
   - OBS, Discord alert, overlay, bot/admin stream operations.
   - Stop linking public `Watch live` buttons here.

6. `/results`
   - Completed event summaries.

7. `/rules`
   - Public tournament rules and match operations policy.

Supporting:

- `/leaderboard` remains available but is not in the registration funnel.
- `/admin` remains host-only and out of public player path.
- `/overlay/*` remains OBS-only.

## Target State Machine

Use these exact states and make one primary action per state.

| Visitor State | Status Text | Primary Button | Secondary Buttons |
|---|---|---|---|
| Logged out, registration open | `Registration Open` | `Create Free Account to Join` | `View Rules`, `Watch Tournament` |
| Logged in, eligible, not registered | `Registration Open` | `Join Tournament` | `View Rules` |
| Already registered | `Registered` | `Check Match Status` | `View Roster`, `View Rules` |
| Check-in not open yet | `Check-In Opens Soon` | `Check Match Status` | `Add Reminder` later, `View Roster` |
| Check-in open, not checked in | `Check-In Open` | `Check In Now` | `View Roster` |
| Checked in | `Checked In` | `Check Match Status` | `View Bracket` |
| Bracket live, no match yet | `Waiting for Opponent` | `Check Match Status` | `View Bracket`, `Watch Tournament` |
| Match assigned | `Match Ready` | `Open My Match` | `View Bracket` |
| Advanced, waiting | `Advanced` | `Check Match Status` | `View Bracket` |
| Eliminated | `Eliminated` | `View Bracket` | `Watch Tournament`, `Results` |
| Tournament complete | `Completed` | `View Results` | `View Bracket` |
| Spectator | `Tournament Live` | `Watch Tournament` | `View Bracket`, `Join Discord` |

Do not show multiple primary buttons in the same viewport.

## Proposed Screen-by-Screen Wireframe Descriptions

### Homepage `/`

First viewport:

- Small top nav: `Home`, `Tournament`, `Stream`, `Rules`.
- Event hero:
  - Tournament name
  - Date and local start time
  - Live countdown
  - `Free Entry`
  - Prize line or `Prize: TBD`
  - Registration count/capacity
  - Registration status
  - One dominant CTA from state machine
- Secondary row:
  - `View Rules`
  - `Watch Tournament`
  - `View Results`

Below fold:

- Upcoming tournament list.
- Public roster preview for next event.
- Stream/Discord/YouTube links.
- App download section lower than tournament CTA.

Remove/merge:

- Merge `Choose your next move`, `PremiumCountdownHero`, and `TwitchTournamentBoard` into one next-event module.
- Move download/property buttons below tournament conversion path.

### Tournament Detail `/tournaments/[slug]`

First viewport:

- Status badge and date.
- Tournament title.
- Countdown or live state.
- One state-aware CTA.
- Four key metrics:
  - Entry
  - Registered
  - Starts
  - Format
- Player status card:
  - Account
  - Registered/check-in
  - Match

Sticky mobile:

- Bottom action bar:
  - Primary state action
  - `Bracket`
  - `Watch`

Tabs/sections:

- `Status`
  - Player status and next action.
- `Roster`
  - Current player row first, count/capacity, roster list.
- `Bracket`
  - Up next, ready matches, rounds.
- `Info`
  - Format, rules, check-in time, stream/Discord.

Hash behavior:

- `#my-match` opens Status tab.
- `#registered-players` opens Roster tab.
- `#live-bracket` opens Bracket tab.

### Check-In / Join `/check-in/[slug]`

Header:

- Tournament name
- Date/start
- Registration status
- Seats remaining
- Return link: `View Tournament`

If logged out:

- Segmented control:
  - `Create account`
  - `Sign in`
- Create form:
  - Player name
  - Email
  - Password
  - Confirm password
  - Optional handle
- Primary:
  - `Create account and join`
- Inline validation under each field.

If logged in and not registered:

- Account card.
- Primary: `Join Tournament`.
- Optional notes.

If registered:

- Confirmation panel:
  - `You are registered`
  - Player name
  - Tournament name
  - Return/check-in time
  - Confirmation ID
- Primary: `Check Match Status`.
- Secondary: `View Tournament`.

If check-in is implemented:

- During check-in window:
  - Primary: `Check In Now`
  - Success: `You are checked in`

### Stream `/stream`

Public-facing:

- Twitch/embed/link first.
- Current tournament card.
- `Join Tournament` if registration open.
- Roster and bracket preview.
- Chat command list.
- QR card.

### Live `/live`

Host-facing:

- Rename visible copy to `Broadcast Control`.
- Keep OBS, overlays, Discord alert, commands, runtime checks.
- Do not use as public `Watch live` destination.

### Results `/results`

- Completed tournament cards.
- Champion, finalist, bracket link.
- Return CTA: `Join Next Tournament`.

## Final Button Hierarchy and Exact Wording

Canonical labels:

| Job | Exact Label |
|---|---|
| Anonymous join | `Create Free Account to Join` |
| Logged-in join | `Join Tournament` |
| Create submit | `Create account and join` |
| Login submit | `Sign in and join` |
| Registered state | `You're Registered` |
| Check-in action | `Check In Now` |
| Checked-in state | `You're Checked In` |
| Status before match | `Check Match Status` |
| Ready match | `Open My Match` |
| Roster | `View Roster` |
| Bracket | `View Bracket` |
| Tournament details | `View Tournament` |
| Spectator stream | `Watch Tournament` |
| Rules | `View Rules` |
| Results | `View Results` |
| Discord | `Join Discord` |
| Cancel destructive action | `Cancel` |
| Confirm destructive action | `Yes, Clear Tournament` |

Avoid:

- `Sign up` as a generic primary.
- `Join roster`.
- `Join tournament roster`.
- `Open signup`.
- `My match` before the user is registered or bracket is live.
- `Watch live` pointing to host/broadcast pages.

## Before-and-After User Flow

### Before

Homepage or `/next`
-> choose among `Join now`, `My match`, `Details`, `Watch live`
-> `/check-in/[slug]`
-> create/sign in
-> join roster
-> confirmation
-> `Find my match`
-> tournament page hidden tab/anchor
-> match if bracket exists

Problems:

- Too many first choices.
- `My match` appears too early.
- Check-in and registration blur together.
- Confirmation does not strongly tell user when to return.
- Anchor links can miss hidden tab content.

### After

Homepage
-> one state-aware primary CTA
-> tournament page or join flow
-> account/sign-in only if needed
-> join confirmation
-> tournament page status card
-> check in when window opens
-> open match when ready
-> view bracket/results

Benefits:

- One dominant action.
- Persistent tournament context.
- Fewer duplicate pages.
- Clear registration/check-in/match states.
- Less Discord dependency.

## Implementation Plan

### Phase 1: Language and CTA Consolidation

Safe changes:

- Normalize labels to canonical button language.
- Make homepage next-event CTA dominant.
- Demote watch/download/leaderboard CTAs below join flow.
- Rename `Join roster` and `Join tournament roster` to `Join Tournament`.
- Rename post-registration `Find my match` to `Check Match Status`.

No backend changes required.

### Phase 2: Routing and Navigation Fixes

Safe changes:

- Make global nav/sticky actions point to current hosted next event, not seeded primary slug.
- Implement hash-to-tab behavior on tournament page.
- Point public `Watch Tournament` links to `/stream` or external Twitch.
- Keep `/live` host/broadcast oriented.

Low backend risk.

### Phase 3: Tournament Detail Mobile Redesign

Safe UI changes:

- Add state-aware persistent bottom tournament CTA.
- Make tab bar sticky on mobile.
- Reorder tournament first viewport around player state and one action.
- Convert mobile button rows to full-width primary-first stacks.

No gameplay/API/database changes.

### Phase 4: Registration Confirmation and Check-In Semantics

Product changes:

- Add durable confirmation state with return/check-in time.
- Add explicit `Check In Now` action and `Checked In` state.
- Clarify whether registration is separate from check-in.

Requires backend support for check-in state.

### Phase 5: Capacity and Status Correctness

Backend/UI changes:

- Enforce roster cap or show waitlist intentionally.
- Fix player status for double-elimination and two-life formats.
- Show advancement/waiting/eliminated based on format-aware logic.
- Add clearer room assignment copy before redirect while preserving ticket security.

### Phase 6: Accessibility Pass

Safe improvements:

- Add programmatic labels to inputs.
- Add selected state semantics to tabs/segments.
- Add live regions for errors/success/match-ready updates.
- Add focus-visible styling.
- Improve disabled-button explanations.
- Add semantic labels for roster/bracket groups.

### Phase 7: Visual Polish

UI refinement:

- Reduce repeated cards.
- Use countdown as visual hero and state CTA as action hero.
- Keep badges functional, not decorative.
- Align spacing and button hierarchy consistently across home, tournament, and check-in.

## Approval Gate

No implementation should begin until these decisions are approved:

1. Is `/tournaments/[slug]` the canonical player page?
2. Should `/stream` become the public spectator page and `/live` remain host/broadcast?
3. Should check-in be a real persisted state separate from registration?
4. Should full events block signup or support waitlist?
5. Should the homepage be reduced to one next-event hero before downloads/brand content?

