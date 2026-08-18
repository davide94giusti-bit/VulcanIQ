-- Manual production setup: daily Google Business Profile review refresh.
-- Prerequisites in Supabase Vault (names only; never commit values):
--   vulcaniq_supabase_url
--   google_reviews_sync_secret
-- Deploy google-reviews-sync with --no-verify-jwt before running this setup.

begin;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_google_reviews_sync()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  project_url text;
  sync_secret text;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'vulcaniq_supabase_url'
  limit 1;

  select decrypted_secret into sync_secret
  from vault.decrypted_secrets
  where name = 'google_reviews_sync_secret'
  limit 1;

  if nullif(btrim(project_url), '') is null or nullif(btrim(sync_secret), '') is null then
    raise warning 'vulcanIQ Google review sync skipped: Vault configuration is incomplete';
    return;
  end if;

  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/google-reviews-sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-vulcaniq-google-reviews-sync-secret', sync_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
exception when others then
  raise warning 'vulcanIQ Google review sync cron dispatch failed';
end;
$$;

revoke all on function public.invoke_google_reviews_sync() from public, anon, authenticated;

do $$
declare job record;
begin
  for job in select jobid from cron.job where jobname = 'vulcaniq-google-reviews-daily' loop
    perform cron.unschedule(job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'vulcaniq-google-reviews-daily',
  '17 3 * * *',
  $cron$select public.invoke_google_reviews_sync();$cron$
);

commit;
