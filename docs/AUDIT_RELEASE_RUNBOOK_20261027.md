# Audit release and recovery runbook — 27 October 2026

**3 November reconciliation:** read [RELEASE_RECONCILIATION_20261103.md](RELEASE_RECONCILIATION_20261103.md) first. It updates the migration inventory, actual Production baseline, ownership compatibility and unsupported participant-reminder hold. October test totals remain historical; no live release is claimed.

This is a reproduction and future release plan, not deployment authorization. No remote migration, deployment, provider send, credential change, push or scheduler activation was performed by writing this runbook. Use the final completion report for exact results from the final source snapshot; do not treat commands below as already executed.

The implementation worktree is `C:\Users\delvitech\.codex\worktrees\audit-remediation-20261027\VulcanIQ`, branch `codex/audit-remediation-20261027`, based on `35de12dc8dd0ba360a888417ca7d076f8e62d71b`. A clean source ZIP can use another verified extraction path. Original `outputs/` and `tmp_artifact/` directories are outside this task: do not inspect recursively, alter permissions, delete, move or package them. Do not use `git clean`.

## Evidence and related procedures

- [Main remediation ledger](AUDIT_REMEDIATION_20261027.md): finding coverage and final disposition.
- [Database and finance](AUDIT_DATABASE_20261027.md): role matrix, lock/receipt contracts, local SQL and concurrency evidence.
- [API and operations](AUDIT_API_OPS_20261027.md): public boundaries, email fencing, backups, challenge and configuration gates.
- [Notifications](AUDIT_NOTIFICATIONS_20261027.md): delivery budgets, ownership, leases, D1 prerequisite and activation limits.
- [Frontend integration](AUDIT_FRONTEND_20261027.md) and [browser gate](BROWSER_AUDIT_20261027.md): tested UI behavior versus real device/provider acceptance.
- [Source ZIP contract](RELEASE_SOURCE_20261027.md) and [backup/restore procedure](BACKUP_RESTORE.md): distinct source integrity and confidential data-recovery artifacts.

## 1. Local source, quality and build reproduction

Use Node 22.12 or later within major 22, npm, PowerShell and the committed `package-lock.json`. Do not repair dependencies by deleting lockfiles or adding application packages. In a repository checkout, inspect changes before running commands; stop for unexpected tracked or untracked source/configuration files. A source ZIP intentionally has no `.git`, so use its verified release manifest instead of Git commands.

```powershell
Set-Location 'C:\Users\delvitech\.codex\worktrees\audit-remediation-20261027\VulcanIQ'
git branch --show-current
git rev-parse HEAD
git status --short --untracked-files=normal
git diff --check
node --version
npm.cmd --version
Test-Path -LiteralPath '.\package-lock.json'

npm.cmd ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Clean install failed' }
npm.cmd run test:quality
if ($LASTEXITCODE -ne 0) { throw 'Quality gate failed' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
npm.cmd audit --audit-level=moderate
if ($LASTEXITCODE -ne 0) { throw 'Dependency advisory gate failed' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace gate failed' }
```

`test:quality` includes security, analytics, SEO, reviews, media, finance, homepage, notifications/Web Push, backup, Neo, behavior/syntax and production build. `test:behavior` includes frontend, keyset, actual notification/API behavior and release packaging checks. `build` additionally runs the manifest-based lazy Admin boundary and eager-JS budget checks. The explicit second build is intentional release verification. It is not a whole-program TypeScript check or browser test. Record individual pass/fail totals and final bundle byte/gzip output; an advisory result is time-specific.

## 2. Isolated browser reproduction on Windows

Use three fresh PowerShell consoles, all located in the verified source directory. Only synthetic public settings are used. Do not create `.env` files or copy real credentials. The browser scripts refuse non-loopback base URLs and intercept backend/provider requests. Do not use a human browser to complete the synthetic flows against a real backend. These scripts do not start a Pages/Worker backend or prove live RLS.

Console A — development component/form fixture:

```powershell
$env:VITE_SUPABASE_URL = 'https://browser-fixture.invalid'
$env:VITE_SUPABASE_ANON_KEY = 'synthetic-browser-public-key'
$env:VITE_TURNSTILE_SITE_KEY = 'synthetic-browser-site-key'
.\node_modules\.bin\vite.cmd --host 127.0.0.1 --port 5183 --strictPort
```

Console B — a separate synthetic production bundle, never the deployable `dist`:

```powershell
$env:VITE_SUPABASE_URL = 'https://browser-fixture.invalid'
$env:VITE_SUPABASE_ANON_KEY = 'synthetic-browser-public-key'
$env:VITE_TURNSTILE_SITE_KEY = 'synthetic-browser-site-key'
$auditBrowserOutput = Join-Path ([IO.Path]::GetTempPath()) ('VulcanIQ-browser-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $auditBrowserOutput) { throw 'Output must be new' }
.\node_modules\.bin\vite.cmd build --outDir $auditBrowserOutput
if ($LASTEXITCODE -ne 0) { throw 'Synthetic browser build failed' }
.\node_modules\.bin\vite.cmd preview --host 127.0.0.1 --port 5184 --strictPort --outDir $auditBrowserOutput
```

Console C — actual browser harnesses. The following existing module path was verified on this workstation; another machine must select its own approved installed module. No Playwright application dependency is required.

```powershell
$env:AUDIT_PLAYWRIGHT_MODULE = 'C:\Users\delvitech\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright\index.mjs'
if (-not (Test-Path -LiteralPath $env:AUDIT_PLAYWRIGHT_MODULE)) { throw 'Approved Playwright runtime is missing' }
$env:AUDIT_BROWSER_CHANNEL = 'chrome'
$env:AUDIT_BROWSER_BASE = 'http://127.0.0.1:5183'
$env:AUDIT_RELEASE_BASE = 'http://127.0.0.1:5184'
Remove-Item Env:AUDIT_BROWSER_TEST -ErrorAction SilentlyContinue
node tools/browser-audit-regression.mjs
if ($LASTEXITCODE -ne 0) { throw 'Component browser gate failed' }
node tools/browser-release-regression.mjs
if ($LASTEXITCODE -ne 0) { throw 'Production browser gate failed' }
```

Use Ctrl+C in consoles A/B to stop only those foreground servers; close the dedicated consoles to discard their synthetic environment settings. Retain the named temporary output if evidence is needed. No cleanup of unrelated directories is implied.

The first harness exercises real React components, synthetic Turnstile callbacks, same-intent retries, consent, preferences, modal focus, cross-tab sign-out and responsive layout. The second exercises the production lazy boundary, actual login form and current Admin navigation deep links with synthetic Auth. Neither proves a real challenge solution, real email/push delivery, true platform text scaling, every authenticated mutation, native translation model download or installed iOS behavior. A filtered `AUDIT_BROWSER_TEST` run is not the full gate.

`.github/workflows/quality.yml` provisions pinned Playwright 1.62.1 plus Chromium in runner-only temporary caches and runs both harnesses. A local Chrome pass is not a remote GitHub CI pass.

## 3. Disposable PostgreSQL gate

Prerequisites: local Docker Desktop Linux engine, a verified local Docker socket/context, an independently installed Supabase CLI on PATH, Node 22 and PowerShell. Never aim these tests at a linked project or shared developer/Production database. Do not run a broad reset in the original repository.

```powershell
docker context inspect --format '{{.Endpoints.docker.Host}}'
docker ps --format '{{.Names}}'
Get-Command supabase -ErrorAction Stop
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\audit-database-local.ps1
if ($LASTEXITCODE -ne 0) { throw 'Disposable database gate failed' }
```

The runner creates a new temporary project named `VulcanIQ-audit-ci` using only migration files and generated local configuration. It copies no `.env`, linkage metadata, Functions, Vault data or remote secrets. It refuses an existing `supabase_db_VulcanIQ-audit-ci` container rather than overwriting it. Its schema drop/reset is confined to this newly created test container; never extract that command and run it on an existing database. Inspect any leftover dedicated test stack before separately deciding to stop it. No automatic permission repair or broad deletion is permitted.

The reconciled runner performs the full 45-migration replay, rollback-only SQL behavior assertions, multi-session concurrency and synthetic Auth identity restore; then independently replays the 38-migration baseline recorded in the Production ledger, seeds financial and participant/Terms upgrade fixtures, applies the seven pending files (Google Reviews plus six audit migrations), verifies immutable evidence and recovered function ACLs, and repeats behavior/concurrency tests. Synthetic restore preserves UUID/foreign-key identity and ledger values; it is not proof of real passwords, sessions, OAuth providers or complete disaster recovery. Temporary project files and the synthetic restore target are retained; ordinary test fixtures are scoped to the harness.

`.github/workflows/audit-database.yml` invokes this runner with a separate CI stack. The runner was parsed locally; the equivalent isolated Docker fresh/upgrade/restore tests were executed and are reported in the DB ledger. Do not report the wrapper or remote CI as executed until their own runs succeed. For local troubleshooting, `AUDIT_LOCAL_CONTAINER`, `AUDIT_LOCAL_DB` and `AUDIT_RESTORE_DB` are test-only selectors with explicit script allowlists, not arbitrary connection inputs.

