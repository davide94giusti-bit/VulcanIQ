-- Add language-specific leaflet files for monthly programmes and fixed excursions.
-- Run this in Supabase SQL Editor before using the bilingual leaflet admin fields.

alter table public.monthly_availability_leaflets add column if not exists leaflet_file_url_it text;
alter table public.monthly_availability_leaflets add column if not exists leaflet_file_path_it text;
alter table public.monthly_availability_leaflets add column if not exists leaflet_file_name_it text;
alter table public.monthly_availability_leaflets add column if not exists leaflet_file_type_it text;
alter table public.monthly_availability_leaflets add column if not exists leaflet_file_url_en text;
alter table public.monthly_availability_leaflets add column if not exists leaflet_file_path_en text;
alter table public.monthly_availability_leaflets add column if not exists leaflet_file_name_en text;
alter table public.monthly_availability_leaflets add column if not exists leaflet_file_type_en text;

update public.monthly_availability_leaflets
set
  leaflet_file_url_it = coalesce(leaflet_file_url_it, file_url),
  leaflet_file_path_it = coalesce(leaflet_file_path_it, file_path),
  leaflet_file_name_it = coalesce(leaflet_file_name_it, file_name),
  leaflet_file_type_it = coalesce(leaflet_file_type_it, file_type)
where file_url is not null
  and leaflet_file_url_it is null;

alter table public.fixed_excursions add column if not exists leaflet_file_url_it text;
alter table public.fixed_excursions add column if not exists leaflet_file_path_it text;
alter table public.fixed_excursions add column if not exists leaflet_file_name_it text;
alter table public.fixed_excursions add column if not exists leaflet_file_type_it text;
alter table public.fixed_excursions add column if not exists leaflet_file_url_en text;
alter table public.fixed_excursions add column if not exists leaflet_file_path_en text;
alter table public.fixed_excursions add column if not exists leaflet_file_name_en text;
alter table public.fixed_excursions add column if not exists leaflet_file_type_en text;

update public.fixed_excursions
set
  leaflet_file_url_it = coalesce(leaflet_file_url_it, blocked_dates_file_url),
  leaflet_file_path_it = coalesce(leaflet_file_path_it, blocked_dates_file_path),
  leaflet_file_name_it = coalesce(leaflet_file_name_it, blocked_dates_file_name),
  leaflet_file_type_it = coalesce(leaflet_file_type_it, blocked_dates_file_type)
where blocked_dates_file_url is not null
  and leaflet_file_url_it is null;

-- Recreate public fixed-excursions view with bilingual leaflet file metadata.
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
  fe.leaflet_file_url_it,
  fe.leaflet_file_path_it,
  fe.leaflet_file_name_it,
  fe.leaflet_file_type_it,
  fe.leaflet_file_url_en,
  fe.leaflet_file_path_en,
  fe.leaflet_file_name_en,
  fe.leaflet_file_type_en,
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

-- Recreate public monthly-programme view with bilingual leaflet file metadata.
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
  file_path,
  file_name,
  file_type,
  leaflet_file_url_it,
  leaflet_file_path_it,
  leaflet_file_name_it,
  leaflet_file_type_it,
  leaflet_file_url_en,
  leaflet_file_path_en,
  leaflet_file_name_en,
  leaflet_file_type_en,
  active
from public.monthly_availability_leaflets
where active = true;

grant select on public.public_fixed_excursions to anon, authenticated;
grant select on public.public_monthly_availability_leaflets to anon, authenticated;
grant select, insert, update on public.fixed_excursions to authenticated;
grant select, insert, update on public.monthly_availability_leaflets to authenticated;

notify pgrst, 'reload schema';
