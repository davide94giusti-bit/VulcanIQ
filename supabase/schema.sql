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
-- Analytics events and sessions
-- -----------------------------------------------------------------------------
create table if not exists public.analytics_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text unique not null,
  visitor_id text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  duration_seconds integer not null default 0,
  pageview_count integer not null default 0,
  entry_path text,
  exit_path text,
  referrer_domain text,
  traffic_source text,
  country_code text,
  country_name text,
  city text,
  language text,
  device_type text,
  browser text,
  operating_system text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  session_id text,
  visitor_id text,
  occurred_at timestamptz not null default now(),
  path text,
  section text,
  language text,
  referrer_domain text,
  traffic_source text,
  country_code text,
  country_name text,
  city text,
  device_type text,
  browser text,
  operating_system text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.analytics_sessions add column if not exists session_id text;
alter table public.analytics_sessions add column if not exists visitor_id text;
alter table public.analytics_sessions add column if not exists started_at timestamptz not null default now();
alter table public.analytics_sessions add column if not exists last_seen_at timestamptz not null default now();
alter table public.analytics_sessions add column if not exists duration_seconds integer not null default 0;
alter table public.analytics_sessions add column if not exists pageview_count integer not null default 0;
alter table public.analytics_sessions add column if not exists entry_path text;
alter table public.analytics_sessions add column if not exists exit_path text;
alter table public.analytics_sessions add column if not exists referrer_domain text;
alter table public.analytics_sessions add column if not exists traffic_source text;
alter table public.analytics_sessions add column if not exists country_code text;
alter table public.analytics_sessions add column if not exists country_name text;
alter table public.analytics_sessions add column if not exists city text;
alter table public.analytics_sessions add column if not exists language text;
alter table public.analytics_sessions add column if not exists device_type text;
alter table public.analytics_sessions add column if not exists browser text;
alter table public.analytics_sessions add column if not exists operating_system text;
alter table public.analytics_sessions add column if not exists created_at timestamptz not null default now();
alter table public.analytics_sessions add column if not exists updated_at timestamptz not null default now();

alter table public.analytics_events add column if not exists event_name text;
alter table public.analytics_events add column if not exists session_id text;
alter table public.analytics_events add column if not exists visitor_id text;
alter table public.analytics_events add column if not exists occurred_at timestamptz not null default now();
alter table public.analytics_events add column if not exists path text;
alter table public.analytics_events add column if not exists section text;
alter table public.analytics_events add column if not exists language text;
alter table public.analytics_events add column if not exists referrer_domain text;
alter table public.analytics_events add column if not exists traffic_source text;
alter table public.analytics_events add column if not exists country_code text;
alter table public.analytics_events add column if not exists country_name text;
alter table public.analytics_events add column if not exists city text;
alter table public.analytics_events add column if not exists device_type text;
alter table public.analytics_events add column if not exists browser text;
alter table public.analytics_events add column if not exists operating_system text;
alter table public.analytics_events add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.analytics_events add column if not exists created_at timestamptz not null default now();

alter table public.analytics_events
  drop constraint if exists analytics_events_event_name_check;

alter table public.analytics_events
  add constraint analytics_events_event_name_check
  check (
    event_name in (
      'page_view',
      'language_switch',
      'excursion_view',
      'experience_card_view',
      'experience_detail_open',
      'calendar_date_select',
      'booking_form_open',
      'booking_form_field_start',
      'request_details_open',
      'fixed_excursion_options_open',
      'private_excursion_options_open',
      'fixed_leaflet_open_from_request',
      'private_excursion_detail_open_from_request',
      'booking_form_submit_attempt',
      'booking_form_validation_error',
      'booking_form_submit_success',
      'booking_form_submit_error',
      'booking_submit',
      'booking_submit_attempt',
      'booking_submit_validation_error',
      'booking_submit_success',
      'booking_submit_error',
      'booking_request_created',
      'whatsapp_click',
      'email_click',
      'phone_click',
      'google_maps_click',
      'maps_click',
      'review_view',
      'session_start',
      'session_heartbeat',
      'session_end'
    )
  );