## 4. Reviewed migration order and compatibility boundary

These are new forward files, in chronological order. Applied historical migrations are not edited.

| Order | File | Compatibility effect |
| --- | --- | --- |
| 1 | `20261027100000_trusted_business_commands.sql` | Tightens role/RLS and public mutation grants; transactional payments, receipts, audit, profile/owner protection, code issuance and aggregate foundation. Requires the matching Pages/client contract. |
| 2 | `20261027120000_customer_outbox_leases.sql` | Service-only claim/finalize and fenced customer outbox leases. Does not activate consumption. |
| 3 | `20261027130000_email_delivery_fencing.sql` | Durable email delivery states and Admin handoff outbox. Historical delivery logs seed accepted/unknown dedupe fences, not new sends or Finance rows. |
| 4 | `20261027140000_authoritative_fast_request_outcomes.sql` | Current persisted Fast Request reporting separated from legacy mixed coverage; no historical outcome relabeling. |
| 5 | `20261027150000_scoped_admin_aggregates.sql` | Authorized booking/date counts and currency-separated Finance summary matching current filters. |
| 6 | `20261027160000_analytics_delete_authorization.sql` | Removes direct browser DELETE on analytics events/sessions and obsolete delete policies. Preserves reporting reads and existing service-role maintenance; performs no deletion and activates no cleanup. |

The reconciled D1 source contains the original `0001`–`0005`, recovered historical `0006_participant_ownership_locator.sql` and `0007_participant_terms_reminders.sql`, plus the never-applied audit migration renamed to `0008_delivery_leases_and_retention.sql`. The recovered files are byte-identical to Git commit `314b0e1`, whose ancestry includes the observed hardening commits. Operator screenshots record Production at `0001`–`0005` and Preview at `0001`–`0007`. Do not rename or reapply the historical migrations; compare live columns/indexes/triggers before authorizing any pending application. Ledger names alone do not establish catalog parity.

The grant transition intentionally blocks old browser payment/public mutation paths. There is no safe rollback strategy that simply re-grants those privileges. Plan a controlled compatible API/client/SQL cutover, reload/minimum-client handling and an approved maintenance window. Keep old and new active notification senders from processing the same queue during the transition.

## 5. Configuration inventory — names only

Resolve values through the approved environment's secret manager. Do not paste, print, export into reports or commit secret values. Never place a backend key, private key, database URL, webhook secret or OAuth refresh token in a `VITE_` variable. Do not rotate/revoke credentials as part of this plan without separate authorization.

