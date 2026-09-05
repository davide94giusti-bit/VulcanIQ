-- Phase 2 Terms evidence foundation. This migration is additive and does not
-- fabricate acceptance for existing requests, bookings, or participants.

begin;

create table public.terms_versions (
  id uuid primary key,
  document_purpose text not null,
  version text not null,
  locale text not null,
  effective_at timestamptz not null,
  published_at timestamptz not null default transaction_timestamp(),
  content_snapshot jsonb not null,
  content_sha256 text not null,
  status text not null default 'published',
  created_at timestamptz not null default transaction_timestamp(),
  constraint terms_versions_purpose_check check (document_purpose in ('booking_request', 'excursion_booking', 'gift_card_purchase', 'gift_card_redemption')),
  constraint terms_versions_version_check check (char_length(btrim(version)) between 1 and 80),
  constraint terms_versions_locale_check check (locale in ('it', 'en')),
  constraint terms_versions_status_check check (status = 'published'),
  constraint terms_versions_hash_check check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint terms_versions_content_check check (
    jsonb_typeof(content_snapshot) = 'object'
    and jsonb_typeof(content_snapshot->'intro') = 'string'
    and jsonb_typeof(content_snapshot->'sections') = 'array'
  ),
  constraint terms_versions_publication_check check (published_at >= effective_at),
  unique (document_purpose, version, locale)
);

create index terms_versions_current_idx
  on public.terms_versions (document_purpose, locale, effective_at desc, published_at desc)
  where status = 'published';

create or replace function public.set_terms_version_content_hash()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  new.content_sha256 := encode(extensions.digest(convert_to(new.content_snapshot::text, 'UTF8'), 'sha256'), 'hex');
  return new;
end;
$$;

revoke all on function public.set_terms_version_content_hash() from public, anon, authenticated, service_role;

create trigger terms_versions_set_content_hash
before insert on public.terms_versions
for each row execute function public.set_terms_version_content_hash();

create or replace function public.prevent_terms_evidence_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'terms_evidence_immutable';
end;
$$;

revoke all on function public.prevent_terms_evidence_mutation() from public, anon, authenticated, service_role;

create trigger terms_versions_immutable
before update or delete on public.terms_versions
for each row execute function public.prevent_terms_evidence_mutation();

create table public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  terms_version_id uuid not null references public.terms_versions(id) on delete restrict,
  terms_content_sha256 text not null,
  document_purpose text not null,
  booking_request_id uuid not null references public.booking_requests(id) on delete restrict,
  participant_id uuid references public.booking_participants(id) on delete restrict,
  actor_participant_id uuid references public.booking_participants(id) on delete restrict,
  actor_type text not null,
  actor_name_snapshot text not null,
  representation_type text not null,
  locale text not null,
  source_context text not null,
  privacy_notice_provided_at timestamptz not null,
  accepted_at timestamptz not null,
  created_at timestamptz not null,
  constraint terms_acceptances_hash_check check (terms_content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint terms_acceptances_purpose_check check (document_purpose in ('booking_request', 'excursion_booking', 'gift_card_purchase', 'gift_card_redemption')),
  constraint terms_acceptances_actor_type_check check (actor_type in ('booking_organizer', 'participant')),
  constraint terms_acceptances_actor_name_check check (char_length(btrim(actor_name_snapshot)) between 1 and 120),
  constraint terms_acceptances_representation_check check (representation_type in ('request_organizer', 'self', 'parent_or_guardian')),
  constraint terms_acceptances_locale_check check (locale in ('it', 'en')),
  constraint terms_acceptances_source_check check (char_length(btrim(source_context)) between 1 and 80)
);

create unique index terms_acceptances_request_version_idx
  on public.terms_acceptances (booking_request_id, terms_version_id)
  where participant_id is null;

create unique index terms_acceptances_participant_version_idx
  on public.terms_acceptances (participant_id, terms_version_id, representation_type)
  where participant_id is not null;

create index terms_acceptances_booking_idx
  on public.terms_acceptances (booking_request_id, accepted_at desc);

