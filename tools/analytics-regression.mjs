import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  analyticsDateRange,
  defaultAnalyticsCustomRange,
  romeMidnightUtc,
  canonicalEventName,
  classifySubmitIncident,
  countDistinctJourneys,
  distinctContactIntentVisitors,
  eventFunnelFamily,
  normalizeSummary,
  safeExperienceConversion,
  formatPercentValue,
  summaryToAdminModelPatch,
  uniquePageViewVisitors
} from '../src/features/analytics/contract.js';
import { readPrivacyPreferences, writePrivacyPreferences } from '../src/services/privacyPreferences.js';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const passes = [];
const failures = [];
function test(name, fn) {
  try { fn(); passes.push(name); }
  catch (error) { failures.push(`${name}: ${error.message}`); }
}

const fixtureEvents = [
  { id: 'p1', event_name: 'page_view', visitor_id: 'visitor-a', metadata: {} },
  { id: 'p2', event_name: 'page_view', visitor_id: 'visitor-a', metadata: {} },
  { id: 'p3', event_name: 'page_view', visitor_id: 'visitor-b', metadata: {} },
  { id: 'w1', event_name: 'booking_form_open', visitor_id: 'visitor-a', metadata: { booking_journey_id: 'booking-1' } },
  { id: 'w2', event_name: 'booking_form_submit_attempt', visitor_id: 'visitor-a', metadata: { booking_journey_id: 'booking-1' } },
  { id: 'w2a', event_name: 'booking_submit_attempt', visitor_id: 'visitor-a', metadata: { booking_journey_id: 'booking-1' } },
  { id: 'w3', event_name: 'booking_form_submit_success', visitor_id: 'visitor-a', metadata: { booking_journey_id: 'booking-1' } },
  { id: 'f1', event_name: 'form_journey_started', visitor_id: 'visitor-b', metadata: { journey_id: 'fast-1', form_type: 'fast_request' } },
  { id: 'f2', event_name: 'form_submit_success', visitor_id: 'visitor-b', metadata: { journey_id: 'fast-1', flow_type: 'fast_request' } },
  { id: 'f3', event_name: 'fast_request_whatsapp_click', visitor_id: 'visitor-b', metadata: { journey_id: 'fast-1' } },
  { id: 'g1', event_name: 'gift_card_view', visitor_id: 'visitor-b', metadata: { journey_id: 'gift-1' } },
  { id: 'g2', event_name: 'gift_card_request_created', visitor_id: 'visitor-b', metadata: { journey_id: 'gift-1' } },
  { id: 'b1', event_name: 'booking_code_submitted', visitor_id: 'visitor-b', metadata: { booking_request_id: 'req-1' } },
  { id: 'b2', event_name: 'booking_code_redeem_success', visitor_id: 'visitor-b', metadata: { booking_request_id: 'req-1' } },
  { id: 'c1', event_name: 'whatsapp_click', visitor_id: 'visitor-a', metadata: {} },
  { id: 'c2', event_name: 'whatsapp_click', visitor_id: 'visitor-a', metadata: {} },
  { id: 'c3', event_name: 'phone_click', visitor_id: 'visitor-b', metadata: {} }
];

test('website funnel excludes fast-request generic events', () => {
  assert.equal(eventFunnelFamily(fixtureEvents.find((event) => event.id === 'f1')), 'fast_request');
  assert.equal(countDistinctJourneys(fixtureEvents, 'website', 'booking_form_open'), 1);
});

test('fast-request funnel is isolated', () => {
  assert.equal(countDistinctJourneys(fixtureEvents, 'fast_request', 'form_submit_success'), 1);
  assert.equal(eventFunnelFamily(fixtureEvents.find((event) => event.id === 'f3')), 'fast_request');
});

test('Gift Card funnel is isolated', () => {
  assert.equal(eventFunnelFamily(fixtureEvents.find((event) => event.id === 'g1')), 'gift_card');
  assert.equal(countDistinctJourneys(fixtureEvents, 'gift_card', 'gift_card_request_created'), 1);
});

test('booking-code funnel is isolated and aliases canonicalize', () => {
  assert.equal(canonicalEventName('booking_code_submitted'), 'booking_code_redeem_attempt');
  assert.equal(countDistinctJourneys(fixtureEvents, 'booking_code', 'booking_code_redeem_attempt'), 1);
});

