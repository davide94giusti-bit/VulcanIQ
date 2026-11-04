-- Browser analytics access is reporting-only. Reporting-baseline controls are
-- non-destructive and do not require DELETE, including for active owners.
-- Reviewed retention/privacy maintenance remains an explicit trusted backend
-- operation with service_role; this migration neither deletes nor backfills data.
begin;

revoke delete on table public.analytics_events,public.analytics_sessions
  from public,anon,authenticated;

drop policy if exists "Admins can delete analytics events" on public.analytics_events;
drop policy if exists "Admins can delete analytics sessions" on public.analytics_sessions;

-- Preserve the existing deliberate service-only maintenance capability.
grant delete on table public.analytics_events,public.analytics_sessions to service_role;

notify pgrst,'reload schema';
commit;
