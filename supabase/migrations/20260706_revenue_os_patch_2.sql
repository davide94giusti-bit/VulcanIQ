-- vulcanIQ Revenue OS Patch 2
-- Safe additive migration for finance reversals, booking-code income confirmation,
-- gift-card requests, and CRM/revenue operational fields.

begin;

-- -----------------------------------------------------------------------------
-- Finance ledger: status, reversal, source, and booking-code linkage
-- -----------------------------------------------------------------------------
alter table public.finance_entries add column if not exists status text not null default 'confirmed';
alter table public.finance_entries add column if not exists source_type text;
alter table public.finance_entries add column if not exists source_id uuid;
alter table public.finance_entries add column if not exists booking_code_id uuid references public.booking_codes(id) on delete set null;
alter table public.finance_entries add column if not exists recognized_at timestamptz;
alter table public.finance_entries add column if not exists cancelled_at timestamptz;
alter table public.finance_entries add column if not exists reversed_at timestamptz;
alter table public.finance_entries add column if not exists reversal_of uuid references public.finance_entries(id) on delete set null;
alter table public.finance_entries add column if not exists admin_confirmed_by uuid references auth.users(id) on delete set null;
alter table public.finance_entries add column if not exists admin_confirmed_at timestamptz;

alter table public.finance_entries drop constraint if exists finance_entries_status_check;
alter table public.finance_entries
  add constraint finance_entries_status_check
  check (status in ('pending', 'expected', 'confirmed', 'cancelled', 'void', 'voided', 'reversed', 'reversal'));

create index if not exists finance_entries_status_idx on public.finance_entries(status);
create index if not exists finance_entries_booking_code_idx on public.finance_entries(booking_code_id);
create index if not exists finance_entries_reversal_of_idx on public.finance_entries(reversal_of);
create index if not exists finance_entries_source_idx on public.finance_entries(source_type, source_id);

-- Existing booking-code ledger rows were expected, not necessarily earned.
update public.finance_entries
set status = 'expected', source_type = 'booking_code'
where category = 'booking_code' and coalesce(status, 'confirmed') = 'confirmed';

-- -----------------------------------------------------------------------------
-- Booking-code completion/payment/income lifecycle
-- -----------------------------------------------------------------------------
alter table public.booking_codes add column if not exists completion_status text not null default 'not_completed';
alter table public.booking_codes add column if not exists payment_status text not null default 'pending';
alter table public.booking_codes add column if not exists income_status text not null default 'expected';
alter table public.booking_codes add column if not exists admin_confirmed_income boolean not null default false;
alter table public.booking_codes add column if not exists completed_at timestamptz;
alter table public.booking_codes add column if not exists income_confirmed_at timestamptz;
alter table public.booking_codes add column if not exists income_confirmed_by uuid references auth.users(id) on delete set null;
alter table public.booking_codes add column if not exists cancelled_at timestamptz;
alter table public.booking_codes add column if not exists no_show_at timestamptz;

alter table public.booking_codes drop constraint if exists booking_codes_completion_status_check;
alter table public.booking_codes
  add constraint booking_codes_completion_status_check
  check (completion_status in ('not_completed', 'completed', 'cancelled', 'no_show'));

alter table public.booking_codes drop constraint if exists booking_codes_payment_status_check;
alter table public.booking_codes
  add constraint booking_codes_payment_status_check
  check (payment_status in ('pending', 'deposit_paid', 'paid', 'refunded', 'waived'));

alter table public.booking_codes drop constraint if exists booking_codes_income_status_check;
alter table public.booking_codes
  add constraint booking_codes_income_status_check
  check (income_status in ('none', 'expected', 'pending', 'confirmed', 'cancelled', 'reversed'));

create index if not exists booking_codes_completion_status_idx on public.booking_codes(completion_status);
create index if not exists booking_codes_income_status_idx on public.booking_codes(income_status);

update public.booking_codes
set completion_status = case when status = 'cancelled' then 'cancelled' else coalesce(nullif(completion_status, ''), 'not_completed') end,
    income_status = case
      when status = 'cancelled' then 'cancelled'
      when admin_confirmed_income is true then 'confirmed'
      else coalesce(nullif(income_status, ''), 'expected')
    end,
    payment_status = coalesce(nullif(payment_status, ''), 'pending');

