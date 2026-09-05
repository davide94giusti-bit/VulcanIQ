# Participant and guardian Terms acceptance — Phase 3

Status: implementation and release-gate record for the additive Phase 3 journey. Migrations through `20260905120000` are remotely applied. The forward evidentiary-hardening migration `20260905130000_participant_terms_email_delivery_hardening.sql` is authored for local validation only and has **not** been applied remotely. This phase publishes no Terms, fabricates no acceptance, changes no D1 schema, and leaves Cron off.

## Scope and authorization boundary

Phase 3 adds individual acceptance journeys on top of the already-applied participant and Terms evidence foundations. The existing notification ownership chain remains the organizer-facing authorization boundary for viewing a booking, maintaining its named participants, and issuing or revoking an acceptance link. It proves control of a booking-scoped device claim; it does not verify that the current human is a named participant or guardian.

For that reason, an organizer can never submit self-acceptance for another adult. Additional adults and non-organizer configured guardians use a no-account, one-time capability link delivered directly by the trusted Supabase Edge Function through the existing Resend provider. The organizer initiates delivery but never receives the raw credential. When the organizer is the configured guardian, the owned-booking backend revalidates that relationship and provides the guardian acknowledgement flow without a public link. The database derives and fixes the legal scope when an invitation is issued:

- an active additional adult is both target and actor, with `self` representation;
- an active minor is the target and their current active adult `guardian_participant_id` is the actor, with `parent_or_guardian` representation;
- both participants must belong to the same accepted booking;
- the invitation is bound to one immutable `excursion_booking` Terms version and locale.

The capability proves possession of a high-entropy participant-scoped link, not government-verified identity. Guardian wording is an explicit self-attestation and remains subject to counsel approval.

## Invitation persistence and token handling

`terms_acceptance_invitations` belongs in Supabase because invitation consumption and append-only evidence creation must share one PostgreSQL transaction. D1 remains notification/device ownership infrastructure and receives no Phase 3 migration.

The trusted Supabase Edge Function generates 32 cryptographically random bytes and URL-safe hex-encodes them (256 bits). Only the SHA-256 digest is sent to and stored by PostgreSQL. The raw token exists transiently in that function and the encrypted Resend delivery request, and is placed in the participant email URL fragment. It is never returned to the organizer API/UI or written to localStorage/sessionStorage, Supabase, D1, analytics, an audit log, a query string, a participant name, or a notification body. The public page reads the fragment once and immediately removes it from browser history before resolving the invitation through a bounded POST body.

Invitation records contain only scope and lifecycle data: booking, target participant, derived actor participant, issuer organizer, exact Terms version/locale/representation, SHA-256 token digest, source, issuance/expiry, revocation and consumption evidence reference. The recipient email is validated, used for one server-to-server send, masked in the immediate organizer response, and not persisted in Supabase, D1, the booking, or notification preferences. Resend necessarily processes the destination under its configured provider retention; that operational/legal retention must be reviewed before release. Invitation records duplicate no email, phone, name, IP address, fingerprint, geolocation, payment data, code, or delivery destination. Terms delivery does not create notification ownership or subscription state.

The operational lifetime is 24 hours, matching the repository's existing high-entropy ownership-claim precedent. This is an engineering/product expiry choice, not a legal requirement. Reissue revokes any prior unconsumed invitation for the participant and preserves its audit row. Manual revoke never deletes acceptance. Lifecycle status is derived from timestamps as pending, expired, revoked, or consumed; there is no mutable status flag.

The hardening migration revokes any still-open pre-hardening `owned_booking_copy_link` invitation without deleting its row or any completed acceptance evidence. The confirmed Production state has no published Terms and therefore no such invitation; the statement remains explicit so other environments cannot retain the weaker organizer-copyable path.

## Exact-version and locale policy

Issue/reissue resolves the current published `excursion_booking` version for IT or EN inside PostgreSQL. The public page renders the immutable snapshot and locale returned for that exact invitation; it never calls the current-Terms endpoint or lets a language toggle substitute another document.

For this release, a still-pending invitation becomes unusable if a newer version becomes current. The customer must receive a newly issued link and sees exactly the version they can accept. The old row and any historical acceptance remain untouched. This is a conservative technical policy, not a general legal reacceptance rule. Owner/counsel must decide whether a later product should instead permit a still-live old-version link, how material changes affect existing acceptances, and whether IT/EN are co-equal authoritative texts.

No version is seeded here. While no approved version exists, issuance, resolution, and acceptance fail closed; customer/Admin UI says Terms are temporarily unavailable and never reports false completion.

## Trusted transaction and replay behavior

Owned issue/reissue/revoke routes first re-establish the existing active D1 subscription and unrevoked booking ownership, then resolve the hidden booking locator and authoritative Supabase participant rows. The organizer supplies only the intended participant/guardian email and locale; the Pages Function calls the secret-protected delivery Edge Function. Browser-supplied booking, actor, representation, timestamps, hashes, or Terms content are never authoritative.

The acceptance RPC performs an unlocked hash discovery followed by the authoritative lock order `booking_requests → booking_participants (deterministic ID order) → terms_acceptance_invitations`. It then revalidates booking eligibility, active participant scope, current configured guardian relationship, exact still-current version, locale, expiry, revocation, and consumption. It inserts through the existing `terms_acceptances` validation trigger, which supplies the hash, name snapshot, locale, Privacy Notice time, acceptance time, and creation time. Invitation consumption and evidence insertion commit atomically.

