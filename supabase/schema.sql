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


create or replace function public.is_owner()
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
      and ap.role = 'owner'
  );
$$;

create table if not exists public.system_backup_settings (
  id text primary key default 'default',
  enabled boolean not null default true,
  frequency text not null default 'daily',
  utc_hour integer not null default 2,
  utc_minute integer not null default 0,
  weekly_day integer,
  monthly_day integer,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  last_scheduled_backup_at timestamptz,
  constraint system_backup_settings_singleton check (id = 'default'),
  constraint system_backup_settings_frequency_check check (frequency in ('daily', 'weekly', 'monthly')),
  constraint system_backup_settings_utc_hour_check check (utc_hour between 0 and 23),
  constraint system_backup_settings_utc_minute_check check (utc_minute between 0 and 59),
  constraint system_backup_settings_weekly_day_check check (weekly_day is null or weekly_day between 0 and 6),
  constraint system_backup_settings_monthly_day_check check (monthly_day is null or monthly_day between 1 and 28)
);

drop trigger if exists system_backup_settings_set_updated_at on public.system_backup_settings;
create trigger system_backup_settings_set_updated_at
before update on public.system_backup_settings
for each row execute function public.set_updated_at();

insert into public.system_backup_settings (id, enabled, frequency, utc_hour, utc_minute, weekly_day, monthly_day)
values ('default', true, 'daily', 2, 0, null, null)
on conflict (id) do nothing;

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
  description_it text,
  description_en text,
  notes_it text,
  notes_en text,
  file_url text,
  file_path text,
  file_name text,
  file_type text,
  leaflet_file_url_it text,
  leaflet_file_path_it text,
  leaflet_file_name_it text,
  leaflet_file_type_it text,
  leaflet_file_url_en text,
  leaflet_file_path_en text,
  leaflet_file_name_en text,
  leaflet_file_type_en text,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint monthly_availability_leaflets_month_check check (month between 1 and 12),
  constraint monthly_availability_leaflets_year_check check (year between 2024 and 2100),
  constraint monthly_availability_leaflets_file_url_check check (file_url is null or file_url ~* '^https?://')
);

alter table public.monthly_availability_leaflets add column if not exists description_it text;
alter table public.monthly_availability_leaflets add column if not exists description_en text;
alter table public.monthly_availability_leaflets add column if not exists notes_it text;
alter table public.monthly_availability_leaflets add column if not exists notes_en text;
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
  program_it text,
  program_en text,
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
  leaflet_file_url_it text,
  leaflet_file_path_it text,
  leaflet_file_name_it text,
  leaflet_file_type_it text,
  leaflet_file_url_en text,
  leaflet_file_path_en text,
  leaflet_file_name_en text,
  leaflet_file_type_en text,
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
alter table public.fixed_excursions add column if not exists program_it text;
alter table public.fixed_excursions add column if not exists program_en text;
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
  source text not null default 'website',
  review_date date,
  external_review_url text,
  profile_photo_url text,
  display_order integer not null default 0,
  constraint reviews_rating_check check (rating is null or (rating >= 1 and rating <= 5)),
  constraint reviews_language_check check (language is null or language in ('it', 'en')),
  constraint reviews_source_check check (source in ('website', 'internal', 'direct', 'google')),
  constraint reviews_external_review_url_check check (external_review_url is null or external_review_url ~* '^https?://'),
  constraint reviews_profile_photo_url_check check (profile_photo_url is null or profile_photo_url ~* '^https?://')
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
alter table public.reviews add column if not exists source text not null default 'website';
alter table public.reviews add column if not exists review_date date;
alter table public.reviews add column if not exists external_review_url text;
alter table public.reviews add column if not exists profile_photo_url text;
alter table public.reviews add column if not exists display_order integer not null default 0;

