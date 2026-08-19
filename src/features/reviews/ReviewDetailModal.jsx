import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import useBodyScrollLock from '../../hooks/useBodyScrollLock.js';
import useDialogFocusTrap from '../../hooks/useDialogFocusTrap.js';
import { normalizeReviewText, reviewBookedBy, reviewCopy, reviewDate, reviewGuide, reviewRating, reviewSource, reviewSourceLabel } from './reviewModel.js';

export default function ReviewDetailModal({ review, lang = 'it', onClose, onGoogleOpen }) {
  const panelRef = useRef(null);
  const isOpen = Boolean(review && typeof review === 'object');
  const safeReview = isOpen ? review : {};
  const copy = reviewCopy(lang);
  const source = reviewSource(safeReview);
  const guide = reviewGuide(safeReview);
  const rating = reviewRating(safeReview);
  const reviewer = reviewBookedBy(safeReview, lang);
  useBodyScrollLock(isOpen);

  useDialogFocusTrap(isOpen, panelRef, onClose);

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

        <div className="review-detail-body formatted-review-text">
          {normalizeReviewText(safeReview.review_text).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>)}
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
