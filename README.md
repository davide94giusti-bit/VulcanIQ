# vulcanIQ website + two-owner booking admin

Vite + React public website for **vulcanIQ**, a premium Mount Etna experiential tourism brand, with an optional free Supabase layer for owner-managed booking requests, private availability, fixed excursions, blocked-date calendar files, public partnerships, and booking-code validated public reviews.

The site is configured for Cloudflare Pages deployment and does not add paid services, payments, SMS, WhatsApp Business API, customer accounts, invoices, or Google Calendar sync.

## What changed in this update

- Reworked the public site into a page-like navigation model instead of one continuous long landing page.
- Header buttons now switch directly between: Home, Experiences, Upcoming excursions, Partnerships, About us, Mission, Reviews, and Contact.
- Restored the Mission and Vision content in Italian and English.
- Removed decorative image captions/notes from the visible UI while keeping useful alt text.
- Refined the logo treatment so the public logo is subtle, top-left only, with no oversized central hero/footer branding.
- Added a public **Upcoming excursions** page with a monthly calendar and green markers for admin-created fixed excursions.
- Expanded fixed excursions with title, description, meeting point, difficulty, price note, optional end time, capacity, and active state.
- Added admin-created **Partnerships / Collaborazioni** with image upload support and public display through a safe view.
- Removed the unwanted reviews phrase from Italian and English.
- Added justified alignment for paragraph and body-copy text while keeping buttons, headings, forms, and navigation clean.
- Added optional blocked-date calendar uploads for fixed excursions: PDF, JPEG, PNG, or WEBP through Supabase Storage.
- Added booking-code generation on accepted requests and public review submission validated by that unique code.
- Accepted requests can now be cancelled/removed without hard-deleting, so fixed-excursion capacity recalculates correctly.
- Approved, declined, cancelled, and archived request lists are now collapsible in admin request history.
- Added an admin operational calendar with green fixed-excursion markers, red accepted-booking markers, date-detail panels, and inline edit modals.
- Added monthly leaflet uploads linked to multiple fixed excursion dates.
- Added a site media manager for replacing public images and videos from the admin dashboard.
- Redesigned reviews with a modal submission flow and booking-code validation.

## Build commands

```bash
npm install
npm run build
```

Optional local preview/development:

```bash
npm run dev
npm run preview
```

Cloudflare Pages settings:

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: `20` or `22`

## Environment variables

The public site builds and renders without Supabase credentials. Without Supabase:

1. private availability falls back to `/public/availability.json`, then `src/data/availability.js`;
2. fixed excursions are empty;
3. partnerships are empty;
4. public review submission and admin database features remain disabled until Supabase is configured;
5. `/admin` shows a setup warning.

To enable booking/admin features, add these browser-safe variables locally and in Cloudflare Pages:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Do **not** expose the Supabase service role key in frontend JavaScript.

## Public and brand assets

Brand assets:

```text
public/brand/vulcaniq/logo-blue-background.png
public/brand/vulcaniq/og-image.png
```

Experience media remains local under:

```text
public/images/vulcaniq/
public/videos/vulcaniq/intro.mp4
```

Do not replace the Etna photos/videos with the logo. The logo is used only for brand identity areas.

## Admin URLs

- Login: `/admin/login`
- Today dashboard: `/admin` or `/admin/today`
- Upcoming accepted bookings: `/admin/upcoming`
- Request history and filters: `/admin/requests`
- Availability and fixed excursions: `/admin/availability`
- Partnerships: `/admin/partnerships`
- Calendar: `/admin/calendar`
- Media manager: `/admin/media`

Only authenticated users listed as active owners/managers in `admin_profiles` can access admin data.

## Supabase setup

Read:

- [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md)
- [`supabase/schema.sql`](supabase/schema.sql)

High-level flow:

1. Create a free Supabase project.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to Cloudflare Pages.
3. Run `supabase/schema.sql` in the Supabase SQL editor.
4. Create the owner Auth users.
5. Insert both users into `admin_profiles` with `role = 'owner'` and `active = true`.
6. Test `/admin/login`, public request insertion, fixed excursion creation, partnership creation, and RLS access.

## Public-safe data model

The public website reads only safe views:

- `public_availability_blocks`
- `public_fixed_excursions`
- `public_partnerships`
- `public_reviews`
- `public_site_media`

Public visitors can insert `booking_requests`; they cannot read customer requests. Owners can read/update requests, cancel accepted requests, manage availability, fixed excursions, monthly leaflets, site media, partnerships, and reviews through RLS-protected tables. Public review submission is handled through a Supabase RPC that validates booking codes without exposing private booking data.

## Deployment checklist

