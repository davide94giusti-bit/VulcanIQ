-- Expand privacy-safe analytics event names for funnel diagnostics and drill-downs.
-- Safe to run more than once. Does not delete analytics history.

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
      'request_details_open',
      'fixed_excursion_options_open',
      'private_excursion_options_open',
      'fixed_leaflet_open_from_request',
      'private_excursion_detail_open_from_request',
      'booking_submit',
      'booking_submit_attempt',
      'booking_submit_validation_error',
      'booking_submit_success',
      'booking_submit_error',
      'booking_request_created',
      'whatsapp_click',
      'email_click',
      'phone_click',
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
    'booking_submit',
    'booking_submit_attempt',
    'booking_submit_validation_error',
    'booking_submit_success',
    'booking_submit_error',
    'booking_request_created',
    'whatsapp_click',
    'email_click',
    'phone_click',
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
