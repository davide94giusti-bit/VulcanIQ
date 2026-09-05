-- Local-only transactional validation for the Terms evidence foundation.
-- Run against a reset local database after all migrations, then ROLLBACK.

begin;

do $$
declare
  request_version_id uuid;
  italian_request_version_id uuid;
  excursion_version_id uuid;
  created record;
  repeated record;
  organizer_id uuid := gen_random_uuid();
  acceptance_count integer;
  mutation_rejected boolean := false;
  locale_mismatch_rejected boolean := false;
  questionnaire_name_rejected boolean := false;
begin
  if exists (select 1 from public.resolve_current_terms_version('booking_request', 'en'))
    or exists (select 1 from public.resolve_current_terms_version('excursion_booking', 'en')) then
    raise exception 'terms_test_unapproved_version_published';
  end if;

  insert into public.terms_versions (
    id, document_purpose, version, locale, effective_at, published_at,
    content_snapshot, content_sha256, status
  ) values
    (
      '20000000-0000-4000-8000-000000000001', 'booking_request', 'local-test-only', 'en',
      transaction_timestamp(), transaction_timestamp(),
      jsonb_build_object('intro', 'Local test only.', 'sections', jsonb_build_array(jsonb_build_object('title', 'Request', 'body', 'Not legal content.'))),
      repeat('0', 64), 'published'
    ),
    (
      '20000000-0000-4000-8000-000000000002', 'booking_request', 'local-test-only', 'it',
      transaction_timestamp(), transaction_timestamp(),
      jsonb_build_object('intro', 'Solo test locale.', 'sections', jsonb_build_array(jsonb_build_object('title', 'Richiesta', 'body', 'Contenuto non legale.'))),
      repeat('0', 64), 'published'
    ),
    (
      '20000000-0000-4000-8000-000000000003', 'excursion_booking', 'local-test-only', 'en',
      transaction_timestamp(), transaction_timestamp(),
      jsonb_build_object('intro', 'Local test only.', 'sections', jsonb_build_array(jsonb_build_object('title', 'Excursion', 'body', 'Not legal content.'))),
      repeat('0', 64), 'published'
    );

  select id into request_version_id
  from public.resolve_current_terms_version('booking_request', 'en');
  select id into excursion_version_id
  from public.resolve_current_terms_version('excursion_booking', 'en');
  select id into italian_request_version_id
  from public.resolve_current_terms_version('booking_request', 'it');
  if request_version_id is null or excursion_version_id is null then
    raise exception 'terms_test_current_version_missing';
  end if;

  if exists (
    select 1 from public.terms_versions
    where content_sha256 <> encode(extensions.digest(convert_to(content_snapshot::text, 'UTF8'), 'sha256'), 'hex')
  ) then raise exception 'terms_test_hash_mismatch'; end if;

  if has_table_privilege('anon', 'public.terms_acceptances', 'select')
    or has_table_privilege('anon', 'public.terms_acceptances', 'insert')
    or has_table_privilege('authenticated', 'public.terms_acceptances', 'insert')
    or has_table_privilege('authenticated', 'public.terms_acceptances', 'update')
    or has_table_privilege('authenticated', 'public.terms_acceptances', 'delete') then
    raise exception 'terms_test_browser_table_privilege';
  end if;
  if has_function_privilege('authenticated', 'public.record_owned_organizer_terms_acceptance(uuid,uuid,uuid,text)', 'execute')
    or not has_function_privilege('service_role', 'public.record_owned_organizer_terms_acceptance(uuid,uuid,uuid,text)', 'execute') then
    raise exception 'terms_test_writer_privilege';
  end if;

  begin
    perform public.create_public_booking_request_with_terms(
      jsonb_build_object(
        'customer_name', 'Locale Mismatch',
        'customer_email', 'locale-mismatch@example.test',
        'language', 'en',
        'idempotency_key', 'terms-locale-mismatch-20260905',
        'request_type', 'private'
      ),
      italian_request_version_id,
      'questionnaire_website'
    );
  exception when others then
    locale_mismatch_rejected := sqlerrm = 'terms_version_not_current';
  end;
  if not locale_mismatch_rejected then raise exception 'terms_test_locale_mismatch_allowed'; end if;

  begin
    perform public.create_public_booking_request_with_terms(
      jsonb_build_object(
        'customer_email', 'questionnaire-name@example.test',
        'language', 'en',
        'idempotency_key', 'terms-questionnaire-name-20260905',
        'request_type', 'private'
      ),
      request_version_id,
      'questionnaire_website'
    );
  exception when others then
    questionnaire_name_rejected := sqlerrm = 'terms_actor_name_required';
  end;
  if not questionnaire_name_rejected then raise exception 'terms_test_questionnaire_name_allowed'; end if;

  select * into created
  from public.create_public_booking_request_with_terms(
    jsonb_build_object(
      'customer_email', 'local-terms@example.test',
      'language', 'en',
      'idempotency_key', 'terms-local-test-20260905',
      'request_type', 'private',
      'experience_id', 'unsure',
      'adults', '1',
      'children', '0'
    ),
    request_version_id,
    'fast_request_website'
  );
  if created.id is null or created.terms_acceptance_id is null or created.duplicate then
    raise exception 'terms_test_request_creation';
  end if;

  select count(*) into acceptance_count
  from public.terms_acceptances
  where booking_request_id = created.id and document_purpose = 'booking_request';
  if acceptance_count <> 1 then raise exception 'terms_test_request_acceptance_count'; end if;
  if exists (
    select 1 from public.terms_acceptances
    where id = created.terms_acceptance_id
      and (accepted_at <> transaction_timestamp()
        or privacy_notice_provided_at <> transaction_timestamp()
        or terms_content_sha256 <> (select content_sha256 from public.terms_versions where id = request_version_id)
        or actor_type <> 'request_contact'
        or actor_name_snapshot is not null
        or representation_type <> 'request_submitter')
  ) then raise exception 'terms_test_authoritative_fields'; end if;

  select * into repeated
  from public.create_public_booking_request_with_terms(
    jsonb_build_object(
      'customer_email', 'local-terms@example.test',
      'language', 'en',
      'idempotency_key', 'terms-local-test-20260905',
      'request_type', 'private',
      'experience_id', 'unsure',
      'adults', '1',
      'children', '0'
    ),
    request_version_id,
    'fast_request_website'
  );
  if repeated.id <> created.id or not repeated.duplicate then
    raise exception 'terms_test_idempotency';
  end if;

  update public.booking_requests set status = 'accepted' where id = created.id;
  insert into public.booking_participants (
    id, booking_request_id, full_name, participant_type, is_organizer, status
  ) values (
    organizer_id, created.id, 'Local Terms Test', 'adult', true, 'active'
  );
  perform public.record_owned_organizer_terms_acceptance(created.id, organizer_id, excursion_version_id, 'en');
  if not exists (
    select 1 from public.terms_acceptances
    where booking_request_id = created.id
      and participant_id = organizer_id
      and actor_participant_id = organizer_id
      and representation_type = 'self'
      and terms_version_id = excursion_version_id
  ) then raise exception 'terms_test_organizer_self_acceptance'; end if;

  begin
    update public.terms_acceptances
    set actor_name_snapshot = 'Rewritten'
    where id = created.terms_acceptance_id;
  exception when others then
    mutation_rejected := sqlerrm = 'terms_evidence_immutable';
  end;
  if not mutation_rejected then raise exception 'terms_test_acceptance_mutable'; end if;

  raise notice 'TERMS EVIDENCE LOCAL TEST PASS';
end;
$$;

rollback;
