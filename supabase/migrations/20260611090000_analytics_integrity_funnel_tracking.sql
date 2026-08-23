-- Analytics integrity fixes for booking funnel, CTA attribution, and request context.
-- Safe to run more than once. Does not delete existing data.

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

alter table public.booking_requests add column if not exists source_section text;
alter table public.booking_requests add column if not exists source_cta text;
alter table public.booking_requests add column if not exists cta_location text;
alter table public.booking_requests add column if not exists selected_date date;
alter table public.booking_requests add column if not exists has_fixed_excursion boolean not null default false;
alter table public.booking_requests add column if not exists traffic_source text;
alter table public.booking_requests add column if not exists utm_source text;
alter table public.booking_requests add column if not exists utm_medium text;
alter table public.booking_requests add column if not exists utm_campaign text;
alter table public.booking_requests add column if not exists utm_content text;

create index if not exists booking_requests_source_section_idx on public.booking_requests(source_section);
create index if not exists booking_requests_cta_location_idx on public.booking_requests(cta_location);
create index if not exists booking_requests_traffic_source_idx on public.booking_requests(traffic_source);
create index if not exists booking_requests_utm_source_idx on public.booking_requests(utm_source);
