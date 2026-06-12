-- Add privacy-first first-party analytics for the vulcanIQ admin Analytics tab.
-- Safe to run more than once. Does not delete existing data.

create extension if not exists pgcrypto;

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
    'booking_submit',
    'booking_submit_attempt',
    'booking_submit_validation_error',
    'booking_submit_success',
    'booking_submit_error',
    'booking_request_created',
    'whatsapp_click',
    'email_click',
    'phone_click',
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

create index if not exists analytics_events_occurred_at_idx
on public.analytics_events(occurred_at desc);

create index if not exists analytics_events_event_name_idx
on public.analytics_events(event_name);

create index if not exists analytics_events_session_id_idx
on public.analytics_events(session_id);

create index if not exists analytics_events_visitor_id_idx
on public.analytics_events(visitor_id);

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

-- Public users may insert anonymous analytics rows for direct anon-key fallback.
-- They cannot select, update, or delete analytics data.
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
    'booking_submit',
    'booking_submit_attempt',
    'booking_submit_validation_error',
    'booking_submit_success',
    'booking_submit_error',
    'booking_request_created',
    'whatsapp_click',
    'email_click',
    'phone_click',
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

-- Admins may read and delete analytics rows. No public select policy exists.
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

notify pgrst, 'reload schema';
