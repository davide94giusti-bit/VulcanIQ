export const ANALYTICS_CONTRACT_VERSION = 1;
export const ANALYTICS_TRACKING_CONTRACT_STARTED_AT = '2026-08-17T00:00:00.000Z';
export const ANALYTICS_BROWSER_OPT_OUT_KEY = 'vulcaniq_analytics_opt_out';
export const SMALL_SAMPLE_VISITOR_THRESHOLD = 100;

export const ANALYTICS_PERIODS = [
  ['baseline', { it: 'Dal nuovo riferimento', en: 'Since baseline' }],
  ['today', { it: 'Oggi', en: 'Today' }],
  ['7d', { it: 'Ultimi 7 giorni', en: 'Last 7 days' }],
  ['30d', { it: 'Ultimi 30 giorni', en: 'Last 30 days' }],
  ['90d', { it: 'Ultimi 90 giorni', en: 'Last 90 days' }],
  ['custom', { it: 'Intervallo personalizzato', en: 'Custom range' }],
  ['all', { it: 'Tutti i dati storici', en: 'All historical data' }]
];

export function analyticsPeriodLabel(key, lang = 'en') {
  return ANALYTICS_PERIODS.find(([value]) => value === key)?.[1]?.[lang] || key;
}

const REPORTING_TIME_ZONE = 'Europe/Rome';

