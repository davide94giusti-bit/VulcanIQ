\set ON_ERROR_STOP on
-- Synthetic prior-version fixtures, for the disposable upgrade test only.
begin;
insert into public.booking_requests(id,status,source,quoted_amount) values('90000000-0000-4000-8000-000000000001','accepted','manual',100);
insert into public.finance_entries(id,entry_date,type,amount,currency,title,status,booking_request_id,source_type,source_id)
values('90000000-0000-4000-8000-000000000002',current_date,'income',100,'EUR','Synthetic legacy expectation','expected','90000000-0000-4000-8000-000000000001','booking_request','90000000-0000-4000-8000-000000000001');
insert into public.gift_card_requests(id,status,buyer_name) values('90000000-0000-4000-8000-000000000003','issued','Synthetic legacy gift');
insert into public.booking_codes(id,code,customer_name,source,gift_card_request_id,experience_id,experience_name_it,experience_name_en,status,payment_status,expected_amount,currency)
values('90000000-0000-4000-8000-000000000004','GIFT-LEGACY-TEST','Synthetic recipient','gift_card','90000000-0000-4000-8000-000000000003','gift-card','Synthetic','Synthetic','unused','paid',0,'EUR');
update public.gift_card_requests set booking_code_id='90000000-0000-4000-8000-000000000004',booking_code='GIFT-LEGACY-TEST' where id='90000000-0000-4000-8000-000000000003';
commit;
