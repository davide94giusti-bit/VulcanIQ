# Audit remediation — 27 October 2026

## Source identity and safety

The supplied checkout was `feat/google-reviews-integration-20261005` at `d496da2`, with no tracked changes. Fetched integration main was `35de12d`, including `cb58392`. Implementation is isolated on `codex/audit-remediation-20261027`, based on that newer main. The original checkout, outputs/, tmp_artifact/, spreadsheet-reader artifacts and permissions are untouched. No AGENTS.md was found. The attached implementation prompt is the requirements source; its accompanying audit PDF was unavailable.

This is an **uncommitted source snapshot**, not a deployed release or clean-Git claim. The release manifest records base commit, dirty flag, exact source digest and every file hash. No branch was pushed. No remote database, credential, bucket, provider, scheduled sender or repository setting was changed. Tests use newly named disposable local databases, synthetic identities and intercepted providers.

## Evidence map

- [Database/Finance](AUDIT_DATABASE_20261027.md): effective role matrix, locks, historical compatibility, exact SQL tests and migration risks.
- [API/operations](AUDIT_API_OPS_20261027.md): public boundary, email, backups, headers, challenge and gated MFA.
- [Notifications](AUDIT_NOTIFICATIONS_20261027.md): identity, destinations, quotas, leases, consent, retention and environment checks.
- [Frontend/privacy](AUDIT_FRONTEND_20261027.md): implementation files, UX/state/assets/privacy and design-only experiment.
- [Browser evidence](BROWSER_AUDIT_20261027.md): actual tested screens and explicit limitations.
- [Focused correction pass](AUDIT_CORRECTIONS_20261027.md): stale reminders, immutable Finance actions and analytics deletion authorization, with failing reproductions and updated verification.
- [Release runbook](AUDIT_RELEASE_RUNBOOK_20261027.md) and [archive contract](RELEASE_SOURCE_20261027.md).

Each domain ledger supplies root cause, exact implementation/files, tests, migration/config impact, rollback risk and owner dependencies. “Local” below means executable behavior within that stated boundary. Local PASS does not authorize release. DB-04/F1, F7/RT-01 and F8/RT-02 are duplicate descriptions of one fix; API-09/O11 share packaging.

