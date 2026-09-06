-- Local-only Phase 4 authoritative reminder-state validation.
-- Run after a fresh local reset. Every fixture is removed by ROLLBACK.

begin;

do $$
declare
  eligible_booking uuid := '41000000-0000-4000-8000-000000000001';
  complete_booking uuid := '41000000-0000-4000-8000-000000000002';
  cancelled_booking uuid := '41000000-0000-4000-8000-000000000003';
  archived_booking uuid := '41000000-0000-4000-8000-000000000004';
  incomplete_booking uuid := '41000000-0000-4000-8000-000000000005';
  eligible_organizer uuid := '42000000-0000-4000-8000-000000000001';
  eligible_adult uuid := '42000000-0000-4000-8000-000000000002';
  complete_organizer uuid := '42000000-0000-4000-8000-000000000003';
  cancelled_organizer uuid := '42000000-0000-4000-8000-000000000004';
  archived_organizer uuid := '42000000-0000-4000-8000-000000000005';
  incomplete_organizer uuid := '42000000-0000-4000-8000-000000000006';
  version_id uuid := '43000000-0000-4000-8000-000000000001';
  version_hash text;
  eligible_revision text;
  state record;
  evidence_before integer;
begin
  if has_function_privilege('anon', 'public.get_participant_terms_reminder_states(uuid[],text,timestamptz)', 'execute')
    or has_function_privilege('authenticated', 'public.get_participant_terms_reminder_states(uuid[],text,timestamptz)', 'execute')
    or not has_function_privilege('service_role', 'public.get_participant_terms_reminder_states(uuid[],text,timestamptz)', 'execute') then
    raise exception 'participant_terms_automation_privilege_failure';
  end if;

  insert into public.booking_requests (
    id, status, request_type, source, language, experience_id, adults, children,
    confirmed_at, created_at, updated_at
  ) values
    (eligible_booking, 'accepted', 'private', 'website', 'en', 'etna-premium', 2, 0, clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days'),
    (complete_booking, 'accepted', 'private', 'website', 'en', 'etna-premium', 1, 0, clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days'),
    (cancelled_booking, 'accepted', 'private', 'website', 'en', 'etna-premium', 1, 0, clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days'),
    (archived_booking, 'accepted', 'private', 'website', 'en', 'etna-premium', 1, 0, clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days'),
    (incomplete_booking, 'accepted', 'private', 'website', 'en', 'etna-premium', 2, 0, clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days');

  insert into public.booking_participants (
    id, booking_request_id, full_name, participant_type, is_organizer, status, created_at, updated_at
  ) values
    (eligible_organizer, eligible_booking, 'Automation Organizer', 'adult', true, 'active', clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days'),
    (eligible_adult, eligible_booking, 'Automation Adult', 'adult', false, 'active', clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days'),
    (complete_organizer, complete_booking, 'Complete Organizer', 'adult', true, 'active', clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days'),
    (cancelled_organizer, cancelled_booking, 'Cancelled Organizer', 'adult', true, 'active', clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days'),
    (archived_organizer, archived_booking, 'Archived Organizer', 'adult', true, 'active', clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days'),
    (incomplete_organizer, incomplete_booking, 'Incomplete Organizer', 'adult', true, 'active', clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days');

  select * into state
  from public.get_participant_terms_reminder_states(array[eligible_booking], 'en', clock_timestamp());
  if state.reminder_required or state.suppression_reason <> 'terms_unavailable' then
    raise exception 'participant_terms_automation_missing_terms_not_closed';
  end if;

  insert into public.terms_versions (
    id, document_purpose, version, locale, effective_at, published_at,
    content_snapshot, content_sha256, status
  ) values (
    version_id, 'excursion_booking', 'phase4-local-only', 'en',
    clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days',
    jsonb_build_object('intro', 'Local test only.', 'sections', jsonb_build_array(jsonb_build_object('title', 'Test', 'body', 'Not legal text.'))),
    repeat('0', 64), 'published'
  );
  select content_sha256 into version_hash from public.terms_versions where id = version_id;

  select * into state
  from public.get_participant_terms_reminder_states(array[eligible_booking], 'en', clock_timestamp());
  if not state.reminder_required
    or not state.composition_complete
    or state.required_participants <> 2
    or state.accepted_participants <> 0
    or state.outstanding_participants <> 2
    or state.suppression_reason <> 'outstanding'
    or state.state_revision !~ '^[0-9a-f]{64}$' then
    raise exception 'participant_terms_automation_eligible_state_invalid';
  end if;
  eligible_revision := state.state_revision;

  update public.booking_requests
  set updated_at = updated_at + interval '1 minute'
  where id = eligible_booking;
  select * into state
  from public.get_participant_terms_reminder_states(array[eligible_booking], 'en', clock_timestamp());
  if state.state_revision = eligible_revision then
    raise exception 'participant_terms_automation_booking_change_not_revisioned';
  end if;

  insert into public.terms_acceptances (
    terms_version_id, terms_content_sha256, document_purpose, booking_request_id,
    participant_id, actor_participant_id, actor_type, actor_name_snapshot,
    representation_type, locale, source_context, privacy_notice_provided_at,
    accepted_at, created_at
  ) values (
    version_id, version_hash, 'excursion_booking', complete_booking,
    complete_organizer, complete_organizer, 'participant', 'Complete Organizer',
    'self', 'en', 'owned_booking', clock_timestamp(), clock_timestamp(), clock_timestamp()
  );

  select * into state
  from public.get_participant_terms_reminder_states(array[complete_booking], 'en', clock_timestamp());
  if state.reminder_required or state.suppression_reason <> 'complete' or state.outstanding_participants <> 0 then
    raise exception 'participant_terms_automation_complete_state_invalid';
  end if;

  update public.booking_requests set status = 'cancelled' where id = cancelled_booking;
  update public.booking_requests set status = 'archived' where id = archived_booking;
  if exists (
    select 1
    from public.get_participant_terms_reminder_states(array[cancelled_booking, archived_booking], 'en', clock_timestamp())
    where reminder_required or suppression_reason <> 'booking_closed'
  ) then
    raise exception 'participant_terms_automation_closed_booking_eligible';
  end if;

  select * into state
  from public.get_participant_terms_reminder_states(array[incomplete_booking], 'en', clock_timestamp());
  if state.reminder_required or state.suppression_reason <> 'composition_incomplete' then
    raise exception 'participant_terms_automation_incomplete_composition_eligible';
  end if;

  select count(*) into evidence_before from public.terms_acceptances;
  perform * from public.get_participant_terms_reminder_states(
    array[eligible_booking, complete_booking, cancelled_booking, archived_booking, incomplete_booking],
    'en',
    clock_timestamp()
  );
  if (select count(*) from public.terms_acceptances) <> evidence_before then
    raise exception 'participant_terms_automation_resolver_mutated_evidence';
  end if;
end;
$$;

select 'participant Terms automation local regression passed' as result;

rollback;
