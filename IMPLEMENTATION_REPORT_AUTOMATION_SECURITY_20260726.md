# Implementation report — vulcanIQ automation, notifications, analytics, weekly recap, and security

## Implemented code changes

### GitHub App backup authentication

- Added pinned `jose` dependency.
- Added GitHub App JWT and installation-token creation.
- Supports GitHub PKCS#1 private keys through in-memory PKCS#8 conversion.
- Prefers `github_app`; retains temporary `legacy_pat` fallback.
- Added body/content validation, owner authorization, database-backed throttling, and concurrent workflow rejection.

### Secure public submissions

- Added Cloudflare endpoints for booking and Gift Card requests.
- Added field allowlists, server normalization, body limits, contact/date validation, honeypot and minimum-completion checks, optional Turnstile validation, idempotency, actor/global throttling, and hashed IP identifiers.
- Revoked direct anonymous booking, Gift Card, and analytics inserts.
- Added service-role-only creation RPCs.
- Removed browser-controlled partner assignment fields.

### Immediate notifications

- Added `notify-new-request` Edge Function.
- Added recipient-level atomic idempotency log.
- Added webhook-secret validation.
- Added authenticated, bounded, rate-limited retries.
- Added sanitized Resend errors and parent request notification state.
- Added version-controlled database trigger setup using Vault and `pg_net`.

### Admin safeguards

- Added pending, 12-hour, 24-hour, notification failure, unsent notification, missing Gift Card code, 72-hour unconfirmed, and weekly report failure counters.
- Added navigation badge and dashboard warning strip.
- Added per-request notification state and retry controls.
- Added weekly report history and test-send UI.

### Analytics and attribution

- Added canonical form start and step events.
- Ensured saved-request and success events carry the request ID.
- Persisted one stable booking journey ID.
- Added first-touch UTM/referrer/landing persistence.
- Separated detected source from customer-declared source.
- Added analytics endpoint throttling and body limits.

### Weekly management recap

- Added private report history table and unique send key.
- Added authenticated manual test/resend path.
- Added cron-secret validation and manual action throttling.
- Added DST-safe Monday 08:00 `Europe/Rome` gate.
- Added booking, Gift Card, finance, analytics, review, notification, urgency, and deterministic recommendation sections.
- Added Vault/cron setup SQL.

### Security hardening

- Added owner/manager privileged authorization helper.
- Added RLS for new operational tables.
- Added Storage hardening migration.
- Moved Gift Card finance/reversal/code authority into a database RPC; paid/issued Gift Cards receive one recipient-redeemable booking code.
- Added audit SQL, rate-limit guidance, secret checklist, regression tests, and deployment guide.


## Deliverable index

- Deployment guide: `docs/AUTOMATION_SECURITY_SETUP_20260726.md`
- Security findings/remediation: `docs/SECURITY_AUDIT_20260726.md`
- Test results: `docs/TEST_REPORT_20260726.md`
- Secret checklist: `docs/SECRET_CHECKLIST_20260726.md`
- Cloudflare rate limits: `docs/CLOUDFLARE_RATE_LIMITS.md`
- Files changed: `docs/FILES_CHANGED_20260726.md`
- Supabase audit queries: `supabase/audit/20260726_security_audit.sql`

## Manual setup still required

- Create/install the GitHub App and add Cloudflare secrets.
- Verify two App-authenticated backups, then remove the PAT.
- Verify the Resend sender domain and add recipients.
- Apply database migrations after live schema review.
- Deploy Edge Functions and add secrets.
- Add Vault values and run webhook/cron setup scripts.
- Review live Storage buckets before applying the storage migration.
- Configure Cloudflare rate-limit rules.
- Add a public Turnstile widget before enabling enforcement.
- Execute physical mobile QA and production smoke tests.

## Known limitations

- Full least-privilege remediation of every legacy `public.is_admin()` policy requires the live role matrix.
- Sensitive finance/commission mutations outside the Gift Card path remain candidates for server-authoritative RPC conversion.
- The weekly recap uses the columns present in the supplied repository; metrics requiring unavailable capacity, payment collection, or guide/partner schedule data are omitted rather than inferred.
- No production credentials or connected-service changes were made from this environment.
- Full Vite build was blocked by the package registry environment; see the test report.

## Rollback plan

1. Disable the two Edge Functions or remove their secrets.
2. Unschedule `vulcaniq-weekly-recap-summer` and `vulcaniq-weekly-recap-winter`.
3. Drop the two notification triggers.
4. Restore the previous Cloudflare deployment.
5. Re-enable the prior public insert policies only as a temporary emergency measure and only with Cloudflare blocking in place.
6. Revert the dated migrations using a reviewed rollback SQL; preserve request/report logs for audit unless data deletion is explicitly approved.
7. Restore the legacy PAT only if the GitHub App path fails and immediately rotate it after use.

Do not roll back stored requests, finance entries, booking codes, or notification/report history without a database backup and an explicit data-retention decision.
