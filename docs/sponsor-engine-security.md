# Sponsor Engine Security

## Access Control

- Admin sponsor data is private.
- Server-side functions must call `requireTournamentAdmin`.
- Browser checks are not sufficient for authorization.

## Secret Handling

- Secrets belong in Netlify/Render/provider environment settings only.
- Never place real credentials in `.env.example`, source files, screenshots, or logs.
- Audit logs must redact keys containing token, secret, password, cookie, authorization, apiKey, or webhook.

## Research Safety

- External pages are untrusted input.
- Page text must be sanitized and separated from system instructions before AI summarization.
- Do not crawl broadly or scrape restricted services.

## Communication Safety

- Mock email provider is default.
- Production sending is disabled unless all send-gate checks pass.
- No bulk approve-and-send path.
- Opt-outs and `DO_NOT_CONTACT` stop outreach and follow-ups.

## Public/Private Data Separation

- Public pages may show only approved packages, public assets, and verified metrics.
- CRM notes, source confidence, private contacts, drafts, approvals, and interactions remain private.
