# vulcanIQ Analytics Consolidation — Implementation Report

Baseline: `main@6bb88807ccff7adaa2416521ca8d7cdf0f5dcad8`

## Scope

This release replaces capped raw-row KPI calculation with a protected PostgreSQL analytics summary contract shared by the admin Analytics page and Weekly Management Recap. Historical analytics are preserved. The release does not implement destructive reset behaviour.

## Confirmed in source/local static validation

- Canonical `get_admin_analytics_summary(...)` migration exists and aggregates in PostgreSQL using half-open `[from,to)` ranges.
- Analytics reporting baseline is non-destructive and separately stored from the tracking-contract timestamp.
- Website booking, Fast Request / WhatsApp, Gift Card, and booking-code funnels are isolated.
- Approximate unique visitors are defined from distinct `visitor_id` values on public `page_view` events.
- Traffic/device/browser/OS/language/geography distributions are based on page views.
- Admin KPI cards and JSON export consume the canonical RPC output; raw events/sessions are limited to explicit paginated diagnostics.
- The weekly recap consumes the same canonical RPC instead of calculating analytics from a fixed raw-event list.
- Browser tracking emits canonical booking submit events going forward while historical aliases remain readable.
- Session lifecycle writes update `analytics_sessions`; lifecycle heartbeats are no longer inserted into `analytics_events` by the current ingestion endpoint.
- Heartbeat cadence is 60 seconds and preserves the browser session's original `started_at` value.
- SPA route changes no longer restart the analytics heartbeat; background visibility changes are not treated as true session termination.
- Current booking submission incident state is recency/recovery aware.
- Owner/manager reporting baseline controls and browser-local analytics opt-out are present.
- Export samples strip free-form attribution detail and other unsafe metadata fields.
- Canonical experience demand includes impressions, detail opens, unique detail visitors, form opens, tracked successes, compatible database requests, confirmations, and contact actions.
- QR and business-card acquisition remain distinct normalized sources.

## Local release gates completed in the implementation workspace

- `git diff --check`: PASS
- `npm run test:security`: **51 passed, 0 failed**
- `npm run test:analytics`: **37 passed, 0 failed**.
- Changed JS/JSX/TS files: parsed successfully using TypeScript `transpileModule`.
- Relative import audit: PASS.

A full Vite production build was **not** claimed in the implementation workspace because project `node_modules` are not installed there. The receiving Windows checkout must run `npm install` and `npm run build` before migration/deployment.

## Requires connected validation

The following cannot be proven solely from the source snapshot and must be checked before merge:

- Supabase migration executes successfully against the actual production schema.
- Canonical RPC returns complete real database totals from an authenticated admin/service-role path.
- Cloudflare Pages deploys the modified analytics ingestion endpoint.
- New production lifecycle traffic stops adding `session_heartbeat` rows to `analytics_events` while continuing to update `analytics_sessions`.
- iPhone Safari, Android Chrome, and desktop Chrome booking journeys produce one canonical request and the expected event chain.
- Fast Request, Gift Card, and booking-code journeys remain isolated in their own funnels.
- Admin and weekly email show identical shared KPIs for an identical reporting interval.
- Baseline start/clear behaviour is non-destructive against the connected database.
- Email rendering and delivery remain correct in configured inboxes.

## Deployment dependency order

1. Apply the SQL migration.
2. Run the safe validation SQL.
3. Deploy the `send-weekly-admin-recap` Edge Function because it now depends on the new RPC.
4. Push the feature branch so Cloudflare Pages builds the frontend and `/api/analytics/event` change.
5. Validate the Cloudflare Preview.
6. Run production/preview journey and parity tests.
7. Merge only after the release gates pass.

## Rollback

Frontend/API/Edge code can be rolled back by reverting the release commit. The new analytics SQL objects may safely remain installed because they do not delete or mutate historical analytics except when a privileged operator explicitly changes the reporting-baseline setting. Do not delete analytics history as a rollback mechanism.
