-- vulcanIQ free owner-managed booking, availability, fixed-excursion, partnership, and review system
-- Run this file in the Supabase SQL editor after creating the project.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Helper: updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin owners
-- -----------------------------------------------------------------------------
create table if not exists public.admin_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'owner',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_profiles_role_check check (role in ('owner', 'manager'))
);

drop trigger if exists admin_profiles_set_updated_at on public.admin_profiles;
create trigger admin_profiles_set_updated_at
before update on public.admin_profiles
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles ap
    where ap.user_id = auth.uid()
      and ap.active = true
      and ap.role in ('owner', 'manager')
  );
$$;

-- -----------------------------------------------------------------------------
-- Booking requests
-- -----------------------------------------------------------------------------
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'pending',
  request_type text not null default 'private',
  customer_name text,
  customer_email text,
  customer_phone text,
  preferred_contact text,
  experience_id text,
  requested_date date,
  alternative_date date,
  language text,
  party_type text,
  adults integer,
  children integer,
  children_under_3 boolean default false,
  private_experience boolean,
  fixed_excursion_id uuid null,
  main_interest text,
  preferred_pace text,
  message text,
  source text not null default 'website',
  admin_note text,
  decision_note text,
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  created_by_admin uuid references auth.users(id),
  availability_block_id uuid null,
  booking_code text unique,
  review_submitted boolean not null default false,
  review_submitted_at timestamptz null,
  removed_at timestamptz null,
  removed_by uuid references auth.users(id),
  constraint booking_requests_status_check check (status in ('pending', 'accepted', 'declined', 'cancelled', 'archived')),
  constraint booking_requests_request_type_check check (request_type in ('private', 'fixed')),
  constraint booking_requests_preferred_contact_check check (preferred_contact is null or preferred_contact in ('whatsapp', 'phone', 'email', 'form', 'unknown')),
  constraint booking_requests_experience_id_check check (experience_id is null or experience_id in ('etna-premium', 'etna-learning', 'etna-live', 'etna-stories', 'unsure')),
  constraint booking_requests_language_check check (language is null or language in ('it', 'en')),
  constraint booking_requests_party_type_check check (party_type is null or party_type in ('solo', 'couple', 'family', 'group', 'company', 'school', 'other')),
  constraint booking_requests_source_check check (source in ('website', 'whatsapp', 'phone', 'email', 'manual')),
  constraint booking_requests_adults_check check (adults is null or adults >= 0),
  constraint booking_requests_children_check check (children is null or children >= 0)
);

alter table public.booking_requests add column if not exists request_type text not null default 'private';
alter table public.booking_requests add column if not exists fixed_excursion_id uuid null;
alter table public.booking_requests add column if not exists availability_block_id uuid null;
alter table public.booking_requests add column if not exists booking_code text unique;
alter table public.booking_requests add column if not exists review_submitted boolean not null default false;
alter table public.booking_requests add column if not exists review_submitted_at timestamptz null;
alter table public.booking_requests add column if not exists removed_at timestamptz null;
alter table public.booking_requests add column if not exists removed_by uuid references auth.users(id);

create index if not exists booking_requests_status_idx on public.booking_requests(status);
create index if not exists booking_requests_requested_date_idx on public.booking_requests(requested_date);
create index if not exists booking_requests_created_at_idx on public.booking_requests(created_at desc);
create index if not exists booking_requests_source_idx on public.booking_requests(source);
create index if not exists booking_requests_request_type_idx on public.booking_requests(request_type);
create index if not exists booking_requests_fixed_excursion_idx on public.booking_requests(fixed_excursion_id);
create unique index if not exists booking_requests_booking_code_idx on public.booking_requests(booking_code) where booking_code is not null;

drop trigger if exists booking_requests_set_updated_at on public.booking_requests;
create trigger booking_requests_set_updated_at
before update on public.booking_requests
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Availability blocks for private/general availability
-- -----------------------------------------------------------------------------
create table if not exists public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  date date not null,
  status text not null,
  experience_id text null,
  reason_it text,
  reason_en text,
  internal_note text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  booking_request_id uuid references public.booking_requests(id),
  active boolean not null default true,
  constraint availability_blocks_status_check check (status in ('closed', 'limited', 'on-request')),
  constraint availability_blocks_experience_id_check check (experience_id is null or experience_id in ('etna-premium', 'etna-learning', 'etna-live', 'etna-stories'))
);

create index if not exists availability_blocks_date_idx on public.availability_blocks(date);
create index if not exists availability_blocks_active_idx on public.availability_blocks(active);
create index if not exists availability_blocks_experience_idx on public.availability_blocks(experience_id);

