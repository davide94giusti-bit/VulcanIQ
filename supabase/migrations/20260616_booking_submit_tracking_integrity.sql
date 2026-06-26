-- Booking submit analytics integrity support.
-- Public users can insert booking requests and receive only the created request id.
-- This avoids opening public SELECT access on public.booking_requests.

create or replace function public.create_public_booking_request(request_payload jsonb)
returns table(id uuid, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.booking_requests%rowtype;
  raw_request_type text := nullif(btrim(coalesce(request_payload->>'request_type', 'private')), '');
  raw_heard_about_us text := nullif(btrim(coalesce(request_payload->>'heard_about_us', '')), '');
begin
  if request_payload is null or jsonb_typeof(request_payload) <> 'object' then
    raise exception 'Invalid booking request payload';
  end if;

  if raw_request_type is null or raw_request_type not in ('private', 'fixed') then
    raw_request_type := 'private';
  end if;

  -- "not_specified" remains admin-only in the UI/path. Public submissions store null instead.
  if raw_heard_about_us = 'not_specified' then
    raw_heard_about_us := null;
  end if;

  insert into public.booking_requests (
    customer_name,
    customer_email,
    customer_phone,
    preferred_contact,
    experience_id,
    requested_date,
    alternative_date,
    language,
    party_type,
    request_type,
    fixed_excursion_id,
    booking_code,
    adults,
    children,
    children_under_3,
    private_experience,
    main_interest,
    preferred_pace,
    message,
    heard_about_us,
    heard_about_us_label,
    heard_about_us_detail,
    source,
    source_section,
    source_cta,
    cta_location,
    selected_date,
    has_fixed_excursion,
    traffic_source,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    status,
    created_by_admin
  ) values (
    nullif(btrim(coalesce(request_payload->>'customer_name', '')), ''),
    nullif(btrim(coalesce(request_payload->>'customer_email', '')), ''),
    nullif(btrim(coalesce(request_payload->>'customer_phone', '')), ''),
    coalesce(nullif(btrim(coalesce(request_payload->>'preferred_contact', '')), ''), 'unknown'),
    coalesce(nullif(btrim(coalesce(request_payload->>'experience_id', '')), ''), 'unsure'),
    nullif(btrim(coalesce(request_payload->>'requested_date', '')), '')::date,
    nullif(btrim(coalesce(request_payload->>'alternative_date', '')), '')::date,
    coalesce(nullif(btrim(coalesce(request_payload->>'language', '')), ''), 'it'),
    nullif(btrim(coalesce(request_payload->>'party_type', '')), ''),
    raw_request_type,
    nullif(btrim(coalesce(request_payload->>'fixed_excursion_id', '')), '')::uuid,
    nullif(btrim(coalesce(request_payload->>'booking_code', '')), ''),
    nullif(btrim(coalesce(request_payload->>'adults', '')), '')::integer,
    nullif(btrim(coalesce(request_payload->>'children', '')), '')::integer,
    coalesce((request_payload->>'children_under_3')::boolean, false),
    case when request_payload ? 'private_experience' then (request_payload->>'private_experience')::boolean else raw_request_type = 'private' end,
    nullif(btrim(coalesce(request_payload->>'main_interest', '')), ''),
    nullif(btrim(coalesce(request_payload->>'preferred_pace', '')), ''),
    nullif(btrim(coalesce(request_payload->>'message', '')), ''),
    raw_heard_about_us,
    nullif(btrim(coalesce(request_payload->>'heard_about_us_label', '')), ''),
    nullif(btrim(coalesce(request_payload->>'heard_about_us_detail', '')), ''),
    'website',
    nullif(btrim(coalesce(request_payload->>'source_section', '')), ''),
    nullif(btrim(coalesce(request_payload->>'source_cta', '')), ''),
    nullif(btrim(coalesce(request_payload->>'cta_location', '')), ''),
    nullif(btrim(coalesce(request_payload->>'selected_date', '')), '')::date,
    coalesce((request_payload->>'has_fixed_excursion')::boolean, raw_request_type = 'fixed'),
    nullif(btrim(coalesce(request_payload->>'traffic_source', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_source', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_medium', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_campaign', '')), ''),
    nullif(btrim(coalesce(request_payload->>'utm_content', '')), ''),
    'pending',
    null
  ) returning * into inserted;

  return query select inserted.id, inserted.status, inserted.created_at;
end;
$$;

revoke all on function public.create_public_booking_request(jsonb) from public;
grant execute on function public.create_public_booking_request(jsonb) to anon, authenticated;
