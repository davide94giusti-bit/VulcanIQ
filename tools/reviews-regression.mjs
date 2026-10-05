import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { filterAndSortReviews, reviewSource, reviewDate, reviewGuide, reviewRating, reviewBookedBy, reviewSourceLabel } from '../src/features/reviews/reviewModel.js';
import { normalizePublicGoogleReview } from '../src/features/reviews/googleReviewModel.js';
import { createGoogleBusinessClient } from '../supabase/functions/_shared/googleBusinessClient.js';
import { normalizeGoogleBusinessReview, normalizeGoogleReviewPage, normalizeGoogleStarRating } from '../supabase/functions/_shared/googleReviewNormalization.js';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const passes = [];
const failures = [];
function test(name, fn) {
  try { fn(); passes.push(name); }
  catch (error) { failures.push(`${name}: ${error.message}`); }
}
async function asyncTest(name, fn) {
  try { await fn(); passes.push(name); }
  catch (error) { failures.push(`${name}: ${error.message}`); }
}

const compact = read('src/features/reviews/ReviewCompactCard.jsx');
const detail = read('src/features/reviews/ReviewDetailModal.jsx');
const page = read('src/features/reviews/ReviewsPage.jsx');
const googleAdminStatus = read('src/features/reviews/GoogleReviewsAdminStatus.jsx');
const submission = read('src/features/reviews/ReviewSubmissionModal.jsx');
const dialogTrap = read('src/hooks/useDialogFocusTrap.js');
const service = read('src/services/reviewsService.js');
const googleService = read('src/services/googleReviewsService.js');
const googleEdge = read('supabase/functions/google-reviews-sync/index.ts');
const googleProvider = read('supabase/functions/_shared/googleBusiness.ts');
const googleClient = read('supabase/functions/_shared/googleBusinessClient.js');
const googleNormalization = read('supabase/functions/_shared/googleReviewNormalization.js');
const migration = read('supabase/migrations/20260818150000_reviews_google_session_hardening.sql');
const summaryMigration = read('supabase/migrations/20261005100000_google_reviews_public_summary.sql');
const siteConfig = read('src/config/site.js');
const browserAnalytics = read('src/analytics.js');
const translationClient = read('src/features/reviews/reviewTranslation.js');
const styles = read('src/styles.css');

const fixtures = [
  { id: 'w1', source: 'website', reviewer_name: 'Seby', rating: 5, review_date: '2026-08-08', review_text: 'Long first-party body' },
  { id: 'g1', provider: 'google_business_profile', reviewer_name: 'Google Guest', rating: 4, published_at: '2026-08-10', review_text: 'Google body' },
  { id: 'w2', source: 'website', reviewer_name: 'Other', rating: 2, review_date: '2026-08-09', review_text: 'Other body' }
];

test('review model is null-safe before detail dialog opens', () => {
  assert.equal(reviewSource(null), 'website');
  assert.equal(reviewDate(null, 'en'), '-');
  assert.equal(reviewRating(null), 5);
  assert.deepEqual(filterAndSortReviews([null, undefined, fixtures[0]], 'all').map((r) => r.id), ['w1']);
});

test('review model normalizes provider and first-party sources', () => {
  assert.equal(reviewSource(fixtures[0]), 'website');
  assert.equal(reviewSource(fixtures[1]), 'google');
  assert.equal(reviewDate(fixtures[0], 'en'), '08/08/2026');
});

test('Google identity and malformed rating fallbacks never fabricate reviewer or five stars', () => {
  assert.equal(reviewBookedBy({ source: 'google', reviewer_name: null }, 'en'), 'Google guest');
  assert.equal(reviewBookedBy({ source: 'google', reviewer_name: null }, 'it'), 'Ospite Google');
  assert.equal(reviewRating({ source: 'google', rating: 'unexpected' }), null);
  assert.equal(reviewRating({ source: 'website', rating: null }), 5);
  assert.equal(reviewSourceLabel({ source: 'google', provider: 'google_business_profile' }, 'en'), 'Google');
  assert.equal(reviewSourceLabel({ source: 'google' }, 'en'), 'Google (manual)');
});

