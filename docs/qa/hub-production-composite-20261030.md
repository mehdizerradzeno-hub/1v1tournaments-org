# Production Hub composite — 2026-10-30

This local integration preserves the complete published Hub history through
`57ef8ca2968fff6308ef8d13d8082e9ae39bb7d2` and incorporates the full genuine-email
verification repair from `5e51580e5a29ed98cee6f9885c34b9135e982537`.

The earlier verification candidate was based on `a2449c43a435c73197eecf7a9d8fcbd18a2a10ef`.
Seven subsequently published landing-page commits were absent from that older tree.
The composite starts at the exact newer published commit and cherry-picks the
verification repair; it does not replace current landing/UI code with the older tree.

All fourteen verification-candidate files remain byte-identical to the reviewed
repair. All seven landing-page commits remain in ancestry. Among the sixteen paths
changed by those landing commits, thirteen remain byte-identical to published `57ef`.
The three intentional exceptions are:

- `src/screens/HostingLandingScreen.jsx`: replace the two purchase-based validity
  labels with the agreed, explicitly activated license-start wording.
- `src/lib/hostingLandingContent.js`: align the validity FAQ with the approved
  application policy: 30 calendar days from the agreed/activated license start;
  payment and redemption do not automatically start the term; exact timestamps are
  confirmed before delivery.
- `test/hostingLanding.test.js`: assert that wording and reject the old start rule.

This corrects an existing live-copy inconsistency with the reviewed eight-player
manual pilot terms. It does not introduce a new price, delivery promise, refund or
payment policy. Existing 1–3-business-day delivery copy, request-access behavior,
navigation, bracket image, privacy label, responsive layout and FAQ controls remain
unchanged. The earlier Phase 1 landing design document records its historical
purchase-based wording; that wording is superseded by this explicit integration
correction and the current manual pilot policy.

## Verification and preservation

The gate receipt records affected auth/account/session/hosting-landing/navigation
tests, lint, TypeScript, final web export and diff checks. It also records exact blob
comparisons against both source commits and the canonical repository's pre-existing
generated-file baseline. No generated `dist` output or dependency symlink is committed.
Outbound email is mocked in local tests. No hosted accounts, sessions, licenses,
tournaments, data or secrets are used to build the fixture.

Evidence: `/private/tmp/spades-production-integration-gates-20261030/hub-composite.json`.

This integration does not authorize pushing, deployment, production configuration
changes or customer email. Publication still requires a current complete deployment-
trigger review and separate owner approval. Production activation additionally
requires the reviewed database/application cutover gates and genuine customer
verification/authentication smoke. UNKNOWN legacy verification provenance remains
UNKNOWN; legacy sessions, canonical IDs and existing entitlements are preserved.
