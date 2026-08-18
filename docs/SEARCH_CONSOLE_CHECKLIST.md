# Google Search Console validation checklist

1. Confirm the Domain property covers `vulcaniq.it` and any `www` alias.
2. Submit `https://vulcaniq.it/sitemap.xml`.
3. Inspect `/`, `/experiences`, `/reviews`, `/contact`, `/gift-card`, `/about`, and one legal page.
4. Repeat URL inspection for English `?lang=en` variants and verify Google's selected canonical matches the intended language URL.
5. Review Page Indexing exclusions for unexpected soft 404, duplicate canonical, or blocked-resource reports.
6. Review Core Web Vitals separately for mobile and desktop.
7. Check HTTPS report, Manual Actions, and Security Issues.
8. Validate structured data for the experiences route and business entity. Do not expect self-serving LocalBusiness review-star rich results.
9. After release, request recrawl of the homepage/reviews/experiences pages if useful; do not repeatedly submit unchanged URLs.
10. Compare Search performance before/after the canonical-domain correction. Avoid attributing short-term ranking movement to one code change without sufficient time/data.
11. Review any available AI-feature/Search appearance reporting in Search Console as descriptive data, not as a separate optimization target.
