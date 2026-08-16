-- Manual production setup: database-triggered request notifications.
-- Prerequisites in Supabase Vault (names only; never commit values):
--   vulcaniq_supabase_url
--   request_notification_webhook_secret
-- Deploy the notify-new-request Edge Function before running this file.

begin;

create extension if not exists pg_net with schema extensions;

create or replace function public.dispatch_request_notification_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_url text;
  webhook_secret text;
  request_id bigint;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'vulcaniq_supabase_url'
  limit 1;

  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'request_notification_webhook_secret'
  limit 1;

  if nullif(btrim(project_url), '') is null or nullif(btrim(webhook_secret), '') is null then
    raise warning 'vulcanIQ notification webhook skipped: Vault configuration is incomplete';
    return new;
  end if;

  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/notify-new-request',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-vulcaniq-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new)
    ),
    timeout_milliseconds := 10000
  ) into request_id;

  return new;
exception when others then
  -- Request creation is authoritative. Notification dispatch must never roll it back.
  raise warning 'vulcanIQ notification webhook dispatch failed for %.%', tg_table_schema, tg_table_name;
  return new;
end;
$$;

revoke all on function public.dispatch_request_notification_webhook() from public, anon, authenticated;

-- Only public website rows require automatic notification. Admin-created records
-- should use their existing operational workflow unless explicitly enabled later.
drop trigger if exists booking_requests_notify_after_insert on public.booking_requests;
create trigger booking_requests_notify_after_insert
after insert on public.booking_requests
for each row
when (new.created_by_admin is null and new.source = 'website')
execute function public.dispatch_request_notification_webhook();

drop trigger if exists gift_card_requests_notify_after_insert on public.gift_card_requests;
create trigger gift_card_requests_notify_after_insert
after insert on public.gift_card_requests
for each row
when (new.created_by is null)
execute function public.dispatch_request_notification_webhook();

commit;
