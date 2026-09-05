# Unified onboarding, participant foundation, and Terms architecture

Status: implementation record for unified PWA/privacy onboarding and the applied Phase 1 participant foundation. Phase 2 Terms evidence infrastructure is implemented in source and in the unapplied migration `20260905110000_terms_evidence_foundation.sql`; it publishes no Terms until a separate counsel-approved migration is reviewed. See `TERMS_EVIDENCE_FOUNDATION_20260905.md`. Individual-adult and guardian journeys remain deferred.

## Browser storage and tracker audit

The source audit found no `document.cookie`, Google Analytics/Tag Manager, Meta/Facebook Pixel, TikTok Pixel, Hotjar, Clarity, advertising/remarketing script, YouTube embed, or third-party Maps embed. External WhatsApp, social, Google Maps, email, and phone destinations load only after the user activates their link. The leaflet iframe renders a configured first-party file URL rather than a tracker.

| Technology / storage | Provider | Purpose | Party / category | Device access and retention | Pre-choice behavior after this change | Consent decision | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Public language | vulcanIQ | Remember IT/EN | First-party, functional | Existing `vulcaniq_public_language` localStorage key, until cleared | Allowed | Necessary to remember an explicit UI choice | `src/services/languagePreference.js` |
| First-run completion | vulcanIQ | Avoid repeating completed setup steps | First-party, functional | `localStorage`, until cleared; no PII | Allowed | Necessary to respect completed language/privacy/notification choices | `src/services/firstRunOnboarding.js` |
| Last-known Hero media | vulcanIQ | Prevent stale/skeleton first paint | First-party, functional | `localStorage`, replaced by latest valid media | Allowed | Necessary UI performance state | `src/main.jsx` |
| Fast Request draft | vulcanIQ | Recover non-contact answers for 24 hours | First-party, functional | `localStorage`, explicit 24-hour expiry; no name/email/phone | Allowed | Necessary request recovery | `src/main.jsx` |
| Form journey state | vulcanIQ | Request recovery, abandonment state and stable submission idempotency | First-party, functional | `localStorage`, 24-hour TTL; no contact PII | Allowed; analytics emission is blocked | Necessary for reliable user-requested form submission; not permission to emit analytics | `src/analytics.js` |
| Customer referral attribution | vulcanIQ | Preserve a validated referral through a request | First-party, functional/business | `localStorage`, 30-day TTL | Allowed | Necessary to honor the referral relationship used by the requested transaction | `src/services/referrals.js` |
| PWA notification device credentials/preferences | vulcanIQ / Cloudflare D1 | Device-scoped inbox, push subscription and preferences | First-party, requested functional | Random device ID/token in `localStorage`; server retention remains governed by notification lifecycle | Only after notification area/use or explicit enable flow | Separate notification choice; not analytics consent | `src/services/notificationService.js` |
| Notification service-worker locale | vulcanIQ | Render localized push | First-party, requested functional | IndexedDB `vulcaniq-notification-sw`, while browser data remains | Only after notification configuration message | Separate notification function | `public/sw.js`, `public/admin-sw.js` |
| PWA onboarding deferral | vulcanIQ | Avoid repeated prompting | First-party, functional preference | `localStorage`; Not now is deferred 30 days; no PII | Allowed | Necessary to respect the user's refusal to be interrupted | `src/services/notificationService.js` |
| Supabase auth session | Supabase | Authenticated Admin session/refresh | Third-party processor, security/authentication | Supabase client-managed browser storage | Client is initialized; session storage is used only when an auth session exists | Necessary for requested authenticated Admin functions | `src/lib/supabaseClient.js` |
| Turnstile verification | Cloudflare | Abuse protection for public submission | Third-party processor, security | Server verification; browser widget is not currently rendered and enforcement must remain off until it is | No client tracker currently loaded | Necessary security when enabled and accurately disclosed | `functions/api/public/_shared.js` |
| Custom event/session analytics | vulcanIQ | Funnel, UX and operational metrics | First-party, optional analytics | Random visitor ID and first-touch in `localStorage`; session ID/count in `sessionStorage`; server retention is not newly defined here | **Blocked until analytics=true**; stored optional identifiers are removed on reject/withdraw | Consent required for this release decision because nonessential identifiers access device storage | `src/analytics.js`, `/api/analytics/event` |
| Cloudflare Web Analytics | Cloudflare | Aggregate site metrics | Third-party, optional analytics | Beacon behavior/retention is controlled by Cloudflare configuration | **Script is not injected until analytics=true** | Gated with the same optional analytics choice | `src/main.jsx`, `public/_headers` |
| Privacy preference | vulcanIQ | Remember accept/reject/customize choice | First-party, necessary | `localStorage` key `vulcaniq.privacy.preferences.v1`, until changed/cleared | Allowed | Necessary to remember and enforce the choice | `src/services/privacyPreferences.js` |

