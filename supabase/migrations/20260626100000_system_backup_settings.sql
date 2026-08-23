-- Owner-controlled backup schedule settings.
-- Run this migration before using the editable Backup schedule UI.

create table if not exists public.system_backup_settings (
  id text primary key default 'default',
  enabled boolean not null default true,
  frequency text not null default 'daily',
  utc_hour integer not null default 2,
  utc_minute integer not null default 0,
  weekly_day integer,
  monthly_day integer,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  last_scheduled_backup_at timestamptz,
  constraint system_backup_settings_singleton check (id = 'default'),
  constraint system_backup_settings_frequency_check check (frequency in ('daily', 'weekly', 'monthly')),
  constraint system_backup_settings_utc_hour_check check (utc_hour between 0 and 23),
  constraint system_backup_settings_utc_minute_check check (utc_minute between 0 and 59),
  constraint system_backup_settings_weekly_day_check check (weekly_day is null or weekly_day between 0 and 6),
  constraint system_backup_settings_monthly_day_check check (monthly_day is null or monthly_day between 1 and 28)
);

drop trigger if exists system_backup_settings_set_updated_at on public.system_backup_settings;
create trigger system_backup_settings_set_updated_at
before update on public.system_backup_settings
for each row execute function public.set_updated_at();

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles ap
    where ap.user_id = auth.uid()
      and ap.active = true
      and ap.role = 'owner'
  );
$$;

insert into public.system_backup_settings (id, enabled, frequency, utc_hour, utc_minute, weekly_day, monthly_day)
values ('default', true, 'daily', 2, 0, null, null)
on conflict (id) do nothing;

alter table public.system_backup_settings enable row level security;

drop policy if exists "Owners can read backup settings" on public.system_backup_settings;
create policy "Owners can read backup settings"
on public.system_backup_settings
for select
to authenticated
using (public.is_owner());

drop policy if exists "Owners can manage backup settings" on public.system_backup_settings;
create policy "Owners can manage backup settings"
on public.system_backup_settings
for all
to authenticated
using (public.is_owner())
with check (public.is_owner());

revoke all on public.system_backup_settings from anon;
grant select, insert, update on public.system_backup_settings to authenticated;
grant execute on function public.is_owner() to authenticated;
