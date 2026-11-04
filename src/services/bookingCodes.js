import { collectKeysetRows } from './keysetRows.js';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';
import { normalizeCurrency, parseMoneyAmount } from '../utils/money.js';
import { FINANCE_SELECT_FIELDS } from './financeService.js';

const BOOKING_CODE_FIELDS = `
  id, code, customer_name, customer_email, customer_phone,
  experience_id, fixed_excursion_id, experience_name_it, experience_name_en, experience_type,
  scheduled_date, scheduled_time, meeting_point_name, meeting_point_maps_url,
  expected_amount, currency, source, admin_note, customer_note, status,
  review_enabled, review_submitted_at, review_id, gift_card_request_id,
  completion_status, payment_status, income_status, admin_confirmed_income,
  completed_at, income_confirmed_at, income_confirmed_by, cancelled_at, no_show_at,
  review_requested_at, review_received_at, review_request_channel, review_link_copied_at,
  created_by, created_at, expires_at, redeemed_at, redeemed_booking_request_id, redeemed_finance_entry_id
`;

function cleanText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function nullableText(value) {
  const clean = cleanText(value);
  return clean ? clean : null;
}

function cleanAmount(value) {
  const parsed = parseMoneyAmount(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : 0;
}

function normalizeCodeStatus(value) {
  const clean = cleanText(value).toLowerCase();
  return ['unused', 'redeemed', 'expired', 'cancelled'].includes(clean) ? clean : 'unused';
}

function normalizeCompletionStatus(value) {
  const clean = cleanText(value).toLowerCase();
  return ['not_completed', 'completed', 'cancelled', 'no_show'].includes(clean) ? clean : 'not_completed';
}

function normalizePaymentStatus(value) {
  const clean = cleanText(value).toLowerCase();
  return ['pending', 'deposit_paid', 'paid', 'refunded', 'waived'].includes(clean) ? clean : 'pending';
}

function normalizeIncomeStatus(value) {
  const clean = cleanText(value).toLowerCase();
  return ['none', 'expected', 'pending', 'confirmed', 'cancelled', 'reversed'].includes(clean) ? clean : 'expected';
}

export function normalizeBookingCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '');
}


function normalizeBookingCodeRow(row) {
  if (!row) return null;
  return {
    ...row,
    expected_amount: Number(row.expected_amount || 0),
    currency: normalizeCurrency(row.currency),
    status: row.status || 'unused',
    completion_status: row.completion_status || 'not_completed',
    payment_status: row.payment_status || 'pending',
    income_status: row.income_status || 'expected',
    admin_confirmed_income: row.admin_confirmed_income === true
  };
}


function parseRpcResult(data) {
  const result = typeof data === 'string' ? JSON.parse(data) : data;
  if (!result?.ok) {
    const nextError = new Error(result?.error || 'BOOKING_CODE_INVALID');
    nextError.code = result?.error || 'BOOKING_CODE_INVALID';
    nextError.requiresRecipientClaim = result?.requires_recipient_claim === true;
    nextError.result = result || null;
    throw nextError;
  }
  return result;
}

export async function listBookingCodes(filters = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const data = await collectKeysetRows(() => {
  let query = supabase
    .from('booking_codes')
    .select(BOOKING_CODE_FIELDS)
        ;

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  const search = cleanText(filters.search).replaceAll(',', ' ');
  if (search) {
    query = query.or(`code.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,customer_phone.ilike.%${search}%,experience_name_it.ilike.%${search}%,experience_name_en.ilike.%${search}%`);
  }

  return query;
  });
  const codes = (data || []).map(normalizeBookingCodeRow);
  if (codes.length === 0) return codes;
  const { data: canReadFinance, error: roleError } = await supabase.rpc('can_manage_finance');
  if (roleError) throw roleError;
  if (!canReadFinance) return codes.map((code) => ({ ...code, finance_entries: [], finance_access: false }));

  const financeByCode = new Map(codes.map((item) => [item.id, new Map()]));
  const ids = codes.map((item) => item.id);
  const chunks = [];
  for (let index = 0; index < ids.length; index += 100) chunks.push(ids.slice(index, index + 100));
  for (const chunk of chunks) {
    const [linked, sourced] = await Promise.all([
      collectKeysetRows(() => supabase.from('finance_entries').select(FINANCE_SELECT_FIELDS).in('booking_code_id', chunk)),
      collectKeysetRows(() => supabase.from('finance_entries').select(FINANCE_SELECT_FIELDS).eq('source_type', 'booking_code').in('source_id', chunk))
    ]);
    for (const entry of [...linked, ...sourced]) {
      const codeId = entry.booking_code_id || entry.source_id;
      if (financeByCode.has(codeId)) financeByCode.get(codeId).set(entry.id, entry);
    }
  }
  return codes.map((item) => ({ ...item, finance_entries: [...financeByCode.get(item.id).values()] }));
}

