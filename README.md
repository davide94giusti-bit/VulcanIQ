# vulcanIQ website + two-owner booking admin

Vite + React public website for **vulcanIQ**, a premium Mount Etna experiential tourism brand, with an optional free Supabase layer for owner-managed booking requests, private availability, fixed excursions, blocked-date calendar files, public partnerships, and booking-code validated public reviews.

The site remains deployable on Netlify/Cloudflare-compatible static hosting and does not add paid services, payments, SMS, WhatsApp Business API, customer accounts, invoices, Google Calendar sync, or analytics.

## What changed in this update

- Reworked the public site into a page-like navigation model instead of one continuous long landing page.
- Header buttons now switch directly between: Home, Experiences, Upcoming excursions, Partnerships, About us, Mission, Reviews, and Contact.
- Restored the Mission and Vision content in Italian and English.
- Removed decorative image captions/notes from the visible UI while keeping useful alt text.
- Refined the logo treatment so the public logo is subtle, top-left only, with no oversized central hero/footer branding.
- Added a public **Upcoming excursions** page driven by admin-created fixed excursions.
- Expanded fixed excursions with title, description, meeting point, difficulty, price note, optional end time, capacity, and active state.
- Added admin-created **Partnerships / Collaborazioni** with public display through a safe view.
- Removed the unwanted reviews phrase from Italian and English.
- Added justified alignment for paragraph and body-copy text while keeping buttons, headings, forms, and navigation clean.
- Added optional blocked-date calendar uploads for fixed excursions: PDF, JPEG, PNG, or WEBP through Supabase Storage.
- Added booking-code generation on accepted requests and public review submission validated by that unique code.
- Accepted requests can now be cancelled/removed without hard-deleting, so fixed-excursion capacity recalculates correctly.
- Approved, declined, cancelled, and archived request lists are now collapsible in admin request history.

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

Netlify settings:

- Build command: `npm run build`
- Publish directory: `dist`
- Node version: any supported Node `>=18 <23`

## Environment variables

The public site builds and renders without Supabase credentials. Without Supabase:

1. private availability falls back to `/public/availability.json`, then `src/data/availability.js`;
2. fixed excursions are empty;
3. partnerships are empty;
4. public review submission and admin database features remain disabled until Supabase is configured;
5. `/admin` shows a setup warning.

To enable booking/admin features, add these browser-safe variables locally and in Netlify:

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

Only authenticated users listed as active owners/managers in `admin_profiles` can access admin data.

## Supabase setup

Read:

- [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md)
- [`supabase/schema.sql`](supabase/schema.sql)

High-level flow:

1. Create a free Supabase project.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to Netlify.
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

Public visitors can insert `booking_requests`; they cannot read customer requests. Owners can read/update requests, cancel accepted requests, manage availability, fixed excursions, partnerships, and reviews through RLS-protected tables. Public review submission is handled through a Supabase RPC that validates booking codes without exposing private booking data.

## Deployment checklist

1. Run `npm install`.
2. Run `npm run build`.
3. Push the project to GitHub.
4. Connect the repository to Netlify.
5. Set build command `npm run build` and publish directory `dist`.
6. Add Supabase env vars in Netlify.
7. Run the Supabase schema.
8. Add the approved owner users to `admin_profiles`.
9. Deploy.
10. Test public page switching, mobile dropdown navigation, language switch, fixed excursion requests, blocked-date file display, partnership display, form submission, review submission with a booking code, admin login, approval/decline/cancel, collapsible request lists, and RLS.
