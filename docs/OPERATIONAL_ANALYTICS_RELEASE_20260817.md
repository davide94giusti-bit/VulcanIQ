# vulcanIQ operational, analytics and reporting release candidate — 2026-08-17

Baseline: production source archive identified by the operator as commit `4148c78`.

## Scope

This release candidate addresses four production areas without changing the public product domain model:

1. Responsive formatting for Database Backup, Backup Schedule, operational safeguards and Weekly Management Recap.
2. Sanitisation of the legacy `notifications_not_sent` operational counter so historical/ineligible rows are not shown as active incidents.
3. Analytics integrity corrections and request diagnostics, including current-vs-historical tracking classification and safe public-booking trace IDs.
4. A redesigned weekly management email with branded KPI cards and email-safe visual charts, plus a first controlled extraction of system/admin UI from `src/main.jsx`.

## Analytics findings behind the changes

The 2026-08-17 analytics export contained 40 booking requests: 5 website-form requests and 35 booking-code requests. The five website requests in the integrity table were created before 2026-08-17, so their missing `booking_form_submit_success` events are treated as historical gaps rather than current production incidents.

The same export contained a current iOS Safari booking journey on 2026-08-17 with canonical `booking_form_submit_attempt` followed by `booking_form_submit_error` (`request_creation_failed`) and no `booking_request_created` / `booking_form_submit_success`. The duplicate `booking_submit_attempt` and `booking_submit_error` events are legacy aliases and are not double-counted in the corrected calculations.

The public booking RPC calls `gen_random_bytes()` while its SECURITY DEFINER search path was restricted to `public`. Hosted Supabase installs pgcrypto functions in the `extensions` schema. The follow-up migration therefore changes the controlled search path of the affected public/server-authoritative RPCs to `public, extensions, pg_temp`. This is a source-level diagnosis and must be confirmed with a successful real booking submission after deployment.

## Analytics calculation corrections

- Geography, device, browser and operating-system distributions are now based on `page_view` events instead of every event/action.
- Experience demand uses `experience_detail_open` as the canonical interaction, with `excursion_view` as a legacy fallback. `experience_card_view` remains a separate impression metric.
- Website-form requests, booking-code requests and admin/manual requests remain separate funnel families.
- Confirmed website conversion is `confirmed website requests / website requests`; booking-code confirmation is reported separately.
- Current tracking integrity begins at `2026-08-17T00:00:00Z`. Pre-contract gaps remain visible diagnostically but no longer create red current alerts.
- Current submit errors use the canonical `booking_form_submit_error` event so legacy alias events are not double-counted.
- Missing form-open warnings are matched by `booking_request_id` or `booking_journey_id` for current requests.
- Fewer than 100 visitors is explicitly treated as a diagnostic sample rather than sufficient evidence for marketing conclusions.
- The analytics JSON export keeps a backwards-compatible `excursion_views` key while also exposing the corrected `experience_detail_opens` and `experience_card_impressions` tables.

## Operational notification counter

The v2 `get_admin_operational_safeguards()` RPC reports:

- `notifications_not_sent`: eligible public requests after notification activation, still `not_sent` after a 10-minute grace period.
- `failed_notifications`: eligible post-activation public requests whose notification state is `failed`.
- `notifications_historical_excluded`: historical or ineligible rows retained as context, not active incidents.
- `safeguard_version: 2`.

The frontend also recognises the old v1 response and prevents its aggregate legacy not-sent count from being presented as a current red incident during rollout.

## Weekly management email

The weekly report now contains:

- VULCANIQ dark-navy / coral branded header and warm-ivory body.
- Executive KPI cards.
- Operational urgency cards.
- Separate Website booking, Booking-code and Gift Card funnels.
- Contact-intent visualisation.
- Experience-demand, booking-status, Gift Card-status, traffic-source, device and browser charts.
- Finance and review summaries.
- Rules-based recommended actions.

Charts are implemented with email-safe HTML/CSS bars, not client-side JavaScript.

## Initial frontend modularisation

Extracted from the large `src/main.jsx`:

- `src/features/admin/OperationalSafeguardsBanner.jsx`
- `src/features/system/WeeklyReportsAdminPanel.jsx`
- `src/features/analytics/integrity.js`
- `src/styles/admin-system.css`

Further extraction should be incremental after this release is stable.

## Validation completed in the packaging environment

- `node tools/security-regression.mjs`: **42 passed, 0 failed**.
- Node syntax checks for modified plain JavaScript: pass.
- Node 22 experimental TypeScript syntax checks for the changed Edge Function TypeScript: pass.
- `git -c core.whitespace=cr-at-eol diff --check`: pass.
- Secret/private-key regression checks: pass.

## Validation still required before production merge

The isolated packaging environment could not install the npm dependency tree, so Vite production compilation was not executed here. On the Windows development machine run:

```powershell
npm install
npm run test:security
npm run build
```

Required result before merge:

- security suite: `42 passed, 0 failed`
- Vite: `✓ built`

## Deployment order

1. Apply this patch on a clean branch based on production `4148c78`.
2. Run the local validation commands above.
3. Apply `supabase/migrations/20260817090000_operational_analytics_reporting_fix.sql` to the linked production/staging project.
4. Redeploy `send-weekly-admin-recap` (its code and shared email template changed).
5. Push the frontend/API branch and review the Cloudflare Preview deployment.
6. Test one real controlled website booking on iPhone Safari and one on Android Chrome.
7. Verify the canonical chain uses the same `booking_journey_id` and final request ID: `booking_form_open` → `booking_form_started` → `booking_form_step_completed` → `booking_form_submit_attempt` → `booking_request_created` → `booking_form_submit_success`.
8. Verify the request appears in the database and the immediate notification is sent once.
9. Send one weekly recap test and verify its layout in both configured recipient mailboxes.
10. Confirm the admin operational banner shows active notification incidents separately from historical excluded records.

Do not call the release production-complete until the local Vite build and the two real mobile booking submissions pass.
