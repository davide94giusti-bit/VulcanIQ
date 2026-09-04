# Customer notification ownership and personalized journeys

## Scope and trust decision

The first supported customer-specific journey is a **new website booking request with explicit opt-in on the submitting device**. The Pages Function creates the booking in Supabase first and, only for a newly created request, issues a cryptographically random 256-bit single-purpose claim. D1 stores SHA-256 of that claim and an opaque SHA-256 entity reference; it never stores customer name, email, phone, booking code, Gift Card code, payment amount, or raw Supabase row ID.

The browser creates an in-app public notification device before redeeming the claim. Redemption atomically binds the pending, unexpired claim to that device subscription. Push remains a separate optional permission. A booking success never depends on notification enrollment: if D1 or enrollment is unavailable, the booking succeeds and personalization fails closed.

Gift Card claims, ordinary booking-code redemption, PII re-entry, referral codes, and raw booking UUIDs are not ownership proof. They cannot create a notification ownership row. There is no cross-device recovery or customer account in this release.

## Data and authorization model

- `notification_ownership_claims`: token hash, opaque entity reference, booking journey scope, expiry, one-time state, and the claiming subscription. Claims are pending, claimed, expired, or revoked.
- `notification_subscription_ownership`: one claim bound to one public subscription and one opaque booking reference. Revocation is retained as audit history.
- `notification_personalized_events`: PII-free source revision hash, deterministic dedupe key, recipient/job counts, and terminal reason.
- `notification_jobs.ownership_id`: binds scheduled work to the ownership row in addition to the existing required `recipient_subscription_id`.
- `public.customer_notification_outbox`: Supabase-owned, RLS-closed durable event state inserted transactionally by business triggers. Only the trusted backend credential can reconcile it into D1.
- D1 migration `0005`: typed per-ownership preferences plus bounded delivery-attempt, retry, terminal, dead-endpoint, and at-most-once push state.

Public device authentication requires both the random device ID and random device token already used by the notification service. Claim lookup uses only SHA-256 of a 64-hex-character random token. Same-device replay is idempotent; another-device replay is denied. Invalid, expired, revoked, and already-claimed states never return booking data.

Canonical booking, recognized Finance, and fixed-excursion mutations enqueue deterministic rows in the Supabase outbox inside the same database transaction. The authenticated Admin client asks Pages to reconcile pending rows; losing that HTTP response leaves a visible retryable outbox row rather than silently losing the event. Pages confirms the active Admin profile, rereads minimum authoritative state, and converts the raw entity ID to the opaque D1 reference before persistence. Admin observability never returns the raw entity ID or PII.

## Delivery invariants

- Customer categories are not public preference or campaign categories and cannot be selected for broadcast.
- A customer category without `recipient_subscription_id` fails with `personalized_recipient_required`.
- No active ownership produces `no_verified_recipient`, zero jobs, and no fallback delivery.
- Dedupe uses event type + opaque entity reference + authoritative revision, then ownership per job.
- Immediate events use the existing in-app-first delivery. Ordinary/high push observes subscription Quiet Hours; no customer event is critical.
- Scheduled work is claimed atomically by the Worker. The Worker rechecks that `ownership_id` belongs to the target subscription and is not revoked.
- Revocation cancels future scheduled work. Booking reschedules and canonical fixed-excursion changes cancel obsolete upcoming reminders before an eligible replacement is scheduled; booking cancellation or an inactive/cancelled fixed excursion prevents replacement.
- Fixed excursions use canonical local date/start time in `Europe/Rome` plus the internal reminder rule offset. Private/date-only bookings retain the documented 09:00 UTC fallback rather than inventing a time.
- Upcoming reminders resolve a localized preparation profile only from the canonical `booking_requests.experience_id` or linked `fixed_excursions.experience_id`. The four current experience IDs have distinct stable guidance; unknown/legacy values use the conservative `standard-etna` fallback. Customer-entered text never selects notification content.
- The native reminder stays concise and excludes names, contact details, raw IDs, codes, payment data and private itinerary details. It deliberately avoids “tomorrow” because the internal offset and scheduler pickup time do not guarantee that wording is literally correct. Opening the owned reminder leads to `/install?preparation=<allowlisted-profile>`, where What to wear, What to bring and important notes are shown without exposing booking data.
- Transient push responses (429/5xx) retry at most three times with exponential backoff once the scheduler is enabled. 404/410 becomes in-app-only. An unknown outcome after push starts is terminal and is never replayed.
- Native Web Push carries an RFC 8291-encrypted presentation envelope with mandatory type `vulcaniq-notification` and, for public delivery, constrained category/title/body/internal-URL fields resolved from the existing localized event. It carries no business or ownership identifiers, contact details, codes, amounts, or transport material.
- The Public service worker validates and bounds the optional presentation fields, rejects external/active-content destinations, and falls back to localized generic copy plus `/install` for absent or malformed data. Valid categories produce deterministic `vulcaniq-<category>` tags; invalid categories use `vulcaniq-public-update`.
- The Admin service worker deliberately keeps its existing generic operational lock-screen copy and does not consume presentation fields.
- A successful push-service HTTP response means the message was accepted for delivery; it does not prove that the browser or operating system displayed a notification. There is no client delivery receipt in this release.
- Existing D1 compatibility names (`push_success`, `push_delivered_at`, and delivery-attempt outcome `sent`) represent push-service acceptance, not visible delivery. Successful attempt rows use the safe `push_service_accepted` code to make that boundary explicit.
- Status/payment, operational, upcoming, review, push, and in-app consent are typed per ownership. Marketing/promotions remain separate public consent.
- Existing budget safety remains authoritative. Under hard safety, customer push work is suppressed rather than upgraded to critical.
- Cron remains OFF. Immediate Pages events work without Cron; scheduled reminders remain pending until a separately approved scheduler is enabled.

