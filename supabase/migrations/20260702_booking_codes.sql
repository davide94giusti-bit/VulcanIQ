-- Booking codes for externally-confirmed vulcanIQ bookings.

create extension if not exists pgcrypto;

create table if not exists public.booking_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  customer_name text not null,
  customer_email text null,
  customer_phone text null,
  experience_id text null,
  fixed_excursion_id uuid null references public.fixed_excursions(id),
  experience_name_it text not null,
  experience_name_en text null,
  experience_type text null,
  scheduled_date date null,
  scheduled_time text null,
  meeting_point_name text null,
  meeting_point_maps_url text null,
  expected_amount numeric(10,2) not null default 0,
  currency text not null default 'EUR',
  source text not null default 'manual',
  admin_note text null,
  customer_note text null,
  status text not null default 'unused',
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz null,
  redeemed_at timestamptz null,
  redeemed_booking_request_id uuid null references public.booking_requests(id),
  redeemed_finance_entry_id uuid null references public.finance_entries(id),
  constraint booking_codes_amount_check check (expected_amount >= 0),
  constraint booking_codes_status_check check (status in ('unused', 'redeemed', 'expired', 'cancelled')),
  constraint booking_codes_code_length_check check (char_length(code) between 5 and 40)
);

create index if not exists booking_codes_code_idx on public.booking_codes(code);
create index if not exists booking_codes_status_idx on public.booking_codes(status);
create index if not exists booking_codes_scheduled_date_idx on public.booking_codes(scheduled_date);
create index if not exists booking_codes_created_at_idx on public.booking_codes(created_at desc);
create index if not exists booking_codes_redeemed_at_idx on public.booking_codes(redeemed_at desc) where redeemed_at is not null;

alter table public.booking_codes enable row level security;

drop trigger if exists booking_codes_set_updated_at on public.booking_codes;
create trigger booking_codes_set_updated_at
before update on public.booking_codes
for each row execute function public.set_updated_at();

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

create or replace function public.redeem_booking_code(input_code text, input_language text default 'it')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text := upper(regexp_replace(coalesce(input_code, ''), '[[:space:]]+', '', 'g'));
  code_row public.booking_codes%rowtype;
  booking_row public.booking_requests%rowtype;
  finance_row public.finance_entries%rowtype;
  safe_language text := case when input_language in ('it', 'en') then input_language else 'it' end;
  safe_experience_id text;
  safe_request_type text;
  request_message text;
begin
  normalized_code := regexp_replace(normalized_code, '[^A-Z0-9-]', '', 'g');

  if normalized_code = '' then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  select * into code_row
  from public.booking_codes
  where code = normalized_code
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  if code_row.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error_code', 'cancelled');
  end if;

  if code_row.status = 'expired' or (code_row.expires_at is not null and code_row.expires_at < now()) then
    update public.booking_codes set status = 'expired' where id = code_row.id and status = 'unused';
    return jsonb_build_object('ok', false, 'error_code', 'expired');
  end if;

  if code_row.status = 'redeemed' then
    return jsonb_build_object('ok', false, 'error_code', 'already_used');
  end if;

  if code_row.status <> 'unused' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_status');
  end if;

  safe_experience_id := case
    when code_row.experience_id in ('etna-premium', 'etna-learning', 'etna-live', 'etna-stories') then code_row.experience_id
    else 'unsure'
  end;
  safe_request_type := case when code_row.fixed_excursion_id is not null then 'fixed' else 'private' end;

  request_message := concat_ws(E'\n',
    case when safe_language = 'it' then 'Prenotazione confermata tramite codice prenotazione generato dall''admin.' else 'Booking confirmed through an admin-generated booking code.' end,
    'Code: ' || code_row.code,
    'Original source: ' || coalesce(code_row.source, 'manual'),
    'Expected amount: ' || coalesce(code_row.currency, 'EUR') || ' ' || coalesce(code_row.expected_amount, 0)::text,
    coalesce(code_row.customer_note, '')
  );

  insert into public.booking_requests (
    status,
    request_type,
    customer_name,
    customer_email,
    customer_phone,
    preferred_contact,
    experience_id,
    requested_date,
    language,
    fixed_excursion_id,
    booking_code,
    private_experience,
    message,
    source,
    source_section,
    source_cta,
    cta_location,
    selected_date,
    selected_month,
    has_fixed_excursion,
    heard_about_us,
    heard_about_us_label,
    admin_note,
    decided_at
  ) values (
    'accepted',
    safe_request_type,
    code_row.customer_name,
    code_row.customer_email,
    code_row.customer_phone,
    case when code_row.customer_phone is not null then 'whatsapp' when code_row.customer_email is not null then 'email' else 'unknown' end,
    safe_experience_id,
    code_row.scheduled_date,
    safe_language,
    code_row.fixed_excursion_id,
    code_row.code,
    safe_request_type = 'private',
    request_message,
    'manual',
    'booking_code',
    'booking_code_redeem',
    'public_booking_code_form',
    code_row.scheduled_date,
    case when code_row.scheduled_date is not null then to_char(code_row.scheduled_date, 'YYYY-MM') else null end,
    code_row.fixed_excursion_id is not null,
    'not_specified',
    'Admin booking code',
    code_row.admin_note,
    now()
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
    leaflet_id,
    active
  ) values (
    coalesce(code_row.scheduled_date, current_date),
    'income',
    code_row.expected_amount,
    coalesce(code_row.currency, 'EUR'),
    'Booking code ' || code_row.code,
    'Booking code ' || code_row.code || ' - ' || coalesce(code_row.experience_name_en, code_row.experience_name_it) || ' - ' || code_row.customer_name,
    case when code_row.fixed_excursion_id is not null then 'fixed_excursion' else 'booking_payment' end,
    'booking_code',
    booking_row.id,
    code_row.fixed_excursion_id,
    null,
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
    'experience_name', case when safe_language = 'it' then coalesce(code_row.experience_name_it, code_row.experience_name_en) else coalesce(code_row.experience_name_en, code_row.experience_name_it) end,
    'experience_name_it', code_row.experience_name_it,
    'experience_name_en', code_row.experience_name_en,
    'scheduled_date', code_row.scheduled_date,
    'scheduled_time', code_row.scheduled_time,
    'meeting_point_name', code_row.meeting_point_name,
    'meeting_point_maps_url', code_row.meeting_point_maps_url,
    'amount', code_row.expected_amount,
    'currency', code_row.currency,
    'booking_request_id', booking_row.id,
    'finance_entry_id', finance_row.id
  );
end;
$$;

grant execute on function public.redeem_booking_code(text, text) to anon, authenticated;
