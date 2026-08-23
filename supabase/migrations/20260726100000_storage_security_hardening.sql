-- vulcanIQ Storage hardening.
-- Review the live bucket inventory before applying. This migration assumes
-- vulcaniq-public-assets is the only intentionally public bucket.

begin;

update storage.buckets
set public = false
where id <> 'vulcaniq-public-assets';

update storage.buckets
set public = true,
    file_size_limit = least(coalesce(file_size_limit, 10485760), 10485760),
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4']
where id = 'vulcaniq-public-assets';

create or replace function public.can_manage_public_assets()
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
      and ap.role in ('owner', 'manager', 'content_editor')
  );
$$;

revoke all on function public.can_manage_public_assets() from public, anon;
grant execute on function public.can_manage_public_assets() to authenticated;

-- Remove only globally permissive policies. Scoped policies are preserved for review.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        regexp_replace(coalesce(qual, ''), '[()[:space:]]', '', 'g') = 'true'
        or regexp_replace(coalesce(with_check, ''), '[()[:space:]]', '', 'g') = 'true'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;
end;
$$;

-- Public read is confined to the explicitly public website-assets bucket.
drop policy if exists "Public can read vulcanIQ public assets" on storage.objects;
create policy "Public can read vulcanIQ public assets"
on storage.objects for select to public
using (bucket_id = 'vulcaniq-public-assets');

-- Content editors may manage public website media, but not private buckets.
drop policy if exists "Content admins can insert vulcanIQ public assets" on storage.objects;
create policy "Content admins can insert vulcanIQ public assets"
on storage.objects for insert to authenticated
with check (bucket_id = 'vulcaniq-public-assets' and public.can_manage_public_assets());

drop policy if exists "Content admins can update vulcanIQ public assets" on storage.objects;
create policy "Content admins can update vulcanIQ public assets"
on storage.objects for update to authenticated
using (bucket_id = 'vulcaniq-public-assets' and public.can_manage_public_assets())
with check (bucket_id = 'vulcaniq-public-assets' and public.can_manage_public_assets());

drop policy if exists "Content admins can delete vulcanIQ public assets" on storage.objects;
create policy "Content admins can delete vulcanIQ public assets"
on storage.objects for delete to authenticated
using (bucket_id = 'vulcaniq-public-assets' and public.can_manage_public_assets());

-- Private-bucket access is restricted to owner/manager. Service-role operations
-- continue to bypass RLS for controlled backups and server workflows.
drop policy if exists "Privileged admins can read private vulcanIQ objects" on storage.objects;
create policy "Privileged admins can read private vulcanIQ objects"
on storage.objects for select to authenticated
using (bucket_id <> 'vulcaniq-public-assets' and public.is_privileged_admin());

drop policy if exists "Privileged admins can insert private vulcanIQ objects" on storage.objects;
create policy "Privileged admins can insert private vulcanIQ objects"
on storage.objects for insert to authenticated
with check (bucket_id <> 'vulcaniq-public-assets' and public.is_privileged_admin());

drop policy if exists "Privileged admins can update private vulcanIQ objects" on storage.objects;
create policy "Privileged admins can update private vulcanIQ objects"
on storage.objects for update to authenticated
using (bucket_id <> 'vulcaniq-public-assets' and public.is_privileged_admin())
with check (bucket_id <> 'vulcaniq-public-assets' and public.is_privileged_admin());

drop policy if exists "Privileged admins can delete private vulcanIQ objects" on storage.objects;
create policy "Privileged admins can delete private vulcanIQ objects"
on storage.objects for delete to authenticated
using (bucket_id <> 'vulcaniq-public-assets' and public.is_privileged_admin());

commit;
