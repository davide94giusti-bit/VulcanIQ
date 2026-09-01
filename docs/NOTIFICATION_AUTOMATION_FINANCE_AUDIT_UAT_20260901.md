# Notification automation, device UX, and Financial Audit UAT

This branch does not deploy anything and does not enable notification Cron. Apply D1 migration `0003_admin_automation_jobs.sql` before deploying dependent Pages/Worker code. Keep `[triggers] crons = []` until an owner separately approves scheduler activation after Preview QA.

## Recipient boundary

Current public notification subscriptions identify an anonymous browser device. Current booking and Gift Card records are not linked to an authenticated customer-owned subscription. For that reason, this release does not create personalized customer push journeys. The D1 constraint requires every public automation job to name one concrete subscription, but no booking/Gift Card flow is allowed to choose that subscription until a verified ownership enrolment flow exists.

Admin operational notifications continue to originate from the existing trusted, secret-authenticated backend ingest. They now create auditable jobs and honor the Admin rule state. Notification delivery must never determine whether a booking or Gift Card transaction succeeds.

## Preview rollout and checks

1. Create or select an isolated Preview D1 database. Never point local/Preview tests at Production D1.
2. Apply D1 migrations `0001`, `0002`, then `0003` to that Preview database.
3. Deploy the notification Worker to Preview with Cron still empty.
4. Deploy Pages to Preview with its existing notification binding and required environment variable names. Do not copy secret values into logs or source.
5. Sign in as an owner/manager, open `/admin/notifications`, and confirm the operational rules and empty/recent jobs list load.
6. Disable one non-critical rule, create the corresponding trusted test event using only the existing Preview ingest, and confirm the event is suppressed and audited. Re-enable it and repeat with a new deterministic source ID; confirm one job and no duplicate delivery.
7. Confirm a scheduled job can be cancelled only while `scheduled`, and cancelled jobs are not claimed.
8. Confirm `workers/notifications/wrangler.toml` still contains `crons = []`.

## Finance dashboard regression

1. Sign in to Preview as an authorized Admin and open `/admin/finance`.
2. Confirm no `finance_entries.notes` error appears.
3. Compare recorded payments, expected income, expenses, reversals, Gift Cards, booking codes, and commissions with known Preview fixtures.
4. Confirm a reversed/inactive movement does not reappear as recognized money through booking-code hydration.

## Financial Audit & Compliance

1. As an `owner` or `finance` user, open `/admin/finance` and expand **Financial Audit & Compliance**.
2. Generate PDF, CSV, and JSON manifest for an empty date range and a populated date range.
3. Confirm filenames are opaque/safe, PDF prints as text, CSV opens as UTF-8, and the manifest contains metadata only.
4. Confirm metadata includes audit ID, generation time, range, actor ID, record count, filters, schema version, locale, SHA-256 checksum, and `piiIncluded: false`.
5. Confirm an `activity_log` row with action `financial_audit_generated` exists.
6. Sign in as manager/guide/content editor and confirm the backend returns 403 even if the endpoint is called directly.
7. Sign out and confirm a new export cannot be generated. Downloaded files are local evidence and must be handled according to the owner’s retention policy.

## Neo EN/IT matrix

Run each query with Admin UI set to English and Italian. The response language follows the UI, not the query:

- `What needs attention today?` / `Cosa devo sapere oggi?`
- `Upcoming bookings` / `Mostrami le prossime prenotazioni`
- `Notification health` / `Come stanno andando le notifiche?`
- `Scheduled notifications` / `Mostrami le notifiche programmate`
- `Marketing opportunities` / `Come sta andando il marketing?`
- `Gift Cards` / `Come stanno andando i Gift Card?`
- `Finance summary` / `Mostrami la situazione finanziaria`

Confirm scheduled-notification questions do not resolve to the notification-health response and Neo does not expose mutation controls.

## Android/browser notification permission and sound

1. With permission `default`, use the explicit enable action and accept. Confirm subscription occurs once.
2. Reset browser permission, deny it, and return to the page. Confirm recovery guidance appears, no enable action is shown, and preferences remain editable/savable.
3. Background and foreground the browser, change tabs, and return through browser history. Confirm focus, visibility, and pageshow recheck permission without opening another permission prompt.
4. Re-enable notification permission in browser/Android settings and return. Confirm the enable action becomes available without losing categories or Quiet Hours.
5. Send a tester-owned notification outside Quiet Hours. Confirm VulcanIQ does not mark it silent. Actual sound/vibration remains controlled by Android notification channels, browser settings, Do Not Disturb, Focus, silent mode, volume, and OEM policy.

## Android Auto and Apple CarPlay

VulcanIQ is a PWA and has no native Android Auto or CarPlay integration. Web Push display/forwarding is controlled by the phone OS, browser, vehicle, and user settings; support is not guaranteed.

For manual investigation only:

1. Pair a tester-owned Android phone with a compatible Android Auto vehicle/head unit, enable browser notifications on the phone, send a generic tester notification while parked, and record whether the OS forwards it. Repeat with DND on/off. Do not interact while driving.
2. Pair a tester-owned iPhone with CarPlay, install/open the PWA from the Home Screen, grant notifications, send a generic tester notification while parked, and record whether iOS forwards it. Repeat with Focus on/off.
3. Record phone OS, browser version, vehicle/head-unit model, connection type, notification settings, and observed behavior. Never include customer content in automotive tests.

These observations are compatibility evidence only. A guaranteed automotive experience would require separately scoped native applications, platform entitlements, review, and safety design.

## Emergency stop and rollback

- Stop sends by leaving Cron off and disabling affected automation rules in the authenticated Admin UI.
- Roll back Pages and Worker independently to their previous versions.
- D1 migration `0003` is additive. Do not destructively remove its tables during an incident; older code ignores them. Preserve job/audit history for investigation.
- This branch adds no Supabase migration. Financial audit generation logs reuse canonical `activity_log`.
