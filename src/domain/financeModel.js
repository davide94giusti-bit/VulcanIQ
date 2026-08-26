import { normalizeCurrency, parseMoneyAmount } from '../utils/money.js';

const VOID_STATUSES = new Set(['cancelled', 'void', 'voided']);
const EXPECTED_STATUSES = new Set(['pending', 'expected']);
const REVERSAL_STATUSES = new Set(['reversal']);

export function normalizedFinanceStatus(value) {
  return String(value || 'confirmed').trim().toLowerCase() || 'confirmed';
}

export function financeEntryIsExpected(entry = {}) {
  return EXPECTED_STATUSES.has(normalizedFinanceStatus(entry.status));
}

export function financeEntryIsVoided(entry = {}) {
  return entry.active === false || VOID_STATUSES.has(normalizedFinanceStatus(entry.status));
}

export function financeEntryIsRecognized(entry = {}) {
  if (financeEntryIsVoided(entry) || financeEntryIsExpected(entry)) return false;
  const status = normalizedFinanceStatus(entry.status);
  return status === 'confirmed' || status === 'reversed' || REVERSAL_STATUSES.has(status);
}

export function financeEntryHasBusinessSource(entry = {}) {
  return Boolean(
    entry.source_id
    || entry.booking_request_id
    || entry.booking_code_id
    || entry.fixed_excursion_id
    || entry.leaflet_id
    || entry.gift_card_request_id
    || entry.partner_commission_id
  );
}

export function recognizedIncomeEntries(entries = []) {
  return entries.filter((entry) => entry.type === 'income' && financeEntryIsRecognized(entry));
}

export function recognizedExpenseEntries(entries = []) {
  return entries.filter((entry) => entry.type === 'expense' && financeEntryIsRecognized(entry));
}

export function paymentSummary(entries = [], agreedAmount = 0, currency = '') {
  const agreed = Math.max(0, parseMoneyAmount(agreedAmount));
  const recognized = recognizedIncomeEntries(entries);
  const paid = recognized.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0);
  const balance = Math.max(0, agreed - paid);
  let status = 'UNPAID';
  const hasReversal = recognized.some((entry) => normalizedFinanceStatus(entry.status) === 'reversal' || Boolean(entry.reversal_of));
  if (paid < 0 || (paid === 0 && hasReversal)) status = 'REFUNDED';
  else if (paid === 0) status = 'UNPAID';
  else if (agreed > 0 && paid < agreed) status = 'PART-PAID';
  else if (agreed > 0 && paid > agreed) status = 'OVERPAID';
  else status = 'PAID';
  return {
    agreed,
    paid,
    balance,
    status,
    currency: normalizeCurrency(currency || recognized[0]?.currency || entries.find((entry) => entry.currency)?.currency || 'EUR'),
    entries: recognized
  };
}

export function calculateLedgerSummary(entries = []) {
  const expectedEntries = entries.filter((entry) => entry.type === 'income' && financeEntryIsExpected(entry) && !financeEntryIsVoided(entry));
  const incomeEntries = recognizedIncomeEntries(entries);
  const expenseEntries = recognizedExpenseEntries(entries);
  const income = incomeEntries.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0);
  const expenses = expenseEntries.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0);
  const expectedIncome = expectedEntries.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0);
  return { expectedEntries, incomeEntries, expenseEntries, income, expenses, expectedIncome, net: income - expenses, byCurrency: ledgerTotalsByCurrency(entries) };
}

export function ledgerTotalsByCurrency(entries = []) {
  const rows = new Map();
  function row(currency) {
    const code = normalizeCurrency(currency || 'EUR');
    if (!rows.has(code)) rows.set(code, { currency: code, expectedIncome: 0, income: 0, expenses: 0, net: 0 });
    return rows.get(code);
  }
  entries.forEach((entry) => {
    if (financeEntryIsVoided(entry)) return;
    const target = row(entry.currency);
    const amount = parseMoneyAmount(entry.amount);
    if (entry.type === 'income' && financeEntryIsExpected(entry)) target.expectedIncome += amount;
    if (entry.type === 'income' && financeEntryIsRecognized(entry)) target.income += amount;
    if (entry.type === 'expense' && financeEntryIsRecognized(entry)) target.expenses += amount;
  });
  return [...rows.values()].map((item) => ({ ...item, net: item.income - item.expenses })).sort((a, b) => a.currency.localeCompare(b.currency));
}

