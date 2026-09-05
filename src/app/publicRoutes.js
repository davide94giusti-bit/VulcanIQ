export const PUBLIC_ROUTES = Object.freeze([
  { page: 'home', path: '/', indexable: true },
  { page: 'experiences', path: '/experiences', indexable: true },
  { page: 'contact', path: '/contact', indexable: true },
  { page: 'about', path: '/about', indexable: true },
  { page: 'reviews', path: '/reviews', indexable: true },
  { page: 'partnerships', path: '/partnerships', aliases: ['/collaborations'], indexable: true },
  { page: 'social', path: '/social', indexable: true },
  { page: 'latestNews', path: '/latest-news', aliases: ['/etna-live-news'], indexable: true },
  { page: 'giftCard', path: '/gift-card', indexable: true },
  { page: 'install', path: '/install', indexable: false },
  { page: 'termsAcceptance', path: '/terms-acceptance', indexable: false },
  { page: 'privacy', path: '/privacy-policy', legal: true, indexable: true },
  { page: 'terms', path: '/terms-and-conditions', legal: true, indexable: true },
  { page: 'cookies', path: '/cookie-policy', legal: true, indexable: true }
]);

export const PUBLIC_INDEXABLE_PATHS = Object.freeze(PUBLIC_ROUTES.filter((route) => route.indexable).map((route) => route.path));

export function normalizePublicPath(pathname = '/') {
  const raw = String(pathname || '/').split('?')[0].split('#')[0];
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`;
  const clean = prefixed.replace(/\/{2,}/g, '/').replace(/\/$/, '');
  return clean || '/';
}

export function routeDefinitionFromPathname(pathname = '/') {
  const clean = normalizePublicPath(pathname);
  if (clean === '/home') return PUBLIC_ROUTES[0];
  return PUBLIC_ROUTES.find((route) => route.path === clean || route.aliases?.includes(clean)) || null;
}

export function publicPageFromPathname(pathname = '/') {
  const route = routeDefinitionFromPathname(pathname);
  return route && !route.legal ? route.page : '';
}

export function legalPageFromPathname(pathname = '/') {
  const route = routeDefinitionFromPathname(pathname);
  return route?.legal ? route.page : '';
}

export function canonicalPathForPage(page = 'home') {
  return PUBLIC_ROUTES.find((route) => route.page === page)?.path || '/';
}

export function isKnownPublicPath(pathname = '/') {
  return Boolean(routeDefinitionFromPathname(pathname));
}

export function isReferralPath(pathname = '/') {
  return /^\/r\/ref\/[^/?#]+/i.test(normalizePublicPath(pathname));
}
