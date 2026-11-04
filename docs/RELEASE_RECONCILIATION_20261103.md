# Release reconciliation — 3 November 2026

This is a locally verified compatibility patch, not a deployment or evidence that remote configuration/acceptance is complete. The user requested a Production release on 3 November; do not ask for the same authorization again merely because the older runbook labels release commands as future approvals. Resolve the actual technical gates first and establish exact targets before writes.

## Evidence and scope

- Corrected audit archive SHA-256: `e4bc1ac90c5fe5502bf54c1be74bb4584772e42b841c389ed2abc442e286bed7`; source base `35de12dc8dd0ba360a888417ca7d076f8e62d71b` on `codex/audit-remediation-20261027`.
- Operator fetched origin on 3 November; `origin/main` remained `35de12d`.
- Production Supabase ledger: 38 versions ending `20260906100000`. Five participant/Terms versions were absent from the audit source; Google Reviews `20261005100000` and the six audit versions were absent from the ledger. Missing ledger entries do not prove the corresponding live schema is absent.
- Production D1 screenshot, database `vulcaniq-notifications`: original 0001–0005. Preview screenshot, `vulcaniq-notifications-preview`: those five plus `0006_participant_ownership_locator.sql` and `0007_participant_terms_reminders.sql`. Neither screenshot records audit delivery leases/retention.
- Recovery ZIP SHA-256: `cec0e0510a9ec8b4d9c1ec55e810949256dd70e174dda6bc4aba81913fa23f86`. Its seven SQL files were exported from `314b0e1`. Operator ancestry checks for `4692900`, `6cafedd`, `786461b` passed. Branches containing the commit: participant Terms acceptance phase 3 and Admin review translation state, including their origin refs. This does not authorize merging either whole branch.

The seven recovered migrations are restored byte-for-byte. No historical migration is edited. Only the never-applied audit D1 file moves from `0007_delivery_leases_and_retention.sql` to `0008_delivery_leases_and_retention.sql`.

## Confirmed compatibility defects and corrections

1. **P1 — valid participant ownership claims rejected.** Recovered D1 0006 binds ownership to the claim's internal `entity_id`. The audit insert omitted it; a real handler reproduction returned 500. The insert now copies it from the trusted claim row. Legacy NULL locators remain NULL. Device binding and the scope trigger remain enforced. The identifier stays out of public responses.
2. **P1 — new claims lose the participant locator.** Audit claim issuance omitted `entity_id`; new records could not support the recovered participant locator contract. Trusted issuance now stores the existing booking UUID internally, without backfilling historical records or exposing it in the returned token contract. Both D1 environments must have the recovered column before this code is deployed.
3. **P1 — unsupported participant Terms reminders bypass canonical validation and reminder consent.** The audit Worker did not recognize this category, so it could enter generic delivery; the shared preference mapping used status updates instead of reminders. Actual SQLite/handler tests produced an inbox item even with reminders opted out. The Worker now selects only customer categories it knows how to validate, leaving unsupported jobs unchanged and outside the bounded due batch. Existing supported jobs continue to pass their behavior suite. The Terms category maps to reminder consent, and its unsent jobs are cancelled by the existing ownership opt-out handler.
4. **P2 — review calendar dates shift by one day in negative UTC offsets.** The pre-existing review test failed in America/Los_Angeles: SQL date `2026-08-08` displayed as `07/08/2026`. Date-only values now retain their calendar day; actual timestamps continue to use the visitor's timezone. A subprocess test covers Los Angeles, UTC and Rome.

The reminder hold is a safety boundary, **not full integration of the participant feature branch**. No participant UI, Pages acceptance endpoints or dedicated canonical Terms scheduler are invented or silently claimed present. Keep notification Cron/outbox disabled. Before replacing an environment that uses the participant feature, inspect its full branch runtime and preserve/integrate those contracts or keep that environment untouched. Do not activate Terms scheduling while it remains unsupported. Do not rewrite queued jobs, evidence, token hashes or consent to force compatibility.

## Local verification actually executed

- Node 22.23.4. Clean application install; existing dependency lock retained. Full quality/build gate passes: **552 regression/behavior/bundle checks; 160 syntax/JSX files**. Syntax compilation is not whole-program type checking.
- Dependency audit: zero known vulnerabilities at all severities.
- New compatibility suite: **10/10**. Covers both recorded D1 starting points; original device/ownership/consent fields; nullable/new locators; real claim/replay/wrong-device handlers; identifier non-disclosure; trigger rejection of a changed locator; non-destructive unsupported-job hold; actual Terms opt-out cancellation. Original notification behavior suite remains **58/58**.
- Fresh **45-migration** SQL replay and **137 existing SQL assertions** pass in PGlite 0.5.15 (PostgreSQL 18.6 WASM).
- Independent replay of **38 recorded baseline versions**, then synthetic financial/participant evidence, then **seven pending migrations** passes. Post-upgrade: **9 participant preservation/authority/immutability checks**, **3 existing legacy checks**, and **137 existing SQL assertions** pass. Recovered function definitions and ACLs, participant fields, Terms content/hash, acceptance actors/timestamps and invitation lifecycle remain unchanged.
- PGlite uses minimal synthetic Auth/Storage metadata and an inert network function; no provider is contacted. This is PostgreSQL execution, but **does not replace the project's Supabase/Docker 17 CI, real Auth/Storage services, PostgREST, multi-session concurrency, installed devices or live catalog checks**. New PGlite tooling was installed only in an external verification directory; no application dependency was added.
- The Docker/PowerShell runner now exercises the actual 38 + 7 upgrade and the new evidence fixtures. That wrapper and remote CI were **not executed here**. Existing historical browser/concurrency/restore results were not re-labelled as new passes.

## Remaining release work

1. Local coding agent applies this patch with manifest/hash preflight and preserves the user's uncommitted remediation. Regenerate the source archive/manifest from the actual worktree; the original frozen manifest belongs to the old archive.
2. Verify real Supabase catalog/ledger and applied migration definitions against the recovered files. Inspect D1 columns, indexes and triggers in both environments. Do not repair ledgers, reapply already-recorded SQL, or presume applied filenames prove matching definitions.
3. Inspect feature-branch runtime for participant and Terms contracts. Preserve any used endpoints and dispatch validation without cherry-picking obsolete auth/notification code over audit fixes. The current safe hold must remain until a fully tested compatible handler exists.
4. Verify isolated Preview Supabase and provider configuration. Source Preview still points to the same Supabase URL as default; actual dashboard overrides have not been supplied. No shared-Production mutation test is acceptable evidence of isolation.
5. Run the expanded Supabase/Docker gate, browser harnesses and GitHub quality/database CI against the exact reviewed commit. Verify production build configuration, required secrets, bindings and owners without printing secret values.
6. Verify confidential backup integrity/recovery and a compatible cutover/rollback. Then deploy the matching migrations, Edge Functions, Worker and Pages/client under the user's release request, using a controlled transition for revoked old-client privileges and notification processors. Keep scheduling/enforcement/retention features off until their own acceptance gates are met.

Preserve financial receipts, recognized entries, consent, Terms evidence, accepted/unknown delivery fences and referenced asset bytes. Prefer compatible builds and forward schema corrections; never restore unsafe grants or overwrite newly accepted transactions with an old backup.
