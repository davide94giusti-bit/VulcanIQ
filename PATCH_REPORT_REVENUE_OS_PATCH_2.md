# PATCH REPORT - Revenue OS Patch 2

## 1. Summary
Implemented the Revenue OS Patch 2 requested in `Pasted text.txt` with targeted UI fixes, mobile booking-flow changes, finance reversal handling, booking-code revenue confirmation, CRM controls, and a revenue dashboard layer.

## 2. UI fixes completed
- Desktop hero CTA layout adjusted so `Gift card` uses the same desktop grid sizing as `Prenota ora / Book now` and `Prenota con codice / Book with code`.
- `Inizia il questionario` is centered inside the contact/questionnaire card.
- Availability/toggle active states now force readable white text instead of blacked-out selected fields.
- Mobile header `Menu` and `EN/IT` button styling normalized.
- WhatsApp/contact sticky-bar text and icons force white where the button background is dark/orange.
- Admin visual editor dark toolbar text corrected for contrast.
- Destructive review/delete buttons now force white text on red backgrounds.

## 3. Mobile Book Now / fast request behavior
- Removed the mobile `Rapida / Fast` sticky-bar button.
- Mobile `Prenota ora / Book now` now opens the fast request as a full-page modal.
- Desktop `Prenota ora / Book now` keeps the existing behavior and routes to experiences.
- Fast request analytics now include `source_section`, `source_cta`, `cta_location`, and `flow_type`.

## 4. Finance reversal logic
- Added finance ledger support for `status`, `source_type`, `source_id`, `booking_code_id`, `reversal_of`, `recognized_at`, `cancelled_at`, `reversed_at`, and admin income confirmation fields.
- Declined/cancelled booking requests now void expected/pending finance entries or create a negative reversal for confirmed entries.
- Reversal logic avoids duplicate reversals by checking `reversal_of` first.
- Finance summaries exclude cancelled/void entries and separate expected income from confirmed income.

## 5. Booking-code revenue confirmation model
- Booking-code redemption now creates expected/pending finance only.
- Redeemed booking codes show `income not confirmed` warnings in admin.
- Admin booking-code actions added:
  - Mark completed
  - Confirm income
  - No-show
  - Cancel redeemed code
- Confirmed revenue is recognized only after admin income confirmation.

## 6. Gift-card language fix
- Public language is now initialized from `?lang=`, then persisted in `localStorage`.
- Gift Card hero CTA preserves the current language with `/gift-card?lang=it|en` and SPA navigation.
- Refreshing a public route keeps the selected language.

## 7. Admin default pending requests behavior
- `/admin` now defaults to `/admin/requests`.
- Request filters default to `status=pending`.
- `In attesa / Pending` remains the default open compact accordion.

## 8. Admin users mobile/details behavior
- Large Supabase Auth instruction block is hidden by default behind `Dettagli aggiunta utente / User creation details`.
- `/admin/users` table converts to mobile cards under 760px.
- Role select and active/deactivate actions are mobile-safe and no longer force horizontal overflow.

## 9. CRM fields implemented
- Request cards now include a compact CRM panel with:
  - Lead status
  - Priority
  - Next follow-up date
  - Expected value
  - Quoted amount
  - Lost reason
  - Internal notes
- CRM changes are saved through `updateBookingRequest` and tracked with:
  - `lead_status_changed`
  - `lead_follow_up_set`
  - `lead_value_updated`

## 10. Revenue dashboard implemented
- Requests page now includes CRM/revenue cards for:
  - Confirmed revenue
  - Expected pipeline
  - Average booking value
  - Lead conversion
  - Due/overdue follow-ups
  - High priority leads
- Includes simple breakdowns:
  - Revenue by source
  - Revenue by experience
- Booking-code-sourced requests are excluded from confirmed website revenue to avoid mixing external-code revenue with website form revenue.

## 11. Review/referral status
- Existing review foundations were preserved.
- Booking-code lifecycle remains review-enabled after redemption.
- No destructive changes were made to review submission or duplicate-review prevention.
- Full referral-code admin UX was not expanded in this patch beyond existing scaffolding.

## 12. Abandoned form recovery status
- Fast request still tracks start, step completion, abandon, WhatsApp click, and submit success.
- Full journey-level abandon/recovery analytics was not expanded beyond the existing fast request event layer in this patch.

## 13. Partner commissions status
- Existing partner/referral scaffolding was preserved.
- No new commission UI was added in this patch.

## 14. Content hub status
- No public thin/placeholder SEO pages were published.
- Existing site content behavior was preserved.

## 15. Dynamic pricing status
- Existing dynamic-pricing scaffolding was preserved.
- No public exact-price display was introduced.

## 16. Gift Card v2 status
- Added database scaffold for `gift_card_requests` with lifecycle statuses:
  - new
  - contacted
  - quoted
  - paid
  - issued
  - cancelled
- Public Gift Card remains request-only and does not imply payment collection.

## 17. Bundle split status
- No route-level lazy loading was added in this patch.
- Build still reports a large bundle warning; this is non-blocking and remains a future code-splitting task.

## 18. Files changed
- `src/main.jsx`
- `src/styles.css`
- `src/services/bookingCodes.js`
- `src/services/bookingRequests.js`
- `src/services/financeService.js`
- `supabase/migrations/20260706_revenue_os_patch_2.sql`
- `PATCH_REPORT_REVENUE_OS_PATCH_2.md`

## 19. Database migrations added
- `supabase/migrations/20260706_revenue_os_patch_2.sql`

Run this migration before deploying the updated frontend because the frontend now reads new booking-code and finance columns.

## 20. Build result
`npm run build` passed.

Output note: Vite still emits the existing large chunk warning for the main app bundle.

## 21. Conflict check result
Conflict marker check passed:

```txt
grep -RInE '^(<<<<<<<|=======|>>>>>>>)' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git .
```

No merge conflict markers found.

## 22. Manual setup required
1. Apply the new Supabase migration:
   `supabase/migrations/20260706_revenue_os_patch_2.sql`
2. Deploy the frontend after migration.
3. Verify booking-code redemption after schema reload.
4. Confirm that finance summaries show expected vs confirmed income correctly.

## 23. Post-deploy test checklist
- Desktop hero Gift Card width matches the other hero CTAs.
- Questionnaire start button is centered.
- Availability selected tab text remains readable.
- Mobile sticky bar shows only Call / WhatsApp / Email.
- Mobile Book Now opens full-page fast request.
- English language stays English after clicking Gift Card.
- Admin Users page is mobile-readable and details are hidden by default.
- `/admin` opens pending booking requests.
- Declining/cancelling a booking request voids/reverses linked finance.
- Redeeming a booking code creates expected income, not confirmed income.
- Admin can mark booking code completed and confirm income manually.
- Requests CRM fields save and refresh.
