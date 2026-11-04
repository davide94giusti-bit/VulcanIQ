-- Phase 3 participant Terms invitation infrastructure. This migration is
-- additive, publishes no Terms, and fabricates no acceptance evidence.

begin;

create table public.terms_acceptance_invitations (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.booking_requests(id) on delete restrict,
  participant_id uuid not null references public.booking_participants(id) on delete restrict,
  actor_participant_id uuid not null references public.booking_participants(id) on delete restrict,
  issued_by_participant_id uuid not null references public.booking_participants(id) on delete restrict,
  terms_version_id uuid not null references public.terms_versions(id) on delete restrict,
  representation_type text not null,
  token_hash text not null unique,
  locale text not null,
  source_context text not null default 'owned_booking_copy_link',
  issued_at timestamptz not null default transaction_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  consumed_terms_acceptance_id uuid unique references public.terms_acceptances(id) on delete restrict,
  created_at timestamptz not null default transaction_timestamp(),
  constraint terms_acceptance_invitations_representation_check
    check (representation_type in ('self', 'parent_or_guardian')),
  constraint terms_acceptance_invitations_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint terms_acceptance_invitations_locale_check
    check (locale in ('it', 'en')),
  constraint terms_acceptance_invitations_source_check
    check (source_context = 'owned_booking_copy_link'),
  constraint terms_acceptance_invitations_expiry_check
    check (expires_at > issued_at),
  constraint terms_acceptance_invitations_consumption_check
    check ((consumed_at is null) = (consumed_terms_acceptance_id is null)),
  constraint terms_acceptance_invitations_revocation_check
    check ((revoked_at is null) = (revocation_reason is null)),
  constraint terms_acceptance_invitations_revocation_reason_check
    check (revocation_reason is null or revocation_reason in ('superseded', 'manual')),
  constraint terms_acceptance_invitations_terminal_state_check
    check (consumed_at is null or revoked_at is null),
  constraint terms_acceptance_invitations_consumed_time_check
    check (consumed_at is null or consumed_at >= issued_at),
  constraint terms_acceptance_invitations_revoked_time_check
    check (revoked_at is null or revoked_at >= issued_at)
);

create unique index terms_acceptance_invitations_one_open_idx
  on public.terms_acceptance_invitations (
    booking_request_id,
    participant_id,
    terms_version_id
  )
  where consumed_at is null and revoked_at is null;

create index terms_acceptance_invitations_booking_idx
  on public.terms_acceptance_invitations (
    booking_request_id,
    participant_id,
    issued_at desc
  );

create index terms_acceptance_invitations_expiry_idx
  on public.terms_acceptance_invitations (expires_at)
  where consumed_at is null and revoked_at is null;

create or replace function public.protect_terms_acceptance_invitation_lifecycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'terms_invitation_history_immutable';
  end if;

  if row(
    new.booking_request_id,
    new.participant_id,
    new.actor_participant_id,
    new.issued_by_participant_id,
    new.terms_version_id,
    new.representation_type,
    new.token_hash,
    new.locale,
    new.source_context,
    new.issued_at,
    new.expires_at,
    new.created_at
  ) is distinct from row(
    old.booking_request_id,
    old.participant_id,
    old.actor_participant_id,
    old.issued_by_participant_id,
    old.terms_version_id,
    old.representation_type,
    old.token_hash,
    old.locale,
    old.source_context,
    old.issued_at,
    old.expires_at,
    old.created_at
  ) then
    raise exception 'terms_invitation_scope_immutable';
  end if;

  if old.consumed_at is not null and row(
    new.consumed_at,
    new.consumed_terms_acceptance_id,
    new.revoked_at,
    new.revocation_reason
  ) is distinct from row(
    old.consumed_at,
    old.consumed_terms_acceptance_id,
    old.revoked_at,
    old.revocation_reason
  ) then
    raise exception 'terms_invitation_consumption_immutable';
  end if;

  if old.revoked_at is not null and row(
    new.consumed_at,
    new.consumed_terms_acceptance_id,
    new.revoked_at,
    new.revocation_reason
  ) is distinct from row(
    old.consumed_at,
    old.consumed_terms_acceptance_id,
    old.revoked_at,
    old.revocation_reason
  ) then
    raise exception 'terms_invitation_revocation_immutable';
  end if;

  if new.consumed_at is not null and new.revoked_at is not null then
    raise exception 'terms_invitation_terminal_state_invalid';
  end if;

  if old.consumed_at is null and new.consumed_at is not null then
    if new.consumed_terms_acceptance_id is null or not exists (
      select 1
      from public.terms_acceptances acceptance
      where acceptance.id = new.consumed_terms_acceptance_id
        and acceptance.booking_request_id = new.booking_request_id
        and acceptance.participant_id = new.participant_id
        and acceptance.actor_participant_id = new.actor_participant_id
        and acceptance.terms_version_id = new.terms_version_id
        and acceptance.representation_type = new.representation_type
    ) then
      raise exception 'terms_invitation_acceptance_invalid';
    end if;
  end if;

  if old.revoked_at is null and new.revoked_at is not null
    and new.revocation_reason not in ('superseded', 'manual') then
    raise exception 'terms_invitation_revocation_invalid';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_terms_acceptance_invitation_lifecycle()
