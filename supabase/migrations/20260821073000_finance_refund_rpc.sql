-- Forward-only Finance refund/reversal helper.
-- Preserves original recognized movements and adds explicit negative reversal rows.
begin;

create or replace function public.admin_reverse_finance_entry(
  p_entry_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_payment_method text default null,
  p_reason text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  original public.finance_entries%rowtype;
  created public.finance_entries%rowtype;
  existing public.finance_entries%rowtype;
  already_reversed numeric := 0;
  remaining numeric := 0;
  requested numeric := round(coalesce(p_amount, 0)::numeric, 2);
  now_ts timestamptz := now();
  safe_key text := nullif(left(trim(coalesce(p_idempotency_key, '')), 180), '');
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_entry_date is null then raise exception 'REFUND_DATE_REQUIRED'; end if;
  if requested <= 0 then raise exception 'REFUND_AMOUNT_INVALID'; end if;

  select * into original from public.finance_entries where id = p_entry_id for update;
  if original.id is null then raise exception 'FINANCE_ENTRY_NOT_FOUND'; end if;
  if original.type <> 'income' then raise exception 'REFUND_REQUIRES_INCOME'; end if;
  if original.reversal_of is not null or original.status = 'reversal' then raise exception 'REFUND_REVERSAL_NOT_ALLOWED'; end if;
  if original.status not in ('confirmed', 'reversed') or original.active is false then raise exception 'REFUND_REQUIRES_RECOGNIZED_ENTRY'; end if;

  if safe_key is not null then
    select * into existing from public.finance_entries
    where idempotency_key = 'refund:' || original.id::text || ':' || safe_key
    limit 1;
    if existing.id is not null then return to_jsonb(existing); end if;
  end if;

  select coalesce(abs(sum(amount)), 0) into already_reversed
  from public.finance_entries
  where reversal_of = original.id and status = 'reversal' and active is true;
  remaining := greatest(round(original.amount::numeric, 2) - round(already_reversed, 2), 0);
  if remaining <= 0 then raise exception 'FINANCE_ENTRY_ALREADY_FULLY_REVERSED'; end if;
  if requested > remaining then raise exception 'REFUND_EXCEEDS_REMAINING_AMOUNT'; end if;

  insert into public.finance_entries (
    entry_date, type, amount, currency, title, description, category, payment_method,
    status, source_type, source_id, booking_request_id, booking_code_id, fixed_excursion_id,
    leaflet_id, gift_card_request_id, partner_commission_id, reversal_of, idempotency_key,
    recognized_at, active, created_by, updated_by
  ) values (
    p_entry_date, 'income', -requested, original.currency,
    'Refund - ' || coalesce(original.title, 'Payment'),
    nullif(left(trim(coalesce(p_reason, 'Refund / reversal')), 1000), ''),
    coalesce(original.category, 'booking_payment'),
    coalesce(nullif(trim(p_payment_method), ''), original.payment_method),
    'reversal', original.source_type, original.source_id, original.booking_request_id,
    original.booking_code_id, original.fixed_excursion_id, original.leaflet_id,
    original.gift_card_request_id, original.partner_commission_id, original.id,
    case when safe_key is null then null else 'refund:' || original.id::text || ':' || safe_key end,
    now_ts, true, auth.uid(), auth.uid()
  ) returning * into created;

  if requested >= remaining then
    update public.finance_entries
    set status = 'reversed', reversed_at = now_ts, updated_by = auth.uid(), updated_at = now_ts
    where id = original.id;
  end if;

  return to_jsonb(created);
end;
$$;

revoke all on function public.admin_reverse_finance_entry(uuid, numeric, date, text, text, text) from public, anon;
grant execute on function public.admin_reverse_finance_entry(uuid, numeric, date, text, text, text) to authenticated;

commit;
