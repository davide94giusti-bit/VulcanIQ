import { collectKeysetRows } from './keysetRows.js';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';
import { normalizeCurrency, parseMoneyAmount } from '../utils/money.js';
import { publishCustomerNotificationEvent } from './notificationService.js';

async function reconcileOwnedBookingEvents(requestId) {
  if (!requestId) return null;
  try { return await publishCustomerNotificationEvent(); }
  catch { return null; }
}

const requestFields = `
  id, created_at, updated_at, status, request_type, fixed_excursion_id,
  booking_code, review_submitted, review_submitted_at, removed_at, removed_by,
  customer_name, customer_email, customer_phone, preferred_contact,
  experience_id, requested_date, alternative_date, language,
  party_type, adults, children, children_under_3, private_experience,
  main_interest, preferred_pace, message, heard_about_us, heard_about_us_label, heard_about_us_detail,
  source, source_section, source_cta, cta_location, selected_date, selected_month, has_fixed_excursion,
  traffic_source, detected_source, declared_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, landing_path,
  analytics_session_id, analytics_visitor_id, analytics_journey_id, booking_journey_version,
  device_type, browser, operating_system,
  admin_note, decision_note, decided_at, decided_by,
  lead_status, lead_priority, lead_owner_id, next_follow_up_at, contacted_at, quoted_at, deposit_sent_at, deposit_paid_at, confirmed_at, completed_at, review_requested_at, review_received_at, review_request_channel, review_link_copied_at, review_code, lost_at, lost_reason, expected_value, quoted_amount, internal_notes,
  referral_code, referral_source, referral_landing_at,
  partner_id, partner_source_assigned_at, partner_source_assigned_by,
  notification_email_status, notification_email_sent_at, notification_email_error, notification_email_attempts,
  created_by_admin, availability_block_id
`;
const requestVersions = new Map();

function textOrNull(value) {
  const clean = typeof value === 'string' ? value.trim() : value;
  return clean === '' || clean === undefined ? null : clean;
}


const HEARD_ABOUT_US_VALUES = new Set([
  'instagram',
  'google',
  'google_maps',
  'facebook',
  'radio',
  'whatsapp_or_friend',
  'hotel_bnb_partner',
  'previous_customer',
  'guide_or_local_partner',
  'other',
  'not_specified'
]);

function normalizeHeardAboutUsValue(value, { allowAdmin = false } = {}) {
  const clean = typeof value === 'string' ? value.trim() : String(value || '').trim();
  if (!clean || !HEARD_ABOUT_US_VALUES.has(clean)) return null;
  if (clean === 'not_specified' && !allowAdmin) return null;
  return clean;
}


function intOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

const CONFIRMED_INCOME_REQUEST_STATUSES = new Set(['accepted', 'confirmed', 'completed']);
const CONFIRMED_INCOME_LEAD_STATUSES = new Set(['deposit_paid', 'confirmed', 'completed', 'review_requested', 'review_received']);

function financeIncomeStatus(value) {
  return String(value || 'confirmed').trim().toLowerCase() || 'confirmed';
}

export function bookingRequestCanConfirmIncome(request = {}) {
  if (!request?.id || request.source === 'booking_code') return false;
  const requestStatus = String(request.status || '').trim().toLowerCase();
  const leadStatus = String(request.lead_status || '').trim().toLowerCase();
  return CONFIRMED_INCOME_REQUEST_STATUSES.has(requestStatus) || CONFIRMED_INCOME_LEAD_STATUSES.has(leadStatus);
}

export async function getBookingRequestIncomeState(requestId) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  if (!requestId) throw new Error('Booking request is required.');
  const data = await collectKeysetRows(() => supabase
    .from('finance_entries')
    .select('id, created_at, updated_at, entry_date, type, amount, currency, title, description, category, payment_method, status, source_type, source_id, booking_request_id, booking_code_id, fixed_excursion_id, leaflet_id, idempotency_key, recognized_at, cancelled_at, reversed_at, reversal_of, admin_confirmed_by, admin_confirmed_at, active')
    .eq('booking_request_id', requestId)
    .eq('type', 'income')
    .eq('active', true));

  const entries = (data || []).filter((entry) => entry.active !== false && !['cancelled', 'void', 'voided'].includes(financeIncomeStatus(entry.status)));
  const confirmed = entries.filter((entry) => ['confirmed', 'reversed', 'reversal'].includes(financeIncomeStatus(entry.status)));
  const pending = entries.filter((entry) => !entry.reversal_of && ['expected', 'pending'].includes(financeIncomeStatus(entry.status)));
  return { entries, confirmed, pending };
}


