import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

const publicReviewFields = 'id, created_at, reviewer_name, review_text, rating, language, admin_reply, admin_reply_at, source, review_date, external_review_url, profile_photo_url, display_order';
const legacyPublicReviewFields = 'id, created_at, reviewer_name, review_text, rating, language, admin_reply, admin_reply_at';
const adminReviewFields = 'id, created_at, updated_at, booking_request_id, booking_code_id, booking_code, reviewer_name, review_text, rating, language, approved, active, admin_reply, admin_reply_at, admin_reply_by, source, review_date, external_review_url, profile_photo_url, display_order';
const legacyAdminReviewFields = 'id, created_at, booking_request_id, booking_code, reviewer_name, review_text, rating, language, approved, active, admin_reply, admin_reply_at, admin_reply_by';

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanOptionalUrl(value) {
  const clean = cleanText(value);
  if (!clean) return null;
  return /^https?:\/\//i.test(clean) ? clean : null;
}

function normalizeRating(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  return Math.min(5, Math.max(1, parsed));
}

function normalizeSource(value) {
  const clean = cleanText(value).toLowerCase().replace(/[\s-]+/g, '_');
  if (clean.includes('google')) return 'google';
  if (clean === 'site' || clean === 'web') return 'website';
  if (['website', 'internal', 'direct', 'booking_code', 'referral'].includes(clean)) return clean;
  return 'website';
}

function isExtendedReviewSchemaError(error) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return message.includes('booking_code_id') || message.includes('admin_reply') || message.includes('source') || message.includes('review_date') || message.includes('external_review_url') || message.includes('profile_photo_url') || message.includes('display_order') || message.includes('column') || message.includes('schema cache');
}

function generatedManualBookingCode(source = 'manual') {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  return `${source === 'google' ? 'GOOGLE' : 'MANUAL'}-${suffix}`;
}

function reviewPayload(input = {}, { creating = false } = {}) {
  const source = normalizeSource(input.source || input.review_source || 'website');
  const payload = {
    reviewer_name: cleanText(input.reviewer_name || input.reviewerName) || null,
    review_text: cleanText(input.review_text || input.reviewText),
    rating: normalizeRating(input.rating),
    language: input.language === 'en' ? 'en' : 'it',
    approved: input.approved !== false,
    active: input.active !== false,
    source,
    review_date: cleanText(input.review_date || input.reviewDate) || null,
    external_review_url: cleanOptionalUrl(input.external_review_url || input.google_review_url || input.review_url),
    profile_photo_url: cleanOptionalUrl(input.profile_photo_url || input.photo_url),
    display_order: Number.parseInt(input.display_order || 0, 10) || 0,
    updated_at: new Date().toISOString()
  };
  if (creating) {
    payload.booking_code = cleanText(input.booking_code || input.bookingCode).toUpperCase() || generatedManualBookingCode(source);
    if (cleanText(input.booking_code_id || input.bookingCodeId)) payload.booking_code_id = cleanText(input.booking_code_id || input.bookingCodeId);
    payload.created_at = input.created_at || undefined;
  }
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  return payload;
}

function stripExtendedReviewPayload(payload) {
  const clone = { ...payload };
  delete clone.booking_code_id;
  delete clone.source;
  delete clone.review_date;
  delete clone.external_review_url;
  delete clone.profile_photo_url;
  delete clone.display_order;
  return clone;
}

export async function loadPublicReviews() {
  if (!isSupabaseConfigured) return [];

  let response = await supabase
    .from('public_reviews')
    .select(publicReviewFields)
    .order('display_order', { ascending: true })
    .order('review_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(60);

  if (response.error && isExtendedReviewSchemaError(response.error)) {
    response = await supabase
      .from('public_reviews')
      .select(legacyPublicReviewFields)
      .order('created_at', { ascending: false })
      .limit(12);
  }

  if (response.error) throw response.error;
  return response.data || [];
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
    .select(adminReviewFields)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(100);

  if (activeOnly) query = query.eq('active', true).eq('approved', true);

  let { data, error } = await query;

  if (error && isExtendedReviewSchemaError(error)) {
    let legacyQuery = supabase
      .from('reviews')
      .select(legacyAdminReviewFields)
      .order('created_at', { ascending: false })
      .limit(100);

    if (activeOnly) legacyQuery = legacyQuery.eq('active', true).eq('approved', true);
    const legacy = await legacyQuery;
    data = legacy.data;
    error = legacy.error;
  }

  if (error) throw error;
  return data || [];
}

export async function createManualReview(input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const payload = reviewPayload(input, { creating: true });
  if (!payload.review_text) throw new Error('REVIEW_TEXT_REQUIRED');

  let response = await supabase
    .from('reviews')
    .insert(payload)
    .select(adminReviewFields)
    .single();

  if (response.error && isExtendedReviewSchemaError(response.error)) {
    response = await supabase
      .from('reviews')
      .insert(stripExtendedReviewPayload(payload))
      .select(legacyAdminReviewFields)
      .single();
  }

  if (response.error) throw response.error;
  return response.data;
}

export async function updateReviewDetails(id, input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const payload = reviewPayload(input);
  if (!payload.review_text) throw new Error('REVIEW_TEXT_REQUIRED');

  let response = await supabase
    .from('reviews')
    .update(payload)
    .eq('id', id)
    .select(adminReviewFields)
    .single();

  if (response.error && isExtendedReviewSchemaError(response.error)) {
    response = await supabase
      .from('reviews')
      .update(stripExtendedReviewPayload(payload))
      .eq('id', id)
      .select(legacyAdminReviewFields)
      .single();
  }

  if (response.error) throw response.error;
  return response.data;
}

export async function updateReviewVisibility(id, input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const payload = { updated_at: new Date().toISOString() };
  if (typeof input.active === 'boolean') payload.active = input.active;
  if (typeof input.approved === 'boolean') payload.approved = input.approved;

  let response = await supabase
    .from('reviews')
    .update(payload)
    .eq('id', id)
    .select(adminReviewFields)
    .single();

  if (response.error && isExtendedReviewSchemaError(response.error)) {
    response = await supabase
      .from('reviews')
      .update(payload)
      .eq('id', id)
      .select(legacyAdminReviewFields)
      .single();
  }

  if (response.error) throw response.error;
  return response.data;
}

export async function updateReviewAdminReply(id, replyText) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const cleanReply = cleanText(replyText);
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id || null;
  const payload = {
    admin_reply: cleanReply || null,
    admin_reply_at: cleanReply ? new Date().toISOString() : null,
    admin_reply_by: cleanReply ? userId : null,
    updated_at: new Date().toISOString()
  };

  let response = await supabase
    .from('reviews')
    .update(payload)
    .eq('id', id)
    .select(adminReviewFields)
    .single();

  if (response.error && isExtendedReviewSchemaError(response.error)) {
    response = await supabase
      .from('reviews')
      .update(payload)
      .eq('id', id)
      .select(legacyAdminReviewFields)
      .single();
  }

  if (response.error) throw response.error;
  return response.data;
}

export async function deleteReviewAdminReply(id) {
  return updateReviewAdminReply(id, '');
}

export async function deleteReview(id) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const { error } = await supabase
    .from('reviews')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
}