alter table public.analytics_sessions
  drop constraint if exists analytics_sessions_duration_nonnegative_check;

alter table public.analytics_sessions
  add constraint analytics_sessions_duration_nonnegative_check
  check (duration_seconds >= 0 and duration_seconds <= 1800);

alter table public.analytics_sessions
  drop constraint if exists analytics_sessions_pageview_nonnegative_check;

alter table public.analytics_sessions
  add constraint analytics_sessions_pageview_nonnegative_check
  check (pageview_count >= 0);

create unique index if not exists analytics_sessions_session_id_key
on public.analytics_sessions(session_id);

create index if not exists analytics_events_occurred_at_idx
on public.analytics_events(occurred_at desc);

create index if not exists analytics_events_created_at_idx
on public.analytics_events(created_at desc);

create index if not exists analytics_events_event_name_idx
on public.analytics_events(event_name);

create index if not exists analytics_events_session_id_idx
on public.analytics_events(session_id);

create index if not exists analytics_events_visitor_id_idx
on public.analytics_events(visitor_id);

create index if not exists analytics_events_path_idx
on public.analytics_events(path);

create index if not exists analytics_events_country_code_idx
on public.analytics_events(country_code);

create index if not exists analytics_events_traffic_source_idx
on public.analytics_events(traffic_source);

create index if not exists analytics_sessions_started_at_idx
on public.analytics_sessions(started_at desc);

create index if not exists analytics_sessions_visitor_id_idx
on public.analytics_sessions(visitor_id);

create index if not exists analytics_sessions_country_code_idx
on public.analytics_sessions(country_code);

create index if not exists analytics_sessions_traffic_source_idx
on public.analytics_sessions(traffic_source);

create or replace function public.set_analytics_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists analytics_sessions_set_updated_at on public.analytics_sessions;
create trigger analytics_sessions_set_updated_at
before update on public.analytics_sessions
for each row execute function public.set_analytics_updated_at();

alter table public.analytics_events enable row level security;
alter table public.analytics_sessions enable row level security;

drop policy if exists "Public can insert analytics events" on public.analytics_events;
create policy "Public can insert analytics events"
on public.analytics_events
for insert
to anon, authenticated
with check (
  event_name in (
    'page_view',
    'language_switch',
    'excursion_view',
    'experience_card_view',
    'experience_detail_open',
    'calendar_date_select',
    'booking_form_open',
    'booking_form_field_start',
    'request_details_open',
    'fixed_excursion_options_open',
    'private_excursion_options_open',
    'fixed_leaflet_open_from_request',
    'private_excursion_detail_open_from_request',
    'booking_form_submit_attempt',
    'booking_form_validation_error',
    'booking_form_submit_success',
    'booking_form_submit_error',
    'booking_submit',
    'booking_submit_attempt',
    'booking_submit_validation_error',
    'booking_submit_success',
    'booking_submit_error',
    'booking_request_created',
    'whatsapp_click',
    'email_click',
    'phone_click',
    'google_maps_click',
    'maps_click',
    'review_view',
    'session_start',
    'session_heartbeat',
    'session_end'
  )
  and coalesce(metadata, '{}'::jsonb) = metadata
  and not (metadata ? 'name')
  and not (metadata ? 'email')
  and not (metadata ? 'phone')
  and not (metadata ? 'message')
  and not (metadata ? 'customer_name')
  and not (metadata ? 'customer_email')
  and not (metadata ? 'customer_phone')
);

drop policy if exists "Public can insert analytics sessions" on public.analytics_sessions;
create policy "Public can insert analytics sessions"
on public.analytics_sessions
for insert
to anon, authenticated
with check (
  session_id is not null
  and duration_seconds >= 0
  and duration_seconds <= 1800
  and pageview_count >= 0
);