test('booking-code request-created event never enters website funnel', () => {
  const event = { id: 'bc-created', event_name: 'booking_request_created', metadata: { source: 'booking_code', booking_request_id: 'r1' } };
  assert.equal(eventFunnelFamily(event), 'booking_code');
  assert.equal(countDistinctJourneys([event], 'website', 'booking_request_created'), 0);
});

test('legacy booking alias cannot double count the same journey', () => {
  assert.equal(canonicalEventName('booking_submit_attempt'), 'booking_form_submit_attempt');
  assert.equal(countDistinctJourneys(fixtureEvents, 'website', 'booking_form_submit_attempt'), 1);
});

test('All-history visitor count is monotonic when events are appended', () => {
  const before = uniquePageViewVisitors(fixtureEvents);
  const afterExisting = uniquePageViewVisitors([...fixtureEvents, { id: 'p4', event_name: 'page_view', visitor_id: 'visitor-a', metadata: {} }]);
  const afterNew = uniquePageViewVisitors([...fixtureEvents, { id: 'p5', event_name: 'page_view', visitor_id: 'visitor-c', metadata: {} }]);
  assert.equal(before, 2);
  assert.equal(afterExisting, 2);
  assert.equal(afterNew, 3);
});

test('period contract distinguishes baseline from all historical data', () => {
  assert.equal(analyticsDateRange('baseline').useReportingBaseline, true);
  assert.equal(analyticsDateRange('all').useReportingBaseline, false);
});

test('Europe/Rome date ranges use half-open DST-safe boundaries', () => {
  assert.equal(romeMidnightUtc('2026-01-15'), '2026-01-14T23:00:00.000Z');
  assert.equal(romeMidnightUtc('2026-07-15'), '2026-07-14T22:00:00.000Z');
  const custom = analyticsDateRange('custom', new Date('2026-08-18T10:00:00Z'), { from: '2026-08-10', to: '2026-08-16' });
  assert.equal(custom.from, '2026-08-09T22:00:00.000Z');
  assert.equal(custom.to, '2026-08-16T22:00:00.000Z');
  assert.equal(custom.valid, true);
  assert.deepEqual(defaultAnalyticsCustomRange(new Date('2026-08-18T10:00:00Z')), { from: '2026-08-12', to: '2026-08-18' });
});

test('server submit incidents respect the effective baseline/range', () => {
  assert.match(read('supabase/migrations/20260818090000_analytics_consolidation.sql'), /where occurred_at >= v_funnel_from\s+and occurred_at < v_to/);
});

test('current submit incident is recency aware', () => {
  const now = new Date('2026-08-18T12:00:00Z');
  assert.equal(classifySubmitIncident({ latestErrorAt: '2026-08-18T11:00:00Z', now }), 'current_failure');
  assert.equal(classifySubmitIncident({ latestErrorAt: '2026-08-16T11:00:00Z', now }), 'retest_required');
});

test('later canonical success resolves prior submit incident', () => {
  const now = new Date('2026-08-18T12:00:00Z');
  assert.equal(classifySubmitIncident({ latestErrorAt: '2026-08-18T10:00:00Z', latestSuccessAt: '2026-08-18T10:30:00Z', now }), 'resolved');
});

test('contact intent counts distinct visitors not raw clicks', () => {
  assert.equal(distinctContactIntentVisitors(fixtureEvents), 2);
});

test('experience conversion rejects incompatible history and >100 percent', () => {
  assert.equal(safeExperienceConversion({ detailOpens: 1, trackedSuccesses: 3, coverageStatus: 'compatible' }).status, 'invalid_funnel');
  assert.equal(safeExperienceConversion({ detailOpens: 10, trackedSuccesses: 2, coverageStatus: 'mixed_history' }).status, 'incompatible_history');
  assert.deepEqual(safeExperienceConversion({ detailOpens: 10, trackedSuccesses: 2, coverageStatus: 'compatible' }), { value: 20, status: 'ok' });
});

