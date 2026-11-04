-- Service-only, durable provider handoff fence. Existing unresolved logs are NOT replayed.
begin;
create table public.operational_email_deliveries (
  delivery_key text primary key check (delivery_key ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('claimed','sending','accepted','rejected','unknown')),
  attempt_token uuid not null default gen_random_uuid(),
  attempts integer not null default 1 check (attempts between 1 and 5),
  lease_until timestamptz not null default now() + interval '2 minutes',
  retry_after timestamptz,
  provider_message_id text,
  updated_at timestamptz not null default now()
);
alter table public.operational_email_deliveries enable row level security;
revoke all on public.operational_email_deliveries from public, anon, authenticated;
grant select on public.operational_email_deliveries to service_role;
create index operational_email_deliveries_status_lease_idx on public.operational_email_deliveries(status,lease_until);

insert into public.operational_email_deliveries(delivery_key,status)
select encode(extensions.digest('email:' || request_table || ':' || request_id::text || ':' || lower(recipient), 'sha256'),'hex'),
  case when status='sent' then 'accepted' else 'unknown' end
from public.request_notification_log where channel='email' on conflict do nothing;
insert into public.operational_email_deliveries(delivery_key,status)
select encode(extensions.digest('recap:' || id::text, 'sha256'),'hex'),
  case when status in ('sent','test') then 'accepted' else 'unknown' end
from public.admin_weekly_reports on conflict do nothing;

create function public.claim_operational_email(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.operational_email_deliveries%rowtype; fresh boolean := false;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden'; end if;
  insert into public.operational_email_deliveries(delivery_key,status) values(p_key,'claimed')
    on conflict do nothing returning true into fresh;
  select * into r from public.operational_email_deliveries where delivery_key=p_key for update;
  if coalesce(fresh,false) then return jsonb_build_object('status','claimed','attempt_token',r.attempt_token); end if;
  if r.status='sending' and r.lease_until < now() then
    update public.operational_email_deliveries set status='unknown',updated_at=now() where delivery_key=p_key;
    return jsonb_build_object('status','unknown');
  end if;
  if r.attempts < 5 and ((r.status='claimed' and r.lease_until < now()) or (r.status='rejected' and r.retry_after <= now())) then
    update public.operational_email_deliveries set status='claimed',attempt_token=gen_random_uuid(),attempts=attempts+1,lease_until=now()+interval '2 minutes',updated_at=now()
      where delivery_key=p_key returning * into r;
    return jsonb_build_object('status','claimed','attempt_token',r.attempt_token);
  end if;
  return jsonb_build_object('status',r.status);
end $$;

create function public.start_operational_email(p_key text,p_attempt uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden'; end if;
  update public.operational_email_deliveries set status='sending',updated_at=now()
    where delivery_key=p_key and attempt_token=p_attempt and status='claimed' and lease_until>now();
  return found;
end $$;

create function public.finish_operational_email(p_key text,p_attempt uuid,p_status text,p_provider_id text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden'; end if;
  if p_status not in ('accepted','unknown','rejected') then raise exception 'invalid_delivery_status'; end if;
  update public.operational_email_deliveries set status=p_status,provider_message_id=left(p_provider_id,180),
    retry_after=case when p_status='rejected' then now()+interval '1 hour' else null end,updated_at=now()
    where delivery_key=p_key and attempt_token=p_attempt and status='sending';
  return found;
end $$;
revoke all on function public.claim_operational_email(text), public.start_operational_email(text,uuid), public.finish_operational_email(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_operational_email(text), public.start_operational_email(text,uuid), public.finish_operational_email(text,uuid,text,text) to service_role;

-- New admin handoff outbox. Payload contains generic category/destination only, never customer PII.
create table public.admin_notification_handoffs (
  dedupe_key text primary key check (length(dedupe_key) between 10 and 180),
  category text not null check (category in ('new_bookings','booking_codes','gift_cards')),
  destination text not null check (destination in ('/admin/requests','/admin/booking-codes','/admin/gift-cards')),
  status text not null default 'pending' check (status in ('pending','processing','accepted','failed')),
  attempt_token uuid, attempts integer not null default 0,
  lease_until timestamptz, retry_after timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.admin_notification_handoffs enable row level security;
revoke all on public.admin_notification_handoffs from public,anon,authenticated;
grant select on public.admin_notification_handoffs to service_role;
create index admin_notification_handoffs_due_idx on public.admin_notification_handoffs(status,retry_after);

create function public.enqueue_admin_notification_handoff(p_key text,p_category text,p_destination text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden'; end if;
  if p_destination is distinct from (case p_category when 'new_bookings' then '/admin/requests' when 'booking_codes' then '/admin/booking-codes' when 'gift_cards' then '/admin/gift-cards' else null end) then raise exception 'invalid_handoff'; end if;
  insert into public.admin_notification_handoffs(dedupe_key,category,destination) values(p_key,p_category,p_destination) on conflict do nothing;
end $$;
create function public.claim_admin_notification_handoffs(p_limit integer default 10) returns setof public.admin_notification_handoffs
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden'; end if;
  update public.admin_notification_handoffs set status='failed',updated_at=now()
    where status='processing' and attempts>=5 and lease_until<now();
  -- Retrying a handoff is safe because D1 ingests its stable key before any external push.
  return query with due as (
    select h.dedupe_key from public.admin_notification_handoffs h
    where h.attempts<5 and ((h.status='pending' and h.retry_after<=now()) or (h.status='processing' and h.lease_until<now()))
    order by h.created_at,h.dedupe_key for update skip locked limit least(20,greatest(1,p_limit))
  ) update public.admin_notification_handoffs h set status='processing',attempt_token=gen_random_uuid(),attempts=h.attempts+1,lease_until=now()+interval '2 minutes',updated_at=now()
    from due where h.dedupe_key=due.dedupe_key returning h.*;
end $$;
create function public.finish_admin_notification_handoff(p_key text,p_attempt uuid,p_accepted boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden'; end if;
  update public.admin_notification_handoffs set status=case when p_accepted then 'accepted' when attempts>=5 then 'failed' else 'pending' end,
    retry_after=now()+interval '5 minutes'*attempts,updated_at=now()
    where dedupe_key=p_key and attempt_token=p_attempt and status='processing';
  return found;
end $$;
create function public.validate_admin_notification_handoff(p_key text,p_attempt uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden'; end if;
  return exists(select 1 from public.admin_notification_handoffs where dedupe_key=p_key and attempt_token=p_attempt and status='processing' and lease_until>now()+interval '15 seconds');
end $$;
revoke all on function public.enqueue_admin_notification_handoff(text,text,text),public.claim_admin_notification_handoffs(integer),public.finish_admin_notification_handoff(text,uuid,boolean),public.validate_admin_notification_handoff(text,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_admin_notification_handoff(text,text,text),public.claim_admin_notification_handoffs(integer),public.finish_admin_notification_handoff(text,uuid,boolean),public.validate_admin_notification_handoff(text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
