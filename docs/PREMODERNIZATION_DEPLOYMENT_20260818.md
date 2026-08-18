# Deployment guide — pre-modernization consolidation

## Critical order

The new Cloudflare analytics ingestion calls `public.upsert_analytics_session`. Therefore apply the database migration BEFORE deploying the new frontend/Pages Functions.

1. Start from the exact current production `main` commit. Do not reuse an older analytics baseline.
2. Apply the implementation patch on a feature branch.
3. Generate and commit `package-lock.json` locally (`npm install`) now that `.npmrc` enables lockfiles.
4. Run local gates:

```powershell
git diff --check
npm run test:security
npm run test:analytics
npm run test:seo
npm run test:reviews
npm run build
```

5. Apply `supabase/migrations/20260818150000_reviews_google_session_hardening.sql` through Supabase SQL Editor or the project's normal migration pipeline.
6. Run `docs/PREMODERNIZATION_VALIDATION_20260818.sql` read-only checks.
7. Push the feature branch and wait for Cloudflare Preview.
8. Validate Preview reviews UX, 404 behavior, SEO head values, admin analytics labels and new session pageview diagnostics.
9. Google provider integration may remain `Awaiting Google authorization` and must not block release.
10. If Google owner setup is complete, set Edge Function secrets and deploy:

```powershell
npx supabase functions deploy google-reviews-sync --no-verify-jwt --project-ref qlfnvfxkjvlzllwrszgz --use-api
```

11. Only after provider secrets are ready, configure the cron with `supabase/setup/20260818_google_reviews_sync_cron.sql`.
12. Verify `www` -> apex permanent redirect in Cloudflare and verify Preview noindex/access policy.
13. Merge only after Preview acceptance and required CI checks are green.

## Preview acceptance

- Review cards show source/name/date/stars and no body.
- Review detail is full-screen on mobile and accessible by keyboard/Escape.
- Review submission with booking code still works.
- Manual Google review fallback still works when provider is not connected.
- `/random-garbage-url` returns a 404 rather than Home.
- `/home` redirects to `/`.
- sitemap contains only supported routes on `vulcaniq.it`.
- Analytics overview says historical business records; canonical funnels say compatible tracked requests.
- New session page views do not persist as zero due to out-of-order packets.
- No new lifecycle rows enter `analytics_events`.
