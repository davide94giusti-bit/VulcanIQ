-- Public UX patch: partnership categories/detail links and manual Google reviews.
-- This migration is additive/backward-compatible for existing rows.

-- -----------------------------------------------------------------------------
-- Partnerships: category key and optional external detail links
-- -----------------------------------------------------------------------------
alter table public.partnerships add column if not exists category_key text not null default 'other';
alter table public.partnerships add column if not exists google_maps_url text;
alter table public.partnerships add column if not exists social_url text;

alter table public.partnerships drop constraint if exists partnerships_category_key_check;
alter table public.partnerships add constraint partnerships_category_key_check
  check (category_key in ('activities', 'restaurants', 'accommodation', 'transport', 'guides_services', 'shops', 'other'));

alter table public.partnerships drop constraint if exists partnerships_google_maps_url_check;
alter table public.partnerships add constraint partnerships_google_maps_url_check
  check (google_maps_url is null or google_maps_url ~* '^https?://');

alter table public.partnerships drop constraint if exists partnerships_social_url_check;
alter table public.partnerships add constraint partnerships_social_url_check
  check (social_url is null or social_url ~* '^https?://');

update public.partnerships
set category_key = case
  when lower(coalesce(category_key, category_it, category_en, '')) in ('activities', 'activity', 'attività', 'attivita') then 'activities'
  when lower(coalesce(category_key, category_it, category_en, '')) in ('restaurants', 'restaurant', 'ristoranti', 'ristorante') then 'restaurants'
  when lower(coalesce(category_key, category_it, category_en, '')) in ('accommodation', 'accommodations', 'alloggi', 'alloggio', 'casa vacanze', 'holiday home') then 'accommodation'
  when lower(coalesce(category_key, category_it, category_en, '')) in ('transport', 'transports', 'trasporti', 'trasporto') then 'transport'
  when lower(coalesce(category_key, category_it, category_en, '')) in ('guides_services', 'guides / services', 'guide / servizi', 'guide servizi', 'services') then 'guides_services'
  when lower(coalesce(category_key, category_it, category_en, '')) in ('shops', 'shop', 'negozi', 'negozio') then 'shops'
  else 'other'
end
where category_key is null
   or category_key not in ('activities', 'restaurants', 'accommodation', 'transport', 'guides_services', 'shops', 'other');

update public.partnerships
set
  category_it = case category_key
    when 'activities' then 'Attività'
    when 'restaurants' then 'Ristoranti'
    when 'accommodation' then 'Alloggi'
    when 'transport' then 'Trasporti'
    when 'guides_services' then 'Guide / Servizi'
    when 'shops' then 'Negozi'
    else 'Altro'
  end,
  category_en = case category_key
    when 'activities' then 'Activities'
    when 'restaurants' then 'Restaurants'
    when 'accommodation' then 'Accommodation'
    when 'transport' then 'Transport'
    when 'guides_services' then 'Guides / Services'
    when 'shops' then 'Shops'
    else 'Other'
  end
where category_it is null
   or category_en is null
   or category_it = ''
   or category_en = '';

create index if not exists partnerships_category_display_idx
  on public.partnerships(category_key, display_order, name);

drop view if exists public.public_partnerships;
create view public.public_partnerships as
select
  id,
  name,
  description_it,
  description_en,
  website_url,
  google_maps_url,
  social_url,
  image_url,
  image_path,
  image_name,
  image_type,
  category_key,
  category_it,
  category_en,
  active,
  display_order
from public.partnerships
where active = true;

grant select on public.public_partnerships to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Reviews: free manual/admin-managed Google review entries
-- -----------------------------------------------------------------------------
alter table public.reviews add column if not exists source text not null default 'website';
alter table public.reviews add column if not exists review_date date;
alter table public.reviews add column if not exists external_review_url text;
alter table public.reviews add column if not exists profile_photo_url text;
alter table public.reviews add column if not exists display_order integer not null default 0;

alter table public.reviews drop constraint if exists reviews_source_check;
alter table public.reviews add constraint reviews_source_check
  check (source in ('website', 'internal', 'direct', 'google'));

alter table public.reviews drop constraint if exists reviews_external_review_url_check;
alter table public.reviews add constraint reviews_external_review_url_check
  check (external_review_url is null or external_review_url ~* '^https?://');

alter table public.reviews drop constraint if exists reviews_profile_photo_url_check;
alter table public.reviews add constraint reviews_profile_photo_url_check
  check (profile_photo_url is null or profile_photo_url ~* '^https?://');

update public.reviews
set source = 'website'
where source is null or source = '';

update public.reviews
set review_date = created_at::date
where review_date is null;

create index if not exists reviews_source_active_idx
  on public.reviews(source, active, approved);
create index if not exists reviews_display_date_idx
  on public.reviews(display_order, review_date desc, created_at desc);

drop view if exists public.public_reviews;
create view public.public_reviews as
select
  id,
  created_at,
  reviewer_name,
  review_text,
  rating,
  language,
  admin_reply,
  admin_reply_at,
  source,
  review_date,
  external_review_url,
  profile_photo_url,
  display_order
from public.reviews
where active = true
  and approved = true;

grant select on public.public_reviews to anon, authenticated;

notify pgrst, 'reload schema';
