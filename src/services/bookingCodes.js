import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';
import { normalizeCurrency, parseMoneyAmount } from '../utils/money.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOOKING_CODE_FIELDS = `
  id, code, customer_name, customer_email, customer_phone,
  experience_id, fixed_excursion_id, experience_name_it, experience_name_en, experience_type,
  scheduled_date, scheduled_time, meeting_point_name, meeting_point_maps_url,
  expected_amount, currency, source, admin_note, customer_note, status,
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
    status: row.status || 'unused'
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

export async function cancelBookingCode(id) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('booking_codes')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'unused')
    .select(BOOKING_CODE_FIELDS)
    .single();
  if (error) throw error;
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
