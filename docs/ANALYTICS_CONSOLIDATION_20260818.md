# vulcanIQ Analytics Consolidation — 2026-08-18

Baseline: production `main@6bb88807ccff7adaa2416521ca8d7cdf0f5dcad8`

## Purpose

This release replaces capped raw-row analytics calculations with one protected PostgreSQL reporting contract. The same contract supplies the admin Analytics page, the JSON export, and the analytics portion of the Weekly Management Recap.

The release is deliberately non-destructive. It does **not** truncate `analytics_events`, `analytics_sessions`, booking requests, Gift Card requests, finance records, notifications, or weekly reports. Historical rows remain available.

## Source-of-truth architecture

```text
Public browser
  -> /api/analytics/event (Cloudflare Pages Function)
  -> analytics_events + analytics_sessions (Supabase)
  -> public.get_admin_analytics_summary(...)
       -> Admin Analytics
       -> JSON analytics export
       -> send-weekly-admin-recap
            -> weeklyRecapEmail.ts
```

High-level KPIs are no longer calculated by downloading a fixed number of raw rows into React. Raw events/sessions are retained only for diagnostic drilldowns and are loaded as explicit paginated samples.

## Why this was required

The previous admin implementation requested large raw arrays with `.limit(...)`. PostgREST/Supabase can cap a response below the requested limit. Once the response cap is reached, newly inserted rows displace older rows in the returned slice. A client-side `count(distinct visitor_id)` over that moving slice can therefore decrease even while the database only gains rows.

The weekly recap independently fetched raw analytics with its own limit and recomputed similar formulas. This created a second source of truth and allowed admin/email values to drift.

## Database contract

Migration:

```text
supabase/migrations/20260818_analytics_consolidation.sql
```

The migration creates:

- `public.analytics_reporting_settings`
- `public.get_analytics_reporting_settings()`
- `public.set_analytics_reporting_baseline(timestamptz)`
- `public.clear_analytics_reporting_baseline()`
- `public.analytics_normalize_traffic_source(...)`
- `public.get_admin_analytics_summary(p_from, p_to, p_use_reporting_baseline)`
- supporting analytics indexes where absent

The admin summary RPC is `SECURITY DEFINER`, uses an explicit `search_path = public, pg_temp`, and rejects callers that are neither `service_role` nor an authenticated vulcanIQ admin. Baseline mutation requires `service_role` or `is_privileged_admin()`.

Direct access to `analytics_reporting_settings` is revoked from `PUBLIC`, `anon`, and `authenticated`; settings are accessed through protected RPCs.

## Time ranges

All reporting intervals use a half-open interval:

```text
[from, to)
```

The browser converts date-based admin filters using `Europe/Rome` calendar boundaries and sends UTC timestamps to the database. This avoids ambiguous inclusive end dates and preserves correct 23/25-hour days across DST changes.

Period behaviour:

- `Since baseline`: no explicit start; server applies `reporting_baseline_at` when set.
- `Today`: Europe/Rome midnight through current time.
- `Last 7/30/90 days`: Europe/Rome calendar start through current time.
- `Custom range`: Europe/Rome midnight on selected start through midnight after selected end.
- `All historical data`: does not apply the reporting baseline.

## Tracking contract vs reporting baseline

These are intentionally different concepts.

### Tracking contract

`tracking_contract_started_at` defaults to:

```text
2026-08-17T00:00:00Z
```

It marks the point after which the current funnel event contract is expected to be reliable. Historical business records before this timestamp are retained but are not mixed into current-contract tracked conversion denominators.

### Reporting baseline

`reporting_baseline_at` is optional and owner/manager controlled. It changes reporting visibility only.

Starting a new baseline does **not** delete or modify historical rows. `All historical data` continues to ignore the baseline and exposes the complete retained history.

There is intentionally no destructive "Reset analytics" operation in this release.

## Canonical metric definitions

### Approx. unique visitors

```sql
count(distinct visitor_id)
filter (where event_name = 'page_view')
```

This represents anonymous browser profiles, not verified physical people.

