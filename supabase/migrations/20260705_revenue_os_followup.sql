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