create unique index if not exists reviews_booking_code_unique_idx on public.reviews(booking_code);
create index if not exists reviews_active_idx on public.reviews(active, approved);
create index if not exists reviews_created_at_idx on public.reviews(created_at desc);
create index if not exists reviews_source_active_idx on public.reviews(source, active, approved);
create index if not exists reviews_display_date_idx on public.reviews(display_order, review_date desc, created_at desc);

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
  google_maps_url text,
  social_url text,
  image_url text,
  category_it text,
  category_en text,
  category_key text not null default 'other',
  active boolean not null default true,
  display_order integer not null default 0,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint partnerships_website_url_check check (website_url is null or website_url ~* '^https?://'),
  constraint partnerships_google_maps_url_check check (google_maps_url is null or google_maps_url ~* '^https?://'),
  constraint partnerships_social_url_check check (social_url is null or social_url ~* '^https?://'),
  constraint partnerships_category_key_check check (category_key in ('activities', 'restaurants', 'accommodation', 'transport', 'guides_services', 'shops', 'other')),
  constraint partnerships_image_url_check check (image_url is null or image_url ~* '^https?://')
);


alter table public.partnerships add column if not exists image_path text;
alter table public.partnerships add column if not exists image_name text;
alter table public.partnerships add column if not exists image_type text;
alter table public.partnerships add column if not exists category_key text not null default 'other';
alter table public.partnerships add column if not exists google_maps_url text;
alter table public.partnerships add column if not exists social_url text;

create index if not exists partnerships_active_idx on public.partnerships(active);
create index if not exists partnerships_display_order_idx on public.partnerships(display_order, name);
create index if not exists partnerships_category_display_idx on public.partnerships(category_key, display_order, name);

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

drop view if exists public.public_partnerships;
create view public.public_partnerships as
select
  id,
  name,
  description_it,
  description_en,
  website_url,
  google_maps_url,
  social_url,
  image_url,
  image_path,
  image_name,
  image_type,
  category_key,
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
  admin_reply_at,
  source,
  review_date,
  external_review_url,
  profile_photo_url,
  display_order
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
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
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
alter table public.system_backup_settings enable row level security;

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


-- system_backup_settings: only active owners can read and manage backup scheduling.
drop policy if exists "Owners can read backup settings" on public.system_backup_settings;
create policy "Owners can read backup settings"
on public.system_backup_settings
for select
to authenticated
using (public.is_owner());

drop policy if exists "Owners can manage backup settings" on public.system_backup_settings;
create policy "Owners can manage backup settings"
on public.system_backup_settings
for all
to authenticated
using (public.is_owner())
with check (public.is_owner());

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
grant execute on function public.is_owner() to authenticated;
grant insert on public.booking_requests to anon, authenticated;
grant select, insert, update on public.admin_profiles to authenticated;
grant select, insert, update on public.system_backup_settings to authenticated;
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

-- -----------------------------------------------------------------------------
-- Booking codes for external bookings
-- -----------------------------------------------------------------------------
create table if not exists public.booking_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  experience_id text,
  fixed_excursion_id uuid null references public.fixed_excursions(id) on delete set null,
  experience_name_it text not null,
  experience_name_en text,
  experience_type text,
  scheduled_date date,
  scheduled_time text,
  meeting_point_name text,
  meeting_point_maps_url text,
  expected_amount numeric(10,2) not null default 0,
  currency text not null default 'EUR',
  source text not null default 'manual',
  admin_note text,
  customer_note text,
  status text not null default 'unused',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_booking_request_id uuid references public.booking_requests(id) on delete set null,
  redeemed_finance_entry_id uuid references public.finance_entries(id) on delete set null,
  constraint booking_codes_status_check check (status in ('unused', 'redeemed', 'expired', 'cancelled')),
  constraint booking_codes_expected_amount_check check (expected_amount >= 0)
);

create index if not exists booking_codes_code_idx on public.booking_codes (code);
create index if not exists booking_codes_status_idx on public.booking_codes (status);
create index if not exists booking_codes_created_at_idx on public.booking_codes (created_at);
create index if not exists booking_codes_redeemed_at_idx on public.booking_codes (redeemed_at);
create index if not exists booking_codes_scheduled_date_idx on public.booking_codes (scheduled_date);
create index if not exists booking_codes_fixed_excursion_idx on public.booking_codes (fixed_excursion_id);

drop trigger if exists booking_codes_set_updated_at on public.booking_codes;
create trigger booking_codes_set_updated_at
before update on public.booking_codes
for each row execute function public.set_updated_at();

