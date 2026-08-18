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