| Scope | Existing/new names and contract |
| --- | --- |
| Public build configuration | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY`. These are public, environment-specific settings, not backend secrets. |
| Pages/Worker backend | `SUPABASE_URL`, `SUPABASE_ANON_KEY`; prefer `SUPABASE_SECRET_KEY`, retain only the existing compatibility fallback `SUPABASE_SERVICE_ROLE_KEY`. Opaque secret keys are apikey-only; a caller user JWT remains the user Authorization context. |
| Edge backend key selection | Explicit `SUPABASE_SECRET_KEY` wins; otherwise select the configured `SUPABASE_SECRET_KEY_NAME` from `SUPABASE_SECRET_KEYS`, with documented fallback name `default` only when no name is configured. Missing/malformed selected keys fail closed; no arbitrary first-key selection. Existing legacy fallback is not a reason to ignore an invalid configured map. |
| Public abuse/challenge | Independent server-only `SUBMISSION_HASH_SALT` (at least 32 characters); `PUBLIC_ALLOWED_ORIGINS`; optional `TURNSTILE_SECRET_KEY`, `TURNSTILE_ENFORCE`, `TURNSTILE_EXPECTED_ACTION`. Keep enforcement off until site key, expected action, hostname and accessible retry flow pass isolated verification. Current action is `public_submission`. |
| Notification identity/delivery | New server-only `NOTIFICATION_RATE_HASH_SECRET`; existing `VAPID_PRIVATE_KEY`, public `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `NOTIFICATION_INGEST_URL`, `NOTIFICATION_INGEST_SECRET`. Separate Preview identities/provider configuration from Production. |
| Customer outbox isolation | `NOTIFICATION_OUTBOX_ENABLED`, `NOTIFICATION_ENVIRONMENT`, `NOTIFICATION_EXPECTED_SUPABASE_URL`, `NOTIFICATION_PRODUCTION_SUPABASE_URL`. Leave outbox disabled. Preview activation requires a separately verified Supabase target different from Production and matching the expected URL. |
| Request email and recap | `RESEND_API_KEY`, `REQUEST_NOTIFICATION_WEBHOOK_SECRET`, `REQUEST_NOTIFICATION_ALLOWED_ORIGINS`, `REQUEST_NOTIFICATION_RECIPIENTS`, `REQUEST_NOTIFICATION_FROM_EMAIL`, `WEEKLY_RECAP_CRON_SECRET`, `WEEKLY_RECAP_FROM_EMAIL`. Recipients are sensitive configuration, not documentation examples to populate with real addresses. |
| Google synchronization | `GOOGLE_REVIEWS_SYNC_SECRET`, `GOOGLE_BUSINESS_CLIENT_SECRET`, `GOOGLE_BUSINESS_REFRESH_TOKEN`; environment identifiers `GOOGLE_BUSINESS_CLIENT_ID`, `GOOGLE_BUSINESS_ACCOUNT_ID`, `GOOGLE_BUSINESS_LOCATION_ID`, optional `GOOGLE_BUSINESS_PROFILE_URL`. Unauthorized/throttled requests must leave sync/cache state untouched. |
| Backup Actions | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`, `SUPABASE_URL`, preferred `SUPABASE_SECRET_KEY` or existing fallback `SUPABASE_SERVICE_ROLE_KEY`. Backup artifacts remain confidential. |
| Backup Pages integration | `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BACKUP_WORKFLOW`/`GITHUB_BACKUP_WORKFLOW_ID`, `GITHUB_BACKUP_REF`; GitHub App credentials `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY`, or existing legacy `GITHUB_BACKUP_TOKEN`. Preserve least privilege. |
| Gated hardening | `ADMIN_STEP_UP_ENFORCE`, `CSP_ENFORCE`: off until approved MFA recovery/enrollment and report-only CSP compatibility checks. The MFA gate is scoped to backup actions, not a claim of universal DB MFA. |

## 6. Release stops, owner gates and future commands

**Current isolation stop:** default and Preview Worker TOML use different D1 IDs but the same Supabase URL. Separate D1 is not backend isolation. Preview must not mutate that shared Production Supabase database. No Preview acceptance that creates bookings, money, ownership records, emails or jobs is authorized until a separate backend and provider-mock/sink configuration are explicitly approved and verified.

| Existing target | Worker / D1 name | D1 ID | Notification Cron |
| --- | --- | --- | --- |
| Default / Production | `vulcaniq-notifications` | `1edcda8a-3faf-4c6c-8c89-a46d424cd844` | Disabled |
| Preview | `vulcaniq-notifications-preview` | `8e220c75-2060-4cb9-954e-073a422d5f34` | Disabled |

Both use binding `NOTIFICATIONS_DB`. Keep the default binding free of `preview_database_id`; never select a default target for an intended Preview operation.

Before any remote mutation, obtain explicit target-specific approval and record the reviewed source SHA, project/account identifiers, schema ledgers, isolated Preview URL, backup/restore evidence and rollback owner. Read-only remote checks also need their intended target established. Do not use `--linked`, migration repair, implicit defaults or Production credentials for fixture tests.

After that approval only, an installed/approved Wrangler can validate the Preview package without deployment:

```powershell
# FUTURE APPROVAL-GATED CHECK: not executed by this runbook.
npx.cmd --no-install wrangler versions upload `
  --config .\workers\notifications\wrangler.toml `
  --env preview `
  --dry-run
```

Review the output for Worker `vulcaniq-notifications-preview`, Preview D1 `8e220c75-2060-4cb9-954e-073a422d5f34`, no missing-environment warning and disabled Cron. This does not prove the Supabase URL is isolated or secrets are correct. Do not remove `--dry-run`. Stop if the approved CLI is unavailable rather than silently downloading another version.

The following remote D1 command is a future template, **not permission to run it**. It is eligible only after the recovered migration/catalog parity, target identity, schema diff and backup gates pass, with explicit approval to mutate that isolated Preview D1:

```powershell
# DO NOT RUN during the current task.
npx.cmd --no-install wrangler d1 migrations apply vulcaniq-notifications-preview `
  --config .\workers\notifications\wrangler.toml `
  --env preview `
  --remote
