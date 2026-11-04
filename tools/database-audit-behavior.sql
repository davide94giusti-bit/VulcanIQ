\set ON_ERROR_STOP on
-- Run ONLY in an explicitly disposable local database. All fixtures roll back.
begin;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','owner@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','guide@example.invalid'),
 ('10000000-0000-4000-8000-000000000003','finance@example.invalid'),
 ('10000000-0000-4000-8000-000000000004','content@example.invalid'),
 ('10000000-0000-4000-8000-000000000005','manager@example.invalid'),
 ('10000000-0000-4000-8000-000000000006','inactive@example.invalid'),
 ('10000000-0000-4000-8000-000000000007','ordinary@example.invalid');
alter table public.admin_profiles alter column full_name set default 'Synthetic test';
insert into public.admin_profiles(user_id,role,active) values
 ('10000000-0000-4000-8000-000000000001','owner',true),
 ('10000000-0000-4000-8000-000000000002','guide',true),
 ('10000000-0000-4000-8000-000000000003','finance',true),
 ('10000000-0000-4000-8000-000000000004','content_editor',true),
 ('10000000-0000-4000-8000-000000000005','manager',true),
 ('10000000-0000-4000-8000-000000000006','owner',false);
-- Actual DELETE probes are rolled back individually so every role sees the same evidence.
insert into public.analytics_events(id,event_name,path) values('b6000000-0000-4000-8000-000000000001','page_view','/synthetic-delete-authorization');
insert into public.analytics_sessions(id,session_id,visitor_id) values('b6000000-0000-4000-8000-000000000002','synthetic-delete-authorization','synthetic-visitor');
do $$ declare u record; t record; readable integer; deleted integer; failures text[]:=array[]::text[]; label text; begin
  for u in select * from (values
    ('guide','10000000-0000-4000-8000-000000000002',true),
    ('content_editor','10000000-0000-4000-8000-000000000004',true),
    ('owner','10000000-0000-4000-8000-000000000001',true),
    ('manager','10000000-0000-4000-8000-000000000005',true),
    ('finance','10000000-0000-4000-8000-000000000003',true),
    ('inactive','10000000-0000-4000-8000-000000000006',false),
    ('ordinary','10000000-0000-4000-8000-000000000007',false),
    ('anon','',false)
  ) roles(name,uid,can_read) loop
    perform set_config('request.jwt.claim.sub',u.uid,true);
    perform set_config('request.jwt.claim.role',case when u.name='anon' then 'anon' else 'authenticated' end,true);
    for t in select * from (values ('analytics_events','b6000000-0000-4000-8000-000000000001'),('analytics_sessions','b6000000-0000-4000-8000-000000000002')) tables(name,id) loop
      execute 'set local role '||case when u.name='anon' then 'anon' else 'authenticated' end;
      begin execute format('select count(*) from public.%I where id=%L::uuid',t.name,t.id) into readable;
      exception when insufficient_privilege then readable:=0; end;
      execute 'reset role';
      perform pg_temp.assert_true((readable=1)=u.can_read,'analytics read contract '||u.name||' '||t.name);
      deleted:=0;
      begin
        execute 'set local role '||case when u.name='anon' then 'anon' else 'authenticated' end;
        execute format('delete from public.%I where id=%L::uuid',t.name,t.id);
        get diagnostics deleted=row_count;
        raise exception using errcode='P9999',message='rollback_analytics_delete_probe';
      exception when sqlstate 'P9999' then null; when insufficient_privilege then deleted:=0; end;
      execute 'reset role';
      label:='browser analytics DELETE denied '||u.name||' '||t.name;
      if deleted>0 then failures:=array_append(failures,label); raise notice 'FAIL: %',label;
      else perform pg_temp.assert_true(true,label); end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  execute 'set local role service_role';
  for t in select * from (values ('analytics_events','b6000000-0000-4000-8000-000000000001'),('analytics_sessions','b6000000-0000-4000-8000-000000000002')) tables(name,id) loop
    execute format('select count(*) from public.%I where id=%L::uuid',t.name,t.id) into readable;
    perform pg_temp.assert_true(readable=1,'service maintenance analytics read preserved '||t.name);
    execute format('delete from public.%I where id=%L::uuid',t.name,t.id);
    get diagnostics deleted=row_count;
    perform pg_temp.assert_true(deleted=1,'service maintenance analytics DELETE preserved '||t.name);
  end loop;
  execute 'reset role';
  if cardinality(failures)>0 then raise exception 'ANALYTICS_DELETE_AUTHORIZATION_FAILURES: %',array_to_string(failures,'; '); end if;
