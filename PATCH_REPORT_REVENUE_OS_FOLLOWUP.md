# vulcanIQ Revenue OS Follow-up Patch — 2026-07-05

## 1. Summary

Implemented a safe, incremental Revenue OS foundation focused on the live-risk items first:

- Fixed defensive currency parsing/formatting for finance and booking-code compensation.
- Added booking-code review reuse foundation after code redemption.
- Added a request-only gift-card page and homepage CTA.
- Added a mobile WhatsApp-first fast request flow.
- Synchronized the analytics frontend/backend allowlists for the new commercial events.
- Added Google Business Profile UTM short links and an admin copy panel.
- Added SEO scaffolding: robots, sitemap, route metadata, canonical/hreflang and JSON-LD injection.
- Added owner-only admin user-management basics.
- Added CRM/revenue attribution database scaffolding.
- Scaffolded referral, partner commission and dynamic pricing data structures.

Large, higher-risk product areas remain intentionally scaffolded rather than fully built: full content hub CMS, complete partner commission UI, full dynamic pricing/yield engine, and public/admin bundle split refactor.

## 2. Finance crash root cause and fix

Root cause: currency values could reach `Intl.NumberFormat` as polluted display strings such as `EUR 35.00`, causing:

```txt
RangeError: Invalid currency code : EUR 35.00
```

Fix:

- Added `src/utils/money.js` with:
  - `normalizeCurrency()`
  - `parseMoneyAmount()`
  - `formatCurrencyAmount()`
  - `normalizeMoneyInput()`
- Replaced unsafe admin money formatting in `src/main.jsx`.
- Hardened finance service payload normalization in `src/services/financeService.js`.
- Hardened booking-code compensation normalization in `src/services/bookingCodes.js`.
- Added migration cleanup for polluted `finance_entries.currency` and `booking_codes.currency` rows.

Verified cases:

```txt
amount=35, currency=EUR             -> 35,00 €
amount="35.00", currency=EUR        -> 35,00 €
amount="EUR 35.00", currency=EUR    -> 35,00 €
amount=35, currency="EUR 35.00"     -> 35,00 €
amount=35, currency="INVALID"       -> 35,00 € fallback
```

## 3. Files changed or added

Main changed/added files:

```txt
src/main.jsx
src/styles.css
src/analytics.js
src/seo.js
src/utils/money.js
src/services/adminUsers.js
src/services/bookingCodes.js
src/services/bookingRequests.js
src/services/financeService.js
src/services/reviewsService.js
functions/api/analytics/event.js
public/_redirects
public/robots.txt
public/sitemap.xml
supabase/schema.sql
supabase/migrations/20260705_revenue_os_followup.sql
PATCH_REPORT_REVENUE_OS_FOLLOWUP.md
```

## 4. Database migrations added

Added:

```txt
supabase/migrations/20260705_revenue_os_followup.sql
```

Includes additive changes for:

- Booking-code review reuse.
- Review linkage to booking code and booking request.
- Finance currency cleanup.
- Analytics event/traffic-source constraints.
- CRM/follow-up fields on `booking_requests`.
- Admin profile role expansion.
- Owner-only admin profile management policy.
- Referral code table.
- Partner referral/commission scaffold table.
- Dynamic pricing input columns on fixed excursions.

## 5. Booking-code review behavior

Implemented behavior:

- Admin-generated booking code redemption still creates the booking request and finance entry.
- On successful redemption, `booking_codes.review_enabled` is set to `true`.
- The same code can then be used in the public review form.
- Reviews link to:
  - `booking_code_id`
  - `booking_request_id`
  - `booking_code`
- One review per booking code is enforced by a partial unique index.
- Duplicate submissions return the existing duplicate path.

Added frontend review events:

```txt
booking_code_review_open
booking_code_review_submit_attempt
booking_code_review_submit_success
booking_code_review_duplicate
```

## 6. Gift-card placement options and implemented choice

Recommended placement options documented in the source prompt:

- Homepage premium CTA card.
- Experience-card add-on.
- Contact-page CTA.
- Dedicated gift-card page.
- Seasonal banner.

Implemented safe first version:

- Homepage hero-level `Gift card` CTA.
- Dedicated `/gift-card` route.
- Request-only WhatsApp flow.
- No payment collection and no implied Stripe/payment integration.
- Events:

```txt
gift_card_view
gift_card_request_click
```

## 7. WhatsApp fast request behavior

Implemented a mobile sticky-bar `Rapida / Fast` action that opens a full-screen modal:

1. Select experience.
2. Select flexible date or custom date.
3. Select people count.
4. Review and open structured WhatsApp message.

Events:

```txt
fast_request_start
fast_request_step_complete
fast_request_abandon
fast_request_whatsapp_click
fast_request_submit_success
```

The partial fast-request state is stored locally for 24 hours and does not store unnecessary PII.

## 8. Analytics allowlist/tracking changes

