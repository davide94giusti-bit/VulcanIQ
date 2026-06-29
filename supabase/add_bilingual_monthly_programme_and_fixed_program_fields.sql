-- Add bilingual programme/content fields for monthly programmes and fixed excursions.
-- Safe to run multiple times.

alter table public.monthly_availability_leaflets
  add column if not exists description_it text,
  add column if not exists description_en text,
  add column if not exists notes_it text,
  add column if not exists notes_en text;

alter table public.fixed_excursions
  add column if not exists program_it text,
  add column if not exists program_en text;

-- Backfill detailed programme from the existing short description so old excursions keep rendering.
update public.fixed_excursions
set
  program_it = coalesce(program_it, description_it, note_it),
  program_en = coalesce(program_en, description_en, note_en)
where program_it is null
   or program_en is null;

-- Public-safe fixed excursions now expose the bilingual detailed programme fields.
drop view if exists public.public_fixed_excursions;
create view public.public_fixed_excursions as
select
  fe.id,
  fe.date,
  fe.start_time,
  fe.end_time,
  fe.experience_id,
  fe.title_it,
  fe.title_en,
  fe.description_it,
  fe.description_en,
  fe.program_it,
  fe.program_en,
  fe.meeting_point_it,
  fe.meeting_point_en,
  fe.meeting_point_maps_url,
  fe.difficulty_it,
  fe.difficulty_en,
  fe.price_note_it,
  fe.price_note_en,
  fe.blocked_dates_file_url,
  fe.blocked_dates_file_name,
  fe.blocked_dates_file_type,
  fe.blocked_dates_file_path,
  fe.leaflet_id,
  fe.status,
  fe.public_visibility,
  fe.capacity,
  fe.note_it,
  fe.note_en,
  fe.active,
  coalesce(sum(coalesce(br.adults, 0) + coalesce(br.children, 0)) filter (where br.status = 'accepted'), 0)::integer as accepted_count,
  greatest(fe.capacity - coalesce(sum(coalesce(br.adults, 0) + coalesce(br.children, 0)) filter (where br.status = 'accepted'), 0), 0)::integer as places_remaining
from public.fixed_excursions fe
left join public.booking_requests br
  on br.fixed_excursion_id = fe.id
  and br.request_type = 'fixed'
where fe.active = true
  and fe.public_visibility = true
  and fe.status = 'available'
group by fe.id;

-- Public-safe monthly programmes now support text-only programmes, so file_url is optional.
drop view if exists public.public_monthly_availability_leaflets;
create view public.public_monthly_availability_leaflets as
select
  id,
  month,
  year,
  title_it,
  title_en,
  description_it,
  description_en,
  notes_it,
  notes_en,
  file_url,
  file_type,
  active
from public.monthly_availability_leaflets
where active = true;

grant select on public.public_fixed_excursions to anon, authenticated;
grant select on public.public_monthly_availability_leaflets to anon, authenticated;
grant select, insert, update on public.monthly_availability_leaflets to authenticated;
grant select, insert, update on public.fixed_excursions to authenticated;
