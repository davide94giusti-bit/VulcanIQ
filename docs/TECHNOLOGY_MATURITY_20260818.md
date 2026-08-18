# Technology maturity assessment — pre-modernization

Scores are engineering readiness indicators, not marketing ratings.

| Area | Current | Primary residual risk | Action |
|---|---:|---|---|
| Architecture | 8/10 | Large `src/main.jsx`; admin/public import graph still coupled | Continue domain extraction; lazy PublicApp/AdminApp split |
| Security | 8.5/10 | CSP not enforced yet; periodic grant/RPC audit still needed | Validate Report-Only CSP, repeat connected RLS/grant audit |
| Database design | 8.5/10 | Continued growth requires index/query monitoring | Keep forward migrations; measure before adding indexes |
| Auth/RLS | 9/10 | Role drift/new RPCs can regress | Keep regression tests and explicit grants/search paths |
| Frontend maintainability | 7/10 | Main entry file remains ~14.9k lines | Extract admin/booking/Gift Card domains before redesign |
| Backend maintainability | 8.5/10 | Several execution surfaces (CF + Supabase) | Preserve shared contracts/docs; avoid duplicated formulas |
| Testing | 8.5/10 | Mostly regression/static contract tests, limited browser E2E | Add focused Playwright flows after bundle split |
| CI/CD | 8/10 | Lockfile transition pending | Commit lockfile; use `npm ci`; make quality workflow required |
| Observability | 7.5/10 | Structured logs exist but no central error aggregation | Add provider/function tracing; evaluate error monitor |
| Performance | 7/10 | Public bundle still contains substantial admin code | Lazy admin boundary; image/media audit; measure CWV |
| Accessibility | 8/10 | New review dialog corrected; broader site still needs automated/manual audit | Add targeted axe/keyboard E2E during redesign |
| SEO | 8.5/10 | Canonical/sitemap/404 corrected; SPA rendering remains client-heavy | Search Console validation; consider prerender during modernization |
| AEO/AI readiness | 7.5/10 | Content authority/questions can be stronger | Add owner-approved expert content, not AI gimmicks |
| Operational recovery | 8.5/10 | Restore drill remains important | Execute periodic real restore exercise |
| Documentation | 8.5/10 | Historical patch docs are noisy | Maintain architecture/ADR docs as source of truth |
| Third-party integrations | 8/10 | Google API authorization is owner-dependent | Complete GBP OAuth/access and provider E2E |

## Highest-value next steps before the visual modernization

1. Complete production validation of this consolidation release.
2. Commit a generated lockfile and require quality CI.
3. Complete the public/admin lazy bundle boundary.
4. Add focused browser E2E for booking, Gift Card, reviews, admin login and analytics.
5. Validate CSP and then enforce it.
6. Complete Google Business Profile authorization/sync.
7. Confirm Search Console/canonical/404 behavior in production.
8. Perform a restore drill.