function sourceEntries(entries, sourceType, sourceId) {
  if (!sourceId) return [];
  const directField = sourceType === 'booking_request' ? 'booking_request_id'
    : sourceType === 'booking_code' ? 'booking_code_id'
      : sourceType === 'gift_card' ? 'gift_card_request_id'
        : sourceType === 'partner_commission' ? 'partner_commission_id' : '';
  return entries.filter((entry) => (directField && entry[directField] === sourceId) || (entry.source_type === sourceType && entry.source_id === sourceId));
}

function duplicateRecognized(entries = []) {
  const groups = new Map();
  recognizedIncomeEntries(entries).filter((entry) => !entry.reversal_of).forEach((entry) => {
    const key = [entry.entry_date || '', parseMoneyAmount(entry.amount).toFixed(2), normalizeCurrency(entry.currency), entry.payment_method || ''].join('|');
    groups.set(key, [...(groups.get(key) || []), entry]);
  });
  return [...groups.values()].filter((group) => group.length > 1);
}

export function buildFinancialReconciliation({ bookings = [], bookingCodes = [], giftCards = [], partnerCommissions = [], financeEntries = [] } = {}) {
  const issues = [];
  const add = (issue) => issues.push({ severity: 'review', ...issue });
  const eligibleBooking = (booking) => ['accepted', 'confirmed', 'completed'].includes(String(booking.status || '').toLowerCase())
    || ['deposit_paid', 'confirmed', 'completed', 'review_requested', 'review_received'].includes(String(booking.lead_status || '').toLowerCase());

  for (const booking of bookings) {
    const linked = sourceEntries(financeEntries, 'booking_request', booking.id);
    const agreed = booking.quoted_amount ?? booking.expected_value ?? booking.expected_amount ?? 0;
    const summary = paymentSummary(linked, agreed, booking.currency || 'EUR');
    const expected = linked.filter((entry) => financeEntryIsExpected(entry));
    if (expected.length > 1) add({ type: 'ambiguous_expected', sourceType: 'booking_request', sourceId: booking.id, currency: summary.currency, amount: summary.balance, route: '/admin/requests' });
    if (eligibleBooking(booking) && summary.paid <= 0) add({ type: 'booking_no_payment', sourceType: 'booking_request', sourceId: booking.id, currency: summary.currency, amount: summary.agreed, route: '/admin/requests' });
    else if (eligibleBooking(booking) && summary.balance > 0) add({ type: 'booking_balance_due', sourceType: 'booking_request', sourceId: booking.id, currency: summary.currency, amount: summary.balance, route: '/admin/requests' });
    if (duplicateRecognized(linked).length) add({ type: 'suspected_duplicate_payment', sourceType: 'booking_request', sourceId: booking.id, currency: summary.currency, amount: summary.paid, route: '/admin/requests' });
    if (String(booking.status || '').toLowerCase() === 'cancelled' && summary.paid > 0) {
      const original = recognizedIncomeEntries(linked).find((entry) => !entry.reversal_of && parseMoneyAmount(entry.amount) > 0);
      add({ type: 'cancelled_booking_with_net_payment', sourceType: 'booking_request', sourceId: booking.id, currency: summary.currency, amount: summary.paid, route: '/admin/requests', financeEntryId: original?.id || null });
    }
  }

  for (const code of bookingCodes) {
    const linked = sourceEntries(financeEntries, 'booking_code', code.id);
    const summary = paymentSummary(linked, code.expected_amount || 0, code.currency || 'EUR');
    const expected = linked.filter((entry) => financeEntryIsExpected(entry));
    if (expected.length > 1) add({ type: 'booking_code_ambiguous_expected', sourceType: 'booking_code', sourceId: code.id, currency: summary.currency, amount: summary.balance, route: '/admin/booking-codes' });
    if (code.status === 'redeemed' && summary.balance > 0) add({ type: summary.paid > 0 ? 'booking_code_balance_due' : 'booking_code_no_payment', sourceType: 'booking_code', sourceId: code.id, currency: summary.currency, amount: summary.balance || summary.agreed, route: '/admin/booking-codes' });
    if (duplicateRecognized(linked).length) add({ type: 'booking_code_duplicate_payment', sourceType: 'booking_code', sourceId: code.id, currency: summary.currency, amount: summary.paid, route: '/admin/booking-codes' });
    if (String(code.status || '').toLowerCase() === 'cancelled' && summary.paid > 0) {
      const original = recognizedIncomeEntries(linked).find((entry) => !entry.reversal_of && parseMoneyAmount(entry.amount) > 0);
      add({ type: 'cancelled_booking_code_with_net_payment', sourceType: 'booking_code', sourceId: code.id, currency: summary.currency, amount: summary.paid, route: '/admin/booking-codes', financeEntryId: original?.id || null });
    }
  }

  for (const gift of giftCards) {
    const linked = sourceEntries(financeEntries, 'gift_card', gift.id);
    const income = recognizedIncomeEntries(linked);
    const originalSales = income.filter((entry) => !entry.reversal_of && parseMoneyAmount(entry.amount) > 0);
    const net = income.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0);
    const budget = parseMoneyAmount(gift.budget || 0);
    const currentSale = originalSales[0] || null;
    const hasExplicitPaymentAudit = originalSales.length === 1 && Boolean(currentSale?.idempotency_key) && Boolean(currentSale?.entry_date) && Boolean(currentSale?.payment_method);
    if (gift.status === 'paid' && net <= 0) add({ type: 'gift_card_paid_missing_income', sourceType: 'gift_card', sourceId: gift.id, currency: normalizeCurrency(gift.currency), amount: budget, route: '/admin/gift-cards' });
    if (gift.status === 'issued' && net > 0 && !hasExplicitPaymentAudit) add({ type: 'gift_card_issued_with_income_review', sourceType: 'gift_card', sourceId: gift.id, currency: normalizeCurrency(gift.currency), amount: net, route: '/admin/gift-cards', financeEntryId: currentSale?.id || null });
    if (gift.status === 'issued' && net <= 0) add({ type: 'gift_card_issued_unpaid', sourceType: 'gift_card', sourceId: gift.id, currency: normalizeCurrency(gift.currency), amount: budget, route: '/admin/gift-cards' });
    if (gift.status === 'cancelled' && net > 0) add({ type: 'cancelled_gift_card_with_net_payment', sourceType: 'gift_card', sourceId: gift.id, currency: normalizeCurrency(gift.currency), amount: net, route: '/admin/gift-cards', financeEntryId: currentSale?.id || null });
    if (originalSales.length > 1) add({ type: 'gift_card_duplicate_income', sourceType: 'gift_card', sourceId: gift.id, currency: normalizeCurrency(gift.currency), amount: net, route: '/admin/gift-cards', financeEntryId: currentSale?.id || null });
  }

  for (const commission of partnerCommissions) {
    const linked = financeEntries.filter((entry) => entry.partner_commission_id === commission.id || (entry.source_type === 'partner_commission' && entry.source_id === commission.id));
    const expenses = recognizedExpenseEntries(linked).filter((entry) => !entry.reversal_of);
    if (commission.status === 'paid' && expenses.length === 0) add({ type: 'paid_commission_missing_expense', sourceType: 'partner_commission', sourceId: commission.id, currency: normalizeCurrency(commission.currency), amount: parseMoneyAmount(commission.commission_amount), route: '/admin/finance' });
    if (expenses.length > 1) add({ type: 'duplicate_commission_expense', sourceType: 'partner_commission', sourceId: commission.id, currency: normalizeCurrency(commission.currency), amount: expenses.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0), route: '/admin/finance' });
  }

  for (const entry of financeEntries) {
    if (!financeEntryIsVoided(entry) && !financeEntryHasBusinessSource(entry) && ['booking_payment', 'gift_card', 'partner_commission'].includes(String(entry.category || ''))) {
      add({ type: 'unlinked_business_finance_entry', sourceType: 'finance_entry', sourceId: entry.id, currency: normalizeCurrency(entry.currency), amount: parseMoneyAmount(entry.amount), route: '/admin/finance', financeEntryId: entry.id });
    }
  }

  const totalsByCurrency = {};
  for (const issue of issues) {
    const currency = normalizeCurrency(issue.currency || 'EUR');
    totalsByCurrency[currency] = Number(((totalsByCurrency[currency] || 0) + Math.abs(parseMoneyAmount(issue.amount))).toFixed(2));
  }
  return { issues, totalsByCurrency, count: issues.length };
}
