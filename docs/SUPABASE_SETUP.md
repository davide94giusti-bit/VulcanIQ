# Supabase setup for vulcanIQ

This guide enables the free owner-managed booking system, private availability calendar, fixed excursions, blocked-date file uploads, public partnerships, and booking-code validated public reviews.

## 1. Create a free Supabase project

1. Create a new Supabase project on the Free plan.
2. Save the database password securely.
3. Wait for provisioning to complete.

## 2. Add browser-safe credentials

In Supabase **Project Settings → API**, copy:

- Project URL
- anon public key

Set these locally and in Netlify:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Never put the service role key in frontend JavaScript.

## 3. Run the schema

1. Open Supabase **SQL Editor**.
2. Paste the full contents of `supabase/schema.sql`.
3. Run it.

The schema is written to be rerunnable where practical. It uses `create table if not exists`, `alter table add column if not exists`, safe policies, views, indexes, and `notify pgrst, 'reload schema';`.

The schema creates or updates:

- `admin_profiles`
- `booking_requests`
- `availability_blocks`
- `fixed_excursions`
- `partnerships`
- `reviews`
- Supabase Storage bucket `vulcaniq-public-assets`
- `activity_log`
- `public_availability_blocks`
- `public_fixed_excursions`
- `public_partnerships`
- `public_reviews`
- `submit_public_review()` RPC
- `is_admin()` helper
- triggers, indexes, constraints, grants, and RLS policies.

## 4. Booking requests

`booking_requests` supports both request modes:

- `request_type = 'private'`
- `request_type = 'fixed'`

Important fields:

- `request_type`
- `fixed_excursion_id`
- `party_type`
- `adults`
- `children`
- `children_under_3`
- `decision_note`
- `decided_at`
- `decided_by`

Allowed `party_type` values:

```text
solo, couple, family, group, company, school, other
```

Allowed request statuses:

```text
pending, accepted, declined, cancelled, archived
```

Declining a request updates it to `declined`; accepted requests can also be removed/cancelled, which updates them to `cancelled` and sets removal metadata. Requests are not hard-deleted by the app. When a request is accepted, the app generates a unique `booking_code` such as `VQ-2026-AB12` for review validation.

## 5. Fixed excursions table

`fixed_excursions` contains owner-created bookable dates:

- `id`
- `created_at`
- `updated_at`
- `date`
- `start_time`
- `end_time`
- `experience_id`
- `title_it`
- `title_en`
- `description_it`
- `description_en`
- `meeting_point_it`
- `meeting_point_en`
- `difficulty_it`
- `difficulty_en`
- `price_note_it`
- `price_note_en`
- `blocked_dates_file_url`
- `blocked_dates_file_name`
- `blocked_dates_file_type`
- `blocked_dates_file_path`
- `capacity` default `12`
- `active`
- `created_by`
- `updated_by`

The public reads only active fixed excursions through `public_fixed_excursions`, which exposes safe fields plus:

- `accepted_count`
- `places_remaining`

Accepted count is computed from accepted `booking_requests` linked to the fixed excursion. Cancelled/removed requests no longer count toward capacity.


## 6. Blocked-date file uploads

Fixed excursions can include an optional blocked-date or occupied-date calendar file. The app stores the file in Supabase Storage bucket:

```text
vulcaniq-public-assets
```

Accepted MIME types:

```text
application/pdf, image/jpeg, image/png, image/webp
```

The schema attempts to create/update the bucket and storage policies. If Supabase reports a storage permission issue, create the bucket manually in **Storage** with public read enabled, then rerun the policy section from `supabase/schema.sql`. Admin users can upload/update/delete; public visitors can only read published files.

## 7. Partnerships table

`partnerships` contains admin-created collaborations:

- `id`
- `created_at`
- `updated_at`
- `name`
- `description_it`
- `description_en`
- `website_url`
- `image_url`
- `category_it`
- `category_en`
- `active`
- `display_order`
- `created_by`
- `updated_by`

The public reads only active partnerships through `public_partnerships`. Public users cannot create or edit partnerships.

## 8. Availability blocks

`availability_blocks` manages private/general availability:

- `closed`
- `limited`
- `on-request`

The public website reads only the safe `public_availability_blocks` view. Internal notes and owner IDs are not exposed publicly.

## 9. Reviews and booking codes

The `reviews` table stores public reviews linked to a booking code. Public visitors cannot read private booking requests. Instead, the public form calls `submit_public_review()`, which:

1. normalizes the booking code;
2. checks that it belongs to an accepted booking;
3. blocks duplicate submissions by the same code;
4. inserts a public review;
5. marks the booking request as reviewed.

Public visitors read reviews only through `public_reviews`, which exposes safe fields and only active, approved reviews. Admin users can hide or republish reviews from the request management page.

## 10. RLS model

RLS is enabled on:

- `admin_profiles`
- `booking_requests`
- `availability_blocks`
- `fixed_excursions`
- `partnerships`
- `reviews`
- Supabase Storage bucket `vulcaniq-public-assets`
- `activity_log`

Security rules:

- Public users can insert website booking requests.
- Public users cannot read, update, or delete booking requests.
- Public users can read safe active availability/fixed-excursion/partnership/review views only.
- Public users submit reviews through the `submit_public_review()` RPC, not by direct table access.
- Active owners can read/update/create booking requests.
- Active owners can create/update/deactivate availability blocks.
- Active owners can create/update/deactivate fixed excursions.
- Active owners can create/update/deactivate partnerships.
- Active owners can hide/republish reviews.
- Active owners can upload/update/remove fixed-excursion blocked-date calendar files.
- Active owners can read admin profiles.

## 11. Create the owner users

In Supabase **Authentication → Users**:

1. Create the Leonardo owner user.
2. Create the Deborah owner user.
3. Copy both Auth UUIDs.

Then run:

```sql
insert into public.admin_profiles (user_id, full_name, role, active)
values
  ('00000000-0000-0000-0000-000000000000', 'Leonardo Chiavetta', 'owner', true),
  ('11111111-1111-1111-1111-111111111111', 'Deborah', 'owner', true);
```

Replace the UUIDs with the real Supabase Auth user IDs. Do not add public signup.

## 12. Test checklist

1. Build the site with `npm run build`.
2. Deploy with Supabase env vars.
3. Log in at `/admin/login` as each owner.
4. Submit a private request from the public site.
5. Create a fixed excursion in `/admin/availability`.
6. Confirm it appears under public **Upcoming excursions**.
7. Submit a fixed excursion request from the public site.
8. Create a partnership in `/admin/partnerships`.
9. Confirm it appears under public **Partnerships / Collaborazioni**.
10. Deactivate the partnership and confirm it disappears publicly.
11. Approve a request and confirm status becomes `accepted`.
12. Decline a request and confirm it remains visible under `/admin/requests` and recent decisions.
13. Accept a fixed-excursion request, then remove/cancel it and confirm capacity is restored.
14. Upload a blocked-date file to a fixed excursion and confirm it opens publicly.
15. Submit a public review with a valid booking code and confirm duplicate code reuse is rejected.
16. Hide/republish a review from admin request management.
17. Confirm unauthenticated users cannot read `booking_requests` directly.
