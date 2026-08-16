# Secret and configuration checklist

No secret values belong in Git, browser bundles, logs, screenshots, or `VITE_` variables.

## Cloudflare Pages server-side variables

### Supabase

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
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
- `SUPABASE_SERVICE_ROLE_KEY`
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

The Supabase URL and anon key may remain public. No service-role, Resend, GitHub App, GitHub token, webhook, cron, or Turnstile secret may be exposed to the browser.

## Removal gate for the legacy PAT

Remove `GITHUB_BACKUP_TOKEN` only after two successful production backups report `authentication: github_app` and the generated artifacts have been verified.
