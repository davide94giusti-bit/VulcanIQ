# Terms evidence foundation — 2026-09-05

Status: Phase 2 infrastructure and pre-deployment hardening record. `20260905110000_terms_evidence_foundation.sql` is authored but **has not been applied remotely**. The migration deliberately publishes no Terms. Direct website requests fail closed until counsel-approved, purpose-specific Terms are supplied by a separate publication migration with its own review. Cron remains off.

## Existing content and legal-content gate

Before this phase, VulcanIQ had no Terms version or acceptance evidence. The public IT and EN Terms are separate static JSX strings in `LegalPage` (`src/main.jsx`) with the displayed source date `2026-06-30`; they are not an immutable database publication and no acceptance is recorded from viewing them. Repository inspection confirmed that the migration, static content and this document are valid UTF-8. The reported broken apostrophes and accented characters are mojibake caused by decoding valid UTF-8 bytes as Windows-1252, not the bytes stored in Git. A raw-byte UTF-8 and mojibake regression now guards the legal sources.

IT and EN are translations maintained separately; legal equivalence has not been established. The existing generic static text is not treated as independently approved `booking_request` and `excursion_booking` contracts merely by assigning different purpose labels. No content is seeded, published or hashed by the infrastructure migration. **LEGAL REVIEW REQUIRED** before a later publication migration is authored. No substantive clause has been invented.

Known gaps requiring counsel include operator identity, price/payment obligations, cancellation, refunds, no-show, liability, minors/guardian authority, Gift Cards, force majeure, volcanic/weather changes, withdrawal/recesso, disputes, and whether the two locales are co-equal authoritative versions.

## Document purposes

- `booking_request`: architecture is wired to Fast Request and full-questionnaire website submission, but no current version exists yet.
- `excursion_booking`: architecture is wired to confirmed organizer self-acceptance in the owned area, but no current version exists yet.
- `gift_card_purchase` and `gift_card_redemption`: structurally reserved because the current product has distinct purchase and claim moments; no version is published and no UI is wired.

Booking-code redemption is not a document purpose and is not acceptance proof. It may eventually lead to an excursion acceptance requirement, subject to legal/product rules.

## Version and evidence model

`terms_versions` stores stable UUID, purpose, human-readable version, locale, effective/publication timestamps, immutable canonical JSON content, SHA-256, publication status, and creation time. A `BEFORE INSERT` trigger hashes PostgreSQL's canonical `jsonb::text` representation using `pgcrypto`; callers cannot supply the authoritative checksum. Published rows cannot be updated or deleted. Corrections require a new row. No draft CMS workflow is introduced: before publication the table is empty, so `resolve_current_terms_version` returns no row.

`terms_acceptances` stores the accepted version and authoritative hash snapshot, purpose, booking request, optional target and actor participants, actor type/optional name snapshot, representation, locale, source context, Privacy Notice provision time, server acceptance time, and creation time. It contains no raw IP, fingerprint, geolocation, user agent, email, phone, or notification identifier. A validation trigger resolves the published/effective version, overwrites hash/locale/purpose/timestamps, validates booking and participant scope, distinguishes an unnamed Fast Request contact from a named questionnaire organizer, and enforces self/guardian structure. A separate trigger rejects every update/delete.

Pending and not-required are derived states; no mutable `terms_accepted` flag is authoritative. Publishing a later version preserves old evidence and does not automatically invalidate existing bookings or fabricate reacceptance.

## Transaction boundaries

Direct website submission calls `create_public_booking_request_with_terms`. In one PostgreSQL transaction it validates the current locale/purpose/version, invokes the canonical idempotent request creator, and inserts the request acceptance. Any failure rolls back both. Browser time and hash are never accepted. A duplicate idempotency key returns the same request and requires an evidence row for the selected current version before success. With no published version the resolver returns no row and the request is rejected before request creation; no acceptance is fabricated.

## Request actor identity decision gate