## Journey status

| Journey | Status | Trigger and behavior |
| --- | --- | --- |
| New website booking opt-in | Implemented | New request may issue and immediately redeem one device claim. In-app works before push. |
| Booking confirmed | Implemented | Accepted/confirmed authoritative state; immediate owned notification and future reminder scheduling. |
| Payment received | Implemented | Requires a recognized/confirmed active Finance entry; immediate owned notification. No Finance mutation is performed. |
| Upcoming activity reminder | Implemented, scheduler dependent | Fixed excursions use canonical `date` + `start_time` in `Europe/Rome` and the rule offset; date-only requests use the safe 09:00 UTC fallback. Canonical experience IDs select stable IT/EN preparation guidance. |
| Booking rescheduled | Implemented | Date/fixed-excursion updates cancel obsolete reminders, notify immediately, and schedule a replacement when eligible. |
| Booking cancelled/declined | Implemented | Cancels future reminders and notifies immediately after authoritative terminal state. |
| Review reminder | Implemented | Requires authoritative `review_requested_at`/status; immediate owned notification. |
| Generic operational excursion change | Fully wired | Canonical fixed-excursion date/time/meeting/status/active changes enqueue affected eligible bookings through a database trigger. |
| Gift Card personalization | Intentionally disabled | Current claimant contact entry is not identity verification. |
| Ordinary booking-code personalization | Intentionally disabled | Possession of the code alone is insufficient ownership proof. |
| Second-device linking/recovery | Intentionally disabled | Requires a separately designed authenticated or newly verified recovery ceremony. |

## Preview configuration checklist

No environment names, Worker names, D1 IDs, or Cron declarations are changed by this feature.

