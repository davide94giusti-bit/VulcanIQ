-- Finance drill-down relationship safety migration.
-- This is non-destructive and only ensures the nullable relationship columns
-- used by the admin finance drill-down UI exist.

alter table public.finance_entries
add column if not exists booking_request_id uuid null references public.booking_requests(id) on delete set null,
add column if not exists fixed_excursion_id uuid null references public.fixed_excursions(id) on delete set null,
add column if not exists leaflet_id uuid null references public.monthly_availability_leaflets(id) on delete set null;

create index if not exists finance_entries_booking_idx on public.finance_entries(booking_request_id);
create index if not exists finance_entries_fixed_idx on public.finance_entries(fixed_excursion_id);
create index if not exists finance_entries_leaflet_idx on public.finance_entries(leaflet_id);
