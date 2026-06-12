-- vulcanIQ targeted migration for existing Supabase projects
-- Run this in Supabase SQL Editor before/with the matching frontend deployment.

alter table public.reviews
add column if not exists admin_reply text;

alter table public.reviews
add column if not exists admin_reply_at timestamptz null;

alter table public.reviews
add column if not exists admin_reply_by uuid references auth.users(id);

drop view if exists public.public_reviews;

create view public.public_reviews as
select
  id,
  created_at,
  reviewer_name,
  review_text,
  rating,
  language,
  admin_reply,
  admin_reply_at
from public.reviews
where active = true
  and approved = true;

grant select on public.public_reviews to anon, authenticated;

create or replace function public.sync_fixed_excursion_booking_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fixed_row public.fixed_excursions%rowtype;
begin
  if new.request_type = 'fixed' and new.fixed_excursion_id is not null then
    select * into fixed_row
    from public.fixed_excursions
    where id = new.fixed_excursion_id
    limit 1;

    if found then
      new.experience_id := fixed_row.experience_id;
      new.requested_date := coalesce(new.requested_date, fixed_row.date);
      new.private_experience := false;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists booking_requests_sync_fixed_excursion on public.booking_requests;

create trigger booking_requests_sync_fixed_excursion
before insert or update of request_type, fixed_excursion_id on public.booking_requests
for each row execute function public.sync_fixed_excursion_booking_request();

notify pgrst, 'reload schema';
