# Performance / media audit — 2026-08-18

## Current observations

The latest known production analytics-release build was roughly 1.03 MB of minified main JavaScript before gzip. This consolidation extracts Reviews, SEO, route helpers, dialog hooks and error handling, but the majority of admin code is still imported through the large `src/main.jsx` graph.

The public asset directory is approximately 12 MB. Largest checked assets include:

| Asset | Approx. size | Observed dimensions |
|---|---:|---:|
| `videos/vulcaniq/intro.mp4` | 2.87 MB | video; validate bitrate/dimensions in browser pipeline |
| `brand/vulcaniq/logo-blue-background.png` | 1.96 MB | 1536x1024 |
| `brand/vulcaniq/vulcaniq-logo-premium.png` | 0.85 MB | 1535x1024 |
| `brand/vulcaniq/og-image.png` | 0.85 MB | 1535x1024 |
| `images/vulcaniq/etna-learning.jpeg` | 0.64 MB | 1536x2048 |
| `images/vulcaniq/etna-premium.jpeg` | 0.37 MB | 1536x2048 |

Many public `<img>` uses already set `loading="lazy"` and `decoding="async"`. A larger responsive-image pass should be coordinated with the visual modernization because current CMS/media URLs and aspect ratios are production content contracts.

## Implement now / low risk

- Keep admin/public bundle separation as the next main code-splitting target.
- Keep non-critical imagery lazy-loaded.
- Avoid adding synchronous Google API calls to public render.
- Keep Google reviewer avatars lazy and externally attributed.

## Modernization performance plan

1. Introduce lazy PublicApp/AdminApp import boundary and measure first-load JS before/after.
2. Add route/domain-level lazy loading for admin Analytics, Finance, Backup, CMS, Booking Codes, Availability and Reviews admin.
3. Generate responsive image derivatives (AVIF/WebP + JPEG fallback) through a controlled media pipeline; keep original upload available for CMS/admin if needed.
4. Add explicit intrinsic dimensions/aspect-ratio for CMS-controlled images to reduce CLS.
5. Re-encode hero/large branding files where visual QA shows no material quality loss.
6. Validate intro video poster, preload policy and bitrate; do not autoplay large media unnecessarily.
7. Measure Lighthouse/Core Web Vitals on real mobile hardware/network before setting budgets.

## Suggested budgets after modernization

These are engineering targets, not current claims:

- Public route initial JS: aim below ~250 KB gzip where realistic.
- Admin systems: lazy chunks, not public critical path.
- LCP image: correctly sized responsive source rather than full original.
- CLS: near zero for hero/cards/media.
