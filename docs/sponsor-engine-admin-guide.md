# Sponsor Engine Administrator Guide

This guide covers the current sponsor tools. Public sponsor inquiry intake and host-reviewed prospect persistence are live, while outbound contact remains mock-safe/manual.

## Current State

- `/admin/sponsors` is the host-only sponsor workspace.
- `/sponsors` is the public sponsor intake page.
- Public sponsor inquiries are stored server-side through Netlify Blobs.
- The inquiry inbox supports refresh, mark reviewed, and archive.
- Sponsor prospects from CSV preview and accepted research candidates are stored server-side through Netlify Blobs.
- Saved sponsor prospects can be moved manually through pipeline stages, including `DO_NOT_CONTACT`.
- Sponsor admin uses focused workspace tabs: Inbox, Prospects, Research, Drafts, Pipeline, and Export.
- Outreach drafts and proposal previews are saved server-side for host review.
- Saved drafts and proposal previews can be archived without deleting their history.
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
5. Save host-reviewed prospects into the CRM.
6. Move prospects manually through the pipeline.
7. Mark restricted or opted-out records as `DO_NOT_CONTACT`.
8. Generate a draft.
9. Validate claims and provenance.
10. Approve or reject.
11. Generate proposal previews when useful.
12. Perform a separate explicit send action only when sending is intentionally enabled.