alter table public.booking_requests drop constraint if exists booking_requests_source_check;
alter table public.booking_requests
  add constraint booking_requests_source_check
  check (source in ('website', 'whatsapp', 'phone', 'email', 'manual', 'booking_code'));

alter table public.booking_codes enable row level security;

drop policy if exists "Admins can read booking codes" on public.booking_codes;
create policy "Admins can read booking codes"
on public.booking_codes
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert booking codes" on public.booking_codes;
create policy "Admins can insert booking codes"
on public.booking_codes
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update booking codes" on public.booking_codes;
create policy "Admins can update booking codes"
on public.booking_codes
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update on public.booking_codes to authenticated;

create or replace function public.redeem_booking_code(p_code text, p_language text default 'it')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  code_row public.booking_codes%rowtype;
  booking_row public.booking_requests%rowtype;
  finance_row public.finance_entries%rowtype;
  clean_code text;
  clean_language text;
begin
  clean_code := upper(trim(coalesce(p_code, '')));
  clean_language := case when p_language = 'en' then 'en' else 'it' end;

  if clean_code = '' then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_REQUIRED');
  end if;

  select * into code_row
  from public.booking_codes
  where upper(code) = clean_code
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_NOT_FOUND');
  end if;

  if code_row.status = 'redeemed' then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_ALREADY_REDEEMED');
  end if;

  if code_row.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_CANCELLED');
  end if;

  if code_row.status = 'expired' or (code_row.expires_at is not null and code_row.expires_at < now()) then
    update public.booking_codes set status = 'expired' where id = code_row.id;
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_EXPIRED');
  end if;

  insert into public.booking_requests (
    status, request_type, fixed_excursion_id, customer_name, customer_email, customer_phone,
    preferred_contact, experience_id, requested_date, language, adults, children, children_under_3,
    private_experience, message, source, source_section, source_cta, cta_location, selected_date,
    has_fixed_excursion, admin_note, decision_note, decided_at, booking_code
  ) values (
    'accepted', case when code_row.fixed_excursion_id is not null then 'fixed' else 'private' end,
    code_row.fixed_excursion_id, code_row.customer_name, code_row.customer_email, code_row.customer_phone,
    'unknown', coalesce(code_row.experience_id, 'unsure'), code_row.scheduled_date, clean_language, 1, 0, false,
    code_row.fixed_excursion_id is null, coalesce(code_row.customer_note, code_row.admin_note), 'booking_code',
    'booking_code_redemption', 'booking_code_confirm', 'booking_code_screen', code_row.scheduled_date,
    code_row.fixed_excursion_id is not null, code_row.admin_note, 'Redeemed from booking code ' || code_row.code, now(), code_row.code
  ) returning * into booking_row;

  insert into public.finance_entries (
    entry_date, type, amount, currency, title, description, category, payment_method,
    booking_request_id, fixed_excursion_id, active
  ) values (
    coalesce(code_row.scheduled_date, current_date), 'income', coalesce(code_row.expected_amount, 0),
    coalesce(code_row.currency, 'EUR'), 'Booking code ' || code_row.code,
    coalesce(code_row.experience_name_it, code_row.experience_name_en, 'vulcanIQ experience'),
    'booking_code', 'external_platform', booking_row.id, code_row.fixed_excursion_id, true
  ) returning * into finance_row;

  update public.booking_codes
  set status = 'redeemed', redeemed_at = now(), redeemed_booking_request_id = booking_row.id, redeemed_finance_entry_id = finance_row.id
  where id = code_row.id;

  return jsonb_build_object(
    'ok', true,
    'code', code_row.code,
    'customer_name', code_row.customer_name,
    'experience_name_it', code_row.experience_name_it,
    'experience_name_en', coalesce(code_row.experience_name_en, code_row.experience_name_it),
    'scheduled_date', code_row.scheduled_date,
    'booking_request_id', booking_row.id,
    'finance_entry_id', finance_row.id
  );
end;
$$;

grant execute on function public.redeem_booking_code(text, text) to anon, authenticated;
-- vulcanIQ Revenue OS follow-up foundation
-- Safe additive migration: finance currency hardening, booking-code review reuse,
-- analytics allowlists, CRM/revenue scaffolding, owner-only admin users.

