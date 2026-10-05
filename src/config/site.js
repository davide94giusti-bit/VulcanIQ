export const SITE_ORIGIN = 'https://vulcaniq.it';
export const BRAND_NAME = 'vulcanIQ';
export const DEFAULT_LOCALE = 'it';
export const SUPPORTED_LOCALES = ['it', 'en'];

export const SITE_CONTACT = Object.freeze({
  phoneDisplay: '+39 334 929 8246',
  phoneE164: '+393349298246',
  email: 'leo97ct@yahoo.it',
  instagram: 'https://www.instagram.com/leonardo_chiavetta'
});

export const SITE_MEDIA = Object.freeze({
  logo: '/brand/vulcaniq/vulcaniq-logo-premium.png',
  ogImage: '/brand/vulcaniq/og-image.png'
});

// Public, non-secret Google Business Profile destinations supplied by the
// vulcanIQ profile administrators. OAuth/account/location configuration stays
// server-side and is deliberately not represented here.
export const GOOGLE_BUSINESS_PROFILE = Object.freeze({
  mapsUrl: 'https://maps.app.goo.gl/efLnfxBxYvei22YY6?g_st=aw',
  writeReviewUrl: 'https://g.page/r/CfYT-ORvmFjiEBI/review'
});

export function absoluteSiteUrl(path = '/') {
  const clean = String(path || '/').trim();
  if (/^https?:\/\//i.test(clean)) return clean;
  const normalized = clean.startsWith('/') ? clean : `/${clean}`;
  return `${SITE_ORIGIN}${normalized}`;
}

export function isCloudflarePreviewHostname(hostname = '') {
  const clean = String(hostname || '').trim().toLowerCase();
  return clean === 'vulcaniq.pages.dev' || clean.endsWith('.vulcaniq.pages.dev');
}
