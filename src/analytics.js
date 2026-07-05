import { isSupabaseConfigured, supabase } from './lib/supabaseClient.js';

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
  'referral_code_created',
  'referral_link_click',
  'abandoned_form_detected',
  'abandoned_form_recovered_whatsapp'
]);

const VISITOR_KEY = 'vulcaniq_analytics_visitor_id';
const SESSION_KEY = 'vulcaniq_analytics_session';
const PAGEVIEW_COUNT_KEY = 'vulcaniq_analytics_pageview_count';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_SESSION_SECONDS = 30 * 60;
const DEDUPE_MS = 60 * 1000;
const EVENT_ENDPOINTS = ['/api/analytics/event'];
const UNSAFE_METADATA_KEYS = new Set([
  'name', 'customer_name', 'guest_name', 'reviewer_name',
  'email', 'customer_email', 'phone', 'customer_phone',
  'message', 'booking_message', 'notes', 'address', 'coordinates',
  'lat', 'lng', 'latitude', 'longitude', 'payment', 'card'
]);

const SAFE_UTM_KEYS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']);

const dedupeCache = new Map();

function browserStorage(kind) {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function hasDoNotTrack() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const values = [navigator.doNotTrack, window.doNotTrack, navigator.msDoNotTrack].filter(Boolean).map(String);
  return values.some((value) => value === '1' || value.toLowerCase() === 'yes');
}

function isAdminPath() {
  if (typeof window === 'undefined') return true;
  const normalizedPath = (`/${window.location.pathname || '/'}`).replace(/\/{2,}/g, '/');
  return normalizedPath.startsWith('/admin') || normalizedPath.startsWith('/api/');
}

function isLikelyBot() {
  if (typeof navigator === 'undefined') return false;
  return /bot|crawler|spider|crawling|lighthouse|pingdom|headless|preview|facebookexternalhit|whatsapp/i.test(navigator.userAgent || '');
}

function canTrack() {
  return typeof window !== 'undefined' && !hasDoNotTrack() && !isAdminPath() && !isLikelyBot();
}

