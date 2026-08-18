-- vulcanIQ pre-modernization consolidation
-- Google Business Profile review cache + monotonic analytics session writes.
-- Forward-only, non-destructive migration.

begin;

-- -----------------------------------------------------------------------------
-- Google Business Profile review cache
-- Provider content is temporary and must be refreshed/expired in accordance
-- with Google Business Profile API content-storage policy.
-- -----------------------------------------------------------------------------
create table if not exists public.google_reviews_cache (
  provider text not null default 'google_business_profile',
  provider_review_id text not null,
  account_id text not null,
  location_id text not null,
  author_display_name text,
  author_photo_uri text,
  author_is_anonymous boolean not null default false,
  rating integer,
  review_text text,
  review_language text,
  published_at timestamptz,
  updated_at_source timestamptz,
  google_maps_uri text,
  provider_reply_text text,
  provider_reply_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  primary key (provider, provider_review_id),
  constraint google_reviews_cache_provider_check check (provider = 'google_business_profile'),
  constraint google_reviews_cache_rating_check check (rating is null or rating between 1 and 5),
  constraint google_reviews_cache_google_maps_uri_check check (google_maps_uri is null or google_maps_uri ~* '^https://')
);

create index if not exists google_reviews_cache_expiry_idx
  on public.google_reviews_cache(expires_at);
create index if not exists google_reviews_cache_published_idx
  on public.google_reviews_cache(published_at desc);

alter table public.google_reviews_cache enable row level security;
revoke all on public.google_reviews_cache from public, anon, authenticated;

create table if not exists public.google_reviews_sync_state (
  id text primary key,
  status text not null default 'not_configured',
  location_resource_name text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  updated_at timestamptz not null default now(),
  constraint google_reviews_sync_state_id_check check (id = 'google_business_profile'),
  constraint google_reviews_sync_state_status_check check (status in ('not_configured', 'connected', 'error'))
);

insert into public.google_reviews_sync_state(id, status)
values ('google_business_profile', 'not_configured')
on conflict (id) do nothing;

alter table public.google_reviews_sync_state enable row level security;
revoke all on public.google_reviews_sync_state from public, anon, authenticated;

