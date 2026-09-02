# VulcanIQ Notifications and dual-PWA architecture — 2026-08-21

## Scope

VulcanIQ has two notification audiences and two install identities. They share the existing React/Supabase product but do not share authorization or notification categories.

| Variant | Manifest | Service worker | Start destination | Audience |
| --- | --- | --- | --- | --- |
| VulcanIQ | `/manifest.webmanifest` | `/sw.js`, scope `/` | public site | `public` |
| VulcanIQ Admin | `/admin-manifest.webmanifest` | `/admin-sw.js`, scope `/admin/` | `/admin` | `admin` |

`public/manifest-select.js` selects the correct manifest before the application bundle runs. `src/main.jsx` keeps the manifest/apple title synchronized during SPA navigation. Where the browser supports manifest IDs and separate scoped installs, the two variants can coexist on one device.

## Installation UX

Public users enter through `/install`; Admin users enter through `/admin/install` or Admin → Install & notifications.

Chromium installation is always user-triggered through `beforeinstallprompt`; VulcanIQ never auto-opens a browser install prompt.

On iPhone/iPad, the UI instructs the user to open the correct install route in Safari, use Share → Add to Home Screen, launch the installed Home Screen app, return to Install & Notifications, and explicitly enable notifications. Notification permission is requested only after that direct action.

## Notification audiences and authorization

Public and Admin category allowlists are enforced in `functions/api/notifications/[[path]].js`.

Public categories:

- official Etna updates;
- weekly Etna summary;
- upcoming public experiences;
- events;
- news;
- promotions and discounts.

Admin categories:

- new booking requests;
- upcoming excursions;
- Gift Cards;
- booking codes;
- payment/reconciliation;
- operational failures;
- security alerts;
- daily summary;
- weekly summary.

A Public request containing an Admin category is rejected server-side. Public subscriptions use a per-device high-entropy identifier and credential whose hash is persisted. Admin subscriptions require the same device ownership plus a current Supabase bearer session and an active `admin_profiles` record. Campaign creation is limited to `owner`/`manager`.

## In-app inbox and push

D1 is the notification persistence store. A device is registered first for the in-app inbox, independently of OS push permission. Enabling push upgrades that same device record with a Web Push endpoint. Disabling push or receiving a dead 404/410 endpoint degrades the record back to in-app-only delivery rather than deleting the inbox identity.

Push payloads are intentionally empty and lock-screen copy is generic. Full event-specific title/body/destination live in the logically isolated inbox. Admin push therefore never exposes customer name, phone, booking value or other sensitive booking data on a lock screen.

## Language

Each device stores `auto`, `it` or `en`.

`auto` resolves from the current saved VulcanIQ language first, then browser/device preference, then the Italian product fallback. Changing website language updates notification locale only for `auto`; explicit Italian or English remains stable.

System templates are deterministic IT/EN. Admin-created marketing campaigns require the applicable language fields and are never machine-translated automatically.

## Official Etna source

The scheduled notification Worker reads the official INGV Osservatorio Etneo / Sezione di Catania volcanic communications page:

`https://www.ct.ingv.it/sezioniesterne/Comunicati/ComunicatiVulcanici.php`

The Worker stores source URL, source identifier/hash, official timestamp when available, retrieval timestamp and classification in `notification_source_dedupe`. The first successful run establishes a baseline and does not send historical communications.

Classification is deliberately conservative: `event_started`, `activity_update`, `event_ended`, `weekly_bulletin`. Routine activity updates are throttled by `ETNA_ROUTINE_MIN_INTERVAL_HOURS`; event-start/event-end classifications are not suppressed by that routine-update throttle. User-facing text does not invent severity. The Public UI states that VulcanIQ is not an emergency or civil-protection warning service.

## Other generation paths

- Cloudflare scheduled Worker: official Etna source, public fixed excursions, upcoming accepted Admin bookings, scheduled campaigns.
- Supabase `notify-new-request`: best-effort trusted-ingest event for new booking/Gift Card requests using generic templates and a deterministic dedupe key.
- Admin composer: promotions, news, events and experiences, send-now or scheduled.

The Supabase Edge Function → Cloudflare trusted-ingest integration is optional at runtime. If its URL/secret are not configured, email continues normally and no secret is logged.

## D1 and Worker deployment model

Use one D1 database for both:

- Cloudflare Pages Functions binding: `NOTIFICATIONS_DB`;
- notification Worker binding: `NOTIFICATIONS_DB`.

Apply `workers/notifications/migrations/0001_notifications.sql` before exposing notification API routes.

The example Worker configuration is `workers/notifications/wrangler.example.toml`. Do not commit a real D1 database ID or secrets.

### Server configuration names

Cloudflare Pages Functions:

- `NOTIFICATIONS_DB` — D1 binding, not an environment string;
- `SUPABASE_URL`;
- `SUPABASE_ANON_KEY`;
- `SUPABASE_SECRET_KEY` — preferred server-only backend credential;
- `SUPABASE_SERVICE_ROLE_KEY` — temporary server-only fallback;
- `VAPID_PUBLIC_KEY`;
- `VAPID_PRIVATE_KEY` — secret;
- `VAPID_SUBJECT`;
- `NOTIFICATION_INGEST_SECRET` — secret;
- optional `PUBLIC_ALLOWED_ORIGINS`;
- budget threshold variables matching the Worker when API fanout is used.

Notification Worker:

- same `NOTIFICATIONS_DB` D1 database;
- `SUPABASE_URL`;
- `SUPABASE_ANON_KEY`;
- `SUPABASE_SECRET_KEY` — preferred server-only credential for Admin upcoming-booking polling;
- `SUPABASE_SERVICE_ROLE_KEY` — temporary server-only fallback;
- `VAPID_PUBLIC_KEY`;
- `VAPID_PRIVATE_KEY` — secret;
- `VAPID_SUBJECT`;
- configurable budget/throttle variables from the example TOML.

Supabase `notify-new-request` Edge Function, only when immediate Admin push ingestion is enabled:

- `NOTIFICATION_INGEST_URL` — the production `/api/notifications/ingest` endpoint;
- `NOTIFICATION_INGEST_SECRET` — same shared ingest secret as Cloudflare;
- optional `REQUEST_NOTIFICATION_ALLOWED_ORIGINS`.

No Supabase secret/service-role key, private VAPID key, or ingest secret belongs in `VITE_*` variables. Opaque `sb_secret_...` credentials are sent as `apikey`, never as user bearer JWTs.

## Cost / safety circuit breaker

Internal counters drive four application safety modes: `NORMAL`, `WARNING`, `CONSERVATION`, `HARD_SAFETY`. Threshold percentages and the daily/batch/cron caps are configuration, not hard-coded Cloudflare plan claims.

Conservation suppresses promotions and optional summaries first. Hard safety permits only critical Admin events. The Admin health panel labels these as conservative internal counters; they are not represented as authoritative Cloudflare billing data.

## Security and abuse protection

- Supabase token + active Admin profile verification for Admin APIs.
- Device/subscription ownership on preferences, tests and inbox.
- Strict Public/Admin category allowlists.
- Trusted-origin CORS for notification API and authenticated immediate-email retry.
- Rate limiting for device registration, subscribe/unsubscribe, tests and campaigns.
- Test notifications roughly one per minute per device/user.
- Dedupe keys for official sources, campaigns and trusted operational ingestion.
- Audit logging without tokens, subscription credentials or sensitive notification bodies.
- Generic Admin lock-screen copy.

## Manual QA after deployment to a non-production environment

1. Install Public PWA on Chrome/Android/desktop; confirm icon launches the public application.
2. Install Admin PWA from `/admin/install`; confirm icon launches `/admin`.
3. On iPhone/iPad, verify Safari Home Screen instructions and post-install notification permission flow for both variants.
4. Verify Public cannot persist Admin categories using direct API manipulation.
5. Verify Admin access expires/rejects after logout and inboxes are isolated between Admin users/devices.
6. Test foreground, background and closed-tab push where the OS/browser permits it.
7. Deny push and verify the in-app inbox still works.
8. Test `auto`, Italian and English language behavior.
9. Test quiet hours and critical Admin bypass.
10. Send/schedule a non-production campaign and verify dedupe.
11. Exercise a dead push subscription and confirm it falls back to in-app delivery.
12. Validate one fresh INGV communication in a controlled Worker/dev environment before enabling production cron sends.

## Rollback

Do not delete D1 history as routine rollback. Disable the notification Worker cron and/or remove the UI entry/feature code, then roll back frontend/Worker code. Keep subscription, audit, campaign and source-dedupe history. If a persistence correction is required, use a forward D1 migration.