drop trigger if exists availability_blocks_set_updated_at on public.availability_blocks;
create trigger availability_blocks_set_updated_at
before update on public.availability_blocks
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Fixed excursions: owner-created dates with capacity, publicly visible safe data
-- -----------------------------------------------------------------------------
create table if not exists public.fixed_excursions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  date date not null,
  start_time time null,
  end_time time null,
  experience_id text not null,
  title_it text,
  title_en text,
  description_it text,
  description_en text,
  meeting_point_it text,
  meeting_point_en text,
  difficulty_it text,
  difficulty_en text,
  price_note_it text,
  price_note_en text,
  blocked_dates_file_url text,
  blocked_dates_file_name text,
  blocked_dates_file_type text,
  blocked_dates_file_path text,
  capacity integer not null default 12,
  note_it text,
  note_en text,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint fixed_excursions_experience_id_check check (experience_id in ('etna-premium', 'etna-learning', 'etna-live', 'etna-stories')),
  constraint fixed_excursions_capacity_check check (capacity > 0 and capacity <= 99)
);

alter table public.fixed_excursions add column if not exists end_time time null;
alter table public.fixed_excursions add column if not exists title_it text;
alter table public.fixed_excursions add column if not exists title_en text;
alter table public.fixed_excursions add column if not exists description_it text;
alter table public.fixed_excursions add column if not exists description_en text;
alter table public.fixed_excursions add column if not exists meeting_point_it text;
alter table public.fixed_excursions add column if not exists meeting_point_en text;
alter table public.fixed_excursions add column if not exists difficulty_it text;
alter table public.fixed_excursions add column if not exists difficulty_en text;
alter table public.fixed_excursions add column if not exists price_note_it text;
alter table public.fixed_excursions add column if not exists price_note_en text;
alter table public.fixed_excursions add column if not exists blocked_dates_file_url text;
alter table public.fixed_excursions add column if not exists blocked_dates_file_name text;
alter table public.fixed_excursions add column if not exists blocked_dates_file_type text;
alter table public.fixed_excursions add column if not exists blocked_dates_file_path text;
alter table public.fixed_excursions add column if not exists note_it text;
alter table public.fixed_excursions add column if not exists note_en text;

create index if not exists fixed_excursions_date_idx on public.fixed_excursions(date);
create index if not exists fixed_excursions_active_idx on public.fixed_excursions(active);
create index if not exists fixed_excursions_experience_idx on public.fixed_excursions(experience_id);

drop trigger if exists fixed_excursions_set_updated_at on public.fixed_excursions;
create trigger fixed_excursions_set_updated_at
before update on public.fixed_excursions
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Public reviews validated by unique booking code
-- -----------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  booking_request_id uuid references public.booking_requests(id),
  booking_code text not null,
  reviewer_name text,
  review_text text not null,
  rating integer null,
  language text null,
  approved boolean not null default true,
  active boolean not null default true,
  constraint reviews_rating_check check (rating is null or (rating >= 1 and rating <= 5)),
  constraint reviews_language_check check (language is null or language in ('it', 'en'))
);

alter table public.reviews add column if not exists updated_at timestamptz not null default now();
alter table public.reviews add column if not exists booking_request_id uuid references public.booking_requests(id);
alter table public.reviews add column if not exists booking_code text;
alter table public.reviews add column if not exists reviewer_name text;
alter table public.reviews add column if not exists review_text text;
alter table public.reviews add column if not exists rating integer null;
alter table public.reviews add column if not exists language text null;
alter table public.reviews add column if not exists approved boolean not null default true;
alter table public.reviews add column if not exists active boolean not null default true;

create unique index if not exists reviews_booking_code_unique_idx on public.reviews(booking_code);
create index if not exists reviews_active_idx on public.reviews(active, approved);
create index if not exists reviews_created_at_idx on public.reviews(created_at desc);

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
before update on public.reviews
for each row execute function public.set_updated_at();

create or replace function public.submit_public_review(
  p_booking_code text,
  p_reviewer_name text,
  p_review_text text,
  p_rating integer default null,
  p_language text default null
)
returns public.reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_request public.booking_requests%rowtype;
  inserted_review public.reviews%rowtype;
  clean_code text := upper(trim(coalesce(p_booking_code, '')));
