import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { blockedDates, defaultExperienceAvailability } from './data/availability.js';
import { isSupabaseConfigured } from './lib/supabaseClient.js';
import { getAdminAccess, signInOwner, signOutOwner } from './services/adminAuth.js';
import { createPublicBookingRequest, createManualBookingRequest, listBookingRequests, approveBookingRequest, declineBookingRequest } from './services/bookingRequests.js';
import { loadPublicAvailability, listAvailabilityBlocks, createAvailabilityBlock, updateAvailabilityBlock, deactivateAvailabilityBlock, defaultReason } from './services/availabilityService.js';
import { buildApprovalReply, buildDeclineReply, replySubject, normalizePhoneForWhatsApp, hasLikelyCountryCode } from './services/replyMessages.js';
import './styles.css';

const PHONE_DISPLAY = '+39 334 929 8246';
const PHONE_WA = '393349298246';
const PHONE_TEL = '+393349298246';
const EMAIL = 'leo97ct@yahoo.it';
const INSTAGRAM = 'https://www.instagram.com/leonardo_chiavetta?igsh=bnhkNWQzbnF2aW5m';

const i18n = {
  it: {
    languageLabel: 'Italiano',
    switchLabel: 'EN',
    nav: ['Esperienze', 'Disponibilità', 'Questionario', 'Sicurezza', 'Team', 'Contatti'],
    contact: 'Contatti',
    heroKicker: 'Etna · lento · sicuro · umano',
    heroTitle: "L'Etna non è solo uno scenario.",
    heroLead: 'Esperienze guidate e su misura per leggere il vulcano come territorio vivo: con conoscenza, sicurezza e relazione umana.',
    findExperience: "Trova l'esperienza giusta",
    viewAvailability: 'Guarda le disponibilità',
    call: 'Chiama Leonardo',
    whatsapp: 'Scrivici su WhatsApp',
    addContact: 'Aggiungi ai contatti',
    email: "Invia un'email",
    trust: ['Guida vulcanologica certificata', 'Esperienze su misura', 'Sicurezza e valutazione reale', 'Italiano e inglese'],
    philosophyKicker: 'Filosofia',
    philosophyTitle: 'Più breve da leggere, più semplice da scegliere.',
    philosophyText: 'vulcanIQ seleziona poche esperienze, chiare e modulabili. Il valore non è correre da un punto all’altro, ma capire dove ci si trova e perché quel luogo conta.',
    mission: 'Missione',
    missionText: 'Creare esperienze sull’Etna che uniscano conoscenza, sicurezza e relazione con il territorio, aiutando ogni ospite a leggere il vulcano non come semplice scenario, ma come ambiente vivo, complesso e identitario.',
    vision: 'Visione',
    visionText: 'Diventare un riferimento per un turismo etneo più consapevole, umano e misurato: meno consumo del luogo, più comprensione, rispetto e memoria dell’esperienza.',
    readMore: 'Leggi di più',
    hide: 'Riduci',
    experiencesKicker: 'Esperienze',
    experiencesTitle: 'Quattro modi per vivere l’Etna, senza format turistici standard.',
    experiencesIntro: 'Apri una scheda alla volta: ogni esperienza include ritmo, valore, note pratiche e messaggio pronto da inviare.',
    bestFor: 'Ideale per',
    starting: 'Indicazione',
    value: 'Valore',
    practical: 'Note pratiche',
    safety: 'Sicurezza',
    details: 'Dettagli',
    request: 'Richiedi',
    useInForm: 'Usa nel modulo',
    emailOptions: 'Opzioni email',
    defaultEmail: 'Apri app email predefinita',
    openGmail: 'Apri Gmail nel browser',
    copyEmail: 'Copia indirizzo email',
    copyMessage: 'Copia messaggio',
    continueForm: 'Continua con il modulo',
    close: 'Chiudi',
    copied: 'Copiato',
    availabilityKicker: 'Disponibilità',
    availabilityTitle: 'Calendario indicativo con date bloccate e disponibilità limitata.',
    availabilityIntro: 'Le disponibilità sono indicative e possono cambiare in base a meteo, ordinanze, condizioni vulcaniche e valutazione della guida.',
    previousMonth: 'Mese precedente',
    nextMonth: 'Mese successivo',
    chooseExperience: 'Esperienza',
    available: 'Disponibile',
    limited: 'Limitata',
    closed: 'Chiusa',
    onRequest: 'Su richiesta',
    dateClosed: 'Questa data non è disponibile. Puoi richiedere una data alternativa.',
    requestDate: 'Richiedi questa data',
    requestAlternative: 'Richiedi alternativa',
    questionnaireKicker: 'Questionario',
    questionnaireTitle: 'Ricevi una raccomandazione utile, non generica.',
    questionnaireIntro: 'Rispondi a poche domande: otterrai esperienza consigliata, alternativa e messaggio pronto per Leonardo.',
    travelingWith: 'Viaggio con',
    interest: 'Interesse principale',
    pace: 'Ritmo preferito',
    private: 'Esperienza privata',
    children: 'Bambini nel gruppo',
    yes: 'Sì',
    no: 'No',
    generate: 'Genera raccomandazione',
    recommended: 'Esperienza consigliata',
    alternative: 'Alternativa',
    reason: 'Motivo',
    preparedMessage: 'Messaggio suggerito',
    useThisForm: 'Usa questo nel modulo',
    requestThis: 'Richiedi questa esperienza',
    childNote: 'Nota: con bambini sotto i 3 anni il percorso deve essere valutato con particolare attenzione dalla guida.',
    wearKicker: 'Abbigliamento',
    wearTitle: 'Cosa indossare sull’Etna.',
    wearIntro: 'Indicazioni sintetiche: la conferma finale dipende da stagione, quota e condizioni del giorno.',
    reviewsKicker: 'Recensioni',
    reviewsTitle: 'Spazio pronto per recensioni reali.',
    reviewsIntro: 'Usa testi brevi, verificabili e coerenti con un posizionamento premium e umano.',
    safetyKicker: 'Sicurezza',
    safetyTitle: 'Condizioni, prudenza e valutazione reale.',
    safetyIntro: 'Ogni esperienza è confermata solo se meteo, accessibilità, ordinanze e attività vulcanica lo permettono.',
    teamKicker: 'Team',
    teamTitle: 'Un progetto piccolo, curato e umano.',
    leonardoRole: 'Guida vulcanologica certificata',
    leonardoBio: 'Accompagna gli ospiti nella lettura del territorio etneo, con attenzione a sicurezza, condizioni reali e qualità dell’esperienza.',
    coFounderName: 'Co-owner vulcanIQ',
    coFounderRole: 'Co-owner',
    coFounderBio: 'Profilo del secondo owner da completare. I dettagli pubblici saranno aggiunti quando confermati.',
    coFounderAlt: 'Profilo del co-owner vulcanIQ',
    finalTitle: 'Parla con Leonardo prima di scegliere.',
    finalText: 'Racconta date, interessi e composizione del gruppo: riceverai una proposta realistica, non un pacchetto standard.',
    formKicker: 'Modulo contatto',
    formTitle: 'Prepara la richiesta.',
    formIntro: 'Il sito non invia messaggi silenziosamente: usa WhatsApp, email, copia o modulo come traccia.',
    submitRequest: 'Invia richiesta',
    requestSent: 'La tua richiesta è stata inviata. Leonardo o il team vulcanIQ ti risponderà direttamente.',
    requestFallbackError: 'Non siamo riusciti a salvare la richiesta automaticamente. Puoi contattarci su WhatsApp o email.',
    contactRequired: 'Inserisci almeno telefono o email.',
    requestDetailsRequired: 'Inserisci un messaggio oppure seleziona esperienza o data.',
    phone: 'Telefono / WhatsApp',
    contactEmail: 'Email',
    preferredContact: 'Contatto preferito',
    requestedDate: 'Data richiesta',
    alternativeDate: 'Data alternativa',
    adults: 'Adulti',
    childrenCount: 'Bambini',
    childrenUnder3: 'Bambini sotto i 3 anni',
    privateExperience: 'Esperienza privata',
    name: 'Nome',
    preferredLanguage: 'Lingua preferita',
    selectedExperience: 'Esperienza selezionata',
    message: 'Messaggio',
    sendWhatsapp: 'Invia su WhatsApp',
    sendEmail: 'Email',
    selectExperience: 'Seleziona esperienza',
    instagram: 'Seguici su Instagram',
    footerText: 'Esperienze sull’Etna con conoscenza, sicurezza e relazione con il territorio.',
    realPhotoPlaceholder: 'Real Etna photo placeholder',
    replaceWith: 'Replace with',
    heroAlt: 'Escursione guidata sull’Etna durante attività vulcanica osservata da distanza sicura',
    liveAlt: 'Gruppo con guida vulcanologica osserva l’attività dell’Etna da terreno lavico sicuro',
    safetyAlt: 'Paesaggio vulcanico dell’Etna con terreno lavico e condizioni controllate',
    gallery01Alt: 'Dettaglio di roccia lavica nera sull’Etna',
    gallery02Alt: 'Sentiero vulcanico etneo con guida a distanza sicura',
    gallery03Alt: 'Paesaggio dell’Etna con luce naturale e terreno lavico',
    emailSubject: 'Richiesta esperienza vulcanIQ sull’Etna',
    defaultMessage: 'Ciao Leonardo,\nvorrei informazioni su un’esperienza vulcanIQ sull’Etna.\n\nVorrei sapere disponibilità, durata indicativa, prezzo e consigli sull’abbigliamento.\n\nGrazie.'
  },
  en: {
    languageLabel: 'English',
    switchLabel: 'IT',
    nav: ['Experiences', 'Availability', 'Questionnaire', 'Safety', 'Team', 'Contact'],
    contact: 'Contact',
    heroKicker: 'Etna · slow · safe · human',
    heroTitle: 'Mount Etna is not just a backdrop.',
    heroLead: 'Tailored guided experiences that help guests read the volcano as a living territory: with knowledge, safety, and human connection.',
    findExperience: 'Find the right experience',
    viewAvailability: 'View availability',
    call: 'Call Leonardo',
    whatsapp: 'Message on WhatsApp',
    addContact: 'Add to contacts',
    email: 'Send an email',
    trust: ['Certified volcanological guide', 'Tailored experiences', 'Safety and real assessment', 'Italian and English'],
    philosophyKicker: 'Philosophy',
    philosophyTitle: 'Shorter to read, simpler to choose.',
    philosophyText: 'vulcanIQ selects a few clear, adaptable experiences. The value is not moving fast from one stop to another, but understanding where you are and why that place matters.',
    mission: 'Mission',
    missionText: 'To create Mount Etna experiences that combine knowledge, safety, and connection with the territory, helping each guest understand the volcano not as a simple backdrop, but as a living, complex, and identity-shaping environment.',
    vision: 'Vision',
    visionText: 'To become a reference point for a more conscious, human, and measured way of experiencing Etna: less consumption of place, more understanding, respect, and lasting memory.',
    readMore: 'Read more',
    hide: 'Collapse',
    experiencesKicker: 'Experiences',
    experiencesTitle: 'Four ways to experience Etna without standard tour formats.',
    experiencesIntro: 'Open one card at a time: each experience includes pace, value, practical notes, and a ready-to-send message.',
    bestFor: 'Best for',
    starting: 'Starting point',
    value: 'Value',
    practical: 'Practical notes',
    safety: 'Safety',
    details: 'Details',
    request: 'Request',
    useInForm: 'Use in form',
    emailOptions: 'Email options',
    defaultEmail: 'Open default email app',
    openGmail: 'Open Gmail in browser',
    copyEmail: 'Copy email address',
    copyMessage: 'Copy prepared message',
    continueForm: 'Continue with contact form',
    close: 'Close',
    copied: 'Copied',
    availabilityKicker: 'Availability',
    availabilityTitle: 'Indicative calendar with blocked dates and limited availability.',
    availabilityIntro: 'Availability is indicative and may change depending on weather, official regulations, volcanic conditions, and guide assessment.',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    chooseExperience: 'Experience',
    available: 'Available',
    limited: 'Limited',
    closed: 'Closed',
    onRequest: 'On request',
    dateClosed: 'This date is not available. You can request an alternative date.',
    requestDate: 'Request this date',
    requestAlternative: 'Request alternative',
    questionnaireKicker: 'Questionnaire',
    questionnaireTitle: 'Get a useful recommendation, not a generic one.',
    questionnaireIntro: 'Answer a few questions: you will get a recommended experience, an alternative, and a ready message for Leonardo.',
    travelingWith: 'Traveling with',
    interest: 'Main interest',
    pace: 'Preferred pace',
    private: 'Private experience',
    children: 'Children in the group',
    yes: 'Yes',
    no: 'No',
    generate: 'Generate recommendation',
    recommended: 'Recommended experience',
    alternative: 'Alternative',
    reason: 'Reason',
    preparedMessage: 'Suggested message',
    useThisForm: 'Use this in the form',
    requestThis: 'Request this experience',
    childNote: 'Note: with children under 3, the route must be evaluated carefully by the guide.',
    wearKicker: 'Clothing',
    wearTitle: 'What to wear on Etna.',
    wearIntro: 'Concise guidance: final advice depends on season, altitude, and conditions on the day.',
    reviewsKicker: 'Reviews',
    reviewsTitle: 'Space ready for real reviews.',
    reviewsIntro: 'Use short, verifiable copy aligned with a premium and human positioning.',
    safetyKicker: 'Safety',
    safetyTitle: 'Conditions, prudence, and real assessment.',
    safetyIntro: 'Every experience is confirmed only if weather, access, regulations, and volcanic activity allow it.',
    teamKicker: 'Team',
    teamTitle: 'A small, curated, human project.',
    leonardoRole: 'Certified volcanological guide',
    leonardoBio: 'He guides guests in reading the Etna territory, with attention to safety, real conditions, and the quality of the experience.',
    coFounderName: 'vulcanIQ Co-owner',
    coFounderRole: 'Co-owner',
    coFounderBio: 'Second owner profile to be completed. Public details will be added when confirmed.',
    coFounderAlt: 'vulcanIQ co-owner profile',
    finalTitle: 'Talk to Leonardo before choosing.',
    finalText: 'Share dates, interests, and group composition: you will receive a realistic proposal, not a standard package.',
    formKicker: 'Contact form',
    formTitle: 'Prepare your request.',
    formIntro: 'The site does not send messages silently: use WhatsApp, email, copy, or the form as a clear brief.',
    submitRequest: 'Submit request',
    requestSent: 'Your request has been sent. Leonardo or the vulcanIQ team will reply directly.',
    requestFallbackError: 'We could not save the request automatically. You can contact us by WhatsApp or email.',
    contactRequired: 'Enter at least phone or email.',
    requestDetailsRequired: 'Enter a message or select an experience or date.',
    phone: 'Phone / WhatsApp',
    contactEmail: 'Email',
    preferredContact: 'Preferred contact',
    requestedDate: 'Requested date',
    alternativeDate: 'Alternative date',
    adults: 'Adults',
    childrenCount: 'Children',
    childrenUnder3: 'Children under 3',
    privateExperience: 'Private experience',
    name: 'Name',
    preferredLanguage: 'Preferred language',
    selectedExperience: 'Selected experience',
    message: 'Message',
    sendWhatsapp: 'Send on WhatsApp',
    sendEmail: 'Email',
    selectExperience: 'Select experience',
    instagram: 'Follow on Instagram',
    footerText: 'Mount Etna experiences with knowledge, safety, and connection with the territory.',
    realPhotoPlaceholder: 'Real Etna photo placeholder',
    replaceWith: 'Replace with',
    heroAlt: 'Guided Mount Etna excursion during volcanic activity observed from a safe distance',
    liveAlt: 'Group with volcanological guide observing Etna activity from safe lava terrain',
    safetyAlt: 'Mount Etna volcanic landscape with lava terrain and controlled conditions',
    gallery01Alt: 'Black lava rock detail on Mount Etna',
    gallery02Alt: 'Etna volcanic trail with guide at a safe distance',
    gallery03Alt: 'Mount Etna landscape with natural light and lava terrain',
    emailSubject: 'vulcanIQ Mount Etna experience request',
    defaultMessage: 'Hi Leonardo,\nI would like more information about a vulcanIQ experience on Mount Etna.\n\nI would like to know availability, approximate duration, price, and clothing recommendations.\n\nThank you.'
  }
};

