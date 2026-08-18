import { BRAND_NAME, SITE_CONTACT, SITE_MEDIA, SITE_ORIGIN, absoluteSiteUrl } from '../config/site.js';
import { canonicalPathForPage } from '../app/publicRoutes.js';
import { seoMetaFor } from './metadata.js';

function businessEntity() {
  return {
    '@type': 'LocalBusiness',
    '@id': `${SITE_ORIGIN}/#business`,
    name: BRAND_NAME,
    url: SITE_ORIGIN,
    logo: absoluteSiteUrl(SITE_MEDIA.logo),
    image: absoluteSiteUrl(SITE_MEDIA.ogImage),
    telephone: SITE_CONTACT.phoneE164,
    email: SITE_CONTACT.email,
    areaServed: {
      '@type': 'Place',
      name: 'Mount Etna, Sicily, Italy'
    },
    sameAs: [SITE_CONTACT.instagram]
  };
}

export function structuredDataFor(page = 'home', lang = 'it', canonical = SITE_ORIGIN) {
  if (page === 'notFound') return [];
  const { title, description } = seoMetaFor(page, lang);
  const business = businessEntity();
  const website = {
    '@type': 'WebSite',
    '@id': `${SITE_ORIGIN}/#website`,
    url: SITE_ORIGIN,
    name: BRAND_NAME,
    publisher: { '@id': `${SITE_ORIGIN}/#business` }
  };
  const webpage = {
    '@type': 'WebPage',
    '@id': `${canonical}#webpage`,
    url: canonical,
    name: title,
    description,
    inLanguage: lang === 'en' ? 'en' : 'it',
    isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
    about: { '@id': `${SITE_ORIGIN}/#business` }
  };
  const graph = [business, website, webpage];

  if (page !== 'home') {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: BRAND_NAME, item: SITE_ORIGIN },
        { '@type': 'ListItem', position: 2, name: title, item: canonical }
      ]
    });
  }

  if (page === 'experiences') {
    graph.push({
      '@type': 'TouristTrip',
      name: lang === 'it' ? 'Esperienze vulcanIQ sull\'Etna' : 'vulcanIQ Mount Etna experiences',
      description,
      touristType: ['families', 'couples', 'small groups'],
      provider: { '@id': `${SITE_ORIGIN}/#business` },
      itinerary: { '@type': 'Place', name: 'Mount Etna' },
      url: absoluteSiteUrl(canonicalPathForPage('experiences'))
    });
  }

  return [{ '@context': 'https://schema.org', '@graph': graph }];
}
