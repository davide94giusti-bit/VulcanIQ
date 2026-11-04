-- Preserve historical analytics as evidence, not as proof of a saved website request.
begin;
alter function public.get_admin_analytics_summary(timestamptz,timestamptz,boolean)
  rename to get_admin_analytics_summary_legacy_internal;
revoke all on function public.get_admin_analytics_summary_legacy_internal(timestamptz,timestamptz,boolean)
  from public,anon,authenticated,service_role;

create function public.get_admin_analytics_summary(
  p_from timestamptz default null,p_to timestamptz default null,p_use_reporting_baseline boolean default true
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  result jsonb;
  fast jsonb;
  range_from timestamptz;
  range_to timestamptz;
  saved bigint;
  legacy_saved bigint;
  contract constant text := '20261027-authoritative-website';
begin
  -- The existing summary enforces its authenticated-admin/service role check and range contract.
  result:=public.get_admin_analytics_summary_legacy_internal(p_from,p_to,p_use_reporting_baseline);
  range_from:=(result#>>'{meta,effective_from}')::timestamptz;
  range_to:=(result#>>'{meta,effective_to}')::timestamptz;
  fast:=result#>'{funnels,fast_request}';
  select count(*) filter(where booking_journey_version=contract),
         count(*) filter(where booking_journey_version is distinct from contract)
  into saved,legacy_saved
  from public.booking_requests
  where source='website' and created_by_admin is null
    and (source_cta='fast_request' or (source_cta='book_now' and source_section in ('hero','footer')))
    and (range_from is null or created_at>=range_from) and created_at<range_to;
  fast:=fast||jsonb_build_object(
    'legacy_event_submit_successes',coalesce(fast->'submit_successes','0'::jsonb),
    'legacy_database_requests',legacy_saved,
    'submit_successes',saved,
    'database_requests',saved,
    'contract_version',contract,
    'coverage_status',case when legacy_saved>0 or coalesce((fast->>'submit_successes')::bigint,0)>0 then 'mixed_history' else 'compatible' end
  );
  return jsonb_set(result,'{funnels,fast_request}',fast);
end $$;
revoke all on function public.get_admin_analytics_summary(timestamptz,timestamptz,boolean) from public,anon;
grant execute on function public.get_admin_analytics_summary(timestamptz,timestamptz,boolean) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
