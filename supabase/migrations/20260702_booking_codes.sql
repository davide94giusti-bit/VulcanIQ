-- vulcanIQ booking-code redemption table and RPC
-- Apply this migration to the live Supabase project, then reload PostgREST schema cache if needed:
-- notify pgrst, 'reload schema';

create extension if not exists pgcrypto;

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
  redeemed_finance_entry_id uuid references public.finance_entries(id) on delete set null
);

alter table public.booking_codes add column if not exists fixed_excursion_id uuid null references public.fixed_excursions(id) on delete set null;
alter table public.booking_codes add column if not exists updated_at timestamptz not null default now();

alter table public.booking_codes drop constraint if exists booking_codes_status_check;
alter table public.booking_codes
  add constraint booking_codes_status_check
  check (status in ('unused', 'redeemed', 'expired', 'cancelled'));

alter table public.booking_codes drop constraint if exists booking_codes_expected_amount_check;
alter table public.booking_codes
  add constraint booking_codes_expected_amount_check
  check (expected_amount >= 0);

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

-- Allow redeemed bookings to carry a precise source value.
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

create or replace function public.redeem_booking_code(input_code text, input_language text default 'it')
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
  clean_code := upper(trim(coalesce(input_code, '')));
  clean_language := case when input_language = 'en' then 'en' else 'it' end;

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
    update public.booking_codes
    set status = 'expired'
    where id = code_row.id;
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_EXPIRED');
  end if;

  insert into public.booking_requests (
    status,
    request_type,
    fixed_excursion_id,
    customer_name,
    customer_email,
    customer_phone,
    preferred_contact,
    experience_id,
    requested_date,
    language,
    adults,
    children,
    children_under_3,
    private_experience,
    message,
    source,
    source_section,
    source_cta,
    cta_location,
    selected_date,
    has_fixed_excursion,
    admin_note,
    decision_note,
    decided_at,
    booking_code
  ) values (
    'accepted',
    case when code_row.fixed_excursion_id is not null then 'fixed' else 'private' end,
    code_row.fixed_excursion_id,
    code_row.customer_name,
    code_row.customer_email,
    code_row.customer_phone,
    'unknown',
    coalesce(code_row.experience_id, 'unsure'),
    code_row.scheduled_date,
    clean_language,
    1,
    0,
    false,
    code_row.fixed_excursion_id is null,
    coalesce(code_row.customer_note, code_row.admin_note),
    'booking_code',
    'booking_code_redemption',
    'booking_code_confirm',
    'booking_code_screen',
    code_row.scheduled_date,
    code_row.fixed_excursion_id is not null,
    code_row.admin_note,
    'Redeemed from booking code ' || code_row.code,
    now(),
    code_row.code
  ) returning * into booking_row;

  insert into public.finance_entries (
    entry_date,
    type,
    amount,
    currency,
    title,
    description,
    category,
    payment_method,
    booking_request_id,
    fixed_excursion_id,
    active
  ) values (
    coalesce(code_row.scheduled_date, current_date),
    'income',
    coalesce(code_row.expected_amount, 0),
    coalesce(code_row.currency, 'EUR'),
    'Booking code ' || code_row.code,
    coalesce(code_row.experience_name_it, code_row.experience_name_en, 'vulcanIQ experience'),
    'booking_code',
    'external_platform',
    booking_row.id,
    code_row.fixed_excursion_id,
    true
  ) returning * into finance_row;

  update public.booking_codes
  set status = 'redeemed',
      redeemed_at = now(),
      redeemed_booking_request_id = booking_row.id,
      redeemed_finance_entry_id = finance_row.id
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

notify pgrst, 'reload schema';
