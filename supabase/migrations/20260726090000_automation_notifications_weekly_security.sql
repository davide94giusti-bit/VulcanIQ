-- vulcanIQ production automation, notification, reporting, analytics, and security hardening.
-- Apply after the existing Revenue OS migrations.

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- First-touch attribution, submission idempotency, and notification state
-- -----------------------------------------------------------------------------
alter table public.booking_requests add column if not exists selected_month text;
alter table public.booking_requests add column if not exists utm_term text;
alter table public.booking_requests add column if not exists referrer text;
alter table public.booking_requests add column if not exists landing_path text;
alter table public.booking_requests add column if not exists detected_source text;
alter table public.booking_requests add column if not exists declared_source text;
alter table public.booking_requests add column if not exists idempotency_key text;
alter table public.booking_requests add column if not exists submission_fingerprint text;
alter table public.booking_requests add column if not exists submission_actor_hash text;
alter table public.booking_requests add column if not exists notification_email_sent_at timestamptz;
alter table public.booking_requests add column if not exists notification_email_error text;
alter table public.booking_requests add column if not exists notification_email_attempts integer not null default 0;
alter table public.booking_requests add column if not exists notification_email_status text not null default 'not_sent';

alter table public.booking_requests drop constraint if exists booking_requests_notification_email_status_check;
alter table public.booking_requests
  add constraint booking_requests_notification_email_status_check
  check (notification_email_status in ('not_sent', 'pending', 'sent', 'failed'));

create unique index if not exists booking_requests_idempotency_key_unique
  on public.booking_requests(idempotency_key)
  where idempotency_key is not null;
create index if not exists booking_requests_notification_status_idx
  on public.booking_requests(notification_email_status, created_at desc);
create index if not exists booking_requests_pending_age_idx
  on public.booking_requests(created_at)
  where status = 'pending';

alter table public.gift_card_requests add column if not exists detected_source text;
alter table public.gift_card_requests add column if not exists declared_source text;
alter table public.gift_card_requests add column if not exists utm_source text;
alter table public.gift_card_requests add column if not exists utm_medium text;
alter table public.gift_card_requests add column if not exists utm_campaign text;
alter table public.gift_card_requests add column if not exists utm_content text;
alter table public.gift_card_requests add column if not exists utm_term text;
alter table public.gift_card_requests add column if not exists referrer text;
alter table public.gift_card_requests add column if not exists landing_path text;
alter table public.gift_card_requests add column if not exists analytics_session_id text;
alter table public.gift_card_requests add column if not exists analytics_visitor_id text;
alter table public.gift_card_requests add column if not exists analytics_journey_id text;
alter table public.gift_card_requests add column if not exists idempotency_key text;
alter table public.gift_card_requests add column if not exists submission_fingerprint text;
alter table public.gift_card_requests add column if not exists submission_actor_hash text;
alter table public.gift_card_requests add column if not exists notification_email_sent_at timestamptz;
alter table public.gift_card_requests add column if not exists notification_email_error text;
alter table public.gift_card_requests add column if not exists notification_email_attempts integer not null default 0;
alter table public.gift_card_requests add column if not exists notification_email_status text not null default 'not_sent';

alter table public.gift_card_requests drop constraint if exists gift_card_requests_notification_email_status_check;
alter table public.gift_card_requests
  add constraint gift_card_requests_notification_email_status_check
  check (notification_email_status in ('not_sent', 'pending', 'sent', 'failed'));

create unique index if not exists gift_card_requests_idempotency_key_unique
  on public.gift_card_requests(idempotency_key)
  where idempotency_key is not null;
create index if not exists gift_card_requests_notification_status_idx
  on public.gift_card_requests(notification_email_status, created_at desc);

-- -----------------------------------------------------------------------------
-- Notification and weekly report logs
-- -----------------------------------------------------------------------------
create table if not exists public.request_notification_log (
  id uuid primary key default gen_random_uuid(),
  request_table text not null,
  request_id text not null,
  channel text not null default 'email',
  recipient text not null,
  provider text not null default 'resend',
  provider_message_id text,
  status text not null default 'pending',
  error_message text,
  attempts integer not null default 1,
  last_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint request_notification_log_table_check check (request_table in ('booking_requests', 'gift_card_requests')),
  constraint request_notification_log_channel_check check (channel in ('email')),
  constraint request_notification_log_status_check check (status in ('pending', 'sent', 'failed')),
  constraint request_notification_log_attempts_check check (attempts between 1 and 10)
);

