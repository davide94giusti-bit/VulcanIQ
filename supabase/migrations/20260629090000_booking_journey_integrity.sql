-- Follow-up analytics integrity and mobile funnel hardening support.
-- Adds stable booking journey metadata to request rows and keeps event policy/schema aligned.

alter table public.booking_requests add column if not exists selected_month text;
alter table public.booking_requests add column if not exists utm_term text;
alter table public.booking_requests add column if not exists analytics_session_id text;
alter table public.booking_requests add column if not exists analytics_visitor_id text;
alter table public.booking_requests add column if not exists analytics_journey_id text;
alter table public.booking_requests add column if not exists booking_journey_version text;
alter table public.booking_requests add column if not exists device_type text;
alter table public.booking_requests add column if not exists browser text;
alter table public.booking_requests add column if not exists operating_system text;

create index if not exists booking_requests_analytics_session_id_idx on public.booking_requests(analytics_session_id);
create index if not exists booking_requests_analytics_visitor_id_idx on public.booking_requests(analytics_visitor_id);
create index if not exists booking_requests_analytics_journey_id_idx on public.booking_requests(analytics_journey_id);
create index if not exists booking_requests_selected_month_idx on public.booking_requests(selected_month);
create index if not exists booking_requests_utm_term_idx on public.booking_requests(utm_term);

alter table public.analytics_events
  drop constraint if exists analytics_events_event_name_check;

alter table public.analytics_events
  add constraint analytics_events_event_name_check
  check (
    event_name in (
      'page_view',
      'language_switch',
      'excursion_view',
      'experience_card_view',
      'experience_detail_open',
      'calendar_date_select',
      'booking_form_open',
      'booking_form_field_start',
      'request_details_open',
      'fixed_excursion_options_open',
      'private_excursion_options_open',
      'fixed_leaflet_open_from_request',
      'private_excursion_detail_open_from_request',
      'booking_form_submit_attempt',
      'booking_form_validation_error',
      'booking_form_submit_success',
      'booking_form_submit_error',
      'booking_submit',
      'booking_submit_attempt',
      'booking_submit_validation_error',
      'booking_submit_success',
      'booking_submit_error',
      'booking_request_created',
      'whatsapp_click',
      'email_click',
      'phone_click',
      'google_maps_click',
      'maps_click',
      'meeting_point_maps_click',
      'review_view',
      'session_start',
      'session_heartbeat',
      'session_end'
    )
  );

drop policy if exists "Public can insert analytics events" on public.analytics_events;
create policy "Public can insert analytics events"
on public.analytics_events
for insert
to anon, authenticated
with check (
  event_name in (
    'page_view',
    'language_switch',
    'excursion_view',
    'experience_card_view',
    'experience_detail_open',
    'calendar_date_select',
    'booking_form_open',
    'booking_form_field_start',
    'request_details_open',
    'fixed_excursion_options_open',
    'private_excursion_options_open',
    'fixed_leaflet_open_from_request',
    'private_excursion_detail_open_from_request',
    'booking_form_submit_attempt',
    'booking_form_validation_error',
    'booking_form_submit_success',
    'booking_form_submit_error',
    'booking_submit',
    'booking_submit_attempt',
    'booking_submit_validation_error',
    'booking_submit_success',
    'booking_submit_error',
    'booking_request_created',
    'whatsapp_click',
    'email_click',
    'phone_click',
    'google_maps_click',
    'maps_click',
    'meeting_point_maps_click',
    'review_view',
    'session_start',
    'session_heartbeat',
    'session_end'
  )
  and coalesce(metadata, '{}'::jsonb) = metadata
  and not (metadata ? 'name')
  and not (metadata ? 'email')
  and not (metadata ? 'phone')
  and not (metadata ? 'message')
  and not (metadata ? 'customer_name')
  and not (metadata ? 'customer_email')
  and not (metadata ? 'customer_phone')
);

