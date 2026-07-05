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
  'whatsapp_click',
  'email_click',
  'phone_click',
  'google_maps_click',
  'maps_click',
  'review_view',
  'session_start',
  'session_heartbeat',
  'session_end'
]);

const UNSAFE_METADATA_KEYS = new Set([
  'name', 'customer_name', 'guest_name', 'reviewer_name', 'email', 'customer_email',
  'phone', 'customer_phone', 'message', 'booking_message', 'notes', 'address',
  'coordinates', 'lat', 'lng', 'latitude', 'longitude', 'payment', 'card'
]);

function json(status, body = {}) {
  if (status === 204) return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
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
    const cleanValue = typeof value === 'number' || typeof value === 'boolean' ? value : cleanText(value, 220);
    if (cleanValue !== null && cleanValue !== undefined) safe[cleanKey] = cleanValue;
  });
  return safe;
}

function validIso(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizedTrafficSource(raw) {
  const value = (cleanText(raw, 40) || 'direct').toLowerCase();
  return ['direct', 'google', 'instagram', 'facebook', 'whatsapp', 'other'].includes(value) ? value : 'other';
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
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase analytics environment variables.');
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Supabase analytics write failed: ${response.status}`);
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
  return new Response(null, { status: 204 });
}

export async function onRequestPost(context) {
  try {
    const payload = await context.request.json();
    if (!EVENT_NAMES.has(payload?.event_name)) return json(400, { error: 'invalid_event_name' });
    const geo = cfGeo(context.request);
    const event = eventRow(payload, geo);
    if (!event.session_id || !event.visitor_id) return json(400, { error: 'missing_session' });
    const session = sessionRow(payload, geo);

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

    return json(204);
  } catch (error) {
    console.error('vulcanIQ analytics event write failed', {
      message: String(error?.message || error || 'unknown').slice(0, 220)
    });
    return json(502, { ok: false, error: 'analytics_write_failed' });
  }
}
