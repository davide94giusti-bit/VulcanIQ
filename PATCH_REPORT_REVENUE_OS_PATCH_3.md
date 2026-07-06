# PATCH REPORT - Revenue OS Patch 3

## 1. Summary

Implemented the attached Revenue OS Patch 3 scope on top of the Revenue OS Patch 2 codebase.

Patch 3 adds the next operational layer:

- Gift Card v2 public request form and admin workflow.
- Gift Card finance confirmation/reversal behavior.
- Admin review-request actions for completed website bookings and booking-code bookings.
- Customer referral-code generation, copy, disable, redirect, and attribution.
- Journey-level abandoned-form tracking for booking, fast-request, and gift-card flows.
- Minimal analytics/revenue dashboard updates for new sources and abandoned/recovered forms.

The public Gift Card flow remains request-only. No online payment collection was added.

## 2. Gift Card admin workflow

Added a dedicated admin route:

```txt
/admin/gift-cards
```

Admin navigation now includes a Gift Cards section.

Implemented admin capabilities:

- View Gift Card requests.
- Filter by status and search buyer/recipient/experience.
- Change lifecycle status:
  - `new`
  - `contacted`
  - `quoted`
  - `paid`
  - `issued`
  - `cancelled`
- Add/edit internal admin notes.
- Copy WhatsApp reply template.
- Copy email reply template.
- Mark as paid.
- Mark as issued.
- Cancel request.

Displayed request fields include:

```txt
buyer_name
buyer_email
buyer_phone
buyer_preferred_language
recipient_name
experience_type
budget
currency
preferred_delivery_date
status
admin_note
finance_entry_id
created_at
updated_at
```

## 3. Public Gift Card request flow

Replaced the placeholder Gift Card page with an operational request form.

The form captures:

```txt
buyer_name
buyer_email
buyer_phone
recipient_name
experience_type
budget
preferred_delivery_date
message
buyer_preferred_language
currency
```

Important behavior:

- No payment button was added.
- Copy explicitly states that payment is external/manual after team confirmation.
- Language is preserved through the public page.
- WhatsApp fallback remains available.
- Gift Card form uses journey-level tracking.

## 4. Gift Card finance behavior

Implemented conservative finance behavior in `src/services/giftCards.js`.

Rules implemented:

- Creating a Gift Card request does **not** create confirmed revenue.
- `new`, `contacted`, and `quoted` do **not** count as confirmed revenue.
- Moving a request to `paid` or `issued` creates or confirms a finance entry.
- Gift Card finance entries use:

```txt
type = income
source_type = gift_card
source_id = gift_card_request.id
category = gift_card
status = confirmed
```

- Marking `issued` after `paid` does not create a duplicate finance entry.
- Cancelling a paid/issued Gift Card reverses or voids linked Gift Card finance entries using the existing finance-reversal model.

## 5. Review-request workflow

Added reusable admin review actions for eligible records.

Supported records:

- Website booking requests.
- Manual/external booking-code bookings.

Admin actions added:

```txt
Copy review link
Open WhatsApp review request
Mark review requested
Mark review received
```

Review link format:

```txt
/reviews?code=BOOKING_CODE
```

For booking-code records, the existing booking code is used as the review code.

For website booking requests, the workflow uses:

```txt
review_code
booking_code
```

where available. Duplicate-review prevention remains part of the existing review submission flow and was not weakened.

## 6. Customer referral-code workflow

Added `src/services/referrals.js` and admin UI actions.

Admin capabilities:

- Generate referral code from completed booking requests.
- Generate referral code from completed booking-code bookings.
- Copy referral link.
- Disable referral codes.
- View a compact referral-code list.

Referral link format:

```txt
/r/ref/CODE
```

Redirect behavior:

```txt
/r/ref/CODE
→ /?utm_source=referral&utm_medium=customer&utm_campaign=referral_CODE
```

Language preservation:

```txt
/r/ref/CODE?lang=en
→ /?lang=en&utm_source=referral&utm_medium=customer&utm_campaign=referral_CODE
```

Valid referral visits are stored client-side with source `customer_referral`, then attached to later booking requests through:

```txt
referral_code
referral_source
referral_landing_at
utm_source
utm_medium
utm_campaign
```

Invalid referral links redirect safely to home without crashing.

## 7. Abandoned form recovery tracking

Added centralized journey helpers in `src/analytics.js`:

```txt
createFormJourney
markFormFieldStarted
markFormActivity
markFormSubmitted
markFormAbandoned
markFormRecoveredViaWhatsApp
```

Supported form types:

```txt
booking_form
fast_request
gift_card_request
```

Journey state is stored locally with a 24-hour expiry.

Tracked events:

```txt
form_journey_started
form_field_started
abandoned_form_detected
abandoned_form_recovered_whatsapp
form_submit_success
```

Privacy behavior:

