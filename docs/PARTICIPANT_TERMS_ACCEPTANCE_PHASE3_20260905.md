# Participant and guardian Terms acceptance — Phase 3

Status: implementation and release-gate record for the additive Phase 3 journey. The new Supabase migration is authored for local validation only and has **not** been applied remotely. This phase publishes no Terms, fabricates no acceptance, changes no D1 schema, and leaves Cron off.

## Scope and authorization boundary

Phase 3 adds individual acceptance journeys on top of the already-applied participant and Terms evidence foundations. The existing notification ownership chain remains the organizer-facing authorization boundary for viewing a booking, maintaining its named participants, and issuing or revoking an acceptance link. It proves control of a booking-scoped device claim; it does not verify that the current human is a named participant or guardian.

For that reason, an organizer can never submit self-acceptance for another adult or guardian acceptance for a minor. Additional adults and configured guardians use a no-account, one-time capability link. The database derives and fixes the legal scope when the link is issued:

- an active additional adult is both target and actor, with `self` representation;
- an active minor is the target and their current active adult `guardian_participant_id` is the actor, with `parent_or_guardian` representation;
- both participants must belong to the same accepted booking;
- the invitation is bound to one immutable `excursion_booking` Terms version and locale.

The capability proves possession of a high-entropy participant-scoped link, not government-verified identity. Guardian wording is an explicit self-attestation and remains subject to counsel approval.

## Invitation persistence and token handling

`terms_acceptance_invitations` belongs in Supabase because invitation consumption and append-only evidence creation must share one PostgreSQL transaction. D1 remains notification/device ownership infrastructure and receives no Phase 3 migration.

The browser/Pages layer generates 32 cryptographically random bytes and URL-safe hex-encodes them (256 bits). Only the SHA-256 digest is sent to and stored by Supabase. The raw token is returned to the owned organizer UI once, kept only in React memory, and placed in a URL fragment for manual copy/share. It is never written to localStorage/sessionStorage, a database, analytics, an audit log, a query string, a participant name, or a notification body. The public page reads the fragment once and immediately removes it from browser history before resolving the invitation through a bounded POST body.

Invitation records contain only scope and lifecycle data: booking, target participant, derived actor participant, issuer organizer, exact Terms version/locale/representation, SHA-256 token digest, source, issuance/expiry, revocation and consumption evidence reference. They duplicate no email, phone, name, IP address, fingerprint, geolocation, payment data, code, or delivery destination.

The operational lifetime is 24 hours, matching the repository's existing high-entropy ownership-claim precedent. This is an engineering/product expiry choice, not a legal requirement. Reissue revokes any prior unconsumed invitation for the participant and preserves its audit row. Manual revoke never deletes acceptance. Lifecycle status is derived from timestamps as pending, expired, revoked, or consumed; there is no mutable status flag.

## Exact-version and locale policy

Issue/reissue resolves the current published `excursion_booking` version for IT or EN inside PostgreSQL. The public page renders the immutable snapshot and locale returned for that exact invitation; it never calls the current-Terms endpoint or lets a language toggle substitute another document.

For this release, a still-pending invitation becomes unusable if a newer version becomes current. The customer must receive a newly issued link and sees exactly the version they can accept. The old row and any historical acceptance remain untouched. This is a conservative technical policy, not a general legal reacceptance rule. Owner/counsel must decide whether a later product should instead permit a still-live old-version link, how material changes affect existing acceptances, and whether IT/EN are co-equal authoritative texts.

No version is seeded here. While no approved version exists, issuance, resolution, and acceptance fail closed; customer/Admin UI says Terms are temporarily unavailable and never reports false completion.

## Trusted transaction and replay behavior

Owned issue/reissue/revoke routes first re-establish the existing active D1 subscription and unrevoked booking ownership, then resolve the hidden booking locator and authoritative Supabase participant rows. Browser-supplied booking, actor, representation, timestamps, hashes, or Terms content are never authoritative.

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

The existing owned booking area remains the only customer portal. It shows participant-level current Terms state and a truthful accepted/required count. The organizer can accept only for themselves through the existing explicit control, create/reissue/revoke a secure link for an additional adult or a minor's configured guardian, and copy/share the newly generated link manually. There is no safe participant email/SMS delivery contract in the current repository, so this phase does not claim automated delivery.

The non-indexable `/terms-acceptance` route requires no account. It exposes only vulcanIQ branding, target participant name, configured guardian name when applicable, a safe experience presentation, exact version/date/locale/content, the Privacy Notice link, an unchecked explicit acknowledgement, and confirmation. It never renders booking/Gift Card codes, contact details, payment data, other participants, UUIDs, ownership data, raw hashes, or the token. First-party analytics, heartbeat, Cloudflare Web Analytics, and first-run onboarding are disabled on this sensitive route.

Admin remains read-only. Booking details show evidence-derived completion, roles, acceptance actor/representation/version/locale/time/source, and sanitized invitation lifecycle. Admin never sees a token/hash and receives no “mark accepted” action.

## Abuse controls, privileges, and rollout

Owned issue/reissue/revoke actions use fixed per-subscription/action D1 rate-limit buckets after device authentication; the exact active ownership is validated separately. Attacker-supplied ownership IDs cannot create distinct limiter keys. Anonymous resolve/confirm requests reuse the existing Supabase-backed actor and global public rate limiter. A 256-bit capability, generic responses, bounded POST bodies, single-use lifecycle, atomic scope checks, and throttling protect against guessing, enumeration, and replay; CAPTCHA is not added without a demonstrated need.

The invitation relation has RLS enabled. Active Admin users and service role may select lifecycle data, but application roles receive no direct insert/update/delete. All lifecycle and acceptance functions are `SECURITY DEFINER`, explicitly revoked from `public`, `anon`, and `authenticated`, and executable only by `service_role`. Trigger helpers are owner-only. Public clients cannot enumerate invitations or acceptances.

Preview code must handle a missing Phase 3 relation/RPC independently: existing participant/Terms views continue working and link controls show unavailable. Applying `20260905120000_participant_terms_acceptance_journeys.sql` to any remote database requires a separate explicit approval. Because Preview currently shares the Production Supabase database, a Preview UI can be checked for graceful degradation before schema approval, but end-to-end contractual acceptance UAT is blocked until both the migration and separately counsel-approved Terms publication exist.

## Deferred owner/legal decisions and Phase 4

The following remain open and are not invented by this phase:

1. Whether bearer-link plus explicit self-attestation is sufficient evidence or stronger identity authentication is required.
2. Final guardian acknowledgement wording, authority standard, governing jurisdiction, and minor age rules.
3. Whether pending links may accept an older immutable version after a newer publication; this release requires reissue.
4. Material-change, reschedule, cancellation, grace-period, and reacceptance rules.
5. Whether IT and EN are co-equal authoritative texts and conflict handling.
6. Final counsel-approved excursion Terms content, version identifiers, and effective dates.
7. Participant/invitation/evidence retention, erasure, legal hold, and correction policy.
8. Treatment of historical, offline, Admin-created, booking-code, Gift Card purchase, Gift Card redemption, and later excursion acceptance journeys.
9. A dedicated participant contact/delivery model and reviewed email/SMS provider contract, if automated delivery is desired.
10. Accessibility/legal copy review with real published content.

Phase 4 reminder automation, scheduled campaigns, escalation, dedupe jobs, monitoring, and Cron activation remain out of scope. Cron stays off.