| Finding | Priority | Disposition/evidence | Remaining gate or risk |
| --- | --- | --- | --- |
| API-01 | P1 | Local: immutable device credential/user binding; renewal/concurrent collision tests | Real shared-browser/account switching |
| API-02 | P1 | Local: documented provider policy, key/encryption checks, redirects/deadlines | Real browser/device provider compatibility |
| API-03 | P1 | Local: atomic trusted-edge/device/global limits | Dedicated hash secret, shared-network tuning and platform capacity |
| API-04 | P1 | Local: rejected Google calls perform zero privileged/provider writes | Authorized isolated provider integration |
| API-05 | P1 | Local: workflow inputs serialized as data; hostile-input subprocess test | Isolated GitHub workflow execution |
| API-06 | P1 | Local: email receipts/leases/unknown fences and durable Admin handoff | Provider reconciliation and cross-runtime integration; never blindly replay |
| API-07 | P2 | Local: fail-closed config matrix, widget lifecycle and real forms with provider mocks | Sitekey/hostname/action and actual provider accessibility; enforcement off |
| API-08 | P2 | Local: bounded body/dependencies, safe structured errors, stable retry keys | Whole-invocation platform timing; no raw payload logs |
| API-09 | P2 | Archive allowlist, manifest/CRC/hash/secret tests implemented | Delivered ZIP/unpacked result recorded separately |
| API-10 | P1 | Local: canonical weekly currency totals and complete keyset reads | Large live workload and successive-read snapshot caveat; F3/F4 |
| API-L01 | P1 | Local: verified user/profile, private screen clearing, cross-tab browser logout | Recovery expiry/replay and live refresh/deactivation acceptance |
| API-L02 | P1 | Local: expected-target/outbox activation fails closed | Preview still shares Production Supabase; separate project required |
| DB-01 | P1 | Local role/RLS/ACL matrix; guides/editors denied money/identity operations. Forward migration 160000 removes analytics DELETE from every browser role while preserving reads and trusted maintenance | Live PostgREST/Storage/signed-URL matrix; no cleanup activated |
| DB-02 | P1 | Local immutable recognized ledger, source/currency/refund/receipt invariants; UI actions now distinguish editable drafts from every recognized entry, including unlinked manual transactions | Read-only historical diagnostics and reviewed reconciliation; no new expense-reversal command |
| DB-03 | P1 | Local128-bit server-issued codes, legacy compatibility, Pages-only public mutations | Coordinated minimum-client/grant cutover; no invented legacy sunset |
| DB-04 / F1 | P1 | Local red→green EUR100/40 failure/retry: one payment and EUR60 outstanding | Matching client/RPC release and old-client maintenance window |
| DB-05 | P2 | Local transactional audits, narrow audit-export RPC, actor/replay/rollback tests | Retention policy; no direct client audit spoofing |
| DB-06 | P2 | Local serialized last-owner invariant and target-specific UI confirmation | Owner recovery/enrollment; no frontend backdoor |
| DB-07 | P2 | Local all16 state pairs; paid/cancelled terminal | Paid reimbursement requires explicit separate money policy |
| DB-R1 | P1 | Local unknown private Storage denied, public assets preserved | Actual bucket inventory and signed URLs |
| DB-R2 | P2 | Local payment-or-owner-waiver issuance, no invented cash revenue | Complimentary policy/operator acceptance; history preserved |
| DB-R3 | P2 | Local fresh/prior-schema replay and read-only catalog diagnostics; API-L02 | Remote catalog/migration/environment provenance unverified |
| F2 | P1 | Local stable manual Finance intent/receipt and synchronous in-flight guard | Live operator walkthrough; page-refresh intent recovery not promised |
| F3 | P1 | Local scoped SQL counts/totals and complete keyset details;251/501/1001+ | Live latency/workload and scoped export limits |
| F4 | P2 | Local failed subloads preserve known data and show unavailable, not zero | Isolated live permissions/outage acceptance |
| F5 | P2 | Local latest-query fence/debounce, original version writes, reversed-response browser test | SQL two-editor CAS passed; full browser two-editor walkthrough pending |
| F6 | P2 | Local auth clearing and gated AAL2/recent-AMR backup boundary | Owner MFA scope/enrollment/recovery; gate remains off |
| F7 / RT-01 | P2 | Local focus/Tab/Escape/inert/restore hook and nested real-browser tests | Physical keyboard/screen reader/iOS acceptance |
| F8 / RT-02 | P2 | Local safe latest draft, expiry/submission tombstone, Learning close/reopen | Installed browser storage lifecycle |
| F9 | P2 | Local selective translation port, bounded/cancelled native resources, stale/unchanged rejection | Real native model/device/language acceptance |
| F10 | P2 | Local empty/partial/unavailable distinction and narrow schema fallback | Real reviews/availability outages |
| F11 | P1 | Local transactional acceptance/block/expected/unpaid-commission coupling | Historical orphan diagnostics; cancellation is not cash refund |
| F12 | P1 | Local upload-both→versioned DB references; old bytes retained on failure | Authorized orphan cleanup and live Storage rollback drill |
| N1 | P1 | Local delayed hydration proves no default-preferences PATCH on mount | Real locale/permission lifecycle |
| N2 | P1 | Local queued reminder after opt-out or changed current booking/activity eligibility/schedule produces zero inbox and push even with pending outbox updates; unchanged eligible new and legacy jobs remain supported | Real cross-service/provider acceptance; distributed reads are not a cross-database transaction |
| N3 | P1 | Local complete resumable fanout, including sole eligible251st recipient | Runtime throughput and continuation monitoring |
| N4 | P1 | Local actual fetch/D1 budgets and atomic daily reservations | Cloudflare CPU/query-plan/quota measurement before activation |
| N5 | P1 | Local stage-aware leases/fences, stale runner rejection and unknown quarantine | Provider evidence to reconcile uncertain acceptance |
| N6 | P1 | Backend fenced Supabase→D1 drain implemented and local contracts tested | End-to-end isolated outage test; consumer disabled |
| N7 | P2 | Local owned forget-device/cascade and bounded dry-run retention | Policy approval; no live destructive cleanup |
| N8 | P2 | Key/permission/endpoint/resume/account checks implemented | Real iOS/Android/Edge, SW/key rotation and closed-app delivery |
| N9 | P2 | Local shared presentation limits, safe internal route, versioned draft edit | Real provider rendering and bilingual operator review |
| O01 | P1 | Local three partial backups cannot prune last complete; explicit completeness | Provider expiry/quota and actual complete-backup age |
| O02 | P1 | Local checksum/Storage script and synthetic Auth UUID/FK restore | Full owner-login/Auth/D1/Storage drill and measured RTO outstanding |
| O03 | P1 | Consistent compatible lockfile upgrades; npm audit0 vulnerabilities | Live auth/browser rollout and future advisory monitoring |
| O04 | P1 | Domain/behavior/browser/SQL/concurrency/archive/syntax CI gates implemented | GitHub jobs not executed here; physical/live gates explicit |
| O05 | P2 | Local default-off consent, DNT/exclusion, identifier clearing/linkage stripping | Legal retention/subject-rights policy; dashboard beacon check |
| O06 | P2 | Local trusted events rejected, metadata/ID/time/canonical-route validation | Browser IDs remain untrusted pseudonymous correlation |
| O07 | P2 | Local versioned saved-row Fast Request aggregation, WhatsApp intent only | No uplift claim; legacy mixed data retained and labelled |
| O08 | P2 | Local sampled safe diagnostics and owner-only DB-read health | End-to-end external synthetic monitor requires authorization |
| O09 | P2 | Local real lazy Admin boundary, production network and byte budgets | >500kB warning retained; physical slow/PWA timing pending |
| O10 | P2 | Local>128MiB streaming/backpressure, abort/deadline/truncation tests | Deployed concurrent memory/throughput |
| O11 | P2 | Source-only packaging, explicit fixtures, history/current/archive scan; API-09 | Not exhaustive historical credential forensics |
| O12 | P2 | Local static/Function/error header matrix and report-only CSP | Deployed capture/provider compatibility before enforcement |
| R08 | P2 | Same original updated_at/CAS implementation as F5 | Not universal optimistic locking of all historic Admin actions |
| RT-03 | P3 | Local Italian360px heading/44px close target and200% CSS zoom | Native text scaling/screen-reader/device acceptance |

