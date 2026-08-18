import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import useBodyScrollLock from '../../hooks/useBodyScrollLock.js';
import useDialogFocusTrap from '../../hooks/useDialogFocusTrap.js';
import { reviewCopy } from './reviewModel.js';

export default function ReviewSubmissionModal({ open, lang = 'it', form, state, configured, onChange, onSubmit, onClose }) {
  const panelRef = useRef(null);
  const copy = reviewCopy(lang);
  useBodyScrollLock(open);

  useDialogFocusTrap(open, panelRef, onClose);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="public-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="admin-modal review-modal" role="dialog" aria-modal="true" aria-labelledby="reviewSubmissionTitle" ref={panelRef} tabIndex={-1}>
        <div className="admin-modal-header">
          <div>
            <h2 id="reviewSubmissionTitle">{copy.leaveTitle}</h2>
            <p>{copy.leaveIntro}</p>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose}>{copy.close}</button>
        </div>
        <form className="review-form modal-review-form" onSubmit={onSubmit}>
          <label><span>{copy.bookingCode}</span><input value={form.booking_code} onChange={(event) => onChange('booking_code', event.target.value)} required /></label>
          <label><span>{copy.reviewerName}</span><input value={form.reviewer_name} onChange={(event) => onChange('reviewer_name', event.target.value)} /></label>
          <label><span>{copy.rating}</span><select value={form.rating} onChange={(event) => onChange('rating', event.target.value)}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating}/5</option>)}</select></label>
          <label><span>{copy.reviewText}</span><textarea rows={5} value={form.review_text} onChange={(event) => onChange('review_text', event.target.value)} required /></label>
          {state.error && <div className="admin-alert error" role="alert">{state.error}</div>}
          {state.success && <div className="admin-alert success" role="status">{state.success}</div>}
          <div className="modal-actions">
            <button className="button primary" type="submit" disabled={state.loading || !configured}>{state.loading ? copy.sending : copy.publish}</button>
            <button className="button secondary" type="button" onClick={onClose}>{copy.close}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