test('first-party review guide preserves the current production convention without leaking into Google', () => {
  assert.equal(reviewGuide(fixtures[0]), 'Leonardo Chiavetta');
  assert.equal(reviewGuide(fixtures[1]), '');
  assert.equal(reviewGuide({ source: 'website', guide_name: 'Named Guide' }), 'Named Guide');
});

test('review filters preserve source separation and rating ordering', () => {
  assert.deepEqual(filterAndSortReviews(fixtures, 'google_reviews').map((r) => r.id), ['g1']);
  assert.deepEqual(filterAndSortReviews(fixtures, 'website_reviews').map((r) => r.id), ['w2','w1']);
  assert.equal(filterAndSortReviews(fixtures, 'highest_rating')[0].id, 'w1');
  assert.equal(filterAndSortReviews(fixtures, 'lowest_rating')[0].id, 'w2');
  assert.deepEqual(filterAndSortReviews(fixtures, 'most_recent').map((r) => r.id), ['g1','w2','w1']);
});

test('compact review card does not render review body', () => {
  assert.equal(compact.includes('review.review_text'), false);
  assert.match(compact, /<button/);
  assert.match(compact, /reviewDate\(review/);
  assert.match(compact, /review-rating-stars/);
});

test('closed review detail never dereferences a null review', () => {
  assert.match(detail, /const isOpen = Boolean\(review && typeof review === 'object'\)/);
  assert.match(detail, /const safeReview = isOpen \? review : \{\}/);
  assert.match(detail, /reviewRating\(safeReview\)/);
  assert.equal(detail.includes('Number(review.rating)'), false);
});

test('full review detail renders body, replies, Google source link and dialog semantics', () => {
  assert.match(detail, /safeReview\.review_text/);
  assert.match(detail, /safeReview\.admin_reply/);
  assert.match(detail, /safeReview\.external_review_url/);
  assert.match(detail, /role="dialog"/);
  assert.match(detail, /aria-modal="true"/);
  assert.match(detail, /useDialogFocusTrap/);
  assert.match(detail, /copy\.googleResponse/);
  assert.match(detail, /onError=\{\(event\).*\.hidden = true/);
  assert.match(dialogTrap, /event\.key === 'Escape'/);
  assert.match(dialogTrap, /event\.key !== 'Tab'/);
  assert.match(dialogTrap, /openerRef\.current\?\.focus/);
});


test('review detail has one close button in the top-right header only', () => {
  const closeButtons = detail.match(/<button[^>]*onClick=\{onClose\}[^>]*>/g) || [];
  assert.equal(closeButtons.length, 1);
  assert.match(detail, /modal-close-button review-detail-close/);
  assert.doesNotMatch(detail, /review-detail-actions[\s\S]*?<button[^>]*onClick=\{onClose\}/);
});


test('review detail translation is on-demand, browser-local, and preserves the original text', () => {
  assert.match(detail, /review-translation-toolbar/);
  assert.match(detail, /translateReviewText/);
  assert.match(detail, /browserReviewTranslationSupported/);
  assert.match(detail, /sourceLanguage:\s*safeReview\.language/);
  assert.match(detail, /showTranslated/);
  assert.match(detail, /displayedReviewText/);
  assert.match(detail, /showOriginal/);
  assert.match(translationClient, /globalThis\.Translator/);
  assert.match(translationClient, /globalThis\.LanguageDetector/);
  assert.match(translationClient, /TranslatorApi\.create/);
  assert.match(translationClient, /detector\.detect/);
  assert.match(translationClient, /downloadprogress/);
  assert.doesNotMatch(translationClient, /fetch\s*\(/);
  assert.doesNotMatch(translationClient, /translation\.googleapis\.com/);
});

test('review translation is desktop-only and hidden on mobile or unsupported browsers', () => {
  assert.match(detail, /window\.matchMedia\('\(min-width: 768px\)'\)/);
  assert.match(detail, /translationEnabled\s*=\s*translationApiSupported && desktopTranslationViewport/);
  assert.match(detail, /\{translationEnabled && \(\s*<div className="review-translation-toolbar"/);
  assert.match(detail, /if \(!isOpen \|\| !translationEnabled\) return undefined/);
  assert.match(detail, /displayedReviewText = translationEnabled && showTranslated/);
  assert.doesNotMatch(detail, /!translationSupported && <span className="review-translation-error"/);
});

test('review detail mobile layout keeps long names clear of the close control and avoids stretched whitespace', () => {
  assert.match(styles, /review-detail-modal[\s\S]*?grid-auto-rows:\s*max-content/);
  assert.match(styles, /review-detail-modal[\s\S]*?align-content:\s*start/);
  assert.match(styles, /review-detail-header h2[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(styles, /review-detail-close[\s\S]*?position:\s*absolute/);
});

test('review detail and submission modal have separate state', () => {
  assert.match(page, /selectedReview/);
  assert.match(page, /reviewSubmissionOpen/);
  assert.match(page, /<ReviewDetailModal/);
  assert.match(page, /<ReviewSubmissionModal/);
  assert.match(submission, /booking_code/);
});

test('review analytics events avoid review content and reviewer identity', () => {
  for (const event of ['review_card_open','review_detail_close','google_review_source_open']) assert.ok(browserAnalytics.includes(`'${event}'`));
  const trackedRegion = page.slice(page.indexOf("trackEvent('review_card_open'"), page.indexOf('return ('));
  assert.equal(/review_text|reviewer_name|admin_reply/.test(trackedRegion), false);
});

test('Google reviews have a separate temporary provider cache with RLS', () => {
  assert.match(migration, /create table if not exists public\.google_reviews_cache/);
  assert.match(migration, /primary key \(provider, provider_review_id\)/);
  assert.match(migration, /alter table public\.google_reviews_cache enable row level security/);
  assert.match(migration, /revoke all on public\.google_reviews_cache from public, anon, authenticated/);
  assert.match(migration, /expires_at > now\(\)/);
});

test('public Google review access is via a narrow SECURITY DEFINER RPC', () => {
  assert.match(migration, /create or replace function public\.get_public_google_reviews\(\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public, pg_temp/);
  assert.match(migration, /grant execute on function public\.get_public_google_reviews\(\) to anon, authenticated/);
});

test('Google provider uses official Business Profile API with OAuth refresh and pagination', () => {
  assert.match(googleClient, /oauth2\.googleapis\.com\/token/);
  assert.match(googleClient, /mybusiness\.googleapis\.com\/v4/);
  assert.match(googleClient, /pageSize:\s*'50'/);
  assert.match(googleClient, /nextPageToken/);
  assert.match(googleClient, /maxReviewPages = 2/);
});

test('Google normalization maps enums, identity, optional fields and malformed input defensively', () => {
  assert.deepEqual(['ONE','TWO','THREE','FOUR','FIVE'].map(normalizeGoogleStarRating), [1,2,3,4,5]);
  assert.equal(normalizeGoogleStarRating('UNKNOWN'), null);
  const named = normalizeGoogleBusinessReview({
    reviewId: 'review-1',
    reviewer: { displayName: 'Ada', profilePhotoUrl: 'https://example.test/ada.jpg' },
    starRating: 'FOUR',
    comment: 'Original language text',
    createTime: '2026-10-01T10:00:00Z',
    reviewReply: { comment: 'Grazie', updateTime: '2026-10-02T10:00:00Z' }
  });
  assert.equal(named.providerReviewId, 'review-1');
  assert.equal(named.authorDisplayName, 'Ada');
  assert.equal(named.authorPhotoUri, 'https://example.test/ada.jpg');
  assert.equal(named.rating, 4);
  assert.equal(named.reviewText, 'Original language text');
  assert.equal(named.providerReplyText, 'Grazie');
  const anonymous = normalizeGoogleBusinessReview({ reviewId: 'review-2', reviewer: { isAnonymous: true, displayName: 'Hidden' }, starRating: 'FIVE' });
  assert.equal(anonymous.authorDisplayName, null);
  assert.equal(anonymous.authorPhotoUri, null);
  assert.equal(anonymous.reviewText, null);
  assert.equal(normalizeGoogleBusinessReview({ starRating: 'FIVE' }), null);
  assert.throws(() => normalizeGoogleReviewPage({ reviews: {} }), /google_business_malformed_response/);
  assert.match(googleNormalization, /GoogleBusinessReview/);
});

test('public Google cache rows normalize to the existing review shape with stable IDs and safe URLs', () => {
  const normalized = normalizePublicGoogleReview({
    provider_review_id: 'abc-123',
    author_display_name: 'Reviewer',
    rating: 5,
    published_at: '2026-10-01T10:00:00Z',
    google_maps_uri: 'javascript:alert(1)'
  });
  assert.equal(normalized.id, 'google:abc-123');
  assert.equal(normalized.provider, 'google_business_profile');
  assert.equal(normalized.external_review_url, 'https://maps.app.goo.gl/efLnfxBxYvei22YY6?g_st=aw');
  assert.equal(normalizePublicGoogleReview({ provider_review_id: '', rating: 5 }), null);
});

test('Google cache expires inside 30-day maximum and expired or stale rows are deleted', () => {
  assert.match(googleEdge, /CACHE_DAYS = 29/);
  assert.match(googleEdge, /expires_at: `lte\.\$\{startedAt\}`/);
  assert.match(googleEdge, /last_seen_at: `lt\.\$\{seenAt\}`/);
  assert.equal((googleEdge.match(/method: 'DELETE'/g) || []).length, 2);
});

test('authoritative Google summary expires with provider content and does not alter native reviews', () => {
  assert.match(summaryMigration, /average_rating numeric/);
  assert.match(summaryMigration, /total_review_count integer/);
  assert.match(summaryMigration, /summary_expires_at > now\(\)/);
  assert.match(summaryMigration, /get_public_google_reviews_summary/);
  assert.match(summaryMigration, /grant execute on function public\.get_public_google_reviews_summary\(\) to anon, authenticated/);
  assert.doesNotMatch(summaryMigration, /alter table public\.reviews/);
  assert.doesNotMatch(summaryMigration, /insert into public\.reviews/);
  assert.match(googleAdminStatus, /average_rating !== null/);
  assert.match(googleAdminStatus, /average_rating !== undefined/);
});

test('Google sync supports protected cron and privileged rate-limited manual refresh', () => {
  assert.match(googleEdge, /GOOGLE_REVIEWS_SYNC_SECRET/);
  assert.match(googleEdge, /x-vulcaniq-google-reviews-sync-secret/);
  assert.match(googleEdge, /requireAdmin\(req\)/);
  assert.match(googleEdge, /claimAdminAction\('google-reviews-sync-manual'/);
});

test('Google OAuth credentials are server-only and absent from browser service', () => {
  assert.equal(/GOOGLE_BUSINESS_CLIENT_SECRET|GOOGLE_BUSINESS_REFRESH_TOKEN/.test(googleService), false);
  assert.match(googleProvider, /GOOGLE_BUSINESS_CLIENT_SECRET/);
  assert.match(googleProvider, /GOOGLE_BUSINESS_REFRESH_TOKEN/);
});

test('public reviews gracefully retain manual Google fallback if provider is unavailable', () => {
  assert.match(service, /Promise\.allSettled/);
  assert.match(service, /googleRows\.length/);
  assert.match(service, /provider: 'manual_google'/);
  assert.match(googleService, /status: 'unavailable'/);
});

test('public Reviews UI keeps both review flows and uses the supplied Google destinations', () => {
  assert.match(siteConfig, /https:\/\/maps\.app\.goo\.gl\/efLnfxBxYvei22YY6\?g_st=aw/);
  assert.match(siteConfig, /https:\/\/g\.page\/r\/CfYT-ORvmFjiEBI\/review/);
  assert.match(page, /writeGoogleReview/);
  assert.match(page, /viewGoogleMaps/);
  assert.match(page, /google_reviews_click/);
  assert.match(page, /google_review_request_click/);
  assert.match(page, /google-reviews-summary/);
  assert.match(page, /setReviewSubmissionOpen\(true\)/);
});

function jsonResponse(status, payload, { malformed = false } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (malformed) throw new SyntaxError('invalid json');
      return payload;
    }
  };
}

await asyncTest('mock Google provider reads one page and preserves authoritative summary', async () => {
  const requests = [];
  const client = createGoogleBusinessClient({
    retryAttempts: 1,
    fetchImpl: async (url) => {
      requests.push(String(url));
      return jsonResponse(200, { reviews: [{ reviewId: 'r1', starRating: 'FIVE' }], averageRating: 4.9, totalReviewCount: 42 });
    }
  });
  const result = await client.listReviews({ accessToken: 'token', locationResourceName: 'accounts/1/locations/2' });
  assert.equal(result.reviews.length, 1);
  assert.equal(result.averageRating, 4.9);
  assert.equal(result.totalReviewCount, 42);
  assert.equal(result.truncated, false);
  assert.match(requests[0], /pageSize=50/);
});

await asyncTest('mock Google provider paginates without selecting arbitrary account or location input', async () => {
  const requests = [];
  const client = createGoogleBusinessClient({
    retryAttempts: 1,
    fetchImpl: async (url) => {
      requests.push(String(url));
      return requests.length === 1
        ? jsonResponse(200, { reviews: [{ reviewId: 'r1', starRating: 'ONE' }], averageRating: 3.5, totalReviewCount: 2, nextPageToken: 'next-safe' })
        : jsonResponse(200, { reviews: [{ reviewId: 'r2', starRating: 'TWO' }], averageRating: 3.5, totalReviewCount: 2 });
    }
  });
  const result = await client.listReviews({ accessToken: 'token', locationResourceName: 'accounts/1/locations/2' });
  assert.deepEqual(result.reviews.map((review) => review.providerReviewId), ['r1','r2']);
  assert.match(requests[1], /pageToken=next-safe/);
  assert.doesNotMatch(googleEdge, /readJson\(req/);
});

await asyncTest('mock Google provider handles a verified zero-review response', async () => {
  const client = createGoogleBusinessClient({ retryAttempts: 1, fetchImpl: async () => jsonResponse(200, { reviews: [], totalReviewCount: 0 }) });
  const result = await client.listReviews({ accessToken: 'token', locationResourceName: 'accounts/1/locations/2' });
  assert.deepEqual(result.reviews, []);
  assert.equal(result.totalReviewCount, 0);
});

await asyncTest('mock Google provider distinguishes 401, 403, 429 and 5xx failures', async () => {
  const expected = new Map([
    [401, 'google_business_unauthorized'],
    [403, 'google_business_forbidden'],
    [429, 'google_business_rate_limited'],
    [503, 'google_business_reviews_unavailable']
  ]);
  for (const [status, code] of expected) {
    const client = createGoogleBusinessClient({ retryAttempts: 1, fetchImpl: async () => jsonResponse(status, {}) });
    await assert.rejects(() => client.listReviews({ accessToken: 'token', locationResourceName: 'accounts/1/locations/2' }), new RegExp(code));
  }
});

await asyncTest('mock Google provider fails closed on timeout and malformed JSON', async () => {
  const timeoutClient = createGoogleBusinessClient({
    timeoutMs: 5,
    retryAttempts: 1,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })
  });
  await assert.rejects(() => timeoutClient.listReviews({ accessToken: 'token', locationResourceName: 'accounts/1/locations/2' }), /google_business_timeout/);
  const malformedClient = createGoogleBusinessClient({ retryAttempts: 1, fetchImpl: async () => jsonResponse(200, null, { malformed: true }) });
  await assert.rejects(() => malformedClient.listReviews({ accessToken: 'token', locationResourceName: 'accounts/1/locations/2' }), /google_business_malformed_response/);
});

await asyncTest('mock Google OAuth refresh fails closed when authorization is revoked or malformed', async () => {
  const config = { clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' };
  const revoked = createGoogleBusinessClient({ retryAttempts: 1, fetchImpl: async () => jsonResponse(400, { error: 'invalid_grant' }) });
  await assert.rejects(() => revoked.refreshAccessToken(config), /google_oauth_refresh_failed/);
  const malformed = createGoogleBusinessClient({ retryAttempts: 1, fetchImpl: async () => jsonResponse(200, {}) });
  await assert.rejects(() => malformed.refreshAccessToken(config), /google_oauth_malformed_response/);
});

for (const name of passes) console.log(`PASS  ${name}`);
for (const name of failures) console.error(`FAIL  ${name}`);
console.log(`\n${passes.length} passed, ${failures.length} failed.`);
if (failures.length) process.exit(1);
