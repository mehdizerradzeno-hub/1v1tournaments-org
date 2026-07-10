# Sponsor Engine Setup

## Works Without External Credentials

- Sponsor domain constants and starter package definitions.
- Prospect normalization and deduplication helpers.
- Permission and send-gate checks.
- Audit event construction and redaction.
- Future mock adapters for research, AI drafting, email, calendar, storage, and analytics.

## Requires Existing Host Access

- Any future sponsor admin route or function must require a host-approved player account or `TOURNAMENT_ADMIN_TOKEN`.
- Configure host access with:
  - `TOURNAMENT_HOST_ACCOUNT_EMAILS`
  - `TOURNAMENT_HOST_ACCOUNT_IDS`
  - `TOURNAMENT_ADMIN_TOKEN`

## Future Optional Credentials

See `.env.example` for placeholders. Do not store real values in source.

## Local Commands

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build:web
```

## Production Notes

Do not enable outbound sponsor sending in production until the approval workflow, opt-out checks, limits, and provider adapter are implemented and reviewed.
