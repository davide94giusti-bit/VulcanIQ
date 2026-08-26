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
  v_payment_method text;
  payment_key text;
  generated_code text;
begin
  if not public.is_privileged_admin() then raise exception 'Not authorized'; end if;
  if p_id is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'Invalid payload'; end if;

  select * into gift
  from public.gift_card_requests
  where id = p_id
  for update;

  if not found then
    raise exception 'Gift Card request not found';
  end if;

  next_status :=
    case
      when p_patch ? 'status'
        then lower(btrim(coalesce(p_patch->>'status', '')))
      else gift.status
    end;

  if next_status not in ('new', 'contacted', 'quoted', 'paid', 'issued', 'cancelled') then
    raise exception 'Invalid status';
  end if;

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

  next_currency :=
    case
      when p_patch ? 'currency'
        then upper(btrim(coalesce(p_patch->>'currency', '')))
      else coalesce(gift.currency, 'EUR')
    end;

  if next_currency !~ '^[A-Z]{3}$' then
    raise exception 'Invalid currency';
  end if;

  next_delivery :=
    case
      when p_patch ? 'preferred_delivery_date'
        then public.safe_date(p_patch->>'preferred_delivery_date')
      else gift.preferred_delivery_date
    end;

  next_note :=
    case
      when p_patch ? 'admin_note'
        then left(nullif(btrim(coalesce(p_patch->>'admin_note', '')), ''), 2500)
      else gift.admin_note
    end;

  select * into finance
  from public.finance_entries
  where (
      gift_card_request_id = gift.id
      or (
        source_type = 'gift_card'
        and source_id = gift.id
      )
    )
    and reversal_of is null
  order by created_at asc
  limit 1
  for update;

  if next_status = 'paid' and gift.status <> 'paid' then
    if finance.id is not null
       and finance.status in ('confirmed', 'reversed') then
      raise exception 'GIFT_CARD_HISTORICAL_INCOME_REQUIRES_RECONCILIATION';
    end if;

    if nullif(btrim(coalesce(p_patch->>'payment_amount', '')), '') is null
       or (p_patch->>'payment_amount') !~ '^\d+(\.\d{1,2})?$'
       or (p_patch->>'payment_amount')::numeric <= 0 then
      raise exception 'Gift Card payment amount is required';
    end if;

    payment_amount :=
      least((p_patch->>'payment_amount')::numeric, 100000);

    payment_date :=
      public.safe_date(p_patch->>'payment_date');

    if payment_date is null then
      raise exception 'Gift Card payment date is required';
    end if;

    v_payment_method :=
      left(
        nullif(
          btrim(coalesce(p_patch->>'payment_method', '')),
          ''
        ),
        120
      );

    if v_payment_method is null then
      raise exception 'Gift Card payment method is required';
    end if;

    payment_key :=
      left(
        nullif(
          btrim(coalesce(p_patch->>'payment_idempotency_key', '')),
          ''
        ),
        160
      );

    if payment_key is null then
      raise exception 'Gift Card payment idempotency key is required';
    end if;
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

  if next_status = 'paid'
     and gift.status = 'paid'
     and payment_amount is not null then

    if finance.id is null then
      insert into public.finance_entries (
        entry_date,
        type,
        amount,
        currency,
        title,
        description,
        category,
        payment_method,
        source_type,
        source_id,
        gift_card_request_id,
        idempotency_key,
        status,
        active,
        recognized_at,
        admin_confirmed_at,
        admin_confirmed_by,
        created_by,
        updated_by
      )
      values (
        payment_date,
        'income',
        payment_amount,
        next_currency,
        'Gift Card'
          || case
               when gift.recipient_name is not null
                 then ' - ' || gift.recipient_name
               else ''
             end,
        'Recorded Gift Card payment',
        'gift_card',
        v_payment_method,
        'gift_card',
        gift.id,
        gift.id,
        payment_key,
        'confirmed',
        true,
        now(),
        now(),
        auth.uid(),
        auth.uid(),
        auth.uid()
      )
      returning * into finance;

    elsif finance.status in ('expected', 'pending', 'cancelled', 'void', 'voided') then
      update public.finance_entries
      set entry_date = payment_date,
          amount = payment_amount,
          currency = next_currency,
          payment_method = v_payment_method,
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
      update public.gift_card_requests
      set finance_entry_id = finance.id
      where id = gift.id;
    end if;
  end if;

  if next_status = 'issued' then
    select * into code_row
    from public.booking_codes
    where gift_card_request_id = gift.id
    limit 1
    for update;

    if code_row.id is null then
      generated_code :=
        'GIFT-'
        || to_char(current_date, 'YYYYMMDD')
        || '-'
        || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));

      insert into public.booking_codes (
        code,
        customer_name,
        customer_email,
        customer_phone,
        experience_id,
        experience_name_it,
        experience_name_en,
        experience_type,
        scheduled_date,
        expected_amount,
        currency,
        source,
        admin_note,
        customer_note,
        status,
        created_by,
        review_enabled,
        completion_status,
        payment_status,
        income_status,
        admin_confirmed_income,
        gift_card_request_id,
        updated_by
      )
      values (
        generated_code,
        coalesce(
          gift.claimed_recipient_name,
          gift.recipient_name,
          gift.buyer_name,
          'Gift Card recipient'
        ),
        gift.recipient_email,
        gift.recipient_phone,
        null,
        coalesce(gift.experience_type, 'Gift Card vulcanIQ'),
        coalesce(gift.experience_type, 'vulcanIQ Gift Card'),
        'gift_card',
        null,
        0,
        next_currency,
        'gift_card',
        'Gift Card request ' || gift.id::text,
        gift.message,
        'unused',
        auth.uid(),
        false,
        'not_completed',
        'paid',
        'none',
        false,
        gift.id,
        auth.uid()
      )
      returning * into code_row;
    end if;

    update public.gift_card_requests
    set booking_code_id = code_row.id,
        booking_code = code_row.code,
        updated_by = auth.uid(),
        updated_at = now()
    where id = gift.id
    returning * into gift;

  elsif next_status = 'cancelled' then
    if finance.id is not null
       and finance.status in ('expected', 'pending') then
      update public.finance_entries
      set status = 'cancelled',
          active = false,
          cancelled_at = now(),
          archive_reason = 'Gift Card request cancelled',
          updated_by = auth.uid(),
          updated_at = now()
      where id = finance.id;
    end if;
  end if;

  select * into gift
  from public.gift_card_requests
  where id = p_id;

  return to_jsonb(gift);
end;
$$;

revoke all
on function public.admin_update_gift_card_request(uuid, jsonb)
from public, anon;

grant execute
on function public.admin_update_gift_card_request(uuid, jsonb)
to authenticated;
