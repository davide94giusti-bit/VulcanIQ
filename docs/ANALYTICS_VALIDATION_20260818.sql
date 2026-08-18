-- vulcanIQ analytics consolidation — safe production validation
-- Baseline: main@6bb88807ccff7adaa2416521ca8d7cdf0f5dcad8
-- This file is read-only. It does not delete, truncate, update, or backfill data.

-- 1) Confirm the reporting settings row exists.
select
  id,
  tracking_contract_started_at,
  reporting_baseline_at,
  updated_at
from public.analytics_reporting_settings
where id = 'default';

-- 2) Confirm the canonical RPCs are SECURITY DEFINER with explicit search_path.
select
  p.proname,
  p.prosecdef as security_definer,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_admin_analytics_summary',
    'get_analytics_reporting_settings',
    'set_analytics_reporting_baseline',
    'clear_analytics_reporting_baseline'
  )
order by p.proname;

-- 3) Confirm function definitions contain the canonical contract markers.
select
  position('analytics_event_count' in pg_get_functiondef('public.get_admin_analytics_summary(timestamptz,timestamptz,boolean)'::regprocedure)) > 0
    as has_coverage_metadata,
  position('count(distinct visitor_id)' in pg_get_functiondef('public.get_admin_analytics_summary(timestamptz,timestamptz,boolean)'::regprocedure)) > 0
    as has_server_unique_visitors,
  position('website_funnel_completion' in pg_get_functiondef('public.get_admin_analytics_summary(timestamptz,timestamptz,boolean)'::regprocedure)) > 0
    as has_canonical_rates,
  position('fast_request' in pg_get_functiondef('public.get_admin_analytics_summary(timestamptz,timestamptz,boolean)'::regprocedure)) > 0
    as has_fast_request_funnel,
  position('gift_card' in pg_get_functiondef('public.get_admin_analytics_summary(timestamptz,timestamptz,boolean)'::regprocedure)) > 0
    as has_gift_card_funnel,
  position('booking_code' in pg_get_functiondef('public.get_admin_analytics_summary(timestamptz,timestamptz,boolean)'::regprocedure)) > 0
    as has_booking_code_funnel;

-- 4) Independent control totals. These prove the database contains more than any
-- browser-side raw sample limit and provide values to compare with the admin UI.
select
  count(*) as total_events,
  count(*) filter (where event_name = 'page_view') as total_page_views,
  count(distinct visitor_id) filter (
    where event_name = 'page_view' and visitor_id is not null
  ) as all_time_approx_unique_visitors,
  min(occurred_at) as first_event,
  max(occurred_at) as latest_event
from public.analytics_events;

select
  count(*) as total_sessions,
  count(distinct visitor_id) filter (where visitor_id is not null) as browser_profiles_with_sessions,
  min(started_at) as first_session,
  max(started_at) as latest_session,
  max(last_seen_at) as latest_session_activity
from public.analytics_sessions;

-- 5) Event distribution, especially useful for proving that historical lifecycle
-- noise exists but is no longer part of the behavioural KPI definitions.
select
  event_name,
  count(*) as event_rows
from public.analytics_events
group by event_name
order by event_rows desc, event_name;

select
  count(*) filter (where event_name = 'session_start') as historical_session_start_rows,
  count(*) filter (where event_name = 'session_heartbeat') as historical_session_heartbeat_rows,
  count(*) filter (where event_name = 'session_end') as historical_session_end_rows
from public.analytics_events;

-- 6) Tracking-contract control values, independent of the admin UI.
select
  count(*) filter (where event_name = 'page_view') as page_views_since_contract,
  count(distinct visitor_id) filter (
    where event_name = 'page_view' and visitor_id is not null
  ) as approx_unique_visitors_since_contract,
  count(*) filter (where event_name = 'booking_form_submit_attempt') as website_submit_attempts_since_contract,
  count(*) filter (where event_name = 'booking_form_submit_success') as website_submit_successes_since_contract,
  count(*) filter (where event_name = 'booking_form_submit_error') as website_submit_errors_since_contract
from public.analytics_events
where occurred_at >= '2026-08-17T00:00:00Z'::timestamptz;

-- 7) Business-channel controls. Website/public/legacy-blank records are separated
-- from booking-code and admin/manual records.
select
  count(*) filter (
    where coalesce(nullif(source, ''), 'website') in ('website','public_website','unknown')
      and created_by_admin is null
  ) as website_requests,
  count(*) filter (
    where source = 'booking_code' and created_by_admin is null
  ) as booking_code_requests,
  count(*) filter (
    where source = 'manual' or created_by_admin is not null
  ) as admin_manual_requests
from public.booking_requests;

-- 8) Confirm no direct table access was granted to anon/authenticated for settings.
select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'analytics_reporting_settings'
order by grantee, privilege_type;

-- 9) Confirm RPC execute grants. Authorization is still enforced inside each RPC.
select
  routine_name,
  grantee,
  privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
  and routine_name in (
    'get_admin_analytics_summary',
    'get_analytics_reporting_settings',
    'set_analytics_reporting_baseline',
    'clear_analytics_reporting_baseline'
  )
order by routine_name, grantee;

-- IMPORTANT:
-- Calling get_admin_analytics_summary() directly from the Supabase SQL Editor may
-- raise "Not authorized" because SQL Editor execution does not necessarily carry
-- the logged-in application's JWT/admin context. That is expected. Verify the
-- actual JSON result from the authenticated admin Analytics page or a service-role
-- execution path after the definition/security checks above pass.