drop policy if exists "Admins can read analytics events" on public.analytics_events;
create policy "Admins can read analytics events"
on public.analytics_events
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can delete analytics events" on public.analytics_events;
create policy "Admins can delete analytics events"
on public.analytics_events
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Admins can read analytics sessions" on public.analytics_sessions;
create policy "Admins can read analytics sessions"
on public.analytics_sessions
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can delete analytics sessions" on public.analytics_sessions;
create policy "Admins can delete analytics sessions"
on public.analytics_sessions
for delete
to authenticated
using (public.is_admin());

grant insert on public.analytics_events to anon, authenticated;
grant insert on public.analytics_sessions to anon, authenticated;
grant select, delete on public.analytics_events to authenticated;
grant select, delete on public.analytics_sessions to authenticated;


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
  heard_about_us text,
  heard_about_us_label text,
  heard_about_us_detail text,
  source text not null default 'website',
  source_section text,
  source_cta text,
  cta_location text,
  selected_date date,
  has_fixed_excursion boolean not null default false,
  traffic_source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
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
  constraint booking_requests_heard_about_us_check check (heard_about_us is null or heard_about_us in ('instagram', 'google', 'google_maps', 'facebook', 'radio', 'whatsapp_or_friend', 'hotel_bnb_partner', 'previous_customer', 'guide_or_local_partner', 'other', 'not_specified')),
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
alter table public.booking_requests add column if not exists archived_at timestamptz null;
alter table public.booking_requests add column if not exists archived_by uuid references auth.users(id);
alter table public.booking_requests add column if not exists archive_reason text;
alter table public.booking_requests add column if not exists cancelled_at timestamptz null;
alter table public.booking_requests add column if not exists cancelled_by uuid references auth.users(id);
alter table public.booking_requests add column if not exists completed_at timestamptz null;
alter table public.booking_requests add column if not exists source_section text;
alter table public.booking_requests add column if not exists source_cta text;
alter table public.booking_requests add column if not exists cta_location text;
alter table public.booking_requests add column if not exists selected_date date;
alter table public.booking_requests add column if not exists has_fixed_excursion boolean not null default false;
alter table public.booking_requests add column if not exists traffic_source text;
alter table public.booking_requests add column if not exists utm_source text;
alter table public.booking_requests add column if not exists utm_medium text;
alter table public.booking_requests add column if not exists utm_campaign text;
alter table public.booking_requests add column if not exists utm_content text;
alter table public.booking_requests add column if not exists heard_about_us text;
alter table public.booking_requests add column if not exists heard_about_us_label text;
alter table public.booking_requests add column if not exists heard_about_us_detail text;

create index if not exists booking_requests_status_idx on public.booking_requests(status);
create index if not exists booking_requests_requested_date_idx on public.booking_requests(requested_date);
create index if not exists booking_requests_created_at_idx on public.booking_requests(created_at desc);
create index if not exists booking_requests_source_idx on public.booking_requests(source);
create index if not exists booking_requests_request_type_idx on public.booking_requests(request_type);
create index if not exists booking_requests_source_section_idx on public.booking_requests(source_section);
create index if not exists booking_requests_cta_location_idx on public.booking_requests(cta_location);
create index if not exists booking_requests_traffic_source_idx on public.booking_requests(traffic_source);
create index if not exists booking_requests_fixed_excursion_idx on public.booking_requests(fixed_excursion_id);
create index if not exists booking_requests_heard_about_us_idx on public.booking_requests(heard_about_us);
create index if not exists booking_requests_heard_about_us_detail_idx on public.booking_requests(heard_about_us_detail) where heard_about_us_detail is not null;
create index if not exists booking_requests_archive_idx on public.booking_requests(archived_at) where archived_at is not null;
create unique index if not exists booking_requests_booking_code_idx on public.booking_requests(booking_code) where booking_code is not null;

drop trigger if exists booking_requests_set_updated_at on public.booking_requests;
create trigger booking_requests_set_updated_at
before update on public.booking_requests
for each row execute function public.set_updated_at();

-- Booking submit analytics integrity support.
-- Public users can insert booking requests and receive only the created request id.
-- This avoids opening public SELECT access on public.booking_requests.