export async function confirmBookingRequestIncome({ request, amount, currency = 'EUR', entryDate, paymentMethod = '', idempotencyKey = '' } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('admin_record_booking_payment', {
    p_source_type: 'booking_request', p_source_id: request?.id,
    p_amount: parseMoneyAmount(amount), p_currency: normalizeCurrency(currency),
    p_entry_date: entryDate, p_payment_method: paymentMethod, p_idempotency_key: idempotencyKey
  });
  if (error) throw error;
  return data;
}


export function normalizeRequestInput(input, defaults = {}) {
  const requestedDate = textOrNull(input.requested_date);
  const requestType = textOrNull(input.request_type) || defaults.request_type || 'private';
  const sourceValue = textOrNull(input.source) || defaults.source || 'website';
  const allowAdminHeardAboutUs = Boolean(input.created_by_admin || defaults.created_by_admin || sourceValue === 'manual');
  const fixedExcursionExperienceId = textOrNull(input.fixed_excursion_experience_id ?? input.fixedExperienceId);
  const resolvedExperienceId = requestType === 'fixed'
    ? (fixedExcursionExperienceId || textOrNull(input.experience_id) || 'unsure')
    : (textOrNull(input.experience_id) || 'unsure');
  return {
    customer_name: textOrNull(input.customer_name ?? input.name),
    customer_email: textOrNull(input.customer_email ?? input.email),
    customer_phone: textOrNull(input.customer_phone ?? input.phone),
    preferred_contact: textOrNull(input.preferred_contact) || defaults.preferred_contact || 'unknown',
    experience_id: resolvedExperienceId,
    requested_date: requestedDate,
    alternative_date: textOrNull(input.alternative_date),
    language: textOrNull(input.language) || defaults.language || 'it',
    party_type: textOrNull(input.party_type),
    request_type: requestType,
    fixed_excursion_id: textOrNull(input.fixed_excursion_id),
    booking_code: textOrNull(input.booking_code),
    adults: intOrNull(input.adults),
    children: intOrNull(input.children),
    children_under_3: Boolean(input.children_under_3),
    private_experience: input.private_experience === '' || input.private_experience === undefined ? null : Boolean(input.private_experience),
    main_interest: textOrNull(input.main_interest),
    preferred_pace: textOrNull(input.preferred_pace),
    message: textOrNull(input.message),
    heard_about_us: normalizeHeardAboutUsValue(input.heard_about_us ?? input.heardAboutUs, { allowAdmin: allowAdminHeardAboutUs }),
    heard_about_us_label: textOrNull(input.heard_about_us_label ?? input.heardAboutUsLabel),
    heard_about_us_detail: textOrNull(input.heard_about_us_detail ?? input.heardAboutUsDetail),
    source: sourceValue,
    source_section: textOrNull(input.source_section),
    source_cta: textOrNull(input.source_cta),
    cta_location: textOrNull(input.cta_location),
    selected_date: textOrNull(input.selected_date || requestedDate),
    selected_month: textOrNull(input.selected_month),
    has_fixed_excursion: input.has_fixed_excursion === undefined ? requestType === 'fixed' : Boolean(input.has_fixed_excursion),
    traffic_source: textOrNull(input.traffic_source),
    detected_source: textOrNull(input.detected_source || input.traffic_source),
    declared_source: textOrNull(input.declared_source || input.heard_about_us),
    utm_source: textOrNull(input.utm_source),
    utm_medium: textOrNull(input.utm_medium),
    utm_campaign: textOrNull(input.utm_campaign),
    utm_content: textOrNull(input.utm_content),
    utm_term: textOrNull(input.utm_term),
    referrer: textOrNull(input.referrer),
    landing_path: textOrNull(input.landing_path),
    referral_code: textOrNull(input.referral_code),
    referral_source: textOrNull(input.referral_source),
    referral_landing_at: textOrNull(input.referral_landing_at),
    analytics_session_id: textOrNull(input.analytics_session_id || input.session_id),
    analytics_visitor_id: textOrNull(input.analytics_visitor_id || input.visitor_id),
    analytics_journey_id: textOrNull(input.analytics_journey_id || input.booking_journey_id),
    booking_journey_version: textOrNull(input.booking_journey_version),
    device_type: textOrNull(input.device_type),
    browser: textOrNull(input.browser),
    operating_system: textOrNull(input.operating_system),
    admin_note: textOrNull(input.admin_note),
    lead_status: textOrNull(input.lead_status),
    lead_priority: textOrNull(input.lead_priority),
    next_follow_up_at: textOrNull(input.next_follow_up_at),
    expected_value: input.expected_value === undefined || input.expected_value === '' ? null : Number(input.expected_value),
    quoted_amount: input.quoted_amount === undefined || input.quoted_amount === '' ? null : Number(input.quoted_amount),
    lost_reason: textOrNull(input.lost_reason),
    internal_notes: textOrNull(input.internal_notes),
    status: defaults.status || input.status || 'pending',
    created_by_admin: input.created_by_admin || defaults.created_by_admin || null
  };
}

