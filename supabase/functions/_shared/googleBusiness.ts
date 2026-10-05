import { clean, env } from './vulcaniq.ts';
import { createGoogleBusinessClient } from './googleBusinessClient.js';

const googleClient = createGoogleBusinessClient();

function resourceId(value: string, prefix: string): string {
  const cleanValue = clean(value, 180).replace(/^\/+|\/+$/g, '');
  const id = cleanValue.startsWith(`${prefix}/`) ? cleanValue.slice(prefix.length + 1) : cleanValue;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`invalid_google_business_${prefix.slice(0, -1)}_id`);
  return id;
}

function publicGoogleUrl(value: string): string | null {
  const candidate = clean(value, 1000);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    const isGoogleHost = /^(?:[a-z0-9-]+\.)*google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(host)
      || host === 'maps.app.goo.gl'
      || host === 'goo.gl';
    return url.protocol === 'https:' && isGoogleHost ? url.toString() : null;
  } catch {
    return null;
  }
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
    mapsUri: publicGoogleUrl(env('GOOGLE_BUSINESS_PROFILE_URL', false)),
    locationResourceName: `accounts/${accountId}/locations/${locationId}`
  };
}

export async function googleBusinessAccessToken(): Promise<string> {
  return googleClient.refreshAccessToken(googleBusinessConfig());
}

export async function listAllGoogleBusinessReviews(accessToken: string) {
  const config = googleBusinessConfig();
  return googleClient.listReviews({ accessToken, locationResourceName: config.locationResourceName });
}