create or replace function public.get_public_google_reviews()
returns table (
  provider_review_id text,
  author_display_name text,
  author_photo_uri text,
  rating integer,
  review_text text,
  review_language text,
  published_at timestamptz,
  updated_at_source timestamptz,
  google_maps_uri text,
  provider_reply_text text,
  provider_reply_updated_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    r.provider_review_id,
    case when r.author_is_anonymous then null else r.author_display_name end,
    case when r.author_is_anonymous then null else r.author_photo_uri end,
    r.rating,
    r.review_text,
    r.review_language,
    r.published_at,
    r.updated_at_source,
    r.google_maps_uri,
    r.provider_reply_text,
    r.provider_reply_updated_at,
    r.expires_at
  from public.google_reviews_cache r
  where r.provider = 'google_business_profile'
    and r.expires_at > now()
  order by r.published_at desc nulls last, r.updated_at_source desc nulls last
  limit 100;
$$;

revoke all on function public.get_public_google_reviews() from public;
grant execute on function public.get_public_google_reviews() to anon, authenticated;

create or replace function public.get_google_reviews_sync_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  state_row public.google_reviews_sync_state%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = 'P0001';
  end if;

  select * into state_row
  from public.google_reviews_sync_state
  where id = 'google_business_profile';

  return jsonb_build_object(
    'status', coalesce(state_row.status, 'not_configured'),
    'location_resource_name', state_row.location_resource_name,
    'last_attempt_at', state_row.last_attempt_at,
    'last_success_at', state_row.last_success_at,
    'last_error_at', state_row.last_error_at,
    'last_error_code', state_row.last_error_code
  );
end;
$$;

revoke all on function public.get_google_reviews_sync_status() from public, anon;
grant execute on function public.get_google_reviews_sync_status() to authenticated;

-- -----------------------------------------------------------------------------
-- Monotonic analytics-session upsert.
-- A delayed session_start must never overwrite a later page_view count or
-- shorten duration/last_seen values.
-- -----------------------------------------------------------------------------
create or replace function public.upsert_analytics_session(
  p_session_id text,
  p_visitor_id text,
  p_started_at timestamptz,
  p_last_seen_at timestamptz,
  p_duration_seconds integer,
  p_pageview_count integer,
  p_entry_path text,
  p_exit_path text,
  p_referrer_domain text,
  p_traffic_source text,
  p_country_code text,
  p_country_name text,
  p_city text,
  p_language text,
  p_device_type text,
  p_browser text,
  p_operating_system text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(coalesce(p_session_id, '')), '') is null
     or nullif(btrim(coalesce(p_visitor_id, '')), '') is null then
    return;
  end if;

  insert into public.analytics_sessions (
    session_id,
    visitor_id,
    started_at,
    last_seen_at,
    duration_seconds,
    pageview_count,
    entry_path,
    exit_path,
    referrer_domain,
    traffic_source,
    country_code,
    country_name,
    city,
    language,
    device_type,
    browser,
    operating_system,
    updated_at
  ) values (
    left(p_session_id, 140),
    left(p_visitor_id, 140),
    coalesce(p_started_at, now()),
    coalesce(p_last_seen_at, now()),
    greatest(0, least(1800, coalesce(p_duration_seconds, 0))),
    greatest(0, coalesce(p_pageview_count, 0)),
    left(coalesce(nullif(btrim(p_entry_path), ''), '/'), 240),
    left(coalesce(nullif(btrim(p_exit_path), ''), '/'), 240),
    left(nullif(btrim(coalesce(p_referrer_domain, '')), ''), 140),
    left(coalesce(nullif(btrim(p_traffic_source), ''), 'direct'), 40),
    left(nullif(btrim(coalesce(p_country_code, '')), ''), 8),
    left(nullif(btrim(coalesce(p_country_name, '')), ''), 80),
    left(nullif(btrim(coalesce(p_city, '')), ''), 120),
    left(nullif(btrim(coalesce(p_language, '')), ''), 8),
    left(nullif(btrim(coalesce(p_device_type, '')), ''), 24),
    left(nullif(btrim(coalesce(p_browser, '')), ''), 40),
    left(nullif(btrim(coalesce(p_operating_system, '')), ''), 40),
    now()
  )
  on conflict (session_id) do update set
    visitor_id = public.analytics_sessions.visitor_id,
    started_at = least(public.analytics_sessions.started_at, excluded.started_at),
    last_seen_at = greatest(public.analytics_sessions.last_seen_at, excluded.last_seen_at),
    duration_seconds = greatest(public.analytics_sessions.duration_seconds, excluded.duration_seconds),
    pageview_count = greatest(public.analytics_sessions.pageview_count, excluded.pageview_count),
    entry_path = coalesce(nullif(public.analytics_sessions.entry_path, ''), excluded.entry_path),
    exit_path = case
      when excluded.last_seen_at >= public.analytics_sessions.last_seen_at
        then coalesce(nullif(excluded.exit_path, ''), public.analytics_sessions.exit_path)
      else public.analytics_sessions.exit_path
    end,
    referrer_domain = coalesce(public.analytics_sessions.referrer_domain, excluded.referrer_domain),
    traffic_source = coalesce(nullif(public.analytics_sessions.traffic_source, ''), excluded.traffic_source),
    country_code = coalesce(public.analytics_sessions.country_code, excluded.country_code),
    country_name = coalesce(public.analytics_sessions.country_name, excluded.country_name),
    city = coalesce(public.analytics_sessions.city, excluded.city),
    language = coalesce(public.analytics_sessions.language, excluded.language),
    device_type = coalesce(public.analytics_sessions.device_type, excluded.device_type),
    browser = coalesce(public.analytics_sessions.browser, excluded.browser),
    operating_system = coalesce(public.analytics_sessions.operating_system, excluded.operating_system),
    updated_at = now();
end;
$$;

revoke all on function public.upsert_analytics_session(text,text,timestamptz,timestamptz,integer,integer,text,text,text,text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.upsert_analytics_session(text,text,timestamptz,timestamptz,integer,integer,text,text,text,text,text,text,text,text,text,text,text) to service_role;

commit;
