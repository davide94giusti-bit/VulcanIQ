import {
  financeEntryHasBusinessSource,
  financeEntryIsExpected,
  financeEntryIsRecognized,
  financeEntryIsVoided,
  paymentSummary
} from './financeModel.js';
import { normalizeCurrency, parseMoneyAmount } from '../utils/money.js';

function sourceEntries(entries, type, id) {
  if (!id) return [];
  const direct = type === 'booking_request' ? 'booking_request_id'
    : type === 'booking_code' ? 'booking_code_id'
      : type === 'gift_card' ? 'gift_card_request_id'
        : type === 'partner_commission' ? 'partner_commission_id' : '';
  return entries.filter((entry) => (direct && entry[direct] === id) || (entry.source_type === type && entry.source_id === id));
}

function recognizedIncome(entries) {
  return entries.filter((entry) => entry.type === 'income' && financeEntryIsRecognized(entry));
}

function recognizedExpenses(entries) {
  return entries.filter((entry) => entry.type === 'expense' && financeEntryIsRecognized(entry));
}

function positiveOriginals(entries) {
  return recognizedIncome(entries).filter((entry) => !entry.reversal_of && parseMoneyAmount(entry.amount) > 0);
}

function reversals(entries) {
  return recognizedIncome(entries).filter((entry) => entry.reversal_of || String(entry.status || '').toLowerCase() === 'reversal' || parseMoneyAmount(entry.amount) < 0);
}

function duplicateOriginals(entries) {
  const groups = new Map();
  positiveOriginals(entries).forEach((entry) => {
    const key = [entry.entry_date || '', parseMoneyAmount(entry.amount).toFixed(2), normalizeCurrency(entry.currency), entry.payment_method || ''].join('|');
    groups.set(key, [...(groups.get(key) || []), entry]);
  });
  return [...groups.values()].some((group) => group.length > 1);
}

function categoryStore() {
  const map = new Map();
  return {
    add(code, record = {}) {
      if (!map.has(code)) map.set(code, { code, count: 0, totalsByCurrency: {}, records: [] });
      const row = map.get(code);
      row.count += 1;
      const currency = normalizeCurrency(record.currency || 'EUR');
      const amount = Math.abs(parseMoneyAmount(record.amount));
      row.totalsByCurrency[currency] = Number(((row.totalsByCurrency[currency] || 0) + amount).toFixed(2));
      row.records.push({ ...record, currency, amount: Number(parseMoneyAmount(record.amount).toFixed(2)) });
    },
    list() { return [...map.values()].sort((a, b) => a.code.localeCompare(b.code)); }
  };
}

function bookingEligible(booking) {
  return ['accepted', 'confirmed', 'completed'].includes(String(booking.status || '').toLowerCase())
    || ['deposit_paid', 'confirmed', 'completed', 'review_requested', 'review_received'].includes(String(booking.lead_status || '').toLowerCase());
}

function issue(code) {
  return ![
    'booking_exactly_one_payment', 'booking_multiple_payments', 'booking_cancelled_with_reversal',
    'booking_code_consistent', 'gift_card_paid_with_income', 'valid_source_linked_finance_entry',
    'genuinely_unlinked_finance_entry'
  ].includes(code);
}