const experiences = [
  {
    id: 'etna-premium',
    title: 'Etna Premium',
    summary: {
      it: 'Percorso privato, curato e modulato sul ritmo del gruppo.',
      en: 'Private, curated experience adapted to the group’s pace.'
    },
    bestFor: { it: 'coppie, piccoli gruppi, ospiti che cercano esclusività', en: 'couples, small groups, guests looking for exclusivity' },
    starting: { it: 'su richiesta', en: 'on request' },
    description: {
      it: 'Un’esperienza lenta, riservata e personalizzata per vivere l’Etna con più cura, più tempo e una relazione diretta con la guida.',
      en: 'A slow, private, tailored experience to explore Etna with more care, more time, and direct guide attention.'
    },
    value: { it: 'Contenuto geologico chiaro, ritmo confortevole, attenzione alle esigenze individuali.', en: 'Clear geological insight, comfortable pace, and attention to individual needs.' },
    notes: { it: 'Durata, quota e percorso vengono definiti dopo una breve valutazione del gruppo.', en: 'Duration, altitude, and route are defined after a brief group assessment.' },
    safety: { it: 'La guida valuta meteo, ordinanze e condizioni vulcaniche prima della conferma.', en: 'The guide assesses weather, regulations, and volcanic conditions before confirmation.' },
    reason: { it: 'cerco un percorso privato, curato e adatto al mio ritmo', en: 'I am looking for a private, curated experience suited to my pace' }
  },
  {
    id: 'etna-learning',
    title: 'Etna Learning',
    summary: {
      it: 'Esperienze educative per famiglie, scuole, aziende e gruppi.',
      en: 'Educational experiences for families, schools, companies, and groups.'
    },
    bestFor: { it: 'famiglie, scuole, team aziendali, gruppi curiosi', en: 'families, schools, company teams, curious groups' },
    starting: { it: 'da definire in base al gruppo', en: 'defined around the group' },
    description: {
      it: 'Un formato didattico e coinvolgente per capire l’Etna attraverso osservazione, racconto, domande e lettura del paesaggio.',
      en: 'An educational, engaging format to understand Etna through observation, storytelling, questions, and landscape reading.'
    },
    value: { it: 'Trasforma l’escursione in apprendimento concreto, accessibile e memorabile.', en: 'Turns the excursion into concrete, accessible, memorable learning.' },
    notes: { it: 'Possibili declinazioni per famiglia, scuola o azienda.', en: 'Can be adapted for family, school, or company contexts.' },
    safety: { it: 'I percorsi sono scelti in base a età, mobilità e condizioni del giorno.', en: 'Routes are chosen based on age, mobility, and daily conditions.' },
    reason: { it: 'voglio un’esperienza educativa, chiara e adatta al gruppo', en: 'I want an educational, clear experience suitable for the group' }
  },
  {
    id: 'etna-live',
    title: 'Etna Live',
    summary: {
      it: 'Osservazione responsabile dell’attività vulcanica da distanza sicura.',
      en: 'Responsible observation of volcanic activity from a safe distance.'
    },
    bestFor: { it: 'appassionati di vulcani, fotografi, ospiti flessibili', en: 'volcano enthusiasts, photographers, flexible guests' },
    starting: { it: 'su richiesta e condizioni', en: 'on request and conditions-based' },
    description: {
      it: 'Quando l’Etna lo consente, l’esperienza si concentra sull’osservazione interpretata dell’attività vulcanica, sempre con prudenza.',
      en: 'When Etna allows it, the experience focuses on interpreted observation of volcanic activity, always with prudence.'
    },
    value: { it: 'Capire ciò che si osserva, non inseguire lo spettacolo.', en: 'Understanding what is being observed, not chasing spectacle.' },
    notes: { it: 'Serve flessibilità: l’itinerario può cambiare fino all’ultimo in base alle condizioni.', en: 'Flexibility is required: the route may change up to the last moment based on conditions.' },
    safety: { it: 'Nessun avvicinamento non sicuro, nessuna promessa di eruzione visibile.', en: 'No unsafe proximity, no promise of visible eruption.' },
    reason: { it: 'mi interessa l’attività vulcanica osservata in modo responsabile', en: 'I am interested in volcanic activity observed responsibly' }
  },
  {
    id: 'etna-stories',
    title: 'Etna Stories',
    summary: {
      it: 'Paesaggio, cultura locale, memoria e possibili incontri territoriali.',
      en: 'Landscape, local culture, memory, and possible territorial encounters.'
    },
    bestFor: { it: 'viaggiatori curiosi, food lovers, gruppi che cercano racconto', en: 'curious travelers, food lovers, groups seeking storytelling' },
    starting: { it: 'su richiesta', en: 'on request' },
    description: {
      it: 'Un modo più narrativo e territoriale di vivere l’Etna: rocce, paesaggi, storie umane, cultura materiale e luoghi identitari.',
      en: 'A more narrative and territorial way to experience Etna: rocks, landscapes, human stories, material culture, and identity places.'
    },
    value: { it: 'Connette vulcano, persone e memoria del luogo.', en: 'Connects volcano, people, and memory of place.' },
    notes: { it: 'Può includere soste culturali, contesti locali o piccoli momenti esperienziali.', en: 'May include cultural stops, local contexts, or small experiential moments.' },
    safety: { it: 'Ritmo e percorso restano compatibili con condizioni e composizione del gruppo.', en: 'Pace and route remain compatible with conditions and group composition.' },
    reason: { it: 'cerco cultura locale, racconto e relazione con il territorio', en: 'I am looking for local culture, storytelling, and connection with the territory' }
  }
];

const questionnaireOptions = {
  travelingWith: [
    { value: 'couple-small', it: 'Coppia / piccolo gruppo', en: 'Couple / small group' },
    { value: 'family', it: 'Famiglia', en: 'Family' },
    { value: 'school', it: 'Gruppo scolastico', en: 'School group' },
    { value: 'company', it: 'Azienda / team', en: 'Company / team' }
  ],
  interest: [
    { value: 'private-exclusive', it: 'Esperienza privata ed esclusiva', en: 'Exclusive private experience' },
    { value: 'volcanic-activity', it: 'Attività vulcanica', en: 'Volcanic activity' },
    { value: 'local-culture', it: 'Cultura locale, cibo o workshop', en: 'Local culture, food, or workshops' },
    { value: 'learning', it: 'Apprendimento e contenuto educativo', en: 'Learning and educational content' }
  ],
  pace: [
    { value: 'slow-comfortable', it: 'Lento e confortevole', en: 'Slow and comfortable' },
    { value: 'balanced', it: 'Bilanciato', en: 'Balanced' },
    { value: 'active', it: 'Più attivo', en: 'More active' }
  ],
  private: [
    { value: 'yes', it: 'Sì', en: 'Yes' },
    { value: 'no', it: 'No', en: 'No' }
  ],
  children: [
    { value: 'no', it: 'No', en: 'No' },
    { value: 'yes', it: 'Sì', en: 'Yes' },
    { value: 'under3', it: 'Sì, sotto i 3 anni', en: 'Yes, under 3' }
  ]
};

const statusLabels = {
  available: { it: 'Disponibile', en: 'Available' },
  limited: { it: 'Disponibilità limitata', en: 'Limited availability' },
  closed: { it: 'Non disponibile', en: 'Closed' },
  'on-request': { it: 'Su richiesta', en: 'On request' }
};

function encode(value) {
  return encodeURIComponent(value || '');
}

function text(lang, key) {
  return i18n[lang][key];
}

function experienceById(id) {
  return experiences.find((experience) => experience.id === id) || experiences[0];
}

function optionLabel(group, value, lang) {
  const option = questionnaireOptions[group].find((item) => item.value === value);
  return option ? option[lang] : value;
}

function formatDateForMessage(date, lang) {
  if (!date) return '';
  const [year, month, day] = date.split('-');
  return lang === 'it' ? `${day}/${month}/${year}` : `${day}/${month}/${year}`;
}

function buildExperienceMessage(experience, lang) {
  if (lang === 'it') {
    return `Ciao Leonardo,\nvorrei informazioni su ${experience.title}.\n\nMi interessa questa esperienza perché ${experience.reason.it}.\n\nVorrei sapere disponibilità, durata, prezzo indicativo e cosa indossare.\n\nGrazie.`;
  }
  return `Hi Leonardo,\nI would like more information about ${experience.title}.\n\nI am interested in this experience because ${experience.reason.en}.\n\nI would like to know availability, approximate duration, price, and what to wear.\n\nThank you.`;
}

function buildQuestionnaireMessage(result, lang) {
  const details = result.details;
  if (lang === 'it') {
    return `Ciao Leonardo,\nvorrei informazioni su un’esperienza vulcanIQ sull’Etna.\n\nEsperienza consigliata: ${result.recommended.title}\nAlternativa: ${result.alternative.title}\n\nDettagli:\n- Viaggio con: ${details.travelingWith}\n- Interesse principale: ${details.interest}\n- Ritmo preferito: ${details.pace}\n- Esperienza privata: ${details.private}\n- Bambini nel gruppo: ${details.children}\n\nVorrei sapere disponibilità, durata indicativa, prezzo e consigli sull’abbigliamento.\n\nGrazie.`;
  }
  return `Hi Leonardo,\nI would like more information about a vulcanIQ experience on Mount Etna.\n\nRecommended experience: ${result.recommended.title}\nAlternative: ${result.alternative.title}\n\nDetails:\n- Traveling with: ${details.travelingWith}\n- Main interest: ${details.interest}\n- Preferred pace: ${details.pace}\n- Private experience: ${details.private}\n- Children in the group: ${details.children}\n\nI would like to know availability, approximate duration, price, and clothing recommendations.\n\nThank you.`;
}

function buildCalendarMessage({ experience, date, status, note }, lang) {
  const dateText = formatDateForMessage(date, lang);
  const statusText = statusLabels[status]?.[lang] || status;
  const noteText = note || (lang === 'it' ? 'In base alle condizioni.' : 'Depending on conditions.');
  if (lang === 'it') {
    return `Ciao Leonardo,\nvorrei informazioni su ${experience.title} per il giorno ${dateText}.\n\nHo visto questa disponibilità sul calendario vulcanIQ:\nStato: ${statusText}\nNota: ${noteText}\n\nVorrei sapere se la data è confermabile e quali sono le condizioni previste.\n\nGrazie.`;
  }
  return `Hi Leonardo,\nI would like information about ${experience.title} for ${dateText}.\n\nI saw this availability on the vulcanIQ calendar:\nStatus: ${statusText}\nNote: ${noteText}\n\nI would like to know whether the date can be confirmed and what conditions are expected.\n\nThank you.`;
}

