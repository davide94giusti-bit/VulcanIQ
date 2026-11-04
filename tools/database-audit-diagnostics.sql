-- Read-only, count-only diagnostics; no customer payloads and no historical repairs.
begin read only;
select status,type,currency,count(*) records from public.finance_entries group by status,type,currency order by status,type,currency;
select 'source_link_mismatch' finding,count(*) from public.finance_entries where
 (source_type='booking_request' and source_id is distinct from booking_request_id) or
 (source_type='booking_code' and source_id is distinct from booking_code_id) or
 (source_type='gift_card' and source_id is distinct from gift_card_request_id) or
 (source_type='partner_commission' and source_id is distinct from partner_commission_id);
select 'over_refunded' finding,count(*) from public.finance_entries original where
 (select coalesce(-sum(amount),0) from public.finance_entries reversal where reversal.reversal_of=original.id and reversal.active and reversal.status='reversal')>original.amount;
select 'orphan_active_booking_blocks' finding,count(*) from public.availability_blocks ab join public.booking_requests b on b.id=ab.booking_request_id where ab.active and b.status in ('cancelled','declined','archived');
select 'duplicate_expectation_sources' finding,count(*) from (select source_type,source_id from public.finance_entries where active and status in ('pending','expected') and source_id is not null group by source_type,source_id having count(*)>1) x;
select 'active_owner_count' finding,count(*) from public.admin_profiles where active and role='owner';
select schemaname,tablename,policyname,roles,cmd from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname;
select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename in ('site_media','site_content','customer_referral_codes') order by tablename,indexname;
rollback;