## Already resolved and deliberately scoped non-changes

`cb58392` is on the newer baseline: the old homepage Hero fallback is gone. Homepage tests preserve the neutral shell and deliberate public/Admin SW cache boundaries. Installed-device cold starts, old-HTML/new-chunk recovery and real SW upgrades are not inferred from source checks.

Translation `a9bbdd6`/`576f17f` and privacy `42c3138` were inspected and selectively adapted. Participant/Terms `4692900`/`6cafedd`/`314b0e1` and redesign `9f17d57` were not merged wholesale or activated. Routes and deterministic read-only Neo are retained.

Duplicate-index/legacy-referral removal is intentionally not performed: local source/catalogs do not establish live external consumers or production query plans. The read-only database diagnostics cover candidates and constraint dependencies. Obtain current plans/data/integration evidence before destructive cleanup. No financial history, tables or indexes are deleted speculatively. Proven-dead fabricated credential helpers were removed. Fewer Fast Request steps remain a design-only measured experiment, not a promised conversion fix.

## Verification and delivery identity

The final completion report is the authority for exact final suite totals, local SQL/browser runs, build bytes, archive SHA, clean-unpack verification and remaining warnings. Domain ledgers distinguish executed checks from integration prerequisites. Node22.23.2/npm10.9.8 were used. Current lockfile audit reports zero vulnerabilities at every severity; Vite still warns about chunks exceeding500kB and the public graph has an explicit950,000-byte/270,000-gzip budget.

A history scan checked1,427 text blobs across six relevant commits with no credential-body findings. A harmless PEM parser header initially triggered a conservative rule; it now requires key-body material and has a regression proving real or escaped body detection. No matched values were printed. This is scoped scanning, not a claim that no historical credential could ever exist.

No deployment, production/remote migration, real notification, Cron activation, commit or push was performed. Original artifacts are untouched. The source ZIP and its manifest contain no installed dependencies or local runtime state. Review the matching schema/API/client cutover and external gates before any release.