| Flow | Current identity fields | Binding effect currently established | Current Terms behavior | Evidence actor available | Recommended treatment |
| --- | --- | --- | --- | --- | --- |
| Fast Request website | Email or phone; name intentionally absent and contact is not verified | Pending availability/request only | Fail closed while no approved `booking_request` version exists | The submitter associated with the canonical request contact, but no verified or named identity | Preserve no-name conversion. The schema labels this actor `request_contact` / `request_submitter` and stores no invented name. Owner/counsel must decide whether this attribution is sufficient or whether Fast Request should remain non-contractual. |
| Full questionnaire | Name plus email or phone and fuller booking context; still self-asserted | Pending request, not confirmation/payment | Fail closed while no approved `booking_request` version exists | Named request organizer associated with the canonical request | If request-level acceptance is approved, retain `booking_organizer` / `request_organizer`; do not describe the identity as verified. |
| Confirmed booking organizer | Active adult organizer participant behind exact owned-booking context | Confirmed booking/participation stage | Fail closed while no approved `excursion_booking` version exists | Real organizer participant record, actor and target are the same row | Publish distinct excursion Terms only after counsel approval, then permit organizer self-acceptance. |

A name entered in a public form would also be self-asserted and would not itself verify identity. The Fast Request evidence model therefore avoids inventing a name and ties the event to the same canonical request/contact already required by the product. Whether that evidence is legally sufficient is deliberately not decided in code.

Confirmed organizer self-acceptance is exposed only through the existing D1 ownership route. The Worker first verifies the active device subscription and unrevoked booking ownership, resolves the internal booking locator server-side, finds the active adult organizer on an accepted booking, and calls `record_owned_organizer_terms_acceptance`. That function targets the same organizer as actor and participant. Additional adults have no acceptance action; minors have no self-acceptance action. Parent/guardian representation is structurally supported by database validation but has no Phase 2 API/UI.

Admin reads are covered by the existing active-Admin predicate and are read-only. Anonymous/authenticated application roles have no direct table mutation privileges. Service role can select evidence and execute only the narrowly scoped resolver/writers. The public Terms endpoint returns only current published content and metadata; it does not expose hashes. Owned responses expose display status, content, version/date/actor context but no booking UUID or checksum.

Terms evidence is stored in Supabase, not D1. Notification unsubscribe, ownership revocation, notification preference changes, and PWA uninstall do not touch it.

## Transaction and acceptance matrix

| Flow | Current event | Classification | Purpose | Required now? | Actor / target | Source | Phase 2 status | Unresolved question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fast Request website | Creates idempotent pending request | Request, not confirmation/payment | `booking_request` candidate | Pending owner/legal decision | Unnamed request contact / request | `fast_request_website` | No name required; fail closed until approved publication | Whether a contact-attributed submission is sufficient or the lead remains non-contractual |
| Full questionnaire | Creates private or fixed pending request | Request, not confirmation/payment | `booking_request` candidate | Pending approved publication | Named organizer / request | `questionnaire_website` | Atomic architecture ready; currently fail closed | Approved request text and legal effect |
| Fast Request WhatsApp | Opens external prefilled chat; no canonical request | Contact only | None recorded | No site acceptance | None | WhatsApp click | Unchanged; no fake evidence | When/how later Terms are supplied and accepted |
| Private excursion | Website request, later Admin confirmation | Request then booking | Request candidate; excursion later | Pending publication | Organizer request; organizer participant self | Website / owned booking | Architecture ready; currently fail closed | Distinct approved texts, other adults and material changes |
| Fixed excursion | Website request linked to fixed excursion | Request then booking | Request candidate; excursion later | Pending publication | Organizer request; organizer participant self | Website / owned booking | Architecture ready; currently fail closed | Distinct approved texts, capacity and reschedule rules |
| Booking-code flow | Redeems code into booking | Redemption/booking | Not defined | Not in Phase 2 | No inferred actor | Existing code RPC | Unchanged; code is not proof | Applicable purpose and acceptance moment |
| Gift Card purchase | Admin-managed purchase/payment/issuance | Commercial purchase | `gift_card_purchase` reserved | Not in Phase 2 | Purchaser, unresolved | Existing Gift Card flow | Unchanged; no version/evidence | Approved purchase Terms and checkout actor |
| Gift Card redemption | Recipient claims value and booking is created | Redemption, no new revenue | `gift_card_redemption` reserved | Not in Phase 2 | Claimant, unresolved | Existing claim flow | Unchanged; no version/evidence | Redemption vs excursion Terms and legacy transition |
| Confirmed booking | Admin accepts request; organizer participant completed explicitly | Booking/participation | `excursion_booking` candidate | Pending approved publication | Organizer participant / same organizer | `owned_booking` | Self-only architecture ready; currently unavailable | Approved excursion text, deadline and additional-adult journey |
| Reschedule | Existing booking dates/operation change | Existing booking change | Not defined | No automatic reacceptance | Unresolved | Existing Admin flow | Unchanged | Materiality/version/grace policy |
| Payment/deposit | Admin records Finance lifecycle | Payment evidence, not customer checkout | Not defined | No Terms evidence inferred | None | Existing Finance flow | Unchanged | Future checkout/withdrawal wording |
| Admin-created booking | Admin creates operational record | Booking without customer acceptance | Excursion candidate | Not automatically accepted | Customer/participant later, unresolved | Admin | No fabricated evidence | Offline exception and pending/not-required policy |