create or replace function public.create_public_booking_request(request_payload jsonb)
returns table(id uuid, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.booking_requests%rowtype;
  raw_request_type text := nullif(btrim(coalesce(request_payload->>'request_type', 'private')), '');
  raw_heard_about_us text := nullif(btrim(coalesce(request_payload->>'heard_about_us', '')), '');
begin
  if request_payload is null or jsonb_typeof(request_payload) <> 'object' then
    raise exception 'Invalid booking request payload';
  end if;

  if raw_request_type is null or raw_request_type not in ('private', 'fixed') then
    raw_request_type := 'private';
  end if;

  -- "not_specified" remains admin-only in the UI/path. Public submissions store null instead.
  if raw_heard_about_us = 'not_specified' then
    raw_heard_about_us := null;
  end if;

  insert into public.booking_requests (
    customer_name,
    customer_email,
    customer_phone,
    preferred_contact,
    experience_id,
    requested_date,
    alternative_date,
    language,
    party_type,
    request_type,
    fixed_excursion_id,
    booking_code,
    adults,
    children,
    children_under_3,
    private_experience,
    main_interest,
    preferred_pace,
    message,
    heard_about_us,
    heard_about_us_label,
    heard_about_us_detail,
    source,
    source_section,
    source_cta,
    cta_location,
    selected_date,
    has_fixed_excursion,
    traffic_source,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    status,
    created_by_admin
  ) values (
    nullif(btrim(coalesce(request_payload->>'customer_name', '')), ''),
    nullif(btrim(coalesce(request_payload->>'customer_email', '')), ''),
    nullif(btrim(coalesce(request_payload->>'customer_phone', '')), ''),
    coalesce(nullif(btrim(coalesce(request_payload->>'preferred_contact', '')), ''), 'unknown'),
    coalesce(nullif(btrim(coalesce(request_payload->>'experience_id', '')), ''), 'unsure'),
    nullif(btrim(coalesce(request_payload->>'requested_date', '')), '')::date,
    nullif(btrim(coalesce(request_payload->>'alternative_date', '')), '')::date,
    coalesce(nullif(btrim(coalesce(request_payload->>'language', '')), ''), 'it'),
    nullif(btrim(coalesce(request_payload->>'party_type', '')), ''),
    raw_request_type,
    nullif(btrim(coalesce(request_payload->>'fixed_excursion_id', '')), '')::uuid,
    nullif(btrim(coalesce(request_payload->>'booking_code', '')), ''),
    nullif(btrim(coalesce(request_payload->>'adults', '')), '')::integer,
    nullif(btrim(coalesce(request_payload->>'children', '')), '')::integer,
    coalesce((request_payload->>'children_under_3')::boolean, false),
    case when request_payload ? 'private_experience' then (request_payload->>'private_experience')::boolean else raw_request_type = 'private' end,
    nullif(btrim(coalesce(request_payload->>'main_interest', '')), ''),
    nullif(btrim(coalesce(request_payload->>'preferred_pace', '')), ''),
    nullif(btrim(coalesce(request_payload->>'message', '')), ''),
    raw_heard_about_us,
    nullif(btrim(coalesce(request_payload->>'heard_about_us_label', '')), ''),
    nullif(btrim(coalesce(request_payload->>'heard_about_us_detail', '')), ''),
    'website',
    nullif(btrim(coalesce(request_payload->>'source_section', '')), ''),
    nullif(btrim(coalesce(request_payload->>'source_cta', '')), ''),
    nullif(btrim(coalesce(request_payload->>'cta_location', '')), ''),
    nullif(btrim(coalesce(request_payload->>'selected_date', '')), '')::date,
    coalesce((request_payload->>'has_fixed_excursion')::boolean, raw_request_type = 'fixed'),
    nullif(btrim(coalesce(request_payload->>'traffic_source', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_source', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_medium', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_campaign', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_content', '')), ''),
    'pending',
    null
  ) returning * into inserted;

  return query select inserted.id, inserted.status, inserted.created_at;
end;
$$;

revoke all on function public.create_public_booking_request(jsonb) from public;
grant execute on function public.create_public_booking_request(jsonb) to anon, authenticated;


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
alter table public.availability_blocks add column if not exists archived_at timestamptz null;
alter table public.availability_blocks add column if not exists archived_by uuid references auth.users(id);
alter table public.availability_blocks add column if not exists archive_reason text;

create index if not exists availability_blocks_experience_idx on public.availability_blocks(experience_id);
create index if not exists availability_blocks_archive_idx on public.availability_blocks(archived_at) where archived_at is not null;

drop trigger if exists availability_blocks_set_updated_at on public.availability_blocks;
create trigger availability_blocks_set_updated_at
before update on public.availability_blocks
for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- Monthly availability leaflets: owner-uploaded month files linked to fixed dates
-- -----------------------------------------------------------------------------
create table if not exists public.monthly_availability_leaflets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  month integer not null,
  year integer not null,
  title_it text,
  title_en text,
  file_url text,
  file_path text,
  file_name text,
  file_type text,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint monthly_availability_leaflets_month_check check (month between 1 and 12),
  constraint monthly_availability_leaflets_year_check check (year between 2024 and 2100),
  constraint monthly_availability_leaflets_file_url_check check (file_url is null or file_url ~* '^https?://')
);

