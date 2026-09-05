# vulcanIQ automation and security deployment guide

## 1. Deployment sequence

1. Deploy the feature branch to Cloudflare Preview (or staging if a separate staging stack exists). If Preview points to production Supabase, treat form submissions as production-data tests.
2. Apply `supabase/migrations/20260726090000_automation_notifications_weekly_security.sql`.
3. Apply `supabase/migrations/20260726100000_storage_security_hardening.sql` only after reviewing the live bucket classification.
4. Deploy both Edge Functions.
5. Add Edge Function secrets.
6. Add Vault secrets.
7. Run the notification webhook setup script.
8. Run the weekly recap cron setup script.
9. Configure Resend DNS and verify the sender domain.
10. Configure the GitHub App and Cloudflare variables.
11. Configure Cloudflare rate-limit rules.
12. Run Preview/staging tests and the read-only security audit.
13. Merge the reviewed feature branch to `main` and perform production smoke tests.

## 2. Install and validate source

```powershell
npm install
npm run test:security
npm run build
```

The package manager must install the pinned `jose@5.9.6` dependency before Cloudflare can bundle the GitHub App JWT helper.

## 3. Apply database migrations

Using Supabase CLI:

```powershell
supabase link --project-ref <PROJECT_REF>
supabase db push
```

Alternatively, run the two dated migration files in the SQL Editor in order. Inspect the live schema before applying the storage migration; the script treats `vulcaniq-public-assets` as the only intentionally public bucket.

## 4. Deploy Edge Functions

```powershell
supabase functions deploy notify-new-request --no-verify-jwt
supabase functions deploy send-weekly-admin-recap --no-verify-jwt
```

JWT verification is disabled at the platform gateway because each function performs its own authorization:

- notification webhooks require `x-vulcaniq-webhook-secret`;
- notification retries require an authenticated owner/manager;
- cron recaps require `x-vulcaniq-cron-secret`;
- manual recaps require an authenticated owner/manager.

## 5. Add Edge Function secrets

```powershell
supabase secrets set RESEND_API_KEY=<VALUE>
supabase secrets set REQUEST_NOTIFICATION_WEBHOOK_SECRET=<VALUE>
supabase secrets set REQUEST_NOTIFICATION_RECIPIENTS=<COMMA_SEPARATED_EMAILS>
supabase secrets set REQUEST_NOTIFICATION_FROM_EMAIL="vulcanIQ Notifications <bookings@notify.vulcaniq.it>"
supabase secrets set PARTICIPANT_TERMS_DELIVERY_SECRET=<SAME_HIGH_ENTROPY_VALUE_AS_PAGES>
supabase secrets set PARTICIPANT_TERMS_ACCEPTANCE_BASE_URL="https://vulcaniq.it"
supabase secrets set PARTICIPANT_TERMS_FROM_EMAIL="vulcanIQ Terms <bookings@notify.vulcaniq.it>"
supabase secrets set WEEKLY_RECAP_CRON_SECRET=<VALUE>
supabase secrets set WEEKLY_RECAP_RECIPIENTS=<COMMA_SEPARATED_EMAILS>
supabase secrets set WEEKLY_RECAP_FROM_EMAIL="vulcanIQ Reports <reports@notify.vulcaniq.it>"
supabase secrets set WEEKLY_RECAP_TIMEZONE=Europe/Rome
```