const sampleSummary = {
  meta: { data_complete: true, analytics_event_count: 5000, analytics_session_count: 300 },
  summary: { approx_unique_visitors: 250, page_views: 900, sessions: 300, website_requests: 9, booking_code_requests: 5, gift_card_requests: 2, contact_intent_visitors: 20 },
  funnels: { website: { form_opens: 30, submit_attempts: 10, submit_successes: 8 }, fast_request: { starts: 12, submit_successes: 7 }, gift_card: { views: 6, database_requests: 2 }, booking_code: { redeem_attempts: 5, redeem_successes: 5 } },
  rates: { website_funnel_completion: 26.7, contact_intent_visitor_rate: 8 },
  dimensions: { devices: { mobile: 600, desktop: 300 } },
  integrity: { warnings: [] }
};

test('unavailable canonical rates render as unavailable rather than zero percent', () => {
  assert.equal(formatPercentValue(null), '—');
  assert.equal(formatPercentValue(undefined), '—');
  assert.equal(formatPercentValue(0), '0%');
});

test('summary normalization keeps four funnel families separate', () => {
  const normalized = normalizeSummary(sampleSummary);
  assert.equal(normalized.funnels.website.form_opens, 30);
  assert.equal(normalized.funnels.fastRequest.starts, 12);
  assert.equal(normalized.funnels.giftCard.database_requests, 2);
  assert.equal(normalized.funnels.bookingCode.redeem_successes, 5);
});

test('raw sample size cannot alter canonical summary KPI values', () => {
  const a = summaryToAdminModelPatch(sampleSummary);
  const b = summaryToAdminModelPatch(JSON.parse(JSON.stringify(sampleSummary)));
  assert.equal(a.visitors, 250);
  assert.equal(a.pageViews, 900);
  assert.deepEqual(a, b);
});

const contract = read('src/features/analytics/contract.js');
const migration = read('supabase/migrations/20260818090000_analytics_consolidation.sql');
const analyticsService = read('src/services/analyticsService.js');
const adminSource = read('src/main.jsx') + '\n' + read('src/features/analytics/AnalyticsHealthPanel.jsx');
const recap = read('supabase/functions/send-weekly-admin-recap/index.ts');
const email = read('supabase/functions/_shared/weeklyRecapEmail.ts');
const ingestion = read('functions/api/analytics/event.js');
const browserAnalytics = read('src/analytics.js');
const privacyPreferences = read('src/features/privacy/PrivacyPreferences.jsx');
const privacyService = read('src/services/privacyPreferences.js');
const privacyArchitecture = read('docs/PWA_PRIVACY_TERMS_ARCHITECTURE_20260905.md');

test('privacy preference storage preserves an explicit analytics choice', () => {
  const priorWindow = globalThis.window;
  const priorCustomEvent = globalThis.CustomEvent;
  const values = new Map();
  globalThis.CustomEvent = class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    },
    dispatchEvent: () => true
  };
  try {
    assert.equal(readPrivacyPreferences().analytics, null);
    writePrivacyPreferences({ analytics: false });
    assert.equal(readPrivacyPreferences().analytics, false);
    writePrivacyPreferences({ analytics: true });
    assert.equal(readPrivacyPreferences().analytics, true);
  } finally {
    if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow;
    if (priorCustomEvent === undefined) delete globalThis.CustomEvent; else globalThis.CustomEvent = priorCustomEvent;
  }
});

test('optional analytics and Cloudflare beacon are blocked before positive consent', () => {
  assert.match(browserAnalytics, /analyticsConsentGranted\(\).*![\s\S]*analyticsOptedOut\(\)/);
  assert.match(browserAnalytics, /const storage = analyticsConsentGranted\(\) \? browserStorage\('local'\) : null/);
  assert.match(adminSource, /if \(!analyticsAllowed\) \{ existing\?\.remove\(\); return undefined; \}/);
  assert.match(adminSource, /if \(analyticsAllowed\) trackPageView/);
  assert.match(adminSource, /analyticsDisabledForRoute \|\| !analyticsAllowed/);
});

test('analytics preference UX supports reject, customize, accept, withdrawal and separation', () => {
  for (const label of ['Reject', 'Customize', 'Accept analytics', 'Privacy preferences']) assert.ok(`${privacyPreferences}\n${adminSource}`.includes(label), label);
  assert.match(privacyPreferences, /checked=\{analytics\}/);
  assert.match(privacyPreferences, /current\?\.analytics === true/);
  assert.match(adminSource, /onOpenPrivacyPreferences/);
  assert.match(privacyArchitecture, /Rejecting analytics does not block PWA install, forms, referrals, notifications/);
  assert.match(privacyService, /typeof analytics !== 'boolean'/);
});