async function copyText(value) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function downloadVCard() {
  const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:Leonardo Chiavetta\nN:Chiavetta;Leonardo;;;\nTEL;TYPE=CELL:+393349298246\nEMAIL:leo97ct@yahoo.it\nORG:vulcanIQ\nTITLE:Certified volcanological guide\nEND:VCARD`;
  const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'leonardo-chiavetta-vulcaniq.vcf';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function Icon({ name }) {
  const paths = {
    phone: 'M6.6 10.8c1.5 3 3.9 5.4 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.3 1.3.4 2.6.6 4 .6.7 0 1.2.5 1.2 1.2v3.5c0 .7-.5 1.2-1.2 1.2C10.2 22 2 13.8 2 3.4 2 2.7 2.5 2.2 3.2 2.2h3.5c.7 0 1.2.5 1.2 1.2 0 1.4.2 2.8.6 4 .1.4 0 .9-.3 1.2l-1.6 2.2z',
    chat: 'M4 5.5C4 3.6 5.6 2 7.5 2h9C18.4 2 20 3.6 20 5.5v6c0 1.9-1.6 3.5-3.5 3.5H10l-4.4 4.1c-.6.5-1.6.1-1.6-.7V5.5z',
    user: 'M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-3.3 0-6 1.7-6 3.8V20h12v-2.2c0-2.1-2.7-3.8-6-3.8z',
    mail: 'M3 5h18v14H3V5zm2 2v.4l7 4.4 7-4.4V7H5zm14 10V9.8l-7 4.4-7-4.4V17h14z',
    insta: 'M7 2h10c2.8 0 5 2.2 5 5v10c0 2.8-2.2 5-5 5H7c-2.8 0-5-2.2-5-5V7c0-2.8 2.2-5 5-5zm5 5.2A4.8 4.8 0 1 0 12 16.8 4.8 4.8 0 0 0 12 7.2zm0 2A2.8 2.8 0 1 1 12 14.8 2.8 2.8 0 0 1 12 9.2zM17.6 6a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z'
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false" className="icon">
      <path d={paths[name]} />
    </svg>
  );
}

function EmailPanel({ lang, message, subject, onClose, onUseForm }) {
  const [copied, setCopied] = useState('');
  const mailto = `mailto:${EMAIL}?subject=${encode(subject)}&body=${encode(message)}`;
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encode(EMAIL)}&su=${encode(subject)}&body=${encode(message)}`;

  async function handleCopy(kind, value) {
    await copyText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(''), 1600);
  }

  return (
    <div className="email-popover" role="dialog" aria-modal="false" aria-label={text(lang, 'emailOptions')}>
      <div className="email-popover-header">
        <strong>{text(lang, 'emailOptions')}</strong>
        <button type="button" className="icon-button" onClick={onClose} aria-label={text(lang, 'close')}>×</button>
      </div>
      <a className="email-option" href={mailto}>{text(lang, 'defaultEmail')}</a>
      <a className="email-option" href={gmail} target="_blank" rel="noopener noreferrer">{text(lang, 'openGmail')}</a>
      <button type="button" className="email-option" onClick={() => handleCopy('email', EMAIL)}>{text(lang, 'copyEmail')} {copied === 'email' ? `· ${text(lang, 'copied')}` : ''}</button>
      <button type="button" className="email-option" onClick={() => handleCopy('message', message)}>{text(lang, 'copyMessage')} {copied === 'message' ? `· ${text(lang, 'copied')}` : ''}</button>
      {onUseForm && <button type="button" className="email-option" onClick={onUseForm}>{text(lang, 'continueForm')}</button>}
    </div>
  );
}

function ContactActions({ lang, contextMessage, compact = false, onUseForm, experienceId }) {
  const [emailOpen, setEmailOpen] = useState(false);
  const message = contextMessage || text(lang, 'defaultMessage');
  const subject = text(lang, 'emailSubject');
  const whatsappUrl = `https://wa.me/${PHONE_WA}?text=${encode(message)}`;
  const className = compact ? 'contact-actions compact' : 'contact-actions';

  return (
    <div className={className} data-experience={experienceId || undefined}>
      <a className="pill-action" href={`tel:${PHONE_TEL}`}><Icon name="phone" />{text(lang, 'call')}</a>
      <a className="pill-action" href={whatsappUrl} target="_blank" rel="noopener noreferrer"><Icon name="chat" />{text(lang, 'whatsapp')}</a>
      <button type="button" className="pill-action" onClick={downloadVCard}><Icon name="user" />{text(lang, 'addContact')}</button>
      <div className="email-action-wrap">
        <button type="button" className="pill-action" onClick={() => setEmailOpen((open) => !open)} aria-expanded={emailOpen}><Icon name="mail" />{text(lang, 'email')}</button>
        {emailOpen && (
          <EmailPanel
            lang={lang}
            message={message}
            subject={subject}
            onClose={() => setEmailOpen(false)}
            onUseForm={onUseForm}
          />
        )}
      </div>
    </div>
  );
}

function ImageSlot({ src, alt, label, lang, ratio = 'wide', className = '' }) {
  const [missing, setMissing] = useState(false);
  return (
    <figure className={`image-slot ${ratio} ${missing ? 'is-missing' : ''} ${className}`.trim()}>
      {!missing && <img src={src} alt={alt} onError={() => setMissing(true)} />}
      {missing && (
        <div className="image-placeholder" aria-label={`${text(lang, 'realPhotoPlaceholder')}: ${src}`}>
          <strong>{text(lang, 'realPhotoPlaceholder')}</strong>
          <span>{text(lang, 'replaceWith')} {src}</span>
        </div>
      )}
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}

function Header({ lang, setLang }) {
  const [open, setOpen] = useState(false);
  const anchors = ['experiences', 'availability', 'questionnaire', 'safety', 'team', 'contact'];
  return (
    <header className="site-header">
      <div className="container nav-shell">
        <a className="brand" href="#top" aria-label="vulcanIQ home">
          <span className="brand-mark" aria-hidden="true">▵</span>
          <span><strong>vulcanIQ</strong><small>Etna experiences</small></span>
        </a>
        <button className="nav-toggle" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="site-nav">Menu</button>
        <nav id="site-nav" className={`nav-links ${open ? 'open' : ''}`} aria-label="Primary navigation">
          {anchors.map((anchor, index) => (
            <a key={anchor} href={`#${anchor}`} onClick={() => setOpen(false)}>{i18n[lang].nav[index]}</a>
          ))}
          <button className="language-toggle" type="button" onClick={() => setLang(lang === 'it' ? 'en' : 'it')} aria-label="Switch language">{i18n[lang].switchLabel}</button>
          <a className="nav-contact" href="#contact">{text(lang, 'contact')}</a>
        </nav>
      </div>
    </header>
  );
}

function Hero({ lang, scrollToForm }) {
  return (
    <section className="hero" id="top">
      <div className="hero-overlay" />
      <div className="container hero-grid">
        <div className="hero-copy">
          <span className="kicker light">{text(lang, 'heroKicker')}</span>
          <h1>{text(lang, 'heroTitle')}</h1>
          <p className="lead">{text(lang, 'heroLead')}</p>
          <div className="hero-ctas">
            <a className="button primary" href="#questionnaire">{text(lang, 'findExperience')}</a>
            <a className="button secondary dark" href="#availability">{text(lang, 'viewAvailability')}</a>
          </div>
          <ContactActions lang={lang} compact onUseForm={scrollToForm} />
          <div className="trust-grid" aria-label="Trust points">
            {i18n[lang].trust.map((item) => <div className="trust-card" key={item}>✓ <span>{item}</span></div>)}
          </div>
        </div>
        <div className="hero-media" aria-hidden="false">
          <ImageSlot
            src="/images/etna-eruption-hero.jpg"
            alt={text(lang, 'heroAlt')}
            label={lang === 'it' ? 'Osservazione da distanza sicura' : 'Observation from a safe distance'}
            lang={lang}
            ratio="portrait"
          />
        </div>
      </div>
    </section>
  );
}

function Philosophy({ lang }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="section compact-section">
      <div className="container philosophy-grid">
        <div className="editorial-card">
          <span className="kicker">{text(lang, 'philosophyKicker')}</span>
          <h2>{text(lang, 'philosophyTitle')}</h2>
          <p>{text(lang, 'philosophyText')}</p>
          {expanded && (
            <p>{lang === 'it'
              ? 'La scelta dell’itinerario non nasce da una promessa fotografica, ma da una valutazione concreta: condizioni, accessibilità, desideri del gruppo e senso del luogo.'
              : 'The route is not chosen around a photographic promise, but around real assessment: conditions, access, group needs, and the meaning of the place.'}</p>
          )}
          <button className="text-button" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? text(lang, 'hide') : text(lang, 'readMore')}</button>
        </div>
        <div className="mission-grid">
          <article className="mission-card">
            <span>{text(lang, 'mission')}</span>
            <p>{text(lang, 'missionText')}</p>
          </article>
          <article className="mission-card accent">
            <span>{text(lang, 'vision')}</span>
            <p>{text(lang, 'visionText')}</p>
          </article>
        </div>
      </div>
    </section>
  );
}

