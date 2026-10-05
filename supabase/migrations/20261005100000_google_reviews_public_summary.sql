-- Google Business Profile public summary contract.
-- Stores only Google's authoritative aggregate fields alongside the existing
-- temporary provider-cache state. No native review rows are changed.

begin;

alter table public.google_reviews_sync_state
  add column if not exists average_rating numeric,
  add column if not exists total_review_count integer,
  add column if not exists summary_expires_at timestamptz;

alter table public.google_reviews_sync_state
  drop constraint if exists google_reviews_sync_state_average_rating_check;
alter table public.google_reviews_sync_state
  add constraint google_reviews_sync_state_average_rating_check
  check (average_rating is null or average_rating between 1 and 5);

alter table public.google_reviews_sync_state
  drop constraint if exists google_reviews_sync_state_total_review_count_check;
alter table public.google_reviews_sync_state
  add constraint google_reviews_sync_state_total_review_count_check
  check (total_review_count is null or total_review_count >= 0);

create or replace function public.get_public_google_reviews_summary()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when s.status = 'connected'
      and s.summary_expires_at > now()
      and s.total_review_count is not null
    then jsonb_build_object(
      'available', true,
      'average_rating', s.average_rating,
      'total_review_count', s.total_review_count,
      'refreshed_at', s.last_success_at,
      'expires_at', s.summary_expires_at
    )
    else jsonb_build_object('available', false)
  end
  from public.google_reviews_sync_state s
  where s.id = 'google_business_profile';
$$;

revoke all on function public.get_public_google_reviews_summary() from public;
grant execute on function public.get_public_google_reviews_summary() to anon, authenticated;

create or replace function public.get_google_reviews_sync_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  state_row public.google_reviews_sync_state%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = 'P0001';
  end if;

  select * into state_row
  from public.google_reviews_sync_state
  where id = 'google_business_profile';

  return jsonb_build_object(
    'status', coalesce(state_row.status, 'not_configured'),
    'location_resource_name', state_row.location_resource_name,
    'last_attempt_at', state_row.last_attempt_at,
    'last_success_at', state_row.last_success_at,
    'last_error_at', state_row.last_error_at,
    'last_error_code', state_row.last_error_code,
    'average_rating', state_row.average_rating,
    'total_review_count', state_row.total_review_count,
    'summary_expires_at', state_row.summary_expires_at
  );
end;
$$;

revoke all on function public.get_google_reviews_sync_status() from public, anon;
grant execute on function public.get_google_reviews_sync_status() to authenticated;

notify pgrst, 'reload schema';

commit;