begin;

-- -----------------------------------------------------------------------------
-- Admin users / roles
-- -----------------------------------------------------------------------------
alter table public.admin_profiles add column if not exists email text;
alter table public.admin_profiles add column if not exists last_seen_at timestamptz;
alter table public.admin_profiles drop constraint if exists admin_profiles_role_check;
alter table public.admin_profiles
  add constraint admin_profiles_role_check
  check (role in ('owner', 'manager', 'guide', 'finance', 'content_editor'));

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
      and ap.role in ('owner', 'manager', 'guide', 'finance', 'content_editor')
  );
$$;

create or replace function public.is_owner()
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
      and ap.role = 'owner'
  );
$$;

drop policy if exists "Admins can manage admin profiles" on public.admin_profiles;
create policy "Owners can manage admin profiles"
on public.admin_profiles
for all
to authenticated
using (public.is_owner())
with check (public.is_owner());

-- -----------------------------------------------------------------------------
-- Finance currency cleanup
-- -----------------------------------------------------------------------------
alter table public.finance_entries add column if not exists currency text not null default 'EUR';

update public.finance_entries
set
  amount = coalesce(nullif(replace(regexp_replace(currency, '[^0-9,.-]', '', 'g'), ',', '.'), '')::numeric, amount),
  currency = 'EUR',
  updated_at = now()
where currency is not null
  and currency !~ '^[A-Za-z]{3}$'
  and currency ~ '[0-9]';

update public.finance_entries
set currency = 'EUR', updated_at = now()
where currency is null or currency !~ '^[A-Za-z]{3}$';

update public.finance_entries
set currency = upper(currency), updated_at = now()
where currency <> upper(currency);

-- -----------------------------------------------------------------------------
-- Booking-code review reuse
-- -----------------------------------------------------------------------------
alter table public.booking_codes add column if not exists review_enabled boolean not null default false;
alter table public.booking_codes add column if not exists review_submitted_at timestamptz;
alter table public.booking_codes add column if not exists review_id uuid references public.reviews(id) on delete set null;
alter table public.booking_codes add column if not exists redeemed_booking_request_id uuid references public.booking_requests(id) on delete set null;
alter table public.booking_codes add column if not exists redeemed_finance_entry_id uuid references public.finance_entries(id) on delete set null;

update public.booking_codes
set
  expected_amount = coalesce(nullif(replace(regexp_replace(currency, '[^0-9,.-]', '', 'g'), ',', '.'), '')::numeric, expected_amount),
  currency = 'EUR',
  updated_at = now()
where currency is not null
  and currency !~ '^[A-Za-z]{3}$'
  and currency ~ '[0-9]';

update public.booking_codes
set currency = 'EUR', updated_at = now()
where currency is null or currency !~ '^[A-Za-z]{3}$';

update public.booking_codes
set review_enabled = true
where status = 'redeemed'
  and review_enabled = false;

alter table public.reviews add column if not exists booking_code_id uuid references public.booking_codes(id) on delete set null;
alter table public.reviews add column if not exists booking_request_id uuid references public.booking_requests(id) on delete set null;
alter table public.reviews add column if not exists source text not null default 'website';

alter table public.reviews drop constraint if exists reviews_source_check;
alter table public.reviews
  add constraint reviews_source_check
  check (source in ('website', 'internal', 'direct', 'google', 'booking_code', 'referral'));

create unique index if not exists reviews_one_per_booking_code_idx
on public.reviews(booking_code_id)
where booking_code_id is not null;

create or replace function public.redeem_booking_code(p_code text, p_language text default 'it')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  code_row public.booking_codes%rowtype;
  booking_row public.booking_requests%rowtype;
  finance_row public.finance_entries%rowtype;
  clean_code text;
  clean_language text;
