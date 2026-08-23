# Files changed — reimplemented 2026-08-11 on `main@33cf9de`

## Application and Cloudflare Pages Functions

- `package.json` — pins `jose` and adds the security regression command.
- `functions/api/admin/backup/_shared.js` — GitHub App JWT/installation tokens, PKCS#1 conversion, fallback mode, rate-limit helper, bounded JSON parsing.
- `functions/api/admin/backup/create.js` — owner-only, rate-limited, duplicate-safe backup dispatch.
- `functions/api/analytics/event.js` — canonical booking events, body limits, hashed-IP database throttling.
- `functions/api/public/_shared.js` — CORS, validation, anti-abuse, Turnstile, service-role RPC, idempotency, and rate-limit helpers.
- `functions/api/public/booking-request.js` — secure public booking submission endpoint.
- `functions/api/public/gift-card-request.js` — secure public Gift Card submission endpoint.

## Frontend and services

- `src/analytics.js` — stable first-touch attribution, canonical form events, bounded keepalive delivery.
- `src/main.jsx` — journey instrumentation, secure submission metadata, admin safeguards, retry/report controls.
- `src/services/bookingRequests.js` — routes public requests through the server endpoint and persists attribution.
- `src/services/giftCards.js` — routes public requests through the server endpoint and moves privileged updates to an RPC.
- `src/services/operationsService.js` — safeguard, notification retry, and weekly report operations.
- `src/styles.css` — admin badge, warning, notification, and report UI styles.

## Supabase database, Edge Functions, and setup

- `supabase/config.toml` — Edge Function gateway configuration.
- `supabase/migrations/20260726090000_automation_notifications_weekly_security.sql` — schema, idempotency, notification/report logs, rate limits, RLS, public RPCs, Gift Card authority, analytics allowlist.
- `supabase/migrations/20260726100000_storage_security_hardening.sql` — bucket classification and object policies.
- `supabase/functions/_shared/vulcaniq.ts` — common authorization, database, Resend, validation, and throttling helpers.
- `supabase/functions/notify-new-request/index.ts` — immediate request notifications and controlled retries.
- `supabase/functions/send-weekly-admin-recap/index.ts` — weekly report generation, DST-safe scheduling, idempotency, test/resend.
- `supabase/setup/20260726_notification_webhooks.sql` — Vault-backed database webhooks.
- `supabase/setup/20260726_weekly_recap_cron.sql` — Vault-backed DST-safe cron invocations.
- `supabase/audit/20260726_security_audit.sql` — read-only deployed-state audit queries.

## Validation and release documentation

- `tools/security-regression.mjs` — static security regression suite.
- `IMPLEMENTATION_REPORT_AUTOMATION_SECURITY_20260726.md` — implementation, limitations, and rollback report.
- `docs/AUTOMATION_SECURITY_SETUP_20260726.md` — deployment and production test sequence.
- `docs/CLOUDFLARE_RATE_LIMITS.md` — recommended Cloudflare rules.
- `docs/SECRET_CHECKLIST_20260726.md` — server-only configuration inventory.
- `docs/SECURITY_AUDIT_20260726.md` — findings and remediation report.
- `docs/TEST_REPORT_20260726.md` — completed and connected-service test status.
- `docs/FILES_CHANGED_20260726.md` — this inventory.

- `docs/REIMPLEMENTATION_BASELINE_20260811.md` — records the clean production baseline and reimplementation validation.
