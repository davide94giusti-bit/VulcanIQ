# Rollback guide

## Application

If Preview/Production has a frontend regression, redeploy the previous known-good Cloudflare Pages commit. The new migration is additive and should normally remain in place because old application code does not depend on or mutate its new Google tables/session RPC.

## Google integration

Disable the Google cron job and/or remove provider function secrets if authorization is revoked. Native reviews continue working. Do not copy cached Google provider content into first-party tables during rollback.

## Analytics session RPC

The RPC is additive. If the new Pages ingestion must be rolled back, the previous ingestion will revert to its old session-write behavior; canonical KPI aggregation remains independent. Do not drop the RPC in an emergency rollback unless a later migration explicitly depends on removing it.

## SEO

If an explicit route rewrite is missing, add the known route rather than restoring the global `/* /index.html 200` soft-404 behavior. If CSP Report-Only reveals issues, it is non-enforcing; correct policy before enforcement rather than removing other security headers.
