-- Safe CMS style metadata support for editable text.
-- This patch is intentionally non-destructive: it does not force home.hero.title
-- to any size, style, or alignment after an admin has chosen values in the CMS.

alter table public.site_content add column if not exists style_variant text;
alter table public.site_content add column if not exists text_size text default 'normal';
alter table public.site_content add column if not exists text_align text default 'left';
alter table public.site_content add column if not exists visible boolean not null default true;

-- Optional normalization only for missing metadata on the homepage hero title.
-- Existing admin-selected values are preserved.
update public.site_content
set
  content_type = coalesce(content_type, 'textarea'),
  style_variant = coalesce(style_variant, 'display'),
  text_size = coalesce(text_size, 'hero'),
  text_align = coalesce(text_align, 'left'),
  visible = coalesce(visible, true),
  active = coalesce(active, true),
  updated_at = now()
where content_key = 'home.hero.title'
  and (
    content_type is null
    or style_variant is null
    or text_size is null
    or text_align is null
    or visible is null
    or active is null
  );

notify pgrst, 'reload schema';