### Page views

Canonical `page_view` events only.

### Sessions

Rows in `analytics_sessions` whose `started_at` falls inside the effective reporting interval. `analytics_sessions` is the session authority; session lifecycle events are not required for summary counts.

### Average engagement

Average `analytics_sessions.duration_seconds` for sessions in the effective interval.

### Traffic/device/browser/OS/geography/language

These distributions are based on canonical `page_view` rows. They are page-view distributions and are not presented as visitor distributions.

### Contact intent

Raw action counts remain available for WhatsApp, email, phone, and Maps.

`contact_intent_visitors` is:

```text
count(distinct visitor_id with at least one qualifying contact action)
```

A visitor clicking WhatsApp three times contributes three raw WhatsApp clicks but one contact-intent visitor.

### Confirmation semantics

A booking is considered confirmed for canonical request-rate reporting when either:

```text
status in accepted / confirmed / completed
```

or:

```text
lead_status in deposit_paid / confirmed / completed / review_requested / review_received
```

This matches the business confirmation semantics used elsewhere in the app rather than considering only one lead state.

## Funnel families

The four product journeys are calculated independently.

### Website booking questionnaire

Canonical events:

```text
booking_form_open
booking_form_started
booking_form_step_completed
booking_form_submit_attempt
booking_form_validation_error
booking_request_created
booking_form_submit_success
booking_form_submit_error
```

Primary journey identifier precedence:

```text
booking_journey_id
-> journey_id
-> booking_request_id
-> event id fallback
```

The database-request stage uses only current-contract compatible public website requests. Booking-code and admin/manual requests cannot enter this funnel.

### Fast Request / WhatsApp

Canonical product events:

```text
fast_request_start
fast_request_step_complete
fast_request_submit_attempt
fast_request_submit_success
fast_request_whatsapp_click
fast_request_abandon
```

Historical generic form events are accepted only when metadata explicitly identifies `form_type` or `flow_type` as `fast_request`.

### Gift Card

Canonical events:

```text
gift_card_view
gift_card_questionnaire_started
gift_card_questionnaire_step_completed
gift_card_request_created
gift_card_whatsapp_request_clicked
```

The Gift Card UI now carries one stable journey ID across the journey. Business totals remain available separately; the funnel database-request stage uses requests compatible with the current tracking contract.

### Booking code

Canonical events:

```text
booking_code_redeem_attempt
booking_code_redeem_success
booking_code_redeem_error
booking_request_created
```

The redemption modal now carries one stable journey ID and includes the resulting `booking_request_id` after successful redemption. `booking_request_created` is explicitly marked `source=booking_code` so it cannot enter the website funnel.

Historical aliases remain readable, but current clients no longer emit new booking submit aliases.

## Legacy event compatibility

Historical aliases retained for reporting/old clients include:

```text
booking_submit_attempt -> booking_form_submit_attempt
booking_submit_validation_error -> booking_form_validation_error
booking_submit_success -> booking_form_submit_success
booking_submit -> booking_form_submit_success
booking_submit_error -> booking_form_submit_error
booking_code_submitted -> booking_code_redeem_attempt
booking_code_redeemed -> booking_code_redeem_success
booking_code_invalid -> booking_code_redeem_error
```

Distinct journey IDs prevent canonical + legacy aliases for the same journey from double-counting in diagnostic calculations.

`maps_click` remains allowlisted for historical compatibility, but the current browser emits only `google_maps_click`. Server reporting prefers canonical Maps clicks whenever they exist in the requested period and falls back to legacy `maps_click` only when the canonical event is absent.

## Experience demand

Canonical demand uses `experience_detail_open`. `experience_card_view` remains an impression metric. The old `excursion_view` is historical compatibility only and does not drive the canonical demand aggregate.

Per-experience server output includes:

- card impressions
- detail opens
- unique detail visitors
- website form opens
- tracked website submit successes
- contact actions
- coverage status

A conversion percentage is withheld when historical/tracked populations are incompatible or when a numerator would exceed its denominator.

## Tracking incidents

