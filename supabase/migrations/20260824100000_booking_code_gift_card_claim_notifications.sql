-- Booking-code notification routing and Gift Card recipient claim ownership.
-- Forward-only: no historical claimant backfill and no Finance history rewrite.

begin;

alter table public.gift_card_requests
  add column if not exists claimed_recipient_name text,
  add column if not exists recipient_email text,
  add column if not exists recipient_phone text,
  add column if not exists recipient_preferred_language text,
  add column if not exists recipient_claimed_at timestamptz;

alter table public.gift_card_requests
  drop constraint if exists gift_card_requests_recipient_preferred_language_check;
alter table public.gift_card_requests
  add constraint gift_card_requests_recipient_preferred_language_check
  check (recipient_preferred_language is null or recipient_preferred_language in ('it', 'en'));

-- Keep request creation authoritative. Notification delivery remains best-effort.
create or replace function public.dispatch_request_notification_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  project_url text;
  webhook_secret text;
  request_id bigint;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'vulcaniq_supabase_url'
  limit 1;

  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'request_notification_webhook_secret'
  limit 1;

  if nullif(btrim(project_url), '') is null or nullif(btrim(webhook_secret), '') is null then
    raise warning 'vulcanIQ notification webhook skipped: Vault configuration is incomplete';
    return new;
  end if;

  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/notify-new-request',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-vulcaniq-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new)
    ),
    timeout_milliseconds := 10000
  ) into request_id;

  return new;
exception when others then
  raise warning 'vulcanIQ notification webhook dispatch failed for %.%', tg_table_schema, tg_table_name;
  return new;
end;
$$;

revoke all on function public.dispatch_request_notification_webhook() from public, anon, authenticated;

drop trigger if exists booking_requests_notify_after_insert on public.booking_requests;
create trigger booking_requests_notify_after_insert
after insert on public.booking_requests
for each row
when (new.created_by_admin is null and new.source in ('website', 'booking_code'))
execute function public.dispatch_request_notification_webhook();

-- Ordinary booking codes retain their existing accepted-booking and expected-income behavior.
-- Gift Card-origin codes must use the trusted recipient-claim path below.
create or replace function public.redeem_booking_code(p_code text, p_language text default 'it')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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

  if code_row.source = 'gift_card' or code_row.gift_card_request_id is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'GIFT_CARD_CLAIM_REQUIRED',
      'requires_recipient_claim', true
    );
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

revoke all on function public.redeem_booking_code(text, text) from public, anon, authenticated;
grant execute on function public.redeem_booking_code(text, text) to anon, authenticated;