begin
  if clean_code = '' then
    raise exception 'INVALID_BOOKING_CODE';
  end if;

  if trim(coalesce(p_review_text, '')) = '' then
    raise exception 'REVIEW_TEXT_REQUIRED';
  end if;

  select * into matched_request
  from public.booking_requests
  where booking_code = clean_code
    and status = 'accepted'
  limit 1;

  if not found then
    raise exception 'INVALID_BOOKING_CODE';
  end if;

  if matched_request.review_submitted = true then
    raise exception 'BOOKING_CODE_USED';
  end if;

  insert into public.reviews (
    booking_request_id,
    booking_code,
    reviewer_name,
    review_text,
    rating,
    language,
    approved,
    active
  ) values (
    matched_request.id,
    clean_code,
    nullif(trim(coalesce(p_reviewer_name, '')), ''),
    trim(p_review_text),
    case when p_rating between 1 and 5 then p_rating else null end,
    case when p_language in ('it', 'en') then p_language else matched_request.language end,
    true,
    true
  ) returning * into inserted_review;

  update public.booking_requests
  set review_submitted = true,
      review_submitted_at = now(),
      updated_at = now()
  where id = matched_request.id;

  return inserted_review;
end;
$$;

-- -----------------------------------------------------------------------------
-- Partnerships
-- -----------------------------------------------------------------------------
create table if not exists public.partnerships (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  description_it text,
  description_en text,
  website_url text,
  image_url text,
  category_it text,
  category_en text,
  active boolean not null default true,
  display_order integer not null default 0,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint partnerships_website_url_check check (website_url is null or website_url ~* '^https?://'),
  constraint partnerships_image_url_check check (image_url is null or image_url ~* '^https?://')
);

create index if not exists partnerships_active_idx on public.partnerships(active);
create index if not exists partnerships_display_order_idx on public.partnerships(display_order, name);

drop trigger if exists partnerships_set_updated_at on public.partnerships;
create trigger partnerships_set_updated_at
before update on public.partnerships
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Foreign keys added safely after both tables exist
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'booking_requests_availability_block_fk'
      and conrelid = 'public.booking_requests'::regclass
  ) then
    alter table public.booking_requests
      add constraint booking_requests_availability_block_fk
      foreign key (availability_block_id) references public.availability_blocks(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'booking_requests_fixed_excursion_fk'
      and conrelid = 'public.booking_requests'::regclass
  ) then
    alter table public.booking_requests
      add constraint booking_requests_fixed_excursion_fk
      foreign key (fixed_excursion_id) references public.fixed_excursions(id);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Optional owner activity log
-- -----------------------------------------------------------------------------
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb
);

-- -----------------------------------------------------------------------------
-- Public-safe views
-- -----------------------------------------------------------------------------
drop view if exists public.public_availability_blocks;
create view public.public_availability_blocks as
select
  id,
  date,
  status,
  experience_id,
  reason_it,
  reason_en,
  active
from public.availability_blocks
where active = true;

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
  fe.meeting_point_it,
  fe.meeting_point_en,
  fe.difficulty_it,
  fe.difficulty_en,
  fe.price_note_it,
  fe.price_note_en,
  fe.blocked_dates_file_url,
  fe.blocked_dates_file_name,
  fe.blocked_dates_file_type,
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
group by fe.id;

drop view if exists public.public_partnerships;
create view public.public_partnerships as
select
  id,
  name,
  description_it,
  description_en,
  website_url,
  image_url,
  category_it,
  category_en,
  active,
  display_order
from public.partnerships
where active = true;


drop view if exists public.public_reviews;
create view public.public_reviews as
select
  id,
  created_at,
  reviewer_name,
  review_text,
  rating,
  language
from public.reviews
where active = true
  and approved = true;

-- -----------------------------------------------------------------------------
-- Storage bucket for public blocked-date calendar assets
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vulcaniq-public-assets',
  'vulcaniq-public-assets',
  true,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.admin_profiles enable row level security;
alter table public.booking_requests enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.fixed_excursions enable row level security;
alter table public.partnerships enable row level security;
alter table public.reviews enable row level security;
alter table public.activity_log enable row level security;

-- admin_profiles: only active admins can read/administer profiles.
drop policy if exists "Admins can read admin profiles" on public.admin_profiles;
create policy "Admins can read admin profiles"
on public.admin_profiles
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can manage admin profiles" on public.admin_profiles;
create policy "Admins can manage admin profiles"
on public.admin_profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- booking_requests: public can insert, never read. Owners can read/update/create.
drop policy if exists "Public can insert booking requests" on public.booking_requests;
create policy "Public can insert booking requests"
on public.booking_requests
for insert
to anon, authenticated
with check (
  source = 'website'
  and status = 'pending'
  and created_by_admin is null
  and decided_by is null
  and decided_at is null
  and request_type in ('private', 'fixed')
);

