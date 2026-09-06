-- Phase 4 authoritative participant Terms reminder state.
-- The Worker submits only booking IDs already present in active D1 ownerships.
-- No Terms, invitations, acceptance evidence, or historical rows are mutated.

begin;

create or replace function public.get_participant_terms_reminder_states(
  p_booking_request_ids uuid[],
  p_locale text,
  p_as_of timestamptz default clock_timestamp()
)
returns table(
  booking_request_id uuid,
  booking_status text,
  lead_status text,
  terms_version_id uuid,
  terms_version text,
  terms_locale text,
  composition_complete boolean,
  required_participants integer,
  accepted_participants integer,
  outstanding_participants integer,
  state_changed_at timestamptz,
  state_revision text,
  reminder_required boolean,
  suppression_reason text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  evaluated_at timestamptz := coalesce(p_as_of, clock_timestamp());
begin
  if p_locale not in ('it', 'en') then
    raise exception 'participant_terms_reminder_locale_invalid';
  end if;
  if p_booking_request_ids is null
    or cardinality(p_booking_request_ids) < 1
    or cardinality(p_booking_request_ids) > 100 then
    raise exception 'participant_terms_reminder_batch_invalid';
  end if;

  return query
  with requested as (
    select distinct requested_id
    from unnest(p_booking_request_ids) requested_id
    where requested_id is not null
  ),
  current_version as (
    select version.id, version.version, version.locale,
      version.effective_at, version.published_at
    from public.terms_versions version
    where version.document_purpose = 'excursion_booking'
      and version.locale = p_locale
      and version.status = 'published'
      and version.effective_at <= evaluated_at
      and version.published_at <= evaluated_at
    order by version.effective_at desc, version.published_at desc, version.id desc
    limit 1
  ),
  participant_evidence as (
    select participant.booking_request_id,
      participant.id,
      participant.participant_type,
      participant.is_organizer,
      participant.guardian_participant_id,
      participant.updated_at,
      acceptance.accepted_at,
      acceptance.id is not null as accepted
    from public.booking_participants participant
    join requested on requested.requested_id = participant.booking_request_id
    left join current_version version on true
    left join lateral (
      select evidence.id, evidence.accepted_at
      from public.terms_acceptances evidence
      where evidence.booking_request_id = participant.booking_request_id
        and evidence.participant_id = participant.id
        and evidence.terms_version_id = version.id
        and evidence.document_purpose = 'excursion_booking'
        and evidence.actor_type = 'participant'
        and (
          (
            participant.participant_type = 'adult'
            and evidence.representation_type = 'self'
            and evidence.actor_participant_id = participant.id
          )
          or (
            participant.participant_type = 'minor'
            and evidence.representation_type = 'parent_or_guardian'
            and evidence.actor_participant_id is not null
          )
        )
      order by evidence.accepted_at asc, evidence.id asc
      limit 1
    ) acceptance on true
    where participant.status = 'active'
  ),
  participant_summary as (
    select evidence.booking_request_id,
      count(*)::integer as active_count,
      count(*) filter (where evidence.participant_type = 'adult')::integer as adult_count,
      count(*) filter (where evidence.participant_type = 'minor')::integer as minor_count,
      bool_or(evidence.participant_type = 'adult' and evidence.is_organizer) as organizer_present,
      count(*) filter (where evidence.accepted)::integer as accepted_count,
      max(evidence.updated_at) as participants_changed_at,
      max(evidence.accepted_at) as acceptances_changed_at,
      string_agg(
        evidence.id::text || ':' || evidence.participant_type || ':'
          || evidence.is_organizer::text || ':'
          || coalesce(evidence.guardian_participant_id::text, '-') || ':'
          || evidence.accepted::text,
        '|' order by evidence.id
      ) as participant_state
    from participant_evidence evidence
    group by evidence.booking_request_id
  ),
  evaluated as (
    select requested.requested_id,
      booking.status,
      booking.lead_status,
      version.id as version_id,
      version.version as version_label,
      version.locale as version_locale,
      coalesce(summary.active_count, 0) as active_count,
      coalesce(summary.adult_count, 0) as adult_count,
      coalesce(summary.minor_count, 0) as minor_count,
      coalesce(summary.organizer_present, false) as organizer_present,
      coalesce(summary.accepted_count, 0) as accepted_count,
      greatest(
        coalesce(booking.adults, 0) + coalesce(booking.children, 0),
        coalesce(summary.active_count, 0)
      )::integer as required_count,
      case when booking.id is null then null else greatest(
        coalesce(booking.confirmed_at, '-infinity'::timestamptz),
        coalesce(booking.decided_at, '-infinity'::timestamptz),
        coalesce(booking.updated_at, '-infinity'::timestamptz),
        coalesce(booking.created_at, '-infinity'::timestamptz),
        coalesce(version.effective_at, '-infinity'::timestamptz),
        coalesce(version.published_at, '-infinity'::timestamptz),
        coalesce(summary.participants_changed_at, '-infinity'::timestamptz),
        coalesce(summary.acceptances_changed_at, '-infinity'::timestamptz)
      ) end as changed_at,
      coalesce(summary.participant_state, '') as participant_state,
      booking.id is not null as booking_exists,
      (
        coalesce(summary.organizer_present, false)
        and coalesce(summary.adult_count, 0) = coalesce(booking.adults, 0)
        and coalesce(summary.minor_count, 0) = coalesce(booking.children, 0)
      ) as composition_matches
    from requested
    left join public.booking_requests booking on booking.id = requested.requested_id
    left join current_version version on true
    left join participant_summary summary on summary.booking_request_id = requested.requested_id
  )
  select evaluated.requested_id,
    evaluated.status,
    evaluated.lead_status,
    evaluated.version_id,
    evaluated.version_label,
    evaluated.version_locale,
    evaluated.composition_matches,
    evaluated.required_count,
    evaluated.accepted_count,
    greatest(0, evaluated.required_count - evaluated.accepted_count)::integer,
    evaluated.changed_at,
    case when evaluated.booking_exists then encode(extensions.digest(convert_to(
      concat_ws('|',
        evaluated.requested_id::text,
        coalesce(evaluated.status, '-'),
        coalesce(evaluated.lead_status, '-'),
        coalesce(evaluated.version_id::text, '-'),
        evaluated.composition_matches::text,
        evaluated.required_count::text,
        evaluated.accepted_count::text,
        evaluated.changed_at::text,
        evaluated.participant_state
      ), 'UTF8'), 'sha256'), 'hex') else null end,
    (
      evaluated.booking_exists
      and evaluated.status = 'accepted'
      and coalesce(evaluated.lead_status, '') not in ('completed', 'review_requested', 'review_received', 'lost', 'cancelled')
      and evaluated.version_id is not null
      and evaluated.composition_matches
      and evaluated.accepted_count < evaluated.required_count
    ),
    case
      when not evaluated.booking_exists then 'booking_not_found'
      when evaluated.status <> 'accepted'
        or coalesce(evaluated.lead_status, '') in ('completed', 'review_requested', 'review_received', 'lost', 'cancelled')
        then 'booking_closed'
      when evaluated.version_id is null then 'terms_unavailable'
      when not evaluated.composition_matches then 'composition_incomplete'
      when evaluated.accepted_count >= evaluated.required_count then 'complete'
      else 'outstanding'
    end
  from evaluated
  order by evaluated.requested_id;
end;
$$;

revoke all on function public.get_participant_terms_reminder_states(uuid[], text, timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.get_participant_terms_reminder_states(uuid[], text, timestamptz)
to service_role;

comment on function public.get_participant_terms_reminder_states(uuid[], text, timestamptz) is
  'Bounded, PII-free, service-role-only participant Terms completion state for notification scheduling. Read-only; evidence remains authoritative and immutable.';

commit;
