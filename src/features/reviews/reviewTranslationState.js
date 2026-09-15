function clean(value) {
  return String(value || '').trim();
}

function comparable(value) {
  return clean(value).normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function reviewTranslationContentHash(value) {
  let hash = 2166136261;
  for (const character of clean(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function reviewTranslationCacheKey({ reviewId, originalText, sourceLanguage, targetLanguage } = {}) {
  return [clean(reviewId) || 'unknown-review', reviewTranslationContentHash(originalText), clean(sourceLanguage).toLowerCase() || 'unknown-source', clean(targetLanguage).toLowerCase() || 'unknown-target'].join(':');
}

export function initialReviewTranslationState({ reviewId, originalText, targetLanguage } = {}) {
  return {
    reviewId: clean(reviewId),
    originalText: clean(originalText),
    sourceLanguage: '',
    targetLanguage: clean(targetLanguage).toLowerCase(),
    translatedText: '',
    status: 'idle',
    displayMode: 'original',
    error: '',
    phase: '',
    progress: null
  };
}

export function beginReviewTranslation(state) {
  return { ...state, translatedText: '', status: 'detecting', displayMode: 'original', error: '', phase: 'detecting', progress: null };
}

export function updateReviewTranslationProgress(state, { phase = '', progress = null } = {}) {
  const detecting = phase === 'detecting' || phase === 'downloading_detector';
  return { ...state, status: detecting ? 'detecting' : 'translating', error: '', phase, progress: progress ?? null };
}

export function completeReviewTranslation(state, { reviewId, translatedText, sourceLanguage, targetLanguage } = {}) {
  const resultReviewId = clean(reviewId);
  const output = clean(translatedText);
  const source = clean(sourceLanguage).toLowerCase();
  const target = clean(targetLanguage).toLowerCase();
  if (!output) throw Object.assign(new Error('The browser returned an empty translation.'), { code: 'translation_empty_result' });
  if (comparable(output) === comparable(state.originalText)) throw Object.assign(new Error('The browser returned unchanged review text.'), { code: 'translation_unchanged_result' });
  if (!resultReviewId || resultReviewId !== state.reviewId || !source || !target || target !== state.targetLanguage) {
    throw Object.assign(new Error('Translation result does not match the active request.'), { code: 'translation_stale_result' });
  }
  return { ...state, sourceLanguage: source, targetLanguage: target, translatedText: output, status: 'translated', displayMode: 'translation', error: '', phase: 'complete', progress: 100 };
}

export function failReviewTranslation(state, message, { unavailable = false } = {}) {
  return { ...state, translatedText: '', status: unavailable ? 'unavailable' : 'error', displayMode: 'original', error: clean(message), phase: '', progress: null };
}

export function changeReviewTranslationTarget(state, targetLanguage) {
  return { ...state, targetLanguage: clean(targetLanguage).toLowerCase(), translatedText: '', status: 'idle', displayMode: 'original', error: '', phase: '', progress: null };
}

export function toggleReviewTranslationDisplay(state) {
  if (state.status !== 'translated' || !state.translatedText) return state;
  return { ...state, displayMode: state.displayMode === 'translation' ? 'original' : 'translation' };
}

export function displayedReviewTranslationText(state) {
  return state.status === 'translated' && state.displayMode === 'translation' && state.translatedText
    ? state.translatedText
    : state.originalText;
}
