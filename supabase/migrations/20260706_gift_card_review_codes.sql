-- Gift Card recipient review codes
-- Apply after 20260706 Revenue OS Patch 4.

begin;

alter table public.booking_codes
  add column if not exists gift_card_request_id uuid references public.gift_card_requests(id) on delete set null;

alter table public.gift_card_requests
  add column if not exists booking_code_id uuid references public.booking_codes(id) on delete set null;

alter table public.gift_card_requests
  add column if not exists booking_code text;

create index if not exists booking_codes_gift_card_request_idx
on public.booking_codes(gift_card_request_id)
where gift_card_request_id is not null;

create unique index if not exists booking_codes_one_per_gift_card_request_idx
on public.booking_codes(gift_card_request_id)
where gift_card_request_id is not null;

create index if not exists gift_card_requests_booking_code_idx
on public.gift_card_requests(booking_code);

-- Review-only gift-card codes are already considered redeemed so recipients can use
-- the existing public review flow without generating booking revenue a second time.
update public.booking_codes
set review_enabled = true,
    status = case when status = 'unused' and source = 'gift_card' then 'redeemed' else status end,
    completion_status = case when source = 'gift_card' then 'completed' else completion_status end,
    payment_status = case when source = 'gift_card' then 'paid' else payment_status end,
    income_status = case when source = 'gift_card' then 'none' else income_status end,
    updated_at = now()
where source = 'gift_card'
  and review_enabled is distinct from true;

notify pgrst, 'reload schema';

commit;