Decision: **Case B**. Persistent custom analytics identifiers are not required to deliver the page, PWA, request, or notification service. The release therefore blocks custom analytics events/heartbeat, analytics visitor/session/first-touch persistence, and Cloudflare Web Analytics until a positive analytics choice. Reject, Customize, and Accept are available; the only optional category is unchecked in Customize for a visitor who has not decided. “Privacy preferences” in the footer permits withdrawal/change. Rejecting analytics does not block PWA install, forms, referrals, notifications, language, or Hero caching. This engineering control is not itself a claim of legal compliance; controller disclosures, processor terms and retention still require owner/counsel confirmation.

## Unified first-run onboarding contract

- A single focus-trapped dialog coordinates Language → Privacy & analytics → installation-aware notifications; the three choices remain independent.
- Browser/device locale recommends Italiano for `it*` and English otherwise, but the visitor must activate a visible language choice. The existing public language key and Header control remain authoritative.
- Privacy remains required when unresolved. Reject and Not now both complete setup without restricting application use.
- Installed state is derived from `display-mode: standalone` or iOS `navigator.standalone`; `appinstalled` and display-mode changes refresh the Header.
- A captured `beforeinstallprompt` is invoked only from an explicit **Install app** click. iOS without standalone mode receives Add to Home Screen guidance and no invalid push-permission call.
- Installed clients see **My notifications** and the existing device-scoped unread badge; the action opens `/install`, not a duplicate settings area.
- Notification onboarding follows privacy in the same state machine. Returning users retain the existing 30-day Not now re-prompt interval.
- The application dialog never calls `Notification.requestPermission()` on load. The existing `enableNotifications()` flow is invoked synchronously from the explicit **Enable notifications** click.
- States are: installation required, unsupported, never asked, deferred, permission granted without an active subscription, permission denied, and active subscription. Permission-denied and active-subscription clients are not prompted.
- **Not now**, Escape, backdrop dismissal, or a dismissed browser permission prompt defers the application prompt for 30 days. The preference contains no PII.
- On supported installed clients, `setAppBadge`/`clearAppBadge` uses the same authoritative public unread count. Failure or lack of support is non-fatal.

## Verified legal architecture boundary

`booking_requests` remains the canonical booking entity. Initial requests continue to store aggregate `adults`, `children`, and `children_under_3` data and remain lightweight. Phase 1 adds stable named participant rows only after `status = accepted`. Phase 2 adds an immutable database content snapshot and transaction-linked acceptance event without overloading participant records. Gift Card payment remains an Admin lifecycle event, and Gift Card redemption still creates a booking without creating new revenue.

Direct website request acceptance and confirmed-organizer self-acceptance are implemented but fail closed until the new Supabase migration is approved and applied. Individual acceptance links, guardian completion, Gift Card acceptance, reminder jobs, and Cron are intentionally not implemented.

## Implemented Phase 1 participant model

The additive `booking_participants` model uses the verified `booking_requests.id` lifecycle key:

| Concept | Proposed representation |
| --- | --- |
| Identity | UUID primary key; `booking_request_id` foreign key; immutable creation timestamp |
| Role | constrained adult/minor plus one active adult organizer per booking |
| Display/contact | full name only; no participant email, phone, account or identity document |
| Minor representation | required active adult guardian participant from the same booking; no legal acceptance is implied |
| Lifecycle | active/removed status and timestamps; booking deletion is restricted so records are preserved |
| Privacy boundary | no health data, document number, raw IP, device fingerprint, or unnecessary user agent in the base model |

