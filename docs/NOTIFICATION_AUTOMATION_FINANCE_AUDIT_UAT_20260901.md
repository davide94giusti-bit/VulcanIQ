# Notification automation, device UX, and Financial Audit UAT

This branch does not deploy anything and does not enable notification Cron. Apply D1 migrations through `0005_customer_notification_operations.sql` and Supabase migration `20260902100000_customer_notification_outbox.sql` before deploying dependent Pages/Worker code. Keep `[triggers] crons = []` until an owner separately approves scheduler activation after Preview QA.

## Recipient boundary

Public notification subscriptions still identify a protected anonymous browser device rather than a customer account. A newly created website booking may now issue a high-entropy, one-time, 24-hour claim only when the customer explicitly opts in. The claim is stored only as SHA-256, is bound to that public device on redemption, and is never accepted from email, phone, booking code, Gift Card code, or another predictable identifier. Duplicate submissions do not reissue a claim. Gift Card and ordinary booking-code personalization remain disabled because those journeys do not currently prove customer ownership strongly enough.

Every personalized job names both one owned subscription and its active ownership row. No verified recipient means an auditable `no_verified_recipient` result and no job; there is no public broadcast fallback. Revocation cancels future scheduled jobs for that ownership, and the Worker rechecks ownership before a scheduled send.

Admin operational notifications continue to originate from the existing trusted, secret-authenticated backend ingest. They now create auditable jobs and honor the Admin rule state. Notification delivery must never determine whether a booking or Gift Card transaction succeeds.

## Automation configuration contract

For this release the Admin rule interface supports **enable/disable only**. The D1 columns `offset_minutes`, `channel`, and `quiet_hours_behavior` are future-facing/internal schema fields; the Admin PATCH endpoint does not edit them, the Worker does not consume per-rule Quiet Hours behavior, and the UI must not present them as configurable.

- Event-driven Admin notifications are processed immediately by the trusted ingest path.
- Scheduled campaigns and queued jobs depend on a separately enabled scheduler.
- Notification Cron remains **OFF** (`crons = []`).
- Personalized website-booking journeys are enabled only for explicitly claimed devices. Gift Card, ordinary booking-code, second-device recovery, and customer-account journeys remain disabled.

Actual delivery keeps the existing subscription-level Quiet Hours behavior: ordinary and high-priority push attempts are skipped during the recipient's Quiet Hours (the in-app item is still created), while critical security notifications may bypass Quiet Hours. There is no per-rule Quiet Hours override in this release.

## Preview rollout and checks

1. Create or select an isolated Preview D1 database. Never point local/Preview tests at Production D1.
2. Apply D1 migrations `0001` through `0005` to Preview D1 and apply the outbox migration to Preview Supabase through the reviewed deployment path.
3. Deploy the notification Worker to Preview with Cron still empty.
4. Deploy Pages to Preview with its existing notification binding and required environment variable names. Do not copy secret values into logs or source.
5. Sign in as an owner/manager, open `/admin/notifications`, and confirm the operational rules and empty/recent jobs list load. Confirm the rule UI offers enable/disable only and does not imply that timing, channel, or per-rule Quiet Hours behavior can be edited.
   Test each read independently: a failed rules, recent-jobs, personal-outcomes, or authoritative-outbox request must show a localized error only in that subsection and must not replace successful sibling data with zero counts.
6. Disable one non-critical rule, create the corresponding trusted test event using only the existing Preview ingest, and confirm the event is suppressed and audited. Re-enable it and repeat with a new deterministic source ID; confirm one job and no duplicate delivery.
7. Confirm a scheduled job can be cancelled only while `scheduled`, and cancelled jobs are not claimed.
8. Confirm `workers/notifications/wrangler.toml` still contains `crons = []`.
9. Submit a new website booking with personal updates unchecked. Confirm no claim is returned and no ownership appears.
10. Submit a new website booking with personal updates checked. Confirm the in-app device is created before any push prompt, one protected booking link appears under `/install`, and the claim value is absent from URLs, analytics, logs, and Admin UI.
11. Confirm replay on the same device is idempotent, replay on another device is denied, and invalid/expired/revoked claims fail without exposing the booking record.
12. Confirm an Admin transition transactionally creates a Supabase outbox row and reconciliation creates at most one immediate notification per owned subscription. Repeat reconciliation and confirm event/job dedupe. For an unowned booking, confirm `no_verified_recipient` and zero jobs.
13. Unlink the booking from `/install`; confirm future scheduled work is cancelled and an already claimed due job is rejected by the Worker ownership check.
14. Change canonical fixed-excursion date/time/meeting state and confirm affected eligible owned bookings receive `operational_change`; no free-form customer send action exists.
15. Verify typed ownership preferences, transient retry/backoff, dead endpoint handling, outbox manual retry, and old-reminder supersession. Cron stays OFF.

## Finance dashboard regression

1. Sign in to Preview as an authorized Admin and open `/admin/finance`.
2. Confirm no `finance_entries.notes` error appears.
3. Compare recorded payments, expected income, expenses, reversals, Gift Cards, booking codes, and commissions with known Preview fixtures.
4. Confirm a reversed/inactive movement does not reappear as recognized money through booking-code hydration.

## Financial Audit & Compliance

1. As an `owner` or `finance` user, open `/admin/finance` and expand **Financial Audit & Compliance**.
2. Generate the **Financial Audit Summary PDF**, detailed evidence CSV, and JSON integrity manifest for an empty date range and a populated date range.
3. Confirm filenames are opaque/safe; the A4 summary PDF has the branded header, executive cards, complete paginated classification overview, evidence metadata and non-overlapping footer, and explicitly points to the CSV for detailed evidence rows. Confirm the detailed CSV opens as UTF-8 and the integrity manifest contains metadata only.
4. Confirm metadata includes audit ID, generation time, range, actor ID, `sourceCounts`, their summed `recordCount`, filters, schema version, locale, canonical evidence SHA-256, checksum scope `canonical_evidence_not_file_bytes`, and `piiIncluded: false`. The checksum covers canonical evidence data, not the bytes of any downloaded PDF, CSV, or JSON file; `checksum` remains a compatibility alias of `evidenceChecksum`.
5. Confirm an `activity_log` row with action `financial_audit_generated` exists and its `actor_id` is the signed-in user. Canonical grants and RLS permit active `owner` and `finance` users to insert this record with their own bearer token; verify this live in Preview because static migration coverage cannot exercise the deployed Auth/RLS integration.
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

- Stop event-driven Admin sends by disabling affected automation rules in the authenticated Admin UI. Keep Cron off so scheduled campaigns/jobs are not scheduler-driven.
- Roll back Pages and Worker independently to their previous versions.
- D1 migrations `0003`–`0005` and the Supabase outbox migration are additive. Do not destructively remove their tables during an incident. Preserve claim hashes, ownership, outbox, job, event, attempt, and audit history. Disable customer rules or roll back Pages/Worker code; do not delete customer or audit data.
- Financial audit generation still uses the caller bearer token and canonical `activity_log` grants/RLS; it never substitutes a service-role key.
