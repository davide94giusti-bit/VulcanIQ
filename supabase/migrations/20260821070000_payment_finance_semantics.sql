-- Payment/Finance semantics hardening.
-- Forward-only: adds source linkage/idempotency and makes Gift Card Paid distinct from Issued.

begin;

alter table public.finance_entries
  add column if not exists gift_card_request_id uuid references public.gift_card_requests(id) on delete set null,
  add column if not exists partner_commission_id uuid references public.partner_commissions(id) on delete set null,
  add column if not exists idempotency_key text;

alter table public.partner_commissions
  add column if not exists finance_entry_id uuid references public.finance_entries(id) on delete set null;

create index if not exists finance_entries_gift_card_request_id_idx on public.finance_entries(gift_card_request_id);
create index if not exists finance_entries_partner_commission_id_idx on public.finance_entries(partner_commission_id);
create index if not exists partner_commissions_finance_entry_id_idx on public.partner_commissions(finance_entry_id);
create index if not exists finance_entries_source_lookup_idx on public.finance_entries(source_type, source_id, active);
create unique index if not exists finance_entries_idempotency_key_unique_idx
  on public.finance_entries(idempotency_key)
  where idempotency_key is not null and btrim(idempotency_key) <> '';

-- Deterministic source-link backfill only. This does not alter monetary values, dates or statuses.
update public.finance_entries fe
set gift_card_request_id = g.id
from public.gift_card_requests g
where fe.gift_card_request_id is null
  and fe.source_type = 'gift_card'
  and fe.source_id = g.id;


update public.finance_entries fe
set partner_commission_id = pc.id
from public.partner_commissions pc
where fe.partner_commission_id is null
  and fe.source_type = 'partner_commission'
  and fe.source_id = pc.id;

-- Paid creates recognized revenue. Issued only creates/delivers the voucher and must never
-- independently recognize revenue. Historical records are deliberately left untouched.
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
    -- A legacy Issued row may already have recognized revenue under the old semantics. Do not
    -- silently bless or rewrite that history by toggling status; route it to reconciliation.
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

  -- Issued is operational: generate/deliver the voucher code, never recognize revenue here.
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
    -- Cancellation is not proof that money was refunded. Preserve recognized payments and only
    -- void an outstanding expectation. Actual money returned uses admin_reverse_finance_entry.
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

-- Commission status changes and their Finance expense are committed atomically and idempotently.
create or replace function public.admin_update_partner_commission_status(
  p_id uuid,
  p_status text,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  commission public.partner_commissions%rowtype;
  finance public.finance_entries%rowtype;
  existing_reversal public.finance_entries%rowtype;
  next_status text;
  now_ts timestamptz := now();
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  next_status := lower(btrim(coalesce(p_status, '')));
  if next_status not in ('pending', 'approved', 'paid', 'cancelled') then raise exception 'Invalid status'; end if;

  select * into commission from public.partner_commissions where id = p_id for update;
  if not found then raise exception 'Partner commission not found'; end if;

  update public.partner_commissions
  set status = next_status,
      status_notes = nullif(left(btrim(coalesce(p_notes, '')), 2500), ''),
      approved_at = case when next_status in ('approved', 'paid') then coalesce(approved_at, now_ts) else approved_at end,
      paid_at = case when next_status = 'paid' then coalesce(paid_at, now_ts) else paid_at end,
      cancelled_at = case when next_status = 'cancelled' then coalesce(cancelled_at, now_ts) else null end,
      updated_by = auth.uid(),
      updated_at = now_ts
  where id = p_id
  returning * into commission;

  select * into finance
  from public.finance_entries
  where source_type = 'partner_commission'
    and source_id = commission.id
    and reversal_of is null
  order by created_at asc
  limit 1
  for update;

  if next_status = 'paid' and commission.commission_amount > 0 then
    if finance.id is null then
      insert into public.finance_entries (
        entry_date, type, amount, currency, title, description, category,
        payment_method, status, source_type, source_id, partner_commission_id,
        recognized_at, active, created_by, updated_by, admin_confirmed_by, admin_confirmed_at
      ) values (
        coalesce(commission.paid_at::date, current_date), 'expense', commission.commission_amount,
        commission.currency, 'Partner commission' || case when commission.source_code is not null then ' - ' || commission.source_code else '' end,
        'Paid partner commission', 'partner_commission', 'external', 'confirmed',
        'partner_commission', commission.id, commission.id, now_ts, true,
        auth.uid(), auth.uid(), auth.uid(), now_ts
      ) returning * into finance;
      update public.partner_commissions set finance_entry_id = finance.id where id = commission.id;
    elsif finance.status in ('expected', 'pending', 'cancelled', 'void', 'voided') then
      update public.finance_entries
      set type = 'expense', amount = commission.commission_amount, currency = commission.currency,
          status = 'confirmed', active = true, partner_commission_id = commission.id,
          recognized_at = now_ts, admin_confirmed_by = auth.uid(), admin_confirmed_at = now_ts,
          cancelled_at = null, reversed_at = null, updated_by = auth.uid(), updated_at = now_ts
      where id = finance.id
      returning * into finance;
      update public.partner_commissions set finance_entry_id = finance.id where id = commission.id;
    else
      update public.partner_commissions set finance_entry_id = finance.id where id = commission.id;
    end if;
  elsif next_status = 'cancelled' and finance.id is not null then
    if finance.status = 'confirmed' and finance.amount <> 0 then
      select * into existing_reversal from public.finance_entries where reversal_of = finance.id limit 1;
      if existing_reversal.id is null then
        insert into public.finance_entries (
          entry_date, type, amount, currency, title, description, category,
          payment_method, status, source_type, source_id, partner_commission_id,
          reversal_of, recognized_at, active, created_by, updated_by
        ) values (
          current_date, 'expense', -abs(finance.amount), finance.currency,
          'Reversal - ' || finance.title, 'Paid partner commission cancelled',
          coalesce(finance.category, 'partner_commission'), finance.payment_method,
          'reversal', 'partner_commission', commission.id, commission.id,
          finance.id, now_ts, true, auth.uid(), auth.uid()
        );
      end if;
      update public.finance_entries
      set status = 'reversed', reversed_at = now_ts, updated_by = auth.uid(), updated_at = now_ts
      where id = finance.id;
    elsif finance.status not in ('reversal', 'reversed', 'cancelled', 'void', 'voided') then
      update public.finance_entries
      set status = 'cancelled', active = false, cancelled_at = now_ts,
          archive_reason = 'Partner commission cancelled', updated_by = auth.uid(), updated_at = now_ts
      where id = finance.id;
    end if;
  end if;

  select * into commission from public.partner_commissions where id = p_id;
  return to_jsonb(commission);
end;
$$;

revoke all on function public.admin_update_partner_commission_status(uuid, text, text) from public, anon;
grant execute on function public.admin_update_partner_commission_status(uuid, text, text) to authenticated;

commit;
