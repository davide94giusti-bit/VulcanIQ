-- Add Radio as a valid customer-declared discovery source.
-- Safe to run after the original heard_about_us migration.

alter table public.booking_requests add column if not exists heard_about_us text;
alter table public.booking_requests add column if not exists heard_about_us_label text;
alter table public.booking_requests add column if not exists heard_about_us_detail text;

alter table public.booking_requests
  drop constraint if exists booking_requests_heard_about_us_check;

alter table public.booking_requests
  add constraint booking_requests_heard_about_us_check
  check (
    heard_about_us is null
    or heard_about_us in (
      'instagram',
      'google',
      'google_maps',
      'facebook',
      'radio',
      'whatsapp_or_friend',
      'hotel_bnb_partner',
      'previous_customer',
      'guide_or_local_partner',
      'other',
      'not_specified'
    )
  );

create index if not exists booking_requests_heard_about_us_idx
  on public.booking_requests(heard_about_us);
