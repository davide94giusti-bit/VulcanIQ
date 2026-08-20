import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mainSource = read('src/main.jsx');
const bookingService = read('src/services/bookingRequests.js');
const financeService = read('src/services/financeService.js');

const passes = [];
const failures = [];
function test(name, fn) {
  try {
    fn();
    passes.push(name);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}
function assertMatch(source, pattern, label = String(pattern)) {
  if (!pattern.test(source)) throw new Error(`Missing ${label}`);
}
function assertNotMatch(source, pattern, label = String(pattern)) {
  if (pattern.test(source)) throw new Error(`Unexpected ${label}`);
}

test('confirmed booking requests expose a direct confirm-income action', () => {
  assertMatch(mainSource, /RequestIncomeConfirmAction/);
  assertMatch(mainSource, /bookingRequestCanConfirmIncome\(request\)/);
  assertMatch(mainSource, /Conferma entrata/);
  assertMatch(bookingService, /if \(!request\?\.id \|\| request\.source === 'booking_code'\) return false/);
});

test('confirm-income modal prefills request value and captures actual payment data', () => {
  assertMatch(mainSource, /requestMoneyValue\(request\) > 0 \? String\(requestMoneyValue\(request\)\) : ''/);
  assertMatch(mainSource, /Data incasso/);
  assertMatch(mainSource, /Importo effettivo/);
  assertMatch(mainSource, /Metodo di pagamento/);
  assertMatch(mainSource, /paymentMethod: form\.payment_method/);
});

test('income confirmation is idempotent and converts one expected entry instead of duplicating it', () => {
  assertMatch(bookingService, /if \(state\.confirmed\.length\)/);
  assertMatch(bookingService, /status: 'already_confirmed'/);
  assertMatch(bookingService, /if \(state\.pending\.length > 1\)/);
  assertMatch(bookingService, /BOOKING_INCOME_MULTIPLE_PENDING/);
  assertMatch(bookingService, /if \(state\.pending\.length === 1\)/);
  assertMatch(bookingService, /updateFinanceEntry\(pending\.id/);
  assertMatch(bookingService, /createFinanceEntry\(/);
});

test('confirmed income is linked and carries recognition audit metadata', () => {
  for (const field of ['booking_request_id: request.id', "status: 'confirmed'", 'recognized_at: now', 'admin_confirmed_by: userId || null', 'admin_confirmed_at: now']) {
    if (!bookingService.includes(field)) throw new Error(`Missing ${field}`);
  }
  assertMatch(bookingService, /source_type: 'booking_request'/);
  assertMatch(financeService, /admin_confirmed_at/);
});

test('revenue-confirmed partner commissions are synchronized without rolling back confirmed income', () => {
  assertMatch(bookingService, /upsertPartnerCommissionForSource\(/);
  assertMatch(bookingService, /financeEntryId: entry\.id/);
  assertMatch(bookingService, /commissionWarning = error\?\.message/);
});

test('booking-code income remains on its existing dedicated workflow', () => {
  assertMatch(bookingService, /request\.source === 'booking_code'/);
  assertMatch(mainSource, /confirmBookingCodeIncome/);
  assertNotMatch(mainSource, /RequestIncomeConfirmAction[^\n]*booking_code/);
});


test('booking-code requests route to the dedicated income workflow', () => {
  assertMatch(mainSource, /request\.source === 'booking_code'[\s\S]*Gestisci codice \/ conferma entrata[\s\S]*Manage code \/ confirm income/);
  assertMatch(mainSource, /openBookingCodeFromRequest\(request, navigate\)/);
  assertMatch(mainSource, /navigate\('\/admin\/booking-codes'\)/);
});

test('booking-code request navigation carries the exact code into the booking-code search', () => {
  assertMatch(mainSource, /sessionStorage\.setItem\('vulcaniq\.admin\.bookingCodeSearch', code\)/);
  assertMatch(mainSource, /consumeBookingCodeRequestSearch\(\)/);
  assertMatch(mainSource, /search: consumeBookingCodeRequestSearch\(\)/);
  assertMatch(mainSource, /sessionStorage\.removeItem\('vulcaniq\.admin\.bookingCodeSearch'\)/);
});

for (const name of passes) console.log(`PASS  ${name}`);
for (const failure of failures) console.error(`FAIL  ${failure}`);
console.log(`\n${passes.length} passed, ${failures.length} failed.`);
if (failures.length) process.exit(1);