begin
  clean_code := upper(trim(coalesce(p_code, '')));
  clean_language := case when p_language = 'en' then 'en' else 'it' end;

  if clean_code = '' then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_REQUIRED');
  end if;

  select * into code_row
  from public.booking_codes
  where upper(code) = clean_code
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_NOT_FOUND');
  end if;

  if code_row.status = 'redeemed' then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_ALREADY_REDEEMED', 'review_enabled', code_row.review_enabled);
  end if;

  if code_row.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_CANCELLED');
  end if;

  if code_row.status = 'expired' or (code_row.expires_at is not null and code_row.expires_at < now()) then
    update public.booking_codes set status = 'expired' where id = code_row.id;
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_EXPIRED');
  end if;

  insert into public.booking_requests (
    status, request_type, fixed_excursion_id, customer_name, customer_email, customer_phone,
    preferred_contact, experience_id, requested_date, language, adults, children, children_under_3,
    private_experience, message, source, source_section, source_cta, cta_location, selected_date,
    has_fixed_excursion, admin_note, decision_note, decided_at, booking_code,
    lead_status, confirmed_at, expected_value
  ) values (
    'accepted', case when code_row.fixed_excursion_id is not null then 'fixed' else 'private' end,
    code_row.fixed_excursion_id, code_row.customer_name, code_row.customer_email, code_row.customer_phone,
    'unknown', coalesce(code_row.experience_id, 'unsure'), code_row.scheduled_date, clean_language, 1, 0, false,
    code_row.fixed_excursion_id is null, coalesce(code_row.customer_note, code_row.admin_note), 'booking_code',
    'booking_code_redemption', 'booking_code_confirm', 'booking_code_screen', code_row.scheduled_date,
    code_row.fixed_excursion_id is not null, code_row.admin_note, 'Redeemed from booking code ' || code_row.code, now(), code_row.code,
    'confirmed', now(), code_row.expected_amount
  ) returning * into booking_row;

  insert into public.finance_entries (
    entry_date, type, amount, currency, title, description, category, payment_method,
    booking_request_id, fixed_excursion_id, active
  ) values (
    coalesce(code_row.scheduled_date, current_date), 'income', coalesce(code_row.expected_amount, 0),
    coalesce(nullif(upper(code_row.currency), ''), 'EUR'), 'Booking code ' || code_row.code,
    coalesce(code_row.experience_name_it, code_row.experience_name_en, 'vulcanIQ experience'),
    'booking_code', 'external_platform', booking_row.id, code_row.fixed_excursion_id, true
  ) returning * into finance_row;

  update public.booking_codes
  set status = 'redeemed',
      redeemed_at = now(),
      redeemed_booking_request_id = booking_row.id,
      redeemed_finance_entry_id = finance_row.id,
      review_enabled = true,
      updated_at = now()
  where id = code_row.id;

  return jsonb_build_object(
    'ok', true,
    'code', code_row.code,
    'customer_name', code_row.customer_name,
    'experience_name_it', code_row.experience_name_it,
    'experience_name_en', coalesce(code_row.experience_name_en, code_row.experience_name_it),
    'scheduled_date', code_row.scheduled_date,
    'booking_request_id', booking_row.id,
    'finance_entry_id', finance_row.id,
    'review_enabled', true
  );
end;
$$;

grant execute on function public.redeem_booking_code(text, text) to anon, authenticated;

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
  matched_code public.booking_codes%rowtype;
  inserted_review public.reviews%rowtype;
  clean_code text := upper(trim(coalesce(p_booking_code, '')));