export async function createBookingCode(input = {}, userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const expiresDate = nullableText(input.expires_at || input.expiry_date);
  // The database INSERT trigger issues the high-entropy credential.
  const code = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const payload = {
      code,
      customer_name: nullableText(input.customer_name) || 'Customer',
      customer_email: nullableText(input.customer_email),
      customer_phone: nullableText(input.customer_phone),
      experience_id: nullableText(input.experience_id),
      fixed_excursion_id: nullableText(input.fixed_excursion_id),
      experience_name_it: nullableText(input.experience_name_it || input.experience_name) || 'Esperienza vulcanIQ',
      experience_name_en: nullableText(input.experience_name_en) || nullableText(input.experience_name_it || input.experience_name) || 'vulcanIQ experience',
      experience_type: nullableText(input.experience_type) || (input.fixed_excursion_id ? 'fixed' : 'manual'),
      scheduled_date: nullableText(input.scheduled_date),
      scheduled_time: nullableText(input.scheduled_time),
      meeting_point_name: nullableText(input.meeting_point_name),
      meeting_point_maps_url: nullableText(input.meeting_point_maps_url),
      expected_amount: cleanAmount(input.expected_amount),
      currency: normalizeCurrency(input.currency),
      source: nullableText(input.source) || 'manual',
      admin_note: nullableText(input.admin_note),
      customer_note: nullableText(input.customer_note),
      status: normalizeCodeStatus(input.status),
      review_enabled: input.review_enabled === true,
      gift_card_request_id: nullableText(input.gift_card_request_id),
      completion_status: normalizeCompletionStatus(input.completion_status),
      payment_status: normalizePaymentStatus(input.payment_status),
      income_status: normalizeIncomeStatus(input.income_status),
      admin_confirmed_income: input.admin_confirmed_income === true,
      completed_at: input.completed_at || (normalizeCompletionStatus(input.completion_status) === 'completed' ? new Date().toISOString() : null),
      income_confirmed_at: input.income_confirmed_at || (input.admin_confirmed_income === true ? new Date().toISOString() : null),
      income_confirmed_by: input.income_confirmed_by || (input.admin_confirmed_income === true ? userId || null : null),
      created_by: userId || null,
      expires_at: expiresDate ? (expiresDate.length === 10 ? `${expiresDate}T23:59:59+00:00` : expiresDate) : null
    };

    const { data, error } = await supabase
      .from('booking_codes')
      .insert(payload)
      .select(BOOKING_CODE_FIELDS)
      .single();

    if (!error) return normalizeBookingCodeRow(data);
    if (error.code !== '23505') throw error;
  }

  throw new Error('Could not generate a unique booking code.');
}

async function fetchBookingCode(id) {
  const { data, error } = await supabase
    .from('booking_codes')
    .select(BOOKING_CODE_FIELDS)
    .eq('id', id)
    .single();
  if (error) throw error;
  return normalizeBookingCodeRow(data);
}

export async function cancelBookingCode(id, userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('booking_codes')
    .update({ status: 'cancelled', completion_status: 'cancelled', income_status: 'cancelled', cancelled_at: now, income_confirmed_by: userId || null })
    .eq('id', id)
    .in('status', ['unused', 'redeemed'])
    .select(BOOKING_CODE_FIELDS)
    .single();
  if (error) throw error;
  await reverseOrVoidFinanceForCode(data, userId, 'booking code cancelled');
  return normalizeBookingCodeRow(data);
}

async function reverseOrVoidFinanceForCode(code, userId = null, reason = '') {
  if (!code?.id) return;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('finance_entries')
    .select('id, status, active, reversal_of')
    .or(`booking_code_id.eq.${code.id},and(source_type.eq.booking_code,source_id.eq.${code.id})`);
  if (error) throw error;

  // Code cancellation/no-show is operational state, not proof of a refund. Preserve recognized
  // money; only void outstanding expectations. Refunds use admin_reverse_finance_entry.
  for (const entry of data || []) {
    const status = String(entry.status || '').toLowerCase();
    if (entry.reversal_of || entry.active === false || ['cancelled', 'void', 'voided', 'reversal'].includes(status)) continue;
    if (!['pending', 'expected'].includes(status)) continue;
    const { error: updateError } = await supabase
      .from('finance_entries')
      .update({ status: 'cancelled', active: false, cancelled_at: now, updated_by: userId || null, archive_reason: reason || 'Booking code cancelled' })
      .eq('id', entry.id);
    if (updateError) throw updateError;
  }
}

