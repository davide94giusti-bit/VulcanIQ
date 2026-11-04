\set ON_ERROR_STOP on
-- Synthetic fixtures ONLY for the newly created disposable audit database.
-- No real Terms text, people, tokens, email addresses or acceptance is used.
begin;
insert into public.booking_requests(id,status,source,customer_name,adults,children)
values('91000000-0000-4000-8000-000000000001','accepted','manual','Synthetic participant upgrade',2,0);
insert into public.booking_participants(id,booking_request_id,full_name,participant_type,is_organizer) values
 ('91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','Synthetic organizer','adult',true),
 ('91000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','Synthetic adult','adult',false);
insert into public.terms_versions(id,document_purpose,version,locale,effective_at,content_snapshot,content_sha256)
values('91000000-0000-4000-8000-000000000004','excursion_booking','synthetic-upgrade-only','it',now()-interval '1 day','{"intro":"Synthetic test only; not contractual text","sections":[]}',repeat('0',64));
select public.record_owned_organizer_terms_acceptance('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000004','it');
select public.issue_participant_terms_acceptance_invitation('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000002','it',repeat('a',64));
create table public.audit_participant_upgrade_fixture(kind text primary key,value jsonb not null);
insert into public.audit_participant_upgrade_fixture values
 ('participants',(select jsonb_agg(to_jsonb(p) order by p.id) from public.booking_participants p where booking_request_id='91000000-0000-4000-8000-000000000001')),
 ('versions',(select to_jsonb(v) from public.terms_versions v where id='91000000-0000-4000-8000-000000000004')),
 ('acceptances',(select jsonb_agg(to_jsonb(a) order by a.id) from public.terms_acceptances a where booking_request_id='91000000-0000-4000-8000-000000000001')),
 ('invitations',(select jsonb_agg(to_jsonb(i) order by i.id) from public.terms_acceptance_invitations i where booking_request_id='91000000-0000-4000-8000-000000000001')),
 ('functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text) order by p.oid::regprocedure::text)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in (
    'validate_booking_participant','set_terms_version_content_hash','prevent_terms_evidence_mutation','validate_terms_acceptance','resolve_current_terms_version','create_public_booking_request_with_terms','record_owned_organizer_terms_acceptance','protect_terms_acceptance_invitation_lifecycle','issue_participant_terms_acceptance_invitation','revoke_participant_terms_acceptance_invitation','resolve_participant_terms_acceptance_invitation','accept_participant_terms_acceptance_invitation','revoke_failed_participant_terms_email_invitation','record_owned_organizer_guardian_terms_acceptance','get_participant_terms_reminder_states')));
commit;
