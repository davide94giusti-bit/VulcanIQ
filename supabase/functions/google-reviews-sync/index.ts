import { claimAdminAction, clean, corsPreflight, dbJson, env, json, requireAdmin } from '../_shared/vulcaniq.ts';
import { googleBusinessAccessToken, googleBusinessConfig, listAllGoogleBusinessReviews } from '../_shared/googleBusiness.ts';

const PROVIDER = 'google_business_profile';
const CACHE_DAYS = 29;

function safeIso(value: unknown): string | null {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeErrorCode(error: unknown): string {
  const value = clean(error instanceof Error ? error.message : error, 80).toLowerCase();
  const allowed = [
    'unauthorized',
    'forbidden',
    'rate_limited',
    'google_oauth_refresh_failed',
    'google_oauth_unavailable',
    'google_oauth_malformed_response',
    'google_business_unauthorized',
    'google_business_forbidden',
    'google_business_rate_limited',
    'google_business_reviews_unavailable',
    'google_business_malformed_response',
    'google_business_network_failed',
    'google_business_timeout',
    'database_request_failed'
  ];
  if (allowed.includes(value)) return value;
  if (value.startsWith('missing_google_business_') || value.startsWith('invalid_google_business_')) return 'google_reviews_not_configured';
  return 'google_reviews_sync_failed';
}

async function markState(patch: Record<string, unknown>) {
  await dbJson('google_reviews_sync_state?id=eq.google_business_profile', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ updated_at: new Date().toISOString(), ...patch })
  });
}

async function authorize(req: Request): Promise<{ mode: 'cron' | 'manual'; actor: string }> {
  const expected = env('GOOGLE_REVIEWS_SYNC_SECRET', false);
  const supplied = clean(req.headers.get('x-vulcaniq-google-reviews-sync-secret'), 300);
  if (expected && supplied && supplied === expected) return { mode: 'cron', actor: 'cron' };

  const userId = await requireAdmin(req);
  if (!await claimAdminAction('google-reviews-sync-manual', userId, 2, 3600)) throw new Error('rate_limited');
  return { mode: 'manual', actor: userId };
}

Deno.serve(async (req) => {
  const preflight = corsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const startedAt = new Date().toISOString();
  try {
    const authorization = await authorize(req);
    await markState({ last_attempt_at: startedAt, last_error_code: null, last_error_at: null });

    // Retention is enforced independently of provider availability. An
    // authorized manual or scheduled attempt removes expired provider content
    // before OAuth refresh or any Google API request can fail.
    const expiredQuery = new URLSearchParams({ provider: `eq.${PROVIDER}`, expires_at: `lte.${startedAt}` });
    await dbJson(`google_reviews_cache?${expiredQuery.toString()}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });

    const config = googleBusinessConfig();
    const token = await googleBusinessAccessToken();
    const providerResult = await listAllGoogleBusinessReviews(token);
    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + CACHE_DAYS * 86400000).toISOString();
    const seenAt = fetchedAt.toISOString();

    const rows = providerResult.reviews
      .map((review) => ({
        provider: PROVIDER,
        provider_review_id: review.providerReviewId,
        account_id: config.accountId,
        location_id: config.locationId,
        author_display_name: review.authorDisplayName,
        author_photo_uri: review.authorPhotoUri,
        author_is_anonymous: review.authorIsAnonymous,
        rating: review.rating,
        review_text: review.reviewText,
        review_language: null,
        published_at: safeIso(review.publishedAt),
        updated_at_source: safeIso(review.updatedAtSource),
        google_maps_uri: config.mapsUri,
        provider_reply_text: review.providerReplyText,
        provider_reply_updated_at: safeIso(review.providerReplyUpdatedAt),
        fetched_at: seenAt,
        expires_at: expiresAt,
        last_seen_at: seenAt
      }))
      .filter((row) => row.provider_review_id);

    if (rows.length) {
      await dbJson('google_reviews_cache?on_conflict=provider,provider_review_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows)
      });
    }

    // Only after a complete successful provider read, remove rows that were not
    // present in this bounded sync. Historical provider content is never kept
    // as a permanent first-party review archive.
    const staleQuery = new URLSearchParams({ provider: `eq.${PROVIDER}`, last_seen_at: `lt.${seenAt}` });
    await dbJson(`google_reviews_cache?${staleQuery.toString()}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });

    await markState({
      status: 'connected',
      location_resource_name: config.locationResourceName,
      average_rating: providerResult.averageRating,
      total_review_count: providerResult.totalReviewCount,
      summary_expires_at: expiresAt,
      last_success_at: seenAt,
      last_error_at: null,
      last_error_code: null
    });

    console.log('google_reviews_sync_completed', { mode: authorization.mode });
    return json(200, { ok: true, mode: authorization.mode, synced_at: seenAt, cached_reviews: rows.length, truncated: providerResult.truncated });
  } catch (error) {
    const code = safeErrorCode(error);
    try {
      await markState({
        status: code === 'google_reviews_not_configured' ? 'not_configured' : 'error',
        last_attempt_at: startedAt,
        last_error_at: new Date().toISOString(),
        last_error_code: code
      });
    } catch {
      // State logging must not replace the primary provider error.
    }
    console.error('google_reviews_sync_failed', { code });
    const status = code === 'unauthorized' ? 401 : code === 'forbidden' ? 403 : code === 'rate_limited' ? 429 : code === 'google_reviews_not_configured' ? 503 : code === 'google_business_forbidden' ? 502 : 500;
    return json(status, { ok: false, error: code });
  }
});
