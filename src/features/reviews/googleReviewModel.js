import { GOOGLE_BUSINESS_PROFILE } from '../../config/site.js';

function cleanUrl(value, fallback = null) {
  try {
    const url = new URL(String(value || fallback || ''));
    return url.protocol === 'https:' ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function normalizeRating(value) {
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
}

export function normalizePublicGoogleReview(row = {}) {
  const providerReviewId = String(row?.provider_review_id || '').trim();
  if (!providerReviewId) return null;
  return {
    id: `google:${providerReviewId}`,
    created_at: row.published_at || null,
    reviewer_name: String(row.author_display_name || '').trim() || null,
    review_text: typeof row.review_text === 'string' ? row.review_text : '',
    rating: normalizeRating(row.rating),
    language: row.review_language || null,
    admin_reply: typeof row.provider_reply_text === 'string' ? row.provider_reply_text : null,
    admin_reply_at: row.provider_reply_updated_at || null,
    source: 'google',
    review_date: row.published_at ? String(row.published_at).slice(0, 10) : null,
    external_review_url: cleanUrl(row.google_maps_uri, GOOGLE_BUSINESS_PROFILE.mapsUrl),
    profile_photo_url: cleanUrl(row.author_photo_uri),
    display_order: 0,
    provider_review_id: providerReviewId,
    provider: 'google_business_profile',
    provider_attribution: 'Google',
    provider_cached_until: row.expires_at || null
  };
}
