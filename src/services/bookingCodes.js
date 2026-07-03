import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

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
  const normalized = String(value ?? '').replace(',', '.').trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function randomSuffix(length = 6) {
  let suffix = '';
  for (let index = 0; index < length; index += 1) {
    suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
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

function normalizeBookingCode(row) {
  if (!row) return null;
  return {
    ...row,
    expected_amount: Number(row.expected_amount || 0),
    currency: row.currency || 'EUR',
    status: row.status || 'unused'
  };
}

export async function createBookingCode(input = {}, userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const code = cleanText(input.code).toUpperCase() || generateBookingCode();
  const expiresDate = nullableText(input.expires_at || input.expiry_date);
  const payload = {
    code,
    customer_name: nullableText(input.customer_name) || 'Customer',
    customer_email: nullableText(input.customer_email),
    customer_phone: nullableText(input.customer_phone),
    experience_id: nullableText(input.experience_id),
    fixed_excursion_id: nullableText(input.fixed_excursion_id),
    experience_name_it: nullableText(input.experience_name_it || input.experience_name) || 'Esperienza vulcanIQ',
    experience_name_en: nullableText(input.experience_name_en) || nullableText(input.experience_name_it || input.experience_name) || 'vulcanIQ experience',
    experience_type: nullableText(input.experience_type) || 'manual',
    scheduled_date: nullableText(input.scheduled_date),
    scheduled_time: nullableText(input.scheduled_time),
    meeting_point_name: nullableText(input.meeting_point_name),
    meeting_point_maps_url: nullableText(input.meeting_point_maps_url),
    expected_amount: cleanAmount(input.expected_amount),
    currency: nullableText(input.currency) || 'EUR',
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

  if (error) throw error;
  return normalizeBookingCode(data);
}

export async function redeemBookingCode(code, { language = 'it' } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const cleanCode = cleanText(code).toUpperCase();
  if (!cleanCode) {
    const error = new Error('BOOKING_CODE_REQUIRED');
    error.code = 'BOOKING_CODE_REQUIRED';
    throw error;
  }

  const { data, error } = await supabase.rpc('redeem_booking_code', {
    p_code: cleanCode,
    p_language: language || 'it'
  });

  if (error) throw error;
  const result = typeof data === 'string' ? JSON.parse(data) : data;
  if (!result?.ok) {
    const nextError = new Error(result?.error || 'BOOKING_CODE_INVALID');
    nextError.code = result?.error || 'BOOKING_CODE_INVALID';
    throw nextError;
  }
  return result;
}
