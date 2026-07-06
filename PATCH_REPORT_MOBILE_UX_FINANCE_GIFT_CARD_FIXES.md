# Patch Report — Mobile UX, Finance, Gift Card and Analytics Fixes

## Summary
Implemented the requested stabilization patch from `Pasted text.txt` against `repo-3-1-1-patch-4-implemented.zip`.

The patch focuses on mobile UX, gift-card validation and code generation, admin finance readability, date safety, booking-code layout, partner commission display cleanup, and analytics modal scrolling.

## Implemented changes

### 1. Footer Book Now routing
- Updated the footer Book Now CTA under the Etna / live news footer area.
- It now opens the canonical `FastRequestModal` booking/request flow instead of navigating only to the excursions tab/page.
- Preserves language and uses explicit booking tracking metadata:
  - `source_section: footer`
  - `source_cta: book_now`
  - `cta_location: footer_book_now`

### 2. Bottom contact button section
- Added mobile-safe grid styling for compact contact actions.
- Call, WhatsApp and Email now distribute evenly across the available width.
- WhatsApp remains orange; Call and Email use the matching dark/blue treatment.
- Added overflow protection for narrow mobile widths.

### 3. Menu and IT/EN visual parity
- Normalized Menu and language pill button styling through shared CSS overrides.
- Buttons now use the same background, border, shadow and text color treatment.

### 4. Gift-card form validation
- Buyer email now uses `type="email"`, `inputMode="email"`, and `autoComplete="email"`.
- WhatsApp / phone now uses `type="tel"`, `inputMode="tel"`, `autoComplete="tel"`, and a safe phone pattern.
- Phone input sanitizes invalid characters and prevents letters from being kept in state.
- Buyer step validates:
  - buyer name
  - at least one contact method
  - valid email when present
  - valid phone / WhatsApp number when present
- Validation messages are bilingual.

### 5. Gift-card keyboard stability
- Removed the render-cycle focus behavior that could refocus/remount the modal while typing.
- Modal focus is now performed only once on opening.
- Escape-key handling remains active without forcing focus after each character.

### 6. Gift-card navigation and scroll fixes
- Back and Next use a two-column footer grid.
- Review/final step keeps Back beside the final-action area.
- Gift-card modal now uses an internal scroll container with mobile `100dvh` handling.
- Added safe-area-aware bottom padding so final actions remain reachable on iPhone Safari.

### 7. Gift-card confirmation creates a recipient review code
- Added `ensureGiftCardReviewCode()` in `src/services/giftCards.js`.
- Admin status changes to `paid` or `issued` now ensure a single booking/review code exists.
- Gift-card code generation is idempotent:
  - existing code on request is reused
  - existing code linked by `gift_card_request_id` is reused
  - otherwise a new `GIFT-YYYYMMDD-XXXX` code is created
- Gift-card admin detail now displays the generated recipient code.
- Gift-card admin reply copy includes the recipient code when present.

### 8. Booking-code service extension
- Extended booking-code fields and creation payload to support:
  - `review_enabled`
  - `gift_card_request_id`
  - explicit status/completion/payment/income state inputs
- Added safe normalizers for booking-code state fields.

### 9. Supabase migration
Created:

```txt
supabase/migrations/20260706_gift_card_review_codes.sql
```

Migration adds:
- `booking_codes.gift_card_request_id`
- `gift_card_requests.booking_code_id`
- `gift_card_requests.booking_code`
- indexes and uniqueness protection for one code per gift-card request
- schema reload notification

It also normalizes legacy `source = 'gift_card'` codes to review-enabled, completed, paid, no-income codes where appropriate.

### 10. Past-date prevention
Added `min={todayIso()}` and/or validation to booking-related future date inputs:
- gift-card preferred delivery date
- fast request custom date
- public booking requested / alternative dates
- admin manual request requested / alternative dates
- admin booking-code scheduled / expiry dates
- calendar booking confirmed date
- availability block date
- fixed excursion creation and editing dates

Admin booking-code submission also blocks past scheduled or expiry dates manually entered into the form.

### 11. Admin generate-code mobile layout
- Added `booking-code-generator-form` styling.
- Inputs/selects/textareas now use `min-width: 0`, `max-width: 100%`, and mobile one-column behavior.
- Prevents date fields from overflowing the modal/card on narrow screens.

### 12. Partner commissions zero-badge cleanup
- Hid the Partner Commissions unpaid badge/pill when unpaid liability is zero.
- Hid the top finance summary card for partner commission liabilities when the value is zero.
- Retained the actual partner commission calculations and section functionality.

### 13. Finance metric typography
- Added responsive `clamp()` sizing for finance KPI values.
- Cards now protect against overflow with `min-width: 0`, nowrap, and scaled numeric typography.
- Improves mobile display for values such as `210,00 €`, `1.000,00 €`, and larger amounts.

### 14. Analytics details modal scrolling
- Updated analytics detail modal CSS so the modal itself is the scroll container.
- Removed problematic inner fixed/sticky header behavior.
- Added full-height mobile handling and opaque background to avoid ghost text overlap.
- Background remains visually separated from the modal content.

## Files changed

Primary files:

```txt
src/main.jsx
src/styles.css
src/services/bookingCodes.js
src/services/giftCards.js
supabase/migrations/20260706_gift_card_review_codes.sql
PATCH_REPORT_MOBILE_UX_FINANCE_GIFT_CARD_FIXES.md
```

## Verification

### Build

```txt
npm run build
```

Result:

```txt
Build passed.
```

Note: Vite still reports the existing large chunk warning. Bundle splitting was intentionally not implemented in this patch.

### Conflict marker check

```txt
grep -RInE '^(<<<<<<<|=======|>>>>>>>)' src main.jsx styles.css supabase
```

Result:

```txt
No conflict markers found.
```

### Frontend secret check

```txt
grep -RInE 'service_role|SUPABASE_SERVICE|PRIVATE_KEY' src main.jsx styles.css
```

Result:

```txt
No frontend service-role/private-key references found.
```

## Manual testing still recommended

Run these in production/staging mobile browsers after deployment:

1. Footer Book Now opens booking flow.
2. Call / WhatsApp / Email fill the bottom contact row.
3. Menu and IT/EN button backgrounds match.
4. Gift-card typing keeps the keyboard open.
5. Gift-card email and phone validation behave correctly.
6. Gift-card final review screen scrolls and shows all actions.
7. Admin confirms a gift-card request and sees one persistent recipient code.
8. Generate-code date fields stay within bounds on iPhone width.
9. Partner Commissions no longer shows `€0.00 unpaid`.
10. Finance KPI values do not overflow on mobile.
11. Analytics details modal scrolls cleanly without background ghosting.

## Known limitations

- No Content Hub / SEO CMS implemented.
- No bundle splitting implemented.
- No payment integration added.
- Vite large chunk warning intentionally remains unresolved.
