# vulcanIQ landing page + free owner booking admin

Vite + React landing page for **vulcanIQ**, an Etna-based experiential tourism brand.

The project is still a static Netlify site, now extended with an optional free Supabase layer for owner-managed booking requests and public availability.

## What is included

- Public bilingual Italian/English landing page
- Availability calendar with Supabase-first loading and JSON/local fallback
- Public contact/request form that can insert pending `booking_requests`
- Owner-only admin area at `/admin`
- Supabase Auth login at `/admin/login`
- Protected owner routes for Today, Upcoming, and Availability
- Manual booking requests for WhatsApp, phone, email, or in-person enquiries
- Request approval/decline flow
- Optional availability block creation during approval
- Manual date blocking / limited / on-request availability
- Generated WhatsApp/email/copy reply helpers
- No paid services, payments, SMS, WhatsApp Business API, or customer accounts

## Commands

```bash
npm install
npm run build
npm run dev
```

Netlify settings:

- Build command: `npm run build`
- Publish directory: `dist`

## Environment variables

The public site builds and renders without Supabase credentials. In that case:

1. the public calendar uses `/public/availability.json`, then `src/data/availability.js`
2. the public request form shows fallback instructions to contact via WhatsApp/email
3. `/admin` shows a setup warning

To enable the free booking/admin system, add these variables locally and in Netlify:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Do **not** expose the Supabase service role key in browser JavaScript.

A future Netlify Function may use this server-only variable if needed:

```bash
SUPABASE_SERVICE_ROLE_KEY=
```

## Admin URL

- Login: `/admin/login`
- Main owner dashboard: `/admin` or `/admin/today`
- Upcoming accepted bookings: `/admin/upcoming`
- Availability: `/admin/availability`
- Optional full request filter page: `/admin/requests`

Only authenticated users listed as active owners/managers in `admin_profiles` can access admin data.

## Supabase setup

Read:

- [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md)
- [`supabase/schema.sql`](supabase/schema.sql)

High-level flow:

1. Create a free Supabase project.
2. Copy URL and anon public key.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to Netlify.
4. Run `supabase/schema.sql` in the Supabase SQL editor.
5. Create the two Auth users for the sister and her boyfriend / co-owner.
6. Insert both users into `admin_profiles` with `role = 'owner'` and `active = true`.
7. Test `/admin/login`.
8. Confirm public users can insert booking requests but cannot read them.

## Availability fallback order

The public calendar loads availability in this order:

1. Supabase `public_availability_blocks` view, if Supabase is configured and reachable
2. `/availability.json`
3. local `src/data/availability.js`

Public users read only the safe view fields:

- `id`
- `date`
- `status`
- `experience_id`
- `reason_it`
- `reason_en`
- `active`

Internal notes and owner IDs are never selected by the public calendar UI.

## Image slots

Replace the placeholder slots with real documentary-style Etna photography:

- `public/images/etna-eruption-hero.jpg`
- `public/images/etna-live-pov.jpg`
- `public/images/etna-safety-landscape.jpg`
- `public/images/etna-gallery-01.jpg`
- `public/images/etna-gallery-02.jpg`
- `public/images/etna-gallery-03.jpg`
- `public/images/co-owner.jpg`

The uploaded co-owner portrait has already been saved as `public/images/co-owner.jpg`.

## Contact data

- Leonardo Chiavetta
- Phone / WhatsApp: `+393349298246`
- Email: `leo97ct@yahoo.it`
- Instagram: `https://www.instagram.com/leonardo_chiavetta?igsh=bnhkNWQzbnF2aW5m`

## Owner guide

Read [`docs/OWNER_GUIDE.md`](docs/OWNER_GUIDE.md) for non-technical owner usage instructions.


## Publishing checklist

Recommended production flow:

1. Put the unzipped project in a private GitHub repository, for example `vulcaniq-website`.
2. Create a Netlify site from that GitHub repository.
3. Set Netlify build command to `npm run build`.
4. Set Netlify publish directory to `dist`.
5. Create a Supabase project.
6. Run `supabase/schema.sql` in the Supabase SQL editor.
7. Create exactly the two owner Auth users.
8. Add both Auth user IDs to `admin_profiles`.
9. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify environment variables.
10. Deploy.
11. Connect the custom domain.
12. Test the public form, `/admin/login`, `/admin/today`, `/admin/upcoming`, request approval, and public calendar update from mobile.
