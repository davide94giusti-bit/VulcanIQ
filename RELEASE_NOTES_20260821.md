# VulcanIQ release candidate - 2026-08-21

## Validation status

This source package was compared against the untouched uploaded `VulcanIQ-main.zip` baseline.

The canonical regression chain reached the production build with all preceding suites passing:

- security: 75 passed, 0 failed
- analytics: 40 passed, 0 failed
- SEO: 15 passed, 0 failed
- reviews: 20 passed, 0 failed
- media: 13 passed, 0 failed
- finance: 12 passed, 0 failed
- homepage CMS: 6 passed, 0 failed
- notifications/PWA: 15 passed, 0 failed

Total reported regression assertions: 196 passed, 0 failed.

`vite build` could not execute in the ChatGPT container because the exact npm dependency restore timed out and no usable npm cache was available. `node_modules` and `dist` are intentionally excluded from this package.

Before production deployment, run the following in a clean local/CI environment with Node 20 or 22:

```powershell
npm ci
npm run test:quality
```

Do not deploy to production if that command fails.

## Database changes

Apply these forward migrations in order using your normal reviewed Supabase migration workflow:

1. `supabase/migrations/20260821070000_payment_finance_semantics.sql`
2. `supabase/migrations/20260821073000_finance_refund_rpc.sql`

Do not use `supabase db push --include-all`, reset the linked database, delete migrations, or rewrite migration history.

## Notification D1/Worker

New D1 migration:

`workers/notifications/migrations/0001_notifications.sql`

Create/configure one D1 database and bind it as `NOTIFICATIONS_DB` to both Cloudflare Pages Functions and the notifications Worker. Start from `workers/notifications/wrangler.example.toml`; do not commit the real D1 database ID or secrets.

Required notification configuration names include:

- `NOTIFICATIONS_DB` (D1 binding)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side secret)
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY` (secret)
- `VAPID_SUBJECT`
- `NOTIFICATION_INGEST_SECRET` (secret)
- optional `PUBLIC_ALLOWED_ORIGINS`
- budget/throttle variables defined in `workers/notifications/wrangler.example.toml`

For immediate booking/Gift Card Admin push ingestion, the Supabase `notify-new-request` Edge Function can additionally use:

- `NOTIFICATION_INGEST_URL`
- `NOTIFICATION_INGEST_SECRET`
- optional `REQUEST_NOTIFICATION_ALLOWED_ORIGINS`

## Supabase Edge Function

The modified operational email function is:

`supabase/functions/notify-new-request/`

After required secrets are configured, deploy it with your normal project reference, for example:

```powershell
npx supabase functions deploy notify-new-request --no-verify-jwt --project-ref <PROJECT_REF> --use-api
```

## Cloudflare Pages

The root project remains a Vite/Cloudflare Pages project:

```powershell
npm ci
npm run test:quality
npx wrangler pages deploy .\dist --project-name <PAGES_PROJECT_NAME>
```

If your existing Cloudflare Pages Git integration performs deployment, use that established workflow instead of the manual Pages command.

Ensure the Pages project has the `NOTIFICATIONS_DB` D1 binding and required server-side variables before enabling notifications.

## Notifications Worker

After creating a real `workers/notifications/wrangler.toml` from the example and configuring bindings/secrets:

```powershell
npx wrangler d1 migrations apply vulcaniq-notifications --remote --config .\workers\notifications\wrangler.toml
npx wrangler deploy --config .\workers\notifications\wrangler.toml
```

The example Worker cron is every 10 minutes. Validate INGV polling, dedupe and delivery in a non-production environment before enabling production notifications.

## Financial reconciliation

Run the read-only audit before making business judgments about ambiguous history. It does not mutate data.

Offline export:

```powershell
node .\tools\finance-reconciliation-audit.mjs --input .\finance-audit-input.json --output .\finance-audit-report.json
```

Live read-only mode is documented in `docs/FINANCE_PAYMENT_RECONCILIATION_20260821.md`.

Do not automatically rewrite ambiguous historical Finance records.

## Recommended deployment order

1. Extract into a feature branch / Preview environment.
2. `npm ci`.
3. `npm run test:quality` and require a successful production build.
4. Run/read the Finance reconciliation audit.
5. Apply the two Supabase forward migrations in order.
6. Configure/apply D1 notification persistence.
7. Configure Worker/Page/Edge secrets and bindings by name only.
8. Deploy the modified `notify-new-request` Edge Function.
9. Deploy the notifications Worker with cron disabled or controlled until QA is complete if your Cloudflare workflow permits.
10. Deploy the Cloudflare Pages Preview build.
11. Perform Finance + Public/Admin PWA + real-device push QA.
12. Promote to production only after Preview/staging passes.

## Rollback

Prefer code rollback/feature disable and forward corrective migrations.

Do not delete Finance payments, refunds, commissions, D1 audit history, applied migrations, or reset production databases as routine rollback.