-- -----------------------------------------------------------------------------
-- Redeem booking code: redemption creates accepted booking + expected finance only.
-- Confirmed revenue is created/marked only by admin confirmation later.
-- -----------------------------------------------------------------------------
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
    update public.booking_codes set status = 'expired', updated_at = now() where id = code_row.id;
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_EXPIRED');
  end if;

  insert into public.booking_requests (
    status, request_type, fixed_excursion_id, customer_name, customer_email, customer_phone,
    preferred_contact, experience_id, requested_date, language, adults, children, children_under_3,
    private_experience, message, source, source_section, source_cta, cta_location, selected_date,
    has_fixed_excursion, admin_note, decision_note, decided_at, booking_code,
    lead_status, expected_value
  ) values (
    'accepted', case when code_row.fixed_excursion_id is not null then 'fixed' else 'private' end,
    code_row.fixed_excursion_id, code_row.customer_name, code_row.customer_email, code_row.customer_phone,
    'unknown', coalesce(code_row.experience_id, 'unsure'), code_row.scheduled_date, clean_language, 1, 0, false,
    code_row.fixed_excursion_id is null, coalesce(code_row.customer_note, code_row.admin_note), 'booking_code',
    'booking_code_redemption', 'booking_code_confirm', 'booking_code_screen', code_row.scheduled_date,
    code_row.fixed_excursion_id is not null, code_row.admin_note, 'Redeemed from booking code ' || code_row.code, now(), code_row.code,
    'waiting_customer', code_row.expected_amount
  ) returning * into booking_row;

  insert into public.finance_entries (
    entry_date, type, amount, currency, title, description, category, payment_method,
    booking_request_id, booking_code_id, fixed_excursion_id, active, status, source_type, source_id
  ) values (
    coalesce(code_row.scheduled_date, current_date), 'income', coalesce(code_row.expected_amount, 0),
    coalesce(nullif(upper(code_row.currency), ''), 'EUR'), 'Booking code ' || code_row.code,
    coalesce(code_row.experience_name_it, code_row.experience_name_en, 'vulcanIQ experience'),
    'booking_code_expected', 'external_platform', booking_row.id, code_row.id, code_row.fixed_excursion_id,
    true, 'expected', 'booking_code', code_row.id
  ) returning * into finance_row;

  update public.booking_codes
  set status = 'redeemed',
      redeemed_at = now(),
      redeemed_booking_request_id = booking_row.id,
      redeemed_finance_entry_id = finance_row.id,
      review_enabled = true,
      completion_status = 'not_completed',
      payment_status = 'pending',
      income_status = 'expected',
      admin_confirmed_income = false,
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
    'income_status', 'expected',
    'review_enabled', true
  );
end;
$$;

grant execute on function public.redeem_booking_code(text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Gift-card request lifecycle v2 scaffold
-- -----------------------------------------------------------------------------
create table if not exists public.gift_card_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_name text,
  buyer_email text,
  buyer_phone text,
  recipient_name text,
  experience_type text,
  budget numeric(10,2),
  currency text not null default 'EUR',
  message text,
  preferred_delivery_date date,
  status text not null default 'new',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint gift_card_requests_status_check check (status in ('new', 'contacted', 'quoted', 'paid', 'issued', 'cancelled'))
);

create index if not exists gift_card_requests_status_idx on public.gift_card_requests(status);
create index if not exists gift_card_requests_created_at_idx on public.gift_card_requests(created_at desc);

drop trigger if exists gift_card_requests_set_updated_at on public.gift_card_requests;
create trigger gift_card_requests_set_updated_at
before update on public.gift_card_requests
for each row execute function public.set_updated_at();

alter table public.gift_card_requests enable row level security;

drop policy if exists "Admins can read gift card requests" on public.gift_card_requests;
create policy "Admins can read gift card requests"
on public.gift_card_requests
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert gift card requests" on public.gift_card_requests;
create policy "Admins can insert gift card requests"
on public.gift_card_requests
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update gift card requests" on public.gift_card_requests;
create policy "Admins can update gift card requests"
on public.gift_card_requests
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update on public.gift_card_requests to authenticated;

commit;
