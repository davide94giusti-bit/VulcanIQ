-- vulcanIQ Revenue OS Patch 3
-- Gift Card admin workflow, review requests, customer referrals, and abandoned-form recovery.
-- Additive and idempotent where PostgreSQL allows it.

begin;

-- -----------------------------------------------------------------------------
-- Gift Card v2: admin workflow + finance linkage + public request insert
-- -----------------------------------------------------------------------------
alter table public.gift_card_requests add column if not exists buyer_preferred_language text not null default 'it';
alter table public.gift_card_requests add column if not exists finance_entry_id uuid references public.finance_entries(id) on delete set null;
alter table public.gift_card_requests add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.gift_card_requests add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.gift_card_requests add column if not exists updated_at timestamptz not null default now();

alter table public.gift_card_requests drop constraint if exists gift_card_requests_status_check;
alter table public.gift_card_requests
  add constraint gift_card_requests_status_check
  check (status in ('new', 'contacted', 'quoted', 'paid', 'issued', 'cancelled'));

alter table public.gift_card_requests drop constraint if exists gift_card_requests_language_check;
alter table public.gift_card_requests
  add constraint gift_card_requests_language_check
  check (buyer_preferred_language in ('it', 'en'));

create index if not exists gift_card_requests_finance_entry_idx on public.gift_card_requests(finance_entry_id);
create index if not exists gift_card_requests_delivery_idx on public.gift_card_requests(preferred_delivery_date);

alter table public.gift_card_requests enable row level security;

drop policy if exists "Public can create gift card requests" on public.gift_card_requests;
create policy "Public can create gift card requests"
on public.gift_card_requests
for insert
to anon, authenticated
with check (true);

drop policy if exists "Admins can read gift card requests" on public.gift_card_requests;
create policy "Admins can read gift card requests"
on public.gift_card_requests
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update gift card requests" on public.gift_card_requests;
create policy "Admins can update gift card requests"
on public.gift_card_requests
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant insert on public.gift_card_requests to anon;
grant select, insert, update on public.gift_card_requests to authenticated;

-- -----------------------------------------------------------------------------
-- Review-request workflow fields
-- -----------------------------------------------------------------------------
alter table public.booking_requests add column if not exists review_requested_at timestamptz;
alter table public.booking_requests add column if not exists review_received_at timestamptz;
alter table public.booking_requests add column if not exists review_request_channel text;
alter table public.booking_requests add column if not exists review_link_copied_at timestamptz;
alter table public.booking_requests add column if not exists review_code text;

alter table public.booking_codes add column if not exists review_requested_at timestamptz;
alter table public.booking_codes add column if not exists review_received_at timestamptz;
alter table public.booking_codes add column if not exists review_request_channel text;
alter table public.booking_codes add column if not exists review_link_copied_at timestamptz;
alter table public.booking_codes add column if not exists updated_by uuid references auth.users(id) on delete set null;

create index if not exists booking_requests_review_code_idx on public.booking_requests(review_code);
create index if not exists booking_requests_review_requested_idx on public.booking_requests(review_requested_at);
create index if not exists booking_codes_review_requested_idx on public.booking_codes(review_requested_at);

-- -----------------------------------------------------------------------------
-- Customer referral codes
-- -----------------------------------------------------------------------------
create table if not exists public.customer_referral_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  customer_name text,
  customer_email text,
  customer_phone text,
  source_booking_request_id uuid references public.booking_requests(id) on delete set null,
  source_booking_code_id uuid references public.booking_codes(id) on delete set null,
  source_type text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  used_count integer not null default 0,
  last_used_at timestamptz,
  note text,
  disabled_at timestamptz,
  disabled_by uuid references auth.users(id) on delete set null,
  constraint customer_referral_codes_code_format_check check (code ~ '^REF-[A-Z0-9]+-[A-Z0-9]+$')
);

create index if not exists customer_referral_codes_code_idx on public.customer_referral_codes(code);
create index if not exists customer_referral_codes_active_idx on public.customer_referral_codes(active);
create index if not exists customer_referral_codes_source_request_idx on public.customer_referral_codes(source_booking_request_id);
create index if not exists customer_referral_codes_source_code_idx on public.customer_referral_codes(source_booking_code_id);

alter table public.customer_referral_codes enable row level security;

drop policy if exists "Admins can read referral codes" on public.customer_referral_codes;
create policy "Admins can read referral codes"
on public.customer_referral_codes
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can create referral codes" on public.customer_referral_codes;
create policy "Admins can create referral codes"
on public.customer_referral_codes
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update referral codes" on public.customer_referral_codes;
create policy "Admins can update referral codes"
on public.customer_referral_codes
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update on public.customer_referral_codes to authenticated;