create or replace function public.create_public_booking_request(request_payload jsonb)
returns table(id uuid, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.booking_requests%rowtype;
  raw_request_type text := nullif(btrim(coalesce(request_payload->>'request_type', 'private')), '');
  raw_heard_about_us text := nullif(btrim(coalesce(request_payload->>'heard_about_us', '')), '');
begin
  if request_payload is null or jsonb_typeof(request_payload) <> 'object' then
    raise exception 'Invalid booking request payload';
  end if;

  if raw_request_type is null or raw_request_type not in ('private', 'fixed') then
    raw_request_type := 'private';
  end if;

  if raw_heard_about_us = 'not_specified' then
    raw_heard_about_us := null;
  end if;

  insert into public.booking_requests (
    customer_name,
    customer_email,
    customer_phone,
    preferred_contact,
    experience_id,
    requested_date,
    alternative_date,
    language,
    party_type,
    request_type,
    fixed_excursion_id,
    booking_code,
    adults,
    children,
    children_under_3,
    private_experience,
    main_interest,
    preferred_pace,
    message,
    heard_about_us,
    heard_about_us_label,
    heard_about_us_detail,
    source,
    source_section,
    source_cta,
    cta_location,
    selected_date,
    selected_month,
    has_fixed_excursion,
    traffic_source,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    analytics_session_id,
    analytics_visitor_id,
    analytics_journey_id,
    booking_journey_version,
    device_type,
    browser,
    operating_system,
    status,
    created_by_admin
  ) values (
    nullif(btrim(coalesce(request_payload->>'customer_name', '')), ''),
    nullif(btrim(coalesce(request_payload->>'customer_email', '')), ''),
    nullif(btrim(coalesce(request_payload->>'customer_phone', '')), ''),
    coalesce(nullif(btrim(coalesce(request_payload->>'preferred_contact', '')), ''), 'unknown'),
    coalesce(nullif(btrim(coalesce(request_payload->>'experience_id', '')), ''), 'unsure'),
    nullif(btrim(coalesce(request_payload->>'requested_date', '')), '')::date,
    nullif(btrim(coalesce(request_payload->>'alternative_date', '')), '')::date,
    coalesce(nullif(btrim(coalesce(request_payload->>'language', '')), ''), 'it'),
    nullif(btrim(coalesce(request_payload->>'party_type', '')), ''),
    raw_request_type,
    nullif(btrim(coalesce(request_payload->>'fixed_excursion_id', '')), '')::uuid,
    nullif(btrim(coalesce(request_payload->>'booking_code', '')), ''),
    nullif(btrim(coalesce(request_payload->>'adults', '')), '')::integer,
    nullif(btrim(coalesce(request_payload->>'children', '')), '')::integer,
    coalesce((request_payload->>'children_under_3')::boolean, false),
    case when request_payload ? 'private_experience' then (request_payload->>'private_experience')::boolean else raw_request_type = 'private' end,
    nullif(btrim(coalesce(request_payload->>'main_interest', '')), ''),
    nullif(btrim(coalesce(request_payload->>'preferred_pace', '')), ''),
    nullif(btrim(coalesce(request_payload->>'message', '')), ''),
    raw_heard_about_us,
    nullif(btrim(coalesce(request_payload->>'heard_about_us_label', '')), ''),
    nullif(btrim(coalesce(request_payload->>'heard_about_us_detail', '')), ''),
    'website',
    nullif(btrim(coalesce(request_payload->>'source_section', '')), ''),
    nullif(btrim(coalesce(request_payload->>'source_cta', '')), ''),
    nullif(btrim(coalesce(request_payload->>'cta_location', '')), ''),
    nullif(btrim(coalesce(request_payload->>'selected_date', '')), '')::date,
    nullif(btrim(coalesce(request_payload->>'selected_month', '')), ''),
    coalesce((request_payload->>'has_fixed_excursion')::boolean, raw_request_type = 'fixed'),
    nullif(btrim(coalesce(request_payload->>'traffic_source', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_source', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_medium', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_campaign', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_content', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_term', '')), ''),
    nullif(btrim(coalesce(request_payload->>'analytics_session_id', request_payload->>'session_id', '')), ''),
    nullif(btrim(coalesce(request_payload->>'analytics_visitor_id', request_payload->>'visitor_id', '')), ''),
    nullif(btrim(coalesce(request_payload->>'analytics_journey_id', request_payload->>'booking_journey_id', '')), ''),
    nullif(btrim(coalesce(request_payload->>'booking_journey_version', '')), ''),
    nullif(btrim(coalesce(request_payload->>'device_type', '')), ''),
    nullif(btrim(coalesce(request_payload->>'browser', '')), ''),
    nullif(btrim(coalesce(request_payload->>'operating_system', '')), ''),
    'pending',
    null
  ) returning * into inserted;

  return query select inserted.id, inserted.status, inserted.created_at;
end;
$$;

revoke all on function public.create_public_booking_request(jsonb) from public;
grant execute on function public.create_public_booking_request(jsonb) to anon, authenticated;