begin
  if clean_code = '' then
    raise exception 'INVALID_BOOKING_CODE';
  end if;

  if trim(coalesce(p_review_text, '')) = '' then
    raise exception 'REVIEW_TEXT_REQUIRED';
  end if;

  select * into matched_code
  from public.booking_codes
  where upper(code) = clean_code
  limit 1;

  if found then
    if matched_code.status <> 'redeemed' or matched_code.review_enabled is not true then
      raise exception 'INVALID_BOOKING_CODE';
    end if;
    if matched_code.review_submitted_at is not null or exists (select 1 from public.reviews r where r.booking_code_id = matched_code.id) then
      raise exception 'BOOKING_CODE_USED';
    end if;

    if matched_code.redeemed_booking_request_id is not null then
      select * into matched_request from public.booking_requests where id = matched_code.redeemed_booking_request_id limit 1;
    else
      select * into matched_request from public.booking_requests where booking_code = clean_code and source = 'booking_code' order by created_at desc limit 1;
    end if;

    insert into public.reviews (
      booking_request_id,
      booking_code_id,
      booking_code,
      reviewer_name,
      review_text,
      rating,
      language,
      source,
      approved,
      active
    ) values (
      matched_request.id,
      matched_code.id,
      clean_code,
      nullif(trim(coalesce(p_reviewer_name, '')), ''),
      trim(p_review_text),
      case when p_rating between 1 and 5 then p_rating else null end,
      case when p_language in ('it', 'en') then p_language else coalesce(matched_request.language, 'it') end,
      'booking_code',
      true,
      true
    ) returning * into inserted_review;

    update public.booking_codes
    set review_submitted_at = now(), review_id = inserted_review.id, updated_at = now()
    where id = matched_code.id;

    if matched_request.id is not null then
      update public.booking_requests
      set review_submitted = true,
          review_submitted_at = now(),
          review_received_at = now(),
          lead_status = coalesce(lead_status, 'review_received'),
          updated_at = now()
      where id = matched_request.id;
    end if;

    return inserted_review;
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
    source,
    approved,
    active
  ) values (
    matched_request.id,
    clean_code,
    nullif(trim(coalesce(p_reviewer_name, '')), ''),
    trim(p_review_text),
    case when p_rating between 1 and 5 then p_rating else null end,
    case when p_language in ('it', 'en') then p_language else matched_request.language end,
    'website',
    true,
    true
  ) returning * into inserted_review;

  update public.booking_requests
  set review_submitted = true,
      review_submitted_at = now(),
      review_received_at = now(),
      updated_at = now()
  where id = matched_request.id;

  return inserted_review;
end;
$$;

