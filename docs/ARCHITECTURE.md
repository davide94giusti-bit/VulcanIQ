# vulcanIQ production architecture

## Runtime

- **Public/admin web app:** React 18 + Vite on Cloudflare Pages.
- **Edge/API layer:** Cloudflare Pages Functions under `/api/*` for public submissions, analytics ingestion and administrative backup operations.
- **Primary backend:** Supabase Auth, PostgreSQL, PostgREST/RPC, Storage and Edge Functions.
- **Email:** Resend through server-side Supabase Edge Functions.
- **Scheduled jobs:** Supabase cron/pg_net for operational recap and Google review sync; Cloudflare Cron Worker for notifications/Etna/public excursion checks; GitHub Actions for backup orchestration.
- **Analytics:** privacy-first custom event/session storage with canonical PostgreSQL aggregation RPC shared by admin reporting and weekly recap.
- **Notifications/PWA:** distinct Public/Admin manifests and scoped service workers; Cloudflare Pages Functions + D1 own subscription/preferences/inbox/campaign APIs; Supabase Auth remains the Admin identity source.
- **Google reviews:** official Google Business Profile provider -> server OAuth -> temporary provider cache -> narrow public RPC -> normalized review UI.

## Trust boundaries

### Browser

The browser receives only publishable Supabase configuration and public/admin session tokens. It must never receive service-role keys, Google OAuth secrets, Resend credentials, cron secrets or webhook secrets.

### Cloudflare Pages Functions

Public API boundary for booking/Gift Card/analytics requests plus the notification API. Functions validate size/content, origin, rate limits and idempotency. Notification Admin routes validate Supabase bearer identity, active Admin role and device ownership before D1 access.

### Supabase database

PostgreSQL/RLS is the source of authorization truth. SECURITY DEFINER RPCs have explicit search paths and narrow grants. Public provider data is exposed only through purpose-built functions/views.

### Supabase Edge Functions

Own email provider credentials, Google OAuth refresh credentials and scheduled/manual privileged integrations. Manual admin actions verify the authenticated user and apply action throttles.

### External providers

- Resend: outbound operational email.
- INGV Osservatorio Etneo: authoritative external source for conservative public Etna update notifications.
- Web Push browser push services: delivery transport using server-side VAPID credentials.
- Google Business Profile: provider-owned review content; temporary cache only.
- GitHub: backup workflow/disaster recovery artifact path.

## Public review architecture

`reviews` remains first-party durable content. `google_reviews_cache` is temporary provider content. `reviewsService` normalizes both sources for presentation. Provider failure never blocks native reviews.

## SEO delivery

Static `index.html` provides safe home defaults. `src/seo.js` updates route-specific metadata client-side. `public/_redirects` explicitly rewrites only known SPA routes, and `public/404.html` handles unknown paths. `public/sitemap.xml` contains only implemented indexable routes.

## Modernization boundary

Business/data services should remain stable while presentation is replaced. The next large extraction is a lazy PublicApp/AdminApp bundle split so public visitors do not eagerly download administrative systems.

## Payment and notification extensions — 2026-08-21

See `docs/FINANCE_PAYMENT_RECONCILIATION_20260821.md` for the ledger/payment boundary and `docs/NOTIFICATIONS_PWA_20260821.md` for the dual-PWA, D1, Web Push, INGV and campaign architecture.
