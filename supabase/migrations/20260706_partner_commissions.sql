-- vulcanIQ Revenue OS Patch 4
-- Partner commissions, partner-generated business tracking, admin settlement view,
-- and finance liability layer. Additive/idempotent migration.

begin;

-- -----------------------------------------------------------------------------
-- Partnership commission configuration
-- -----------------------------------------------------------------------------
alter table public.partnerships add column if not exists commission_enabled boolean not null default false;
alter table public.partnerships add column if not exists commission_type text not null default 'none';
alter table public.partnerships add column if not exists commission_value numeric(10,2) not null default 0;
alter table public.partnerships add column if not exists commission_currency text not null default 'EUR';
alter table public.partnerships add column if not exists commission_applies_to text not null default 'revenue_confirmed';
alter table public.partnerships add column if not exists commission_notes text;
alter table public.partnerships add column if not exists commission_status text not null default 'inactive';

alter table public.partnerships drop constraint if exists partnerships_commission_type_check;
alter table public.partnerships
  add constraint partnerships_commission_type_check
  check (commission_type in ('none', 'fixed_amount', 'percentage'));

alter table public.partnerships drop constraint if exists partnerships_commission_value_check;
alter table public.partnerships
  add constraint partnerships_commission_value_check
  check (commission_value >= 0 and (commission_type <> 'percentage' or commission_value <= 100));

alter table public.partnerships drop constraint if exists partnerships_commission_currency_check;
alter table public.partnerships
  add constraint partnerships_commission_currency_check
  check (commission_currency ~ '^[A-Z]{3}$');

alter table public.partnerships drop constraint if exists partnerships_commission_applies_to_check;
alter table public.partnerships
  add constraint partnerships_commission_applies_to_check
  check (commission_applies_to in ('request_created', 'booking_confirmed', 'revenue_confirmed'));

alter table public.partnerships drop constraint if exists partnerships_commission_status_check;
alter table public.partnerships
  add constraint partnerships_commission_status_check
  check (commission_status in ('inactive', 'active', 'paused'));

create index if not exists partnerships_commission_enabled_idx on public.partnerships(commission_enabled, commission_status);

-- Keep public partnership view explicit and do not expose commission fields.
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

grant select on public.public_partnerships to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Booking/request partner attribution
-- -----------------------------------------------------------------------------
alter table public.booking_requests add column if not exists partner_id uuid references public.partnerships(id) on delete set null;
alter table public.booking_requests add column if not exists partner_source_assigned_at timestamptz;
alter table public.booking_requests add column if not exists partner_source_assigned_by uuid references auth.users(id) on delete set null;
create index if not exists booking_requests_partner_id_idx on public.booking_requests(partner_id);

-- -----------------------------------------------------------------------------
-- Commission liabilities
-- -----------------------------------------------------------------------------
create table if not exists public.partner_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.partnerships(id) on delete set null,
  source_type text not null,
  source_id uuid,
  source_code text,
  booking_request_id uuid references public.booking_requests(id) on delete set null,
  booking_code_id uuid references public.booking_codes(id) on delete set null,
  finance_entry_id uuid references public.finance_entries(id) on delete set null,
  customer_display_name text,
  experience_id text,
  experience_title text,
  experience_date date,
  gross_amount numeric(10,2),
  commission_type text not null,
  commission_value numeric(10,2) not null default 0,
  commission_amount numeric(10,2) not null default 0,
  currency text not null default 'EUR',
  status text not null default 'pending',
  status_notes text,
  approved_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint partner_commissions_source_type_check check (source_type in ('booking_request', 'booking_code', 'manual_booking', 'gift_card', 'other')),
  constraint partner_commissions_commission_type_check check (commission_type in ('none', 'fixed_amount', 'percentage')),
  constraint partner_commissions_status_check check (status in ('pending', 'approved', 'paid', 'cancelled')),
  constraint partner_commissions_amount_check check (gross_amount is null or gross_amount >= 0),
  constraint partner_commissions_commission_amount_check check (commission_amount >= 0),
  constraint partner_commissions_currency_check check (currency ~ '^[A-Z]{3}$')
);

