# vulcanIQ security audit — 2026-07-26

## Scope

Static review of the supplied repository covering Cloudflare Pages Functions, Supabase migrations/RLS, Edge Functions, Storage policies, analytics ingestion, backup dispatch, public form submission, Gift Card finance/code logic, and administrative operations.

A live Supabase project, Cloudflare account, GitHub organization, Resend account, and production browser session were not available. Findings that depend on deployed configuration remain subject to the post-deployment audit script.

## Remediated findings

### High — direct anonymous operational inserts

**Finding:** historical schema/migrations permitted anonymous direct inserts into booking and Gift Card tables. This allowed browser clients to bypass server-side anti-abuse controls and made privileged-field restrictions dependent on the table policy/schema.

**Remediation:** direct anonymous grants/policies are revoked by the new migration. Public submissions now use Cloudflare server endpoints and service-only RPCs with explicit field allowlists, normalization, idempotency, body limits, hashed-IP throttling, honeypot/minimum-time checks, and optional Turnstile verification.

### High — client-authoritative Gift Card finance and booking-code logic

**Finding:** the client service previously created Gift Card review codes and finance/reversal records directly.

**Remediation:** the client now calls `admin_update_gift_card_request`. The database function validates the owner/manager role, controls allowed fields and status transitions, creates/updates finance entries, creates a single Gift Card booking code, and creates a cancellation reversal.

### High — public partner attribution could influence commission logic

**Finding:** the public booking payload accepted `partner_id` and partner assignment metadata from the browser.

**Remediation:** those fields are removed from the public client, Cloudflare endpoint, and public database RPC. Partner assignment remains an authenticated administrative workflow.

### High — backup authentication depended on an expiring PAT

**Finding:** the backup endpoint depended on a long-lived GitHub token.

**Remediation:** a repository-scoped GitHub App is now preferred. The server creates a short-lived App JWT and installation token. PKCS#1 private keys are converted in memory. The PAT remains only as a temporary migration fallback and no token is logged.

### Medium — backup-trigger abuse and duplicate workflows

**Finding:** the existing backup flow needed explicit server-side throttling and concurrent-run protection.

**Remediation:** the endpoint validates JSON and body size, requires an active owner, applies database-backed action throttling, and rejects dispatch while an active backup workflow exists.

### High — notification replay and email abuse

**Finding:** request notification infrastructure lacked atomic recipient-level idempotency and bounded retries.

**Remediation:** `request_notification_log` has a unique request/table/channel/recipient key. Initial claims are insert-on-conflict, retries require an authenticated owner/manager, attempts are bounded, and manual retries are rate-limited. Requests remain stored when Resend fails.

### Medium — weekly report replay and timezone drift

**Finding:** a fixed UTC cron would not consistently represent Monday 08:00 in `Europe/Rome` across daylight-saving changes.

**Remediation:** two UTC cron invocations are scheduled and the Edge Function sends only during Monday 08:00-08:14 Rome local time. A unique period/recipient/type index prevents duplicate reports.

### Medium — analytics ingestion abuse and broken journey linkage

**Finding:** analytics lacked database-backed ingestion throttling and the booking journey did not consistently emit all canonical events with stable IDs.

**Remediation:** analytics ingestion is body-limited, allowlisted, PII-filtered, and rate-limited. The client now emits open/start/step/attempt/created/success events and carries the journey/request identifiers. Analytics failures remain non-blocking.

### Medium — first-touch attribution overwrite risk

**Finding:** detected source and customer-declared source could be conflated, and navigation could replace original attribution.

**Remediation:** first-touch UTM/referrer/landing data is persisted once per browser session. `detected_source` and `declared_source` are stored separately.

### Medium — private operational logs lacked dedicated RLS

**Finding:** notification logs, weekly reports, and endpoint rate-limit state did not exist with dedicated private policies.

**Remediation:** the tables are created with RLS. Notification/report reads are restricted to owner/manager roles; rate-limit state has no public policy.

### Medium — Storage exposure required explicit classification

**Finding:** live Storage bucket classification was not available from the repository.

**Remediation:** the hardening migration marks every bucket private except the known public asset bucket, applies MIME/size restrictions to that public bucket, removes globally permissive object policies, and adds explicit public-read/admin-management policies for that bucket.

**Deployment caution:** inspect the live bucket inventory before applying this migration. Add any other intentionally public bucket to the allowlist only after confirming it contains no private data.

## Remaining findings requiring follow-up

### High — broad legacy `is_admin()` authorization model

The existing Revenue OS migration treats `owner`, `manager`, `guide`, `finance`, and `content_editor` as administrators for many pre-existing RLS policies. The new privileged functions and reports use a stricter owner/manager boundary, but a complete least-privilege rewrite of every legacy table policy was not safely possible without the live role-to-workflow matrix.

**Required follow-up:** inventory every table/action by role, introduce role-specific helpers, and replace broad `public.is_admin()` policies incrementally on staging.

### High — remaining client-side finance/admin mutations

The Gift Card path is server-authoritative, but the wider application still contains authenticated client mutations for finance, commissions, manual bookings, and other admin entities. RLS reduces anonymous exposure but does not provide field-level transition validation.

**Required follow-up:** migrate sensitive mutations to RPCs/Edge Functions with explicit transition rules, immutable-field checks, audit entries, and role-specific authorization.

### Medium — Turnstile browser widget not yet rendered

Server-side Turnstile validation is implemented. The supplied public UI does not yet generate a token. `TURNSTILE_ENFORCE` must remain false until the widget/client integration is tested.

### Medium — live RLS, grants, and IDOR tests not executed

The repository includes a read-only audit script, but deployed policies and grants may differ from migration history. Execute the audit and the anonymous/non-admin test matrix on staging and production.

### Medium — live Storage access tests not executed

Verify anonymous listing/download denial and signed-URL access for every private bucket after applying policy changes.

### Low — future SSRF and AI risk

No unrestricted URL-fetching or autonomous AI tool chain was found in the implemented patch. Future URL import/preview or AI features must use protocol/domain allowlists, private-IP blocking, response limits, deterministic authorization, confirmation for destructive actions, and hard cost limits.

## Secret scan

No committed `.pem`, `.key`, or `id_rsa` file was found. Source references to secret variable names and placeholder values exist for configuration/documentation. The GitHub private-key helper contains PEM header strings as code, not private key material.

Run the repository scan and inspect Cloudflare/Supabase deployment variables before release.
