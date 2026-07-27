-- Hotfix: ensure the public booking-code redemption RPC exists with the argument names used by the app.
-- Apply this migration to the live Supabase project after the booking_codes table migration.

begin;

drop function if exists public.redeem_booking_code(text, text);

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

commit;
