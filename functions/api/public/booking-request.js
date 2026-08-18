import {
  claimPublicRateLimit,
  cleanBoolean,
  cleanInteger,
  cleanText,
  clientActorHash,
  existingRequestByIdempotency,
  idempotencyKey,
  json,
  publicErrorMessage,
  readJsonBody,
  supabaseRpc,
  validDate,
  validEmail,
  validPhone,
  validateAntiAbuseFields,
  verifyTurnstile
} from './_shared.js';

const ALLOWED_REQUEST_TYPES = new Set(['private', 'fixed']);
const ALLOWED_CONTACTS = new Set(['whatsapp', 'phone', 'email', 'form', 'unknown']);
const ALLOWED_LANGUAGES = new Set(['it', 'en']);

function bookingPayload(input, key, actorHash) {
  const requestType = ALLOWED_REQUEST_TYPES.has(input.request_type) ? input.request_type : 'private';
  const preferredContact = ALLOWED_CONTACTS.has(input.preferred_contact) ? input.preferred_contact : 'unknown';
  const language = ALLOWED_LANGUAGES.has(input.language) ? input.language : 'it';
  return {
    customer_name: cleanText(input.customer_name, 120),
    customer_email: cleanText(input.customer_email, 254),
    customer_phone: cleanText(input.customer_phone, 40),
    preferred_contact: preferredContact,
    experience_id: cleanText(input.experience_id, 80) || 'unsure',
    requested_date: cleanText(input.requested_date, 20),
    alternative_date: cleanText(input.alternative_date, 20),
    language,
    party_type: cleanText(input.party_type, 80),
    request_type: requestType,
    fixed_excursion_id: cleanText(input.fixed_excursion_id, 80),
    adults: cleanInteger(input.adults, 0, 50),
    children: cleanInteger(input.children, 0, 50),
    children_under_3: cleanBoolean(input.children_under_3),
    private_experience: requestType === 'private',
    main_interest: cleanText(input.main_interest, 160),
    preferred_pace: cleanText(input.preferred_pace, 80),
    message: cleanText(input.message, 2500),
    heard_about_us: cleanText(input.heard_about_us, 80),
    heard_about_us_label: cleanText(input.heard_about_us_label, 160),
    heard_about_us_detail: cleanText(input.heard_about_us_detail, 240),
    source_section: cleanText(input.source_section, 80),
    source_cta: cleanText(input.source_cta, 80),
    cta_location: cleanText(input.cta_location, 80),
    selected_date: cleanText(input.selected_date, 20),
    selected_month: cleanText(input.selected_month, 12),
    has_fixed_excursion: requestType === 'fixed',
    traffic_source: cleanText(input.traffic_source, 80),
    detected_source: cleanText(input.detected_source || input.traffic_source, 80),
    declared_source: cleanText(input.declared_source || input.heard_about_us, 80),
    utm_source: cleanText(input.utm_source, 120),
    utm_medium: cleanText(input.utm_medium, 120),
    utm_campaign: cleanText(input.utm_campaign, 160),
    utm_content: cleanText(input.utm_content, 160),
    utm_term: cleanText(input.utm_term, 160),
    referrer: cleanText(input.referrer, 500),
    landing_path: cleanText(input.landing_path, 500),
    referral_code: cleanText(input.referral_code, 80),
    referral_source: cleanText(input.referral_source, 80),
    referral_landing_at: cleanText(input.referral_landing_at, 60),
    analytics_session_id: cleanText(input.analytics_session_id, 160),
    analytics_visitor_id: cleanText(input.analytics_visitor_id, 160),
    analytics_journey_id: cleanText(input.analytics_journey_id || input.booking_journey_id, 180),
    booking_journey_version: cleanText(input.booking_journey_version, 80),
    device_type: cleanText(input.device_type, 40),
    browser: cleanText(input.browser, 60),
    operating_system: cleanText(input.operating_system, 60),
    idempotency_key: key,
    submission_fingerprint: cleanText(input.submission_fingerprint, 180),
    submission_actor_hash: actorHash
  };
}

export async function onRequestOptions(context) {
  return json(context.request, context.env, 204);
}

export async function onRequestPost(context) {
  const traceId = crypto.randomUUID();
  const respond = (status, body = {}) => json(context.request, context.env, status, { ...body, trace_id: traceId }, { 'X-Trace-Id': traceId });
  const parsed = await readJsonBody(context.request, 32768);
  if (!parsed.ok) return respond(parsed.status, { ok: false, code: parsed.error, message: publicErrorMessage(parsed.error) });

  const input = parsed.value;
  const antiAbuse = validateAntiAbuseFields(input);
  if (!antiAbuse.ok) return respond(antiAbuse.status, { ok: false, code: antiAbuse.error, message: publicErrorMessage(antiAbuse.error) });

  const turnstile = await verifyTurnstile(context.request, context.env, input.turnstile_token);
  if (!turnstile.ok) return respond(403, { ok: false, code: turnstile.error, message: publicErrorMessage(turnstile.error) });

  const key = idempotencyKey(context.request, input, 'booking');
  if (!key) return respond(400, { ok: false, code: 'invalid_idempotency_key', message: publicErrorMessage('invalid_idempotency_key') });

  const existing = await existingRequestByIdempotency(context.env, 'booking_requests', key);
  if (existing?.id) return respond(200, { ok: true, duplicate: true, id: existing.id, created_at: existing.created_at });

  if (!validEmail(input.customer_email) || !validPhone(input.customer_phone) || (!cleanText(input.customer_email) && !cleanText(input.customer_phone))) {
    return respond(400, { ok: false, code: 'invalid_contact', message: publicErrorMessage('invalid_contact') });
  }
  if (!validDate(input.requested_date) || !validDate(input.alternative_date) || !validDate(input.selected_date)) {
    return respond(400, { ok: false, code: 'invalid_date', message: publicErrorMessage('invalid_date') });
  }

  const actorHash = await clientActorHash(context.request, context.env);
  const allowed = await claimPublicRateLimit(context.env, 'booking_request', actorHash, { actorLimit: 8, globalLimit: 600, windowSeconds: 3600 });
  if (!allowed) return respond(429, { ok: false, code: 'rate_limited', message: publicErrorMessage('rate_limited') });

  try {
    const result = await supabaseRpc(context.env, 'create_public_booking_request', { request_payload: bookingPayload(input, key, actorHash) }, { traceId });
    const created = Array.isArray(result) ? result[0] : result;
    if (!created?.id) throw new Error('request_creation_failed');
    return respond(201, { ok: true, id: created.id, status: created.status || 'pending', created_at: created.created_at });
  } catch {
    console.error('vulcanIQ booking request failed', { traceId, code: 'request_creation_failed' });
    return respond(500, { ok: false, code: 'request_creation_failed', message: publicErrorMessage('request_creation_failed') });
  }
}
