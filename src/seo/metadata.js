export const SEO_META = Object.freeze({
  home: {
    it: ['vulcanIQ | Esperienze sull\'Etna con guida vulcanologica', 'Esperienze vulcanIQ sull\'Etna: natura, vulcani e racconti autentici con guida vulcanologica.'],
    en: ['vulcanIQ | Mount Etna experiences with a volcano guide', 'vulcanIQ Mount Etna experiences: nature, volcanoes and authentic stories with a volcanological guide.']
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
  },
  privacy: {
    it: ['Privacy Policy | vulcanIQ', 'Informativa privacy di vulcanIQ per sito, richieste, recensioni e analytics privacy-first.'],
    en: ['Privacy Policy | vulcanIQ', 'vulcanIQ privacy information for the website, requests, reviews, and privacy-first analytics.']
  },
  terms: {
    it: ['Termini e condizioni | vulcanIQ', 'Condizioni di utilizzo del sito e delle richieste per esperienze vulcanIQ.'],
    en: ['Terms and conditions | vulcanIQ', 'Terms governing use of the website and requests for vulcanIQ experiences.']
  },
  cookies: {
    it: ['Cookie Policy | vulcanIQ', 'Informazioni sui cookie e sulle tecnologie tecniche utilizzate dal sito vulcanIQ.'],
    en: ['Cookie Policy | vulcanIQ', 'Information about cookies and technical technologies used by the vulcanIQ website.']
  },
  notFound: {
    it: ['Pagina non trovata | vulcanIQ', 'La pagina richiesta non è disponibile. Torna alle esperienze vulcanIQ sull\'Etna.'],
    en: ['Page not found | vulcanIQ', 'The requested page is not available. Return to vulcanIQ Mount Etna experiences.']
  }
});

export function seoMetaFor(page = 'home', lang = 'it') {
  const safePage = SEO_META[page] ? page : 'notFound';
  const safeLang = lang === 'en' ? 'en' : 'it';
  const [title, description] = SEO_META[safePage][safeLang];
  return { page: safePage, lang: safeLang, title, description };
}
