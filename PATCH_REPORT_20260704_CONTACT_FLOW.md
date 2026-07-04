# vulcanIQ contact-flow cleanup patch — 2026-07-04

## Scope implemented

- Removed the public homepage entry points for `Contattaci` and `Trova l'esperienza corretta` from the hero CTA grid.
- Cleaned the menu `Contattaci` page so it starts directly with the `Modulo contatto` questionnaire card.
- Kept desktop direct contact actions below the contact card only.
- Hid duplicate in-page contact actions on mobile, preserving the existing sticky bottom bar.
- Rebuilt fixed-excursion WhatsApp/request messages so selected fixed excursion context is preserved.
- Fixed the mobile calendar `Richiedi informazioni` action to use its own explicit request-form handler and prevent event propagation.
- Moved fixed-excursion leaflet/brochure previews to the top of fixed-excursion detail cards.
- Added stop-propagation protection to brochure/leaflet open actions.
- Reused the reviews filter visual style for the collaborations filter.
- Extended booking/contact tracking metadata for fixed-excursion ID, selected time, selected date, and experience name.

## Main files changed

- `src/main.jsx`
- `src/styles.css`

## Validation

```txt
npm run build
```

Result: passed.

Notes: Vite emitted the existing large-chunk warning for the main bundle. This is not a build failure.

```txt
grep -RIn --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git -E '^(<<<<<<<|=======|>>>>>>>)' .
```

Result: no conflict markers found.
