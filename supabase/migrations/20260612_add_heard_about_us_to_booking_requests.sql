-- Add customer-declared discovery-source attribution to booking requests.
-- Safe to run once; preserves existing rows and RLS policies.

alter table public.booking_requests add column if not exists heard_about_us text;
alter table public.booking_requests add column if not exists heard_about_us_label text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_requests_heard_about_us_check'
      and conrelid = 'public.booking_requests'::regclass
  ) then
    alter table public.booking_requests
      add constraint booking_requests_heard_about_us_check
      check (
        heard_about_us is null
        or heard_about_us in (
          'instagram',
          'google',
          'google_maps',
          'facebook',
          'whatsapp_or_friend',
          'hotel_bnb_partner',
          'previous_customer',
          'guide_or_local_partner',
          'other',
          'not_specified'
        )
      );
  end if;
end $$;

create index if not exists booking_requests_heard_about_us_idx on public.booking_requests(heard_about_us);
