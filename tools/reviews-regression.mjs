import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { filterAndSortReviews, reviewSource, reviewDate, reviewGuide, reviewRating } from '../src/features/reviews/reviewModel.js';
import { translateReviewText } from '../src/features/reviews/reviewTranslation.js';
import {
  beginReviewTranslation,
  changeReviewTranslationTarget,
  completeReviewTranslation,
  displayedReviewTranslationText,
  failReviewTranslation,
  initialReviewTranslationState,
  reviewTranslationCacheKey,
  toggleReviewTranslationDisplay
} from '../src/features/reviews/reviewTranslationState.js';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const passes = [];
const failures = [];
function test(name, fn) {
  try { fn(); passes.push(name); }
  catch (error) { failures.push(`${name}: ${error.message}`); }
}
async function testAsync(name, fn) {
  try { await fn(); passes.push(name); }
  catch (error) { failures.push(`${name}: ${error.message}`); }
}

async function withBrowserTranslationMocks({ detectedLanguage = 'fr', translatedText = 'Une traduction' } = {}, fn) {
  const originalDetector = Object.getOwnPropertyDescriptor(globalThis, 'LanguageDetector');
  const originalTranslator = Object.getOwnPropertyDescriptor(globalThis, 'Translator');
  let translatorOptions = null;
  Object.defineProperty(globalThis, 'LanguageDetector', {
    configurable: true,
    value: {
      create: async () => ({
        detect: async () => [{ detectedLanguage, confidence: 0.99 }],
        destroy() {}
      })
    }
  });
  Object.defineProperty(globalThis, 'Translator', {
    configurable: true,
    value: {
      create: async (options) => {
        translatorOptions = options;
        return { translate: async () => translatedText, destroy() {} };
      }
    }
  });
  try {
    await fn(() => translatorOptions);
  } finally {
    if (originalDetector) Object.defineProperty(globalThis, 'LanguageDetector', originalDetector);
    else delete globalThis.LanguageDetector;
    if (originalTranslator) Object.defineProperty(globalThis, 'Translator', originalTranslator);
    else delete globalThis.Translator;
  }
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
const translationStateModel = read('src/features/reviews/reviewTranslationState.js');
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
  assert.doesNotMatch(detail, /sourceLanguage:\s*safeReview\.language/);
  assert.doesNotMatch(detail, /showTranslated/);
  assert.match(detail, /detectReviewSourceLanguage\(sourceText/);
  assert.match(detail, /sourceLanguageSource:\s*'detected'/);
  assert.match(detail, /reviewTranslationCacheKey/);
  assert.match(detail, /translationRequestRef/);
  assert.match(detail, /displayedReviewTranslationText/);
  assert.match(detail, /displayedReviewText/);
  assert.match(detail, /showOriginal/);
  assert.match(detail, /aria-live="polite"/);
  assert.match(detail, /aria-busy=/);
  assert.match(translationClient, /globalThis\.Translator/);
  assert.match(translationClient, /globalThis\.LanguageDetector/);
  assert.match(translationClient, /TranslatorApi\.create/);
  assert.match(translationClient, /detector\.detect/);
  assert.match(translationClient, /downloadprogress/);
  assert.match(translationClient, /sourceLanguageSource === 'detected'/);
  assert.match(translationClient, /translation_unchanged_result/);
  assert.match(translationStateModel, /displayMode:\s*'original'/);
  assert.doesNotMatch(translationClient, /fetch\s*\(/);
  assert.doesNotMatch(translationClient, /translation\.googleapis\.com/);
});

test('review translation is desktop-only and hidden on mobile or unsupported browsers', () => {
  assert.match(detail, /window\.matchMedia\('\(min-width: 768px\)'\)/);
  assert.match(detail, /translationEnabled\s*=\s*translationApiSupported && desktopTranslationViewport/);
  assert.match(detail, /\{translationEnabled && \(\s*<div className="review-translation-toolbar"/);
  assert.match(detail, /if \(!isOpen \|\| !translationEnabled\) return undefined/);
  assert.match(detail, /displayedReviewText = translationEnabled \? displayedReviewTranslationText\(translationState\)/);
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

await testAsync('review translation detects the text language instead of trusting stored locale metadata', async () => {
  await withBrowserTranslationMocks({ detectedLanguage: 'fr', translatedText: 'Un’esperienza magnifica sull’Etna.' }, async (translatorOptions) => {
    const result = await translateReviewText({
      text: 'Une expérience magnifique sur l’Etna.',
      sourceLanguage: 'en',
      targetLanguage: 'it'
    });
    assert.equal(result.detected_source_language, 'fr');
    assert.equal(result.target_language, 'it');
    assert.equal(result.translated_text, 'Un’esperienza magnifica sull’Etna.');
    assert.equal(translatorOptions().sourceLanguage, 'fr');
    assert.equal(translatorOptions().targetLanguage, 'it');
  });
});

await testAsync('review translation with missing source metadata still detects the actual language', async () => {
  await withBrowserTranslationMocks({ detectedLanguage: 'de', translatedText: 'A wonderful experience.' }, async (translatorOptions) => {
    const result = await translateReviewText({ text: 'Ein wunderbares Erlebnis.', targetLanguage: 'en' });
    assert.equal(result.detected_source_language, 'de');
    assert.equal(translatorOptions().sourceLanguage, 'de');
  });
});

await testAsync('review translation fails closed on empty or unchanged browser output', async () => {
  await withBrowserTranslationMocks({ detectedLanguage: 'fr', translatedText: '' }, async () => {
    await assert.rejects(
      translateReviewText({ text: 'Texte français.', targetLanguage: 'it' }),
      (error) => error?.code === 'translation_empty_result'
    );
  });
  await withBrowserTranslationMocks({ detectedLanguage: 'fr', translatedText: '  TEXTE   FRANÇAIS. ' }, async () => {
    await assert.rejects(
      translateReviewText({ text: 'Texte français.', targetLanguage: 'it' }),
      (error) => error?.code === 'translation_unchanged_result'
    );
  });
});

test('translation state keeps body, labels, and toggle action on one authoritative result', () => {
  let state = initialReviewTranslationState({ reviewId: 'review-a', originalText: 'Texte français.', targetLanguage: 'it' });
  state = beginReviewTranslation(state);
  state = completeReviewTranslation(state, { reviewId: 'review-a', translatedText: 'Testo francese.', sourceLanguage: 'fr', targetLanguage: 'it' });
  assert.equal(state.status, 'translated');
  assert.equal(state.sourceLanguage, 'fr');
  assert.equal(state.targetLanguage, 'it');
  assert.equal(state.displayMode, 'translation');
  assert.equal(displayedReviewTranslationText(state), 'Testo francese.');
  state = toggleReviewTranslationDisplay(state);
  assert.equal(state.displayMode, 'original');
  assert.equal(displayedReviewTranslationText(state), 'Texte français.');
  state = toggleReviewTranslationDisplay(state);
  assert.equal(displayedReviewTranslationText(state), 'Testo francese.');
});

test('changing target language clears the previous translation before a new result is accepted', () => {
  const original = 'Texte français.';
  let state = initialReviewTranslationState({ reviewId: 'review-a', originalText: original, targetLanguage: 'it' });
  state = completeReviewTranslation(state, { reviewId: 'review-a', translatedText: 'Testo francese.', sourceLanguage: 'fr', targetLanguage: 'it' });
  state = changeReviewTranslationTarget(state, 'en');
  assert.equal(state.status, 'idle');
  assert.equal(state.displayMode, 'original');
  assert.equal(state.translatedText, '');
  assert.equal(displayedReviewTranslationText(state), original);
  assert.throws(
    () => completeReviewTranslation(state, { reviewId: 'review-a', translatedText: 'Testo francese.', sourceLanguage: 'fr', targetLanguage: 'it' }),
    (error) => error?.code === 'translation_stale_result'
  );
  state = completeReviewTranslation(state, { reviewId: 'review-a', translatedText: 'French text.', sourceLanguage: 'fr', targetLanguage: 'en' });
  assert.equal(displayedReviewTranslationText(state), 'French text.');
});

test('switching reviews and failures always preserve the active original text', () => {
  let reviewA = initialReviewTranslationState({ reviewId: 'review-a', originalText: 'Avis A.', targetLanguage: 'it' });
  reviewA = completeReviewTranslation(reviewA, { reviewId: 'review-a', translatedText: 'Recensione A.', sourceLanguage: 'fr', targetLanguage: 'it' });
  const reviewB = initialReviewTranslationState({ reviewId: 'review-b', originalText: 'Bewertung B.', targetLanguage: 'it' });
  assert.equal(reviewB.translatedText, '');
  assert.equal(displayedReviewTranslationText(reviewB), 'Bewertung B.');
  assert.throws(
    () => completeReviewTranslation(reviewB, { reviewId: 'review-a', translatedText: 'Recensione A.', sourceLanguage: 'fr', targetLanguage: 'it' }),
    (error) => error?.code === 'translation_stale_result'
  );
  const failed = failReviewTranslation(beginReviewTranslation(reviewB), 'Translation unavailable.');
  assert.equal(failed.status, 'error');
  assert.equal(failed.displayMode, 'original');
  assert.equal(failed.translatedText, '');
  assert.equal(displayedReviewTranslationText(failed), 'Bewertung B.');
});

test('translation cache keys isolate review, content, detected source, and target language', () => {
  const base = { reviewId: 'review-a', originalText: 'Texte français.', sourceLanguage: 'fr', targetLanguage: 'it' };
  const key = reviewTranslationCacheKey(base);
  assert.notEqual(key, reviewTranslationCacheKey({ ...base, reviewId: 'review-b' }));
  assert.notEqual(key, reviewTranslationCacheKey({ ...base, originalText: 'Autre texte.' }));
  assert.notEqual(key, reviewTranslationCacheKey({ ...base, sourceLanguage: 'de' }));
  assert.notEqual(key, reviewTranslationCacheKey({ ...base, targetLanguage: 'en' }));
});

for (const name of passes) console.log(`PASS  ${name}`);
for (const name of failures) console.error(`FAIL  ${name}`);
console.log(`\n${passes.length} passed, ${failures.length} failed.`);
if (failures.length) process.exit(1);
