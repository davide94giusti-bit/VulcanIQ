-- Preserve explicit removal of the optional homepage hero feature image/video.
-- Public clients need these two inactive rows as tombstones so they can
-- distinguish "use the built-in fallback" from "the admin intentionally
-- removed this media". Other inactive media remain excluded from the public view.

begin;

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
where (active = true and file_url is not null)
   or (active = false and media_key in ('home_hero_feature_image', 'home_hero_video'));

grant select on public.public_site_media to anon, authenticated;

notify pgrst, 'reload schema';

commit;
