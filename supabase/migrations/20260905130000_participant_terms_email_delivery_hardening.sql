-- Phase 3 evidentiary hardening. Additional-adult and non-organizer guardian
-- bearer credentials are delivered only by the trusted transactional email
-- function. No Terms version or acceptance evidence is created here.

begin;

alter table public.terms_acceptance_invitations
  alter column source_context set default 'participant_email_delivery';

alter table public.terms_acceptance_invitations
  drop constraint terms_acceptance_invitations_source_check,
  add constraint terms_acceptance_invitations_source_check
    check (source_context in ('owned_booking_copy_link', 'participant_email_delivery'));

alter table public.terms_acceptance_invitations
  drop constraint terms_acceptance_invitations_revocation_reason_check,
  add constraint terms_acceptance_invitations_revocation_reason_check
    check (revocation_reason is null or revocation_reason in ('superseded', 'manual', 'delivery_failed'));

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
    and new.revocation_reason not in ('superseded', 'manual', 'delivery_failed') then
    raise exception 'terms_invitation_revocation_invalid';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_terms_acceptance_invitation_lifecycle()
from public, anon, authenticated, service_role;

-- Any pre-hardening organizer-copyable capability is no longer sufficient for
-- personal-acceptance semantics. Production currently has no Terms/invitations,
-- so this is expected to be a no-op there while remaining safe elsewhere.
update public.terms_acceptance_invitations invitation
set revoked_at = clock_timestamp(),
    revocation_reason = 'manual'
where invitation.source_context = 'owned_booking_copy_link'
  and invitation.consumed_at is null
  and invitation.revoked_at is null;

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
    if actor_row.id is null or actor_row.is_organizer then
      raise exception 'terms_invitation_guardian_owned_flow_required';
    end if;
    invitation_representation := 'parent_or_guardian';
  else
    raise exception 'terms_invitation_participant_invalid';
  end if;

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
    'participant_email_delivery',
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

create or replace function public.revoke_failed_participant_terms_email_invitation(
  p_invitation_id uuid,
  p_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invitation_row public.terms_acceptance_invitations%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  select * into invitation_row
  from public.terms_acceptance_invitations invitation
  where invitation.id = p_invitation_id
    and invitation.token_hash = p_token_hash
    and invitation.source_context = 'participant_email_delivery'
  for update;

  if invitation_row.id is null
    or invitation_row.consumed_at is not null
    or invitation_row.revoked_at is not null then
    return false;
  end if;

  update public.terms_acceptance_invitations invitation
  set revoked_at = clock_timestamp(),
      revocation_reason = 'delivery_failed'
  where invitation.id = invitation_row.id
    and invitation.token_hash = p_token_hash
    and invitation.consumed_at is null
    and invitation.revoked_at is null;

  return found;
end;
$$;

revoke all on function public.revoke_failed_participant_terms_email_invitation(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.revoke_failed_participant_terms_email_invitation(uuid, text)
to service_role;

create or replace function public.record_owned_organizer_guardian_terms_acceptance(
  p_booking_request_id uuid,
  p_minor_participant_id uuid,
  p_guardian_participant_id uuid,
  p_terms_version_id uuid,
  p_locale text
)
returns setof public.terms_acceptances
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  booking_row public.booking_requests%rowtype;
  minor_row public.booking_participants%rowtype;
  guardian_row public.booking_participants%rowtype;
  version_row public.terms_versions%rowtype;
  acceptance_row public.terms_acceptances%rowtype;
  now_at timestamptz;
begin
  if p_locale not in ('it', 'en') then
    raise exception 'terms_locale_invalid';
  end if;

  select * into booking_row
  from public.booking_requests booking
  where booking.id = p_booking_request_id
  for update;
  if booking_row.id is null or booking_row.status <> 'accepted' then
    raise exception 'terms_booking_not_confirmed';
  end if;

  perform participant.id
  from public.booking_participants participant
  where participant.id in (p_minor_participant_id, p_guardian_participant_id)
  order by participant.id
  for update;

  select * into guardian_row
  from public.booking_participants participant
  where participant.id = p_guardian_participant_id
    and participant.booking_request_id = p_booking_request_id
    and participant.participant_type = 'adult'
    and participant.is_organizer = true
    and participant.status = 'active';
  if guardian_row.id is null then
    raise exception 'terms_guardian_invalid';
  end if;

  select * into minor_row
  from public.booking_participants participant
  where participant.id = p_minor_participant_id
    and participant.booking_request_id = p_booking_request_id
    and participant.participant_type = 'minor'
    and participant.status = 'active'
    and participant.guardian_participant_id = guardian_row.id;
  if minor_row.id is null then
    raise exception 'terms_guardian_relationship_invalid';
  end if;

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
  if version_row.id is null or version_row.id <> p_terms_version_id then
    raise exception 'terms_version_not_current';
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
    minor_row.id,
    guardian_row.id,
    'participant',
    guardian_row.full_name,
    'parent_or_guardian',
    version_row.locale,
    'owned_booking_guardian',
    now_at,
    now_at,
    now_at
  )
  on conflict (participant_id, terms_version_id, representation_type)
    where participant_id is not null
  do nothing
  returning * into acceptance_row;

  if acceptance_row.id is null then
    select * into acceptance_row
    from public.terms_acceptances acceptance
    where acceptance.participant_id = minor_row.id
      and acceptance.terms_version_id = version_row.id
      and acceptance.representation_type = 'parent_or_guardian';
  end if;

  return next acceptance_row;
end;
$$;

revoke all on function public.record_owned_organizer_guardian_terms_acceptance(uuid, uuid, uuid, uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.record_owned_organizer_guardian_terms_acceptance(uuid, uuid, uuid, uuid, text)
to service_role;

commit;
