-- Fix public editable CMS views used by the vulcanIQ public website.
-- Safe to run more than once. Does not delete site_content or site_media data.

alter table public.site_content add column if not exists style_variant text;
alter table public.site_content add column if not exists text_size text default 'normal';
alter table public.site_content add column if not exists text_align text default 'left';
alter table public.site_content add column if not exists visible boolean not null default true;
alter table public.site_content add column if not exists sort_order integer not null default 0;
alter table public.site_content add column if not exists image_url text;
alter table public.site_content add column if not exists image_alt_it text;
alter table public.site_content add column if not exists image_alt_en text;
alter table public.site_content add column if not exists image_position text default 'center';
alter table public.site_content add column if not exists layout_variant text default 'default';

alter table public.site_media add column if not exists image_position text default 'center';
alter table public.site_media add column if not exists image_size text default 'normal';

create or replace view public.public_site_content as
select
  id,
  content_key,
  section,
  label_it,
  label_en,
  value_it,
  value_en,
  default_it,
  default_en,
  content_type,
  style_variant,
  text_size,
  text_align,
  visible,
  sort_order,
  image_url,
  image_alt_it,
  image_alt_en,
  image_position,
  layout_variant,
  active
from public.site_content
where active = true;

create or replace view public.public_site_media as
select
  id,
  media_key,
  label_it,
  label_en,
  file_url,
  file_path,
  file_name,
  file_type,
  media_kind,
  alt_it,
  alt_en,
  image_position,
  image_size,
  active
from public.site_media
where active = true
  and file_url is not null;

grant select on public.public_site_content to anon, authenticated;
grant select on public.public_site_media to anon, authenticated;

notify pgrst, 'reload schema';
