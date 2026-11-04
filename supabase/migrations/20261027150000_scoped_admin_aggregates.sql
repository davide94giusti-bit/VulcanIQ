begin;
-- These aggregates use the same filters as the keyset detail clients, never a sampled list.
create function public.get_admin_booking_counts(p_filters jsonb default '{}'::jsonb,p_today date default current_date)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; dates jsonb;
begin
  if not public.has_admin_role(array['owner','manager','guide','finance']) then raise exception 'BOOKING_ROLE_REQUIRED'; end if;
  with scoped as (
    select * from public.booking_requests b where
      (coalesce(p_filters->>'status','all') in ('','all') or b.status=p_filters->>'status')
      and (coalesce(p_filters->>'experience_id','all') in ('','all') or b.experience_id=p_filters->>'experience_id')
      and (coalesce(p_filters->>'source','all') in ('','all') or b.source=p_filters->>'source')
      and (nullif(p_filters->>'fromDate','') is null or b.requested_date>=(p_filters->>'fromDate')::date)
      and (nullif(p_filters->>'toDate','') is null or b.requested_date<=(p_filters->>'toDate')::date)
      and (nullif(btrim(p_filters->>'search'),'') is null or b.customer_name ilike '%'||replace(btrim(p_filters->>'search'),',',' ')||'%' or b.customer_email ilike '%'||replace(btrim(p_filters->>'search'),',',' ')||'%' or b.customer_phone ilike '%'||replace(btrim(p_filters->>'search'),',',' ')||'%')
  ), daily as (
    select requested_date as date,count(*) as total,count(*) filter(where status='pending') as pending,count(*) filter(where status='accepted') as accepted
    from scoped where requested_date is not null group by requested_date
  ) select jsonb_build_object('total',count(*),'pending_total',count(*) filter(where status='pending'),
      'pending_today',count(*) filter(where status='pending' and requested_date=p_today),
      'accepted_today',count(*) filter(where status='accepted' and requested_date=p_today),
      'upcoming_accepted',count(*) filter(where status='accepted' and requested_date>=p_today),
      'availability_today',(select count(*) from public.availability_blocks where active and date=p_today),
      'by_date',(select coalesce(jsonb_agg(to_jsonb(daily) order by date),'[]'::jsonb) from daily),'complete',true)
  into result from scoped;
  return result;
end $$;
revoke all on function public.get_admin_booking_counts(jsonb,date) from public,anon,service_role;
grant execute on function public.get_admin_booking_counts(jsonb,date) to authenticated;

create function public.get_admin_finance_summary(p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if not public.can_manage_finance() then raise exception 'FINANCE_ROLE_REQUIRED'; end if;
  with scoped as (
    select * from public.finance_entries f where
      (coalesce((p_filters->>'includeArchived')::boolean,false) or active)
      and (coalesce(p_filters->>'type','all') in ('','all') or f.type=p_filters->>'type')
      and (coalesce(p_filters->>'status','all') in ('','all') or f.status=p_filters->>'status')
      and (coalesce(p_filters->>'category','all') in ('','all') or f.category=p_filters->>'category')
      and (nullif(p_filters->>'fromDate','') is null or entry_date>=(p_filters->>'fromDate')::date)
      and (nullif(p_filters->>'toDate','') is null or entry_date<=(p_filters->>'toDate')::date)
      and (coalesce(p_filters->>'linked','all') not in ('linked','unlinked') or
        (num_nonnulls(source_id,booking_request_id,booking_code_id,fixed_excursion_id,leaflet_id,gift_card_request_id,partner_commission_id)>0)=(p_filters->>'linked'='linked'))
  ), amounts as (
    select currency,count(*) as record_count,
      coalesce(sum(amount) filter(where type='income' and status in ('confirmed','reversed','reversal')),0) as income,
      coalesce(sum(amount) filter(where type='expense' and status in ('confirmed','reversed','reversal')),0) as expense,
      coalesce(-sum(amount) filter(where type='income' and status='reversal'),0) as refunds,
      coalesce(sum(amount) filter(where type='income' and status in ('pending','expected')),0) as expected
    from scoped where active and status not in ('cancelled','void','voided') group by currency
  ) select jsonb_build_object('byCurrency',(select coalesce(jsonb_agg(to_jsonb(amounts) order by currency),'[]'::jsonb) from amounts),
    'record_count',(select count(*) from scoped),'complete',true) into result;
  return result;
end $$;
revoke all on function public.get_admin_finance_summary(jsonb) from public,anon,service_role;
grant execute on function public.get_admin_finance_summary(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
