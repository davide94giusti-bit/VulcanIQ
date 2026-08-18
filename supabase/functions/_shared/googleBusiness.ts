import { clean, env } from './vulcaniq.ts';

export type GoogleBusinessReview = {
  reviewId?: string;
  reviewer?: { profilePhotoUrl?: string; displayName?: string; isAnonymous?: boolean };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
};

type GoogleReviewPage = {
  reviews?: GoogleBusinessReview[];
  nextPageToken?: string;
};

function resourceId(value: string, prefix: string): string {
  const cleanValue = clean(value, 180).replace(/^\/+|\/+$/g, '');
  return cleanValue.startsWith(`${prefix}/`) ? cleanValue.slice(prefix.length + 1) : cleanValue;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function retryFetch(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetchWithTimeout(url, init);
    last = response;
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === attempts - 1) return response;
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1) * (attempt + 1)));
  }
  if (!last) throw new Error('google_business_network_failed');
  return last;
}

export function googleBusinessConfig() {
  const accountId = resourceId(env('GOOGLE_BUSINESS_ACCOUNT_ID'), 'accounts');
  const locationId = resourceId(env('GOOGLE_BUSINESS_LOCATION_ID'), 'locations');
  return {
    clientId: env('GOOGLE_BUSINESS_CLIENT_ID'),
    clientSecret: env('GOOGLE_BUSINESS_CLIENT_SECRET'),
    refreshToken: env('GOOGLE_BUSINESS_REFRESH_TOKEN'),
    accountId,
    locationId,
    mapsUri: env('GOOGLE_BUSINESS_PROFILE_URL', false) || null,
    locationResourceName: `accounts/${accountId}/locations/${locationId}`
  };
}

export async function googleBusinessAccessToken(): Promise<string> {
  const config = googleBusinessConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token'
  });
  const response = await retryFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  }, 2);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !clean(payload?.access_token, 4096)) {
    throw new Error(response.status === 400 || response.status === 401 ? 'google_oauth_refresh_failed' : 'google_oauth_unavailable');
  }
  return clean(payload.access_token, 4096);
}

export async function listAllGoogleBusinessReviews(accessToken: string): Promise<GoogleBusinessReview[]> {
  const config = googleBusinessConfig();
  const all: GoogleBusinessReview[] = [];
  let pageToken = '';

  for (let page = 0; page < 100; page += 1) {
    const params = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc' });
    if (pageToken) params.set('pageToken', pageToken);
    const url = `https://mybusiness.googleapis.com/v4/${config.locationResourceName}/reviews?${params.toString()}`;
    const response = await retryFetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({})) as GoogleReviewPage;
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('google_business_forbidden');
      if (response.status === 429) throw new Error('google_business_rate_limited');
      throw new Error('google_business_reviews_unavailable');
    }
    if (Array.isArray(payload.reviews)) all.push(...payload.reviews);
    pageToken = clean(payload.nextPageToken, 2048);
    if (!pageToken) return all;
  }

  throw new Error('google_business_reviews_pagination_limit');
}

export function numericStarRating(value: unknown): number | null {
  const ratings: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return ratings[clean(value, 30).toUpperCase()] || null;
}
