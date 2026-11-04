\set ON_ERROR_STOP on
begin;
do $$ declare r jsonb; begin
  if not exists(select 1 from public.finance_entries where id='90000000-0000-4000-8000-000000000002' and amount=100 and status='expected') then raise exception 'Historical expectation changed'; end if;
  raise notice 'PASS: upgrade preserves historical expectation';
  if not exists(select 1 from public.booking_codes where id='90000000-0000-4000-8000-000000000004' and code='GIFT-LEGACY-TEST' and experience_id='gift-card') then raise exception 'Historical code rewritten'; end if;
  raise notice 'PASS: upgrade preserves legacy credential and marker';
  perform set_config('request.jwt.claim.role','service_role',true);
  r:=public.redeem_gift_card_booking_code('GIFT-LEGACY-TEST','Synthetic recipient','recipient@example.invalid',null,'en');
  if r->>'ok'<>'true' then raise exception 'Legacy gift claim failed: %',r->>'error'; end if;
  if exists(select 1 from public.finance_entries where gift_card_request_id='90000000-0000-4000-8000-000000000003') then raise exception 'Gift claim created revenue'; end if;
  raise notice 'PASS: legacy Gift Card claim remains compatible without new finance';
end $$;
rollback;
-- Remove only these synthetic upgrade fixtures before the general rollback suite.
begin;
delete from public.finance_entries where id='90000000-0000-4000-8000-000000000002';
update public.gift_card_requests set booking_code_id=null where id='90000000-0000-4000-8000-000000000003';
delete from public.booking_codes where id='90000000-0000-4000-8000-000000000004';
delete from public.gift_card_requests where id='90000000-0000-4000-8000-000000000003';
delete from public.booking_requests where id='90000000-0000-4000-8000-000000000001';
delete from public.activity_log where entity_id in ('90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000004');
commit;
