# VulcanIQ payment, Finance and reconciliation model — 2026-08-21

## Accounting boundary

Reservation state answers **what is happening with the booking**. Finance answers **what money actually moved**.

Only recognized `finance_entries` payments, refunds/reversals, expenses and paid partner commissions affect P&L. Quoted/accepted value, booking acceptance/completion, CRM stage, Gift Card issuance and booking-code redemption do not independently recognize money.

Expected transactions remain operational expectations and are excluded from recognized P&L.

## Booking payment model

A booking can have multiple actual payments. The shared payment flow records:

- actual amount;
- actual entry/payment date;
- currency;
- payment method;
- idempotency key;
- source linkage.

A single unambiguous expected entry may be safely reconciled. Example: expected EUR 300 + payment EUR 100 becomes recognized EUR 100 plus remaining expected EUR 200. Multiple expected rows are never guessed; they are sent to reconciliation.

Derived status is based on linked recognized transactions:

- `UNPAID`;
- `PART-PAID`;
- `PAID`;
- `OVERPAID`;
- `REFUNDED` where the net ledger supports it.

Booking surfaces display Quoted, Paid, Balance and payment history so Finance does not need to be opened merely to understand payment state.

## Booking codes

Booking-code payments use the same actual-money semantics. The old convenience path that manufactured expected amount/today/`external` is no longer valid. Actual amount/date/method/currency are required. Multiple payments and idempotent retries are supported.

Booking-code lifecycle remains a separate operational concern; Finance remains authoritative for money.

## Gift Cards

`Paid` and `Issued` are intentionally distinct.

- `Paid` requires actual payment amount/date/method/idempotency and recognizes Gift Card revenue exactly once.
- `Issued` generates/delivers the voucher/booking code and does not insert Finance revenue.
- The generated redemption code has zero expected financial value so redemption does not recognize the original sale twice.
- Historical rows created under prior Issued-recognizes-revenue semantics are not silently rewritten; ambiguous cases are classified for reconciliation.

The behavior is implemented by forward-only migration `supabase/migrations/20260821070000_payment_finance_semantics.sql`.

## Partner commissions

Moving a commission to `paid` creates or reuses exactly one source-linked Finance expense atomically through `admin_update_partner_commission_status`. The commission stores its Finance entry link. Repeat status actions do not create a second expense.

If a paid commission is reversed through the supported status workflow, the original expense remains and a reversal row is added; history is not deleted.

## Refunds and cancellations

Booking/Gift Card cancellation alone is not proof that received money was refunded. Cancellation voids outstanding expectations but preserves recognized payments.

Actual customer refunds use `admin_reverse_finance_entry` from `supabase/migrations/20260821073000_finance_refund_rpc.sql`. The operator supplies the actual refund amount/date/method/reason. The RPC:

- preserves the original payment;
- creates an explicit negative `reversal` row;
- supports partial refunds;
- prevents reversal beyond the remaining recognized amount;
- supports idempotent retry;
- marks the original `reversed` only when fully reversed.

Routine rollback or reconciliation must never delete payments/refunds to force a desired total.

## Source linkage

A Finance row is considered linked when it has an identifiable VulcanIQ business source through current source columns, including booking request, booking code, fixed excursion, leaflet, Gift Card, partner commission or the generic `source_type` + `source_id` pair.

“Unlinked” therefore means no identifiable VulcanIQ business source, not merely a null `booking_request_id`.

## Multi-currency behavior

VulcanIQ does not fabricate FX conversion. Ledger summaries are grouped by currency. If more than one currency is present, the Admin Finance UI does not present a single consolidated pseudo-total; each currency’s expected income, recorded payments, expenses and net result remains separate.

## Money to reconcile

The reconciliation panel is intentionally diagnostic rather than auto-repairing. It can surface:

- accepted/completed bookings with no recorded payment;
- remaining booking balances and overpayments;
- multiple ambiguous expected entries;
- suspected duplicate recognized entries;
- cancelled bookings retaining unreversed money;
- booking-code Finance mismatches;
- Gift Card Paid without Finance;
- Issued-but-unpaid Gift Cards;
- historical Issued Gift Card revenue requiring review;
- duplicate Gift Card revenue;
- paid commissions missing Finance expense;
- duplicate commission expenses;
- genuinely unlinked business Finance entries.

Safe contextual actions include Record payment, Record remaining payment, Record refund, Open source record and Review transactions. There is no bulk “fix everything” operation.

## Read-only audit

`tools/finance-reconciliation-audit.mjs` is reusable and does not mutate data.

Offline export:

```powershell
node tools/finance-reconciliation-audit.mjs --input .\finance-audit-input.json --output .\finance-audit-report.json
```

Live read-only mode:

```powershell
$env:SUPABASE_URL="https://<project-ref>.supabase.co"
$env:SUPABASE_ANON_KEY="<public-anon-key>"
$env:SUPABASE_ADMIN_ACCESS_TOKEN="<short-lived-admin-access-token>"
node tools/finance-reconciliation-audit.mjs --live --output .\finance-audit-report.json
Remove-Item Env:SUPABASE_ADMIN_ACCESS_TOKEN
```

The live mode performs GET-only requests and deliberately does not accept/use a service-role key. The report excludes unnecessary customer PII and groups monetary totals by currency. Findings are classified as `SAFE_DETERMINISTIC` or `HUMAN_REVIEW_REQUIRED`; the audit itself repairs nothing.

## Migration/deployment order

1. Back up/verify production and use the normal feature branch → Preview/staging workflow.
2. Run the full local test/build suite.
3. Review the read-only reconciliation audit before changing production semantics.
4. Apply `20260821070000_payment_finance_semantics.sql`.
5. Apply `20260821073000_finance_refund_rpc.sql`.
6. Validate migrations and read-only ledger/reconciliation results.
7. Deploy the frontend/Pages build only after database changes are present.

Do not use `supabase db push --include-all`, linked DB reset, migration deletion or historical migration editing for this release.

## Manual financial QA

In a non-production or controlled test dataset verify:

- EUR 300 booking + EUR 100 deposit → PART-PAID, balance EUR 200, P&L +100;
- second EUR 200 payment → PAID, balance 0, P&L total +300;
- explicit overpayment is visible;
- booking-code deposit/balance uses the same ledger model;
- Gift Card Paid creates one revenue row;
- Gift Card Issued alone creates none;
- redemption creates no second Gift Card sale;
- paid partner commission creates one expense on retry;
- partial/full refund retains the original and adds reversal rows;
- cancellation with no payment only voids expectations;
- cancellation after payment surfaces refund/reconciliation rather than erasing money;
- mixed EUR/USD data is displayed per currency without implicit FX.

## Rollback

Prefer code rollback/feature disable and forward corrective migrations. Never delete Finance history, confirmed payments, refunds or applied migrations as a routine rollback. The two new migrations add/replace forward-compatible linkage/functions; if production behavior needs correction, create a later forward migration that restores the desired function behavior while retaining audit history.
