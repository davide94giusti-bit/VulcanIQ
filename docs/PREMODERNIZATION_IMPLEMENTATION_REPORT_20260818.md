# Pre-modernization implementation report — 2026-08-18

## Baseline

Implementation was produced from the supplied latest-production source ZIP. The archive contains no `.git` metadata, so the exact production commit hash cannot be cryptographically verified from the archive itself. Before applying the patch, the operator must confirm local `main` equals the current production commit.

## Implemented

- Extracted public Reviews domain from `src/main.jsx`.
- Compact accessible review cards; full-screen detail dialog; preserved separate submission modal.
- Privacy-safe review interaction analytics.
- Official Google Business Profile provider architecture with server OAuth, temporary cache, public/admin RPCs, admin sync status and daily cron setup.
- Canonical production hostname centralized as `https://vulcaniq.it`.
- Truthful sitemap, canonical/hreflang/social metadata, explicit known SPA route rewrites and real static 404 fallback.
- SEO/AEO guidance and Search Console validation docs.
- Analytics session write replaced with atomic monotonic service-role RPC to fix out-of-order pageview_count regression.
- Analytics labels distinguish all historical business records from current-contract compatible tracked requests.
- Report-Only CSP and additional browser security headers.
- Public error boundary and reusable body-scroll hook.
- Repository hygiene: removed unused root duplicate `main.jsx`/`styles.css`, obsolete patch implementation directory and obsolete patch helper after confirming no active references.
- New SEO, review/provider, analytics and security regression coverage.
- New quality GitHub Action.
- `.npmrc` changed to permit package-lock generation.
- `src/main.jsx` reduced from 15,313 to 14,927 lines while extracting Reviews, routing, SEO configuration/builders, dialog/scroll hooks and error/not-found boundaries; larger public/admin bundle separation is deliberately deferred rather than risk a big-bang rewrite.

## Deliberately deferred

- Full `/it` and `/en` URL migration.
- Framework migration/prerender system.
- Full PublicApp/AdminApp code split; domain extraction started, but a big-bang admin move would add unnecessary production risk.
- Enforced CSP until Report-Only has been validated.
- Deep-linkable individual review routes.
- Broad major dependency upgrades.

## Connected/owner actions

- Confirm exact production Git baseline before applying.
- Generate/commit `package-lock.json` locally because package registry access was unavailable in the packaging sandbox.
- Apply database migration before deploying new Pages analytics ingestion.
- Complete Google Business Profile API approval/OAuth if not already available.
- Confirm Cloudflare `www` redirect and Preview noindex/access policy.
- Run Search Console validation after production deployment.

## CONFIRMED LOCALLY

- Reviews domain extracted from the monolithic entry file and compact/detail UX implemented.
- Google Reviews provider/cache architecture, database migration, Edge Function and admin status implementation are present in source.
- Canonical `.it` SEO configuration, truthful sitemap, known-route rewrites and static 404 fallback are implemented.
- Analytics session writes use the new monotonic server RPC in source; stale packets cannot lower page-view/duration/last-seen values by design.
- Historical business totals and current-contract compatible funnel labels are explicitly distinguished.
- Security, analytics, SEO and reviews regression suites pass in the packaging environment.
- Patch/application equivalence and relative import resolution are validated during release packaging.

## CONNECTED VALIDATION REQUIRED

- Confirm the exact Git production commit before applying this source-derived patch.
- Run `npm install`, generate/commit the lockfile, then run the complete local quality/build gate on the operator machine.
- Apply the new Supabase migration before deploying the Pages code that calls `upsert_analytics_session`.
- Validate the new analytics session monotonic behaviour against the connected database.
- Validate real Cloudflare HTTP 404 status, canonical host redirects, Preview noindex behaviour and Report-Only CSP telemetry.
- Validate all public/admin regression paths on Cloudflare Preview before production merge.
- Validate Google Business Profile sync only after real Google authorization is configured.
- Validate sitemap, indexing and representative localized URLs in Search Console after production deployment.

## OWNER ACTION REQUIRED

- Complete/confirm Google Business Profile ownership, verification, API approval and OAuth setup where applicable.
- Store Google OAuth/provider credentials only in Supabase server-side secrets and configure the dedicated sync secret/Vault cron values.
- Confirm factual guide credentials, safety methodology and other expert-content claims before publishing AEO/SEO content that depends on them.
- Decide the desired policy for search crawling, AI-search grounding and AI model-training crawlers before crawler-specific robots directives are added.
- Review CSP Report-Only violations before any future enforcement step.

## FUTURE FRONTEND MODERNIZATION

- Complete the PublicApp/AdminApp lazy bundle boundary and continue extracting the remaining domains from `src/main.jsx`.
- Consider a route-based `/it/...` / `/en/...` locale strategy with a full redirect/migration plan.
- Evaluate build-time prerender/static HTML shells for public routes without coupling that decision to a major framework migration.
- Replace visual presentation with the future design system while preserving the domain services, provider adapters, SEO contract, analytics contract and security boundaries established here.
