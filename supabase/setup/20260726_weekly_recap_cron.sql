-- Manual production setup: DST-safe Monday 08:00 Europe/Rome weekly recap.
-- Prerequisites in Supabase Vault (names only; never commit values):
--   vulcaniq_supabase_url
--   weekly_recap_cron_secret
-- Deploy the send-weekly-admin-recap Edge Function before running this file.
--
-- Two UTC invocations are scheduled because Europe/Rome alternates between
-- UTC+1 and UTC+2. The Edge Function sends only when local Rome time is Monday
-- 08:00-08:14 and idempotency prevents duplicate reports.

begin;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_weekly_admin_recap()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  project_url text;
  cron_secret text;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'vulcaniq_supabase_url'
  limit 1;

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'weekly_recap_cron_secret'
  limit 1;

  if nullif(btrim(project_url), '') is null or nullif(btrim(cron_secret), '') is null then
    raise warning 'vulcanIQ weekly recap skipped: Vault configuration is incomplete';
    return;
  end if;

  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/send-weekly-admin-recap',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-vulcaniq-cron-secret', cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
exception when others then
  raise warning 'vulcanIQ weekly recap cron dispatch failed';
end;
$$;

revoke all on function public.invoke_weekly_admin_recap() from public, anon, authenticated;

-- Remove prior jobs with these names so rerunning this setup remains idempotent.
do $$
declare job record;
begin
  for job in select jobid from cron.job where jobname in ('vulcaniq-weekly-recap-summer', 'vulcaniq-weekly-recap-winter') loop
    perform cron.unschedule(job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'vulcaniq-weekly-recap-summer',
  '0 6 * * 1',
  $cron$select public.invoke_weekly_admin_recap();$cron$
);

select cron.schedule(
  'vulcaniq-weekly-recap-winter',
  '0 7 * * 1',
  $cron$select public.invoke_weekly_admin_recap();$cron$
);

commit;
