begin;
alter table public.customer_notification_outbox add column lease_token uuid;
alter table public.customer_notification_outbox add column lease_expires_at timestamptz;
create index customer_notification_outbox_lease_idx on public.customer_notification_outbox(status,lease_expires_at);

create function public.claim_customer_notification_outbox(p_limit integer default 5,p_id uuid default null,p_payment_only boolean default false)
returns setof public.customer_notification_outbox
language sql security definer set search_path = pg_catalog, public
as $$
  with exhausted as (
    select id from public.customer_notification_outbox
    where status='processing' and attempt_count>=8
      and coalesce(lease_expires_at,last_attempt_at+interval '5 minutes')<now()
      and (p_id is null or id=p_id) and (not p_payment_only or event_type='payment_received')
    order by created_at,id for update skip locked limit least(greatest(p_limit,1),5)
  ), terminalized as (
    -- A final pre-publication crash must become visible failure, not eternal processing.
    update public.customer_notification_outbox o set status='failed',
      last_error_code='publication_attempts_exhausted',processed_at=now(),updated_at=now(),
      lease_token=null,lease_expires_at=null
    from exhausted e where o.id=e.id returning o.id
  ), candidates as (
    select id from public.customer_notification_outbox
    where ((status in ('pending','failed') and next_attempt_at<=now())
       or (status='processing' and coalesce(lease_expires_at,last_attempt_at+interval '5 minutes')<now()))
      and attempt_count<8 and (p_id is null or id=p_id)
      and (not p_payment_only or event_type='payment_received')
    order by created_at,id for update skip locked limit least(greatest(p_limit,1),5)
  )
  update public.customer_notification_outbox o set status='processing',lease_token=gen_random_uuid(),
    lease_expires_at=now()+interval '2 minutes',last_attempt_at=now(),attempt_count=attempt_count+1,updated_at=now()
  from candidates c where o.id=c.id returning o.*;
$$;
create function public.finish_customer_notification_outbox(p_id uuid,p_token uuid,p_status text,p_error text default null)
returns boolean language plpgsql security definer set search_path=pg_catalog,public
as $$
declare changed integer;
begin
  if p_status not in ('delivered','suppressed','failed') then raise exception 'invalid_outbox_status'; end if;
  update public.customer_notification_outbox set status=p_status,
    processed_at=case when p_status='failed' then null else now() end,
    next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,least(attempt_count,6)))::integer),
    last_error_code=case when p_status='failed' then left(regexp_replace(coalesce(p_error,'processing_failed'),'[^a-zA-Z0-9:_-]','_','g'),120) else null end,
    updated_at=now(),lease_token=null,lease_expires_at=null
  where id=p_id and status='processing' and lease_token=p_token and lease_expires_at>now();
  get diagnostics changed=row_count; return changed=1;
end;
$$;
revoke all on function public.claim_customer_notification_outbox(integer,uuid,boolean) from public,anon,authenticated;
revoke all on function public.finish_customer_notification_outbox(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_customer_notification_outbox(integer,uuid,boolean) to service_role;
grant execute on function public.finish_customer_notification_outbox(uuid,uuid,text,text) to service_role;
comment on function public.claim_customer_notification_outbox(integer,uuid,boolean) is 'Backend-only bounded publication leases; D1 publication is idempotent. Does not send notifications.';
commit;
