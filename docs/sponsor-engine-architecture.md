# Sponsor Engine Architecture

## Modules

- Sponsor CRM: prospects, interactions, notes, statuses, next actions.
- Research pipeline: manual lead, URL, CSV, and approved search-query intake.
- Fit scoring: deterministic 0-100 score with explanations and penalties.
- Outreach drafts: template-backed drafts with source-backed personalization.
- Approval queue: edit, approve, reject, archive. No sending.
- Follow-up manager: prepares tasks and drafts, never sends blindly.
- Sponsorship packages: editable public/admin package records.
- Sponsor Us page: public, brand-safe page with verified information only.
- Media kit: web and print-friendly views using verified metrics only.
- Proposal generator: editable proposal preview, no legal claims.
- Audit log: immutable event stream for material sponsor actions.
- Adapters: search, page fetch, AI text, email, calendar, file storage, analytics.

## Persistence Boundary

Early phases use Netlify Blobs because that is the current production stack. Each aggregate has a primary record and explicit index records. Future relational migration remains possible after volume and reporting needs are proven.

Public sponsor inquiries are persisted by `/.netlify/functions/sponsor-inquiries` in the `sponsor-inquiries` Blob store. Client rate-limit counters use the `sponsor-inquiry-rate-limits` Blob store and hash the request address before storage. CRM prospects, outreach drafts, proposals, and provider integrations remain mock-safe/local until their own persistence pass is approved.

## Server Boundary

All private sponsor reads/writes must pass through Netlify Functions and `requireTournamentAdmin`. Public sponsor pages can read only public packages, public assets, and approved/verified metrics.

The sponsor inquiry function exposes a public POST for new inquiries and host-protected GET/status-update actions for the inbox. No endpoint sends email, creates outbound messages, or contacts sponsors automatically.

## Draft-Only Communication Boundary

Generated outreach drafts enter `NEEDS_REVIEW`. Sending is blocked until:

1. Provider credentials exist.
2. Sending is enabled in settings.
3. Draft is approved.
4. A separate explicit send action is requested.
5. Recipient has not opted out.
6. Prospect is not `DO_NOT_CONTACT`.
7. Daily limits and quiet hours pass.

## Phase 1 Foundation Added

- Sponsor model/enums/store-name definitions in `src/lib/sponsorEngine/schema.js`.
- Sponsor role/action/send-gate helpers in `src/lib/sponsorEngine/permissions.js`.
- Audit event and redaction helpers in `src/lib/sponsorEngine/audit.js`.
- Tests in `test/sponsorEngine.test.js`.
