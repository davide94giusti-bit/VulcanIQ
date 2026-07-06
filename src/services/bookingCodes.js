import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';
import { normalizeCurrency, parseMoneyAmount } from '../utils/money.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOOKING_CODE_FIELDS = `
  id, code, customer_name, customer_email, customer_phone,
  experience_id, fixed_excursion_id, experience_name_it, experience_name_en, experience_type,
  scheduled_date, scheduled_time, meeting_point_name, meeting_point_maps_url,
  expected_amount, currency, source, admin_note, customer_note, status,
  completion_status, payment_status, income_status, admin_confirmed_income,
  completed_at, income_confirmed_at, income_confirmed_by, cancelled_at, no_show_at,
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

export function normalizeBookingCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '');
}

function randomSuffix(length = 4) {
  let suffix = '';
  const cryptoApi = typeof crypto !== 'undefined' ? crypto : null;
  for (let index = 0; index < length; index += 1) {
    let random = Math.random();
    if (cryptoApi?.getRandomValues) {
      const array = new Uint32Array(1);
      cryptoApi.getRandomValues(array);
      random = array[0] / 0xffffffff;
    }
    suffix += CODE_ALPHABET[Math.floor(random * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  }
  return suffix;
}

function compactDate(value = new Date()) {
  const source = value instanceof Date ? value.toISOString() : String(value || new Date().toISOString());
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}${match[2]}${match[3]}` : new Date().toISOString().slice(0, 10).replaceAll('-', '');
}

export function generateBookingCode(prefix = 'VUL') {
  return `${prefix}-${compactDate()}-${randomSuffix(4)}`;
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

function isMissingRedeemFunctionError(error) {
  const message = String(error?.message || error?.details || error?.hint || error?.code || '').toLowerCase();
  return message.includes('redeem_booking_code') || message.includes('schema cache') || message.includes('function') || error?.code === 'PGRST202';
}

function parseRpcResult(data) {
  const result = typeof data === 'string' ? JSON.parse(data) : data;
  if (!result?.ok) {
    const nextError = new Error(result?.error || 'BOOKING_CODE_INVALID');
    nextError.code = result?.error || 'BOOKING_CODE_INVALID';
    throw nextError;
  }
  return result;
}

export async function listBookingCodes(filters = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  let query = supabase
    .from('booking_codes')
    .select(BOOKING_CODE_FIELDS)
    .order('created_at', { ascending: false })
    .limit(Number(filters.limit || 250));

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  const search = cleanText(filters.search).replaceAll(',', ' ');
  if (search) {
    query = query.or(`code.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,customer_phone.ilike.%${search}%,experience_name_it.ilike.%${search}%,experience_name_en.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeBookingCodeRow);
}

export async function createBookingCode(input = {}, userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const expiresDate = nullableText(input.expires_at || input.expiry_date);
  let code = normalizeBookingCode(input.code) || generateBookingCode();

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
      status: 'unused',
      completion_status: 'not_completed',
      payment_status: 'pending',
      income_status: 'expected',
      admin_confirmed_income: false,
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
    code = generateBookingCode();
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
  await cancelLinkedExpectedFinance(data, userId, 'booking code cancelled');
  return normalizeBookingCodeRow(data);
}

async function cancelLinkedExpectedFinance(code, userId = null, reason = '') {
  if (!code?.id) return;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('finance_entries')
    .select('id, status, active')
    .or(`booking_code_id.eq.${code.id},source_id.eq.${code.id}`);
  if (error) return;
  await Promise.all((data || []).map((entry) => {
    if (['cancelled', 'void', 'voided', 'reversed', 'reversal'].includes(entry.status)) return null;
    return supabase
      .from('finance_entries')
      .update({ status: 'cancelled', active: false, cancelled_at: now, updated_by: userId || null, archive_reason: reason || null })
      .eq('id', entry.id);
  }).filter(Boolean));
}

async function ensureConfirmedFinanceForCode(code, userId = null) {
  if (!code?.id || !Number(code.expected_amount || 0)) return null;
  const now = new Date().toISOString();
  if (code.redeemed_finance_entry_id) {
    const { data, error } = await supabase
      .from('finance_entries')
      .update({
        status: 'confirmed',
        active: true,
        admin_confirmed_at: now,
        admin_confirmed_by: userId || null,
        recognized_at: now,
        updated_by: userId || null
      })
      .eq('id', code.redeemed_finance_entry_id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }
  const title = code.experience_name_it || code.experience_name_en || code.code || 'Booking code income';
  const { data, error } = await supabase
    .from('finance_entries')
    .insert({
      entry_date: new Date().toISOString().slice(0, 10),
      type: 'income',
      amount: cleanAmount(code.expected_amount),
      currency: normalizeCurrency(code.currency),
      title,
      description: `Confirmed income from booking code ${code.code}`,
      category: 'booking_code_confirmed',
      payment_method: 'external',
      booking_request_id: code.redeemed_booking_request_id || null,
      booking_code_id: code.id,
      source_type: 'booking_code',
      source_id: code.id,
      status: 'confirmed',
      active: true,
      recognized_at: now,
      admin_confirmed_at: now,
      admin_confirmed_by: userId || null,
      created_by: userId || null,
      updated_by: userId || null
    })
    .select('*')
    .single();
  if (error) throw error;
  await supabase.from('booking_codes').update({ redeemed_finance_entry_id: data.id }).eq('id', code.id);
  return data;
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

export async function confirmBookingCodeIncome(id, userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const code = await fetchBookingCode(id);
  const now = new Date().toISOString();
  await ensureConfirmedFinanceForCode(code, userId);
  const { data, error } = await supabase
    .from('booking_codes')
    .update({
      income_status: 'confirmed',
      payment_status: 'paid',
      admin_confirmed_income: true,
      income_confirmed_at: now,
      income_confirmed_by: userId || null
    })
    .eq('id', id)
    .select(BOOKING_CODE_FIELDS)
    .single();
  if (error) throw error;
  return normalizeBookingCodeRow(data);
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
  await cancelLinkedExpectedFinance(data, userId, 'booking code no-show');
  return normalizeBookingCodeRow(data);
}

export async function redeemBookingCode(code, { language = 'it' } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const cleanCode = normalizeBookingCode(code);
  if (!cleanCode) {
    const error = new Error('BOOKING_CODE_REQUIRED');
    error.code = 'BOOKING_CODE_REQUIRED';
    throw error;
  }

  const languageValue = language === 'en' ? 'en' : 'it';
  const first = await supabase.rpc('redeem_booking_code', {
    p_code: cleanCode,
    p_language: languageValue
  });

  if (!first.error) return parseRpcResult(first.data);

  if (isMissingRedeemFunctionError(first.error)) {
    const fallback = await supabase.rpc('redeem_booking_code', {
      input_code: cleanCode,
      input_language: languageValue
    });
    if (!fallback.error) return parseRpcResult(fallback.data);

    if (isMissingRedeemFunctionError(fallback.error)) {
      const missingError = new Error('BOOKING_CODE_RPC_MISSING');
      missingError.code = 'BOOKING_CODE_RPC_MISSING';
      missingError.cause = fallback.error;
      throw missingError;
    }
    throw fallback.error;
  }

  throw first.error;
}