create index terms_acceptances_participant_idx
  on public.terms_acceptances (participant_id, accepted_at desc)
  where participant_id is not null;

create or replace function public.validate_terms_acceptance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  version_row public.terms_versions%rowtype;
  target_row public.booking_participants%rowtype;
  actor_row public.booking_participants%rowtype;
begin
  select * into version_row
  from public.terms_versions
  where id = new.terms_version_id
    and status = 'published'
    and effective_at <= transaction_timestamp()
    and published_at <= transaction_timestamp();

  if not found then raise exception 'terms_version_unavailable'; end if;

  new.terms_content_sha256 := version_row.content_sha256;
  new.document_purpose := version_row.document_purpose;
  new.locale := version_row.locale;
  new.actor_name_snapshot := btrim(new.actor_name_snapshot);
  new.source_context := btrim(new.source_context);
  new.accepted_at := transaction_timestamp();
  new.privacy_notice_provided_at := transaction_timestamp();
  new.created_at := transaction_timestamp();

  if not exists (select 1 from public.booking_requests where id = new.booking_request_id) then
    raise exception 'terms_booking_not_found';
  end if;

  if new.document_purpose = 'booking_request' then
    if new.participant_id is not null
      or new.actor_participant_id is not null
      or new.actor_type <> 'booking_organizer'
      or new.representation_type <> 'request_organizer' then
      raise exception 'terms_request_actor_invalid';
    end if;
    return new;
  end if;

  if new.document_purpose <> 'excursion_booking'
    or new.participant_id is null
    or new.actor_participant_id is null then
    raise exception 'terms_participant_actor_invalid';
  end if;

  select * into target_row from public.booking_participants where id = new.participant_id;
  select * into actor_row from public.booking_participants where id = new.actor_participant_id;
  if target_row.id is null
    or actor_row.id is null
    or target_row.booking_request_id <> new.booking_request_id
    or actor_row.booking_request_id <> new.booking_request_id
    or target_row.status <> 'active'
    or actor_row.status <> 'active' then
    raise exception 'terms_participant_scope_invalid';
  end if;

  if new.representation_type = 'self' then
    if new.actor_participant_id <> new.participant_id
      or target_row.participant_type <> 'adult'
      or new.actor_type <> 'participant' then
      raise exception 'terms_self_acceptance_invalid';
    end if;
  elsif new.representation_type = 'parent_or_guardian' then
    if target_row.participant_type <> 'minor'
      or actor_row.participant_type <> 'adult'
      or target_row.guardian_participant_id <> actor_row.id
      or new.actor_type <> 'participant' then
      raise exception 'terms_guardian_acceptance_invalid';
    end if;
  else
    raise exception 'terms_representation_invalid';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_terms_acceptance() from public, anon, authenticated, service_role;

create trigger terms_acceptances_validate
before insert on public.terms_acceptances
for each row execute function public.validate_terms_acceptance();

create trigger terms_acceptances_immutable
before update or delete on public.terms_acceptances
for each row execute function public.prevent_terms_evidence_mutation();

create or replace function public.resolve_current_terms_version(p_document_purpose text, p_locale text)
returns setof public.terms_versions
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tv.*
  from public.terms_versions tv
  where tv.document_purpose = p_document_purpose
    and tv.locale = p_locale
    and tv.status = 'published'
    and tv.effective_at <= transaction_timestamp()
    and tv.published_at <= transaction_timestamp()
  order by tv.effective_at desc, tv.published_at desc, tv.id desc
  limit 1
$$;

revoke all on function public.resolve_current_terms_version(text, text) from public, anon, authenticated;
grant execute on function public.resolve_current_terms_version(text, text) to service_role;

