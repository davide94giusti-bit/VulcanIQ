# SEO / AEO audit — 2026-08-18

## Implemented now

### Canonical host

The previous `.com` canonical references were inconsistent with production. The code now centralizes the production origin as `https://vulcaniq.it` in `src/config/site.js`. Runtime SEO, static HTML, sitemap and robots all use the apex `.it` host.

A Cloudflare-level permanent redirect from `www.vulcaniq.it` to `vulcaniq.it` should still be confirmed in the connected environment.

### Sitemap truthfulness

The old sitemap contained keyword-style URLs that the router did not implement. Those entries were removed. The sitemap now contains only actual public routes and legal pages. `/home` is not indexed separately and is redirected to `/`.

### Soft 404s

The global `/* /index.html 200` fallback was removed. Known SPA routes are rewritten explicitly; unknown paths fall through to `public/404.html`, allowing Cloudflare Pages to return a genuine 404.

### Multilingual URLs

Current strategy is retained deliberately:

- Italian: canonical route without `lang` query.
- English: the same route with `?lang=en`.
- `hreflang=it`, `hreflang=en`, and `x-default` are emitted consistently.

A migration to `/it/...` and `/en/...` is deferred until the frontend modernization to avoid an unnecessary URL migration during stabilization.

### Metadata and structured data

Every real public route has localized title/description metadata. Runtime SEO now maintains canonical, hreflang, robots, Open Graph, Twitter metadata and an absolute social image.

Structured data is centralized and limited to truthful entities currently supported by visible content: LocalBusiness, WebSite, WebPage, BreadcrumbList and TouristTrip for the experiences page. No self-serving `aggregateRating` is emitted.

### Preview/admin indexing

Admin routes receive `X-Robots-Tag: noindex, nofollow` from `_headers`. Runtime SEO sets `noindex,nofollow` on Cloudflare Preview hostnames and application-level not-found states. A Cloudflare account-level Preview noindex/access policy is recommended as defense in depth.

## AEO / generative search approach

Do not treat AEO/GEO as a separate collection of tricks. Current Google guidance says AI Overviews/AI Mode use normal Search fundamentals and do not require special AI files or schema. The platform should optimize for:

- technically crawlable, indexable pages;
- clear entity identity;
- first-hand expert content;
- concise answers to genuine guest questions;
- useful page structure;
- accurate structured data;
- strong page experience;
- trustworthy Business Profile information.

No `llms.txt` has been added as a Google ranking tactic and no “AI schema” has been invented.

## Content opportunities requiring owner factual confirmation

High-value human/AEO content could answer, with owner-approved facts:

- differences between vulcanIQ experiences;
- family/child suitability;
- difficulty and fitness expectations;
- clothing/equipment recommendations;
- weather/volcanic-condition changes;
- private vs fixed excursion differences;
- meeting logistics and duration;
- guide role, qualifications and safety methodology.

Do not generate these pages from assumptions. Add only facts the business can substantiate.

## Prerender / rendering strategy

A client-rendered Vite SPA remains acceptable for this stabilization release. A build-time HTML/prerender layer could improve robustness of route-specific metadata/content for crawlers, but it should be evaluated during frontend modernization rather than introducing a framework migration now.

## Remaining connected validation

- Confirm `www.vulcaniq.it` permanently redirects to `vulcaniq.it`.
- Verify `robots.txt`, `sitemap.xml`, 404 status and canonical tags on Production.
- Submit/refresh the sitemap in Google Search Console.
- Inspect representative Italian/English URLs in Search Console.
- Check Core Web Vitals and Page Indexing.
- Validate structured data with Google/Rich Results tooling where applicable.
