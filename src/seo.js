const SITE_URL = 'https://www.vulcaniq.com';
const BRAND_NAME = 'vulcanIQ';

const META = {
  home: {
    it: ['vulcanIQ | Esperienze sull\'Etna con guida vulcanologica', 'Esperienze vulcanIQ sull\'Etna: natura, vulcani e racconti autentici con guida vulcanologica.'],
    en: ['vulcanIQ | Mount Etna experiences with a volcano guide', 'vulcanIQ Mount Etna experiences: nature, volcanoes and authentic stories with a certified volcano guide.']
  },
  experiences: {
    it: ['Esperienze sull\'Etna | vulcanIQ', 'Scopri esperienze private, escursioni fisse e tour guidati sull\'Etna con vulcanIQ.'],
    en: ['Mount Etna experiences | vulcanIQ', 'Explore private experiences, fixed excursions and guided Mount Etna tours with vulcanIQ.']
  },
  contact: {
    it: ['Contatti vulcanIQ | Richiedi disponibilità', 'Contatta vulcanIQ via WhatsApp, telefono o email per verificare disponibilità, durata e consigli per l\'Etna.'],
    en: ['Contact vulcanIQ | Check availability', 'Contact vulcanIQ by WhatsApp, phone or email to check availability, duration and Etna clothing advice.']
  },
  about: {
    it: ['Chi siamo | vulcanIQ', 'Conosci vulcanIQ e l\'approccio alle esperienze vulcanologiche sull\'Etna.'],
    en: ['About us | vulcanIQ', 'Learn about vulcanIQ and its approach to volcano-guided experiences on Mount Etna.']
  },
  reviews: {
    it: ['Recensioni vulcanIQ | Esperienze Etna', 'Leggi le recensioni degli ospiti che hanno scelto vulcanIQ per vivere l\'Etna.'],
    en: ['vulcanIQ reviews | Etna experiences', 'Read guest reviews from people who chose vulcanIQ for Mount Etna experiences.']
  },
  partnerships: {
    it: ['Collaborazioni vulcanIQ | Partner locali', 'Scopri collaborazioni e partner locali collegati alle esperienze vulcanIQ.'],
    en: ['vulcanIQ collaborations | Local partners', 'Discover local collaborations and partners connected to vulcanIQ experiences.']
  },
  social: {
    it: ['Social vulcanIQ | Etna live', 'Segui vulcanIQ sui canali social e resta aggiornato sull\'Etna.'],
    en: ['vulcanIQ social | Etna live', 'Follow vulcanIQ on social channels and stay updated on Mount Etna.']
  },
  latestNews: {
    it: ['Ultime notizie Etna | vulcanIQ', 'Apri gli aggiornamenti live e le notizie esterne sull\'Etna.'],
    en: ['Latest Etna news | vulcanIQ', 'Open live updates and external news about Mount Etna.']
  },
  giftCard: {
    it: ['Gift card Etna | vulcanIQ', 'Richiedi una gift card vulcanIQ per regalare un\'esperienza sull\'Etna.'],
    en: ['Etna gift card | vulcanIQ', 'Request a vulcanIQ gift card to gift a Mount Etna experience.']
  }
};

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

function normalizedRoute(page, pathname) {
  if (page === 'home') return '/';
  if (page === 'latestNews') return '/latest-news';
  if (page === 'giftCard') return '/gift-card';
  if (['experiences', 'contact', 'about', 'reviews', 'partnerships', 'social'].includes(page)) return `/${page}`;
  const raw = String(pathname || '/').split('?')[0].replace(/\/+/g, '/');
  return raw || '/';
}

function jsonLdFor(page, lang, canonical) {
  const business = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: BRAND_NAME,
    url: SITE_URL,
    telephone: '+393349298246',
    areaServed: 'Mount Etna, Sicily, Italy',
    sameAs: ['https://www.instagram.com/leonardo_chiavetta']
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: BRAND_NAME, item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: META[page]?.[lang]?.[0] || BRAND_NAME, item: canonical }
    ]
  };
  if (page === 'experiences') {
    return [business, breadcrumb, {
      '@context': 'https://schema.org',
      '@type': 'TouristTrip',
      name: lang === 'it' ? 'Esperienze vulcanIQ sull\'Etna' : 'vulcanIQ Mount Etna experiences',
      touristType: ['families', 'couples', 'small groups'],
      provider: { '@type': 'LocalBusiness', name: BRAND_NAME, url: SITE_URL },
      itinerary: { '@type': 'Place', name: 'Mount Etna' }
    }];
  }
  return [business, breadcrumb];
}

export function applySeo({ page = 'home', lang = 'it', pathname = '/' } = {}) {
  if (typeof document === 'undefined') return;
  const safePage = META[page] ? page : 'home';
  const safeLang = lang === 'en' ? 'en' : 'it';
  const [title, description] = META[safePage][safeLang];
  const route = normalizedRoute(safePage, pathname);
  const canonical = `${SITE_URL}${route}`;

  document.documentElement.lang = safeLang;
  document.title = title;
  setMeta('description', description);
  setLink('canonical', canonical);
  setLink('alternate', `${SITE_URL}${route}?lang=it`, { hreflang: 'it' });
  setLink('alternate', `${SITE_URL}${route}?lang=en`, { hreflang: 'en' });
  setLink('alternate', canonical, { hreflang: 'x-default' });
  setProperty('og:title', title);
  setProperty('og:description', description);
  setProperty('og:url', canonical);
  setProperty('og:type', safePage === 'experiences' ? 'website' : 'website');

  const scriptId = 'vulcaniq-jsonld';
  let script = document.getElementById(scriptId);
  if (!script) {
    script = document.createElement('script');
    script.id = scriptId;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(jsonLdFor(safePage, safeLang, canonical));
}
