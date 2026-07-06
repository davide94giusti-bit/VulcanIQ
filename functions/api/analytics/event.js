// Keep this analytics allowlist synchronized with src/analytics.js.
const EVENT_NAMES = new Set([
  'page_view',
  'language_switch',
  'excursion_view',
  'experience_card_view',
  'experience_detail_open',
  'calendar_date_select',
  'booking_form_open',
  'booking_form_field_start',
  'request_details_open',
  'fixed_excursion_options_open',
  'private_excursion_options_open',
  'fixed_leaflet_open_from_request',
  'private_excursion_detail_open_from_request',
  'booking_form_submit_attempt',
  'booking_form_validation_error',
  'booking_form_submit_success',
  'booking_form_submit_error',
  'booking_submit',
  'booking_submit_attempt',
  'booking_submit_validation_error',
  'booking_submit_success',
  'booking_submit_error',
  'booking_request_created',
  'book_with_code_clicked',
  'booking_code_redeem_attempt',
  'booking_code_redeem_success',
  'booking_code_redeem_error',
  'booking_code_submitted',
  'booking_code_redeemed',
  'booking_code_invalid',
  'whatsapp_click',
  'email_click',
  'phone_click',
  'google_maps_click',
  'maps_click',
  'meeting_point_maps_click',
  'review_view',
  'social_link_click',
  'external_link_click',
  'google_reviews_click',
  'session_start',
  'session_heartbeat',
  'session_end',
  'pricing_card_view',
  'pricing_cta_click',
  'fast_request_start',
  'fast_request_step_complete',
  'fast_request_abandon',
  'fast_request_whatsapp_click',
  'fast_request_submit_attempt',
  'fast_request_submit_success',
  'gift_card_view',
  'gift_card_request_click',
  'gbp_utm_link_click',
  'lead_status_changed',
  'lead_follow_up_set',
  'booking_code_review_open',
  'booking_code_review_submit_attempt',
  'booking_code_review_submit_success',
  'booking_code_review_duplicate',
  'review_request_sent',
  'google_review_request_click',
  'gift_card_request_created',
  'gift_card_questionnaire_started',
  'gift_card_questionnaire_step_completed',
  'gift_card_whatsapp_request_clicked',
  'gift_card_status_changed',
  'gift_card_paid',
  'gift_card_issued',
  'gift_card_cancelled',
  'gift_card_whatsapp_reply_copied',
  'gift_card_email_reply_copied',
  'review_link_copied',
  'review_request_whatsapp_click',
  'review_requested_marked',
  'review_received_marked',
  'referral_code_created',
  'referral_link_copied',
  'referral_link_click',
  'referral_invalid_link_click',
  'referral_booking_request_created',
  'referral_code_disabled',
  'form_journey_started',
  'form_field_started',
  'abandoned_form_detected',
  'abandoned_form_recovered_whatsapp',
  'form_submit_success',
  'partner_source_assigned',
  'partner_commission_created',
  'partner_commission_status_changed',
  'partner_commission_marked_paid'
]);

const UNSAFE_METADATA_KEYS = new Set([
  'name',
  'customer_name',
  'guest_name',
  'reviewer_name',
  'email',
  'customer_email',
  'phone',
  'customer_phone',
  'message',
  'booking_message',
  'customer_note',
  'notes',
  'address',
  'coordinates',
  'lat',
  'lng',
  'latitude',
  'longitude',
  'payment',
  'card',
  'buyer_name',
  'buyer_email',
  'buyer_phone',
  'recipient_name',
  'partner_bank_details',
  'payment_details'
]);

