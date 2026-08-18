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
- notification/cron secrets
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
- Browser security headers add nosniff, frame denial, strict referrer policy and Permissions-Policy. CSP is Report-Only during compatibility validation.

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
- Introduce/commit package-lock and transition CI to deterministic `npm ci` only.
- Complete public/admin lazy bundle split.
- Perform a documented disaster-recovery restore drill.
- Consider centralized error monitoring if operational debugging volume justifies it.