create unique index if not exists request_notification_log_idempotency_unique
  on public.request_notification_log(request_table, request_id, channel, recipient);
create index if not exists request_notification_log_status_idx
  on public.request_notification_log(status, created_at desc);

create table if not exists public.admin_weekly_reports (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  recipient text not null,
  report_type text not null default 'weekly_management_recap',
  status text not null default 'pending',
  provider_message_id text,
  error_message text,
  metrics jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint admin_weekly_reports_period_check check (period_end > period_start),
  constraint admin_weekly_reports_status_check check (status in ('pending', 'sent', 'failed', 'test'))
);

create unique index if not exists admin_weekly_reports_idempotency_unique
  on public.admin_weekly_reports(period_start, period_end, recipient, report_type);
create index if not exists admin_weekly_reports_status_idx
  on public.admin_weekly_reports(status, generated_at desc);

-- -----------------------------------------------------------------------------
-- Server-side action throttling
-- -----------------------------------------------------------------------------
create table if not exists public.endpoint_rate_limits (
  action_key text not null,
  actor_key text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (action_key, actor_key),
  constraint endpoint_rate_limits_count_check check (request_count >= 0)
);

create or replace function public.claim_rate_limit_bucket(
  p_action_key text,
  p_actor_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  result_row public.endpoint_rate_limits%rowtype;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 1), 10000));
  safe_window integer := greatest(60, least(coalesce(p_window_seconds, 3600), 86400));
begin
  if nullif(btrim(p_action_key), '') is null or nullif(btrim(p_actor_key), '') is null then
    return false;
  end if;

  insert into public.endpoint_rate_limits(action_key, actor_key, window_started_at, request_count, updated_at)
  values (left(p_action_key, 80), left(p_actor_key, 180), now(), 1, now())
  on conflict (action_key, actor_key) do update
  set request_count = case
        when endpoint_rate_limits.window_started_at <= now() - make_interval(secs => safe_window) then 1
        else endpoint_rate_limits.request_count + 1
      end,
      window_started_at = case
        when endpoint_rate_limits.window_started_at <= now() - make_interval(secs => safe_window) then now()
        else endpoint_rate_limits.window_started_at
      end,
      updated_at = now()
  returning * into result_row;

  return result_row.request_count <= safe_limit;
end;
$$;