```

No generic remote Supabase push or deployment command is supplied: the current shared-backend situation must first be resolved, and the authorized operator must approve an exact six-file application plan against the separately identified project. A Pages Preview, Worker upload/deploy, Edge deployment, database change, real provider test and Production release are distinct approvals, not implied by each other.

Required acceptance before Production consideration:

1. All final source/quality/build, unpacked-source, DB CI and browser gates pass against the same snapshot. Inspect the final diff and manifest; no unexpected files or secrets.
2. Isolated deployed role matrix: owner/manager/guide/finance/editor/inactive/ordinary/anon, direct PostgREST negative grants, caller-bearer audit writes, Storage public/private and signed-URL boundaries. Confirm last-owner recovery and no broad service-key bypass.
3. Real challenge hostname/action and single-use retry; missing/misconfigured challenge fails closed when enforced. Verify desktop/mobile keyboard and accessible error recovery before enabling enforcement.
4. Payment/refund/idempotency response loss, cancellation and Gift issuance/waiver/redeem compatibility; no duplicated cash or retrospective rewrite. Current persisted outcomes and currencies remain authoritative.
5. Isolated Supabase→D1 outbox/handoff failure and retry, accepted/unknown provider outcomes, shared-browser identity switch, opt-out after scheduling, permission/VAPID rotation and actual installed iOS/Android/Edge. Provider sinks/test recipients must be explicitly approved; no historical queue replay.
6. Measure Cloudflare CPU, D1 statements, fetch counts, backlog age and continuation throughput under realistic fanout. Local limits are not a free-plan capacity certification. Analytics health proves a DB read, not end-to-end ingestion.
7. Backup complete/partial/expiry behavior, large streamed download and a full separate recovery drill covering Auth identity/login, public data, Storage bytes/policies, D1 and protected secrets. Measure RTO/RPO. Synthetic SQL identity restore and mocked Storage uploads do not establish real password/session recovery or full-system recovery.
8. Owner decisions on retention/erasure, audit evidence, legacy code expiry, paid commission repayment, MFA enrollment/recovery and dashboard-injected analytics. Report-only CSP compatibility and real iPhone PWA/update/cached-page rollback remain explicit external gates.

## 7. Scheduler contract

Keep default and Preview notification `[triggers]` declarations at `crons = []`. Keep customer outbox activation off and do not add or enable notification/recap/cleanup schedules. Existing backup workflow scheduling is unchanged; this runbook does not invoke or alter it.

Event-driven Admin ingestion can begin bounded immediate processing; it does not mean unlimited fanout completes. Scheduled campaigns/jobs and additional fanout need an authorized continuation runner. With Cron OFF they can remain queued. Personalized customer journeys are not made live by schema installation. The protected `drain-admin-notifications` function is an operator-triggered capability, not authorization to invoke it against real queues. Critical-priority Quiet Hours bypass follows existing policy; no per-rule Quiet Hours editor is introduced.

## 8. Rollback, recovery and evidence retention

| Area | Safe recovery direction | Never do |
| --- | --- | --- |
| Money and authorization | Pause affected commands if necessary; preserve operation receipts, recognized entries, refunds, waivers and immutable audit evidence. Use a reviewed forward correction and compatible client/API version. | Delete financial history, convert cancellation into refund, drop receipt tables, re-grant unsafe recognized-row/public RPC writes, or restore an old snapshot over subsequently accepted business transactions. |
| Assets | Preserve old objects and new bytes when DB acknowledgement is ambiguous. Repoint only after reviewing references/version conflicts; keep the compatible build. | Delete potentially referenced files or bulk-clean possible orphans without a reviewed reference inventory. |
| PWA/frontend | Keep a known-compatible previous release, lazy chunks and version/reload guidance. Verify installed clients and old-HTML/new-chunk combinations; roll rendering back independently of business records. | Delete Auth/consent/ownership data or claim Vite/browser mocks prove iPhone update recovery. |
| Email/push/jobs | Stop new processing before version rollback. Preserve leases, accepted/unknown fences, tombstones, consent cancellations and stable handoff keys; reconcile unknown provider outcomes with evidence. Keep matching Pages/Worker/schema versions. | Blindly replay unknown sends, expire dedupe to retry, mix old and new active senders, or re-enable consent cancelled by the user. |
| Backup/disaster recovery | Verify checksums and completeness first; restore only to an approved separate target, preserving Auth UUID/FK identity before dependent business data and validating Storage/D1/secrets independently. Follow the linked recovery procedure. | Treat `database_complete`/`storage_complete` as `system_complete`, relabel historical actors, trust partial exports as complete, or overwrite the last recoverable backup. |

Keep the reviewed source ZIP and its byte checksum, release manifest, exact suite results, migration inventories and known-compatible prior source alongside the protected recovery records. Do not put secret values, personal fixture substitutions, provider bodies or confidential backup contents into the source ZIP or public reports. Record remaining external gates as pending, not inferred PASS.