Submission health is no longer equivalent to "any error since the tracking fix".

The canonical contract distinguishes:

- `current_failure`: recent error inside a current reporting interval with no later canonical success
- `retest_required`: latest error is older than 24 hours and has no later success
- `resolved`: a later canonical success follows the error
- `historical`: an old reporting interval contains an unresolved error, but it is not a current operational incident
- `none`: no canonical submit error in the evaluated period

Historical tracking gaps are rendered as historical diagnostics, not red operational incidents.

## Session lifecycle changes

Before this release, approximately 25-second heartbeat traffic was written into both `analytics_sessions` and `analytics_events`. Lifecycle rows could dominate the event table and accelerate raw-row cap problems.

Going forward:

- heartbeat interval is 60 seconds;
- `session_start`, `session_heartbeat`, and `session_end` update `analytics_sessions`;
- those lifecycle events are not inserted into `analytics_events` by the current Cloudflare function;
- normal SPA route changes emit `page_view` but do not restart the analytics heartbeat/session;
- backgrounding a mobile tab is not treated as a final session end;
- `pagehide` finalizes once, guarded against duplicate end emission and bfcache restoration.

Historical lifecycle rows are preserved and simply ignored for behavioural KPIs.

## Browser analytics opt-out

Admin Analytics provides:

```text
Exclude this browser
Resume analytics on this browser
```

The setting uses local storage key:

```text
vulcaniq_analytics_opt_out
```

It is browser-local and works regardless of the operator's current IP/network. Do Not Track remains respected.

## Privacy

Analytics ingestion must remain diagnostic and non-blocking. Analytics failures never block booking creation.

The analytics pipeline strips or rejects metadata that can contain customer PII or free-form customer content, including names, emails, phones, messages, notes, addresses, precise coordinates, payment/card data, buyer/recipient details, and free-form `heard_about_us_detail` / `heard_about_us_display` text.

Allowed correlation identifiers include anonymous/operational IDs such as:

```text
visitor_id
session_id
journey_id
booking_journey_id
booking_request_id
```

The analytics JSON export also omits free-form attribution detail from booking-request samples.

## Admin Analytics UI

The top-level cards and canonical funnel panels are backed by `get_admin_analytics_summary()`.

The health panel shows:

- server-side aggregation status
- event count in the effective period
- session count
- last event timestamp
- tracking-contract timestamp
- reporting baseline
- last refresh time
- Refresh Analytics action
- Start/Clear baseline for owner/manager
- browser opt-out action

Raw event/session data is limited to a paginated diagnostic sample (currently 250 rows per table for the first page). The UI explicitly labels sample-only diagnostics. A sample cannot change canonical top-level KPI values.

## JSON export

The export is separated into:

```text
meta
coverage
summary
canonical_funnels
canonical_rates
canonical_integrity
tables
drilldowns
anonymized_samples
```

`summary`, canonical funnels, canonical rates, dimensions, and data-quality warnings come from the server contract.

Raw event/session/request rows are diagnostic samples. Export metadata explicitly records sample sizes and whether event/session samples are truncated.

## Weekly Management Recap

`send-weekly-admin-recap` calls:

```text
rpc/get_admin_analytics_summary
```

for the weekly `Europe/Rome` interval. It no longer downloads raw `analytics_events` to calculate the email's analytics KPIs.

Shared admin/email values therefore come from the same database contract:

- page views
- approximate visitors
- sessions
- website funnel
- Fast Request funnel
- Gift Card funnel
- booking-code funnel
- contact intent
- devices
- browsers
- traffic sources
- experience demand
- submit incident state

Business/operational metrics such as finance, current pending requests, review workload, and notification failures continue to use their dedicated authoritative tables.

When a reporting baseline falls inside the weekly period, period-scoped business totals use the same effective lower bound returned by the analytics contract. Current operational safeguard counts remain current by design.

## Raw drilldowns

`src/services/analyticsService.js` now exposes explicit paginated raw reads using Supabase `.range(...)` plus exact count metadata. Raw reads are not used for full-period KPI calculations.