create or replace function public.create_public_booking_request_with_terms(
  request_payload jsonb,
  p_terms_version_id uuid,
  p_terms_source text
)
returns table(id uuid, status text, created_at timestamptz, terms_acceptance_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  created record;
  version_row public.terms_versions%rowtype;
  acceptance_id uuid;
  request_locale text := case when request_payload->>'language' = 'en' then 'en' else 'it' end;
  actor_name text := nullif(btrim(coalesce(request_payload->>'customer_name', '')), '');
  clean_source text := nullif(btrim(coalesce(p_terms_source, '')), '');
  request_idempotency text := nullif(btrim(coalesce(request_payload->>'idempotency_key', '')), '');
  was_existing boolean := false;
begin
  if actor_name is null or char_length(actor_name) > 120 then
    raise exception 'terms_actor_name_required';
  end if;
  if clean_source not in ('fast_request_website', 'questionnaire_website') then
    raise exception 'terms_source_invalid';
  end if;
  if request_idempotency is null or char_length(request_idempotency) < 12 then
    raise exception 'terms_request_idempotency_required';
  end if;

  select * into version_row
  from public.resolve_current_terms_version('booking_request', request_locale);
  if version_row.id is null or version_row.id <> p_terms_version_id then
    raise exception 'terms_version_not_current';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(left(request_idempotency, 200), 0));

  select exists (
    select 1 from public.booking_requests
    where idempotency_key = left(request_idempotency, 200)
  ) into was_existing;

  select * into created from public.create_public_booking_request(request_payload);

  insert into public.terms_acceptances (
    terms_version_id, terms_content_sha256, document_purpose,
    booking_request_id, participant_id, actor_participant_id,
    actor_type, actor_name_snapshot, representation_type, locale,
    source_context, privacy_notice_provided_at, accepted_at, created_at
  ) values (
    version_row.id, version_row.content_sha256, version_row.document_purpose,
    created.id, null, null,
    'booking_organizer', actor_name, 'request_organizer', version_row.locale,
    clean_source, transaction_timestamp(), transaction_timestamp(), transaction_timestamp()
  )
  on conflict (booking_request_id, terms_version_id) where participant_id is null
  do nothing
  returning public.terms_acceptances.id into acceptance_id;

  if acceptance_id is null then
    select ta.id into acceptance_id
    from public.terms_acceptances ta
    where ta.booking_request_id = created.id
      and ta.terms_version_id = version_row.id
      and ta.participant_id is null;
  end if;

  if acceptance_id is null then raise exception 'terms_acceptance_not_recorded'; end if;
  return query select created.id, created.status, created.created_at, acceptance_id, was_existing;
end;
$$;

