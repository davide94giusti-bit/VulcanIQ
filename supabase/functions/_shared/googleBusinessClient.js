import { normalizeGoogleReviewPage } from './googleReviewNormalization.js';

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

function errorCode(value, fallback) {
  const message = String(value?.message || value || '').trim();
  return message.startsWith('google_') ? message : fallback;
}

export function createGoogleBusinessClient({
  fetchImpl = globalThis.fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  timeoutMs = 12000,
  retryAttempts = 3,
  maxReviewPages = 2
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('google_business_fetch_unavailable');

  async function fetchWithTimeout(url, init = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') throw new Error('google_business_timeout');
      throw new Error(errorCode(error, 'google_business_network_failed'));
    } finally {
      clearTimeout(timeout);
    }
  }

  async function retryFetch(url, init = {}, attempts = retryAttempts) {
    let lastResponse = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetchWithTimeout(url, init);
        lastResponse = response;
        if (response.ok || !TRANSIENT_STATUSES.has(response.status) || attempt === attempts - 1) return response;
      } catch (error) {
        if (error?.message !== 'google_business_timeout' || attempt === attempts - 1) throw error;
      }
      await sleep(400 * (attempt + 1) * (attempt + 1));
    }
    if (!lastResponse) throw new Error('google_business_network_failed');
    return lastResponse;
  }

  async function responseJson(response, malformedCode) {
    try {
      const value = await response.json();
      if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(malformedCode);
      return value;
    } catch (error) {
      throw new Error(errorCode(error, malformedCode));
    }
  }

  async function refreshAccessToken(config) {
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
    if (!response.ok) {
      throw new Error(response.status === 400 || response.status === 401
        ? 'google_oauth_refresh_failed'
        : 'google_oauth_unavailable');
    }
    const payload = await responseJson(response, 'google_oauth_malformed_response');
    const accessToken = typeof payload.access_token === 'string' ? payload.access_token.trim() : '';
    if (!accessToken) throw new Error('google_oauth_malformed_response');
    return accessToken.slice(0, 4096);
  }

  async function listReviews({ accessToken, locationResourceName }) {
    const all = [];
    let pageToken = '';
    let averageRating = null;
    let totalReviewCount = null;

    for (let page = 0; page < maxReviewPages; page += 1) {
      const params = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc' });
      if (pageToken) params.set('pageToken', pageToken);
      const url = `https://mybusiness.googleapis.com/v4/${locationResourceName}/reviews?${params.toString()}`;
      const response = await retryFetch(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error('google_business_unauthorized');
        if (response.status === 403) throw new Error('google_business_forbidden');
        if (response.status === 429) throw new Error('google_business_rate_limited');
        throw new Error('google_business_reviews_unavailable');
      }
      const payload = normalizeGoogleReviewPage(await responseJson(response, 'google_business_malformed_response'));
      all.push(...payload.reviews);
      if (page === 0) {
        averageRating = payload.averageRating;
        totalReviewCount = payload.totalReviewCount;
      }
      pageToken = payload.nextPageToken;
      if (!pageToken) {
        return { reviews: all, averageRating, totalReviewCount, truncated: false };
      }
    }

    return { reviews: all, averageRating, totalReviewCount, truncated: Boolean(pageToken) };
  }

  return { refreshAccessToken, listReviews };
}
