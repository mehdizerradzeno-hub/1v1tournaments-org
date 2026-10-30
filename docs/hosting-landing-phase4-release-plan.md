# Hosting landing page: Phase 4 release preparation

Status: **HOLD — no push, merge, deployment, or production change authorized.**

## Reviewed scope

- Public Hub route: `/hosting`; authenticated Spades dashboard remains `https://1v1spades.com/hosting`.
- Pilot action: **Request Hosting Access** by email. No checkout, payment collection, automated fulfillment, or larger-capacity sale is included.
- The edited bracket image is documented in `docs/hosting-landing-preview/README.md`. It is a completed **local test** tournament, not a customer event or hosted production acceptance result.
- `netlify.toml` specifies `npm run build:netlify` and `dist`; the repository's existing functions are under `netlify/functions`. The marketing changes do not edit those functions or the authentication contract.

## Phase 4 verification

- Focused hosting, route, and account interaction tests; TypeScript; lint; and web static export must pass on the final commit. Record any existing lint warnings separately.
- The local static preview serves `/hosting` and its bracket image. The dashboard action reaches `/account?mode=signin&returnTo=https%3A%2F%2F1v1spades.com%2Fhosting` and shows the normal sign-in form. This local preview does not provide the deployed authentication backend, so a signed-in return to Spades remains unverified here.
- A phone check of the Request Hosting Access email composer remains a publication gate until performed on the corrected local preview URL or a controlled preview. No email should be sent during that check.
- Verify the full bracket image, alternate text, full-size link, and phone layout before publication.

## Controlled release sequence for later approval

1. Keep the production hold until the owner approves this exact content commit, the pilot sales process, and the current production hosting readiness. Retain the request-access CTA while payment and fulfillment remain manual.
2. Read the then-current production Hub branch and Netlify site/deploy identity. Reconcile this marketing branch with any newer Hub authentication or function changes; never deploy a stale full-site build over them.
3. On the reconciled commit, repeat focused tests, typecheck, lint, static export, and browser checks. Confirm the `dist` publish output includes `/hosting` and the product image, and that the complete Netlify functions directory is included.
4. Test the email action on a device without sending mail. Test normal Account Hub sign-in and verified return to `https://1v1spades.com/hosting` using an authorized test account. Check phone, tablet, and desktop layout, keyboard navigation, FAQ state, image zoom, and support links.
5. After explicit owner release approval, deploy only the reviewed Hub commit to the identified production Hub site. Record the deploy ID and source SHA. Verify `/hosting`, navigation, image asset, request email action, Account Hub return, and existing player routes on the live site.

## Rollback considerations

- Before any later deploy, record the current known-good production Hub deploy ID and source SHA. If the Hub page or authentication regresses, restore that prior Hub deploy through the supported Netlify rollback and verify account sign-in plus existing player routes.
- This content branch has no database migration or Spades runtime change. A Hub content rollback must not alter the separate Spades service, licensing state, or customer entitlements.
- If the marketing page must be withdrawn before a full Hub rollback, prepare a reviewed Hub-only navigation/route revert on the current production baseline. Do not improvise a redirect that strands existing customers.