The organizer submits an initial availability request without naming every participant. Accepted bookings do not create participant rows automatically; the organizer is created explicitly through the trusted participant-completion/backend flow. No historical identities are backfilled. Aggregate booking counts remain canonical while participant collection is incomplete, and composition mismatches are allowed but surfaced without changing those totals. Admin has authorized read-only inspection. Phase 2 permits the organizer to self-accept only for the organizer participant; another adult cannot be marked accepted by that action.

## Implemented Phase 2 immutable Terms versions

`terms_versions` is immutable after publication:

- UUID/version identifier, document purpose (`request`, `booking`, `gift_card_purchase`, `gift_card_redemption`, or other approved purpose), locale, effective timestamp and publication state;
- immutable rendered content snapshot or immutable canonical object reference, SHA-256 content checksum, creation actor/time, and optional supersedes reference;
- no in-place edit of a published version; a correction publishes a new row;
- server selects the currently applicable published version by purpose/locale/effective time. The client cannot choose an arbitrary historical row.

Draft/editor content must be separate from published immutable evidence. Whether IT and EN are two linked rows or one legal version with immutable locale variants is an owner/legal decision.

## Implemented Phase 2 append-only acceptance evidence

`terms_acceptances` contains an immutable event ID, `terms_version_id`, authoritative hash snapshot, booking reference, participant reference where applicable, accepting actor reference/type, representation type, locale, source context, and server-generated `accepted_at`. Pending/not-required remain derived state rather than false “acceptance” events.

The service must never infer acceptance from name, email, phone, booking-code possession, PWA install, push permission, or notification ownership. It must not allow an Admin to casually toggle pending to accepted. If an exceptional Admin-attested flow is later approved, it needs separate authorization, reason, actor and audit evidence.

Secure adult acceptance links should use high-entropy, expiring, single-purpose opaque tokens; store only a token hash; bind to one transaction/participant/version; consume atomically; return minimal data; and never expose unrelated booking details. Accounts are not required.

## Transaction coverage matrix

“Required?” below is a design question, not a legal conclusion.

| Flow | Current business effect / payment obligation | Candidate acceptance actor and evidence | Required / reacceptance decision |
| --- | --- | --- | --- |
| Fast Request website | Creates a pending request; no online payment obligation; requires email or phone but no name | Contact-attributed request-purpose event can be linked atomically without inventing a named organizer | Owner/counsel must decide whether this is sufficient or the lead remains non-contractual; no Terms are currently published |
| Full questionnaire | Creates a pending website request; no online payment obligation; includes organizer name | Named organizer request-purpose event can be linked atomically | Requires distinct approved request text before publication; never reuse a checked client state |
| Fast Request WhatsApp | Opens external prefilled conversation; site creates no canonical request at click | Cannot truthfully record contractual acceptance in current flow | Decide whether WhatsApp process supplies/records Terms later |
| Private excursion | Request first; Admin confirmation/payment lifecycle later | Request event, then booking/participant events if booking Terms differ | Reaccept only on approved material-change rules |
| Fixed excursion | Request tied to fixed excursion; no immediate online charge | Organizer request event, later participant coverage | Reschedule/material itinerary rule requires legal decision |
| Booking-code redemption | Possession authorizes code use, not identity | Relevant booking/participant actor must explicitly accept; code is only transaction link | Decide purpose/version and whether redemption changes obligations |
| Gift Card purchase | Admin-managed request/payment/issuance; payment recorded separately | Purchaser accepts purchase-purpose Terms | Must remain separate from recipient and excursion acceptance |
| Gift Card redemption | Recipient claims issued value; creates booking with no new revenue | Claimant accepts redemption Terms and, if required, later booking Terms | Legacy codes need an approved transition rule, not backfill |
| Reschedule/change | Mutates an existing booking/request | New event only when approved change rule says Terms must be reaccepted | Define materiality, version and grace behavior |
| Payment/order | Current site has no customer checkout; Admin records deposits/payments | Do not label **Send request** as pay/order acceptance | Future checkout needs separate payment/withdrawal wording and event |
| Admin-created booking exposed to customer | Admin creates operational record; customer did not accept | Customer/participants complete via secure owned flow | Define not-required vs pending and offline exceptional evidence |

CTA wording contract: **Send request** creates a request and no immediate payment obligation; **Send via WhatsApp** only opens WhatsApp and creates neither a canonical request nor payment obligation at click; booking-code/Gift Card redemption performs the specific existing redemption effect but is not identity or Terms proof. Final business/legal wording remains subject to counsel.

