-- Reconcile schema objects that were applied outside migration history or added
-- to historical migration files after their Production versions were recorded.
-- Forward-only and data-preserving: no customer-data backfill is performed.

begin;

-- These fields originated in committed standalone SQL and are required by the
-- current availability service and admin UI.
alter table public.fixed_excursions
  add column if not exists program_it text,
  add column if not exists program_en text,
  add column if not exists meeting_point_maps_url text,
  add column if not exists leaflet_file_url_it text,
  add column if not exists leaflet_file_path_it text,
  add column if not exists leaflet_file_name_it text,
  add column if not exists leaflet_file_type_it text,
  add column if not exists leaflet_file_url_en text,
  add column if not exists leaflet_file_path_en text,
  add column if not exists leaflet_file_name_en text,
  add column if not exists leaflet_file_type_en text;

alter table public.monthly_availability_leaflets
  add column if not exists description_it text,
  add column if not exists description_en text,
  add column if not exists notes_it text,
  add column if not exists notes_en text,
  add column if not exists leaflet_file_url_it text,
  add column if not exists leaflet_file_path_it text,
  add column if not exists leaflet_file_name_it text,
  add column if not exists leaflet_file_type_it text,
  add column if not exists leaflet_file_url_en text,
  add column if not exists leaflet_file_path_en text,
  add column if not exists leaflet_file_name_en text,
  add column if not exists leaflet_file_type_en text;

-- Retain compatibility with the backup endpoint's earlier schedule field.
alter table public.system_backup_settings
  add column if not exists last_backup_at timestamptz;

-- Refuse to install the relationship invariant over unexplained orphan data.
do $$
begin
  if exists (
    select 1
    from public.gift_card_requests gift
    left join public.booking_codes code on code.id = gift.booking_code_id
    where gift.booking_code_id is not null
      and code.id is null
  ) then
    raise exception 'Cannot add Gift Card booking-code foreign key: orphan booking_code_id values exist';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.gift_card_requests'::regclass
      and conname = 'gift_card_requests_booking_code_id_fkey'
      and contype = 'f'
  ) then
    alter table public.gift_card_requests
      add constraint gift_card_requests_booking_code_id_fkey
      foreign key (booking_code_id)
      references public.booking_codes(id)
      on delete set null;
  end if;
end;
$$;

-- A Gift Card request may own at most one booking code. Check existing data
-- explicitly so an unexpected Production state fails visibly rather than being
-- hidden by an idempotency guard.
do $$
declare
  duplicate_request_id uuid;
begin
  select gift_card_request_id
  into duplicate_request_id
  from public.booking_codes
  where gift_card_request_id is not null
  group by gift_card_request_id
  having count(*) > 1
  limit 1;

  if duplicate_request_id is not null then
    raise exception 'Cannot enforce one booking code per Gift Card request: duplicate found for %', duplicate_request_id;
  end if;
end;
$$;

-- Keep one canonical index for each lookup direction. The unique partial index
-- also serves booking_codes(gift_card_request_id) lookups.
drop index if exists public.booking_codes_gift_card_request_idx;
drop index if exists public.booking_codes_gift_card_request_id_idx;

create unique index if not exists booking_codes_one_per_gift_card_request_idx
on public.booking_codes(gift_card_request_id)
where gift_card_request_id is not null;

create index if not exists gift_card_requests_booking_code_id_idx
on public.gift_card_requests(booking_code_id);

create index if not exists booking_requests_utm_source_idx
on public.booking_requests(utm_source);

-- Recreate the intended timestamp trigger if an earlier Production draft did
-- not install it.
drop trigger if exists system_backup_settings_set_updated_at on public.system_backup_settings;
create trigger system_backup_settings_set_updated_at
before update on public.system_backup_settings
for each row execute function public.set_updated_at();

-- Normalize the review RPC's hardened path without replacing its body.
alter function public.submit_public_review(text, text, text, integer, text)
  set search_path = public, pg_temp;

-- Migrate the weekly dispatch function, but intentionally do not create or
-- schedule any pg_cron job.
create or replace function public.invoke_weekly_admin_recap()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
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

