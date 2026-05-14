# vulcanIQ website + two-owner booking admin

Vite + React public website for **vulcanIQ**, a premium Mount Etna experiential tourism brand, with an optional free Supabase layer for owner-managed booking requests, private availability, and fixed excursions.

The site remains deployable on Netlify and does not add paid services, payments, SMS, WhatsApp Business API, customer accounts, invoices, Google Calendar sync, or analytics.

## What is included

- Shorter bilingual Italian/English public website with visual cards, tabs, accordions, and restrained Apple-style scrolling.
- New local media assets under `public/images/vulcaniq/` and `public/videos/vulcaniq/`.
- Hero video block using `public/videos/vulcaniq/intro.mp4`.
- Updated Etna Premium, Etna Stories, Etna Live, and Etna Learning cards with photography.
- Leonardo and Deborah public profile section using only the provided biographies.
- Public reviews/testimonials section.
- Public request flow for:
  - fixed excursions
  - private excursions
  - adults / children / children under 3
  - solo traveler / couple / family / group / company / school / other
  - group-over-12 guidance.
- Owner-only admin at `/admin` with Supabase Auth and `admin_profiles` authorization.
- Request approval/decline workflow where declined requests remain traceable in request history and recent decisions.
- Private availability blocks: closed, limited, on-request.
- Fixed excursions with date, optional start time, experience, capacity, notes, and active/inactive state.

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

1. the public private-availability calendar uses `/public/availability.json`, then `src/data/availability.js`;
2. fixed excursions are simply empty;
3. the public request form shows fallback contact guidance;
4. `/admin` shows a setup warning.

To enable booking/admin features, add these browser-safe variables locally and in Netlify:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Do **not** expose the Supabase service role key in frontend JavaScript.

## Public media assets

New assets are stored locally, with no external CDN dependency:

```text
public/images/vulcaniq/etna-premium.jpeg
public/images/vulcaniq/etna-stories.jpeg
public/images/vulcaniq/etna-live.jpeg
public/images/vulcaniq/etna-learning.jpeg
public/images/vulcaniq/leonardo-guide.jpeg
public/images/vulcaniq/etna-live-safe.jpeg
public/images/vulcaniq/landscape.jpeg
public/images/vulcaniq/lava-rock.jpeg
public/images/vulcaniq/guide.jpeg
public/images/vulcaniq/natural-light.jpeg
public/videos/vulcaniq/intro.mp4
```

Compatibility copies are also present for older image references such as `public/images/etna-eruption-hero.jpg`.

## Admin URLs

- Login: `/admin/login`
- Today dashboard: `/admin` or `/admin/today`
- Upcoming accepted bookings: `/admin/upcoming`
- Request history and filters: `/admin/requests`
- Availability and fixed excursions: `/admin/availability`

Only authenticated users listed as active owners/managers in `admin_profiles` can access admin data.

## Supabase setup

Read:

- [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md)
- [`supabase/schema.sql`](supabase/schema.sql)

High-level flow:

1. Create a free Supabase project.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to Netlify.
3. Run `supabase/schema.sql` in the Supabase SQL editor.
4. Create the two owner Auth users.
5. Insert both users into `admin_profiles` with `role = 'owner'` and `active = true`.
6. Test `/admin/login`, public request insertion, request decline traceability, and fixed excursion creation.

## Public-safe data model

The public website reads only safe views:

- `public_availability_blocks`
- `public_fixed_excursions`

Public visitors can insert `booking_requests`; they cannot read customer requests. Owners can read/update requests and manage availability/fixed excursions through RLS-protected tables.

## Deployment checklist

1. Run `npm install`.
2. Run `npm run build`.
3. Push the project to GitHub.
4. Connect the repository to Netlify.
5. Set build command `npm run build` and publish directory `dist`.
6. Add Supabase env vars in Netlify.
7. Run the Supabase schema.
8. Add exactly the approved owner users to `admin_profiles`.
9. Deploy.
10. Test mobile public site, language switch, form, fixed/private request modes, admin login, approval, decline, and fixed excursion creation.