grant execute on function public.submit_public_review(text, text, text, integer, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Analytics allowlists and traffic sources
-- -----------------------------------------------------------------------------
alter table public.analytics_events drop constraint if exists analytics_events_event_name_check;
alter table public.analytics_events
  add constraint analytics_events_event_name_check
  check (event_name in (
    'page_view','session_start','session_heartbeat','session_end','language_switch',
    'excursion_view','experience_card_view','experience_detail_open','calendar_date_select',
    'booking_form_open','booking_form_field_start','booking_form_submit_attempt','booking_form_validation_error','booking_form_submit_success','booking_form_submit_error','booking_request_created',
    'request_details_open','fixed_excursion_options_open','private_excursion_options_open','fixed_leaflet_open_from_request','private_excursion_detail_open_from_request',
    'booking_submit','booking_submit_attempt','booking_submit_validation_error','booking_submit_success','booking_submit_error',
    'book_with_code_clicked','booking_code_redeem_attempt','booking_code_redeem_success','booking_code_redeem_error','booking_code_submitted','booking_code_redeemed','booking_code_invalid',
    'booking_code_review_open','booking_code_review_submit_attempt','booking_code_review_submit_success','booking_code_review_duplicate',
    'whatsapp_click','email_click','phone_click','google_maps_click','maps_click','meeting_point_maps_click','social_link_click','external_link_click','google_reviews_click','review_view',
    'pricing_card_view','pricing_cta_click','fast_request_start','fast_request_step_complete','fast_request_abandon','fast_request_whatsapp_click','fast_request_submit_attempt','fast_request_submit_success',
    'gift_card_view','gift_card_request_click','gbp_utm_link_click','lead_status_changed','lead_follow_up_set','review_request_sent','google_review_request_click','referral_code_created','referral_link_click','abandoned_form_detected','abandoned_form_recovered_whatsapp'
  ));

alter table public.analytics_events drop constraint if exists analytics_events_traffic_source_check;
alter table public.analytics_events
  add constraint analytics_events_traffic_source_check
  check (traffic_source is null or traffic_source in ('direct','google','google_business_profile','instagram','facebook','tiktok','whatsapp','partner','qr','business_card','other'));

alter table public.analytics_sessions drop constraint if exists analytics_sessions_traffic_source_check;
alter table public.analytics_sessions
  add constraint analytics_sessions_traffic_source_check
  check (traffic_source is null or traffic_source in ('direct','google','google_business_profile','instagram','facebook','tiktok','whatsapp','partner','qr','business_card','other'));

-- -----------------------------------------------------------------------------
-- CRM / revenue attribution scaffolding
-- -----------------------------------------------------------------------------
alter table public.booking_requests add column if not exists lead_status text;
alter table public.booking_requests add column if not exists lead_priority text;
alter table public.booking_requests add column if not exists lead_owner_id uuid references auth.users(id) on delete set null;
alter table public.booking_requests add column if not exists next_follow_up_at timestamptz;
alter table public.booking_requests add column if not exists contacted_at timestamptz;
alter table public.booking_requests add column if not exists quoted_at timestamptz;
alter table public.booking_requests add column if not exists deposit_sent_at timestamptz;
alter table public.booking_requests add column if not exists deposit_paid_at timestamptz;
alter table public.booking_requests add column if not exists confirmed_at timestamptz;
alter table public.booking_requests add column if not exists completed_at timestamptz;
alter table public.booking_requests add column if not exists review_requested_at timestamptz;
alter table public.booking_requests add column if not exists review_received_at timestamptz;
alter table public.booking_requests add column if not exists lost_at timestamptz;
alter table public.booking_requests add column if not exists lost_reason text;
alter table public.booking_requests add column if not exists expected_value numeric(10,2);
alter table public.booking_requests add column if not exists quoted_amount numeric(10,2);
alter table public.booking_requests add column if not exists internal_notes text;

alter table public.booking_requests drop constraint if exists booking_requests_lead_status_check;
alter table public.booking_requests
  add constraint booking_requests_lead_status_check
  check (lead_status is null or lead_status in ('new_lead','contacted','waiting_customer','quoted','deposit_sent','deposit_paid','confirmed','completed','review_requested','review_received','lost','cancelled'));

alter table public.booking_requests drop constraint if exists booking_requests_lead_priority_check;
alter table public.booking_requests
  add constraint booking_requests_lead_priority_check
  check (lead_priority is null or lead_priority in ('low','normal','high','urgent'));

create index if not exists booking_requests_lead_status_idx on public.booking_requests(lead_status);
create index if not exists booking_requests_next_follow_up_idx on public.booking_requests(next_follow_up_at) where next_follow_up_at is not null;
create index if not exists booking_requests_revenue_source_idx on public.booking_requests(source, traffic_source, utm_source);

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  booking_request_id uuid references public.booking_requests(id) on delete set null,
  created_by uuid references auth.users(id),
  customer_name text,
  active boolean not null default true,
  discount_note text,
  commission_note text,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create table if not exists public.partner_referrals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid,
  referral_code text,
  booking_request_id uuid references public.booking_requests(id) on delete set null,
  source_url text,
  commission_type text default 'none',
  commission_value numeric(10,2),
  commission_status text default 'pending',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  constraint partner_referrals_commission_type_check check (commission_type in ('fixed','percentage','none')),
  constraint partner_referrals_commission_status_check check (commission_status in ('pending','approved','paid','cancelled'))
);

alter table public.referral_codes enable row level security;
alter table public.partner_referrals enable row level security;

drop policy if exists "Admins can manage referral codes" on public.referral_codes;
create policy "Admins can manage referral codes" on public.referral_codes for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can manage partner referrals" on public.partner_referrals;
create policy "Admins can manage partner referrals" on public.partner_referrals for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on public.referral_codes to authenticated;
grant select, insert, update on public.partner_referrals to authenticated;

-- Dynamic pricing inputs are admin-only scaffolding. Public UI keeps conservative copy.
alter table public.fixed_excursions add column if not exists base_price numeric(10,2);
alter table public.fixed_excursions add column if not exists min_group_size integer;
alter table public.fixed_excursions add column if not exists max_capacity integer;
alter table public.fixed_excursions add column if not exists low_availability_surcharge numeric(10,2);
alter table public.fixed_excursions add column if not exists private_premium_multiplier numeric(6,2);
alter table public.fixed_excursions add column if not exists seasonal_label text;
alter table public.fixed_excursions add column if not exists manual_override_price numeric(10,2);

notify pgrst, 'reload schema';

commit;
