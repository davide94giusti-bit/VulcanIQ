import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';
import { normalizeCurrency, parseMoneyAmount } from '../utils/money.js';

const GIFT_CARD_FIELDS = `
  id, buyer_name, buyer_email, buyer_phone, buyer_preferred_language,
  recipient_name, experience_type, budget, currency, message, preferred_delivery_date,
  claimed_recipient_name, recipient_email, recipient_phone, recipient_preferred_language, recipient_claimed_at,
  status, admin_note, finance_entry_id, booking_code_id, booking_code,
  detected_source, declared_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, landing_path,
  analytics_session_id, analytics_visitor_id, analytics_journey_id,
  notification_email_status, notification_email_sent_at, notification_email_error, notification_email_attempts,
  created_at, updated_at, created_by, updated_by
`;


function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function cleanBudget(value) {
  const parsed = parseMoneyAmount(value);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
}

function normalize(row) {
  if (!row) return null;
  return {
    ...row,
    buyer_preferred_language: row.buyer_preferred_language === 'en' ? 'en' : 'it',
    budget: cleanBudget(row.budget) || 0,
    currency: normalizeCurrency(row.currency),
    status: row.status || 'new'
  };
}

export function normalizeGiftCardStatus(value) {
  const clean = String(value || '').trim().toLowerCase();
  return ['new', 'contacted', 'quoted', 'paid', 'issued', 'cancelled'].includes(clean) ? clean : 'new';
}

export async function createGiftCardRequest(input = {}) {
  const payload = {
    buyer_name: cleanText(input.buyer_name || input.buyerName),
    buyer_email: cleanText(input.buyer_email || input.buyerEmail),
    buyer_phone: cleanText(input.buyer_phone || input.buyerPhone),
    buyer_preferred_language: input.buyer_preferred_language === 'en' || input.language === 'en' ? 'en' : 'it',
    recipient_name: cleanText(input.recipient_name || input.recipientName),
    experience_type: cleanText(input.experience_type || input.experienceType),
    budget: cleanBudget(input.budget),
    currency: normalizeCurrency(input.currency),
    message: cleanText(input.message),
    preferred_delivery_date: cleanText(input.preferred_delivery_date || input.preferredDeliveryDate),
    detected_source: cleanText(input.detected_source || input.traffic_source),
    declared_source: cleanText(input.declared_source || input.heard_about_us),
    utm_source: cleanText(input.utm_source),
    utm_medium: cleanText(input.utm_medium),
    utm_campaign: cleanText(input.utm_campaign),
    utm_content: cleanText(input.utm_content),
    utm_term: cleanText(input.utm_term),
    referrer: cleanText(input.referrer),
    landing_path: cleanText(input.landing_path),
    analytics_session_id: cleanText(input.analytics_session_id),
    analytics_visitor_id: cleanText(input.analytics_visitor_id),
    analytics_journey_id: cleanText(input.analytics_journey_id),
    form_started_at: cleanText(input.form_started_at),
    website: cleanText(input.website),
    turnstile_token: cleanText(input.turnstile_token)
  };
  const rawKey = cleanText(input.submission_idempotency_key || input.analytics_journey_id) || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  payload.submission_idempotency_key = String(rawKey).replace(/[^a-zA-Z0-9:_-]/g, '-').slice(0, 160);
  if (payload.submission_idempotency_key.length < 12) payload.submission_idempotency_key = `gift-card-${Date.now()}-${payload.submission_idempotency_key}`;
  payload.submission_fingerprint = cleanText(input.submission_fingerprint) || payload.submission_idempotency_key;

  const response = await fetch('/api/public/gift-card-request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': payload.submission_idempotency_key
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.ok) {
    const error = new Error(result?.message || 'The Gift Card request could not be saved.');
    error.code = result?.code || `HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return normalize({ ...payload, ...result });
}

export async function listGiftCardRequests(filters = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  let query = supabase
    .from('gift_card_requests')
    .select(GIFT_CARD_FIELDS)
    .order('created_at', { ascending: false })
    .limit(Number(filters.limit || 250));
  if (filters.status && filters.status !== 'all') query = query.eq('status', normalizeGiftCardStatus(filters.status));
  const search = cleanText(filters.search)?.replaceAll(',', ' ');
  if (search) {
    query = query.or(`buyer_name.ilike.%${search}%,buyer_email.ilike.%${search}%,buyer_phone.ilike.%${search}%,recipient_name.ilike.%${search}%,claimed_recipient_name.ilike.%${search}%,recipient_email.ilike.%${search}%,recipient_phone.ilike.%${search}%,experience_type.ilike.%${search}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalize);
}


export async function updateGiftCardRequest(id, input = {}, userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const patch = {};
  if (input.status !== undefined) patch.status = normalizeGiftCardStatus(input.status);
  if (input.admin_note !== undefined) patch.admin_note = cleanText(input.admin_note);
  if (input.budget !== undefined) patch.budget = cleanBudget(input.budget);
  if (input.currency !== undefined) patch.currency = normalizeCurrency(input.currency);
  if (input.preferred_delivery_date !== undefined) patch.preferred_delivery_date = cleanText(input.preferred_delivery_date);
  if (input.payment_amount !== undefined) patch.payment_amount = cleanBudget(input.payment_amount);
  if (input.payment_date !== undefined) patch.payment_date = cleanText(input.payment_date);
  if (input.payment_method !== undefined) patch.payment_method = cleanText(input.payment_method);
  if (input.payment_idempotency_key !== undefined) patch.payment_idempotency_key = cleanText(input.payment_idempotency_key);
  const { data, error } = await supabase.rpc('admin_update_gift_card_request', { p_id: id, p_patch: patch });
  if (error) throw error;
  return normalize(data);
}