export function buildReadOnlyFinancialAudit({ bookings = [], bookingCodes = [], giftCards = [], partnerCommissions = [], financeEntries = [] } = {}) {
  const categories = categoryStore();

  bookings.forEach((booking) => {
    if (!bookingEligible(booking) && String(booking.status || '').toLowerCase() !== 'cancelled') return;
    const linked = sourceEntries(financeEntries, 'booking_request', booking.id);
    const agreed = booking.quoted_amount ?? booking.expected_value ?? booking.expected_amount ?? 0;
    const summary = paymentSummary(linked, agreed, booking.currency || linked[0]?.currency || 'EUR');
    const originals = positiveOriginals(linked);
    const expected = linked.filter((entry) => financeEntryIsExpected(entry) && !financeEntryIsVoided(entry));
    const refundRows = reversals(linked);
    const base = { sourceType: 'booking_request', sourceId: booking.id, currency: summary.currency };

    if (bookingEligible(booking)) {
      if (originals.length === 0) categories.add('booking_zero_recorded_payment', { ...base, amount: summary.agreed });
      if (originals.length === 1) categories.add('booking_exactly_one_payment', { ...base, amount: summary.paid });
      if (originals.length > 1) categories.add('booking_multiple_payments', { ...base, amount: summary.paid });
      if (summary.balance > 0) categories.add('booking_remaining_balance', { ...base, amount: summary.balance });
      if (summary.status === 'OVERPAID') categories.add('booking_overpayment', { ...base, amount: summary.paid - summary.agreed });
    }
    if (expected.length > 0) categories.add('booking_pending_expected_entries', { ...base, amount: expected.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0) });
    if (expected.length > 1) categories.add('booking_multiple_expected_entries', { ...base, amount: expected.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0) });
    if (duplicateOriginals(linked)) categories.add('booking_duplicate_confirmed_entries', { ...base, amount: summary.paid });
    if (String(booking.status || '').toLowerCase() === 'cancelled' && originals.length) {
      categories.add('booking_cancelled_with_confirmed_payment', { ...base, amount: originals.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0) });
      if (refundRows.length) categories.add('booking_cancelled_with_reversal', { ...base, amount: Math.abs(refundRows.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0)) });
      if (summary.paid > 0) categories.add('booking_cancelled_with_unreversed_net_payment', { ...base, amount: summary.paid });
    }
  });

  bookingCodes.forEach((code) => {
    const linked = sourceEntries(financeEntries, 'booking_code', code.id);
    const summary = paymentSummary(linked, code.expected_amount || 0, code.currency || linked[0]?.currency || 'EUR');
    const originals = positiveOriginals(linked);
    const expected = linked.filter((entry) => financeEntryIsExpected(entry) && !financeEntryIsVoided(entry));
    const storedPayment = String(code.payment_status || '').toLowerCase();
    const base = { sourceType: 'booking_code', sourceId: code.id, currency: summary.currency };
    const inconsistent = (storedPayment === 'paid' && summary.agreed > 0 && summary.paid < summary.agreed)
      || (storedPayment === 'pending' && summary.paid >= summary.agreed && summary.agreed > 0)
      || (String(code.status || '').toLowerCase() === 'redeemed' && summary.agreed > 0 && summary.paid <= 0);
    categories.add(inconsistent ? 'booking_code_status_finance_inconsistent' : 'booking_code_consistent', { ...base, amount: inconsistent ? summary.balance || summary.agreed : summary.paid });
    if (expected.length > 1) categories.add('booking_code_multiple_expected_entries', { ...base, amount: expected.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0) });
    if (originals.length > 1 && duplicateOriginals(linked)) categories.add('booking_code_duplicate_confirmed_entries', { ...base, amount: summary.paid });
    if (summary.status === 'OVERPAID') categories.add('booking_code_overpayment', { ...base, amount: summary.paid - summary.agreed });
  });

  giftCards.forEach((gift) => {
    const linked = sourceEntries(financeEntries, 'gift_card', gift.id);
    const originals = positiveOriginals(linked);
    const net = recognizedIncome(linked).reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0);
    const amount = parseMoneyAmount(gift.budget || 0);
    const currency = normalizeCurrency(gift.currency || linked[0]?.currency || 'EUR');
    const base = { sourceType: 'gift_card', sourceId: gift.id, currency };
    if (gift.status === 'paid' && net > 0 && originals.length === 1) categories.add('gift_card_paid_with_income', { ...base, amount: net });
    if (gift.status === 'paid' && net <= 0) categories.add('gift_card_paid_missing_income', { ...base, amount });
    if (gift.status === 'issued' && net <= 0) categories.add('gift_card_issued_unpaid', { ...base, amount });
    if (gift.status === 'issued' && net > 0) categories.add('gift_card_issued_with_existing_income', { ...base, amount: net });
    if (originals.length > 1) categories.add('gift_card_duplicate_income', { ...base, amount: net });
  });

  partnerCommissions.forEach((commission) => {
    const linked = sourceEntries(financeEntries, 'partner_commission', commission.id);
    const originals = recognizedExpenses(linked).filter((entry) => !entry.reversal_of && parseMoneyAmount(entry.amount) > 0);
    const amount = parseMoneyAmount(commission.commission_amount || 0);
    const base = { sourceType: 'partner_commission', sourceId: commission.id, currency: normalizeCurrency(commission.currency || linked[0]?.currency || 'EUR') };
    if (commission.status === 'paid' && originals.length === 0) categories.add('paid_commission_missing_finance_expense', { ...base, amount });
    if (originals.length > 1) categories.add('duplicate_commission_expenses', { ...base, amount: originals.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0) });
  });

  financeEntries.forEach((entry) => {
    if (financeEntryIsVoided(entry)) return;
    const record = { sourceType: 'finance_entry', sourceId: entry.id, currency: normalizeCurrency(entry.currency), amount: entry.amount };
    categories.add(financeEntryHasBusinessSource(entry) ? 'valid_source_linked_finance_entry' : 'genuinely_unlinked_finance_entry', record);
  });

  const categoryRows = categories.list();
  const humanReview = categoryRows.filter((row) => issue(row.code)).flatMap((row) => row.records.map((record) => ({ classification: 'HUMAN_REVIEW_REQUIRED', reason: row.code, ...record })));
  const safeDeterministic = financeEntries.filter((entry) => {
    if (!entry.source_id) return false;
    if (entry.source_type === 'gift_card') return !entry.gift_card_request_id;
    if (entry.source_type === 'partner_commission') return !entry.partner_commission_id;
    return false;
  }).map((entry) => ({ classification: 'SAFE_DETERMINISTIC', reason: `${entry.source_type}_source_link_backfill`, sourceType: 'finance_entry', sourceId: entry.id, currency: normalizeCurrency(entry.currency), amount: Number(parseMoneyAmount(entry.amount).toFixed(2)) }));

  return {
    generatedAt: new Date().toISOString(),
    piiIncluded: false,
    categories: categoryRows,
    classifications: { safeDeterministic, humanReview },
    totals: {
      bookings: bookings.length,
      bookingCodes: bookingCodes.length,
      giftCards: giftCards.length,
      partnerCommissions: partnerCommissions.length,
      financeEntries: financeEntries.length,
      humanReview: humanReview.length,
      safeDeterministic: safeDeterministic.length
    }
  };
}
