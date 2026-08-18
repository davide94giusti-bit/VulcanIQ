# Platform consolidation audit — 2026-08-18

## Executive assessment

The platform has moved beyond a simple landing page: it now contains public booking/Gift Card flows, admin operations, analytics, finance, reviews, availability, partner/referral logic, backup/restore automation, notifications and scheduled reporting. The database/security foundation is comparatively mature; the main remaining engineering debt is frontend concentration and deployment/observability ergonomics.

## Findings implemented in this release

### Critical/high

- Corrected obsolete `.com` canonical/robots/sitemap references to the production `.it` origin.
- Removed phantom sitemap URLs that did not correspond to implemented routes.
- Removed global SPA soft-404 fallback and added explicit known route rewrites + genuine static 404 fallback.
- Replaced non-monotonic analytics session REST upserts with a protected atomic database RPC.
- Kept Google OAuth/provider credentials server-only and provider content in a separate expiring cache.
- Added direct review/provider regression coverage and CI quality gate.

### Medium

- Extracted Reviews presentation/model from `src/main.jsx` and added reusable dialog/body-lock hooks.
- Added public rendering error boundary.
- Added explicit analytics labels separating historical business totals from compatible tracked funnel records.
- Added Report-Only CSP plus nosniff/referrer/frame/permissions security headers.
- Removed confirmed-unused root duplicate application files and obsolete embedded patch implementation directory.

## Findings deliberately deferred

### Public/admin import graph

The public bundle still imports much of the monolithic admin application. A complete split is high value but should be performed as a dedicated refactor with browser E2E coverage rather than by moving thousands of lines inside this consolidation release.

### CSP enforcement

Current code uses inline styles and multiple external origins. CSP is staged as Report-Only. Enforce only after Preview/Production violation inspection.

### Lockfile

The repository explicitly disabled lockfile generation. This release flips `.npmrc` to `package-lock=true`; the packaging environment could not reach npm registry to generate a trustworthy lockfile. The operator must run `npm install`, verify the generated `package-lock.json`, commit it, and then CI can deterministically use `npm ci`.

### Dependency upgrades

No broad dependency upgrades were included. Run `npm outdated`/`npm audit` in a connected environment and split findings into security-critical, safe patch/minor and major migration work.

### Browser E2E

Static/regression suites are strong, but end-to-end coverage for booking, Gift Card, review publication, admin login, analytics session behavior and Google provider sync should be added with a small Playwright suite after the next import-graph extraction.

## Production-ready sign-off prerequisites

- all local gates green on the operator machine;
- new migration applied before Pages deployment;
- Cloudflare Preview passes reviews/SEO/404/analytics acceptance;
- quality workflow green;
- no secrets in diff;
- Google provider either validated or explicitly left `not_configured`;
- `www` redirect confirmed;
- Search Console checks completed after production;
- restore drill remains on the operations roadmap.