-- Latest effective Gift Card lifecycle function, retaining the 2026-08-21 payment semantics.
-- The only issuance change is that purchaser email/phone never become recipient contact.
create or replace function public.admin_update_gift_card_request(
  p_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  gift public.gift_card_requests%rowtype;
  finance public.finance_entries%rowtype;
  code_row public.booking_codes%rowtype;
  next_status text;
  next_budget numeric(10,2);
  next_currency text;
  next_delivery date;
  next_note text;
  payment_amount numeric(10,2);
  payment_date date;
  payment_method text;
  payment_key text;
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

  select * into finance
  from public.finance_entries
  where (gift_card_request_id = gift.id or (source_type = 'gift_card' and source_id = gift.id))
    and reversal_of is null
  order by created_at asc
  limit 1
  for update;

  if next_status = 'paid' and gift.status <> 'paid' then
    if finance.id is not null and finance.status in ('confirmed', 'reversed') then
      raise exception 'GIFT_CARD_HISTORICAL_INCOME_REQUIRES_RECONCILIATION';
    end if;

    if nullif(btrim(coalesce(p_patch->>'payment_amount', '')), '') is null
       or (p_patch->>'payment_amount') !~ '^\d+(\.\d{1,2})?$'
       or (p_patch->>'payment_amount')::numeric <= 0 then
      raise exception 'Gift Card payment amount is required';
    end if;
    payment_amount := least((p_patch->>'payment_amount')::numeric, 100000);
    payment_date := public.safe_date(p_patch->>'payment_date');
    if payment_date is null then raise exception 'Gift Card payment date is required'; end if;
    payment_method := left(nullif(btrim(coalesce(p_patch->>'payment_method', '')), ''), 120);
    if payment_method is null then raise exception 'Gift Card payment method is required'; end if;
    payment_key := left(nullif(btrim(coalesce(p_patch->>'payment_idempotency_key', '')), ''), 160);
    if payment_key is null then raise exception 'Gift Card payment idempotency key is required'; end if;
  end if;

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

  if next_status = 'paid' and gift.status = 'paid' and payment_amount is not null then
    if finance.id is null then
      insert into public.finance_entries (
        entry_date, type, amount, currency, title, description, category,
        payment_method, source_type, source_id, gift_card_request_id, idempotency_key,
        status, active, recognized_at, admin_confirmed_at, admin_confirmed_by, created_by, updated_by
      ) values (
        payment_date, 'income', payment_amount, next_currency,
        'Gift Card' || case when gift.recipient_name is not null then ' - ' || gift.recipient_name else '' end,
        'Recorded Gift Card payment', 'gift_card', payment_method, 'gift_card', gift.id, gift.id, payment_key,
        'confirmed', true, now(), now(), auth.uid(), auth.uid(), auth.uid()
      ) returning * into finance;
    elsif finance.status in ('expected', 'pending', 'cancelled', 'void', 'voided') then
      update public.finance_entries
      set entry_date = payment_date,
          amount = payment_amount,
          currency = next_currency,
          payment_method = payment_method,
          source_type = 'gift_card',
          source_id = gift.id,
          gift_card_request_id = gift.id,
          idempotency_key = payment_key,
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

    if finance.id is not null then
      update public.gift_card_requests set finance_entry_id = finance.id where id = gift.id;
    end if;
  end if;

  if next_status = 'issued' then
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
        coalesce(gift.claimed_recipient_name, gift.recipient_name, gift.buyer_name, 'Gift Card recipient'),
        gift.recipient_email, gift.recipient_phone,
        null, coalesce(gift.experience_type, 'Gift Card vulcanIQ'), coalesce(gift.experience_type, 'vulcanIQ Gift Card'), 'gift_card',
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
    if finance.id is not null and finance.status in ('expected', 'pending') then
      update public.finance_entries
      set status = 'cancelled', active = false, cancelled_at = now(),
          archive_reason = 'Gift Card request cancelled', updated_by = auth.uid(), updated_at = now()
      where id = finance.id;
    end if;
  end if;

  select * into gift from public.gift_card_requests where id = p_id;
  return to_jsonb(gift);
end;
$$;

revoke all on function public.admin_update_gift_card_request(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_gift_card_request(uuid, jsonb) to authenticated;

-- Trusted, atomic recipient claim. Public browsers reach this only through the Pages Function.
create or replace function public.redeem_gift_card_booking_code(
  p_code text,
  p_recipient_name text,
  p_recipient_email text default null,
  p_recipient_phone text default null,
  p_language text default 'it'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  code_row public.booking_codes%rowtype;
  gift public.gift_card_requests%rowtype;
  booking_row public.booking_requests%rowtype;
  clean_code text;
  clean_name text;
  clean_email text;
  clean_phone text;
  clean_language text;
  phone_digits text;
begin
  clean_code := upper(regexp_replace(btrim(coalesce(p_code, '')), '\s+', '', 'g'));
  clean_name := nullif(btrim(coalesce(p_recipient_name, '')), '');
  clean_email := nullif(lower(btrim(coalesce(p_recipient_email, ''))), '');
  clean_phone := nullif(btrim(coalesce(p_recipient_phone, '')), '');
  clean_language := lower(btrim(coalesce(p_language, '')));

  if clean_code = '' then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_REQUIRED');
  end if;
  if clean_code !~ '^[A-Z0-9-]{1,80}$' then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_NOT_FOUND');
  end if;
  if clean_name is null or char_length(clean_name) > 120 then
    return jsonb_build_object('ok', false, 'error', 'RECIPIENT_NAME_INVALID');
  end if;
  if clean_email is null and clean_phone is null then
    return jsonb_build_object('ok', false, 'error', 'RECIPIENT_CONTACT_REQUIRED');
  end if;
  if clean_email is not null and (char_length(clean_email) > 254 or clean_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$') then
    return jsonb_build_object('ok', false, 'error', 'RECIPIENT_EMAIL_INVALID');
  end if;
  if clean_phone is not null then
    phone_digits := regexp_replace(clean_phone, '\D', '', 'g');
    if char_length(clean_phone) > 40
       or clean_phone !~ '^[+()\-\s.0-9]+$'
       or char_length(phone_digits) < 7
       or char_length(phone_digits) > 15 then
      return jsonb_build_object('ok', false, 'error', 'RECIPIENT_PHONE_INVALID');
    end if;
  end if;
  if clean_language not in ('it', 'en') then
    return jsonb_build_object('ok', false, 'error', 'RECIPIENT_LANGUAGE_INVALID');
  end if;

  -- Discovery read only: authoritative locks below always use Gift Card then booking code.
  select * into code_row
  from public.booking_codes
  where upper(code) = clean_code
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_NOT_FOUND');
  end if;
  if code_row.gift_card_request_id is null then
    return jsonb_build_object('ok', false, 'error', 'GIFT_CARD_NOT_CLAIMABLE');
  end if;

  -- Match admin_update_gift_card_request's lock order to prevent cross-flow deadlocks.
  select * into gift
  from public.gift_card_requests
  where id = code_row.gift_card_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'GIFT_CARD_NOT_CLAIMABLE');
  end if;

  select * into code_row
  from public.booking_codes
  where id = code_row.id
  for update;

  if not found or upper(code_row.code) <> clean_code then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_NOT_FOUND');
  end if;
  if not (code_row.source = 'gift_card' or code_row.gift_card_request_id is not null) then
    return jsonb_build_object('ok', false, 'error', 'GIFT_CARD_CODE_REQUIRED');
  end if;
  if code_row.gift_card_request_id is distinct from gift.id then
    return jsonb_build_object('ok', false, 'error', 'GIFT_CARD_NOT_CLAIMABLE');
  end if;
  if code_row.status = 'redeemed' then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_ALREADY_REDEEMED');
  end if;
  if code_row.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_CANCELLED');
  end if;
  if code_row.status = 'expired' or (code_row.expires_at is not null and code_row.expires_at < now()) then
    update public.booking_codes set status = 'expired', updated_at = now() where id = code_row.id;
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_EXPIRED');
  end if;
  if gift.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'GIFT_CARD_CANCELLED');
  end if;
  if gift.status <> 'issued' or (gift.booking_code_id is not null and gift.booking_code_id <> code_row.id) then
    return jsonb_build_object('ok', false, 'error', 'GIFT_CARD_NOT_CLAIMABLE');
  end if;
  if gift.recipient_claimed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CODE_ALREADY_REDEEMED');
  end if;

  update public.gift_card_requests
  set claimed_recipient_name = clean_name,
      recipient_email = clean_email,
      recipient_phone = clean_phone,
      recipient_preferred_language = clean_language,
      recipient_claimed_at = now(),
      updated_at = now()
  where id = gift.id;

  update public.booking_codes
  set customer_name = clean_name,
      customer_email = clean_email,
      customer_phone = clean_phone,
      updated_at = now()
  where id = code_row.id;

  insert into public.booking_requests (
    status, request_type, fixed_excursion_id, customer_name, customer_email, customer_phone,
    preferred_contact, experience_id, requested_date, language, adults, children, children_under_3,
    private_experience, message, source, source_section, source_cta, cta_location, selected_date,
    has_fixed_excursion, admin_note, decision_note, decided_at, booking_code,
    lead_status, expected_value
  ) values (
    'accepted', case when code_row.fixed_excursion_id is not null then 'fixed' else 'private' end,
    code_row.fixed_excursion_id, clean_name, clean_email, clean_phone,
    case when clean_email is not null then 'email' else 'phone' end,
    case
      when code_row.experience_id in ('etna-premium', 'etna-learning', 'etna-live', 'etna-stories', 'unsure')
        then code_row.experience_id
      else null
    end,
    code_row.scheduled_date, clean_language, 1, 0, false,
    code_row.fixed_excursion_id is null, code_row.customer_note, 'booking_code',
    'gift_card_claim', 'gift_card_claim_confirm', 'booking_code_screen', code_row.scheduled_date,
    code_row.fixed_excursion_id is not null, code_row.admin_note,
    'Gift Card claimed with booking code ' || code_row.code, now(), code_row.code,
    'waiting_customer', 0
  ) returning * into booking_row;

  update public.booking_codes
  set status = 'redeemed',
      redeemed_at = now(),
      redeemed_booking_request_id = booking_row.id,
      redeemed_finance_entry_id = null,
      review_enabled = true,
      completion_status = 'not_completed',
      payment_status = 'paid',
      income_status = 'none',
      admin_confirmed_income = false,
      updated_at = now()
  where id = code_row.id;

  return jsonb_build_object(
    'ok', true,
    'code', code_row.code,
    'customer_name', clean_name,
    'experience_name_it', code_row.experience_name_it,
    'experience_name_en', coalesce(code_row.experience_name_en, code_row.experience_name_it),
    'scheduled_date', code_row.scheduled_date,
    'booking_request_id', booking_row.id,
    'income_status', 'none',
    'review_enabled', true
  );
end;
$$;

revoke all on function public.redeem_gift_card_booking_code(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.redeem_gift_card_booking_code(text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
