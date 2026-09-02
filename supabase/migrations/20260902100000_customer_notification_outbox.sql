-- Durable, PII-free publication state for owned customer notification journeys.
-- Business mutations enqueue here transactionally; Cloudflare Pages reconciles
-- the rows into the isolated notification D1 using a service-role credential.

begin;

create table if not exists public.customer_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null default 'booking_request'
    check (entity_type = 'booking_request'),
  entity_id uuid not null references public.booking_requests(id) on delete cascade,
  event_type text not null check (event_type in (
    'booking_confirmed',
    'payment_received',
    'operational_change',
    'booking_rescheduled',
    'booking_cancelled',
    'review_reminder'
  )),
  source_revision text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'delivered', 'suppressed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  processed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id, event_type, source_revision)
);

create index if not exists customer_notification_outbox_due_idx
  on public.customer_notification_outbox(status, next_attempt_at, created_at);

create index if not exists customer_notification_outbox_entity_idx
  on public.customer_notification_outbox(entity_type, entity_id, created_at desc);

alter table public.customer_notification_outbox enable row level security;
revoke all on table public.customer_notification_outbox from public, anon, authenticated;
grant select, insert, update on table public.customer_notification_outbox to service_role;

create or replace function public.enqueue_customer_notification_event(
  p_entity_id uuid,
  p_event_type text,
  p_source_revision text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_entity_id is null
    or p_event_type not in (
      'booking_confirmed', 'payment_received', 'operational_change',
      'booking_rescheduled', 'booking_cancelled', 'review_reminder'
    )
    or nullif(btrim(coalesce(p_source_revision, '')), '') is null
  then
    return;
  end if;

  insert into public.customer_notification_outbox (
    entity_type, entity_id, event_type, source_revision
  ) values (
    'booking_request', p_entity_id, p_event_type, left(p_source_revision, 240)
  )
  on conflict (entity_type, entity_id, event_type, source_revision) do nothing;
end;
$$;

revoke all on function public.enqueue_customer_notification_event(uuid, text, text)
from public, anon, authenticated, service_role;

create or replace function public.enqueue_booking_customer_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'accepted'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    perform public.enqueue_customer_notification_event(
      new.id,
      'booking_confirmed',
      concat_ws(':', coalesce(new.confirmed_at, new.decided_at, new.updated_at, now())::text, new.status)
    );
  end if;

  if tg_op = 'UPDATE'
    and new.requested_date is distinct from old.requested_date
    and coalesce(new.status, '') not in ('declined', 'cancelled')
    and coalesce(new.lead_status, '') not in ('cancelled', 'lost')
  then
    perform public.enqueue_customer_notification_event(
      new.id,
      'booking_rescheduled',
      concat_ws(':', coalesce(new.updated_at, now())::text, coalesce(new.requested_date::text, 'date-null'), coalesce(new.fixed_excursion_id::text, 'fixed-null'))
    );
  end if;

  if (new.status in ('declined', 'cancelled')
      and (tg_op = 'INSERT' or old.status is distinct from new.status))
    or (new.lead_status in ('cancelled', 'lost')
      and (tg_op = 'INSERT' or old.lead_status is distinct from new.lead_status))
  then
    perform public.enqueue_customer_notification_event(
      new.id,
      'booking_cancelled',
      concat_ws(':', coalesce(new.decided_at, new.updated_at, now())::text, coalesce(new.status, ''), coalesce(new.lead_status, ''))
    );
  end if;

  if new.review_requested_at is not null
    and (tg_op = 'INSERT' or old.review_requested_at is distinct from new.review_requested_at)
  then
    perform public.enqueue_customer_notification_event(
      new.id,
      'review_reminder',
      new.review_requested_at::text
    );
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_booking_customer_notifications()
from public, anon, authenticated, service_role;

drop trigger if exists booking_requests_customer_notification_outbox on public.booking_requests;
create trigger booking_requests_customer_notification_outbox
after insert or update of status, lead_status, requested_date, fixed_excursion_id, review_requested_at
on public.booking_requests
for each row execute function public.enqueue_booking_customer_notifications();

create or replace function public.enqueue_finance_customer_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_recognized boolean;
  was_recognized boolean := false;
begin
  is_recognized := new.booking_request_id is not null
    and new.type = 'income'
    and coalesce(new.active, true)
    and (
      lower(coalesce(new.status, '')) in ('received', 'paid', 'confirmed', 'recognized', 'completed')
      or new.recognized_at is not null
      or new.admin_confirmed_at is not null
    );

  if tg_op = 'UPDATE' then
    was_recognized := old.booking_request_id is not null
      and old.type = 'income'
      and coalesce(old.active, true)
      and (
        lower(coalesce(old.status, '')) in ('received', 'paid', 'confirmed', 'recognized', 'completed')
        or old.recognized_at is not null
        or old.admin_confirmed_at is not null
      );
  end if;

  if is_recognized and not was_recognized then
    perform public.enqueue_customer_notification_event(
      new.booking_request_id,
      'payment_received',
      concat_ws(':', new.id::text, coalesce(new.recognized_at, new.admin_confirmed_at, new.created_at, now())::text)
    );
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_finance_customer_notification()
from public, anon, authenticated, service_role;

drop trigger if exists finance_entries_customer_notification_outbox on public.finance_entries;
create trigger finance_entries_customer_notification_outbox
after insert or update of status, active, recognized_at, admin_confirmed_at, booking_request_id
on public.finance_entries
for each row execute function public.enqueue_finance_customer_notification();

create or replace function public.enqueue_fixed_excursion_customer_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  booking_row record;
begin
  if new.date is not distinct from old.date
    and new.start_time is not distinct from old.start_time
    and new.end_time is not distinct from old.end_time
    and new.meeting_point_it is not distinct from old.meeting_point_it
    and new.meeting_point_en is not distinct from old.meeting_point_en
    and new.meeting_point_maps_url is not distinct from old.meeting_point_maps_url
    and new.status is not distinct from old.status
    and new.active is not distinct from old.active
  then
    return new;
  end if;

  for booking_row in
    select br.id
    from public.booking_requests br
    where br.fixed_excursion_id = new.id
      and coalesce(br.status, '') not in ('declined', 'cancelled')
      and coalesce(br.lead_status, '') not in ('cancelled', 'lost')
  loop
    perform public.enqueue_customer_notification_event(
      booking_row.id,
      'operational_change',
      concat_ws(':', new.id::text, coalesce(new.updated_at, now())::text, new.date::text, coalesce(new.start_time::text, 'time-null'), coalesce(new.status, ''), new.active::text)
    );
  end loop;

  return new;
end;
$$;

revoke all on function public.enqueue_fixed_excursion_customer_notifications()
from public, anon, authenticated, service_role;

drop trigger if exists fixed_excursions_customer_notification_outbox on public.fixed_excursions;
create trigger fixed_excursions_customer_notification_outbox
after update of date, start_time, end_time, meeting_point_it, meeting_point_en,
  meeting_point_maps_url, status, active
on public.fixed_excursions
for each row execute function public.enqueue_fixed_excursion_customer_notifications();

notify pgrst, 'reload schema';

commit;