create index if not exists monthly_availability_leaflets_month_year_idx on public.monthly_availability_leaflets(year, month);
create index if not exists monthly_availability_leaflets_active_idx on public.monthly_availability_leaflets(active);

drop trigger if exists monthly_availability_leaflets_set_updated_at on public.monthly_availability_leaflets;
create trigger monthly_availability_leaflets_set_updated_at
before update on public.monthly_availability_leaflets
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
  meeting_point_maps_url text,
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
alter table public.fixed_excursions add column if not exists meeting_point_maps_url text;
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

alter table public.fixed_excursions add column if not exists leaflet_id uuid references public.monthly_availability_leaflets(id);
alter table public.fixed_excursions add column if not exists status text not null default 'available';
alter table public.fixed_excursions add column if not exists public_visibility boolean not null default true;
alter table public.fixed_excursions add column if not exists archived_at timestamptz null;
alter table public.fixed_excursions add column if not exists archived_by uuid references auth.users(id);
alter table public.fixed_excursions add column if not exists archive_reason text;
alter table public.fixed_excursions add column if not exists cancelled_at timestamptz null;
alter table public.fixed_excursions add column if not exists cancelled_by uuid references auth.users(id);
alter table public.fixed_excursions add column if not exists completed_at timestamptz null;

create index if not exists fixed_excursions_date_idx on public.fixed_excursions(date);
create index if not exists fixed_excursions_active_idx on public.fixed_excursions(active);
create index if not exists fixed_excursions_experience_idx on public.fixed_excursions(experience_id);
create index if not exists fixed_excursions_leaflet_idx on public.fixed_excursions(leaflet_id);
create index if not exists fixed_excursions_status_idx on public.fixed_excursions(status);
create index if not exists fixed_excursions_archive_idx on public.fixed_excursions(archived_at) where archived_at is not null;

drop trigger if exists fixed_excursions_set_updated_at on public.fixed_excursions;
create trigger fixed_excursions_set_updated_at
before update on public.fixed_excursions
for each row execute function public.set_updated_at();


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
  admin_reply text,
  admin_reply_at timestamptz null,
  admin_reply_by uuid references auth.users(id),
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
alter table public.reviews add column if not exists admin_reply text;
alter table public.reviews add column if not exists admin_reply_at timestamptz null;
alter table public.reviews add column if not exists admin_reply_by uuid references auth.users(id);

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


alter table public.partnerships add column if not exists image_path text;
alter table public.partnerships add column if not exists image_name text;
alter table public.partnerships add column if not exists image_type text;

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
-- Site media: admin-managed public images, videos, and documents
-- -----------------------------------------------------------------------------
create table if not exists public.site_media (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  media_key text unique not null,
  label_it text,
  label_en text,
  file_url text,
  file_path text,
  file_name text,
  file_type text,
  media_kind text not null default 'image',
  alt_it text,
  alt_en text,
  active boolean not null default true,
  updated_by uuid references auth.users(id),
  constraint site_media_kind_check check (media_kind in ('image', 'video', 'document')),
  constraint site_media_file_url_check check (file_url is null or file_url ~* '^https?://')
);