The existing participant/version/representation unique index prevents duplicate evidence. A network retry of a consumed link can return a minimal idempotent accepted result only when its already-linked evidence exactly matches; it cannot render the document again, change scope, or create another event. Invalid, unknown, expired, revoked, stale-version, cancelled-booking, removed-participant, changed-guardian, and cross-scope attempts share a generic public failure.

## Completion semantics

Completion is derived from current active participants and current-version immutable evidence, never participant flags:

- active adults require `self` evidence whose actor is the same participant;
- active minors require immutable `parent_or_guardian` evidence whose participant actor was verified by the database trigger as the configured guardian when acceptance occurred;
- removed participants are excluded from current requirements, while their history remains;
- no published current version means unavailable, not complete;
- no named participants means incomplete, not `0 of 0 complete`;
- named composition must match the canonical aggregate adult/minor counts and contain an active organizer before booking-level completion can be true.

Aggregate booking counts remain canonical. A temporary composition mismatch is permitted during collection and is surfaced as incomplete. Rescheduling alone does not create a new acceptance requirement. Cancellation blocks new acceptance. Participant removal or a guardian change invalidates a pending capability path without deleting historical evidence. A later guardian change does not retroactively invalidate completed evidence recorded through the then-current verified relationship and does not require reacceptance unless a future legal/product rule expressly introduces that requirement.

## Customer, public, and Admin journeys

The existing owned booking area remains the only customer portal. It shows participant-level current Terms state and a truthful accepted/required count. The organizer can accept for themselves, accept for a minor only when they are that minor's configured guardian, and send/reissue/revoke an email invitation for an additional adult or non-organizer guardian. The organizer sees only delivery/lifecycle status and a masked destination, never the link. Email is sent through the existing server-side Resend architecture; SMS is not implemented.

The non-indexable `/terms-acceptance` route requires no account. It exposes only vulcanIQ branding, target participant name, configured guardian name when applicable, a safe experience presentation, exact version/date/locale/content, the Privacy Notice link, an unchecked explicit acknowledgement, and confirmation. It never renders booking/Gift Card codes, contact details, payment data, other participants, UUIDs, ownership data, raw hashes, or the token. First-party analytics, heartbeat, Cloudflare Web Analytics, and first-run onboarding are disabled on this sensitive route.

Admin remains read-only. Booking details show evidence-derived completion, roles, acceptance actor/representation/version/locale/time/source, and sanitized invitation lifecycle. Admin never sees a token/hash and receives no “mark accepted” action.

## Abuse controls, privileges, and rollout

Owned issue/reissue/revoke actions use fixed per-subscription/action D1 rate-limit buckets after device authentication; the exact active ownership is validated separately. Attacker-supplied ownership IDs cannot create distinct limiter keys. Anonymous resolve/confirm requests reuse the existing Supabase-backed actor and global public rate limiter. A 256-bit capability, generic responses, bounded POST bodies, single-use lifecycle, atomic scope checks, and throttling protect against guessing, enumeration, and replay; CAPTCHA is not added without a demonstrated need.

The invitation relation has RLS enabled. Active Admin users and service role may select lifecycle data, but application roles receive no direct insert/update/delete. All lifecycle and acceptance functions are `SECURITY DEFINER`, explicitly revoked from `public`, `anon`, and `authenticated`, and executable only by `service_role`. Trigger helpers are owner-only. Public clients cannot enumerate invitations or acceptances.

Preview code must handle a missing hardening RPC or delivery configuration independently: existing participant/Terms views continue working and invitation controls report delivery unavailable. Applying `20260905130000_participant_terms_email_delivery_hardening.sql` or deploying/configuring the new Edge Function requires separate explicit approval. End-to-end contractual acceptance UAT remains blocked until the forward migration, delivery configuration, and separately counsel-approved Terms publication exist.

## Deferred owner/legal decisions and Phase 4

The following remain open and are not invented by this phase:

1. Whether control of the organizer-designated recipient mailbox plus explicit self-attestation is sufficient evidence, whether participant contact must be independently collected/verified, or stronger identity authentication is required.
2. Final guardian acknowledgement wording, authority standard, governing jurisdiction, and minor age rules.
3. Whether pending links may accept an older immutable version after a newer publication; this release requires reissue.
4. Material-change, reschedule, cancellation, grace-period, and reacceptance rules.
5. Whether IT and EN are co-equal authoritative texts and conflict handling.
6. Final counsel-approved excursion Terms content, version identifiers, and effective dates.
7. Participant/invitation/evidence retention, erasure, legal hold, and correction policy.
8. Treatment of historical, offline, Admin-created, booking-code, Gift Card purchase, Gift Card redemption, and later excursion acceptance journeys.
9. Whether a durable participant contact model is required later; this release intentionally uses the email transiently in VulcanIQ, does not create notification ownership, and still requires review of Resend destination/log retention.
10. Accessibility/legal copy review with real published content.

Phase 4 reminder automation, scheduled campaigns, escalation, dedupe jobs, monitoring, and Cron activation remain out of scope. Cron stays off.
