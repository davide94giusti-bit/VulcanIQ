import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';
import { createAvailabilityBlock } from './availabilityService.js';
import { cancelUnpaidPartnerCommissionsForSource, upsertPartnerCommissionForSource } from './partnerCommissions.js';
import { createFinanceEntry, updateFinanceEntry } from './financeService.js';
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

function textOrNull(value) {
  const clean = typeof value === 'string' ? value.trim() : value;
  return clean === '' || clean === undefined ? null : clean;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

function compactDateForCode(value) {
  const clean = String(value || '').trim();
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  return `${match[1]}${match[2]}${match[3]}`;
}

function randomCodeSuffix() {
  let suffix = '';
  for (let index = 0; index < 4; index += 1) {
    suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return suffix;
}

function stableCodeSuffix(value) {
  const clean = String(value || '').trim();
  if (!clean) return '';
  let hash = 0;
  for (let index = 0; index < clean.length; index += 1) {
    hash = ((hash << 5) - hash + clean.charCodeAt(index)) >>> 0;
  }
  let suffix = '';
  for (let index = 0; index < 4; index += 1) {
    suffix += CODE_ALPHABET[hash % CODE_ALPHABET.length];
    hash = Math.floor(hash / CODE_ALPHABET.length) || (hash + index + 17);
  }
  return suffix;
}

function makeBookingCode(date) {
  const datePart = compactDateForCode(date) || compactDateForCode(new Date().toISOString());
  return `VUL-${datePart}-${randomCodeSuffix()}`;
}

function stableBookingCodeForRequest(request) {
  if (request?.booking_code) return request.booking_code;
  const datePart = compactDateForCode(request?.requested_date) || compactDateForCode(request?.created_at) || compactDateForCode(new Date().toISOString());
  const suffix = stableCodeSuffix(`${request?.id || ''}|${datePart}|${request?.customer_email || ''}|${request?.customer_phone || ''}`);
  return suffix ? `VUL-${datePart}-${suffix}` : makeBookingCode(datePart);
}

function intOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

async function reverseOrVoidFinanceForRequest(request, userId = null, reason = '') {
  if (!request?.id || !isSupabaseConfigured) return;
  const now = new Date().toISOString();
  const { data: entries, error } = await supabase
    .from('finance_entries')
    .select('id, status, active, reversal_of')
    .eq('booking_request_id', request.id);
  if (error) throw error;

  // Reservation cancellation/decline is not evidence that a refund was actually paid.
  // Preserve recognized money and only void outstanding expectations. Actual refunds are
  // explicit Finance reversals that capture amount, date, method, and audit metadata.
  for (const entry of entries || []) {
    const status = String(entry.status || '').toLowerCase();
    if (entry.reversal_of || entry.active === false || ['cancelled', 'void', 'voided', 'reversal'].includes(status)) continue;
    if (!['pending', 'expected'].includes(status)) continue;
    const { error: updateError } = await supabase
      .from('finance_entries')
      .update({ status: 'cancelled', active: false, cancelled_at: now, updated_by: userId || null, archive_reason: reason || 'Booking request cancelled' })
      .eq('id', entry.id);
    if (updateError) throw updateError;
  }
}

const CONFIRMED_INCOME_REQUEST_STATUSES = new Set(['accepted', 'confirmed', 'completed']);
const CONFIRMED_INCOME_LEAD_STATUSES = new Set(['deposit_paid', 'confirmed', 'completed', 'review_requested', 'review_received']);
const NON_CURRENT_FINANCE_STATUSES = new Set(['cancelled', 'void', 'voided', 'reversed', 'reversal']);

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
  const { data, error } = await supabase
    .from('finance_entries')
    .select('id, created_at, updated_at, entry_date, type, amount, currency, title, description, category, payment_method, status, source_type, source_id, booking_request_id, booking_code_id, fixed_excursion_id, leaflet_id, idempotency_key, recognized_at, cancelled_at, reversed_at, reversal_of, admin_confirmed_by, admin_confirmed_at, active')
    .eq('booking_request_id', requestId)
    .eq('type', 'income')
    .eq('active', true)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const entries = (data || []).filter((entry) => entry.active !== false && !['cancelled', 'void', 'voided'].includes(financeIncomeStatus(entry.status)));
  const confirmed = entries.filter((entry) => ['confirmed', 'reversed', 'reversal'].includes(financeIncomeStatus(entry.status)));
  const pending = entries.filter((entry) => !entry.reversal_of && ['expected', 'pending'].includes(financeIncomeStatus(entry.status)));
  return { entries, confirmed, pending };
}

function bookingIncomeTitle(request = {}) {
  const identity = request.booking_code || request.customer_name || 'booking request';
  return `Booking payment - ${identity}`;
}

function bookingIncomeDescription(request = {}) {
  return [request.customer_name, request.experience_id, request.requested_date, request.booking_code].filter(Boolean).join(' · ') || 'Booking payment';
}

export async function confirmBookingRequestIncome({ request, amount, currency = 'EUR', entryDate, paymentMethod = '', idempotencyKey = '', userId = null } = {}) {
  if (!bookingRequestCanConfirmIncome(request)) {
    const error = new Error('Only confirmed non-booking-code requests can confirm income.');
    error.code = 'BOOKING_INCOME_NOT_ELIGIBLE';
    throw error;
  }
  const normalizedAmount = parseMoneyAmount(amount);
  if (!(normalizedAmount > 0)) {
    const error = new Error('A positive income amount is required.');
    error.code = 'BOOKING_INCOME_AMOUNT_REQUIRED';
    throw error;
  }
  const normalizedDate = String(entryDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    const error = new Error('A valid income date is required.');
    error.code = 'BOOKING_INCOME_DATE_REQUIRED';
    throw error;
  }
  const normalizedPaymentMethod = String(paymentMethod || '').trim();
  if (!normalizedPaymentMethod) {
    const error = new Error('Payment method is required.');
    error.code = 'BOOKING_INCOME_PAYMENT_METHOD_REQUIRED';
    throw error;
  }

  const state = await getBookingRequestIncomeState(request.id);
  const cleanIdempotencyKey = String(idempotencyKey || '').trim();
  if (cleanIdempotencyKey) {
    const existing = state.entries.find((entry) => entry.idempotency_key === cleanIdempotencyKey);
    if (existing) return { status: 'already_recorded', entry: existing, entries: state.confirmed };
  }
  if (state.pending.length > 1) {
    const error = new Error('Multiple pending income entries are linked to this booking. Reconcile them in Finance before confirming income.');
    error.code = 'BOOKING_INCOME_MULTIPLE_PENDING';
    throw error;
  }

  const now = new Date().toISOString();
  const shared = {
    entry_date: normalizedDate,
    type: 'income',
    amount: normalizedAmount,
    currency: normalizeCurrency(currency),
    payment_method: normalizedPaymentMethod,
    booking_request_id: request.id,
    fixed_excursion_id: request.fixed_excursion_id || null,
    status: 'confirmed',
    recognized_at: now,
    admin_confirmed_by: userId || null,
    admin_confirmed_at: now
  };

  let entry;
  let status;
  if (state.pending.length === 1) {
    const pending = state.pending[0];
    const pendingAmount = parseMoneyAmount(pending.amount);
    if (pendingAmount > normalizedAmount) {
      await updateFinanceEntry(pending.id, {
        amount: Number((pendingAmount - normalizedAmount).toFixed(2)),
        status: 'expected',
        updated_at: now
      }, userId);
      entry = await createFinanceEntry({
        ...shared,
        title: bookingIncomeTitle(request),
        description: bookingIncomeDescription(request),
        category: 'booking_payment',
        source_type: 'booking_request',
        source_id: request.id,
        idempotency_key: cleanIdempotencyKey || null,
        active: true
      }, userId);
      status = 'created_partial_payment';
    } else {
      entry = await updateFinanceEntry(pending.id, {
        ...shared,
        title: pending.title || bookingIncomeTitle(request),
        description: pending.description || bookingIncomeDescription(request),
        category: pending.category || 'booking_payment',
        source_type: pending.source_type || 'booking_request',
        source_id: pending.source_id || request.id,
        idempotency_key: cleanIdempotencyKey || pending.idempotency_key || null
      }, userId);
      status = 'confirmed_existing';
    }
  } else {
    entry = await createFinanceEntry({
      ...shared,
      title: bookingIncomeTitle(request),
      description: bookingIncomeDescription(request),
      category: 'booking_payment',
      source_type: 'booking_request',
      source_id: request.id,
      idempotency_key: cleanIdempotencyKey || null,
      active: true
    }, userId);
    status = 'created_confirmed';
  }

  let commissionWarning = '';
  try {
    await upsertPartnerCommissionForSource({
      sourceType: 'booking_request',
      source: request,
      partnerId: request.partner_id || null,
      grossAmount: state.confirmed.reduce((sum, item) => sum + parseMoneyAmount(item.amount), 0) + normalizedAmount,
      financeEntryId: entry.id,
      userId,
      statusNotes: 'Recorded payments synchronized from booking request'
    });
  } catch (error) {
    commissionWarning = error?.message || 'Partner commission sync failed.';
  }

  await reconcileOwnedBookingEvents(request.id);

  return { status, entry, commissionWarning };
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
    booking_code: textOrNull(input.booking_code) || makeBookingCode(requestedDate || new Date().toISOString()),
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
  payload.terms_accepted = input.terms_accepted === true;
  payload.terms_version_id = textOrNull(input.terms_version_id);
  payload.terms_source = textOrNull(input.terms_source);

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

  let query = supabase
    .from('booking_requests')
    .select(requestFields)
    .order('created_at', { ascending: false })
    .limit(filters.limit || 250);

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

  const { data, error } = await query;
  if (error) throw error;
  const requests = data || [];
  if (!requests.length) return [];

  const requestIds = requests.map((request) => request.id).filter(Boolean);
  const fixedIds = [...new Set(requests.map((request) => request.fixed_excursion_id).filter(Boolean))];
  const termsAsOf = new Date().toISOString();
  const [fixedResult, financeResult, participantResult, termsResult, termsVersionsResult, invitationResult] = await Promise.all([
    fixedIds.length
      ? supabase.from('fixed_excursions').select('id, date, start_time, end_time, experience_id, title_it, title_en').in('id', fixedIds)
      : Promise.resolve({ data: [], error: null }),
    requestIds.length
      ? supabase.from('finance_entries')
          .select('id, created_at, entry_date, type, amount, currency, payment_method, status, reversal_of, booking_request_id, booking_code_id, source_type, source_id, active')
          .in('booking_request_id', requestIds)
          .eq('type', 'income')
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    requestIds.length
      ? supabase.from('booking_participants')
          .select('id, booking_request_id, full_name, participant_type, is_organizer, guardian_participant_id, status, created_at, updated_at')
          .in('booking_request_id', requestIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    requestIds.length
      ? supabase.from('terms_acceptances')
          .select('id, booking_request_id, terms_version_id, document_purpose, participant_id, actor_participant_id, actor_type, actor_name_snapshot, representation_type, locale, source_context, accepted_at, terms_versions(version, document_purpose, locale)')
          .in('booking_request_id', requestIds)
          .order('accepted_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase.from('terms_versions')
      .select('id, document_purpose, version, locale, effective_at, published_at')
      .eq('status', 'published')
      .lte('effective_at', termsAsOf)
      .lte('published_at', termsAsOf)
      .order('effective_at', { ascending: false })
      .order('published_at', { ascending: false })
      .order('id', { ascending: false }),
    requestIds.length
      ? supabase.from('terms_acceptance_invitations')
          .select('booking_request_id, participant_id, actor_participant_id, terms_version_id, representation_type, locale, issued_at, expires_at, consumed_at, revoked_at, revocation_reason')
          .in('booking_request_id', requestIds)
          .order('issued_at', { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ]);
  if (fixedResult.error) throw fixedResult.error;
  if (financeResult.error) throw financeResult.error;
  const participantSchemaUnavailable = ['42P01', 'PGRST205'].includes(participantResult.error?.code);
  if (participantResult.error && !participantSchemaUnavailable) throw participantResult.error;
  const termsSchemaUnavailable = [termsResult.error?.code, termsVersionsResult.error?.code].some((code) => ['42P01', 'PGRST200', 'PGRST205'].includes(code));
  if (termsResult.error && !termsSchemaUnavailable) throw termsResult.error;
  if (termsVersionsResult.error && !termsSchemaUnavailable) throw termsVersionsResult.error;
  const invitationSchemaUnavailable = ['42P01', 'PGRST200', 'PGRST205'].includes(invitationResult.error?.code);
  if (invitationResult.error && !invitationSchemaUnavailable) throw invitationResult.error;

  const fixedById = (fixedResult.data || []).reduce((acc, row) => ({ ...acc, [row.id]: row }), {});
  const financeByRequest = (financeResult.data || []).reduce((acc, row) => {
    if (!row.booking_request_id) return acc;
    if (!acc[row.booking_request_id]) acc[row.booking_request_id] = [];
    acc[row.booking_request_id].push(row);
    return acc;
  }, {});
  const participantsByRequest = (participantResult.data || []).reduce((acc, row) => {
    if (!row.booking_request_id) return acc;
    if (!acc[row.booking_request_id]) acc[row.booking_request_id] = [];
    acc[row.booking_request_id].push(row);
    return acc;
  }, {});
  const termsByRequest = (termsResult.data || []).reduce((acc, row) => {
    if (!row.booking_request_id) return acc;
    if (!acc[row.booking_request_id]) acc[row.booking_request_id] = [];
    acc[row.booking_request_id].push(row);
    return acc;
  }, {});
  const invitationsByRequest = (invitationResult.data || []).reduce((acc, row) => {
    if (!row.booking_request_id) return acc;
    if (!acc[row.booking_request_id]) acc[row.booking_request_id] = [];
    acc[row.booking_request_id].push(row);
    return acc;
  }, {});

  return requests.map((request) => ({
    ...request,
    fixed_excursion: fixedById[request.fixed_excursion_id] || null,
    finance_entries: financeByRequest[request.id] || [],
    booking_participants: participantsByRequest[request.id] || [],
    participant_foundation_available: !participantSchemaUnavailable,
    terms_acceptances: termsByRequest[request.id] || [],
    current_terms_versions: termsVersionsResult.data || [],
    terms_foundation_available: !termsSchemaUnavailable,
    terms_acceptance_invitations: invitationsByRequest[request.id] || [],
    terms_invitation_foundation_available: !invitationSchemaUnavailable
  }));
}

export async function updateBookingRequest(id, payload) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const update = { ...payload, updated_at: new Date().toISOString() };
  Object.keys(update).forEach((key) => update[key] === undefined && delete update[key]);

  const { data, error } = await supabase
    .from('booking_requests')
    .update(update)
    .eq('id', id)
    .select(requestFields)
    .single();

  if (error) throw error;
  return data;
}

export async function approveBookingRequest({ request, userId, mode = 'accept-only', decisionNote = '', limitedScope = 'experience' }) {
  const accepted = await updateBookingRequest(request.id, {
    status: 'accepted',
    booking_code: request.booking_code || stableBookingCodeForRequest(request),
    decision_note: decisionNote || null,
    decided_at: new Date().toISOString(),
    decided_by: userId
  });
  await reconcileOwnedBookingEvents(request.id);

  if (mode === 'accept-only') return { request: accepted, block: null, availabilityError: null };

  const requestedDate = request.requested_date;
  if (!requestedDate) {
    return { request: accepted, block: null, availabilityError: new Error('Request has no requested date.') };
  }

  let blockInput = null;
  if (mode === 'close-experience') {
    blockInput = {
      date: requestedDate,
      experience_id: request.experience_id && request.experience_id !== 'unsure' ? request.experience_id : null,
      status: 'closed',
      reason_it: 'Esperienza non disponibile',
      reason_en: 'Experience unavailable'
    };
  }

  if (mode === 'close-global') {
    blockInput = {
      date: requestedDate,
      experience_id: null,
      status: 'closed',
      reason_it: 'Data non disponibile',
      reason_en: 'Date unavailable'
    };
  }

  if (mode === 'limited') {
    blockInput = {
      date: requestedDate,
      experience_id: limitedScope === 'global' ? null : (request.experience_id && request.experience_id !== 'unsure' ? request.experience_id : null),
      status: 'limited',
      reason_it: 'Disponibilità limitata',
      reason_en: 'Limited availability'
    };
  }

  try {
    const block = await createAvailabilityBlock({
      ...blockInput,
      internal_note: decisionNote || null,
      created_by: userId,
      updated_by: userId,
      booking_request_id: request.id
    });

    const updated = await updateBookingRequest(request.id, { availability_block_id: block.id });
    return { request: updated, block, availabilityError: null };
  } catch (error) {
    return { request: accepted, block: null, availabilityError: error };
  }
}

export async function declineBookingRequest({ request, userId, decisionNote = '', reasonCategory = '' }) {
  const note = [reasonCategory, decisionNote].filter(Boolean).join(' · ');
  const updated = await updateBookingRequest(request.id, {
    status: 'declined',
    decision_note: note || null,
    decided_at: new Date().toISOString(),
    decided_by: userId
  });
  await reverseOrVoidFinanceForRequest(updated, userId, note || 'Booking request declined');
  await cancelUnpaidPartnerCommissionsForSource({ sourceType: 'booking_request', sourceId: updated.id, userId, reason: note || 'Booking request declined' });
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
  await reverseOrVoidFinanceForRequest(updated, userId, note || 'Booking request cancelled');
  await cancelUnpaidPartnerCommissionsForSource({ sourceType: 'booking_request', sourceId: updated.id, userId, reason: note || 'Booking request cancelled' });
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