drop policy if exists "Admins can read booking requests" on public.booking_requests;
create policy "Admins can read booking requests"
on public.booking_requests
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert booking requests" on public.booking_requests;
create policy "Admins can insert booking requests"
on public.booking_requests
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update booking requests" on public.booking_requests;
create policy "Admins can update booking requests"
on public.booking_requests
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- availability_blocks: admin table is owner-only. Public uses the safe view.
drop policy if exists "Admins can read availability blocks" on public.availability_blocks;
create policy "Admins can read availability blocks"
on public.availability_blocks
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert availability blocks" on public.availability_blocks;
create policy "Admins can insert availability blocks"
on public.availability_blocks
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update availability blocks" on public.availability_blocks;
create policy "Admins can update availability blocks"
on public.availability_blocks
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- fixed_excursions: owners manage table. Public reads only the public_fixed_excursions view.
drop policy if exists "Admins can read fixed excursions" on public.fixed_excursions;
create policy "Admins can read fixed excursions"
on public.fixed_excursions
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert fixed excursions" on public.fixed_excursions;
create policy "Admins can insert fixed excursions"
on public.fixed_excursions
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update fixed excursions" on public.fixed_excursions;
create policy "Admins can update fixed excursions"
on public.fixed_excursions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- partnerships: owners manage table. Public reads only the public_partnerships view.
drop policy if exists "Admins can read partnerships" on public.partnerships;
create policy "Admins can read partnerships"
on public.partnerships
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert partnerships" on public.partnerships;
create policy "Admins can insert partnerships"
on public.partnerships
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update partnerships" on public.partnerships;
create policy "Admins can update partnerships"
on public.partnerships
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- reviews: public submits through RPC only. Owners manage visibility. Public reads safe view.
drop policy if exists "Admins can read reviews" on public.reviews;
create policy "Admins can read reviews"
on public.reviews
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update reviews" on public.reviews;
create policy "Admins can update reviews"
on public.reviews
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can insert reviews" on public.reviews;
create policy "Admins can insert reviews"
on public.reviews
for insert
to authenticated
with check (public.is_admin());

-- storage.objects: public read for published assets; admins can manage files.
drop policy if exists "Public can read vulcanIQ public assets" on storage.objects;
create policy "Public can read vulcanIQ public assets"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'vulcaniq-public-assets');

drop policy if exists "Admins can insert vulcanIQ public assets" on storage.objects;
create policy "Admins can insert vulcanIQ public assets"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'vulcaniq-public-assets' and public.is_admin());

drop policy if exists "Admins can update vulcanIQ public assets" on storage.objects;
create policy "Admins can update vulcanIQ public assets"
on storage.objects
for update
to authenticated
using (bucket_id = 'vulcaniq-public-assets' and public.is_admin())
with check (bucket_id = 'vulcaniq-public-assets' and public.is_admin());

drop policy if exists "Admins can delete vulcanIQ public assets" on storage.objects;
create policy "Admins can delete vulcanIQ public assets"
on storage.objects
for delete
to authenticated
using (bucket_id = 'vulcaniq-public-assets' and public.is_admin());

-- activity_log: owner-only.
drop policy if exists "Admins can read activity log" on public.activity_log;
create policy "Admins can read activity log"
on public.activity_log
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert activity log" on public.activity_log;
create policy "Admins can insert activity log"
on public.activity_log
for insert
to authenticated
with check (public.is_admin());

-- Grants for browser anon/authenticated clients.
grant usage on schema public to anon, authenticated;
grant select on public.public_availability_blocks to anon, authenticated;
grant select on public.public_fixed_excursions to anon, authenticated;
grant select on public.public_partnerships to anon, authenticated;
grant select on public.public_reviews to anon, authenticated;
grant execute on function public.submit_public_review(text, text, text, integer, text) to anon, authenticated;
grant insert on public.booking_requests to anon, authenticated;
grant select, insert, update on public.admin_profiles to authenticated;
grant select, insert, update on public.booking_requests to authenticated;
grant select, insert, update on public.availability_blocks to authenticated;
grant select, insert, update on public.fixed_excursions to authenticated;
grant select, insert, update on public.partnerships to authenticated;
grant select, insert, update on public.reviews to authenticated;
grant select, insert on public.activity_log to authenticated;

notify pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- Owner setup notes
-- -----------------------------------------------------------------------------
-- 1. Create two users in Supabase Auth > Users.
-- 2. Insert their user IDs here, replacing the placeholders:
--
-- insert into public.admin_profiles (user_id, full_name, role, active)
-- values
--   ('00000000-0000-0000-0000-000000000000', 'Leonardo Chiavetta', 'owner', true),
--   ('11111111-1111-1111-1111-111111111111', 'Deborah', 'owner', true);