Synchronized frontend and Cloudflare analytics event allowlists for the new events.

Updated:

```txt
src/analytics.js
functions/api/analytics/event.js
supabase/migrations/20260705_revenue_os_followup.sql
```

Added accepted traffic sources:

```txt
google_business_profile
partner
tiktok
qr
business_card
```

Failed writes still return a non-success response from the Cloudflare function.

## 9. Google Business Profile UTM links added

Added redirects:

```txt
/r/google-profile -> /?utm_source=google_business_profile&utm_medium=organic&utm_campaign=profile
/r/google-booking -> /experiences?utm_source=google_business_profile&utm_medium=booking&utm_campaign=fixed_excursions
```

Also added common short links for Instagram, Facebook, TikTok, WhatsApp, partner, QR and business card.

Admin analytics now includes a quick-link copy panel.

## 10. SEO files/routes added

Added:

```txt
public/robots.txt
public/sitemap.xml
src/seo.js
```

SEO foundation includes:

- Document title by route/language.
- Meta description by route/language.
- Canonical link.
- Hreflang scaffolding.
- JSON-LD LocalBusiness and BreadcrumbList.
- TouristTrip JSON-LD for experiences.

The `/gift-card` route is included in sitemap because it has real request-copy content.

## 11. Admin user management status

Implemented owner-only page:

```txt
/admin/users
```

Features:

- List admin profiles.
- Show name, email, role, active status and last seen.
- Update role.
- Activate/deactivate user.
- Manual Supabase Auth creation instructions.

Security:

- No service-role key is exposed in frontend code.
- RLS migration changes profile management to owner-only.

## 12. CRM/revenue analytics status

Implemented database/service foundation:

- Added CRM/follow-up fields to `booking_requests`.
- Added service selection support for those fields.
- Added indexes for status, follow-up and attribution queries.
- Revenue dashboard UI remains a next patch because it needs careful aggregation against live data and finance semantics.

## 13. Review/referral status

Implemented:

- Booking-code review reuse.
- Review-request/referral analytics event allowlist.
- Referral code table scaffold.

Deferred:

- Full admin review-request sending UI.
- Full referral customer-facing flow.

## 14. Abandoned form recovery status

Implemented:

- Fast-request abandon event tracking.
- Analytics allowlist/database support for abandoned form/recovery events.

Deferred:

- Full booking-form unload/debounce recovery correlation across all public form paths.

## 15. Content hub / partner commission / dynamic pricing / bundle split status

Implemented/scaffolded:

- Partner referral/commission table scaffold.
- Dynamic pricing input columns on fixed excursions.
- SEO sitemap entries for future landing pages.

Deferred intentionally:

- Full content hub CMS and rich articles.
- Partner commission admin UI and payout workflow.
- Real yield-management algorithm.
- Public/admin bundle split refactor.

Reason: these are larger architectural changes and should not be mixed into the live finance/review/analytics patch beyond safe foundations.

## 16. Build result

Command run:

```bash
npm run build
```

Result:

```txt
Build passed.
```

Note: the uploaded project ZIP had incomplete optional native dependencies in `node_modules`. I ran `npm install @rollup/rollup-linux-x64-gnu --no-save` and `npm install @esbuild/linux-x64 --no-save` only to verify the build in this Linux sandbox. These installed packages are not included in the release ZIP because `node_modules` is excluded.

Build warning:

```txt
Some chunks are larger than 500 kB after minification.
```

This confirms the bundle-split item should remain a later refactor.

## 17. Conflict check result

Command run:

```bash
grep -RIn --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git -E '^(<<<<<<<|=======|>>>>>>>)' .
```

Result:

```txt
No conflict markers found.
```

## 18. Manual setup required

After deploying code, run this migration in Supabase:

```txt
supabase/migrations/20260705_revenue_os_followup.sql
```

Then verify:

- `review_enabled` exists on `booking_codes`.
- `booking_code_id` exists on `reviews`.
- Analytics constraints include the new events.
- `/r/google-profile` and `/r/google-booking` redirects work on Cloudflare Pages.
- `/gift-card` loads and opens WhatsApp with the structured message.
- `/admin/users` is accessible only for owner role.

## 19. Post-deploy test checklist

1. Open `/admin/finance`; confirm no `Invalid currency code` crash.
2. Create a booking code with expected compensation.
3. Redeem that booking code publicly.
4. Confirm booking request and finance entry are created.
5. Open `/reviews` and submit a review with the same redeemed code.
6. Try submitting the same code again and confirm duplicate handling.
7. Open `/gift-card`; click WhatsApp request.
8. On mobile, tap `Rapida / Fast`; generate WhatsApp request.
9. Open `/admin/analytics`; copy `/r/google-profile`.
10. Visit `/r/google-profile`; confirm redirect keeps UTM query.
11. Open `/robots.txt` and `/sitemap.xml`.
12. Confirm `/admin/users` is owner-only.
