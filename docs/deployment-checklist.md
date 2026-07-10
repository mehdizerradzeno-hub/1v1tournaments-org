# Sponsor Engine Deployment Checklist

Do not deploy without explicit approval.

Before deployment:

- `npm test`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build:web`
- `git diff --check`
- Review changed files for secrets.
- Confirm no `dist/` files are staged unless explicitly requested.
- Confirm outbound sending remains disabled or mock-only.
- Confirm public pages do not expose private CRM data.
- Confirm public metrics are verified or omitted.
- Confirm Netlify environment variables are configured separately from source.

After deployment approval:

- Deploy through Netlify.
- Verify cache headers.
- Verify admin routes require host access.
- Verify public Sponsor Us page contains no private data.
