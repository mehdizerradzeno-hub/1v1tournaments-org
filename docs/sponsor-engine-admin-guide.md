# Sponsor Engine Administrator Guide

This guide covers the current sponsor tools. Public sponsor inquiry intake is live, while CRM persistence and outbound contact remain mock-safe/manual.

## Current State

- `/admin/sponsors` is the host-only sponsor workspace.
- `/sponsors` is the public sponsor intake page.
- Public sponsor inquiries are stored server-side through Netlify Blobs.
- The inquiry inbox supports refresh, mark reviewed, and archive.
- Prospect CRM work is still preview/local until persistence is approved.
- No research jobs are active.
- No email provider is enabled.
- No external sponsor contact is possible.

## Inquiry Workflow

1. Sign in with a host-approved account.
2. Open `/admin/sponsors`.
3. Refresh the inquiry inbox.
4. Review the package, contact name, company, email, budget, timeline, message, and submitted timestamp.
5. Mark legitimate leads as reviewed.
6. Archive spam, duplicates, or test submissions.
7. Contact sponsors manually outside the system.

## CRM Preview Workflow

1. Add or import a prospect.
2. Review source-backed research.
3. Confirm duplicate detection.
4. Review fit score and risk flags.
5. Generate a draft.
6. Validate claims and provenance.
7. Approve or reject.
8. Perform a separate explicit send action only when sending is intentionally enabled.
