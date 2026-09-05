# Terms evidence foundation — 2026-09-05

Status: Phase 2 implementation and migration review record. `20260905110000_terms_evidence_foundation.sql` is authored but **has not been applied remotely**. Because Preview shares Production Supabase, direct website requests on a frontend Preview fail closed until the migration is explicitly approved and applied. Cron remains off.

## Existing content and legal-content gate

Before this phase, VulcanIQ had no Terms version or acceptance evidence. The public IT and EN Terms were separate static JSX strings in `LegalPage` (`src/main.jsx`) with the source date `2026-06-30`; they were not an immutable database publication and no acceptance was recorded. The seeded snapshots copy that existing intro and six substantive sections exactly. The dynamic contact section is not part of the hashed contractual snapshot.

IT and EN are translations maintained separately; legal equivalence has not been established. The same current text is seeded for the `booking_request` and `excursion_booking` purposes because it is the only verified current text, but its adequacy for a confirmed excursion is unresolved. **LEGAL REVIEW REQUIRED** before Production release. No substantive clause has been invented.

Known gaps requiring counsel include operator identity, price/payment obligations, cancellation, refunds, no-show, liability, minors/guardian authority, Gift Cards, force majeure, volcanic/weather changes, withdrawal/recesso, disputes, and whether the two locales are co-equal authoritative versions.

## Document purposes

- `booking_request`: wired to Fast Request and full questionnaire website submission.
- `excursion_booking`: wired only to confirmed organizer self-acceptance in the owned area.
- `gift_card_purchase` and `gift_card_redemption`: structurally reserved because the current product has distinct purchase and claim moments; no version is published and no UI is wired.

Booking-code redemption is not a document purpose and is not acceptance proof. It may eventually lead to an excursion acceptance requirement, subject to legal/product rules.

## Version and evidence model

`terms_versions` stores stable UUID, purpose, human-readable version, locale, effective/publication timestamps, immutable canonical JSON content, SHA-256, publication status, and creation time. A `BEFORE INSERT` trigger hashes PostgreSQL's canonical `jsonb::text` representation using `pgcrypto`; callers cannot supply the authoritative checksum. Published rows cannot be updated or deleted. Corrections require a new row.

`terms_acceptances` stores the accepted version and authoritative hash snapshot, purpose, booking request, optional target and actor participants, actor type/name snapshot, representation, locale, source context, Privacy Notice provision time, server acceptance time, and creation time. It contains no raw IP, fingerprint, geolocation, user agent, email, phone, or notification identifier. A validation trigger resolves the published/effective version, overwrites hash/locale/purpose/timestamps, validates booking and participant scope, and enforces self/guardian structure. A separate trigger rejects every update/delete.

Pending and not-required are derived states; no mutable `terms_accepted` flag is authoritative. Publishing a later version preserves old evidence and does not automatically invalidate existing bookings or fabricate reacceptance.

## Transaction boundaries

Direct website submission calls `create_public_booking_request_with_terms`. In one PostgreSQL transaction it validates the current locale/purpose/version, invokes the canonical idempotent request creator, and inserts the request acceptance. Any failure rolls back both. Browser time and hash are never accepted. A duplicate idempotency key returns the same request and requires an evidence row for the selected current version before success.

Confirmed organizer self-acceptance is exposed only through the existing D1 ownership route. The Worker first verifies the active device subscription and unrevoked booking ownership, resolves the internal booking locator server-side, finds the active adult organizer on an accepted booking, and calls `record_owned_organizer_terms_acceptance`. That function targets the same organizer as actor and participant. Additional adults have no acceptance action; minors have no self-acceptance action. Parent/guardian representation is structurally supported by database validation but has no Phase 2 API/UI.

Admin reads are covered by the existing active-Admin predicate and are read-only. Anonymous/authenticated application roles have no direct table mutation privileges. Service role can select evidence and execute only the narrowly scoped resolver/writers. The public Terms endpoint returns only current published content and metadata; it does not expose hashes. Owned responses expose display status, content, version/date/actor context but no booking UUID or checksum.

Terms evidence is stored in Supabase, not D1. Notification unsubscribe, ownership revocation, notification preference changes, and PWA uninstall do not touch it.

## Transaction and acceptance matrix

