import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRating(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  return Math.min(5, Math.max(1, parsed));
}

const publicReviewFields = 'id, created_at, reviewer_name, review_text, rating, language, admin_reply, admin_reply_at';
<<<<<<< HEAD
const adminReviewFields = 'id, created_at, updated_at, booking_request_id, booking_code, reviewer_name, review_text, rating, language, approved, active, admin_reply, admin_reply_at, admin_reply_by';
=======
const fallbackPublicReviewFields = 'id, created_at, reviewer_name, review_text, rating, language';
const adminReviewFields = 'id, created_at, booking_request_id, booking_code, reviewer_name, review_text, rating, language, approved, active, admin_reply, admin_reply_at, admin_reply_by';
const fallbackAdminReviewFields = 'id, created_at, booking_request_id, booking_code, reviewer_name, review_text, rating, language, approved, active';

function isMissingAdminReplyColumn(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('admin_reply') || message.includes('admin reply') || message.includes('column') || message.includes('schema cache');
}
>>>>>>> d61f755 (Improve reviews fixed bookings admin replies and email formatting)

export async function loadPublicReviews() {
  if (!isSupabaseConfigured) return [];

  const runQuery = (fields) => supabase
    .from('public_reviews')
<<<<<<< HEAD
    .select(publicReviewFields)
=======
    .select(fields)
>>>>>>> d61f755 (Improve reviews fixed bookings admin replies and email formatting)
    .order('created_at', { ascending: false })
    .limit(12);

  let { data, error } = await runQuery(publicReviewFields);
  if (error && isMissingAdminReplyColumn(error)) {
    ({ data, error } = await runQuery(fallbackPublicReviewFields));
  }

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

<<<<<<< HEAD
  let query = supabase
    .from('reviews')
    .select(adminReviewFields)
    .order('created_at', { ascending: false })
    .limit(100);
=======
  const buildQuery = (fields) => {
    let query = supabase
      .from('reviews')
      .select(fields)
      .order('created_at', { ascending: false })
      .limit(100);
>>>>>>> d61f755 (Improve reviews fixed bookings admin replies and email formatting)

    if (activeOnly) query = query.eq('active', true).eq('approved', true);
    return query;
  };

  let { data, error } = await buildQuery(adminReviewFields);
  if (error && isMissingAdminReplyColumn(error)) {
    ({ data, error } = await buildQuery(fallbackAdminReviewFields));
  }

  if (error) throw error;
  return data || [];
}

export async function updateReviewVisibility(id, input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const payload = { updated_at: new Date().toISOString() };
  if (typeof input.active === 'boolean') payload.active = input.active;
  if (typeof input.approved === 'boolean') payload.approved = input.approved;

  let { data, error } = await supabase
    .from('reviews')
    .update(payload)
    .eq('id', id)
    .select(adminReviewFields)
    .single();

  if (error && isMissingAdminReplyColumn(error)) {
    ({ data, error } = await supabase
      .from('reviews')
      .update(payload)
      .eq('id', id)
      .select(fallbackAdminReviewFields)
      .single());
  }

  if (error) throw error;
  return data;
}

export async function updateReviewAdminReply(id, replyText, userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const cleanReply = cleanText(replyText);
  const payload = {
    admin_reply: cleanReply || null,
    admin_reply_at: cleanReply ? new Date().toISOString() : null,
    admin_reply_by: cleanReply ? userId : null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('reviews')
    .update(payload)
    .eq('id', id)
    .select(adminReviewFields)
    .single();

  if (error) throw error;
  return data;
}

<<<<<<< HEAD
export async function updateReviewAdminReply(id, replyText, userId = '') {
=======
export async function deleteReviewAdminReply(id) {
  return updateReviewAdminReply(id, '', null);
}

export async function deleteReview(id) {
>>>>>>> d61f755 (Improve reviews fixed bookings admin replies and email formatting)
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const cleanReply = cleanText(replyText);
  const payload = {
    admin_reply: cleanReply || null,
    admin_reply_at: cleanReply ? new Date().toISOString() : null,
    admin_reply_by: cleanReply ? cleanText(userId) || null : null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('reviews')
    .update(payload)
    .eq('id', id)
    .select(adminReviewFields)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteReviewAdminReply(id) {
  return updateReviewAdminReply(id, '', '');
}
