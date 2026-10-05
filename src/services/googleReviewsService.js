import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';
import { normalizePublicGoogleReview } from '../features/reviews/googleReviewModel.js';

function isMissingGoogleReviewContract(error) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return message.includes('get_public_google_reviews') || message.includes('get_google_reviews_sync_status') || message.includes('schema cache') || message.includes('does not exist');
}

export async function loadPublicGoogleReviews() {
  return (await loadPublicGoogleReviewFeed()).reviews;
}

function normalizeGoogleSummary(value) {
  if (!value || value.available !== true) return null;
  const averageRating = Number(value.average_rating);
  const totalReviewCount = Number(value.total_review_count);
  if (!Number.isInteger(totalReviewCount) || totalReviewCount < 0) return null;
  return {
    available: true,
    averageRating: Number.isFinite(averageRating) && averageRating >= 1 && averageRating <= 5 ? averageRating : null,
    totalReviewCount,
    refreshedAt: value.refreshed_at || null,
    expiresAt: value.expires_at || null
  };
}

export async function loadPublicGoogleReviewFeed() {
  if (!isSupabaseConfigured) return { reviews: [], summary: null, status: 'unavailable' };

  const [reviewsResponse, summaryResponse] = await Promise.all([
    supabase.rpc('get_public_google_reviews'),
    supabase.rpc('get_public_google_reviews_summary')
  ]);

  if (reviewsResponse.error && !isMissingGoogleReviewContract(reviewsResponse.error)) throw reviewsResponse.error;
  const rows = reviewsResponse.error ? [] : (Array.isArray(reviewsResponse.data) ? reviewsResponse.data : []);
  const reviews = rows.map(normalizePublicGoogleReview).filter(Boolean);

  const summaryMissing = summaryResponse.error && isMissingGoogleReviewContract(summaryResponse.error);
  if (summaryResponse.error && !summaryMissing) throw summaryResponse.error;
  const summary = summaryMissing ? null : normalizeGoogleSummary(summaryResponse.data);
  const status = reviews.length > 0
    ? 'available'
    : summary?.available && summary.totalReviewCount === 0
      ? 'empty'
      : 'unavailable';

  return { reviews, summary, status };
}

export async function getGoogleReviewsSyncStatus() {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('get_google_reviews_sync_status');
  if (error) {
    if (isMissingGoogleReviewContract(error)) {
      return { configured: false, status: 'migration_required' };
    }
    throw error;
  }
  return data && typeof data === 'object' ? data : { configured: false, status: 'not_configured' };
}

export async function refreshGoogleReviewsNow() {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke('google-reviews-sync', {
    body: { mode: 'manual' }
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'google_reviews_sync_failed');
  return data;
}
