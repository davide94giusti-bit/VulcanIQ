import fs from 'node:fs';
import path from 'node:path';
import { paymentSummary, calculateLedgerSummary, financeEntryHasBusinessSource, buildFinancialReconciliation } from '../src/domain/financeModel.js';
import { buildReadOnlyFinancialAudit } from '../src/domain/financeAudit.js';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const bookingService = read('src/services/bookingRequests.js');
const codeService = read('src/services/bookingCodes.js');
const giftService = read('src/services/giftCards.js');
const commissionService = read('src/services/partnerCommissions.js');
const financeService = read('src/services/financeService.js');
const paymentMigration = read('supabase/migrations/20260821070000_payment_finance_semantics.sql');
const refundMigration = read('supabase/migrations/20260821073000_finance_refund_rpc.sql');
const mainSource = read('src/main.jsx');
const claimMigration = read('supabase/migrations/20260824100000_booking_code_gift_card_claim_notifications.sql');

const passes = []; const failures = [];
function test(name, fn) { try { fn(); passes.push(name); } catch (error) { failures.push(`${name}: ${error.message}`); } }
function ok(value, message) { if (!value) throw new Error(message); }
function eq(actual, expected, message) { if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`); }

const payment = (id, amount, extra = {}) => ({ id, type: 'income', amount, currency: 'EUR', status: 'confirmed', active: true, entry_date: '2026-08-20', payment_method: 'card', ...extra });

test('deposit and balance are driven by recognized Finance transactions', () => {
  const first = paymentSummary([payment('p1', 100)], 300, 'EUR');
  eq(first.paid, 100, 'deposit paid'); eq(first.balance, 200, 'deposit balance'); eq(first.status, 'PART-PAID', 'deposit status');
  const second = paymentSummary([payment('p1', 100), payment('p2', 200)], 300, 'EUR');
  eq(second.paid, 300, 'total paid'); eq(second.balance, 0, 'balance'); eq(second.status, 'PAID', 'status');
  eq(calculateLedgerSummary([payment('p1', 100), payment('p2', 200)]).income, 300, 'P&L income');
});

test('overpayment is explicit', () => { eq(paymentSummary([payment('p1', 320)], 300).status, 'OVERPAID', 'overpayment status'); });

test('refund retains original and nets through a reversal', () => {
  const rows = [payment('p1', 300), payment('r1', -100, { status: 'reversal', reversal_of: 'p1', payment_method: 'card' })];
  const summary = paymentSummary(rows, 300);
  eq(summary.paid, 200, 'net paid'); eq(calculateLedgerSummary(rows).income, 200, 'net P&L');
});

test('booking payments are repeatable/idempotent and do not auto-refund on cancellation', () => {
  ok(bookingService.includes('idempotency_key'), 'missing booking idempotency');
  ok(bookingService.includes('BOOKING_INCOME_MULTIPLE_PENDING'), 'ambiguous expected guard missing');
  ok(!bookingService.includes("status: 'already_confirmed'"), 'single-payment lock remains');
  ok(bookingService.includes('Reservation cancellation/decline is not evidence that a refund was actually paid.'), 'cancellation/refund semantic boundary missing');
  ok(!/reverseFinanceEntry|admin_reverse_finance_entry/.test(bookingService.slice(bookingService.indexOf('async function reverseOrVoidFinanceForRequest'), bookingService.indexOf('const CONFIRMED_INCOME_REQUEST_STATUSES'))), 'cancellation still manufactures refund');
});

test('booking codes use the actual shared payment semantics', () => {
  for (const value of ['recordBookingCodePayment', 'entryDate', 'paymentMethod', 'idempotency']) ok(codeService.includes(value), `missing ${value}`);
  ok(codeService.includes('BOOKING_CODE_MULTIPLE_EXPECTED'), 'booking-code ambiguity guard missing');
  ok(mainSource.includes("'Registra pagamento', 'Record payment'"), 'Record payment UX missing');
});

test('Gift Card Paid and Issued are financially distinct', () => {
  ok(paymentMigration.includes("next_status = 'paid'"), 'Paid branch missing');
  ok(paymentMigration.includes("Gift Card payment date is required"), 'actual Gift Card payment date missing');
  ok(paymentMigration.includes("Gift Card payment method is required"), 'actual Gift Card payment method missing');
  ok(paymentMigration.includes('Issued is operational'), 'Issued semantic boundary missing');
  const issuedBlock = paymentMigration.slice(paymentMigration.indexOf("if next_status = 'issued'"), paymentMigration.indexOf("elsif next_status = 'cancelled'"));
  ok(!/insert into public\.finance_entries/i.test(issuedBlock), 'Issued independently recognizes revenue');
  ok(issuedBlock.includes("expected_amount, currency") && issuedBlock.includes("null, 0, next_currency"), 'Gift Card redemption code is not zero-value');
  ok(giftService.includes('payment_idempotency_key'), 'Gift Card payment idempotency not passed');
});

test('Gift Card claim creates no second revenue or expected-income entry', () => {
  const claimBlock = claimMigration.slice(claimMigration.indexOf('create or replace function public.redeem_gift_card_booking_code'), claimMigration.indexOf('revoke all on function public.redeem_gift_card_booking_code'));
  ok(claimBlock.includes("income_status = 'none'"), 'Gift Card claim income state is not none');
  ok(claimBlock.includes('redeemed_finance_entry_id = null'), 'Gift Card claim links a Finance entry');
  ok(!/insert into public\.finance_entries/i.test(claimBlock), 'Gift Card claim inserts Finance income');
  ok(!claimBlock.includes('booking_code_expected'), 'Gift Card claim creates expected income');
});

test('ordinary booking-code Finance behavior remains unchanged behind the Gift Card guard', () => {
  const ordinaryBlock = claimMigration.slice(claimMigration.indexOf('create or replace function public.redeem_booking_code'), claimMigration.indexOf('create or replace function public.admin_update_gift_card_request'));
  ok(ordinaryBlock.includes("'booking_code_expected'"), 'ordinary expected-income behavior missing');
  ok(ordinaryBlock.includes('insert into public.finance_entries'), 'ordinary Finance insert missing');
  ok(ordinaryBlock.indexOf('GIFT_CARD_CLAIM_REQUIRED') < ordinaryBlock.indexOf('insert into public.booking_requests'), 'Gift Card guard runs after booking creation');
});

test('paid partner commission creates one source-linked expense', () => {
  ok(paymentMigration.includes("source_type = 'partner_commission'"), 'commission source lookup missing');
  ok(paymentMigration.includes("'expense', commission.commission_amount"), 'commission expense insert missing');
  ok(paymentMigration.includes('finance_entry_id'), 'commission Finance linkage missing');
  ok(commissionService.includes("admin_update_partner_commission_status"), 'atomic commission RPC not used');
});

test('refund RPC preserves history and prevents duplicate/over refunds', () => {
  for (const value of ['reversal_of', 'REFUND_EXCEEDS_REMAINING_AMOUNT', 'FINANCE_ENTRY_ALREADY_FULLY_REVERSED', 'idempotency_key']) ok(refundMigration.includes(value), `missing ${value}`);
  ok(financeService.includes('admin_reverse_finance_entry'), 'refund service not wired');
  ok(mainSource.includes('FinanceRefundDialog'), 'refund UI missing');
});

test('universal source linkage recognizes Gift Cards and commissions', () => {
  ok(financeEntryHasBusinessSource({ gift_card_request_id: 'g1' }), 'Gift Card not linked');
  ok(financeEntryHasBusinessSource({ partner_commission_id: 'c1' }), 'commission not linked');
  ok(financeEntryHasBusinessSource({ source_type: 'gift_card', source_id: 'g1' }), 'generic source_id not linked');
});

test('historical ambiguity is surfaced rather than guessed', () => {
  const result = buildFinancialReconciliation({
    bookings: [{ id: 'b1', status: 'accepted', quoted_amount: 300 }],
    financeEntries: [
      { id: 'e1', type: 'income', amount: 100, currency: 'EUR', status: 'expected', active: true, booking_request_id: 'b1' },
      { id: 'e2', type: 'income', amount: 200, currency: 'EUR', status: 'expected', active: true, booking_request_id: 'b1' }
    ]
  });
  ok(result.issues.some((item) => item.type === 'ambiguous_expected'), 'ambiguous expected entries not surfaced');
});

test('read-only audit reports requested classifications without PII', () => {
  const report = buildReadOnlyFinancialAudit({
    bookings: [{ id: 'b1', status: 'accepted', quoted_amount: 300 }],
    bookingCodes: [{ id: 'c1', status: 'redeemed', expected_amount: 50, currency: 'EUR', payment_status: 'pending' }],
    giftCards: [{ id: 'g1', status: 'issued', budget: 100, currency: 'EUR' }],
    partnerCommissions: [{ id: 'pc1', status: 'paid', commission_amount: 20, currency: 'EUR' }],
    financeEntries: []
  });
  ok(report.piiIncluded === false, 'audit PII flag wrong');
  for (const code of ['booking_zero_recorded_payment','booking_code_status_finance_inconsistent','gift_card_issued_unpaid','paid_commission_missing_finance_expense']) ok(report.categories.some((row) => row.code === code), `audit missing ${code}`);
});

test('multi-currency P&L stays separated with no implicit FX', () => {
  const summary = calculateLedgerSummary([payment('eur', 100), { ...payment('usd', 50), currency: 'USD' }]);
  eq(summary.byCurrency.length, 2, 'currency buckets');
  ok(mainSource.includes('Nessun totale consolidato') && mainSource.includes('No consolidated total'), 'UI lacks no-FX guard');
});

for (const name of passes) console.log(`PASS  ${name}`);
for (const failure of failures) console.error(`FAIL  ${failure}`);
console.log(`\n${passes.length} passed, ${failures.length} failed.`);
if (failures.length) process.exit(1);
