# PATCH REPORT - Revenue OS Patch 3.1.1

## 1. Summary
Implemented a focused Patch 3.1.1 production hotfix for analytics validation, Book Now CTA behavior, duplicate contact CTA rendering, mobile fast-request layout, and remaining visual-editor contrast issues.

## 2. Analytics 400/403 fix
- Synchronized the Cloudflare/API analytics event allowlist in `functions/api/analytics/event.js` with the frontend allowlist in `src/analytics.js`.
- Added Patch 3.1 Gift Card events to the API-side allowlist, including:
  - `gift_card_questionnaire_started`
  - `gift_card_questionnaire_step_completed`
  - `gift_card_whatsapp_request_clicked`
- Preserved existing form-journey events, including:
  - `form_journey_started`
  - `form_field_started`
  - `abandoned_form_detected`
  - `abandoned_form_recovered_whatsapp`
  - `form_submit_success`
- Updated frontend analytics delivery so direct Supabase fallback is not attempted after API client/validation responses `400`, `401`, `403`, or `404`.
- Direct Supabase fallback is now reserved for network or server-side failure paths.

## 3. Desktop Book Now behavior alignment
- Updated the hero `Book Now` handler so desktop and mobile both open the same Fast Request modal.
- Removed the desktop-only redirect to the excursions page from the hero Book Now CTA.
- Updated the Fast Request modal tracking location from `mobile_book_now` to `hero_book_now` for this hero CTA path.

## 4. Duplicate contact CTA removal
- Removed the redundant lower contact CTA row below the contact card.
- Kept the intended contact CTA row inside the contact card.
- Added CSS protection to keep `.desktop-contact-actions-below-card` hidden if any legacy markup is reintroduced.

## 5. Mobile fast-request layout fix
- Added inline Close/Chiudi actions inside Fast Request modal action rows.
- On mobile, the top header Close button is hidden and the inline Close button appears under the Continue/primary action.
- Desktop keeps the normal top modal close behavior.

## 6. Visual editor contrast fix
- Added targeted CSS overrides for public/admin visual editor toolbar badges.
- Fixed pale `EDIT WEBSITE` / `EDIT ADMIN PANEL` kicker badges so text is dark/red on the pale background.
- Preserved white text for dark toolbar labels and dark text inside white select/input controls.

## 7. Files changed
- `src/main.jsx`
- `src/styles.css`
- `src/analytics.js`
- `functions/api/analytics/event.js`
- `PATCH_REPORT_REVENUE_OS_PATCH_3_1_1.md`

## 8. Build result
`npm run build` passed.

The existing Vite large chunk warning remains and is intentionally not addressed in this hotfix.

## 9. Conflict-marker check result
No conflict markers were found.

## 10. Manual test checklist
Manual browser testing still recommended in production/staging:

- Desktop hero Book Now opens Fast Request modal instead of navigating to excursions.
- Mobile Book Now still opens Fast Request modal.
- Fast Request mobile layout shows Continue above Close.
- Contact section shows only one row of Call / WhatsApp / Email inside the card.
- Gift Card questionnaire events no longer produce API 400 responses.
- API 400/401/403/404 analytics responses do not trigger direct Supabase fallback 403 noise.
- Public and admin visual editor badges are readable.

## 11. Known limitations
- Partner commissions remain Patch 4.
- Dynamic pricing remains Patch 5.
- Content Hub / SEO CMS remains Patch 6.
- Bundle splitting remains Patch 7.
- The Vite large chunk warning remains for Patch 7.