Current maximum raw page size is 500; the admin initially requests 250 events and 250 sessions for diagnostics.

## Files added

```text
src/features/analytics/AnalyticsCanonicalFunnels.jsx
src/features/analytics/AnalyticsHealthPanel.jsx
src/features/analytics/contract.js
src/styles/analytics-consolidated.css
supabase/migrations/20260818_analytics_consolidation.sql
tools/analytics-regression.mjs
docs/ANALYTICS_CONSOLIDATION_20260818.md
```

## Important files modified

```text
functions/api/analytics/event.js
package.json
src/analytics.js
src/features/analytics/integrity.js
src/main.jsx
src/services/analyticsService.js
supabase/functions/_shared/weeklyRecapEmail.ts
supabase/functions/send-weekly-admin-recap/index.ts
tools/security-regression.mjs
```

## Local release gates

Run from the repository root:

```powershell
git diff --check
npm install
npm run test:security
npm run test:analytics
npm run build
```

The release must not be deployed unless all commands pass.

## Supabase migration deployment

Do **not** try to execute the `.sql` path as a PowerShell command.

Preferred manual procedure:

1. Open Supabase Dashboard -> SQL Editor.
2. Open `supabase/migrations/20260818_analytics_consolidation.sql` locally.
3. Copy the complete SQL file into a new SQL Editor query.
4. Run it once against the production project.
5. Run the non-destructive verification queries below.

CLI `supabase db push` is also acceptable when the local CLI/project linkage is deliberately configured, but the SQL Editor method is easier to audit for this one forward migration.

## Production verification SQL

These queries do not delete or modify analytics data.

### Independent row totals

```sql
select
  count(*) as total_events,
  count(*) filter (where event_name = 'page_view') as page_views,
  count(distinct visitor_id) filter (
    where event_name = 'page_view' and visitor_id is not null
  ) as approx_unique_visitors,
  min(occurred_at) as first_event,
  max(occurred_at) as latest_event
from public.analytics_events;
```

```sql
select
  count(*) as total_sessions,
  count(distinct visitor_id) as browser_profiles_with_sessions,
  min(started_at) as first_session,
  max(started_at) as latest_session
from public.analytics_sessions;
```

### Event distribution

```sql
select event_name, count(*) as rows
from public.analytics_events
group by event_name
order by rows desc, event_name;
```

### Historical lifecycle volume

```sql
select
  count(*) filter (where event_name = 'session_start') as session_start_rows,
  count(*) filter (where event_name = 'session_heartbeat') as session_heartbeat_rows,
  count(*) filter (where event_name = 'session_end') as session_end_rows
from public.analytics_events;
```

### Verify migration objects

```sql
select to_regclass('public.analytics_reporting_settings') as reporting_settings_table;
```

```sql
select
  position('contract_version' in pg_get_functiondef('public.get_admin_analytics_summary(timestamptz,timestamptz,boolean)'::regprocedure)) > 0 as has_contract_version,
  position('analytics_reporting_settings' in pg_get_functiondef('public.get_admin_analytics_summary(timestamptz,timestamptz,boolean)'::regprocedure)) > 0 as uses_reporting_settings,
  position('occurred_at < v_to' in pg_get_functiondef('public.get_admin_analytics_summary(timestamptz,timestamptz,boolean)'::regprocedure)) > 0 as uses_half_open_range;
```

```sql
select p.proname, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_admin_analytics_summary',
    'get_analytics_reporting_settings',
    'set_analytics_reporting_baseline',
    'clear_analytics_reporting_baseline'
  )
order by p.proname;
```

The functions should show an explicit `search_path` including `public, pg_temp`.

### Important SQL Editor authorization note

A direct call such as:

```sql
select public.get_admin_analytics_summary(null, null, false);
```

may raise `Not authorized` in the Supabase SQL Editor because that session does not necessarily carry the same authenticated application JWT/admin context as the browser. That does **not** imply the RPC is broken. Verify its definition in SQL Editor, then verify the actual result from the logged-in admin Analytics page or a service-role execution path.