create index if not exists partner_commissions_partner_id_idx on public.partner_commissions(partner_id);
create index if not exists partner_commissions_status_idx on public.partner_commissions(status);
create index if not exists partner_commissions_created_at_idx on public.partner_commissions(created_at);
create index if not exists partner_commissions_booking_request_id_idx on public.partner_commissions(booking_request_id);
create index if not exists partner_commissions_booking_code_id_idx on public.partner_commissions(booking_code_id);
create unique index if not exists partner_commissions_booking_request_unique_idx on public.partner_commissions(booking_request_id) where booking_request_id is not null;
create unique index if not exists partner_commissions_booking_code_unique_idx on public.partner_commissions(booking_code_id) where booking_code_id is not null;

alter table public.partner_commissions enable row level security;

drop policy if exists "Admins can read partner commissions" on public.partner_commissions;
create policy "Admins can read partner commissions"
on public.partner_commissions
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can create partner commissions" on public.partner_commissions;
create policy "Admins can create partner commissions"
on public.partner_commissions
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update partner commissions" on public.partner_commissions;
create policy "Admins can update partner commissions"
on public.partner_commissions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update on public.partner_commissions to authenticated;

-- -----------------------------------------------------------------------------
-- Analytics allowlist extension for safe admin/business events.
-- -----------------------------------------------------------------------------
alter table public.analytics_events drop constraint if exists analytics_events_event_name_check;
alter table public.analytics_events
  add constraint analytics_events_event_name_check
  check (event_name in (
    'page_view','language_switch','excursion_view','experience_card_view','experience_detail_open','calendar_date_select',
    'booking_form_open','booking_form_field_start','request_details_open','fixed_excursion_options_open','private_excursion_options_open',
    'fixed_leaflet_open_from_request','private_excursion_detail_open_from_request','booking_form_submit_attempt','booking_form_validation_error',
    'booking_form_submit_success','booking_form_submit_error','booking_submit','booking_submit_attempt','booking_submit_validation_error',
    'booking_submit_success','booking_submit_error','booking_request_created','book_with_code_clicked','booking_code_redeem_attempt',
    'booking_code_redeem_success','booking_code_redeem_error','booking_code_submitted','booking_code_redeemed','booking_code_invalid',
    'whatsapp_click','email_click','phone_click','google_maps_click','maps_click','meeting_point_maps_click','review_view','social_link_click',
    'external_link_click','google_reviews_click','session_start','session_heartbeat','session_end','pricing_card_view','pricing_cta_click',
    'fast_request_start','fast_request_step_complete','fast_request_abandon','fast_request_whatsapp_click','fast_request_submit_attempt',
    'fast_request_submit_success','gift_card_view','gift_card_request_click','gbp_utm_link_click','lead_status_changed','lead_follow_up_set',
    'booking_code_review_open','booking_code_review_submit_attempt','booking_code_review_submit_success','booking_code_review_duplicate',
    'review_request_sent','google_review_request_click','gift_card_request_created','gift_card_questionnaire_started',
    'gift_card_questionnaire_step_completed','gift_card_whatsapp_request_clicked','gift_card_status_changed','gift_card_paid',
    'gift_card_issued','gift_card_cancelled','gift_card_whatsapp_reply_copied','gift_card_email_reply_copied','review_link_copied',
    'review_request_whatsapp_click','review_requested_marked','review_received_marked','referral_code_created','referral_link_copied',
    'referral_link_click','referral_invalid_link_click','referral_booking_request_created','referral_code_disabled','form_journey_started',
    'form_field_started','abandoned_form_detected','abandoned_form_recovered_whatsapp','form_submit_success',
    'partner_source_assigned','partner_commission_created','partner_commission_status_changed','partner_commission_marked_paid'
  ));

commit;
