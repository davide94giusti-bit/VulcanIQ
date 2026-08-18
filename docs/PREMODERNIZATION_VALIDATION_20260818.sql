-- vulcanIQ pre-modernization consolidation: safe production validation queries.
-- No statements below delete or mutate customer/provider content.

-- 1. Google review cache/state existence + RLS
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('google_reviews_cache', 'google_reviews_sync_state')
order by c.relname;

-- 2. New RPC security configuration
select p.proname, p.prosecdef as security_definer, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_public_google_reviews','get_google_reviews_sync_status','upsert_analytics_session')
order by p.proname;

-- 3. Confirm execute grants on monotonic session RPC
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'upsert_analytics_session'
order by grantee;

-- 4. Provider cache status without exposing review content
select status, location_resource_name, last_attempt_at, last_success_at, last_error_at, last_error_code
from public.google_reviews_sync_state
where id = 'google_business_profile';

-- 5. Cache expiry envelope (metadata only)
select count(*) as cached_rows,
       min(fetched_at) as oldest_fetch,
       max(fetched_at) as newest_fetch,
       min(expires_at) as earliest_expiry,
       max(expires_at) as latest_expiry
from public.google_reviews_cache
where provider = 'google_business_profile';

-- 6. Analytics session diagnostics after deployment
select session_id, started_at, last_seen_at, duration_seconds, pageview_count, entry_path, exit_path
from public.analytics_sessions
order by last_seen_at desc
limit 20;

-- 7. Lifecycle rows should stop increasing after the new ingestion code is live
select event_name, count(*) as events, max(occurred_at) as latest
from public.analytics_events
where event_name in ('session_start','session_heartbeat','session_end')
group by event_name
order by event_name;

-- 8. Canonical page-view control totals remain event based
select count(*) filter (where event_name = 'page_view') as page_views,
       count(distinct visitor_id) filter (where event_name = 'page_view') as approx_unique_visitors,
       max(occurred_at) filter (where event_name = 'page_view') as latest_page_view
from public.analytics_events;
