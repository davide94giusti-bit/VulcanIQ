# Google Reviews setup — vulcanIQ

## Status

The codebase contains an official Google Business Profile Reviews API provider, a temporary provider cache, public normalization, an Admin status panel, and protected manual/scheduled refresh plumbing. The integration is **not live merely because this code exists**. It remains non-blocking until the owner completes Google API approval, OAuth authorization, explicit account/location selection, server-side configuration, migration, and Preview validation.

The public links supplied by the vulcanIQ administrators are:

- Maps listing: `https://maps.app.goo.gl/efLnfxBxYvei22YY6?g_st=aw`
- Write a review: `https://g.page/r/CfYT-ORvmFjiEBI/review`

On 2026-10-05 the Maps link resolved to a Google Maps place named `vulcanIQ`, and the write link resolved to Google's write-review flow. Do not decode either short URL to invent Business Profile identifiers. The owner must still compare both destinations with the authenticated location's official `metadata.mapsUri` and `metadata.newReviewUri` before activation.

## Architecture

`Google Business Profile Reviews API -> google-reviews-sync Edge Function -> expiring google_reviews_cache -> narrow public RPCs -> existing ReviewsPage`

First-party vulcanIQ reviews remain in `public.reviews`. Google provider content is never copied into that native table. Website review display and booking-code submission do not depend on Google availability.

## IMPLEMENTED BY CODE

- OAuth refresh and Google API calls run only in the existing Supabase Edge Function backend.
- The current official reviews endpoint is `GET https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/reviews`.
- The provider uses the current `https://www.googleapis.com/auth/business.manage` scope contract, paginates at Google's maximum page size of 50, and temporarily keeps at most the 100 most recently updated reviews.
- Google star enums are normalized explicitly; malformed or unknown ratings remain unavailable rather than becoming five stars.
- Anonymous reviewers remain anonymous and are presented with localized generic UI copy.
- Existing Google Business Profile replies are read-only display data. Reply creation/deletion is not implemented.
- Google failures are sanitized and cannot blank Website reviews.
- Bounded timeouts and retry/backoff cover safe transient reads; 401, 403, 429, malformed responses, timeouts, and provider failures remain distinct server-side error codes.
- Provider content is stored in the existing RLS-protected cache for no more than 29 days. Native review rows and Admin review controls remain independent.
- Google's own `averageRating` and `totalReviewCount` are stored with the same expiry in sync state and exposed by a narrow read-only RPC. VulcanIQ does not calculate a combined or replacement rating.
- The public page keeps the existing booking-code “Publish a review” workflow and adds separate Maps and “Review us on Google” actions.
- Manual Google-labelled native rows remain a visibly manual fallback. Once live provider rows exist, provider rows take precedence publicly; no manual row is deleted or modified.

## REQUIRES OWNER / GOOGLE ADMIN ACTION

1. Confirm that the intended vulcanIQ Business Profile is verified and owned or managed by the Google account that will authorize the integration.
2. Create or select a business-owned Google Cloud project.
3. Submit the Business Profile API access request. The Google My Business API is not available to an unapproved project merely because the profile exists.
4. Wait for approval and enable the required Business Profile APIs, including Google My Business API, My Business Account Management API, and My Business Business Information API.
5. Configure the OAuth consent screen and create the appropriate OAuth client for server-side offline access.
6. As the profile owner/admin, grant only `https://www.googleapis.com/auth/business.manage` and obtain a refresh token through a controlled OAuth consent flow. Never provide a Google password, 2FA code, or recovery code to a developer or coding agent.
7. Discover and explicitly verify the account/location as described below. Never select the first result automatically.
8. Set the server-side Edge Function values for the intended environment. Do not put any credential in Git, a committed `.env`, frontend code, analytics, or a `VITE_*` variable.
9. Apply the version-controlled migrations through the normal reviewed migration pipeline, then deploy `google-reviews-sync` to a non-production Supabase environment.
10. Run a manual Admin refresh and compare reviewer names, ratings, dates, replies, aggregate rating/count, Maps destination, and write-review destination against the intended Business Profile.
11. Validate Preview mobile/desktop UI and failure behavior before separately configuring or enabling Production.

## Explicit account/location discovery

After OAuth authorization, use the authorized token only from a trusted owner-controlled tool or server session:

1. List every accessible account with `GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts`. Follow `nextPageToken`; do not assume the first account is the business account.
2. For each owner-selected candidate account, list managed locations with:

   `GET https://mybusinessbusinessinformation.googleapis.com/v1/accounts/{accountId}/locations?readMask=name,title,storeCode,websiteUri,metadata`

3. Require the owner to select the `vulcanIQ` location explicitly. Compare its title, website, address/context in the owner console, `metadata.placeId`, `metadata.mapsUri`, and `metadata.newReviewUri` with the intended public listing and supplied links.
4. Record only the confirmed account and location resource IDs. A Business Profile account/location ID is not a Maps Place ID.
5. If multiple plausible locations exist or metadata does not match, stop. Do not configure the integration until the owner resolves the ambiguity.

Google's OAuth Playground can be used for this one-time owner setup with the business's own OAuth client, but tokens must not be pasted into source files, tickets, chat transcripts, or browser-facing configuration.

## Server-side configuration

Secret values:

- `GOOGLE_BUSINESS_CLIENT_SECRET`
- `GOOGLE_BUSINESS_REFRESH_TOKEN`
- `GOOGLE_REVIEWS_SYNC_SECRET`

Non-secret identifiers/configuration that still belong on the trusted server:

- `GOOGLE_BUSINESS_CLIENT_ID`
- `GOOGLE_BUSINESS_ACCOUNT_ID`
- `GOOGLE_BUSINESS_LOCATION_ID`
- `GOOGLE_BUSINESS_PROFILE_URL` (use the supplied Maps URL after owner verification)

Use the repository's existing Supabase Edge Function secret mechanism for all of these server runtime values. The mechanism protects both secrets and server-only configuration from the browser:

```powershell
npx supabase secrets set `
  GOOGLE_BUSINESS_CLIENT_ID="<oauth-client-id>" `
  GOOGLE_BUSINESS_CLIENT_SECRET="<server-only>" `
  GOOGLE_BUSINESS_REFRESH_TOKEN="<server-only>" `
  GOOGLE_BUSINESS_ACCOUNT_ID="<owner-confirmed-account-id>" `
  GOOGLE_BUSINESS_LOCATION_ID="<owner-confirmed-location-id>" `
  GOOGLE_BUSINESS_PROFILE_URL="https://maps.app.goo.gl/efLnfxBxYvei22YY6?g_st=aw" `
  GOOGLE_REVIEWS_SYNC_SECRET="<fresh-random-secret>" `
  --project-ref "<non-production-project-ref>"
```

Do not run this example against Production until Preview acceptance and explicit deployment approval.

## Environment and rollout boundary

The repository has Cloudflare Pages Preview/Production conventions, but it does not declare a separate Preview Supabase project. A Cloudflare Preview may therefore still point at the shared Supabase backend through its environment variables. True isolated Google OAuth testing requires an owner-provided non-production Supabase project and matching Preview `VITE_SUPABASE_URL` / anon key; do not invent one.

Recommended order:

1. non-production Supabase migrations;
2. non-production Edge Function secrets;
3. deploy the function with its repository configuration (`verify_jwt = false` because the function performs admin-or-sync-secret authorization itself);
4. manual Admin refresh;
5. authenticated account/location/content verification;
6. Preview responsive/accessibility/failure QA;
7. explicit Production approval;
8. Production migration/function/secrets;
9. approved daily scheduled refresh using the existing setup SQL only after separate Cron approval.

Cron is not enabled by this code change.

## Refresh cadence and activation

Cache retention and sync frequency are separate controls. Every successful
sync gives the current bounded provider rows and Google aggregate summary a
29-day expiry; that expiry is a retention ceiling, not the refresh schedule.
Expired rows are deleted at the start of each authorized sync attempt, and a
complete provider read also deletes cached rows that are no longer in the
bounded result.

- **Manual Preview refresh:** an authenticated owner/manager can use **Admin →
  Reviews → Refresh now**. The browser supplies only its Admin bearer token;
  Google credentials remain inside the Edge Function.
- **Scheduled refresh:** the existing, separately applied
  `supabase/setup/20260818_google_reviews_sync_cron.sql` schedules one refresh
  daily at 03:17 UTC using the dedicated Vault-backed sync secret.
- **Current state:** that setup SQL is not a migration and is not activated by
  this feature branch. Cloudflare and public browser code do not invoke the
  sync function.
- **Activation requirement:** configure and validate manual synchronization in
  an isolated Preview Supabase environment first. Production requires separate
  approval to configure the Production secrets/Vault values and apply the
  existing daily Cron setup. Do not treat the 29-day expiry as an acceptable
  Production refresh cadence.

## Temporary content and attribution policy

Google's current Business Profile API policy permits only limited, secure, temporary storage for performance, for no more than 30 calendar days, without manipulating or aggregating provider content. This implementation uses a 29-day expiry, keeps a bounded recent set, deletes expired or no-longer-current cache rows during authorized sync, and displays Google's own aggregate values unchanged. Do not convert provider rows into permanent native reviews.

Google content remains labelled as Google. Reviewer text is rendered as text, not raw HTML. The UI does not imply partnership, sponsorship, or endorsement by Google.

## Failure and rollback behavior

- Not configured/API approval pending: Website reviews and booking-code submission continue; Google shows a non-technical unavailable state.
- Connected with zero Google reviews: the Google filter shows an explicit empty state.
- Rate limit/outage/revocation: Website reviews continue; only a still-valid temporary cache may remain visible.
- Expired cache: Google rows and summary disappear rather than persisting indefinitely.
- Rollback/disable: while authorization is still available, run an authorized cleanup/sync so expired and stale provider rows are deleted; then unschedule the daily job and remove or rotate the Google Edge Function authorization values. Public access already excludes expired content, and Website reviews require no rollback.

## Current official references (verified 2026-10-05)

- Reviews list: https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list
- Review resource: https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews
- Basic setup/API approval: https://developers.google.com/my-business/content/basic-setup
- OAuth and scope: https://developers.google.com/my-business/content/implement-oauth
- Accounts list: https://developers.google.com/my-business/reference/accountmanagement/rest/v1/accounts/list
- Location data/metadata: https://developers.google.com/my-business/content/location-data
- Business Profile API policy: https://developers.google.com/my-business/content/policies
