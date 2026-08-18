import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import useBodyScrollLock from '../../hooks/useBodyScrollLock.js';
import useDialogFocusTrap from '../../hooks/useDialogFocusTrap.js';
import { normalizeReviewText, reviewBookedBy, reviewCopy, reviewDate, reviewGuide, reviewSource, reviewSourceLabel } from './reviewModel.js';

export default function ReviewDetailModal({ review, lang = 'it', onClose, onGoogleOpen }) {
  const panelRef = useRef(null);
  const copy = reviewCopy(lang);
  const source = reviewSource(review);
  const guide = reviewGuide(review);
  const rating = Math.max(1, Math.min(5, Number(review.rating) || 5));
  const reviewer = reviewBookedBy(review, lang);
  useBodyScrollLock(Boolean(review));

  useDialogFocusTrap(Boolean(review), panelRef, onClose);

  if (!review || typeof document === 'undefined') return null;

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
            {review.profile_photo_url && <img src={review.profile_photo_url} alt="" loading="lazy" referrerPolicy="no-referrer" />}
            <span>{copy.googleAttribution}</span>
          </div>
        )}

        <div className="review-detail-body formatted-review-text">
          {normalizeReviewText(review.review_text).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>)}
        </div>

        {review.admin_reply && (
          <div className="public-admin-reply review-detail-reply">
            <strong>{copy.response}</strong>
            <div className="formatted-review-text admin-reply-text">
              {normalizeReviewText(review.admin_reply).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>)}
            </div>
          </div>
        )}

        <footer className="review-detail-actions">
          {source === 'google' && review.external_review_url && (
            <a className="button primary" href={review.external_review_url} target="_blank" rel="noopener noreferrer" onClick={() => onGoogleOpen?.(review)}>{copy.openGoogle}</a>
          )}
          <button className="button secondary" type="button" onClick={onClose}>{copy.close}</button>
        </footer>
      </article>
    </div>,
    document.body
  );
}
