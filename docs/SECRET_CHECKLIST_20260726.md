# Secret and configuration checklist

No secret values belong in Git, browser bundles, logs, screenshots, or `VITE_` variables.

## Supabase backend credential migration

- Prefer `SUPABASE_SECRET_KEY` in Cloudflare and Node/GitHub backend runtimes; temporarily retain `SUPABASE_SERVICE_ROLE_KEY` for rollback.
- Send an opaque `sb_secret_...` credential in the `apikey` header only. It is an API credential, not a user JWT.
- Keep signed-in user access tokens in `Authorization: Bearer <user-access-token>` so caller identity and RLS semantics remain intact.
- The legacy service-role JWT fallback retains its historical `apikey` plus bearer headers until all runtimes have been validated and the exposed legacy key can be disabled.
- Keep `SUBMISSION_HASH_SALT` stable and independent of backend-key rotation.

## Cloudflare Pages server-side variables

### Supabase

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (preferred)
- `SUPABASE_SERVICE_ROLE_KEY` (temporary fallback)
- `SUBMISSION_HASH_SALT`

### GitHub App backup

- `GITHUB_APP_ID`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_OWNER=davide94giusti-bit`
- `GITHUB_REPO=VulcanIQ`
- `GITHUB_BACKUP_WORKFLOW=vulcaniq-db-backup.yml`
- `GITHUB_BACKUP_REF=main`
- Temporary only: `GITHUB_BACKUP_TOKEN`

### Public endpoint protection

- `PUBLIC_ALLOWED_ORIGINS`
- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_ENFORCE`

## Supabase Edge Function secrets

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEYS` (Supabase-provided JSON key map; preferred)
- `SUPABASE_SECRET_KEY_NAME` (map key to select; omit only when the configured key is named `default`)
- `SUPABASE_SECRET_KEY` (optional explicitly configured key)
- `SUPABASE_SERVICE_ROLE_KEY` (legacy runtime fallback)
- `RESEND_API_KEY`
- `REQUEST_NOTIFICATION_WEBHOOK_SECRET`
- `REQUEST_NOTIFICATION_RECIPIENTS`
- `REQUEST_NOTIFICATION_FROM_EMAIL`
- `WEEKLY_RECAP_CRON_SECRET`
- `WEEKLY_RECAP_RECIPIENTS`
- `WEEKLY_RECAP_FROM_EMAIL`
- `WEEKLY_RECAP_TIMEZONE=Europe/Rome`

## Supabase Vault secret names

- `vulcaniq_supabase_url`
- `request_notification_webhook_secret`
- `weekly_recap_cron_secret`

The Vault webhook and cron secrets must exactly match the corresponding Edge Function secrets.

## Public frontend values

The Supabase URL and anon key may remain public. No Supabase secret/service-role, Resend, GitHub App, GitHub token, webhook, cron, or Turnstile secret may be exposed to the browser.

## Removal gate for the legacy PAT

Remove `GITHUB_BACKUP_TOKEN` only after two successful production backups report `authentication: github_app` and the generated artifacts have been verified.