end $$;
do $$ declare t text; begin
  foreach t in array array['analytics_events','analytics_sessions'] loop
    perform pg_temp.assert_true(
      not has_table_privilege('authenticated','public.'||t,'DELETE')
      and not has_table_privilege('anon','public.'||t,'DELETE')
      and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
        where n.nspname='public' and c.relname=t and acl.grantee=0 and acl.privilege_type='DELETE'),
      'analytics DELETE ACL absent for authenticated anon and PUBLIC '||t);
  end loop;
end $$;
insert into public.booking_requests(id,status,source,customer_name,quoted_amount,requested_date) values
 ('20000000-0000-4000-8000-000000000001','accepted','manual','Synthetic fixture',100,'2026-11-10'),
 ('20000000-0000-4000-8000-000000000002','pending','manual','Synthetic fixture',100,'2026-11-11');
insert into public.finance_entries(id,entry_date,type,amount,currency,title,status,booking_request_id,source_type,source_id) values
 ('30000000-0000-4000-8000-000000000001','2026-10-27','income',100,'EUR','Expectation','expected','20000000-0000-4000-8000-000000000001','booking_request','20000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

-- Inject the failure after the expectation UPDATE, at the payment INSERT boundary.
create function pg_temp.fail_payment() returns trigger language plpgsql as $$ begin if new.status='confirmed' then raise exception 'INJECTED_PAYMENT_FAILURE'; end if; return new; end $$;
create trigger test_fail_payment before insert on public.finance_entries for each row execute function pg_temp.fail_payment();
do $$ begin
  begin perform public.admin_record_booking_payment('booking_request','20000000-0000-4000-8000-000000000001',40,'EUR','2026-10-27','cash','payment-fixture-001'); raise exception 'Expected failure';
  exception when others then if sqlerrm<>'INJECTED_PAYMENT_FAILURE' then raise; end if; end;
end $$;
select pg_temp.assert_true((select amount=100 from public.finance_entries where id='30000000-0000-4000-8000-000000000001'),'failed payment rolls back expectation');
select pg_temp.assert_true((select count(*)=0 from public.admin_operation_receipts),'failed payment rolls back receipt');
drop trigger test_fail_payment on public.finance_entries;
set local role authenticated;
select public.admin_record_booking_payment('booking_request','20000000-0000-4000-8000-000000000001',40,'EUR','2026-10-27','cash','payment-fixture-001') is not null;
select public.admin_record_booking_payment('booking_request','20000000-0000-4000-8000-000000000001',40,'EUR','2026-10-27','cash','payment-fixture-001') is not null;
reset role;
select pg_temp.assert_true((select amount=60 from public.finance_entries where id='30000000-0000-4000-8000-000000000001'),'EUR100 minus exactly one EUR40 leaves EUR60');
select pg_temp.assert_true((select count(*)=1 from public.finance_entries where status='confirmed'),'same-key response-loss retry creates exactly one payment');
select pg_temp.assert_true((select count(*)=1 from public.activity_log where entity_type='finance_entries' and action='insert' and details->>'status'='confirmed'),'one committed payment audit');
do $$ begin
  begin perform public.admin_record_booking_payment('booking_request','20000000-0000-4000-8000-000000000001',41,'EUR','2026-10-27','cash','payment-fixture-001'); raise exception 'Expected conflict';
  exception when others then if sqlerrm<>'IDEMPOTENCY_PAYLOAD_CONFLICT' then raise; end if; end;
  perform pg_temp.assert_true(true,'same key different payload rejected');
  begin perform public.admin_record_booking_payment('booking_request','20000000-0000-4000-8000-000000000001',10,'USD','2026-10-27','cash','payment-fixture-002'); raise exception 'Expected currency failure';
  exception when others then if sqlerrm<>'PAYMENT_CURRENCY_MISMATCH' then raise; end if; end;
  perform pg_temp.assert_true(true,'cross-currency payment rejected');
end $$;
-- Role matrix exercises actual RLS and RPC authorization, not source string assertions.
insert into storage.buckets(id,name,public) values('audit-synthetic-private','audit-synthetic-private',false);
insert into storage.buckets(id,name,public) values('vulcaniq-public-assets','vulcaniq-public-assets',true) on conflict do nothing;
insert into storage.objects(bucket_id,name) values('audit-synthetic-private','fixture.txt'),('vulcaniq-public-assets','audit-fixture.txt');
do $$ declare u record; n integer; begin
  for u in select user_id,role,active from public.admin_profiles loop
    perform set_config('request.jwt.claim.sub',u.user_id::text,true);
    perform pg_temp.assert_true(public.can_manage_finance()=(u.active and u.role in ('owner','manager','finance')),'role predicate '||u.role||' active='||u.active);
    execute 'set local role authenticated';
    select count(*) into n from public.finance_entries;
    execute 'reset role';
    perform pg_temp.assert_true((n>0)=(u.active and u.role in ('owner','manager','finance')),'finance RLS '||u.role||' active='||u.active);
    execute 'set local role authenticated';
    select count(*) into n from storage.objects where bucket_id='audit-synthetic-private';
    execute 'reset role';
    perform pg_temp.assert_true(n=0,'unknown private bucket denied '||u.role||' active='||u.active);
  end loop;
end $$;
set local role anon;
select pg_temp.assert_true((select count(*)=1 from storage.objects where bucket_id='vulcaniq-public-assets' and name='audit-fixture.txt'),'anonymous published asset read preserved');
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000007',true);
select pg_temp.assert_true(not public.can_manage_finance(),'ordinary user denied');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare changed integer; begin
  update public.finance_entries set amount=1 where status='confirmed'; get diagnostics changed=row_count;
  perform pg_temp.assert_true(changed=0,'direct recognized-row edit denied by RLS');
  begin insert into public.finance_entries(entry_date,type,amount,currency,title,status,reversal_of) values(current_date,'income',-40,'EUR','forged','reversal','30000000-0000-4000-8000-000000000001'); raise exception 'Expected denial';
  exception when insufficient_privilege then null; when others then if sqlerrm not like '%TRUSTED_FINANCE_COMMAND_REQUIRED%' then raise; end if; end;
  perform pg_temp.assert_true(true,'forged reversal rejected');
  begin update public.admin_profiles set active=false where user_id=auth.uid(); raise exception 'Expected denial'; exception when insufficient_privilege then null; end;
  perform pg_temp.assert_true(true,'direct owner DML denied');
  begin perform public.admin_update_admin_profile(auth.uid(),'{"active":false}'); raise exception 'Expected owner guard'; exception when others then if sqlerrm<>'LAST_ACTIVE_OWNER' then raise; end if; end;
  perform pg_temp.assert_true(true,'last active owner protected');
  begin insert into public.activity_log(actor_id,action,entity_type) values(auth.uid(),'spoof','finance'); raise exception 'Expected denial'; exception when insufficient_privilege then null; end;
  perform pg_temp.assert_true(true,'direct audit spoofing denied');
end $$;
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.redeem_booking_code(text,text)','execute') and not has_function_privilege('authenticated','public.redeem_booking_code(text,text)','execute'),'direct public code mutation denied');
select pg_temp.assert_true(has_function_privilege('service_role','public.redeem_booking_code(text,text)','execute'),'trusted code boundary available');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.reverse_finance_entry_internal(uuid,numeric,date,text,text,text)','execute'),'internal refund helper not exposed');
select pg_temp.assert_true(not has_table_privilege('service_role','public.finance_entries','DELETE') and not has_table_privilege('service_role','public.finance_entries','INSERT') and not has_table_privilege('service_role','public.finance_entries','UPDATE'),'service role cannot directly rewrite recognized ledger');
select pg_temp.assert_true(not has_table_privilege('service_role','public.admin_profiles','UPDATE'),'service role cannot bypass last owner command');
set local role service_role;
do $$ begin
  begin delete from public.finance_entries where id='30000000-0000-4000-8000-000000000001'; raise exception 'Expected service delete denial'; exception when insufficient_privilege then null; end;
  perform pg_temp.assert_true(true,'actual service-role DELETE is rejected');
end $$;
reset role;

select public.admin_create_finance_entry('{"entry_date":"2026-10-27","type":"expense","amount":30,"currency":"EUR","title":"Synthetic expense"}', 'manual-expense-001') is not null;
select public.admin_create_finance_entry('{"entry_date":"2026-10-27","type":"expense","amount":30,"currency":"EUR","title":"Synthetic expense"}', 'manual-expense-001') is not null;
select pg_temp.assert_true((public.get_admin_finance_totals()->'byCurrency'->0->>'income')::numeric=40 and (public.get_admin_finance_totals()->'byCurrency'->0->>'expense')::numeric=30,'positive expense does not become revenue and manual intent dedupes');
select public.admin_accept_booking('20000000-0000-4000-8000-000000000002','close-global','test','global',null) is not null;
select pg_temp.assert_true((select booking_code~'^VUL-[0-9A-F]{32}$' and availability_block_id is not null from public.booking_requests where id='20000000-0000-4000-8000-000000000002'),'acceptance atomically creates secure code and linked block');
set local role authenticated;
update public.booking_requests set status='cancelled' where id='20000000-0000-4000-8000-000000000002';
update public.booking_requests set status='cancelled' where id='20000000-0000-4000-8000-000000000001';
reset role;
select pg_temp.assert_true(not exists(select 1 from public.availability_blocks where booking_request_id='20000000-0000-4000-8000-000000000002' and active),'cancellation clears linked active block');
select pg_temp.assert_true((select amount=40 and active from public.finance_entries where status='confirmed' and type='income'),'cancellation preserves received cash');
select pg_temp.assert_true((select status='cancelled' and not active from public.finance_entries where id='30000000-0000-4000-8000-000000000001'),'cancellation voids only expectation');
do $$ declare a text; b text; cid uuid; allowed boolean; begin
  foreach a in array array['pending','approved','paid','cancelled'] loop
    foreach b in array array['pending','approved','paid','cancelled'] loop
      insert into public.partner_commissions(source_type,commission_type,commission_amount,status) values('other','fixed_amount',10,a) returning id into cid;
      allowed:=(a=b or (a='pending' and b in ('approved','cancelled')) or (a='approved' and b in ('paid','cancelled')));
      begin
        perform public.admin_update_partner_commission_status(cid,b,'synthetic');
        if not allowed then raise exception 'Unexpected allowed transition'; end if;
      exception when others then
        if allowed or sqlerrm<>'INVALID_COMMISSION_TRANSITION' then raise; end if;
      end;
      perform pg_temp.assert_true(true,'commission '||a||' -> '||b);
    end loop;
  end loop;
end $$;
do $$ declare payment_id uuid; r jsonb; begin
  select id into payment_id from public.finance_entries where type='income' and status='confirmed';
  r:=public.admin_reverse_finance_entry(payment_id,20,'2026-10-27','cash','test','refund-fixture-001');
  perform public.admin_reverse_finance_entry(payment_id,20,'2026-10-27','cash','test','refund-fixture-001');
  perform pg_temp.assert_true((select count(*)=1 from public.finance_entries where reversal_of=payment_id),'refund retry dedupes');
  begin perform public.admin_reverse_finance_entry(payment_id,21,'2026-10-27','cash','test','refund-fixture-002'); raise exception 'Expected refund limit';
  exception when others then if sqlerrm<>'REFUND_EXCEEDS_REMAINING_AMOUNT' then raise; end if; end;
  perform pg_temp.assert_true(true,'refund above remaining balance rejected');
end $$;

do $$ declare gift_id uuid; result jsonb; before_count integer; begin
  insert into public.gift_card_requests(buyer_name,buyer_email,status) values('Synthetic gift','gift@example.invalid','new') returning id into gift_id;
  select count(*) into before_count from public.finance_entries;
  begin perform public.admin_update_gift_card_request(gift_id,'{"status":"issued"}'); raise exception 'Expected missing payment';
  exception when others then if sqlerrm<>'GIFT_ISSUANCE_PAYMENT_OR_OWNER_WAIVER_REQUIRED' then raise; end if; end;
  perform pg_temp.assert_true(true,'unpaid Gift Card cannot silently issue as paid');
  result:=public.admin_update_gift_card_request(gift_id,'{"status":"issued","issuance_waiver_reason":"Synthetic complimentary fixture"}');
  perform pg_temp.assert_true((select payment_status='waived' and code~'^VUL-[0-9A-F]{32}$' from public.booking_codes where gift_card_request_id=gift_id),'owner complimentary waiver is separate from payment');
  perform public.admin_update_gift_card_request(gift_id,'{"status":"issued"}');
  perform pg_temp.assert_true((select count(*)=1 from public.booking_codes where gift_card_request_id=gift_id),'repeated issuance creates exactly one voucher');
  perform pg_temp.assert_true((select count(*)=before_count from public.finance_entries),'complimentary issuance creates no revenue');
  perform public.admin_update_gift_card_request(gift_id,'{"status":"cancelled"}');
  perform pg_temp.assert_true((select status='cancelled' from public.booking_codes where gift_card_request_id=gift_id),'voiding an unused Gift Card blocks subsequent claim');
end $$;

-- Email fence tests use only SQL; no external providers can be called.
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare first_token uuid; second_token uuid; r jsonb; k text:=repeat('a',64); begin
  first_token:=(public.claim_operational_email(k)->>'attempt_token')::uuid;
  perform pg_temp.assert_true(first_token is not null,'email first claim owns attempt');
  perform pg_temp.assert_true(not(public.claim_operational_email(k)?'attempt_token'),'email active duplicate gets no lease');
  update public.operational_email_deliveries set lease_until=now()-interval '1 second' where delivery_key=k;
  second_token:=(public.claim_operational_email(k)->>'attempt_token')::uuid;
  perform pg_temp.assert_true(first_token<>second_token,'email stale presend claim rotates token');
  perform pg_temp.assert_true(not public.start_operational_email(k,first_token),'email stale sender cannot start');
  perform pg_temp.assert_true(public.start_operational_email(k,second_token),'email current attempt can start');
  perform pg_temp.assert_true(not public.finish_operational_email(k,first_token,'accepted'),'email stale sender cannot finalize');
  perform pg_temp.assert_true(public.finish_operational_email(k,second_token,'accepted'),'email current sender finalizes');
  update public.operational_email_deliveries set lease_until=now()-interval '10 days' where delivery_key=k;
  perform pg_temp.assert_true(not(public.claim_operational_email(k)?'attempt_token'),'accepted email never replays after provider window');
  k:=repeat('b',64); first_token:=(public.claim_operational_email(k)->>'attempt_token')::uuid;
  perform public.start_operational_email(k,first_token);
  update public.operational_email_deliveries set lease_until=now()-interval '1 second' where delivery_key=k;
  r:=public.claim_operational_email(k);
  perform pg_temp.assert_true(r->>'status'='unknown' and not(r?'attempt_token'),'expired in-flight email is unknown without resend');
end $$;
select pg_temp.assert_true(not has_function_privilege('anon','public.claim_operational_email(text)','execute') and not has_function_privilege('authenticated','public.claim_operational_email(text)','execute'),'email RPC denied to browser roles');
select pg_temp.assert_true(not has_function_privilege('anon','public.claim_customer_notification_outbox(integer,uuid,boolean)','execute') and not has_function_privilege('authenticated','public.claim_customer_notification_outbox(integer,uuid,boolean)','execute'),'customer outbox RPC denied to browser roles');

do $$ declare r public.customer_notification_outbox%rowtype; new_token uuid; begin
  select * into r from public.claim_customer_notification_outbox(1);
  perform pg_temp.assert_true(r.lease_token is not null,'outbox claimed with token');
  update public.customer_notification_outbox set lease_expires_at=now()-interval '1 second' where id=r.id;
  select lease_token into new_token from public.claim_customer_notification_outbox(1,r.id);
  perform pg_temp.assert_true(new_token<>r.lease_token,'outbox expired publication can be reclaimed');
  perform pg_temp.assert_true(not public.finish_customer_notification_outbox(r.id,r.lease_token,'delivered'),'outbox expired publisher cannot finalize new claim');
  perform pg_temp.assert_true(public.finish_customer_notification_outbox(r.id,new_token,'delivered'),'outbox current publisher finalizes');
  update public.customer_notification_outbox set status='processing',attempt_count=8,lease_token=new_token,lease_expires_at=now()-interval '1 second',processed_at=null where id=r.id;
  perform pg_temp.assert_true(not exists(select 1 from public.claim_customer_notification_outbox(1,r.id)),'exhausted eighth publication claim is never retried');
  perform pg_temp.assert_true((select status='failed' and last_error_code='publication_attempts_exhausted' and processed_at is not null and lease_token is null and lease_expires_at is null from public.customer_notification_outbox where id=r.id),'expired final outbox attempt becomes explicit terminal failure');
  perform pg_temp.assert_true(not public.finish_customer_notification_outbox(r.id,new_token,'delivered'),'exhausted outbox publisher cannot finalize after terminalization');
end $$;
do $$ declare first_token uuid; second_token uuid; begin
  perform public.enqueue_admin_notification_handoff('request:booking_requests:synthetic-fixture','new_bookings','/admin/requests');
  select attempt_token into first_token from public.claim_admin_notification_handoffs(1);
  update public.admin_notification_handoffs set lease_until=now()-interval '1 second' where dedupe_key='request:booking_requests:synthetic-fixture';
  select attempt_token into second_token from public.claim_admin_notification_handoffs(1);
  perform pg_temp.assert_true(first_token<>second_token,'admin handoff reclaim rotates lease');
  perform pg_temp.assert_true(not public.validate_admin_notification_handoff('request:booking_requests:synthetic-fixture',first_token) and public.validate_admin_notification_handoff('request:booking_requests:synthetic-fixture',second_token),'only current Admin handoff lease may initiate outbound work');
  perform pg_temp.assert_true(not public.finish_admin_notification_handoff('request:booking_requests:synthetic-fixture',first_token,true),'stale admin handoff cannot finalize');
  perform pg_temp.assert_true(public.finish_admin_notification_handoff('request:booking_requests:synthetic-fixture',second_token,true),'current admin handoff finalizes');
  perform public.enqueue_admin_notification_handoff('request:booking_requests:synthetic-fixture','new_bookings','/admin/requests');
  perform pg_temp.assert_true(not exists(select 1 from public.claim_admin_notification_handoffs(1)),'duplicate accepted admin handoff cannot replay');
end $$;

-- WhatsApp intent/events are never a canonical saved website request.
insert into public.analytics_events(event_name,path,section,occurred_at,metadata)
values('fast_request_submit_success','/','fast_request',now(),'{"channel":"whatsapp"}');
do $$ declare r jsonb; begin
  r:=public.get_admin_analytics_summary(now()-interval '1 hour',now()+interval '1 minute',false);
  perform pg_temp.assert_true((r#>>'{funnels,fast_request,submit_successes}')::integer=0,'WhatsApp intent without saved booking is not submission success');
  insert into public.booking_requests(status,source,source_section,source_cta,customer_name,booking_journey_version)
  values('pending','website','hero','book_now','Synthetic fast request','20261027-authoritative-website');
  r:=public.get_admin_analytics_summary(now()-interval '1 hour',now()+interval '1 minute',false);
  perform pg_temp.assert_true((r#>>'{funnels,fast_request,submit_successes}')::integer=1,'canonical current-version website fast request counts once');
  insert into public.booking_requests(status,source,source_section,source_cta,customer_name)
  values('pending','website','footer','book_now','Synthetic unversioned history');
  r:=public.get_admin_analytics_summary(now()-interval '1 hour',now()+interval '1 minute',false);
  perform pg_temp.assert_true((r#>>'{funnels,fast_request,submit_successes}')::integer=1 and (r#>>'{funnels,fast_request,legacy_database_requests}')::integer=1 and r#>>'{funnels,fast_request,coverage_status}'='mixed_history','unversioned history is preserved separately without inflated current success');
end $$;
select pg_temp.assert_true(not has_function_privilege('authenticated','public.get_admin_analytics_summary_legacy_internal(timestamptz,timestamptz,boolean)','execute') and not has_function_privilege('service_role','public.get_admin_analytics_summary_legacy_internal(timestamptz,timestamptz,boolean)','execute'),'legacy analytics bypass unavailable');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into public.booking_requests(id,status,source,customer_name,updated_at) values('20000000-0000-4000-8000-000000000003','pending','manual','Synthetic two-editor fixture','2000-01-01');
set local role authenticated;
do $$ declare old_version timestamptz; n integer; r jsonb; begin
  select updated_at into old_version from public.booking_requests where id='20000000-0000-4000-8000-000000000003';
  update public.booking_requests set admin_note='First editor' where id='20000000-0000-4000-8000-000000000003' and updated_at=old_version;
  get diagnostics n=row_count;
  perform pg_temp.assert_true(n=1,'first booking editor CAS succeeds');
  update public.booking_requests set admin_note='Stale editor' where id='20000000-0000-4000-8000-000000000003' and updated_at=old_version;
  get diagnostics n=row_count;
  perform pg_temp.assert_true(n=0 and (select admin_note='First editor' from public.booking_requests where id='20000000-0000-4000-8000-000000000003'),'stale second editor cannot overwrite first booking edit');
  r:=public.get_admin_booking_counts('{"status":"pending","source":"website"}',current_date);
  perform pg_temp.assert_true((r->>'total')::integer=2,'scoped request count matches canonical website pending rows');
  r:=public.get_admin_finance_summary('{"type":"expense","linked":"unlinked","fromDate":"2026-10-27","toDate":"2026-10-27"}');
  perform pg_temp.assert_true((r#>>'{byCurrency,0,income}')::numeric=0 and (r#>>'{byCurrency,0,expense}')::numeric=30 and r->>'complete'='true','filtered finance SQL preserves positive expense semantics');
end $$;
reset role;
insert into public.finance_entries(entry_date,type,amount,currency,title,status,active) values
 ('2026-10-27','income',100,'ZZZ','Synthetic archived','confirmed',false),
 ('2026-10-27','income',100,'ZZZ','Synthetic void','void',true);
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(public.get_admin_finance_summary('{"includeArchived":true}')->'byCurrency') x where x->>'currency'='ZZZ'),'archived and void income cannot affect money or create a currency bucket');
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(public.get_admin_finance_totals()->'byCurrency') x where x->>'currency'='ZZZ'),'weekly totals exclude archived and void currency buckets');
rollback;
