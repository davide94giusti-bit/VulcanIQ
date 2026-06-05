import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRating(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  return Math.min(5, Math.max(1, parsed));
}

export async function loadPublicReviews() {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('public_reviews')
    .select('id, created_at, reviewer_name, review_text, rating, language')
    .order('created_at', { ascending: false })
    .limit(12);

  if (error) throw error;
  return data || [];
}

export async function submitPublicReview(input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const bookingCode = cleanText(input.booking_code || input.bookingCode).toUpperCase();
  const reviewText = cleanText(input.review_text || input.reviewText);
  const reviewerName = cleanText(input.reviewer_name || input.reviewerName);

  if (!bookingCode) throw new Error('INVALID_BOOKING_CODE');
  if (!reviewText) throw new Error('REVIEW_TEXT_REQUIRED');

  const { data, error } = await supabase.rpc('submit_public_review', {
    p_booking_code: bookingCode,
    p_reviewer_name: reviewerName || null,
    p_review_text: reviewText,
    p_rating: normalizeRating(input.rating),
    p_language: input.language === 'en' ? 'en' : 'it'
  });

  if (error) throw error;
  return data;
}

export async function listReviews({ activeOnly = false } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  let query = supabase
    .from('reviews')
    .select('id, created_at, booking_request_id, booking_code, reviewer_name, review_text, rating, language, approved, active')
    .order('created_at', { ascending: false })
    .limit(100);

  if (activeOnly) query = query.eq('active', true).eq('approved', true);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function updateReviewVisibility(id, input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const payload = { updated_at: new Date().toISOString() };
  if (typeof input.active === 'boolean') payload.active = input.active;
  if (typeof input.approved === 'boolean') payload.approved = input.approved;

  const { data, error } = await supabase
    .from('reviews')
    .update(payload)
    .eq('id', id)
    .select('id, created_at, booking_request_id, booking_code, reviewer_name, review_text, rating, language, approved, active')
    .single();

  if (error) throw error;
  return data;
}


export async function deleteReview(id) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  // Prefer soft delete because the current schema exposes active/approved fields
  // and the public_reviews view already filters them out.
  const payload = {
    active: false,
    approved: false,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('reviews')
    .update(payload)
    .eq('id', id)
    .select('id, created_at, booking_request_id, booking_code, reviewer_name, review_text, rating, language, approved, active')
    .single();

  if (error) throw error;
  return data;
}
