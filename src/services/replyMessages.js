export const experienceLabels = {
  'etna-premium': 'Etna Premium',
  'etna-learning': 'Etna Learning',
  'etna-live': 'Etna Live',
  'etna-stories': 'Etna Stories',
  unsure: { it: 'Non so', en: 'Not sure' }
};

export function getExperienceLabel(id, lang = 'it') {
  const label = experienceLabels[id] || experienceLabels.unsure;
  return typeof label === 'string' ? label : label[lang] || label.it;
}

export function formatReplyDate(date) {
  if (!date) return '-';
  const [year, month, day] = String(date).split('-');
  if (!year || !month || !day) return date;
  return `${day}/${month}/${year}`;
}

export function requestLang(request) {
  return request?.language === 'en' ? 'en' : 'it';
}

<<<<<<< HEAD
export function buildApprovalReply(request) {
  const lang = requestLang(request);
  const name = request.customer_name || (lang === 'it' ? 'ciao' : 'there');
  const experience = getExperienceLabel(request.experience_id, lang);
  const date = formatReplyDate(request.requested_date);
  const bookingCodeLine = request.booking_code
    ? (lang === 'en' ? `Booking code for your review: ${request.booking_code}
` : `Codice prenotazione per la recensione: ${request.booking_code}
`)
    : '';
=======
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

function getFixedExcursionExperienceId(request) {
  const fixed = request?.fixed_excursion || request?.fixedExcursion || request?.fixed_excursion_data || null;
  return firstValue(fixed, ['experience_id', 'experienceId', 'experience', 'experience_name', 'experienceName']);
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
  const fixedExperience = request?.request_type === 'fixed' ? getFixedExcursionExperienceId(request) : '';
  const explicit = fixedExperience || firstValue(request, EXPERIENCE_FIELDS);
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
>>>>>>> d61f755 (Improve reviews fixed bookings admin replies and email formatting)

  if (lang === 'en') {
    return `Hi ${name},
thank you for your request.

We can confirm your vulcanIQ experience:
Experience: ${experience}
Date: ${date}
${bookingCodeLine}
We will shortly confirm the final details about time, meeting point, approximate duration, and clothing recommendations.

See you soon,
vulcanIQ`;
  }

  return `Ciao ${name},
grazie per la richiesta.

Possiamo confermare la tua esperienza vulcanIQ:
Esperienza: ${experience}
Data: ${date}
${bookingCodeLine}
Ti confermiamo a breve gli ultimi dettagli su orario, punto d’incontro, durata indicativa e abbigliamento consigliato.

A presto,
vulcanIQ`;
}

export function buildDeclineReply(request) {
  const lang = requestLang(request);
  const name = request.customer_name || (lang === 'it' ? 'ciao' : 'there');
  const experience = getExperienceLabel(request.experience_id, lang);
  const date = formatReplyDate(request.requested_date);
  if (lang === 'en') {
    return `Hi ${name},\nthank you for your request.\n\nUnfortunately, the requested date is not available:\nExperience: ${experience}\nDate: ${date}\n\nWe can look at an alternative date depending on availability, weather, and Mount Etna conditions.\n\nThank you,\nvulcanIQ`;
  }

  return `Ciao ${name},\ngrazie per la richiesta.\n\nPurtroppo la data richiesta non è disponibile:\nEsperienza: ${experience}\nData: ${date}\n\nPossiamo però valutare una data alternativa in base a disponibilità, meteo e condizioni dell’Etna.\n\nGrazie,\nvulcanIQ`;
}

export function replySubject(type, lang = 'it') {
  if (type === 'approval') {
    return lang === 'en' ? 'vulcanIQ experience request confirmation' : 'Conferma richiesta esperienza vulcanIQ';
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
