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