revoke all on function public.create_public_booking_request_with_terms(jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.create_public_booking_request_with_terms(jsonb, uuid, text) to service_role;

create or replace function public.record_owned_organizer_terms_acceptance(
  p_booking_request_id uuid,
  p_participant_id uuid,
  p_terms_version_id uuid,
  p_locale text
)
returns setof public.terms_acceptances
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  booking_row public.booking_requests%rowtype;
  organizer_row public.booking_participants%rowtype;
  version_row public.terms_versions%rowtype;
  acceptance_row public.terms_acceptances%rowtype;
begin
  select * into booking_row from public.booking_requests where id = p_booking_request_id;
  if booking_row.id is null or booking_row.status <> 'accepted' then
    raise exception 'terms_booking_not_confirmed';
  end if;

  select * into organizer_row
  from public.booking_participants
  where id = p_participant_id
    and booking_request_id = p_booking_request_id
    and is_organizer = true
    and participant_type = 'adult'
    and status = 'active';
  if organizer_row.id is null then raise exception 'terms_organizer_invalid'; end if;

  select * into version_row
  from public.resolve_current_terms_version('excursion_booking', p_locale);
  if version_row.id is null or version_row.id <> p_terms_version_id then
    raise exception 'terms_version_not_current';
  end if;

  insert into public.terms_acceptances (
    terms_version_id, terms_content_sha256, document_purpose,
    booking_request_id, participant_id, actor_participant_id,
    actor_type, actor_name_snapshot, representation_type, locale,
    source_context, privacy_notice_provided_at, accepted_at, created_at
  ) values (
    version_row.id, version_row.content_sha256, version_row.document_purpose,
    booking_row.id, organizer_row.id, organizer_row.id,
    'participant', organizer_row.full_name, 'self', version_row.locale,
    'owned_booking', transaction_timestamp(), transaction_timestamp(), transaction_timestamp()
  )
  on conflict (participant_id, terms_version_id, representation_type) where participant_id is not null
  do nothing
  returning * into acceptance_row;

  if acceptance_row.id is null then
    select * into acceptance_row
    from public.terms_acceptances ta
    where ta.participant_id = organizer_row.id
      and ta.terms_version_id = version_row.id
      and ta.representation_type = 'self';
  end if;
  return next acceptance_row;
end;
$$;

revoke all on function public.record_owned_organizer_terms_acceptance(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_owned_organizer_terms_acceptance(uuid, uuid, uuid, text) to service_role;

alter table public.terms_versions enable row level security;
alter table public.terms_acceptances enable row level security;

create policy "Admins can view Terms versions"
on public.terms_versions for select to authenticated
using (public.is_admin());

create policy "Admins can view Terms acceptances"
on public.terms_acceptances for select to authenticated
using (public.is_admin());

revoke all privileges on table public.terms_versions from public, anon, authenticated, service_role;
revoke all privileges on table public.terms_acceptances from public, anon, authenticated, service_role;
grant select on table public.terms_versions, public.terms_acceptances to authenticated, service_role;

insert into public.terms_versions (
  id, document_purpose, version, locale, effective_at, published_at,
  content_snapshot, content_sha256, status
)
select seed.id, seed.document_purpose, '2026-06-30', seed.locale,
  '2026-06-30 00:00:00+00'::timestamptz, transaction_timestamp(),
  seed.content_snapshot, repeat('0', 64), 'published'
from (
  values
    (
      '10000000-0000-4000-8000-000000000001'::uuid,
      'booking_request'::text,
      'it'::text,
      jsonb_build_object(
        'intro', 'Queste condizioni regolano l’uso del sito e l’invio di richieste per esperienze vulcanIQ.',
        'sections', jsonb_build_array(
          jsonb_build_object('title', 'Uso del sito', 'body', 'Le informazioni sono fornite per presentare esperienze, disponibilità indicative e modalità di contatto. Non usare il sito in modo illecito o dannoso.'),
          jsonb_build_object('title', 'Richieste e conferme', 'body', 'L’invio di una richiesta non costituisce conferma automatica. La prenotazione è confermata solo dopo risposta esplicita del team vulcanIQ.'),
          jsonb_build_object('title', 'Disponibilità, prezzi e programmi', 'body', 'Disponibilità, prezzi, orari, itinerari e programmi possono cambiare in base a meteo, ordinanze, attività vulcanica, logistica e valutazione della guida.'),
          jsonb_build_object('title', 'Responsabilità del cliente', 'body', 'Il cliente deve fornire informazioni corrette su partecipanti, età, condizioni fisiche, esigenze specifiche e contatti utili alla gestione dell’esperienza.'),
          jsonb_build_object('title', 'Sicurezza Etna e meteo', 'body', 'Le esperienze sull’Etna dipendono da condizioni naturali variabili. La guida può modificare, rinviare o annullare l’attività per motivi di sicurezza.'),
          jsonb_build_object('title', 'Link esterni e proprietà intellettuale', 'body', 'I link esterni sono forniti per utilità. Testi, immagini, logo e contenuti vulcanIQ non possono essere copiati senza autorizzazione.')
        )
      )
    ),
    (
      '10000000-0000-4000-8000-000000000002'::uuid,
      'booking_request'::text,
      'en'::text,
      jsonb_build_object(
        'intro', 'These terms govern use of the site and submission of requests for vulcanIQ experiences.',
        'sections', jsonb_build_array(
          jsonb_build_object('title', 'Website use', 'body', 'Information is provided to present experiences, indicative availability and contact methods. Do not use the site in unlawful or harmful ways.'),
          jsonb_build_object('title', 'Requests and confirmations', 'body', 'Submitting a request is not an automatic confirmation. A booking is confirmed only after explicit confirmation from the vulcanIQ team.'),
          jsonb_build_object('title', 'Availability, prices and programs', 'body', 'Availability, prices, times, routes and programs may change based on weather, regulations, volcanic activity, logistics and guide assessment.'),
          jsonb_build_object('title', 'Customer responsibilities', 'body', 'Customers must provide accurate information about participants, age, fitness level, specific needs and contact details required to manage the experience.'),
          jsonb_build_object('title', 'Etna safety and weather', 'body', 'Etna experiences depend on variable natural conditions. The guide may change, postpone or cancel the activity for safety reasons.'),
          jsonb_build_object('title', 'External links and intellectual property', 'body', 'External links are provided for convenience. vulcanIQ text, images, logo and content may not be copied without permission.')
        )
      )
    ),
    (
      '10000000-0000-4000-8000-000000000003'::uuid,
      'excursion_booking'::text,
      'it'::text,
      jsonb_build_object(
        'intro', 'Queste condizioni regolano l’uso del sito e l’invio di richieste per esperienze vulcanIQ.',
        'sections', jsonb_build_array(
          jsonb_build_object('title', 'Uso del sito', 'body', 'Le informazioni sono fornite per presentare esperienze, disponibilità indicative e modalità di contatto. Non usare il sito in modo illecito o dannoso.'),
          jsonb_build_object('title', 'Richieste e conferme', 'body', 'L’invio di una richiesta non costituisce conferma automatica. La prenotazione è confermata solo dopo risposta esplicita del team vulcanIQ.'),
          jsonb_build_object('title', 'Disponibilità, prezzi e programmi', 'body', 'Disponibilità, prezzi, orari, itinerari e programmi possono cambiare in base a meteo, ordinanze, attività vulcanica, logistica e valutazione della guida.'),
          jsonb_build_object('title', 'Responsabilità del cliente', 'body', 'Il cliente deve fornire informazioni corrette su partecipanti, età, condizioni fisiche, esigenze specifiche e contatti utili alla gestione dell’esperienza.'),
          jsonb_build_object('title', 'Sicurezza Etna e meteo', 'body', 'Le esperienze sull’Etna dipendono da condizioni naturali variabili. La guida può modificare, rinviare o annullare l’attività per motivi di sicurezza.'),
          jsonb_build_object('title', 'Link esterni e proprietà intellettuale', 'body', 'I link esterni sono forniti per utilità. Testi, immagini, logo e contenuti vulcanIQ non possono essere copiati senza autorizzazione.')
        )
      )
    ),
    (
      '10000000-0000-4000-8000-000000000004'::uuid,
      'excursion_booking'::text,
      'en'::text,
      jsonb_build_object(
        'intro', 'These terms govern use of the site and submission of requests for vulcanIQ experiences.',
        'sections', jsonb_build_array(
          jsonb_build_object('title', 'Website use', 'body', 'Information is provided to present experiences, indicative availability and contact methods. Do not use the site in unlawful or harmful ways.'),
          jsonb_build_object('title', 'Requests and confirmations', 'body', 'Submitting a request is not an automatic confirmation. A booking is confirmed only after explicit confirmation from the vulcanIQ team.'),
          jsonb_build_object('title', 'Availability, prices and programs', 'body', 'Availability, prices, times, routes and programs may change based on weather, regulations, volcanic activity, logistics and guide assessment.'),
          jsonb_build_object('title', 'Customer responsibilities', 'body', 'Customers must provide accurate information about participants, age, fitness level, specific needs and contact details required to manage the experience.'),
          jsonb_build_object('title', 'Etna safety and weather', 'body', 'Etna experiences depend on variable natural conditions. The guide may change, postpone or cancel the activity for safety reasons.'),
          jsonb_build_object('title', 'External links and intellectual property', 'body', 'External links are provided for convenience. vulcanIQ text, images, logo and content may not be copied without permission.')
        )
      )
    )
) as seed(id, document_purpose, locale, content_snapshot);

comment on table public.terms_versions is
  'Immutable published Terms content snapshots. Corrections require a new version.';
comment on table public.terms_acceptances is
  'Append-only contractual acceptance evidence. Privacy Notice provision is recorded separately and is not optional consent.';

commit;
