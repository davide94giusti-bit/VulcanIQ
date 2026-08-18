import React from 'react';
import { reviewBookedBy, reviewCopy, reviewDate, reviewGuide, reviewSource, reviewSourceLabel } from './reviewModel.js';

export default function ReviewCompactCard({ review, lang = 'it', onOpen }) {
  const copy = reviewCopy(lang);
  const source = reviewSource(review);
  const guide = reviewGuide(review);
  const rating = Math.max(1, Math.min(5, Number(review.rating) || 5));
  const reviewer = reviewBookedBy(review, lang);

  return (
    <button
      className="review-card featured-review-card compact-review-card"
      type="button"
      onClick={() => onOpen?.(review)}
      aria-label={`${copy.openReview}: ${reviewer}, ${rating}/5`}
    >
      <span className="review-card-info-header">
        <span className="review-card-source-row">
          <span className={`review-source-badge ${source}`}>{reviewSourceLabel(review, lang)}</span>
          <span className="stars review-rating-stars" aria-label={`${rating}/5`}>{'★'.repeat(rating)}</span>
        </span>
        <span className="review-info-list compact-review-info-list">
          <span><b>{source === 'google' ? copy.name : copy.bookedBy}:</b> {reviewer}</span>
          <span><b>{copy.date}:</b> {reviewDate(review, lang)}</span>
          {source !== 'google' && guide && <span><b>{copy.guide}:</b> {guide}</span>}
        </span>
      </span>
    </button>
  );
}