function randomId(prefix) {
  const value = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${value}`;
}

function parseSession(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function getVisitorId() {
  const storage = browserStorage('local');
  if (!storage) return randomId('visitor');
  let visitorId = storage.getItem(VISITOR_KEY);
  if (!visitorId) {
    visitorId = randomId('visitor');
    storage.setItem(VISITOR_KEY, visitorId);
  }
  return visitorId;
}

function getSafePath() {
  if (typeof window === 'undefined') return '/';
  const path = `${window.location.pathname || '/'}${window.location.hash || ''}`;
  return path.slice(0, 240);
}

function ensureSession(section) {
  const now = Date.now();
  const storage = browserStorage('session');
  let session = storage ? parseSession(storage.getItem(SESSION_KEY)) : null;
  const expired = !session?.lastActivity || now - Number(session.lastActivity) > SESSION_TIMEOUT_MS;
  const isNew = !session?.sessionId || expired;
  if (isNew) {
    session = {
      sessionId: randomId('session'),
      startedAt: now,
      lastActivity: now,
      entryPath: getSafePath(),
      section: section || '',
      sessionStartSent: false
    };
    if (storage) storage.setItem(PAGEVIEW_COUNT_KEY, '0');
  } else {
    session.lastActivity = now;
    if (section) session.section = section;
  }
  if (storage) storage.setItem(SESSION_KEY, JSON.stringify(session));
  return { ...session, isNew };
}

function updatePageviewCount(eventName) {
  const storage = browserStorage('session');
  if (!storage) return eventName === 'page_view' ? 1 : 0;
  const current = Number.parseInt(storage.getItem(PAGEVIEW_COUNT_KEY) || '0', 10) || 0;
  const next = eventName === 'page_view' ? current + 1 : current;
  storage.setItem(PAGEVIEW_COUNT_KEY, String(next));
  return next;
}

function currentSessionDurationSeconds(session) {
  const seconds = Math.round((Date.now() - Number(session.startedAt || Date.now())) / 1000);
  return Math.max(0, Math.min(MAX_SESSION_SECONDS, seconds));
}

function sanitizeText(value, maxLength = 180) {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  return text.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength);
}

export function guestBucket(adults, children = 0) {
  const total = Number(adults || 0) + Number(children || 0);
  if (!total) return 'unknown';
  if (total === 1) return '1';
  if (total === 2) return '2';
  if (total <= 4) return '3-4';
  return '5+';
}

function sanitizeMetadata(metadata = {}) {
  const output = {};
  Object.entries(metadata || {}).forEach(([key, value]) => {
    const cleanKey = sanitizeText(key, 48);
    if (!cleanKey || UNSAFE_METADATA_KEYS.has(cleanKey.toLowerCase())) return;
    if (Array.isArray(value)) {
      const cleanArray = value
        .filter((item) => ['string', 'number', 'boolean'].includes(typeof item))
        .map((item) => (typeof item === 'number' || typeof item === 'boolean' ? item : sanitizeText(item, 80)))
        .filter((item) => item !== undefined)
        .slice(0, 24);
      if (cleanArray.length) output[cleanKey] = cleanArray;
      return;
    }
    if (value && typeof value === 'object') return;
    const cleanValue = typeof value === 'number' || typeof value === 'boolean' ? value : sanitizeText(value, 220);
    if (cleanValue !== undefined) output[cleanKey] = cleanValue;
  });
  return output;
}

function safeUtmMetadata() {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search || '');
  const output = {};
  SAFE_UTM_KEYS.forEach((key) => {
    const value = sanitizeText(params.get(key), 120);
    if (value) output[key] = value;
  });
  return output;
}

function currentSessionSection() {
  const storage = browserStorage('session');
  if (!storage) return '';
  const session = parseSession(storage.getItem(SESSION_KEY));
  return sanitizeText(session?.section || '', 80) || '';
}

function normalizeTrafficSourceValue(source, medium = '') {
  const value = sanitizeText(source, 80)?.toLowerCase().replace(/[-\s]+/g, '_') || '';
  const mediumValue = sanitizeText(medium, 80)?.toLowerCase().replace(/[-\s]+/g, '_') || '';
  if (!value) return 'direct';
  if (value.includes('instagram') || value === 'ig') return 'instagram';
  if (value.includes('facebook') || value === 'fb') return 'facebook';
  if (value.includes('whatsapp') || value === 'wa') return 'whatsapp';
  if (value.includes('google_business_profile') || value.includes('google_my_business') || value.includes('gbp')) return 'google_business_profile';
  if (value.includes('google')) return 'google';
  if (value.includes('partner')) return 'partner';
  if (value.includes('tiktok') || value === 'tt') return 'tiktok';
  if (value.includes('direct')) return 'direct';
  if (['social', 'story', 'bio', 'share', 'partner', 'organic'].includes(mediumValue)) return value.slice(0, 80) || 'other';
  return 'other';
}

function referrerParts() {
  const utm = safeUtmMetadata();
  if (utm.utm_source) {
    return { referrer_domain: '', traffic_source: normalizeTrafficSourceValue(utm.utm_source, utm.utm_medium) };
  }
  if (typeof document === 'undefined') return { referrer_domain: '', traffic_source: 'direct' };
  const raw = document.referrer || '';
  if (!raw) return { referrer_domain: '', traffic_source: 'direct' };
  try {
    const referrer = new URL(raw);
    const domain = referrer.hostname.replace(/^www\./, '').toLowerCase();
    if (!domain || domain === window.location.hostname.replace(/^www\./, '').toLowerCase()) {
      return { referrer_domain: '', traffic_source: 'direct' };
    }
    if (domain.includes('google.')) return { referrer_domain: domain, traffic_source: 'google' };
    if (domain.includes('instagram.')) return { referrer_domain: domain, traffic_source: 'instagram' };
    if (domain.includes('facebook.') || domain === 'fb.com' || domain === 'm.facebook.com') return { referrer_domain: domain, traffic_source: 'facebook' };
    if (domain.includes('whatsapp.')) return { referrer_domain: domain, traffic_source: 'whatsapp' };
    return { referrer_domain: domain.slice(0, 140), traffic_source: 'other' };
  } catch {
    return { referrer_domain: '', traffic_source: 'direct' };
  }
}

function deviceInfo() {
  if (typeof navigator === 'undefined') return { device_type: 'unknown', browser: 'unknown', operating_system: 'unknown' };
  const ua = navigator.userAgent || '';
  const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const isTablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) || (width >= 700 && width <= 1024 && /Mobile|Android|iPad/i.test(ua));
  const isMobile = !isTablet && (/Mobi|Android|iPhone|iPod/i.test(ua) || width < 700);
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
      : /CriOS|Chrome\//.test(ua) && !/Edg\//.test(ua) ? 'Chrome'
        : /Safari\//.test(ua) && !/Chrome\//.test(ua) ? 'Safari'
          : /Firefox\//.test(ua) ? 'Firefox'
            : 'Other';
  const operating_system = /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Android/i.test(ua) ? 'Android'
      : /Mac OS X/i.test(ua) ? 'macOS'
        : /Windows/i.test(ua) ? 'Windows'
          : /Linux/i.test(ua) ? 'Linux'
            : 'Other';
  return { device_type: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop', browser, operating_system };
}

function dedupeKey(eventName, payload) {
  if (eventName === 'page_view') return `${eventName}:${payload.section || ''}:${payload.path || ''}:${payload.language || ''}`;
  if (eventName === 'review_view') return `${eventName}:${payload.session_id}`;
  if (eventName === 'excursion_view' || eventName === 'experience_detail_open') return `${eventName}:${payload.session_id}:${payload.metadata?.experience_slug || payload.metadata?.slug || payload.metadata?.experience || ''}`;
  if (eventName === 'experience_card_view') return `${eventName}:${payload.session_id}:${payload.metadata?.experience_slug || payload.metadata?.experience || ''}`;
  if (eventName === 'booking_form_open') {
    const meta = payload.metadata || {};
    return [eventName, payload.session_id, meta.experience_slug || meta.experience || meta.request_type || '', meta.source_cta || '', meta.cta_location || '', meta.selected_date || ''].join(':');
  }
  return '';
}

function shouldDedupe(eventName, payload) {
  const key = dedupeKey(eventName, payload);
  if (!key) return false;
  const now = Date.now();
  const previous = dedupeCache.get(key) || 0;
  if (now - previous < DEDUPE_MS || (eventName === 'review_view' && previous)) return true;
  dedupeCache.set(key, now);
  return false;
}

function buildPayload(eventName, metadata = {}, options = {}) {
  const cleanMetadata = sanitizeMetadata({ ...safeUtmMetadata(), ...metadata });
  const priorSection = currentSessionSection();
  const section = sanitizeText(options.section || cleanMetadata.source_section || cleanMetadata.section || cleanMetadata.location || '', 80);
  if (!cleanMetadata.source_section && section) cleanMetadata.source_section = section;
  if (!cleanMetadata.cta_location && cleanMetadata.location) cleanMetadata.cta_location = cleanMetadata.location;
  if (!cleanMetadata.top_previous_section && !cleanMetadata.previous_section) cleanMetadata.top_previous_section = priorSection || 'unknown';
  const session = ensureSession(section);
  const { referrer_domain, traffic_source } = referrerParts();
  const info = deviceInfo();
  if (!cleanMetadata.traffic_source && traffic_source) cleanMetadata.traffic_source = traffic_source;
  if (!cleanMetadata.referrer_domain && referrer_domain) cleanMetadata.referrer_domain = referrer_domain;
  if (!cleanMetadata.device_type && info.device_type) cleanMetadata.device_type = info.device_type;
  const pageviewCount = updatePageviewCount(eventName);
  const durationSeconds = currentSessionDurationSeconds(session);
  return {
    event_name: eventName,
    visitor_id: getVisitorId(),
    session_id: session.sessionId,
    occurred_at: new Date().toISOString(),
    path: sanitizeText(options.path || cleanMetadata.path || getSafePath(), 240) || '/',
    section: section || undefined,
    language: sanitizeText(options.language || cleanMetadata.language || document.documentElement.lang || 'it', 8) || 'it',
    referrer_domain,
    traffic_source,
    ...info,
    duration_seconds: durationSeconds,
    pageview_count: pageviewCount,
    entry_path: session.entryPath || '/',
    metadata: cleanMetadata,
    is_new_session: session.isNew
  };
}


export function getAnalyticsIdentitySnapshot(section = '') {
  const fallbackInfo = deviceInfo();
  const fallbackReferrer = referrerParts();
  const utm = safeUtmMetadata();
  if (!canTrack()) {
    return {
      traffic_source: fallbackReferrer.traffic_source || 'direct',
      referrer_domain: fallbackReferrer.referrer_domain || '',
      ...fallbackInfo,
      ...utm
    };
  }
  const session = ensureSession(section || currentSessionSection() || 'contact');
  const visitorId = getVisitorId();
  return {
    analytics_session_id: session.sessionId,
    analytics_visitor_id: visitorId,
    session_id: session.sessionId,
    visitor_id: visitorId,
    traffic_source: fallbackReferrer.traffic_source || 'direct',
    referrer_domain: fallbackReferrer.referrer_domain || '',
    ...fallbackInfo,
    ...utm
  };
}

async function directSupabaseFallback(payload) {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    if (payload.is_new_session || payload.event_name === 'session_start') {
      await supabase.from('analytics_sessions').insert({
        session_id: payload.session_id,
        visitor_id: payload.visitor_id,
        started_at: payload.occurred_at,
        last_seen_at: payload.occurred_at,
        duration_seconds: payload.duration_seconds || 0,
        pageview_count: payload.pageview_count || 0,
        entry_path: payload.entry_path || payload.path,
        exit_path: payload.path,
        referrer_domain: payload.referrer_domain || null,
        traffic_source: payload.traffic_source || null,
        language: payload.language || null,
        device_type: payload.device_type || null,
        browser: payload.browser || null,
        operating_system: payload.operating_system || null
      });
    }
    await supabase.from('analytics_events').insert({
      event_name: payload.event_name,
      session_id: payload.session_id,
      visitor_id: payload.visitor_id,
      occurred_at: payload.occurred_at,
      path: payload.path || null,
      section: payload.section || null,
      language: payload.language || null,
      referrer_domain: payload.referrer_domain || null,
      traffic_source: payload.traffic_source || null,
      device_type: payload.device_type || null,
      browser: payload.browser || null,
      operating_system: payload.operating_system || null,
      metadata: payload.metadata || {}
    });
  } catch {
    // Analytics must never affect public browsing.
  }
}

function sendWithBeacon(endpoint, payload) {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    return navigator.sendBeacon(endpoint, blob);
  } catch {
    return false;
  }
}

async function sendPayload(payload, options = {}) {
  if (options.transport === 'beacon') {
    const sent = EVENT_ENDPOINTS.some((endpoint) => sendWithBeacon(endpoint, payload));
    if (sent) return;
  }
  for (const endpoint of EVENT_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: Boolean(options.keepalive || payload.event_name.startsWith('session_'))
      });
      if (response.ok || response.status === 204) return;
    } catch {
      // Try the next endpoint, then direct Supabase fallback.
    }
  }
  await directSupabaseFallback(payload);
}

export async function trackEvent(eventName, metadata = {}, options = {}) {
  if (!EVENT_NAMES.has(eventName) || !canTrack()) return undefined;
  const payload = buildPayload(eventName, metadata, options);
  if (options.dedupe !== false && shouldDedupe(eventName, payload)) return undefined;
  return sendPayload(payload, options);
}

export function trackPageView(section, metadata = {}) {
  trackEvent('page_view', { ...metadata, section }, { section });
}

export function trackLanguageSwitch(from, to) {
  if (!from || !to || from === to) return;
  trackEvent('language_switch', { from, to }, { dedupe: false });
}

const EXPERIENCE_SLUGS = new Set(['etna-learning', 'etna-stories', 'etna-premium', 'etna-live']);

function normalizeExperienceSlug(value) {
  const clean = sanitizeText(value, 80)?.toLowerCase().replace(/_/g, '-') || '';
  if (EXPERIENCE_SLUGS.has(clean)) return clean;
  if (clean.includes('learning')) return 'etna-learning';
  if (clean.includes('stories')) return 'etna-stories';
  if (clean.includes('premium')) return 'etna-premium';
  if (clean.includes('live')) return 'etna-live';
  return '';
}

function normalizeRequestType(value) {
  const clean = sanitizeText(value, 40)?.toLowerCase().replace(/_/g, '-') || '';
  if (clean.includes('fixed')) return 'fixed';
  if (clean.includes('private')) return 'private';
  if (clean.includes('contact')) return 'contact';
  if (clean === 'experience') return 'experience';
  return '';
}

function experienceMetadata(experience, metadata = {}) {
  const sourceValue = typeof experience === 'object' && experience
    ? (experience.id || experience.slug || experience.title?.it || experience.title?.en || experience.title || '')
    : (experience || metadata.experience_slug || metadata.experience_id || metadata.experience || metadata.slug || '');
  const slug = normalizeExperienceSlug(metadata.experience_slug || metadata.experience_id || sourceValue);
  const requestType = normalizeRequestType(metadata.request_type || sourceValue) || (slug ? 'experience' : 'private');
  const experienceName = metadata.experience_name || (typeof experience === 'object'
    ? (experience.title?.it || experience.title?.en || experience.title || slug || sourceValue)
    : metadata.experience || metadata.experience_name || slug || sourceValue || requestType);
  return {
    request_type: requestType,
    ...(slug ? { experience: slug, experience_id: metadata.experience_id || slug, experience_slug: slug } : {}),
    experience_name: experienceName,
    ...metadata,
    request_type: metadata.request_type || requestType,
    ...(slug ? { experience_id: metadata.experience_id || slug, experience_slug: metadata.experience_slug || slug } : {})
  };
}

function bookingContext(metadata = {}) {
  const requestType = normalizeRequestType(metadata.request_type) || (metadata.experience_slug || metadata.experience_id ? 'experience' : 'private');
  return {
    request_type: requestType,
    source_section: metadata.source_section || metadata.section || 'contact',
    source_cta: metadata.source_cta || 'prepare_request',
    cta_location: metadata.cta_location || metadata.location || 'contact_section',
    booking_journey_version: metadata.booking_journey_version || '20260629-funnel-integrity',
    ...metadata
  };
}

export function trackExcursionView(experience = {}) {
  trackEvent('excursion_view', experienceMetadata(experience));
}

export function trackExperienceCardView(experience = {}) {
  trackEvent('experience_card_view', experienceMetadata(experience, { section: 'experiences' }));
}

export function trackExperienceDetailOpen(experience = {}) {
  trackEvent('experience_detail_open', experienceMetadata(experience, { section: 'experiences' }));
}

export function trackCalendarDateSelect(date, metadata = {}) {
  trackEvent('calendar_date_select', { date, section: 'experiences', ...metadata }, { dedupe: false });
}

export function trackBookingFormOpen(experience, metadata = {}) {
  trackEvent('booking_form_open', experienceMetadata(experience, bookingContext({ source: 'booking_form', ...metadata })));
}

export function trackBookingFormFieldStart(experience, metadata = {}) {
  trackEvent('booking_form_field_start', experienceMetadata(experience, bookingContext({ source: 'booking_form', ...metadata })), { dedupe: false });
}

export async function trackBookingSubmitAttempt(experience, adults, children, metadata = {}) {
  const base = {
    ...experienceMetadata(experience, bookingContext(metadata)),
    participants: Number(adults || 0) + Number(children || 0),
    guests_bucket: guestBucket(adults, children),
    source: 'booking_form'
  };
  await Promise.allSettled([
    trackEvent('booking_form_submit_attempt', base, { dedupe: false }),
    trackEvent('booking_submit_attempt', base, { dedupe: false })
  ]);
}

export async function trackBookingSubmitValidationError(experience, reason, metadata = {}) {
  const base = {
    ...experienceMetadata(experience, bookingContext(metadata)),
    validation_reason: reason || 'unknown',
    source: 'booking_form'
  };
  await Promise.allSettled([
    trackEvent('booking_form_validation_error', base, { dedupe: false }),
    trackEvent('booking_submit_validation_error', base, { dedupe: false })
  ]);
}

export async function trackBookingSubmitSuccess(experience, adults, children, metadata = {}) {
  const bookingRequestId = metadata.booking_request_id || metadata.request_id || '';
  const base = {
    ...experienceMetadata(experience, bookingContext(metadata)),
    ...(bookingRequestId ? { booking_request_id: bookingRequestId, request_id: bookingRequestId } : {}),
    participants: Number(adults || 0) + Number(children || 0),
    guests_bucket: guestBucket(adults, children),
    source: 'booking_form'
  };
  await Promise.allSettled([
    trackEvent('booking_form_submit_success', base, { dedupe: false }),
    trackEvent('booking_request_created', base, { dedupe: false }),
    trackEvent('booking_submit_success', base, { dedupe: false }),
    trackEvent('booking_submit', base, { dedupe: false })
  ]);
}

export async function trackBookingSubmitError(experience, errorType, metadata = {}) {
  const base = {
    ...experienceMetadata(experience, bookingContext(metadata)),
    error_type: errorType || 'supabase_or_unexpected_error',
    source: 'booking_form'
  };
  await Promise.allSettled([
    trackEvent('booking_form_submit_error', base, { dedupe: false }),
    trackEvent('booking_submit_error', base, { dedupe: false })
  ]);
}

export function trackBookingSubmit(experience, adults, children) {
  trackBookingSubmitSuccess(experience, adults, children);
}

export function trackContactClick(type, location, metadata = {}) {
  const eventName = type === 'whatsapp' ? 'whatsapp_click' : type === 'email' ? 'email_click' : type === 'phone' ? 'phone_click' : '';
  if (!eventName) return;
  const ctaLocation = location || metadata.cta_location || 'contact_section';
  trackEvent(eventName, bookingContext({
    location: ctaLocation,
    cta_location: ctaLocation,
    source_cta: metadata.source_cta || `${type}_direct`,
    previous_section: metadata.previous_section || currentSessionSection() || metadata.section || 'unknown',
    top_previous_section: metadata.top_previous_section || metadata.previous_section || currentSessionSection() || metadata.section || 'unknown',
    ...metadata
  }), { dedupe: false, transport: 'beacon' });
}

export function trackMapsClick(location, metadata = {}) {
  const ctaLocation = location || metadata.cta_location || 'google_maps_link';
  const base = bookingContext({
    location: ctaLocation,
    cta_location: ctaLocation,
    source_cta: metadata.source_cta || 'google_maps_direct',
    ...metadata
  });
  trackEvent('google_maps_click', base, { dedupe: false, transport: 'beacon' });
  trackEvent('maps_click', base, { dedupe: false, transport: 'beacon' });
}

export function trackReviewView() {
  trackEvent('review_view', { section: 'reviews' });
}

export function startAnalyticsHeartbeat(getContext = () => ({})) {
  if (!canTrack()) return () => {};
  trackEvent('session_start', getContext(), { dedupe: false });
  const heartbeat = () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    trackEvent('session_heartbeat', getContext(), { dedupe: false, keepalive: true });
  };
  const interval = window.setInterval(heartbeat, 25000);
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      trackEvent('session_end', getContext(), { dedupe: false, transport: 'beacon' });
    } else {
      heartbeat();
    }
  };
  window.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onVisibilityChange);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onVisibilityChange);
  };
}