- No names, emails, phone numbers, free-text messages, buyer details, recipient details, or coordinates are stored in analytics metadata.
- Analytics failures do not block form submission.
- Abandon events are emitted at most once per journey.
- Submit success prevents later abandon tracking for the same journey.

## 8. Revenue and analytics dashboard updates

Updated request/source classification to include:

```txt
gift_card
referral
customer_referral
booking_code
website_form / website
direct
unknown
```

Added lightweight analytics counts for:

```txt
form journeys started
abandoned forms
WhatsApp recoveries
abandonment rate
recovery rate
```

Finance category labels now include:

```txt
booking_code_expected
gift_card
```

Gift Card revenue remains separate from excursion/website-form revenue through `source_type = gift_card` and `category = gift_card`.

## 9. Analytics events added/allowed

Added frontend event names and migration allowlist entries for:

```txt
gift_card_request_created
gift_card_status_changed
gift_card_paid
gift_card_issued
gift_card_cancelled
gift_card_whatsapp_reply_copied
gift_card_email_reply_copied
review_link_copied
review_request_whatsapp_click
review_requested_marked
review_received_marked
referral_code_created
referral_link_copied
referral_link_click
referral_invalid_link_click
referral_booking_request_created
referral_code_disabled
form_journey_started
form_field_started
abandoned_form_detected
abandoned_form_recovered_whatsapp
form_submit_success
```

## 10. Files changed / added

Primary files changed:

```txt
src/main.jsx
src/analytics.js
src/styles.css
src/services/bookingRequests.js
src/services/bookingCodes.js
```

New files added:

```txt
src/services/giftCards.js
src/services/referrals.js
supabase/migrations/20260706_revenue_os_patch_3.sql
PATCH_REPORT_REVENUE_OS_PATCH_3.md
```

## 11. Database migration added

Created:

```txt
supabase/migrations/20260706_revenue_os_patch_3.sql
```

The migration is additive/idempotent where possible and includes:

- Gift Card admin/public fields and policies.
- Public insert policy for Gift Card requests.
- Review request fields on `booking_requests` and `booking_codes`.
- `customer_referral_codes` table.
- Secure `register_referral_click(p_code text)` function for public referral clicks.
- Referral attribution fields on `booking_requests`.
- Updated `create_public_booking_request(jsonb)` function to persist referral attribution.
- Updated source/event/traffic-source allowlists.
- Safe indexes for referral and review lookup fields.

## 12. Verification

Build command:

```bash
npm run build
```

Result:

```txt
PASS
```

The Vite large chunk warning remains present and is non-blocking for this patch.

Conflict-marker check:

```bash
grep -R -n -E '^(<<<<<<<|=======|>>>>>>>)' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git .
```

Result:

```txt
PASS - no conflict markers found
```

Frontend secret check:

```bash
grep -R -n -E 'service_role|SUPABASE_SERVICE|PRIVATE_KEY' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git src
```

Result:

```txt
PASS - no service-role/private key references in frontend src
```

## 13. Manual setup required

Before deploying the frontend, apply this migration in Supabase:

```txt
supabase/migrations/20260706_revenue_os_patch_3.sql
```

After applying the migration:

1. Refresh the Supabase schema cache if required.
2. Redeploy the frontend.
3. Re-test public Gift Card submission.
4. Re-test booking-code redemption and income confirmation.
5. Re-test admin review actions.
6. Re-test referral link redirect:

```txt
/r/ref/VALID_CODE?lang=en
```

7. Confirm RLS allows admin operations but does not expose private request/customer data publicly.

## 14. Post-deploy manual test checklist

Gift Card:

- Public Gift Card request submits.
- Request appears in `/admin/gift-cards`.
- Status changes work.
- Notes save.
- WhatsApp/email replies copy.
- `paid` creates/updates confirmed finance.
- `issued` does not duplicate finance.
- `cancelled` reverses/voids linked revenue.

Review:

- Completed booking-code card shows review actions.
- Completed website request card shows review actions where a code exists.
- Review link opens `/reviews?code=...`.
- WhatsApp review request opens with the correct language.
- Mark requested/received writes timestamps.

Referral:

- Completed booking request can generate referral.
- Completed booking code can generate referral.
- Referral link copies.
- `/r/ref/CODE` redirects with UTM values.
- Disabled code does not validate as active.
- Booking request after a referral visit stores referral attribution.

Abandoned tracking:

- Fast request starts one journey.
- Booking form starts one journey.
- Gift Card form starts one journey.
- Closing/interruption after interaction emits one abandon event.
- WhatsApp recovery uses the same journey when previously abandoned.
- Submit success prevents later abandon.

## 15. Known limitations / future work

Not implemented in Patch 3 by design:

- Partner commissions.
- Partner referral settlement.
- Dynamic pricing.
- Content hub CMS.
- Public SEO article routes.
- Bundle splitting.
- Route-level lazy loading.
- Public/admin codebase separation.

The Vite bundle remains above 500 kB. That warning should be handled later in the planned bundle-splitting patch, not in this operational Patch 3.
