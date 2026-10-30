# Public hosting landing page — Phase 1 plan

Date: 2026-10-29
Branch: `codex/tournaments-hosting-landing-20261029`
Baseline: `a2449c43a435c73197eecf7a9d8fcbd18a2a10ef` (`origin/main`, verified against the remote before worktree creation)
Target: `https://1v1tournaments.org/hosting`

This document plans public marketing only. The authenticated customer dashboard remains at `https://1v1spades.com/hosting` and is owned by the separate Spades release work.

## Source and route audit

- Expo Router supplies file-based routes from `app/`; React Native Web renders the public UI. The site exports static pages to `dist/` for Netlify. Netlify Functions and Blobs support account and tournament operations, but this marketing page needs no new function or persistence.
- `app/index.jsx` renders `src/screens/HomeScreen.jsx`; `/tournaments` uses `TournamentLandingRoute` and public tournament catalog; `/account` renders `TournamentAccountScreen`.
- The shared shell in `src/components/hub-ui.jsx` supplies the brand, desktop navigation, five-item mobile dock, account chip, page metadata, sections, cards, and buttons. The homepage uses the public shell and has a player-focused hero and schedule.
- There is no `app/hosting.jsx` and no `/hosting` redirect in `netlify.toml`. The current public `/hosting` returns 404. `app/hosting.jsx` is the intended route, without altering existing tournament or account routes.
- The exact existing Hub return destination `https://1v1spades.com/hosting` is allowlisted in `src/lib/accountConnect.js`. The account flow uses `prepareSharedAccountLaunch` with `requireAccount: true`; the account screen requires account selection for this destination. Use `buildTournamentAccountPath(SPADES_HOSTING_DESTINATION, 'signin')` for the existing-customer dashboard action. This preserves the Hub handoff and avoids constructing a new login flow.
- Public rules say player entry is free, with no buy-in or wagering. Organizer software fees must be described separately.
- The repository has screenshots of Euchre league screens, but no verified screenshot of a seeded Spades bracket suitable for this page. The `siteData.js` bracket is explicitly an example. Phase 2 must capture an authentic product view from a permitted test event, remove private account details, and label it as a test-event preview. Do not present the example bracket as a real tournament.

## Design system

Use the existing brand components and fonts, with a restrained hosting-specific dark navy layer:

| Role | Proposed token | Purpose |
| --- | --- | --- |
| Page background | `#080D14` | Deep charcoal/navy, no large image download |
| Raised surface | `#111923` | Cards and FAQ panels |
| Deep surface | `#0C131D` | Product preview frame |
| Main text | `#F4EFE6` | Existing brand white |
| Muted text | `#A7A29A` | Existing readable secondary text |
| Gold accent | `#D6A24E` | Existing brand accent; sparingly on CTAs, rules, and selected details |
| Fine border | `rgba(244,239,230,0.16)` | Existing strong line token |

Use existing DM Sans for body and navigation, Kufam for the main campaign headline if it remains legible at small widths, and DM Mono for short labels. Keep one primary gold CTA per section. Use solid colors, thin rules, purposeful spacing, and an authentic interface capture rather than gradients, glow, fabricated statistics, or decorative charts. Aim for a maximum reading width near 72rem, 16–20px body text, and a headline that scales from roughly 40px on phones to 72px on desktop.

The public shell currently switches to the bottom mobile nav below 720px. Keep its player actions intact; add a visible Host entry in the desktop navigation and a deliberate mobile header/homepage entry. On the hosting page, disable the player-focused sticky Join/My Match bar and give the access request a visible mobile CTA without covering content.

## Page structure and approved copy