## Migration objects and effect

Migration: `supabase/migrations/20260905110000_terms_evidence_foundation.sql`.

Objects: two tables, five explicit indexes, four triggers, three trigger/helper functions, three security-definer resolver/application RPCs, two Admin SELECT policies, and explicit grants/revokes. It inserts **zero** Terms versions and **zero** historical acceptances. It does not alter the applied participant migration or D1.

Applying it is additive infrastructure only: it creates the empty evidence model and trusted functions but makes no contractual text current. A later, separately reviewed publication migration must insert stable-ID, purpose-specific, locale-specific, counsel-approved content and its effective date. It must not use placeholder wording. Rollback after application must be a reviewed forward migration; do not rewrite applied history or delete legal evidence. The command that would apply the migration is `npx supabase db push`—it was not run and requires explicit human approval.

## Missing-schema and release behavior

- Public Terms GET returns 503 and direct website request controls remain disabled/fail closed when the schema is absent **or present without a published applicable version**.
- WhatsApp remains usable and records no acceptance.
- Owned/Admin Terms sections show a safe unavailable state without exposing or fabricating evidence.
- A frontend Preview can render, but direct website request and owned acceptance UAT require the schema. No Production deployment is part of this phase.

## Validation

`supabase/tests/terms_evidence_local.sql` is a rollback-only PostgreSQL test. It first proves the migration publishes no current version, then inserts clearly marked local-only fixtures inside its transaction to verify checksums, browser/service-role privileges, IT/EN mismatch rejection, Fast Request no-name evidence, questionnaire name enforcement, atomic/idempotent request evidence, authoritative timestamps, organizer self-acceptance, and update rejection. The fixtures disappear on `ROLLBACK`. `tools/terms-regression.mjs` adds raw UTF-8/mojibake, no-publication and source-contract coverage and is included in `npm run test:quality`.

## Deferred decisions and Phase 3

Phase 3 needs purpose-bound, expiring, hashed invitation tokens for individual adults; a verified guardian authority journey for minors; reminder/outbox rules only after an owned recipient exists; and transaction tests for all new actor paths. The organizer must never accept for an unrelated adult. A minor must never self-accept. No reminder or Cron work is included here.

Owner/counsel must first decide whether a Fast Request is a non-binding lead with no request-level contractual acceptance, whether contact-attributed acceptance is sufficient without a name, or whether a deliberate future UX change should require a name. They must also decide what legally differentiates `booking_request` from `excursion_booking`, the legal status of IT versus EN, final approved text/version/effective date, reacceptance/material-change rules, guardian authority and age jurisdiction, offline/Admin-created bookings, Gift Card purchase/redemption rules, booking-code applicability, evidence corrections, and retention/legal-hold/deletion policy. No retention duration is invented.
