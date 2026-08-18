# ADR-002 — Canonical hostname

**Status:** Accepted

Canonical production origin is `https://vulcaniq.it` (apex, HTTPS). SEO builders, sitemap, robots and static social metadata use this origin. `www` should permanently redirect to apex at Cloudflare. Do not duplicate canonical host literals across application modules; use `src/config/site.js`.
