-- Local-only transactional validation for Phase 3 participant Terms journeys.
-- Run after a fresh local migration reset. Every fixture is removed by ROLLBACK.

begin;

do $$
declare
  booking_id uuid := '31000000-0000-4000-8000-000000000001';
  other_booking_id uuid := '31000000-0000-4000-8000-000000000002';
  organizer_id uuid := '32000000-0000-4000-8000-000000000001';
  adult_id uuid := '32000000-0000-4000-8000-000000000002';
  other_guardian_id uuid := '32000000-0000-4000-8000-000000000003';
  minor_id uuid := '32000000-0000-4000-8000-000000000004';
  changed_minor_id uuid := '32000000-0000-4000-8000-000000000005';
  removable_adult_id uuid := '32000000-0000-4000-8000-000000000006';
  italian_adult_id uuid := '32000000-0000-4000-8000-000000000007';
  superseded_adult_id uuid := '32000000-0000-4000-8000-000000000008';
  other_organizer_id uuid := '32000000-0000-4000-8000-000000000009';
  other_adult_id uuid := '32000000-0000-4000-8000-000000000010';
  delivery_failure_adult_id uuid := '32000000-0000-4000-8000-000000000011';
  request_version_id uuid := '33000000-0000-4000-8000-000000000001';
  excursion_en_v1_id uuid := '33000000-0000-4000-8000-000000000002';
  excursion_it_v1_id uuid := '33000000-0000-4000-8000-000000000003';
  excursion_en_v2_id uuid := '33000000-0000-4000-8000-000000000009';
  first_hash text := repeat('a', 64);
  second_hash text := repeat('b', 64);
  guardian_hash text := repeat('c', 64);
  expired_hash text := repeat('d', 64);
  changed_guardian_hash text := repeat('e', 64);
  removed_hash text := repeat('f', 64);
  revoked_hash text := repeat('1', 64);
  cancelled_hash text := repeat('2', 64);
  italian_hash text := repeat('3', 64);
  superseded_hash text := repeat('4', 64);
  delivery_failure_hash text := repeat('8', 64);
  issued record;
  reissued record;
  resolved record;
  accepted record;
  repeated record;
  guardian_accepted record;
  revoked record;
  unavailable_rejected boolean := false;
  invalid_rejected boolean := false;
  expired_rejected boolean := false;
  revoked_rejected boolean := false;
  cross_booking_rejected boolean := false;
  organizer_rejected boolean := false;
  organizer_guardian_link_rejected boolean := false;
  unrelated_guardian_rejected boolean := false;
  delivery_failure_revoked boolean := false;
  guardian_reaccept_rejected boolean := false;
  guardian_change_rejected boolean := false;
  removed_rejected boolean := false;
  cancelled_rejected boolean := false;
  superseded_rejected boolean := false;
  lifecycle_rejected boolean := false;
  deletion_rejected boolean := false;
