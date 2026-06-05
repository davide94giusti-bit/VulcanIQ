export const experienceLabels = {
  'etna-premium': 'Etna Premium',
  'etna-learning': 'Etna Learning',
  'etna-live': 'Etna Live',
  'etna-stories': 'Etna Stories',
  'etna-family': 'Etna Family',
  'etna-sunset': 'Etna Sunset',
  unsure: { it: 'Non so', en: 'Not sure' }
};

const LANG_FIELDS = [
  'language',
  'preferredLanguage',
  'preferred_language',
  'locale',
  'customerLanguage',
  'customer_language',
  'requestLanguage',
  'request_language'
];

const NAME_FIELDS = [
  'name',
  'guestName',
  'guest_name',
  'customer_name',
  'customerName',
  'full_name',
  'fullName',
  'clientName',
  'client_name'
];

const EXPERIENCE_FIELDS = [
  'experience',
  'experienceName',
  'experience_name',
  'selectedExperience',
  'selected_experience',
  'experience_id',
  'experienceId'
];

const TITLE_FIELDS = [
  'title',
  'excursionTitle',
  'excursion_title',
  'fixedExcursionTitle',
  'fixed_excursion_title',
  'selectedExcursionTitle',
  'selected_excursion_title',
  'programTitle',
  'program_title',
  'eventTitle',
  'event_title'
];

const DATE_FIELDS = [
  'date',
  'requestedDate',
  'requested_date',
  'selectedDate',
  'selected_date',
  'bookingDate',
  'booking_date',
  'preferredDate',
  'preferred_date',
  'request_date'
];

const BOOKING_REFERENCE_FIELDS = [
  'bookingReference',
  'booking_reference',
  'bookingCode',
  'booking_code',
  'reviewCode',
  'review_code',
  'reference',
  'requestReference',
  'request_reference'
];

const IT_MONTHS = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre'
];

const EN_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function cleanText(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text || ['undefined', 'null', 'nan', 'invalid date'].includes(text.toLowerCase())) return '';
  return text;
}

function firstValue(source, fields) {
  if (!source) return '';
  for (const field of fields) {
    const value = cleanText(source[field]);
    if (value) return value;
  }
  return '';
}

function normalizeLang(value) {
  const clean = cleanText(value).toLowerCase().replace('_', '-');
  if (!clean) return '';
  if (['it', 'ita', 'it-it', 'italian', 'italiano', 'italiana'].includes(clean)) return 'it';
  if (['en', 'eng', 'en-us', 'en-gb', 'english', 'inglese'].includes(clean)) return 'en';
  if (clean.startsWith('it-')) return 'it';
  if (clean.startsWith('en-')) return 'en';
  return '';
}

export function requestLang(request, uiLang = 'it') {
  const requestLanguage = normalizeLang(firstValue(request, LANG_FIELDS));
  if (requestLanguage) return requestLanguage;
  return normalizeLang(uiLang) || 'it';
}

export function getExperienceLabel(id, lang = 'it') {
  const clean = cleanText(id);
  if (!clean) return lang === 'en' ? 'vulcanIQ experience' : 'Esperienza vulcanIQ';

  const normalized = clean.toLowerCase().replaceAll('_', '-').replaceAll(' ', '-');
  const label = experienceLabels[normalized] || experienceLabels[clean] || clean;
  if (typeof label === 'string') {
    return label
      .split('-')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .replace(/^Etna\s/, 'Etna ');
  }
  return label[lang] || label.it || (lang === 'en' ? 'vulcanIQ experience' : 'Esperienza vulcanIQ');
}

function parseDateParts(value) {
  const clean = cleanText(value);
  if (!clean) return null;

  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year, month, day };
  }

  const slashMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year, month, day };
  }

  const parsed = new Date(clean);
  if (!Number.isNaN(parsed.getTime())) {
    return { year: parsed.getFullYear(), month: parsed.getMonth() + 1, day: parsed.getDate() };
  }

  return null;
}

export function formatReplyDate(date, lang = 'it') {
  const parts = parseDateParts(date);
  if (!parts) return '';
  const months = lang === 'en' ? EN_MONTHS : IT_MONTHS;
  return `${parts.day} ${months[parts.month - 1]} ${parts.year}`;
}

function compactDateForCode(value) {
  const parts = parseDateParts(value);
  if (!parts) return '';
  return `${parts.year}${String(parts.month).padStart(2, '0')}${String(parts.day).padStart(2, '0')}`;
}

function stableSuffix(value) {
  const clean = cleanText(value);
  if (!clean) return '';
  let hash = 0;
  for (let index = 0; index < clean.length; index += 1) {
    hash = ((hash << 5) - hash + clean.charCodeAt(index)) >>> 0;
  }
  let suffix = '';
  for (let index = 0; index < 4; index += 1) {
    suffix += CODE_ALPHABET[hash % CODE_ALPHABET.length];
    hash = Math.floor(hash / CODE_ALPHABET.length) || (hash + index + 17);
  }
  return suffix;
}

function getFixedExcursionTitle(request, lang) {
  const fixed = request?.fixed_excursion || request?.fixedExcursion || request?.fixed_excursion_data || null;
  if (!fixed) return '';
  return firstValue(fixed, [
    `title_${lang}`,
    lang === 'it' ? 'title_en' : 'title_it',
    ...TITLE_FIELDS,
    'name',
    'label'
  ]);
}

