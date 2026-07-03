import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';
import { listFixedExcursions } from './availabilityService.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOOKING_CODE_FIELDS = `
  id, code, customer_name, customer_email, customer_phone,
  experience_id, fixed_excursion_id, experience_name_it, experience_name_en, experience_type,
  scheduled_date, scheduled_time, meeting_point_name, meeting_point_maps_url,
  expected_amount, currency, source, admin_note, customer_note,
  status, created_by, created_at, expires_at, redeemed_at,
  redeemed_booking_request_id, redeemed_finance_entry_id
`;

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const clean = String(value).trim();
  return clean ? clean : null;
}

function normalizeAmount(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : NaN;
}

export function normalizeBookingCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '');
}

function randomSuffix(length = 5) {
  let out = '';
  const cryptoApi = typeof crypto !== 'undefined' ? crypto : null;
  for (let index = 0; index < length; index += 1) {
    let random = Math.random();
    if (cryptoApi?.getRandomValues) {
      const array = new Uint32Array(1);
      cryptoApi.getRandomValues(array);
      random = array[0] / 0xffffffff;
    }
    out += CODE_ALPHABET[Math.floor(random * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  }
  return out;
}

export function generateHumanBookingCode(prefix = 'VQ') {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${randomSuffix(5)}`;
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    ...row,
    expected_amount: Number(row.expected_amount || 0),
    currency: row.currency || 'EUR',
    status: row.status || 'unused'
  };
}

function parseRpcResult(data) {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
}

function normalizeRpcResult(result) {
  if (!result || typeof result !== 'object') return result;
  const error = String(result.error || result.error_code || '').toUpperCase();
  if (!error) return result;

  const errorMap = {
    BOOKING_CODE_REQUIRED: 'required',
    BOOKING_CODE_NOT_FOUND: 'not_found',
    BOOKING_CODE_ALREADY_REDEEMED: 'already_used',
    BOOKING_CODE_ALREADY_USED: 'already_used',
    BOOKING_CODE_EXPIRED: 'expired',
    BOOKING_CODE_CANCELLED: 'cancelled'
  };

  return {
    ...result,
    error_code: result.error_code || errorMap[error] || String(result.error || '').toLowerCase()
  };
}

function shouldRetryWithLegacyRpcName(error) {
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return message.includes('function') || message.includes('could not find') || message.includes('schema cache') || message.includes('parameter') || message.includes('argument');
}

export async function listBookingCodes(filters = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  let query = supabase
    .from('booking_codes')
    .select(BOOKING_CODE_FIELDS)
    .order('created_at', { ascending: false })
    .limit(filters.limit || 250);

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.search) {
    const clean = String(filters.search || '').trim().replaceAll(',', ' ');
    if (clean) query = query.or(`code.ilike.%${clean}%,customer_name.ilike.%${clean}%,customer_email.ilike.%${clean}%,customer_phone.ilike.%${clean}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeRow);
}

export async function listAvailableBookingCodeExperiences() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await listFixedExcursions({ activeOnly: true, fromDate: today });
  return (rows || []).filter((item) => {
    if (!item?.date || item.date < today) return false;
    if (item.active === false) return false;
    if (item.public_visibility === false) return false;
    if (item.status && item.status !== 'available') return false;
    return Number(item.places_remaining ?? item.capacity ?? 1) > 0;
  });
}

export async function createBookingCode(input = {}, userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const amount = normalizeAmount(input.expected_amount);
  if (!cleanText(input.customer_name)) throw new Error('Customer name is required.');
  if (!cleanText(input.experience_name_it) && !cleanText(input.experience_name_en) && !cleanText(input.experience_name)) throw new Error('Experience is required.');
  if (!Number.isFinite(amount)) throw new Error('Expected amount must be a valid number greater than or equal to zero.');

  let code = normalizeBookingCode(input.code || generateHumanBookingCode());
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const expiresAt = cleanText(input.expires_at || input.expiry_date);
    const payload = {
      code,
      customer_name: cleanText(input.customer_name),
      customer_email: cleanText(input.customer_email),
      customer_phone: cleanText(input.customer_phone),
      experience_id: cleanText(input.experience_id),
      fixed_excursion_id: cleanText(input.fixed_excursion_id),
      experience_name_it: cleanText(input.experience_name_it || input.experience_name) || cleanText(input.experience_name_en),
      experience_name_en: cleanText(input.experience_name_en) || cleanText(input.experience_name_it || input.experience_name),
      experience_type: cleanText(input.experience_type) || (input.fixed_excursion_id ? 'fixed' : 'manual'),
      scheduled_date: cleanText(input.scheduled_date),
      scheduled_time: cleanText(input.scheduled_time),
      meeting_point_name: cleanText(input.meeting_point_name),
      meeting_point_maps_url: cleanText(input.meeting_point_maps_url),
      expected_amount: amount,
      currency: cleanText(input.currency) || 'EUR',
      source: cleanText(input.source) || 'manual',
      admin_note: cleanText(input.admin_note),
      customer_note: cleanText(input.customer_note),
      expires_at: expiresAt && expiresAt.length === 10 ? `${expiresAt}T23:59:59+00:00` : expiresAt,
      created_by: userId || null,
      status: 'unused'
    };

    const { data, error } = await supabase
      .from('booking_codes')
      .insert(payload)
      .select(BOOKING_CODE_FIELDS)
      .single();

    if (!error) return normalizeRow(data);
    if (error.code !== '23505') throw error;
    code = generateHumanBookingCode();
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
  return normalizeRow(data);
}

export async function redeemBookingCode(code, { language = 'it' } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const normalized = normalizeBookingCode(code);

  if (!normalized) {
    return { ok: false, error_code: 'required', error: 'BOOKING_CODE_REQUIRED' };
  }

  let response = await supabase.rpc('redeem_booking_code', {
    input_code: normalized,
    input_language: language || 'it'
  });

  if (response.error && shouldRetryWithLegacyRpcName(response.error)) {
    response = await supabase.rpc('redeem_booking_code', {
      p_code: normalized,
      p_language: language || 'it'
    });
  }

  if (response.error) throw response.error;
  return normalizeRpcResult(parseRpcResult(response.data));
}
