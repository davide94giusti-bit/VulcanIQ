begin;

-- Canonical analytics reporting contract. Historical analytics are preserved;
-- the optional reporting baseline only changes which rows are included in reports.
create table if not exists public.analytics_reporting_settings (
  id text primary key default 'default' check (id = 'default'),
  tracking_contract_started_at timestamptz not null default '2026-08-17T00:00:00Z'::timestamptz,
  reporting_baseline_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.analytics_reporting_settings (id, tracking_contract_started_at)
values ('default', '2026-08-17T00:00:00Z'::timestamptz)
on conflict (id) do nothing;

alter table public.analytics_reporting_settings enable row level security;
revoke all on table public.analytics_reporting_settings from public, anon, authenticated;

create index if not exists analytics_events_event_occurred_idx
  on public.analytics_events(event_name, occurred_at desc);
create index if not exists analytics_events_visitor_occurred_idx
  on public.analytics_events(visitor_id, occurred_at desc);
create index if not exists analytics_events_session_occurred_idx
  on public.analytics_events(session_id, occurred_at desc);
create index if not exists analytics_sessions_visitor_started_idx
  on public.analytics_sessions(visitor_id, started_at desc);

create or replace function public.analytics_normalize_traffic_source(
  p_traffic_source text,
  p_referrer_domain text,
  p_metadata jsonb default '{}'::jsonb
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when lower(coalesce(p_metadata->>'utm_medium', '')) = 'customer'
      or lower(coalesce(p_metadata->>'utm_source', '')) like '%referral%'
      or lower(coalesce(p_traffic_source, '')) like '%referral%' then 'customer_referral'
    when lower(coalesce(p_metadata->>'utm_source', p_traffic_source, '')) in ('ig', 'instagram')
      or lower(coalesce(p_referrer_domain, '')) like '%instagram.%' then 'instagram'
    when lower(coalesce(p_metadata->>'utm_source', p_traffic_source, '')) in ('fb', 'facebook')
      or lower(coalesce(p_referrer_domain, '')) like '%facebook.%' then 'facebook'
    when lower(coalesce(p_metadata->>'utm_source', p_traffic_source, '')) in ('tt', 'tiktok')
      or lower(coalesce(p_referrer_domain, '')) like '%tiktok.%' then 'tiktok'
    when lower(coalesce(p_metadata->>'utm_source', p_traffic_source, '')) in ('wa', 'whatsapp')
      or lower(coalesce(p_referrer_domain, '')) like '%whatsapp.%' then 'whatsapp'
    when lower(coalesce(p_metadata->>'utm_source', p_traffic_source, '')) in ('gbp', 'google_business_profile', 'google_my_business') then 'google_business_profile'
    when lower(coalesce(p_metadata->>'utm_source', p_traffic_source, '')) = 'google'
      or lower(coalesce(p_referrer_domain, '')) like 'google.%'
      or lower(coalesce(p_referrer_domain, '')) like '%.google.%' then 'google'
    when lower(coalesce(p_metadata->>'utm_source', p_traffic_source, '')) = 'partner'
      or lower(coalesce(p_metadata->>'utm_medium', '')) = 'partner' then 'partner'
    when lower(coalesce(p_metadata->>'utm_source', p_traffic_source, '')) = 'qr' then 'qr'
    when lower(coalesce(p_metadata->>'utm_source', p_traffic_source, '')) in ('business_card', 'business-card') then 'business_card'
    when coalesce(nullif(lower(p_traffic_source), ''), '') in ('', 'direct')
      and coalesce(nullif(lower(p_referrer_domain), ''), '') = '' then 'direct'
    when coalesce(nullif(lower(p_traffic_source), ''), '') = 'direct'
      and coalesce(nullif(lower(p_referrer_domain), ''), '') <> '' then 'other'
    when lower(coalesce(p_traffic_source, '')) in ('direct', 'google', 'google_business_profile', 'instagram', 'facebook', 'tiktok', 'whatsapp', 'partner', 'customer_referral', 'qr', 'business_card') then lower(p_traffic_source)
    else 'other'
  end;
$$;
revoke all on function public.analytics_normalize_traffic_source(text, text, jsonb) from public, anon, authenticated;

create or replace function public.get_analytics_reporting_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.analytics_reporting_settings%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select * into v_row
  from public.analytics_reporting_settings
  where id = 'default';

  return jsonb_build_object(
    'tracking_contract_started_at', v_row.tracking_contract_started_at,
    'reporting_baseline_at', v_row.reporting_baseline_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

create or replace function public.set_analytics_reporting_baseline(p_baseline timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.analytics_reporting_settings%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_privileged_admin() then
    raise exception 'Not authorized';
  end if;

  update public.analytics_reporting_settings
  set reporting_baseline_at = coalesce(p_baseline, now()),
      updated_at = now(),
      updated_by = auth.uid()
  where id = 'default'
  returning * into v_row;

  return jsonb_build_object(
    'tracking_contract_started_at', v_row.tracking_contract_started_at,
    'reporting_baseline_at', v_row.reporting_baseline_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

create or replace function public.clear_analytics_reporting_baseline()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.analytics_reporting_settings%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_privileged_admin() then
    raise exception 'Not authorized';
  end if;

  update public.analytics_reporting_settings
  set reporting_baseline_at = null,
      updated_at = now(),
      updated_by = auth.uid()
  where id = 'default'
  returning * into v_row;

  return jsonb_build_object(
    'tracking_contract_started_at', v_row.tracking_contract_started_at,
    'reporting_baseline_at', v_row.reporting_baseline_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

create or replace function public.get_admin_analytics_summary(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_use_reporting_baseline boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tracking_start timestamptz;
  v_baseline timestamptz;
  v_to timestamptz := coalesce(p_to, now());
  v_from timestamptz := p_from;
  v_effective_from timestamptz;
  v_funnel_from timestamptz;
  v_baseline_applied boolean := false;
  v_events bigint := 0;
  v_sessions bigint := 0;
  v_page_views bigint := 0;
  v_pageviews_identified bigint := 0;
  v_visitors bigint := 0;
  v_average_engagement numeric := 0;
  v_first_event timestamptz;
  v_last_event timestamptz;
  v_first_session timestamptz;
  v_last_session timestamptz;
  v_booking_requests_total bigint := 0;
  v_website_requests bigint := 0;
  v_website_requests_compatible bigint := 0;
  v_website_confirmed bigint := 0;
  v_website_confirmed_compatible bigint := 0;
  v_booking_code_requests bigint := 0;
  v_booking_code_requests_compatible bigint := 0;
  v_booking_code_confirmed bigint := 0;
  v_booking_code_confirmed_compatible bigint := 0;
  v_admin_manual_requests bigint := 0;
  v_gift_cards bigint := 0;
  v_gift_cards_compatible bigint := 0;
  v_gift_cards_issued bigint := 0;
  v_contact_visitors bigint := 0;
  v_whatsapp_clicks bigint := 0;
  v_email_clicks bigint := 0;
  v_phone_clicks bigint := 0;
  v_maps_clicks bigint := 0;
  v_form_open bigint := 0;
  v_form_started bigint := 0;
  v_form_steps bigint := 0;
  v_submit_attempt bigint := 0;
  v_validation_error bigint := 0;
  v_request_created bigint := 0;
  v_submit_success bigint := 0;
  v_submit_error bigint := 0;
  v_tracked_request_visitors bigint := 0;
  v_fast_start bigint := 0;
  v_fast_submit bigint := 0;
  v_fast_whatsapp bigint := 0;
  v_gift_view bigint := 0;
  v_gift_start bigint := 0;
  v_gift_created bigint := 0;
  v_gift_whatsapp bigint := 0;
  v_code_attempt bigint := 0;
  v_code_success bigint := 0;
  v_code_error bigint := 0;
  v_latest_submit_error timestamptz;
  v_latest_submit_success timestamptz;
  v_incident_state text := 'none';
  v_dimensions jsonb;
  v_experience jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_historical_website_requests bigint := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select tracking_contract_started_at, reporting_baseline_at
  into v_tracking_start, v_baseline
  from public.analytics_reporting_settings
  where id = 'default';

  if p_use_reporting_baseline and v_baseline is not null then
    if v_from is null or v_baseline > v_from then
      v_effective_from := v_baseline;
      v_baseline_applied := true;
    else
      v_effective_from := v_from;
    end if;
  else
    v_effective_from := v_from;
  end if;

  if p_from is not null and p_from >= v_to then
    raise exception 'Invalid analytics range';
  end if;
  if v_effective_from is not null and v_effective_from > v_to then
    v_effective_from := v_to;
  end if;

  v_funnel_from := case
    when v_effective_from is null then v_tracking_start
    else greatest(v_effective_from, v_tracking_start)
  end;

  with public_events as (
    select e.*
    from public.analytics_events e
    where (v_effective_from is null or e.occurred_at >= v_effective_from)
      and e.occurred_at < v_to
      and coalesce(e.path, '/') not like '/admin%'
      and coalesce(e.path, '/') not like '/api/%'
      and coalesce(e.section, '') not in ('admin', 'analytics', 'finance', 'cms', 'editor')
      and coalesce(e.metadata->>'cta_location', '') <> 'admin_preview_excluded'
  )
  select count(*),
         count(*) filter (where event_name = 'page_view'),
         count(*) filter (where event_name = 'page_view' and visitor_id is not null),
         count(distinct visitor_id) filter (where event_name = 'page_view' and visitor_id is not null),
         min(occurred_at), max(occurred_at)
  into v_events, v_page_views, v_pageviews_identified, v_visitors, v_first_event, v_last_event
  from public_events;

  select count(*),
         coalesce(avg(duration_seconds), 0),
         min(started_at), max(started_at)
  into v_sessions, v_average_engagement, v_first_session, v_last_session
  from public.analytics_sessions s
  where (v_effective_from is null or s.started_at >= v_effective_from)
    and s.started_at < v_to
    and coalesce(s.entry_path, '/') not like '/admin%'
    and coalesce(s.entry_path, '/') not like '/api/%';

  select count(*),
         count(*) filter (where coalesce(nullif(source, ''), 'website') in ('website', 'public_website', 'unknown') and created_by_admin is null),
         count(*) filter (where coalesce(nullif(source, ''), 'website') in ('website', 'public_website', 'unknown') and created_by_admin is null and created_at >= v_funnel_from),
         count(*) filter (
           where coalesce(nullif(source, ''), 'website') in ('website', 'public_website', 'unknown')
             and created_by_admin is null
             and (
               status in ('accepted', 'confirmed', 'completed')
               or lead_status in ('deposit_paid', 'confirmed', 'completed', 'review_requested', 'review_received')
             )
         ),
         count(*) filter (
           where coalesce(nullif(source, ''), 'website') in ('website', 'public_website', 'unknown')
             and created_by_admin is null
             and created_at >= v_funnel_from
             and (
               status in ('accepted', 'confirmed', 'completed')
               or lead_status in ('deposit_paid', 'confirmed', 'completed', 'review_requested', 'review_received')
             )
         ),
         count(*) filter (where source = 'booking_code' and created_by_admin is null),
         count(*) filter (where source = 'booking_code' and created_by_admin is null and created_at >= v_funnel_from),
         count(*) filter (
           where source = 'booking_code'
             and created_by_admin is null
             and (
               status in ('accepted', 'confirmed', 'completed')
               or lead_status in ('deposit_paid', 'confirmed', 'completed', 'review_requested', 'review_received')
             )
         ),
         count(*) filter (
           where source = 'booking_code'
             and created_by_admin is null
             and created_at >= v_funnel_from
             and (
               status in ('accepted', 'confirmed', 'completed')
               or lead_status in ('deposit_paid', 'confirmed', 'completed', 'review_requested', 'review_received')
             )
         ),
         count(*) filter (where source = 'manual' or created_by_admin is not null),
         count(*) filter (where coalesce(nullif(source, ''), 'website') in ('website', 'public_website', 'unknown') and created_by_admin is null and created_at < v_tracking_start)
  into v_booking_requests_total, v_website_requests, v_website_requests_compatible, v_website_confirmed, v_website_confirmed_compatible, v_booking_code_requests, v_booking_code_requests_compatible, v_booking_code_confirmed, v_booking_code_confirmed_compatible, v_admin_manual_requests, v_historical_website_requests
  from public.booking_requests
  where (v_effective_from is null or created_at >= v_effective_from)
    and created_at < v_to;

  select count(*),
         count(*) filter (where created_at >= v_funnel_from),
         count(*) filter (where status in ('paid', 'issued'))
  into v_gift_cards, v_gift_cards_compatible, v_gift_cards_issued
  from public.gift_card_requests
  where (v_effective_from is null or created_at >= v_effective_from)
    and created_at < v_to;

  with canonical as (
    select e.*,
      coalesce(
        nullif(e.metadata->>'booking_journey_id', ''),
        nullif(e.metadata->>'journey_id', ''),
        nullif(e.metadata->>'booking_request_id', ''),
        e.id::text
      ) as journey_key
    from public.analytics_events e
    where e.occurred_at >= v_funnel_from
      and e.occurred_at < v_to
      and coalesce(e.path, '/') not like '/admin%'
      and coalesce(e.path, '/') not like '/api/%'
  ), website as (
    select * from canonical
    where event_name in (
      'booking_form_open','booking_form_started','booking_form_step_completed',
      'booking_form_submit_attempt','booking_form_validation_error','booking_request_created',
      'booking_form_submit_success','booking_form_submit_error'
    )
      and coalesce(metadata->>'flow_type', 'booking_form') <> 'fast_request'
      and coalesce(metadata->>'form_type', 'booking_form') <> 'fast_request'
      and not (event_name = 'booking_request_created' and coalesce(metadata->>'source', '') = 'booking_code')
  ), fast as (
    select * from canonical
    where event_name in ('fast_request_start','fast_request_step_complete','fast_request_abandon','fast_request_whatsapp_click','fast_request_submit_attempt','fast_request_submit_success')
       or (event_name in ('form_journey_started','form_field_started','abandoned_form_detected','abandoned_form_recovered_whatsapp','form_submit_success')
           and coalesce(metadata->>'form_type', metadata->>'flow_type', '') = 'fast_request')
  ), gift as (
    select * from canonical
    where event_name in ('gift_card_view','gift_card_questionnaire_started','gift_card_questionnaire_step_completed','gift_card_request_created','gift_card_whatsapp_request_clicked')
  ), booking_code as (
    select *, case
      when event_name in ('booking_code_redeem_attempt','booking_code_submitted') then 'attempt'
      when event_name in ('booking_code_redeem_success','booking_code_redeemed') then 'success'
      when event_name in ('booking_code_redeem_error','booking_code_invalid') then 'error'
      else 'other' end as stage
    from canonical
    where event_name in ('booking_code_redeem_attempt','booking_code_submitted','booking_code_redeem_success','booking_code_redeemed','booking_code_redeem_error','booking_code_invalid')
  )
  select
    (select count(distinct journey_key) from website where event_name = 'booking_form_open'),
    (select count(distinct journey_key) from website where event_name = 'booking_form_started'),
    (select count(distinct journey_key) from website where event_name = 'booking_form_step_completed'),
    (select count(distinct journey_key) from website where event_name = 'booking_form_submit_attempt'),
    (select count(distinct journey_key) from website where event_name = 'booking_form_validation_error'),
    (select count(distinct journey_key) from website where event_name = 'booking_request_created'),
    (select count(distinct journey_key) from website where event_name = 'booking_form_submit_success'),
    (select count(distinct journey_key) from website where event_name = 'booking_form_submit_error'),
    (select count(distinct visitor_id) from website where event_name = 'booking_form_submit_success' and visitor_id is not null),
    (select count(distinct journey_key) from fast where event_name in ('fast_request_start','form_journey_started')),
    (select count(distinct journey_key) from fast where event_name in ('fast_request_submit_success','form_submit_success')),
    (select count(distinct journey_key) from fast where event_name in ('fast_request_whatsapp_click','abandoned_form_recovered_whatsapp')),
    (select count(distinct journey_key) from gift where event_name = 'gift_card_view'),
    (select count(distinct journey_key) from gift where event_name = 'gift_card_questionnaire_started'),
    (select count(distinct journey_key) from gift where event_name = 'gift_card_request_created'),
    (select count(distinct journey_key) from gift where event_name = 'gift_card_whatsapp_request_clicked'),
    (select count(distinct journey_key) from booking_code where stage = 'attempt'),
    (select count(distinct journey_key) from booking_code where stage = 'success'),
    (select count(distinct journey_key) from booking_code where stage = 'error')
  into v_form_open, v_form_started, v_form_steps, v_submit_attempt, v_validation_error, v_request_created, v_submit_success, v_submit_error, v_tracked_request_visitors,
       v_fast_start, v_fast_submit, v_fast_whatsapp, v_gift_view, v_gift_start, v_gift_created, v_gift_whatsapp,
       v_code_attempt, v_code_success, v_code_error;

  with public_events as (
    select e.*
    from public.analytics_events e
    where (v_effective_from is null or e.occurred_at >= v_effective_from)
      and e.occurred_at < v_to
      and coalesce(e.path, '/') not like '/admin%'
      and coalesce(e.path, '/') not like '/api/%'
  )
  select
    count(distinct visitor_id) filter (where event_name in ('whatsapp_click','email_click','phone_click','google_maps_click','maps_click','fast_request_whatsapp_click','gift_card_whatsapp_request_clicked') and visitor_id is not null),
    count(*) filter (where event_name in ('whatsapp_click','fast_request_whatsapp_click','gift_card_whatsapp_request_clicked')),
    count(*) filter (where event_name = 'email_click'),
    count(*) filter (where event_name = 'phone_click'),
    case
      when count(*) filter (where event_name = 'google_maps_click') > 0
        then count(*) filter (where event_name = 'google_maps_click')
      else count(*) filter (where event_name = 'maps_click')
    end
  into v_contact_visitors, v_whatsapp_clicks, v_email_clicks, v_phone_clicks, v_maps_clicks
  from public_events;

  select max(occurred_at) filter (where event_name = 'booking_form_submit_error'),
         max(occurred_at) filter (where event_name = 'booking_form_submit_success')
  into v_latest_submit_error, v_latest_submit_success
  from public.analytics_events
  where occurred_at >= v_funnel_from
    and occurred_at < v_to;

  if v_latest_submit_error is null then
    v_incident_state := 'none';
  elsif v_latest_submit_success is not null and v_latest_submit_success > v_latest_submit_error then
    v_incident_state := 'resolved';
  elsif v_to < now() - interval '1 hour' then
    v_incident_state := 'historical';
  elsif v_latest_submit_error >= now() - interval '24 hours' then
    v_incident_state := 'current_failure';
  else
    v_incident_state := 'retest_required';
  end if;

  with pageviews as (
    select *
    from public.analytics_events e
    where e.event_name = 'page_view'
      and (v_effective_from is null or e.occurred_at >= v_effective_from)
      and e.occurred_at < v_to
      and coalesce(e.path, '/') not like '/admin%'
      and coalesce(e.path, '/') not like '/api/%'
  )
  select jsonb_build_object(
    'devices', coalesce((select jsonb_object_agg(k, n) from (select coalesce(nullif(device_type,''),'unknown') k, count(*) n from pageviews group by 1) q), '{}'::jsonb),
    'browsers', coalesce((select jsonb_object_agg(k, n) from (select coalesce(nullif(browser,''),'unknown') k, count(*) n from pageviews group by 1) q), '{}'::jsonb),
    'operating_systems', coalesce((select jsonb_object_agg(k, n) from (select coalesce(nullif(operating_system,''),'unknown') k, count(*) n from pageviews group by 1) q), '{}'::jsonb),
    'countries', coalesce((select jsonb_object_agg(k, n) from (select coalesce(nullif(country_code,''),'unknown') k, count(*) n from pageviews group by 1) q), '{}'::jsonb),
    'cities', coalesce((select jsonb_object_agg(k, n) from (select coalesce(nullif(city,''),'unknown') k, count(*) n from pageviews group by 1) q), '{}'::jsonb),
    'languages', coalesce((select jsonb_object_agg(k, n) from (select coalesce(nullif(language,''),'unknown') k, count(*) n from pageviews group by 1) q), '{}'::jsonb),
    'top_pages', coalesce((select jsonb_object_agg(k, n) from (select coalesce(nullif(section,''), nullif(path,''), '/') k, count(*) n from pageviews group by 1) q), '{}'::jsonb),
    'traffic_sources', coalesce((select jsonb_object_agg(k, n) from (select public.analytics_normalize_traffic_source(traffic_source, referrer_domain, metadata) k, count(*) n from pageviews group by 1) q), '{}'::jsonb)
  ) into v_dimensions;

  with relevant as (
    select
      e.id,
      coalesce(nullif(e.metadata->>'experience_id',''), nullif(e.metadata->>'experience_slug',''), nullif(e.metadata->>'experience',''), 'unknown') as experience_id,
      e.event_name,
      e.visitor_id,
      e.metadata,
      e.occurred_at
    from public.analytics_events e
    where (v_effective_from is null or e.occurred_at >= v_effective_from)
      and e.occurred_at < v_to
      and e.event_name in ('experience_card_view','experience_detail_open','booking_form_open','booking_form_submit_success','whatsapp_click','email_click','phone_click')
      and coalesce(e.path, '/') not like '/admin%'
      and coalesce(e.path, '/') not like '/api/%'
  ), event_grouped as (
    select experience_id,
      count(*) filter (where event_name = 'experience_card_view') as card_impressions,
      count(*) filter (where event_name = 'experience_detail_open') as detail_opens,
      count(distinct visitor_id) filter (where event_name = 'experience_detail_open' and visitor_id is not null) as unique_detail_visitors,
      count(distinct coalesce(nullif(metadata->>'booking_journey_id',''), nullif(metadata->>'journey_id',''), id::text)) filter (where event_name = 'booking_form_open' and occurred_at >= v_funnel_from) as form_opens,
      count(distinct coalesce(nullif(metadata->>'booking_journey_id',''), nullif(metadata->>'journey_id',''), nullif(metadata->>'booking_request_id',''), id::text)) filter (where event_name = 'booking_form_submit_success' and occurred_at >= v_funnel_from) as tracked_successes,
      count(*) filter (where event_name in ('whatsapp_click','email_click','phone_click')) as contact_actions
    from relevant
    group by experience_id
  ), request_grouped as (
    select coalesce(nullif(experience_id, ''), 'unknown') as experience_id,
      count(*) as database_requests,
      count(*) filter (
        where status in ('accepted', 'confirmed', 'completed')
           or lead_status in ('deposit_paid', 'confirmed', 'completed', 'review_requested', 'review_received')
      ) as confirmed_database_requests
    from public.booking_requests
    where created_at >= v_funnel_from
      and created_at < v_to
      and coalesce(nullif(source, ''), 'website') in ('website', 'public_website', 'unknown')
      and created_by_admin is null
    group by 1
  ), experience_keys as (
    select experience_id from event_grouped
    union
    select experience_id from request_grouped
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'experience_id', k.experience_id,
    'card_impressions', coalesce(e.card_impressions, 0),
    'detail_opens', coalesce(e.detail_opens, 0),
    'unique_detail_visitors', coalesce(e.unique_detail_visitors, 0),
    'form_opens', coalesce(e.form_opens, 0),
    'tracked_successes', coalesce(e.tracked_successes, 0),
    'database_requests', coalesce(r.database_requests, 0),
    'confirmed_database_requests', coalesce(r.confirmed_database_requests, 0),
    'contact_actions', coalesce(e.contact_actions, 0),
    'coverage_status', case when v_effective_from is null or v_effective_from < v_tracking_start then 'mixed_history' else 'compatible' end
  ) order by coalesce(e.detail_opens, 0) desc, coalesce(r.database_requests, 0) desc), '[]'::jsonb)
  into v_experience
  from experience_keys k
  left join event_grouped e using (experience_id)
  left join request_grouped r using (experience_id)
  where k.experience_id <> 'unknown';

  if v_page_views > 0 and (v_pageviews_identified::numeric / v_page_views::numeric) < 0.95 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'severity', 'warning', 'code', 'visitor_id_coverage_low', 'count', v_page_views - v_pageviews_identified,
      'message', 'More than 5% of page views in this period do not carry a visitor_id; unique-visitor metrics may be understated.'
    ));
  end if;
  if v_to >= now() - interval '1 hour' and v_events > 0 and v_last_event < now() - interval '24 hours' then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'severity', 'warning', 'code', 'analytics_ingestion_stale', 'count', 1,
      'message', 'No public analytics event has been received in the last 24 hours; verify ingestion if traffic is expected.'
    ));
  end if;
  if v_visitors < 100 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'severity', 'diagnostic', 'code', 'small_sample', 'count', v_visitors,
      'message', 'Fewer than 100 approximate unique visitors; use this period for diagnostics, not strong marketing conclusions.'
    ));
  end if;
  if v_incident_state = 'current_failure' then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'severity', 'critical', 'code', 'public_booking_current_failure', 'count', 1,
      'message', 'A recent public booking submit error has no later canonical success.'
    ));
  elsif v_incident_state = 'retest_required' then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'severity', 'warning', 'code', 'public_booking_retest_required', 'count', 1,
      'message', 'The latest public booking submit error is older than 24 hours and has not yet been followed by a canonical success.'
    ));
  elsif v_incident_state = 'resolved' then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'severity', 'historical', 'code', 'public_booking_resolved_incident', 'count', 1,
      'message', 'A previous public booking submit error is followed by a later canonical success.'
    ));
  elsif v_incident_state = 'historical' then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'severity', 'historical', 'code', 'public_booking_historical_incident', 'count', 1,
      'message', 'This historical reporting period contains a submit error without a later success inside the same period; it is not a current operational incident.'
    ));
  end if;
  if v_submit_success > v_form_open and v_form_open > 0 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'severity', 'critical', 'code', 'incompatible_current_funnel', 'count', v_submit_success - v_form_open,
      'message', 'Canonical website submit successes exceed form opens for the compatible tracking window; conversion is withheld.'
    ));
  end if;
  if v_historical_website_requests > 0 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'severity', 'historical', 'code', 'historical_tracking_gap', 'count', v_historical_website_requests,
      'message', 'Website requests before the current tracking contract are retained as history and excluded from tracked-funnel conversion.'
    ));
  end if;

  return jsonb_build_object(
    'meta', jsonb_build_object(
      'contract_version', 1,
      'generated_at', now(),
      'requested_from', p_from,
      'requested_to', p_to,
      'effective_from', v_effective_from,
      'effective_to', v_to,
      'tracking_contract_started_at', v_tracking_start,
      'reporting_baseline_at', v_baseline,
      'baseline_applied', v_baseline_applied,
      'data_complete', true,
      'analytics_event_count', v_events,
      'analytics_session_count', v_sessions,
      'pageview_visitor_id_coverage_percent', case when v_page_views > 0 then round((v_pageviews_identified::numeric / v_page_views::numeric) * 100, 1) else null end,
      'first_event_at', v_first_event,
      'last_event_at', v_last_event,
      'first_session_at', v_first_session,
      'last_session_at', v_last_session
    ),
    'summary', jsonb_build_object(
      'approx_unique_visitors', v_visitors,
      'page_views', v_page_views,
      'sessions', v_sessions,
      'average_engagement_seconds', round(v_average_engagement),
      'booking_requests_total', v_booking_requests_total,
      'website_requests', v_website_requests,
      'website_requests_compatible', v_website_requests_compatible,
      'confirmed_website_requests', v_website_confirmed,
      'confirmed_website_requests_compatible', v_website_confirmed_compatible,
      'booking_code_requests', v_booking_code_requests,
      'confirmed_booking_code_requests', v_booking_code_confirmed,
      'confirmed_booking_code_requests_compatible', v_booking_code_confirmed_compatible,
      'booking_code_requests_compatible', v_booking_code_requests_compatible,
      'admin_manual_requests', v_admin_manual_requests,
      'gift_card_requests', v_gift_cards,
      'gift_cards_paid_or_issued', v_gift_cards_issued,
      'gift_card_requests_compatible', v_gift_cards_compatible,
      'contact_intent_visitors', v_contact_visitors,
      'tracked_request_visitors', v_tracked_request_visitors,
      'whatsapp_clicks', v_whatsapp_clicks,
      'email_clicks', v_email_clicks,
      'phone_clicks', v_phone_clicks,
      'maps_clicks', v_maps_clicks
    ),
    'funnels', jsonb_build_object(
      'website', jsonb_build_object(
        'form_opens', v_form_open,
        'form_starts', v_form_started,
        'step_completions', v_form_steps,
        'submit_attempts', v_submit_attempt,
        'validation_errors', v_validation_error,
        'request_created_events', v_request_created,
        'submit_successes', v_submit_success,
        'submit_errors', v_submit_error,
        'database_requests', v_website_requests_compatible,
        'coverage_status', case when v_effective_from is null or v_effective_from < v_tracking_start then 'mixed_history' else 'compatible' end
      ),
      'fast_request', jsonb_build_object(
        'starts', v_fast_start,
        'submit_successes', v_fast_submit,
        'whatsapp_outcomes', v_fast_whatsapp
      ),
      'gift_card', jsonb_build_object(
        'views', v_gift_view,
        'questionnaire_starts', v_gift_start,
        'request_created_events', v_gift_created,
        'whatsapp_outcomes', v_gift_whatsapp,
        'database_requests', v_gift_cards_compatible,
        'coverage_status', case when v_effective_from is null or v_effective_from < v_tracking_start then 'mixed_history' else 'compatible' end
      ),
      'booking_code', jsonb_build_object(
        'redeem_attempts', v_code_attempt,
        'redeem_successes', v_code_success,
        'redeem_errors', v_code_error,
        'database_requests', v_booking_code_requests_compatible,
        'coverage_status', case when v_effective_from is null or v_effective_from < v_tracking_start then 'mixed_history' else 'compatible' end
      )
    ),
    'rates', jsonb_build_object(
      'website_funnel_completion', case when v_form_open > 0 and v_submit_success <= v_form_open then round((v_submit_success::numeric / v_form_open::numeric) * 100, 1) else null end,
      'visitor_to_tracked_request', case when v_visitors > 0 and v_tracked_request_visitors <= v_visitors then round((v_tracked_request_visitors::numeric / v_visitors::numeric) * 100, 1) else null end,
      'confirmed_website_request_rate', case when v_website_requests_compatible > 0 and v_website_confirmed_compatible <= v_website_requests_compatible then round((v_website_confirmed_compatible::numeric / v_website_requests_compatible::numeric) * 100, 1) else null end,
      'booking_code_redeem_rate', case when v_code_attempt > 0 and v_code_success <= v_code_attempt then round((v_code_success::numeric / v_code_attempt::numeric) * 100, 1) else null end,
      'contact_intent_visitor_rate', case when v_visitors > 0 and v_contact_visitors <= v_visitors then round((v_contact_visitors::numeric / v_visitors::numeric) * 100, 1) else null end
    ),
    'dimensions', v_dimensions,
    'experience_demand', v_experience,
    'integrity', jsonb_build_object(
      'submit_incident_state', v_incident_state,
      'latest_submit_error_at', v_latest_submit_error,
      'latest_submit_success_at', v_latest_submit_success,
      'historical_website_requests_before_contract', v_historical_website_requests,
      'warnings', v_warnings
    )
  );
end;
$$;

revoke all on function public.get_analytics_reporting_settings() from public, anon;
revoke all on function public.set_analytics_reporting_baseline(timestamptz) from public, anon;
revoke all on function public.clear_analytics_reporting_baseline() from public, anon;
revoke all on function public.get_admin_analytics_summary(timestamptz, timestamptz, boolean) from public, anon;

grant execute on function public.get_analytics_reporting_settings() to authenticated, service_role;
grant execute on function public.set_analytics_reporting_baseline(timestamptz) to authenticated, service_role;
grant execute on function public.clear_analytics_reporting_baseline() to authenticated, service_role;
grant execute on function public.get_admin_analytics_summary(timestamptz, timestamptz, boolean) to authenticated, service_role;

commit;
