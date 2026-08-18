import { SITE_MEDIA, SITE_ORIGIN, absoluteSiteUrl, isCloudflarePreviewHostname } from './config/site.js';
import { canonicalPathForPage, legalPageFromPathname, publicPageFromPathname } from './app/publicRoutes.js';
import { seoMetaFor } from './seo/metadata.js';
import { structuredDataFor } from './seo/structuredData.js';

function upsertMeta(selector, create) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = create();
    document.head.appendChild(element);
  }
  return element;
}

function setMeta(name, content) {
  const meta = upsertMeta(`meta[name="${name}"]`, () => {
    const element = document.createElement('meta');
    element.setAttribute('name', name);
    return element;
  });
  meta.setAttribute('content', content || '');
}

function setProperty(property, content) {
  const meta = upsertMeta(`meta[property="${property}"]`, () => {
    const element = document.createElement('meta');
    element.setAttribute('property', property);
    return element;
  });
  meta.setAttribute('content', content || '');
}

function setLink(rel, href, extra = {}) {
  const selector = extra.hreflang ? `link[rel="${rel}"][hreflang="${extra.hreflang}"]` : `link[rel="${rel}"]`;
  const link = upsertMeta(selector, () => {
    const element = document.createElement('link');
    element.setAttribute('rel', rel);
    if (extra.hreflang) element.setAttribute('hreflang', extra.hreflang);
    return element;
  });
  link.setAttribute('href', href);
}

function routeForSeo(page, pathname) {
  if (page === 'notFound') return String(pathname || '/').split('?')[0] || '/';
  const legal = legalPageFromPathname(pathname);
  if (legal) return canonicalPathForPage(legal);
  const publicPage = publicPageFromPathname(pathname);
  if (publicPage) return canonicalPathForPage(publicPage);
  return canonicalPathForPage(page);
}

function localizedUrl(route, lang) {
  return lang === 'en' ? `${SITE_ORIGIN}${route}?lang=en` : `${SITE_ORIGIN}${route}`;
}

export function applySeo({ page = 'home', lang = 'it', pathname = '/', forceNoIndex = false } = {}) {
  if (typeof document === 'undefined') return;
  const legal = legalPageFromPathname(pathname);
  const resolvedPage = legal || page;
  const { page: safePage, lang: safeLang, title, description } = seoMetaFor(resolvedPage, lang);
  const route = routeForSeo(safePage, pathname);
  const canonical = localizedUrl(route, safeLang);
  const preview = typeof window !== 'undefined' && isCloudflarePreviewHostname(window.location.hostname);
  const noindex = Boolean(forceNoIndex || preview || safePage === 'notFound');

  document.documentElement.lang = safeLang;
  document.title = title;
  setMeta('description', description);
  setMeta('robots', noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
  setLink('canonical', canonical);
  setLink('alternate', `${SITE_ORIGIN}${route}`, { hreflang: 'it' });
  setLink('alternate', `${SITE_ORIGIN}${route}?lang=en`, { hreflang: 'en' });
  setLink('alternate', `${SITE_ORIGIN}${route}`, { hreflang: 'x-default' });
  setProperty('og:title', title);
  setProperty('og:description', description);
  setProperty('og:url', canonical);
  setProperty('og:type', 'website');
  setProperty('og:image', absoluteSiteUrl(SITE_MEDIA.ogImage));
  setProperty('og:image:alt', lang === 'en' ? 'vulcanIQ Mount Etna experiences' : 'vulcanIQ esperienze sull\'Etna');
  setMeta('twitter:card', 'summary_large_image');
  setMeta('twitter:title', title);
  setMeta('twitter:description', description);
  setMeta('twitter:image', absoluteSiteUrl(SITE_MEDIA.ogImage));

  const scriptId = 'vulcaniq-jsonld';
  let script = document.getElementById(scriptId);
  if (!script) {
    script = document.createElement('script');
    script.id = scriptId;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(structuredDataFor(safePage, safeLang, canonical));
}