1. **Navigation and hero** — H1: “HOST THE COMPETITION. OWN THE EXPERIENCE.” Supporting text: “Run a head-to-head Spades tournament with a dedicated organizer dashboard and a clear path from lobby to first-round assignments. The pilot pass covers one event for up to eight players.” Primary action: **Request Hosting Access**. Secondary action: **Open Hosting Dashboard** for existing customers.
2. **What organizers can do** — Explain the verified lobby, account-linked access, player capacity, tournament start, and first-round assignments. Show only capabilities supported by the reviewed runtime. Defer recovery, completion, uptime, automation, and other performance claims until hosted acceptance confirms them.
3. **Product demonstration** — One real screenshot of the seeded bracket or organizer view from an authorized test tournament. Caption: “Product preview from a test tournament.” Optimize to WebP/AVIF with a useful alt description and static fallback. Do not publish customer names, license keys, internal IDs, or unverified result claims.
4. **How it works** — (1) Create or sign in to the owning 1V1 Account Hub account. (2) Request access; payment instructions and the account are confirmed manually. (3) Receive a hosting key privately, redeem it, and prepare the lobby. (4) Start the event when ready; successful start with first-round assignments uses the single event allowance. Until the sales workflow is live, the CTA remains a request.
5. **Single-Event Hosting Pass** — “$15 USD one-time organizer software license fee. One tournament. Up to eight players. No automatic renewal. Original pass valid for 30 calendar days from purchase.” Explain that the fee is for organizer software; player entry remains free under the platform rules. Display one card only, with **Request Hosting Access**.
6. **Capacity roadmap** — “Need a larger event? Larger-capacity hosting is being evaluated and is not available for purchase.” Do not show unapproved capacities, dates, or prices.
7. **FAQ and support** — Short answers for purchase/readiness, account ownership, delivery, start-based consumption, expiry/reissue, player entry, and help. Email support: `mehdi.zerrad@1v1spades.com`; available 24/7 without promising an immediate response.
8. **Closing action** — Request access and the existing-customer Hub handoff link, followed by accurate links to current public rules and contact/support information.

### Pricing and policy wording

> **Single-Event Hosting Pass — $15 USD**
> One-time organizer software license fee for one tournament with up to eight players. No automatic renewal. The original pass is valid for 30 calendar days from purchase. Player entry remains free under the platform rules.

> **When is the event used?** Redeeming a key and creating a lobby use no event allowance. The one event allowance is consumed when the tournament successfully starts and first-round assignments are created.

> **How is access delivered?** Mehdi confirms payment and the owning 1V1 Account Hub account, then privately issues the hosting key. Delivery is usually the same day; allow 1–3 business days after both items are confirmed. There is no instant checkout or automatic key delivery in this pilot.

> **What if the original pass expires unused?** Contact support. An unused expired pass may be reissued after review; the original key/license is revoked or superseded so the replacement retains one tournament allowance. Replacement validity is confirmed by support rather than advertised as a fixed new period.

> **Need help?** Email `mehdi.zerrad@1v1spades.com` at any time. Include the email address on the owning Hub account and your event date. Do not send passwords or hosting keys by email unless support gives a secure delivery instruction.

The current request action may use a `mailto:` link with subject “Hosting access request” and concise instructions on the page. Do not add a checkout, payment link, instant-delivery claim, automatic refund promise, testimonial, customer count, or guarantee. Do not promise continuation after pass expiry beyond what the release team has verified.

## Phase 2 implementation scope

- Add `app/hosting.jsx` and `src/screens/HostingLandingScreen.jsx` using `HubScreen`, `Section`, `Surface`, `ActionButton`, and the existing account return helper.
- Add scoped landing styles, preferably `src/styles/hostingLanding.css` with a route-specific root selector, without changing the visual behavior of account, tournament, or admin screens.
- Add small presentational components only where they simplify the page: pass card, process steps, product preview, and accessible FAQ disclosure. Static copy may live next to the screen; no new API or Netlify Function is needed.
- Add a visible Host entry on desktop and a mobile entry point, plus a homepage link/section. Protect the five existing player-focused mobile dock actions from crowding.
- Add an authentic, privacy-reviewed product screenshot only after capture and verification. Preserve provenance and a truthful caption.
- Validate `/hosting` export and direct-load behavior, navigation, keyboard/focus order, FAQ expanded state by keyboard and real touch, 44px targets, color contrast, reduced motion, image loading, and representative phone/tablet/desktop layouts. Verify the Hub account return to `https://1v1spades.com/hosting` without altering its auth implementation.
- Run repository-required checks before Phase 2 completion. Keep generated `dist/` output out of the commit. No publish, merge, or deployment as part of Phase 2 preparation.

## Release dependencies and boundaries

- The other Codex session owns the Spades dashboard, license issuance, payment readiness, hosted acceptance, and production release. This branch touches only the public Hub marketing experience.
- The marketing page may be implemented independently. Publishing it requires review of the exact customer claims against the released hosting behavior, approval of the request process, and a genuine product image. The CTA stays “Request Hosting Access” until payment and fulfillment are ready.
- The local primary Hub checkout has unrelated generated `dist/` changes and local QA return-flow commits. This worktree starts from the verified remote `main` baseline and does not alter that checkout. Integrate any later Hub account-flow changes deliberately at release review.