function ExperienceAccordion({ lang, fillForm }) {
  const [openId, setOpenId] = useState(experiences[0].id);
  return (
    <section className="section" id="experiences">
      <div className="container">
        <div className="section-header">
          <span className="kicker">{text(lang, 'experiencesKicker')}</span>
          <h2>{text(lang, 'experiencesTitle')}</h2>
          <p>{text(lang, 'experiencesIntro')}</p>
        </div>
        <div className="accordion-list">
          {experiences.map((experience) => {
            const isOpen = openId === experience.id;
            const message = buildExperienceMessage(experience, lang);
            return (
              <article className={`experience-card ${isOpen ? 'open' : ''}`} key={experience.id}>
                <button className="experience-summary" type="button" onClick={() => setOpenId(isOpen ? '' : experience.id)} aria-expanded={isOpen}>
                  <span className="experience-main">
                    <strong>{experience.title}</strong>
                    <small>{experience.summary[lang]}</small>
                  </span>
                  <span className="experience-meta"><b>{text(lang, 'bestFor')}:</b> {experience.bestFor[lang]}</span>
                  <span className="experience-meta"><b>{text(lang, 'starting')}:</b> {experience.starting[lang]}</span>
                  <span className="button small-button">{isOpen ? text(lang, 'hide') : text(lang, 'details')}</span>
                </button>
                {isOpen && (
                  <div className="experience-body">
                    <div className="experience-copy-grid">
                      <p>{experience.description[lang]}</p>
                      <dl>
                        <div><dt>{text(lang, 'value')}</dt><dd>{experience.value[lang]}</dd></div>
                        <div><dt>{text(lang, 'practical')}</dt><dd>{experience.notes[lang]}</dd></div>
                        <div><dt>{text(lang, 'safety')}</dt><dd>{experience.safety[lang]}</dd></div>
                      </dl>
                    </div>
                    <div className="cta-row">
                      <a className="button primary" href={`https://wa.me/${PHONE_WA}?text=${encode(message)}`} target="_blank" rel="noopener noreferrer">{text(lang, 'whatsapp')}</a>
                      <button className="button secondary" type="button" onClick={() => fillForm({ experienceId: experience.id, message, scroll: true })}>{text(lang, 'useInForm')}</button>
                      <ContactActions
                        lang={lang}
                        compact
                        contextMessage={message}
                        experienceId={experience.id}
                        onUseForm={() => fillForm({ experienceId: experience.id, message, scroll: true })}
                      />
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function loadAvailability() {
  return loadPublicAvailability();
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function dateToIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthLabel(date, lang) {
  return new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-US', { month: 'long', year: 'numeric' }).format(date);
}

function getCalendarDays(monthDate) {
  const first = startOfMonth(monthDate);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function resolveAvailability(dateIso, experienceId, records, lang) {
  const today = dateToIso(new Date());
  if (dateIso < today) {
    return { status: 'closed', reason: lang === 'it' ? 'Data passata' : 'Past date', source: 'past' };
  }
  const baseStatus = defaultExperienceAvailability[experienceId] || 'on-request';
  const globalRecords = records.filter((record) => record.date === dateIso && !record.experience);
  const activityRecords = records.filter((record) => record.date === dateIso && record.experience === experienceId);
  const all = [...globalRecords, ...activityRecords];
  const closed = all.find((record) => record.status === 'closed');
  const selected = closed || activityRecords[activityRecords.length - 1] || globalRecords[globalRecords.length - 1];
  if (selected) {
    return {
      status: selected.status,
      reason: selected.reason?.[lang] || selected.reason?.it || selected.reason?.en || '',
      source: selected.experience ? 'experience' : 'global'
    };
  }
  return { status: baseStatus, reason: statusLabels[baseStatus][lang], source: 'default' };
}

function AvailabilityCalendar({ lang, fillForm }) {
  const [records, setRecords] = useState(blockedDates);
  const [monthDate, setMonthDate] = useState(startOfMonth(new Date()));
  const [experienceId, setExperienceId] = useState('etna-live');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    loadAvailability().then((runtimeRecords) => {
      if (Array.isArray(runtimeRecords) && runtimeRecords.length) {
        setRecords([...blockedDates, ...runtimeRecords]);
      }
    });
  }, []);

  const days = useMemo(() => getCalendarDays(monthDate), [monthDate]);
  const selectedExperience = experienceById(experienceId);
  const selectedMessage = selected
    ? buildCalendarMessage({ experience: selectedExperience, date: selected.date, status: selected.status, note: selected.reason }, lang)
    : '';

  function changeMonth(delta) {
    setMonthDate((date) => new Date(date.getFullYear(), date.getMonth() + delta, 1));
    setSelected(null);
  }

  function handleDateClick(date) {
    const dateIso = dateToIso(date);
    const availability = resolveAvailability(dateIso, experienceId, records, lang);
    setSelected({ date: dateIso, ...availability });
  }

  return (
    <section className="section alt-section" id="availability">
      <div className="container calendar-layout">
        <div className="section-header sticky-note">
          <span className="kicker">{text(lang, 'availabilityKicker')}</span>
          <h2>{text(lang, 'availabilityTitle')}</h2>
          <p>{text(lang, 'availabilityIntro')}</p>
          <div className="legend" aria-label="Calendar legend">
            {['available', 'limited', 'closed', 'on-request'].map((status) => <span key={status}><i className={`dot ${status}`} />{statusLabels[status][lang]}</span>)}
          </div>
        </div>
        <div className="calendar-card">
          <div className="calendar-toolbar">
            <button type="button" className="round-button" onClick={() => changeMonth(-1)} aria-label={text(lang, 'previousMonth')}>‹</button>
            <strong>{monthLabel(monthDate, lang)}</strong>
            <button type="button" className="round-button" onClick={() => changeMonth(1)} aria-label={text(lang, 'nextMonth')}>›</button>
          </div>
          <label className="field-label" htmlFor="calendarExperience">{text(lang, 'chooseExperience')}</label>
          <select id="calendarExperience" value={experienceId} onChange={(event) => { setExperienceId(event.target.value); setSelected(null); }}>
            {experiences.map((experience) => <option key={experience.id} value={experience.id}>{experience.title}</option>)}
          </select>
          <div className="weekdays" aria-hidden="true">{(lang === 'it' ? ['L', 'M', 'M', 'G', 'V', 'S', 'D'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']).map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
          <div className="calendar-grid">
            {days.map((date) => {
              const iso = dateToIso(date);
              const availability = resolveAvailability(iso, experienceId, records, lang);
              const outside = date.getMonth() !== monthDate.getMonth();
              return (
                <button
                  key={iso}
                  type="button"
                  className={`date-button ${availability.status} ${outside ? 'outside' : ''} ${selected?.date === iso ? 'selected' : ''}`}
                  onClick={() => handleDateClick(date)}
                  aria-label={`${iso}, ${statusLabels[availability.status][lang]}`}
                >
                  <span>{date.getDate()}</span>
                  <small>{statusLabels[availability.status][lang]}</small>
                </button>
              );
            })}
          </div>
          {selected && (
            <div className={`date-result ${selected.status}`}>
              <strong>{formatDateForMessage(selected.date, lang)} · {statusLabels[selected.status][lang]}</strong>
              <p>{selected.status === 'closed' ? text(lang, 'dateClosed') : selected.reason}</p>
              {selected.status === 'closed' ? (
                <button className="button secondary" type="button" onClick={() => fillForm({ experienceId, message: selectedMessage, scroll: true })}>{text(lang, 'requestAlternative')}</button>
              ) : (
                <ContactActions
                  lang={lang}
                  compact
                  contextMessage={selectedMessage}
                  experienceId={experienceId}
                  onUseForm={() => fillForm({ experienceId, message: selectedMessage, scroll: true })}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function recommendFromAnswers(answers, lang) {
  let recommended = experienceById('etna-premium');
  let alternative = experienceById('etna-stories');
  let reason = lang === 'it' ? 'Hai indicato una preferenza per un’esperienza privata, curata e confortevole.' : 'You indicated a preference for a private, curated, comfortable experience.';

  if (answers.travelingWith === 'company') {
    recommended = experienceById('etna-learning');
    alternative = experienceById('etna-premium');
    reason = lang === 'it' ? 'Un team aziendale ha bisogno di contenuto chiaro, ritmo controllato e gestione del gruppo.' : 'A company team needs clear content, controlled pace, and group management.';
  } else if (answers.travelingWith === 'school') {
    recommended = experienceById('etna-learning');
    alternative = experienceById('etna-stories');
    reason = lang === 'it' ? 'Un gruppo scolastico richiede un formato educativo e adatto all’età.' : 'A school group requires an educational format suited to the students’ age.';
  } else if (answers.interest === 'volcanic-activity') {
    recommended = experienceById('etna-live');
    alternative = experienceById('etna-premium');
    reason = lang === 'it' ? 'L’interesse principale è osservare l’attività vulcanica con prudenza e interpretazione corretta.' : 'Your main interest is observing volcanic activity with prudence and proper interpretation.';
  } else if (answers.interest === 'local-culture') {
    recommended = experienceById('etna-stories');
    alternative = experienceById('etna-learning');
    reason = lang === 'it' ? 'Cerchi racconto, cultura locale e connessione con il territorio.' : 'You are looking for storytelling, local culture, and connection with the territory.';
  } else if (answers.private === 'yes' || answers.interest === 'private-exclusive') {
    recommended = experienceById('etna-premium');
    alternative = experienceById('etna-stories');
    reason = lang === 'it' ? 'La preferenza privata/esclusiva indica un percorso più su misura.' : 'The private/exclusive preference points to a more tailored route.';
  } else if (answers.travelingWith === 'family') {
    if (answers.interest === 'learning') {
      recommended = experienceById('etna-learning');
      alternative = experienceById('etna-stories');
      reason = lang === 'it' ? 'Una famiglia orientata all’apprendimento beneficia di contenuti semplici e coinvolgenti.' : 'A learning-oriented family benefits from clear and engaging content.';
    } else {
      recommended = experienceById('etna-stories');
      alternative = experienceById('etna-learning');
      reason = lang === 'it' ? 'Per una famiglia, racconto e ritmo adattabile sono spesso la scelta più naturale.' : 'For a family, storytelling and adaptable pace are often the most natural choice.';
    }
  } else if (answers.interest === 'learning') {
    recommended = experienceById('etna-learning');
    alternative = experienceById('etna-stories');
    reason = lang === 'it' ? 'Hai indicato interesse per contenuto educativo e comprensione del vulcano.' : 'You indicated interest in educational content and understanding the volcano.';
  }

  const details = {
    travelingWith: optionLabel('travelingWith', answers.travelingWith, lang),
    interest: optionLabel('interest', answers.interest, lang),
    pace: optionLabel('pace', answers.pace, lang),
    private: optionLabel('private', answers.private, lang),
    children: optionLabel('children', answers.children, lang)
  };

  return { recommended, alternative, reason, details, childWarning: answers.children === 'under3' };
}

function RadioGroup({ legend, name, options, value, onChange, lang }) {
  return (
    <fieldset className="radio-fieldset">
      <legend>{legend}</legend>
      <div className="choice-grid">
        {options.map((option) => (
          <label className={`choice-card ${value === option.value ? 'selected' : ''}`} key={option.value}>
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={(event) => onChange(event.target.value)} />
            <span>{option[lang]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Questionnaire({ lang, fillForm }) {
  const [answers, setAnswers] = useState({
    travelingWith: 'couple-small',
    interest: 'private-exclusive',
    pace: 'slow-comfortable',
    private: 'yes',
    children: 'no'
  });
  const [result, setResult] = useState(null);

  function update(name, value) {
    setAnswers((current) => ({ ...current, [name]: value }));
  }

  function submit(event) {
    event.preventDefault();
    const nextResult = recommendFromAnswers(answers, lang);
    nextResult.message = buildQuestionnaireMessage(nextResult, lang);
    setResult(nextResult);
    window.setTimeout(() => document.getElementById('questionnaire-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  return (
    <section className="section" id="questionnaire">
      <div className="container questionnaire-layout">
        <div className="section-header">
          <span className="kicker">{text(lang, 'questionnaireKicker')}</span>
          <h2>{text(lang, 'questionnaireTitle')}</h2>
          <p>{text(lang, 'questionnaireIntro')}</p>
        </div>
        <form className="questionnaire-card" onSubmit={submit}>
          <RadioGroup legend={text(lang, 'travelingWith')} name="travelingWith" options={questionnaireOptions.travelingWith} value={answers.travelingWith} onChange={(value) => update('travelingWith', value)} lang={lang} />
          <RadioGroup legend={text(lang, 'interest')} name="interest" options={questionnaireOptions.interest} value={answers.interest} onChange={(value) => update('interest', value)} lang={lang} />
          <RadioGroup legend={text(lang, 'pace')} name="pace" options={questionnaireOptions.pace} value={answers.pace} onChange={(value) => update('pace', value)} lang={lang} />
          <RadioGroup legend={text(lang, 'private')} name="private" options={questionnaireOptions.private} value={answers.private} onChange={(value) => update('private', value)} lang={lang} />
          <RadioGroup legend={text(lang, 'children')} name="children" options={questionnaireOptions.children} value={answers.children} onChange={(value) => update('children', value)} lang={lang} />
          <button className="button primary" type="submit">{text(lang, 'generate')}</button>
        </form>
        {result && (
          <article className="result-card" id="questionnaire-result">
            <div className="result-grid">
              <div>
                <span className="micro-label">{text(lang, 'recommended')}</span>
                <h3>{result.recommended.title}</h3>
              </div>
              <div>
                <span className="micro-label">{text(lang, 'alternative')}</span>
                <h3>{result.alternative.title}</h3>
              </div>
            </div>
            <p><strong>{text(lang, 'reason')}:</strong> {result.reason}</p>
            {result.childWarning && <p className="warning-note">{text(lang, 'childNote')}</p>}
            <label className="field-label" htmlFor="generatedMessage">{text(lang, 'preparedMessage')}</label>
            <textarea id="generatedMessage" value={result.message} onChange={(event) => setResult({ ...result, message: event.target.value })} />
            <div className="cta-row">
              <a className="button primary" href={`https://wa.me/${PHONE_WA}?text=${encode(result.message)}`} target="_blank" rel="noopener noreferrer">{text(lang, 'whatsapp')}</a>
              <ContactActions lang={lang} compact contextMessage={result.message} onUseForm={() => fillForm({ experienceId: result.recommended.id, message: result.message, scroll: true })} />
              <button className="button secondary" type="button" onClick={() => copyText(result.message)}>{text(lang, 'copyMessage')}</button>
              <button className="button secondary" type="button" onClick={() => fillForm({ experienceId: result.recommended.id, message: result.message, scroll: true })}>{text(lang, 'useThisForm')}</button>
              <button className="button secondary" type="button" onClick={() => fillForm({ experienceId: result.recommended.id, message: result.message, scroll: true })}>{text(lang, 'requestThis')}</button>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

function WearReviewsSafety({ lang }) {
  const wearItems = lang === 'it'
    ? ['Scarpe chiuse con buona suola', 'Giacca antivento o strato caldo', 'Acqua personale e protezione solare', 'No abbigliamento fragile o inadatto al terreno lavico']
    : ['Closed shoes with good grip', 'Windproof jacket or warm layer', 'Personal water and sun protection', 'No fragile clothing unsuitable for lava terrain'];
  const reviewItems = lang === 'it'
    ? ['“Esperienza curata, sicura e molto più profonda di una semplice escursione.”', '“Leonardo spiega l’Etna con calma, competenza e grande attenzione al gruppo.”', '“Perfetta per capire il paesaggio, non solo fotografarlo.”']
    : ['“A curated, safe experience, far deeper than a standard excursion.”', '“Leonardo explains Etna with calm, expertise, and real attention to the group.”', '“Perfect for understanding the landscape, not just photographing it.”'];
  const safetyItems = lang === 'it'
    ? ['Meteo e visibilità', 'Ordinanze e accessibilità', 'Attività vulcanica reale', 'Età, mobilità e abbigliamento del gruppo']
    : ['Weather and visibility', 'Regulations and access', 'Actual volcanic activity', 'Group age, mobility, and clothing'];

  return (
    <>
      <section className="section compact-section">
        <div className="container three-column-section">
          <article className="content-card">
            <span className="kicker">{text(lang, 'wearKicker')}</span>
            <h2>{text(lang, 'wearTitle')}</h2>
            <p>{text(lang, 'wearIntro')}</p>
            <ul className="check-list">{wearItems.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
          <article className="content-card">
            <span className="kicker">{text(lang, 'reviewsKicker')}</span>
            <h2>{text(lang, 'reviewsTitle')}</h2>
            <p>{text(lang, 'reviewsIntro')}</p>
            <div className="review-list">{reviewItems.map((item) => <blockquote key={item}>{item}</blockquote>)}</div>
          </article>
          <article className="content-card dark-card" id="safety">
            <span className="kicker light">{text(lang, 'safetyKicker')}</span>
            <h2>{text(lang, 'safetyTitle')}</h2>
            <p>{text(lang, 'safetyIntro')}</p>
            <ul className="check-list">{safetyItems.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
        </div>
      </section>
      <section className="section image-strip-section">
        <div className="container gallery-grid">
          <ImageSlot src="/images/etna-live-pov.jpg" alt={text(lang, 'liveAlt')} label={lang === 'it' ? 'Etna Live · distanza sicura' : 'Etna Live · safe distance'} lang={lang} />
          <ImageSlot src="/images/etna-safety-landscape.jpg" alt={text(lang, 'safetyAlt')} label={lang === 'it' ? 'Paesaggio e condizioni controllate' : 'Landscape and controlled conditions'} lang={lang} />
          <ImageSlot src="/images/etna-gallery-01.jpg" alt={text(lang, 'gallery01Alt')} label={lang === 'it' ? 'Roccia lavica e dettaglio territoriale' : 'Lava rock and territorial detail'} lang={lang} />
          <ImageSlot src="/images/etna-gallery-02.jpg" alt={text(lang, 'gallery02Alt')} label={lang === 'it' ? 'Guida e paesaggio vulcanico' : 'Guide and volcanic landscape'} lang={lang} />
          <ImageSlot src="/images/etna-gallery-03.jpg" alt={text(lang, 'gallery03Alt')} label={lang === 'it' ? 'Luce naturale sul terreno lavico' : 'Natural light on lava terrain'} lang={lang} />
        </div>
      </section>
    </>
  );
}

function Team({ lang }) {
  return (
    <section className="section" id="team">
      <div className="container">
        <div className="section-header">
          <span className="kicker">{text(lang, 'teamKicker')}</span>
          <h2>{text(lang, 'teamTitle')}</h2>
        </div>
        <div className="team-grid">
          <article className="team-card leonardo-card">
            <div className="team-photo placeholder-avatar" aria-hidden="true"><span>LC</span></div>
            <div>
              <h3>Leonardo Chiavetta</h3>
              <p className="role">{text(lang, 'leonardoRole')}</p>
              <p>{text(lang, 'leonardoBio')}</p>
              <a className="inline-link" href={INSTAGRAM} target="_blank" rel="noopener noreferrer"><Icon name="insta" />{text(lang, 'instagram')}</a>
            </div>
          </article>
          <article className="team-card">
            <img className="team-photo" src="/images/co-owner.jpg" alt={text(lang, 'coFounderAlt')} />
            <div>
              <h3>{text(lang, 'coFounderName')}</h3>
              <p className="role">{text(lang, 'coFounderRole')}</p>
              <p>{text(lang, 'coFounderBio')}</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function ContactForm({ lang, formState, setFormState }) {
  const [submitState, setSubmitState] = useState({ loading: false, error: '', success: '' });
  const message = formState.message || text(lang, 'defaultMessage');
  const experienceId = formState.experienceId || '';
  const selectedTitle = experienceId ? experienceById(experienceId).title : '';
  const fullMessage = message;

  function update(field, value) {
    setFormState((current) => ({ ...current, [field]: value }));
  }

  async function submitRequest(event) {
    event.preventDefault();
    setSubmitState({ loading: false, error: '', success: '' });

    const email = (formState.email || '').trim();
    const phone = (formState.phone || '').trim();
    const selectedDate = (formState.requestedDate || '').trim();
    const hasMessage = (message || '').trim() && message !== text(lang, 'defaultMessage');

    if (!email && !phone) {
      setSubmitState({ loading: false, error: text(lang, 'contactRequired'), success: '' });
      return;
    }

    if (!hasMessage && !experienceId && !selectedDate) {
      setSubmitState({ loading: false, error: text(lang, 'requestDetailsRequired'), success: '' });
      return;
    }

    setSubmitState({ loading: true, error: '', success: '' });

    try {
      await createPublicBookingRequest({
        customer_name: formState.name,
        customer_email: email,
        customer_phone: phone,
        preferred_contact: formState.preferredContact || 'form',
        experience_id: experienceId || 'unsure',
        requested_date: formState.requestedDate,
        alternative_date: formState.alternativeDate,
        language: formState.language || lang,
        adults: formState.adults,
        children: formState.children,
        children_under_3: Boolean(formState.childrenUnder3),
        private_experience: Boolean(formState.privateExperience),
        message,
        source: 'website'
      });
      setSubmitState({ loading: false, error: '', success: text(lang, 'requestSent') });
    } catch (error) {
      setSubmitState({ loading: false, error: text(lang, 'requestFallbackError'), success: '' });
    }
  }

  return (
    <section className="section alt-section" id="contact">
      <div className="container contact-section-grid">
        <div>
          <span className="kicker">{text(lang, 'formKicker')}</span>
          <h2>{text(lang, 'formTitle')}</h2>
          <p>{text(lang, 'formIntro')}</p>
          <ContactActions lang={lang} contextMessage={fullMessage} onUseForm={null} />
          <a className="instagram-link" href={INSTAGRAM} target="_blank" rel="noopener noreferrer"><Icon name="insta" />{text(lang, 'instagram')}</a>
        </div>
        <form className="contact-form" onSubmit={submitRequest}>
          <label className="field-label" htmlFor="contactName">{text(lang, 'name')}</label>
          <input id="contactName" type="text" value={formState.name || ''} onChange={(event) => update('name', event.target.value)} autoComplete="name" />

          <div className="form-two-cols">
            <div>
              <label className="field-label" htmlFor="contactPhone">{text(lang, 'phone')}</label>
              <input id="contactPhone" type="tel" value={formState.phone || ''} onChange={(event) => update('phone', event.target.value)} autoComplete="tel" />
            </div>
            <div>
              <label className="field-label" htmlFor="contactEmail">{text(lang, 'contactEmail')}</label>
              <input id="contactEmail" type="email" value={formState.email || ''} onChange={(event) => update('email', event.target.value)} autoComplete="email" />
            </div>
          </div>

          <label className="field-label" htmlFor="contactPreferred">{text(lang, 'preferredContact')}</label>
          <select id="contactPreferred" value={formState.preferredContact || 'form'} onChange={(event) => update('preferredContact', event.target.value)}>
            <option value="form">Form</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="phone">{lang === 'it' ? 'Telefono' : 'Phone'}</option>
            <option value="email">Email</option>
          </select>

          <label className="field-label" htmlFor="contactLanguage">{text(lang, 'preferredLanguage')}</label>
          <select id="contactLanguage" value={formState.language || lang} onChange={(event) => update('language', event.target.value)}>
            <option value="it">Italiano</option>
            <option value="en">English</option>
          </select>

          <label className="field-label" htmlFor="contactExperience">{text(lang, 'selectedExperience')}</label>
          <select id="contactExperience" value={experienceId} onChange={(event) => update('experienceId', event.target.value)}>
            <option value="">{text(lang, 'selectExperience')}</option>
            {experiences.map((experience) => <option value={experience.id} key={experience.id}>{experience.title}</option>)}
          </select>

          <div className="form-two-cols">
            <div>
              <label className="field-label" htmlFor="contactRequestedDate">{text(lang, 'requestedDate')}</label>
              <input id="contactRequestedDate" type="date" value={formState.requestedDate || ''} onChange={(event) => update('requestedDate', event.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="contactAlternativeDate">{text(lang, 'alternativeDate')}</label>
              <input id="contactAlternativeDate" type="date" value={formState.alternativeDate || ''} onChange={(event) => update('alternativeDate', event.target.value)} />
            </div>
          </div>

          <div className="form-two-cols three">
            <div>
              <label className="field-label" htmlFor="contactAdults">{text(lang, 'adults')}</label>
              <input id="contactAdults" type="number" min="0" value={formState.adults || ''} onChange={(event) => update('adults', event.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="contactChildren">{text(lang, 'childrenCount')}</label>
              <input id="contactChildren" type="number" min="0" value={formState.children || ''} onChange={(event) => update('children', event.target.value)} />
            </div>
            <div className="checkbox-stack">
              <label><input type="checkbox" checked={Boolean(formState.childrenUnder3)} onChange={(event) => update('childrenUnder3', event.target.checked)} /> {text(lang, 'childrenUnder3')}</label>
              <label><input type="checkbox" checked={Boolean(formState.privateExperience)} onChange={(event) => update('privateExperience', event.target.checked)} /> {text(lang, 'privateExperience')}</label>
            </div>
          </div>

          <label className="field-label" htmlFor="contactMessage">{text(lang, 'message')}</label>
          <textarea id="contactMessage" value={message} onChange={(event) => update('message', event.target.value)} />
          {selectedTitle && <p className="small-note">{text(lang, 'selectedExperience')}: {selectedTitle}</p>}
          {submitState.error && <p className="form-status error" role="alert">{submitState.error}</p>}
          {submitState.success && <p className="form-status success" role="status">{submitState.success}</p>}
          {!isSupabaseConfigured && <p className="small-note">{lang === 'it' ? 'Il modulo può essere usato come traccia; se Supabase non è configurato, usa WhatsApp o email.' : 'The form can be used as a brief; if Supabase is not configured, use WhatsApp or email.'}</p>}
          <div className="cta-row">
            <button className="button primary" type="submit" disabled={submitState.loading}>{submitState.loading ? (lang === 'it' ? 'Invio...' : 'Sending...') : text(lang, 'submitRequest')}</button>
            <a className="button secondary" href={`https://wa.me/${PHONE_WA}?text=${encode(fullMessage)}`} target="_blank" rel="noopener noreferrer">{text(lang, 'sendWhatsapp')}</a>
            <ContactActions lang={lang} compact contextMessage={fullMessage} />
            <button className="button secondary" type="button" onClick={() => copyText(fullMessage)}>{text(lang, 'copyMessage')}</button>
          </div>
        </form>
      </div>
    </section>
  );
}

function FinalCTA({ lang }) {
  return (
    <section className="section final-cta">
      <div className="container final-panel">
        <div>
          <h2>{text(lang, 'finalTitle')}</h2>
          <p>{text(lang, 'finalText')}</p>
        </div>
        <ContactActions lang={lang} compact />
      </div>
    </section>
  );
}

function Footer({ lang }) {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <a className="brand footer-brand" href="#top" aria-label="vulcanIQ home"><span className="brand-mark">▵</span><span><strong>vulcanIQ</strong><small>Etna experiences</small></span></a>
          <p>{text(lang, 'footerText')}</p>
        </div>
        <div>
          <p><strong>Leonardo Chiavetta</strong><br />{PHONE_DISPLAY}<br /><a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
          <a className="inline-link" href={INSTAGRAM} target="_blank" rel="noopener noreferrer"><Icon name="insta" />{text(lang, 'instagram')}</a>
        </div>
      </div>
    </footer>
  );
}

function StickyMobileBar({ lang }) {
  const message = text(lang, 'defaultMessage');
  return (
    <div className="mobile-sticky-bar" aria-label="Mobile contact actions">
      <a href={`tel:${PHONE_TEL}`}><Icon name="phone" />{lang === 'it' ? 'Chiama' : 'Call'}</a>
      <a href={`https://wa.me/${PHONE_WA}?text=${encode(message)}`} target="_blank" rel="noopener noreferrer"><Icon name="chat" />WhatsApp</a>
      <a href="#contact"><Icon name="mail" />Email</a>
    </div>
  );
}

const REQUEST_STATUSES = ['pending', 'accepted', 'declined', 'cancelled', 'archived'];
const REQUEST_SOURCES = ['website', 'whatsapp', 'phone', 'email', 'manual'];
const ADMIN_EXPERIENCE_OPTIONS = ['etna-premium', 'etna-learning', 'etna-live', 'etna-stories', 'unsure'];
const AVAILABILITY_STATUSES = ['closed', 'limited', 'on-request'];

const requestStatusLabels = {
  pending: { it: 'In attesa', en: 'Pending' },
  accepted: { it: 'Accettata', en: 'Accepted' },
  declined: { it: 'Rifiutata', en: 'Declined' },
  cancelled: { it: 'Annullata', en: 'Cancelled' },
  archived: { it: 'Archiviata', en: 'Archived' }
};

const adminAvailabilityStatusLabels = {
  closed: { it: 'Non disponibile', en: 'Closed' },
  limited: { it: 'Disponibilità limitata', en: 'Limited availability' },
  'on-request': { it: 'Su richiesta', en: 'On request' }
};

function adminCopy(lang, it, en) {
  return lang === 'en' ? en : it;
}

function todayIso() {
  return dateToIso(new Date());
}

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateToIso(date);
}

function ownerDisplayName(profile, lang) {
  return profile?.full_name || adminCopy(lang, 'Co-owner vulcanIQ', 'vulcanIQ Co-owner');
}

function adminExperienceLabel(id, lang) {
  if (!id || id === 'unsure') return lang === 'it' ? 'Non so' : 'Not sure';
  return experienceById(id).title;
}

function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const handlePop = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  function navigate(path) {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
      setPathname(path);
      window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
    }
  }

  return [pathname, navigate];
}

function AdminLogin({ lang, setLang, navigate }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInOwner({ email: email.trim(), password });
      const access = await getAdminAccess();
      if (!access.isAdmin) {
        await signOutOwner();
        setError(adminCopy(lang, 'Accesso negato: questo utente non è un owner attivo.', 'Access denied: this user is not an active owner.'));
        return;
      }
      navigate('/admin/today');
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Login non riuscito.', 'Login failed.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-login-shell">
      <section className="admin-login-card" aria-labelledby="adminLoginTitle">
        <a className="brand admin-login-brand" href="/" aria-label="vulcanIQ home">
          <span className="brand-mark" aria-hidden="true">▵</span>
          <span><strong>vulcanIQ</strong><small>Owner admin</small></span>
        </a>
        <div>
          <span className="kicker">{adminCopy(lang, 'Area owner', 'Owner area')}</span>
          <h1 id="adminLoginTitle">{adminCopy(lang, 'Accesso admin', 'Admin login')}</h1>
          <p>{adminCopy(lang, 'Accesso riservato ai due owner attivi di vulcanIQ.', 'Access reserved for the two active vulcanIQ owners.')}</p>
        </div>
        {!isSupabaseConfigured && (
          <div className="admin-alert warning">
            {adminCopy(lang, 'Supabase non è configurato. Aggiungi VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.', 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')}
          </div>
        )}
        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="adminEmail">Email</label>
          <input id="adminEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          <label className="field-label" htmlFor="adminPassword">Password</label>
          <input id="adminPassword" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          {error && <div className="admin-alert error" role="alert">{error}</div>}
          <button className="button primary admin-wide-button" type="submit" disabled={loading || !isSupabaseConfigured}>{loading ? adminCopy(lang, 'Accesso...', 'Signing in...') : adminCopy(lang, 'Entra', 'Sign in')}</button>
        </form>
        <div className="admin-login-actions">
          <button className="button secondary" type="button" onClick={() => setLang(lang === 'it' ? 'en' : 'it')}>{lang === 'it' ? 'English' : 'Italiano'}</button>
          <a className="button secondary" href="/">{adminCopy(lang, 'Torna al sito', 'Back to public site')}</a>
        </div>
      </section>
    </main>
  );
}

function AdminRouter({ pathname, navigate, lang, setLang }) {
  if (pathname === '/admin/login') {
    return <AdminLogin lang={lang} setLang={setLang} navigate={navigate} />;
  }

  return <ProtectedAdminArea pathname={pathname} navigate={navigate} lang={lang} setLang={setLang} />;
}

function ProtectedAdminArea({ pathname, navigate, lang, setLang }) {
  const [state, setState] = useState({ loading: true, session: null, profile: null, error: '' });

  useEffect(() => {
    let alive = true;

    async function checkAccess() {
      if (!isSupabaseConfigured) {
        setState({ loading: false, session: null, profile: null, error: 'supabase-missing' });
        return;
      }

      try {
        const access = await getAdminAccess();
        if (!alive) return;
        if (!access.session) {
          navigate('/admin/login');
          return;
        }
        setState({ loading: false, session: access.session, profile: access.profile, error: access.isAdmin ? '' : 'not-admin' });
      } catch (err) {
        if (alive) setState({ loading: false, session: null, profile: null, error: err?.message || 'access-error' });
      }
    }

    checkAccess();
    return () => { alive = false; };
  }, [navigate]);

  if (state.loading) {
    return <main className="admin-loading"><span className="kicker">vulcanIQ</span><p>{adminCopy(lang, 'Controllo accesso...', 'Checking access...')}</p></main>;
  }

  if (state.error === 'supabase-missing') {
    return (
      <main className="admin-loading">
        <span className="kicker">Setup</span>
        <h1>{adminCopy(lang, 'Supabase non configurato', 'Supabase is not configured')}</h1>
        <p>{adminCopy(lang, 'Aggiungi le variabili VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY in Netlify e in locale.', 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify and locally.')}</p>
        <a className="button primary" href="/">{adminCopy(lang, 'Torna al sito', 'Back to public site')}</a>
      </main>
    );
  }

  if (state.error) {
    return (
      <main className="admin-loading">
        <span className="kicker">Accesso</span>
        <h1>{adminCopy(lang, 'Accesso negato', 'Access denied')}</h1>
        <p>{state.error === 'not-admin' ? adminCopy(lang, 'Il tuo account esiste, ma non è presente come owner attivo in admin_profiles.', 'Your account exists, but it is not listed as an active owner in admin_profiles.') : state.error}</p>
        <button className="button secondary" type="button" onClick={() => navigate('/admin/login')}>{adminCopy(lang, 'Vai al login', 'Go to login')}</button>
      </main>
    );
  }

  return <AdminLayout pathname={pathname} navigate={navigate} lang={lang} setLang={setLang} session={state.session} profile={state.profile} />;
}

function AdminLayout({ pathname, navigate, lang, setLang, session, profile }) {
  const normalizedPath = pathname === '/admin' ? '/admin/today' : pathname;
  const pageLabel = normalizedPath.includes('/upcoming')
    ? adminCopy(lang, 'Prossime', 'Upcoming')
    : normalizedPath.includes('/requests')
      ? adminCopy(lang, 'Richieste', 'Requests')
      : normalizedPath.includes('/availability')
        ? adminCopy(lang, 'Disponibilità', 'Availability')
        : adminCopy(lang, 'Oggi', 'Today');

  useEffect(() => {
    if (pathname === '/admin') navigate('/admin/today');
  }, [pathname, navigate]);

  async function logout() {
    await signOutOwner();
    navigate('/admin/login');
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <button className="brand admin-brand-button" type="button" onClick={() => navigate('/admin/today')} aria-label="vulcanIQ admin home">
          <span className="brand-mark" aria-hidden="true">▵</span>
          <span><strong>vulcanIQ</strong><small>{pageLabel}</small></span>
        </button>
        <nav className="admin-nav" aria-label="Admin navigation">
          <button type="button" className={normalizedPath.includes('/today') ? 'active' : ''} onClick={() => navigate('/admin/today')}>{adminCopy(lang, 'Oggi', 'Today')}</button>
          <button type="button" className={normalizedPath.includes('/upcoming') ? 'active' : ''} onClick={() => navigate('/admin/upcoming')}>{adminCopy(lang, 'Prossime', 'Upcoming')}</button>
          <button type="button" className={normalizedPath.includes('/availability') ? 'active' : ''} onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Disponibilità', 'Availability')}</button>
          <a href="/" target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Sito pubblico', 'Public site')}</a>
        </nav>
        <div className="admin-userbox">
          <span>{ownerDisplayName(profile, lang)}</span>
          <button type="button" onClick={() => setLang(lang === 'it' ? 'en' : 'it')}>{lang === 'it' ? 'EN' : 'IT'}</button>
          <button type="button" onClick={logout}>{adminCopy(lang, 'Esci', 'Logout')}</button>
        </div>
      </header>
      <main className="admin-main">
        {normalizedPath.includes('/upcoming') ? (
          <UpcomingPage lang={lang} session={session} navigate={navigate} />
        ) : normalizedPath.includes('/requests') ? (
          <RequestsPage lang={lang} session={session} />
        ) : normalizedPath.includes('/availability') ? (
          <AvailabilityPage lang={lang} session={session} />
        ) : (
          <TodayDashboard lang={lang} session={session} navigate={navigate} />
        )}
      </main>
    </div>
  );
}

function useAdminRequests(filters = {}) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const data = await listBookingRequests(filters);
      setRequests(data);
    } catch (err) {
      setError(err?.message || 'Could not load requests.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  return { requests, loading, error, refresh };
}

function TodayDashboard({ lang, session, navigate }) {
  const { requests, loading, error, refresh } = useAdminRequests({ limit: 250 });
  const [blocks, setBlocks] = useState([]);
  const [blocksError, setBlocksError] = useState('');
  const [decision, setDecision] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [feedback, setFeedback] = useState('');

  async function loadBlocks() {
    try {
      const data = await listAvailabilityBlocks({ activeOnly: true, fromDate: todayIso(), toDate: addDaysIso(30) });
      setBlocks(data);
      setBlocksError('');
    } catch (err) {
      setBlocksError(err?.message || 'Could not load availability.');
    }
  }

  useEffect(() => { loadBlocks(); }, []);

  const today = todayIso();
  const pending = requests.filter((request) => request.status === 'pending');
  const todayRequests = requests.filter((request) => request.requested_date === today && ['pending', 'accepted'].includes(request.status));
  const pendingToday = todayRequests.filter((request) => request.status === 'pending');
  const acceptedToday = todayRequests.filter((request) => request.status === 'accepted');
  const upcomingAccepted = requests.filter((request) => request.status === 'accepted' && request.requested_date && request.requested_date >= today);
  const next14 = blocks.filter((block) => block.date <= addDaysIso(14));
  const availabilityIssuesToday = blocks.filter((block) => block.date === today && block.active !== false);
  const operational = requests.filter((request) => request.status === 'accepted' && request.requested_date && request.requested_date >= today && request.requested_date <= addDaysIso(7));

  async function refreshAll(message = '') {
    await refresh();
    await loadBlocks();
    if (message) setFeedback(message);
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Dashboard owner', 'Owner dashboard')}</span>
          <h1>{adminCopy(lang, 'Oggi', 'Today')}</h1>
          <p>{adminCopy(lang, 'Richieste in attesa, conferme vicine e disponibilità dei prossimi giorni.', 'Pending requests, upcoming accepted bookings, and near-term availability.')}</p>
        </div>
        <div className="admin-header-actions">
          <button className="button primary" type="button" onClick={() => setManualOpen(true)}>{adminCopy(lang, 'Aggiungi richiesta manuale', 'Add manual request')}</button>
          <button className="button secondary" type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Gestisci disponibilità', 'Manage availability')}</button>
        </div>
      </div>

      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {(error || blocksError) && <div className="admin-alert error" role="alert">{error || blocksError}</div>}

      <div className="admin-summary-grid">
        <SummaryCard label={adminCopy(lang, 'Pending oggi', 'Pending today')} value={pendingToday.length} />
        <SummaryCard label={adminCopy(lang, 'Pending totale', 'Pending total')} value={pending.length} />
        <SummaryCard label={adminCopy(lang, 'Accettate oggi', 'Accepted today')} value={acceptedToday.length} />
        <SummaryCard label={adminCopy(lang, 'Disponibilità oggi', 'Availability issues today')} value={availabilityIssuesToday.length} />
      </div>

      <div className="admin-two-column">
        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>{adminCopy(lang, 'Richieste di oggi', 'Today requests')}</h2>
            <button type="button" onClick={() => refreshAll()}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
          </div>
          {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : todayRequests.length === 0 ? <p>{adminCopy(lang, 'Nessuna richiesta con data oggi.', 'No requests dated today.')}</p> : (
            <div className="request-card-list">
              {todayRequests.map((request) => <RequestCard key={request.id} request={request} lang={lang} onApprove={() => setDecision({ type: 'approve', request })} onDecline={() => setDecision({ type: 'decline', request })} />)}
            </div>
          )}

          <div className="admin-panel-subsection">
            <div className="admin-panel-header">
              <h2>{adminCopy(lang, 'Richieste pending da confermare', 'Pending requests needing attention')}</h2>
              <button type="button" onClick={() => navigate('/admin/requests')}>{adminCopy(lang, 'Tutte', 'All')}</button>
            </div>
            {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : pending.length === 0 ? <p>{adminCopy(lang, 'Nessuna richiesta in attesa.', 'No pending requests.')}</p> : (
              <div className="request-card-list">
                {pending.map((request) => <RequestCard key={request.id} request={request} lang={lang} onApprove={() => setDecision({ type: 'approve', request })} onDecline={() => setDecision({ type: 'decline', request })} />)}
              </div>
            )}
          </div>
        </section>

        <aside className="admin-panel compact-panel">
          <h2>{adminCopy(lang, 'Operatività prossima', 'Upcoming operations')}</h2>
          <AdminMiniList
            items={operational}
            empty={adminCopy(lang, 'Nessuna conferma nei prossimi 7 giorni.', 'No accepted bookings in the next 7 days.')}
            render={(request) => <span><strong>{formatDateForMessage(request.requested_date, lang)}</strong> · {request.customer_name || '-'} · {adminExperienceLabel(request.experience_id, lang)}</span>}
          />
          <button className="button secondary admin-inline-button" type="button" onClick={() => navigate('/admin/upcoming')}>{adminCopy(lang, 'Apri prossime prenotazioni', 'Open upcoming bookings')}</button>
          <h3>{adminCopy(lang, 'Blocchi prossimi', 'Near-term blocks')}</h3>
          <AdminMiniList
            items={blocks.slice(0, 8)}
            empty={adminCopy(lang, 'Nessun blocco attivo nei prossimi 30 giorni.', 'No active blocks in the next 30 days.')}
            render={(block) => <span><strong>{formatDateForMessage(block.date, lang)}</strong> · {adminAvailabilityStatusLabels[block.status]?.[lang] || block.status} · {block.experience_id ? adminExperienceLabel(block.experience_id, lang) : adminCopy(lang, 'Tutte', 'All')}</span>}
          />
          <div className="admin-quick-actions">
            <button type="button" onClick={() => setManualOpen(true)}>{adminCopy(lang, 'Aggiungi richiesta', 'Add request')}</button>
            <button type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Blocca data', 'Block date')}</button>
            <button type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Segna limitata', 'Mark limited')}</button>
            <button type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Segna su richiesta', 'Mark on request')}</button>
            <a href="/#availability" target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Apri calendario pubblico', 'Open public calendar')}</a>
            <button type="button" onClick={() => copyText(PHONE_TEL)}>{adminCopy(lang, 'Copia WhatsApp Leonardo', 'Copy Leonardo WhatsApp')}</button>
            <button type="button" onClick={() => copyText(EMAIL)}>{adminCopy(lang, 'Copia email', 'Copy business email')}</button>
          </div>
        </aside>
      </div>

      {decision && <DecisionModal lang={lang} session={session} decision={decision} onClose={() => setDecision(null)} onDone={(message) => { setDecision(null); refreshAll(message); }} />}
      {manualOpen && <ManualRequestModal lang={lang} session={session} onClose={() => setManualOpen(false)} onSaved={() => { setManualOpen(false); refreshAll(adminCopy(lang, 'Richiesta manuale creata.', 'Manual request created.')); }} />}
    </section>
  );
}

function bucketUpcomingRequests(requests) {
  const today = todayIso();
  const tomorrow = addDaysIso(1);
  const next7 = addDaysIso(7);
  const groups = [
    { key: 'today', title: { it: 'Oggi', en: 'Today' }, items: [] },
    { key: 'tomorrow', title: { it: 'Domani', en: 'Tomorrow' }, items: [] },
    { key: 'next7', title: { it: 'Prossimi 7 giorni', en: 'Next 7 days' }, items: [] },
    { key: 'later', title: { it: 'Più avanti', en: 'Later upcoming' }, items: [] }
  ];

  requests.forEach((request) => {
    if (!request.requested_date || request.requested_date < today) return;
    if (request.requested_date === today) groups[0].items.push(request);
    else if (request.requested_date === tomorrow) groups[1].items.push(request);
    else if (request.requested_date <= next7) groups[2].items.push(request);
    else groups[3].items.push(request);
  });

  return groups;
}

function UpcomingPage({ lang, session, navigate }) {
  const { requests, loading, error, refresh } = useAdminRequests({ status: 'accepted', limit: 500 });
  const [blocks, setBlocks] = useState([]);
  const [blocksError, setBlocksError] = useState('');

  async function loadBlocks() {
    try {
      const data = await listAvailabilityBlocks({ activeOnly: true, fromDate: todayIso(), toDate: addDaysIso(90) });
      setBlocks(data);
      setBlocksError('');
    } catch (err) {
      setBlocksError(err?.message || 'Could not load availability.');
    }
  }

  useEffect(() => { loadBlocks(); }, []);

  const upcoming = requests
    .filter((request) => request.status === 'accepted' && request.requested_date && request.requested_date >= todayIso())
    .sort((a, b) => String(a.requested_date).localeCompare(String(b.requested_date)) || String(a.created_at).localeCompare(String(b.created_at)));
  const groups = bucketUpcomingRequests(upcoming);
  const nearBlocks = blocks.filter((block) => block.date <= addDaysIso(30));

  async function refreshAll() {
    await refresh();
    await loadBlocks();
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Conferme owner', 'Owner confirmations')}</span>
          <h1>{adminCopy(lang, 'Prossime prenotazioni', 'Upcoming bookings')}</h1>
          <p>{adminCopy(lang, 'Richieste accettate e blocchi attivi, organizzati per giorno. Nessuna statistica: solo operatività.', 'Accepted requests and active blocks, organized by date. No analytics: just operations.')}</p>
        </div>
        <div className="admin-header-actions">
          <button className="button secondary" type="button" onClick={refreshAll}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
          <button className="button primary" type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Gestisci disponibilità', 'Manage availability')}</button>
        </div>
      </div>
      {(error || blocksError) && <div className="admin-alert error" role="alert">{error || blocksError}</div>}
      <div className="admin-two-column">
        <section className="admin-panel">
          <div className="admin-panel-header"><h2>{adminCopy(lang, 'Prenotazioni accettate', 'Accepted bookings')}</h2><span className="status-pill accepted">{upcoming.length}</span></div>
          {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : upcoming.length === 0 ? <p>{adminCopy(lang, 'Nessuna prenotazione accettata futura.', 'No future accepted bookings.')}</p> : (
            <div className="upcoming-group-list">
              {groups.map((group) => group.items.length > 0 && (
                <section className="upcoming-group" key={group.key}>
                  <h3>{group.title[lang]}</h3>
                  <div className="request-card-list compact-list">
                    {group.items.map((request) => <RequestCard key={request.id} request={request} lang={lang} compact />)}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
        <aside className="admin-panel compact-panel">
          <h2>{adminCopy(lang, 'Blocchi e limitazioni', 'Blocks and limitations')}</h2>
          <AdminMiniList
            items={nearBlocks}
            empty={adminCopy(lang, 'Nessun blocco attivo nei prossimi 30 giorni.', 'No active blocks in the next 30 days.')}
            render={(block) => <span><strong>{formatDateForMessage(block.date, lang)}</strong> · {adminAvailabilityStatusLabels[block.status]?.[lang] || block.status} · {block.experience_id ? adminExperienceLabel(block.experience_id, lang) : adminCopy(lang, 'Tutte le esperienze', 'All experiences')}</span>}
          />
          <div className="admin-quick-actions">
            <button type="button" onClick={() => navigate('/admin/today')}>{adminCopy(lang, 'Torna a oggi', 'Back to Today')}</button>
            <button type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Blocca / limita data', 'Block / limit date')}</button>
            <a href="/#availability" target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Apri calendario pubblico', 'Open public calendar')}</a>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SummaryCard({ label, value }) {
  return <article className="summary-card"><strong>{value}</strong><span>{label}</span></article>;
}

function AdminMiniList({ items, empty, render }) {
  if (!items.length) return <p className="small-note">{empty}</p>;
  return <ul className="admin-mini-list">{items.map((item) => <li key={item.id}>{render(item)}</li>)}</ul>;
}

function RequestCard({ request, lang, onApprove, onDecline, compact = false }) {
  return (
    <article className={`request-card ${compact ? 'compact' : ''}`}>
      <div className="request-card-head">
        <div>
          <h3>{request.customer_name || adminCopy(lang, 'Cliente senza nome', 'Unnamed customer')}</h3>
          <p>{request.customer_phone || '—'} · {request.customer_email || '—'}</p>
        </div>
        <span className={`status-pill ${request.status}`}>{requestStatusLabels[request.status]?.[lang] || request.status}</span>
      </div>
      <dl className="request-details-grid">
        <div><dt>{adminCopy(lang, 'Fonte', 'Source')}</dt><dd>{request.source || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Contatto', 'Contact')}</dt><dd>{request.preferred_contact || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Esperienza', 'Experience')}</dt><dd>{adminExperienceLabel(request.experience_id, lang)}</dd></div>
        <div><dt>{adminCopy(lang, 'Data richiesta', 'Requested date')}</dt><dd>{formatDateForMessage(request.requested_date, lang) || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Alternativa', 'Alternative')}</dt><dd>{formatDateForMessage(request.alternative_date, lang) || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Lingua', 'Language')}</dt><dd>{request.language || 'it'}</dd></div>
        <div><dt>{adminCopy(lang, 'Gruppo', 'Party')}</dt><dd>{[request.adults ? `${request.adults} adulti/adults` : '', request.children ? `${request.children} bambini/children` : ''].filter(Boolean).join(' · ') || request.party_type || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Privata', 'Private')}</dt><dd>{request.private_experience === true ? adminCopy(lang, 'Sì', 'Yes') : request.private_experience === false ? adminCopy(lang, 'No', 'No') : '-'}</dd></div>
      </dl>
      {request.children_under_3 && <div className="admin-alert warning compact-alert">{adminCopy(lang, 'Attenzione: bambini sotto i 3 anni. Percorso da valutare con particolare cura.', 'Warning: children under 3. Route must be assessed carefully.')}</div>}
      {request.message && <p className="request-message">{request.message}</p>}
      {request.admin_note && <p className="small-note"><strong>Note:</strong> {request.admin_note}</p>}
      <ReplyTools request={request} lang={lang} />
      {request.status === 'pending' && (
        <div className="request-actions">
          <button className="button primary" type="button" onClick={onApprove}>{adminCopy(lang, 'Approva', 'Approve')}</button>
          <button className="button secondary" type="button" onClick={onDecline}>{adminCopy(lang, 'Rifiuta', 'Decline')}</button>
        </div>
      )}
    </article>
  );
}

function ReplyTools({ request, lang }) {
  const [copied, setCopied] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const replyLang = request.language === 'en' ? 'en' : 'it';
  const approval = buildApprovalReply(request);
  const decline = buildDeclineReply(request);
  const prepared = request.status === 'declined' ? decline : approval;
  const type = request.status === 'declined' ? 'decline' : 'approval';
  const customerEmail = request.customer_email || '';
  const phone = normalizePhoneForWhatsApp(request.customer_phone);
  const phoneNeedsCountry = request.customer_phone && !hasLikelyCountryCode(request.customer_phone);
  const subject = replySubject(type, replyLang);

  async function copy(kind, value) {
    await copyText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(''), 1400);
  }

  return (
    <div className="reply-tools">
      <div className="reply-tool-buttons">
        {phone ? <a href={`https://wa.me/${phone}?text=${encode(prepared)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a> : <button type="button" onClick={() => copy('reply', prepared)}>{adminCopy(lang, 'Copia risposta', 'Copy reply')}</button>}
        <button type="button" onClick={() => setEmailOpen((open) => !open)}>{adminCopy(lang, 'Email', 'Email')}</button>
        <button type="button" onClick={() => copy('reply', prepared)}>{adminCopy(lang, 'Copia messaggio', 'Copy message')} {copied === 'reply' ? '· ✓' : ''}</button>
      </div>
      {phoneNeedsCountry && <p className="small-note">{adminCopy(lang, 'Il numero potrebbe richiedere il prefisso internazionale prima di aprire WhatsApp.', 'Phone number may need country code before opening WhatsApp.')}</p>}
      {emailOpen && (
        <div className="admin-email-panel">
          {customerEmail ? <a href={`mailto:${customerEmail}?subject=${encode(subject)}&body=${encode(prepared)}`}>{adminCopy(lang, 'Apri app email predefinita', 'Open default email app')}</a> : <span>{adminCopy(lang, 'Email cliente non disponibile.', 'Customer email unavailable.')}</span>}
          {customerEmail && <a href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encode(customerEmail)}&su=${encode(subject)}&body=${encode(prepared)}`} target="_blank" rel="noopener noreferrer">Gmail</a>}
          {customerEmail && <button type="button" onClick={() => copy('email', customerEmail)}>{adminCopy(lang, 'Copia email cliente', 'Copy customer email')} {copied === 'email' ? '· ✓' : ''}</button>}
          <button type="button" onClick={() => copy('reply', prepared)}>{adminCopy(lang, 'Copia messaggio preparato', 'Copy prepared message')}</button>
        </div>
      )}
    </div>
  );
}

function DecisionModal({ lang, session, decision, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [mode, setMode] = useState('accept-only');
  const [limitedScope, setLimitedScope] = useState('experience');
  const [reason, setReason] = useState('unavailable');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setLoading(true);
    setError('');
    try {
      if (decision.type === 'approve') {
        const result = await approveBookingRequest({ request: decision.request, userId: session.user.id, mode, decisionNote: note, limitedScope });
        if (result.availabilityError) {
          onDone(adminCopy(lang, 'Richiesta accettata, ma la disponibilità non è stata aggiornata. Blocca la data manualmente.', 'Request was accepted, but availability was not updated. Please block the date manually.'));
          return;
        }
        onDone(adminCopy(lang, 'Richiesta accettata.', 'Request accepted.'));
      } else {
        await declineBookingRequest({ request: decision.request, userId: session.user.id, decisionNote: note, reasonCategory: reason });
        onDone(adminCopy(lang, 'Richiesta rifiutata.', 'Request declined.'));
      }
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Azione non completata.', 'Action failed.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="decisionTitle">
        <div className="admin-modal-header">
          <h2 id="decisionTitle">{decision.type === 'approve' ? adminCopy(lang, 'Approva richiesta', 'Approve request') : adminCopy(lang, 'Rifiuta richiesta', 'Decline request')}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={text(lang, 'close')}>×</button>
        </div>
        <p>{decision.request.customer_name || adminCopy(lang, 'Cliente senza nome', 'Unnamed customer')} · {adminExperienceLabel(decision.request.experience_id, lang)} · {formatDateForMessage(decision.request.requested_date, lang) || '-'}</p>
        {decision.type === 'approve' ? (
          <>
            <label className="field-label" htmlFor="approvalMode">{adminCopy(lang, 'Opzione approvazione', 'Approval option')}</label>
            <select id="approvalMode" value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="accept-only">{adminCopy(lang, 'Accetta soltanto', 'Accept request only')}</option>
              <option value="close-experience">{adminCopy(lang, 'Accetta e chiudi questa esperienza', 'Accept and close this experience')}</option>
              <option value="close-global">{adminCopy(lang, 'Accetta e chiudi tutte le esperienze', 'Accept and close all experiences')}</option>
              <option value="limited">{adminCopy(lang, 'Accetta e segna disponibilità limitata', 'Accept and mark limited availability')}</option>
            </select>
            {mode === 'limited' && (
              <>
                <label className="field-label" htmlFor="limitedScope">{adminCopy(lang, 'Ambito limitazione', 'Limited scope')}</label>
                <select id="limitedScope" value={limitedScope} onChange={(event) => setLimitedScope(event.target.value)}>
                  <option value="experience">{adminCopy(lang, 'Solo esperienza selezionata', 'Selected experience only')}</option>
                  <option value="global">{adminCopy(lang, 'Tutte le esperienze', 'All experiences')}</option>
                </select>
              </>
            )}
          </>
        ) : (
          <>
            <label className="field-label" htmlFor="declineReason">{adminCopy(lang, 'Motivo', 'Reason')}</label>
            <select id="declineReason" value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="unavailable">{adminCopy(lang, 'Non disponibile', 'Unavailable')}</option>
              <option value="unsafe conditions">{adminCopy(lang, 'Condizioni non sicure', 'Unsafe conditions')}</option>
              <option value="unsuitable route">{adminCopy(lang, 'Percorso non adatto', 'Unsuitable route')}</option>
              <option value="duplicate request">{adminCopy(lang, 'Richiesta duplicata', 'Duplicate request')}</option>
              <option value="customer cancelled">{adminCopy(lang, 'Cliente ha annullato', 'Customer cancelled')}</option>
              <option value="other">{adminCopy(lang, 'Altro', 'Other')}</option>
            </select>
          </>
        )}
        <label className="field-label" htmlFor="decisionNote">{adminCopy(lang, 'Nota decisione', 'Decision note')}</label>
        <textarea id="decisionNote" value={note} onChange={(event) => setNote(event.target.value)} rows={4} />
        {error && <div className="admin-alert error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button className="button primary" type="button" onClick={confirm} disabled={loading}>{loading ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Conferma', 'Confirm')}</button>
          <button className="button secondary" type="button" onClick={onClose}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>
        </div>
      </section>
    </div>
  );
}

const emptyManualRequest = {
  customer_name: '', customer_phone: '', customer_email: '', preferred_contact: 'whatsapp', source: 'whatsapp', experience_id: 'unsure', requested_date: '', alternative_date: '', language: 'it', adults: '', children: '', children_under_3: false, private_experience: false, main_interest: '', preferred_pace: '', message: '', admin_note: ''
};

function ManualRequestModal({ lang, session, onClose, onSaved }) {
  const [form, setForm] = useState({ ...emptyManualRequest, language: lang });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!form.customer_name.trim() && !form.customer_phone.trim() && !form.customer_email.trim()) {
      setError(adminCopy(lang, 'Inserisci almeno nome o contatto.', 'Enter at least a name or contact method.'));
      return;
    }
    setLoading(true);
    try {
      await createManualBookingRequest(form, session.user.id);
      onSaved();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Richiesta non salvata.', 'Request not saved.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="admin-modal wide" role="dialog" aria-modal="true" aria-labelledby="manualRequestTitle">
        <div className="admin-modal-header">
          <h2 id="manualRequestTitle">{adminCopy(lang, 'Aggiungi richiesta manuale', 'Add manual request')}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={text(lang, 'close')}>×</button>
        </div>
        <form className="admin-form-grid" onSubmit={submit}>
          <AdminInput label={adminCopy(lang, 'Nome cliente', 'Customer name')} value={form.customer_name} onChange={(value) => update('customer_name', value)} />
          <AdminInput label="Phone / WhatsApp" value={form.customer_phone} onChange={(value) => update('customer_phone', value)} />
          <AdminInput label="Email" type="email" value={form.customer_email} onChange={(value) => update('customer_email', value)} />
          <AdminSelect label={adminCopy(lang, 'Contatto preferito', 'Preferred contact')} value={form.preferred_contact} onChange={(value) => update('preferred_contact', value)} options={['whatsapp', 'phone', 'email', 'unknown']} />
          <AdminSelect label={adminCopy(lang, 'Fonte', 'Source')} value={form.source} onChange={(value) => update('source', value)} options={['whatsapp', 'phone', 'email', 'manual']} />
          <AdminSelect label={adminCopy(lang, 'Esperienza', 'Experience')} value={form.experience_id} onChange={(value) => update('experience_id', value)} options={ADMIN_EXPERIENCE_OPTIONS} formatter={(value) => adminExperienceLabel(value, lang)} />
          <AdminInput label={adminCopy(lang, 'Data richiesta', 'Requested date')} type="date" value={form.requested_date} onChange={(value) => update('requested_date', value)} />
          <AdminInput label={adminCopy(lang, 'Data alternativa', 'Alternative date')} type="date" value={form.alternative_date} onChange={(value) => update('alternative_date', value)} />
          <AdminSelect label={adminCopy(lang, 'Lingua', 'Language')} value={form.language} onChange={(value) => update('language', value)} options={['it', 'en']} />
          <AdminInput label="Adults" type="number" value={form.adults} onChange={(value) => update('adults', value)} />
          <AdminInput label="Children" type="number" value={form.children} onChange={(value) => update('children', value)} />
          <label className="check-field"><input type="checkbox" checked={form.children_under_3} onChange={(event) => update('children_under_3', event.target.checked)} /> {adminCopy(lang, 'Bambini sotto i 3 anni', 'Children under 3')}</label>
          <label className="check-field"><input type="checkbox" checked={form.private_experience} onChange={(event) => update('private_experience', event.target.checked)} /> {adminCopy(lang, 'Esperienza privata', 'Private experience')}</label>
          <AdminInput label={adminCopy(lang, 'Interesse principale', 'Main interest')} value={form.main_interest} onChange={(value) => update('main_interest', value)} />
          <AdminInput label={adminCopy(lang, 'Ritmo preferito', 'Preferred pace')} value={form.preferred_pace} onChange={(value) => update('preferred_pace', value)} />
          <label className="admin-field full"><span>{adminCopy(lang, 'Messaggio / note cliente', 'Message / customer notes')}</span><textarea value={form.message} onChange={(event) => update('message', event.target.value)} rows={4} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Nota interna', 'Internal admin note')}</span><textarea value={form.admin_note} onChange={(event) => update('admin_note', event.target.value)} rows={3} /></label>
          {error && <div className="admin-alert error full" role="alert">{error}</div>}
          <div className="modal-actions full">
            <button className="button primary" type="submit" disabled={loading}>{loading ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Salva richiesta', 'Save request')}</button>
            <button className="button secondary" type="button" onClick={onClose}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AdminInput({ label, value, onChange, type = 'text' }) {
  const id = useMemo(() => `field-${Math.random().toString(36).slice(2)}`, []);
  return <label className="admin-field" htmlFor={id}><span>{label}</span><input id={id} type={type} value={value || ''} min={type === 'number' ? '0' : undefined} onChange={(event) => onChange(event.target.value)} /></label>;
}

function AdminSelect({ label, value, onChange, options, formatter = (item) => item }) {
  const id = useMemo(() => `field-${Math.random().toString(36).slice(2)}`, []);
  return <label className="admin-field" htmlFor={id}><span>{label}</span><select id={id} value={value || ''} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{formatter(option)}</option>)}</select></label>;
}

function RequestsPage({ lang, session }) {
  const [filters, setFilters] = useState({ status: 'all', experience_id: 'all', source: 'all', search: '', fromDate: '', toDate: '', limit: 250 });
  const { requests, loading, error, refresh } = useAdminRequests(filters);
  const [manualOpen, setManualOpen] = useState(false);
  const [decision, setDecision] = useState(null);
  const [feedback, setFeedback] = useState('');

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  async function refreshWithFeedback(message = '') {
    await refresh();
    if (message) setFeedback(message);
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Gestione richieste', 'Request management')}</span>
          <h1>{adminCopy(lang, 'Richieste', 'Requests')}</h1>
          <p>{adminCopy(lang, 'Cerca e filtra richieste da sito, WhatsApp, telefono o email.', 'Search and filter requests from the website, WhatsApp, phone, or email.')}</p>
        </div>
        <button className="button primary" type="button" onClick={() => setManualOpen(true)}>{adminCopy(lang, 'Aggiungi manuale', 'Add manual')}</button>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      <div className="admin-filter-bar">
        <input aria-label="Search" placeholder={adminCopy(lang, 'Cerca nome, telefono, email', 'Search name, phone, email')} value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} />
        <select aria-label="Status" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="all">{adminCopy(lang, 'Tutti gli stati', 'All statuses')}</option>{REQUEST_STATUSES.map((status) => <option key={status} value={status}>{requestStatusLabels[status][lang]}</option>)}</select>
        <select aria-label="Experience" value={filters.experience_id} onChange={(event) => updateFilter('experience_id', event.target.value)}><option value="all">{adminCopy(lang, 'Tutte le esperienze', 'All experiences')}</option>{ADMIN_EXPERIENCE_OPTIONS.map((id) => <option key={id} value={id}>{adminExperienceLabel(id, lang)}</option>)}</select>
        <select aria-label="Source" value={filters.source} onChange={(event) => updateFilter('source', event.target.value)}><option value="all">{adminCopy(lang, 'Tutte le fonti', 'All sources')}</option>{REQUEST_SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}</select>
        <input aria-label="From date" type="date" value={filters.fromDate} onChange={(event) => updateFilter('fromDate', event.target.value)} />
        <input aria-label="To date" type="date" value={filters.toDate} onChange={(event) => updateFilter('toDate', event.target.value)} />
      </div>
      <section className="admin-panel">
        <div className="admin-panel-header"><h2>{adminCopy(lang, 'Risultati', 'Results')} · {requests.length}</h2><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
        {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : requests.length === 0 ? <p>{adminCopy(lang, 'Nessuna richiesta trovata.', 'No requests found.')}</p> : (
          <div className="request-card-list compact-list">
            {requests.map((request) => <RequestCard key={request.id} request={request} lang={lang} compact onApprove={() => setDecision({ type: 'approve', request })} onDecline={() => setDecision({ type: 'decline', request })} />)}
          </div>
        )}
      </section>
      {decision && <DecisionModal lang={lang} session={session} decision={decision} onClose={() => setDecision(null)} onDone={(message) => { setDecision(null); refreshWithFeedback(message); }} />}
      {manualOpen && <ManualRequestModal lang={lang} session={session} onClose={() => setManualOpen(false)} onSaved={() => { setManualOpen(false); refreshWithFeedback(adminCopy(lang, 'Richiesta manuale creata.', 'Manual request created.')); }} />}
    </section>
  );
}

function AvailabilityPage({ lang, session }) {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [form, setForm] = useState({ date: '', experience_id: '', status: 'closed', reason_it: '', reason_en: '', internal_note: '' });

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const data = await listAvailabilityBlocks({ activeOnly: false });
      setBlocks(data);
    } catch (err) {
      setError(err?.message || 'Could not load availability blocks.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setFeedback('');
    if (!form.date || !form.status) {
      setError(adminCopy(lang, 'Data e stato sono obbligatori.', 'Date and status are required.'));
      return;
    }
    try {
      await createAvailabilityBlock({ ...form, created_by: session.user.id, updated_by: session.user.id });
      setForm({ date: '', experience_id: '', status: 'closed', reason_it: '', reason_en: '', internal_note: '' });
      setFeedback(adminCopy(lang, 'Disponibilità aggiornata.', 'Availability updated.'));
      refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Blocco non salvato.', 'Block not saved.'));
    }
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Calendario pubblico', 'Public calendar')}</span>
          <h1>{adminCopy(lang, 'Disponibilità', 'Availability')}</h1>
          <p>{adminCopy(lang, 'Blocca date, limita esperienze o segna date su richiesta. I blocchi inattivi non appaiono nel calendario pubblico.', 'Block dates, limit experiences, or mark dates as on request. Inactive blocks do not appear on the public calendar.')}</p>
        </div>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      <div className="admin-two-column availability-columns">
        <section className="admin-panel">
          <h2>{adminCopy(lang, 'Aggiungi blocco disponibilità', 'Add availability block')}</h2>
          <form className="admin-form-grid" onSubmit={submit}>
            <AdminInput label={adminCopy(lang, 'Data', 'Date')} type="date" value={form.date} onChange={(value) => update('date', value)} />
            <AdminSelect label={adminCopy(lang, 'Ambito', 'Scope')} value={form.experience_id} onChange={(value) => update('experience_id', value)} options={['', 'etna-premium', 'etna-learning', 'etna-live', 'etna-stories']} formatter={(value) => value ? adminExperienceLabel(value, lang) : adminCopy(lang, 'Tutte le esperienze', 'All experiences')} />
            <AdminSelect label={adminCopy(lang, 'Stato', 'Status')} value={form.status} onChange={(value) => update('status', value)} options={AVAILABILITY_STATUSES} formatter={(value) => adminAvailabilityStatusLabels[value][lang]} />
            <AdminInput label="Reason IT" value={form.reason_it || defaultReason(form.status, 'it')} onChange={(value) => update('reason_it', value)} />
            <AdminInput label="Reason EN" value={form.reason_en || defaultReason(form.status, 'en')} onChange={(value) => update('reason_en', value)} />
            <label className="admin-field full"><span>{adminCopy(lang, 'Nota interna', 'Internal note')}</span><textarea value={form.internal_note} onChange={(event) => update('internal_note', event.target.value)} rows={3} /></label>
            <div className="modal-actions full"><button className="button primary" type="submit">{adminCopy(lang, 'Salva blocco', 'Save block')}</button></div>
          </form>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-header"><h2>{adminCopy(lang, 'Blocchi esistenti', 'Existing blocks')}</h2><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
          {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : blocks.length === 0 ? <p>{adminCopy(lang, 'Nessun blocco salvato.', 'No saved blocks.')}</p> : (
            <div className="availability-block-list">
              {blocks.map((block) => <AvailabilityBlockCard key={block.id} block={block} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function AvailabilityBlockCard({ block, lang, userId, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ status: block.status, reason_it: block.reason_it || '', reason_en: block.reason_en || '', internal_note: block.internal_note || '' });
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try {
      await updateAvailabilityBlock(block.id, { ...form, updated_by: userId });
      setEditing(false);
      onChanged(adminCopy(lang, 'Blocco aggiornato.', 'Block updated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Aggiornamento non riuscito.', 'Update failed.'));
    }
  }

  async function deactivate() {
    setError('');
    try {
      await deactivateAvailabilityBlock(block.id, userId);
      onChanged(adminCopy(lang, 'Blocco disattivato.', 'Block deactivated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Disattivazione non riuscita.', 'Deactivate failed.'));
    }
  }

  return (
    <article className={`availability-block-card ${block.active ? '' : 'inactive'}`}>
      <div className="request-card-head">
        <div><h3>{formatDateForMessage(block.date, lang)}</h3><p>{block.experience_id ? adminExperienceLabel(block.experience_id, lang) : adminCopy(lang, 'Tutte le esperienze', 'All experiences')}</p></div>
        <span className={`status-pill ${block.status}`}>{adminAvailabilityStatusLabels[block.status]?.[lang] || block.status}</span>
      </div>
      {editing ? (
        <div className="admin-form-grid single-card-form">
          <AdminSelect label={adminCopy(lang, 'Stato', 'Status')} value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={AVAILABILITY_STATUSES} formatter={(value) => adminAvailabilityStatusLabels[value][lang]} />
          <AdminInput label="Reason IT" value={form.reason_it} onChange={(value) => setForm((current) => ({ ...current, reason_it: value }))} />
          <AdminInput label="Reason EN" value={form.reason_en} onChange={(value) => setForm((current) => ({ ...current, reason_en: value }))} />
          <label className="admin-field full"><span>{adminCopy(lang, 'Nota interna', 'Internal note')}</span><textarea value={form.internal_note} onChange={(event) => setForm((current) => ({ ...current, internal_note: event.target.value }))} rows={3} /></label>
          {error && <div className="admin-alert error full">{error}</div>}
          <div className="modal-actions full"><button className="button primary" type="button" onClick={save}>{adminCopy(lang, 'Salva', 'Save')}</button><button className="button secondary" type="button" onClick={() => setEditing(false)}>{adminCopy(lang, 'Annulla', 'Cancel')}</button></div>
        </div>
      ) : (
        <>
          <p>{block.reason_it || block.reason_en || '-'}</p>
          {block.internal_note && <p className="small-note"><strong>Internal:</strong> {block.internal_note}</p>}
          <p className="small-note">{block.active ? adminCopy(lang, 'Attivo', 'Active') : adminCopy(lang, 'Inattivo', 'Inactive')} · {adminCopy(lang, 'Creato', 'Created')} {formatDateForMessage(String(block.created_at || '').slice(0, 10), lang)}</p>
          {error && <div className="admin-alert error">{error}</div>}
          <div className="request-actions"><button className="button secondary" type="button" onClick={() => setEditing(true)}>{adminCopy(lang, 'Modifica', 'Edit')}</button>{block.active && <button className="button secondary" type="button" onClick={deactivate}>{adminCopy(lang, 'Disattiva / sblocca', 'Deactivate / unblock')}</button>}</div>
        </>
      )}
    </article>
  );
}

function App() {
  const [pathname, navigate] = usePathname();
  const [lang, setLang] = useState('it');
  const [formState, setFormState] = useState({ language: 'it', message: i18n.it.defaultMessage });
  const contactRef = useRef(null);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = lang === 'it' ? 'vulcanIQ | Esperienze sull\'Etna' : 'vulcanIQ | Mount Etna experiences';
    setFormState((current) => ({
      ...current,
      language: current.language || lang,
      message: current.message && current.message !== i18n.it.defaultMessage && current.message !== i18n.en.defaultMessage ? current.message : text(lang, 'defaultMessage')
    }));
  }, [lang]);

  function scrollToForm() {
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function fillForm({ experienceId, message, scroll = false }) {
    setFormState((current) => ({ ...current, experienceId: experienceId || current.experienceId, message: message || current.message, language: lang }));
    if (scroll) window.setTimeout(scrollToForm, 0);
  }

  if (pathname.startsWith('/admin')) {
    return <AdminRouter pathname={pathname} navigate={navigate} lang={lang} setLang={setLang} />;
  }

  return (
    <>
      <Header lang={lang} setLang={setLang} />
      <main ref={contactRef}>
        <Hero lang={lang} scrollToForm={scrollToForm} />
        <Philosophy lang={lang} />
        <ExperienceAccordion lang={lang} fillForm={fillForm} />
        <AvailabilityCalendar lang={lang} fillForm={fillForm} />
        <Questionnaire lang={lang} fillForm={fillForm} />
        <WearReviewsSafety lang={lang} />
        <Team lang={lang} />
        <FinalCTA lang={lang} />
        <ContactForm lang={lang} formState={formState} setFormState={setFormState} />
      </main>
      <Footer lang={lang} />
      <StickyMobileBar lang={lang} />
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