from public, anon, authenticated, service_role;

create trigger terms_acceptance_invitations_protect_lifecycle
before update or delete on public.terms_acceptance_invitations
for each row execute function public.protect_terms_acceptance_invitation_lifecycle();

create or replace function public.issue_participant_terms_acceptance_invitation(
  p_booking_request_id uuid,
  p_participant_id uuid,
  p_organizer_participant_id uuid,
  p_locale text,
  p_token_hash text
)
returns table(
  invitation_id uuid,
  terms_version_id uuid,
  terms_version text,
  locale text,
  representation_type text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  booking_row public.booking_requests%rowtype;
  target_row public.booking_participants%rowtype;
  actor_row public.booking_participants%rowtype;
  organizer_row public.booking_participants%rowtype;
  version_row public.terms_versions%rowtype;
  invitation_row public.terms_acceptance_invitations%rowtype;
  invitation_representation text;
  now_at timestamptz;
begin
  if p_locale not in ('it', 'en') then
    raise exception 'terms_invitation_locale_invalid';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'terms_invitation_token_invalid';
  end if;

  select * into booking_row
  from public.booking_requests booking
  where booking.id = p_booking_request_id
  for update;
  if booking_row.id is null or booking_row.status <> 'accepted' then
    raise exception 'terms_invitation_booking_ineligible';
  end if;

  perform participant.id
  from public.booking_participants participant
  where participant.id in (p_participant_id, p_organizer_participant_id)
  order by participant.id
  for update;

  select * into organizer_row
  from public.booking_participants participant
  where participant.id = p_organizer_participant_id
    and participant.booking_request_id = p_booking_request_id
    and participant.participant_type = 'adult'
    and participant.is_organizer = true
    and participant.status = 'active';
  if organizer_row.id is null then
    raise exception 'terms_invitation_organizer_invalid';
  end if;

  select * into target_row
  from public.booking_participants participant
  where participant.id = p_participant_id
    and participant.booking_request_id = p_booking_request_id
    and participant.status = 'active';
  if target_row.id is null or target_row.is_organizer then
    raise exception 'terms_invitation_participant_invalid';
  end if;

  if target_row.participant_type = 'adult' then
    actor_row := target_row;
    invitation_representation := 'self';
  elsif target_row.participant_type = 'minor' then
    if target_row.guardian_participant_id is null then
      raise exception 'terms_invitation_guardian_invalid';
    end if;
    select * into actor_row
    from public.booking_participants participant
    where participant.id = target_row.guardian_participant_id
      and participant.booking_request_id = p_booking_request_id
      and participant.participant_type = 'adult'
      and participant.status = 'active'
    for update;
    if actor_row.id is null then
      raise exception 'terms_invitation_guardian_invalid';
    end if;
    invitation_representation := 'parent_or_guardian';
  else
    raise exception 'terms_invitation_participant_invalid';
  end if;

  -- This wall-clock value is the issue linearization point after every
  -- authoritative booking/participant lock has been acquired.
  now_at := clock_timestamp();
  select * into version_row
  from public.terms_versions version
  where version.document_purpose = 'excursion_booking'
    and version.locale = p_locale
    and version.status = 'published'
    and version.effective_at <= now_at
    and version.published_at <= now_at
  order by version.effective_at desc, version.published_at desc, version.id desc
  limit 1;
  if version_row.id is null then
    raise exception 'terms_version_unavailable';
  end if;

  if exists (
    select 1
    from public.terms_acceptances acceptance
    where acceptance.booking_request_id = p_booking_request_id
      and acceptance.participant_id = target_row.id
      and acceptance.terms_version_id = version_row.id
      and acceptance.representation_type = invitation_representation
  ) then
    raise exception 'terms_participant_already_accepted';
  end if;

  update public.terms_acceptance_invitations invitation
  set revoked_at = now_at,
      revocation_reason = 'superseded'
  where invitation.booking_request_id = p_booking_request_id
    and invitation.participant_id = target_row.id
    and invitation.consumed_at is null
    and invitation.revoked_at is null;

  insert into public.terms_acceptance_invitations (
    booking_request_id,
    participant_id,
    actor_participant_id,
    issued_by_participant_id,
    terms_version_id,
    representation_type,
    token_hash,
    locale,
    source_context,
    issued_at,
    expires_at,
    created_at
  ) values (
    booking_row.id,
    target_row.id,
    actor_row.id,
    organizer_row.id,
    version_row.id,
    invitation_representation,
    p_token_hash,
    version_row.locale,
    'owned_booking_copy_link',
    now_at,
    now_at + interval '24 hours',
    now_at
  )
  returning * into invitation_row;

  return query select
    invitation_row.id,
    version_row.id,
    version_row.version,
    version_row.locale,
    invitation_row.representation_type,
    invitation_row.expires_at;
end;
$$;

revoke all on function public.issue_participant_terms_acceptance_invitation(uuid, uuid, uuid, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.issue_participant_terms_acceptance_invitation(uuid, uuid, uuid, text, text)
to service_role;

create or replace function public.revoke_participant_terms_acceptance_invitation(
  p_booking_request_id uuid,
  p_participant_id uuid,
  p_organizer_participant_id uuid
)
returns table(participant_id uuid, revoked_count integer, revoked_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  booking_row public.booking_requests%rowtype;
  target_row public.booking_participants%rowtype;
  organizer_row public.booking_participants%rowtype;
  revoked_at_value timestamptz;
  revoked_count_value integer := 0;
begin
  select * into booking_row
  from public.booking_requests booking
  where booking.id = p_booking_request_id
  for update;
  if booking_row.id is null then
    raise exception 'terms_invitation_unavailable';
  end if;

  perform participant.id
  from public.booking_participants participant
  where participant.id in (p_participant_id, p_organizer_participant_id)
  order by participant.id
  for update;

  select * into organizer_row
  from public.booking_participants participant
  where participant.id = p_organizer_participant_id
    and participant.booking_request_id = p_booking_request_id
    and participant.participant_type = 'adult'
    and participant.is_organizer = true
    and participant.status = 'active';
  if organizer_row.id is null then
    raise exception 'terms_invitation_organizer_invalid';
  end if;

  select * into target_row
  from public.booking_participants participant
  where participant.id = p_participant_id
    and participant.booking_request_id = p_booking_request_id;
  if target_row.id is null or target_row.is_organizer then
    raise exception 'terms_invitation_participant_invalid';
  end if;

  -- The booking and participant locks serialize this with issue/reissue. Lock
  -- every open row before the update so a preselected stale invitation ID is
  -- never required and a concurrent reissue cannot escape the revocation.
  perform invitation.id
  from public.terms_acceptance_invitations invitation
  where invitation.booking_request_id = booking_row.id
    and invitation.participant_id = target_row.id
    and invitation.consumed_at is null
    and invitation.revoked_at is null
  order by invitation.id
  for update;

  revoked_at_value := clock_timestamp();

  update public.terms_acceptance_invitations invitation
  set revoked_at = revoked_at_value,
      revocation_reason = 'manual'
  where invitation.booking_request_id = booking_row.id
    and invitation.participant_id = target_row.id
    and invitation.consumed_at is null
    and invitation.revoked_at is null;
  get diagnostics revoked_count_value = row_count;

  return query select
    target_row.id,
    revoked_count_value,
    case when revoked_count_value > 0 then revoked_at_value else null::timestamptz end;
end;
$$;

revoke all on function public.revoke_participant_terms_acceptance_invitation(uuid, uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.revoke_participant_terms_acceptance_invitation(uuid, uuid, uuid)
to service_role;

create or replace function public.resolve_participant_terms_acceptance_invitation(
  p_token_hash text
)
returns table(
  participant_name text,
  actor_name text,
  representation_type text,
  experience_id text,
  terms_version text,
  locale text,
  effective_at timestamptz,
  content_snapshot jsonb,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invitation_row public.terms_acceptance_invitations%rowtype;
  booking_row public.booking_requests%rowtype;
  target_row public.booking_participants%rowtype;
  actor_row public.booking_participants%rowtype;
  version_row public.terms_versions%rowtype;
  current_version_row public.terms_versions%rowtype;
  resolved_at timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'terms_invitation_unavailable';
  end if;

  resolved_at := clock_timestamp();

  select * into invitation_row
  from public.terms_acceptance_invitations invitation
  where invitation.token_hash = p_token_hash;
  if invitation_row.id is null
    or invitation_row.consumed_at is not null
    or invitation_row.revoked_at is not null
    or invitation_row.expires_at <= resolved_at then
    raise exception 'terms_invitation_unavailable';
  end if;

  select * into booking_row
  from public.booking_requests booking
  where booking.id = invitation_row.booking_request_id;
  select * into target_row
  from public.booking_participants participant
  where participant.id = invitation_row.participant_id;
  select * into actor_row
  from public.booking_participants participant
  where participant.id = invitation_row.actor_participant_id;
  select * into version_row
  from public.terms_versions version
  where version.id = invitation_row.terms_version_id
    and version.document_purpose = 'excursion_booking'
    and version.locale = invitation_row.locale
    and version.status = 'published'
    and version.effective_at <= resolved_at
    and version.published_at <= resolved_at;
  select * into current_version_row
  from public.terms_versions version
  where version.document_purpose = 'excursion_booking'
    and version.locale = invitation_row.locale
    and version.status = 'published'
    and version.effective_at <= resolved_at
    and version.published_at <= resolved_at
  order by version.effective_at desc, version.published_at desc, version.id desc
  limit 1;

  if booking_row.id is null
    or booking_row.status <> 'accepted'
    or target_row.id is null
    or target_row.booking_request_id <> booking_row.id
    or target_row.status <> 'active'
    or target_row.is_organizer
    or actor_row.id is null
    or actor_row.booking_request_id <> booking_row.id
    or actor_row.status <> 'active'
    or version_row.id is null
    or current_version_row.id is null
    or current_version_row.id <> version_row.id then
    raise exception 'terms_invitation_unavailable';
  end if;

  if invitation_row.representation_type = 'self' then
    if target_row.participant_type <> 'adult'
      or actor_row.id <> target_row.id then
      raise exception 'terms_invitation_unavailable';
    end if;
  elsif invitation_row.representation_type = 'parent_or_guardian' then
    if target_row.participant_type <> 'minor'
      or actor_row.participant_type <> 'adult'
      or target_row.guardian_participant_id <> actor_row.id then
      raise exception 'terms_invitation_unavailable';
    end if;
  else
    raise exception 'terms_invitation_unavailable';
  end if;

  return query select
    target_row.full_name,
    actor_row.full_name,
    invitation_row.representation_type,
    booking_row.experience_id,
    version_row.version,
    version_row.locale,
    version_row.effective_at,
    version_row.content_snapshot,
    invitation_row.expires_at;
end;
$$;

revoke all on function public.resolve_participant_terms_acceptance_invitation(text)
from public, anon, authenticated, service_role;
grant execute on function public.resolve_participant_terms_acceptance_invitation(text)
to service_role;

create or replace function public.accept_participant_terms_acceptance_invitation(
  p_token_hash text
)
returns table(
  participant_name text,
  actor_name text,
  representation_type text,
  terms_version text,
  locale text,
  accepted_at timestamptz,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  discovered_row public.terms_acceptance_invitations%rowtype;
  invitation_row public.terms_acceptance_invitations%rowtype;
  booking_row public.booking_requests%rowtype;
  target_row public.booking_participants%rowtype;
  actor_row public.booking_participants%rowtype;
  version_row public.terms_versions%rowtype;
  current_version_row public.terms_versions%rowtype;
  acceptance_row public.terms_acceptances%rowtype;
  acceptance_was_existing boolean := false;
  accepted_at_value timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'terms_invitation_unavailable';
  end if;

  -- Discovery is intentionally unlocked. Every fact is revalidated after the
  -- authoritative booking -> participant -> invitation lock order is acquired.
  select * into discovered_row
  from public.terms_acceptance_invitations invitation
  where invitation.token_hash = p_token_hash;
  if discovered_row.id is null then
    raise exception 'terms_invitation_unavailable';
  end if;

  select * into booking_row
  from public.booking_requests booking
  where booking.id = discovered_row.booking_request_id
  for update;
  if booking_row.id is null then
    raise exception 'terms_invitation_unavailable';
  end if;

  perform participant.id
  from public.booking_participants participant
  where participant.id in (
    discovered_row.participant_id,
    discovered_row.actor_participant_id
  )
  order by participant.id
  for update;

  select * into invitation_row
  from public.terms_acceptance_invitations invitation
  where invitation.id = discovered_row.id
    and invitation.token_hash = p_token_hash
    and invitation.booking_request_id = booking_row.id
    and invitation.participant_id = discovered_row.participant_id
    and invitation.actor_participant_id = discovered_row.actor_participant_id
    and invitation.terms_version_id = discovered_row.terms_version_id
  for update;
  if invitation_row.id is null or invitation_row.revoked_at is not null then
    raise exception 'terms_invitation_unavailable';
  end if;

  select * into target_row
  from public.booking_participants participant
  where participant.id = invitation_row.participant_id;
  select * into actor_row
  from public.booking_participants participant
  where participant.id = invitation_row.actor_participant_id;
  select * into version_row
  from public.terms_versions version
  where version.id = invitation_row.terms_version_id;

  if invitation_row.consumed_at is not null then
    select * into acceptance_row
    from public.terms_acceptances acceptance
    where acceptance.id = invitation_row.consumed_terms_acceptance_id
      and acceptance.booking_request_id = invitation_row.booking_request_id
      and acceptance.participant_id = invitation_row.participant_id
      and acceptance.actor_participant_id = invitation_row.actor_participant_id
      and acceptance.terms_version_id = invitation_row.terms_version_id
      and acceptance.representation_type = invitation_row.representation_type;
    if acceptance_row.id is null or target_row.id is null or actor_row.id is null or version_row.id is null then
      raise exception 'terms_invitation_unavailable';
    end if;
    return query select
      target_row.full_name,
      actor_row.full_name,
      invitation_row.representation_type,
      version_row.version,
      acceptance_row.locale,
      acceptance_row.accepted_at,
      true;
    return;
  end if;

  -- Use one wall-clock value captured after all authoritative locks. PostgreSQL
  -- transaction_timestamp() can predate an invitation created by a transaction
  -- that acquired the booking lock first.
  accepted_at_value := clock_timestamp();

  if invitation_row.expires_at <= accepted_at_value
    or booking_row.status <> 'accepted'
    or target_row.id is null
    or target_row.booking_request_id <> booking_row.id
    or target_row.status <> 'active'
    or target_row.is_organizer
    or actor_row.id is null
    or actor_row.booking_request_id <> booking_row.id
    or actor_row.status <> 'active'
    or version_row.id is null
    or version_row.document_purpose <> 'excursion_booking'
    or version_row.locale <> invitation_row.locale
    or version_row.status <> 'published'
    or version_row.effective_at > accepted_at_value
    or version_row.published_at > accepted_at_value then
    raise exception 'terms_invitation_unavailable';
  end if;

  select * into current_version_row
  from public.terms_versions version
  where version.document_purpose = 'excursion_booking'
    and version.locale = invitation_row.locale
    and version.status = 'published'
    and version.effective_at <= accepted_at_value
    and version.published_at <= accepted_at_value
  order by version.effective_at desc, version.published_at desc, version.id desc
  limit 1;
  if current_version_row.id is null or current_version_row.id <> version_row.id then
    raise exception 'terms_invitation_version_superseded';
  end if;

  if invitation_row.representation_type = 'self' then
    if target_row.participant_type <> 'adult'
      or actor_row.id <> target_row.id then
      raise exception 'terms_invitation_unavailable';
    end if;
  elsif invitation_row.representation_type = 'parent_or_guardian' then
    if target_row.participant_type <> 'minor'
      or actor_row.participant_type <> 'adult'
      or target_row.guardian_participant_id <> actor_row.id then
      raise exception 'terms_invitation_unavailable';
    end if;
  else
    raise exception 'terms_invitation_unavailable';
  end if;

  insert into public.terms_acceptances (
    terms_version_id,
    terms_content_sha256,
    document_purpose,
    booking_request_id,
    participant_id,
    actor_participant_id,
    actor_type,
    actor_name_snapshot,
    representation_type,
    locale,
    source_context,
    privacy_notice_provided_at,
    accepted_at,
    created_at
  ) values (
    version_row.id,
    version_row.content_sha256,
    version_row.document_purpose,
    booking_row.id,
    target_row.id,
    actor_row.id,
    'participant',
    actor_row.full_name,
    invitation_row.representation_type,
    version_row.locale,
    'participant_invitation',
    accepted_at_value,
    accepted_at_value,
    accepted_at_value
  )
  on conflict do nothing
  returning * into acceptance_row;

  if acceptance_row.id is null then
    acceptance_was_existing := true;
    select * into acceptance_row
    from public.terms_acceptances acceptance
    where acceptance.booking_request_id = booking_row.id
      and acceptance.participant_id = target_row.id
      and acceptance.actor_participant_id = actor_row.id
      and acceptance.terms_version_id = version_row.id
      and acceptance.representation_type = invitation_row.representation_type;
  end if;
  if acceptance_row.id is null then
    raise exception 'terms_acceptance_not_recorded';
  end if;

  update public.terms_acceptance_invitations invitation
  set consumed_at = accepted_at_value,
      consumed_terms_acceptance_id = acceptance_row.id
  where invitation.id = invitation_row.id
    and invitation.consumed_at is null
    and invitation.revoked_at is null
  returning * into invitation_row;
  if invitation_row.consumed_at is null then
    raise exception 'terms_invitation_not_consumed';
  end if;

  return query select
    target_row.full_name,
    actor_row.full_name,
    invitation_row.representation_type,
    version_row.version,
    acceptance_row.locale,
    acceptance_row.accepted_at,
    acceptance_was_existing;
end;
$$;

revoke all on function public.accept_participant_terms_acceptance_invitation(text)
from public, anon, authenticated, service_role;
grant execute on function public.accept_participant_terms_acceptance_invitation(text)
to service_role;

alter table public.terms_acceptance_invitations enable row level security;

create policy "Admins can view Terms acceptance invitations"
on public.terms_acceptance_invitations
for select
to authenticated
using (public.is_admin());

revoke all privileges on table public.terms_acceptance_invitations
from public, anon, authenticated, service_role;
grant select (
  booking_request_id,
  participant_id,
  actor_participant_id,
  terms_version_id,
  representation_type,
  locale,
  issued_at,
  expires_at,
  consumed_at,
  revoked_at,
  revocation_reason
) on public.terms_acceptance_invitations to authenticated;
grant select on table public.terms_acceptance_invitations to service_role;

comment on table public.terms_acceptance_invitations is
  'Hashed, participant-scoped, version-bound Terms invitations. Lifecycle history is retained; raw bearer tokens and destination PII are never stored.';

commit;