export async function getBookingCodePaymentState(id) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  if (!id) throw new Error('Booking code is required.');
  const code = await fetchBookingCode(id);
  const { data, error } = await supabase
    .from('finance_entries')
    .select('id, created_at, entry_date, type, amount, currency, title, description, category, payment_method, status, source_type, source_id, booking_request_id, booking_code_id, idempotency_key, recognized_at, reversal_of, active')
    .or(`booking_code_id.eq.${id},and(source_type.eq.booking_code,source_id.eq.${id})`)
    .eq('type', 'income')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const entries = data || [];
  const expected = entries.filter((entry) => entry.active !== false && !entry.reversal_of && ['expected', 'pending'].includes(String(entry.status || '').toLowerCase()));
  const recognized = entries.filter((entry) => entry.active !== false && ['confirmed', 'reversed', 'reversal'].includes(String(entry.status || '').toLowerCase()));
  const paid = recognized.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0);
  const agreed = cleanAmount(code.expected_amount);
  const balance = Math.max(0, agreed - paid);
  const paymentStatus = paid < 0 || (paid === 0 && recognized.some((entry) => entry.status === 'reversal'))
    ? 'refunded'
    : paid === 0 ? 'pending' : agreed > 0 && paid < agreed ? 'deposit_paid' : agreed > 0 && paid > agreed ? 'overpaid' : 'paid';
  return { code, entries, expected, recognized, paid, agreed, balance, paymentStatus };
}

export async function recordBookingCodePayment({ id, amount, currency, entryDate, paymentMethod, idempotencyKey = '' } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('admin_record_booking_payment', {
    p_source_type: 'booking_code', p_source_id: id,
    p_amount: parseMoneyAmount(amount), p_currency: normalizeCurrency(currency),
    p_entry_date: entryDate, p_payment_method: paymentMethod, p_idempotency_key: idempotencyKey
  });
  if (error) throw error;
  return { ...data, code: normalizeBookingCodeRow(data.code) };
}

export async function markBookingCodeCompleted(id, userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('booking_codes')
    .update({ completion_status: 'completed', completed_at: now })
    .eq('id', id)
    .select(BOOKING_CODE_FIELDS)
    .single();
  if (error) throw error;
  return normalizeBookingCodeRow(data);
}

export async function confirmBookingCodeIncome() {
  const error = new Error('Use recordBookingCodePayment with the actual amount, date and payment method.');
  error.code = 'BOOKING_CODE_PAYMENT_DETAILS_REQUIRED';
  throw error;
}

export async function markBookingCodeNoShow(id, userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('booking_codes')
    .update({ completion_status: 'no_show', income_status: 'cancelled', no_show_at: now })
    .eq('id', id)
    .select(BOOKING_CODE_FIELDS)
    .single();
  if (error) throw error;
  await reverseOrVoidFinanceForCode(data, userId, 'booking code no-show');
  return normalizeBookingCodeRow(data);
}

export async function redeemBookingCode(code, { language = 'it', turnstile_token = '' } = {}) {
  const response = await fetch('/api/public/booking-code-redeem', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ booking_code: normalizeBookingCode(code), language: language === 'en' ? 'en' : 'it', turnstile_token })
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.message || 'BOOKING_CODE_INVALID');
    error.code = result.code || 'BOOKING_CODE_INVALID';
    throw error;
  }
  return parseRpcResult(result);
}

export async function claimGiftCardBookingCode(code, input = {}) {
  const cleanCode = normalizeBookingCode(code);
  if (!cleanCode) {
    const error = new Error('BOOKING_CODE_REQUIRED');
    error.code = 'BOOKING_CODE_REQUIRED';
    throw error;
  }

  const response = await fetch('/api/public/gift-card-claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: cleanCode,
      recipient_name: cleanText(input.recipient_name),
      recipient_email: cleanText(input.recipient_email) || null,
      recipient_phone: cleanText(input.recipient_phone) || null,
      language: input.language === 'en' ? 'en' : 'it',
      turnstile_token: input.turnstile_token || ''
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.ok) {
    const error = new Error(result?.message || 'GIFT_CARD_CLAIM_FAILED');
    error.code = result?.code || `HTTP_${response.status}`;
    error.status = response.status;
    error.traceId = result?.trace_id || response.headers.get('X-Trace-Id') || '';
    throw error;
  }
  return result;
}


export async function markBookingCodeReviewLinkCopied(id, userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('booking_codes')
    .update({ review_link_copied_at: new Date().toISOString(), updated_by: userId || null })
    .eq('id', id)
    .select(BOOKING_CODE_FIELDS)
    .single();
  if (error) throw error;
  return normalizeBookingCodeRow(data);
}

export async function markBookingCodeReviewRequested(id, channel = 'whatsapp', userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('booking_codes')
    .update({ review_requested_at: new Date().toISOString(), review_request_channel: channel || 'whatsapp', updated_by: userId || null })
    .eq('id', id)
    .select(BOOKING_CODE_FIELDS)
    .single();
  if (error) throw error;
  return normalizeBookingCodeRow(data);
}

export async function markBookingCodeReviewReceived(id, userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('booking_codes')
    .update({ review_received_at: new Date().toISOString(), updated_by: userId || null })
    .eq('id', id)
    .select(BOOKING_CODE_FIELDS)
    .single();
  if (error) throw error;
  return normalizeBookingCodeRow(data);
}