alter table public.site_media add column if not exists image_position text default 'center';
alter table public.site_media add column if not exists image_size text default 'normal';

create index if not exists site_media_key_idx on public.site_media(media_key);
create index if not exists site_media_active_idx on public.site_media(active);

drop trigger if exists site_media_set_updated_at on public.site_media;
create trigger site_media_set_updated_at
before update on public.site_media
for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- Site content: admin-managed bilingual public text
-- -----------------------------------------------------------------------------
create table if not exists public.site_content (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  content_key text unique not null,
  section text not null,
  label_it text,
  label_en text,
  value_it text,
  value_en text,
  default_it text,
  default_en text,
  content_type text not null default 'text',
  active boolean not null default true,
  updated_by uuid references auth.users(id),
  constraint site_content_type_check check (content_type in ('text', 'textarea'))
);


alter table public.site_content add column if not exists style_variant text;
alter table public.site_content add column if not exists text_size text default 'normal';
alter table public.site_content add column if not exists text_align text default 'left';
alter table public.site_content add column if not exists visible boolean not null default true;
alter table public.site_content add column if not exists sort_order integer not null default 0;
alter table public.site_content add column if not exists image_url text;
alter table public.site_content add column if not exists image_alt_it text;
alter table public.site_content add column if not exists image_alt_en text;
alter table public.site_content add column if not exists image_position text default 'center';
alter table public.site_content add column if not exists layout_variant text default 'default';

create index if not exists site_content_key_idx on public.site_content(content_key);
create index if not exists site_content_section_idx on public.site_content(section);
create index if not exists site_content_active_idx on public.site_content(active);

drop trigger if exists site_content_set_updated_at on public.site_content;
create trigger site_content_set_updated_at
before update on public.site_content
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Finance ledger: admin-only income and expense tracker
-- -----------------------------------------------------------------------------
create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  entry_date date not null,
  type text not null check (type in ('income', 'expense')),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'EUR',
  title text not null,
  description text,
  category text,
  payment_method text,
  booking_request_id uuid null references public.booking_requests(id),
  fixed_excursion_id uuid null references public.fixed_excursions(id),
  leaflet_id uuid null references public.monthly_availability_leaflets(id),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  archive_reason text,
  active boolean not null default true
);

create index if not exists finance_entries_date_idx on public.finance_entries(entry_date desc);
create index if not exists finance_entries_type_idx on public.finance_entries(type);
create index if not exists finance_entries_active_idx on public.finance_entries(active);
create index if not exists finance_entries_booking_idx on public.finance_entries(booking_request_id);
create index if not exists finance_entries_fixed_idx on public.finance_entries(fixed_excursion_id);
create index if not exists finance_entries_leaflet_idx on public.finance_entries(leaflet_id);

drop trigger if exists finance_entries_set_updated_at on public.finance_entries;
create trigger finance_entries_set_updated_at
before update on public.finance_entries
for each row execute function public.set_updated_at();

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


-- Public-safe monthly availability leaflets for the customer-facing Escursioni calendar.
-- This view intentionally omits file_name and file_path so public UI never exposes raw filenames or storage paths.
drop view if exists public.public_monthly_availability_leaflets;
create view public.public_monthly_availability_leaflets as
select
  id,
  month,
  year,
  title_it,
  title_en,
  file_url,
  file_type,
  active
from public.monthly_availability_leaflets
where active = true
  and file_url is not null;

drop view if exists public.public_partnerships;
create view public.public_partnerships as
select
  id,
  name,
  description_it,
  description_en,
  website_url,
  image_url,
  image_path,
  image_name,
  image_type,
  category_it,
  category_en,
  active,
  display_order
from public.partnerships
where active = true;


