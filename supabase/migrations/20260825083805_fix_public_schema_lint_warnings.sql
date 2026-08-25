alter function public.safe_date(text)
stable;

alter function public.safe_timestamptz(text)
stable;

create or replace function public.get_admin_operational_safeguards()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  notification_activation constant timestamptz :=
    timestamptz '2026-07-27 00:00:00+00';
  booking_active_not_sent bigint;
  gift_active_not_sent bigint;
  booking_historical bigint;
  gift_historical bigint;
  booking_failed bigint;
  gift_failed bigint;
begin
  if not public.is_privileged_admin() then
    raise exception 'Not authorized';
  end if;

  select count(*) into booking_active_not_sent
  from public.booking_requests
  where notification_email_status = 'not_sent'
    and created_at >= notification_activation
    and created_at < now() - interval '10 minutes'
    and source = 'website'
    and created_by_admin is null;

  select count(*) into gift_active_not_sent
  from public.gift_card_requests
  where notification_email_status = 'not_sent'
    and created_at >= notification_activation
    and created_at < now() - interval '10 minutes'
    and created_by is null;

  select count(*) into booking_historical
  from public.booking_requests
  where notification_email_status = 'not_sent'
    and (
      created_at < notification_activation
      or coalesce(source, '') <> 'website'
      or created_by_admin is not null
    );

  select count(*) into gift_historical
  from public.gift_card_requests
  where notification_email_status = 'not_sent'
    and (
      created_at < notification_activation
      or created_by is not null
    );

  select count(*) into booking_failed
  from public.booking_requests
  where notification_email_status = 'failed'
    and created_at >= notification_activation
    and source = 'website'
    and created_by_admin is null;

  select count(*) into gift_failed
  from public.gift_card_requests
  where notification_email_status = 'failed'
    and created_at >= notification_activation
    and created_by is null;

  return jsonb_build_object(
    'safeguard_version', 2,
    'notification_activation_at', notification_activation,
    'pending_requests', (
      select count(*)
      from public.booking_requests
      where status = 'pending'
    ),
    'pending_over_12h', (
      select count(*)
      from public.booking_requests
      where status = 'pending'
        and created_at < now() - interval '12 hours'
    ),
    'pending_over_24h', (
      select count(*)
      from public.booking_requests
      where status = 'pending'
        and created_at < now() - interval '24 hours'
    ),
    'failed_notifications', booking_failed + gift_failed,
    'notifications_not_sent', booking_active_not_sent + gift_active_not_sent,
    'notifications_historical_excluded', booking_historical + gift_historical,
    'gift_cards_missing_code', (
      select count(*)
      from public.gift_card_requests
      where status in ('paid', 'issued')
        and booking_code_id is null
        and nullif(booking_code, '') is null
    ),
    'upcoming_unconfirmed_72h', (
      select count(*)
      from public.booking_requests
      where status = 'pending'
        and requested_date between current_date and (current_date + 3)
    ),
    'weekly_report_failures', (
      select count(*)
      from public.admin_weekly_reports
      where status = 'failed'
        and generated_at >= now() - interval '14 days'
    ),
    'generated_at', now()
  );
end;
$$;

revoke all
on function public.get_admin_operational_safeguards()
from public, anon;

grant execute
on function public.get_admin_operational_safeguards()
to authenticated;
