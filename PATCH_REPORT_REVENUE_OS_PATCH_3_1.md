# PATCH REPORT - Revenue OS Patch 3.1

## 1. Summary
Implemented the focused Patch 3.1 production stabilization layer on top of the tested Revenue OS Patch 3 codebase.

This patch addresses:
- Mobile sticky contact button color hierarchy.
- Contact form layout and button contrast.
- Hero Gift Card CTA width.
- Gift Card request flow as a full-page guided popup.
- Removal of the old Gift Card explanatory copy.
- Admin visual editor contrast fixes.
- Editable hero CTA labels for Book With Code and Gift Card.

No online Gift Card payment, partner commission logic, dynamic pricing, content hub, or bundle splitting was added.

## 2. Mobile sticky button color fix
Updated the mobile sticky contact bar so:
- Call remains dark/blue.
- WhatsApp is the only orange action.
- Email remains dark/blue.
- Text and icons are forced to readable white.

## 3. Contact form layout fix
Updated the contact/questionnaire entry card so:
- `Start the questionnaire` sits on the same row as `Prepare your request` on desktop.
- Call / WhatsApp / Email actions are moved into the card content area below the intro text.
- Button text is forced readable on dark buttons.
- Mobile stacks the actions cleanly.

## 4. Hero Gift Card CTA sizing fix
Updated the desktop hero CTA grid so:
- Book Now and Book With Code remain equal width on the first row.
- Gift Card spans the same full width as the Certified Volcanological Guide trust pill.
- Mobile remains stacked and full width.

## 5. Gift Card guided popup workflow
Replaced the direct Gift Card form/page with a full-page guided request popup.

Flow:
1. Intro screen.
2. Start questionnaire.
3. One guided step at a time.
4. Progress indicator.
5. Review step.
6. Final actions only on the final step:
   - Send Gift Card request via website.
   - Send Gift Card request via WhatsApp.

Validation included:
- Buyer name required.
- At least one contact method required.
- Recipient name required.
- Experience/interest required.
- Budget optional, but validated when present.

## 6. Removed Gift Card copy
Removed the previous public Gift Card copy describing the first version as request-only via WhatsApp.

The new intro uses the requested copy:
- Gift a Mount Etna experience / Regala un’esperienza sull’Etna.
- How it works / Come funziona.
- Manual confirmation and external payment after team contact.
- Best for couples, families, birthdays, anniversaries, graduations, and company gifts.

## 7. Admin visual editor contrast fixes
Added targeted contrast overrides for the admin and public visual-editor toolbars:
- Dark toolbar labels are white.
- White select/input controls have dark text.
- Toolbar buttons are readable.
- Editor badges are readable over preview content.

## 8. Editable hero CTA labels
Added missing editable content definitions and rendering for:
- `home.hero.cta.book_with_code`
- `home.hero.cta.gift_card`

Existing editable keys were preserved for Book Now and the certified guide badge.

## 9. Files changed
- `src/main.jsx`
- `src/styles.css`
- `src/analytics.js`
- `PATCH_REPORT_REVENUE_OS_PATCH_3_1.md`

## 10. Build result
Command run:

```bash
npm run build
```

Result:

```txt
Build passed.
Vite large chunk warning remains.
```

## 11. Conflict check result
Command run:

```bash
git grep -n -E "^(<<<<<<<|=======|>>>>>>>)"
```

Result:

```txt
No conflict markers found.
```

## 12. Frontend secret check result
Command run:

```bash
grep -RIn --include='*' -E 'service_role|SUPABASE_SERVICE|PRIVATE_KEY' src
```

Result:

```txt
No service-role/private key strings found in src.
```

## 13. Manual test checklist
Recommended before deployment:

### Public desktop
- Hero Book Now and Book With Code are equal width.
- Hero Gift Card spans full CTA width.
- Certified Volcanological Guide remains full width and readable.
- Gift Card opens the new guided full-page popup.
- Contact form shows Start Questionnaire top-right.
- Contact action buttons are inside the card and readable.

### Public mobile
- Only WhatsApp is orange in the sticky bar.
- Call and Email are dark/blue.
- Gift Card popup fills the screen cleanly.
- Gift Card stepper is usable on iPhone Safari and Android Chrome.
- Final website/WhatsApp Gift Card actions appear only on the review step.

### Gift Card
- Old unwanted Gift Card paragraph is gone.
- Intro screen uses the requested copy.
- Progress indicator updates.
- Website submit creates a Gift Card request.
- WhatsApp action opens a prepared request message.
- Admin Gift Card workflow remains unchanged.

### Admin visual editor
- Toolbar text is readable.
- Dropdown selected text is readable.
- Editor badges are readable.
- Book With Code and Gift Card hero CTA labels are editable.

### Regression
- Book Now still works.
- Book With Code still works.
- Public booking request still works.
- Contact questionnaire still works.
- Gift Card admin workflow still works.
- Review/referral Patch 3 workflows still work.

## 14. Known limitations
- Vite large chunk warning remains for a later performance/code-splitting patch.
- No online Gift Card payment added.
- Partner commissions remain outside this patch.
- Dynamic pricing remains outside this patch.
- Content hub remains outside this patch.
