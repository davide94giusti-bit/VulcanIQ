export const REVIEW_FILTER_OPTIONS = Object.freeze([
  { key: 'all', it: 'Tutte', en: 'All' },
  { key: 'google_reviews', it: 'Google', en: 'Google' },
  { key: 'website_reviews', it: 'Sito', en: 'Website' },
  { key: 'highest_rating', it: 'Valutazione più alta', en: 'Highest rating' },
  { key: 'lowest_rating', it: 'Valutazione più bassa', en: 'Lowest rating' }
]);

export const REVIEW_COPY = Object.freeze({
  it: {
    title: 'Recensioni di chi ha vissuto l’Etna con noi.',
    intro: '',
    publish: 'Pubblica una recensione',
    filter: 'Filtra',
    bookedBy: 'Prenotato da',
    name: 'Nome',
    date: 'Data',
    guide: 'Guida',
    close: 'Chiudi',
    openReview: 'Apri recensione',
    openGoogle: 'Apri il profilo Google',
    response: 'Risposta vulcanIQ',
    loading: 'Caricamento recensioni...',
    empty: 'Nessuna recensione pubblicata al momento.',
    leaveTitle: 'Pubblica una recensione',
    leaveIntro: 'Inserisci il codice prenotazione ricevuto dopo la conferma per pubblicare una recensione.',
    bookingCode: 'Codice prenotazione',
    reviewerName: 'Nome',
    rating: 'Valutazione',
    reviewText: 'Recensione',
    sending: 'Invio...',
    submitted: 'Recensione pubblicata. Grazie.',
    invalidCode: 'Codice non valido.',
    usedCode: 'Questo codice è già stato usato.',
    required: 'Compila tutti i campi obbligatori.',
    submitFailed: 'Recensione non inviata. Controlla il codice e riprova.',
    googleAttribution: 'Recensione da Google',
    translateReview: 'Traduci recensione',
    translateTo: 'Traduci in',
    translating: 'Traduzione...',
    showOriginal: 'Mostra originale',
    showTranslation: 'Mostra traduzione',
    automaticTranslation: 'Traduzione automatica',
    onDeviceTranslation: 'Traduzione automatica sul dispositivo',
    detectingLanguage: 'Rilevamento lingua...',
    downloadingTranslationModel: 'Download modello...',
    preparingTranslation: 'Preparazione...',
    translationFailed: 'Traduzione non disponibile. Riprova.',
    translationTargetRequired: 'Scegli una lingua.',
    translationBrowserUnsupported: 'Traduzione gratuita non disponibile in questo browser. La recensione originale resta visibile.',
    translationPairUnsupported: 'Questa coppia di lingue non è supportata dal browser.',
    translationSourceUnsupported: 'La lingua della recensione non è stata riconosciuta o non è supportata.',
    translationSameLanguage: 'La recensione è già nella lingua selezionata.',
    translationModelDownloadFailed: 'Il browser non è riuscito a scaricare il modello di traduzione.',
    translationTryAgain: 'Interagisci con la pagina e premi di nuovo Traduci.',
    translationInputTooLarge: 'Questa recensione è troppo lunga per il modello di traduzione del browser.'
  },
  en: {
    title: 'Reviews from people who experienced Etna with us.',
    intro: '',
    publish: 'Publish a review',
    filter: 'Filter',
    bookedBy: 'Booked by',
    name: 'Name',
    date: 'Date',
    guide: 'Guide',
    close: 'Close',
    openReview: 'Open review',
    openGoogle: 'Open Google Business Profile',
    response: 'vulcanIQ response',
    loading: 'Loading reviews...',
    empty: 'No published reviews yet.',
    leaveTitle: 'Publish a review',
    leaveIntro: 'Enter the booking code you received after confirmation to publish a review.',
    bookingCode: 'Booking code',
    reviewerName: 'Name',
    rating: 'Rating',
    reviewText: 'Review',
    sending: 'Sending...',
    submitted: 'Review published. Thank you.',
    invalidCode: 'Invalid code.',
    usedCode: 'This code has already been used.',
    required: 'Please complete all required fields.',
    submitFailed: 'Review not submitted. Check the code and try again.',
    googleAttribution: 'Review from Google',
    translateReview: 'Translate review',
    translateTo: 'Translate to',
    translating: 'Translating...',
    showOriginal: 'Show original',
    showTranslation: 'Show translation',
    automaticTranslation: 'Automatic translation',
    onDeviceTranslation: 'Automatic on-device translation',
    detectingLanguage: 'Detecting language...',
    downloadingTranslationModel: 'Downloading model...',
    preparingTranslation: 'Preparing...',
    translationFailed: 'Translation is unavailable. Please try again.',
    translationTargetRequired: 'Choose a language.',
    translationBrowserUnsupported: 'Free translation is not available in this browser. The original review remains available.',
    translationPairUnsupported: 'This language pair is not supported by this browser.',
    translationSourceUnsupported: 'The review language could not be detected or is not supported.',
    translationSameLanguage: 'The review is already in the selected language.',
    translationModelDownloadFailed: 'The browser could not download the translation model.',
    translationTryAgain: 'Interact with the page and press Translate again.',
    translationInputTooLarge: 'This review is too long for the browser translation model.'
  }
});

