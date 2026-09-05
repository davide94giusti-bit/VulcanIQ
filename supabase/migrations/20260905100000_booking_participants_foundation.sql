-- Phase 1 participant foundation only. Terms versions, acceptances and legal evidence
-- are deliberately outside this migration.

begin;

create table if not exists public.booking_participants (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.booking_requests(id) on delete restrict,
  full_name text not null,
  participant_type text not null,
  is_organizer boolean not null default false,
  guardian_participant_id uuid references public.booking_participants(id) on delete restrict,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_participants_full_name_check check (char_length(btrim(full_name)) between 1 and 120),
  constraint booking_participants_type_check check (participant_type in ('adult', 'minor')),
  constraint booking_participants_status_check check (status in ('active', 'removed')),
  constraint booking_participants_organizer_check check (not is_organizer or (participant_type = 'adult' and guardian_participant_id is null)),
  constraint booking_participants_adult_guardian_check check (participant_type <> 'adult' or guardian_participant_id is null),
  constraint booking_participants_not_self_guardian_check check (guardian_participant_id is null or guardian_participant_id <> id)
);

create unique index if not exists booking_participants_one_active_organizer_idx
  on public.booking_participants (booking_request_id)
  where is_organizer and status = 'active';

create index if not exists booking_participants_booking_idx
  on public.booking_participants (booking_request_id, status, created_at);

create index if not exists booking_participants_guardian_idx
  on public.booking_participants (guardian_participant_id)
  where guardian_participant_id is not null;

create or replace function public.validate_booking_participant()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  booking_status text;
  guardian_row public.booking_participants%rowtype;
begin
  new.full_name := btrim(new.full_name);

  if tg_op = 'UPDATE' and new.booking_request_id is distinct from old.booking_request_id then
    raise exception 'participant_booking_immutable';
  end if;

  select status into booking_status
  from public.booking_requests
  where id = new.booking_request_id;

  if booking_status is null then
    raise exception 'participant_booking_not_found';
  end if;
  if booking_status <> 'accepted' then
    raise exception 'participant_booking_not_confirmed';
  end if;

  if new.participant_type = 'minor' and new.status = 'active' then
    if new.guardian_participant_id is null then
      raise exception 'participant_guardian_required';
    end if;
    select * into guardian_row
    from public.booking_participants
    where id = new.guardian_participant_id;
    if not found
      or guardian_row.booking_request_id <> new.booking_request_id
      or guardian_row.participant_type <> 'adult'
      or guardian_row.status <> 'active' then
      raise exception 'participant_guardian_invalid';
    end if;
  end if;

  if tg_op = 'UPDATE'
    and (new.status = 'removed' or new.participant_type <> 'adult')
    and exists (
      select 1 from public.booking_participants dependent
      where dependent.guardian_participant_id = new.id
        and dependent.status = 'active'
    ) then
    raise exception 'participant_guardian_in_use';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_booking_participant() from public, anon, authenticated, service_role;

drop trigger if exists booking_participants_validate on public.booking_participants;
create trigger booking_participants_validate
before insert or update on public.booking_participants
for each row execute function public.validate_booking_participant();

drop trigger if exists booking_participants_set_updated_at on public.booking_participants;
create trigger booking_participants_set_updated_at
before update on public.booking_participants
for each row execute function public.set_updated_at();

create or replace function public.create_confirmed_booking_organizer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'accepted'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
    and char_length(btrim(coalesce(new.customer_name, ''))) between 1 and 120 then
    insert into public.booking_participants (
      booking_request_id, full_name, participant_type, is_organizer
    )
    values (new.id, btrim(new.customer_name), 'adult', true)
    on conflict (booking_request_id) where is_organizer and status = 'active' do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.create_confirmed_booking_organizer() from public, anon, authenticated, service_role;

drop trigger if exists booking_requests_create_confirmed_organizer on public.booking_requests;
create trigger booking_requests_create_confirmed_organizer
after insert or update of status on public.booking_requests
for each row execute function public.create_confirmed_booking_organizer();

alter table public.booking_participants enable row level security;

drop policy if exists "Admins can view booking participants" on public.booking_participants;
create policy "Admins can view booking participants"
on public.booking_participants
for select
to authenticated
using (public.is_admin());

revoke all privileges on table public.booking_participants from public, anon, authenticated, service_role;
grant select on table public.booking_participants to authenticated;
grant select, insert, update on table public.booking_participants to service_role;

comment on table public.booking_participants is
  'Named participants for accepted booking requests. Aggregate party counts remain canonical until details are completed. This table is not Terms acceptance evidence.';

commit;