begin
  if exists (
    select 1
    from public.resolve_current_terms_version('excursion_booking', 'en')
  ) then
    raise exception 'participant_terms_test_unapproved_version_published';
  end if;

  insert into public.booking_requests (id, status, request_type, source, language, experience_id, adults, children)
  values
    (booking_id, 'accepted', 'private', 'website', 'en', 'etna-premium', 5, 2),
    (other_booking_id, 'accepted', 'private', 'website', 'en', 'etna-learning', 2, 0);

  insert into public.booking_participants (
    id, booking_request_id, full_name, participant_type, is_organizer, guardian_participant_id, status
  ) values
    (organizer_id, booking_id, 'Local Organizer', 'adult', true, null, 'active'),
    (adult_id, booking_id, 'Local Adult', 'adult', false, null, 'active'),
    (other_guardian_id, booking_id, 'Other Guardian', 'adult', false, null, 'active'),
    (minor_id, booking_id, 'Local Minor', 'minor', false, organizer_id, 'active'),
    (changed_minor_id, booking_id, 'Changed Guardian Minor', 'minor', false, organizer_id, 'active'),
    (removable_adult_id, booking_id, 'Removable Adult', 'adult', false, null, 'active'),
    (italian_adult_id, booking_id, 'Adulto Italiano', 'adult', false, null, 'active'),
    (superseded_adult_id, booking_id, 'Superseded Adult', 'adult', false, null, 'active'),
    (other_organizer_id, other_booking_id, 'Other Organizer', 'adult', true, null, 'active'),
    (other_adult_id, other_booking_id, 'Other Adult', 'adult', false, null, 'active'),
    (delivery_failure_adult_id, booking_id, 'Delivery Failure Adult', 'adult', false, null, 'active');

  begin
    perform public.issue_participant_terms_acceptance_invitation(
      booking_id, adult_id, organizer_id, 'en', first_hash
    );
  exception when others then
    unavailable_rejected := sqlerrm = 'terms_version_unavailable';
  end;
  if not unavailable_rejected then
    raise exception 'participant_terms_test_missing_version_allowed';
  end if;
  if exists (select 1 from public.terms_acceptance_invitations) then
    raise exception 'participant_terms_test_missing_version_mutated';
  end if;

  insert into public.terms_versions (
    id, document_purpose, version, locale, effective_at, published_at,
    content_snapshot, content_sha256, status
  ) values
    (
      request_version_id, 'booking_request', 'local-request-test-only', 'en',
      transaction_timestamp(), transaction_timestamp(),
      jsonb_build_object(
        'intro', 'Local request fixture only.',
        'sections', jsonb_build_array(jsonb_build_object('title', 'Request', 'body', 'Not legal content.'))
      ),
      repeat('0', 64), 'published'
    ),
    (
      excursion_en_v1_id, 'excursion_booking', 'local-excursion-en-v1', 'en',
      transaction_timestamp(), transaction_timestamp(),
      jsonb_build_object(
        'intro', 'Local English excursion fixture only.',
        'sections', jsonb_build_array(jsonb_build_object('title', 'Excursion', 'body', 'Not legal content.'))
      ),
      repeat('0', 64), 'published'
    ),
    (
      excursion_it_v1_id, 'excursion_booking', 'local-excursion-it-v1', 'it',
      transaction_timestamp(), transaction_timestamp(),
      jsonb_build_object(
        'intro', 'Fixture escursione italiana solo locale.',
        'sections', jsonb_build_array(jsonb_build_object('title', 'Escursione', 'body', 'Contenuto non legale.'))
      ),
      repeat('0', 64), 'published'
    );

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'terms_acceptance_invitations'
      and column_name ~* 'raw.*token|token.*raw'
  ) then
    raise exception 'participant_terms_test_raw_token_column';
  end if;

  if has_table_privilege('anon', 'public.terms_acceptance_invitations', 'select')
    or has_table_privilege('anon', 'public.terms_acceptance_invitations', 'insert')
    or has_table_privilege('authenticated', 'public.terms_acceptance_invitations', 'select')
    or has_table_privilege('authenticated', 'public.terms_acceptance_invitations', 'insert')
    or has_table_privilege('authenticated', 'public.terms_acceptance_invitations', 'update')
    or has_table_privilege('authenticated', 'public.terms_acceptance_invitations', 'delete')
    or has_column_privilege('authenticated', 'public.terms_acceptance_invitations', 'token_hash', 'select') then
    raise exception 'participant_terms_test_browser_table_privilege';
  end if;
  if not has_column_privilege('authenticated', 'public.terms_acceptance_invitations', 'booking_request_id', 'select')
    or not has_column_privilege('authenticated', 'public.terms_acceptance_invitations', 'participant_id', 'select')
    or not has_column_privilege('authenticated', 'public.terms_acceptance_invitations', 'revoked_at', 'select')
    or not has_table_privilege('service_role', 'public.terms_acceptance_invitations', 'select') then
    raise exception 'participant_terms_test_reader_privilege';
  end if;
  if has_function_privilege(
      'anon',
      'public.accept_participant_terms_acceptance_invitation(text)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.accept_participant_terms_acceptance_invitation(text)',
      'execute'
    )
    or not has_function_privilege(
      'service_role',
      'public.accept_participant_terms_acceptance_invitation(text)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.record_owned_organizer_guardian_terms_acceptance(uuid,uuid,uuid,uuid,text)',
      'execute'
    )
    or has_function_privilege(
      'anon',
      'public.revoke_failed_participant_terms_email_invitation(uuid,text)',
      'execute'
    )
    or not has_function_privilege(
      'service_role',
      'public.record_owned_organizer_guardian_terms_acceptance(uuid,uuid,uuid,uuid,text)',
      'execute'
    ) then
    raise exception 'participant_terms_test_writer_privilege';
  end if;

  begin
    perform public.issue_participant_terms_acceptance_invitation(
      booking_id, adult_id, organizer_id, 'en', 'not-a-token-hash'
    );
  exception when others then
    invalid_rejected := sqlerrm = 'terms_invitation_token_invalid';
  end;
  if not invalid_rejected then
    raise exception 'participant_terms_test_invalid_hash_allowed';
  end if;

  select * into issued
  from public.issue_participant_terms_acceptance_invitation(
    booking_id, adult_id, organizer_id, 'en', first_hash
  );
  if issued.invitation_id is null
    or issued.terms_version_id <> excursion_en_v1_id
    or issued.locale <> 'en'
    or issued.representation_type <> 'self' then
    raise exception 'participant_terms_test_issue_contract';
  end if;
  if not exists (
    select 1
    from public.terms_acceptance_invitations invitation
    where invitation.id = issued.invitation_id
      and invitation.booking_request_id = booking_id
      and invitation.participant_id = adult_id
      and invitation.actor_participant_id = adult_id
      and invitation.issued_by_participant_id = organizer_id
      and invitation.terms_version_id = excursion_en_v1_id
      and invitation.token_hash = first_hash
      and invitation.source_context = 'participant_email_delivery'
      and invitation.expires_at = invitation.issued_at + interval '24 hours'
      and invitation.created_at = invitation.issued_at
      and invitation.consumed_at is null
      and invitation.revoked_at is null
  ) then
    raise exception 'participant_terms_test_invitation_scope';
  end if;

  select * into resolved
  from public.resolve_participant_terms_acceptance_invitation(first_hash);
  if resolved.participant_name <> 'Local Adult'
    or resolved.actor_name <> 'Local Adult'
    or resolved.representation_type <> 'self'
    or resolved.experience_id <> 'etna-premium'
    or resolved.terms_version <> 'local-excursion-en-v1'
    or resolved.locale <> 'en'
    or resolved.content_snapshot is null then
    raise exception 'participant_terms_test_resolve_contract';
  end if;

  select * into reissued
  from public.issue_participant_terms_acceptance_invitation(
    booking_id, adult_id, organizer_id, 'en', second_hash
  );
  if reissued.invitation_id = issued.invitation_id
    or not exists (
      select 1
      from public.terms_acceptance_invitations invitation
      where invitation.id = issued.invitation_id
        and invitation.revoked_at >= invitation.issued_at
        and invitation.revoked_at = (
          select replacement.issued_at
          from public.terms_acceptance_invitations replacement
          where replacement.id = reissued.invitation_id
        )
        and invitation.revocation_reason = 'superseded'
    ) then
    raise exception 'participant_terms_test_reissue_contract';
  end if;

  unavailable_rejected := false;
  begin
    perform public.resolve_participant_terms_acceptance_invitation(first_hash);
  exception when others then
    unavailable_rejected := sqlerrm = 'terms_invitation_unavailable';
  end;
  if not unavailable_rejected then
    raise exception 'participant_terms_test_superseded_token_valid';
  end if;

  select * into accepted
  from public.accept_participant_terms_acceptance_invitation(second_hash);
  if accepted.participant_name <> 'Local Adult'
    or accepted.actor_name <> 'Local Adult'
    or accepted.representation_type <> 'self'
    or accepted.terms_version <> 'local-excursion-en-v1'
    or accepted.locale <> 'en'
    or accepted.accepted_at <> transaction_timestamp()
    or accepted.idempotent then
    raise exception 'participant_terms_test_adult_acceptance_contract';
  end if;
  if not exists (
    select 1
    from public.terms_acceptances acceptance
    where acceptance.booking_request_id = booking_id
      and acceptance.participant_id = adult_id
      and acceptance.actor_participant_id = adult_id
      and acceptance.terms_version_id = excursion_en_v1_id
      and acceptance.representation_type = 'self'
      and acceptance.source_context = 'participant_invitation'
      and acceptance.accepted_at = transaction_timestamp()
      and acceptance.privacy_notice_provided_at = acceptance.accepted_at
  ) then
    raise exception 'participant_terms_test_adult_evidence';
  end if;
  if not exists (
    select 1
    from public.terms_acceptance_invitations invitation
    join public.terms_acceptances acceptance
      on acceptance.id = invitation.consumed_terms_acceptance_id
    where invitation.id = reissued.invitation_id
      and invitation.consumed_at >= invitation.issued_at
      and invitation.consumed_at >= acceptance.accepted_at
      and acceptance.participant_id = adult_id
  ) then
    raise exception 'participant_terms_test_atomic_consumption';
  end if;

  select * into repeated
  from public.accept_participant_terms_acceptance_invitation(second_hash);
  if not repeated.idempotent
    or repeated.accepted_at <> accepted.accepted_at
    or (select count(*) from public.terms_acceptances where participant_id = adult_id and terms_version_id = excursion_en_v1_id) <> 1 then
    raise exception 'participant_terms_test_idempotent_retry';
  end if;

  select * into revoked
  from public.revoke_participant_terms_acceptance_invitation(
    booking_id, adult_id, organizer_id
  );
  if revoked.revoked_count <> 0
    or exists (
      select 1
      from public.terms_acceptance_invitations invitation
      where invitation.id = reissued.invitation_id
        and invitation.revoked_at is not null
    ) then
    raise exception 'participant_terms_test_consumed_invitation_revoked';
  end if;

  begin
    perform public.issue_participant_terms_acceptance_invitation(
      booking_id, minor_id, organizer_id, 'en', guardian_hash
    );
  exception when others then
    organizer_guardian_link_rejected := sqlerrm = 'terms_invitation_guardian_owned_flow_required';
  end;
  if not organizer_guardian_link_rejected then
    raise exception 'participant_terms_test_organizer_guardian_link_allowed';
  end if;

  begin
    perform public.record_owned_organizer_guardian_terms_acceptance(
      booking_id, minor_id, other_guardian_id, excursion_en_v1_id, 'en'
    );
  exception when others then
    unrelated_guardian_rejected := sqlerrm = 'terms_guardian_invalid';
  end;
  if not unrelated_guardian_rejected then
    raise exception 'participant_terms_test_unrelated_guardian_allowed';
  end if;

  select * into guardian_accepted
  from public.record_owned_organizer_guardian_terms_acceptance(
    booking_id, minor_id, organizer_id, excursion_en_v1_id, 'en'
  );
  if guardian_accepted.participant_id <> minor_id
    or guardian_accepted.actor_participant_id <> organizer_id
    or guardian_accepted.representation_type <> 'parent_or_guardian'
    or guardian_accepted.source_context <> 'owned_booking_guardian'
    or not exists (
      select 1
      from public.terms_acceptances acceptance
      where acceptance.participant_id = minor_id
        and acceptance.actor_participant_id = organizer_id
        and acceptance.representation_type = 'parent_or_guardian'
    ) then
    raise exception 'participant_terms_test_guardian_evidence';
  end if;
  perform public.record_owned_organizer_guardian_terms_acceptance(
    booking_id, minor_id, organizer_id, excursion_en_v1_id, 'en'
  );
  if (select count(*) from public.terms_acceptances where participant_id = minor_id and terms_version_id = excursion_en_v1_id) <> 1 then
    raise exception 'participant_terms_test_guardian_idempotency';
  end if;

  select * into issued
  from public.issue_participant_terms_acceptance_invitation(
    booking_id, delivery_failure_adult_id, organizer_id, 'en', delivery_failure_hash
  );
  select public.revoke_failed_participant_terms_email_invitation(issued.invitation_id, delivery_failure_hash)
  into delivery_failure_revoked;
  if not delivery_failure_revoked
    or not exists (
      select 1 from public.terms_acceptance_invitations invitation
      where invitation.id = issued.invitation_id
        and invitation.revocation_reason = 'delivery_failed'
        and invitation.revoked_at is not null
    ) then
    raise exception 'participant_terms_test_delivery_failure_scope';
  end if;
  select public.revoke_failed_participant_terms_email_invitation(issued.invitation_id, repeat('9', 64))
  into delivery_failure_revoked;
  if delivery_failure_revoked then
    raise exception 'participant_terms_test_delivery_failure_scope';
  end if;

  -- Changing the configured guardian after a valid acceptance does not
  -- rewrite or retroactively invalidate that evidence. Phase 2 deliberately
  -- permits only one guardian acceptance per minor/version/representation.
  update public.booking_participants
  set guardian_participant_id = other_guardian_id
  where id = minor_id;
  begin
    perform public.issue_participant_terms_acceptance_invitation(
      booking_id, minor_id, organizer_id, 'en', repeat('7', 64)
    );
  exception when others then
    guardian_reaccept_rejected := sqlerrm = 'terms_participant_already_accepted';
  end;
  if not guardian_reaccept_rejected
    or (select count(*) from public.terms_acceptances where participant_id = minor_id and terms_version_id = excursion_en_v1_id) <> 1
    or not exists (
      select 1
      from public.terms_acceptances acceptance
      where acceptance.participant_id = minor_id
        and acceptance.actor_participant_id = organizer_id
        and acceptance.representation_type = 'parent_or_guardian'
    ) then
    raise exception 'participant_terms_test_guardian_history_reinterpreted';
  end if;

  begin
    perform public.issue_participant_terms_acceptance_invitation(
      booking_id, organizer_id, organizer_id, 'en', repeat('5', 64)
    );
  exception when others then
    organizer_rejected := sqlerrm = 'terms_invitation_participant_invalid';
  end;
  if not organizer_rejected then
    raise exception 'participant_terms_test_organizer_invitation_allowed';
  end if;

  begin
    perform public.issue_participant_terms_acceptance_invitation(
      booking_id, other_adult_id, organizer_id, 'en', repeat('6', 64)
    );
  exception when others then
    cross_booking_rejected := sqlerrm = 'terms_invitation_participant_invalid';
  end;
  if not cross_booking_rejected then
    raise exception 'participant_terms_test_cross_booking_issue_allowed';
  end if;

  update public.booking_participants
  set guardian_participant_id = other_guardian_id
  where id = changed_minor_id;
  select * into issued
  from public.issue_participant_terms_acceptance_invitation(
    booking_id, changed_minor_id, organizer_id, 'en', changed_guardian_hash
  );
  update public.booking_participants
  set guardian_participant_id = organizer_id
  where id = changed_minor_id;
  begin
    perform public.accept_participant_terms_acceptance_invitation(changed_guardian_hash);
  exception when others then
    guardian_change_rejected := sqlerrm = 'terms_invitation_unavailable';
  end;
  if not guardian_change_rejected then
    raise exception 'participant_terms_test_changed_guardian_allowed';
  end if;

  select * into issued
  from public.issue_participant_terms_acceptance_invitation(
    booking_id, removable_adult_id, organizer_id, 'en', removed_hash
  );
  update public.booking_participants set status = 'removed' where id = removable_adult_id;
  begin
    perform public.accept_participant_terms_acceptance_invitation(removed_hash);
  exception when others then
    removed_rejected := sqlerrm = 'terms_invitation_unavailable';
  end;
  if not removed_rejected then
    raise exception 'participant_terms_test_removed_participant_allowed';
  end if;

  select * into issued
  from public.issue_participant_terms_acceptance_invitation(
    other_booking_id, other_adult_id, other_organizer_id, 'en', revoked_hash
  );
  select * into revoked
  from public.revoke_participant_terms_acceptance_invitation(
    other_booking_id, other_adult_id, other_organizer_id
  );
  if revoked.participant_id <> other_adult_id
    or revoked.revoked_count <> 1
    or revoked.revoked_at is null then
    raise exception 'participant_terms_test_revoke_contract';
  end if;
  begin
    perform public.accept_participant_terms_acceptance_invitation(revoked_hash);
  exception when others then
    revoked_rejected := sqlerrm = 'terms_invitation_unavailable';
  end;
  if not revoked_rejected then
    raise exception 'participant_terms_test_revoked_token_allowed';
  end if;

  insert into public.terms_acceptance_invitations (
    booking_request_id, participant_id, actor_participant_id,
    issued_by_participant_id, terms_version_id, representation_type,
    token_hash, locale, source_context, issued_at, expires_at, created_at
  ) values (
    booking_id, italian_adult_id, italian_adult_id,
    organizer_id, excursion_en_v1_id, 'self',
    expired_hash, 'en', 'owned_booking_copy_link',
    transaction_timestamp() - interval '25 hours',
    transaction_timestamp() - interval '1 hour',
    transaction_timestamp() - interval '25 hours'
  );
  begin
    perform public.resolve_participant_terms_acceptance_invitation(expired_hash);
  exception when others then
    expired_rejected := sqlerrm = 'terms_invitation_unavailable';
  end;
  if not expired_rejected then
    raise exception 'participant_terms_test_expired_token_allowed';
  end if;

  select * into issued
  from public.issue_participant_terms_acceptance_invitation(
    other_booking_id, other_adult_id, other_organizer_id, 'en', cancelled_hash
  );
  update public.booking_requests set status = 'cancelled' where id = other_booking_id;
  begin
    perform public.accept_participant_terms_acceptance_invitation(cancelled_hash);
  exception when others then
    cancelled_rejected := sqlerrm = 'terms_invitation_unavailable';
  end;
  if not cancelled_rejected then
    raise exception 'participant_terms_test_cancelled_booking_allowed';
  end if;

  select * into issued
  from public.issue_participant_terms_acceptance_invitation(
    booking_id, italian_adult_id, organizer_id, 'it', italian_hash
  );
  select * into resolved
  from public.resolve_participant_terms_acceptance_invitation(italian_hash);
  if issued.terms_version_id <> excursion_it_v1_id
    or resolved.locale <> 'it'
    or resolved.terms_version <> 'local-excursion-it-v1' then
    raise exception 'participant_terms_test_locale_binding';
  end if;

  select * into issued
  from public.issue_participant_terms_acceptance_invitation(
    booking_id, superseded_adult_id, organizer_id, 'en', superseded_hash
  );
  insert into public.terms_versions (
    id, document_purpose, version, locale, effective_at, published_at,
    content_snapshot, content_sha256, status
  ) values (
    excursion_en_v2_id, 'excursion_booking', 'local-excursion-en-v2', 'en',
    transaction_timestamp(), transaction_timestamp(),
    jsonb_build_object(
      'intro', 'Second local English excursion fixture only.',
      'sections', jsonb_build_array(jsonb_build_object('title', 'Excursion v2', 'body', 'Not legal content.'))
    ),
    repeat('0', 64), 'published'
  );
  begin
    perform public.accept_participant_terms_acceptance_invitation(superseded_hash);
  exception when others then
    superseded_rejected := sqlerrm = 'terms_invitation_version_superseded';
  end;
  if not superseded_rejected then
    raise exception 'participant_terms_test_old_version_allowed';
  end if;

  begin
    update public.terms_acceptance_invitations
    set token_hash = repeat('9', 64)
    where id = issued.invitation_id;
  exception when others then
    lifecycle_rejected := sqlerrm = 'terms_invitation_scope_immutable';
  end;
  if not lifecycle_rejected then
    raise exception 'participant_terms_test_scope_mutable';
  end if;

  begin
    delete from public.terms_acceptance_invitations
    where id = issued.invitation_id;
  exception when others then
    deletion_rejected := sqlerrm = 'terms_invitation_history_immutable';
  end;
  if not deletion_rejected then
    raise exception 'participant_terms_test_history_deletable';
  end if;

  if (select count(*) from public.terms_acceptances where participant_id = adult_id) <> 1
    or (select count(*) from public.terms_acceptances where participant_id = minor_id) <> 1 then
    raise exception 'participant_terms_test_historical_evidence_lost';
  end if;

  raise notice 'PARTICIPANT TERMS ACCEPTANCE LOCAL TEST PASS';
end;
$$;

rollback;
