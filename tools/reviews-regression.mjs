import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { filterAndSortReviews, reviewSource, reviewDate, reviewGuide, reviewRating } from '../src/features/reviews/reviewModel.js';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const passes = [];
const failures = [];
function test(name, fn) {
  try { fn(); passes.push(name); }
  catch (error) { failures.push(`${name}: ${error.message}`); }
}

const compact = read('src/features/reviews/ReviewCompactCard.jsx');
const detail = read('src/features/reviews/ReviewDetailModal.jsx');
const page = read('src/features/reviews/ReviewsPage.jsx');
const submission = read('src/features/reviews/ReviewSubmissionModal.jsx');
const dialogTrap = read('src/hooks/useDialogFocusTrap.js');
const service = read('src/services/reviewsService.js');
const googleService = read('src/services/googleReviewsService.js');
const googleEdge = read('supabase/functions/google-reviews-sync/index.ts');
const googleProvider = read('supabase/functions/_shared/googleBusiness.ts');
const migration = read('supabase/migrations/20260818150000_reviews_google_session_hardening.sql');
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
  assert.match(googleProvider, /oauth2\.googleapis\.com\/token/);
  assert.match(googleProvider, /mybusiness\.googleapis\.com\/v4/);
  assert.match(googleProvider, /pageSize:\s*'50'/);
  assert.match(googleProvider, /nextPageToken/);
});

test('Google cache expires inside 30-day maximum and stale rows are expired after successful sync', () => {
  assert.match(googleEdge, /CACHE_DAYS = 29/);
  assert.match(googleEdge, /last_seen_at: `lt\.\$\{seenAt\}`/);
  assert.match(googleEdge, /expires_at: seenAt/);
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
  assert.match(service, /loadPublicGoogleReviews/);
  assert.match(service, /googleRows\.length/);
  assert.match(googleService, /return \[\]/);
});

for (const name of passes) console.log(`PASS  ${name}`);
for (const name of failures) console.error(`FAIL  ${name}`);
console.log(`\n${passes.length} passed, ${failures.length} failed.`);
if (failures.length) process.exit(1);