test('rejecting analytics removes only optional analytics identifiers', () => {
  const clearStart = browserAnalytics.indexOf('export function clearOptionalAnalyticsStorage');
  const clearEnd = browserAnalytics.indexOf("if (typeof window !== 'undefined')", clearStart);
  const clearBlock = browserAnalytics.slice(clearStart, clearEnd);
  for (const key of ['VISITOR_KEY', 'FIRST_TOUCH_KEY', 'SESSION_KEY', 'PAGEVIEW_COUNT_KEY']) assert.ok(clearBlock.includes(`removeItem(${key})`), key);
  assert.doesNotMatch(clearBlock, /FORM_JOURNEY_STORAGE_KEY|vulcaniq_fast_request|vulcaniq_public_language|notifications/);
});

test('canonical experience demand includes compatible database request counts', () => {
  assert.match(migration, /'database_requests', coalesce\(r\.database_requests, 0\)/);
  assert.match(migration, /'confirmed_database_requests', coalesce\(r\.confirmed_database_requests, 0\)/);
  assert.match(contract, /canonicalExperienceRows/);
  assert.match(adminSource, /Experience demand · canonical/);
  assert.match(adminSource, /model\.canonicalExperienceRows/);
});

test('canonical summary is server-side and protected', () => {
  assert.match(migration, /create or replace function public\.get_admin_analytics_summary/);
  assert.match(migration, /security definer/);
  assert.match(migration, /revoke all on function public\.get_admin_analytics_summary[^\n]+ from public, anon/);
  assert.match(migration, /not public\.is_admin\(\)/);
});

test('raw diagnostic period filters also use half-open intervals', () => {
  const periodStart = adminSource.indexOf('function periodContains');
  const periodEnd = adminSource.indexOf('function averageEngagementSeconds', periodStart);
  const periodBlock = adminSource.slice(periodStart, periodEnd);
  assert.match(periodBlock, /time >= new Date\(range\.to\)\.getTime\(\)/);
});

test('canonical summary uses half-open reporting intervals', () => {
  assert.match(migration, /occurred_at < v_to/);
  assert.match(analyticsService, /\.lt\(column, filters\.to\)/);
});

test('canonical traffic normalization preserves QR and business-card acquisition', () => {
  assert.match(migration, /then 'qr'/);
  assert.match(migration, /then 'business_card'/);
  assert.match(contract, /business_card:/);
});

test('server summary dimensions are page-view based', () => {
  assert.match(migration, /e\.event_name = 'page_view'/);
  assert.match(migration, /'devices'/);
  assert.match(migration, /'browsers'/);
  assert.match(migration, /'traffic_sources'/);
});

test('reporting baseline is non-destructive', () => {
  assert.match(migration, /analytics_reporting_settings/);
  assert.doesNotMatch(migration, /truncate\s+(table\s+)?public\.(analytics_events|analytics_sessions)/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(analytics_events|analytics_sessions)/i);
});

