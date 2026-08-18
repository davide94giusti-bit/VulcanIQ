# Test report — pre-modernization consolidation

## Packaging-environment results

- Security regression: **62 passed, 0 failed**
- Analytics regression: **40 passed, 0 failed**
- SEO regression: **12 passed, 0 failed**
- Reviews/provider regression: **15 passed, 0 failed**
- `npm run build`: **not executed successfully in packaging sandbox** because the supplied archive contains no `node_modules` and registry access was unavailable. This is a connected/local release gate, not a claimed pass.
- `package-lock.json`: not generated in sandbox for the same registry-access reason. `.npmrc` now enables lockfile generation; run `npm install` locally and commit the generated lockfile before merging.

## Required operator gates

```powershell
git diff --check
npm install
npm run test:security
npm run test:analytics
npm run test:seo
npm run test:reviews
npm run build
```

After `npm install`, confirm `package-lock.json` exists and stage it with the release.

## Connected validation required

- Supabase migration applies cleanly.
- Cloudflare Preview builds.
- Known routes work and unknown route returns HTTP 404.
- review compact/detail UX on desktop/iPhone/Android.
- booking-code review submission still works.
- analytics session `pageview_count` remains monotonic.
- Google Business Profile sync after owner OAuth/API setup, or explicit `not_configured` state.
- Search Console/canonical/sitemap validation after production.
- CSP Report-Only produces no unexpected blocking-risk violations before enforcement.