-- Safe public click registration without exposing the referral-code table publicly.
create or replace function public.register_referral_click(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  matched public.customer_referral_codes%rowtype;
  clean_code text;
begin
  clean_code := upper(trim(coalesce(p_code, '')));
  if clean_code = '' then
    return jsonb_build_object('valid', false, 'code', '');
  end if;

  select * into matched
  from public.customer_referral_codes
  where code = clean_code and active is true
  limit 1
  for update;

  if not found then
    return jsonb_build_object('valid', false, 'code', clean_code);
  end if;

  update public.customer_referral_codes
  set used_count = coalesce(used_count, 0) + 1,
      last_used_at = now()
  where id = matched.id;

  return jsonb_build_object('valid', true, 'code', matched.code);
end;
$$;

grant execute on function public.register_referral_click(text) to anon, authenticated;

-- Referral attribution on public booking requests.
alter table public.booking_requests add column if not exists referral_code text;
alter table public.booking_requests add column if not exists referral_source text;
alter table public.booking_requests add column if not exists referral_landing_at timestamptz;
create index if not exists booking_requests_referral_code_idx on public.booking_requests(referral_code);

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

  if raw_heard_about_us = 'not_specified' then
    raw_heard_about_us := null;
  end if;

  insert into public.booking_requests (
    customer_name, customer_email, customer_phone, preferred_contact, experience_id,
    requested_date, alternative_date, language, party_type, request_type, fixed_excursion_id,
    booking_code, adults, children, children_under_3, private_experience, main_interest,
    preferred_pace, message, heard_about_us, heard_about_us_label, heard_about_us_detail,
    source, source_section, source_cta, cta_location, selected_date, selected_month,
    has_fixed_excursion, traffic_source, utm_source, utm_medium, utm_campaign, utm_content,
    utm_term, referral_code, referral_source, referral_landing_at, analytics_session_id,
    analytics_visitor_id, analytics_journey_id, booking_journey_version, device_type, browser,
    operating_system, status, created_by_admin
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
    nullif(btrim(coalesce(request_payload->>'selected_month', '')), ''),
    coalesce((request_payload->>'has_fixed_excursion')::boolean, raw_request_type = 'fixed'),
    nullif(btrim(coalesce(request_payload->>'traffic_source', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_source', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_medium', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_campaign', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_content', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_term', '')), ''),
    nullif(btrim(coalesce(request_payload->>'referral_code', '')), ''),
    nullif(btrim(coalesce(request_payload->>'referral_source', '')), ''),
    nullif(btrim(coalesce(request_payload->>'referral_landing_at', '')), '')::timestamptz,
    nullif(btrim(coalesce(request_payload->>'analytics_session_id', request_payload->>'session_id', '')), ''),
    nullif(btrim(coalesce(request_payload->>'analytics_visitor_id', request_payload->>'visitor_id', '')), ''),
    nullif(btrim(coalesce(request_payload->>'analytics_journey_id', request_payload->>'booking_journey_id', '')), ''),
    nullif(btrim(coalesce(request_payload->>'booking_journey_version', '')), ''),
    nullif(btrim(coalesce(request_payload->>'device_type', '')), ''),
    nullif(btrim(coalesce(request_payload->>'browser', '')), ''),
    nullif(btrim(coalesce(request_payload->>'operating_system', '')), ''),
    'pending',
    null
  ) returning * into inserted;

  return query select inserted.id, inserted.status, inserted.created_at;
end;
$$;

revoke all on function public.create_public_booking_request(jsonb) from public;
grant execute on function public.create_public_booking_request(jsonb) to anon, authenticated;

alter table public.booking_requests drop constraint if exists booking_requests_source_check;
alter table public.booking_requests
  add constraint booking_requests_source_check
  check (source is null or source in ('website', 'whatsapp', 'phone', 'email', 'manual', 'booking_code', 'referral', 'customer_referral'));

-- -----------------------------------------------------------------------------
-- Analytics allowlist + traffic-source allowlist
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
    'booking_code_cancelled','booking_code_completed','booking_code_income_confirmed','booking_code_no_show',
    'whatsapp_click','email_click','phone_click','google_maps_click','maps_click','meeting_point_maps_click','social_link_click','external_link_click','google_reviews_click','review_view',
    'pricing_card_view','pricing_cta_click','fast_request_start','fast_request_step_complete','fast_request_abandon','fast_request_whatsapp_click','fast_request_submit_attempt','fast_request_submit_success',
    'gift_card_view','gift_card_request_click','gift_card_request_created','gift_card_status_changed','gift_card_paid','gift_card_issued','gift_card_cancelled','gift_card_whatsapp_reply_copied','gift_card_email_reply_copied',
    'gbp_utm_link_click','lead_status_changed','lead_follow_up_set','lead_value_updated','review_request_sent','google_review_request_click',
    'review_link_copied','review_request_whatsapp_click','review_requested_marked','review_received_marked',
    'referral_code_created','referral_link_copied','referral_link_click','referral_invalid_link_click','referral_booking_request_created','referral_code_disabled',
    'form_journey_started','form_field_started','abandoned_form_detected','abandoned_form_recovered_whatsapp','form_submit_success'
  ));

alter table public.analytics_events drop constraint if exists analytics_events_traffic_source_check;
alter table public.analytics_events
  add constraint analytics_events_traffic_source_check
  check (traffic_source is null or traffic_source in ('direct','google','google_business_profile','instagram','facebook','tiktok','whatsapp','partner','qr','business_card','referral','customer_referral','other'));

alter table public.analytics_sessions drop constraint if exists analytics_sessions_traffic_source_check;
alter table public.analytics_sessions
  add constraint analytics_sessions_traffic_source_check
  check (traffic_source is null or traffic_source in ('direct','google','google_business_profile','instagram','facebook','tiktok','whatsapp','partner','qr','business_card','referral','customer_referral','other'));

commit;