revoke all on function public.invoke_weekly_admin_recap()
from public, anon, authenticated, service_role;

-- Reconcile the manually installed Gift Card request notification trigger.
drop trigger if exists gift_card_requests_notify_after_insert on public.gift_card_requests;
create trigger gift_card_requests_notify_after_insert
after insert on public.gift_card_requests
for each row
when (new.created_by is null)
execute function public.dispatch_request_notification_webhook();

-- Public fixed excursions expose the fields consumed by the public client.
drop view if exists public.public_fixed_excursions;
create view public.public_fixed_excursions as
select
  fe.id,
  fe.date,
  fe.start_time,
  fe.end_time,
  fe.experience_id,
  fe.title_it,
  fe.title_en,
  fe.description_it,
  fe.description_en,
  fe.program_it,
  fe.program_en,
  fe.meeting_point_it,
  fe.meeting_point_en,
  fe.meeting_point_maps_url,
  fe.difficulty_it,
  fe.difficulty_en,
  fe.price_note_it,
  fe.price_note_en,
  fe.blocked_dates_file_url,
  fe.blocked_dates_file_name,
  fe.blocked_dates_file_type,
  fe.blocked_dates_file_path,
  fe.leaflet_file_url_it,
  fe.leaflet_file_path_it,
  fe.leaflet_file_name_it,
  fe.leaflet_file_type_it,
  fe.leaflet_file_url_en,
  fe.leaflet_file_path_en,
  fe.leaflet_file_name_en,
  fe.leaflet_file_type_en,
  fe.leaflet_id,
  fe.status,
  fe.public_visibility,
  fe.capacity,
  fe.note_it,
  fe.note_en,
  fe.active,
  coalesce(sum(coalesce(br.adults, 0) + coalesce(br.children, 0)) filter (where br.status = 'accepted'), 0)::integer as accepted_count,
  greatest(fe.capacity - coalesce(sum(coalesce(br.adults, 0) + coalesce(br.children, 0)) filter (where br.status = 'accepted'), 0), 0)::integer as places_remaining
from public.fixed_excursions fe
left join public.booking_requests br
  on br.fixed_excursion_id = fe.id
  and br.request_type = 'fixed'
where fe.active = true
  and fe.public_visibility = true
  and fe.status = 'available'
group by fe.id;

-- Raw legacy monthly file_path/file_name values remain admin-only. The
-- language-specific paths/names are required by the current public client.
drop view if exists public.public_monthly_availability_leaflets;
create view public.public_monthly_availability_leaflets as
select
  id,
  month,
  year,
  title_it,
  title_en,
  description_it,
  description_en,
  notes_it,
  notes_en,
  file_url,
  file_type,
  leaflet_file_url_it,
  leaflet_file_path_it,
  leaflet_file_name_it,
  leaflet_file_type_it,
  leaflet_file_url_en,
  leaflet_file_path_en,
  leaflet_file_name_en,
  leaflet_file_type_en,
  active
from public.monthly_availability_leaflets
where active = true;

-- Normalize backup policy structure to the owner predicate used by the app.
-- No DELETE policy is intentionally created.
drop policy if exists "Active owners can read backup settings" on public.system_backup_settings;
drop policy if exists "Active owners can insert backup settings" on public.system_backup_settings;
drop policy if exists "Active owners can update backup settings" on public.system_backup_settings;
drop policy if exists "Owners can read backup settings" on public.system_backup_settings;
drop policy if exists "Owners can manage backup settings" on public.system_backup_settings;

create policy "Owners can read backup settings"
on public.system_backup_settings
for select to authenticated
using (public.is_owner());

create policy "Owners can insert backup settings"
on public.system_backup_settings
for insert to authenticated
with check (public.is_owner());

create policy "Owners can update backup settings"
on public.system_backup_settings
for update to authenticated
using (public.is_owner())
with check (public.is_owner());

-- A public-schema-only Production snapshot does not contain Storage data.
-- Reconcile only the repository's named public bucket and leave all others
-- untouched.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vulcaniq-public-assets',
  'vulcaniq-public-assets',
  true,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm'
  ]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';

commit;
