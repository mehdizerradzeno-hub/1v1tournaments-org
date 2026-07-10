# Sponsor Engine Audit

Date: 2026-07-10

## Current Architecture

- Framework: Expo Router static web app with React Native Web.
- Language: JavaScript/JSX with TypeScript available for checking. `allowJs` is enabled and `checkJs` is disabled.
- Package manager: npm.
- Hosting/deployment: Netlify static export from `dist/` with Netlify Functions.
- Persistence: Netlify Blobs for player accounts, sessions, tournament signups, brackets, tournament settings, stream commands, health, and hosted tournament records. One SQL migration exists under `netlify/database/migrations`, but the active application persistence is Blob-based.
- ORM: none.
- Authentication: player account session cookie plus host allowlist through `TOURNAMENT_HOST_ACCOUNT_EMAILS` / `TOURNAMENT_HOST_ACCOUNT_IDS`, with `TOURNAMENT_ADMIN_TOKEN` fallback for host functions.
- Existing admin tools: `/admin` host dashboard, local draft storage, tournament schedule/registration controls, roster/bracket controls, stream command editor, and Discord live alert.
- Analytics: no dedicated analytics provider found.
- Email integration: none found.
- Design system: shared components in `src/components/hub-ui.jsx`, colors/tokens in `src/lib/theme.js`.
- Test setup: `node --test` under `test/`, ESLint, TypeScript compiler available via `npx tsc --noEmit`.
- CI/CD: no `.github` workflow directory found. Netlify builds with `npm run build:netlify`.

## Relevant Reusable Components

- `HubScreen`, `Surface`, `Section`, `Badge`, `ActionButton`, `EmptyState`, and other shared UI primitives.
- `requireTournamentAdmin` in `netlify/functions/_host-auth.mjs` for server-side host permission checks.
- `getStoreWithFallback` in `netlify/functions/_account-utils.mjs` for Netlify Blob stores.
- `tournamentHostingClient.js` patterns for browser-to-function calls.
- Existing route and smoke-test conventions in `app/` and `test/routeSmoke.test.js`.

## Risks

- No ORM or relational database exists today, so the requested CRM-style model graph needs either Blob indexes or a future managed database. Blob indexes must be designed carefully for search, dedupe, pipeline views, and audit log access.
- Admin UI is currently broad and single-page. Sponsor Engine admin screens will need strong structure to avoid becoming crowded.
- No email provider exists. Any sending integration must default to mock-only and remain disabled until credentials, approval, explicit send action, limits, and opt-out checks are all present.
- No analytics source exists for audience metrics. Public sponsor pages must omit metrics until verified `SponsorMetric` records exist.
- Research automation can create legal/privacy risk if it crawls broadly. Phase 1 should only define bounded interfaces and policy.
- Existing `dist/` output is generated and often dirty after builds. Do not commit it unless specifically requested.

## Missing Dependencies

- No database client/ORM.
- No search API provider.
- No AI provider.
- No email provider.
- No CSV parsing dependency.
- No PDF generation dependency.
- No scheduled job runtime beyond Netlify/Render/manual scripts.
- No drag-and-drop library.

## Proposed Architecture

Use existing stack for early phases:

- Store sponsor entities in Netlify Blobs, one store per aggregate type.
- Maintain explicit index records for domain, normalized company name, status, owner, next action, and approval state.
- Put server-only sponsor operations behind Netlify Functions and `requireTournamentAdmin`.
- Keep UI under the existing Expo Router app and shared `hub-ui` component system.
- Add adapter interfaces for search, web fetch, AI text, email, calendar, storage, and analytics. Mock adapters are default.
- Keep outbound sending disabled unless the full approval/send gate passes.
- Add a later migration path to a relational database if pipeline volume or reporting exceeds Blob-index practicality.

## Implementation Phases

1. Foundation: audit, docs, durable rules, model definitions, permission gates, audit event helpers, environment docs.
2. CRM: prospect list/detail, pipeline board, filters, import/export preview.
3. Research: bounded research queue, provenance, dedupe, scoring, risk classification, provider interfaces.
4. Outreach: templates, draft generator, validators, approval queue, follow-up preparation, mock email provider.
5. Public sponsorship: Sponsor Us page, inquiry form, packages, media kit.
6. Deals/proposals: deal pipeline, proposal preview, print/PDF-ready export.
7. Automation/hardening: scheduled preparation jobs, weekly report, data hygiene, security/accessibility/performance review.

## Database Migration Plan

Current recommendation: start with Netlify Blob stores and indexes.

Initial stores:

- `sponsor-prospects`
- `sponsor-interactions`
- `sponsor-outreach-drafts`
- `sponsor-approval-requests`
- `sponsor-packages`
- `sponsor-deals`
- `sponsor-metrics`
- `sponsor-assets`
- `sponsor-research-runs`
- `sponsor-audit-events`

Indexes:

- `prospect-domain/{domain}.json`
- `prospect-company/{normalizedCompanyName}.json`
- `prospect-status/{status}/{prospectId}.json`
- `approval-status/{status}/{approvalId}.json`
- `next-action/{yyyy-mm-dd}/{prospectId}.json`

Before production migration, create backup/export tooling and dry-run validation. Do not run production migrations without explicit approval.

## Security Considerations

- Sponsor admin operations must use server-side host authorization.
- External page content is untrusted and must be sanitized before summarization or draft generation.
- Every source-backed claim must retain provenance.
- Never expose private CRM data on public sponsor pages.
- Never store secrets in source or browser bundles.
- Never send external communication without approval and explicit send.
- Log material mutations in `AuditEvent`.

## Baseline Validation

- `npm test`: passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build:web`: passed.
- `.github` CI directory: not present.