export function reviewCopy(lang = 'it') {
  return REVIEW_COPY[lang === 'en' ? 'en' : 'it'];
}

export function normalizeReviewText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function reviewSource(review = {}) {
  review = review && typeof review === 'object' ? review : {};
  const source = String(review.source || review.review_source || review.platform || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return source.includes('google') || review.provider === 'google_business_profile' ? 'google' : 'website';
}

export function reviewSourceLabel(review = {}, lang = 'it') {
  return reviewSource(review) === 'google' ? 'Google' : (lang === 'en' ? 'Website' : 'Sito');
}

export function reviewSortTimestamp(review = {}) {
  review = review && typeof review === 'object' ? review : {};
  const raw = review.review_date || review.experience_date || review.excursion_date || review.submitted_at || review.published_at || review.created_at || '';
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

export function reviewDate(review = {}, lang = 'it') {
  review = review && typeof review === 'object' ? review : {};
  const raw = review.review_date || review.experience_date || review.excursion_date || review.submitted_at || review.published_at || review.created_at;
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw).slice(0, 10) || '-';
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}


export function reviewRating(review = {}, fallback = 5) {
  review = review && typeof review === 'object' ? review : {};
  const value = Number(review.rating);
  const fallbackValue = Math.max(1, Math.min(5, Number(fallback) || 5));
  return Number.isFinite(value) && value > 0
    ? Math.max(1, Math.min(5, Math.round(value)))
    : fallbackValue;
}

export function reviewGuide(review = {}) {
  review = review && typeof review === 'object' ? review : {};
  const explicitGuide = String(review.guide_name || review.guide || review.owner_name || '').trim();
  if (explicitGuide) return explicitGuide;
  // Preserve the existing first-party production convention: native vulcanIQ
  // reviews are guided by Leonardo unless a future review record carries an
  // explicit guide. Google-provider cards never render this field.
  return reviewSource(review) === 'google' ? '' : 'Leonardo Chiavetta';
}

export function reviewBookedBy(review = {}, lang = 'it') {
  review = review && typeof review === 'object' ? review : {};
  return String(review.reviewer_name || review.customer_name || review.booked_by || '').trim() || (lang === 'en' ? 'Guest' : 'Ospite');
}

export function isLeonardoPlaceholderReview(review) {
  const reviewer = String(review?.reviewer_name || review?.customer_name || review?.booked_by || '').trim().toLowerCase();
  const date = String(review?.experience_date || review?.excursion_date || review?.submitted_at || review?.created_at || '').slice(0, 10);
  const guide = String(review?.guide_name || review?.guide || review?.owner_name || '').trim().toLowerCase();
  const body = String(review?.review_text || '').toLowerCase();
  const hasPlaceholderBody = body.includes('bellissima esperienza grazie alla nostra guida leonardo')
    || body.includes('beautiful experience thanks to our guide leonardo')
    || body.includes('percorso moderato, pause ben gestite')
    || body.includes('the route was moderate, breaks were well managed');
  return hasPlaceholderBody || (reviewer === 'leonardo' && date === '2025-01-01' && guide.includes('leonardo chiavetta'));
}

export function filterAndSortReviews(reviews = [], filterMode = 'all') {
  const visible = reviews.filter((review) => review && typeof review === 'object' && !isLeonardoPlaceholderReview(review));
  const filtered = visible.filter((review) => {
    if (filterMode === 'google_reviews') return reviewSource(review) === 'google';
    if (filterMode === 'website_reviews') return reviewSource(review) === 'website';
    return true;
  });
  return [...filtered].sort((a, b) => {
    if (filterMode === 'highest_rating') return Number(b.rating || -1) - Number(a.rating || -1) || reviewSortTimestamp(b) - reviewSortTimestamp(a);
    if (filterMode === 'lowest_rating') return Number(a.rating || 999) - Number(b.rating || 999) || reviewSortTimestamp(b) - reviewSortTimestamp(a);
    return reviewSortTimestamp(b) - reviewSortTimestamp(a);
  });
}

export function reviewFilterLabel(key, lang = 'it') {
  const option = REVIEW_FILTER_OPTIONS.find((item) => item.key === key) || REVIEW_FILTER_OPTIONS[0];
  return lang === 'en' ? option.en : option.it;
}
