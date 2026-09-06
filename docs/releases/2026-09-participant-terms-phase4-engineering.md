# Participant Terms Phase 4 — engineering release notes

## Release state

Phase 4 is prepared as scheduler code plus forward-only migrations. Production Cron remains `crons = []`. No Terms are published by these files. No migration or deployment is performed merely by merging this source.

## Architecture

The existing D1 notification scheduler remains the orchestration and delivery layer. It selects a bounded, fairly rotated batch of active owned-booking destinations and submits only their internal booking UUIDs to the service-role-only Supabase resolver. Supabase derives the current evidence state; D1 does not reproduce legal acceptance rules.

The resolver returns no names or contact data. It returns booking lifecycle, current Terms version/locale, composition and acceptance counts, latest state-change time, a SHA-256 state revision, eligibility, and a suppression reason. The Worker applies the internal rule's 1,440-minute initial delay and creates at most one job per opaque booking reference per Europe/Rome day.

Before each send the Worker re-queries the authoritative state and compares the revision. Completion, closure, changed participant/evidence state, disabled reminders, disabled automation rule, or revoked ownership cancels/suppresses the job. A temporary Supabase failure defers rather than sends an unvalidated reminder.

Reminder copy is generic and routes to `/install`. Reminders never issue or resend Terms bearer credentials; invitation issuance remains an explicit organizer action.

## Version-controlled changes

### Supabase migration

`20260906100000_participant_terms_reminder_state.sql` adds only:

- `get_participant_terms_reminder_states(uuid[], text, timestamptz)`;
- maximum batch size 100;
- service-role-only EXECUTE;
- a read-only, PII-free completion projection.

It changes no table, trigger, RLS policy, Terms version, invitation, acceptance, participant, booking count, or historical row. Expected lock impact is ordinary bounded SELECT locking only; it does not use `FOR UPDATE` or perform a backfill.

### D1 migration

`0007_participant_terms_reminders.sql` adds:

- nullable `notification_subscription_ownership.terms_reminder_checked_at`;
- a bounded scan index;
- enabled internal rule `customer_participant_terms_reminder` with a 1,440-minute delay.

The migration does not enqueue jobs, send notifications, create ownership, or enable Cron. Existing rows receive NULL for the scan watermark and are evaluated only by an explicitly invoked scheduler.

### Worker and Pages

- Worker reconciliation batch cap: `PARTICIPANT_TERMS_RECONCILE_BATCH_CAP=50` in both environments.
- Production and Preview Worker names/D1 IDs remain distinct.
- Pages cancels queued Terms reminder jobs after owned participant/evidence changes, booking cancellation, disabled reminders, or ownership revocation.
- The owned-booking UI shows a safe last-reminder lifecycle summary.
- Existing Admin automation/job views provide operational status and failure visibility without bearer or device credentials.

No new runtime dependency is introduced.

## Secrets and environment

No new secret is required. Worker authoritative reads use the existing Supabase backend credential contract (`SUPABASE_SECRET_KEY` primary or legacy `SUPABASE_SERVICE_ROLE_KEY` fallback). Phase 3 invitation secrets remain unchanged and never use `VITE_*`.

## Operational cost

Each scheduler invocation evaluates at most 50 primary active ownerships by default. IDs are grouped into at most two locale RPC calls, each below the resolver's 100-ID ceiling. The D1 watermark rotates subsequent invocations fairly. Eligible work uses existing unique job/event keys, retry state, budget controls, inbox uniqueness and Web Push transport.

## Activation sequence

1. Review both migrations and this diff.
2. Keep Production Cron off.
3. Apply D1 `0007` to Preview D1 only under explicit approval.
4. Because Preview shares Production Supabase, separately approve and apply `20260906100000` only after the migration review gate.
5. Configure/deploy the Preview Worker code with Cron still off.
6. Deploy the branch through Git-integrated Pages Preview.
7. Publish only counsel-approved Terms through the separately approved publication procedure.
8. Run the Admin UAT guide using controlled fixtures and a one-shot scheduler invocation.
9. Inspect jobs, events, attempts, audit outcomes, dedupe and suppression.
10. Only after evidence is accepted, decide a Preview Cron trial and later a separate Production Cron activation.

## Rollback and forward-fix

Safe operational rollback:

1. Keep or restore both Cron declarations to `crons = []`.
2. Disable only `customer_participant_terms_reminder` in the authenticated Admin rule UI if immediate scheduling suppression is required.
3. Cancel remaining scheduled participant-Terms jobs through the existing authorized job controls or a reviewed operational command.
4. Restore the previous Pages/Worker application versions if needed.

Retain D1 job/event/audit history, ownership history, Supabase participant records, invitation lifecycle and immutable acceptance evidence. Do not drop the resolver during an incident and do not delete acceptance evidence. Any schema correction should be a new forward migration.

## Monitoring

Monitor the participant-Terms rule, recent `customer_participant_terms_reminder` jobs, `participant_terms_reminder_*` audit outcomes, due-job age, retry/permanent push classifications, notification budget mode and the Worker scheduled-run result. Never include endpoint keys, invitation tokens, participant email addresses or raw booking UUIDs in exported incident material.

## Known release gates

- No approved/published IT/EN Terms are supplied by this change.
- Preview Pages shares Production Supabase.
- Phase 3 delivery configuration and base URL require environment verification.
- Cron remains off pending controlled one-shot evidence.
- Direct invitation delivery proves control of the organizer-designated mailbox, not independently verified human identity; owner/legal acceptance of that evidentiary model remains required.
