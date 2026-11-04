-- Audit remediation. Forward only; no historical money/data reconciliation.
-- Deploy with the matching RPC-based client; old direct recognized-ledger writes fail closed.
begin;

create or replace function public.has_admin_role(p_roles text[])
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from public.admin_profiles where user_id=auth.uid() and active and role=any(p_roles)); $$;
revoke all on function public.has_admin_role(text[]) from public,anon;
grant execute on function public.has_admin_role(text[]) to authenticated;

create or replace function public.can_manage_finance()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select public.has_admin_role(array['owner','manager','finance']); $$;
revoke all on function public.can_manage_finance() from public,anon;
grant execute on function public.can_manage_finance() to authenticated;

-- Remove ALL earlier permissive policies on these protected relations: policies OR together.
do $$ declare p record; t text; begin
  foreach t in array array['finance_entries','partner_commissions','admin_profiles','activity_log'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I',p.policyname,t);
    end loop;
  end loop;
end $$;
create policy finance_read on public.finance_entries for select to authenticated using(public.can_manage_finance());
create policy finance_draft_insert on public.finance_entries for insert to authenticated with check(public.can_manage_finance() and status in ('pending','expected') and reversal_of is null);
create policy finance_draft_update on public.finance_entries for update to authenticated using(public.can_manage_finance() and status in ('pending','expected')) with check(public.can_manage_finance() and status in ('pending','expected','cancelled','void','voided'));
-- Creation (including manual drafts) uses trusted commands; service credentials cannot bypass
-- history protection by DELETE or fabricated linked expectations through PostgREST.
revoke insert,delete on public.finance_entries from authenticated;
revoke insert,update,delete on public.finance_entries from service_role;
create policy commissions_read on public.partner_commissions for select to authenticated using(public.can_manage_finance());
create policy commissions_create on public.partner_commissions for insert to authenticated with check(public.can_manage_finance() and status='pending');
create policy commissions_edit on public.partner_commissions for update to authenticated using(public.can_manage_finance() and status='pending') with check(public.can_manage_finance() and status in ('pending','cancelled'));
create policy profiles_read on public.admin_profiles for select to authenticated using(user_id=auth.uid() or public.is_owner());
create policy audit_read on public.activity_log for select to authenticated using(public.has_admin_role(array['owner','finance']));
revoke insert,update,delete on public.admin_profiles from authenticated,service_role;
revoke insert,update,delete on public.activity_log from authenticated;

-- No known private-bucket browser use exists. Trusted backup endpoints use service_role.
-- Unknown buckets receive NO new grant; live inventory remains a deployment prerequisite.
drop policy if exists "Privileged admins can read private vulcanIQ objects" on storage.objects;
drop policy if exists "Privileged admins can insert private vulcanIQ objects" on storage.objects;
drop policy if exists "Privileged admins can update private vulcanIQ objects" on storage.objects;
drop policy if exists "Privileged admins can delete private vulcanIQ objects" on storage.objects;

-- Browser calls now go through bounded/throttled Pages Functions. Public read RPCs stay public.
revoke execute on function public.redeem_booking_code(text,text),public.submit_public_review(text,text,text,integer,text),public.register_referral_click(text) from public,anon,authenticated;
grant execute on function public.redeem_booking_code(text,text),public.submit_public_review(text,text,text,integer,text),public.register_referral_click(text) to service_role;

-- New transaction receipts bind actor + operation + key to canonical payload and committed result.
create table public.admin_operation_receipts (
  actor_id uuid not null references auth.users(id), operation text not null,
  operation_key text not null check(length(operation_key) between 12 and 160),
  payload jsonb not null, result jsonb, created_at timestamptz not null default now(),
  primary key(actor_id,operation,operation_key)
);
alter table public.admin_operation_receipts enable row level security;
revoke all on public.admin_operation_receipts from public,anon,authenticated,service_role;

create function public.claim_admin_operation(p_operation text,p_key text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.admin_operation_receipts%rowtype;
begin
  if auth.uid() is null or p_key is null or length(p_key) not between 12 and 160 then raise exception 'OPERATION_KEY_REQUIRED'; end if;
  insert into public.admin_operation_receipts(actor_id,operation,operation_key,payload)
    values(auth.uid(),p_operation,p_key,p_payload) on conflict do nothing;
  select * into r from public.admin_operation_receipts where actor_id=auth.uid() and operation=p_operation and operation_key=p_key for update;
  if r.payload is distinct from p_payload then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
  return r.result;
end $$;
revoke all on function public.claim_admin_operation(text,text,jsonb) from public,anon,authenticated,service_role;

-- A SECURITY INVOKER trigger distinguishes direct DML from a reviewed definer command.
-- No caller-set GUC is used as an authorization bypass.
create function public.guard_finance_ledger() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user in ('anon','authenticated','service_role') then
    if tg_op='UPDATE' and (old.status not in ('pending','expected') or old.reversal_of is not null) then raise exception 'RECOGNIZED_LEDGER_IMMUTABLE'; end if;
    if new.status not in ('pending','expected','cancelled','void','voided') or new.reversal_of is not null or new.amount<0 then raise exception 'TRUSTED_FINANCE_COMMAND_REQUIRED'; end if;
    if tg_op='UPDATE' and (new.source_id,new.source_type,new.booking_request_id,new.booking_code_id,new.gift_card_request_id,new.partner_commission_id) is distinct from (old.source_id,old.source_type,old.booking_request_id,old.booking_code_id,old.gift_card_request_id,old.partner_commission_id) then raise exception 'FINANCE_SOURCE_IMMUTABLE'; end if;
    if tg_op='INSERT' then new.created_by:=auth.uid(); new.created_at:=now(); end if;
    new.updated_by:=auth.uid(); new.admin_confirmed_by:=null; new.admin_confirmed_at:=null; new.recognized_at:=null;
    new.updated_at:=now();
    if not new.active then new.archived_by:=auth.uid(); new.archived_at:=now(); end if;
  end if;
  if new.currency !~ '^[A-Z]{3}$' or new.amount::text in ('NaN','Infinity','-Infinity') then raise exception 'INVALID_FINANCE_VALUE'; end if;
  if (new.source_type='booking_request' and new.source_id is distinct from new.booking_request_id)
    or (new.source_type='booking_code' and new.source_id is distinct from new.booking_code_id)
    or (new.source_type='gift_card' and new.source_id is distinct from new.gift_card_request_id)
    or (new.source_type='partner_commission' and new.source_id is distinct from new.partner_commission_id)
  then raise exception 'FINANCE_SOURCE_LINK_MISMATCH'; end if;
  if (new.booking_code_id is not null and exists(select 1 from public.booking_codes where id=new.booking_code_id and currency<>new.currency))
    or (new.gift_card_request_id is not null and exists(select 1 from public.gift_card_requests where id=new.gift_card_request_id and currency<>new.currency))
  then raise exception 'PAYMENT_CURRENCY_MISMATCH'; end if;
  return new;
end $$;
create trigger finance_ledger_trusted_guard before insert or update on public.finance_entries for each row execute function public.guard_finance_ledger();
revoke all on function public.guard_finance_ledger() from public,anon,authenticated,service_role;

create function public.audit_business_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' and to_jsonb(new)-'updated_at' is not distinct from to_jsonb(old)-'updated_at' then return new; end if;
  insert into public.activity_log(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),lower(tg_op),tg_table_name,new.id,jsonb_build_object('trusted',true,'status',to_jsonb(new)->>'status','role',to_jsonb(new)->>'role'));
  return new;
end $$;
revoke all on function public.audit_business_change() from public,anon,authenticated,service_role;
create trigger finance_trusted_audit after insert or update on public.finance_entries for each row execute function public.audit_business_change();
create trigger profile_trusted_audit after insert or update on public.admin_profiles for each row execute function public.audit_business_change();
create trigger booking_trusted_audit after insert or update on public.booking_requests for each row execute function public.audit_business_change();
create trigger commission_trusted_audit after insert or update on public.partner_commissions for each row execute function public.audit_business_change();
create trigger code_trusted_audit after insert or update on public.booking_codes for each row execute function public.audit_business_change();
create trigger gift_trusted_audit after insert or update on public.gift_card_requests for each row execute function public.audit_business_change();
create trigger content_trusted_audit after insert or update on public.site_content for each row execute function public.audit_business_change();
create trigger media_trusted_audit after insert or update on public.site_media for each row execute function public.audit_business_change();

create function public.admin_update_admin_profile(p_user_id uuid,p_patch jsonb,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.admin_profiles%rowtype; next_role text; next_active boolean;
begin
  -- One global transaction lock prevents simultaneous removal of the two last owners.
  perform pg_advisory_xact_lock(27100001);
  if not public.is_owner() then raise exception 'OWNER_REQUIRED'; end if;
  select * into r from public.admin_profiles where user_id=p_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if p_expected_updated_at is not null and r.updated_at<>p_expected_updated_at then raise exception 'EDIT_CONFLICT'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or (p_patch - array['role','active','full_name','email'])<>'{}'::jsonb then raise exception 'INVALID_PROFILE_PATCH'; end if;
  next_role:=coalesce(p_patch->>'role',r.role); next_active:=coalesce((p_patch->>'active')::boolean,r.active);
  if next_role not in ('owner','manager','finance','guide','content_editor') then raise exception 'INVALID_ROLE'; end if;
  if r.role='owner' and r.active and (next_role<>'owner' or not next_active) and not exists(select 1 from public.admin_profiles where role='owner' and active and user_id<>p_user_id) then raise exception 'LAST_ACTIVE_OWNER'; end if;
  update public.admin_profiles set role=next_role,active=next_active,
    full_name=case when p_patch?'full_name' then left(p_patch->>'full_name',200) else full_name end,
    email=case when p_patch?'email' then left(p_patch->>'email',254) else email end
    where user_id=p_user_id returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.admin_update_admin_profile(uuid,jsonb,timestamptz) from public,anon,service_role;
grant execute on function public.admin_update_admin_profile(uuid,jsonb,timestamptz) to authenticated;

-- Generate 128-bit credentials on the trusted side, including Gift Card issuance.
-- Existing codes are never rewritten. Human-supplied short references cannot become credentials.
create function public.issue_secure_booking_code() returns trigger language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
  if tg_table_name='booking_codes' then
    if tg_op='INSERT' then new.code:='VUL-'||upper(encode(gen_random_bytes(16),'hex')); end if;
  elsif new.booking_code is not null and (tg_op='INSERT' or old.booking_code is null) then
    if new.source<>'booking_code' then new.booking_code:='VUL-'||upper(encode(gen_random_bytes(16),'hex')); end if;
  end if;
  return new;
end $$;
create trigger booking_code_secure_issue before insert on public.booking_codes for each row execute function public.issue_secure_booking_code();
create trigger booking_request_secure_issue before insert or update of booking_code on public.booking_requests for each row execute function public.issue_secure_booking_code();
revoke all on function public.issue_secure_booking_code() from public,anon,authenticated,service_role;

create function public.admin_record_booking_payment(p_source_type text,p_source_id uuid,p_amount numeric,p_currency text,p_entry_date date,p_payment_method text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.booking_requests%rowtype; c public.booking_codes%rowtype; pending public.finance_entries%rowtype; payment public.finance_entries%rowtype;
  partner public.partnerships%rowtype; receipt jsonb; v_result jsonb; paid numeric; agreed numeric; outstanding numeric; pending_count integer; commission_amount numeric;
  v_amount numeric:=round(p_amount,2); v_currency text:=upper(trim(p_currency)); v_method text:=trim(p_payment_method); request_id uuid;
begin
  if not public.can_manage_finance() then raise exception 'FINANCE_ROLE_REQUIRED'; end if;
  if p_source_type not in ('booking_request','booking_code') or p_source_id is null or v_amount is null or v_amount<=0 or v_amount::text in ('NaN','Infinity','-Infinity') or p_entry_date is null or v_currency!~'^[A-Z]{3}$' or coalesce(v_method,'')='' or length(v_method)>120 then raise exception 'INVALID_PAYMENT'; end if;
  receipt:=public.claim_admin_operation('booking_payment',p_idempotency_key,jsonb_build_object('source_type',p_source_type,'source_id',p_source_id,'amount',v_amount,'currency',v_currency,'date',p_entry_date,'method',v_method));
  if receipt is not null then return receipt; end if;
  -- Canonical source row serializes distinct payments and cancellation with this command.
  if p_source_type='booking_request' then
    select * into b from public.booking_requests where id=p_source_id for update;
    if b.id is null or b.source='booking_code' or b.status not in ('accepted','completed') then raise exception 'BOOKING_INCOME_NOT_ELIGIBLE'; end if;
    request_id:=b.id; agreed:=coalesce(b.quoted_amount,b.expected_value,0);
  else
    select * into c from public.booking_codes where id=p_source_id for update;
    if c.id is null or c.source='gift_card' or c.gift_card_request_id is not null or c.status='cancelled' or c.completion_status in ('cancelled','no_show') then raise exception 'BOOKING_INCOME_NOT_ELIGIBLE'; end if;
    if c.currency<>v_currency then raise exception 'PAYMENT_CURRENCY_MISMATCH'; end if;
    request_id:=c.redeemed_booking_request_id; agreed:=c.expected_amount;
  end if;
  perform id from public.finance_entries where (p_source_type='booking_request' and booking_request_id=p_source_id) or (p_source_type='booking_code' and (booking_code_id=p_source_id or (source_type=p_source_type and source_id=p_source_id))) order by id for update;
  if exists(select 1 from public.finance_entries where active and type='income' and status in ('expected','pending','confirmed','reversed','reversal') and ((p_source_type='booking_request' and booking_request_id=p_source_id) or (p_source_type='booking_code' and (booking_code_id=p_source_id or (source_type=p_source_type and source_id=p_source_id)))) and currency<>v_currency) then raise exception 'PAYMENT_CURRENCY_MISMATCH'; end if;
  select count(*) into pending_count from public.finance_entries where active and type='income' and status in ('pending','expected') and ((p_source_type='booking_request' and booking_request_id=p_source_id) or (p_source_type='booking_code' and (booking_code_id=p_source_id or (source_type=p_source_type and source_id=p_source_id))));
  if pending_count>1 then raise exception 'MULTIPLE_EXPECTATIONS_REQUIRE_RECONCILIATION'; end if;
  select * into pending from public.finance_entries where active and type='income' and status in ('pending','expected') and ((p_source_type='booking_request' and booking_request_id=p_source_id) or (p_source_type='booking_code' and (booking_code_id=p_source_id or (source_type=p_source_type and source_id=p_source_id))));
  select coalesce(sum(amount),0) into paid from public.finance_entries where active and type='income' and status in ('confirmed','reversed','reversal') and ((p_source_type='booking_request' and booking_request_id=p_source_id) or (p_source_type='booking_code' and (booking_code_id=p_source_id or (source_type=p_source_type and source_id=p_source_id))));
  agreed:=greatest(coalesce(agreed,0),paid+coalesce(pending.amount,0));
  outstanding:=greatest(agreed-paid-v_amount,0);
  if pending.id is not null then
    update public.finance_entries set amount=outstanding,status=case when outstanding>0 then 'expected' else 'cancelled' end,active=outstanding>0,updated_by=auth.uid() where id=pending.id;
  end if;
  insert into public.finance_entries(entry_date,type,amount,currency,title,category,payment_method,status,source_type,source_id,booking_request_id,booking_code_id,recognized_at,admin_confirmed_at,admin_confirmed_by,created_by,updated_by,idempotency_key)
    values(p_entry_date,'income',v_amount,v_currency,'Booking payment',case when p_source_type='booking_code' then 'booking_code_payment' else 'booking_payment' end,v_method,'confirmed',p_source_type,p_source_id,request_id,c.id,now(),now(),auth.uid(),auth.uid(),auth.uid(),'payment:'||auth.uid()::text||':'||p_idempotency_key) returning * into payment;
  paid:=paid+v_amount;
  if c.id is not null then
    update public.booking_codes set payment_status=case when paid<agreed then 'deposit_paid' else 'paid' end,income_status=case when paid<agreed then 'pending' else 'confirmed' end,admin_confirmed_income=paid>=agreed,income_confirmed_at=case when paid>=agreed then now() else null end,income_confirmed_by=auth.uid(),updated_by=auth.uid() where id=c.id returning * into c;
  end if;
  if b.partner_id is not null then
    select * into partner from public.partnerships where id=b.partner_id;
    if partner.active and partner.commission_enabled and partner.commission_type in ('percentage','fixed_amount') then
      if partner.commission_currency<>v_currency then raise exception 'COMMISSION_CURRENCY_MISMATCH'; end if;
      commission_amount:=round(case when partner.commission_type='percentage' then paid*least(partner.commission_value,100)/100 else partner.commission_value end,2);
      insert into public.partner_commissions(partner_id,source_type,source_id,booking_request_id,finance_entry_id,gross_amount,commission_type,commission_value,commission_amount,currency,status,created_by,updated_by)
        values(partner.id,'booking_request',b.id,b.id,payment.id,paid,partner.commission_type,partner.commission_value,commission_amount,v_currency,'pending',auth.uid(),auth.uid())
        on conflict(booking_request_id) where booking_request_id is not null do update set gross_amount=excluded.gross_amount,commission_amount=excluded.commission_amount,finance_entry_id=excluded.finance_entry_id,updated_by=auth.uid() where partner_commissions.status='pending';
    end if;
  end if;
  v_result:=jsonb_build_object('status','created_payment','entry',to_jsonb(payment),'code',case when c.id is not null then to_jsonb(c) else null end,'paid',paid,'balance',outstanding,'commissionWarning','');
  update public.admin_operation_receipts r set result=v_result where r.actor_id=auth.uid() and r.operation='booking_payment' and r.operation_key=p_idempotency_key;
  return v_result;
end $$;
revoke all on function public.admin_record_booking_payment(text,uuid,numeric,text,date,text,text) from public,anon,service_role;
grant execute on function public.admin_record_booking_payment(text,uuid,numeric,text,date,text,text) to authenticated;

-- Manual money has a separate namespace; linking to business sources must use source commands.
create function public.admin_create_finance_entry(p_payload jsonb,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.finance_entries%rowtype; receipt jsonb; v_result jsonb;
begin
  if not public.can_manage_finance() then raise exception 'FINANCE_ROLE_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or p_payload->>'type' not in ('income','expense') or coalesce(p_payload->>'status','confirmed') not in ('expected','pending','confirmed') or coalesce((p_payload->>'amount')::numeric,0)<=0 or coalesce(p_payload->>'currency','')!~'^[A-Z]{3}$' or nullif(trim(p_payload->>'title'),'') is null then raise exception 'INVALID_MANUAL_FINANCE'; end if;
  if coalesce(p_payload->>'source_type','manual') not in ('','manual') or exists(select 1 from jsonb_each(p_payload) e where e.key=any(array['source_id','booking_request_id','booking_code_id','gift_card_request_id','partner_commission_id','reversal_of']) and e.value<>'null'::jsonb and e.value<>'""'::jsonb) then raise exception 'USE_SOURCE_PAYMENT_COMMAND'; end if;
  receipt:=public.claim_admin_operation('manual_finance',p_idempotency_key,p_payload);
  if receipt is not null then return receipt; end if;
  insert into public.finance_entries(entry_date,type,amount,currency,title,description,category,payment_method,status,source_type,fixed_excursion_id,leaflet_id,recognized_at,created_by,updated_by,idempotency_key)
  values((p_payload->>'entry_date')::date,p_payload->>'type',round((p_payload->>'amount')::numeric,2),p_payload->>'currency',left(p_payload->>'title',300),left(p_payload->>'description',2500),left(p_payload->>'category',120),left(p_payload->>'payment_method',120),coalesce(p_payload->>'status','confirmed'),'manual',nullif(p_payload->>'fixed_excursion_id','')::uuid,nullif(p_payload->>'leaflet_id','')::uuid,case when coalesce(p_payload->>'status','confirmed')='confirmed' then now() else null end,auth.uid(),auth.uid(),'manual:'||auth.uid()::text||':'||p_idempotency_key) returning * into r;
  v_result:=to_jsonb(r);
  update public.admin_operation_receipts x set result=v_result where x.actor_id=auth.uid() and x.operation='manual_finance' and x.operation_key=p_idempotency_key;
  return v_result;
end $$;
revoke all on function public.admin_create_finance_entry(jsonb,text) from public,anon,service_role;
grant execute on function public.admin_create_finance_entry(jsonb,text) to authenticated;

-- Preserve historical refund implementation behind a stricter authorization/idempotency boundary.
alter function public.admin_reverse_finance_entry(uuid,numeric,date,text,text,text) rename to reverse_finance_entry_internal;
revoke all on function public.reverse_finance_entry_internal(uuid,numeric,date,text,text,text) from public,anon,authenticated,service_role;
create function public.admin_reverse_finance_entry(p_entry_id uuid,p_amount numeric,p_entry_date date,p_payment_method text default null,p_reason text default null,p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt jsonb; v_result jsonb;
begin
  if not public.can_manage_finance() then raise exception 'FINANCE_ROLE_REQUIRED'; end if;
  receipt:=public.claim_admin_operation('refund',p_idempotency_key,jsonb_build_object('entry',p_entry_id,'amount',round(p_amount,2),'date',p_entry_date,'method',p_payment_method,'reason',p_reason));
  if receipt is not null then return receipt; end if;
  v_result:=public.reverse_finance_entry_internal(p_entry_id,p_amount,p_entry_date,p_payment_method,p_reason,auth.uid()::text||':'||p_idempotency_key);
  update public.admin_operation_receipts x set result=v_result where x.actor_id=auth.uid() and x.operation='refund' and x.operation_key=p_idempotency_key;
  return v_result;
end $$;
revoke all on function public.admin_reverse_finance_entry(uuid,numeric,date,text,text,text) from public,anon,service_role;
grant execute on function public.admin_reverse_finance_entry(uuid,numeric,date,text,text,text) to authenticated;

alter function public.admin_update_partner_commission_status(uuid,text,text) rename to update_partner_commission_internal;
revoke all on function public.update_partner_commission_internal(uuid,text,text) from public,anon,authenticated,service_role;
create function public.admin_update_partner_commission_status(p_id uuid,p_status text,p_notes text default '') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.partner_commissions%rowtype;
begin
  if not public.can_manage_finance() then raise exception 'FINANCE_ROLE_REQUIRED'; end if;
  select * into r from public.partner_commissions where id=p_id for update;
  if not found then raise exception 'COMMISSION_NOT_FOUND'; end if;
  if r.status=p_status then return to_jsonb(r); end if;
  if not ((r.status='pending' and p_status in ('approved','cancelled')) or (r.status='approved' and p_status in ('paid','cancelled'))) then raise exception 'INVALID_COMMISSION_TRANSITION'; end if;
  return public.update_partner_commission_internal(p_id,p_status,p_notes);
end $$;
revoke all on function public.admin_update_partner_commission_status(uuid,text,text) from public,anon,service_role;
grant execute on function public.admin_update_partner_commission_status(uuid,text,text) to authenticated;

-- Paid cancellation is not a reimbursement. Explicit repayment policy remains owner approval.
-- Gift issuance requires actual payment or an owner-only explicit complimentary waiver.
alter table public.gift_card_requests add column issuance_waiver_reason text,add column issuance_waived_by uuid references auth.users(id),add column issuance_waived_at timestamptz;
alter function public.admin_update_gift_card_request(uuid,jsonb) rename to update_gift_card_internal;
revoke all on function public.update_gift_card_internal(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.admin_update_gift_card_request(p_id uuid,p_patch jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare gift public.gift_card_requests%rowtype; result jsonb; net_paid numeric;
begin
  if not public.can_manage_finance() then raise exception 'FINANCE_ROLE_REQUIRED'; end if;
  select * into gift from public.gift_card_requests where id=p_id for update;
  if not found then raise exception 'GIFT_CARD_NOT_FOUND'; end if;
  if nullif(p_patch->>'expected_updated_at','') is not null and (p_patch->>'expected_updated_at')::timestamptz<>gift.updated_at then raise exception 'EDIT_CONFLICT'; end if;
  if gift.status='cancelled' and coalesce(p_patch->>'status','cancelled')<>'cancelled' then raise exception 'CANCELLED_GIFT_CARD_FINAL'; end if;
  if gift.status in ('paid','issued') and p_patch?'status' and p_patch->>'status' not in ('paid','issued','cancelled') then raise exception 'INVALID_GIFT_CARD_TRANSITION'; end if;
  if gift.recipient_claimed_at is not null and p_patch?'status' and p_patch->>'status'<>gift.status then raise exception 'CLAIMED_GIFT_CARD_REQUIRES_RECONCILIATION'; end if;
  if p_patch->>'status'='issued' and gift.booking_code_id is null then
    select coalesce(sum(amount),0) into net_paid from public.finance_entries where gift_card_request_id=p_id and active and type='income' and status in ('confirmed','reversed','reversal') and currency=gift.currency;
    if net_paid<=0 then
      if not public.is_owner() or length(trim(coalesce(p_patch->>'issuance_waiver_reason','')))<8 then raise exception 'GIFT_ISSUANCE_PAYMENT_OR_OWNER_WAIVER_REQUIRED'; end if;
      update public.gift_card_requests set issuance_waiver_reason=left(trim(p_patch->>'issuance_waiver_reason'),500),issuance_waived_by=auth.uid(),issuance_waived_at=now() where id=p_id;
    end if;
  end if;
  result:=public.update_gift_card_internal(p_id,p_patch-'issuance_waiver_reason');
  if p_patch->>'status'='issued' and net_paid<=0 then update public.booking_codes set payment_status='waived' where gift_card_request_id=p_id; end if;
  if p_patch->>'status'='cancelled' then update public.booking_codes set status='cancelled',completion_status='cancelled',cancelled_at=now() where gift_card_request_id=p_id and status='unused'; end if;
  return result;
end $$;
revoke all on function public.admin_update_gift_card_request(uuid,jsonb) from public,anon,service_role;
grant execute on function public.admin_update_gift_card_request(uuid,jsonb) to authenticated;

-- Private operational records are available to active operational roles, not content editors.
do $$ declare p record; t text; allowed_roles text[]; begin
  foreach t in array array['booking_requests','booking_codes','gift_card_requests','availability_blocks','fixed_excursions','monthly_availability_leaflets','site_content','site_media','partnerships'] loop
    allowed_roles:=case when t='partnerships' then array['owner','manager','content_editor','finance'] when t in ('site_content','site_media','monthly_availability_leaflets') then array['owner','manager','content_editor'] when t='gift_card_requests' then array['owner','manager','finance'] else array['owner','manager','guide','finance'] end;
    for p in select policyname from pg_policies where schemaname='public' and tablename=t and ('authenticated'=any(roles::text[]) or 'public'=any(roles::text[])) loop
      execute format('drop policy %I on public.%I',p.policyname,t);
    end loop;
    execute format('create policy audit_role_read on public.%I for select to authenticated using(public.has_admin_role(%L::text[]))',t,allowed_roles);
    if t<>'gift_card_requests' then
      execute format('create policy audit_role_insert on public.%I for insert to authenticated with check(public.has_admin_role(%L::text[]))',t,allowed_roles);
      execute format('create policy audit_role_update on public.%I for update to authenticated using(public.has_admin_role(%L::text[])) with check(public.has_admin_role(%L::text[]))',t,allowed_roles,allowed_roles);
    end if;
  end loop;
end $$;

create function public.guard_partner_money() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user='authenticated' and not public.can_manage_finance() then
    if tg_op='INSERT' and (new.commission_enabled or new.commission_value<>0) then raise exception 'FINANCE_ROLE_REQUIRED'; end if;
    if tg_op='UPDATE' and (new.commission_enabled,new.commission_type,new.commission_value,new.commission_currency,new.commission_applies_to,new.commission_status) is distinct from (old.commission_enabled,old.commission_type,old.commission_value,old.commission_currency,old.commission_applies_to,old.commission_status) then raise exception 'FINANCE_ROLE_REQUIRED'; end if;
  end if;
  return new;
end $$;
create trigger partner_money_guard before insert or update on public.partnerships for each row execute function public.guard_partner_money();
revoke all on function public.guard_partner_money() from public,anon,authenticated,service_role;

create function public.guard_code_money() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user='authenticated' then
    if tg_op='INSERT' and new.expected_amount>0 and not public.can_manage_finance() then raise exception 'FINANCE_ROLE_REQUIRED'; end if;
    if tg_op='INSERT' and (new.payment_status<>'pending' or new.admin_confirmed_income or new.gift_card_request_id is not null) then raise exception 'TRUSTED_CODE_COMMAND_REQUIRED'; end if;
    if tg_op='UPDATE' and (new.payment_status,new.admin_confirmed_income,new.income_confirmed_at,new.income_confirmed_by,new.expected_amount,new.currency,new.source,new.gift_card_request_id,new.code) is distinct from (old.payment_status,old.admin_confirmed_income,old.income_confirmed_at,old.income_confirmed_by,old.expected_amount,old.currency,old.source,old.gift_card_request_id,old.code) then raise exception 'TRUSTED_CODE_COMMAND_REQUIRED'; end if;
  end if;
  return new;
end $$;
create trigger code_money_guard before insert or update on public.booking_codes for each row execute function public.guard_code_money();
revoke all on function public.guard_code_money() from public,anon,authenticated,service_role;

create function public.guard_booking_state() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user='authenticated' then
    if tg_op='INSERT' then new.created_by_admin:=auth.uid(); end if;
    if tg_op='UPDATE' then
      if (new.quoted_amount,new.expected_value) is distinct from (old.quoted_amount,old.expected_value) and not public.can_manage_finance() then raise exception 'FINANCE_ROLE_REQUIRED'; end if;
      if old.status in ('cancelled','declined','archived') and new.status<>old.status then raise exception 'CLOSED_BOOKING_REQUIRES_RECONCILIATION'; end if;
      if new.status<>old.status then new.decided_by:=auth.uid(); new.decided_at:=now(); end if;
    end if;
  end if;
  return new;
end $$;
create trigger booking_state_guard before insert or update on public.booking_requests for each row execute function public.guard_booking_state();
revoke all on function public.guard_booking_state() from public,anon,authenticated,service_role;

-- Existing outbox triggers run in the SAME transaction. Cancelled expectations are not refunds.
create function public.cascade_booking_cancellation() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if (tg_table_name='booking_requests' and new.status in ('cancelled','declined','archived')) or (tg_table_name='booking_codes' and (new.status='cancelled' or to_jsonb(new)->>'completion_status' in ('cancelled','no_show'))) then
    update public.finance_entries set status='cancelled',active=false,cancelled_at=now(),updated_by=auth.uid()
    where active and status in ('pending','expected') and ((tg_table_name='booking_requests' and booking_request_id=new.id) or (tg_table_name='booking_codes' and (booking_code_id=new.id or (source_type='booking_code' and source_id=new.id))));
    update public.partner_commissions set status='cancelled',cancelled_at=now(),updated_by=auth.uid()
    where status in ('pending','approved') and ((tg_table_name='booking_requests' and booking_request_id=new.id) or (tg_table_name='booking_codes' and booking_code_id=new.id));
    if tg_table_name='booking_requests' then
      update public.availability_blocks set active=false,archived_at=now(),updated_by=auth.uid() where booking_request_id=new.id and active;
    end if;
  end if;
  return new;
end $$;
create trigger booking_cancel_effects after update of status on public.booking_requests for each row execute function public.cascade_booking_cancellation();
create trigger code_cancel_effects after update of status,completion_status on public.booking_codes for each row execute function public.cascade_booking_cancellation();
revoke all on function public.cascade_booking_cancellation() from public,anon,authenticated,service_role;

create function public.admin_accept_booking(p_id uuid,p_mode text,p_note text,p_scope text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.booking_requests%rowtype; block public.availability_blocks%rowtype;
begin
  if not public.has_admin_role(array['owner','manager','guide']) then raise exception 'BOOKING_ROLE_REQUIRED'; end if;
  select * into b from public.booking_requests where id=p_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if b.status='accepted' then
    select * into block from public.availability_blocks where id=b.availability_block_id;
    return jsonb_build_object('request',to_jsonb(b),'block',case when block.id is null then null else to_jsonb(block) end,'availabilityError',null);
  end if;
  if b.status<>'pending' then raise exception 'BOOKING_NOT_PENDING'; end if;
  if p_expected_updated_at is not null and p_expected_updated_at<>b.updated_at then raise exception 'EDIT_CONFLICT'; end if;
  if p_mode not in ('accept-only','close-experience','close-global','limited') then raise exception 'INVALID_ACCEPT_MODE'; end if;
  if p_mode<>'accept-only' then
    if b.requested_date is null then raise exception 'BOOKING_DATE_REQUIRED'; end if;
    insert into public.availability_blocks(date,status,experience_id,reason_it,reason_en,internal_note,booking_request_id,created_by,updated_by)
    values(b.requested_date,case when p_mode='limited' then 'limited' else 'closed' end,case when p_mode='close-global' or (p_mode='limited' and p_scope='global') then null else nullif(b.experience_id,'unsure') end,'Disponibilità aggiornata','Availability updated',left(p_note,2500),b.id,auth.uid(),auth.uid()) returning * into block;
  end if;
  update public.booking_requests set status='accepted',booking_code=coalesce(booking_code,'issue'),decision_note=left(p_note,2500),decided_at=now(),decided_by=auth.uid(),availability_block_id=block.id where id=b.id returning * into b;
  return jsonb_build_object('request',to_jsonb(b),'block',case when block.id is null then null else to_jsonb(block) end,'availabilityError',null);
end $$;
revoke all on function public.admin_accept_booking(uuid,text,text,text,timestamptz) from public,anon,service_role;
grant execute on function public.admin_accept_booking(uuid,text,text,text,timestamptz) to authenticated;

create function public.admin_record_financial_audit(p_audit_id uuid,p_metadata jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare safe jsonb;
begin
  if not public.has_admin_role(array['owner','finance']) then raise exception 'AUDITOR_REQUIRED'; end if;
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into safe from jsonb_each(p_metadata) where key in ('schemaVersion','locale','format','from','to','recordCount','sourceCounts','evidenceChecksum','checksum');
  if safe?'sourceCounts' then
    if jsonb_typeof(safe->'sourceCounts')<>'object' or exists(select 1 from jsonb_each(safe->'sourceCounts') e where e.key not in ('bookingRequests','bookingCodes','giftCards','partnerCommissions','financeEntries') or jsonb_typeof(e.value)<>'number') then raise exception 'INVALID_SOURCE_COUNTS'; end if;
  end if;
  if exists(select 1 from jsonb_each(safe-'sourceCounts') e where jsonb_typeof(e.value) not in ('string','number','null') or length(e.value::text)>200) then raise exception 'INVALID_AUDIT_METADATA'; end if;
  if length(safe::text)>4000 then raise exception 'AUDIT_METADATA_TOO_LARGE'; end if;
  insert into public.activity_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'financial_audit_generated','financial_audit',p_audit_id,safe);
end $$;
revoke all on function public.admin_record_financial_audit(uuid,jsonb) from public,anon,service_role;
grant execute on function public.admin_record_financial_audit(uuid,jsonb) to authenticated;

-- Exact aggregate contract is independent of PostgREST row limits and detail pagination.
create function public.get_admin_finance_totals(p_from date default null,p_to date default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' and not public.can_manage_finance() then raise exception 'FINANCE_ROLE_REQUIRED'; end if;
  select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into result from (
    select currency,count(*) as record_count,
      coalesce(sum(amount) filter(where type='income' and status in ('confirmed','reversed','reversal')),0) as income,
      coalesce(sum(amount) filter(where type='expense' and status in ('confirmed','reversed','reversal')),0) as expense,
      coalesce(-sum(amount) filter(where type='income' and status='reversal'),0) as refunds,
      coalesce(sum(amount) filter(where type='income' and status in ('pending','expected')),0) as expected
    from public.finance_entries where active and status not in ('cancelled','void','voided') and (p_from is null or entry_date>=p_from) and (p_to is null or entry_date<=p_to) group by currency order by currency
  ) s;
  return jsonb_build_object('byCurrency',result,'complete',true);
end $$;
revoke all on function public.get_admin_finance_totals(date,date) from public,anon;
grant execute on function public.get_admin_finance_totals(date,date) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
