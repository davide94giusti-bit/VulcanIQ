# vulcanIQ security model

## Actors

- Anonymous public visitor
- Authenticated admin
- Owner/manager privileged admin
- Supabase service role (server only)
- Scheduled job/cron caller
- Google Business Profile provider
- Resend email provider
- GitHub backup automation

## Sensitive assets

- Customer booking/Gift Card contact data
- Booking/referral/review codes
- Internal/admin notes and finance data
- Supabase service-role credential
- Resend API key
- notification/cron secrets and VAPID private key
- Google OAuth client secret and refresh token
- GitHub App/private backup credentials

## Core controls

- RLS enabled on private operational/provider tables.
- Public writes use controlled server endpoints/RPCs rather than direct anonymous operational inserts.
- SECURITY DEFINER functions use explicit search paths and narrow EXECUTE grants.
- Administrative actions require role checks; high-impact actions are throttled/idempotent where applicable.
- Provider/API secrets are server-side only; no `VITE_` service/provider secrets.
- Public analytics strips PII/free-form attribution detail.
- Google review content is never inserted into analytics.
- Google provider cache is separate, temporary and direct table access is revoked.
- Analytics session updates are service-role-only and monotonic to prevent stale packets corrupting diagnostics.
- Browser security headers add nosniff, frame denial, strict referrer policy, HSTS and Permissions-Policy. CSP remains Report-Only during compatibility validation.
- Public/Admin notification categories are server allowlisted; Admin notification APIs additionally require a valid Supabase session, active Admin profile and per-device ownership.
- Admin push lock-screen text is generic; customer/Finance details remain inside authenticated Admin UI.
- Notification device credentials, VAPID private keys and Supabase service-role credentials are never exposed through `VITE_*`.

## PII boundaries

Do not log or emit to analytics:

- names
- email addresses
- phone numbers
- review text
- booking/Gift Card messages
- admin reply text
- OAuth/access/refresh tokens
- payment/bank/card information
- raw IP addresses

Operational logs should contain safe operation names, trace/request IDs, status codes, durations and sanitized error classes.

## Google review boundary

Google content is provider-owned temporary content. OAuth secrets reside only in Supabase Edge Function secrets. Public access is via `get_public_google_reviews()` and returns only fields required for display/attribution. Expired provider rows are not public.

## Indexing boundary

Admin paths are noindex. API/referral paths are disallowed in robots. Preview deployments are marked noindex by runtime metadata; Cloudflare-level Preview access/noindex remains recommended defense in depth.

## Remaining hardening items

- Validate CSP Report-Only violations before enforcing CSP.
- Complete public/admin lazy bundle split.
- Perform a documented disaster-recovery restore drill.
- Consider centralized error monitoring if operational debugging volume justifies it.

## Notification security boundary — 2026-08-21

Cloudflare D1 stores notification subscriptions/preferences/inbox/audit data; it does not become an authentication authority. Supabase remains authoritative for Admin identity/role. Trusted booking/Gift Card ingestion uses a server-to-server shared secret and only generic deterministic templates. See `docs/NOTIFICATIONS_PWA_20260821.md`.