1. Run `npm install`.
2. Run `npm run build`.
3. Push the project to GitHub.
4. Connect the repository to Cloudflare Pages.
5. Set framework preset `Vite`, build command `npm run build`, and build output directory `dist`.
6. Add Supabase environment variables in Cloudflare Pages.
7. Run the Supabase schema.
8. Add the approved owner users to `admin_profiles`.
9. Deploy.
10. Test public page switching, mobile dropdown navigation, language switch, fixed excursion requests, public fixed-date calendar markers, monthly leaflet upload/linking, blocked-date file display, partnership image display, site media replacement, form submission, review modal submission with a booking code, admin login, approval/decline/cancel, admin calendar editing, collapsible request lists, and RLS.

## Implementation review update

This build includes the requested implementation-review changes:

- Mission page layout refactored into balanced Mission/Vision, image, and principles sections.
- Reviews page redesigned with visible non-overlapping publish button and sorting controls.
- Admin calendar modal made opaque and updated with booked guest details for fixed excursions.
- Admin navigation alignment improved, including `Sito pubblico` / `Public site`.
- Admin archive and past-experience areas added across requests, availability, fixed excursions, and upcoming bookings.
- New `Finanze / Finance` admin section for income, expenses, linked bookings/excursions, filters, and summary cards.
- New `Contenuti / Content` admin section for bilingual public website copy with safe static fallbacks.
- Supabase schema extended with `site_content`, `finance_entries`, lifecycle columns, public-safe views, grants, and RLS policies.

Build verified with:

```bash
npm install
npm run build
```

## Controlled visual website editor

This update replaces the old form-only **Admin → Edit website / Modifica sito** area with a controlled visual editor.

Admins can now:

- choose the public page to preview: Home, Experiences, Upcoming excursions, Partnerships, About us, Mission, Reviews, or Contact;
- switch preview language between IT and EN;
- switch device preview between desktop, tablet, and mobile;
- click editable text directly in the live preview;
- click editable public images, including the main logo, hero media, experience images, mission image, and team images;
- edit Italian and English text side by side in the inspector;
- use safe style controls only: text size, text style, alignment, image position, image size, visibility, reset, discard, and save;
- save a selected item or save all local draft changes.

The editor is intentionally not a free drag-and-drop builder. It does not expose arbitrary CSS, free positioning, custom z-indexes, color pickers, or font uploads. The public site continues to use static fallbacks if Supabase is missing or if no admin-edited content exists.

## Current official logo

The official project logo asset is now:

```text
public/brand/vulcaniq/vulcaniq-logo-premium.png
```

The browser icon uses:

```text
public/brand/vulcaniq/favicon.png
```

The Open Graph image uses:

```text
public/brand/vulcaniq/og-image.png
```

The public header, mobile header, admin login, admin dashboard, and visual editor preview all use the same black-and-gold vulcanIQ logo treatment. The old blue-background logo file is left in the repository for safety, but it is no longer referenced by the normal UI.

## Admin Analytics / Dati

This build adds a free privacy-first **Admin → Dati / Analytics** tab.

The in-app analytics dashboard uses first-party Supabase tables as the source of truth:

- `analytics_events`
- `analytics_sessions`

The public website tracks only anonymous operational events such as page views, language switches, excursion views, booking-form opens, successful booking submissions, WhatsApp/email/phone clicks, Google Maps clicks, review views, and session heartbeat/end events. Admin dashboard activity is excluded from public analytics.

Analytics ingestion order:

1. Cloudflare Pages Function: `/api/analytics/event` from `functions/api/analytics/event.js`.
2. Direct Supabase anon-key insert fallback for events and initial sessions only, used only if the same-origin Cloudflare endpoint is unavailable.

Required Supabase migration:

```text
supabase/migrations/20260608_add_analytics_events.sql
```

Required server-side environment variables for the Cloudflare Pages ingestion endpoint:

```bash
SUPABASE_URL=your-project-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code. It must be set only in Cloudflare Pages environment variables for server-side Functions.

Optional Cloudflare Web Analytics support:

```bash
VITE_CLOUDFLARE_WEB_ANALYTICS_TOKEN=optional-token
```

If the optional token is absent, no Cloudflare Web Analytics script is injected. The admin Analytics tab does not depend on Cloudflare Web Analytics.

## Pre-modernization consolidation (2026-08-18)

Current architecture/operations references:

- `docs/ARCHITECTURE.md`
- `docs/SECURITY_MODEL.md`
- `docs/PLATFORM_CONSOLIDATION_AUDIT_20260818.md`
- `docs/SEO_AEO_AUDIT_20260818.md`
- `docs/GOOGLE_REVIEWS_SETUP.md`
- `docs/PERFORMANCE_MEDIA_AUDIT_20260818.md`

Quality gates:

```bash
npm run test:security
npm run test:analytics
npm run test:seo
npm run test:reviews
npm run build
```

`.npmrc` now permits creation of `package-lock.json`. Generate and commit the lockfile in a connected development environment, then prefer `npm ci` for deterministic CI/deploy installs.

The Google Business Profile review integration is intentionally non-blocking until owner-side Google API/OAuth setup is complete. First-party reviews continue to work independently.
