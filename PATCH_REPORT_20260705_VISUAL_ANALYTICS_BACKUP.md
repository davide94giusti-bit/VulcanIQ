# Patch report — 2026-07-05 visual, analytics, and backup cleanup

## Completed changes

### Visual regression cleanup
- Restored readable white/light text over dark public hero, header, footer, mobile sticky bar, hero CTA, certified-guide card, contact action pills, and admin dark navigation surfaces.
- Fixed social card icon contrast by forcing SVG/path fill to white inside dark icon tiles.
- Kept scoped overrides instead of changing global color variables.

### Analytics overview/details
- Reworked analytics warning copy into concise overview summaries.
- Added `Analytics details / Dettagli analytics` button.
- Added full-page analytics details modal with:
  - warning explanations
  - UTM examples
  - data-quality table
  - funnel diagnostics
  - request tracking integrity
  - mobile funnel
  - attribution-quality table
- Kept website-form and booking-code diagnostics separated.

### Latest-news CTA alignment
- Centered the `Apri le notizie live / Open live news` CTA inside the latest-news action card.
- Kept mobile behavior full-width for the button.

### Backup status consistency
- Stopped showing `No backup` when the latest GitHub Actions workflow completed successfully.
- Split backup concepts into:
  - latest completed backup
  - download availability
  - last workflow status
  - schedule
  - storage availability
- Disabled direct download when no downloadable ZIP artifact is available.
- Added specific helper copy for the case `workflow success + no downloadable artifact`.
- Refined backend backup error copy for `no_backup_artifacts` vs `no_successful_backup_runs`.

## Files changed
- `src/main.jsx`
- `src/styles.css`
- `functions/api/admin/backup/_shared.js`
- root compatibility copies: `main.jsx`, `styles.css`

## Verification
- `npm run build` passed.
- Conflict-marker check passed with no source conflicts.

## Remaining note
- Vite still reports the existing large bundle-size warning. This is not caused by this patch.