## Gift Card and booking-code boundaries

Gift Card purchase Terms, recipient redemption Terms, and excursion/booking Terms are separate purposes and versions. A purchaser cannot silently accept for a later recipient. A recipient claim cannot silently accept for other participants. Ordinary booking-code possession cannot establish identity, notification ownership, or acceptance. Historical Gift Card/booking-code data must not be rewritten or backfilled with fabricated acceptance.

## Authorization and RLS design

- Deny direct anonymous/authenticated insert/update/delete on published Terms and acceptance evidence.
- Public completion should use a narrowly scoped security-definer RPC or server endpoint: resolve token hash, lock token/participant/transaction/version rows, validate expiry/scope/state, select the applicable version server-side, insert one idempotent event, consume token, and return minimal status.
- Owner/manager may read evidence needed operationally; define whether finance role needs any access. Content editors may draft but cannot mutate a published version. Service role is server-only and must not be exposed to the browser.
- Customer reads must be limited to owned transaction/participant status through the existing protected ownership pattern or a purpose-built token; push ownership alone is not proof of legal identity.
- Evidence rows are append-only. Corrections/revocations require new auditable events, never update/delete of history. Database constraints should enforce unique idempotency and representation/participant consistency.
- No public broadcast fallback. RLS tests need owner, manager, ordinary authenticated, anonymous, valid-token and invalid/expired-token fixtures inside rolled-back transactions.

## Reminder integration design

After approval, a `customer_terms_required` personalized event could be generated only for an active confirmed booking with pending required acceptance and valid notification ownership. Copy must be generic and privacy-safe; destination must be an owned internal completion route. Dedupe by transaction/version/participant requirement revision; stop on completion; cancel/supersede on cancellation, material reschedule or ownership revocation; never include guest names, codes, payment or health data; never broadcast when ownership is absent. Cron remains off, so scheduled reminders remain scheduler-dependent and are not enabled by this design.

## Migration sequence

1. **Applied Phase 1:** `booking_participants`, guardian/organizer constraints, least-privilege access, owned-device locator, and guarded customer/Admin UI. No historical participants were fabricated.
2. **Authored Phase 2 infrastructure:** immutable `terms_versions`, append-only `terms_acceptances`, atomic website request enforcement, and owned organizer self-acceptance. It contains no published content; remote infrastructure application and a later legal publication both await separate approval.
3. Resolve remaining legal/product decisions and approve final document purposes/content before Production release.
4. **Later:** add hashed one-time acceptance invitations for individual adults and an approved guardian flow.
5. Only then add personalized reminder event/outbox integration; scheduler/Cron remains a separate approval.

Migration files `20260905100000_booking_participants_foundation.sql` and `0006_participant_ownership_locator.sql` are already applied to their authorized targets and were not rewritten. New Terms migration `20260905110000_terms_evidence_foundation.sql` is additive, forward-only, and unapplied remotely. If rollback is required after application, use a reviewed forward migration; do not rewrite applied history or delete legal evidence.

## Unresolved owner/legal decisions

1. Organizer-only representation versus individual acceptance for every additional adult.
2. Guardian authority model, applicable jurisdiction and age/minor rules.
3. When participant names and delivery contacts become mandatory.
4. Exact separation and applicability of Gift Card purchase, redemption and booking Terms.
5. Final approved Terms wording: operator identity, price/payment, cancellation, refund, no-show, safety, weather/volcanic change, liability, withdrawal and dispute clauses.
6. Retention duration and deletion/legal-hold policy for versions, invitations, participants and acceptance evidence.
7. Legal review/approval status and effective-date rollout strategy.
8. Material change/reschedule rules that require reacceptance.
9. Whether organizer representation of unrelated adults is legally and operationally permitted.
10. Whether IT/EN are co-equal authoritative texts and how conflicts are resolved.
11. Historical and offline/Admin-created booking treatment.
12. Controller/processor disclosures and exact retention for current custom and Cloudflare analytics.

Until these decisions are resolved, the repository must describe Phase 2 as a technical evidence foundation—not a completed legal/compliance conclusion. Production release of substantive Terms remains gated on counsel approval.
