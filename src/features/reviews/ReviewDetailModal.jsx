import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useBodyScrollLock from '../../hooks/useBodyScrollLock.js';
import useDialogFocusTrap from '../../hooks/useDialogFocusTrap.js';
import { normalizeReviewText, reviewBookedBy, reviewCopy, reviewDate, reviewGuide, reviewRating, reviewSource, reviewSourceLabel } from './reviewModel.js';
import {
  browserReviewTranslationSupported,
  loadReviewTranslationLanguages,
  reviewTranslationFallbackLanguages,
  translateReviewText
} from './reviewTranslation.js';

function translationErrorCopy(copy, error) {
  switch (error?.code) {
    case 'translation_browser_unsupported': return copy.translationBrowserUnsupported;
    case 'translation_pair_unsupported': return copy.translationPairUnsupported;
    case 'translation_source_unsupported': return copy.translationSourceUnsupported;
    case 'translation_same_language': return copy.translationSameLanguage;
    case 'translation_model_download_failed': return copy.translationModelDownloadFailed;
    case 'translation_not_allowed': return copy.translationTryAgain;
    case 'translation_input_too_large': return copy.translationInputTooLarge;
    default: return copy.translationFailed;
  }
}

function translationProgressCopy(copy, state) {
  if (!state.loading) return '';
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
  const translationSupported = browserReviewTranslationSupported();
  const [translationLanguages, setTranslationLanguages] = useState(() => reviewTranslationFallbackLanguages(lang));
  const [translationTarget, setTranslationTarget] = useState(defaultTargetLanguage);
  const [translationState, setTranslationState] = useState({ loading: false, error: '', text: '', detectedSourceLanguage: '', phase: '', progress: null });
  const [showTranslated, setShowTranslated] = useState(false);
  const translationCacheRef = useRef(new Map());
  useBodyScrollLock(isOpen);

  useDialogFocusTrap(isOpen, panelRef, onClose);

  useEffect(() => {
    setTranslationLanguages(reviewTranslationFallbackLanguages(lang));
    setTranslationTarget(defaultTargetLanguage);
    setTranslationState({ loading: false, error: '', text: '', detectedSourceLanguage: '', phase: '', progress: null });
    setShowTranslated(false);
    translationCacheRef.current = new Map();
    if (!isOpen) return undefined;
    let alive = true;
    loadReviewTranslationLanguages(lang).then((languages) => {
      if (alive && Array.isArray(languages) && languages.length) setTranslationLanguages(languages);
    });
    return () => { alive = false; };
  }, [defaultTargetLanguage, isOpen, lang, safeReview.id, safeReview.review_text]);

  async function handleTranslate() {
    const sourceText = String(safeReview.review_text || '').trim();
    if (!sourceText || !translationTarget) {
      setTranslationState((current) => ({ ...current, error: copy.translationTargetRequired }));
      return;
    }
    if (!translationSupported) {
      setTranslationState((current) => ({ ...current, error: copy.translationBrowserUnsupported }));
      return;
    }
    const cacheKey = `${translationTarget}:${sourceText}`;
    const cached = translationCacheRef.current.get(cacheKey);
    if (cached) {
      setTranslationState({ loading: false, error: '', text: cached.translatedText, detectedSourceLanguage: cached.detectedSourceLanguage || '', phase: 'complete', progress: 100 });
      setShowTranslated(true);
      return;
    }
    setTranslationState((current) => ({ ...current, loading: true, error: '', phase: 'preparing', progress: null }));
    try {
      const result = await translateReviewText({
        text: sourceText,
        targetLanguage: translationTarget,
        sourceLanguage: safeReview.language,
        onProgress: ({ phase, progress }) => {
          setTranslationState((current) => ({ ...current, loading: true, error: '', phase, progress: progress ?? null }));
        }
      });
      const translatedText = String(result?.translated_text || '').trim();
      const detectedSourceLanguage = String(result?.detected_source_language || '').trim();
      if (!translatedText) throw new Error('translation_failed');
      translationCacheRef.current.set(cacheKey, { translatedText, detectedSourceLanguage });
      setTranslationState({ loading: false, error: '', text: translatedText, detectedSourceLanguage, phase: 'complete', progress: 100 });
      setShowTranslated(true);
    } catch (error) {
      setTranslationState({ loading: false, error: translationErrorCopy(copy, error), text: '', detectedSourceLanguage: '', phase: '', progress: null });
      setShowTranslated(false);
    }
  }

  const displayedReviewText = showTranslated && translationState.text ? translationState.text : safeReview.review_text;
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

        <div className="review-translation-toolbar" aria-label={copy.translateReview}>
          <label className="review-translation-target">
            <span>{copy.translateTo}</span>
            <select value={translationTarget} disabled={!translationSupported || translationState.loading} onChange={(event) => { setTranslationTarget(event.target.value); setTranslationState((current) => ({ ...current, error: '', phase: '', progress: null })); setShowTranslated(false); }}>
              {translationLanguages.map((item) => <option key={item.language} value={item.language}>{item.name}</option>)}
            </select>
          </label>
          <button className="button secondary review-translate-button" type="button" onClick={handleTranslate} disabled={!translationSupported || translationState.loading}>
            {progressText || copy.translateReview}
          </button>
          {translationState.text && (
            <button className="review-original-toggle" type="button" onClick={() => setShowTranslated((current) => !current)}>
              {showTranslated ? copy.showOriginal : copy.showTranslation}
            </button>
          )}
          {!translationSupported && <span className="review-translation-error" role="status">{copy.translationBrowserUnsupported}</span>}
          {(showTranslated && translationState.text) && <span className="review-translation-note">{copy.onDeviceTranslation}{translationState.detectedSourceLanguage ? ` · ${translationState.detectedSourceLanguage.toUpperCase()} → ${translationTarget.toUpperCase()}` : ''}</span>}
          {translationState.error && <span className="review-translation-error" role="status">{translationState.error}</span>}
        </div>

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