function extractFixedTitleFromMessage(message) {
  const clean = cleanText(message);
  if (!clean) return '';
  const match = clean.match(/(?:escursione fissa|fixed excursion)\s+(.+?)\./i);
  if (!match?.[1]) return '';
  const label = match[1].trim();
  const parts = label.split(' · ').map((part) => part.trim()).filter(Boolean);
  return cleanText(parts[parts.length - 1] || label);
}

function requestExperienceName(request, lang) {
  const explicit = firstValue(request, EXPERIENCE_FIELDS);
  const fallback = lang === 'en' ? 'vulcanIQ experience' : 'Esperienza vulcanIQ';
  if (!explicit) return fallback;
  return getExperienceLabel(explicit, lang) || fallback;
}

function requestTitle(request, lang, experienceName) {
  const explicit = firstValue(request, TITLE_FIELDS);
  const fixedTitle = getFixedExcursionTitle(request, lang);
  const messageTitle = extractFixedTitleFromMessage(request?.message);
  return cleanText(explicit || fixedTitle || messageTitle || experienceName || (lang === 'en' ? 'vulcanIQ experience' : 'Esperienza vulcanIQ'));
}

function requestDate(request, lang) {
  const raw = firstValue(request, DATE_FIELDS);
  return formatReplyDate(raw, lang);
}

export function resolveBookingReference(request) {
  const existing = firstValue(request, BOOKING_REFERENCE_FIELDS);
  if (existing) return existing;

  const id = firstValue(request, ['id', 'requestId', 'request_id']);
  const datePart = compactDateForCode(firstValue(request, DATE_FIELDS)) || compactDateForCode(request?.created_at);
  const suffix = stableSuffix(`${id}|${datePart}`);
  if (!datePart || !suffix) return '';
  return `VUL-${datePart}-${suffix}`;
}

export function buildApprovalReply(request, uiLang = 'it') {
  const lang = requestLang(request, uiLang);
  const name = firstValue(request, NAME_FIELDS);
  const greeting = lang === 'en'
    ? `Hello${name ? ` ${name}` : ''},`
    : `Ciao${name ? ` ${name}` : ''},`;
  const experience = requestExperienceName(request, lang);
  const title = requestTitle(request, lang, experience);
  const date = requestDate(request, lang);
  const bookingReference = resolveBookingReference(request);

  if (lang === 'en') {
    return `${greeting}
thank you for your request.

We can confirm your vulcanIQ experience:
Experience: ${experience}
Title: ${title || 'vulcanIQ experience'}
Date: ${date || 'to be confirmed'}
Booking code for the review: ${bookingReference || 'to be confirmed'}

We will confirm the final details shortly, including time, meeting point, approximate duration, and recommended clothing.

See you soon,
vulcanIQ`;
  }

  return `${greeting}
grazie per la richiesta.

Possiamo confermare la tua esperienza vulcanIQ:
Esperienza: ${experience}
Title: ${title || 'Esperienza vulcanIQ'}
Data: ${date || 'da confermare'}
Codice prenotazione per la recensione: ${bookingReference || 'da confermare'}

Ti confermiamo a breve gli ultimi dettagli su orario, punto d’incontro, durata indicativa e abbigliamento consigliato.

A presto,
vulcanIQ`;
}

export function buildDeclineReply(request, uiLang = 'it') {
  const lang = requestLang(request, uiLang);
  const name = firstValue(request, NAME_FIELDS);
  const greeting = lang === 'en'
    ? `Hello${name ? ` ${name}` : ''},`
    : `Ciao${name ? ` ${name}` : ''},`;
  const experience = requestExperienceName(request, lang);
  const date = requestDate(request, lang) || (lang === 'en' ? 'to be confirmed' : 'da confermare');
  if (lang === 'en') {
    return `${greeting}
thank you for your request.

Unfortunately, the requested date is not available:
Experience: ${experience}
Date: ${date}

We can look at an alternative date depending on availability, weather, and Mount Etna conditions.

Thank you,
vulcanIQ`;
  }

  return `${greeting}
grazie per la richiesta.

Purtroppo la data richiesta non è disponibile:
Esperienza: ${experience}
Data: ${date}

Possiamo però valutare una data alternativa in base a disponibilità, meteo e condizioni dell’Etna.

Grazie,
vulcanIQ`;
}

export function replySubject(type, lang = 'it') {
  if (type === 'approval') {
    return lang === 'en' ? 'vulcanIQ experience confirmation' : 'Conferma esperienza vulcanIQ';
  }
  return lang === 'en' ? 'vulcanIQ experience request update' : 'Aggiornamento richiesta esperienza vulcanIQ';
}

export function normalizePhoneForWhatsApp(phone) {
  const clean = String(phone || '').trim();
  if (!clean) return '';
  if (clean.startsWith('+')) return clean.slice(1).replace(/\D/g, '');
  return clean.replace(/\D/g, '');
}

export function hasLikelyCountryCode(phone) {
  const clean = String(phone || '').trim();
  return clean.startsWith('+') || clean.replace(/\D/g, '').length > 10;
}
