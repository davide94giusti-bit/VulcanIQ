# Supabase setup for vulcanIQ

This guide enables the free owner-managed booking and availability system.

## 1. Create a free Supabase project

1. Go to Supabase.
2. Create a new project on the Free plan.
3. Choose a strong database password and save it securely.
4. Wait for the project to finish provisioning.

## 2. Copy project credentials

In Supabase:

1. Open **Project Settings**.
2. Open **API**.
3. Copy the **Project URL**.
4. Copy the **anon public** key.

Use only these browser-safe values in Vite/Netlify:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Never put the service role key in frontend JavaScript.

## 3. Add Netlify environment variables

In Netlify:

1. Open the site.
2. Go to **Site configuration** → **Environment variables**.
3. Add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Redeploy the site.

For local development, create a local `.env` file if needed:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Do not commit `.env`.

## 4. Create database tables and policies

1. Open Supabase **SQL Editor**.
2. Open `supabase/schema.sql` from this repository.
3. Paste the full SQL file into the editor.
4. Run it.

The SQL creates:

- `admin_profiles`
- `booking_requests`
- `availability_blocks`
- `activity_log`
- `public_availability_blocks` safe public view
- `is_admin()` helper function
- Row Level Security policies
- useful constraints and indexes

## 5. Confirm RLS is enabled

The schema enables Row Level Security on:

- `admin_profiles`
- `booking_requests`
- `availability_blocks`
- `activity_log`

Security model:

- Public users can insert website booking requests.
- Public users cannot read booking requests.
- Public users cannot update booking requests.
- Public users can read only safe active availability data through `public_availability_blocks`.
- Active owners can read and manage booking requests.
- Active owners can create, update, and deactivate availability blocks.
- Active owners can read `admin_profiles`.

## 6. Create the two owner users

In Supabase:

1. Open **Authentication** → **Users**.
2. Create Owner 1:
   - Name/display label: Sister / owner, or another confirmed owner display name
   - Email: use the real owner login email
   - Password: choose a strong password
3. Create Owner 2:
   - Name/display label: Boyfriend / co-owner, or a generic fallback until confirmed
   - Email: use the real co-owner login email
   - Password: choose a strong password

Do not add a public sign-up flow to the website.

## 7. Add owners to `admin_profiles`

After creating each Auth user, copy each user's UUID from **Authentication** → **Users**.

Then run SQL like this, replacing the placeholder UUIDs and email-independent display names:

```sql
insert into public.admin_profiles (user_id, full_name, role, active)
values
  ('00000000-0000-0000-0000-000000000000', 'Owner vulcanIQ', 'owner', true),
  ('11111111-1111-1111-1111-111111111111', 'Co-owner vulcanIQ', 'owner', true);
```

For English UI fallback, the app displays “vulcanIQ Co-owner” when a display name is unavailable.

## 8. Test admin login

1. Deploy or run locally with the Supabase env variables.
2. Open `/admin/login`.
3. Log in as Leonardo.
4. Confirm `/admin/today` loads.
5. Log out.
6. Log in as the co-owner.
7. Confirm `/admin/today` loads.

Then test a non-owner Auth user:

1. Create a third Auth user.
2. Do not insert that user into `admin_profiles`.
3. Try logging in at `/admin/login`.
4. Confirm access is denied.

## 9. Test public booking request insert

1. Open the public website.
2. Fill the contact form with at least phone or email.
3. Select an experience or date, or write a message.
4. Submit the request.
5. Confirm a success message appears.
6. In Supabase, verify a `booking_requests` row exists with:
   - `status = pending`
   - `source = website`

## 10. Confirm private data is not publicly readable

In a browser session that is not logged in as an owner:

- The public site should show availability.
- The public site should not show customer requests.
- Direct reads from `booking_requests` should fail under RLS.
- Direct reads from `availability_blocks` should fail under RLS.
- Reads from `public_availability_blocks` should return only safe public availability fields.

## 11. Test approval and availability update

1. Log in at `/admin`.
2. Open **Today**.
3. Approve a pending request.
4. Choose one of the availability update options:
   - accept only
   - close this experience
   - close all experiences
   - mark limited availability
5. Confirm the request status changes to `accepted`.
6. If an availability option was selected, confirm an `availability_blocks` row exists.
7. Open the public calendar and confirm the date reflects the block.

## 12. Test manual external requests

1. Log in at `/admin`.
2. Click **Add manual request**.
3. Use source `whatsapp`, `phone`, `email`, or `manual`.
4. Save.
5. Confirm it appears as a pending request.

This keeps external conversations inside the same owner workflow without WhatsApp Business API, SMS, or paid services.


## 13. Production publishing checklist

1. Put the project in a private GitHub repository.
2. Connect the repository to Netlify.
3. Use build command `npm run build`.
4. Use publish directory `dist`.
5. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify.
6. Redeploy.
7. Open `/admin/login` from two separate devices or browsers.
8. Confirm both approved owner accounts can access `/admin/today` and `/admin/upcoming`.
9. Submit a public test request.
10. Approve it and choose an availability update option.
11. Confirm the public calendar reflects the change.
