import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useBodyScrollLock from '../../hooks/useBodyScrollLock.js';
import useDialogFocusTrap from '../../hooks/useDialogFocusTrap.js';
import { normalizeReviewText, reviewBookedBy, reviewCopy, reviewDate, reviewGuide, reviewRating, reviewSource, reviewSourceLabel } from './reviewModel.js';
import {
  browserReviewTranslationSupported,
  detectReviewSourceLanguage,
  loadReviewTranslationLanguages,
  reviewTranslationFallbackLanguages,
  translateReviewText,
  withReviewTranslationTimeout
} from './reviewTranslation.js';
import {
  beginReviewTranslation,
  changeReviewTranslationTarget,
  completeReviewTranslation,
  displayedReviewTranslationText,
  failReviewTranslation,
  initialReviewTranslationState,
  reviewTranslationCacheKey,
  toggleReviewTranslationDisplay,
  updateReviewTranslationProgress
} from './reviewTranslationState.js';

function translationErrorCopy(copy, error) {
  switch (error?.code) {
    case 'translation_browser_unsupported': return copy.translationBrowserUnsupported;
    case 'translation_pair_unsupported': return copy.translationPairUnsupported;
    case 'translation_source_unsupported': return copy.translationSourceUnsupported;
    case 'translation_same_language': return copy.translationSameLanguage;
    case 'translation_model_download_failed': return copy.translationModelDownloadFailed;
    case 'translation_not_allowed': return copy.translationTryAgain;
    case 'translation_input_too_large': return copy.translationInputTooLarge;
    case 'translation_empty_result': return copy.translationEmptyResult;
    case 'translation_unchanged_result': return copy.translationUnchangedResult;
    case 'translation_stale_result': return copy.translationStaleResult;
    case 'translation_timeout': return copy.translationTimeout;
    default: return copy.translationFailed;
  }
}

function translationProgressCopy(copy, state) {
  if (state.status !== 'detecting' && state.status !== 'translating') return '';
  if (state.phase === 'detecting') return copy.detectingLanguage;
  if (state.phase === 'downloading_detector' || state.phase === 'downloading_translator') {
    return state.progress == null ? copy.downloadingTranslationModel : `${copy.downloadingTranslationModel} ${state.progress}%`;
  }
  if (state.phase === 'preparing') return copy.preparingTranslation;
  return copy.translating;
}

