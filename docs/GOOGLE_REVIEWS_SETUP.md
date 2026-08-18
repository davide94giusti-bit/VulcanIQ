# Google Reviews setup — vulcanIQ

## Status

The application contains a policy-aware Google Business Profile review provider, temporary cache, public review adapter, admin status panel, and manual/daily sync plumbing. The provider remains non-blocking until the owner completes Google's API authorization and server-side secret setup.

## Architecture

`Google Business Profile API -> google-reviews-sync Edge Function -> temporary google_reviews_cache -> get_public_google_reviews() -> ReviewsPage`

First-party vulcanIQ reviews remain in `public.reviews`. Google provider content is deliberately kept in a separate temporary cache and expires after 29 days unless refreshed.

## Owner actions

1. Confirm that the vulcanIQ Google Business Profile is claimed and the relevant location is verified.
2. Use a Google Cloud project owned by the business.
3. Request/confirm Google Business Profile API access for that project.
4. Configure OAuth consent and an OAuth client appropriate for server-side refresh-token use.
5. Authorize the business account with the `https://www.googleapis.com/auth/business.manage` scope.
6. Determine the Business Profile account ID and location ID for the verified location.
7. Obtain a refresh token through a controlled owner/admin OAuth flow. Never place it in source code, GitHub, Cloudflare public variables, or a `VITE_` variable.
8. Set the following Supabase Edge Function secrets:

```powershell
npx supabase secrets set `
  GOOGLE_BUSINESS_CLIENT_ID="<server-only>" `
  GOOGLE_BUSINESS_CLIENT_SECRET="<server-only>" `
  GOOGLE_BUSINESS_REFRESH_TOKEN="<server-only>" `
  GOOGLE_BUSINESS_ACCOUNT_ID="<account-id>" `
  GOOGLE_BUSINESS_LOCATION_ID="<location-id>" `
  GOOGLE_BUSINESS_PROFILE_URL="https://www.google.com/maps/..." `
  GOOGLE_REVIEWS_SYNC_SECRET="<fresh-random-secret>" `
  --project-ref qlfnvfxkjvlzllwrszgz
```

`GOOGLE_BUSINESS_PROFILE_URL` is optional but recommended so Google review details can provide a user-visible source link to the business profile.

9. Apply `supabase/migrations/20260818150000_reviews_google_session_hardening.sql` before deploying the frontend/analytics ingestion change.
10. Deploy the provider function:

```powershell
npx supabase functions deploy google-reviews-sync `
  --no-verify-jwt `
  --project-ref qlfnvfxkjvlzllwrszgz `
  --use-api
```

11. Create/update the Supabase Vault secrets used by `supabase/setup/20260818_google_reviews_sync_cron.sql`:
   - `vulcaniq_supabase_url`
   - `google_reviews_sync_secret`
12. Run the cron setup SQL after the Edge Function and secrets are ready.
13. In Admin -> Reviews, use **Refresh now** once and verify `Connected` plus a recent successful refresh timestamp.

## API behavior implemented

The provider uses Google's OAuth token endpoint and the Google Business Profile Reviews list endpoint. It paginates with a page size of 50 and bounded retries for 429/5xx responses. Provider failures are reduced to safe error codes; tokens and review bodies are never logged.

## Temporary content policy

The cache expiry is 29 days, inside Google's currently documented 30-calendar-day temporary storage allowance. A complete successful sync also expires provider rows that were not present in the latest provider result. Do not convert provider rows into permanent native vulcanIQ reviews.

## Manual Google review fallback

The existing admin-managed Google-labelled reviews remain available only as a fallback when the official provider cache is unavailable. Once the provider cache contains Google reviews, provider data takes precedence publicly to avoid duplicate display.

## Failure modes

- Missing API authorization/secrets: admin shows “Awaiting Google authorization”; native reviews continue to work.
- OAuth/permission failure: admin shows a sanitized sync error; public native reviews remain available.
- Provider outage/rate limit: last valid non-expired cache remains usable; sync does not block the site.
- Expired cache with provider unavailable: provider reviews disappear rather than being retained indefinitely.

## Current official references to re-check before activation

- Business Profile Reviews list: https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list
- Business Profile basic setup: https://developers.google.com/my-business/content/basic-setup
- Business Profile OAuth: https://developers.google.com/my-business/content/implement-oauth
- Business Profile content policy: https://developers.google.com/my-business/content/policies