## Edge Function deployment

The migration must exist before deploying the updated weekly function, because the function now depends on the canonical RPC.

Deploy only after local tests/build pass and the migration has been verified:

```powershell
npx supabase functions deploy send-weekly-admin-recap --no-verify-jwt --project-ref <project-ref> --use-api
```

Do not redeploy unrelated Edge Functions unless they have also changed.

## Preview acceptance

Before production merge, verify the Cloudflare Preview with an authenticated owner/manager:

1. Analytics loads without a raw-row truncation warning masquerading as completeness.
2. Health panel shows `Complete coverage` and sensible event/session timestamps.
3. Refresh updates `Last refreshed`.
4. `All historical data` ignores the reporting baseline.
5. `Since baseline` uses the baseline when configured.
6. Starting/clearing a baseline does not delete any database rows.
7. Device/browser/OS/geography/language totals reconcile to page views.
8. Website, Fast Request, Gift Card, and booking-code funnels are visibly separate.
9. Sample-only mobile/session/path diagnostics are visibly labelled as samples.
10. Export marks raw samples as samples/truncated where applicable.

## Journey acceptance

Run one controlled journey for each product family.

### Website booking

Expected canonical sequence:

```text
booking_form_open
booking_form_started
booking_form_step_completed
booking_form_submit_attempt
booking_request_created
booking_form_submit_success
```

The journey must retain one `booking_journey_id`; final creation/success events must carry the created `booking_request_id`. The database must contain exactly one request.

Test at minimum:

```text
Desktop Chrome
iPhone Safari
Android Chrome
```

### Fast Request

Complete one Fast Request -> WhatsApp journey and verify it appears only in the Fast Request/WhatsApp funnel.

### Gift Card

Complete one Gift Card journey and verify one stable journey ID plus the Gift Card funnel/database request.

### Booking code

Redeem one controlled booking code and verify attempt/success/request-created share the stable journey context and booking request ID where available. It must not enter the website funnel.

## All-history stability acceptance

Record `All historical data`:

```text
Approx. unique visitors
Page views
```

Create a page view under a new visitor ID and refresh. Page views must increase and unique visitors should increase by one.

Create additional page views for an existing visitor ID. Page views may increase; all-history unique visitors must not decrease.

A fixed raw-row API cap must never influence these KPIs because the aggregation now runs in PostgreSQL.

## Admin/email parity acceptance

Choose one exact reporting interval and compare the admin canonical summary with a test Weekly Management Recap for the same interval.

Shared KPIs must match exactly. Formula drift is a release blocker.

## Rollback

Frontend/Cloudflare rollback: redeploy/revert the application commit to `6bb8880`.

Edge Function rollback: redeploy the prior `send-weekly-admin-recap` version/source.

Database rollback is intentionally conservative. The new settings table/functions/indexes are additive and do not modify historical analytics rows. In an emergency, reverting the app and weekly function is sufficient to stop consuming the new contract. Do not drop the migration objects during an incident unless there is a verified database-specific reason; leaving unused additive objects in place is safer than destructive rollback.

## Optional historical cleanup

No historical analytics cleanup is part of this release. Old lifecycle rows remain stored. If storage cleanup is ever desired, prepare it as a separate maintenance procedure with:

- a backup prerequisite;
- a preview `count(*)` query;
- an explicit date boundary;
- a reviewed delete statement;
- post-delete verification.

Do not couple historical cleanup to analytics correctness.

## Final hardening notes

The release also preserves the original browser-session `started_at` value on every session upsert, keeps QR and business-card acquisition as explicit source families, and strips free-form attribution detail from analytics export samples. Canonical per-experience demand includes compatible website database requests and confirmations alongside impressions, detail opens, form opens, tracked successes, and contact actions.

For connected production verification, use the read-only companion script:

`docs/ANALYTICS_VALIDATION_20260818.sql`

The implementation status and connected-validation boundary are documented in:

`docs/ANALYTICS_IMPLEMENTATION_REPORT_20260818.md`