test('admin service preserves the raw RPC contract for shared consumers', () => {
  assert.match(analyticsService, /return data \|\| \{\};/);
  assert.doesNotMatch(analyticsService, /return normalizeSummary\(data/);
  assert.match(adminSource, /summaryToAdminModelPatch\(state\.summary/);
  assert.match(adminSource, /canonicalSummary\?\.funnels\?\.booking_code/);
});

test('admin and weekly recap consume the same analytics RPC', () => {
  assert.match(analyticsService, /get_admin_analytics_summary/);
  assert.match(recap, /rpc\/get_admin_analytics_summary/);
  assert.doesNotMatch(recap, /list\('analytics_events'/);
});

test('weekly email exposes all four funnel families and coverage', () => {
  for (const label of ['Website booking funnel', 'Fast Request / WhatsApp', 'Gift Card funnel', 'Booking-code funnel', 'Analytics coverage']) assert.ok(email.includes(label), label);
});

test('session upserts preserve the original browser session start', () => {
  assert.match(browserAnalytics, /started_at:\s*new Date\(Number\(session\.startedAt/);
  assert.match(ingestion, /started_at:\s*validIso\(payload\.started_at \|\| payload\.occurred_at\)/);
});

test('session lifecycle no longer floods analytics_events', () => {
  assert.match(ingestion, /SESSION_LIFECYCLE_EVENTS/);
  assert.match(ingestion, /if \(!SESSION_LIFECYCLE_EVENTS\.has\(payload\.event_name\)\)/);
  assert.match(browserAnalytics, /setInterval\(heartbeat, 60000\)/);
  assert.doesNotMatch(browserAnalytics, /setInterval\(heartbeat, 25000\)/);
});

test('current browser emits one canonical maps click event', () => {
  const mapsStart = browserAnalytics.indexOf('export function trackMapsClick');
  const reviewStart = browserAnalytics.indexOf('export function trackReviewView');
  const block = browserAnalytics.slice(mapsStart, reviewStart);
  assert.ok(block.includes("trackEvent('google_maps_click'"));
  assert.ok(!block.includes("trackEvent('maps_click'"));
  assert.match(migration, /when count\(\*\) filter \(where event_name = 'google_maps_click'\) > 0/);
});

test('canonical booking confirmation uses full business confirmation semantics', () => {
  for (const status of ['accepted', 'confirmed', 'completed']) assert.ok(migration.includes(status));
  for (const leadStatus of ['deposit_paid', 'confirmed', 'completed', 'review_requested', 'review_received']) assert.ok(migration.includes(leadStatus));
});

test('weekly funnels use compatible database request counts', () => {
  assert.match(recap, /websiteCompatible: Number\(summary\.website_requests_compatible/);
  assert.match(recap, /bookingCodeCompatible: Number\(summary\.booking_code_requests_compatible/);
  assert.match(recap, /compatible: Number\(summary\.gift_card_requests_compatible/);
  assert.match(email, /data\.bookings\.websiteCompatible/);
  assert.match(email, /data\.bookings\.bookingCodeCompatible/);
  assert.match(email, /data\.giftCards\.compatible/);
});

test('current browser emits canonical booking submit events only', () => {
  const attemptStart = browserAnalytics.indexOf('export async function trackBookingSubmitAttempt');
  const validationStart = browserAnalytics.indexOf('export async function trackBookingSubmitValidationError');
  const successStart = browserAnalytics.indexOf('export async function trackBookingSubmitSuccess');
  const errorStart = browserAnalytics.indexOf('export async function trackBookingSubmitError');
  const contactStart = browserAnalytics.indexOf('export function trackContactClick');
  const attempt = browserAnalytics.slice(attemptStart, validationStart);
  const success = browserAnalytics.slice(successStart, errorStart);
  assert.ok(attempt.includes("trackEvent('booking_form_submit_attempt'"));
  assert.ok(!attempt.includes("trackEvent('booking_submit_attempt'"));
  assert.ok(success.includes("trackEvent('booking_form_submit_success'"));
  assert.ok(!success.includes("trackEvent('booking_submit_success'"));
  assert.ok(!success.includes("trackEvent('booking_submit'"));
  assert.ok(browserAnalytics.slice(errorStart, contactStart).includes("trackEvent('booking_form_submit_error'"));
});

test('custom analytics date changes trigger a fresh canonical load', () => {
  const pageStart = adminSource.indexOf('function AdminAnalyticsPage');
  const pageEnd = adminSource.indexOf('function AdminUsersPage', pageStart);
  const pageBlock = adminSource.slice(pageStart, pageEnd > pageStart ? pageEnd : undefined);
  assert.match(pageBlock, /range\.from, range\.to, range\.useReportingBaseline, range\.valid/);
});

test('admin raw drilldowns are paginated and explicitly sampled', () => {
  assert.match(analyticsService, /\.range\(offset, offset \+ pageSize - 1\)/);
  assert.match(adminSource, /pageSize: 250/);
  assert.match(adminSource, /paginated sample/);
});

test('free-form attribution detail is stripped from analytics metadata and export samples', () => {
  assert.match(browserAnalytics, /'heard_about_us_detail'/);
  assert.match(ingestion, /'heard_about_us_detail'/);
  assert.match(browserAnalytics, /'heard_about_us_display'/);
  assert.match(ingestion, /'heard_about_us_display'/);

  const safeBookingStart = adminSource.indexOf('function safeBookingRequestRows');
  const sanitizerStart = adminSource.indexOf('const ANALYTICS_EXPORT_UNSAFE_METADATA_KEYS', safeBookingStart);
  assert.ok(safeBookingStart >= 0 && sanitizerStart > safeBookingStart);
  const safeBookingBlock = adminSource.slice(safeBookingStart, sanitizerStart);
  assert.doesNotMatch(safeBookingBlock, /heard_about_us_detail/);
  assert.doesNotMatch(safeBookingBlock, /heard_about_us_display/);

  const declaredStart = adminSource.indexOf('function buildDeclaredAttributionRows');
  const declaredEnd = adminSource.indexOf('function buildBookingRequestTrackingIntegrity', declaredStart);
  assert.ok(declaredStart >= 0 && declaredEnd > declaredStart);
  const declaredBlock = adminSource.slice(declaredStart, declaredEnd);
  assert.doesNotMatch(declaredBlock, /detail:\s*cleanHeardAboutUsDetail/);

  const exportStart = adminSource.indexOf('function downloadAnalyticsExport', sanitizerStart);
  assert.ok(sanitizerStart >= 0 && exportStart > sanitizerStart);
  const exportSanitizerBlock = adminSource.slice(sanitizerStart, exportStart);
  assert.match(exportSanitizerBlock, /heard_about_us_detail/);
  assert.match(exportSanitizerBlock, /safeAnalyticsExportMetadata/);
  assert.match(adminSource, /metadata:\s*safeAnalyticsExportMetadata\(row\.metadata/);

  const integrityStart = adminSource.indexOf('function buildBookingRequestTrackingIntegrity');
  const modelStart = adminSource.indexOf('function buildAnalyticsModel', integrityStart);
  const integrityBlock = adminSource.slice(integrityStart, modelStart);
  assert.doesNotMatch(integrityBlock, /heard_about_us_detail:/);
  assert.doesNotMatch(integrityBlock, /heardAboutUsDisplay\(request\.heard_about_us/);
});

test('owner browser analytics opt-out is implemented', () => {
  assert.match(browserAnalytics, /vulcaniq_analytics_opt_out/);
  assert.match(browserAnalytics, /setAnalyticsBrowserExcluded/);
  assert.match(adminSource, /Exclude this browser/);
});


test('session ingestion uses atomic monotonic RPC instead of direct table upsert', () => {
  assert.match(ingestion, /rpc\/upsert_analytics_session/);
  assert.doesNotMatch(ingestion, /analytics_sessions\?on_conflict=session_id/);
});

test('session pageview count cannot decrease when packets arrive out of order', () => {
  const hardening = read('supabase/migrations/20260818150000_reviews_google_session_hardening.sql');
  assert.match(hardening, /pageview_count = greatest\(public\.analytics_sessions\.pageview_count, excluded\.pageview_count\)/);
  assert.match(hardening, /duration_seconds = greatest\(public\.analytics_sessions\.duration_seconds, excluded\.duration_seconds\)/);
  assert.match(hardening, /last_seen_at = greatest\(public\.analytics_sessions\.last_seen_at, excluded\.last_seen_at\)/);
  assert.match(hardening, /started_at = least\(public\.analytics_sessions\.started_at, excluded\.started_at\)/);
  assert.match(hardening, /when excluded\.last_seen_at >= public\.analytics_sessions\.last_seen_at[\s\S]*then coalesce\(nullif\(excluded\.exit_path/);
});

test('analytics overview distinguishes historical business totals from compatible tracked requests', () => {
  assert.match(adminSource, /All historical business records/);
  assert.match(read('src/features/analytics/AnalyticsCanonicalFunnels.jsx'), /Compatible tracked requests/);
  assert.match(read('src/features/analytics/AnalyticsCanonicalFunnels.jsx'), /current tracking contract/);
});

for (const name of passes) console.log(`PASS  ${name}`);
for (const message of failures) console.error(`FAIL  ${message}`);
console.log(`\n${passes.length} passed, ${failures.length} failed.`);
if (failures.length) process.exit(1);
