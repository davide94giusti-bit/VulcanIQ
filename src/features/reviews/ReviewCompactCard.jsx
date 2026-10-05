import React from 'react';
import { reviewBookedBy, reviewCopy, reviewDate, reviewGuide, reviewRating, reviewSource, reviewSourceLabel } from './reviewModel.js';

export default function ReviewCompactCard({ review, lang = 'it', onOpen }) {
  if (!review || typeof review !== 'object') return null;

  const copy = reviewCopy(lang);
  const source = reviewSource(review);
  const guide = reviewGuide(review);
  const rating = reviewRating(review);
  const reviewer = reviewBookedBy(review, lang);
  const ratingLabel = rating == null ? copy.ratingUnavailable : `${rating}/5`;

  return (
    <button
      className="review-card featured-review-card compact-review-card"
      type="button"
      onClick={() => onOpen?.(review)}
      aria-label={`${copy.openReview}: ${reviewer}, ${ratingLabel}`}
    >
      <span className="review-card-info-header">
        <span className="review-card-source-row">
          <span className={`review-source-badge ${source}`}>{reviewSourceLabel(review, lang)}</span>
          <span className="stars review-rating-stars" aria-label={ratingLabel}>{rating == null ? '—' : '★'.repeat(rating)}</span>
        </span>
        <span className="review-info-list compact-review-info-list">
          <span className="reviewer-identity-row">
            {source === 'google' && review.profile_photo_url && <img className="google-review-avatar" src={review.profile_photo_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} />}
            <span><b>{source === 'google' ? copy.reviewer : copy.bookedBy}:</b> {reviewer}</span>
          </span>
          <span><b>{copy.date}:</b> {reviewDate(review, lang)}</span>
          {source !== 'google' && guide && <span><b>{copy.guide}:</b> {guide}</span>}
        </span>
      </span>
    </button>
  );
}