| Flow | Current event | Classification | Purpose | Required now? | Actor / target | Source | Phase 2 status | Unresolved question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fast Request website | Creates idempotent pending request | Request, not confirmation/payment | `booking_request` | Yes | Organizer / request | `fast_request_website` | Atomic request + evidence implemented | Counsel approval of current text |
| Full questionnaire | Creates private or fixed pending request | Request, not confirmation/payment | `booking_request` | Yes | Organizer / request | `questionnaire_website` | Atomic request + evidence implemented | Counsel approval of current text |
| Fast Request WhatsApp | Opens external prefilled chat; no canonical request | Contact only | None recorded | No site acceptance | None | WhatsApp click | Unchanged; no fake evidence | When/how later Terms are supplied and accepted |
| Private excursion | Website request, later Admin confirmation | Request then booking | Request now; excursion later | Request yes; confirmed organizer action later | Organizer request; organizer participant self | Website / owned booking | Implemented for both supported moments | Other adults and material changes |
| Fixed excursion | Website request linked to fixed excursion | Request then booking | Request now; excursion later | Request yes; confirmed organizer action later | Organizer request; organizer participant self | Website / owned booking | Implemented for both supported moments | Capacity/reschedule reacceptance rules |
| Booking-code flow | Redeems code into booking | Redemption/booking | Not defined | Not in Phase 2 | No inferred actor | Existing code RPC | Unchanged; code is not proof | Applicable purpose and acceptance moment |
| Gift Card purchase | Admin-managed purchase/payment/issuance | Commercial purchase | `gift_card_purchase` reserved | Not in Phase 2 | Purchaser, unresolved | Existing Gift Card flow | Unchanged; no version/evidence | Approved purchase Terms and checkout actor |
| Gift Card redemption | Recipient claims value and booking is created | Redemption, no new revenue | `gift_card_redemption` reserved | Not in Phase 2 | Claimant, unresolved | Existing claim flow | Unchanged; no version/evidence | Redemption vs excursion Terms and legacy transition |
| Confirmed booking | Admin accepts request; organizer participant completed explicitly | Booking/participation | `excursion_booking` | Organizer self-action supported | Organizer participant / same organizer | `owned_booking` | Implemented; only accepted booking | Deadline and additional-adult journey |
| Reschedule | Existing booking dates/operation change | Existing booking change | Not defined | No automatic reacceptance | Unresolved | Existing Admin flow | Unchanged | Materiality/version/grace policy |
| Payment/deposit | Admin records Finance lifecycle | Payment evidence, not customer checkout | Not defined | No Terms evidence inferred | None | Existing Finance flow | Unchanged | Future checkout/withdrawal wording |
| Admin-created booking | Admin creates operational record | Booking without customer acceptance | Excursion candidate | Not automatically accepted | Customer/participant later, unresolved | Admin | No fabricated evidence | Offline exception and pending/not-required policy |

## Migration objects and effect

Migration: `supabase/migrations/20260905110000_terms_evidence_foundation.sql`.

Objects: two tables, four indexes, four triggers, three trigger/helper functions, two security-definer application RPCs, two Admin SELECT policies, explicit grants/revokes, and four deterministic published seed rows (IT/EN for two wired purposes). The migration contains no historical acceptance backfill and does not alter the applied participant migration or D1.

Applying it is additive but not behavior-free: it publishes initial Terms snapshots and makes the new RPCs available. Existing Production request endpoints are unaffected until the matching frontend/API code is released. Rollback after application must be a reviewed forward migration; do not rewrite applied history or delete legal evidence. The command that would apply the migration is `npx supabase db push`—it was not run and requires explicit human approval.

## Missing-schema and release behavior

- Public Terms GET returns 503 and direct website request controls remain disabled/fail closed when the schema is absent.
- WhatsApp remains usable and records no acceptance.
- Owned/Admin Terms sections show a safe unavailable state without exposing or fabricating evidence.
- A frontend Preview can render, but direct website request and owned acceptance UAT require the schema. No Production deployment is part of this phase.

## Validation

`supabase/tests/terms_evidence_local.sql` is a rollback-only PostgreSQL test. It verifies seeded checksums, browser/service-role privileges, IT/EN mismatch rejection, atomic/idempotent request evidence, authoritative timestamps, organizer self-acceptance, and update rejection. It must be executed only against a local reset database. `tools/terms-regression.mjs` adds source-contract coverage and is included in `npm run test:quality`.

## Deferred decisions and Phase 3

Phase 3 needs purpose-bound, expiring, hashed invitation tokens for individual adults; a verified guardian authority journey for minors; reminder/outbox rules only after an owned recipient exists; and transaction tests for all new actor paths. The organizer must never accept for an unrelated adult. A minor must never self-accept. No reminder or Cron work is included here.

Owner/counsel must decide the legal status of IT versus EN, final approved text/version/effective date, reacceptance/material-change rules, guardian authority and age jurisdiction, offline/Admin-created bookings, Gift Card purchase/redemption rules, booking-code applicability, evidence corrections, and retention/legal-hold/deletion policy. No retention duration is invented.
