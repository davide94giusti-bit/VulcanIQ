import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';
import { canTrack } from '../analytics.js';
import { PRIVACY_PREFERENCES_EVENT } from './privacyPreferences.js';

const REFERRAL_FIELDS = `
  id, code, customer_name, customer_email, customer_phone,
  source_booking_request_id, source_booking_code_id, source_type,
  active, used_count, last_used_at, note, created_at, created_by,
  disabled_at, disabled_by
`;

const REFERRAL_STORAGE_KEY = 'vulcaniq_customer_referral';
const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let currentReferral = null;

export function clearStoredReferralAttribution() {
  try { window.localStorage.removeItem(REFERRAL_STORAGE_KEY); } catch { /* Storage may be blocked. */ }
}

if (typeof window !== 'undefined') {
  const clearIfExcluded = () => { if (!canTrack()) clearStoredReferralAttribution(); };
  clearIfExcluded();
  window.addEventListener(PRIVACY_PREFERENCES_EVENT, clearIfExcluded);
  window.addEventListener('storage', clearIfExcluded);
  window.addEventListener('focus', clearIfExcluded);
}

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function slugPart(value) {
  const clean = String(value || 'ETNA').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8);
  return clean || 'ETNA';
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

export function normalizeReferralCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
}

export function generateReferralCode(name = 'ETNA') {
  return `REF-${slugPart(name)}-${randomSuffix(4)}`;
}

export function referralLink(code, lang = '') {
  const clean = normalizeReferralCode(code);
  const query = lang === 'en' || lang === 'it' ? `?lang=${lang}` : '';
  return `/r/ref/${clean}${query}`;
}

export function readStoredReferral() {
  if (!canTrack()) { clearStoredReferralAttribution(); return currentReferral; }
  try {
    if (typeof window === 'undefined') return null;
    const parsed = JSON.parse(window.localStorage.getItem(REFERRAL_STORAGE_KEY) || '{}');
    if (!parsed?.code || !parsed.expires_at || Date.now() > parsed.expires_at) {
      window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function storeReferralJourney(code, metadata = {}) {
  try {
    if (typeof window === 'undefined') return null;
    const clean = normalizeReferralCode(code);
    if (!clean) return null;
    // Explicit current-journey referral remains a business field in memory only.
    currentReferral = { code: clean, source: 'customer_referral' };
    if (!canTrack()) { clearStoredReferralAttribution(); return currentReferral; }
    const payload = {
      code: clean,
      source: 'customer_referral',
      landing_at: new Date().toISOString(),
      expires_at: Date.now() + REFERRAL_TTL_MS,
      language: metadata.language || '',
      utm_source: 'referral',
      utm_medium: 'customer',
      utm_campaign: `referral_${clean}`
    };
    window.localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(payload));
    return payload;
  } catch {
    return null;
  }
}

export function referralAttributionPayload() {
  const stored = readStoredReferral();
  if (!stored?.code) return {};
  if (!canTrack()) return { referral_code: stored.code, referral_source: 'customer_referral' };
  return {
    referral_code: stored.code,
    referral_source: stored.source || 'customer_referral',
    referral_landing_at: stored.landing_at || null,
    utm_source: stored.utm_source || 'referral',
    utm_medium: stored.utm_medium || 'customer',
    utm_campaign: stored.utm_campaign || `referral_${stored.code}`
  };
}

export async function listCustomerReferralCodes(filters = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  let query = supabase
    .from('customer_referral_codes')
    .select(REFERRAL_FIELDS)
    .order('created_at', { ascending: false })
    .limit(Number(filters.limit || 250));
  if (filters.active === true) query = query.eq('active', true);
  if (filters.active === false) query = query.eq('active', false);
  const search = cleanText(filters.search)?.replaceAll(',', ' ');
  if (search) query = query.or(`code.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,customer_phone.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createCustomerReferralCode(input = {}, userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  if (input.source_booking_request_id) {
    const existing = await supabase.from('customer_referral_codes').select(REFERRAL_FIELDS).eq('source_booking_request_id', input.source_booking_request_id).eq('active', true).limit(1);
    if (!existing.error && existing.data?.length) return existing.data[0];
  }
  if (input.source_booking_code_id) {
    const existing = await supabase.from('customer_referral_codes').select(REFERRAL_FIELDS).eq('source_booking_code_id', input.source_booking_code_id).eq('active', true).limit(1);
    if (!existing.error && existing.data?.length) return existing.data[0];
  }
  let code = normalizeReferralCode(input.code) || generateReferralCode(input.customer_name || input.customer_email || 'ETNA');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const payload = {
      code,
      customer_name: cleanText(input.customer_name),
      customer_email: cleanText(input.customer_email),
      customer_phone: cleanText(input.customer_phone),
      source_booking_request_id: cleanText(input.source_booking_request_id),
      source_booking_code_id: cleanText(input.source_booking_code_id),
      source_type: cleanText(input.source_type) || (input.source_booking_code_id ? 'booking_code' : 'booking_request'),
      note: cleanText(input.note),
      created_by: userId || null,
      active: true
    };
    const { data, error } = await supabase
      .from('customer_referral_codes')
      .insert(payload)
      .select(REFERRAL_FIELDS)
      .single();
    if (!error) return data;
    if (error.code !== '23505') throw error;
    code = generateReferralCode(input.customer_name || input.customer_email || 'ETNA');
  }
  throw new Error('Could not create a unique referral code.');
}

export async function disableCustomerReferralCode(id, userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('customer_referral_codes')
    .update({ active: false, disabled_at: new Date().toISOString(), disabled_by: userId || null })
    .eq('id', id)
    .select(REFERRAL_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function validateAndRecordReferralClick(code, { turnstile_token = '' } = {}) {
  if (!isSupabaseConfigured) return { valid: false, code: normalizeReferralCode(code), configured: false };
  const clean = normalizeReferralCode(code);
  if (!clean) return { valid: false, code: '' };
  let response;
  let payload;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    response = await fetch('/api/public/referral-click', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ referral_code: clean, turnstile_token }) });
    payload = await response.json().catch(() => null);
  } catch {
    throw Object.assign(new Error('REFERRAL_UNAVAILABLE'), { code: 'REFERRAL_UNAVAILABLE', status: 0, retryable: true, retryAfter: null });
  } finally { clearTimeout(timer); }
  if (!response.ok || typeof payload?.valid !== 'boolean') {
    // An unavailable dependency or consumed challenge must not invalidate a genuine invitation.
    const error = new Error('REFERRAL_UNAVAILABLE');
    error.code = response.status === 429 ? 'REFERRAL_RATE_LIMITED' : response.status === 403 ? 'REFERRAL_CHALLENGE_REQUIRED' : 'REFERRAL_UNAVAILABLE';
    error.status = response.status;
    error.retryable = true;
    const retryAfter = Number(response.headers.get('Retry-After'));
    error.retryAfter = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(86400, retryAfter) : null;
    throw error;
  }
  return { valid: payload.valid, code: normalizeReferralCode(payload.code || clean) };
}
