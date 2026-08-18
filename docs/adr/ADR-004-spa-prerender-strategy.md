# ADR-004 — SPA vs prerender/SSR/SSG

**Status:** Defer framework migration

Keep Vite/React SPA architecture for this consolidation. Fix route truthfulness, HTTP 404 behavior and metadata now. Evaluate build-time prerendering or a future rendering-framework migration during frontend modernization only after measuring crawl/indexing and Core Web Vitals. Admin routes do not require prerendering.