create or replace function public.claim_admin_action_rate_limit(
  p_action_key text,
  p_actor_key text,
  p_limit integer default 3,
  p_window_seconds integer default 300
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.claim_rate_limit_bucket(
    'admin:' || left(coalesce(p_action_key, ''), 70),
    left(coalesce(p_actor_key, ''), 180),
    p_limit,
    p_window_seconds
  );
$$;

create or replace function public.claim_public_submission_rate_limit(
  p_action_key text,
  p_actor_key text,
  p_actor_limit integer default 8,
  p_global_limit integer default 500,
  p_window_seconds integer default 3600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_allowed boolean;
  global_allowed boolean;
  action_name text := left(coalesce(p_action_key, ''), 70);
begin
  actor_allowed := public.claim_rate_limit_bucket(
    'public:' || action_name,
    left(coalesce(p_actor_key, ''), 180),
    p_actor_limit,
    p_window_seconds
  );
  if not actor_allowed then return false; end if;

  global_allowed := public.claim_rate_limit_bucket(
    'public-global:' || action_name,
    'global',
    p_global_limit,
    p_window_seconds
  );
  return global_allowed;
end;
$$;

-- -----------------------------------------------------------------------------
-- Secure public creation RPCs. The browser cannot set privileged state.
-- These are callable only by the server-side service role after anti-abuse checks.
-- -----------------------------------------------------------------------------
create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if nullif(btrim(value), '') is null then return null; end if;
  return btrim(value)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function public.safe_date(value text)
returns date
language plpgsql
immutable
as $$
begin
  if nullif(btrim(value), '') is null then return null; end if;
  return btrim(value)::date;
exception when others then
  return null;
end;
$$;

create or replace function public.safe_timestamptz(value text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if nullif(btrim(value), '') is null then return null; end if;
  return btrim(value)::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function public.create_public_booking_request(request_payload jsonb)
returns table(id uuid, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.booking_requests%rowtype;
  existing public.booking_requests%rowtype;
  raw_request_type text := nullif(btrim(coalesce(request_payload->>'request_type', 'private')), '');
  raw_heard_about_us text := nullif(btrim(coalesce(request_payload->>'heard_about_us', '')), '');
  request_idempotency text := nullif(btrim(coalesce(request_payload->>'idempotency_key', '')), '');
  requested_on date := public.safe_date(request_payload->>'requested_date');
  generated_booking_code text;
begin
  if request_payload is null or jsonb_typeof(request_payload) <> 'object' then
    raise exception 'Invalid booking request payload';
  end if;
  if request_idempotency is null or length(request_idempotency) < 12 then
    raise exception 'Missing idempotency key';
  end if;

  select * into existing
  from public.booking_requests
  where idempotency_key = left(request_idempotency, 200)
  limit 1;
  if existing.id is not null then
    return query select existing.id, existing.status, existing.created_at;
    return;
  end if;

  if raw_request_type not in ('private', 'fixed') then raw_request_type := 'private'; end if;
  if raw_heard_about_us not in ('instagram', 'google', 'google_maps', 'facebook', 'radio', 'whatsapp_or_friend', 'hotel_bnb_partner', 'previous_customer', 'guide_or_local_partner', 'other') then
    raw_heard_about_us := null;
  end if;

  if nullif(btrim(coalesce(request_payload->>'customer_email', '')), '') is null
     and nullif(btrim(coalesce(request_payload->>'customer_phone', '')), '') is null then
    raise exception 'A contact method is required';
  end if;

  generated_booking_code := 'VUL-' || to_char(coalesce(requested_on, current_date), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));

  insert into public.booking_requests (
    customer_name, customer_email, customer_phone, preferred_contact,
    experience_id, requested_date, alternative_date, language, party_type,
    request_type, fixed_excursion_id, booking_code, adults, children,
    children_under_3, private_experience, main_interest, preferred_pace,
    message, heard_about_us, heard_about_us_label, heard_about_us_detail,
    source, source_section, source_cta, cta_location, selected_date, selected_month,
    has_fixed_excursion, traffic_source, detected_source, declared_source,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    referrer, landing_path, referral_code, referral_source, referral_landing_at,
    analytics_session_id, analytics_visitor_id, analytics_journey_id,
    booking_journey_version, device_type, browser, operating_system,
    idempotency_key, submission_fingerprint, submission_actor_hash,
    status, created_by_admin, notification_email_status
  ) values (
    left(nullif(btrim(coalesce(request_payload->>'customer_name', '')), ''), 120),
    left(nullif(btrim(coalesce(request_payload->>'customer_email', '')), ''), 254),
    left(nullif(btrim(coalesce(request_payload->>'customer_phone', '')), ''), 40),
    case when request_payload->>'preferred_contact' in ('whatsapp','phone','email','form','unknown') then request_payload->>'preferred_contact' else 'unknown' end,
    coalesce(left(nullif(btrim(coalesce(request_payload->>'experience_id', '')), ''), 80), 'unsure'),
    requested_on,
    public.safe_date(request_payload->>'alternative_date'),
    case when request_payload->>'language' = 'en' then 'en' else 'it' end,
    left(nullif(btrim(coalesce(request_payload->>'party_type', '')), ''), 80),
    raw_request_type,
    public.safe_uuid(request_payload->>'fixed_excursion_id'),
    generated_booking_code,
    case when coalesce(request_payload->>'adults','') ~ '^\d+$' then least((request_payload->>'adults')::integer, 50) else null end,
    case when coalesce(request_payload->>'children','') ~ '^\d+$' then least((request_payload->>'children')::integer, 50) else null end,
    coalesce(request_payload->>'children_under_3','false') = 'true',
    raw_request_type = 'private',
    left(nullif(btrim(coalesce(request_payload->>'main_interest', '')), ''), 160),
    left(nullif(btrim(coalesce(request_payload->>'preferred_pace', '')), ''), 80),
    left(nullif(btrim(coalesce(request_payload->>'message', '')), ''), 2500),
    raw_heard_about_us,
    left(nullif(btrim(coalesce(request_payload->>'heard_about_us_label', '')), ''), 160),
    left(nullif(btrim(coalesce(request_payload->>'heard_about_us_detail', '')), ''), 240),
    'website',
    left(nullif(btrim(coalesce(request_payload->>'source_section', '')), ''), 80),
    left(nullif(btrim(coalesce(request_payload->>'source_cta', '')), ''), 80),
    left(nullif(btrim(coalesce(request_payload->>'cta_location', '')), ''), 80),
    public.safe_date(request_payload->>'selected_date'),
    left(nullif(btrim(coalesce(request_payload->>'selected_month', '')), ''), 12),
    raw_request_type = 'fixed',
    left(nullif(btrim(coalesce(request_payload->>'traffic_source', '')), ''), 80),
    left(nullif(btrim(coalesce(request_payload->>'detected_source', '')), ''), 80),
    left(nullif(btrim(coalesce(request_payload->>'declared_source', '')), ''), 80),
    left(nullif(btrim(coalesce(request_payload->>'utm_source', '')), ''), 120),
    left(nullif(btrim(coalesce(request_payload->>'utm_medium', '')), ''), 120),
    left(nullif(btrim(coalesce(request_payload->>'utm_campaign', '')), ''), 160),
    left(nullif(btrim(coalesce(request_payload->>'utm_content', '')), ''), 160),
    left(nullif(btrim(coalesce(request_payload->>'utm_term', '')), ''), 160),
    left(nullif(btrim(coalesce(request_payload->>'referrer', '')), ''), 500),
    left(nullif(btrim(coalesce(request_payload->>'landing_path', '')), ''), 500),
    left(nullif(btrim(coalesce(request_payload->>'referral_code', '')), ''), 80),
    left(nullif(btrim(coalesce(request_payload->>'referral_source', '')), ''), 80),
    public.safe_timestamptz(request_payload->>'referral_landing_at'),
    left(nullif(btrim(coalesce(request_payload->>'analytics_session_id', '')), ''), 160),
    left(nullif(btrim(coalesce(request_payload->>'analytics_visitor_id', '')), ''), 160),
    left(nullif(btrim(coalesce(request_payload->>'analytics_journey_id', '')), ''), 180),
    left(nullif(btrim(coalesce(request_payload->>'booking_journey_version', '')), ''), 80),
    left(nullif(btrim(coalesce(request_payload->>'device_type', '')), ''), 40),
    left(nullif(btrim(coalesce(request_payload->>'browser', '')), ''), 60),
    left(nullif(btrim(coalesce(request_payload->>'operating_system', '')), ''), 60),
    left(request_idempotency, 200),
    left(nullif(btrim(coalesce(request_payload->>'submission_fingerprint', '')), ''), 180),
    left(nullif(btrim(coalesce(request_payload->>'submission_actor_hash', '')), ''), 128),
    'pending', null, 'not_sent'
  )
  on conflict (idempotency_key) where idempotency_key is not null
  do update set idempotency_key = excluded.idempotency_key
  returning * into inserted;

  return query select inserted.id, inserted.status, inserted.created_at;
end;
$$;

create or replace function public.create_public_gift_card_request(request_payload jsonb)
returns table(id uuid, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.gift_card_requests%rowtype;
  existing public.gift_card_requests%rowtype;
  request_idempotency text := nullif(btrim(coalesce(request_payload->>'idempotency_key', '')), '');
  currency_value text := upper(coalesce(nullif(btrim(request_payload->>'currency'), ''), 'EUR'));
begin
  if request_payload is null or jsonb_typeof(request_payload) <> 'object' then raise exception 'Invalid Gift Card payload'; end if;
  if request_idempotency is null or length(request_idempotency) < 12 then raise exception 'Missing idempotency key'; end if;

  select * into existing
  from public.gift_card_requests
  where idempotency_key = left(request_idempotency, 200)
  limit 1;
  if existing.id is not null then
    return query select existing.id, existing.status, existing.created_at;
    return;
  end if;

  if nullif(btrim(coalesce(request_payload->>'buyer_name', '')), '') is null
     or nullif(btrim(coalesce(request_payload->>'recipient_name', '')), '') is null then
    raise exception 'Buyer and recipient are required';
  end if;
  if nullif(btrim(coalesce(request_payload->>'buyer_email', '')), '') is null
     and nullif(btrim(coalesce(request_payload->>'buyer_phone', '')), '') is null then
    raise exception 'A contact method is required';
  end if;
  if currency_value !~ '^[A-Z]{3}$' then currency_value := 'EUR'; end if;

  insert into public.gift_card_requests (
    buyer_name, buyer_email, buyer_phone, buyer_preferred_language,
    recipient_name, experience_type, budget, currency, message,
    preferred_delivery_date, status, admin_note, created_by, updated_by,
    detected_source, declared_source, utm_source, utm_medium, utm_campaign,
    utm_content, utm_term, referrer, landing_path, analytics_session_id,
    analytics_visitor_id, analytics_journey_id, idempotency_key,
    submission_fingerprint, submission_actor_hash, notification_email_status
  ) values (
    left(nullif(btrim(coalesce(request_payload->>'buyer_name', '')), ''), 120),
    left(nullif(btrim(coalesce(request_payload->>'buyer_email', '')), ''), 254),
    left(nullif(btrim(coalesce(request_payload->>'buyer_phone', '')), ''), 40),
    case when request_payload->>'buyer_preferred_language' = 'en' then 'en' else 'it' end,
    left(nullif(btrim(coalesce(request_payload->>'recipient_name', '')), ''), 120),
    left(nullif(btrim(coalesce(request_payload->>'experience_type', '')), ''), 180),
    case when coalesce(request_payload->>'budget','') ~ '^\d+(\.\d{1,2})?$' then least((request_payload->>'budget')::numeric, 100000) else null end,
    currency_value,
    left(nullif(btrim(coalesce(request_payload->>'message', '')), ''), 2500),
    public.safe_date(request_payload->>'preferred_delivery_date'),
    'new', null, null, null,
    left(nullif(btrim(coalesce(request_payload->>'detected_source', '')), ''), 80),
    left(nullif(btrim(coalesce(request_payload->>'declared_source', '')), ''), 80),
    left(nullif(btrim(coalesce(request_payload->>'utm_source', '')), ''), 120),
    left(nullif(btrim(coalesce(request_payload->>'utm_medium', '')), ''), 120),
    left(nullif(btrim(coalesce(request_payload->>'utm_campaign', '')), ''), 160),
    left(nullif(btrim(coalesce(request_payload->>'utm_content', '')), ''), 160),
    left(nullif(btrim(coalesce(request_payload->>'utm_term', '')), ''), 160),
    left(nullif(btrim(coalesce(request_payload->>'referrer', '')), ''), 500),
    left(nullif(btrim(coalesce(request_payload->>'landing_path', '')), ''), 500),
    left(nullif(btrim(coalesce(request_payload->>'analytics_session_id', '')), ''), 160),
    left(nullif(btrim(coalesce(request_payload->>'analytics_visitor_id', '')), ''), 160),
    left(nullif(btrim(coalesce(request_payload->>'analytics_journey_id', '')), ''), 180),
    left(request_idempotency, 200),
    left(nullif(btrim(coalesce(request_payload->>'submission_fingerprint', '')), ''), 180),
    left(nullif(btrim(coalesce(request_payload->>'submission_actor_hash', '')), ''), 128),
    'not_sent'
  )
  on conflict (idempotency_key) where idempotency_key is not null
  do update set idempotency_key = excluded.idempotency_key
  returning * into inserted;

  return query select inserted.id, inserted.status, inserted.created_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileged operations are limited to owner/manager roles. Existing app roles
-- such as guide, finance, and content_editor remain outside this boundary.
-- -----------------------------------------------------------------------------
create or replace function public.is_privileged_admin()
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

revoke all on function public.is_privileged_admin() from public, anon;
grant execute on function public.is_privileged_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- Operational safeguard summary for the authenticated admin UI
-- -----------------------------------------------------------------------------
create or replace function public.get_admin_operational_safeguards()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_privileged_admin() then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'pending_requests', (select count(*) from public.booking_requests where status = 'pending'),
    'pending_over_12h', (select count(*) from public.booking_requests where status = 'pending' and created_at < now() - interval '12 hours'),
    'pending_over_24h', (select count(*) from public.booking_requests where status = 'pending' and created_at < now() - interval '24 hours'),
    'failed_notifications', (
      (select count(*) from public.booking_requests where notification_email_status = 'failed') +
      (select count(*) from public.gift_card_requests where notification_email_status = 'failed')
    ),
    'notifications_not_sent', (
      (select count(*) from public.booking_requests where notification_email_status = 'not_sent' and created_at < now() - interval '10 minutes') +
      (select count(*) from public.gift_card_requests where notification_email_status = 'not_sent' and created_at < now() - interval '10 minutes')
    ),
    'gift_cards_missing_code', (
      select count(*) from public.gift_card_requests
      where status in ('paid', 'issued') and booking_code_id is null and nullif(booking_code, '') is null
    ),
    'upcoming_unconfirmed_72h', (
      select count(*) from public.booking_requests
      where status = 'pending'
        and requested_date between current_date and (current_date + 3)
    ),
    'weekly_report_failures', (
      select count(*) from public.admin_weekly_reports
      where status = 'failed' and generated_at >= now() - interval '14 days'
    ),
    'generated_at', now()
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS and grants
-- -----------------------------------------------------------------------------
alter table public.request_notification_log enable row level security;
alter table public.admin_weekly_reports enable row level security;
alter table public.endpoint_rate_limits enable row level security;
alter table public.booking_requests enable row level security;
alter table public.gift_card_requests enable row level security;
alter table public.analytics_events enable row level security;
alter table public.analytics_sessions enable row level security;

drop policy if exists "Admins can read request notification logs" on public.request_notification_log;
create policy "Admins can read request notification logs"
on public.request_notification_log for select to authenticated
using (public.is_privileged_admin());

drop policy if exists "Admins can read weekly reports" on public.admin_weekly_reports;
create policy "Admins can read weekly reports"
on public.admin_weekly_reports for select to authenticated
using (public.is_privileged_admin());

-- Remove direct anonymous writes. Public writes must pass through the Cloudflare endpoint.
drop policy if exists "Public can insert booking requests" on public.booking_requests;
drop policy if exists "Public can create gift card requests" on public.gift_card_requests;
drop policy if exists "Public can insert analytics events" on public.analytics_events;
drop policy if exists "Public can insert analytics sessions" on public.analytics_sessions;

revoke insert on public.booking_requests from anon;
revoke insert on public.gift_card_requests from anon;
revoke insert on public.analytics_events from anon, authenticated;
revoke insert on public.analytics_sessions from anon, authenticated;

revoke all on function public.create_public_booking_request(jsonb) from public, anon, authenticated;
revoke all on function public.create_public_gift_card_request(jsonb) from public, anon, authenticated;
revoke all on function public.claim_rate_limit_bucket(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.claim_admin_action_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.claim_public_submission_rate_limit(text, text, integer, integer, integer) from public, anon, authenticated;

grant execute on function public.create_public_booking_request(jsonb) to service_role;
grant execute on function public.create_public_gift_card_request(jsonb) to service_role;
grant execute on function public.claim_admin_action_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.claim_public_submission_rate_limit(text, text, integer, integer, integer) to service_role;
grant execute on function public.get_admin_operational_safeguards() to authenticated;
grant select on public.request_notification_log, public.admin_weekly_reports to authenticated;

-- Keep the only known public bucket explicitly public and admin-managed.
update storage.buckets
set public = true,
    file_size_limit = least(coalesce(file_size_limit, 10485760), 10485760),
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4']
where id = 'vulcaniq-public-assets';

-- Analytics canonical booking events.
alter table public.analytics_events drop constraint if exists analytics_events_event_name_check;
alter table public.analytics_events
  add constraint analytics_events_event_name_check
  check (event_name in (
    'page_view','language_switch','excursion_view','experience_card_view','experience_detail_open','calendar_date_select',
    'booking_form_open','booking_form_started','booking_form_step_completed','booking_form_field_start','request_details_open',
    'fixed_excursion_options_open','private_excursion_options_open','fixed_leaflet_open_from_request','private_excursion_detail_open_from_request',
    'booking_form_submit_attempt','booking_form_validation_error','booking_form_submit_success','booking_form_submit_error',
    'booking_submit','booking_submit_attempt','booking_submit_validation_error','booking_submit_success','booking_submit_error','booking_request_created',
    'book_with_code_clicked','booking_code_redeem_attempt','booking_code_redeem_success','booking_code_redeem_error',
    'booking_code_submitted','booking_code_redeemed','booking_code_invalid','whatsapp_click','email_click','phone_click',
    'google_maps_click','maps_click','meeting_point_maps_click','review_view','social_link_click','external_link_click','google_reviews_click',
    'session_start','session_heartbeat','session_end','pricing_card_view','pricing_cta_click','fast_request_start','fast_request_step_complete',
    'fast_request_abandon','fast_request_whatsapp_click','fast_request_submit_attempt','fast_request_submit_success','gift_card_view',
    'gift_card_request_click','gbp_utm_link_click','lead_status_changed','lead_follow_up_set','booking_code_review_open',
    'booking_code_review_submit_attempt','booking_code_review_submit_success','booking_code_review_duplicate','review_request_sent',
    'google_review_request_click','gift_card_request_created','gift_card_questionnaire_started','gift_card_questionnaire_step_completed',
    'gift_card_whatsapp_request_clicked','gift_card_status_changed','gift_card_paid','gift_card_issued','gift_card_cancelled',
    'gift_card_whatsapp_reply_copied','gift_card_email_reply_copied','review_link_copied','review_request_whatsapp_click',
    'review_requested_marked','review_received_marked','referral_code_created','referral_link_copied','referral_link_click',
    'referral_invalid_link_click','referral_booking_request_created','referral_code_disabled','form_journey_started','form_field_started',
    'abandoned_form_detected','abandoned_form_recovered_whatsapp','form_submit_success','partner_source_assigned',
    'partner_commission_created','partner_commission_status_changed','partner_commission_marked_paid'
  ));


-- -----------------------------------------------------------------------------
-- Server-authoritative Gift Card status, finance, reversal, and code linkage
-- -----------------------------------------------------------------------------
alter table public.finance_entries drop constraint if exists finance_entries_amount_check;
alter table public.finance_entries
  add constraint finance_entries_amount_check
  check (
    (status = 'reversal' and amount <= 0)
    or (status <> 'reversal' and amount >= 0)
  );

create or replace function public.admin_update_gift_card_request(
  p_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gift public.gift_card_requests%rowtype;
  finance public.finance_entries%rowtype;
  existing_reversal public.finance_entries%rowtype;
  code_row public.booking_codes%rowtype;
  next_status text;
  next_budget numeric(10,2);
  next_currency text;
  next_delivery date;
  next_note text;
  generated_code text;
begin
  if not public.is_privileged_admin() then raise exception 'Not authorized'; end if;
  if p_id is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'Invalid payload'; end if;

  select * into gift from public.gift_card_requests where id = p_id for update;
  if not found then raise exception 'Gift Card request not found'; end if;

  next_status := case when p_patch ? 'status' then lower(btrim(coalesce(p_patch->>'status', ''))) else gift.status end;
  if next_status not in ('new', 'contacted', 'quoted', 'paid', 'issued', 'cancelled') then raise exception 'Invalid status'; end if;

  next_budget := gift.budget;
  if p_patch ? 'budget' then
    if nullif(btrim(coalesce(p_patch->>'budget', '')), '') is null then
      next_budget := null;
    elsif p_patch->>'budget' ~ '^\d+(\.\d{1,2})?$' then
      next_budget := least((p_patch->>'budget')::numeric, 100000);
    else
      raise exception 'Invalid budget';
    end if;
  end if;

  next_currency := case when p_patch ? 'currency' then upper(btrim(coalesce(p_patch->>'currency', ''))) else coalesce(gift.currency, 'EUR') end;
  if next_currency !~ '^[A-Z]{3}$' then raise exception 'Invalid currency'; end if;
  next_delivery := case when p_patch ? 'preferred_delivery_date' then public.safe_date(p_patch->>'preferred_delivery_date') else gift.preferred_delivery_date end;
  next_note := case when p_patch ? 'admin_note' then left(nullif(btrim(coalesce(p_patch->>'admin_note', '')), ''), 2500) else gift.admin_note end;

  update public.gift_card_requests
  set status = next_status,
      budget = next_budget,
      currency = next_currency,
      preferred_delivery_date = next_delivery,
      admin_note = next_note,
      updated_by = auth.uid(),
      updated_at = now()
  where id = gift.id
  returning * into gift;

  if next_status in ('paid', 'issued') then
    if coalesce(next_budget, 0) > 0 then
      select * into finance
      from public.finance_entries
      where source_type = 'gift_card' and source_id = gift.id and reversal_of is null
      order by created_at asc
      limit 1
      for update;

      if finance.id is null then
        insert into public.finance_entries (
          entry_date, type, amount, currency, title, description, category,
          payment_method, source_type, source_id, status, active,
          recognized_at, admin_confirmed_at, admin_confirmed_by, created_by, updated_by
        ) values (
          current_date, 'income', next_budget, next_currency,
          'Gift Card' || case when gift.recipient_name is not null then ' - ' || gift.recipient_name else '' end,
          'Confirmed Gift Card income', 'gift_card', 'external', 'gift_card', gift.id,
          'confirmed', true, now(), now(), auth.uid(), auth.uid(), auth.uid()
        ) returning * into finance;
      else
        update public.finance_entries
        set amount = next_budget,
            currency = next_currency,
            status = 'confirmed',
            active = true,
            recognized_at = now(),
            admin_confirmed_at = now(),
            admin_confirmed_by = auth.uid(),
            cancelled_at = null,
            reversed_at = null,
            updated_by = auth.uid(),
            updated_at = now()
        where id = finance.id
        returning * into finance;
      end if;
      update public.gift_card_requests set finance_entry_id = finance.id where id = gift.id;
    end if;

    select * into code_row
    from public.booking_codes
    where gift_card_request_id = gift.id
    limit 1
    for update;

    if code_row.id is null then
      generated_code := 'GIFT-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
      insert into public.booking_codes (
        code, customer_name, customer_email, customer_phone,
        experience_id, experience_name_it, experience_name_en, experience_type,
        scheduled_date, expected_amount, currency, source, admin_note, customer_note,
        status, created_by, review_enabled, completion_status, payment_status,
        income_status, admin_confirmed_income, gift_card_request_id, updated_by
      ) values (
        generated_code,
        coalesce(gift.recipient_name, gift.buyer_name, 'Gift Card recipient'),
        gift.buyer_email, gift.buyer_phone,
        'gift-card', coalesce(gift.experience_type, 'Gift Card vulcanIQ'), coalesce(gift.experience_type, 'vulcanIQ Gift Card'), 'gift_card',
        null, 0, next_currency, 'gift_card',
        'Gift Card request ' || gift.id::text, gift.message,
        'unused', auth.uid(), false, 'not_completed', 'paid', 'none', false, gift.id, auth.uid()
      ) returning * into code_row;
    end if;

    update public.gift_card_requests
    set booking_code_id = code_row.id,
        booking_code = code_row.code,
        updated_by = auth.uid(),
        updated_at = now()
    where id = gift.id
    returning * into gift;
  elsif next_status = 'cancelled' then
    select * into finance
    from public.finance_entries
    where source_type = 'gift_card' and source_id = gift.id and reversal_of is null
    order by created_at asc
    limit 1
    for update;

    if finance.id is not null and finance.status = 'confirmed' and finance.amount <> 0 then
      select * into existing_reversal from public.finance_entries where reversal_of = finance.id limit 1;
      if existing_reversal.id is null then
        insert into public.finance_entries (
          entry_date, type, amount, currency, title, description, category,
          payment_method, source_type, source_id, status, reversal_of, active,
          recognized_at, created_by, updated_by
        ) values (
          current_date, finance.type, -abs(finance.amount), finance.currency,
          'Reversal - ' || finance.title, 'Gift Card request cancelled',
          coalesce(finance.category, 'gift_card'), finance.payment_method,
          'gift_card', gift.id, 'reversal', finance.id, true, now(), auth.uid(), auth.uid()
        );
      end if;
      update public.finance_entries
      set status = 'reversed', reversed_at = now(), updated_by = auth.uid(), updated_at = now()
      where id = finance.id;
    elsif finance.id is not null and finance.status <> 'reversal' then
      update public.finance_entries
      set status = 'cancelled', active = false, cancelled_at = now(), archive_reason = 'Gift Card request cancelled', updated_by = auth.uid(), updated_at = now()
      where id = finance.id;
    end if;
  end if;

  select * into gift from public.gift_card_requests where id = p_id;
  return to_jsonb(gift);
end;
$$;

revoke all on function public.admin_update_gift_card_request(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_gift_card_request(uuid, jsonb) to authenticated;
revoke update on public.gift_card_requests from authenticated;

commit;
