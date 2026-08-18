import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

function isMissingGoogleReviewContract(error) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return message.includes('get_public_google_reviews') || message.includes('get_google_reviews_sync_status') || message.includes('schema cache') || message.includes('does not exist');
}

export async function loadPublicGoogleReviews() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('get_public_google_reviews');
  if (error) {
    if (isMissingGoogleReviewContract(error)) return [];
    throw error;
  }
  return Array.isArray(data) ? data : [];
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
