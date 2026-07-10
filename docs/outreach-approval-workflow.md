# Outreach Approval Workflow

1. Prospect is researched with source-backed facts.
2. Fit score and risk classification are generated.
3. Outreach draft is generated with personalization facts and source URLs.
4. Validators run:
   - Unsupported claims.
   - Duplicate contact.
   - Compliance risk.
   - Missing opt-out language where needed.
   - Guessed recipient email.
5. Draft enters `NEEDS_REVIEW`.
6. Administrator reviews recipient provenance, subject, body, facts, sources, warnings, and previous interactions.
7. Administrator edits, approves, rejects, or archives.
8. Approved draft remains unsent.
9. Administrator performs a separate explicit send action.
10. Send gate verifies settings, provider, limits, approval, opt-out, and risk status.
11. Audit log records the action.

There must be no "approve all and send" option.
