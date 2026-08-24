-- Normalize application privileges after historical Production default ACLs
-- granted broader capabilities than the committed migration intent.
-- Grants are explicit and least-privilege; no GRANT ALL is used.

begin;

-- New objects created by the migration owner must opt into client access.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all privileges on functions from public, anon, authenticated, service_role;

-- Remove inherited historical grants, including TRUNCATE, REFERENCES, TRIGGER,
-- and MAINTAIN, before rebuilding the exact relation capability matrix.
revoke all privileges on table
  public.activity_log,
  public.admin_profiles,
  public.admin_weekly_reports,
  public.analytics_events,
  public.analytics_reporting_settings,
  public.analytics_sessions,
  public.availability_blocks,
  public.booking_codes,
  public.booking_requests,
  public.customer_referral_codes,
  public.endpoint_rate_limits,
  public.finance_entries,
  public.fixed_excursions,
  public.gift_card_requests,
  public.google_reviews_cache,
  public.google_reviews_sync_state,
  public.monthly_availability_leaflets,
  public.partner_commissions,
  public.partner_referrals,
  public.partnerships,
  public.referral_codes,
  public.request_notification_log,
  public.reviews,
  public.site_content,
  public.site_media,
  public.system_backup_settings,
  public.public_availability_blocks,
  public.public_fixed_excursions,
  public.public_monthly_availability_leaflets,
  public.public_partnerships,
  public.public_reviews,
  public.public_site_content,
  public.public_site_media
from public, anon, authenticated, service_role;

-- Anonymous access is read-only and limited to public-safe views.
grant select on table
  public.public_availability_blocks,
  public.public_fixed_excursions,
  public.public_monthly_availability_leaflets,
  public.public_partnerships,
  public.public_reviews,
  public.public_site_content,
  public.public_site_media
to anon;

-- Authenticated browser access mirrors the committed application grants. RLS
-- remains the row-level authorization boundary for every base table below.
grant select, insert on table public.activity_log to authenticated;
grant select, insert, update on table public.admin_profiles to authenticated;
grant select on table public.admin_weekly_reports to authenticated;
grant select, delete on table public.analytics_events to authenticated;
grant select, delete on table public.analytics_sessions to authenticated;
grant select, insert, update on table public.availability_blocks to authenticated;
grant select, insert, update on table public.booking_codes to authenticated;
grant select, insert, update on table public.booking_requests to authenticated;
grant select, insert, update on table public.customer_referral_codes to authenticated;
grant select, insert, update on table public.finance_entries to authenticated;
grant select, insert, update on table public.fixed_excursions to authenticated;
grant select, insert on table public.gift_card_requests to authenticated;
grant select, insert, update on table public.monthly_availability_leaflets to authenticated;
grant select, insert, update on table public.partner_commissions to authenticated;
grant select, insert, update on table public.partner_referrals to authenticated;
grant select, insert, update on table public.partnerships to authenticated;
grant select, insert, update on table public.referral_codes to authenticated;
grant select on table public.request_notification_log to authenticated;
grant select, insert, update, delete on table public.reviews to authenticated;
grant select, insert, update on table public.site_content to authenticated;
grant select, insert, update on table public.site_media to authenticated;
grant select, insert, update on table public.system_backup_settings to authenticated;
grant select on table
  public.public_availability_blocks,
  public.public_fixed_excursions,
  public.public_monthly_availability_leaflets,
  public.public_partnerships,
  public.public_reviews,
  public.public_site_content,
  public.public_site_media
to authenticated;

-- Trusted server workflows receive only ordinary DML capabilities. They do not
-- receive schema-maintenance, TRUNCATE, REFERENCES, TRIGGER, or MAINTAIN rights.
grant select, insert, update, delete on table
  public.activity_log,
  public.admin_profiles,
  public.admin_weekly_reports,
  public.analytics_events,
  public.analytics_reporting_settings,
  public.analytics_sessions,
  public.availability_blocks,
  public.booking_codes,
  public.booking_requests,
  public.customer_referral_codes,
  public.endpoint_rate_limits,
  public.finance_entries,
  public.fixed_excursions,
  public.gift_card_requests,
  public.google_reviews_cache,
  public.google_reviews_sync_state,
  public.monthly_availability_leaflets,
  public.partner_commissions,
  public.partner_referrals,
  public.partnerships,
  public.referral_codes,
  public.request_notification_log,
  public.reviews,
  public.site_content,
  public.site_media,
  public.system_backup_settings
to service_role;
grant select on table
  public.public_availability_blocks,
  public.public_fixed_excursions,
  public.public_monthly_availability_leaflets,
  public.public_partnerships,
  public.public_reviews,
  public.public_site_content,
  public.public_site_media
to service_role;

-- Functions are executable only by the application roles that call them.
-- Trigger/helper/cron functions remain owner-only.
revoke all privileges on all functions in schema public
from public, anon, authenticated, service_role;