Pages Preview must provide the existing `NOTIFICATIONS_DB` Preview D1 binding. The browser build requires the existing publishable `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Pages Functions require the existing non-secret `SUPABASE_URL`, `VAPID_PUBLIC_KEY`, and `VAPID_SUBJECT`, plus budget/origin settings already used by the project. Secret **names only** required by the current Pages/notification backend are:

- `SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` (or the already supported legacy rollback credential where explicitly retained)
- `VAPID_PRIVATE_KEY`

The Preview Worker keeps its dedicated Preview D1 binding and existing non-secret variables. Its secret names are the same three names above. Never copy values into source, logs, issue text, UAT evidence, or analytics. Apply D1 migrations `0004_customer_notification_ownership.sql` and `0005_customer_notification_operations.sql`, plus Supabase migration `20260902100000_customer_notification_outbox.sql`, to Preview through the reviewed deployment procedure before Preview Pages/Worker code. Do not use Production infrastructure for this test.

## Preview UAT

1. Verify migration order `0001` through `0005`, the Supabase outbox migration, `crons = []`, and distinct Preview/Production D1 IDs.
2. Submit without opt-in: booking succeeds; response has no claim; no ownership or customer job exists.
3. Submit with opt-in: booking succeeds; one ownership appears on `/install`; browser notification permission is not requested automatically.
4. Inspect browser network only on the tester device, then confirm the one-time claim disappears after the response and is absent from address bars, local/session storage, analytics requests, console logs, D1 plaintext, and Admin views.
5. Try malformed, expired, revoked, and replayed test claims. Confirm generic denial and no booking disclosure. Same-device immediate replay may return the same ownership idempotently; another device must fail.
6. As owner/manager, exercise confirmation, reschedule, cancellation, review-request, and canonical fixed-excursion date/time/meeting transitions. Exercise payment as an allowed role with a real Preview Finance fixture. Confirm one outbox row and one effective D1 event per revision, and no PII in lock-screen payloads or D1.
7. Repeat against an unowned booking: confirm an auditable `no_verified_recipient` receipt and zero jobs.
8. Unlink in the public UI and verify future work is cancelled. Manually make a revoked scheduled fixture due and run the Worker locally/Preview-safe; confirm `owned_recipient_unavailable` and no inbox/push send.
9. Verify quiet-hours behavior with a tester subscription. The in-app item follows existing semantics; noncritical push is skipped during Quiet Hours. Customer events never bypass as critical.
10. Verify public campaigns and Admin operational notifications still work independently and that public campaign category input cannot select any `customer_*` category.
11. Disable each typed owned-journey preference in turn and confirm its event is suppressed only for that ownership; marketing preferences remain unchanged.
12. Simulate accepted, retryable, permanent, dead-endpoint, and unknown transport outcomes. Confirm the accepted state is described only as push-service acceptance, bounded backoff and terminal states are correct, and no replay occurs after an uncertain push.
13. Interrupt reconciliation after the Supabase mutation. Confirm the outbox row remains visible, use **Retry**, and confirm D1 dedupe creates one effective send.
14. Confirm an owned reminder opens the allowlisted preparation profile on `/install`, different canonical experiences show different stable guidance, an unknown value uses `standard-etna`, and no native or rich content exposes customer/booking identifiers or makes an unverified weather claim.

## Operational risks and rollback

- A lost successful response cannot recover/reissue the plaintext claim; this is deliberate fail-closed behavior. The booking remains valid.
- Clearing browser storage removes the device credential and therefore access to unlink/list that device's ownership. It does not let another device claim the booking.
- Private/date-only bookings retain 09:00 UTC as a deliberate fallback. Fixed excursions have canonical Europe/Rome precision. Cron is OFF, so due reminders and retry/catch-up remain inactive until separately reviewed.
- Outbox publication is durable, but reconciliation still needs an authenticated Admin request. The current Worker Cron does not drain the Supabase outbox. Failures are visible and manually retryable rather than silently lost; automatic outbox reconciliation is a separate future capability.
- Manual/Admin-created enrolment, recovery, and second-device enrolment remain unavailable because the repository has no trusted customer link-delivery or authenticated customer-account ceremony. Email/phone/code knowledge remains rejected.
- To stop personalized delivery, disable only the affected `customer_*` rules in Admin. For code rollback, restore the prior Pages and Worker versions independently and leave D1 migration/history intact. Do not delete ownership/audit rows and do not change Supabase business data.

## Future Cron activation (manual, not performed)

After D1 migrations `0004`/`0005`, the Supabase outbox migration, authenticated Preview UAT, budget verification, and an explicit owner approval, the first scheduler trial should be **Preview only** on Worker `vulcaniq-notifications-preview`: change only `[env.preview.triggers]` in `workers/notifications/wrangler.toml` from `crons = []` to `crons = ["*/10 * * * *"]`. The ten-minute cadence picks up due D1 reminders and retryable delivery jobs; it does not reconcile the Supabase outbox.

Inspect the environment-resolved upload without deploying, then deploy only Preview:

```powershell
npx wrangler versions upload --config .\workers\notifications\wrangler.toml --env preview --dry-run
npx wrangler deploy --config .\workers\notifications\wrangler.toml --env preview
```

Each invocation claims at most 50 automation jobs and 25 campaigns; `NOTIFICATION_CRON_PROCESSING_CAP` bounds whether broader polling work runs. There is no application-defined execution timeout, so the activation gate is one observed Preview run completing comfortably inside the ten-minute cadence and the Cloudflare plan's Scheduled Worker limits. Atomic `scheduled` → `processing` claims and unique dedupe keys prevent parallel effective delivery. Retryable customer push failures use 60-second exponential backoff capped at one hour and three attempts; the ten-minute Cron cadence is the practical minimum pickup interval. A missed run remains catch-up eligible unless cancelled, superseded, revoked, dead, or terminal.

Monitor status and oldest due work without selecting endpoints, payloads, or ownership material:

```powershell
npx wrangler d1 execute NOTIFICATIONS_DB --config .\workers\notifications\wrangler.toml --env preview --remote --command "SELECT status, count(*) AS jobs FROM notification_jobs GROUP BY status ORDER BY status"
npx wrangler d1 execute NOTIFICATIONS_DB --config .\workers\notifications\wrangler.toml --env preview --remote --command "SELECT min(scheduled_for) AS oldest_due, count(*) AS due_jobs FROM notification_jobs WHERE status = 'scheduled' AND scheduled_for <= datetime('now')"
npx wrangler d1 execute NOTIFICATIONS_DB --config .\workers\notifications\wrangler.toml --env preview --remote --command "SELECT outcome, count(*) AS attempts FROM notification_delivery_attempts GROUP BY outcome ORDER BY outcome"
```

Production Cron must remain `crons = []` until a separate Production decision after Preview evidence. The emergency rollback is to restore Preview's declaration to `crons = []`, inspect the dry run, and deploy only that Preview Worker environment with the same two commands above; disable the affected customer rules if delivery must stop immediately. Retain D1 history. No Cron change or deployment is part of this branch.
