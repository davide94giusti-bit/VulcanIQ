-- Read-only post-deployment security audit for vulcanIQ.
-- Run in Supabase SQL Editor after applying the migrations and setup scripts.

-- 1. Public-table RLS state.
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- 2. RLS policies, including policy expressions.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- 3. Flag globally permissive policies for manual review.
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
  and (
    lower(coalesce(qual, '')) in ('true', '(true)')
    or lower(coalesce(with_check, '')) in ('true', '(true)')
  )
order by schemaname, tablename, policyname;

-- 4. Direct table privileges granted to anonymous/authenticated roles.
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema in ('public', 'storage')
  and grantee in ('anon', 'authenticated')
order by grantee, table_schema, table_name, privilege_type;

-- 5. Sensitive operational tables that must not be anonymously readable.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and table_name in (
    'booking_requests', 'gift_card_requests', 'booking_codes', 'finance_entries',
    'partner_commissions', 'request_notification_log', 'admin_weekly_reports',
    'admin_profiles', 'endpoint_rate_limits'
  )
order by table_name, privilege_type;

-- 6. Storage bucket classification and public exposure.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

-- 7. Storage object policies.
select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- 8. Security-definer functions and their execution grants.
select n.nspname as schema_name, p.proname, p.prosecdef as security_definer,
       pg_get_function_identity_arguments(p.oid) as arguments,
       array_to_string(p.proacl, ',') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_public_booking_request', 'create_public_gift_card_request',
    'claim_rate_limit_bucket', 'claim_admin_action_rate_limit',
    'claim_public_submission_rate_limit', 'get_admin_operational_safeguards',
    'admin_update_gift_card_request', 'dispatch_request_notification_webhook',
    'invoke_weekly_admin_recap'
  )
order by p.proname;

-- 9. Operational health checks.
select
  (select count(*) from public.booking_requests where notification_email_status = 'failed') as failed_booking_notifications,
  (select count(*) from public.gift_card_requests where notification_email_status = 'failed') as failed_gift_notifications,
  (select count(*) from public.gift_card_requests where status in ('paid','issued') and booking_code_id is null and nullif(booking_code, '') is null) as paid_gifts_missing_code,
  (select count(*) from public.admin_weekly_reports where status = 'failed') as failed_weekly_reports;

-- 10. Cron jobs installed by this patch.
select jobid, jobname, schedule, command, active
from cron.job
where jobname like 'vulcaniq-weekly-recap-%'
order by jobname;
