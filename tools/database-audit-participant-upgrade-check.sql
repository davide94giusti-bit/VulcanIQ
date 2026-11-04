\set ON_ERROR_STOP on
-- Run ONLY after the matching synthetic seed in the disposable audit database.
begin;
create function pg_temp.assert_participant_upgrade(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
select pg_temp.assert_participant_upgrade(
 (select jsonb_agg(to_jsonb(p) order by p.id) from public.booking_participants p where booking_request_id='91000000-0000-4000-8000-000000000001')=(select value from public.audit_participant_upgrade_fixture where kind='participants'),
 'participant upgrade preserves all participant fields');
select pg_temp.assert_participant_upgrade(
 (select to_jsonb(v) from public.terms_versions v where id='91000000-0000-4000-8000-000000000004')=(select value from public.audit_participant_upgrade_fixture where kind='versions'),
 'participant upgrade preserves immutable Terms version bytes/hash');
select pg_temp.assert_participant_upgrade(
 (select jsonb_agg(to_jsonb(a) order by a.id) from public.terms_acceptances a where booking_request_id='91000000-0000-4000-8000-000000000001')=(select value from public.audit_participant_upgrade_fixture where kind='acceptances'),
 'participant upgrade preserves acceptance actor/hash/time evidence');
select pg_temp.assert_participant_upgrade(
 (select jsonb_agg(to_jsonb(i) order by i.id) from public.terms_acceptance_invitations i where booking_request_id='91000000-0000-4000-8000-000000000001')=(select value from public.audit_participant_upgrade_fixture where kind='invitations'),
 'participant upgrade preserves invitation token/expiry/lifecycle');
select pg_temp.assert_participant_upgrade(
 (select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text) order by p.oid::regprocedure::text)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
   'validate_booking_participant','set_terms_version_content_hash','prevent_terms_evidence_mutation','validate_terms_acceptance','resolve_current_terms_version','create_public_booking_request_with_terms','record_owned_organizer_terms_acceptance','protect_terms_acceptance_invitation_lifecycle','issue_participant_terms_acceptance_invitation','revoke_participant_terms_acceptance_invitation','resolve_participant_terms_acceptance_invitation','accept_participant_terms_acceptance_invitation','revoke_failed_participant_terms_email_invitation','record_owned_organizer_guardian_terms_acceptance','get_participant_terms_reminder_states'))=(select value from public.audit_participant_upgrade_fixture where kind='functions'),
 'participant upgrade preserves recovered function definitions and ACLs');
select pg_temp.assert_participant_upgrade(
 (select reminder_required and required_participants=2 and accepted_participants=1 and outstanding_participants=1
  from public.get_participant_terms_reminder_states(array['91000000-0000-4000-8000-000000000001'::uuid],'it')),
 'participant Terms state remains authoritative after audit upgrade');
select pg_temp.assert_participant_upgrade(
 not has_function_privilege('authenticated','public.get_participant_terms_reminder_states(uuid[],text,timestamptz)','execute')
 and not has_function_privilege('anon','public.get_participant_terms_reminder_states(uuid[],text,timestamptz)','execute')
 and has_function_privilege('service_role','public.get_participant_terms_reminder_states(uuid[],text,timestamptz)','execute'),
 'participant reminder authority remains service-role-only');
do $$ begin
 begin
  update public.terms_versions set version='must-not-change' where id='91000000-0000-4000-8000-000000000004';
  raise exception 'Expected Terms version immutability rejection';
 exception when raise_exception then if sqlerrm<>'terms_evidence_immutable' then raise; end if; end;
 raise notice 'PASS: upgraded Terms version remains immutable';
 begin
  update public.terms_acceptances set source_context='must-not-change' where booking_request_id='91000000-0000-4000-8000-000000000001';
  raise exception 'Expected acceptance immutability rejection';
 exception when raise_exception then if sqlerrm<>'terms_evidence_immutable' then raise; end if; end;
 raise notice 'PASS: upgraded acceptance remains immutable';
end $$;
rollback;
-- The immutable synthetic evidence deliberately remains in this disposable DB.
-- Do not disable its triggers to clean it up; discard only the dedicated test stack.