function calendarDateInRome(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: REPORTING_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addCalendarDays(dateString, days) {
  const [year, month, day] = String(dateString || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function timeZoneOffsetMs(instant, timeZone = REPORTING_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(instant);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second));
  return asUtc - instant.getTime();
}

export function romeMidnightUtc(dateString) {
  const [year, month, day] = String(dateString || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  const localWallClockUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = new Date(localWallClockUtc);
  for (let pass = 0; pass < 3; pass += 1) {
    candidate = new Date(localWallClockUtc - timeZoneOffsetMs(candidate));
  }
  return candidate.toISOString();
}

export function defaultAnalyticsCustomRange(now = new Date()) {
  const today = calendarDateInRome(now);
  return { from: addCalendarDays(today, -6), to: today };
}

export function analyticsDateRange(period, now = new Date(), custom = {}) {
  if (period === 'all' || period === 'baseline') {
    return { from: '', to: '', useReportingBaseline: period === 'baseline', timeZone: REPORTING_TIME_ZONE };
  }
  if (period === 'custom') {
    const fromDate = String(custom.from || '').trim();
    const toDate = String(custom.to || '').trim();
    const from = romeMidnightUtc(fromDate);
    const to = romeMidnightUtc(addCalendarDays(toDate, 1));
    return { from, to, useReportingBaseline: true, timeZone: REPORTING_TIME_ZONE, customFrom: fromDate, customTo: toDate, valid: Boolean(from && to && Date.parse(from) < Date.parse(to)) };
  }
  const today = calendarDateInRome(now);
  const days = period === 'today' ? 1 : period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const fromDate = addCalendarDays(today, -(days - 1));
  return { from: romeMidnightUtc(fromDate), to: new Date(now).toISOString(), useReportingBaseline: true, timeZone: REPORTING_TIME_ZONE, valid: true };
}

export function percentValue(numerator, denominator) {
  const n = Number(numerator || 0);
  const d = Number(denominator || 0);
  if (!d) return null;
  return Math.round((n / d) * 1000) / 10;
}

export function formatPercentValue(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? `${n}%` : fallback;
}

export function classifySubmitIncident({ latestErrorAt, latestSuccessAt, now = new Date(), currentWindowHours = 24 } = {}) {
  const errorMs = Date.parse(latestErrorAt || '');
  const successMs = Date.parse(latestSuccessAt || '');
  if (!Number.isFinite(errorMs)) return 'none';
  if (Number.isFinite(successMs) && successMs > errorMs) return 'resolved';
  return errorMs >= now.getTime() - currentWindowHours * 3600000 ? 'current_failure' : 'retest_required';
}

export function safeExperienceConversion({ detailOpens, trackedSuccesses, coverageStatus }) {
  const opens = Number(detailOpens || 0);
  const successes = Number(trackedSuccesses || 0);
  if (coverageStatus !== 'compatible') return { value: null, status: 'incompatible_history' };
  if (!opens) return { value: null, status: 'insufficient_data' };
  if (successes > opens) return { value: null, status: 'invalid_funnel' };
  return { value: percentValue(successes, opens), status: 'ok' };
}

export function normalizeSummary(payload = {}) {
  const summary = payload?.summary || {};
  const funnels = payload?.funnels || {};
  const rates = payload?.rates || {};
  const dimensions = payload?.dimensions || {};
  const meta = payload?.meta || {};
  const integrity = payload?.integrity || {};
  return {
    meta,
    summary,
    funnels: {
      website: funnels.website || {},
      fastRequest: funnels.fast_request || funnels.fastRequest || {},
      giftCard: funnels.gift_card || funnels.giftCard || {},
      bookingCode: funnels.booking_code || funnels.bookingCode || {}
    },
    rates,
    dimensions,
    experienceDemand: Array.isArray(payload?.experience_demand) ? payload.experience_demand : [],
    integrity: {
      ...integrity,
      warnings: Array.isArray(integrity?.warnings) ? integrity.warnings : []
    }
  };
}

export function summaryToAdminModelPatch(payload = {}, formatDuration = (seconds) => `${seconds}s`, lang = 'en') {
  const data = normalizeSummary(payload);
  const copy = (it, en) => lang === 'it' ? it : en;
  const { summary, funnels, rates, dimensions, meta, integrity } = data;
  const website = funnels.website;
  const bookingCode = funnels.bookingCode;
  const gift = funnels.giftCard;
  const mapRows = (map = {}) => Object.entries(map || {}).map(([label, count]) => ({ label, count: Number(count || 0) })).sort((a, b) => b.count - a.count);
  const warnings = data.integrity.warnings.map((warning) => ({
    type: warning.severity || 'diagnostic',
    message: warning.message || warning.code || 'Analytics diagnostic',
    helper: warning.code || '',
    detail: warning.message || ''
  }));
  const sourceRowsRaw = mapRows(dimensions.traffic_sources);
  const directCount = Number(sourceRowsRaw.find((row) => row.label === 'direct')?.count || 0);
  const trafficLabel = (source) => ({
    direct: copy('Diretto', 'Direct'),
    customer_referral: copy('Passaparola cliente', 'Customer referral'),
    instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
    whatsapp: 'WhatsApp', google: 'Google',
    google_business_profile: 'Google Business Profile',
    partner: copy('Partner', 'Partner'), qr: 'QR',
    business_card: copy('Biglietto da visita', 'Business card'),
    other: copy('Altri referrer', 'Other referrers')
  }[source] || source);
  const sourceRows = sourceRowsRaw.map((row) => ({ ...row, label: trafficLabel(row.label), sourceKey: row.label }));
  const pageViews = Number(summary.page_views || 0);
  const experienceDetailOpens = data.experienceDemand.reduce((sum, row) => sum + Number(row.detail_opens || 0), 0);
  const experienceCardImpressions = data.experienceDemand.reduce((sum, row) => sum + Number(row.card_impressions || 0), 0);
  const canonicalExperienceRows = data.experienceDemand.map((row) => {
    const conversion = safeExperienceConversion({
      detailOpens: row.detail_opens,
      trackedSuccesses: row.tracked_successes,
      coverageStatus: row.coverage_status
    });
    const conversionLabel = conversion.status === 'ok'
      ? formatPercentValue(conversion.value)
      : conversion.status === 'incompatible_history'
        ? copy('Copertura storica incompatibile', 'Incompatible historical coverage')
        : copy('Dati compatibili insufficienti', 'Insufficient compatible tracking');
    return {
      experience: row.experience_id || 'unknown',
      card_impressions: Number(row.card_impressions || 0),
      detail_opens: Number(row.detail_opens || 0),
      unique_detail_visitors: Number(row.unique_detail_visitors || 0),
      form_opens: Number(row.form_opens || 0),
      tracked_successes: Number(row.tracked_successes || 0),
      database_requests: Number(row.database_requests || 0),
      confirmed_database_requests: Number(row.confirmed_database_requests || 0),
      contact_actions: Number(row.contact_actions || 0),
      tracked_conversion: conversionLabel,
      coverage_status: row.coverage_status || 'unknown'
    };
  });
  const flowRows = [
    { label: copy('Visualizzazioni pagina', 'Page views'), count: pageViews },
    { label: copy('Impression card esperienze', 'Experience card impressions'), count: experienceCardImpressions },
    { label: copy('Aperture dettaglio esperienze', 'Experience detail opens'), count: experienceDetailOpens },
    { label: copy('Aperture modulo sito', 'Website form opens'), count: Number(website.form_opens || 0) },
    { label: copy('Tentativi invio sito', 'Website submit attempts'), count: Number(website.submit_attempts || 0) },
    { label: copy('Invii riusciti sito', 'Website submit successes'), count: Number(website.submit_successes || 0) },
    { label: copy('Richieste DB sito compatibili', 'Compatible website DB requests'), count: Number(website.database_requests || 0) }
  ];
  const trafficAttributionQuality = sourceRows.map((row) => ({
    source: row.label,
    count: row.count,
    notes: row.sourceKey === 'direct' ? copy('Nessun UTM riconosciuto o referrer esterno utile', 'No recognized UTM or useful external referrer') : row.sourceKey === 'other' ? copy('Referrer/sorgente esterna non classificata', 'Unclassified external referrer/source') : copy('Sorgente normalizzata riconosciuta', 'Recognized normalized source')
  }));

  return {
    visitors: Number(summary.approx_unique_visitors || 0),
    pageViews,
    sessions: Number(summary.sessions || 0),
    averageEngagement: Number(summary.average_engagement_seconds || 0) ? formatDuration(summary.average_engagement_seconds) : '—',
    bookingRequests: Number(summary.booking_requests_total || 0),
    websiteRequests: Number(summary.website_requests || 0),
    bookingCodeRequests: Number(summary.booking_code_requests || 0),
    adminManualRequests: Number(summary.admin_manual_requests || 0),
    confirmedRequests: Number(summary.confirmed_website_requests || 0),
    confirmedBookingCodeRequests: Number(summary.confirmed_booking_code_requests || 0),
    giftCardRequests: Number(summary.gift_card_requests || 0),
    contactIntentVisitors: Number(summary.contact_intent_visitors || 0),
    whatsappClicks: Number(summary.whatsapp_clicks || 0),
    emailClicks: Number(summary.email_clicks || 0),
    phoneClicks: Number(summary.phone_clicks || 0),
    mapsClicks: Number(summary.maps_clicks || 0),
    formOpens: Number(website.form_opens || 0),
    submitAttempts: Number(website.submit_attempts || 0),
    validationErrors: Number(website.validation_errors || 0),
    submitSuccesses: Number(website.submit_successes || 0),
    submitErrors: Number(website.submit_errors || 0),
    bookingCodeRedeemAttempts: Number(bookingCode.redeem_attempts || 0),
    bookingCodeRedeemSuccesses: Number(bookingCode.redeem_successes || 0),
    bookingCodeRedeemErrors: Number(bookingCode.redeem_errors || 0),
    conversionMetrics: {
      websiteRequestConversion: formatPercentValue(rates.visitor_to_tracked_request),
      websiteFunnelCompletion: formatPercentValue(rates.website_funnel_completion),
      trackedSubmissionConversion: formatPercentValue(rates.website_funnel_completion),
      contactIntentConversion: formatPercentValue(rates.contact_intent_visitor_rate),
      confirmedBookingConversion: formatPercentValue(rates.confirmed_website_request_rate),
      bookingCodeConfirmationRate: formatPercentValue(rates.booking_code_redeem_rate)
    },
    deviceRows: mapRows(dimensions.devices),
    browserRows: mapRows(dimensions.browsers),
    osRows: mapRows(dimensions.operating_systems),
    countryRows: mapRows(dimensions.countries),
    cityRows: mapRows(dimensions.cities),
    sourceRows,
    languageRows: mapRows(dimensions.languages).map((row) => ({ ...row, label: row.label === 'it' ? copy('Pagine in italiano', 'Italian page views') : row.label === 'en' ? copy('Pagine in inglese', 'English page views') : row.label })),
    topPageRows: mapRows(dimensions.top_pages),
    experienceRows: data.experienceDemand.map((row) => ({ label: row.experience_id || 'unknown', count: Number(row.detail_opens || 0) })).sort((a, b) => b.count - a.count),
    experienceViews: experienceDetailOpens,
    experienceCardImpressions,
    flowRows,
    funnelRows: flowRows,
    trafficAttributionQuality,
    directTrafficShare: formatPercentValue(percentValue(directCount, pageViews), '0%'),
    warnings,
    lowSampleNote: Number(summary.approx_unique_visitors || 0) < SMALL_SAMPLE_VISITOR_THRESHOLD,
    analyticsCoverage: meta,
    submitIncidentState: integrity.submit_incident_state || 'none',
    canonicalFunnels: data.funnels,
    canonicalExperienceDemand: data.experienceDemand,
    canonicalExperienceRows
  };
}

const LEGACY_EVENT_ALIASES = new Map([
  ['booking_submit_attempt', 'booking_form_submit_attempt'],
  ['booking_submit_validation_error', 'booking_form_validation_error'],
  ['booking_submit_success', 'booking_form_submit_success'],
  ['booking_submit', 'booking_form_submit_success'],
  ['booking_submit_error', 'booking_form_submit_error'],
  ['booking_code_submitted', 'booking_code_redeem_attempt'],
  ['booking_code_redeemed', 'booking_code_redeem_success'],
  ['booking_code_invalid', 'booking_code_redeem_error']
]);

export function canonicalEventName(name = '') {
  const clean = String(name || '').trim();
  return LEGACY_EVENT_ALIASES.get(clean) || clean;
}

export function eventFunnelFamily(event = {}) {
  const name = canonicalEventName(event.event_name);
  const metadata = event.metadata || {};
  const formType = String(metadata.form_type || metadata.flow_type || '').trim();
  if (name.startsWith('fast_request_') || (['form_journey_started', 'form_field_started', 'abandoned_form_detected', 'abandoned_form_recovered_whatsapp', 'form_submit_success'].includes(name) && formType === 'fast_request')) return 'fast_request';
  if (name.startsWith('gift_card_')) return 'gift_card';
  if (name.startsWith('booking_code_') || (name === 'booking_request_created' && String(metadata.source || '').trim() === 'booking_code')) return 'booking_code';
  if (name.startsWith('booking_form_') || name === 'booking_request_created') return 'website';
  return 'other';
}

export function analyticsJourneyKey(event = {}) {
  const metadata = event.metadata || {};
  return metadata.booking_journey_id || metadata.journey_id || metadata.booking_request_id || event.id || '';
}

export function countDistinctJourneys(events = [], family, eventName) {
  const canonicalName = canonicalEventName(eventName);
  const keys = new Set();
  for (const event of events) {
    if (eventFunnelFamily(event) !== family) continue;
    if (canonicalEventName(event.event_name) !== canonicalName) continue;
    const key = analyticsJourneyKey(event);
    if (key) keys.add(key);
  }
  return keys.size;
}

export function uniquePageViewVisitors(events = []) {
  return new Set(events.filter((event) => canonicalEventName(event.event_name) === 'page_view').map((event) => event.visitor_id).filter(Boolean)).size;
}

const CONTACT_INTENT_EVENTS = new Set(['whatsapp_click', 'email_click', 'phone_click', 'google_maps_click', 'maps_click', 'fast_request_whatsapp_click', 'gift_card_whatsapp_request_clicked']);

export function distinctContactIntentVisitors(events = []) {
  return new Set(events.filter((event) => CONTACT_INTENT_EVENTS.has(canonicalEventName(event.event_name))).map((event) => event.visitor_id).filter(Boolean)).size;
}