export default function ReviewDetailModal({ review, lang = 'it', onClose, onGoogleOpen }) {
  const panelRef = useRef(null);
  const isOpen = Boolean(review && typeof review === 'object');
  const safeReview = isOpen ? review : {};
  const copy = reviewCopy(lang);
  const source = reviewSource(safeReview);
  const guide = reviewGuide(safeReview);
  const rating = reviewRating(safeReview);
  const reviewer = reviewBookedBy(safeReview, lang);
  const defaultTargetLanguage = lang === 'it' ? 'it' : 'en';
  const translationApiSupported = browserReviewTranslationSupported();
  const [desktopTranslationViewport, setDesktopTranslationViewport] = useState(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(min-width: 768px)').matches
  ));
  const translationEnabled = translationApiSupported && desktopTranslationViewport;
  const [translationLanguages, setTranslationLanguages] = useState(() => reviewTranslationFallbackLanguages(lang));
  const [translationState, setTranslationState] = useState(() => initialReviewTranslationState({ reviewId: safeReview.id, originalText: safeReview.review_text, targetLanguage: defaultTargetLanguage }));
  const translationCacheRef = useRef(new Map());
  const translationRequestRef = useRef(0);
  useBodyScrollLock(isOpen);

  useDialogFocusTrap(isOpen, panelRef, onClose);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setDesktopTranslationViewport(false);
      return undefined;
    }
    const query = window.matchMedia('(min-width: 768px)');
    const syncViewport = () => setDesktopTranslationViewport(query.matches);
    syncViewport();
    if (typeof query.addEventListener === 'function') query.addEventListener('change', syncViewport);
    else query.addListener?.(syncViewport);
    return () => {
      if (typeof query.removeEventListener === 'function') query.removeEventListener('change', syncViewport);
      else query.removeListener?.(syncViewport);
    };
  }, [isOpen]);

  useEffect(() => {
    setTranslationLanguages(reviewTranslationFallbackLanguages(lang));
    translationRequestRef.current += 1;
    setTranslationState(initialReviewTranslationState({ reviewId: safeReview.id, originalText: safeReview.review_text, targetLanguage: defaultTargetLanguage }));
    if (!isOpen || !translationEnabled) return undefined;
    let alive = true;
    loadReviewTranslationLanguages(lang).then((languages) => {
      if (alive && Array.isArray(languages) && languages.length) setTranslationLanguages(languages);
    });
    return () => { alive = false; };
  }, [defaultTargetLanguage, isOpen, lang, safeReview.id, safeReview.review_text, translationEnabled]);

  async function handleTranslate() {
    const sourceText = String(safeReview.review_text || '').trim();
    const targetLanguage = translationState.targetLanguage;
    if (!sourceText || !targetLanguage) {
      setTranslationState((current) => ({ ...current, error: copy.translationTargetRequired }));
      return;
    }
    if (!translationEnabled) {
      setTranslationState((current) => ({ ...current, error: copy.translationBrowserUnsupported }));
      return;
    }
    const requestId = ++translationRequestRef.current;
    const reviewId = String(safeReview.id || '');
    const requestIsCurrent = () => translationRequestRef.current === requestId;
    const reportProgress = ({ phase, progress }) => {
      if (requestIsCurrent()) setTranslationState((current) => updateReviewTranslationProgress(current, { phase, progress }));
    };
    setTranslationState((current) => beginReviewTranslation(current));
    try {
      const detectedSourceLanguage = await withReviewTranslationTimeout(detectReviewSourceLanguage(sourceText, { onProgress: reportProgress }));
      if (!requestIsCurrent()) return;
      const cacheKey = reviewTranslationCacheKey({ reviewId, originalText: sourceText, sourceLanguage: detectedSourceLanguage, targetLanguage });
      const cached = translationCacheRef.current.get(cacheKey);
      if (cached) {
        setTranslationState((current) => completeReviewTranslation(current, cached));
        return;
      }
      const result = await withReviewTranslationTimeout(translateReviewText({
        text: sourceText,
        targetLanguage,
        sourceLanguage: detectedSourceLanguage,
        sourceLanguageSource: 'detected',
        onProgress: reportProgress
      }));
      if (!requestIsCurrent()) return;
      const translatedText = String(result?.translated_text || '').trim();
      const resolvedSourceLanguage = String(result?.detected_source_language || detectedSourceLanguage).trim();
      const completed = { reviewId, translatedText, sourceLanguage: resolvedSourceLanguage, targetLanguage };
      setTranslationState((current) => completeReviewTranslation(current, completed));
      translationCacheRef.current.set(cacheKey, completed);
    } catch (error) {
      if (!requestIsCurrent()) return;
      translationRequestRef.current += 1;
      const unavailable = error?.code === 'translation_browser_unsupported' || error?.code === 'translation_pair_unsupported';
      setTranslationState((current) => failReviewTranslation(current, translationErrorCopy(copy, error), { unavailable }));
    }
  }

  const displayedReviewText = translationEnabled ? displayedReviewTranslationText(translationState) : safeReview.review_text;
  const progressText = translationProgressCopy(copy, translationState);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="public-modal-backdrop review-detail-backdrop motion-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <article
        className="review-detail-modal motion-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reviewDetailTitle"
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="review-detail-header">
          <div>
            <div className="review-card-source-row">
              <span className={`review-source-badge ${source}`}>{reviewSourceLabel(review, lang)}</span>
              <span className="stars review-rating-stars" aria-label={`${rating}/5`}>{'★'.repeat(rating)}</span>
            </div>
            <h2 id="reviewDetailTitle">{reviewer}</h2>
            <div className="review-info-list review-detail-meta">
              <span><b>{source === 'google' ? copy.name : copy.bookedBy}:</b> {reviewer}</span>
              <span><b>{copy.date}:</b> {reviewDate(review, lang)}</span>
              {source !== 'google' && guide && <span><b>{copy.guide}:</b> {guide}</span>}
            </div>
          </div>
          <button className="modal-close-button review-detail-close" type="button" onClick={onClose}>{copy.close}</button>
        </header>

        {source === 'google' && (
          <div className="google-review-attribution" aria-label={copy.googleAttribution}>
            {safeReview.profile_photo_url && <img src={safeReview.profile_photo_url} alt="" loading="lazy" referrerPolicy="no-referrer" />}
            <span>{copy.googleAttribution}</span>
          </div>
        )}

        {translationEnabled && (
          <div className="review-translation-toolbar" aria-label={copy.translateReview} aria-live="polite" aria-busy={translationState.status === 'detecting' || translationState.status === 'translating'}>
            <label className="review-translation-target">
              <span>{copy.translateTo}</span>
              <select value={translationState.targetLanguage} disabled={translationState.status === 'detecting' || translationState.status === 'translating'} onChange={(event) => { translationRequestRef.current += 1; setTranslationState((current) => changeReviewTranslationTarget(current, event.target.value)); }}>
                {translationLanguages.map((item) => <option key={item.language} value={item.language}>{item.name}</option>)}
              </select>
            </label>
            <button className="button secondary review-translate-button" type="button" onClick={handleTranslate} disabled={translationState.status === 'detecting' || translationState.status === 'translating'}>
              {progressText || copy.translateReview}
            </button>
            {translationState.status === 'translated' && translationState.translatedText && (
              <button className="review-original-toggle" type="button" onClick={() => setTranslationState((current) => toggleReviewTranslationDisplay(current))}>
                {translationState.displayMode === 'translation' ? copy.showOriginal : copy.showTranslation}
              </button>
            )}
            {translationState.status === 'translated' && translationState.displayMode === 'translation' && <span className="review-translation-note">{copy.onDeviceTranslation} · {translationState.sourceLanguage.toUpperCase()} → {translationState.targetLanguage.toUpperCase()}</span>}
            {translationState.error && <span className="review-translation-error" role="status">{translationState.error}</span>}
          </div>
        )}

        <div className="review-detail-body formatted-review-text">
          {normalizeReviewText(displayedReviewText).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>)}
        </div>

        {safeReview.admin_reply && (
          <div className="public-admin-reply review-detail-reply">
            <strong>{copy.response}</strong>
            <div className="formatted-review-text admin-reply-text">
              {normalizeReviewText(safeReview.admin_reply).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>)}
            </div>
          </div>
        )}

        {source === 'google' && safeReview.external_review_url && (
          <footer className="review-detail-actions">
            <a className="button primary" href={safeReview.external_review_url} target="_blank" rel="noopener noreferrer" onClick={() => onGoogleOpen?.(safeReview)}>{copy.openGoogle}</a>
          </footer>
        )}
      </article>
    </div>,
    document.body
  );
}