drop view if exists public.public_site_media;
create view public.public_site_media as
select
  id,
  media_key,
  label_it,
  label_en,
  file_url,
  file_path,
  file_name,
  file_type,
  media_kind,
  alt_it,
  alt_en,
  image_position,
  image_size,
  active
from public.site_media
where active = true
  and file_url is not null;


drop view if exists public.public_site_content;
create view public.public_site_content as
select
  id,
  content_key,
  section,
  label_it,
  label_en,
  value_it,
  value_en,
  default_it,
  default_en,
  content_type,
  style_variant,
  text_size,
  text_align,
  visible,
  sort_order,
  image_url,
  image_alt_it,
  image_alt_en,
  image_position,
  layout_variant,
  active
from public.site_content
where active = true;

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

-- -----------------------------------------------------------------------------
-- Storage bucket for public blocked-date calendar assets
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vulcaniq-public-assets',
  'vulcaniq-public-assets',
  true,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4']
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
alter table public.monthly_availability_leaflets enable row level security;
alter table public.partnerships enable row level security;
alter table public.site_media enable row level security;
alter table public.site_content enable row level security;
alter table public.finance_entries enable row level security;
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


-- monthly_availability_leaflets: owners manage table. Public sees only linked safe fixed excursions/files.
drop policy if exists "Admins can read monthly leaflets" on public.monthly_availability_leaflets;
create policy "Admins can read monthly leaflets"
on public.monthly_availability_leaflets
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert monthly leaflets" on public.monthly_availability_leaflets;
create policy "Admins can insert monthly leaflets"
on public.monthly_availability_leaflets
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update monthly leaflets" on public.monthly_availability_leaflets;
create policy "Admins can update monthly leaflets"
on public.monthly_availability_leaflets
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


-- site_media: owners manage table. Public reads only public_site_media view.
drop policy if exists "Admins can read site media" on public.site_media;
create policy "Admins can read site media"
on public.site_media
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert site media" on public.site_media;
create policy "Admins can insert site media"
on public.site_media
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update site media" on public.site_media;
create policy "Admins can update site media"
on public.site_media
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());


-- site_content: owners manage table. Public reads only active public_site_content view.
drop policy if exists "Admins can read site content" on public.site_content;
create policy "Admins can read site content"
on public.site_content
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert site content" on public.site_content;
create policy "Admins can insert site content"
on public.site_content
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update site content" on public.site_content;
create policy "Admins can update site content"
on public.site_content
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- finance_entries: admin-only ledger. No public access or public-safe view.
drop policy if exists "Admins can read finance entries" on public.finance_entries;
create policy "Admins can read finance entries"
on public.finance_entries
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert finance entries" on public.finance_entries;
create policy "Admins can insert finance entries"
on public.finance_entries
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update finance entries" on public.finance_entries;
create policy "Admins can update finance entries"
on public.finance_entries
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

drop policy if exists "Admins can delete reviews" on public.reviews;
create policy "Admins can delete reviews"
on public.reviews
for delete
to authenticated
using (public.is_admin());

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
grant select on public.public_monthly_availability_leaflets to anon, authenticated;
grant select on public.public_partnerships to anon, authenticated;
grant select on public.public_site_media to anon, authenticated;
grant select on public.public_site_content to anon, authenticated;
grant select on public.public_reviews to anon, authenticated;
grant execute on function public.submit_public_review(text, text, text, integer, text) to anon, authenticated;
grant insert on public.booking_requests to anon, authenticated;
grant select, insert, update on public.admin_profiles to authenticated;
grant select, insert, update on public.booking_requests to authenticated;
grant select, insert, update on public.availability_blocks to authenticated;
grant select, insert, update on public.fixed_excursions to authenticated;
grant select, insert, update on public.monthly_availability_leaflets to authenticated;
grant select, insert, update on public.partnerships to authenticated;
grant select, insert, update on public.site_media to authenticated;
grant select, insert, update on public.site_content to authenticated;
grant select, insert, update on public.finance_entries to authenticated;
grant select, insert, update, delete on public.reviews to authenticated;
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
--   ('11111111-1111-1111-1111-111111111111', 'Deborah Giusti', 'owner', true);