Supabase supplies `SUPABASE_URL`, the preferred `SUPABASE_SECRET_KEYS` JSON map, and legacy `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions. Set `SUPABASE_SECRET_KEY_NAME` to the configured map key; if it is omitted, the runtime selects only the documented `default` entry and never an arbitrary first key. The shared runtime also accepts an explicitly configured `SUPABASE_SECRET_KEY`, which takes precedence over the map. A configured name that is absent or resolves to a malformed value fails closed. Confirm the preferred key map or temporary legacy fallback is available before testing; incoming user JWT, webhook-secret, and Cron-secret verification remains unchanged.

The Pages Functions environment must also contain `PARTICIPANT_TERMS_DELIVERY_SECRET` with the exact same value. It is server-only and must never use a `VITE_` prefix. The participant email is passed transiently to the Edge Function and is not stored or converted into notification ownership.

## 6. Configure Vault

Create three Vault secrets in the Supabase dashboard or SQL Editor. Do not put values in a committed migration.

```sql
select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'vulcaniq_supabase_url');
select vault.create_secret('<SAME_VALUE_AS_EDGE_WEBHOOK_SECRET>', 'request_notification_webhook_secret');
select vault.create_secret('<SAME_VALUE_AS_EDGE_CRON_SECRET>', 'weekly_recap_cron_secret');
```

Then run:

- `supabase/setup/20260726_notification_webhooks.sql`
- `supabase/setup/20260726_weekly_recap_cron.sql`

The notification trigger catches dispatch failures so a saved booking or Gift Card is never rolled back by an email outage.

## 7. Configure Resend

1. Add and verify `notify.vulcaniq.it` in Resend.
2. Publish the exact SPF, DKIM, and verification records Resend provides.
3. Use `bookings@notify.vulcaniq.it` for immediate notifications.
4. Use `reports@notify.vulcaniq.it` for weekly reports.
5. Send a test booking and verify one message per configured recipient.
6. Replay the same webhook and confirm no duplicate email is sent.

## 8. Configure the GitHub App

Create an App under `davide94giusti-bit`:

- name: `vulcaniq-cloudflare-backup`;
- homepage: `https://vulcaniq.it`;
- webhook: disabled;
- Actions: read and write;
- Metadata: read-only;
- all other permissions: no access;
- install only on `davide94giusti-bit/VulcanIQ`.

Add the App ID, installation ID, and private key to Cloudflare Pages server-side variables. Preserve line breaks in the private key; the implementation also accepts escaped `\n` values and converts GitHub's PKCS#1 key to PKCS#8 at runtime.

Keep the PAT fallback during migration. Trigger two backups and verify:

- response authentication is `github_app`;
- the workflow was dispatched from `main`;
- the database and storage artifacts are valid;
- no concurrent duplicate workflow was created.

Then remove `GITHUB_BACKUP_TOKEN`.

## 9. Configure Cloudflare

Add the server-only variables listed in `docs/SECRET_CHECKLIST_20260726.md`. Apply the rules in `docs/CLOUDFLARE_RATE_LIMITS.md`.

Do not enable `TURNSTILE_ENFORCE=true` until the public forms are supplying a valid token.

## 10. Verify analytics and attribution

Create a staging booking from a URL containing UTM parameters. Confirm the request stores first-touch values and the analytics chain contains:

```text
booking_form_open
booking_form_started
booking_form_step_completed
booking_form_submit_attempt
booking_request_created
booking_form_submit_success
```

The final two events must contain the same booking request ID and all events must retain the same journey ID.

## 11. Run security audit

Run `supabase/audit/20260726_security_audit.sql`. Review every returned globally permissive policy rather than deleting policies blindly. Verify anonymous users cannot select or mutate private operational tables or list private Storage buckets.

## 12. Production smoke tests

- Public Book Now request: one database row, one notification per recipient, one analytics success chain.
- Gift Card request: one database row, one notification per recipient.
- Duplicate submit: original row returned, no duplicate row or email.
- Resend failure: request remains saved and admin shows failure.
- Manual notification retry: owner/manager only and rate-limited.
- Gift Card paid/issued transition: finance entry and a recipient-redeemable booking code created server-side.
- Gift Card cancellation: finance reversal created server-side.
- Weekly recap test: report history recorded and no duplicate for the same period/recipient/type.
- Anonymous access: booking, Gift Card, finance, notification, report, and private Storage data denied.