function json(status, body = {}) {
  if (status === 204) {
    return new Response(null, {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

function cleanText(value, maxLength = 220) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/[\u0000-\u001f\u007f]/g, '');
  return text ? text.slice(0, maxLength) : null;
}

function cleanPath(value) {
  const raw = cleanText(value, 240) || '/';
  return raw.split('?')[0].slice(0, 240) || '/';
}

function cleanMetadata(metadata = {}) {
  const safe = {};

  Object.entries(metadata && typeof metadata === 'object' ? metadata : {}).forEach(([key, value]) => {
    const cleanKey = cleanText(key, 48);
    if (!cleanKey || UNSAFE_METADATA_KEYS.has(cleanKey.toLowerCase())) return;
    if (Array.isArray(value) || (value && typeof value === 'object')) return;

    const cleanValue = typeof value === 'number' || typeof value === 'boolean'
      ? value
      : cleanText(value, 220);

    if (cleanValue !== null && cleanValue !== undefined) {
      safe[cleanKey] = cleanValue;
    }
  });

  return safe;
}

function validIso(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizedTrafficSource(raw) {
  const value = (cleanText(raw, 40) || 'direct').toLowerCase();

  return [
    'direct',
    'google',
    'google_business_profile',
    'instagram',
    'facebook',
    'tiktok',
    'whatsapp',
    'partner',
    'qr',
    'business_card',
    'other'
  ].includes(value) ? value : 'other';
}

function cfGeo(request) {
  const cf = request.cf || {};

  return {
    country_code: cleanText(cf.country, 8),
    country_name: cleanText(cf.country, 80),
    city: cleanText(cf.city, 120)
  };
}

async function supabaseRequest(env, path, options) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase analytics environment variables.');
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase analytics write failed: ${response.status}`);
  }

  return response;
}

function sessionRow(payload, geo) {
  const duration = Math.max(0, Math.min(1800, Number.parseInt(payload.duration_seconds || 0, 10) || 0));

  return {
    session_id: cleanText(payload.session_id, 140),
    visitor_id: cleanText(payload.visitor_id, 140),
    started_at: validIso(payload.started_at || payload.occurred_at),
    last_seen_at: validIso(payload.occurred_at),
    duration_seconds: duration,
    pageview_count: Math.max(0, Number.parseInt(payload.pageview_count || 0, 10) || 0),
    entry_path: cleanPath(payload.entry_path || payload.path),
    exit_path: cleanPath(payload.path),
    referrer_domain: cleanText(payload.referrer_domain, 140),
    traffic_source: normalizedTrafficSource(payload.traffic_source),
    country_code: geo.country_code,
    country_name: geo.country_name,
    city: geo.city,
    language: cleanText(payload.language, 8),
    device_type: cleanText(payload.device_type, 24),
    browser: cleanText(payload.browser, 40),
    operating_system: cleanText(payload.operating_system, 40),
    updated_at: new Date().toISOString()
  };
}

function eventRow(payload, geo) {
  return {
    event_name: payload.event_name,
    session_id: cleanText(payload.session_id, 140),
    visitor_id: cleanText(payload.visitor_id, 140),
    occurred_at: validIso(payload.occurred_at),
    path: cleanPath(payload.path),
    section: cleanText(payload.section, 80),
    language: cleanText(payload.language, 8),
    referrer_domain: cleanText(payload.referrer_domain, 140),
    traffic_source: normalizedTrafficSource(payload.traffic_source),
    country_code: geo.country_code,
    country_name: geo.country_name,
    city: geo.city,
    device_type: cleanText(payload.device_type, 24),
    browser: cleanText(payload.browser, 40),
    operating_system: cleanText(payload.operating_system, 40),
    metadata: cleanMetadata(payload.metadata)
  };
}

export async function onRequestOptions() {
  return json(204);
}

export async function onRequestPost(context) {
  try {
    const payload = await context.request.json();

    // Analytics is diagnostic. Invalid analytics payloads should not create production noise.
    if (!EVENT_NAMES.has(payload?.event_name)) return json(204);

    const geo = cfGeo(context.request);
    const event = eventRow(payload, geo);

    // Missing identity should silently drop the analytics event.
    if (!event.session_id || !event.visitor_id) return json(204);

    const session = sessionRow(payload, geo);

    try {
      await supabaseRequest(context.env, 'analytics_sessions?on_conflict=session_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([session])
      });

      await supabaseRequest(context.env, 'analytics_events', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([event])
      });
    } catch {
      // Analytics write failures must never surface to the public website.
      return json(204);
    }

    return json(204);
  } catch {
    // Analytics parsing/runtime failures must never surface to the public website.
    return json(204);
  }
}