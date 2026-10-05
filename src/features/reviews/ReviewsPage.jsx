import React, { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured } from '../../lib/supabaseClient.js';
import { GOOGLE_BUSINESS_PROFILE } from '../../config/site.js';
import { loadPublicReviewsResult, submitPublicReview } from '../../services/reviewsService.js';
import { trackEvent, trackReviewView } from '../../analytics.js';
import ReviewCompactCard from './ReviewCompactCard.jsx';
import ReviewDetailModal from './ReviewDetailModal.jsx';
import ReviewFilters from './ReviewFilters.jsx';
import ReviewSubmissionModal from './ReviewSubmissionModal.jsx';
import { filterAndSortReviews, reviewCopy } from './reviewModel.js';

export default function ReviewsPage({ lang = 'it', siteContent, editor, EditableTextComponent }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [googleStatus, setGoogleStatus] = useState('unavailable');
  const [googleSummary, setGoogleSummary] = useState(null);
  const [selectedReview, setSelectedReview] = useState(null);
  const [reviewSubmissionOpen, setReviewSubmissionOpen] = useState(false);
  const [filterMode, setFilterMode] = useState('all');
  const [form, setForm] = useState({ booking_code: '', reviewer_name: '', review_text: '', rating: '5' });
  const [submitState, setSubmitState] = useState({ loading: false, error: '', success: '' });
  const copy = reviewCopy(lang);
  const Editable = EditableTextComponent;

  async function refreshReviews() {
    setLoading(true);
    try {
      const result = await loadPublicReviewsResult();
      setReviews(result.reviews);
      setGoogleStatus(result.googleStatus);
      setGoogleSummary(result.googleSummary);
    } catch {
      setReviews([]);
      setGoogleStatus('unavailable');
      setGoogleSummary(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    trackReviewView();
    refreshReviews();
  }, []);

  const sortedCards = useMemo(() => filterAndSortReviews(loading ? [] : reviews, filterMode), [reviews, loading, filterMode]);
  const rawGoogleSummaryRating = googleSummary?.averageRating;
  const googleSummaryRating = rawGoogleSummaryRating === null || rawGoogleSummaryRating === undefined
    ? Number.NaN
    : Number(rawGoogleSummaryRating);
  const googleSummaryRatingLabel = Number.isFinite(googleSummaryRating)
    ? `${googleSummaryRating.toFixed(1)}/5`
    : copy.ratingUnavailable;

  function selectFilter(nextFilter) {
    setFilterMode(nextFilter);
    if (nextFilter === 'google_reviews') {
      trackEvent('google_reviews_click', { source_section: 'reviews', source_cta: 'google_filter', cta_location: 'reviews_header', language: lang }, { dedupe: false });
    }
  }

  function trackGoogleLink(sourceCta) {
    trackEvent(sourceCta === 'write_google_review' ? 'google_review_request_click' : 'google_review_source_open', {
      source_section: 'reviews',
      source_cta: sourceCta,
      cta_location: 'reviews_header',
      review_source: 'google',
      language: lang
    }, { dedupe: false, transport: 'beacon' });
  }

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function readableSubmitError(error) {
    const message = error?.message || '';
    if (message.includes('INVALID_BOOKING_CODE')) return copy.invalidCode;
    if (message.includes('BOOKING_CODE_ALREADY_USED') || message.includes('BOOKING_CODE_USED') || message.includes('duplicate key')) return copy.usedCode;
    if (message.includes('REVIEW_TEXT_REQUIRED')) return copy.required;
    return copy.submitFailed;
  }

  async function submitReview(event) {
    event.preventDefault();
    const reviewCode = String(form.booking_code || '').trim().toUpperCase();
    setSubmitState({ loading: true, error: '', success: '' });
    await trackEvent('booking_code_review_submit_attempt', { source: 'booking_code', source_section: 'reviews', source_cta: 'publish_review', cta_location: 'review_modal', has_code: Boolean(reviewCode), language: lang }, { dedupe: false });
    try {
      const result = await submitPublicReview({ ...form, booking_code: reviewCode, language: lang });
      setForm({ booking_code: '', reviewer_name: '', review_text: '', rating: '5' });
      await trackEvent('booking_code_review_submit_success', { source: 'booking_code', source_section: 'reviews', source_cta: 'publish_review', cta_location: 'review_modal', review_id: result?.id || '', language: lang }, { dedupe: false });
      setSubmitState({ loading: false, error: '', success: copy.submitted });
      refreshReviews();
      window.setTimeout(() => setReviewSubmissionOpen(false), 1200);
    } catch (error) {
      const rawError = String(error?.message || error?.code || '');
      if (rawError.includes('USED') || rawError.includes('duplicate')) {
        await trackEvent('booking_code_review_duplicate', { source: 'booking_code', source_section: 'reviews', source_cta: 'publish_review', cta_location: 'review_modal', language: lang }, { dedupe: false });
      }
      setSubmitState({ loading: false, error: readableSubmitError(error), success: '' });
    }
  }

  function openReview(review) {
    if (!review || typeof review !== 'object') return;
    setSelectedReview(review);
    trackEvent('review_card_open', { review_id: review.id || '', review_source: review.source || 'website', rating_bucket: Number(review.rating) || 0, language: lang }, { dedupe: false });
  }

  function closeReview() {
    if (selectedReview) trackEvent('review_detail_close', { review_id: selectedReview.id, review_source: selectedReview.source || 'website', language: lang }, { dedupe: false });
    setSelectedReview(null);
  }

  return (
    <section className="section compact-section" id="reviews">
      <div className="container reviews-panel redesigned-reviews-panel">
        <div className="section-header refined-section-header reviews-header-row">
          <div>
            {Editable ? <Editable as="h2" itemKey="reviews.page.title" lang={lang} siteContent={siteContent} editor={editor} fallback={copy.title} /> : <h2>{copy.title}</h2>}
            {Editable ? <Editable as="p" itemKey="reviews.page.intro" lang={lang} siteContent={siteContent} editor={editor} fallback={copy.intro} /> : (copy.intro ? <p>{copy.intro}</p> : null)}
          </div>
          <div className="reviews-header-actions">
            <button className="button primary" type="button" onClick={() => {
              trackEvent('booking_code_review_open', { source: 'booking_code', source_section: 'reviews', source_cta: 'publish_review', cta_location: 'reviews_header', language: lang }, { dedupe: false });
              setSubmitState({ loading: false, error: '', success: '' });
              setReviewSubmissionOpen(true);
            }}>
              {Editable ? <Editable itemKey="reviews.publish_button" lang={lang} siteContent={siteContent} editor={editor} fallback={copy.publish} /> : copy.publish}
            </button>
            <a className="button secondary reviews-google-review-button" href={GOOGLE_BUSINESS_PROFILE.writeReviewUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackGoogleLink('write_google_review')}>{copy.writeGoogleReview}</a>
            <a className="reviews-google-maps-link" href={GOOGLE_BUSINESS_PROFILE.mapsUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackGoogleLink('view_google_maps')}>{copy.viewGoogleMaps}</a>
            <ReviewFilters lang={lang} value={filterMode} onChange={selectFilter} />
          </div>
        </div>

        {googleSummary?.available && (
          <aside className="google-reviews-summary" aria-label={copy.googleSummaryLabel}>
            <span className="review-source-badge google">Google</span>
            {Number.isFinite(googleSummaryRating) && <span className="stars review-rating-stars" aria-label={googleSummaryRatingLabel}>{'★'.repeat(Math.round(googleSummaryRating))}</span>}
            <strong>{googleSummaryRatingLabel}</strong>
            <span>{copy.googleReviewCount(googleSummary.totalReviewCount)}</span>
          </aside>
        )}

        <div className="reviews-grid-public balanced-reviews-grid compact-reviews-grid">
          {!loading && sortedCards.length === 0 && (
            <article className="empty-state-card review-empty-card">
              <p>{filterMode === 'google_reviews'
                ? (googleStatus === 'unavailable' ? copy.googleUnavailable : copy.googleEmpty)
                : copy.empty}</p>
            </article>
          )}
          {sortedCards.map((review) => <ReviewCompactCard key={review.id} review={review} lang={lang} onOpen={openReview} />)}
        </div>
        {loading && <p className="small-note">{copy.loading}</p>}
      </div>

      <ReviewDetailModal
        review={selectedReview}
        lang={lang}
        onClose={closeReview}
        onGoogleOpen={(review) => { if (review && typeof review === 'object') trackEvent('google_review_source_open', { review_id: review.id || '', review_source: 'google', language: lang }, { dedupe: false, transport: 'beacon' }); }}
      />
      <ReviewSubmissionModal
        open={reviewSubmissionOpen}
        lang={lang}
        form={form}
        state={submitState}
        configured={isSupabaseConfigured}
        onChange={update}
        onSubmit={submitReview}
        onClose={() => setReviewSubmissionOpen(false)}
      />
    </section>
  );
}