grant execute on function public.submit_public_review(text, text, text, integer, text)
to anon, authenticated;
grant execute on function public.redeem_booking_code(text, text)
to anon, authenticated;
grant execute on function public.register_referral_click(text)
to anon, authenticated;
grant execute on function public.get_public_google_reviews()
to anon, authenticated;

grant execute on function public.admin_reverse_finance_entry(uuid, numeric, date, text, text, text)
to authenticated;
grant execute on function public.admin_update_gift_card_request(uuid, jsonb)
to authenticated;
grant execute on function public.admin_update_partner_commission_status(uuid, text, text)
to authenticated;
grant execute on function public.can_manage_public_assets()
to authenticated;
grant execute on function public.get_admin_operational_safeguards()
to authenticated;
grant execute on function public.get_google_reviews_sync_status()
to authenticated;
grant execute on function public.is_admin()
to authenticated;
grant execute on function public.is_owner()
to authenticated;
grant execute on function public.is_privileged_admin()
to authenticated;

grant execute on function public.claim_admin_action_rate_limit(text, text, integer, integer)
to service_role;
grant execute on function public.claim_public_submission_rate_limit(text, text, integer, integer, integer)
to service_role;
grant execute on function public.create_public_booking_request(jsonb)
to service_role;
grant execute on function public.create_public_gift_card_request(jsonb)
to service_role;
grant execute on function public.redeem_gift_card_booking_code(text, text, text, text, text)
to service_role;
grant execute on function public.upsert_analytics_session(
  text, text, timestamptz, timestamptz, integer, integer,
  text, text, text, text, text, text, text, text, text, text, text
)
to service_role;

grant execute on function public.get_analytics_reporting_settings()
to authenticated, service_role;
grant execute on function public.set_analytics_reporting_baseline(timestamptz)
to authenticated, service_role;
grant execute on function public.clear_analytics_reporting_baseline()
to authenticated, service_role;
grant execute on function public.get_admin_analytics_summary(timestamptz, timestamptz, boolean)
to authenticated, service_role;

-- Remove superseded, overlapping Storage policies before recreating the scoped
-- policy set. This prevents older is_admin()-based policies from widening the
-- newer role-specific rules.
drop policy if exists "Admins can insert vulcanIQ public assets" on storage.objects;
drop policy if exists "Admins can update vulcanIQ public assets" on storage.objects;
drop policy if exists "Admins can delete vulcanIQ public assets" on storage.objects;
drop policy if exists "Public can read vulcanIQ public assets" on storage.objects;
drop policy if exists "Content admins can insert vulcanIQ public assets" on storage.objects;
drop policy if exists "Content admins can update vulcanIQ public assets" on storage.objects;
drop policy if exists "Content admins can delete vulcanIQ public assets" on storage.objects;
drop policy if exists "Privileged admins can read private vulcanIQ objects" on storage.objects;
drop policy if exists "Privileged admins can insert private vulcanIQ objects" on storage.objects;
drop policy if exists "Privileged admins can update private vulcanIQ objects" on storage.objects;
drop policy if exists "Privileged admins can delete private vulcanIQ objects" on storage.objects;

create policy "Public can read vulcanIQ public assets"
on storage.objects for select to public
using (bucket_id = 'vulcaniq-public-assets');

create policy "Content admins can insert vulcanIQ public assets"
on storage.objects for insert to authenticated
with check (bucket_id = 'vulcaniq-public-assets' and public.can_manage_public_assets());

create policy "Content admins can update vulcanIQ public assets"
on storage.objects for update to authenticated
using (bucket_id = 'vulcaniq-public-assets' and public.can_manage_public_assets())
with check (bucket_id = 'vulcaniq-public-assets' and public.can_manage_public_assets());

create policy "Content admins can delete vulcanIQ public assets"
on storage.objects for delete to authenticated
using (bucket_id = 'vulcaniq-public-assets' and public.can_manage_public_assets());

create policy "Privileged admins can read private vulcanIQ objects"
on storage.objects for select to authenticated
using (bucket_id <> 'vulcaniq-public-assets' and public.is_privileged_admin());

create policy "Privileged admins can insert private vulcanIQ objects"
on storage.objects for insert to authenticated
with check (bucket_id <> 'vulcaniq-public-assets' and public.is_privileged_admin());

create policy "Privileged admins can update private vulcanIQ objects"
on storage.objects for update to authenticated
using (bucket_id <> 'vulcaniq-public-assets' and public.is_privileged_admin())
with check (bucket_id <> 'vulcaniq-public-assets' and public.is_privileged_admin());

create policy "Privileged admins can delete private vulcanIQ objects"
on storage.objects for delete to authenticated
using (bucket_id <> 'vulcaniq-public-assets' and public.is_privileged_admin());

notify pgrst, 'reload schema';

commit;