export async function createPublicBookingRequest(input) {
  const payload = normalizeRequestInput(input, { source: 'website', status: 'pending', language: input.language || 'it' });
  payload.source = 'website';
  payload.status = 'pending';
  payload.created_by_admin = null;
  delete payload.admin_note;
  delete payload.booking_code;

  const journeyId = textOrNull(input.submission_idempotency_key || input.analytics_journey_id || input.booking_journey_id);
  const idempotency = String(journeyId || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`)
    .replace(/[^a-zA-Z0-9:_-]/g, '-')
    .slice(0, 160);
  payload.submission_idempotency_key = idempotency.length >= 12 ? idempotency : `booking-${Date.now()}-${idempotency}`;
  payload.submission_fingerprint = textOrNull(input.submission_fingerprint) || payload.submission_idempotency_key;
  payload.form_started_at = textOrNull(input.form_started_at);
  payload.website = textOrNull(input.website);
  payload.turnstile_token = textOrNull(input.turnstile_token);
  payload.notification_ownership_requested = input.notification_ownership_requested === true;

  const response = await fetch('/api/public/booking-request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': payload.submission_idempotency_key
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  const traceId = String(response.headers.get('X-Trace-Id') || result?.trace_id || '').slice(0, 80);
  if (!response.ok || !result?.ok) {
    const error = new Error(result?.message || 'The booking request could not be saved.');
    error.code = result?.code || `HTTP_${response.status}`;
    error.status = response.status;
    error.traceId = traceId;
    throw error;
  }
  return traceId ? { ...result, trace_id: traceId } : result;
}

export async function createManualBookingRequest(input, userId) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const payload = normalizeRequestInput(input, {
    source: input.source || 'manual',
    status: 'pending',
    created_by_admin: userId || null
  });

  const { data, error } = await supabase
    .from('booking_requests')
    .insert(payload)
    .select(requestFields)
    .single();

  if (error) throw error;
  return data;
}

export async function listBookingRequests(filters = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const data = await collectKeysetRows(() => {
  let query = supabase
    .from('booking_requests')
    .select(requestFields)
        ;

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.experience_id && filters.experience_id !== 'all') query = query.eq('experience_id', filters.experience_id);
  if (filters.source && filters.source !== 'all') query = query.eq('source', filters.source);
  if (filters.fromDate) query = query.gte('requested_date', filters.fromDate);
  if (filters.toDate) query = query.lte('requested_date', filters.toDate);

  if (filters.search) {
    const clean = filters.search.trim().replaceAll(',', ' ');
    if (clean) {
      query = query.or(`customer_name.ilike.%${clean}%,customer_email.ilike.%${clean}%,customer_phone.ilike.%${clean}%`);
    }
  }

  return query;
  });
  const requests = (data || []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  for (const row of requests) requestVersions.set(row.id, row.updated_at);
  if (!requests.length) return [];

  const requestIds = requests.map((request) => request.id).filter(Boolean);
  const fixedIds = [...new Set(requests.map((request) => request.fixed_excursion_id).filter(Boolean))];
  const { data: canReadFinance, error: roleError } = await supabase.rpc('can_manage_finance');
  if (roleError) throw roleError;
  const fixedRows = [];
  const financeRows = [];
  for (let offset = 0; offset < fixedIds.length; offset += 100) {
    const chunk = fixedIds.slice(offset, offset + 100);
    fixedRows.push(...await collectKeysetRows(() => supabase.from('fixed_excursions').select('id, date, start_time, end_time, experience_id, title_it, title_en').in('id', chunk)));
  }
  if (canReadFinance) for (let offset = 0; offset < requestIds.length; offset += 100) {
    const chunk = requestIds.slice(offset, offset + 100);
    financeRows.push(...await collectKeysetRows(() => supabase.from('finance_entries')
      .select('id, created_at, entry_date, type, amount, currency, payment_method, status, reversal_of, booking_request_id, booking_code_id, source_type, source_id, active')
      .in('booking_request_id', chunk).eq('type', 'income')));
  }
  const fixedResult = { data: fixedRows };
  const financeResult = { data: financeRows };

  const fixedById = (fixedResult.data || []).reduce((acc, row) => ({ ...acc, [row.id]: row }), {});
  const financeByRequest = (financeResult.data || []).reduce((acc, row) => {
    if (!row.booking_request_id) return acc;
    if (!acc[row.booking_request_id]) acc[row.booking_request_id] = [];
    acc[row.booking_request_id].push(row);
    return acc;
  }, {});

  return requests.map((request) => ({
    ...request,
    fixed_excursion: fixedById[request.fixed_excursion_id] || null,
    finance_entries: financeByRequest[request.id] || []
    , finance_access: Boolean(canReadFinance)
  }));
}

export async function getBookingRequestCounts(filters = {}, today = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const args = { p_filters: filters };
  if (today) args.p_today = today;
  const { data, error } = await supabase.rpc('get_admin_booking_counts', args);
  if (error) throw error;
  return data;
}

export async function updateBookingRequest(id, payload) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const expectedVersion = payload.expected_updated_at || requestVersions.get(id);
  const update = { ...payload, updated_at: new Date().toISOString() };
  delete update.expected_updated_at;
  Object.keys(update).forEach((key) => update[key] === undefined && delete update[key]);

  let query = supabase
    .from('booking_requests')
    .update(update)
    .eq('id', id);
  if (expectedVersion) query = query.eq('updated_at', expectedVersion);
  const { data, error } = await query.select(requestFields).maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('EDIT_CONFLICT');
  requestVersions.set(id, data.updated_at);
  return data;
}

export async function approveBookingRequest({ request, mode = 'accept-only', decisionNote = '', limitedScope = 'experience' }) {
  const { data, error } = await supabase.rpc('admin_accept_booking', {
    p_id: request.id, p_mode: mode, p_note: decisionNote, p_scope: limitedScope,
    p_expected_updated_at: request.updated_at || null
  });
  if (error) throw error;
  return data;
}

export async function declineBookingRequest({ request, userId, decisionNote = '', reasonCategory = '' }) {
  const note = [reasonCategory, decisionNote].filter(Boolean).join(' · ');
  const updated = await updateBookingRequest(request.id, {
    status: 'declined',
    decision_note: note || null,
    decided_at: new Date().toISOString(),
    decided_by: userId
  });
  // Expected-ledger, unpaid-commission and linked-block cleanup committed in the DB transaction.
  await reconcileOwnedBookingEvents(updated.id);
  return updated;
}


export async function cancelBookingRequest({ request, userId, decisionNote = '' }) {
  const note = ['removed/cancelled', decisionNote].filter(Boolean).join(' · ');
  const updated = await updateBookingRequest(request.id, {
    status: 'cancelled',
    decision_note: note || null,
    decided_at: new Date().toISOString(),
    decided_by: userId,
    removed_at: new Date().toISOString(),
    removed_by: userId
  });
  // Cancellation is not a refund; the database preserves recognized money atomically.
  await reconcileOwnedBookingEvents(updated.id);
  return updated;
}


export async function markBookingRequestReviewLinkCopied(id, userId = null) {
  return updateBookingRequest(id, {
    review_link_copied_at: new Date().toISOString(),
    updated_by: userId || null
  });
}

export async function markBookingRequestReviewRequested(id, channel = 'whatsapp', userId = null) {
  const now = new Date().toISOString();
  const updated = await updateBookingRequest(id, {
    review_requested_at: now,
    review_request_channel: channel || 'whatsapp',
    lead_status: 'review_requested',
    updated_by: userId || null
  });
  await reconcileOwnedBookingEvents(id);
  return updated;
}

export async function markBookingRequestReviewReceived(id, userId = null) {
  const now = new Date().toISOString();
  return updateBookingRequest(id, {
    review_received_at: now,
    review_submitted: true,
    review_submitted_at: now,
    lead_status: 'review_received',
    updated_by: userId || null
  });
}
