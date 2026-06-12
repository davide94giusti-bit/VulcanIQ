import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { blockedDates, defaultExperienceAvailability } from './data/availability.js';
import { isSupabaseConfigured } from './lib/supabaseClient.js';
import { getAdminAccess, signInOwner, signOutOwner } from './services/adminAuth.js';
import { createPublicBookingRequest, createManualBookingRequest, listBookingRequests, updateBookingRequest, approveBookingRequest, declineBookingRequest, cancelBookingRequest } from './services/bookingRequests.js';
import { loadPublicAvailability, loadPublicFixedExcursions, listAvailabilityBlocks, createAvailabilityBlock, updateAvailabilityBlock, deactivateAvailabilityBlock, listFixedExcursions, createFixedExcursion, updateFixedExcursion, deactivateFixedExcursion, listMonthlyLeaflets, loadPublicMonthlyLeaflets, createMonthlyLeaflet, updateMonthlyLeaflet, deactivateMonthlyLeaflet, uploadMonthlyLeafletFile, removeMonthlyLeafletFile, uploadBlockedDatesFile, removeBlockedDatesFile, defaultReason } from './services/availabilityService.js';
import { loadPublicPartnerships, listPartnerships, createPartnership, updatePartnership, deactivatePartnership, uploadPartnershipImage, removePartnershipImage } from './services/partnershipService.js';
import { loadPublicReviews, submitPublicReview, listReviews, updateReviewVisibility, updateReviewAdminReply, deleteReviewAdminReply, deleteReview } from './services/reviewsService.js';
import { listSiteMedia, upsertSiteMedia, uploadSiteMediaFile, removeSiteMediaFile } from './services/siteMediaService.js';
import { loadPublicSiteContent, listSiteContent, upsertSiteContent } from './services/siteContentService.js';
import { listFinanceEntries, createFinanceEntry, updateFinanceEntry, archiveFinanceEntry } from './services/financeService.js';
import { listAnalyticsEvents, listAnalyticsSessions } from './services/analyticsService.js';
import { trackPageView, trackLanguageSwitch, trackExcursionView, trackExperienceCardView, trackExperienceDetailOpen, trackCalendarDateSelect, trackBookingFormOpen, trackBookingFormFieldStart, trackBookingSubmitAttempt, trackBookingSubmitValidationError, trackBookingSubmitSuccess, trackBookingSubmitError, trackContactClick, trackMapsClick, trackReviewView, trackEvent, startAnalyticsHeartbeat } from './analytics.js';
import { buildApprovalReply, buildDeclineReply, replySubject, requestLang, normalizePhoneForWhatsApp, hasLikelyCountryCode } from './services/replyMessages.js';
import './styles.css';

const PHONE_DISPLAY = '+39 334 929 8246';
const PHONE_WA = '393349298246';
const PHONE_TEL = '+393349298246';
const EMAIL = 'leo97ct@yahoo.it';
const INSTAGRAM = 'https://www.instagram.com/leonardo_chiavetta?igsh=bnhkNWQzbnF2aW5m';

const BRAND = {
  logo: '/brand/vulcaniq/vulcaniq-logo-premium.png',
  og: '/brand/vulcaniq/og-image.png'
};

const ADMIN_NAV_SECTIONS = [
  { key: 'today', path: '/admin/today', labelIt: 'Oggi', labelEn: 'Today', editable: true },
  { key: 'calendar', path: '/admin/calendar', labelIt: 'Calendario', labelEn: 'Calendar', editable: true },
  { key: 'upcoming', path: '/admin/upcoming', labelIt: 'Prossime', labelEn: 'Upcoming', editable: true },
  { key: 'requests', path: '/admin/requests', labelIt: 'Richieste', labelEn: 'Requests', editable: true },
  { key: 'availability', path: '/admin/availability', labelIt: 'Disponibilità', labelEn: 'Availability', editable: true },
  { key: 'partnerships', path: '/admin/partnerships', labelIt: 'Collaborazioni', labelEn: 'Collaborations', editable: true },
  { key: 'edit', path: '/admin/edit', labelIt: 'Modifica', labelEn: 'Edit', editable: true },
  { key: 'finance', path: '/admin/finance', labelIt: 'Finanze', labelEn: 'Finance', editable: true },
  { key: 'analytics', path: '/admin/analytics', labelIt: 'Dati', labelEn: 'Analytics', editable: true },
  { key: 'publicSite', path: '/', labelIt: 'Sito pubblico', labelEn: 'Public site', editable: true, external: true }
];

function adminNavLabel(section, lang) {
  return lang === 'it' ? section.labelIt : section.labelEn;
}

function isAdminNavSectionActive(normalizedPath, section) {
  if (!section || section.external) return false;
  if (section.key === 'analytics') return normalizedPath.includes('/analytics') || normalizedPath.includes('/data');
  if (section.key === 'edit') return normalizedPath.includes('/edit') || normalizedPath.includes('/website') || normalizedPath.includes('/content') || normalizedPath.includes('/media');
  if (section.key === 'partnerships') return normalizedPath.includes('/partnerships');
  return normalizedPath.includes(`/${section.key}`);
}

function adminPathFromLocation(pathname) {
  const normalizedPath = pathname === '/admin' ? '/admin/today' : pathname;
  return ADMIN_NAV_SECTIONS.find((section) => !section.external && isAdminNavSectionActive(normalizedPath, section))?.path || '/admin/today';
}

const MEDIA = {
  premium: '/images/vulcaniq/etna-premium.jpeg',
  stories: '/images/vulcaniq/etna-stories.jpeg',
  live: '/images/vulcaniq/etna-live.jpeg',
  learning: '/images/vulcaniq/etna-learning.jpeg',
  leonardo: '/images/vulcaniq/leonardo-guide.jpeg',
  liveSafe: '/images/vulcaniq/etna-live-safe.jpeg',
  landscape: '/images/vulcaniq/landscape.jpeg',
  lavaRock: '/images/vulcaniq/lava-rock.jpeg',
  guide: '/images/vulcaniq/guide.jpeg',
  naturalLight: '/images/vulcaniq/natural-light.jpeg',
  introVideo: '/videos/vulcaniq/intro.mp4'
};

let bodyScrollLockCount = 0;
let bodyScrollLockSnapshot = null;

function useBodyScrollLock(isLocked) {
  useEffect(() => {
    if (!isLocked || typeof document === 'undefined') return undefined;

    if (bodyScrollLockCount === 0) {
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      bodyScrollLockSnapshot = {
        overflow: document.body.style.overflow,
        paddingRight: document.body.style.paddingRight,
        position: document.body.style.position,
        top: document.body.style.top,
        left: document.body.style.left,
        right: document.body.style.right,
        width: document.body.style.width,
        scrollY
      };
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.classList.add('modal-scroll-lock');
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    bodyScrollLockCount += 1;

    return () => {
      bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
      if (bodyScrollLockCount === 0 && bodyScrollLockSnapshot) {
        const restoreScrollY = bodyScrollLockSnapshot.scrollY || 0;
        document.body.style.overflow = bodyScrollLockSnapshot.overflow;
        document.body.style.paddingRight = bodyScrollLockSnapshot.paddingRight;
        document.body.style.position = bodyScrollLockSnapshot.position;
        document.body.style.top = bodyScrollLockSnapshot.top;
        document.body.style.left = bodyScrollLockSnapshot.left;
        document.body.style.right = bodyScrollLockSnapshot.right;
        document.body.style.width = bodyScrollLockSnapshot.width;
        document.body.classList.remove('modal-scroll-lock');
        bodyScrollLockSnapshot = null;
        window.scrollTo(0, restoreScrollY);
      }
    };
  }, [isLocked]);
}


function buildMediaMap(items = []) {
  return (items || []).reduce((acc, item) => {
    if (item?.media_key && item?.file_url) acc[item.media_key] = item;
    return acc;
  }, {});
}

function mediaUrl(siteMedia, key, fallback) {
  return siteMedia?.[key]?.file_url || fallback;
}

function mediaAlt(siteMedia, key, lang, fallback) {
  const item = siteMedia?.[key];
  return (lang === 'it' ? item?.alt_it || item?.alt_en : item?.alt_en || item?.alt_it) || fallback;
}

function experienceMediaKey(id) {
  const map = {
    'etna-premium': 'default_experience_premium_image',
    'etna-learning': 'default_experience_learning_image',
    'etna-live': 'default_experience_live_image',
    'etna-stories': 'default_experience_stories_image'
  };
  return map[id] || '';
}


const i18n = {
  it: {
    languageLabel: 'Italiano',
    switchLabel: 'EN',
    nav: ['Inizio', 'Escursioni', 'Collaborazioni', 'Chi siamo', 'Recensioni', 'Contattaci'],
    contact: 'Contattaci',
    heroKicker: '',
    heroTitle: "L'Etna non è solo uno scenario.",
    heroLead: 'Esperienze private e fisse sull’Etna per leggere il vulcano come territorio vivo: con conoscenza, sicurezza e relazione umana.',
    findExperience: "Trova l'esperienza giusta",
    viewAvailability: 'Guarda le disponibilità',
    call: 'Chiama Leonardo',
    whatsapp: 'Scrivici su WhatsApp',
    email: "Invia un'email",
    trust: ['Guida vulcanologica certificata'],
    guideLicenseAria: 'Apri la licenza della guida vulcanologica Leonardo Chiavetta',
    philosophyKicker: 'Filosofia',
    philosophyTitle: 'Perché un luogo non si visita davvero finché non si entra in relazione con ciò che lo rende vivo.',
    philosophyText: `vulcanIQ nasce da un’esigenza di fermarsi e cambiare prospettiva. Dopo anni a contatto con il turismo di massa, è emersa una domanda semplice ma potente: è davvero questo il modo di vivere un luogo come l’Etna?

Da lì è iniziato un percorso diverso. Il desiderio di rallentare, di osservare davvero, di restituire valore a ciò che spesso viene attraversato troppo in fretta.

Non più solo accompagnare, ma trasmettere. Non più mostrare, ma far comprendere.

È così che prende forma un modo nuovo di vivere la Sicilia: attraverso le storie di chi la abita, i gesti quotidiani, le tradizioni che resistono nel tempo. Lontano dai percorsi più battuti, vicino alle persone, ai dettagli, alle connessioni autentiche.`,
    mission: 'Missione',
    missionText: 'vulcanIQ nasce per trasformare il modo in cui le persone vivono l’Etna: non come una semplice destinazione da visitare, ma come un territorio da ascoltare, comprendere e ricordare. La nostra missione è creare esperienze autentiche, curate e profondamente umane, capaci di unire natura, cultura locale, racconti e relazioni vere.',
    vision: 'Visione',
    visionText: 'Crediamo in un turismo che non consumi il territorio, ma lo ascolti. Un modo più autentico di vivere l’Etna, fatto di connessione, rispetto e ricordi che restano.',
    readMore: 'Leggi di più',
    hide: 'Riduci',
    experiencesKicker: 'Escursioni',
    experiencesTitle: 'Escursioni sull’Etna, pensate su misura.',
    experiencesIntro: 'Scegli il modo più adatto per vivere il vulcano: esperienze private, formative o condivise, sempre guidate con attenzione, sicurezza e conoscenza del territorio.',
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
    availabilityTitle: 'Scegli tra escursioni fisse e richieste private.',
    availabilityIntro: 'Le escursioni fisse hanno posti limitati; le richieste private seguono disponibilità, meteo, ordinanze, condizioni vulcaniche e valutazione della guida.',
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
    reviewsTitle: 'Recensioni di chi ha vissuto l’Etna con noi.',
    reviewsIntro: '',
    safetyKicker: 'Sicurezza',
    safetyTitle: 'Condizioni, prudenza e valutazione reale.',
    safetyIntro: 'Ogni esperienza è confermata solo se meteo, accessibilità, ordinanze e attività vulcanica lo permettono.',
    teamKicker: 'Team',
    teamTitle: 'Un progetto piccolo, curato e umano.',
    leonardoRole: 'Fondatore · guida ambientale e vulcanologica',
    leonardoBio: 'Fondatore e ideatore di vulcanIQ, è guida ambientale dal 2020 e guida vulcanologica dal 2024. Accompagna le persone alla scoperta dell’Etna attraverso racconti, natura e osservazione del territorio, con l’obiettivo di trasformare ogni esperienza in qualcosa di autentico, emozionale e profondamente umano.',
    coFounderName: 'Deborah Giusti',
    coFounderRole: 'Co-fondatrice · qualità del servizio, scuole e aziende',
    coFounderBio: 'Da oltre 8 anni nel mondo dell’insegnamento e con esperienza come analista aziendale, Deborah unisce empatia, organizzazione e attenzione ai dettagli per creare esperienze autentiche e di valore. In vulcanIQ si occupa della qualità del servizio e dello sviluppo di percorsi dedicati a scuole e aziende, progettando attività capaci di unire scoperta, coinvolgimento e crescita personale.',
    coFounderAlt: 'Deborah, co-founder vulcanIQ',
    finalTitle: 'Parla con Leonardo prima di scegliere.',
    finalText: 'Racconta date, interessi e composizione del gruppo: riceverai una proposta realistica, non un pacchetto standard.',
    formKicker: 'Modulo contatto',
    formTitle: 'Prepara la richiesta.',
    formIntro: 'Scegli una data fissa o una richiesta privata, indica il numero di persone e lascia un contatto: il team risponderà direttamente.',
    submitRequest: 'Invia richiesta',
    requestSent: 'La tua richiesta è stata inviata. Leonardo o il team vulcanIQ ti risponderà direttamente.',
    requestFallbackError: 'Non siamo riusciti a salvare la richiesta automaticamente. Puoi contattarci su WhatsApp o email.',
    contactRequired: 'Inserisci almeno telefono o email.',
    requestDetailsRequired: 'Inserisci un messaggio oppure seleziona esperienza o data.',
    heardAboutUs: 'Dove hai sentito parlare di vulcanIQ?',
    heardAboutUsAdmin: 'Dove ha sentito parlare di vulcanIQ?',
    heardAboutUsPlaceholder: 'Seleziona qui',
    heardAboutUsRequired: 'Seleziona dove hai sentito parlare di vulcanIQ.',
    heardAboutUsModalIntro: 'Seleziona un’opzione prima di continuare.',
    heardAboutUsOtherLabel: 'Specifica dove hai sentito parlare di vulcanIQ',
    heardAboutUsOtherPlaceholder: 'Scrivi dove hai conosciuto vulcanIQ',
    heardAboutUsOtherRequired: 'Specifica dove hai sentito parlare di vulcanIQ.',
    heardAboutUsMessagePrefix: 'Ho sentito parlare di vulcanIQ da',
    continue: 'Continua',
    cancel: 'Annulla',
    continueWhatsapp: 'Continua su WhatsApp',
    callNow: 'Chiama ora',
    writeEmail: 'Scrivi email',
    phone: 'Telefono / WhatsApp',
    contactEmail: 'Email',
    preferredContact: 'Contatto preferito',
    requestedDate: 'Data richiesta',
    alternativeDate: 'Data alternativa',
    adults: 'Adulti',
    childrenCount: 'Bambini',
    childrenUnder3: 'Bambini sotto i 3 anni',
    privateExperience: 'Escursione privata',
    name: 'Nome',
    preferredLanguage: 'Lingua preferita',
    selectedExperience: 'Esperienza selezionata',
    requestMode: 'Tipo di richiesta',
    fixedExcursion: 'Escursione fissa',
    privateExcursion: 'Escursione privata',
    fixedExcursions: 'Escursioni fisse',
    privateExcursions: 'Escursioni private',
    upcomingExcursions: 'Prossime escursioni',
    upcomingEmpty: 'Al momento non ci sono escursioni programmate. Contattaci per organizzare un’esperienza privata.',
    dateLabel: 'Data',
    bookedBy: 'Prenotato da',
    reviewDateLabel: 'Data',
    guideLabel: 'Guida',
    timeLabel: 'Orario',
    experienceLabel: 'Esperienza',
    meetingPoint: 'Punto d’incontro',
    meetingPointDirections: 'Punto d’incontro - premi per indicazioni',
    meetingPointDirectionsHint: 'Apri indicazioni su Google Maps',
    difficulty: 'Difficoltà',
    priceNote: 'Nota prezzo',
    requestAvailability: 'Richiedi disponibilità',
    partnershipsTitle: 'Collaborazioni',
    partnershipsSubtitle: '',
    partnershipsEmpty: 'Al momento non ci sono collaborazioni pubblicate.',
    visitWebsite: 'Visita il sito',
    activeCollaborations: 'Partnership attive',
    chooseFixedExcursion: 'Scegli escursione fissa',
    viewFixedExcursionOptions: 'Vedi opzioni escursioni fisse',
    viewPrivateExcursionOptions: 'Vedi opzioni escursioni private',
    fixedExcursionOptionsTitle: 'Opzioni escursioni fisse',
    privateExcursionOptionsTitle: 'Opzioni escursioni private',
    fixedExcursionOptionsIntro: 'Sfoglia le escursioni programmate per il mese selezionato. Tocca un volantino per vedere tutti i dettagli.',
    privateExcursionOptionsIntro: 'Esplora le esperienze private. Tocca una scheda per vedere tutti i dettagli.',
    noFixedExcursionLeaflets: 'Non ci sono ancora volantini per escursioni fisse disponibili per questo mese.',
    noPrivateExcursionOptions: 'Non ci sono ancora opzioni di escursione privata disponibili.',
    currentMonth: 'Mese corrente',
    useThisOptionInRequest: 'Usa questa opzione nella richiesta',
    noFixedExcursions: 'Nessuna escursione fissa attiva al momento.',
    placesRemaining: 'Posti disponibili',
    placesAvailable: 'Posti disponibili',
    capacityLabel: 'Capienza',
    totalPeople: 'Totale persone',
    partyType: 'Tipo di gruppo',
    soloTraveler: 'Singolo',
    contactGuideOver12: 'Per gruppi superiori a 12 persone, contatta direttamente la guida per valutare l’esperienza più adatta.',
    peopleRequired: 'Inserisci almeno una persona nella richiesta.',
    fixedDateRequired: 'Seleziona un’escursione fissa disponibile.',
    reviewOriginalLabel: 'Recensione originale in inglese',
    leaveReviewTitle: 'Pubblica una recensione',
    leaveReviewIntro: 'Inserisci il codice prenotazione ricevuto dopo la conferma per pubblicare una recensione.',
    bookingCode: 'Codice prenotazione',
    reviewerName: 'Nome',
    rating: 'Valutazione',
    reviewText: 'Recensione',
    submitReview: 'Pubblica una recensione',
    reviewSent: 'Grazie. La recensione è stata pubblicata.',
    invalidBookingCode: 'Codice prenotazione non valido.',
    bookingCodeUsed: 'È già stata inviata una recensione per questo codice prenotazione.',
    reviewTextRequired: 'Inserisci il testo della recensione.',
    noPublicReviews: 'Non ci sono ancora recensioni pubblicate.',
    blockedDatesCalendar: 'Calendario date occupate',
    unavailableDates: 'Date non disponibili',
    openCalendarFile: 'Apri calendario',
    gearExtra: 'In base al periodo e al tipo di escursione, vi verranno fornite ulteriori informazioni sull’attrezzatura necessaria.',
    message: 'Messaggio',
    sendWhatsapp: 'Invia su WhatsApp',
    sendEmail: 'Email',
    selectExperience: 'Seleziona esperienza',
    instagram: 'Seguici su Instagram',
    footerText: '',
    realPhotoPlaceholder: 'Real Etna photo placeholder',
    replaceWith: 'Replace with',
    heroAlt: 'Escursione guidata sull’Etna durante attività vulcanica osservata da distanza sicura',
    liveAlt: 'Gruppo con guida vulcanologica osserva l’attività dell’Etna da terreno lavico sicuro',
    safetyAlt: 'Paesaggio vulcanico dell’Etna con terreno lavico e condizioni controllate',
    gallery01Alt: 'Dettaglio di roccia lavica nera sull’Etna',
    gallery02Alt: 'Sentiero vulcanico etneo con guida a distanza sicura',
    gallery03Alt: 'Paesaggio dell’Etna con luce naturale e terreno lavico',
    emailSubject: 'Richiesta esperienza vulcanIQ sull’Etna',
    defaultMessage: 'Ciao Leonardo,\nvorrei informazioni su un’esperienza vulcanIQ sull’Etna.\n\nVorrei sapere disponibilità, durata indicativa, prezzo e consigli sull’abbigliamento.\n\nGrazie.',
    excursionCalendar: 'Calendario escursioni',
    availableDates: 'Date disponibili',
    scheduledExcursion: 'Escursione programmata',
    pastDates: 'Date passate',
    programForDate: 'Programma del giorno',
    monthlyProgramPrefix: 'Programma di',
    openProgram: 'Apri programma',
    closeProgram: 'Chiudi programma',
    unavailableDatesLegend: 'Date non disponibili',
    dateDetails: 'Dettagli',
    noExcursionsOnDate: 'Nessuna escursione programmata per questa data.',
    availableDatePrivateCopy: 'Puoi richiedere un’esperienza privata o su misura.',
    requestInformation: 'Richiedi informazioni',
    openExcursionProgram: 'Apri programma mensile',
    publishReview: 'Pubblica una recensione',
    missionHero: 'Non accompagniamo solo persone sull’Etna. Creiamo un modo più attento di incontrarlo.',
    missionShort: 'vulcanIQ nasce per trasformare l’escursione in un’esperienza di ascolto, conoscenza e relazione con il territorio.',
    valuesTitle: 'Principi',
    values: ['Ascolto del territorio', 'Sicurezza prima di tutto', 'Esperienze su misura', 'Cultura locale', 'Ritmo umano', 'Relazione autentica']
  },
  en: {
    languageLabel: 'English',
    switchLabel: 'IT',
    nav: ['Home', 'Excursions', 'Partnerships', 'Who we are', 'Reviews', 'Contact us'],
    contact: 'Contact us',
    heroKicker: '',
    heroTitle: 'Mount Etna is not just a backdrop.',
    heroLead: 'Private and fixed Mount Etna experiences that help guests read the volcano as a living territory: with knowledge, safety, and human connection.',
    findExperience: 'Find the right experience',
    viewAvailability: 'View availability',
    call: 'Call Leonardo',
    whatsapp: 'Message on WhatsApp',
    email: 'Send an email',
    trust: ['Certified volcanological guide'],
    guideLicenseAria: "Open Leonardo Chiavetta's certified volcanological guide license",
    philosophyKicker: 'Philosophy',
    philosophyTitle: 'Because a place is not truly visited until you enter into relationship with what makes it alive.',
    philosophyText: `vulcanIQ was born from the need to pause and change perspective. After years in contact with mass tourism, one simple but powerful question emerged: is this really the way to experience a place like Mount Etna?

From there, a different path began. A desire to slow down, to truly observe, and to restore value to what is too often crossed too quickly.

Not only to accompany, but to transmit. Not only to show, but to help people understand.

This is how a new way of experiencing Sicily takes shape: through the stories of those who live here, everyday gestures, and traditions that endure over time. Far from the most beaten paths, close to people, details, and authentic connections.`,
    mission: 'Mission',
    missionText: 'vulcanIQ was created to transform the way people experience Mount Etna: not as a simple destination to visit, but as a territory to listen to, understand, and remember. Our mission is to create authentic, carefully curated, and deeply human experiences that bring together nature, local culture, storytelling, and genuine connection.',
    vision: 'Vision',
    visionText: 'We believe in a form of tourism that does not consume the territory, but listens to it. A more authentic way to experience Mount Etna, made of connection, respect, and memories that remain.',
    readMore: 'Read more',
    hide: 'Collapse',
    experiencesKicker: 'Experiences',
    experiencesTitle: 'Etna experiences, shaped around you.',
    experiencesIntro: 'Choose the most suitable way to experience the volcano: private, educational or shared experiences, always guided with care, safety and local knowledge.',
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
    availabilityTitle: 'Choose between fixed excursions and private requests.',
    availabilityIntro: 'Fixed excursions have limited places; private requests depend on availability, weather, official regulations, volcanic conditions, and guide assessment.',
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
    reviewsTitle: 'Reviews from people who experienced Etna with us.',
    reviewsIntro: '',
    safetyKicker: 'Safety',
    safetyTitle: 'Conditions, prudence, and real assessment.',
    safetyIntro: 'Every experience is confirmed only if weather, access, regulations, and volcanic activity allow it.',
    teamKicker: 'Team',
    teamTitle: 'A small, curated, human project.',
    leonardoRole: 'Founder · environmental and volcanological guide',
    leonardoBio: 'Founder and creator of vulcanIQ, Leonardo has been an environmental guide since 2020 and a volcanological guide since 2024. He accompanies people in discovering Mount Etna through stories, nature, and observation of the territory, with the aim of transforming every experience into something authentic, emotional, and deeply human.',
    coFounderName: 'Deborah Giusti',
    coFounderRole: 'Co-founder · service quality, schools and companies',
    coFounderBio: 'With more than 8 years in education and experience as a business analyst, Deborah combines empathy, organization, and attention to detail to create authentic and valuable experiences. At vulcanIQ, she focuses on service quality and the development of programs for schools and companies, designing activities that bring together discovery, engagement, and personal growth.',
    coFounderAlt: 'Deborah, vulcanIQ co-founder',
    finalTitle: 'Talk to Leonardo before choosing.',
    finalText: 'Share dates, interests, and group composition: you will receive a realistic proposal, not a standard package.',
    formKicker: 'Contact form',
    formTitle: 'Prepare your request.',
    formIntro: 'Choose a fixed date or a private request, add the number of people, and leave a contact: the team will reply directly.',
    submitRequest: 'Submit request',
    requestSent: 'Your request has been sent. Leonardo or the vulcanIQ team will reply directly.',
    requestFallbackError: 'We could not save the request automatically. You can contact us by WhatsApp or email.',
    contactRequired: 'Enter at least phone or email.',
    requestDetailsRequired: 'Enter a message or select an experience or date.',
    heardAboutUs: 'Where did you hear about vulcanIQ?',
    heardAboutUsAdmin: 'Where did the customer hear about vulcanIQ?',
    heardAboutUsPlaceholder: 'Select here',
    heardAboutUsRequired: 'Please select where you heard about vulcanIQ.',
    heardAboutUsModalIntro: 'Select an option before continuing.',
    heardAboutUsOtherLabel: 'Please specify where you heard about vulcanIQ',
    heardAboutUsOtherPlaceholder: 'Write where you discovered vulcanIQ',
    heardAboutUsOtherRequired: 'Please specify where you heard about vulcanIQ.',
    heardAboutUsMessagePrefix: 'I heard about vulcanIQ from',
    continue: 'Continue',
    cancel: 'Cancel',
    continueWhatsapp: 'Continue to WhatsApp',
    callNow: 'Call now',
    writeEmail: 'Write email',
    phone: 'Phone / WhatsApp',
    contactEmail: 'Email',
    preferredContact: 'Preferred contact',
    requestedDate: 'Requested date',
    alternativeDate: 'Alternative date',
    adults: 'Adults',
    childrenCount: 'Children',
    childrenUnder3: 'Children under 3',
    privateExperience: 'Private excursion',
    name: 'Name',
    preferredLanguage: 'Preferred language',
    selectedExperience: 'Selected experience',
    requestMode: 'Request type',
    fixedExcursion: 'Fixed excursion',
    privateExcursion: 'Private excursion',
    fixedExcursions: 'Fixed excursions',
    privateExcursions: 'Private excursions',
    upcomingExcursions: 'Upcoming excursions',
    upcomingEmpty: 'There are currently no scheduled excursions. Contact us to arrange a private experience.',
    dateLabel: 'Date',
    bookedBy: 'Booked by',
    reviewDateLabel: 'Date',
    guideLabel: 'Guide',
    timeLabel: 'Time',
    experienceLabel: 'Experience',
    meetingPoint: 'Meeting point',
    meetingPointDirections: 'Meeting point - tap for directions',
    meetingPointDirectionsHint: 'Open directions in Google Maps',
    difficulty: 'Difficulty',
    priceNote: 'Price note',
    requestAvailability: 'Request availability',
    partnershipsTitle: 'Partnerships',
    partnershipsSubtitle: '',
    partnershipsEmpty: 'There are currently no published partnerships.',
    visitWebsite: 'Visit website',
    activeCollaborations: 'Active collaborations',
    chooseFixedExcursion: 'Choose fixed excursion',
    viewFixedExcursionOptions: 'View fixed excursion options',
    viewPrivateExcursionOptions: 'View private excursion options',
    fixedExcursionOptionsTitle: 'Fixed excursion options',
    privateExcursionOptionsTitle: 'Private excursion options',
    fixedExcursionOptionsIntro: 'Browse the scheduled excursion options for the selected month. Tap a leaflet to view the full details.',
    privateExcursionOptionsIntro: 'Explore the private excursion experiences. Tap a card to view the full details.',
    noFixedExcursionLeaflets: 'No fixed excursion leaflets are available for this month yet.',
    noPrivateExcursionOptions: 'No private excursion options are available yet.',
    currentMonth: 'Current month',
    useThisOptionInRequest: 'Use this option in my request',
    noFixedExcursions: 'No active fixed excursions at the moment.',
    placesRemaining: 'Places remaining',
    placesAvailable: 'Places available',
    capacityLabel: 'Capacity',
    totalPeople: 'Total people',
    partyType: 'Party type',
    soloTraveler: 'Solo traveler',
    contactGuideOver12: 'For groups larger than 12 people, please contact the guide directly so we can evaluate the most suitable experience.',
    peopleRequired: 'Enter at least one person in the request.',
    fixedDateRequired: 'Select an available fixed excursion.',
    reviewOriginalLabel: 'Original review in English',
    leaveReviewTitle: 'Publish a review',
    leaveReviewIntro: 'Enter the booking code you received after confirmation to publish a review.',
    bookingCode: 'Booking code',
    reviewerName: 'Name',
    rating: 'Rating',
    reviewText: 'Review',
    submitReview: 'Publish a review',
    reviewSent: 'Thank you. Your review has been published.',
    invalidBookingCode: 'Invalid booking code.',
    bookingCodeUsed: 'A review has already been submitted for this booking code.',
    reviewTextRequired: 'Enter your review text.',
    noPublicReviews: 'There are no public reviews yet.',
    blockedDatesCalendar: 'Blocked dates calendar',
    unavailableDates: 'Unavailable dates',
    openCalendarFile: 'Open calendar',
    gearExtra: 'Depending on the season and the type of excursion, you will receive further information about the necessary equipment.',
    message: 'Message',
    sendWhatsapp: 'Send on WhatsApp',
    sendEmail: 'Email',
    selectExperience: 'Select experience',
    instagram: 'Follow on Instagram',
    footerText: '',
    realPhotoPlaceholder: 'Real Etna photo placeholder',
    replaceWith: 'Replace with',
    heroAlt: 'Guided Mount Etna excursion during volcanic activity observed from a safe distance',
    liveAlt: 'Group with volcanological guide observing Etna activity from safe lava terrain',
    safetyAlt: 'Mount Etna volcanic landscape with lava terrain and controlled conditions',
    gallery01Alt: 'Black lava rock detail on Mount Etna',
    gallery02Alt: 'Etna volcanic trail with guide at a safe distance',
    gallery03Alt: 'Mount Etna landscape with natural light and lava terrain',
    emailSubject: 'vulcanIQ Mount Etna experience request',
    defaultMessage: 'Hi Leonardo,\nI would like more information about a vulcanIQ experience on Mount Etna.\n\nI would like to know availability, approximate duration, price, and clothing recommendations.\n\nThank you.',
    excursionCalendar: 'Excursion calendar',
    availableDates: 'Available dates',
    scheduledExcursion: 'Scheduled excursion',
    pastDates: 'Past dates',
    programForDate: 'Day program',
    monthlyProgramPrefix: '',
    openProgram: 'Open program',
    closeProgram: 'Close program',
    unavailableDatesLegend: 'Unavailable dates',
    dateDetails: 'Details',
    noExcursionsOnDate: 'No scheduled excursion is currently planned for this date.',
    availableDatePrivateCopy: 'You can request a private or tailored experience.',
    requestInformation: 'Request information',
    openExcursionProgram: 'Open monthly schedule',
    publishReview: 'Publish a review',
    missionHero: 'We do not simply guide people on Etna. We create a more mindful way to encounter it.',
    missionShort: 'vulcanIQ was created to transform an excursion into an experience of listening, knowledge and connection with the territory.',
    valuesTitle: 'Principles',
    values: ['Listening to the territory', 'Safety first', 'Tailored experiences', 'Local culture', 'Human pace', 'Authentic connection']
  }
};

const experiences = [
  {
    id: 'etna-premium',
    title: 'Etna Premium',
    image: MEDIA.premium,
    summary: {
      it: 'Percorso privato, curato e modulato sul ritmo del gruppo.',
      en: 'Private, curated experience adapted to the group’s pace.'
    },
    bestFor: { it: 'singolo, coppie, piccoli gruppi, ospiti che cercano esclusività', en: 'solo traveler, couples, small groups, guests looking for exclusivity' },
    starting: { it: 'su richiesta', en: 'on request' },
    description: {
      it: 'Un’esperienza lenta, riservata e personalizzata per vivere l’Etna con più cura, più tempo e una relazione diretta con la guida.',
      en: 'A slow, private, tailored experience to explore Etna with more care, more time, and direct guide attention.'
    },
    value: { it: 'esperienze personalizzate per vivere l’Etna in modo esclusivo', en: 'personalized experiences to discover Mount Etna in an exclusive way' },
    notes: { it: 'Durata, quota e percorso vengono definiti dopo una breve valutazione del gruppo.', en: 'Duration, altitude, and route are defined after a brief group assessment.' },
    safety: { it: 'La guida valuta meteo, ordinanze e condizioni vulcaniche prima della conferma.', en: 'The guide assesses weather, regulations, and volcanic conditions before confirmation.' },
    reason: { it: 'cerco un percorso privato, curato e adatto al mio ritmo', en: 'I am looking for a private, curated experience suited to my pace' }
  },
  {
    id: 'etna-learning',
    title: 'Etna Learning',
    image: MEDIA.learning,
    summary: {
      it: 'Esperienze educative per famiglie, scuole, aziende e gruppi.',
      en: 'Educational experiences for families, schools, companies, and groups.'
    },
    bestFor: { it: 'singolo, famiglie, scuole, team aziendali, gruppi curiosi', en: 'solo traveler, families, schools, company teams, curious groups' },
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
    image: MEDIA.live,
    summary: {
      it: 'Osservazione responsabile dell’attività vulcanica da distanza sicura.',
      en: 'Responsible observation of volcanic activity from a safe distance.'
    },
    bestFor: { it: 'singolo, appassionati di vulcani, fotografi, ospiti flessibili', en: 'solo traveler, volcano enthusiasts, photographers, flexible guests' },
    starting: { it: 'su richiesta e condizioni', en: 'on request and conditions-based' },
    description: {
      it: 'Quando l’Etna lo consente, l’esperienza si concentra sull’osservazione interpretata dell’attività vulcanica, sempre con prudenza.',
      en: 'When Etna allows it, the experience focuses on interpreted observation of volcanic activity, always with prudence.'
    },
    value: { it: 'Capire ciò che si osserva, non inseguire lo spettacolo.', en: 'Understanding what is being observed, not chasing spectacle.' },
    notes: { it: 'Serve flessibilità: l’itinerario può cambiare fino all’ultimo in base alle condizioni.', en: 'Flexibility is required: the route may change up to the last moment based on conditions.' },
    safety: { it: 'Osservazione responsabile, distanza sicura e adattamento costante alle condizioni reali.', en: 'Responsible observation, safe distance, and constant adaptation to real conditions.' },
    reason: { it: 'mi interessa l’attività vulcanica osservata in modo responsabile', en: 'I am interested in volcanic activity observed responsibly' }
  },
  {
    id: 'etna-stories',
    title: 'Etna Stories',
    image: MEDIA.stories,
    summary: {
      it: 'Paesaggio, cultura locale, memoria e possibili incontri territoriali.',
      en: 'Landscape, local culture, memory, and possible territorial encounters.'
    },
    bestFor: { it: 'singolo, viaggiatori curiosi, food lovers, gruppi che cercano racconto', en: 'solo traveler, curious travelers, food lovers, groups seeking storytelling' },
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
    { value: 'solo', it: 'Singolo', en: 'Solo traveler' },
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

function buildMailto(to, subject = '', body = '') {
  const params = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  const query = params.join('&');
  return `mailto:${to}${query ? `?${query}` : ''}`;
}

function openDefaultEmailApp(to, subject = '', body = '') {
  const mailto = buildMailto(to, subject, body);
  window.location.assign(mailto);
}

function normalizeReviewText(value) {
  const raw = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];

  const normalized = raw
    .split(/\n{2,}/)
    .map((paragraph) => paragraph
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/([.!?;:])(?=\S)/g, '$1 ')
      .replace(/,([A-Za-zÀ-ÖØ-öø-ÿ])/g, ', $1')
      .trim())
    .filter(Boolean);

  const source = normalized.length ? normalized : [raw];
  const paragraphs = [];

  source.forEach((paragraph) => {
    if (paragraph.length <= 260) {
      paragraphs.push(paragraph);
      return;
    }

    const sentences = paragraph.match(/[^.!?]+[.!?]+[”"']?|[^.!?]+$/g) || [paragraph];
    let buffer = '';

    sentences.map((sentence) => sentence.trim()).filter(Boolean).forEach((sentence) => {
      const next = buffer ? `${buffer} ${sentence}` : sentence;
      if (next.length > 260 && buffer) {
        paragraphs.push(buffer);
        buffer = sentence;
      } else {
        buffer = next;
      }
    });

    if (buffer) paragraphs.push(buffer);
  });

  return paragraphs.length ? paragraphs : [raw];
}


function text(lang, key) {
  return i18n[lang][key];
}

function cleanEditableTextValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r\n/g, '\n').trim();
}

function contentText(siteContent, key, lang, fallback = '') {
  const item = siteContent?.[key];
  if (!item || item.active === false) return cleanEditableTextValue(fallback);
  const value = lang === 'it' ? item.value_it : item.value_en;
  const defaultValue = lang === 'it' ? item.default_it : item.default_en;
  return cleanEditableTextValue(value) || cleanEditableTextValue(defaultValue) || cleanEditableTextValue(fallback);
}


function contentSettingValue(siteContent, key, fallback = '') {
  const item = siteContent?.[key];
  const direct = item?.value_it || item?.value_en || item?.default_it || item?.default_en || fallback;
  return cleanEditableTextValue(direct) || cleanEditableTextValue(fallback);
}

function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhoneTel(value, fallback = PHONE_TEL) {
  const clean = cleanEditableTextValue(value);
  const digits = normalizePhoneDigits(clean || fallback);
  if (!digits) return fallback;
  if (clean.trim().startsWith('+')) return `+${digits}`;
  return `+${digits}`;
}

function normalizeInstagramUrl(value) {
  const clean = cleanEditableTextValue(value) || INSTAGRAM;
  if (clean.startsWith('@')) return `https://www.instagram.com/${clean.slice(1).replace(/^\/+/, '')}`;
  if (/^https?:\/\//i.test(clean)) return clean;
  return `https://${clean.replace(/^\/+/, '')}`;
}

function resolvePublicContactDetails(siteContent) {
  const phoneRaw = contentSettingValue(siteContent, 'contact.channels.phone', PHONE_DISPLAY);
  const email = contentSettingValue(siteContent, 'contact.channels.email', EMAIL);
  const instagramRaw = contentSettingValue(siteContent, 'contact.channels.instagram_url', INSTAGRAM);
  const phoneDigits = normalizePhoneDigits(phoneRaw) || PHONE_WA;
  return {
    phoneDisplay: phoneRaw || PHONE_DISPLAY,
    phoneTel: normalizePhoneTel(phoneRaw, PHONE_TEL),
    phoneWa: phoneDigits,
    email: email || EMAIL,
    instagram: normalizeInstagramUrl(instagramRaw)
  };
}

function buildSiteContentMap(items = []) {
  return (items || []).reduce((acc, item) => {
    if (item?.content_key) acc[item.content_key] = item;
    return acc;
  }, {});
}



function getContentDefinition(key) {
  return [...SITE_CONTENT_DEFINITIONS, ...ADMIN_CONTENT_DEFINITIONS].find((item) => item.key === key) || { key, content_key: key, section: 'General', label_it: key, label_en: key, type: 'text', default_it: '', default_en: '' };
}

function getMediaDefinition(key) {
  return MEDIA_ADMIN_ITEMS.find((item) => item.key === key) || { key, it: key, en: key, fallback: '' };
}

const DEFAULT_EDITABLE_TEXT_STYLES = {
  'home.hero.title': {
    text_size: 'hero',
    style_variant: 'display',
    text_align: 'left'
  }
};

function resolveEditableTextStyle(key, stored = {}, definition = {}) {
  const defaultStyle = DEFAULT_EDITABLE_TEXT_STYLES[key] || {};
  return {
    text_size: stored.text_size || definition.text_size || defaultStyle.text_size || 'normal',
    text_align: stored.text_align || definition.text_align || defaultStyle.text_align || 'left',
    style_variant: stored.style_variant || definition.style_variant || defaultStyle.style_variant || 'body'
  };
}

function editorContentItem(siteContent, key, fallback = '') {
  const definition = getContentDefinition(key);
  const stored = siteContent?.[key] || {};
  const style = resolveEditableTextStyle(key, stored, definition);
  return {
    ...definition,
    ...stored,
    key,
    content_key: key,
    section: stored.section || definition.section || 'General',
    label_it: stored.label_it || definition.label_it || key,
    label_en: stored.label_en || definition.label_en || key,
    default_it: stored.default_it ?? definition.default_it ?? fallback,
    default_en: stored.default_en ?? definition.default_en ?? fallback,
    content_type: stored.content_type || (definition.type === 'textarea' ? 'textarea' : 'text'),
    active: stored.active !== false,
    visible: stored.visible !== false,
    text_size: style.text_size,
    text_align: style.text_align,
    style_variant: style.style_variant,
    layout_variant: stored.layout_variant || definition.layout_variant || 'default'
  };
}

function editorMediaItem(siteMedia, key, fallbackSrc = '', fallbackAlt = '') {
  const definition = getMediaDefinition(key);
  const stored = siteMedia?.[key] || {};
  return {
    ...definition,
    ...stored,
    key,
    media_key: key,
    label_it: stored.label_it || definition.it || key,
    label_en: stored.label_en || definition.en || key,
    file_url: stored.file_url || fallbackSrc || definition.fallback || '',
    alt_it: stored.alt_it || definition.alt_it || fallbackAlt || definition.it || key,
    alt_en: stored.alt_en || definition.alt_en || fallbackAlt || definition.en || key,
    active: stored.active !== false,
    media_kind: stored.media_kind || definition.media_kind || 'image',
    image_position: stored.image_position || definition.image_position || 'center',
    image_size: stored.image_size || definition.image_size || 'normal'
  };
}

function textStyleClass(item = {}) {
  return ['controlled-text', `text-size-${item.text_size || 'normal'}`, `text-align-${item.text_align || 'left'}`, `text-variant-${item.style_variant || 'body'}`].join(' ');
}

function EditableText({ as: Tag = 'span', itemKey, lang, siteContent, editor, fallback = '', className = '', children }) {
  const source = editor?.contentMap || siteContent || {};
  const item = editorContentItem(source, itemKey, fallback || children || '');
  const resolved = contentText(source, itemKey, lang, fallback || children || item.default_it || item.default_en || '');
  const hidden = item.visible === false;
  if (hidden && !editor?.isEditing) return null;
  const isSelected = editor?.selected?.type === 'text' && editor.selected.key === itemKey;
  return (
    <Tag
      className={`${className} ${textStyleClass(item)} ${editor?.isEditing ? 'editor-selectable editor-selectable-text' : ''} ${hidden ? 'editor-hidden-public' : ''} ${isSelected ? 'selected' : ''}`.trim()}
      onClick={editor?.isEditing ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        editor.select({ type: 'text', key: itemKey, label: lang === 'it' ? item.label_it : item.label_en, section: item.section });
      } : undefined}
      role={editor?.isEditing ? 'button' : undefined}
      tabIndex={editor?.isEditing ? 0 : undefined}
    >
      {editor?.isEditing && <span className="editor-badge">{lang === 'it' ? 'Modifica testo' : 'Edit text'}</span>}
      {resolved || (editor?.isEditing ? (lang === 'it' ? 'Testo vuoto' : 'Empty text') : '')}
    </Tag>
  );
}

function AdminEditableText({ as: Tag = 'span', itemKey, lang, adminContent, editor, fallback = '', className = '', children }) {
  const source = editor?.contentMap || adminContent || {};
  const item = editorContentItem(source, itemKey, fallback || children || '');
  const hidden = item.active === false || item.visible === false;
  if (hidden && !editor?.isEditing) return null;
  const resolved = contentText(source, itemKey, lang, fallback || children || item.default_it || item.default_en || '');
  const isSelected = editor?.selected?.type === 'text' && editor.selected.key === itemKey;
  return (
    <Tag
      className={`${className} admin-editable-text ${textStyleClass(item)} ${editor?.isEditing ? 'editor-selectable editor-selectable-text admin-editor-selectable-text' : ''} ${hidden ? 'editor-hidden-public' : ''} ${isSelected ? 'selected' : ''}`.trim()}
      onClick={editor?.isEditing ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        editor.select({ type: 'text', key: itemKey, label: lang === 'it' ? item.label_it : item.label_en, section: item.section });
      } : undefined}
      role={editor?.isEditing ? 'button' : undefined}
      tabIndex={editor?.isEditing ? 0 : undefined}
    >
      {editor?.isEditing && <span className="editor-badge">{lang === 'it' ? 'Modifica testo' : 'Edit text'}</span>}
      {resolved || (editor?.isEditing ? (lang === 'it' ? 'Testo vuoto' : 'Empty text') : fallback || children || '')}
    </Tag>
  );
}


function EditableImage({ mediaKey, lang, siteMedia, editor, fallbackSrc, fallbackAlt, className = '', loading = 'lazy', decoding = 'async' }) {
  const source = editor?.mediaMap || siteMedia || {};
  const item = editorMediaItem(source, mediaKey, fallbackSrc, fallbackAlt);
  const src = item.file_url || fallbackSrc;
  const alt = (lang === 'it' ? item.alt_it || item.alt_en : item.alt_en || item.alt_it) || fallbackAlt || '';
  if (!src && !editor?.isEditing) return null;
  const isSelected = editor?.selected?.type === 'image' && editor.selected.key === mediaKey;
  const image = <img className={className} src={src || BRAND.logo} alt={alt} loading={loading} decoding={decoding} />;
  if (!editor?.isEditing) return image;
  return (
    <span
      role="button"
      tabIndex={0}
      className={`editor-image-button editor-selectable ${isSelected ? 'selected' : ''}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        editor.select({ type: 'image', key: mediaKey, label: lang === 'it' ? item.label_it : item.label_en, section: item.section || 'Media', fallbackSrc, fallbackAlt });
      }}
    >
      <span className="editor-badge">{lang === 'it' ? 'Modifica immagine' : 'Edit image'}</span>
      {image}
    </span>
  );
}

function EditableImageSlot({ mediaKey, lang, siteMedia, editor, fallbackSrc, fallbackAlt, ratio = 'standard' }) {
  return (
    <figure className={`image-slot ${ratio}`}>
      <EditableImage mediaKey={mediaKey} lang={lang} siteMedia={siteMedia} editor={editor} fallbackSrc={fallbackSrc} fallbackAlt={fallbackAlt} />
    </figure>
  );
}

function EditableCardFrame({ editor, cardKey, label, section, children }) {
  if (!editor?.isEditing) return children;
  const isSelected = editor.selected?.type === 'card' && editor.selected.key === cardKey;
  return (
    <div
      className={`editor-card-frame editor-selectable ${isSelected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      onClickCapture={(event) => {
        if (event.target.closest('.editor-selectable-text, .editor-image-button')) return;
        event.preventDefault();
        event.stopPropagation();
        editor.select({ type: 'card', key: cardKey, label, section });
      }}
    >
      <span className="editor-badge">{editor.lang === 'it' ? 'Modifica card' : 'Edit card'}</span>
      {children}
    </div>
  );
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


function fixedExcursionField(item, field, lang) {
  if (!item) return '';
  return item[`${field}_${lang}`] || item[`${field}_${lang === 'it' ? 'en' : 'it'}`] || '';
}

function fixedExcursionTitle(item, lang) {
  return fixedExcursionField(item, 'title', lang) || adminExperienceLabel(item?.experience_id, lang);
}

function fixedExcursionLabel(item, lang) {
  if (!item) return '';
  const date = formatDateForMessage(item.date, lang);
  const start = item.start_time ? String(item.start_time).slice(0, 5) : '';
  const end = item.end_time ? String(item.end_time).slice(0, 5) : '';
  const time = start ? ` · ${start}${end ? `–${end}` : ''}` : '';
  return `${date}${time} · ${fixedExcursionTitle(item, lang)}`;
}

function leafletTitle(leaflet, lang) {
  if (!leaflet) return '';
  return (lang === 'it' ? leaflet.title_it || leaflet.title_en : leaflet.title_en || leaflet.title_it) || leaflet.file_name || text(lang, 'openProgram');
}

function sameCalendarMonth(value, monthDate) {
  if (!value || !monthDate) return false;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === monthDate.getFullYear() && date.getMonth() === monthDate.getMonth();
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function isCurrentOrFutureMonth(date) {
  const current = startOfMonth(new Date());
  const candidate = startOfMonth(date);
  return candidate.getTime() >= current.getTime();
}

function monthlyOptionsLeaflets({ leaflets = [], fixedExcursions = [], monthDate, lang }) {
  const month = monthDate.getMonth() + 1;
  const year = monthDate.getFullYear();
  const fixedInMonth = fixedExcursions.filter((item) => sameCalendarMonth(item.date, monthDate));
  const linkedIds = new Set(fixedInMonth.map((item) => item.leaflet_id).filter(Boolean));
  const seen = new Set();
  const options = [];

  function addOption(option) {
    const key = option.leaflet?.id || option.leaflet?.file_url || option.id;
    if (!key || seen.has(key)) return;
    seen.add(key);
    options.push(option);
  }

  leaflets
    .filter((leaflet) => leaflet.file_url && Number(leaflet.month) === month && Number(leaflet.year) === year)
    .forEach((leaflet) => addOption({
      id: `monthly-${leaflet.id}`,
      kind: 'monthly_leaflet',
      leaflet,
      title: leafletTitle(leaflet, lang),
      subtitle: monthLabel(monthDate, lang)
    }));

  leaflets
    .filter((leaflet) => leaflet.file_url && linkedIds.has(leaflet.id))
    .forEach((leaflet) => addOption({
      id: `linked-${leaflet.id}`,
      kind: 'linked_leaflet',
      leaflet,
      title: leafletTitle(leaflet, lang),
      subtitle: monthLabel(monthDate, lang)
    }));

  fixedInMonth.forEach((item) => {
    if (!item.blocked_dates_file_url) return;
    const leaflet = {
      id: `fixed-file-${item.id}`,
      file_url: item.blocked_dates_file_url,
      file_type: item.blocked_dates_file_type || '',
      file_name: item.blocked_dates_file_name || fixedExcursionTitle(item, lang),
      title_it: item.blocked_dates_file_name || fixedExcursionTitle(item, 'it'),
      title_en: item.blocked_dates_file_name || fixedExcursionTitle(item, 'en')
    };
    addOption({
      id: `fixed-file-${item.id}`,
      kind: 'fixed_excursion_file',
      leaflet,
      fixedExcursion: item,
      title: fixedExcursionTitle(item, lang),
      subtitle: fixedExcursionLabel(item, lang)
    });
  });

  return options;
}

function normalizeGoogleMapsUrl(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const isGoogleHost = /(^|\.)google\.[a-z.]+$/.test(host) || host === 'maps.app.goo.gl' || host === 'goo.gl';
    const isMapsPath = host.startsWith('maps.') || path === '/maps' || path.startsWith('/maps/') || path.startsWith('/maps/place') || path.startsWith('/maps/dir') || path.startsWith('/maps/search') || host === 'maps.app.goo.gl' || (host === 'goo.gl' && path.startsWith('/maps'));
    return isGoogleHost && isMapsPath ? url.href : '';
  } catch {
    return '';
  }
}

function MeetingPointDetailCard({ item, lang }) {
  const meeting = fixedExcursionField(item, 'meeting_point', lang);
  if (!meeting) return null;
  const mapsUrl = normalizeGoogleMapsUrl(item?.meeting_point_maps_url);
  const label = mapsUrl ? text(lang, 'meetingPointDirections') : text(lang, 'meetingPoint');
  const ariaLabel = lang === 'it'
    ? `Apri indicazioni Google Maps per ${meeting}`
    : `Open Google Maps directions to ${meeting}`;

  return (
    <div className={`meeting-point-card ${mapsUrl ? 'is-clickable' : ''}`.trim()}>
      <dt>{label}</dt>
      <dd>{meeting}</dd>
      {mapsUrl && <span className="meeting-point-card__hint">{text(lang, 'meetingPointDirectionsHint')}</span>}
      {mapsUrl && <a className="meeting-point-card__hit" href={mapsUrl} target="_blank" rel="noopener noreferrer" aria-label={ariaLabel} onClick={() => trackMapsClick('meeting_point_card', buildBookingTrackingContext({ experienceId: item?.experience_id || '', requestType: 'fixed', sourceSection: 'calendar', sourceCta: 'google_maps_direct', ctaLocation: 'calendar_modal', selectedDate: item?.date || '', hasFixedExcursion: true, language: lang }))}><span className="sr-only">{ariaLabel}</span></a>}
    </div>
  );
}

function buildFixedExcursionMessage({ fixedExcursion, people }, lang) {
  const title = fixedExcursionLabel(fixedExcursion, lang);
  if (lang === 'it') {
    return `Ciao Leonardo,
vorrei richiedere un posto per l’escursione fissa ${title}.

Persone: ${people || '-'}

Vorrei sapere se la richiesta può essere confermata e ricevere i dettagli pratici.

Grazie.`;
  }
  return `Hi Leonardo,
I would like to request a place for the fixed excursion ${title}.

People: ${people || '-'}

I would like to know whether the request can be confirmed and receive the practical details.

Thank you.`;
}

function buildAvailableDateRequestMessage({ date, experienceId, adults, children, childrenUnder3Count }, lang) {
  const experience = experienceById(experienceId || 'etna-premium');
  const dateText = formatDateForMessage(date, lang);
  const adultCount = adults || '1';
  const childCount = children || '0';
  const under3Count = childrenUnder3Count || '0';
  if (lang === 'it') {
    return `Ciao Leonardo,
vorrei richiedere un’esperienza privata o su misura per il giorno ${dateText}.

Esperienza preferita: ${experience.title}
Adulti: ${adultCount}
Bambini: ${childCount}
Bambini sotto i 3 anni: ${under3Count}

Vorrei sapere se la data è disponibile e ricevere dettagli su durata, prezzo e abbigliamento consigliato.

Grazie.`;
  }
  return `Hi Leonardo,
I would like to request a private or tailored experience for ${dateText}.

Preferred experience: ${experience.title}
Adults: ${adultCount}
Children: ${childCount}
Children under 3: ${under3Count}

I would like to know whether the date is available and receive details about duration, price, and recommended clothing.

Thank you.`;
}

function appendUnder3CountToMessage(message, count, lang) {
  const cleanCount = Number.parseInt(count || '0', 10) || 0;
  const base = String(message || text(lang, 'defaultMessage')).trimEnd();
  if (cleanCount <= 0) return base;
  const label = lang === 'it' ? 'Bambini sotto i 3 anni' : 'Children under 3';
  return `${base}

${label}: ${cleanCount}`;
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

function EmailPanel({ lang, message, subject, contact, onClose, onUseForm, onEmailAction }) {
  const [copied, setCopied] = useState('');
  const recipientEmail = contact?.email || EMAIL;
  const mailto = buildMailto(recipientEmail, subject, message);
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encode(recipientEmail)}&su=${encode(subject)}&body=${encode(message)}`;

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
      <button type="button" className="email-option" onClick={() => { onEmailAction?.('default_email_app'); openDefaultEmailApp(recipientEmail, subject, message); }}>{text(lang, 'defaultEmail')}</button>
      <a className="email-option" href={gmail} target="_blank" rel="noopener noreferrer" onClick={() => onEmailAction?.('gmail')}>{text(lang, 'openGmail')}</a>
      <button type="button" className="email-option" onClick={() => { onEmailAction?.('copy_email'); handleCopy('email', recipientEmail); }}>{text(lang, 'copyEmail')} {copied === 'email' ? `· ${text(lang, 'copied')}` : ''}</button>
      <button type="button" className="email-option" onClick={() => { onEmailAction?.('copy_message'); handleCopy('message', message); }}>{text(lang, 'copyMessage')} {copied === 'message' ? `· ${text(lang, 'copied')}` : ''}</button>
      {onUseForm && <button type="button" className="email-option" onClick={onUseForm}>{text(lang, 'continueForm')}</button>}
    </div>
  );
}

function ContactActions({ lang, contextMessage, compact = false, onUseForm, experienceId, location = 'contact_section', siteContent, contactDetails }) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailAttributionMetadata, setEmailAttributionMetadata] = useState({});
  const [emailAttributionSource, setEmailAttributionSource] = useState('');
  const [emailAttributionDetail, setEmailAttributionDetail] = useState('');
  const { requestContactAttribution, contactAttributionModal } = useContactAttributionGate(lang);
  const contact = contactDetails || resolvePublicContactDetails(siteContent);
  const message = contextMessage || text(lang, 'defaultMessage');
  const subject = text(lang, 'emailSubject');
  const whatsappUrl = `https://wa.me/${contact.phoneWa}?text=${encode(message)}`;
  const className = compact ? 'contact-actions compact' : 'contact-actions';
  const metadata = buildBookingTrackingContext({ experienceId: experienceId || '', requestType: experienceId ? 'private' : 'contact', sourceSection: 'contact', sourceCta: 'contact_direct', ctaLocation: location, language: lang });
  const emailMessage = buildAttributionContactMessage(emailAttributionSource, emailAttributionDetail, lang);

  return (
    <div className={className} data-experience={experienceId || undefined}>
      <a
        className="pill-action"
        href={`tel:${contact.phoneTel}`}
        onClick={() => trackContactClick('phone', location, { ...metadata, source_cta: 'phone_direct' })}
      ><Icon name="phone" />{text(lang, 'call')}</a>
      <a
        className="pill-action"
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => requestContactAttribution(event, {
          type: 'whatsapp',
          target: '_blank',
          location,
          metadata: { ...metadata, source_cta: 'whatsapp_direct' },
          confirmLabel: contactActionConfirmLabel('whatsapp', lang),
          buildUrl: (_selectedMetadata, source, detail) => `https://wa.me/${contact.phoneWa}?text=${encode(buildAttributionContactMessage(source, detail, lang))}`
        })}
      ><Icon name="chat" />{text(lang, 'whatsapp')}</a>
      <div className="email-action-wrap">
        <button
          type="button"
          className="pill-action"
          onClick={(event) => requestContactAttribution(event, {
            type: 'email',
            location,
            metadata: { ...metadata, source_cta: 'email_direct', action: 'email_options_open' },
            confirmLabel: contactActionConfirmLabel('email', lang),
            afterConfirm: (selectedMetadata, source, detail) => {
              setEmailAttributionMetadata(selectedMetadata || {});
              setEmailAttributionSource(source || '');
              setEmailAttributionDetail(detail || '');
              setEmailOpen(true);
              return false;
            }
          })}
          aria-expanded={emailOpen}
        ><Icon name="mail" />{text(lang, 'email')}</button>
        {emailOpen && (
          <EmailPanel
            lang={lang}
            message={emailMessage}
            subject={subject}
            onClose={() => setEmailOpen(false)}
            contact={contact}
            onUseForm={onUseForm}
            onEmailAction={(action) => trackContactClick('email', location, { ...metadata, ...emailAttributionMetadata, action })}
          />
        )}
      </div>
      {contactAttributionModal}
    </div>
  );
}

function ImageSlot({ src, alt, label, lang, ratio = 'wide', className = '' }) {
  const [missing, setMissing] = useState(false);
  return (
    <figure className={`image-slot ${ratio} ${missing ? 'is-missing' : ''} ${className}`.trim()}>
      {!missing && <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setMissing(true)} />}
      {missing && (
        <div className="image-placeholder" aria-label={`${text(lang, 'realPhotoPlaceholder')}: ${src}`}>
          <strong>{text(lang, 'realPhotoPlaceholder')}</strong>
          <span>{text(lang, 'replaceWith')} {src}</span>
        </div>
      )}
    </figure>
  );
}


function VideoSlot({ src, poster, label, lang }) {
  return (
    <figure className="video-slot">
      <video
        src={src}
        poster={poster}
        muted
        playsInline
        controls
        preload="metadata"
        aria-label={label}
      />
    </figure>
  );
}


function BrandLogo({ compact = false, siteMedia, editor }) {
  return (
    <span className={`brand-logo-wrap ${compact ? 'compact' : ''}`}>
      <EditableImage mediaKey="brand_logo_main" lang={editor?.lang || 'it'} siteMedia={siteMedia} editor={editor} fallbackSrc={BRAND.logo} fallbackAlt={editor?.lang === 'en' ? 'vulcanIQ logo — premium Etna experiences' : 'Logo vulcanIQ — esperienze premium sull’Etna'} className="brand-logo" loading="eager" />
    </span>
  );
}

const publicPages = ['home', 'experiences', 'partnerships', 'about', 'reviews', 'contact'];
function Header({ lang, setLang, activePage, setActivePage, siteMedia, editor }) {
  const [open, setOpen] = useState(false);
  const switchLanguage = () => setLang(lang === 'it' ? 'en' : 'it');
  const languageAria = lang === 'it' ? 'Switch to English' : "Passa all'italiano";

  function choose(page) {
    setActivePage(page);
    setOpen(false);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }

  return (
    <header className="site-header">
      <div className="container nav-shell">
        <button className="nav-toggle" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="site-nav">Menu</button>
        <nav id="site-nav" className={`nav-links ${open ? 'open' : ''}`} aria-label="Primary navigation">
          {publicPages.map((page, index) => (
            <button key={page} type="button" className={activePage === page ? 'active' : ''} onClick={() => choose(page)}>{i18n[lang].nav[index]}</button>
          ))}
          <button className="language-toggle desktop-language-toggle" type="button" onClick={switchLanguage} aria-label={languageAria}>{i18n[lang].switchLabel}</button>
        </nav>
        <button className="mobile-language-switch" type="button" onClick={switchLanguage} aria-label={languageAria}>{i18n[lang].switchLabel}</button>
      </div>
    </header>
  );
}

function Hero({ lang, setActivePage, scrollToForm, siteMedia, siteContent, editor }) {
  const heroBackground = mediaUrl(siteMedia, 'home_hero_background', '');
  const heroStyle = heroBackground ? { backgroundImage: `linear-gradient(90deg, rgba(5,10,20,0.72), rgba(5,10,20,0.50) 50%, rgba(5,10,20,0.34)), url("${heroBackground}")` } : undefined;
  return (
    <section className="hero" id="top" style={heroStyle}>
      <div className="hero-overlay" />
      <div className="container hero-grid">
        <div className="hero-copy">
          <EditableText as="h1" className="hero-title" itemKey="home.hero.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'heroTitle')} />
          <EditableText as="p" className="lead" itemKey="home.hero.subtitle" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'heroLead')} />
          <div className="hero-ctas">
            <button className="button primary" type="button" onClick={() => setActivePage('experiences')}><EditableText itemKey="home.hero.primary_cta" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'findExperience')} /></button>
            <button className="button secondary dark" type="button" onClick={() => setActivePage('experiences')}><EditableText itemKey="home.hero.secondary_cta" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'viewAvailability')} /></button>
            <button className="button secondary dark" type="button" onClick={scrollToForm}><EditableText itemKey="home.hero.contact_cta" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'contact')} /></button>
          </div>
          <div className="trust-grid hero-trust-grid" aria-label="Trust points">
            <a
              className="trust-card guide-license-card"
              href="https://www.guidealpinevulcanologichesicilia.it/tutte-le-guide/chiavetta-leonardo/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={text(lang, 'guideLicenseAria')}
            >
              <span className="trust-check" aria-hidden="true">✓</span>
              <span>
                <EditableText as="strong" itemKey="home.hero.guide_badge" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'trust')[0]} />
              </span>
            </a>
          </div>
        </div>
        <div className="hero-media" aria-hidden="false">
          <VideoSlot
            src={mediaUrl(siteMedia, 'home_hero_video', MEDIA.introVideo)}
            poster={mediaUrl(siteMedia, 'home_hero_feature_image', MEDIA.premium)}
            label={lang === 'it' ? 'Video introduttivo vulcanIQ' : 'vulcanIQ introductory video'}
            lang={lang}
          />
        </div>
      </div>
    </section>
  );
}

function ExperienceAccordion({ lang, fillForm, siteMedia, siteContent, editor }) {
  const contact = resolvePublicContactDetails(siteContent);
  const [items, setItems] = useState([]);
  const [leaflets, setLeaflets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthDate, setMonthDate] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [selectedExperience, setSelectedExperience] = useState(null);
  const [activeLeaflet, setActiveLeaflet] = useState(null);
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [dateRequest, setDateRequest] = useState({ experienceId: 'etna-premium', adults: '1', children: '0', childrenUnder3Count: '0' });
  const { requestContactAttribution, contactAttributionModal } = useContactAttributionGate(lang);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      loadPublicFixedExcursions(),
      loadPublicMonthlyLeaflets().catch(() => [])
    ])
      .then(([fixedRows, leafletRows]) => {
        if (!active) return;
        const rows = fixedRows || [];
        setItems(rows);
        setLeaflets(leafletRows || []);
        const first = rows.find((item) => item.date >= todayIso());
        if (first) {
          setSelectedDate(first.date);
          setMonthDate(startOfMonth(new Date(`${first.date}T12:00:00`)));
        }
      })
      .catch(() => {
        if (!active) return;
        setItems([]);
        setLeaflets([]);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useBodyScrollLock(Boolean(selectedExperience || activeLeaflet || dateModalOpen));

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setSelectedExperience(null);
        setActiveLeaflet(null);
        setDateModalOpen(false);
      }
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  const days = useMemo(() => getCalendarDays(monthDate), [monthDate]);
  const byDate = useMemo(() => getItemsByDate(items), [items]);
  const selectedItems = byDate[selectedDate] || [];
  const visibleMonthLeaflet = useMemo(() => leaflets.find((leaflet) => Number(leaflet.month) === monthDate.getMonth() + 1 && Number(leaflet.year) === monthDate.getFullYear() && leaflet.file_url), [leaflets, monthDate]);
  const selectedDateLeaflet = useMemo(() => {
    const linkedId = selectedItems.find((item) => item.leaflet_id)?.leaflet_id;
    return linkedId ? leaflets.find((leaflet) => leaflet.id === linkedId && leaflet.file_url) : null;
  }, [leaflets, selectedItems]);
  const trackedExperienceCardsRef = useRef(new Set());

  useEffect(() => {
    if (loading) return;
    experiences.forEach((experience) => {
      if (trackedExperienceCardsRef.current.has(experience.id)) return;
      trackedExperienceCardsRef.current.add(experience.id);
      trackExperienceCardView(experience);
    });
  }, [loading]);

  function changeMonth(delta) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function openDateModal(iso) {
    setSelectedDate(iso);
    trackCalendarDateSelect(iso, { has_fixed_excursion: Boolean(byDate[iso]?.length), language: lang });
    setDateModalOpen(true);
  }

  function openExperienceDetails(experience) {
    trackExcursionView(experience);
    trackExperienceDetailOpen(experience);
    setSelectedExperience(experience);
  }

  function requestExperience(experience) {
    const trackingContext = buildBookingTrackingContext({
      experienceId: experience?.id || '',
      requestType: 'private',
      sourceSection: 'experiences',
      sourceCta: 'book_experience',
      ctaLocation: 'experience_modal',
      language: lang
    });
    trackBookingFormOpen(experience?.id || 'unsure', trackingContext);
    setSelectedExperience(null);
    fillForm({
      experienceId: experience.id,
      requestType: 'private',
      message: buildExperienceMessage(experience, lang),
      trackingContext,
      scroll: true
    });
  }

  function requestItem(item) {
    const trackingContext = buildBookingTrackingContext({
      experienceId: item?.experience_id || '',
      requestType: 'fixed',
      sourceSection: 'calendar',
      sourceCta: 'fixed_excursion',
      ctaLocation: 'calendar_modal',
      selectedDate: item?.date || '',
      hasFixedExcursion: true,
      language: lang
    });
    trackBookingFormOpen(item?.experience_id || 'fixed', trackingContext);
    const message = buildFixedExcursionMessage({ fixedExcursion: item, people: '' }, lang);
    setDateModalOpen(false);
    fillForm({
      experienceId: item.experience_id,
      requestType: 'fixed',
      fixedExcursionId: item.id,
      requestedDate: item.date,
      message,
      trackingContext,
      scroll: true
    });
  }

  function updateDateRequest(field, value) {
    setDateRequest((current) => ({ ...current, [field]: value }));
  }

  function requestAvailableDate() {
    const trackingContext = buildBookingTrackingContext({
      experienceId: dateRequest.experienceId || '',
      requestType: 'private',
      sourceSection: 'calendar',
      sourceCta: 'prepare_request',
      ctaLocation: 'calendar_modal',
      selectedDate,
      hasFixedExcursion: false,
      language: lang
    });
    trackBookingFormOpen(dateRequest.experienceId || 'private', trackingContext);
    const message = buildAvailableDateRequestMessage({ date: selectedDate, ...dateRequest }, lang);
    setDateModalOpen(false);
    fillForm({
      experienceId: dateRequest.experienceId,
      requestType: 'private',
      requestedDate: selectedDate,
      adults: dateRequest.adults,
      children: dateRequest.children,
      childrenUnder3Count: dateRequest.childrenUnder3Count,
      message,
      trackingContext,
      scroll: true
    });
  }

  function monthlyLeafletButtonLabel() {
    if (!visibleMonthLeaflet) return '';
    const monthName = new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', { month: 'long' }).format(monthDate);
    return lang === 'it' ? `Apri programma di ${monthName}` : `Open ${monthName} program`;
  }

  function openLeafletModal(leaflet, label) {
    if (!leaflet?.file_url) return;
    setActiveLeaflet({ leaflet, label });
  }

  function renderDateModalFixedDetails(item) {
    const title = fixedExcursionTitle(item, lang);
    const description = fixedExcursionField(item, 'description', lang) || item[`note_${lang}`] || item.note_it || item.note_en || '';
    const meeting = fixedExcursionField(item, 'meeting_point', lang);
    const difficulty = fixedExcursionField(item, 'difficulty', lang);
    const price = fixedExcursionField(item, 'price_note', lang);
    const timeRange = item.start_time ? `${String(item.start_time).slice(0, 5)}${item.end_time ? `–${String(item.end_time).slice(0, 5)}` : ''}` : text(lang, 'onRequest');
    const fixedMessage = buildFixedExcursionMessage({ fixedExcursion: item, people: '' }, lang);

    return (
      <article className="date-modal-fixed-card" key={item.id}>
        <div className="selected-date-heading-row">
          <h3>{title}</h3>
          <span>{timeRange}</span>
        </div>
        <FormattedDescription textValue={description || experienceById(item.experience_id).summary[lang]} />
        <dl className="public-details-grid date-modal-details-grid">
          <div><dt>{text(lang, 'dateLabel')}</dt><dd>{formatDateForMessage(item.date, lang)}</dd></div>
          <div><dt>{text(lang, 'experienceLabel')}</dt><dd>{adminExperienceLabel(item.experience_id, lang)}</dd></div>
          <MeetingPointDetailCard item={item} lang={lang} />
          {difficulty && <div><dt>{text(lang, 'difficulty')}</dt><dd>{difficulty}</dd></div>}
          {price && <div><dt>{text(lang, 'priceNote')}</dt><dd>{price}</dd></div>}
          <div><dt>{text(lang, 'placesAvailable')}</dt><dd>{item.places_remaining}/{item.capacity}</dd></div>
        </dl>
        <BlockedDatesAttachment item={item} lang={lang} onOpenFile={(file, label) => openLeafletModal(file, label || text(lang, 'openExcursionProgram'))} />
        <div className="request-action-row date-modal-actions">
          <button className="request-action-button request-action-button-primary" type="button" onClick={() => requestItem(item)}>{text(lang, 'requestInformation')}</button>
          <a className="request-action-button request-action-button-secondary" href={`https://wa.me/${contact.phoneWa}?text=${encode(fixedMessage)}`} target="_blank" rel="noopener noreferrer" onClick={(event) => requestContactAttribution(event, { type: 'whatsapp', url: `https://wa.me/${contact.phoneWa}?text=${encode(fixedMessage)}`, target: '_blank', location: 'calendar_modal', metadata: buildBookingTrackingContext({ experienceId: item.experience_id || '', requestType: 'fixed', sourceSection: 'calendar', sourceCta: 'whatsapp_direct', ctaLocation: 'calendar_modal', selectedDate: item.date || '', hasFixedExcursion: true, language: lang }), confirmLabel: contactActionConfirmLabel('whatsapp', lang), buildUrl: (_selectedMetadata, source, detail) => `https://wa.me/${contact.phoneWa}?text=${encode(buildAttributionContactMessage(source, detail, lang))}` })}>{text(lang, 'sendWhatsapp')}</a>
          {selectedDateLeaflet && (
            <button className="request-action-button request-action-button-secondary" type="button" onClick={() => openLeafletModal(selectedDateLeaflet, text(lang, 'openExcursionProgram'))}>{text(lang, 'openExcursionProgram')}</button>
          )}
        </div>
      </article>
    );
  }

  function renderAvailableDateRequest() {
    const message = buildAvailableDateRequestMessage({ date: selectedDate, ...dateRequest }, lang);
    return (
      <div className="available-date-flow">
        <div className="empty-state-card date-modal-empty-copy">
          <p>{text(lang, 'noExcursionsOnDate')}</p>
          <p>{text(lang, 'availableDatePrivateCopy')}</p>
        </div>
        <div className="date-request-grid" aria-label={lang === 'it' ? 'Richiesta data' : 'Date request'}>
          <label>
            <span>{text(lang, 'chooseExperience')}</span>
            <select value={dateRequest.experienceId} onChange={(event) => updateDateRequest('experienceId', event.target.value)}>
              {experiences.map((experience) => <option value={experience.id} key={experience.id}>{experience.title}</option>)}
            </select>
          </label>
          <label>
            <span>{text(lang, 'adults')}</span>
            <input type="number" min="0" value={dateRequest.adults} onChange={(event) => updateDateRequest('adults', event.target.value)} />
          </label>
          <label>
            <span>{text(lang, 'childrenCount')}</span>
            <input type="number" min="0" value={dateRequest.children} onChange={(event) => updateDateRequest('children', event.target.value)} />
          </label>
          <label>
            <span>{text(lang, 'childrenUnder3')}</span>
            <input type="number" min="0" value={dateRequest.childrenUnder3Count} onChange={(event) => updateDateRequest('childrenUnder3Count', event.target.value)} />
          </label>
        </div>
        <div className="request-action-row date-modal-actions">
          <button className="request-action-button request-action-button-primary" type="button" onClick={requestAvailableDate}>{text(lang, 'requestDate')}</button>
          <a className="request-action-button request-action-button-secondary" href={`https://wa.me/${contact.phoneWa}?text=${encode(message)}`} target="_blank" rel="noopener noreferrer" onClick={(event) => requestContactAttribution(event, { type: 'whatsapp', url: `https://wa.me/${contact.phoneWa}?text=${encode(message)}`, target: '_blank', location: 'calendar_modal', metadata: buildBookingTrackingContext({ experienceId: dateRequest.experienceId || '', requestType: 'private', sourceSection: 'calendar', sourceCta: 'whatsapp_direct', ctaLocation: 'calendar_modal', selectedDate, language: lang }), confirmLabel: contactActionConfirmLabel('whatsapp', lang), buildUrl: (_selectedMetadata, source, detail) => `https://wa.me/${contact.phoneWa}?text=${encode(buildAttributionContactMessage(source, detail, lang))}` })}>{text(lang, 'sendWhatsapp')}</a>
        </div>
      </div>
    );
  }

  return (
    <section className="section page-section excursions-section" id="experiences">
      <div className="container">
        <div className="section-header refined-section-header experience-page-header">
          <EditableText as="h2" itemKey="experiences.page.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'experiencesTitle')} />
          <EditableText as="p" itemKey="experiences.page.intro" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'experiencesIntro')} />
        </div>

        {loading ? <p>{lang === 'it' ? 'Caricamento...' : 'Loading...'}</p> : (
          <div className="excursions-layout">
            <div className="excursions-calendar-column">
              <article className="calendar-card public-excursion-calendar">
                <div className="calendar-topline simplified-calendar-header">
                  <button type="button" onClick={() => changeMonth(-1)} aria-label={text(lang, 'previousMonth')}>‹</button>
                  <h3 className="calendar-month-title">{monthLabel(monthDate, lang)}</h3>
                  <button type="button" onClick={() => changeMonth(1)} aria-label={text(lang, 'nextMonth')}>›</button>
                </div>
                <div className="calendar-legend compact-legend">
                  <span><i className="legend-dot fixed" />{text(lang, 'scheduledExcursion')}</span>
                  <span><i className="legend-dot available" />{text(lang, 'availableDates')}</span>
                </div>
                {visibleMonthLeaflet && (
                  <button className="button secondary leaflet-trigger" type="button" onClick={() => openLeafletModal(visibleMonthLeaflet, monthlyLeafletButtonLabel())}>{monthlyLeafletButtonLabel()}</button>
                )}
                <div className="weekdays" aria-hidden="true">
                  {(lang === 'it' ? ['L', 'M', 'M', 'G', 'V', 'S', 'D'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']).map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
                </div>
                <div className="calendar-grid public-calendar-grid">
                  {days.map((date) => {
                    const iso = dateToIso(date);
                    const hasFixed = Boolean(byDate[iso]?.length);
                    const outside = date.getMonth() !== monthDate.getMonth();
                    const isPast = iso < todayIso();
                    return (
                      <button
                        type="button"
                        key={iso}
                        className={`date-button public-date-button ${outside ? 'outside' : ''} ${hasFixed ? 'has-fixed has-fixed-excursion' : ''} ${isPast ? 'is-past' : ''} ${selectedDate === iso ? 'selected' : ''}`}
                        onClick={() => !isPast && openDateModal(iso)}
                        disabled={isPast}
                      >
                        <strong>{date.getDate()}</strong>
                        {hasFixed && <span className="date-marker green-circle" aria-label={text(lang, 'scheduledExcursion')} />}
                      </button>
                    );
                  })}
                </div>
              </article>
            </div>

            <div className="excursions-cards-column">
              {experiences.map((experience) => (
                <EditableCardFrame editor={editor} cardKey={`experience.${experience.id}`} label={experience.title} section={lang === 'it' ? 'Escursioni' : 'Excursions'} key={experience.id}>
                  <button className="experience-compact-card" type="button" onClick={() => openExperienceDetails(experience)}>
                    <EditableImage mediaKey={experienceMediaKey(experience.id)} lang={lang} siteMedia={siteMedia} editor={editor} fallbackSrc={experience.image} fallbackAlt={`${experience.title} vulcanIQ`} />
                    <span className="experience-compact-copy">
                      <EditableText as="strong" itemKey={`experiences.${experience.id}.title`} lang={lang} siteContent={siteContent} editor={editor} fallback={experience.title} />
                      <EditableText as="small" itemKey={`experiences.${experience.id}.summary`} lang={lang} siteContent={siteContent} editor={editor} fallback={experience.summary[lang]} />
                    </span>
                  </button>
                </EditableCardFrame>
              ))}
            </div>
          </div>
        )}
      </div>

      {dateModalOpen && (
        <div className="date-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="date-modal-title" onClick={() => setDateModalOpen(false)}>
          <article className="date-modal" onClick={(event) => event.stopPropagation()}>
            <div className="date-modal-header">
              <div>
                <span className="micro-label details-label">{selectedItems.length ? text(lang, 'scheduledExcursion') : text(lang, 'availableDates')}</span>
                <h2 id="date-modal-title">{formatDateForMessage(selectedDate, lang)}</h2>
              </div>
              <button className="date-modal-close" type="button" onClick={() => setDateModalOpen(false)}>{text(lang, 'close')}</button>
            </div>
            {selectedItems.length ? (
              <div className="date-modal-content fixed-date-content">{selectedItems.map(renderDateModalFixedDetails)}</div>
            ) : renderAvailableDateRequest()}
          </article>
        </div>
      )}

      {selectedExperience && (
        <div className="experience-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="experience-modal-title" onClick={() => setSelectedExperience(null)}>
          <article className="experience-modal" onClick={(event) => event.stopPropagation()}>
            <div className="experience-modal-header">
              <h2 id="experience-modal-title">{selectedExperience.title}</h2>
              <button className="experience-modal-close" type="button" onClick={() => setSelectedExperience(null)}>{text(lang, 'close')}</button>
            </div>
            <div className="experience-detail-content">
              <EditableImage mediaKey={experienceMediaKey(selectedExperience.id)} lang={lang} siteMedia={siteMedia} editor={editor} fallbackSrc={selectedExperience.image} fallbackAlt={`${selectedExperience.title} vulcanIQ`} className="experience-modal-image" />
              <div className="experience-detail-copy">
                <EditableText as="p" itemKey={`experiences.${selectedExperience.id}.description`} lang={lang} siteContent={siteContent} editor={editor} fallback={selectedExperience.description[lang]} />
                <dl>
                  <div><dt>{text(lang, 'bestFor')}</dt><dd><EditableText itemKey={`experiences.${selectedExperience.id}.best_for`} lang={lang} siteContent={siteContent} editor={editor} fallback={selectedExperience.bestFor[lang]} /></dd></div>
                  <div><dt>{text(lang, 'practical')}</dt><dd><EditableText itemKey={`experiences.${selectedExperience.id}.notes`} lang={lang} siteContent={siteContent} editor={editor} fallback={selectedExperience.notes[lang]} /></dd></div>
                  <div><dt>{text(lang, 'safety')}</dt><dd><EditableText itemKey={`experiences.${selectedExperience.id}.safety`} lang={lang} siteContent={siteContent} editor={editor} fallback={selectedExperience.safety[lang]} /></dd></div>
                </dl>
                <div className="request-action-row experience-modal-actions">
                  <button className="request-action-button request-action-button-primary" type="button" onClick={() => requestExperience(selectedExperience)}>{text(lang, 'request')}</button>
                  <a className="request-action-button request-action-button-secondary" href={`https://wa.me/${contact.phoneWa}?text=${encode(buildExperienceMessage(selectedExperience, lang))}`} target="_blank" rel="noopener noreferrer" onClick={(event) => requestContactAttribution(event, { type: 'whatsapp', url: `https://wa.me/${contact.phoneWa}?text=${encode(buildExperienceMessage(selectedExperience, lang))}`, target: '_blank', location: 'experience_modal', metadata: buildBookingTrackingContext({ experienceId: selectedExperience?.id || '', requestType: 'private', sourceSection: 'experiences', sourceCta: 'whatsapp_direct', ctaLocation: 'experience_modal', language: lang }), confirmLabel: contactActionConfirmLabel('whatsapp', lang), buildUrl: (_selectedMetadata, source, detail) => `https://wa.me/${contact.phoneWa}?text=${encode(buildAttributionContactMessage(source, detail, lang))}` })}>{text(lang, 'sendWhatsapp')}</a>
                </div>
              </div>
            </div>
          </article>
        </div>
      )}

      {activeLeaflet?.leaflet && (
        <div className="leaflet-fullscreen-overlay" role="dialog" aria-modal="true" aria-label={activeLeaflet.label || text(lang, 'openProgram')} onClick={() => setActiveLeaflet(null)}>
          <article className="leaflet-fullscreen-modal" onClick={(event) => event.stopPropagation()}>
            <div className="leaflet-fullscreen-header">
              <h2>{activeLeaflet.label || text(lang, 'openProgram')}</h2>
              <button className="date-modal-close" type="button" onClick={() => setActiveLeaflet(null)}>{text(lang, 'close')}</button>
            </div>
            <div className="leaflet-fullscreen-body">
              {String(activeLeaflet.leaflet.file_type || '').startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(activeLeaflet.leaflet.file_url) ? (
                <img className="leaflet-fullscreen-image" src={activeLeaflet.leaflet.file_url} alt={activeLeaflet.label || text(lang, 'openProgram')} loading="lazy" decoding="async" />
              ) : (
                <iframe className="leaflet-fullscreen-frame" src={activeLeaflet.leaflet.file_url} title={activeLeaflet.label || text(lang, 'openProgram')} />
              )}
            </div>
          </article>
        </div>
      )}
      {contactAttributionModal}
    </section>
  );
}

function Philosophy({ lang, siteMedia, editor }) {
  const paragraphs = text(lang, 'philosophyText').split('\n\n');
  return (
    <section className="section compact-section">
      <div className="container philosophy-grid">
        <div className="editorial-card story-card">
          <span className="kicker">{text(lang, 'philosophyKicker')}</span>
          <h2>{text(lang, 'philosophyTitle')}</h2>
          <div className="story-text">
            {paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        </div>
        <div className="mission-grid">
          <article className="mission-card visual-note">
            <EditableImageSlot mediaKey="mission_main_image" lang={lang} siteMedia={siteMedia} editor={editor} fallbackSrc={MEDIA.landscape} fallbackAlt={text(lang, 'safetyAlt')} ratio="wide" />
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

function MissionPage({ lang, siteMedia, siteContent, editor }) {
  const missionTitle = contentText(siteContent, 'mission.mission.title', lang, text(lang, 'mission'));
  const visionTitle = contentText(siteContent, 'mission.vision.title', lang, text(lang, 'vision'));
  const missionBody = contentText(siteContent, 'mission.mission.body', lang, text(lang, 'missionText'));
  const visionBody = contentText(siteContent, 'mission.vision.body', lang, text(lang, 'visionText'));

  return (
    <section className="section page-section mission-redesign" id="mission">
      <div className="container mission-balanced-layout">
        <div className="mission-top-row titled-mission-row">
          <div className="mission-card-stack">
            <EditableText as="h2" itemKey="mission.mission.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'mission')} />
            <article className="mission-card mission-copy-card balanced-mission-card">
              <EditableText as="p" itemKey="mission.mission.body" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'missionText')} />
            </article>
          </div>
          <div className="mission-card-stack">
            <EditableText as="h2" itemKey="mission.vision.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'vision')} />
            <article className="mission-card accent vision-copy-card balanced-mission-card">
              <EditableText as="p" itemKey="mission.vision.body" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'visionText')} />
            </article>
          </div>
        </div>
        <div className="mission-bottom-row mission-image-only-row">
          <article className="mission-image-feature centered-mission-image">
            <EditableImageSlot mediaKey="mission_main_image" lang={lang} siteMedia={siteMedia} editor={editor} fallbackSrc={MEDIA.landscape} fallbackAlt={text(lang, 'safetyAlt')} ratio="wide" />
          </article>
        </div>
      </div>
    </section>
  );
}


function BlockedDatesAttachment({ item, lang, publicView = true, onOpenFile }) {
  const url = item?.blocked_dates_file_url;
  if (!url) return null;

  const type = item.blocked_dates_file_type || '';
  const name = item.blocked_dates_file_name || text(lang, 'blockedDatesCalendar');
  const isImage = type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(url);
  const label = publicView ? text(lang, 'openExcursionProgram') : text(lang, 'openCalendarFile');
  const filePayload = { file_url: url, file_type: type, file_name: name, title_it: name, title_en: name };

  const openFile = () => {
    if (typeof onOpenFile === 'function') {
      onOpenFile(filePayload, label);
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="blocked-dates-attachment">
      {!publicView && (
        <div className="blocked-dates-admin-meta">
          <strong>{text(lang, 'unavailableDates')}</strong>
          <span>{name}</span>
        </div>
      )}
      {isImage ? (
        <button className="blocked-dates-preview-button" type="button" onClick={openFile} aria-label={label}>
          <img src={url} alt={text(lang, 'blockedDatesCalendar')} loading="lazy" decoding="async" />
        </button>
      ) : (
        <button className="button secondary" type="button" onClick={openFile}>{label}</button>
      )}
    </div>
  );
}

function getItemsByDate(items) {
  return items.reduce((acc, item) => {
    if (!item.date) return acc;
    acc[item.date] = acc[item.date] || [];
    acc[item.date].push(item);
    return acc;
  }, {});
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formattedDescriptionBlocks(rawText) {
  const value = String(rawText || '').trim();
  if (!value) return [];

  const explicitBlocks = value.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  if (explicitBlocks.length > 1) return explicitBlocks;

  const sectionMarkers = [
    'Informazioni tecniche', 'Technical information',
    'Cosa include', 'What is included',
    'Partenza:', 'Departure:',
    'Rientro previsto:', 'Expected return:',
    'Distanza:', 'Distance:',
    'Dislivello:', 'Elevation gain:',
    'Durata:', 'Duration:',
    'Difficoltà:', 'Difficulty:',
    'Assicurazione', 'Insurance',
    'Partecipazione', 'Participation',
    'Quota:', 'Fee:',
    'Età minima:', 'Minimum age:',
    'Prenotazione', 'Booking',
    'Note:', 'Notes:'
  ];

  let normalized = value.replace(/\s+/g, ' ');
  sectionMarkers.forEach((marker) => {
    const pattern = new RegExp(`\\s+(${escapeRegExp(marker)})`, 'gi');
    normalized = normalized.replace(pattern, '\n\n$1');
  });

  const markedBlocks = normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  if (markedBlocks.length > 1) return markedBlocks;

  const sentences = value.match(/[^.!?]+[.!?]+[”’"']?|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [value];
  const blocks = [];
  let current = '';

  sentences.forEach((sentence) => {
    const next = current ? `${current} ${sentence}` : sentence;
    if (current && (next.length > 260 || current.split(/(?<=[.!?])\s+/).length >= 2)) {
      blocks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  });

  if (current) blocks.push(current);
  return blocks.length ? blocks : [value];
}

function FormattedDescription({ textValue }) {
  const blocks = formattedDescriptionBlocks(textValue);
  if (!blocks.length) return null;
  return (
    <div className="formatted-description">
      {blocks.map((block, index) => <p key={`${index}-${block.slice(0, 24)}`}>{block}</p>)}
    </div>
  );
}

function PublicUpcomingExcursions({ lang, fillForm, siteContent, editor }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthDate, setMonthDate] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayIso());

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadPublicFixedExcursions()
      .then((data) => {
        if (!active) return;
        const rows = data || [];
        setItems(rows);
        const first = rows.find((item) => item.date >= todayIso());
        if (first) {
          setSelectedDate(first.date);
          setMonthDate(startOfMonth(new Date(`${first.date}T12:00:00`)));
        }
      })
      .catch(() => { if (active) setItems([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const days = useMemo(() => getCalendarDays(monthDate), [monthDate]);
  const byDate = useMemo(() => getItemsByDate(items), [items]);
  const selectedItems = byDate[selectedDate] || [];

  function requestItem(item) {
    const trackingContext = buildBookingTrackingContext({
      experienceId: item?.experience_id || '',
      requestType: 'fixed',
      sourceSection: 'today',
      sourceCta: 'fixed_excursion',
      ctaLocation: 'today_section',
      selectedDate: item?.date || '',
      hasFixedExcursion: true,
      language: lang
    });
    trackBookingFormOpen(item?.experience_id || 'fixed', trackingContext);
    const message = buildFixedExcursionMessage({ fixedExcursion: item, people: '' }, lang);
    fillForm({
      experienceId: item.experience_id,
      requestType: 'fixed',
      fixedExcursionId: item.id,
      requestedDate: item.date,
      message,
      trackingContext,
      scroll: true
    });
  }

  function changeMonth(delta) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function renderDetails(item) {
    const title = fixedExcursionTitle(item, lang);
    const description = fixedExcursionField(item, 'description', lang) || item[`note_${lang}`] || item.note_it || item.note_en || '';
    const meeting = fixedExcursionField(item, 'meeting_point', lang);
    const difficulty = fixedExcursionField(item, 'difficulty', lang);
    const price = fixedExcursionField(item, 'price_note', lang);
    const timeRange = item.start_time ? `${String(item.start_time).slice(0, 5)}${item.end_time ? `–${String(item.end_time).slice(0, 5)}` : ''}` : text(lang, 'onRequest');
    return (
      <article className="upcoming-card compact-upcoming-card" key={item.id}>
        <div className="selected-date-heading-row">
          <h3>{formatDateForMessage(item.date, lang)}</h3>
          <span>{timeRange}</span>
        </div>
        <h4 className="selected-excursion-title">{title}</h4>
        <FormattedDescription textValue={description || experienceById(item.experience_id).summary[lang]} />
        <dl className="public-details-grid">
          <div><dt>{text(lang, 'experienceLabel')}</dt><dd>{adminExperienceLabel(item.experience_id, lang)}</dd></div>
          <MeetingPointDetailCard item={item} lang={lang} />
          {difficulty && <div><dt>{text(lang, 'difficulty')}</dt><dd>{difficulty}</dd></div>}
          {price && <div><dt>{text(lang, 'priceNote')}</dt><dd>{price}</dd></div>}
          <div><dt>{text(lang, 'placesAvailable')}</dt><dd>{item.places_remaining}/{item.capacity}</dd></div>
        </dl>
        <BlockedDatesAttachment item={item} lang={lang} onOpenFile={(file, label) => openLeafletModal(file, label || text(lang, 'openExcursionProgram'))} />
        <button className="button primary" type="button" onClick={() => requestItem(item)}>{text(lang, 'requestAvailability')}</button>
      </article>
    );
  }

  return (
    <section className="section page-section alt-section" id="upcoming">
      <div className="container">
        <div className="section-header refined-section-header">
          <EditableText as="h2" itemKey="upcoming.page.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'upcomingExcursions')} />
          <EditableText as="p" itemKey="upcoming.page.intro" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'availabilityIntro')} />
        </div>
        {loading ? <p>{lang === 'it' ? 'Caricamento...' : 'Loading...'}</p> : (
          <div className="public-calendar-layout">
            <article className="calendar-card public-excursion-calendar">
              <div className="calendar-topline simplified-calendar-header">
                <button type="button" onClick={() => changeMonth(-1)} aria-label={text(lang, 'previousMonth')}>‹</button>
                <h3 className="calendar-month-title">{monthLabel(monthDate, lang)}</h3>
                <button type="button" onClick={() => changeMonth(1)} aria-label={text(lang, 'nextMonth')}>›</button>
              </div>
              <div className="calendar-legend compact-legend">
                <span><i className="legend-dot fixed" />{text(lang, 'availableDates')}</span>
              </div>
              <div className="weekdays" aria-hidden="true">
                {(lang === 'it' ? ['L', 'M', 'M', 'G', 'V', 'S', 'D'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']).map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
              </div>
              <div className="calendar-grid public-calendar-grid">
                {days.map((date) => {
                  const iso = dateToIso(date);
                  const hasFixed = Boolean(byDate[iso]?.length);
                  const outside = date.getMonth() !== monthDate.getMonth();
                  return (
                    <button
                      type="button"
                      key={iso}
                      className={`date-button public-date-button ${outside ? 'outside' : ''} ${hasFixed ? 'has-fixed' : ''} ${selectedDate === iso ? 'selected' : ''}`}
                      onClick={() => setSelectedDate(iso)}
                    >
                      <strong>{date.getDate()}</strong>
                      {hasFixed && <span className="date-marker green-circle" aria-label={text(lang, 'availableDates')} />}
                    </button>
                  );
                })}
              </div>
            </article>
            <aside className="date-detail-panel">
              <span className="micro-label details-label">{text(lang, 'dateDetails')}</span>
              {selectedItems.length === 0 && <h3>{selectedDate ? formatDateForMessage(selectedDate, lang) : text(lang, 'dateDetails')}</h3>}
              {items.length === 0 ? (
                <article className="empty-state-card"><p>{text(lang, 'upcomingEmpty')}</p><button className="button primary" type="button" onClick={() => {
                  const trackingContext = buildBookingTrackingContext({ requestType: 'private', sourceSection: 'today', sourceCta: 'prepare_request', ctaLocation: 'today_section', language: lang });
                  trackBookingFormOpen('private', trackingContext);
                  fillForm({ requestType: 'private', trackingContext, scroll: true });
                }}>{text(lang, 'contact')}</button></article>
              ) : selectedItems.length === 0 ? (
                <p>{text(lang, 'noExcursionsOnDate')}</p>
              ) : (
                <div className="selected-excursion-list">{selectedItems.map(renderDetails)}</div>
              )}
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}

function PartnershipsPage({ lang, siteContent, editor }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadPublicPartnerships()
      .then((data) => { if (active) setItems(data || []); })
      .catch(() => { if (active) setItems([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section className="section page-section" id="partnerships">
      <div className="container">
        <div className="section-header refined-section-header">
          <EditableText as="h2" itemKey="partnerships.page.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'partnershipsTitle')} />
          <EditableText as="p" itemKey="partnerships.page.intro" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'partnershipsIntro') || ''} />
        </div>
        {loading ? <p>{lang === 'it' ? 'Caricamento...' : 'Loading...'}</p> : items.length === 0 ? (
          <article className="empty-state-card"><p>{text(lang, 'partnershipsEmpty')}</p></article>
        ) : (
          <div className="partnership-grid">
            {items.map((item) => {
              const description = item[`description_${lang}`] || item.description_it || item.description_en || '';
              const category = item[`category_${lang}`] || item.category_it || item.category_en || '';
              return (
                <article className="partnership-card" key={item.id}>
                  {item.image_url ? <img src={item.image_url} alt={item.name} loading="lazy" decoding="async" /> : <div className="partnership-image-fallback" aria-hidden="true">vulcanIQ</div>}
                  <div>
                    {category && <span className="micro-label">{category}</span>}
                    <h3>{item.name}</h3>
                    {description && <p>{description}</p>}
                    {item.website_url && <a className="button secondary" href={item.website_url} target="_blank" rel="noopener noreferrer">{text(lang, 'visitWebsite')}</a>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function ReviewsPage({ lang, siteContent, editor }) {
  const fallbackReview = lang === 'it'
    ? 'Bellissima esperienza grazie alla nostra guida Leonardo, che ha una vera passione per i vulcani. Percorso moderato, pause ben gestite e consigli pratici molto chiari.'
    : 'Beautiful experience thanks to our guide Leonardo, who has a real passion for volcanoes. The route was moderate, breaks were well managed, and the practical advice was very clear.';
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [sortMode, setSortMode] = useState('recent');
  const [form, setForm] = useState({ booking_code: '', reviewer_name: '', review_text: '', rating: '5' });
  const [submitState, setSubmitState] = useState({ loading: false, error: '', success: '' });

  useBodyScrollLock(modalOpen);

  async function refreshReviews() {
    setLoading(true);
    try {
      const data = await loadPublicReviews();
      setReviews(data || []);
    } catch (err) {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { trackReviewView(); refreshReviews(); }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function readableSubmitError(error) {
    const message = error?.message || '';
    if (message.includes('INVALID_BOOKING_CODE')) return lang === 'it' ? 'Codice non valido.' : 'Invalid code.';
    if (message.includes('BOOKING_CODE_ALREADY_USED') || message.includes('duplicate key')) return lang === 'it' ? 'Questo codice è già stato usato.' : 'This code has already been used.';
    if (message.includes('REVIEW_TEXT_REQUIRED')) return lang === 'it' ? 'Compila tutti i campi obbligatori.' : 'Please complete all required fields.';
    return lang === 'it' ? 'Recensione non inviata. Controlla il codice e riprova.' : 'Review not submitted. Check the code and try again.';
  }

  async function submitReview(event) {
    event.preventDefault();
    setSubmitState({ loading: true, error: '', success: '' });
    try {
      await submitPublicReview({ ...form, language: lang });
      setForm({ booking_code: '', reviewer_name: '', review_text: '', rating: '5' });
      setSubmitState({ loading: false, error: '', success: lang === 'it' ? 'Recensione pubblicata. Grazie.' : 'Review published. Thank you.' });
      refreshReviews();
      window.setTimeout(() => setModalOpen(false), 1200);
    } catch (err) {
      setSubmitState({ loading: false, error: readableSubmitError(err), success: '' });
    }
  }

  const visibleReviews = loading ? [] : reviews;
  const cards = visibleReviews.length ? visibleReviews : [{ id: 'fallback', created_at: '2025-01-01', review_text: fallbackReview, reviewer_name: 'Leonardo', rating: 5, language: 'en' }];
  const sortedCards = [...cards].sort((a, b) => {
    if (sortMode === 'highest') return Number(b.rating || -1) - Number(a.rating || -1) || String(b.created_at || '').localeCompare(String(a.created_at || ''));
    if (sortMode === 'lowest') return Number(a.rating || 999) - Number(b.rating || 999) || String(b.created_at || '').localeCompare(String(a.created_at || ''));
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });

  function reviewDate(review) {
    const raw = review.experience_date || review.excursion_date || review.submitted_at || review.created_at;
    return raw ? formatDateForMessage(String(raw).slice(0, 10), lang) : '-';
  }

  function reviewGuide(review) {
    return review.guide_name || review.guide || review.owner_name || 'Leonardo Chiavetta';
  }

  function reviewBookedBy(review) {
    return review.reviewer_name || review.customer_name || review.booked_by || (lang === 'it' ? 'Ospite' : 'Guest');
  }

  function renderReviewText(value, className = 'formatted-review-text') {
    return (
      <div className={className}>
        {normalizeReviewText(value).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>)}
      </div>
    );
  }

  return (
    <section className="section compact-section" id="reviews">
      <div className="container reviews-panel redesigned-reviews-panel">
        <div className="section-header refined-section-header reviews-header-row">
          <div>
            <EditableText as="h2" itemKey="reviews.page.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'reviewsTitle')} />
            <EditableText as="p" itemKey="reviews.page.intro" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'reviewsIntro')} />
          </div>
          <div className="reviews-header-actions">
            <button className="button primary" type="button" onClick={() => { setSubmitState({ loading: false, error: '', success: '' }); setModalOpen(true); }}><EditableText itemKey="reviews.publish_button" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'publishReview')} /></button>
            <div className="review-sort-control" role="group" aria-label={lang === 'it' ? 'Ordina recensioni' : 'Sort reviews'}>
              <button type="button" className={sortMode === 'recent' ? 'active' : ''} onClick={() => setSortMode('recent')}>{adminCopy(lang, 'Più recenti', 'Most recent')}</button>
              <button type="button" className={sortMode === 'highest' ? 'active' : ''} onClick={() => setSortMode('highest')}>{adminCopy(lang, 'Voto più alto', 'Highest score')}</button>
              <button type="button" className={sortMode === 'lowest' ? 'active' : ''} onClick={() => setSortMode('lowest')}>{adminCopy(lang, 'Voto più basso', 'Lowest score')}</button>
            </div>
          </div>
        </div>
        <div className="reviews-grid-public balanced-reviews-grid">
          {sortedCards.map((review) => (
            <article className="review-card featured-review-card" key={review.id}>
              <header className="review-card-info-header">
                <div className="stars review-rating-stars" aria-label={`${review.rating || 0}/5`}>{'★'.repeat(Number(review.rating) || 5)}</div>
                <div className="review-info-list">
                  <span><b>{text(lang, 'bookedBy')}:</b> {reviewBookedBy(review)}</span>
                  <span><b>{text(lang, 'reviewDateLabel')}:</b> {reviewDate(review)}</span>
                  <span><b>{text(lang, 'guideLabel')}:</b> {reviewGuide(review)}</span>
                </div>
              </header>
              <blockquote>{renderReviewText(review.review_text)}</blockquote>
              {review.admin_reply && (
                <div className="public-admin-reply">
                  <strong>{adminCopy(lang, 'Risposta vulcanIQ', 'vulcanIQ response')}</strong>
                  {renderReviewText(review.admin_reply, 'formatted-review-text admin-reply-text')}
                </div>
              )}
            </article>
          ))}
        </div>
        {loading && <p className="small-note">{lang === 'it' ? 'Caricamento recensioni...' : 'Loading reviews...'}</p>}
        {modalOpen && (
          <div className="public-modal-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
            <div className="admin-modal review-modal" role="dialog" aria-modal="true" aria-labelledby="reviewModalTitle" onClick={(event) => event.stopPropagation()}>
              <div className="admin-modal-header">
                <div>
                  <h2 id="reviewModalTitle">{text(lang, 'leaveReviewTitle')}</h2>
                  <p>{text(lang, 'leaveReviewIntro')}</p>
                </div>
                <button className="modal-close-button" type="button" onClick={() => setModalOpen(false)}>{text(lang, 'close')}</button>
              </div>
              <form className="review-form modal-review-form" onSubmit={submitReview}>
                <label><span>{text(lang, 'bookingCode')}</span><input value={form.booking_code} onChange={(event) => update('booking_code', event.target.value)} required /></label>
                <label><span>{text(lang, 'name')}</span><input value={form.reviewer_name} onChange={(event) => update('reviewer_name', event.target.value)} /></label>
                <label><span>{text(lang, 'rating')}</span><select value={form.rating} onChange={(event) => update('rating', event.target.value)}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating}/5</option>)}</select></label>
                <label><span>{text(lang, 'reviewText')}</span><textarea rows={5} value={form.review_text} onChange={(event) => update('review_text', event.target.value)} required /></label>
                {submitState.error && <div className="admin-alert error" role="alert">{submitState.error}</div>}
                {submitState.success && <div className="admin-alert success" role="status">{submitState.success}</div>}
                <div className="modal-actions"><button className="button primary" type="submit" disabled={submitState.loading || !isSupabaseConfigured}>{submitState.loading ? (lang === 'it' ? 'Invio...' : 'Sending...') : text(lang, 'submitReview')}</button><button className="button secondary" type="button" onClick={() => setModalOpen(false)}>{text(lang, 'close')}</button></div>
              </form>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function WearReviewsSafety({ lang }) {
  const wearItems = lang === 'it'
    ? ['Scarpe chiuse con buona suola', 'Giacca antivento e strato caldo', 'Acqua personale e protezione solare', 'No abbigliamento fragile o inadatto al terreno lavico']
    : ['Closed shoes with good grip', 'Windproof jacket and warm layer', 'Personal water and sun protection', 'No fragile clothing unsuitable for lava terrain'];
  const safetyItems = lang === 'it'
    ? ['Meteo e visibilità', 'Ordinanze e accessibilità', 'Attività vulcanica reale', 'Età, mobilità e abbigliamento del gruppo']
    : ['Weather and visibility', 'Regulations and access', 'Actual volcanic activity', 'Group age, mobility, and clothing'];
  const review = lang === 'it'
    ? 'Bellissima esperienza grazie alla nostra guida Leonardo, che ha una vera passione per i vulcani. Ero preoccupato di non essere vestito abbastanza pesante perché la temperatura indicata in cima era sotto lo zero — era fine aprile — ma una felpa e una giacca leggera sono state sufficienti. L’escursione è moderatamente impegnativa, ma dura solo circa un’ora. Abbiamo avuto il tempo per fare un paio di belle pause durante la salita e, dopo l’escursione, per mangiare qualcosa.'
    : 'Had a great time thanks to our guide Leonardo, who has a real passion for volcanoes. I had been worried about being underdressed because the reported temperature at the top was below freezing — this was in late April — but a sweatshirt and light jacket were fine. The hike is moderately strenuous but only one hour. We had time for a couple of nice breaks on the way up and after our hike to have some food.';

  return (
    <>
      <section className="section compact-section" id="safety">
        <div className="container three-column-section">
          <article className="content-card">
            <span className="kicker">{text(lang, 'wearKicker')}</span>
            <h2>{text(lang, 'wearTitle')}</h2>
            <p>{text(lang, 'wearIntro')}</p>
            <ul className="check-list">{wearItems.map((item) => <li key={item}>{item}</li>)}</ul>
            <p className="small-note gear-extra">{text(lang, 'gearExtra')}</p>
          </article>
          <article className="content-card image-info-card">
            <ImageSlot src={MEDIA.liveSafe} alt={text(lang, 'liveAlt')} lang={lang} ratio="wide" />
            <div className="info-card-copy">
              <h3>{lang === 'it' ? 'Distanza sicura, sempre.' : 'Safe distance, always.'}</h3>
              <p>{lang === 'it' ? 'L’itinerario resta flessibile e viene scelto solo dopo una valutazione reale delle condizioni.' : 'The route stays flexible and is chosen only after real assessment of conditions.'}</p>
            </div>
          </article>
          <article className="content-card dark-card readable-safety-card">
            <span className="kicker light">{text(lang, 'safetyKicker')}</span>
            <h2>{text(lang, 'safetyTitle')}</h2>
            <p>{text(lang, 'safetyIntro')}</p>
            <ul className="check-list">{safetyItems.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
        </div>
      </section>
      <section className="section image-strip-section">
        <div className="container gallery-grid detail-gallery">
          <ImageSlot src={MEDIA.landscape} alt={text(lang, 'safetyAlt')} lang={lang} />
          <ImageSlot src={MEDIA.lavaRock} alt={text(lang, 'gallery01Alt')} lang={lang} />
          <ImageSlot src={MEDIA.guide} alt={text(lang, 'gallery02Alt')} lang={lang} />
          <ImageSlot src={MEDIA.naturalLight} alt={text(lang, 'gallery03Alt')} lang={lang} />
        </div>
      </section>
      <section className="section compact-section" id="reviews">
        <div className="container reviews-panel">
          <div className="section-header">
            <h2>{text(lang, 'reviewsTitle')}</h2>
            <p>{text(lang, 'reviewsIntro')}</p>
          </div>
          <article className="testimonial-card">
            {lang === 'it' && <span className="micro-label">{text(lang, 'reviewOriginalLabel')}</span>}
            <blockquote>{review}</blockquote>
            <p className="small-note">Leonardo · Etna experience</p>
          </article>
        </div>
      </section>
    </>
  );
}

function Team({ lang, siteMedia, siteContent, editor }) {
  const contact = resolvePublicContactDetails(siteContent);
  return (
    <section className="section" id="team">
      <div className="container about-mission-section">
        <div className="section-header">
          <EditableText as="h2" itemKey="about.page.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'teamTitle')} />
        </div>
        <div className="team-grid">
          <article className="team-card leonardo-card">
            <EditableImage mediaKey="about_leonardo_image" lang={lang} siteMedia={siteMedia} editor={editor} fallbackSrc={MEDIA.leonardo} fallbackAlt={lang === 'it' ? 'Leonardo, guida vulcanologica vulcanIQ' : 'Leonardo, vulcanIQ volcanological guide'} className="team-photo" />
            <div>
              <h3>Leonardo Chiavetta</h3>
              <EditableText as="p" className="role" itemKey="about.leonardo.role" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'leonardoRole')} />
              <EditableText as="p" itemKey="about.leonardo.bio" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'leonardoBio')} />
              <a className="inline-link" href={contact.instagram} target="_blank" rel="noopener noreferrer"><Icon name="insta" />{text(lang, 'instagram')}</a>
            </div>
          </article>
          <article className="team-card">
            <EditableImage mediaKey="about_deborah_image" lang={lang} siteMedia={siteMedia} editor={editor} fallbackSrc="/images/co-owner.jpg" fallbackAlt={text(lang, 'coFounderAlt')} className="team-photo" />
            <div>
              <EditableText as="h3" itemKey="about.deborah.name" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'coFounderName')} />
              <EditableText as="p" className="role" itemKey="about.deborah.role" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'coFounderRole')} />
              <EditableText as="p" itemKey="about.deborah.bio" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'coFounderBio')} />
            </div>
          </article>
        </div>
        <div className="about-mission-grid">
          <article className="mission-card mission-copy-card balanced-mission-card">
            <EditableText as="h2" itemKey="mission.mission.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'mission')} />
            <EditableText as="p" itemKey="mission.mission.body" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'missionText')} />
          </article>
          <article className="mission-card accent vision-copy-card balanced-mission-card">
            <EditableText as="h2" itemKey="mission.vision.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'vision')} />
            <EditableText as="p" itemKey="mission.vision.body" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'visionText')} />
          </article>
        </div>
      </div>
    </section>
  );
}

function currentBrowserAttribution() {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search || '');
  const utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].reduce((acc, key) => {
    const value = String(params.get(key) || '').trim();
    if (value) acc[key] = value.slice(0, 120);
    return acc;
  }, {});
  const source = String(utm.utm_source || '').toLowerCase();
  const trafficSource = source.includes('instagram') ? 'instagram'
    : source.includes('whatsapp') ? 'whatsapp'
      : source.includes('facebook') || source === 'fb' ? 'facebook'
        : source.includes('google') ? 'google'
          : source ? 'other' : 'direct';
  return { traffic_source: trafficSource, ...utm };
}

function buildBookingTrackingContext({
  experienceId = '',
  requestType = 'private',
  sourceSection = 'contact',
  sourceCta = 'prepare_request',
  ctaLocation = 'contact_section',
  selectedDate = '',
  hasFixedExcursion = false,
  language = 'it'
} = {}) {
  const knownExperience = experiences.find((experience) => experience.id === experienceId) || null;
  const normalizedRequestType = requestType || (knownExperience ? 'experience' : 'private');
  return {
    ...currentBrowserAttribution(),
    ...(knownExperience ? {
      experience_slug: knownExperience.id,
      experience_id: knownExperience.id,
      experience_name: knownExperience.title
    } : {}),
    request_type: normalizedRequestType,
    source_section: sourceSection || 'unknown',
    source_cta: sourceCta || 'unknown',
    cta_location: ctaLocation || 'unknown',
    selected_date: selectedDate || '',
    has_fixed_excursion: Boolean(hasFixedExcursion),
    language: language || 'it'
  };
}

function mergeTrackingContext(base = {}, override = {}) {
  return { ...(base || {}), ...(override || {}) };
}

function ContactForm({ lang, formState, setFormState, siteMedia, siteContent, editor }) {
  const contact = resolvePublicContactDetails(siteContent);
  const { requestContactAttribution, contactAttributionModal } = useContactAttributionGate(lang);
  const [submitState, setSubmitState] = useState({ loading: false, error: '', success: '' });
  const [fixedExcursions, setFixedExcursions] = useState([]);
  const requestType = formState.requestType || 'private';
  const message = formState.message || text(lang, 'defaultMessage');
  const experienceId = formState.experienceId || '';
  const selectedFixed = fixedExcursions.find((item) => item.id === formState.fixedExcursionId) || null;
  const effectiveExperienceId = requestType === 'fixed' && selectedFixed?.experience_id ? selectedFixed.experience_id : experienceId;
  const selectedTitle = effectiveExperienceId ? experienceById(effectiveExperienceId).title : '';
  const adults = Number.parseInt(formState.adults || '0', 10) || 0;
  const children = Number.parseInt(formState.children || '0', 10) || 0;
  const childrenUnder3Count = Number.parseInt(formState.childrenUnder3Count || '0', 10) || 0;
  const totalPeople = adults + children;
  const over12 = totalPeople > 12;
  const selectedHeardAboutUs = normalizeHeardAboutUs(formState.heardAboutUs);
  const selectedHeardAboutUsDetail = cleanHeardAboutUsDetail(formState.heardAboutUsDetail);
  const selectedHeardAboutUsNeedsDetail = needsHeardAboutUsDetail(selectedHeardAboutUs);
  const fullMessage = appendHeardAboutUsToMessage(appendUnder3CountToMessage(message, childrenUnder3Count, lang), selectedHeardAboutUs, selectedHeardAboutUsDetail, lang);
  const preferredContactValue = ['whatsapp', 'phone', 'email'].includes(formState.preferredContact) ? formState.preferredContact : 'whatsapp';
  const selectedHeardAboutUsMetadata = heardAboutUsMetadata(selectedHeardAboutUs, lang, selectedHeardAboutUsDetail);
  const trackedFormOpenRef = useRef(new Set());
  const [leaflets, setLeaflets] = useState([]);
  const [fixedOptionsOpen, setFixedOptionsOpen] = useState(false);
  const [privateOptionsOpen, setPrivateOptionsOpen] = useState(false);
  const [detailsMonthDate, setDetailsMonthDate] = useState(startOfMonth(new Date()));
  const [activeLeaflet, setActiveLeaflet] = useState(null);
  const [selectedPrivateExperience, setSelectedPrivateExperience] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      loadPublicFixedExcursions(),
      loadPublicMonthlyLeaflets().catch(() => [])
    ]).then(([fixedRows, leafletRows]) => {
      if (!active) return;
      setFixedExcursions(fixedRows || []);
      setLeaflets(leafletRows || []);
    }).catch(() => {
      if (!active) return;
      setFixedExcursions([]);
      setLeaflets([]);
    });
    return () => { active = false; };
  }, []);

  useBodyScrollLock(Boolean(fixedOptionsOpen || privateOptionsOpen || activeLeaflet || selectedPrivateExperience));

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key !== 'Escape') return;
      if (activeLeaflet) { setActiveLeaflet(null); return; }
      if (selectedPrivateExperience) { setSelectedPrivateExperience(null); return; }
      setFixedOptionsOpen(false);
      setPrivateOptionsOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [activeLeaflet, selectedPrivateExperience]);

  const fixedOptions = useMemo(() => monthlyOptionsLeaflets({ leaflets, fixedExcursions, monthDate: detailsMonthDate, lang }), [leaflets, fixedExcursions, detailsMonthDate, lang]);
  const canGoPreviousDetailsMonth = isCurrentOrFutureMonth(new Date(detailsMonthDate.getFullYear(), detailsMonthDate.getMonth() - 1, 1));

  function update(field, value) {
    if (!trackedFormOpenRef.current.has('field_start')) {
      trackedFormOpenRef.current.add('field_start');
      trackBookingFormFieldStart(effectiveExperienceId || requestType || 'unsure', mergeTrackingContext(mergeTrackingContext(buildBookingTrackingContext({
        experienceId: effectiveExperienceId,
        requestType,
        sourceSection: 'contact',
        sourceCta: 'prepare_request',
        ctaLocation: 'booking_modal',
        selectedDate: selectedFixed?.date || formState.requestedDate || '',
        hasFixedExcursion: requestType === 'fixed',
        language: formState.language || lang
      }), formState.trackingContext), heardAboutUsMetadata(field === 'heardAboutUs' ? value : formState.heardAboutUs, lang, field === 'heardAboutUsDetail' ? value : formState.heardAboutUsDetail)));
    }
    setFormState((current) => {
      if (field === 'heardAboutUs') {
        return { ...current, heardAboutUs: value, heardAboutUsDetail: needsHeardAboutUsDetail(value) ? current.heardAboutUsDetail : '' };
      }
      return { ...current, [field]: value };
    });
  }

  function updateRequestType(value) {
    setFormState((current) => ({
      ...current,
      requestType: value,
      privateExperience: value === 'private',
      fixedExcursionId: value === 'fixed' ? current.fixedExcursionId : '',
      requestedDate: value === 'private' ? current.requestedDate : current.requestedDate
    }));
  }

  function updateFixedExcursion(id) {
    const fixed = fixedExcursions.find((item) => item.id === id);
    setFormState((current) => ({
      ...current,
      requestType: 'fixed',
      fixedExcursionId: id,
      privateExperience: false,
      experienceId: fixed?.experience_id || current.experienceId,
      requestedDate: fixed?.date || current.requestedDate,
      message: fixed ? buildFixedExcursionMessage({ fixedExcursion: fixed, people: totalPeople || '' }, lang) : current.message
    }));
  }

  function changeDetailsMonth(delta) {
    setDetailsMonthDate((current) => {
      const next = startOfMonth(new Date(current.getFullYear(), current.getMonth() + delta, 1));
      return isCurrentOrFutureMonth(next) ? next : startOfMonth(new Date());
    });
  }

  function openRequestDetails() {
    if (requestType === 'fixed') {
      setDetailsMonthDate(startOfMonth(new Date()));
      setFixedOptionsOpen(true);
      trackEvent('fixed_excursion_options_open', { request_type: 'fixed', selected_month: monthKey(new Date()), language: lang, source_section: 'today_request_flow' }, { dedupe: false });
      trackEvent('request_details_open', { request_type: 'fixed', language: lang, source_section: 'today_request_flow' }, { dedupe: false });
      return;
    }
    setPrivateOptionsOpen(true);
    trackEvent('private_excursion_options_open', { request_type: 'private', language: lang, source_section: 'today_request_flow' }, { dedupe: false });
    trackEvent('request_details_open', { request_type: 'private', language: lang, source_section: 'today_request_flow' }, { dedupe: false });
  }

  function openRequestLeaflet(option) {
    if (!option?.leaflet?.file_url) return;
    const selectedMonth = monthKey(detailsMonthDate);
    trackEvent('fixed_leaflet_open_from_request', {
      request_type: 'fixed',
      selected_month: selectedMonth,
      excursion_id: option.fixedExcursion?.id || '',
      excursion_slug: option.fixedExcursion?.experience_id || '',
      language: lang,
      source_section: 'today_request_flow'
    }, { dedupe: false });
    setActiveLeaflet({ leaflet: option.leaflet, label: option.title || leafletTitle(option.leaflet, lang) });
  }

  function openPrivateExperienceDetails(experience) {
    trackEvent('private_excursion_detail_open_from_request', {
      request_type: 'private',
      excursion_id: experience?.id || '',
      excursion_slug: experience?.id || '',
      language: lang,
      source_section: 'today_request_flow'
    }, { dedupe: false });
    trackExperienceDetailOpen(experience);
    setSelectedPrivateExperience(experience);
  }

  const currentTrackingMetadata = mergeTrackingContext(mergeTrackingContext(buildBookingTrackingContext({
    experienceId: effectiveExperienceId,
    requestType,
    sourceSection: 'contact',
    sourceCta: 'prepare_request',
    ctaLocation: 'booking_modal',
    selectedDate: selectedFixed?.date || formState.requestedDate || '',
    hasFixedExcursion: requestType === 'fixed',
    language: formState.language || lang
  }), formState.trackingContext), selectedHeardAboutUsMetadata);

  function usePrivateExperienceInRequest(experience) {
    setFormState((current) => ({
      ...current,
      requestType: 'private',
      privateExperience: true,
      experienceId: experience?.id || current.experienceId,
      message: experience ? buildExperienceMessage(experience, lang) : current.message,
      language: current.language || lang
    }));
    setSelectedPrivateExperience(null);
    setPrivateOptionsOpen(false);
  }

  async function submitRequest(event) {
    event.preventDefault();
    setSubmitState({ loading: false, error: '', success: '' });

    const email = (formState.email || '').trim();
    const phone = (formState.phone || '').trim();
    const selectedDate = (formState.requestedDate || '').trim();
    const hasMessage = (message || '').trim() && message !== text(lang, 'defaultMessage');
    const trackedExperience = effectiveExperienceId || requestType || 'unsure';
    const trackingMetadata = currentTrackingMetadata;

    if (!email && !phone) {
      trackBookingSubmitValidationError(trackedExperience, 'missing_contact', trackingMetadata);
      setSubmitState({ loading: false, error: text(lang, 'contactRequired'), success: '' });
      return;
    }

    if (!totalPeople) {
      trackBookingSubmitValidationError(trackedExperience, 'missing_people', trackingMetadata);
      setSubmitState({ loading: false, error: text(lang, 'peopleRequired'), success: '' });
      return;
    }

    if (requestType === 'fixed' && !formState.fixedExcursionId) {
      trackBookingSubmitValidationError(trackedExperience, 'missing_fixed_excursion', trackingMetadata);
      setSubmitState({ loading: false, error: text(lang, 'fixedDateRequired'), success: '' });
      return;
    }

    if (!selectedHeardAboutUs) {
      trackBookingSubmitValidationError(trackedExperience, 'missing_heard_about_us', trackingMetadata);
      setSubmitState({ loading: false, error: text(lang, 'heardAboutUsRequired'), success: '' });
      return;
    }

    if (selectedHeardAboutUsNeedsDetail && !selectedHeardAboutUsDetail) {
      trackBookingSubmitValidationError(trackedExperience, 'missing_heard_about_us_detail', trackingMetadata);
      setSubmitState({ loading: false, error: text(lang, 'heardAboutUsOtherRequired'), success: '' });
      return;
    }

    if (!hasMessage && !effectiveExperienceId && !selectedDate) {
      trackBookingSubmitValidationError(trackedExperience, 'missing_request_details', trackingMetadata);
      setSubmitState({ loading: false, error: text(lang, 'requestDetailsRequired'), success: '' });
      return;
    }

    trackBookingSubmitAttempt(trackedExperience, adults, children, trackingMetadata);
    setSubmitState({ loading: true, error: '', success: '' });

    try {
      const request = await createPublicBookingRequest({
        customer_name: formState.name,
        customer_email: email,
        customer_phone: phone,
        preferred_contact: preferredContactValue,
        experience_id: requestType === 'fixed' ? (selectedFixed?.experience_id || 'unsure') : (experienceId || 'unsure'),
        fixed_excursion_experience_id: selectedFixed?.experience_id || null,
        requested_date: selectedFixed?.date || formState.requestedDate,
        alternative_date: formState.alternativeDate,
        language: formState.language || lang,
        party_type: formState.partyType || (requestType === 'private' ? 'other' : 'group'),
        request_type: requestType,
        fixed_excursion_id: requestType === 'fixed' ? formState.fixedExcursionId : null,
        adults,
        children,
        children_under_3: childrenUnder3Count > 0,
        private_experience: requestType === 'private',
        message: fullMessage,
        heard_about_us: selectedHeardAboutUs,
        heard_about_us_label: heardAboutUsLabel(selectedHeardAboutUs, lang),
        heard_about_us_detail: selectedHeardAboutUsNeedsDetail ? selectedHeardAboutUsDetail : null,
        source: 'website',
        source_section: trackingMetadata.source_section,
        source_cta: trackingMetadata.source_cta,
        cta_location: trackingMetadata.cta_location,
        selected_date: trackingMetadata.selected_date || selectedFixed?.date || formState.requestedDate || null,
        has_fixed_excursion: trackingMetadata.has_fixed_excursion,
        traffic_source: trackingMetadata.traffic_source,
        utm_source: trackingMetadata.utm_source,
        utm_medium: trackingMetadata.utm_medium,
        utm_campaign: trackingMetadata.utm_campaign,
        utm_content: trackingMetadata.utm_content
      });
      trackBookingSubmitSuccess(trackedExperience, adults, children, { ...trackingMetadata, request_id: request?.id || '' });
      setSubmitState({ loading: false, error: '', success: text(lang, 'requestSent') });
    } catch (error) {
      trackBookingSubmitError(trackedExperience, 'supabase_insert_error', trackingMetadata);
      setSubmitState({ loading: false, error: text(lang, 'requestFallbackError'), success: '' });
    }
  }


  function validateSelectedAttributionForDirectContact(trackedExperience, trackingMetadata) {
    if (!selectedHeardAboutUs) {
      trackBookingSubmitValidationError(trackedExperience, 'missing_heard_about_us', trackingMetadata);
      setSubmitState({ loading: false, error: text(lang, 'heardAboutUsRequired'), success: '' });
      return false;
    }
    if (selectedHeardAboutUsNeedsDetail && !selectedHeardAboutUsDetail) {
      trackBookingSubmitValidationError(trackedExperience, 'missing_heard_about_us_detail', trackingMetadata);
      setSubmitState({ loading: false, error: text(lang, 'heardAboutUsOtherRequired'), success: '' });
      return false;
    }
    return true;
  }

  function openFormWhatsapp() {
    const trackedExperience = effectiveExperienceId || requestType || 'unsure';
    if (!validateSelectedAttributionForDirectContact(trackedExperience, currentTrackingMetadata)) return;
    trackContactClick('whatsapp', 'booking_modal', { ...currentTrackingMetadata, source_cta: 'whatsapp_direct' });
    if (typeof window !== 'undefined') {
      window.open(`https://wa.me/${contact.phoneWa}?text=${encode(buildAttributionContactMessage(selectedHeardAboutUs, selectedHeardAboutUsDetail, lang))}`, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <section className="section alt-section" id="contact">
      <div className="container contact-section-grid">
        <div>
          <EditableText as="h2" itemKey="contact.page.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'formTitle')} />
          <EditableText as="p" itemKey="contact.page.intro" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'formIntro')} />
          <ContactActions lang={lang} contextMessage={fullMessage} onUseForm={null} siteContent={siteContent} contactDetails={contact} />
          <a className="instagram-link" href={contact.instagram} target="_blank" rel="noopener noreferrer"><Icon name="insta" />{text(lang, 'instagram')}</a>
        </div>
        <form className="contact-form" onSubmit={submitRequest}>
          <label className="field-label">{text(lang, 'requestMode')}</label>
          <div className="mode-toggle form-mode-toggle" role="tablist" aria-label={text(lang, 'requestMode')}>
            <button type="button" className={requestType === 'fixed' ? 'active' : ''} onClick={() => updateRequestType('fixed')}>{text(lang, 'fixedExcursion')}</button>
            <button type="button" className={requestType === 'private' ? 'active' : ''} onClick={() => updateRequestType('private')}>{text(lang, 'privateExcursion')}</button>
          </div>

          <button className="request-details-button" type="button" onClick={openRequestDetails}>
            {requestType === 'fixed' ? text(lang, 'viewFixedExcursionOptions') : text(lang, 'viewPrivateExcursionOptions')}
          </button>

          {requestType === 'fixed' && (
            <>
              <label className="field-label" htmlFor="contactFixedExcursion">{text(lang, 'chooseFixedExcursion')}</label>
              <select id="contactFixedExcursion" value={formState.fixedExcursionId || ''} onChange={(event) => updateFixedExcursion(event.target.value)}>
                <option value="">{text(lang, 'chooseFixedExcursion')}</option>
                {fixedExcursions.map((item) => <option key={item.id} value={item.id}>{fixedExcursionLabel(item, lang)} · {text(lang, 'placesRemaining')} {item.places_remaining}/{item.capacity}</option>)}
              </select>
              {fixedExcursions.length === 0 && <p className="small-note">{text(lang, 'noFixedExcursions')}</p>}
            </>
          )}

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

          <div className="form-two-cols">
            <div>
              <label className="field-label" htmlFor="contactPreferred">{text(lang, 'preferredContact')}</label>
              <select id="contactPreferred" value={preferredContactValue} onChange={(event) => update('preferredContact', event.target.value)}>
                <option value="whatsapp">WhatsApp</option>
                <option value="phone">{lang === 'it' ? 'Telefono' : 'Phone'}</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="contactLanguage">{text(lang, 'preferredLanguage')}</label>
              <select id="contactLanguage" value={formState.language || lang} onChange={(event) => update('language', event.target.value)}>
                <option value="it">Italiano</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <label className="field-label" htmlFor="contactHeardAboutUs">{text(lang, 'heardAboutUs')}</label>
          <ContactAttributionSelect id="contactHeardAboutUs" lang={lang} value={formState.heardAboutUs || ''} onChange={(value) => update('heardAboutUs', value)} />
          {selectedHeardAboutUsNeedsDetail && (
            <label className="field-label full" htmlFor="contactHeardAboutUsDetail">
              {text(lang, 'heardAboutUsOtherLabel')}
              <textarea
                id="contactHeardAboutUsDetail"
                value={formState.heardAboutUsDetail || ''}
                onChange={(event) => update('heardAboutUsDetail', event.target.value)}
                placeholder={text(lang, 'heardAboutUsOtherPlaceholder')}
                rows={3}
                maxLength={240}
                required
              />
            </label>
          )}

          <div className="form-two-cols">
            <div>
              <label className="field-label" htmlFor="contactPartyType">{text(lang, 'partyType')}</label>
              <select id="contactPartyType" value={formState.partyType || 'solo'} onChange={(event) => update('partyType', event.target.value)}>
                <option value="solo">{text(lang, 'soloTraveler')}</option>
                <option value="couple">{lang === 'it' ? 'Coppia' : 'Couple'}</option>
                <option value="family">{lang === 'it' ? 'Famiglia' : 'Family'}</option>
                <option value="group">{lang === 'it' ? 'Gruppo' : 'Group'}</option>
                <option value="company">{lang === 'it' ? 'Azienda' : 'Company'}</option>
                <option value="school">{lang === 'it' ? 'Scuola' : 'School'}</option>
                <option value="other">{lang === 'it' ? 'Altro' : 'Other'}</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="contactExperience">{text(lang, 'selectedExperience')}</label>
              {requestType === 'fixed' && selectedFixed ? (
                <div className="readonly-selected-experience" id="contactExperience" role="note">
                  <strong>{adminExperienceLabel(selectedFixed.experience_id, lang)}</strong>
                  <span>{adminCopy(lang, 'Definita dal programma scelto', 'Defined by the selected program')}</span>
                </div>
              ) : (
                <select id="contactExperience" value={experienceId} onChange={(event) => update('experienceId', event.target.value)}>
                  <option value="">{text(lang, 'selectExperience')}</option>
                  {experiences.map((experience) => <option value={experience.id} key={experience.id}>{experience.title}</option>)}
                </select>
              )}
            </div>
          </div>

          {requestType === 'private' && (
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
          )}

          <div className="form-two-cols people-count-grid">
            <div>
              <label className="field-label" htmlFor="contactAdults">{text(lang, 'adults')}</label>
              <input id="contactAdults" type="number" min="0" value={formState.adults || ''} onChange={(event) => update('adults', event.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="contactChildren">{text(lang, 'childrenCount')}</label>
              <input id="contactChildren" type="number" min="0" value={formState.children || ''} onChange={(event) => update('children', event.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="contactChildrenUnder3">{text(lang, 'childrenUnder3')}</label>
              <input id="contactChildrenUnder3" type="number" min="0" max={children || undefined} value={formState.childrenUnder3Count || '0'} onChange={(event) => update('childrenUnder3Count', event.target.value)} />
            </div>
            <div className="people-summary">
              <strong>{text(lang, 'totalPeople')}</strong>
              <span>{totalPeople}</span>
            </div>
          </div>
          {over12 && <p className="form-status warning" role="status">{text(lang, 'contactGuideOver12')}</p>}

          <label className="field-label" htmlFor="contactMessage">{text(lang, 'message')}</label>
          <textarea id="contactMessage" value={message} onChange={(event) => update('message', event.target.value)} />
          {selectedFixed && <p className="small-note">{text(lang, 'fixedExcursion')}: {fixedExcursionLabel(selectedFixed, lang)} · {adminExperienceLabel(selectedFixed.experience_id, lang)}</p>}
          {submitState.error && <p className="form-status error" role="alert">{submitState.error}</p>}
          {submitState.success && <p className="form-status success" role="status">{submitState.success}</p>}
          <div className="request-action-row">
            <button className="request-action-button request-action-button-primary" type="submit" disabled={submitState.loading}>{submitState.loading ? (lang === 'it' ? 'Invio...' : 'Sending...') : text(lang, 'submitRequest')}</button>
            <button className="request-action-button request-action-button-secondary" type="button" onClick={openFormWhatsapp}>{text(lang, 'sendWhatsapp')}</button>
          </div>
        </form>
      </div>

      {fixedOptionsOpen && (
        <div className="date-modal-overlay request-options-overlay" role="dialog" aria-modal="true" aria-labelledby="fixed-options-title" onClick={() => setFixedOptionsOpen(false)}>
          <article className="date-modal request-options-modal" onClick={(event) => event.stopPropagation()}>
            <div className="date-modal-header">
              <div>
                <h2 id="fixed-options-title">{text(lang, 'fixedExcursionOptionsTitle')}</h2>
                <p>{text(lang, 'fixedExcursionOptionsIntro')}</p>
              </div>
              <button className="date-modal-close" type="button" onClick={() => setFixedOptionsOpen(false)}>{text(lang, 'close')}</button>
            </div>
            <div className="request-options-monthbar" aria-label={text(lang, 'fixedExcursionOptionsTitle')}>
              <button type="button" onClick={() => changeDetailsMonth(-1)} disabled={!canGoPreviousDetailsMonth} aria-label={text(lang, 'previousMonth')}>‹</button>
              <strong>{monthLabel(detailsMonthDate, lang)}</strong>
              <button type="button" onClick={() => changeDetailsMonth(1)} aria-label={text(lang, 'nextMonth')}>›</button>
            </div>
            {fixedOptions.length ? (
              <div className="request-leaflet-grid">
                {fixedOptions.map((option) => {
                  const isImage = String(option.leaflet.file_type || '').startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(option.leaflet.file_url || '');
                  return (
                    <button className="request-leaflet-tile" type="button" key={option.id} onClick={() => openRequestLeaflet(option)}>
                      {isImage ? (
                        <img src={option.leaflet.file_url} alt={option.title} loading="lazy" decoding="async" />
                      ) : (
                        <span className="request-leaflet-file">{text(lang, 'openProgram')}</span>
                      )}
                      <span className="request-leaflet-copy">
                        <strong>{option.title}</strong>
                        {option.subtitle && <small>{option.subtitle}</small>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="empty-state-card request-options-empty">{text(lang, 'noFixedExcursionLeaflets')}</p>
            )}
          </article>
        </div>
      )}

      {privateOptionsOpen && (
        <div className="date-modal-overlay request-options-overlay" role="dialog" aria-modal="true" aria-labelledby="private-options-title" onClick={() => setPrivateOptionsOpen(false)}>
          <article className="date-modal request-options-modal" onClick={(event) => event.stopPropagation()}>
            <div className="date-modal-header">
              <div>
                <h2 id="private-options-title">{text(lang, 'privateExcursionOptionsTitle')}</h2>
                <p>{text(lang, 'privateExcursionOptionsIntro')}</p>
              </div>
              <button className="date-modal-close" type="button" onClick={() => setPrivateOptionsOpen(false)}>{text(lang, 'close')}</button>
            </div>
            {experiences.length ? (
              <div className="request-private-grid">
                {experiences.map((experience) => (
                  <button className="experience-compact-card request-private-card" type="button" key={experience.id} onClick={() => openPrivateExperienceDetails(experience)}>
                    <EditableImage mediaKey={experienceMediaKey(experience.id)} lang={lang} siteMedia={siteMedia} editor={editor} fallbackSrc={experience.image} fallbackAlt={`${experience.title} vulcanIQ`} />
                    <span className="experience-compact-copy">
                      <strong>{experience.title}</strong>
                      <small>{experience.summary[lang]}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-state-card request-options-empty">{text(lang, 'noPrivateExcursionOptions')}</p>
            )}
          </article>
        </div>
      )}

      {selectedPrivateExperience && (
        <div className="experience-modal-overlay request-private-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="request-private-detail-title" onClick={() => setSelectedPrivateExperience(null)}>
          <article className="experience-modal request-private-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="experience-modal-header">
              <h2 id="request-private-detail-title">{selectedPrivateExperience.title}</h2>
              <button className="experience-modal-close" type="button" onClick={() => setSelectedPrivateExperience(null)}>{text(lang, 'close')}</button>
            </div>
            <div className="experience-detail-content">
              <EditableImage mediaKey={experienceMediaKey(selectedPrivateExperience.id)} lang={lang} siteMedia={siteMedia} editor={editor} fallbackSrc={selectedPrivateExperience.image} fallbackAlt={`${selectedPrivateExperience.title} vulcanIQ`} className="experience-modal-image" />
              <div className="experience-detail-copy">
                <p>{selectedPrivateExperience.description[lang]}</p>
                <dl>
                  <div><dt>{text(lang, 'bestFor')}</dt><dd>{selectedPrivateExperience.bestFor[lang]}</dd></div>
                  <div><dt>{text(lang, 'practical')}</dt><dd>{selectedPrivateExperience.notes[lang]}</dd></div>
                  <div><dt>{text(lang, 'safety')}</dt><dd>{selectedPrivateExperience.safety[lang]}</dd></div>
                </dl>
                <div className="request-action-row experience-modal-actions">
                  <button className="request-action-button request-action-button-primary" type="button" onClick={() => usePrivateExperienceInRequest(selectedPrivateExperience)}>{text(lang, 'useThisOptionInRequest')}</button>
                  <a className="request-action-button request-action-button-secondary" href={`https://wa.me/${contact.phoneWa}?text=${encode(buildExperienceMessage(selectedPrivateExperience, lang))}`} target="_blank" rel="noopener noreferrer" onClick={(event) => requestContactAttribution(event, { type: 'whatsapp', url: `https://wa.me/${contact.phoneWa}?text=${encode(buildExperienceMessage(selectedPrivateExperience, lang))}`, target: '_blank', location: 'experience_modal', metadata: { ...buildBookingTrackingContext({ experienceId: selectedPrivateExperience?.id || '', requestType: 'private', sourceSection: 'today', sourceCta: 'whatsapp_direct', ctaLocation: 'experience_modal', language: lang }), ...selectedHeardAboutUsMetadata }, defaultSource: formState.heardAboutUs || '', defaultDetail: formState.heardAboutUsDetail || '', confirmLabel: contactActionConfirmLabel('whatsapp', lang), buildUrl: (_selectedMetadata, source, detail) => `https://wa.me/${contact.phoneWa}?text=${encode(buildAttributionContactMessage(source, detail, lang))}`, afterConfirm: (selectedMetadata, source, detail) => setFormState((current) => ({ ...current, heardAboutUs: source || current.heardAboutUs, heardAboutUsDetail: detail || current.heardAboutUsDetail })) })}>{text(lang, 'sendWhatsapp')}</a>
                </div>
              </div>
            </div>
          </article>
        </div>
      )}

      {activeLeaflet?.leaflet && (
        <div className="leaflet-fullscreen-overlay request-leaflet-overlay" role="dialog" aria-modal="true" aria-label={activeLeaflet.label || text(lang, 'openProgram')} onClick={() => setActiveLeaflet(null)}>
          <article className="leaflet-fullscreen-modal" onClick={(event) => event.stopPropagation()}>
            <div className="leaflet-fullscreen-header">
              <h2>{activeLeaflet.label || text(lang, 'openProgram')}</h2>
              <button className="date-modal-close" type="button" onClick={() => setActiveLeaflet(null)}>{text(lang, 'close')}</button>
            </div>
            <div className="leaflet-fullscreen-body">
              {String(activeLeaflet.leaflet.file_type || '').startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(activeLeaflet.leaflet.file_url) ? (
                <img className="leaflet-fullscreen-image" src={activeLeaflet.leaflet.file_url} alt={activeLeaflet.label || text(lang, 'openProgram')} loading="lazy" decoding="async" />
              ) : (
                <iframe className="leaflet-fullscreen-frame" src={activeLeaflet.leaflet.file_url} title={activeLeaflet.label || text(lang, 'openProgram')} />
              )}
            </div>
          </article>
        </div>
      )}
      {contactAttributionModal}
    </section>
  );
}

function FinalCTA({ lang, siteContent }) {
  return (
    <section className="section final-cta">
      <div className="container final-panel">
        <div>
          <h2>{text(lang, 'finalTitle')}</h2>
          <p>{text(lang, 'finalText')}</p>
        </div>
        <ContactActions lang={lang} compact siteContent={siteContent} />
      </div>
    </section>
  );
}

function Footer({ lang, siteContent, editor }) {
  const contact = resolvePublicContactDetails(siteContent);
  const [phoneChoicesOpen, setPhoneChoicesOpen] = useState(false);
  const phoneChoiceRef = useRef(null);
  const { requestContactAttribution, contactAttributionModal } = useContactAttributionGate(lang);
  const baseMetadata = buildBookingTrackingContext({ requestType: 'contact', sourceSection: 'footer', sourceCta: 'contact_direct', ctaLocation: 'footer', language: lang });
  const subject = text(lang, 'emailSubject');

  useEffect(() => {
    if (!phoneChoicesOpen) return undefined;
    function closeMenu() {
      setPhoneChoicesOpen(false);
    }
    function handlePointerDown(event) {
      if (!phoneChoiceRef.current || phoneChoiceRef.current.contains(event.target)) return;
      closeMenu();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('hashchange', closeMenu);
    window.addEventListener('popstate', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('hashchange', closeMenu);
      window.removeEventListener('popstate', closeMenu);
    };
  }, [phoneChoicesOpen]);

  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <p>
            <EditableText as="strong" itemKey="footer.contact.name" lang={lang} siteContent={siteContent} editor={editor} fallback="Leonardo Chiavetta" />
            <br />
            <span className="footer-phone-choice" ref={phoneChoiceRef}>
              <button
                className="footer-phone-choice-trigger"
                type="button"
                onClick={() => setPhoneChoicesOpen((open) => !open)}
                aria-expanded={phoneChoicesOpen}
              >
                {contact.phoneDisplay}
              </button>
              {phoneChoicesOpen && (
                <span className="footer-phone-choice-menu" role="group" aria-label={lang === 'it' ? 'Scegli come contattare Leonardo' : 'Choose how to contact Leonardo'}>
                  <a href={`tel:${contact.phoneTel}`} onClick={() => { setPhoneChoicesOpen(false); trackContactClick('phone', 'footer_phone_menu', { ...baseMetadata, cta_location: 'footer_phone_menu', source_cta: 'phone_direct' }); }}>{lang === 'it' ? 'Chiama' : 'Call'}</a>
                  <a
                    href={`https://wa.me/${contact.phoneWa}?text=${encode(text(lang, 'defaultMessage'))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => {
                      setPhoneChoicesOpen(false);
                      requestContactAttribution(event, {
                        type: 'whatsapp',
                        target: '_blank',
                        location: 'footer_phone_menu',
                        metadata: { ...baseMetadata, cta_location: 'footer_phone_menu', source_cta: 'whatsapp_direct' },
                        confirmLabel: contactActionConfirmLabel('whatsapp', lang),
                        buildUrl: (_selectedMetadata, source, detail) => `https://wa.me/${contact.phoneWa}?text=${encode(buildAttributionContactMessage(source, detail, lang))}`
                      });
                    }}
                  >WhatsApp</a>
                </span>
              )}
            </span>
            <br />
            <a
              href={buildMailto(contact.email, subject, text(lang, 'defaultMessage'))}
              onClick={(event) => requestContactAttribution(event, {
                type: 'email',
                location: 'footer',
                metadata: { ...baseMetadata, source_cta: 'email_direct' },
                confirmLabel: contactActionConfirmLabel('email', lang),
                buildUrl: (_selectedMetadata, source, detail) => buildMailto(contact.email, subject, buildAttributionContactMessage(source, detail, lang))
              })}
            >{contact.email}</a>
          </p>
          <a className="inline-link" href={contact.instagram} target="_blank" rel="noopener noreferrer"><Icon name="insta" />{text(lang, 'instagram')}</a>
        </div>
      </div>
      {contactAttributionModal}
    </footer>
  );
}

function StickyMobileBar({ lang, siteContent }) {
  const contact = resolvePublicContactDetails(siteContent);
  const { requestContactAttribution, contactAttributionModal } = useContactAttributionGate(lang);
  const metadata = buildBookingTrackingContext({ requestType: 'contact', sourceSection: 'sticky_contact_bar', sourceCta: 'contact_direct', ctaLocation: 'sticky_contact_bar', language: lang });
  const subject = text(lang, 'emailSubject');
  const fallbackMessage = text(lang, 'defaultMessage');
  const whatsappUrl = `https://wa.me/${contact.phoneWa}?text=${encode(fallbackMessage)}`;
  const emailUrl = buildMailto(contact.email, subject, fallbackMessage);
  return (
    <>
      <div className="mobile-sticky-bar" aria-label="Mobile contact actions">
        <a href={`tel:${contact.phoneTel}`} onClick={() => trackContactClick('phone', 'sticky_contact_bar', { ...metadata, source_cta: 'phone_direct' })}><Icon name="phone" />{lang === 'it' ? 'Chiama' : 'Call'}</a>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => requestContactAttribution(event, {
            type: 'whatsapp',
            target: '_blank',
            location: 'sticky_contact_bar',
            metadata: { ...metadata, source_cta: 'whatsapp_direct' },
            confirmLabel: contactActionConfirmLabel('whatsapp', lang),
            buildUrl: (_selectedMetadata, source, detail) => `https://wa.me/${contact.phoneWa}?text=${encode(buildAttributionContactMessage(source, detail, lang))}`
          })}
        ><Icon name="chat" />WhatsApp</a>
        <a
          href={emailUrl}
          onClick={(event) => requestContactAttribution(event, {
            type: 'email',
            location: 'sticky_contact_bar',
            metadata: { ...metadata, source_cta: 'email_direct' },
            confirmLabel: contactActionConfirmLabel('email', lang),
            buildUrl: (_selectedMetadata, source, detail) => buildMailto(contact.email, subject, buildAttributionContactMessage(source, detail, lang))
          })}
        ><Icon name="mail" />Email</a>
      </div>
      {contactAttributionModal}
    </>
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

const HEARD_ABOUT_US_OPTIONS = [
  { value: 'instagram', it: 'Instagram', en: 'Instagram' },
  { value: 'google', it: 'Google', en: 'Google' },
  { value: 'google_maps', it: 'Google Maps', en: 'Google Maps' },
  { value: 'facebook', it: 'Facebook', en: 'Facebook' },
  { value: 'radio', it: 'Radio', en: 'Radio' },
  { value: 'whatsapp_or_friend', it: 'WhatsApp / passaparola', en: 'WhatsApp / word of mouth' },
  { value: 'hotel_bnb_partner', it: 'Hotel, B&B o struttura partner', en: 'Hotel, B&B or partner accommodation' },
  { value: 'previous_customer', it: 'Cliente precedente', en: 'Previous customer' },
  { value: 'guide_or_local_partner', it: 'Guida o partner locale', en: 'Guide or local partner' },
  { value: 'other', it: 'Altro', en: 'Other' }
];

const HEARD_ABOUT_US_ADMIN_OPTION = { value: 'not_specified', it: 'Non specificato', en: 'Not specified' };
const HEARD_ABOUT_US_VALUES = new Set([...HEARD_ABOUT_US_OPTIONS.map((option) => option.value), HEARD_ABOUT_US_ADMIN_OPTION.value]);

function heardAboutUsOptions({ includeAdmin = false } = {}) {
  return includeAdmin ? [...HEARD_ABOUT_US_OPTIONS, HEARD_ABOUT_US_ADMIN_OPTION] : HEARD_ABOUT_US_OPTIONS;
}

function normalizeHeardAboutUs(value, { allowAdmin = false } = {}) {
  const clean = String(value || '').trim();
  if (!clean) return '';
  if (!HEARD_ABOUT_US_VALUES.has(clean)) return '';
  if (clean === HEARD_ABOUT_US_ADMIN_OPTION.value && !allowAdmin) return '';
  return clean;
}

function cleanHeardAboutUsDetail(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 240);
}

function needsHeardAboutUsDetail(value) {
  return normalizeHeardAboutUs(value, { allowAdmin: true }) === 'other';
}

function heardAboutUsLabel(value, lang, { fallback = '' } = {}) {
  const clean = normalizeHeardAboutUs(value, { allowAdmin: true });
  if (!clean) return fallback;
  const option = heardAboutUsOptions({ includeAdmin: true }).find((item) => item.value === clean);
  return option ? option[lang === 'en' ? 'en' : 'it'] : fallback || clean;
}

function heardAboutUsDisplay(value, detail, lang, { fallback = '' } = {}) {
  const clean = normalizeHeardAboutUs(value, { allowAdmin: true });
  if (!clean) return fallback;
  const label = heardAboutUsLabel(clean, lang, { fallback });
  const cleanDetail = cleanHeardAboutUsDetail(detail);
  if (clean === 'other' && cleanDetail) return `${label}: ${cleanDetail}`;
  return label;
}

function heardAboutUsMetadata(value, lang, detail = '') {
  const clean = normalizeHeardAboutUs(value, { allowAdmin: true });
  if (!clean) return {};
  const cleanDetail = clean === 'other' ? cleanHeardAboutUsDetail(detail) : '';
  return {
    heard_about_us: clean,
    heard_about_us_label: heardAboutUsLabel(clean, lang),
    ...(cleanDetail ? { heard_about_us_detail: cleanDetail, heard_about_us_display: heardAboutUsDisplay(clean, cleanDetail, lang) } : {})
  };
}

function heardAboutUsMessageLine(value, detail, lang) {
  const display = heardAboutUsDisplay(value, detail, lang);
  if (!display) return '';
  return `${text(lang, 'heardAboutUsMessagePrefix')} ${display}.`;
}

function buildAttributionContactMessage(value, detail, lang) {
  const display = heardAboutUsDisplay(value, detail, lang);
  if (!display) return text(lang, 'defaultMessage');
  if (lang === 'en') {
    return `Hi Leonardo,\n\nI heard about vulcanIQ from "${display}" and I would like information about a vulcanIQ experience on Mount Etna.\n\nI would like to know availability, approximate duration, price and clothing recommendations.\n\nThank you!`;
  }
  return `Ciao Leonardo,\n\nHo sentito parlare di vulcanIQ da "${display}" e vorrei informazioni su un’esperienza vulcanIQ sull’Etna.\n\nVorrei sapere disponibilità, durata indicativa, prezzo e consigli sull’abbigliamento.\n\nGrazie!`;
}

function appendHeardAboutUsToMessage(message, value, detail, lang) {
  const base = String(message || text(lang, 'defaultMessage')).trimEnd();
  const line = heardAboutUsMessageLine(value, detail, lang);
  if (!line) return base;
  if (base.includes(line)) return base;
  return `${base}\n\n${line}`;
}

function ContactAttributionSelect({ lang, value, onChange, includeAdmin = false, id = 'heardAboutUs' }) {
  return (
    <select id={id} value={value || ''} onChange={(event) => onChange(event.target.value)} required={!includeAdmin}>
      <option value="">{text(lang, 'heardAboutUsPlaceholder')}</option>
      {heardAboutUsOptions({ includeAdmin }).map((option) => (
        <option key={option.value} value={option.value}>{option[lang === 'en' ? 'en' : 'it']}</option>
      ))}
    </select>
  );
}

function contactActionConfirmLabel(type, lang) {
  if (type === 'whatsapp') return text(lang, 'continueWhatsapp');
  if (type === 'phone') return text(lang, 'callNow');
  if (type === 'email') return text(lang, 'writeEmail');
  return text(lang, 'continue');
}

function openResolvedContactAction(action, selectedMetadata = {}, source = '', detail = '') {
  if (!action) return;
  if (typeof action.afterConfirm === 'function') {
    const shouldContinue = action.afterConfirm(selectedMetadata, source, detail);
    if (shouldContinue === false) return;
  }
  const resolvedUrl = typeof action.buildUrl === 'function' ? action.buildUrl(selectedMetadata, source, detail) : action.url;
  if (!resolvedUrl || typeof window === 'undefined') return;
  if (action.target === '_blank') {
    window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  window.location.href = resolvedUrl;
}

function ContactAttributionModal({ lang, action, onClose, onConfirm }) {
  const [selectedSource, setSelectedSource] = useState(normalizeHeardAboutUs(action?.defaultSource));
  const [otherDetail, setOtherDetail] = useState(cleanHeardAboutUsDetail(action?.defaultDetail));
  const [error, setError] = useState('');
  const selectRef = useRef(null);
  const isOtherSelected = needsHeardAboutUsDetail(selectedSource);
  const cleanOtherDetail = cleanHeardAboutUsDetail(otherDetail);
  const canConfirm = Boolean(selectedSource) && (!isOtherSelected || Boolean(cleanOtherDetail));
  useBodyScrollLock(true);

  useEffect(() => {
    const timer = window.setTimeout(() => selectRef.current?.focus(), 0);
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  function confirm() {
    const clean = normalizeHeardAboutUs(selectedSource);
    const cleanDetail = cleanHeardAboutUsDetail(otherDetail);
    if (!clean) {
      setError(text(lang, 'heardAboutUsRequired'));
      return;
    }
    if (clean === 'other' && !cleanDetail) {
      setError(text(lang, 'heardAboutUsOtherRequired'));
      return;
    }
    onConfirm(clean, clean === 'other' ? cleanDetail : '');
  }

  return (
    <div className="contact-attribution-backdrop" role="presentation" onClick={onClose}>
      <section className="contact-attribution-modal" role="dialog" aria-modal="true" aria-labelledby="contactAttributionTitle" onClick={(event) => event.stopPropagation()}>
        <div className="contact-attribution-header">
          <h2 id="contactAttributionTitle">{text(lang, 'heardAboutUs')}</h2>
          <button className="modal-close-button" type="button" onClick={onClose}>{text(lang, 'cancel')}</button>
        </div>
        <p>{text(lang, 'heardAboutUsModalIntro')}</p>
        <label className="field-label" htmlFor="contactAttributionSource">{text(lang, 'heardAboutUs')}</label>
        <select
          id="contactAttributionSource"
          ref={selectRef}
          value={selectedSource}
          onChange={(event) => { setSelectedSource(event.target.value); setError(''); }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'contactAttributionError' : undefined}
        >
          <option value="">{text(lang, 'heardAboutUsPlaceholder')}</option>
          {heardAboutUsOptions().map((option) => <option key={option.value} value={option.value}>{option[lang === 'en' ? 'en' : 'it']}</option>)}
        </select>
        {isOtherSelected && (
          <label className="field-label contact-attribution-other" htmlFor="contactAttributionOther">
            {text(lang, 'heardAboutUsOtherLabel')}
            <textarea
              id="contactAttributionOther"
              value={otherDetail}
              onChange={(event) => { setOtherDetail(event.target.value); setError(''); }}
              placeholder={text(lang, 'heardAboutUsOtherPlaceholder')}
              rows={3}
              maxLength={240}
            />
          </label>
        )}
        {error && <p id="contactAttributionError" className="form-status error" role="alert">{error}</p>}
        <div className="contact-attribution-actions">
          {selectedSource && <button className="button primary" type="button" onClick={confirm} disabled={!canConfirm} aria-disabled={!canConfirm}>{action?.confirmLabel || contactActionConfirmLabel(action?.type, lang)}</button>}
          <button className="button secondary" type="button" onClick={onClose}>{text(lang, 'cancel')}</button>
        </div>
      </section>
    </div>
  );
}

function useContactAttributionGate(lang) {
  const [pendingAction, setPendingAction] = useState(null);

  function requestContactAttribution(event, action) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.stopPropagation) event.stopPropagation();
    setPendingAction(action);
  }

  function closeAttribution() {
    setPendingAction(null);
  }

  function confirmAttribution(source, detail = '') {
    const action = pendingAction;
    if (!action) return;
    const selectedMetadata = heardAboutUsMetadata(source, lang, detail);
    setPendingAction(null);
    trackContactClick(action.type, action.location, { ...(action.metadata || {}), ...selectedMetadata });
    openResolvedContactAction(action, selectedMetadata, source, detail);
  }

  const contactAttributionModal = pendingAction ? (
    <ContactAttributionModal lang={lang} action={pendingAction} onClose={closeAttribution} onConfirm={confirmAttribution} />
  ) : null;

  return { requestContactAttribution, contactAttributionModal };
}

function dateToIso(date) {
  const value = date instanceof Date ? date : new Date(date);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function startOfWeekMonday(date) {
  const value = new Date(date);
  const day = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - day);
  value.setHours(12, 0, 0, 0);
  return value;
}

function getCalendarDays(monthDate) {
  const start = startOfWeekMonday(startOfMonth(monthDate));
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(start);
    value.setDate(start.getDate() + index);
    return value;
  });
}

function monthLabel(date, lang) {
  const locale = lang === 'it' ? 'it-IT' : 'en-GB';
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
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
        <p>{adminCopy(lang, 'Aggiungi le variabili VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY in Cloudflare Pages e in locale.', 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Cloudflare Pages and locally.')}</p>
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
  const currentAdminPath = adminPathFromLocation(pathname);

  const [adminContentRows, setAdminContentRows] = useState([]);

  useEffect(() => {
    if (pathname === '/admin') navigate('/admin/today');
  }, [pathname, navigate]);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!isSupabaseConfigured) {
        if (alive) setAdminContentRows([]);
        return;
      }
      try {
        const rows = await listSiteContent({ activeOnly: false });
        if (alive) setAdminContentRows(rows.filter((row) => String(row.content_key || '').startsWith('admin.')));
      } catch (err) {
        if (alive) setAdminContentRows([]);
      }
    }
    function handleAdminContentUpdated() {
      load();
    }
    load();
    window.addEventListener('vulcaniq-admin-content-updated', handleAdminContentUpdated);
    return () => {
      alive = false;
      window.removeEventListener('vulcaniq-admin-content-updated', handleAdminContentUpdated);
    };
  }, []);

  const adminContent = useMemo(() => buildSiteContentMap(adminContentRows), [adminContentRows]);

  async function logout() {
    await signOutOwner();
    navigate('/admin/login');
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <select className="admin-mobile-nav" value={currentAdminPath} onChange={(event) => navigate(event.target.value)} aria-label="Admin navigation">
          {ADMIN_NAV_SECTIONS.map((section) => <option key={section.key} value={section.path}>{adminNavLabel(section, lang)}</option>)}
        </select>
        <nav className="admin-nav" aria-label="Admin navigation">
          {ADMIN_NAV_SECTIONS.map((section) => section.external ? (
            <a key={section.key} href={section.path} target="_blank" rel="noopener noreferrer">{adminNavLabel(section, lang)}</a>
          ) : (
            <button key={section.key} type="button" className={isAdminNavSectionActive(normalizedPath, section) ? 'active' : ''} onClick={() => navigate(section.path)}>{adminNavLabel(section, lang)}</button>
          ))}
        </nav>
        <div className="admin-userbox">
          <span className="admin-userbox-name">{ownerDisplayName(profile, lang)}</span>
          <span className="admin-userbox-actions">
            <button type="button" onClick={() => setLang(lang === 'it' ? 'en' : 'it')}>{lang === 'it' ? 'EN' : 'IT'}</button>
            <button type="button" onClick={logout}>{adminCopy(lang, 'Esci', 'Logout')}</button>
          </span>
        </div>
      </header>
      <main className="admin-main">
        {normalizedPath.includes('/calendar') ? (
          <AdminCalendarPage lang={lang} session={session} navigate={navigate} adminContent={adminContent} />
        ) : normalizedPath.includes('/finance') ? (
          <FinanceAdminPage lang={lang} session={session} adminContent={adminContent} />
        ) : normalizedPath.includes('/analytics') || normalizedPath.includes('/data') ? (
          <AdminAnalyticsPage lang={lang} session={session} adminContent={adminContent} />
        ) : normalizedPath.includes('/edit') || normalizedPath.includes('/website') || normalizedPath.includes('/content') || normalizedPath.includes('/media') ? (
          <AdminEditPage lang={lang} session={session} adminContent={adminContent} />
        ) : normalizedPath.includes('/partnerships') ? (
          <PartnershipsAdminPage lang={lang} session={session} adminContent={adminContent} />
        ) : normalizedPath.includes('/upcoming') ? (
          <UpcomingPage lang={lang} session={session} navigate={navigate} adminContent={adminContent} />
        ) : normalizedPath.includes('/requests') ? (
          <RequestsPage lang={lang} session={session} adminContent={adminContent} />
        ) : normalizedPath.includes('/availability') ? (
          <AvailabilityPage lang={lang} session={session} adminContent={adminContent} />
        ) : (
          <TodayDashboard lang={lang} session={session} navigate={navigate} adminContent={adminContent} />
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


function calendarItemsByDate({ fixedExcursions = [], requests = [], blocks = [] }) {
  const map = {};
  fixedExcursions.forEach((item) => {
    if (!item.date || item.active === false) return;
    map[item.date] = map[item.date] || { fixed: [], bookings: [], blocks: [] };
    map[item.date].fixed.push(item);
  });
  requests.forEach((request) => {
    if (!request.requested_date || request.status !== 'accepted') return;
    map[request.requested_date] = map[request.requested_date] || { fixed: [], bookings: [], blocks: [] };
    map[request.requested_date].bookings.push(request);
  });
  blocks.forEach((block) => {
    if (!block.date || block.active === false) return;
    map[block.date] = map[block.date] || { fixed: [], bookings: [], blocks: [] };
    map[block.date].blocks.push(block);
  });
  return map;
}

function AdminCalendarPage({ lang, session, navigate, adminContent = {} }) {
  const { requests, loading: requestsLoading, error: requestsError, refresh: refreshRequests } = useAdminRequests({ status: 'accepted', limit: 500 });
  const [fixedExcursions, setFixedExcursions] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [monthDate, setMonthDate] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedFixed, setSelectedFixed] = useState(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  async function refreshCalendar() {
    setError('');
    try {
      const [fixedData, blockData] = await Promise.all([
        listFixedExcursions({ activeOnly: false }),
        listAvailabilityBlocks({ activeOnly: true, fromDate: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`, toDate: addDaysIso(365) })
      ]);
      setFixedExcursions(fixedData || []);
      setBlocks(blockData || []);
      await refreshRequests();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Calendario non caricato.', 'Calendar not loaded.'));
    }
  }

  useEffect(() => { refreshCalendar(); }, [monthDate.getFullYear(), monthDate.getMonth()]);

  const days = useMemo(() => getCalendarDays(monthDate), [monthDate]);
  const byDate = useMemo(() => calendarItemsByDate({ fixedExcursions, requests, blocks }), [fixedExcursions, requests, blocks]);
  const selected = byDate[selectedDate] || { fixed: [], bookings: [], blocks: [] };
  const isLoading = requestsLoading && !requests.length;

  function changeMonth(delta) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  async function handleBookingUpdate(request, values) {
    setError('');
    try {
      await updateBookingRequest(request.id, { ...values, updated_by: session.user.id });
      setSelectedBooking(null);
      setFeedback(adminCopy(lang, 'Prenotazione aggiornata.', 'Booking updated.'));
      await refreshCalendar();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Prenotazione non aggiornata.', 'Booking not updated.'));
    }
  }

  async function handleFixedUpdate(item, values) {
    setError('');
    try {
      await updateFixedExcursion(item.id, { ...values, updated_by: session.user.id });
      setSelectedFixed(null);
      setFeedback(adminCopy(lang, 'Escursione fissa aggiornata.', 'Fixed excursion updated.'));
      await refreshCalendar();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Escursione non aggiornata.', 'Fixed excursion not updated.'));
    }
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Calendario', 'Calendar')}</span>
          <AdminEditableText as="h1" itemKey="admin.calendar.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Calendario disponibilità', 'Availability calendar')} />
          <AdminEditableText as="p" itemKey="admin.calendar.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Verde: escursione fissa. Rosso: esperienza prenotata. Grigio: data bloccata o non disponibile.', 'Green: fixed excursion. Red: booked experience. Grey: blocked or unavailable date.')} />
        </div>
        <div className="admin-header-actions">
          <button className="button secondary" type="button" onClick={refreshCalendar}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
          <button className="button primary" type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Gestisci disponibilità', 'Manage availability')}</button>
        </div>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {(error || requestsError) && <div className="admin-alert error" role="alert">{error || requestsError}</div>}
      <div className="admin-calendar-layout">
        <article className="calendar-card admin-calendar-card">
          <div className="calendar-topline">
            <button type="button" onClick={() => changeMonth(-1)} aria-label={text(lang, 'previousMonth')}>‹</button>
            <h2>{monthLabel(monthDate, lang)}</h2>
            <button type="button" onClick={() => changeMonth(1)} aria-label={text(lang, 'nextMonth')}>›</button>
          </div>
          <div className="calendar-legend compact-legend">
            <span><i className="legend-dot fixed" />{adminCopy(lang, 'Verde: escursione fissa', 'Green: fixed excursion')}</span>
            <span><i className="legend-dot booked" />{adminCopy(lang, 'Rosso: esperienza prenotata', 'Red: booked experience')}</span>
            <span><i className="legend-dot blocked" />{adminCopy(lang, 'Grigio: bloccata', 'Grey: blocked')}</span>
          </div>
          <div className="weekdays" aria-hidden="true">
            {(lang === 'it' ? ['L', 'M', 'M', 'G', 'V', 'S', 'D'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']).map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
          </div>
          <div className="calendar-grid admin-calendar-grid">
            {days.map((date) => {
              const iso = dateToIso(date);
              const dateItems = byDate[iso] || { fixed: [], bookings: [], blocks: [] };
              const outside = date.getMonth() !== monthDate.getMonth();
              return (
                <button type="button" key={iso} className={`date-button admin-date-button ${outside ? 'outside' : ''} ${selectedDate === iso ? 'selected' : ''}`} onClick={() => setSelectedDate(iso)}>
                  <strong>{date.getDate()}</strong>
                  <span className="admin-date-markers">
                    {dateItems.fixed.length > 0 && <i className="date-dot fixed" />}
                    {dateItems.bookings.length > 0 && <i className="date-dot booked" />}
                    {dateItems.blocks.length > 0 && <i className="date-dot blocked" />}
                  </span>
                </button>
              );
            })}
          </div>
        </article>
        <aside className="admin-panel date-detail-panel admin-date-detail-panel">
          <span className="micro-label">{adminCopy(lang, 'Dettagli data', 'Date details')}</span>
          <h2>{formatDateForMessage(selectedDate, lang)}</h2>
          {isLoading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : (
            <>
              {selected.fixed.length === 0 && selected.bookings.length === 0 && selected.blocks.length === 0 && <p>{adminCopy(lang, 'Nessuna attività per questa data.', 'No activity for this date.')}</p>}
              {selected.fixed.length > 0 && (
                <details className="admin-archive-details admin-calendar-detail-group">
                  <summary><span>{adminCopy(lang, 'Escursioni fisse', 'Fixed excursions')}</span><strong>{selected.fixed.length}</strong></summary>
                  <div className="calendar-detail-list">
                  {selected.fixed.map((item) => {
                    const bookedGuests = requests.filter((request) => request.fixed_excursion_id === item.id && request.status === 'accepted');
                    return (
                      <article className="calendar-detail-item" key={item.id}>
                        <strong>{fixedExcursionLabel(item, lang)}</strong>
                        <span>{adminExperienceLabel(item.experience_id, lang)} · {item.places_remaining}/{item.capacity}</span>
                        <dl className="request-details-grid">
                          <div><dt>{adminCopy(lang, 'Data', 'Date')}</dt><dd>{formatDateForMessage(item.date, lang)}</dd></div>
                          <div><dt>{adminCopy(lang, 'Ora inizio', 'Start time')}</dt><dd>{item.start_time ? String(item.start_time).slice(0, 5) : '-'}</dd></div>
                          <div><dt>{adminCopy(lang, 'Ora fine', 'End time')}</dt><dd>{item.end_time ? String(item.end_time).slice(0, 5) : '-'}</dd></div>
                          <div><dt>{adminCopy(lang, 'Stato', 'Status')}</dt><dd>{item.status || (item.active ? 'active' : 'inactive')}</dd></div>
                        </dl>
                        <div className="guest-detail-list">
                          <strong>{adminCopy(lang, 'Ospiti prenotati', 'Booked guests')}</strong>
                          {bookedGuests.length ? bookedGuests.map((guest) => (
                            <p className="small-note" key={guest.id}>{guest.customer_name || '-'} · {guest.customer_email || '-'} · {guest.customer_phone || '-'} · {Number(guest.adults || 0) + Number(guest.children || 0) || '-'} {adminCopy(lang, 'ospiti', 'guests')}{guest.booking_code ? ` · ${guest.booking_code}` : ''}</p>
                          )) : <p className="small-note">{adminCopy(lang, 'Nessun ospite prenotato per questa data.', 'No guests booked for this date yet.')}</p>}
                        </div>
                        <button type="button" className="button secondary" onClick={() => setSelectedFixed(item)}>{adminCopy(lang, 'Modifica', 'Edit')}</button>
                      </article>
                    );
                  })}
                  </div>
                </details>
              )}
              {selected.bookings.length > 0 && (
                <details className="admin-archive-details admin-calendar-detail-group">
                  <summary><span>{adminCopy(lang, 'Esperienze prenotate', 'Booked experiences')}</span><strong>{selected.bookings.length}</strong></summary>
                  <div className="calendar-detail-list">
                  {selected.bookings.map((request) => (
                    <article className="calendar-detail-item" key={request.id}>
                      <strong>{request.customer_name || '-'}</strong>
                      <span>{adminExperienceLabel(request.experience_id, lang)} · {Number(request.adults || 0) + Number(request.children || 0) || '-'} {adminCopy(lang, 'ospiti', 'guests')}</span>
                      <button type="button" className="button secondary" onClick={() => setSelectedBooking(request)}>{adminCopy(lang, 'Modifica', 'Edit')}</button>
                    </article>
                  ))}
                  </div>
                </details>
              )}
              {selected.blocks.length > 0 && (
                <details className="admin-archive-details admin-calendar-detail-group">
                  <summary><span>{adminCopy(lang, 'Blocchi e note disponibilità', 'Availability notes')}</span><strong>{selected.blocks.length}</strong></summary>
                  {selected.blocks.map((block) => <p className="small-note" key={block.id}>{adminAvailabilityStatusLabels[block.status]?.[lang] || block.status} · {block.reason_it || block.reason_en || '-'}</p>)}
                </details>
              )}
            </>
          )}
        </aside>
      </div>
      {selectedBooking && <CalendarBookingModal lang={lang} request={selectedBooking} onClose={() => setSelectedBooking(null)} onSave={handleBookingUpdate} />}
      {selectedFixed && <CalendarFixedModal lang={lang} item={selectedFixed} onClose={() => setSelectedFixed(null)} onSave={handleFixedUpdate} />}
    </section>
  );
}

function CalendarBookingModal({ lang, request, onClose, onSave }) {
  const [form, setForm] = useState({ status: request.status, requested_date: request.requested_date || '', adults: String(request.adults || ''), children: String(request.children || ''), heard_about_us: request.heard_about_us || 'not_specified', heard_about_us_detail: request.heard_about_us_detail || '', admin_note: request.admin_note || '', decision_note: request.decision_note || '' });
  useBodyScrollLock(true);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="admin-modal wide booking-edit-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal-header booking-edit-modal-header"><div><h2>{request.customer_name || adminCopy(lang, 'Prenotazione', 'Booking')}</h2><p>{request.customer_email || '-'} · {request.customer_phone || '-'}</p></div><button className="modal-close-button booking-modal-close-button" type="button" aria-label={adminCopy(lang, 'Chiudi', 'Close')} onClick={onClose}>{adminCopy(lang, 'Chiudi', 'Close')}</button></div>
        <div className="admin-form-grid booking-edit-modal-grid">
          <AdminSelect label={adminCopy(lang, 'Stato', 'Status')} value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={REQUEST_STATUSES} formatter={(value) => requestStatusLabels[value]?.[lang] || value} />
          <label className="admin-field confirmed-date-section"><span>{adminCopy(lang, 'Data confermata', 'Confirmed date')}</span><input type="date" value={form.requested_date || ''} onChange={(event) => setForm((current) => ({ ...current, requested_date: event.target.value }))} /></label>
          <AdminInput label={adminCopy(lang, 'Adulti', 'Adults')} type="number" value={form.adults} onChange={(value) => setForm((current) => ({ ...current, adults: value }))} />
          <AdminInput label={adminCopy(lang, 'Bambini', 'Children')} type="number" value={form.children} onChange={(value) => setForm((current) => ({ ...current, children: value }))} />
          <AdminSelect label={text(lang, 'heardAboutUsAdmin')} value={form.heard_about_us || 'not_specified'} onChange={(value) => setForm((current) => ({ ...current, heard_about_us: value, heard_about_us_label: heardAboutUsLabel(value, lang), heard_about_us_detail: needsHeardAboutUsDetail(value) ? current.heard_about_us_detail : '' }))} options={heardAboutUsOptions({ includeAdmin: true }).map((option) => option.value)} formatter={(value) => heardAboutUsLabel(value, lang)} />
          {needsHeardAboutUsDetail(form.heard_about_us) && <AdminInput label={text(lang, 'heardAboutUsOtherLabel')} value={form.heard_about_us_detail || ''} onChange={(value) => setForm((current) => ({ ...current, heard_about_us_detail: value }))} />}
          <label className="admin-field full"><span>{adminCopy(lang, 'Nota interna', 'Internal note')}</span><textarea rows={3} value={form.admin_note} onChange={(event) => setForm((current) => ({ ...current, admin_note: event.target.value }))} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Nota decisione', 'Decision note')}</span><textarea rows={3} value={form.decision_note} onChange={(event) => setForm((current) => ({ ...current, decision_note: event.target.value }))} /></label>
          <div className="modal-actions full"><button className="button primary" type="button" onClick={() => onSave(request, { ...form, heard_about_us: form.heard_about_us || 'not_specified', heard_about_us_label: heardAboutUsLabel(form.heard_about_us || 'not_specified', lang), heard_about_us_detail: needsHeardAboutUsDetail(form.heard_about_us) ? cleanHeardAboutUsDetail(form.heard_about_us_detail) : null, adults: Number.parseInt(form.adults || '0', 10), children: Number.parseInt(form.children || '0', 10) })}>{adminCopy(lang, 'Salva modifiche', 'Save changes')}</button><button className="button secondary" type="button" onClick={onClose}>{adminCopy(lang, 'Annulla', 'Cancel')}</button></div>
        </div>
      </div>
    </div>
  );
}

function CalendarFixedModal({ lang, item, onClose, onSave }) {
  const [form, setForm] = useState({ date: item.date || '', start_time: item.start_time || '', end_time: item.end_time || '', title_it: item.title_it || '', title_en: item.title_en || '', description_it: item.description_it || item.note_it || '', description_en: item.description_en || item.note_en || '', meeting_point_it: item.meeting_point_it || '', meeting_point_en: item.meeting_point_en || '', meeting_point_maps_url: item.meeting_point_maps_url || '', capacity: String(item.capacity || 12), active: item.active !== false });
  useBodyScrollLock(true);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="admin-modal wide" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal-header"><div><h2>{fixedExcursionTitle(item, lang)}</h2><p>{adminExperienceLabel(item.experience_id, lang)}</p></div><button className="round-button" type="button" onClick={onClose}>{text(lang, 'close')}</button></div>
        <div className="admin-form-grid">
          <AdminInput label={adminCopy(lang, 'Data', 'Date')} type="date" value={form.date} onChange={(value) => setForm((current) => ({ ...current, date: value }))} />
          <AdminInput label={adminCopy(lang, 'Ora inizio', 'Start time')} type="time" value={form.start_time} onChange={(value) => setForm((current) => ({ ...current, start_time: value }))} />
          <AdminInput label={adminCopy(lang, 'Ora fine', 'End time')} type="time" value={form.end_time} onChange={(value) => setForm((current) => ({ ...current, end_time: value }))} />
          <AdminInput label={adminCopy(lang, 'Capienza', 'Capacity')} type="number" value={form.capacity} onChange={(value) => setForm((current) => ({ ...current, capacity: value }))} />
          <AdminInput label="Title IT" value={form.title_it} onChange={(value) => setForm((current) => ({ ...current, title_it: value }))} />
          <AdminInput label="Title EN" value={form.title_en} onChange={(value) => setForm((current) => ({ ...current, title_en: value }))} />
          <label className="admin-field full"><span>Description IT</span><textarea rows={3} value={form.description_it} onChange={(event) => setForm((current) => ({ ...current, description_it: event.target.value }))} /></label>
          <label className="admin-field full"><span>Description EN</span><textarea rows={3} value={form.description_en} onChange={(event) => setForm((current) => ({ ...current, description_en: event.target.value }))} /></label>
          <AdminInput label="Meeting point IT" value={form.meeting_point_it} onChange={(value) => setForm((current) => ({ ...current, meeting_point_it: value }))} />
          <AdminInput label="Meeting point EN" value={form.meeting_point_en} onChange={(value) => setForm((current) => ({ ...current, meeting_point_en: value }))} />
          <AdminInput label={adminCopy(lang, 'Link Google Maps del punto d’incontro', 'Google Maps meeting point link')} value={form.meeting_point_maps_url} placeholder="https://maps.google.com/..." onChange={(value) => setForm((current) => ({ ...current, meeting_point_maps_url: value }))} />
          <label className="check-field"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
          <div className="modal-actions full"><button className="button primary" type="button" onClick={() => onSave(item, { ...form, capacity: Number.parseInt(form.capacity || '12', 10) })}>{adminCopy(lang, 'Salva modifiche', 'Save changes')}</button><button className="button secondary" type="button" onClick={onClose}>{adminCopy(lang, 'Annulla', 'Cancel')}</button></div>
        </div>
      </div>
    </div>
  );
}

const MEDIA_ADMIN_ITEMS = [
  { key: 'brand_logo_main', it: 'Logo principale vulcanIQ', en: 'Main vulcanIQ logo', fallback: BRAND.logo, alt_it: 'Logo vulcanIQ — esperienze premium sull’Etna', alt_en: 'vulcanIQ logo — premium Etna experiences' },
  { key: 'home_hero_background', it: 'Sfondo hero homepage', en: 'Home hero background' },
  { key: 'home_hero_feature_image', it: 'Immagine hero homepage', en: 'Home hero image' },
  { key: 'home_hero_video', it: 'Video homepage', en: 'Home video' },
  { key: 'mission_main_image', it: 'Immagine missione', en: 'Mission image' },
  { key: 'about_leonardo_image', it: 'Foto Leonardo', en: 'Leonardo photo' },
  { key: 'about_deborah_image', it: 'Foto Deborah', en: 'Deborah photo' },
  { key: 'reviews_background_image', it: 'Immagine recensioni', en: 'Reviews image' },
  { key: 'default_experience_premium_image', it: 'Etna Premium', en: 'Etna Premium' },
  { key: 'default_experience_learning_image', it: 'Etna Learning', en: 'Etna Learning' },
  { key: 'default_experience_live_image', it: 'Etna Live', en: 'Etna Live' },
  { key: 'default_experience_stories_image', it: 'Etna Stories', en: 'Etna Stories' }
];

const EDITOR_PAGE_OPTIONS = [
  { key: 'home', it: 'Home', en: 'Home' },
  { key: 'experiences', it: 'Escursioni', en: 'Excursions' },
  { key: 'partnerships', it: 'Collaborazioni', en: 'Partnerships' },
  { key: 'about', it: 'Chi siamo', en: 'Who we are' },
  { key: 'reviews', it: 'Recensioni', en: 'Reviews' },
  { key: 'contact', it: 'Contatti', en: 'Contact' }
];

function buildEditorContentMap(items = [], drafts = {}) {
  const stored = (items || []).reduce((acc, item) => ({ ...acc, [item.content_key]: item }), {});
  const map = SITE_CONTENT_DEFINITIONS.reduce((acc, definition) => {
    acc[definition.key] = editorContentItem(stored, definition.key, definition.default_it || definition.default_en || '');
    return acc;
  }, {});
  Object.keys(stored).forEach((key) => {
    if (!map[key]) map[key] = editorContentItem(stored, key, stored[key]?.default_it || stored[key]?.default_en || '');
  });
  return Object.keys(drafts || {}).reduce((acc, key) => ({ ...acc, [key]: { ...(acc[key] || {}), ...drafts[key] } }), map);
}


function buildAdminEditorContentMap(items = [], drafts = {}) {
  const stored = (items || []).reduce((acc, item) => ({ ...acc, [item.content_key]: item }), {});
  const map = ADMIN_CONTENT_DEFINITIONS.reduce((acc, definition) => {
    acc[definition.key] = editorContentItem(stored, definition.key, definition.default_it || definition.default_en || '');
    return acc;
  }, {});
  Object.keys(stored).forEach((key) => {
    if (String(key).startsWith('admin.') && !map[key]) map[key] = editorContentItem(stored, key, stored[key]?.default_it || stored[key]?.default_en || '');
  });
  return Object.keys(drafts || {}).reduce((acc, key) => ({ ...acc, [key]: { ...(acc[key] || {}), ...drafts[key] } }), map);
}

function buildEditorMediaMap(items = [], drafts = {}) {
  const stored = (items || []).reduce((acc, item) => ({ ...acc, [item.media_key]: item }), {});
  const map = MEDIA_ADMIN_ITEMS.reduce((acc, definition) => {
    acc[definition.key] = editorMediaItem(stored, definition.key, definition.fallback || '', definition.alt_it || definition.alt_en || '');
    return acc;
  }, {});
  Object.keys(stored).forEach((key) => {
    if (!map[key]) map[key] = editorMediaItem(stored, key, stored[key]?.file_url || '', stored[key]?.alt_it || stored[key]?.alt_en || '');
  });
  return Object.keys(drafts || {}).reduce((acc, key) => ({ ...acc, [key]: { ...(acc[key] || {}), ...drafts[key] } }), map);
}


function ContactChannelsEditor({ lang, contentMap, onSave, disabled }) {
  const contactDefinitions = SITE_CONTENT_DEFINITIONS.filter((item) => String(item.key || '').startsWith('contact.channels.'));
  const [values, setValues] = useState({});

  useEffect(() => {
    const next = {};
    contactDefinitions.forEach((definition) => {
      const item = contentMap?.[definition.key] || editorContentItem({}, definition.key, definition.default_it || definition.default_en || '');
      next[definition.key] = contentSettingValue({ [definition.key]: item }, definition.key, definition.default_it || definition.default_en || '');
    });
    setValues(next);
  }, [contentMap]);

  function update(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <details className="admin-archive-details edit-workspace-section contact-channels-editor" open>
      <summary>
        <span>{adminCopy(lang, 'Contatti pubblici', 'Public contact details')}</span>
        <strong>{adminCopy(lang, 'Telefono, email, Instagram', 'Phone, email, Instagram')}</strong>
      </summary>
      <div className="admin-form-grid contact-channel-grid">
        {contactDefinitions.map((definition) => {
          const item = contentMap?.[definition.key] || editorContentItem({}, definition.key, definition.default_it || definition.default_en || '');
          const value = values[definition.key] ?? contentSettingValue({ [definition.key]: item }, definition.key, definition.default_it || definition.default_en || '');
          return (
            <label className="admin-field full" key={definition.key}>
              <span>{lang === 'it' ? definition.label_it : definition.label_en}</span>
              <input value={value} onChange={(event) => update(definition.key, event.target.value)} placeholder={definition.default_it || definition.default_en || ''} />
              <small>{definition.key}</small>
            </label>
          );
        })}
        <div className="modal-actions full">
          <button className="button primary" type="button" disabled={disabled} onClick={() => onSave(values)}>{adminCopy(lang, 'Salva contatti pubblici', 'Save public contacts')}</button>
        </div>
      </div>
    </details>
  );
}

function WebsiteAdminPage({ lang, session }) {
  const [page, setPage] = useState('home');
  const [editorLang, setEditorLang] = useState(lang || 'it');
  const [device, setDevice] = useState('desktop');
  const [contentRows, setContentRows] = useState([]);
  const [mediaRows, setMediaRows] = useState([]);
  const [contentDrafts, setContentDrafts] = useState({});
  const [mediaDrafts, setMediaDrafts] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    setError('');
    if (!isSupabaseConfigured) {
      setContentRows([]);
      setMediaRows([]);
      setLoading(false);
      setError(adminCopy(lang, 'Supabase non è configurato. Puoi vedere l’anteprima, ma non salvare modifiche.', 'Supabase is not configured. You can preview the site, but changes cannot be saved.'));
      return;
    }
    try {
      const [content, media] = await Promise.all([listSiteContent({ activeOnly: false }), listSiteMedia({ activeOnly: false })]);
      setContentRows(content);
      setMediaRows(media);
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Editor non caricato.', 'Editor not loaded.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const contentMap = useMemo(() => buildEditorContentMap(contentRows, contentDrafts), [contentRows, contentDrafts]);
  const mediaMap = useMemo(() => buildEditorMediaMap(mediaRows, mediaDrafts), [mediaRows, mediaDrafts]);
  const hasDrafts = Object.keys(contentDrafts).length > 0 || Object.keys(mediaDrafts).length > 0;
  const selectedHasDraft = Boolean(selected && (
    (selected.type === 'text' && contentDrafts[selected.key]) ||
    (selected.type === 'image' && mediaDrafts[selected.key])
  ));
  const editor = useMemo(() => ({ isEditing: true, lang: editorLang, selected, select: setSelected, contentMap, mediaMap }), [editorLang, selected, contentMap, mediaMap]);

  function updateContentDraft(key, patch) {
    setFeedback('');
    setContentDrafts((current) => ({ ...current, [key]: { ...(contentMap[key] || editorContentItem({}, key)), ...(current[key] || {}), ...patch } }));
  }

  function updateMediaDraft(key, patch) {
    setFeedback('');
    setMediaDrafts((current) => ({ ...current, [key]: { ...(mediaMap[key] || editorMediaItem({}, key)), ...(current[key] || {}), ...patch } }));
  }

  async function saveContentItem(item) {
    if (!isSupabaseConfigured) throw new Error(adminCopy(lang, 'Supabase non è configurato.', 'Supabase is not configured.'));
    await upsertSiteContent({
      content_key: item.content_key || item.key,
      section: item.section,
      label_it: item.label_it,
      label_en: item.label_en,
      value_it: item.value_it,
      value_en: item.value_en,
      default_it: item.default_it,
      default_en: item.default_en,
      content_type: item.content_type || (item.type === 'textarea' ? 'textarea' : 'text'),
      style_variant: item.style_variant || 'body',
      text_size: item.text_size || 'normal',
      text_align: item.text_align || 'left',
      visible: item.visible !== false,
      layout_variant: item.layout_variant || 'default',
      sort_order: item.sort_order || 0,
      active: item.active !== false,
      updated_by: session.user.id
    });
  }

  async function saveMediaItem(item) {
    if (!isSupabaseConfigured) throw new Error(adminCopy(lang, 'Supabase non è configurato.', 'Supabase is not configured.'));
    const key = item.media_key || item.key;
    const existing = mediaRows.find((row) => row.media_key === key);
    const uploaded = item.file ? await uploadSiteMediaFile(item.file, key, session.user.id) : {};
    if (item.file && existing?.file_path) await removeSiteMediaFile(existing.file_path);
    await upsertSiteMedia({
      media_key: key,
      label_it: item.label_it || item.it || key,
      label_en: item.label_en || item.en || key,
      alt_it: item.alt_it || item.label_it || key,
      alt_en: item.alt_en || item.label_en || key,
      file_url: uploaded.file_url || item.file_url || null,
      file_path: uploaded.file_path || item.file_path || null,
      file_name: uploaded.file_name || item.file_name || null,
      file_type: uploaded.file_type || item.file_type || null,
      media_kind: uploaded.media_kind || item.media_kind || 'image',
      active: item.active !== false,
      updated_by: session.user.id
    });
  }

  async function saveSelected() {
    if (!selected || saving) return;
    setError('');
    setFeedback('');
    setSaving(true);
    try {
      if (selected.type === 'text') {
        await saveContentItem(contentMap[selected.key]);
        setContentDrafts((current) => {
          const next = { ...current };
          delete next[selected.key];
          return next;
        });
      }
      if (selected.type === 'image') {
        await saveMediaItem(mediaMap[selected.key]);
        setMediaDrafts((current) => {
          const next = { ...current };
          delete next[selected.key];
          return next;
        });
      }
      if (selected.type === 'card') {
        setFeedback(adminCopy(lang, 'Card selezionata. Modifica i testi o immagini cliccabili dentro la card, oppure usa la sezione admin dedicata per dati strutturati.', 'Card selected. Edit the clickable text or images inside the card, or use the dedicated admin section for structured data.'));
        return;
      }
      setFeedback(adminCopy(lang, 'Modifiche salvate.', 'Changes saved.'));
      await refresh();
      setSelected(null);
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Impossibile salvare le modifiche. Riprova.', 'Unable to save changes. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveAll() {
    if (saving) return;
    setError('');
    setFeedback('');
    setSaving(true);
    try {
      const contentItems = Object.keys(contentDrafts).map((key) => contentMap[key]).filter(Boolean);
      const mediaItems = Object.keys(mediaDrafts).map((key) => mediaMap[key]).filter(Boolean);
      for (const item of contentItems) await saveContentItem(item);
      for (const item of mediaItems) await saveMediaItem(item);
      setContentDrafts({});
      setMediaDrafts({});
      setFeedback(adminCopy(lang, 'Tutte le modifiche sono state salvate.', 'All changes have been saved.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Impossibile salvare tutte le modifiche.', 'Unable to save all changes.'));
    } finally {
      setSaving(false);
    }
  }

  function discardDrafts() {
    if (hasDrafts && !window.confirm(adminCopy(lang, 'Scartare le modifiche non salvate?', 'Discard unsaved changes?'))) return;
    setContentDrafts({});
    setMediaDrafts({});
    setFeedback(adminCopy(lang, 'Modifiche locali scartate.', 'Local changes discarded.'));
  }

  function discardSelectedDraft() {
    if (!selected) return;
    if (selected.type === 'text') {
      setContentDrafts((current) => {
        const next = { ...current };
        delete next[selected.key];
        return next;
      });
    }
    if (selected.type === 'image') {
      setMediaDrafts((current) => {
        const next = { ...current };
        delete next[selected.key];
        return next;
      });
    }
  }

  function closeSelectedEditor() {
    if (selectedHasDraft && !window.confirm(adminCopy(lang, 'Chiudere senza salvare questa modifica?', 'Close without saving this change?'))) return;
    discardSelectedDraft();
    setSelected(null);
  }

  function resetSelected() {
    if (!selected) return;
    if (!window.confirm(adminCopy(lang, 'Ripristinare il contenuto selezionato al valore predefinito?', 'Reset the selected item to its default value?'))) return;
    if (selected.type === 'text') {
      const item = contentMap[selected.key] || editorContentItem({}, selected.key);
      updateContentDraft(selected.key, {
        value_it: item.default_it || '',
        value_en: item.default_en || '',
        visible: true,
        active: true,
        text_size: getContentDefinition(selected.key).text_size || 'normal',
        text_align: getContentDefinition(selected.key).text_align || 'left',
        style_variant: getContentDefinition(selected.key).style_variant || 'body'
      });
    }
    if (selected.type === 'image') {
      const definition = getMediaDefinition(selected.key);
      updateMediaDraft(selected.key, {
        file: null,
        file_url: definition.fallback || selected.fallbackSrc || '',
        alt_it: definition.alt_it || definition.it || selected.fallbackAlt || '',
        alt_en: definition.alt_en || definition.en || selected.fallbackAlt || '',
        active: true
      });
    }
  }


  async function saveContactChannels(values) {
    if (saving) return;
    setError('');
    setFeedback('');
    setSaving(true);
    try {
      const definitions = SITE_CONTENT_DEFINITIONS.filter((item) => String(item.key || '').startsWith('contact.channels.'));
      for (const definition of definitions) {
        const item = contentMap[definition.key] || editorContentItem({}, definition.key, definition.default_it || definition.default_en || '');
        const value = values?.[definition.key] ?? contentSettingValue({ [definition.key]: item }, definition.key, definition.default_it || definition.default_en || '');
        await saveContentItem({
          ...item,
          content_key: definition.key,
          key: definition.key,
          section: definition.section,
          label_it: definition.label_it,
          label_en: definition.label_en,
          value_it: value,
          value_en: value,
          default_it: definition.default_it,
          default_en: definition.default_en,
          content_type: 'text',
          style_variant: 'body',
          text_size: 'normal',
          text_align: 'left',
          visible: true,
          active: true
        });
      }
      setContentDrafts((current) => {
        const next = { ...current };
        definitions.forEach((definition) => delete next[definition.key]);
        return next;
      });
      setFeedback(adminCopy(lang, 'Contatti pubblici salvati.', 'Public contact details saved.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Contatti pubblici non salvati.', 'Public contact details not saved.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-page website-admin-page visual-editor-page">
      <div className="visual-editor-toolbar">
        <div>
          <span className="kicker">{adminCopy(lang, 'Modifica sito', 'Edit website')}</span>
          <h1>{adminCopy(lang, 'Editor visuale controllato', 'Controlled visual editor')}</h1>
        </div>
        <label><span>{adminCopy(lang, 'Pagina', 'Page')}</span><select value={page} onChange={(event) => { setPage(event.target.value); setSelected(null); }}>
          {EDITOR_PAGE_OPTIONS.map((item) => <option key={item.key} value={item.key}>{lang === 'it' ? item.it : item.en}</option>)}
        </select></label>
        <label><span>{adminCopy(lang, 'Lingua', 'Language')}</span><select value={editorLang} onChange={(event) => setEditorLang(event.target.value)}><option value="it">IT</option><option value="en">EN</option></select></label>
        <label><span>{adminCopy(lang, 'Dispositivo', 'Device')}</span><select value={device} onChange={(event) => setDevice(event.target.value)}><option value="desktop">Desktop</option><option value="tablet">Tablet</option><option value="mobile">Mobile</option></select></label>
        <button className="button secondary" type="button" onClick={() => window.open('/', '_blank', 'noopener,noreferrer')}>{adminCopy(lang, 'Apri sito pubblico', 'Open public site')}</button>
        <button className="button secondary" type="button" onClick={resetSelected} disabled={!selected}>{adminCopy(lang, 'Ripristina selezione', 'Reset selected')}</button>
        <button className="button secondary" type="button" onClick={discardDrafts} disabled={!hasDrafts || saving}>{adminCopy(lang, 'Scarta', 'Discard')}</button>
        <button className="button primary" type="button" onClick={saveAll} disabled={!hasDrafts || !isSupabaseConfigured || saving}>{saving ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Salva tutto', 'Save all')}</button>
      </div>

      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      {notice && <div className="admin-alert warning" role="status">{notice}</div>}
      {!loading && page === 'contact' && <ContactChannelsEditor lang={lang} contentMap={contentMap} onSave={saveContactChannels} disabled={!isSupabaseConfigured || saving} />}
      {loading ? <p>{adminCopy(lang, 'Caricamento editor...', 'Loading editor...')}</p> : (
        <>
          <div className="visual-editor-shell">
            <VisualEditorPreview
              page={page}
              setPage={setPage}
              lang={editorLang}
              setLang={setEditorLang}
              device={device}
              siteMedia={mediaMap}
              siteContent={contentMap}
              editor={editor}
              setNotice={setNotice}
            />
          </div>
          {selected && (
            <EditorFullscreenModal
              lang={lang}
              editorLang={editorLang}
              selected={selected}
              contentMap={contentMap}
              mediaMap={mediaMap}
              updateContentDraft={updateContentDraft}
              updateMediaDraft={updateMediaDraft}
              onSave={saveSelected}
              onReset={resetSelected}
              onClose={closeSelectedEditor}
              canSave={isSupabaseConfigured && !saving}
            />
          )}
        </>
      )}
    </section>
  );
}


function AdminEditPage({ lang, session, adminContent = {} }) {
  return (
    <section className="admin-page admin-edit-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Modifica', 'Edit')}</span>
          <AdminEditableText as="h1" itemKey="admin.edit.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Modifica sito e recensioni', 'Edit website and reviews')} />
          <AdminEditableText as="p" itemKey="admin.edit.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Gestisci contenuti, media e recensioni pubbliche da un’unica area.', 'Manage public content, media, and reviews from one area.')} />
        </div>
      </div>
      <details className="admin-archive-details edit-workspace-section">
        <summary><AdminEditableText itemKey="admin.edit.publicSite.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Sito pubblico', 'Public website')} /><AdminEditableText as="strong" itemKey="admin.edit.publicSite.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Testi e media', 'Text and media')} /></summary>
        <WebsiteAdminPage lang={lang} session={session} />
      </details>
      <details className="admin-archive-details edit-workspace-section">
        <summary><AdminEditableText itemKey="admin.edit.adminSite.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Sito admin', 'Admin website')} /><AdminEditableText as="strong" itemKey="admin.edit.adminSite.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Testi pannello', 'Panel text')} /></summary>
        <AdminSiteContentPage lang={lang} session={session} adminContent={adminContent} />
      </details>
      <details className="admin-archive-details edit-workspace-section">
        <summary><AdminEditableText itemKey="admin.edit.reviews.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Recensioni', 'Reviews')} /><AdminEditableText as="strong" itemKey="admin.edit.reviews.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Gestione', 'Management')} /></summary>
        <AdminReviewsPanel lang={lang} adminContent={adminContent} />
      </details>
    </section>
  );
}

function EditorFullscreenModal({ lang, editorLang, selected, contentMap, mediaMap, updateContentDraft, updateMediaDraft, onSave, onReset, onClose, canSave }) {
  useBodyScrollLock(true);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="editor-fullscreen-backdrop" role="presentation">
      <section className="editor-fullscreen-modal" role="dialog" aria-modal="true" aria-labelledby="editorFullscreenTitle">
        <div className="editor-fullscreen-header">
          <div>
            <span className="kicker">{adminCopy(lang, 'Editor elemento', 'Element editor')}</span>
            <h2 id="editorFullscreenTitle">{selected.label || selected.key}</h2>
            <p>{selected.section || selected.type} · {selected.key}</p>
          </div>
          <button className="button secondary" type="button" onClick={onClose}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>
        </div>
        <EditorInspector
          lang={lang}
          editorLang={editorLang}
          selected={selected}
          contentMap={contentMap}
          mediaMap={mediaMap}
          updateContentDraft={updateContentDraft}
          updateMediaDraft={updateMediaDraft}
          onSave={onSave}
          onReset={onReset}
          canSave={canSave}
        />
      </section>
    </div>
  );
}


function VisualEditorPreview({ page, setPage, lang, setLang, device, siteMedia, siteContent, editor, setNotice }) {
  const [formState, setFormState] = useState({ language: lang, requestType: 'private', preferredContact: 'whatsapp', partyType: 'solo', adults: '1', children: '0', childrenUnder3Count: '0', heardAboutUs: '', heardAboutUsDetail: '', message: text(lang, 'defaultMessage') });

  function disabledActionNotice() {
    setNotice(lang === 'it' ? 'Azione disattivata durante la modifica del sito.' : 'This action is disabled while editing the website.');
    window.setTimeout(() => setNotice(''), 2800);
  }

  function fillForm() {
    disabledActionNotice();
  }

  function renderPage() {
    switch (page) {
      case 'experiences':
        return <ExperienceAccordion lang={lang} fillForm={fillForm} siteMedia={siteMedia} siteContent={siteContent} editor={editor} />;
      case 'partnerships':
        return <PartnershipsPage lang={lang} siteContent={siteContent} editor={editor} />;
      case 'about':
        return <Team lang={lang} siteMedia={siteMedia} siteContent={siteContent} editor={editor} />;
      case 'reviews':
        return <ReviewsPage lang={lang} siteContent={siteContent} editor={editor} />;
      case 'contact':
        return <ContactForm lang={lang} formState={formState} setFormState={setFormState} siteMedia={siteMedia} siteContent={siteContent} editor={editor} />;
      case 'home':
      default:
        return <Hero lang={lang} setActivePage={setPage} scrollToForm={disabledActionNotice} siteMedia={siteMedia} siteContent={siteContent} editor={editor} />;
    }
  }

  return (
    <div className="visual-editor-canvas">
      <div className={`visual-preview-frame ${device}`} onSubmitCapture={(event) => { event.preventDefault(); disabledActionNotice(); }} onClickCapture={(event) => {
        const link = event.target.closest('a[href]');
        if (link && !link.closest('.editor-selectable')) {
          event.preventDefault();
          event.stopPropagation();
          disabledActionNotice();
        }
      }}>
        <Header lang={lang} setLang={setLang} activePage={page} setActivePage={setPage} siteMedia={siteMedia} editor={editor} />
        <main className="public-page-shell editor-preview-public">{renderPage()}</main>
      </div>
    </div>
  );
}

function EditorInspector({ lang, editorLang, selected, contentMap, mediaMap, updateContentDraft, updateMediaDraft, onSave, onReset, canSave }) {
  if (!selected) {
    return (
      <aside className="editor-inspector empty">
        <span className="kicker">{adminCopy(lang, 'Ispettore', 'Inspector')}</span>
        <h2>{adminCopy(lang, 'Seleziona un elemento', 'Select an element')}</h2>
        <p>{adminCopy(lang, 'Seleziona un testo, un’immagine o una card nella preview per modificarla.', 'Select a text, image, or card in the preview to edit it.')}</p>
      </aside>
    );
  }

  if (selected.type === 'text') {
    const item = contentMap[selected.key] || editorContentItem({}, selected.key);
    const Field = item.content_type === 'textarea' || item.type === 'textarea' ? 'textarea' : 'input';
    return (
      <aside className="editor-inspector">
        <div className="inspector-heading"><span className="kicker">{adminCopy(lang, 'Testo', 'Text')}</span><h2>{selected.label}</h2><p>{item.section} · {selected.key}</p></div>
        <label className="admin-field full"><span>Italiano</span><Field rows={5} value={item.value_it ?? item.default_it ?? ''} onChange={(event) => updateContentDraft(selected.key, { value_it: event.target.value, active: true })} /></label>
        <label className="admin-field full"><span>English</span><Field rows={5} value={item.value_en ?? item.default_en ?? ''} onChange={(event) => updateContentDraft(selected.key, { value_en: event.target.value, active: true })} /></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Dimensione testo', 'Text size')}</span><select value={item.text_size || 'normal'} onChange={(event) => updateContentDraft(selected.key, { text_size: event.target.value })}><option value="small">Small</option><option value="normal">Normal</option><option value="large">Large</option><option value="hero">Hero</option><option value="display">Display</option></select></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Stile testo', 'Text style')}</span><select value={item.style_variant || 'body'} onChange={(event) => updateContentDraft(selected.key, { style_variant: event.target.value })}><option value="label">Label</option><option value="body">Body</option><option value="heading">Heading</option><option value="display">Display heading</option></select></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Allineamento', 'Alignment')}</span><select value={item.text_align || 'left'} onChange={(event) => updateContentDraft(selected.key, { text_align: event.target.value })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
        <label className="check-field"><input type="checkbox" checked={item.visible !== false} onChange={(event) => updateContentDraft(selected.key, { visible: event.target.checked })} /> {adminCopy(lang, 'Visibile', 'Visible')}</label>
        <div className="inspector-actions"><button className="button primary" type="button" onClick={onSave} disabled={!canSave}>{adminCopy(lang, 'Salva selezione', 'Save selected')}</button><button className="button secondary" type="button" onClick={onReset}>{adminCopy(lang, 'Ripristina default', 'Reset to default')}</button></div>
      </aside>
    );
  }

  if (selected.type === 'image') {
    const item = mediaMap[selected.key] || editorMediaItem({}, selected.key, selected.fallbackSrc, selected.fallbackAlt);
    return (
      <aside className="editor-inspector">
        <div className="inspector-heading"><span className="kicker">{adminCopy(lang, 'Immagine', 'Image')}</span><h2>{selected.label}</h2><p>{selected.key}</p></div>
        {item.file_url && (item.media_kind === 'video' ? <video className="inspector-media-preview" src={item.file_url} controls /> : <img className="inspector-media-preview" src={item.file_url} alt={editorLang === 'it' ? item.alt_it : item.alt_en} />)}
        <label className="admin-field full"><span>{adminCopy(lang, 'Sostituisci immagine', 'Replace image')}</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,.jpg,.jpeg,.png,.webp,.mp4" onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          updateMediaDraft(selected.key, { file, file_url: URL.createObjectURL(file), file_name: file.name, file_type: file.type, media_kind: file.type.startsWith('video/') ? 'video' : 'image', active: true });
        }} /></label>
        <label className="admin-field full"><span>Alt text IT</span><input value={item.alt_it || ''} onChange={(event) => updateMediaDraft(selected.key, { alt_it: event.target.value })} /></label>
        <label className="admin-field full"><span>Alt text EN</span><input value={item.alt_en || ''} onChange={(event) => updateMediaDraft(selected.key, { alt_en: event.target.value })} /></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Posizione immagine', 'Image position')}</span><select value={item.image_position || 'center'} onChange={(event) => updateMediaDraft(selected.key, { image_position: event.target.value })}><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Dimensione immagine', 'Image size')}</span><select value={item.image_size || 'normal'} onChange={(event) => updateMediaDraft(selected.key, { image_size: event.target.value })}><option value="compact">Compact</option><option value="normal">Normal</option><option value="large">Large</option></select></label>
        <label className="check-field"><input type="checkbox" checked={item.active !== false} onChange={(event) => updateMediaDraft(selected.key, { active: event.target.checked })} /> {adminCopy(lang, 'Visibile', 'Visible')}</label>
        <div className="inspector-actions"><button className="button primary" type="button" onClick={onSave} disabled={!canSave}>{adminCopy(lang, 'Salva selezione', 'Save selected')}</button><button className="button secondary" type="button" onClick={onReset}>{adminCopy(lang, 'Ripristina default', 'Reset to default')}</button></div>
      </aside>
    );
  }

  return (
    <aside className="editor-inspector">
      <div className="inspector-heading"><span className="kicker">{adminCopy(lang, 'Card', 'Card')}</span><h2>{selected.label}</h2><p>{selected.section} · {selected.key}</p></div>
      <p>{adminCopy(lang, 'Questa card è selezionata. Per modificare contenuti visibili, clicca direttamente su titolo, descrizione o immagine dentro la card. Per dati strutturati come collaborazioni o escursioni fisse, usa la sezione admin dedicata.', 'This card is selected. To edit visible content, click directly on the title, description, or image inside the card. For structured data such as partnerships or fixed excursions, use the dedicated admin section.')}</p>
    </aside>
  );
}


function MediaAdminPage({ lang, session, compactHeader = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setItems(await listSiteMedia({ activeOnly: false }));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Media non caricati.', 'Media not loaded.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const itemMap = items.reduce((acc, item) => ({ ...acc, [item.media_key]: item }), {});

  async function saveMedia(key, file) {
    setError('');
    setFeedback('');
    try {
      const existing = itemMap[key];
      const uploaded = file ? await uploadSiteMediaFile(file, key, session.user.id) : {};
      if (file && existing?.file_path) await removeSiteMediaFile(existing.file_path);
      const definition = MEDIA_ADMIN_ITEMS.find((entry) => entry.key === key);
      await upsertSiteMedia({
        media_key: key,
        label_it: definition?.it || key,
        label_en: definition?.en || key,
        alt_it: definition?.it || key,
        alt_en: definition?.en || key,
        active: true,
        updated_by: session.user.id,
        ...uploaded
      });
      setFeedback(adminCopy(lang, 'Media aggiornato.', 'Media updated.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Upload non riuscito.', 'Upload failed.'));
    }
  }

  async function removeMedia(item) {
    setError('');
    try {
      if (item.file_path) await removeSiteMediaFile(item.file_path);
      await upsertSiteMedia({ ...item, file_url: null, file_path: null, file_name: null, file_type: null, active: false, updated_by: session.user.id });
      setFeedback(adminCopy(lang, 'Media rimosso.', 'Media removed.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Rimozione non riuscita.', 'Remove failed.'));
    }
  }

  return (
    <section className={compactHeader ? "admin-subpage" : "admin-page"}>
      {!compactHeader && (
        <div className="admin-page-header">
          <div><span className="kicker">{adminCopy(lang, 'Contenuti media', 'Media content')}</span><h1>{adminCopy(lang, 'Media sito', 'Site media')}</h1><p>{adminCopy(lang, 'Sostituisci immagini, video e documenti pubblici senza modificare il codice.', 'Replace public images, videos, and documents without code changes.')}</p></div>
        </div>
      )}
      {compactHeader && <div className="admin-subpage-actions"><button className="button secondary" type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna media', 'Refresh media')}</button></div>}
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : (
        <div className="media-admin-grid">
          {MEDIA_ADMIN_ITEMS.map((definition) => {
            const item = itemMap[definition.key];
            return (
              <article className="media-admin-card" key={definition.key}>
                <div><span className="micro-label">{definition.key}</span><h3>{lang === 'it' ? definition.it : definition.en}</h3></div>
                {item?.file_url ? (
                  item.media_kind === 'video' ? <video src={item.file_url} controls /> : <img src={item.file_url} alt={lang === 'it' ? item.alt_it : item.alt_en} />
                ) : <div className="media-empty-preview">{adminCopy(lang, 'Fallback statico', 'Static fallback')}</div>}
                <p className="small-note">{item?.file_name || adminCopy(lang, 'Nessun file caricato', 'No uploaded file')}</p>
                <label className="button secondary"><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf,.jpg,.jpeg,.png,.webp,.mp4,.pdf" onChange={(event) => saveMedia(definition.key, event.target.files?.[0])} />{adminCopy(lang, 'Carica / sostituisci', 'Upload / replace')}</label>
                {item?.file_url && <button className="button secondary danger" type="button" onClick={() => removeMedia(item)}>{adminCopy(lang, 'Rimuovi', 'Remove')}</button>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

const EXPERIENCE_CONTENT_DEFINITIONS = experiences.flatMap((experience) => [
  { key: `experiences.${experience.id}.title`, section: 'Esperienze', label_it: `${experience.title} · titolo`, label_en: `${experience.title} · title`, type: 'text', default_it: experience.title, default_en: experience.title, text_size: 'large', style_variant: 'heading' },
  { key: `experiences.${experience.id}.summary`, section: 'Esperienze', label_it: `${experience.title} · sintesi`, label_en: `${experience.title} · summary`, type: 'textarea', default_it: experience.summary.it, default_en: experience.summary.en },
  { key: `experiences.${experience.id}.best_for`, section: 'Esperienze', label_it: `${experience.title} · ideale per`, label_en: `${experience.title} · best for`, type: 'textarea', default_it: experience.bestFor.it, default_en: experience.bestFor.en },
  { key: `experiences.${experience.id}.starting`, section: 'Esperienze', label_it: `${experience.title} · indicazione`, label_en: `${experience.title} · starting`, type: 'text', default_it: experience.starting.it, default_en: experience.starting.en },
  { key: `experiences.${experience.id}.description`, section: 'Esperienze', label_it: `${experience.title} · descrizione`, label_en: `${experience.title} · description`, type: 'textarea', default_it: experience.description.it, default_en: experience.description.en },
  { key: `experiences.${experience.id}.value`, section: 'Esperienze', label_it: `${experience.title} · valore`, label_en: `${experience.title} · value`, type: 'textarea', default_it: experience.value.it, default_en: experience.value.en },
  { key: `experiences.${experience.id}.notes`, section: 'Esperienze', label_it: `${experience.title} · note pratiche`, label_en: `${experience.title} · practical notes`, type: 'textarea', default_it: experience.notes.it, default_en: experience.notes.en },
  { key: `experiences.${experience.id}.safety`, section: 'Esperienze', label_it: `${experience.title} · sicurezza`, label_en: `${experience.title} · safety`, type: 'textarea', default_it: experience.safety.it, default_en: experience.safety.en }
]);

const SITE_CONTENT_DEFINITIONS = [
  { key: 'home.hero.title', section: 'Homepage', label_it: 'Homepage hero title', label_en: 'Homepage hero title', type: 'textarea', default_it: i18n.it.heroTitle, default_en: i18n.en.heroTitle, text_size: 'hero', style_variant: 'display' },
  { key: 'home.hero.subtitle', section: 'Homepage', label_it: 'Homepage hero subtitle', label_en: 'Homepage hero subtitle', type: 'textarea', default_it: i18n.it.heroLead, default_en: i18n.en.heroLead, text_size: 'large', style_variant: 'body' },
  { key: 'home.hero.primary_cta', section: 'Homepage', label_it: 'CTA principale', label_en: 'Primary CTA', type: 'text', default_it: i18n.it.findExperience, default_en: i18n.en.findExperience, style_variant: 'label' },
  { key: 'home.hero.secondary_cta', section: 'Homepage', label_it: 'CTA secondaria', label_en: 'Secondary CTA', type: 'text', default_it: i18n.it.viewAvailability, default_en: i18n.en.viewAvailability, style_variant: 'label' },
  { key: 'home.hero.contact_cta', section: 'Homepage', label_it: 'CTA contatto', label_en: 'Contact CTA', type: 'text', default_it: i18n.it.contact, default_en: i18n.en.contact, style_variant: 'label' },
  { key: 'home.hero.guide_badge', section: 'Homepage', label_it: 'Badge guida', label_en: 'Guide badge', type: 'text', default_it: i18n.it.trust[0], default_en: i18n.en.trust[0], style_variant: 'label' },
  { key: 'experiences.page.title', section: 'Esperienze', label_it: 'Titolo pagina esperienze', label_en: 'Experiences page title', type: 'textarea', default_it: i18n.it.experiencesTitle, default_en: i18n.en.experiencesTitle, text_size: 'hero', style_variant: 'display', text_align: 'center' },
  { key: 'experiences.page.intro', section: 'Esperienze', label_it: 'Intro pagina esperienze', label_en: 'Experiences page intro', type: 'textarea', default_it: i18n.it.experiencesIntro, default_en: i18n.en.experiencesIntro, text_size: 'large', text_align: 'center' },
  ...EXPERIENCE_CONTENT_DEFINITIONS,
  { key: 'upcoming.page.title', section: 'Prossime escursioni', label_it: 'Titolo prossime escursioni', label_en: 'Upcoming excursions title', type: 'text', default_it: i18n.it.upcomingExcursions, default_en: i18n.en.upcomingExcursions, text_size: 'hero', style_variant: 'display', text_align: 'center' },
  { key: 'upcoming.page.intro', section: 'Prossime escursioni', label_it: 'Intro prossime escursioni', label_en: 'Upcoming excursions intro', type: 'textarea', default_it: i18n.it.availabilityIntro, default_en: i18n.en.availabilityIntro, text_size: 'large', text_align: 'center' },
  { key: 'partnerships.page.title', section: 'Collaborazioni', label_it: 'Titolo collaborazioni', label_en: 'Partnerships title', type: 'text', default_it: i18n.it.partnershipsTitle, default_en: i18n.en.partnershipsTitle, text_size: 'hero', style_variant: 'display', text_align: 'center' },
  { key: 'partnerships.page.intro', section: 'Collaborazioni', label_it: 'Intro collaborazioni', label_en: 'Partnerships intro', type: 'textarea', default_it: '', default_en: '', text_size: 'large', text_align: 'center' },
  { key: 'about.page.title', section: 'Chi siamo', label_it: 'Titolo chi siamo', label_en: 'About us title', type: 'textarea', default_it: i18n.it.teamTitle, default_en: i18n.en.teamTitle, text_size: 'hero', style_variant: 'display', text_align: 'center' },
  { key: 'about.leonardo.role', section: 'Chi siamo', label_it: 'Ruolo Leonardo', label_en: 'Leonardo role', type: 'text', default_it: i18n.it.leonardoRole, default_en: i18n.en.leonardoRole, style_variant: 'label' },
  { key: 'about.leonardo.bio', section: 'Chi siamo', label_it: 'Bio Leonardo', label_en: 'Leonardo bio', type: 'textarea', default_it: i18n.it.leonardoBio, default_en: i18n.en.leonardoBio },
  { key: 'about.deborah.name', section: 'Chi siamo', label_it: 'Nome Deborah', label_en: 'Deborah name', type: 'text', default_it: i18n.it.coFounderName, default_en: i18n.en.coFounderName, text_size: 'large', style_variant: 'heading' },
  { key: 'about.deborah.role', section: 'Chi siamo', label_it: 'Ruolo Deborah', label_en: 'Deborah role', type: 'text', default_it: i18n.it.coFounderRole, default_en: i18n.en.coFounderRole, style_variant: 'label' },
  { key: 'about.deborah.bio', section: 'Chi siamo', label_it: 'Bio Deborah', label_en: 'Deborah bio', type: 'textarea', default_it: i18n.it.coFounderBio, default_en: i18n.en.coFounderBio },
  { key: 'mission.mission.title', section: 'Missione', label_it: 'Titolo Missione', label_en: 'Mission title', type: 'text', default_it: i18n.it.mission, default_en: i18n.en.mission, text_size: 'hero', style_variant: 'display' },
  { key: 'mission.mission.body', section: 'Missione', label_it: 'Testo Missione', label_en: 'Mission body', type: 'textarea', default_it: i18n.it.missionText, default_en: i18n.en.missionText, text_size: 'large' },
  { key: 'mission.vision.title', section: 'Missione', label_it: 'Titolo Visione', label_en: 'Vision title', type: 'text', default_it: i18n.it.vision, default_en: i18n.en.vision, text_size: 'hero', style_variant: 'display' },
  { key: 'mission.vision.body', section: 'Missione', label_it: 'Testo Visione', label_en: 'Vision body', type: 'textarea', default_it: i18n.it.visionText, default_en: i18n.en.visionText, text_size: 'large' },
  { key: 'reviews.page.title', section: 'Recensioni', label_it: 'Titolo recensioni', label_en: 'Reviews title', type: 'textarea', default_it: i18n.it.reviewsTitle, default_en: i18n.en.reviewsTitle, text_size: 'hero', style_variant: 'display' },
  { key: 'reviews.page.intro', section: 'Recensioni', label_it: 'Intro recensioni', label_en: 'Reviews intro', type: 'textarea', default_it: i18n.it.reviewsIntro || '', default_en: i18n.en.reviewsIntro || '' },
  { key: 'reviews.publish_button', section: 'Recensioni', label_it: 'Bottone recensione', label_en: 'Review button', type: 'text', default_it: i18n.it.publishReview, default_en: i18n.en.publishReview, style_variant: 'label' },
  { key: 'contact.page.title', section: 'Contatti', label_it: 'Titolo contatti', label_en: 'Contact title', type: 'text', default_it: i18n.it.formTitle, default_en: i18n.en.formTitle, text_size: 'hero', style_variant: 'display' },
  { key: 'contact.page.intro', section: 'Contatti', label_it: 'Intro contatti', label_en: 'Contact intro', type: 'textarea', default_it: i18n.it.formIntro, default_en: i18n.en.formIntro, text_size: 'large' },
  { key: 'contact.channels.phone', section: 'Contatti', label_it: 'Telefono pubblico / WhatsApp', label_en: 'Public phone / WhatsApp', type: 'text', default_it: PHONE_DISPLAY, default_en: PHONE_DISPLAY },
  { key: 'contact.channels.email', section: 'Contatti', label_it: 'Email pubblica', label_en: 'Public email', type: 'text', default_it: EMAIL, default_en: EMAIL },
  { key: 'contact.channels.instagram_url', section: 'Contatti', label_it: 'Link Instagram pubblico', label_en: 'Public Instagram link', type: 'text', default_it: INSTAGRAM, default_en: INSTAGRAM },
  { key: 'footer.contact.name', section: 'Footer', label_it: 'Nome footer', label_en: 'Footer name', type: 'text', default_it: 'Leonardo Chiavetta', default_en: 'Leonardo Chiavetta', style_variant: 'heading' }
];

const ADMIN_CONTENT_DEFINITIONS = [
  { key: 'admin.today.title', section: 'Oggi', label_it: 'Titolo pannello operativo', label_en: 'Operations dashboard title', type: 'text', default_it: 'Pannello operativo', default_en: 'Operations', text_size: 'display', style_variant: 'display' },
  { key: 'admin.today.helper', section: 'Oggi', label_it: 'Descrizione oggi', label_en: 'Today helper', type: 'textarea', default_it: 'Stato operativo rapido, richieste e attività da controllare oggi.', default_en: 'Fast operational status, requests, and activity to review today.', text_size: 'normal', style_variant: 'body' },
  { key: 'admin.today.pendingToday.label', section: 'Oggi', label_it: 'Scheda pending oggi', label_en: 'Pending today card', type: 'text', default_it: 'Pending oggi', default_en: 'Pending today', style_variant: 'label' },
  { key: 'admin.today.pendingToday.helper', section: 'Oggi', label_it: 'Aiuto pending oggi', label_en: 'Pending today helper', type: 'text', default_it: 'Apri richieste di oggi', default_en: 'Open today requests' },
  { key: 'admin.today.pendingTotal.label', section: 'Oggi', label_it: 'Scheda pending totale', label_en: 'Pending total card', type: 'text', default_it: 'Pending totale', default_en: 'Pending total', style_variant: 'label' },
  { key: 'admin.today.pendingTotal.helper', section: 'Oggi', label_it: 'Aiuto pending totale', label_en: 'Pending total helper', type: 'text', default_it: 'Vai alle richieste', default_en: 'Go to requests' },
  { key: 'admin.today.acceptedToday.label', section: 'Oggi', label_it: 'Scheda accettate oggi', label_en: 'Accepted today card', type: 'text', default_it: 'Accettate oggi', default_en: 'Accepted today', style_variant: 'label' },
  { key: 'admin.today.acceptedToday.helper', section: 'Oggi', label_it: 'Aiuto accettate oggi', label_en: 'Accepted today helper', type: 'text', default_it: 'Vedi confermate', default_en: 'View accepted' },
  { key: 'admin.today.availabilityToday.label', section: 'Oggi', label_it: 'Scheda disponibilità oggi', label_en: 'Availability today card', type: 'text', default_it: 'Disponibilità oggi', default_en: 'Availability issues today', style_variant: 'label' },
  { key: 'admin.today.availabilityToday.helper', section: 'Oggi', label_it: 'Aiuto disponibilità oggi', label_en: 'Availability today helper', type: 'text', default_it: 'Gestisci calendario', default_en: 'Manage calendar' },
  { key: 'admin.today.todayRequests.title', section: 'Oggi', label_it: 'Titolo richieste di oggi', label_en: 'Today requests title', type: 'text', default_it: 'Richieste di oggi', default_en: 'Today requests', style_variant: 'heading' },
  { key: 'admin.today.pendingRequests.title', section: 'Oggi', label_it: 'Titolo richieste pending', label_en: 'Pending requests title', type: 'text', default_it: 'Richieste pending da confermare', default_en: 'Pending requests needing attention', style_variant: 'heading' },
  { key: 'admin.today.upcomingOperations.title', section: 'Oggi', label_it: 'Titolo operazioni imminenti', label_en: 'Upcoming operations title', type: 'text', default_it: 'Operazioni imminenti', default_en: 'Upcoming operations', style_variant: 'heading' },
  { key: 'admin.today.acceptedBookings.title', section: 'Oggi', label_it: 'Riga prenotazioni accettate', label_en: 'Accepted bookings row', type: 'text', default_it: 'Prenotazioni accettate', default_en: 'Accepted bookings', style_variant: 'heading' },
  { key: 'admin.today.nearTermBlocks.title', section: 'Oggi', label_it: 'Riga blocchi prossimi', label_en: 'Near-term blocks row', type: 'text', default_it: 'Blocchi prossimi', default_en: 'Near-term blocks', style_variant: 'heading' },
  { key: 'admin.today.recentDecisions.title', section: 'Oggi', label_it: 'Riga decisioni recenti', label_en: 'Recent decisions row', type: 'text', default_it: 'Decisioni recenti', default_en: 'Recent decisions', style_variant: 'heading' },
  { key: 'admin.calendar.title', section: 'Calendar', label_it: 'Titolo calendario', label_en: 'Calendar title', type: 'text', default_it: 'Calendario disponibilità', default_en: 'Availability calendar', text_size: 'display', style_variant: 'display' },
  { key: 'admin.calendar.helper', section: 'Calendar', label_it: 'Descrizione calendario', label_en: 'Calendar helper', type: 'textarea', default_it: 'Verde: escursione fissa. Rosso: esperienza prenotata. Grigio: data bloccata o non disponibile.', default_en: 'Green: fixed excursion. Red: booked experience. Grey: blocked or unavailable date.', text_size: 'normal', style_variant: 'body' },
  { key: 'admin.calendar.selected.title', section: 'Calendar', label_it: 'Titolo dettagli data', label_en: 'Selected date title', type: 'text', default_it: 'Dettagli data', default_en: 'Date details', style_variant: 'heading' },
  { key: 'admin.finance.title', section: 'Finance', label_it: 'Titolo finanze', label_en: 'Finance title', type: 'text', default_it: 'Finanze', default_en: 'Finance', style_variant: 'heading' },
  { key: 'admin.finance.profitLoss.title', section: 'Finance', label_it: 'Titolo profitti e perdite', label_en: 'Profit & Loss title', type: 'text', default_it: 'Profitti e perdite', default_en: 'Profit & Loss', style_variant: 'heading' },
  { key: 'admin.finance.addEntry.title', section: 'Finance', label_it: 'Titolo aggiungi voce', label_en: 'Add entry title', type: 'text', default_it: 'Aggiungi voce', default_en: 'Add entry', style_variant: 'heading' },
  { key: 'admin.finance.editEntry.title', section: 'Finance', label_it: 'Titolo modifica voce', label_en: 'Edit entry title', type: 'text', default_it: 'Modifica voce', default_en: 'Edit entry', style_variant: 'heading' },
  { key: 'admin.finance.entries.title', section: 'Finance', label_it: 'Titolo voci finanziarie', label_en: 'Financial entries title', type: 'text', default_it: 'Voci finanziarie', default_en: 'Financial entries', style_variant: 'heading' },
  { key: 'admin.analytics.title', section: 'Analytics', label_it: 'Titolo dati', label_en: 'Analytics title', type: 'text', default_it: 'Dati', default_en: 'Analytics', style_variant: 'heading' },
  { key: 'admin.analytics.helper', section: 'Analytics', label_it: 'Descrizione dati', label_en: 'Analytics helper', type: 'textarea', default_it: 'Metriche anonime e privacy-first sulle visite pubbliche, le azioni e il percorso verso la prenotazione.', default_en: 'Anonymous privacy-first metrics about public visits, actions, and movement toward booking.' },
  { key: 'admin.analytics.overview.title', section: 'Analytics', label_it: 'Titolo panoramica', label_en: 'Overview title', type: 'text', default_it: 'Panoramica', default_en: 'Overview', style_variant: 'heading' },
  { key: 'admin.analytics.bookingFunnel.title', section: 'Analytics', label_it: 'Titolo funnel prenotazione', label_en: 'Booking funnel title', type: 'text', default_it: 'Funnel prenotazione', default_en: 'Booking funnel', style_variant: 'heading' },
  { key: 'admin.analytics.contactIntent.title', section: 'Analytics', label_it: 'Titolo intento contatto', label_en: 'Contact intent title', type: 'text', default_it: 'Intento di contatto', default_en: 'Contact intent', style_variant: 'heading' },
  { key: 'admin.analytics.audienceUx.title', section: 'Analytics', label_it: 'Titolo pubblico e UX', label_en: 'Audience and UX title', type: 'text', default_it: 'Pubblico e UX', default_en: 'Audience and UX', style_variant: 'heading' },
  { key: 'admin.analytics.geography.title', section: 'Analytics', label_it: 'Titolo geografia', label_en: 'Geography title', type: 'text', default_it: 'Geografia', default_en: 'Geography', style_variant: 'heading' },
  { key: 'admin.analytics.flow.title', section: 'Analytics', label_it: 'Titolo flusso sito', label_en: 'Website flow title', type: 'text', default_it: 'Flusso sito', default_en: 'Website flow', style_variant: 'heading' },
  { key: 'admin.analytics.sources.title', section: 'Analytics', label_it: 'Titolo fonti traffico', label_en: 'Traffic sources title', type: 'text', default_it: 'Fonti traffico', default_en: 'Traffic sources', style_variant: 'heading' },
  { key: 'admin.analytics.devices.title', section: 'Analytics', label_it: 'Titolo dispositivi', label_en: 'Devices title', type: 'text', default_it: 'Dispositivi', default_en: 'Devices', style_variant: 'heading' },
  { key: 'admin.analytics.language.title', section: 'Analytics', label_it: 'Titolo lingua', label_en: 'Language title', type: 'text', default_it: 'Lingua', default_en: 'Language', style_variant: 'heading' },
  { key: 'admin.requests.title', section: 'Requests', label_it: 'Titolo richieste', label_en: 'Requests title', type: 'text', default_it: 'Richieste', default_en: 'Requests', style_variant: 'heading' },
  { key: 'admin.requests.helper', section: 'Requests', label_it: 'Descrizione richieste', label_en: 'Requests helper', type: 'textarea', default_it: 'Cerca e filtra richieste da sito, WhatsApp, telefono o email.', default_en: 'Search and filter requests from the website, WhatsApp, phone, or email.' },
  { key: 'admin.requests.results.title', section: 'Requests', label_it: 'Titolo risultati richieste', label_en: 'Request results title', type: 'text', default_it: 'Risultati', default_en: 'Results', style_variant: 'heading' },
  { key: 'admin.upcoming.title', section: 'Upcoming', label_it: 'Titolo prossime prenotazioni', label_en: 'Upcoming bookings title', type: 'text', default_it: 'Prossime prenotazioni', default_en: 'Upcoming bookings', text_size: 'display', style_variant: 'display' },
  { key: 'admin.upcoming.helper', section: 'Upcoming', label_it: 'Descrizione prossime prenotazioni', label_en: 'Upcoming bookings helper', type: 'textarea', default_it: 'Richieste accettate e blocchi attivi, organizzati per giorno. Nessuna statistica: solo operatività.', default_en: 'Accepted requests and active blocks, organized by date. No analytics: just operations.', text_size: 'normal', style_variant: 'body' },
  { key: 'admin.upcoming.accepted.title', section: 'Upcoming', label_it: 'Titolo prenotazioni accettate', label_en: 'Accepted bookings title', type: 'text', default_it: 'Prenotazioni accettate', default_en: 'Accepted bookings', style_variant: 'heading' },
  { key: 'admin.upcoming.past.title', section: 'Upcoming', label_it: 'Titolo esperienze passate', label_en: 'Past experiences title', type: 'text', default_it: 'Esperienze passate', default_en: 'Past experiences', style_variant: 'heading' },
  { key: 'admin.upcoming.blocks.title', section: 'Upcoming', label_it: 'Titolo blocchi prossimi', label_en: 'Near-term blocks title', type: 'text', default_it: 'Blocchi prossimi', default_en: 'Near-term blocks', style_variant: 'heading' },
  { key: 'admin.availability.title', section: 'Availability', label_it: 'Titolo disponibilità', label_en: 'Availability title', type: 'text', default_it: 'Disponibilità', default_en: 'Availability', style_variant: 'heading' },
  { key: 'admin.availability.helper', section: 'Availability', label_it: 'Descrizione disponibilità', label_en: 'Availability helper', type: 'textarea', default_it: 'Gestisci disponibilità privata e date fisse prenotabili fino a 12 persone.', default_en: 'Manage private availability and fixed excursion dates bookable up to 12 people.' },
  { key: 'admin.availability.addBlock.title', section: 'Availability', label_it: 'Titolo aggiungi blocco', label_en: 'Add block title', type: 'text', default_it: 'Aggiungi blocco disponibilità', default_en: 'Add availability block', style_variant: 'heading' },
  { key: 'admin.availability.existingBlocks.title', section: 'Availability', label_it: 'Titolo blocchi esistenti', label_en: 'Existing blocks title', type: 'text', default_it: 'Blocchi esistenti', default_en: 'Existing blocks', style_variant: 'heading' },
  { key: 'admin.reviews.title', section: 'Reviews', label_it: 'Titolo gestione recensioni', label_en: 'Review management title', type: 'text', default_it: 'Gestione recensioni', default_en: 'Review management', style_variant: 'heading' },
  { key: 'admin.partnerships.title', section: 'Collaborations', label_it: 'Titolo collaborazioni', label_en: 'Partnerships title', type: 'text', default_it: 'Collaborazioni', default_en: 'Partnerships', style_variant: 'heading' },
  { key: 'admin.partnerships.helper', section: 'Collaborations', label_it: 'Descrizione collaborazioni', label_en: 'Partnerships helper', type: 'textarea', default_it: 'Crea, modifica e disattiva le collaborazioni visibili sul sito pubblico.', default_en: 'Create, edit, and deactivate collaborations visible on the public website.' },
  { key: 'admin.partnerships.create.title', section: 'Collaborations', label_it: 'Titolo crea collaborazione', label_en: 'Create partnership title', type: 'text', default_it: 'Crea collaborazione', default_en: 'Create partnership', style_variant: 'heading' },
  { key: 'admin.partnerships.saved.title', section: 'Collaborations', label_it: 'Titolo collaborazioni salvate', label_en: 'Saved partnerships title', type: 'text', default_it: 'Collaborazioni salvate', default_en: 'Saved partnerships', style_variant: 'heading' },
  { key: 'admin.reviews.helper', section: 'Reviews', label_it: 'Descrizione gestione recensioni', label_en: 'Review management helper', type: 'textarea', default_it: 'Approva, nascondi, rispondi o elimina recensioni pubbliche.', default_en: 'Approve, hide, reply to, or delete public reviews.' },
  { key: 'admin.edit.title', section: 'Edit', label_it: 'Titolo modifica', label_en: 'Edit page title', type: 'text', default_it: 'Modifica sito e recensioni', default_en: 'Edit website and reviews', text_size: 'display', style_variant: 'display' },
  { key: 'admin.edit.helper', section: 'Edit', label_it: 'Descrizione modifica', label_en: 'Edit page helper', type: 'textarea', default_it: 'Gestisci contenuti, media e recensioni pubbliche da un’unica area.', default_en: 'Manage public content, media, and reviews from one area.', text_size: 'normal', style_variant: 'body' },
  { key: 'admin.edit.publicSite.title', section: 'Edit', label_it: 'Titolo pannello sito pubblico', label_en: 'Public website panel title', type: 'text', default_it: 'Sito pubblico', default_en: 'Public website', style_variant: 'heading' },
  { key: 'admin.edit.publicSite.helper', section: 'Edit', label_it: 'Descrizione pannello sito pubblico', label_en: 'Public website panel helper', type: 'text', default_it: 'Testi e media', default_en: 'Text and media', style_variant: 'label' },
  { key: 'admin.edit.adminSite.title', section: 'Edit', label_it: 'Titolo pannello sito admin', label_en: 'Admin website panel title', type: 'text', default_it: 'Sito admin', default_en: 'Admin website', style_variant: 'heading' },
  { key: 'admin.edit.adminSite.helper', section: 'Edit', label_it: 'Descrizione pannello sito admin', label_en: 'Admin website panel helper', type: 'text', default_it: 'Testi pannello', default_en: 'Panel text', style_variant: 'label' },
  { key: 'admin.edit.reviews.title', section: 'Edit', label_it: 'Titolo pannello recensioni', label_en: 'Reviews panel title', type: 'text', default_it: 'Recensioni', default_en: 'Reviews', style_variant: 'heading' },
  { key: 'admin.edit.reviews.helper', section: 'Edit', label_it: 'Descrizione pannello recensioni', label_en: 'Reviews panel helper', type: 'text', default_it: 'Gestione', default_en: 'Management', style_variant: 'label' },
  { key: 'admin.publicSite.title', section: 'Public site', label_it: 'Titolo scorciatoia sito pubblico', label_en: 'Public site shortcut title', type: 'text', default_it: 'Sito pubblico', default_en: 'Public site', text_size: 'display', style_variant: 'display' },
  { key: 'admin.publicSite.helper', section: 'Public site', label_it: 'Descrizione scorciatoia sito pubblico', label_en: 'Public site shortcut helper', type: 'textarea', default_it: 'Scorciatoia admin verso il sito pubblico. Usa il pannello Sito pubblico in Modifica per modificare testi, media e sezioni pubbliche.', default_en: 'Admin shortcut to the public website. Use the Public website panel in Edit to modify public copy, media, and sections.', text_size: 'normal', style_variant: 'body' }
];

function contentDefinitionMap() {
  return SITE_CONTENT_DEFINITIONS.reduce((acc, item) => ({ ...acc, [item.key]: item }), {});
}

function AdminSiteContentPage({ lang, session }) {
  const [section, setSection] = useState('today');
  const [editorLang, setEditorLang] = useState(lang || 'it');
  const [device, setDevice] = useState('desktop');
  const [contentRows, setContentRows] = useState([]);
  const [contentDrafts, setContentDrafts] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    if (!isSupabaseConfigured) {
      setContentRows([]);
      setLoading(false);
      setError(adminCopy(lang, 'Supabase non è configurato. Puoi vedere l’anteprima, ma non salvare modifiche.', 'Supabase is not configured. You can preview the dashboard, but changes cannot be saved.'));
      return;
    }
    try {
      const rows = await listSiteContent({ activeOnly: false });
      setContentRows(rows.filter((row) => String(row.content_key || '').startsWith('admin.')));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Editor admin non caricato.', 'Admin editor not loaded.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const contentMap = useMemo(() => buildAdminEditorContentMap(contentRows, contentDrafts), [contentRows, contentDrafts]);
  const hasDrafts = Object.keys(contentDrafts).length > 0;
  const selectedHasDraft = Boolean(selected && selected.type === 'text' && contentDrafts[selected.key]);
  const editor = useMemo(() => ({ isEditing: true, lang: editorLang, selected, select: setSelected, contentMap, mediaMap: {} }), [editorLang, selected, contentMap]);

  function updateContentDraft(key, patch) {
    setFeedback('');
    setContentDrafts((current) => ({ ...current, [key]: { ...(contentMap[key] || editorContentItem({}, key)), ...(current[key] || {}), ...patch } }));
  }

  function updateMediaDraft() {}

  async function saveContentItem(item) {
    if (!isSupabaseConfigured) throw new Error(adminCopy(lang, 'Supabase non è configurato.', 'Supabase is not configured.'));
    await upsertSiteContent({
      content_key: item.content_key || item.key,
      section: item.section,
      label_it: item.label_it,
      label_en: item.label_en,
      value_it: item.value_it,
      value_en: item.value_en,
      default_it: item.default_it,
      default_en: item.default_en,
      content_type: item.content_type || (item.type === 'textarea' ? 'textarea' : 'text'),
      style_variant: item.style_variant || 'body',
      text_size: item.text_size || 'normal',
      text_align: item.text_align || 'left',
      visible: item.visible !== false,
      layout_variant: item.layout_variant || 'default',
      sort_order: item.sort_order || 0,
      active: item.active !== false,
      updated_by: session.user.id
    });
  }

  async function saveSelected() {
    if (!selected || saving) return;
    setError('');
    setFeedback('');
    setSaving(true);
    try {
      await saveContentItem(contentMap[selected.key]);
      setContentDrafts((current) => {
        const next = { ...current };
        delete next[selected.key];
        return next;
      });
      setFeedback(adminCopy(lang, 'Modifica admin salvata.', 'Admin change saved.'));
      await refresh();
      window.dispatchEvent(new Event('vulcaniq-admin-content-updated'));
      setSelected(null);
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Contenuto admin non salvato.', 'Admin content not saved.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveAll() {
    if (saving) return;
    setError('');
    setFeedback('');
    setSaving(true);
    try {
      const items = Object.keys(contentDrafts).map((key) => contentMap[key]).filter(Boolean);
      for (const item of items) await saveContentItem(item);
      setContentDrafts({});
      setFeedback(adminCopy(lang, 'Tutte le modifiche admin sono state salvate.', 'All admin changes have been saved.'));
      await refresh();
      window.dispatchEvent(new Event('vulcaniq-admin-content-updated'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Impossibile salvare tutte le modifiche admin.', 'Unable to save all admin changes.'));
    } finally {
      setSaving(false);
    }
  }

  function discardDrafts() {
    if (hasDrafts && !window.confirm(adminCopy(lang, 'Scartare le modifiche admin non salvate?', 'Discard unsaved admin changes?'))) return;
    setContentDrafts({});
    setFeedback(adminCopy(lang, 'Modifiche admin locali scartate.', 'Local admin changes discarded.'));
  }

  function discardSelectedDraft() {
    if (!selected || selected.type !== 'text') return;
    setContentDrafts((current) => {
      const next = { ...current };
      delete next[selected.key];
      return next;
    });
  }

  function closeSelectedEditor() {
    if (selectedHasDraft && !window.confirm(adminCopy(lang, 'Chiudere senza salvare questa modifica?', 'Close without saving this change?'))) return;
    discardSelectedDraft();
    setSelected(null);
  }

  function resetSelected() {
    if (!selected || selected.type !== 'text') return;
    if (!window.confirm(adminCopy(lang, 'Ripristinare il testo admin selezionato al valore predefinito?', 'Reset the selected admin text to its default value?'))) return;
    const definition = getContentDefinition(selected.key);
    const item = contentMap[selected.key] || editorContentItem({}, selected.key);
    updateContentDraft(selected.key, {
      value_it: item.default_it || definition.default_it || '',
      value_en: item.default_en || definition.default_en || '',
      visible: true,
      active: true,
      text_size: definition.text_size || 'normal',
      text_align: definition.text_align || 'left',
      style_variant: definition.style_variant || 'body'
    });
  }

  return (
    <section className="admin-subpage admin-site-content-page admin-visual-editor-page visual-editor-page">
      <div className="visual-editor-toolbar admin-visual-editor-toolbar">
        <div>
          <span className="kicker">{adminCopy(lang, 'Modifica pannello', 'Edit admin panel')}</span>
          <h1>{adminCopy(lang, 'Editor visuale pannello', 'Admin visual editor')}</h1>
        </div>
        <label><span>{adminCopy(lang, 'Sezione', 'Section')}</span><select value={section} onChange={(event) => { setSection(event.target.value); setSelected(null); }}>
          {ADMIN_EDITOR_SECTION_OPTIONS.map((item) => <option key={item.key} value={item.key}>{lang === 'it' ? item.it : item.en}</option>)}
        </select></label>
        <label><span>{adminCopy(lang, 'Lingua', 'Language')}</span><select value={editorLang} onChange={(event) => setEditorLang(event.target.value)}><option value="it">IT</option><option value="en">EN</option></select></label>
        <label><span>{adminCopy(lang, 'Dispositivo', 'Device')}</span><select value={device} onChange={(event) => setDevice(event.target.value)}><option value="desktop">Desktop</option><option value="tablet">Tablet</option><option value="mobile">Mobile</option></select></label>
        <button className="button secondary" type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna anteprima', 'Refresh preview')}</button>
        <button className="button secondary" type="button" onClick={resetSelected} disabled={!selected}>{adminCopy(lang, 'Ripristina selezione', 'Reset selected')}</button>
        <button className="button secondary" type="button" onClick={discardDrafts} disabled={!hasDrafts || saving}>{adminCopy(lang, 'Scarta', 'Discard')}</button>
        <button className="button primary" type="button" onClick={saveAll} disabled={!hasDrafts || !isSupabaseConfigured || saving}>{saving ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Salva tutto', 'Save all')}</button>
      </div>

      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      {notice && <div className="admin-alert warning" role="status">{notice}</div>}
      {loading ? <p>{adminCopy(lang, 'Caricamento editor admin...', 'Loading admin editor...')}</p> : (
        <>
          <div className="visual-editor-shell admin-visual-editor-shell">
            <AdminVisualEditorPreview
              section={section}
              lang={editorLang}
              device={device}
              adminContent={contentMap}
              editor={editor}
              setNotice={setNotice}
            />
          </div>
          {selected && (
            <EditorFullscreenModal
              lang={lang}
              editorLang={editorLang}
              selected={selected}
              contentMap={contentMap}
              mediaMap={{}}
              updateContentDraft={updateContentDraft}
              updateMediaDraft={updateMediaDraft}
              onSave={saveSelected}
              onReset={resetSelected}
              onClose={closeSelectedEditor}
              canSave={isSupabaseConfigured && !saving}
            />
          )}
        </>
      )}
    </section>
  );
}


const ADMIN_EDITOR_SECTION_OPTIONS = [
  ...ADMIN_NAV_SECTIONS.filter((section) => section.editable).map((section) => ({ key: section.key, it: section.labelIt, en: section.labelEn })),
  { key: 'reviews', it: 'Recensioni', en: 'Reviews' }
];

function AdminVisualEditorPreview({ section, lang, device, adminContent, editor, setNotice }) {
  function disabledActionNotice() {
    setNotice(lang === 'it' ? 'Azione disattivata durante la modifica del pannello admin.' : 'This action is disabled while editing the admin panel.');
    window.setTimeout(() => setNotice(''), 2800);
  }

  function handlePreviewClick(event) {
    if (event.target.closest('.editor-selectable')) return;
    if (event.target.closest('button, a, input, select, textarea, summary')) {
      event.preventDefault();
      event.stopPropagation();
      disabledActionNotice();
    }
  }

  function renderSection() {
    switch (section) {
      case 'calendar':
        return <AdminCalendarPreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'upcoming':
        return <AdminUpcomingPreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'requests':
      case 'bookings':
        return <AdminRequestsPreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'availability':
        return <AdminAvailabilityPreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'partnerships':
        return <AdminPartnershipsPreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'edit':
        return <AdminEditPreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'finance':
        return <AdminFinancePreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'analytics':
        return <AdminAnalyticsPreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'publicSite':
        return <AdminPublicSitePreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'reviews':
        return <AdminReviewsPreview lang={lang} adminContent={adminContent} editor={editor} />;
      case 'today':
      case 'dashboard':
      default:
        return <AdminDashboardPreview lang={lang} adminContent={adminContent} editor={editor} />;
    }
  }

  return (
    <div className="visual-editor-canvas admin-visual-editor-canvas">
      <div className={`visual-preview-frame admin-dashboard-preview-frame ${device}`} onClickCapture={handlePreviewClick}>
        <div className="admin-preview-browserbar">
          <span>{adminCopy(lang, 'Anteprima pannello admin', 'Admin panel preview')}</span>
          <strong>vulcanIQ</strong>
        </div>
        <div className="admin-preview-surface">
          {renderSection()}
        </div>
      </div>
    </div>
  );
}

function AdminPreviewSummaryCard({ value, labelKey, helperKey, lang, adminContent, editor, labelFallback, helperFallback }) {
  return (
    <article className="summary-card admin-preview-summary-card">
      <strong>{value}</strong>
      <AdminEditableText itemKey={labelKey} lang={lang} adminContent={adminContent} editor={editor} fallback={labelFallback} />
      {helperKey && <AdminEditableText as="small" itemKey={helperKey} lang={lang} adminContent={adminContent} editor={editor} fallback={helperFallback} />}
    </article>
  );
}

function AdminDashboardPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Oggi', 'Today')}</span>
          <AdminEditableText as="h1" itemKey="admin.today.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Pannello operativo', 'Operations')} />
          <AdminEditableText as="p" itemKey="admin.today.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Stato operativo rapido, richieste e attività da controllare oggi.', 'Fast operational status, requests, and activity to review today.')} />
        </div>
        <div className="admin-header-actions"><button className="button primary" type="button">{adminCopy(lang, 'Aggiungi richiesta manuale', 'Add manual request')}</button></div>
      </div>
      <div className="admin-summary-grid admin-primary-stat-grid">
        <AdminPreviewSummaryCard value="2" labelKey="admin.today.pendingToday.label" helperKey="admin.today.pendingToday.helper" lang={lang} adminContent={adminContent} editor={editor} labelFallback={adminCopy(lang, 'Pending oggi', 'Pending today')} helperFallback={adminCopy(lang, 'Apri richieste di oggi', 'Open today requests')} />
        <AdminPreviewSummaryCard value="5" labelKey="admin.today.pendingTotal.label" helperKey="admin.today.pendingTotal.helper" lang={lang} adminContent={adminContent} editor={editor} labelFallback={adminCopy(lang, 'Pending totale', 'Pending total')} helperFallback={adminCopy(lang, 'Vai alle richieste', 'Go to requests')} />
        <AdminPreviewSummaryCard value="3" labelKey="admin.today.acceptedToday.label" helperKey="admin.today.acceptedToday.helper" lang={lang} adminContent={adminContent} editor={editor} labelFallback={adminCopy(lang, 'Accettate oggi', 'Accepted today')} helperFallback={adminCopy(lang, 'Vedi confermate', 'View accepted')} />
        <AdminPreviewSummaryCard value="1" labelKey="admin.today.availabilityToday.label" helperKey="admin.today.availabilityToday.helper" lang={lang} adminContent={adminContent} editor={editor} labelFallback={adminCopy(lang, 'Disponibilità oggi', 'Availability issues today')} helperFallback={adminCopy(lang, 'Gestisci calendario', 'Manage calendar')} />
      </div>
      <div className="admin-two-column">
        <section className="admin-panel">
          <details className="admin-archive-details today-requests-details" open>
            <summary><AdminEditableText itemKey="admin.today.todayRequests.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Richieste di oggi', 'Today requests')} /><strong>2</strong></summary>
            <div className="request-card-list compact-list">
              <article className="request-card compact"><div className="request-card-head"><div><h3>Rita</h3><p>Etna Learning · 12/06/2026</p></div><span className="status-pill pending">pending</span></div></article>
            </div>
          </details>
          <div className="admin-panel-subsection">
            <div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.today.pendingRequests.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Richieste pending da confermare', 'Pending requests needing attention')} /></div>
            <p className="small-note">{adminCopy(lang, 'Anteprima contenuto richieste.', 'Request content preview.')}</p>
          </div>
        </section>
        <aside className="admin-panel compact-panel admin-operations-panel">
          <div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.today.upcomingOperations.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Operazioni imminenti', 'Upcoming operations')} /></div>
          <details className="admin-archive-details admin-operation-group" open><summary><AdminEditableText itemKey="admin.today.acceptedBookings.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Prenotazioni accettate', 'Accepted bookings')} /><strong>5</strong></summary></details>
          <details className="admin-archive-details admin-operation-group"><summary><AdminEditableText itemKey="admin.today.nearTermBlocks.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Blocchi prossimi', 'Near-term blocks')} /><strong>0</strong></summary></details>
          <details className="admin-archive-details admin-operation-group"><summary><AdminEditableText itemKey="admin.today.recentDecisions.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Decisioni recenti', 'Recent decisions')} /><strong>8</strong></summary></details>
        </aside>
      </div>
    </section>
  );
}

function AdminCalendarPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Calendario', 'Calendar')}</span>
          <AdminEditableText as="h1" itemKey="admin.calendar.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Calendario disponibilità', 'Availability calendar')} />
          <AdminEditableText as="p" itemKey="admin.calendar.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Verde: escursione fissa. Rosso: esperienza prenotata. Grigio: data bloccata o non disponibile.', 'Green: fixed excursion. Red: booked experience. Grey: blocked or unavailable date.')} />
        </div>
      </div>
      <div className="admin-calendar-layout">
        <article className="calendar-card admin-calendar-card">
          <div className="calendar-topline"><button type="button">‹</button><h2>Giugno 2026</h2><button type="button">›</button></div>
          <div className="calendar-legend compact-legend">
            <span><i className="legend-dot fixed" />{adminCopy(lang, 'Verde: escursione fissa', 'Green: fixed excursion')}</span>
            <span><i className="legend-dot booked" />{adminCopy(lang, 'Rosso: esperienza prenotata', 'Red: booked experience')}</span>
            <span><i className="legend-dot blocked" />{adminCopy(lang, 'Grigio: bloccata', 'Grey: blocked')}</span>
          </div>
          <div className="calendar-grid admin-calendar-grid">{[9, 10, 11, 12, 13, 14].map((day) => <button key={day} className={day === 12 ? 'has-fixed' : day === 14 ? 'has-booking' : ''} type="button"><span>{day}</span></button>)}</div>
        </article>
        <aside className="admin-panel"><AdminEditableText as="h2" itemKey="admin.calendar.selected.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Dettagli data', 'Date details')} /><p className="small-note">Etna Live · 12/06/2026</p></aside>
      </div>
    </section>
  );
}

function AdminUpcomingPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Conferme owner', 'Owner confirmations')}</span>
          <AdminEditableText as="h1" itemKey="admin.upcoming.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Prossime prenotazioni', 'Upcoming bookings')} />
          <AdminEditableText as="p" itemKey="admin.upcoming.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Richieste accettate e blocchi attivi, organizzati per giorno. Nessuna statistica: solo operatività.', 'Accepted requests and active blocks, organized by date. No analytics: just operations.')} />
        </div>
      </div>
      <div className="admin-two-column">
        <section className="admin-panel upcoming-collapsed-panel">
          <details className="admin-archive-details admin-upcoming-group" open><summary><AdminEditableText itemKey="admin.upcoming.accepted.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Prenotazioni accettate', 'Accepted bookings')} /><strong>3</strong></summary></details>
          <details className="admin-archive-details admin-upcoming-group"><summary><AdminEditableText itemKey="admin.upcoming.past.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Esperienze passate', 'Past experiences')} /><strong>8</strong></summary></details>
        </section>
        <aside className="admin-panel compact-panel"><AdminEditableText as="h2" itemKey="admin.upcoming.blocks.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Blocchi prossimi', 'Near-term blocks')} /></aside>
      </div>
    </section>
  );
}

function AdminEditPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page admin-edit-page">
      <div className="admin-page-header"><div><span className="kicker">{adminCopy(lang, 'Modifica', 'Edit')}</span><AdminEditableText as="h1" itemKey="admin.edit.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Modifica sito e recensioni', 'Edit website and reviews')} /><AdminEditableText as="p" itemKey="admin.edit.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Gestisci contenuti, media e recensioni pubbliche da un’unica area.', 'Manage public content, media, and reviews from one area.')} /></div></div>
      <details className="admin-archive-details edit-workspace-section" open><summary><AdminEditableText itemKey="admin.edit.publicSite.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Sito pubblico', 'Public website')} /><AdminEditableText as="strong" itemKey="admin.edit.publicSite.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Testi e media', 'Text and media')} /></summary></details>
      <details className="admin-archive-details edit-workspace-section"><summary><AdminEditableText itemKey="admin.edit.adminSite.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Sito admin', 'Admin website')} /><AdminEditableText as="strong" itemKey="admin.edit.adminSite.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Testi pannello', 'Panel text')} /></summary></details>
      <details className="admin-archive-details edit-workspace-section"><summary><AdminEditableText itemKey="admin.edit.reviews.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Recensioni', 'Reviews')} /><AdminEditableText as="strong" itemKey="admin.edit.reviews.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Gestione', 'Management')} /></summary></details>
    </section>
  );
}

function AdminPublicSitePreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page">
      <div className="admin-page-header"><div><span className="kicker">vulcanIQ</span><AdminEditableText as="h1" itemKey="admin.publicSite.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Sito pubblico', 'Public site')} /><AdminEditableText as="p" itemKey="admin.publicSite.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Scorciatoia admin verso il sito pubblico. Usa il pannello Sito pubblico in Modifica per modificare testi, media e sezioni pubbliche.', 'Admin shortcut to the public website. Use the Public website panel in Edit to modify public copy, media, and sections.')} /></div></div>
      <section className="admin-panel"><p className="small-note">{adminCopy(lang, 'Questa voce rappresenta il pulsante Sito pubblico nella navigazione admin.', 'This item represents the Public site button in the admin navigation.')}</p></section>
    </section>
  );
}

function AdminFinancePreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page finance-preview-page">
      <div className="admin-page-header">
        <div><span className="kicker">{adminCopy(lang, 'Finanze', 'Finance')}</span><AdminEditableText as="h1" itemKey="admin.finance.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Finanze', 'Finance')} /></div>
        <button className="button secondary" type="button">{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
      </div>
      <div className="admin-summary-grid finance-summary-grid">
        <SummaryCard label={adminCopy(lang, 'Entrate totali', 'Total earnings')} value="40,00 €" helper={adminCopy(lang, 'Apri dettaglio', 'Open details')} />
        <SummaryCard label={adminCopy(lang, 'Uscite totali', 'Total expenses')} value="0,00 €" helper={adminCopy(lang, 'Apri dettaglio', 'Open details')} />
        <SummaryCard label={adminCopy(lang, 'Utile netto', 'Net profit')} value="40,00 €" helper={adminCopy(lang, 'Entrate meno uscite', 'Income minus expenses')} />
      </div>
      <div className="admin-filter-bar finance-filter-bar"><select><option>{adminCopy(lang, 'Tutte le date', 'All dates')}</option></select><select><option>{adminCopy(lang, 'Tutti i tipi', 'All types')}</option></select><label className="finance-archive-filter"><input type="checkbox" readOnly /> <span>{adminCopy(lang, 'Includi archivio', 'Include archive')}</span></label></div>
      <details className="admin-panel finance-collapsible-panel finance-overview-panel" open><summary className="finance-collapsible-summary"><strong>{adminCopy(lang, 'Tutte le date', 'All dates')}</strong></summary></details>
      <details className="admin-panel finance-collapsible-panel finance-pl-panel" open><summary className="finance-collapsible-summary"><AdminEditableText as="strong" itemKey="admin.finance.profitLoss.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Profitti e perdite', 'Profit & Loss')} /></summary></details>
      <div className="admin-two-column finance-layout">
        <details className="admin-panel finance-collapsible-panel finance-form-panel" open><summary className="finance-collapsible-summary"><AdminEditableText as="strong" itemKey="admin.finance.addEntry.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Aggiungi voce', 'Add entry')} /></summary></details>
        <details className="admin-panel finance-collapsible-panel finance-entries-panel" open><summary className="finance-collapsible-summary"><AdminEditableText as="strong" itemKey="admin.finance.entries.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Voci finanziarie', 'Financial entries')} /><em>1</em></summary></details>
      </div>
    </section>
  );
}

function AdminAvailabilityPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page">
      <div className="admin-page-header"><div><span className="kicker">{adminCopy(lang, 'Calendario pubblico', 'Public calendar')}</span><AdminEditableText as="h1" itemKey="admin.availability.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Disponibilità', 'Availability')} /><AdminEditableText as="p" itemKey="admin.availability.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Gestisci disponibilità privata e date fisse prenotabili fino a 12 persone.', 'Manage private availability and fixed excursion dates bookable up to 12 people.')} /></div></div>
      <div className="admin-two-column availability-columns"><section className="admin-panel"><AdminEditableText as="h2" itemKey="admin.availability.addBlock.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Aggiungi blocco disponibilità', 'Add availability block')} /></section><section className="admin-panel"><div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.availability.existingBlocks.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Blocchi esistenti', 'Existing blocks')} /></div></section></div>
    </section>
  );
}

function AdminRequestsPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page">
      <div className="admin-page-header"><div><span className="kicker">{adminCopy(lang, 'Gestione richieste', 'Request management')}</span><AdminEditableText as="h1" itemKey="admin.requests.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Richieste', 'Requests')} /><AdminEditableText as="p" itemKey="admin.requests.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Cerca e filtra richieste da sito, WhatsApp, telefono o email.', 'Search and filter requests from the website, WhatsApp, phone, or email.')} /></div></div>
      <section className="admin-panel"><div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.requests.results.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Risultati', 'Results')} /><strong>4</strong></div></section>
      <aside className="admin-panel compact-panel"><AdminEditableText as="h2" itemKey="admin.upcoming.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Prossime prenotazioni', 'Upcoming bookings')} /></aside>
    </section>
  );
}

function AdminReviewsPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page"><section className="admin-panel admin-reviews-panel"><div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.reviews.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Gestione recensioni', 'Review management')} /><button type="button">{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div><AdminEditableText as="p" itemKey="admin.reviews.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Approva, nascondi, rispondi o elimina recensioni pubbliche.', 'Approve, hide, reply to, or delete public reviews.')} /></section></section>
  );
}

function AdminPartnershipsPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-page admin-preview-page"><div className="admin-page-header"><div><span className="kicker">{adminCopy(lang, 'Network', 'Network')}</span><AdminEditableText as="h1" itemKey="admin.partnerships.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Collaborazioni', 'Partnerships')} /><AdminEditableText as="p" itemKey="admin.partnerships.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Crea, modifica e disattiva le collaborazioni visibili sul sito pubblico.', 'Create, edit, and deactivate collaborations visible on the public website.')} /></div></div><div className="admin-two-column availability-columns"><section className="admin-panel"><AdminEditableText as="h2" itemKey="admin.partnerships.create.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Crea collaborazione', 'Create partnership')} /></section><section className="admin-panel"><div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.partnerships.saved.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Collaborazioni salvate', 'Saved partnerships')} /></div></section></div></section>
  );
}

function AdminContentEditorModal({ lang, item, onClose, onSave, saving }) {
  useBodyScrollLock(true);
  const [form, setForm] = useState({
    value_it: item.value_it ?? item.default_it ?? '',
    value_en: item.value_en ?? item.default_en ?? '',
    text_size: item.text_size || 'normal',
    style_variant: item.style_variant || 'body',
    text_align: item.text_align || 'left',
    active: item.active !== false,
    visible: item.visible !== false
  });

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const TextFieldIt = item.content_type === 'textarea' || item.type === 'textarea'
    ? <textarea rows={5} value={form.value_it} onChange={(event) => update('value_it', event.target.value)} />
    : <input value={form.value_it} onChange={(event) => update('value_it', event.target.value)} />;
  const TextFieldEn = item.content_type === 'textarea' || item.type === 'textarea'
    ? <textarea rows={5} value={form.value_en} onChange={(event) => update('value_en', event.target.value)} />
    : <input value={form.value_en} onChange={(event) => update('value_en', event.target.value)} />;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="admin-modal wide full-screen-admin-modal admin-content-modal" role="dialog" aria-modal="true" aria-labelledby="adminContentEditorTitle">
        <div className="admin-modal-header">
          <div>
            <span className="kicker">{adminCopy(lang, 'Sito admin', 'Admin website')}</span>
            <h2 id="adminContentEditorTitle">{lang === 'it' ? item.label_it : item.label_en}</h2>
            <p className="small-note">{item.key}</p>
          </div>
          <button className="modal-close-button" type="button" aria-label={adminCopy(lang, 'Chiudi', 'Close')} onClick={onClose}>{adminCopy(lang, 'Chiudi', 'Close')}</button>
        </div>
        <form className="admin-form-grid" onSubmit={(event) => { event.preventDefault(); onSave(item, form); }}>
          <label className="admin-field full"><span>Italiano</span>{TextFieldIt}</label>
          <label className="admin-field full"><span>English</span>{TextFieldEn}</label>
          <label className="admin-field"><span>{adminCopy(lang, 'Dimensione testo', 'Text size')}</span><select value={form.text_size} onChange={(event) => update('text_size', event.target.value)}><option value="small">Small</option><option value="normal">Normal</option><option value="large">Large</option><option value="display">Display</option></select></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Stile', 'Style')}</span><select value={form.style_variant} onChange={(event) => update('style_variant', event.target.value)}><option value="body">Body</option><option value="heading">Heading</option><option value="label">Label</option><option value="display">Display</option></select></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Allineamento', 'Alignment')}</span><select value={form.text_align} onChange={(event) => update('text_align', event.target.value)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
          <div className="admin-field admin-content-toggle-group">
            <label className="check-field"><input type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)} /> {adminCopy(lang, 'Attivo', 'Active')}</label>
            <label className="check-field"><input type="checkbox" checked={form.visible} onChange={(event) => update('visible', event.target.checked)} /> {adminCopy(lang, 'Visibile', 'Visible')}</label>
          </div>
          <div className="modal-actions full">
            <button className="button primary" type="submit" disabled={saving || !isSupabaseConfigured}>{saving ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Salva', 'Save')}</button>
            <button className="button secondary" type="button" onClick={() => setForm((current) => ({ ...current, value_it: item.default_it || '', value_en: item.default_en || '', active: true, visible: true }))}>{adminCopy(lang, 'Ripristina fallback', 'Restore fallback')}</button>
            <button className="button secondary" type="button" onClick={onClose}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ContentAdminPage({ lang, session, compactHeader = false }) {
  const [items, setItems] = useState([]);
  const [section, setSection] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setItems(await listSiteContent({ activeOnly: false }));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Contenuti non caricati.', 'Content not loaded.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const existing = items.reduce((acc, item) => ({ ...acc, [item.content_key]: item }), {});
  const merged = SITE_CONTENT_DEFINITIONS.map((definition) => ({ ...definition, ...(existing[definition.key] || {}) }));
  const sections = ['all', ...Array.from(new Set(SITE_CONTENT_DEFINITIONS.map((item) => item.section)))];
  const visible = section === 'all' ? merged : merged.filter((item) => item.section === section);

  async function save(definition, values) {
    setError('');
    setFeedback('');
    try {
      const style = resolveEditableTextStyle(definition.key, definition, definition);
      await upsertSiteContent({
        content_key: definition.key,
        section: definition.section,
        label_it: definition.label_it,
        label_en: definition.label_en,
        value_it: values.value_it,
        value_en: values.value_en,
        default_it: definition.default_it,
        default_en: definition.default_en,
        content_type: definition.type === 'textarea' ? 'textarea' : 'text',
        style_variant: style.style_variant,
        text_size: style.text_size,
        text_align: style.text_align,
        visible: definition.visible !== false,
        layout_variant: definition.layout_variant || 'default',
        active: values.active,
        updated_by: session.user.id
      });
      setFeedback(adminCopy(lang, 'Contenuto salvato.', 'Content saved.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Contenuto non salvato.', 'Content not saved.'));
    }
  }

  return (
    <section className={compactHeader ? "admin-subpage" : "admin-page"}>
      {!compactHeader && (
        <div className="admin-page-header">
          <div>
            <span className="kicker">{adminCopy(lang, 'Testi sito', 'Site texts')}</span>
            <h1>{adminCopy(lang, 'Contenuti', 'Content')}</h1>
            <p>{adminCopy(lang, 'Modifica testi pubblici in italiano e inglese senza cambiare codice. Se un campo resta vuoto, il sito usa il fallback statico.', 'Edit public Italian and English copy without changing code. Empty fields fall back to static defaults.')}</p>
          </div>
          <button className="button secondary" type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
        </div>
      )}
      {compactHeader && <div className="admin-subpage-actions"><button className="button secondary" type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna testi', 'Refresh text')}</button></div>}
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      <div className="admin-filter-bar content-filter-bar">
        <select value={section} onChange={(event) => setSection(event.target.value)} aria-label={adminCopy(lang, 'Sezione', 'Section')}>
          {sections.map((value) => <option key={value} value={value}>{value === 'all' ? adminCopy(lang, 'Tutte le sezioni', 'All sections') : value}</option>)}
        </select>
      </div>
      {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : (
        <div className="content-admin-grid">
          {visible.map((item) => <ContentEditorCard key={item.key} item={item} lang={lang} onSave={save} />)}
        </div>
      )}
    </section>
  );
}

function ContentEditorCard({ item, lang, onSave }) {
  const [form, setForm] = useState({ value_it: item.value_it ?? item.default_it ?? '', value_en: item.value_en ?? item.default_en ?? '', active: item.active !== false });
  useEffect(() => {
    setForm({ value_it: item.value_it ?? item.default_it ?? '', value_en: item.value_en ?? item.default_en ?? '', active: item.active !== false });
  }, [item.key, item.value_it, item.value_en, item.active]);
  const Field = item.type === 'textarea' || item.content_type === 'textarea' ? 'textarea' : 'input';
  return (
    <article className="content-admin-card">
      <div>
        <span className="micro-label">{item.section} · {item.key}</span>
        <h3>{lang === 'it' ? item.label_it : item.label_en}</h3>
      </div>
      <label className="admin-field full"><span>Italiano</span><Field rows={4} value={form.value_it} onChange={(event) => setForm((current) => ({ ...current, value_it: event.target.value }))} /></label>
      <label className="admin-field full"><span>English</span><Field rows={4} value={form.value_en} onChange={(event) => setForm((current) => ({ ...current, value_en: event.target.value }))} /></label>
      <p className="small-note">{adminCopy(lang, 'Fallback IT', 'Fallback IT')}: {item.default_it || '—'}<br />{adminCopy(lang, 'Fallback EN', 'Fallback EN')}: {item.default_en || '—'}</p>
      <label className="check-field"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> {adminCopy(lang, 'Attivo', 'Active')}</label>
      <div className="request-actions">
        <button className="button primary" type="button" onClick={() => onSave(item, form)}>{adminCopy(lang, 'Salva', 'Save')}</button>
        <button className="button secondary" type="button" onClick={() => setForm({ value_it: item.default_it || '', value_en: item.default_en || '', active: true })}>{adminCopy(lang, 'Ripristina fallback', 'Restore fallback')}</button>
      </div>
      {item.updated_at && <p className="small-note">{adminCopy(lang, 'Ultimo aggiornamento', 'Last updated')}: {formatDateForMessage(String(item.updated_at).slice(0, 10), lang)}</p>}
    </article>
  );
}

const FINANCE_CATEGORIES = {
  income: [
    ['booking_payment', 'Pagamento prenotazione', 'Booking payment'],
    ['deposit', 'Acconto', 'Deposit'],
    ['balance_payment', 'Saldo', 'Balance payment'],
    ['private_experience', 'Esperienza privata', 'Private experience'],
    ['fixed_excursion', 'Escursione fissa', 'Fixed excursion'],
    ['other_income', 'Altra entrata', 'Other income']
  ],
  expense: [
    ['fuel', 'Carburante', 'Fuel'],
    ['equipment', 'Attrezzatura', 'Equipment'],
    ['guide_cost', 'Costo guida', 'Guide cost'],
    ['transport', 'Trasporto', 'Transport'],
    ['food_supplies', 'Cibo / forniture', 'Food / supplies'],
    ['marketing', 'Marketing', 'Marketing'],
    ['maintenance', 'Manutenzione', 'Maintenance'],
    ['permits', 'Permessi', 'Permits'],
    ['other_expense', 'Altra spesa', 'Other expense']
  ]
};

const FINANCE_DATE_FILTERS = [
  ['all', 'Tutte le date', 'All dates'],
  ['specific-date', 'Data specifica', 'Specific date'],
  ['specific-month', 'Mese specifico', 'Specific month'],
  ['last-month', 'Mese scorso', 'Last month'],
  ['next-month', 'Mese prossimo', 'Next month'],
  ['last-3-months', 'Ultimi 3 mesi', 'Last 3 months'],
  ['next-3-months', 'Prossimi 3 mesi', 'Next 3 months'],
  ['last-6-months', 'Ultimi 6 mesi', 'Last 6 months'],
  ['next-6-months', 'Prossimi 6 mesi', 'Next 6 months'],
  ['last-year', 'Anno scorso', 'Last year'],
  ['current-year', 'Anno corrente', 'Current year'],
  ['next-year', 'Anno prossimo', 'Next year'],
  ['custom', 'Intervallo personalizzato', 'Custom range']
];

function financeCategoryLabel(value, lang) {
  const found = [...FINANCE_CATEGORIES.income, ...FINANCE_CATEGORIES.expense].find(([key]) => key === value);
  return found ? (lang === 'it' ? found[1] : found[2]) : value || '-';
}

function financeDateFilterLabel(value, lang) {
  const found = FINANCE_DATE_FILTERS.find(([key]) => key === value);
  return found ? (lang === 'it' ? found[1] : found[2]) : value || '';
}

function formatMoney(amount, currency = 'EUR') {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: currency || 'EUR' }).format(Number(amount || 0));
}

function parseLocalIsoDate(value) {
  const clean = String(value || '').trim();
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

function monthValueFromDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function firstDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function lastDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0);
}

function addMonthsDate(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
}

function financeRangeLabel(startDate, endDate, lang, fallback = '') {
  if (!startDate && !endDate) return fallback || adminCopy(lang, 'Tutte le date', 'All dates');
  if (startDate && endDate && startDate === endDate) return formatDateForMessage(startDate, lang);
  if (startDate && endDate) return `${formatDateForMessage(startDate, lang)} – ${formatDateForMessage(endDate, lang)}`;
  if (startDate) return `${adminCopy(lang, 'Da', 'From')} ${formatDateForMessage(startDate, lang)}`;
  return `${adminCopy(lang, 'Fino a', 'Until')} ${formatDateForMessage(endDate, lang)}`;
}

function resolveFinanceDateRange(filters, lang) {
  const mode = filters.dateMode || 'all';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const isoRange = (start, end, fallback = '') => {
    const startDate = start ? dateToIso(start) : '';
    const endDate = end ? dateToIso(end) : '';
    return { startDate, endDate, label: financeRangeLabel(startDate, endDate, lang, fallback) };
  };

  if (mode === 'specific-date') {
    const date = parseLocalIsoDate(filters.specificDate);
    return date ? isoRange(date, date) : { startDate: '', endDate: '', label: adminCopy(lang, 'Scegli una data', 'Choose a date') };
  }

  if (mode === 'specific-month') {
    const [year, month] = String(filters.specificMonth || '').split('-').map(Number);
    if (!year || !month) return { startDate: '', endDate: '', label: adminCopy(lang, 'Scegli un mese', 'Choose a month') };
    const start = new Date(year, month - 1, 1, 12, 0, 0, 0);
    const end = lastDayOfMonth(start);
    return isoRange(start, end, monthLabel(start, lang));
  }

  if (mode === 'last-month') {
    const month = addMonthsDate(today, -1);
    return isoRange(firstDayOfMonth(month), lastDayOfMonth(month), monthLabel(month, lang));
  }

  if (mode === 'next-month') {
    const month = addMonthsDate(today, 1);
    return isoRange(firstDayOfMonth(month), lastDayOfMonth(month), monthLabel(month, lang));
  }

  if (mode === 'last-3-months') {
    return isoRange(firstDayOfMonth(addMonthsDate(today, -2)), lastDayOfMonth(today));
  }

  if (mode === 'next-3-months') {
    return isoRange(firstDayOfMonth(today), lastDayOfMonth(addMonthsDate(today, 2)));
  }

  if (mode === 'last-6-months') {
    return isoRange(firstDayOfMonth(addMonthsDate(today, -5)), lastDayOfMonth(today));
  }

  if (mode === 'next-6-months') {
    return isoRange(firstDayOfMonth(today), lastDayOfMonth(addMonthsDate(today, 5)));
  }

  if (mode === 'last-year') {
    const year = today.getFullYear() - 1;
    return isoRange(new Date(year, 0, 1, 12, 0, 0, 0), new Date(year, 11, 31, 12, 0, 0, 0), String(year));
  }

  if (mode === 'current-year') {
    const year = today.getFullYear();
    return isoRange(new Date(year, 0, 1, 12, 0, 0, 0), new Date(year, 11, 31, 12, 0, 0, 0), String(year));
  }

  if (mode === 'next-year') {
    const year = today.getFullYear() + 1;
    return isoRange(new Date(year, 0, 1, 12, 0, 0, 0), new Date(year, 11, 31, 12, 0, 0, 0), String(year));
  }

  if (mode === 'custom') {
    return {
      startDate: filters.fromDate || '',
      endDate: filters.toDate || '',
      label: financeRangeLabel(filters.fromDate || '', filters.toDate || '', lang, adminCopy(lang, 'Intervallo personalizzato', 'Custom range'))
    };
  }

  return { startDate: '', endDate: '', label: adminCopy(lang, 'Tutte le date', 'All dates') };
}

function financeEntryIsLinked(entry) {
  return Boolean(entry.booking_request_id || entry.fixed_excursion_id || entry.leaflet_id || entry.linkedBooking || entry.linkedFixedExcursion || entry.linkedLeaflet);
}

function financeEntryCustomerName(entry) {
  return entry?.linkedBooking?.customer_name || '';
}

function enrichFinanceEntry(entry, { requestById, fixedById, leafletById }) {
  const linkedBooking = entry.booking_request_id ? requestById.get(entry.booking_request_id) || null : null;
  const fixedId = entry.fixed_excursion_id || linkedBooking?.fixed_excursion_id || '';
  const linkedFixedExcursion = fixedId ? fixedById.get(fixedId) || linkedBooking?.fixed_excursion || null : null;
  const linkedLeaflet = entry.leaflet_id ? leafletById.get(entry.leaflet_id) || null : null;
  return {
    ...entry,
    linkedBooking,
    linkedFixedExcursion,
    linkedLeaflet,
    isLinked: Boolean(linkedBooking || linkedFixedExcursion || linkedLeaflet || entry.booking_request_id || entry.fixed_excursion_id || entry.leaflet_id)
  };
}

function groupFinanceEntriesByCategory(entries, type) {
  const filtered = entries.filter((entry) => entry.type === type);
  const total = filtered.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const map = new Map();
  filtered.forEach((entry) => {
    const key = entry.category || (type === 'income' ? 'other_income' : 'other_expense');
    const current = map.get(key) || { key, type, entries: [], total: 0 };
    current.entries.push(entry);
    current.total += Number(entry.amount || 0);
    map.set(key, current);
  });
  return [...map.values()]
    .sort((a, b) => b.total - a.total)
    .map((item) => ({ ...item, percentage: total > 0 ? Math.round((item.total / total) * 100) : 0 }));
}

function calculateFinanceSummary(entries) {
  const incomeEntries = entries.filter((entry) => entry.type === 'income');
  const expenseEntries = entries.filter((entry) => entry.type === 'expense');
  const linkedBookingEntries = entries.filter((entry) => entry.booking_request_id || entry.linkedBooking);
  const linkedFixedEntries = entries.filter((entry) => entry.fixed_excursion_id || entry.linkedFixedExcursion);
  const unlinkedEntries = entries.filter((entry) => !financeEntryIsLinked(entry));
  const income = incomeEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const expenses = expenseEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  return {
    income,
    expenses,
    net: income - expenses,
    incomeEntries,
    expenseEntries,
    linkedBookingEntries,
    linkedFixedEntries,
    unlinkedEntries,
    incomeCategories: groupFinanceEntriesByCategory(entries, 'income'),
    expenseCategories: groupFinanceEntriesByCategory(entries, 'expense')
  };
}

const ANALYTICS_PERIODS = [
  ['today', { it: 'Oggi', en: 'Today' }],
  ['7d', { it: 'Ultimi 7 giorni', en: 'Last 7 days' }],
  ['30d', { it: 'Ultimi 30 giorni', en: 'Last 30 days' }],
  ['90d', { it: 'Ultimi 90 giorni', en: 'Last 90 days' }],
  ['all', { it: 'Tutte le date', en: 'All dates' }]
];

function analyticsPeriodLabel(key, lang) {
  return ANALYTICS_PERIODS.find(([value]) => value === key)?.[1]?.[lang] || key;
}

function analyticsDateRange(period) {
  if (period === 'all') return { from: '', to: '', label: 'All dates' };
  const now = new Date();
  const start = new Date(now);
  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
  } else {
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    start.setDate(now.getDate() - days + 1);
    start.setHours(0, 0, 0, 0);
  }
  return { from: start.toISOString(), to: now.toISOString() };
}

function valueOrUnknown(value, lang) {
  const clean = String(value || '').trim();
  return clean || adminCopy(lang, 'Non disponibile', 'Unknown');
}

function eventCount(events, name) {
  return events.filter((event) => event.event_name === name).length;
}


const SUBMIT_ATTEMPT_EVENTS = ['booking_form_submit_attempt', 'booking_submit_attempt'];
const VALIDATION_ERROR_EVENTS = ['booking_form_validation_error', 'booking_submit_validation_error'];
const SUBMIT_SUCCESS_EVENTS = ['booking_form_submit_success', 'booking_submit_success', 'booking_submit'];
const SUBMIT_ERROR_EVENTS = ['booking_form_submit_error', 'booking_submit_error'];
const MAP_CLICK_EVENTS = ['google_maps_click', 'maps_click'];
const CONTACT_ACTION_EVENTS = ['whatsapp_click', 'email_click', 'phone_click', 'google_maps_click', 'maps_click'];

function eventCountAny(events, names = []) {
  const preferred = names[0];
  const preferredCount = preferred ? eventCount(events, preferred) : 0;
  if (preferredCount) return preferredCount;
  return events.filter((event) => names.includes(event.event_name)).length;
}

function isEventName(event, names = []) {
  return names.includes(event?.event_name);
}

function normalizeAnalyticsPath(path = '') {
  const clean = `/${String(path || '/').split('?')[0]}`.replace(/\/{2,}/g, '/');
  return clean === '//' ? '/' : clean;
}

function isInternalAnalyticsRow(row = {}) {
  const path = normalizeAnalyticsPath(row.path || row.entry_path || row.exit_path || '');
  const section = String(row.section || row.metadata?.source_section || '').toLowerCase();
  if (path.startsWith('/admin') || path.startsWith('/api/')) return true;
  if (path === '/api/analytics/event') return true;
  if (section.includes('admin') || section.includes('finance') || section.includes('analytics') || section.includes('cms') || section.includes('editor')) return true;
  if (row.metadata?.cta_location === 'admin_preview_excluded') return true;
  return false;
}

function normalizedTrafficSourceForAnalytics(row = {}) {
  const metadata = row.metadata || {};
  const raw = String(metadata.utm_source || row.traffic_source || row.referrer_domain || '').toLowerCase();
  const medium = String(metadata.utm_medium || '').toLowerCase();
  if (raw.includes('instagram') || raw === 'ig') return 'instagram';
  if (raw.includes('whatsapp') || raw === 'wa') return 'whatsapp';
  if (raw.includes('facebook') || raw === 'fb') return 'facebook';
  if (raw.includes('google')) return 'google';
  if (!raw || raw === 'direct') return 'direct';
  if (medium === 'message' && raw.includes('whatsapp')) return 'whatsapp';
  return 'other';
}

function trafficSourceLabel(source, lang) {
  if (source === 'direct') return adminCopy(lang, 'Diretto', 'Direct');
  if (source === 'whatsapp') return adminCopy(lang, 'WhatsApp condiviso', 'WhatsApp share');
  if (source === 'other') return adminCopy(lang, 'Altri referrer', 'Other referrers');
  return source[0].toUpperCase() + source.slice(1);
}

function rawUnknown(value) {
  const clean = String(value || '').trim();
  return clean || 'unknown';
}

function uniqueCount(rows, key = 'visitor_id') {
  return new Set((rows || []).map((row) => row?.[key]).filter(Boolean)).size;
}

function percent(numerator, denominator) {
  if (!denominator) return '—';
  return `${Math.round((numerator / denominator) * 1000) / 10}%`;
}

function formatDuration(seconds) {
  const value = Math.round(Number(seconds || 0));
  if (!value) return '—';
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  const remaining = value % 60;
  return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function rowPercent(count, total) {
  return total ? `${Math.round((Number(count || 0) / total) * 100)}%` : '0%';
}

function topRows(rows, getKey, limit = 6, lang = 'it') {
  const counts = new Map();
  rows.forEach((row) => {
    const key = valueOrUnknown(getKey(row), lang);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function periodContains(row, range) {
  if (!range?.from && !range?.to) return true;
  const raw = row?.created_at || row?.occurred_at || row?.started_at;
  if (!raw) return false;
  const time = new Date(raw).getTime();
  if (Number.isNaN(time)) return false;
  if (range.from && time < new Date(range.from).getTime()) return false;
  if (range.to && time > new Date(range.to).getTime()) return false;
  return true;
}

function averageEngagementSeconds(sessions, events) {
  const durations = (sessions || [])
    .map((session) => Math.min(1800, Number(session.duration_seconds || 0)))
    .filter((seconds) => seconds >= 2);
  if (durations.length) return durations.reduce((sum, value) => sum + value, 0) / durations.length;

  const grouped = new Map();
  (events || []).forEach((event) => {
    if (!event.session_id || !event.occurred_at) return;
    const time = new Date(event.occurred_at).getTime();
    if (Number.isNaN(time)) return;
    const current = grouped.get(event.session_id) || { min: time, max: time };
    current.min = Math.min(current.min, time);
    current.max = Math.max(current.max, time);
    grouped.set(event.session_id, current);
  });
  const derived = [...grouped.values()]
    .map((item) => Math.min(1800, Math.round((item.max - item.min) / 1000)))
    .filter((seconds) => seconds >= 2);
  if (!derived.length) return 0;
  return derived.reduce((sum, value) => sum + value, 0) / derived.length;
}

function eventMeta(event, key) {
  return event?.metadata && Object.prototype.hasOwnProperty.call(event.metadata, key) ? event.metadata[key] : '';
}

function normalizedExperienceKey(value, lang) {
  const clean = String(value || '').trim();
  if (!clean || clean === 'unknown' || clean === 'unsure') return adminCopy(lang, 'Non specificata', 'Unspecified');
  return clean;
}

function eventExperienceKey(event, lang) {
  const key = eventMeta(event, 'experience_slug') || eventMeta(event, 'experience_id') || eventMeta(event, 'experience') || eventMeta(event, 'slug');
  if (key) return normalizedExperienceKey(key, lang);
  const requestType = String(eventMeta(event, 'request_type') || '').trim();
  if (['private', 'fixed', 'contact'].includes(requestType)) return requestType;
  return normalizedExperienceKey('', lang);
}

function requestExperienceKeyFromRequest(request, lang) {
  const key = request?.experience_slug || request?.experience_id || '';
  if (key && key !== 'unsure') return normalizedExperienceKey(key, lang);
  return normalizedExperienceKey(request?.request_type || '', lang);
}

function displayExperienceLabel(key, lang) {
  if (!key || key === adminCopy(lang, 'Non specificata', 'Unspecified')) return key || adminCopy(lang, 'Non specificata', 'Unspecified');
  const raw = String(key);
  if (raw === 'private') return adminCopy(lang, 'Privata', 'Private');
  if (raw === 'fixed') return adminCopy(lang, 'Escursione fissa', 'Fixed scheduled excursion');
  if (raw === 'contact') return adminCopy(lang, 'Contatto generico', 'Generic contact');
  const known = experiences.find((experience) => experience.id === raw || experience.slug === raw || experience.title === raw);
  return known ? known.title : raw.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function analyticsDropoff(current, previous, lang) {
  if (!previous) return '—';
  const rate = Math.max(0, 1 - (Number(current || 0) / Number(previous || 0)));
  return `${Math.round(rate * 1000) / 10}%`;
}

function groupKey(...parts) {
  return parts.map((part) => String(part || 'unknown').trim() || 'unknown').join('||');
}

function browserDeviceGroup(row) {
  const os = String(row?.operating_system || '').toLowerCase();
  const browser = String(row?.browser || '').toLowerCase();
  const device = String(row?.device_type || '').toLowerCase();
  if (os.includes('ios') && browser.includes('safari')) return 'iOS Safari';
  if (os.includes('android') && browser.includes('chrome')) return 'Android Chrome';
  if (device === 'desktop' && browser.includes('chrome')) return 'Desktop Chrome';
  return 'Other';
}

function sectionLabelForPath(event, lang) {
  const section = String(event?.section || '').trim();
  if (section) return section[0].toUpperCase() + section.slice(1);
  const path = String(event?.path || '').toLowerCase();
  if (path.includes('experience')) return adminCopy(lang, 'Esperienze', 'Experiences');
  if (path.includes('contact')) return adminCopy(lang, 'Contatti', 'Contact');
  if (path.includes('review')) return adminCopy(lang, 'Recensioni', 'Reviews');
  if (path === '/' || path.includes('#top')) return 'Home';
  return adminCopy(lang, 'Sconosciuto', 'Unknown');
}

function actionLabelForEvent(event, lang) {
  const name = event?.event_name;
  if (name === 'whatsapp_click') return 'WhatsApp';
  if (name === 'email_click') return 'Email';
  if (name === 'phone_click') return adminCopy(lang, 'Telefono', 'Phone');
  if (name === 'google_maps_click' || name === 'maps_click') return 'Google Maps';
  if (name === 'booking_form_open') return adminCopy(lang, 'Modulo', 'Booking form');
  if (name === 'booking_form_submit_success' || name === 'booking_submit_success' || name === 'booking_submit') return adminCopy(lang, 'Invio riuscito', 'Submit success');
  return sectionLabelForPath(event, lang);
}

function buildSessionPaths(events, lang) {
  const grouped = new Map();
  (events || []).forEach((event) => {
    if (!event.session_id) return;
    const list = grouped.get(event.session_id) || [];
    list.push(event);
    grouped.set(event.session_id, list);
  });
  const pathCounts = new Map();
  grouped.forEach((list) => {
    const ordered = list.slice().sort((a, b) => new Date(a.occurred_at || 0) - new Date(b.occurred_at || 0));
    const labels = [];
    ordered.forEach((event) => {
      const isAction = ['whatsapp_click', 'email_click', 'phone_click', 'google_maps_click', 'maps_click', 'booking_form_open', 'booking_form_submit_success', 'booking_submit_success', 'booking_submit'].includes(event.event_name);
      if (event.event_name !== 'page_view' && !isAction) return;
      const label = isAction ? actionLabelForEvent(event, lang) : sectionLabelForPath(event, lang);
      if (labels[labels.length - 1] !== label) labels.push(label);
    });
    if (!labels.length) return;
    const path = labels.slice(0, 6).join(' → ');
    const current = pathCounts.get(path) || { path, sessions: 0, contact_actions: 0, booking_form_opens: 0 };
    current.sessions += 1;
    current.contact_actions += ordered.filter((event) => ['whatsapp_click', 'email_click', 'phone_click'].includes(event.event_name)).length;
    current.booking_form_opens += ordered.filter((event) => event.event_name === 'booking_form_open').length;
    pathCounts.set(path, current);
  });
  return [...pathCounts.values()].sort((a, b) => b.sessions - a.sessions || b.contact_actions - a.contact_actions).slice(0, 5);
}

function bookingRequestsInPeriod(requests, range) {
  return (requests || []).filter((request) => {
    const source = request.source || 'unknown';
    return periodContains(request, range) && (source === 'website' || source === 'unknown' || !source);
  }).length;
}

function confirmedBookingRequestsInPeriod(requests, range) {
  return (requests || []).filter((request) => periodContains(request, range) && ['accepted', 'confirmed', 'completed'].includes(request.status)).length;
}


function buildDeclaredAttributionRows({ events = [], bookingRequests = [], range, lang }) {
  const map = new Map();
  function ensure(source) {
    const normalized = normalizeHeardAboutUs(source, { allowAdmin: true });
    const key = normalized || 'missing';
    const row = map.get(key) || {
      key,
      source: key === 'missing' ? adminCopy(lang, 'Non disponibile', 'Not available') : heardAboutUsLabel(key, lang),
      booking_requests: 0,
      confirmed_bookings: 0,
      contact_events: 0,
      form_events: 0,
      detail_values: new Set()
    };
    map.set(key, row);
    return row;
  }

  function addDetail(row, detail) {
    const clean = cleanHeardAboutUsDetail(detail);
    if (clean && row.detail_values.size < 5) row.detail_values.add(clean);
  }

  (bookingRequests || []).filter((request) => periodContains(request, range)).forEach((request) => {
    const row = ensure(request.heard_about_us);
    row.booking_requests += 1;
    addDetail(row, request.heard_about_us_detail);
    if (['accepted', 'confirmed', 'completed'].includes(request.status)) row.confirmed_bookings += 1;
  });

  (events || []).forEach((event) => {
    const source = eventMeta(event, 'heard_about_us');
    if (!source) return;
    const row = ensure(source);
    addDetail(row, eventMeta(event, 'heard_about_us_detail'));
    if (['whatsapp_click', 'email_click', 'phone_click'].includes(event.event_name)) row.contact_events += 1;
    if (['booking_form_field_start', 'booking_form_submit_attempt', 'booking_form_submit_success', 'booking_request_created'].includes(event.event_name)) row.form_events += 1;
  });

  return [...map.values()]
    .filter((row) => row.booking_requests || row.confirmed_bookings || row.contact_events || row.form_events)
    .map((row) => ({ ...row, details: row.detail_values.size ? [...row.detail_values].join(' · ') : '—', detail_values: undefined }))
    .sort((a, b) => (b.booking_requests + b.contact_events + b.form_events) - (a.booking_requests + a.contact_events + a.form_events));
}

function buildAnalyticsModel({ events: inputEvents = [], sessions: inputSessions = [], bookingRequests = [], range, lang }) {
  const rawEvents = inputEvents || [];
  const rawSessions = inputSessions || [];
  const internalEventsExcluded = rawEvents.filter(isInternalAnalyticsRow).length;
  const internalSessionsExcluded = rawSessions.filter(isInternalAnalyticsRow).length;
  const events = rawEvents.filter((event) => !isInternalAnalyticsRow(event));
  const sessions = rawSessions.filter((session) => !isInternalAnalyticsRow(session));
  const pageViews = eventCount(events, 'page_view');
  const formOpens = eventCount(events, 'booking_form_open');
  const fieldStarts = eventCount(events, 'booking_form_field_start');
  const hasNewSubmitAttempts = eventCount(events, 'booking_form_submit_attempt') > 0;
  const hasNewValidationErrors = eventCount(events, 'booking_form_validation_error') > 0;
  const hasNewSubmitSuccesses = eventCount(events, 'booking_form_submit_success') > 0;
  const hasNewSubmitErrors = eventCount(events, 'booking_form_submit_error') > 0;
  const hasNewMapClicks = eventCount(events, 'google_maps_click') > 0;
  const submitAttempts = eventCountAny(events, SUBMIT_ATTEMPT_EVENTS);
  const validationErrors = eventCountAny(events, VALIDATION_ERROR_EVENTS);
  const submitSuccesses = eventCountAny(events, SUBMIT_SUCCESS_EVENTS);
  const submitErrors = eventCountAny(events, SUBMIT_ERROR_EVENTS);
  const bookingRequestCreatedEvents = eventCount(events, 'booking_request_created');
  const websiteRequestRows = (bookingRequests || []).filter((request) => {
    const source = request.source || 'unknown';
    return periodContains(request, range) && (source === 'website' || source === 'unknown' || !source);
  });
  const websiteRequests = websiteRequestRows.length;
  const bookingRequestCount = Math.max(websiteRequests, bookingRequestCreatedEvents, submitSuccesses);
  const confirmedRequests = confirmedBookingRequestsInPeriod(bookingRequests, range);
  const visitors = uniqueCount(events, 'visitor_id') || uniqueCount(sessions, 'visitor_id');
  const whatsappClicks = eventCount(events, 'whatsapp_click');
  const emailClicks = eventCount(events, 'email_click');
  const phoneClicks = eventCount(events, 'phone_click');
  const mapsClicks = eventCountAny(events, MAP_CLICK_EVENTS);
  const contactClicks = whatsappClicks + emailClicks + phoneClicks;
  const conversionBase = visitors || pageViews;
  const averageSeconds = averageEngagementSeconds(sessions, events);
  const pageViewEvents = events.filter((event) => event.event_name === 'page_view');
  const experienceViews = eventCount(events, 'experience_card_view') + eventCount(events, 'excursion_view') + eventCount(events, 'experience_detail_open');
  const sourceTotal = pageViewEvents.length || events.length || 1;
  const directTrafficCount = pageViewEvents.filter((event) => normalizedTrafficSourceForAnalytics(event) === 'direct').length;
  const directTrafficShare = sourceTotal ? directTrafficCount / sourceTotal : 0;
  const mobileCount = events.filter((event) => event.device_type === 'mobile').length;
  const mobileShare = events.length ? mobileCount / events.length : 0;

  function isSubmitAttemptEvent(event) { return event.event_name === 'booking_form_submit_attempt' || (!hasNewSubmitAttempts && event.event_name === 'booking_submit_attempt'); }
  function isValidationErrorEvent(event) { return event.event_name === 'booking_form_validation_error' || (!hasNewValidationErrors && event.event_name === 'booking_submit_validation_error'); }
  function isSubmitSuccessEvent(event) { return event.event_name === 'booking_form_submit_success' || (!hasNewSubmitSuccesses && ['booking_submit_success', 'booking_submit'].includes(event.event_name)); }
  function isSubmitErrorEvent(event) { return event.event_name === 'booking_form_submit_error' || (!hasNewSubmitErrors && event.event_name === 'booking_submit_error'); }
  function isMapClickEvent(event) { return event.event_name === 'google_maps_click' || (!hasNewMapClicks && event.event_name === 'maps_click'); }

  const sourceRows = ['direct', 'instagram', 'whatsapp', 'google', 'facebook', 'other'].map((source) => ({
    label: trafficSourceLabel(source, lang),
    count: pageViewEvents.filter((event) => normalizedTrafficSourceForAnalytics(event) === source).length
  }));
  const countryRows = topRows(events, (event) => event.country_name || event.country_code, 6, lang);
  const cityRows = topRows(events, (event) => event.city, 6, lang);
  const topPageRows = topRows(pageViewEvents, (event) => normalizeAnalyticsPath(event.section || event.path), 7, lang);
  const experienceRows = topRows(events.filter((event) => ['experience_card_view', 'excursion_view', 'experience_detail_open'].includes(event.event_name)), (event) => event.metadata?.experience_slug || event.metadata?.experience_id || event.metadata?.experience || event.metadata?.slug, 6, lang);
  const deviceRows = topRows(events, (event) => event.device_type, 5, lang);
  const browserRows = topRows(events, (event) => event.browser, 5, lang);
  const osRows = topRows(events, (event) => event.operating_system, 5, lang);
  const languageRows = [
    { label: adminCopy(lang, 'Azioni in italiano', 'Italian visitors/actions'), count: events.filter((event) => event.language === 'it').length, helper: uniqueCount(events.filter((event) => event.language === 'it'), 'visitor_id') },
    { label: adminCopy(lang, 'Azioni in inglese', 'English visitors/actions'), count: events.filter((event) => event.language === 'en').length, helper: uniqueCount(events.filter((event) => event.language === 'en'), 'visitor_id') },
    { label: adminCopy(lang, 'Cambi lingua', 'Language switches'), count: eventCount(events, 'language_switch') }
  ];
  const flowRows = [
    { label: adminCopy(lang, 'Visualizzazioni pagina', 'Page views'), count: pageViews },
    { label: adminCopy(lang, 'Visualizzazioni esperienze', 'Experience views'), count: experienceViews },
    { label: adminCopy(lang, 'Aperture modulo prenotazione', 'Booking form starts'), count: formOpens },
    { label: adminCopy(lang, 'Avvii compilazione modulo', 'Booking form field starts'), count: fieldStarts },
    { label: adminCopy(lang, 'Tentativi invio modulo', 'Booking form submit attempts'), count: submitAttempts },
    { label: adminCopy(lang, 'Invii riusciti tracciati', 'Tracked successful submissions'), count: submitSuccesses },
    { label: adminCopy(lang, 'Richieste create', 'Created requests'), count: bookingRequestCount },
    { label: adminCopy(lang, 'Click WhatsApp', 'WhatsApp clicks'), count: whatsappClicks },
    { label: adminCopy(lang, 'Click email', 'Email clicks'), count: emailClicks },
    { label: adminCopy(lang, 'Click telefono', 'Phone clicks'), count: phoneClicks },
    { label: adminCopy(lang, 'Click Google Maps', 'Google Maps clicks'), count: mapsClicks }
  ];

  const mainFunnelSteps = [
    { label: adminCopy(lang, 'Visualizzazioni pagina', 'Page views'), count: pageViews },
    { label: adminCopy(lang, 'Visualizzazioni esperienze', 'Experience views'), count: experienceViews },
    { label: adminCopy(lang, 'Aperture modulo prenotazione', 'Booking form opens'), count: formOpens },
    { label: adminCopy(lang, 'Avvii compilazione', 'Field starts'), count: fieldStarts },
    { label: adminCopy(lang, 'Tentativi invio modulo', 'Form submit attempts'), count: submitAttempts },
    { label: adminCopy(lang, 'Errori validazione', 'Validation errors'), count: validationErrors },
    { label: adminCopy(lang, 'Invii riusciti tracciati', 'Tracked successful submissions'), count: submitSuccesses },
    { label: adminCopy(lang, 'Errori invio', 'Submit errors'), count: submitErrors },
    { label: adminCopy(lang, 'Richieste create', 'Booking requests created'), count: bookingRequestCount }
  ];
  const funnelDiagnostics = mainFunnelSteps.map((step, index) => ({
    step: step.label,
    count: step.count,
    dropoff: index === 0 ? '—' : analyticsDropoff(step.count, mainFunnelSteps[index - 1].count, lang)
  })).concat([
    { step: adminCopy(lang, 'Click WhatsApp', 'WhatsApp clicks'), count: whatsappClicks, dropoff: adminCopy(lang, 'Percorso contatto separato', 'Separate contact path') },
    { step: adminCopy(lang, 'Click email', 'Email clicks'), count: emailClicks, dropoff: adminCopy(lang, 'Percorso contatto separato', 'Separate contact path') },
    { step: adminCopy(lang, 'Click telefono', 'Phone clicks'), count: phoneClicks, dropoff: adminCopy(lang, 'Percorso contatto separato', 'Separate contact path') }
  ]);

  const formByExperienceMap = new Map();
  function ensureExperienceRow(key) {
    const normalized = normalizedExperienceKey(key, lang);
    const existing = formByExperienceMap.get(normalized) || {
      experience: displayExperienceLabel(normalized, lang),
      experience_views: 0,
      detail_opens: 0,
      form_opens: 0,
      submit_attempts: 0,
      submit_successes: 0,
      submit_errors: 0,
      booking_requests: 0,
      confirmed_bookings: 0,
      whatsapp_clicks: 0,
      email_clicks: 0,
      phone_clicks: 0,
      view_to_request: '—',
      form_to_request: '—'
    };
    formByExperienceMap.set(normalized, existing);
    return existing;
  }
  events.forEach((event) => {
    const key = eventExperienceKey(event, lang);
    const row = ensureExperienceRow(key);
    if (['experience_card_view', 'excursion_view'].includes(event.event_name)) row.experience_views += 1;
    if (event.event_name === 'experience_detail_open') row.detail_opens += 1;
    if (event.event_name === 'booking_form_open') row.form_opens += 1;
    if (isSubmitAttemptEvent(event)) row.submit_attempts += 1;
    if (isSubmitSuccessEvent(event)) row.submit_successes += 1;
    if (isSubmitErrorEvent(event)) row.submit_errors += 1;
    if (event.event_name === 'booking_request_created') row.booking_requests += 1;
    if (event.event_name === 'whatsapp_click') row.whatsapp_clicks += 1;
    if (event.event_name === 'email_click') row.email_clicks += 1;
    if (event.event_name === 'phone_click') row.phone_clicks += 1;
  });
  websiteRequestRows.forEach((request) => {
    const row = ensureExperienceRow(requestExperienceKeyFromRequest(request, lang));
    row.booking_requests += 1;
    if (['accepted', 'confirmed', 'completed'].includes(request.status)) row.confirmed_bookings += 1;
  });
  const formByExperience = [...formByExperienceMap.values()]
    .map((row) => ({
      ...row,
      view_to_request: percent(row.booking_requests, row.experience_views || row.detail_opens),
      form_to_request: percent(row.booking_requests, row.form_opens)
    }))
    .filter((row) => row.experience_views || row.detail_opens || row.form_opens || row.submit_attempts || row.submit_successes || row.booking_requests || row.whatsapp_clicks || row.email_clicks || row.phone_clicks)
    .sort((a, b) => (b.booking_requests + b.form_opens + b.whatsapp_clicks + b.email_clicks + b.phone_clicks) - (a.booking_requests + a.form_opens + a.whatsapp_clicks + a.email_clicks + a.phone_clicks))
    .slice(0, 14);

  const requestsWithoutTrackedFormOpen = formByExperience.filter((row) => row.booking_requests > 0 && row.form_opens === 0).map((row) => ({ experience: row.experience, booking_requests: row.booking_requests }));
  const formOpenMissingCtaCount = events.filter((event) => event.event_name === 'booking_form_open' && !eventMeta(event, 'cta_location') && !eventMeta(event, 'location')).length;

  const contactMap = new Map();
  events.filter((event) => CONTACT_ACTION_EVENTS.includes(event.event_name) || event.event_name === 'booking_form_open').forEach((event) => {
    const actionType = event.event_name === 'booking_form_open' ? adminCopy(lang, 'Modulo richiesta', 'Booking form')
      : event.event_name === 'whatsapp_click' ? 'WhatsApp'
        : event.event_name === 'email_click' ? 'Email'
          : event.event_name === 'phone_click' ? adminCopy(lang, 'Telefono', 'Phone')
            : 'Google Maps';
    if (event.event_name === 'maps_click' && hasNewMapClicks) return;
    const location = rawUnknown(eventMeta(event, 'cta_location') || eventMeta(event, 'location'));
    const device = rawUnknown(event.device_type);
    const language = String(event.language || '').toUpperCase() || 'unknown';
    const previous = rawUnknown(eventMeta(event, 'top_previous_section') || eventMeta(event, 'previous_section') || event.section);
    const key = groupKey(location, actionType, device, language, previous);
    const row = contactMap.get(key) || { cta_location: location, action_type: actionType, count: 0, device, language, top_previous_section: previous };
    row.count += 1;
    contactMap.set(key, row);
  });
  const contactPaths = [...contactMap.values()].sort((a, b) => b.count - a.count).slice(0, 12);

  const mobileMap = new Map();
  ['iOS Safari', 'Android Chrome', 'Desktop Chrome', 'Other'].forEach((group) => mobileMap.set(group, {
    device_browser: group,
    page_views: 0,
    experience_views: 0,
    detail_opens: 0,
    calendar_date_selections: 0,
    form_opens: 0,
    field_starts: 0,
    submit_attempts: 0,
    validation_errors: 0,
    submit_successes: 0,
    submit_errors: 0,
    booking_requests: 0,
    whatsapp_clicks: 0,
    email_clicks: 0,
    phone_clicks: 0
  }));
  events.forEach((event) => {
    const group = browserDeviceGroup(event);
    const row = mobileMap.get(group) || mobileMap.get('Other');
    if (event.event_name === 'page_view') row.page_views += 1;
    if (['experience_card_view', 'excursion_view'].includes(event.event_name)) row.experience_views += 1;
    if (event.event_name === 'experience_detail_open') row.detail_opens += 1;
    if (event.event_name === 'calendar_date_select') row.calendar_date_selections += 1;
    if (event.event_name === 'booking_form_open') row.form_opens += 1;
    if (event.event_name === 'booking_form_field_start') row.field_starts += 1;
    if (isSubmitAttemptEvent(event)) row.submit_attempts += 1;
    if (isValidationErrorEvent(event)) row.validation_errors += 1;
    if (isSubmitSuccessEvent(event)) row.submit_successes += 1;
    if (isSubmitErrorEvent(event)) row.submit_errors += 1;
    if (event.event_name === 'booking_request_created') row.booking_requests += 1;
    if (event.event_name === 'whatsapp_click') row.whatsapp_clicks += 1;
    if (event.event_name === 'email_click') row.email_clicks += 1;
    if (event.event_name === 'phone_click') row.phone_clicks += 1;
  });
  const mobileFunnel = [...mobileMap.values()].filter((row) => Object.entries(row).some(([key, value]) => key !== 'device_browser' && Number(value) > 0));

  const languageConversion = ['it', 'en'].map((language) => {
    const rows = events.filter((event) => event.language === language);
    return {
      language: language.toUpperCase(),
      actions: rows.length,
      page_views: rows.filter((event) => event.event_name === 'page_view').length,
      form_opens: rows.filter((event) => event.event_name === 'booking_form_open').length,
      submit_attempts: rows.filter(isSubmitAttemptEvent).length,
      submit_successes: rows.filter(isSubmitSuccessEvent).length,
      whatsapp_clicks: rows.filter((event) => event.event_name === 'whatsapp_click').length,
      email_clicks: rows.filter((event) => event.event_name === 'email_click').length,
      language_switches: rows.filter((event) => event.event_name === 'language_switch').length
    };
  });

  const geoMap = new Map();
  events.forEach((event) => {
    const countryCity = [event.country_name || event.country_code, event.city].filter(Boolean).join(' / ') || 'unknown';
    const language = String(event.language || '').toUpperCase() || 'unknown';
    const device = rawUnknown(event.device_type);
    const key = groupKey(countryCity, language, device);
    const row = geoMap.get(key) || { country_city: countryCity, actions: 0, language, form_opens: 0, contact_clicks: 0, device };
    row.actions += 1;
    if (event.event_name === 'booking_form_open') row.form_opens += 1;
    if (['whatsapp_click', 'email_click', 'phone_click'].includes(event.event_name)) row.contact_clicks += 1;
    geoMap.set(key, row);
  });
  const geographyHypotheses = [...geoMap.values()].sort((a, b) => b.actions - a.actions).slice(0, 12);

  const declaredAttributionRows = buildDeclaredAttributionRows({ events, bookingRequests, range, lang });

  const trafficAttributionQuality = ['direct', 'instagram', 'whatsapp', 'google', 'facebook', 'other'].map((source) => ({
    source: trafficSourceLabel(source, lang),
    count: pageViewEvents.filter((event) => normalizedTrafficSourceForAnalytics(event) === source).length,
    notes: source === 'direct'
      ? adminCopy(lang, 'Solo sessioni senza UTM o referrer utile', 'Only sessions with no UTM or useful referrer')
      : source === 'whatsapp'
        ? adminCopy(lang, 'Da utm_source=whatsapp o referrer WhatsApp', 'From utm_source=whatsapp or WhatsApp referrer')
        : source === 'other'
          ? adminCopy(lang, 'Referrer esterni non classificati', 'Unclassified external referrers')
          : adminCopy(lang, 'Da UTM o referrer riconosciuto', 'From recognized UTM or referrer')
  }));

  const dataQualityRows = [
    { check: adminCopy(lang, 'Richieste senza apertura modulo tracciata', 'Requests without tracked form open'), count: requestsWithoutTrackedFormOpen.reduce((sum, row) => sum + row.booking_requests, 0), detail: requestsWithoutTrackedFormOpen.map((row) => `${row.experience}: ${row.booking_requests}`).join(', ') || '—' },
    { check: adminCopy(lang, 'Aperture modulo senza posizione CTA', 'Form opens without CTA location'), count: formOpenMissingCtaCount, detail: formOpenMissingCtaCount ? adminCopy(lang, 'Aggiornare i CTA che non inviano cta_location.', 'Update CTAs that do not send cta_location.') : '—' },
    { check: adminCopy(lang, 'Traffico interno escluso', 'Internal traffic excluded'), count: internalEventsExcluded + internalSessionsExcluded, detail: adminCopy(lang, 'Admin, API, CMS/editor, finanze e dashboard analytics esclusi dalle metriche pubbliche.', 'Admin, API, CMS/editor, finance, and analytics dashboard rows excluded from public metrics.') },
    { check: adminCopy(lang, 'Campione insufficiente per conclusioni marketing', 'Sample too small for marketing conclusions'), count: visitors < 50 ? visitors : 0, detail: visitors < 50 ? adminCopy(lang, 'Usare come diagnostica, non come prova marketing.', 'Use as diagnostics, not as marketing proof.') : '—' }
  ];

  const warnings = [];
  if (visitors < 50) warnings.push(adminCopy(lang, 'Campione dati ridotto: interpreta questi numeri come diagnostica, non come prova statistica.', 'Small data sample: interpret these numbers as diagnostics, not statistical proof.'));
  if (websiteRequests > 0 && submitSuccesses === 0) warnings.push(adminCopy(lang, 'Possibile problema di tracciamento: esistono richieste nel database, ma nessun invio riuscito è stato registrato negli eventi analytics.', 'Possible tracking issue: booking requests exist in the database, but no successful submission was recorded in analytics events.'));
  if (requestsWithoutTrackedFormOpen.length) warnings.push(adminCopy(lang, 'Alcune richieste non hanno una apertura modulo tracciata nella stessa esperienza/tipologia.', 'Some requests have no tracked form open for the same experience/request type.'));
  if (formOpenMissingCtaCount) warnings.push(adminCopy(lang, 'Alcune aperture modulo non hanno cta_location.', 'Some form opens have no cta_location.'));
  if (internalEventsExcluded || internalSessionsExcluded) warnings.push(adminCopy(lang, 'Traffico interno/admin escluso dalle metriche pubbliche.', 'Internal/admin traffic was excluded from public metrics.'));
  if (directTrafficShare > 0.8) warnings.push(adminCopy(lang, 'Attribuzione limitata: gran parte del traffico risulta Diretto. Usa link UTM per leggere meglio le sorgenti.', 'Limited attribution: most traffic appears as Direct. Use UTM links to read sources more accurately.'));
  if (mobileShare > 0.7) warnings.push(adminCopy(lang, 'Il traffico è prevalentemente mobile: testa prima il percorso su iPhone Safari e Android Chrome.', 'Traffic is mostly mobile: test the journey first on iPhone Safari and Android Chrome.'));

  const conversionMetrics = {
    websiteRequestConversion: percent(websiteRequests, conversionBase),
    trackedSubmissionConversion: percent(submitSuccesses, conversionBase),
    contactIntentConversion: percent(websiteRequests + whatsappClicks + emailClicks, conversionBase),
    confirmedBookingConversion: confirmedRequests ? percent(confirmedRequests, conversionBase) : adminCopy(lang, 'Dati insufficienti', 'Insufficient data')
  };

  return {
    visitors,
    pageViews,
    experienceViews,
    formOpens,
    fieldStarts,
    submitAttempts,
    submitSuccesses,
    submitErrors,
    validationErrors,
    bookingRequests: bookingRequestCount,
    websiteRequests,
    confirmedRequests,
    whatsappClicks,
    emailClicks,
    phoneClicks,
    mapsClicks,
    bookingConversion: conversionMetrics.websiteRequestConversion,
    conversionMetrics,
    averageEngagement: averageSeconds ? formatDuration(averageSeconds) : '—',
    countryRows,
    cityRows,
    topPageRows,
    experienceRows,
    sourceRows,
    deviceRows,
    browserRows,
    osRows,
    languageRows,
    flowRows,
    funnelRows: flowRows.slice(0, 7),
    funnelDiagnostics,
    formByExperience,
    requestsWithoutTrackedFormOpen,
    contactPaths,
    mobileFunnel,
    sessionPaths: buildSessionPaths(events, lang),
    languageConversion,
    geographyHypotheses,
    trafficAttributionQuality,
    declaredAttributionRows,
    dataQualityRows,
    warnings,
    lowSampleNote: visitors < 50,
    internalEventsExcluded,
    internalSessionsExcluded,
    directTrafficShare: rowPercent(directTrafficCount, sourceTotal),
    mobileShare: rowPercent(mobileCount, events.length || 1)
  };
}

function AnalyticsRowList({ rows, total, empty, helperLabel }) {
  if (!rows.length || rows.every((row) => !row.count)) return <p className="small-note analytics-empty-row">{empty}</p>;
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 1);
  return (
    <div className="analytics-row-list">
      {rows.map((row) => (
        <div className="analytics-row" key={row.label}>
          <span>{row.label}{row.helper !== undefined && <small>{helperLabel}: {row.helper}</small>}</span>
          <strong>{row.count}</strong>
          <em>{rowPercent(row.count, total)}</em>
          <i><b style={{ width: `${Math.max(3, (Number(row.count || 0) / max) * 100)}%` }} /></i>
        </div>
      ))}
    </div>
  );
}

function AnalyticsWarningList({ warnings = [] }) {
  if (!warnings.length) return null;
  return (
    <div className="analytics-warning-list" role="status">
      {warnings.map((warning) => <p key={warning}>{warning}</p>)}
    </div>
  );
}

function AnalyticsHelperNote({ children }) {
  if (!children) return null;
  return <p className="small-note analytics-helper-note">{children}</p>;
}

function AnalyticsTable({ columns = [], rows = [], empty }) {
  if (!rows.length) return <p className="small-note analytics-empty-row">{empty}</p>;
  return (
    <div className="analytics-table-scroll" role="region" tabIndex="0">
      <table className="analytics-drilldown-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || row.path || row.experience || row.step || `${index}-${columns.map((column) => row[column.key]).join('-')}`}>
              {columns.map((column) => <td key={column.key}>{row[column.key] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnalyticsPanel({ title, children }) {
  return (
    <details className="admin-panel analytics-panel analytics-collapsible-panel">
      <summary className="analytics-collapsible-summary"><h2>{title}</h2></summary>
      <div className="analytics-collapsible-body">{children}</div>
    </details>
  );
}

function AnalyticsStaticPanel({ title, children }) {
  return (
    <section className="admin-panel analytics-panel analytics-static-panel">
      <header className="analytics-static-header"><h2>{title}</h2></header>
      <div className="analytics-static-body">{children}</div>
    </section>
  );
}

function AnalyticsSubsection({ title, children }) {
  return (
    <section className="analytics-subsection">
      <h3>{title}</h3>
      <div className="analytics-subsection-body">{children}</div>
    </section>
  );
}


function safeBookingRequestRows(requests = [], range, lang) {
  return (requests || [])
    .filter((request) => periodContains(request, range))
    .map((request) => ({
      created_at: request.created_at,
      status: request.status,
      request_type: request.request_type,
      source: request.source,
      traffic_source: request.traffic_source,
      source_section: request.source_section,
      source_cta: request.source_cta,
      cta_location: request.cta_location,
      experience_id: request.experience_id,
      requested_date_present: Boolean(request.requested_date),
      heard_about_us: normalizeHeardAboutUs(request.heard_about_us, { allowAdmin: true }) || null,
      heard_about_us_label: heardAboutUsLabel(request.heard_about_us, lang, { fallback: '' }) || null,
      heard_about_us_detail: cleanHeardAboutUsDetail(request.heard_about_us_detail) || null,
      heard_about_us_display: heardAboutUsDisplay(request.heard_about_us, request.heard_about_us_detail, lang, { fallback: '' }) || null,
      has_fixed_excursion: Boolean(request.has_fixed_excursion || request.fixed_excursion_id),
      adults_bucket: request.adults ? (Number(request.adults) > 6 ? '7+' : String(request.adults)) : null,
      children_present: Boolean(request.children)
    }));
}

function safeAnalyticsRows(rows = [], kind = 'event') {
  return rows.map((row) => {
    if (kind === 'session') {
      return {
        started_at: row.started_at,
        last_seen_at: row.last_seen_at,
        duration_seconds: row.duration_seconds,
        pageview_count: row.pageview_count,
        entry_path: row.entry_path,
        exit_path: row.exit_path,
        traffic_source: row.traffic_source,
        referrer_domain: row.referrer_domain,
        country_code: row.country_code,
        country_name: row.country_name,
        city: row.city,
        language: row.language,
        device_type: row.device_type,
        browser: row.browser,
        operating_system: row.operating_system
      };
    }
    return {
      event_name: row.event_name,
      occurred_at: row.occurred_at,
      path: row.path,
      section: row.section,
      language: row.language,
      traffic_source: row.traffic_source,
      referrer_domain: row.referrer_domain,
      country_code: row.country_code,
      country_name: row.country_name,
      city: row.city,
      device_type: row.device_type,
      browser: row.browser,
      operating_system: row.operating_system,
      metadata: row.metadata || {}
    };
  });
}

function downloadAnalyticsExport({ lang, period, range, model, events, sessions, bookingRequests }) {
  const generatedAt = new Date().toISOString();
  const payload = {
    export_type: 'vulcaniq_analytics_metrics',
    generated_at: generatedAt,
    language: lang,
    period,
    period_label: analyticsPeriodLabel(period, lang),
    range,
    chatgpt_prompt: lang === 'it'
      ? 'Analizza queste metriche del sito vulcanIQ. Concentrati su integrità del funnel, comportamento form vs WhatsApp/email, UX mobile, domanda per esperienza, qualità attribuzione sorgenti e se il campione è sufficiente per conclusioni marketing.'
      : 'Analyze these vulcanIQ website metrics. Focus on funnel integrity, form vs WhatsApp/email behavior, mobile UX, experience demand, source attribution quality, and whether the sample size is sufficient for marketing conclusions.',
    summary: {
      visitors: model.visitors,
      page_views: model.pageViews,
      booking_requests: model.bookingRequests,
      website_booking_requests: model.websiteRequests,
      tracked_submit_successes: model.submitSuccesses,
      submit_attempts: model.submitAttempts,
      submit_errors: model.submitErrors,
      validation_errors: model.validationErrors,
      whatsapp_clicks: model.whatsappClicks,
      email_clicks: model.emailClicks,
      booking_conversion_rate: model.bookingConversion,
      website_request_conversion: model.conversionMetrics.websiteRequestConversion,
      tracked_submission_conversion: model.conversionMetrics.trackedSubmissionConversion,
      contact_intent_conversion: model.conversionMetrics.contactIntentConversion,
      confirmed_booking_conversion: model.conversionMetrics.confirmedBookingConversion,
      average_engagement_time: model.averageEngagement,
      internal_events_excluded: model.internalEventsExcluded,
      internal_sessions_excluded: model.internalSessionsExcluded,
      website_booking_requests_in_period: bookingRequestsInPeriod(bookingRequests, range)
    },
    tables: {
      countries: model.countryRows,
      cities: model.cityRows,
      top_pages: model.topPageRows,
      excursion_views: model.experienceRows,
      traffic_sources: model.sourceRows,
      devices: model.deviceRows,
      browsers: model.browserRows,
      operating_systems: model.osRows,
      languages: model.languageRows,
      website_flow: model.flowRows,
      booking_funnel: model.funnelRows,
      data_quality: model.dataQualityRows,
      customer_declared_sources: model.declaredAttributionRows
    },
    drilldowns: {
      funnel_diagnostics: model.funnelDiagnostics,
      form_by_experience: model.formByExperience,
      contact_paths: model.contactPaths,
      mobile_funnel: model.mobileFunnel,
      session_paths: model.sessionPaths,
      language_conversion: model.languageConversion,
      geography_hypotheses: model.geographyHypotheses,
      traffic_attribution_quality: model.trafficAttributionQuality,
      customer_declared_sources: model.declaredAttributionRows,
      requests_without_tracked_form_open: model.requestsWithoutTrackedFormOpen
    },
    anonymized_samples: {
      events: safeAnalyticsRows(events, 'event'),
      sessions: safeAnalyticsRows(sessions, 'session'),
      booking_requests: safeBookingRequestRows(bookingRequests, range, lang)
    },
    privacy_note: 'Visitor IDs, session IDs, names, emails, phone numbers, message text, precise coordinates, payment data, and raw booking-request personal details are intentionally excluded from this export.'
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const dateStamp = generatedAt.slice(0, 10);
  anchor.href = url;
  anchor.download = `vulcaniq-analytics-${period}-${dateStamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function AdminAnalyticsPage({ lang, adminContent = {} }) {
  const [period, setPeriod] = useState('30d');
  const [state, setState] = useState({ loading: true, error: '', events: [], sessions: [], bookingRequests: [] });
  const range = useMemo(() => analyticsDateRange(period), [period]);

  useEffect(() => {
    let alive = true;
    async function loadAnalytics() {
      setState((current) => ({ ...current, loading: true, error: '' }));
      try {
        const [events, sessions, requests] = await Promise.all([
          listAnalyticsEvents({ ...range, limit: 10000 }),
          listAnalyticsSessions({ ...range, limit: 10000 }),
          listBookingRequests({ limit: 1000 }).catch(() => [])
        ]);
        if (!alive) return;
        setState({ loading: false, error: '', events, sessions, bookingRequests: requests || [] });
      } catch (error) {
        if (!alive) return;
        setState({ loading: false, error: error?.message || adminCopy(lang, 'Analytics non disponibili.', 'Analytics are not available.'), events: [], sessions: [], bookingRequests: [] });
      }
    }
    loadAnalytics();
    return () => { alive = false; };
  }, [period]);

  const model = useMemo(() => buildAnalyticsModel({ events: state.events, sessions: state.sessions, bookingRequests: state.bookingRequests, range, lang }), [state.events, state.sessions, state.bookingRequests, range, lang]);
  const hasData = state.events.length > 0 || state.sessions.length > 0;
  const emptyText = adminCopy(lang, 'Nessun dato disponibile per il periodo selezionato.', 'No analytics data available for the selected period.');
  const setupText = adminCopy(lang, 'I dati inizieranno a comparire dopo le prime visite pubbliche al sito.', 'Data will start appearing after public visitors browse the website.');

  return (
    <section className="admin-subpage analytics-admin-page">
      <div className="admin-page-header analytics-page-header">
        <div>
          <span className="kicker">vulcanIQ</span>
          <AdminEditableText as="h1" itemKey="admin.analytics.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Dati', 'Analytics')} />
          <AdminEditableText as="p" itemKey="admin.analytics.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Metriche anonime e privacy-first sulle visite pubbliche, le azioni e il percorso verso la prenotazione.', 'Anonymous privacy-first metrics about public visits, actions, and movement toward booking.')} />
        </div>
        <div className="analytics-header-actions">
          <label className="analytics-period-filter">
            <span>{adminCopy(lang, 'Periodo', 'Period')}</span>
            <select value={period} onChange={(event) => setPeriod(event.target.value)}>
              {ANALYTICS_PERIODS.map(([key]) => <option key={key} value={key}>{analyticsPeriodLabel(key, lang)}</option>)}
            </select>
          </label>
          <button className="button secondary analytics-export-button" type="button" disabled={state.loading} onClick={() => downloadAnalyticsExport({ lang, period, range, model, events: state.events, sessions: state.sessions, bookingRequests: state.bookingRequests })}>{adminCopy(lang, 'Esporta metriche', 'Export metrics')}</button>
        </div>
      </div>

      {state.error && <div className="admin-alert warning" role="status">{state.error}<br />{setupText}</div>}
      {state.loading ? <p>{adminCopy(lang, 'Caricamento dati...', 'Loading analytics...')}</p> : (
        <>
          {!hasData && <div className="admin-alert warning" role="status">{emptyText}<br />{setupText}</div>}
          {state.events.length >= 10000 && <p className="small-note analytics-limit-note">{adminCopy(lang, 'Risultati limitati ai primi 10.000 eventi del periodo.', 'Results are capped at the first 10,000 events in this period.')}</p>}

          <AnalyticsStaticPanel title={<AdminEditableText itemKey="admin.analytics.overview.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Panoramica', 'Overview')} />}>
            <AnalyticsWarningList warnings={model.warnings} />
            <div className="admin-summary-grid analytics-summary-grid">
              <SummaryCard label={adminCopy(lang, 'Visitatori', 'Visitors')} value={model.visitors || '—'} helper={adminCopy(lang, 'ID visitatore anonimi', 'Anonymous visitor IDs')} />
              <SummaryCard label={adminCopy(lang, 'Visualizzazioni pagina', 'Page views')} value={model.pageViews} helper="page_view" />
              <SummaryCard label={adminCopy(lang, 'Aperture modulo', 'Form opens')} value={model.formOpens} helper="booking_form_open" />
              <SummaryCard label={adminCopy(lang, 'Tentativi invio modulo', 'Form submit attempts')} value={model.submitAttempts} helper="booking_form_submit_attempt" />
              <SummaryCard label={adminCopy(lang, 'Richieste sito', 'Website requests')} value={model.websiteRequests} helper={adminCopy(lang, 'booking_requests source=website', 'booking_requests source=website')} />
              <SummaryCard label={adminCopy(lang, 'Click WhatsApp', 'WhatsApp clicks')} value={model.whatsappClicks} helper="whatsapp_click" />
              <SummaryCard label={adminCopy(lang, 'Click email', 'Email clicks')} value={model.emailClicks} helper="email_click" />
              <SummaryCard label={adminCopy(lang, 'Conversione richieste sito', 'Website request conversion')} value={model.conversionMetrics.websiteRequestConversion} helper={adminCopy(lang, 'Richieste sito / visitatori', 'Website requests / visitors')} />
              <SummaryCard label={adminCopy(lang, 'Tempo medio di coinvolgimento', 'Average engagement time')} value={model.averageEngagement} helper={adminCopy(lang, 'Stimato dalle sessioni anonime.', 'Estimated from anonymous sessions.')} />
            </div>
          </AnalyticsStaticPanel>

          <AnalyticsPanel title={adminCopy(lang, 'Qualità dati', 'Data quality')}>
            <AnalyticsHelperNote>{adminCopy(lang, 'Avvisi diagnostici per capire quando il funnel non è internamente coerente. Le metriche pubbliche escludono traffico admin/API.', 'Diagnostic warnings for identifying when the funnel is not internally coherent. Public metrics exclude admin/API traffic.')}</AnalyticsHelperNote>
            <AnalyticsTable
              columns={[
                { key: 'check', label: adminCopy(lang, 'Controllo', 'Check') },
                { key: 'count', label: adminCopy(lang, 'Conteggio', 'Count') },
                { key: 'detail', label: adminCopy(lang, 'Dettaglio', 'Detail') }
              ]}
              rows={model.dataQualityRows}
              empty={emptyText}
            />
          </AnalyticsPanel>

          <AnalyticsPanel title={<AdminEditableText itemKey="admin.analytics.bookingFunnel.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Funnel prenotazione', 'Booking funnel')} />}>
            <AnalyticsHelperNote>{adminCopy(lang, 'Controlla se gli utenti passano da visita ad apertura modulo, tentativo di invio e richiesta creata. Questa sezione concentra le anomalie di tracciamento del form.', 'Check whether visitors move from visit to form open, submit attempt, and created request. This section concentrates form tracking anomalies.')}</AnalyticsHelperNote>
            {model.lowSampleNote && <AnalyticsHelperNote>{adminCopy(lang, 'Campione dati ridotto: usa questi numeri per diagnosticare tracciamento e UX, non per conclusioni marketing definitive.', 'Small data sample: use these numbers to diagnose tracking and UX, not for definitive marketing conclusions.')}</AnalyticsHelperNote>}
            <AnalyticsSubsection title={adminCopy(lang, 'Diagnostica funnel', 'Funnel diagnostics')}>
              <AnalyticsTable
                columns={[
                  { key: 'step', label: adminCopy(lang, 'Step', 'Step') },
                  { key: 'count', label: adminCopy(lang, 'Conteggio', 'Count') },
                  { key: 'dropoff', label: 'Drop-off' }
                ]}
                rows={model.funnelDiagnostics}
                empty={emptyText}
              />
            </AnalyticsSubsection>
            <div className="analytics-two-column-grid">
              <AnalyticsSubsection title={adminCopy(lang, 'Modulo per esperienza', 'Booking form by experience')}>
                <AnalyticsTable
                  columns={[
                    { key: 'experience', label: adminCopy(lang, 'Esperienza/tipologia', 'Experience/type') },
                    { key: 'experience_views', label: adminCopy(lang, 'Viste esperienza', 'Experience views') },
                    { key: 'detail_opens', label: adminCopy(lang, 'Dettagli aperti', 'Detail opens') },
                    { key: 'form_opens', label: adminCopy(lang, 'Aperture modulo', 'Form opens') },
                    { key: 'submit_attempts', label: adminCopy(lang, 'Tentativi invio', 'Submit attempts') },
                    { key: 'submit_successes', label: adminCopy(lang, 'Invii riusciti', 'Submit successes') },
                    { key: 'booking_requests', label: adminCopy(lang, 'Richieste create', 'Created requests') },
                    { key: 'confirmed_bookings', label: adminCopy(lang, 'Confermate', 'Confirmed') },
                    { key: 'whatsapp_clicks', label: 'WhatsApp' },
                    { key: 'email_clicks', label: 'Email' },
                    { key: 'phone_clicks', label: adminCopy(lang, 'Telefono', 'Phone') },
                    { key: 'view_to_request', label: adminCopy(lang, 'Vista → richiesta', 'View → request') },
                    { key: 'form_to_request', label: adminCopy(lang, 'Modulo → richiesta', 'Form → request') }
                  ]}
                  rows={model.formByExperience}
                  empty={adminCopy(lang, 'Nessuna esperienza specificata nei dati del periodo.', 'No experience specified in this period’s data.')}
                />
              </AnalyticsSubsection>
              <AnalyticsSubsection title={adminCopy(lang, 'Conversioni principali', 'Core conversions')}>
                <div className="admin-summary-grid analytics-mini-summary-grid">
                  <SummaryCard label={adminCopy(lang, 'Tentativi invio modulo', 'Form submit attempts')} value={model.submitAttempts} helper="booking_form_submit_attempt" />
                  <SummaryCard label={adminCopy(lang, 'Invii riusciti tracciati', 'Tracked successful submissions')} value={model.submitSuccesses} helper="booking_form_submit_success" />
                  <SummaryCard label={adminCopy(lang, 'Errori invio', 'Submit errors')} value={model.submitErrors} helper="booking_form_submit_error" />
                  <SummaryCard label={adminCopy(lang, 'Conversione invii', 'Tracked conversion')} value={model.conversionMetrics.trackedSubmissionConversion} helper={adminCopy(lang, 'Invii analytics / visitatori', 'Analytics successes / visitors')} />
                </div>
              </AnalyticsSubsection>
            </div>
          </AnalyticsPanel>

          <AnalyticsPanel title={<AdminEditableText itemKey="admin.analytics.contactIntent.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Intento di contatto', 'Contact intent')} />}>
            <AnalyticsHelperNote>{adminCopy(lang, 'Raggruppa le azioni con cui un visitatore prova a contattare vulcanIQ senza necessariamente completare il modulo.', 'Groups the actions where a visitor tries to contact vulcanIQ without necessarily completing the form.')}</AnalyticsHelperNote>
            <div className="admin-summary-grid analytics-mini-summary-grid">
              <SummaryCard label={adminCopy(lang, 'Click WhatsApp', 'WhatsApp clicks')} value={model.whatsappClicks} helper="whatsapp_click" />
              <SummaryCard label={adminCopy(lang, 'Click email', 'Email clicks')} value={model.emailClicks} helper="email_click" />
              <SummaryCard label={adminCopy(lang, 'Click telefono', 'Phone clicks')} value={model.phoneClicks} helper="phone_click" />
              <SummaryCard label={adminCopy(lang, 'Click Google Maps', 'Google Maps clicks')} value={model.mapsClicks} helper="google_maps_click" />
            </div>
            <AnalyticsSubsection title={adminCopy(lang, 'Percorsi di contatto', 'Contact paths')}>
              <AnalyticsTable
                columns={[
                  { key: 'cta_location', label: adminCopy(lang, 'Posizione CTA', 'CTA location') },
                  { key: 'action_type', label: adminCopy(lang, 'Azione', 'Action type') },
                  { key: 'count', label: adminCopy(lang, 'Conteggio', 'Count') },
                  { key: 'device', label: adminCopy(lang, 'Dispositivo', 'Device') },
                  { key: 'language', label: adminCopy(lang, 'Lingua', 'Language') },
                  { key: 'top_previous_section', label: adminCopy(lang, 'Sezione precedente', 'Top previous section') }
                ]}
                rows={model.contactPaths}
                empty={emptyText}
              />
            </AnalyticsSubsection>
          </AnalyticsPanel>

          <AnalyticsPanel title={<AdminEditableText itemKey="admin.analytics.sources.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Fonti traffico', 'Traffic sources')} />}>
            {model.directTrafficShare !== '0%' && <AnalyticsHelperNote>{adminCopy(lang, 'Molto traffico risulta Diretto. Usa link UTM per Instagram, WhatsApp, QR code, biglietti da visita e partner per capire da dove arrivano gli utenti.', 'Most traffic appears as Direct. Use UTM links for Instagram, WhatsApp, QR codes, business cards, and partners to understand where users come from.')}</AnalyticsHelperNote>}
            <div className="analytics-two-column-grid">
              <AnalyticsSubsection title={adminCopy(lang, 'Qualità attribuzione', 'Attribution quality')}>
                <AnalyticsTable
                  columns={[
                    { key: 'source', label: adminCopy(lang, 'Sorgente', 'Source') },
                    { key: 'count', label: adminCopy(lang, 'Conteggio', 'Count') },
                    { key: 'notes', label: adminCopy(lang, 'Note', 'Notes') }
                  ]}
                  rows={model.trafficAttributionQuality}
                  empty={emptyText}
                />
              </AnalyticsSubsection>
              <AnalyticsSubsection title={adminCopy(lang, 'Sorgenti principali', 'Top sources')}>
                <AnalyticsRowList rows={model.sourceRows} total={Math.max(1, model.sourceRows.reduce((sum, row) => sum + row.count, 0))} empty={emptyText} />
              </AnalyticsSubsection>
            </div>
            <AnalyticsSubsection title={adminCopy(lang, 'Dove ci hanno scoperto', 'Where customers found us')}>
              <AnalyticsHelperNote>{adminCopy(lang, 'Dato dichiarato dal cliente. Non sostituisce traffic_source, che resta attribuzione tecnica da referrer/UTM/sessione.', 'Customer-declared source. This does not replace traffic_source, which remains technical attribution from referrer/UTM/session data.')}</AnalyticsHelperNote>
              <AnalyticsTable
                columns={[
                  { key: 'source', label: adminCopy(lang, 'Fonte conoscenza', 'Discovery source') },
                  { key: 'details', label: adminCopy(lang, 'Dettagli Altro', 'Other details') },
                  { key: 'booking_requests', label: adminCopy(lang, 'Richieste', 'Requests') },
                  { key: 'confirmed_bookings', label: adminCopy(lang, 'Confermate', 'Confirmed') },
                  { key: 'contact_events', label: adminCopy(lang, 'Contatti diretti', 'Direct contacts') },
                  { key: 'form_events', label: adminCopy(lang, 'Eventi modulo', 'Form events') }
                ]}
                rows={model.declaredAttributionRows}
                empty={emptyText}
              />
            </AnalyticsSubsection>
          </AnalyticsPanel>

          <AnalyticsPanel title={<AdminEditableText itemKey="admin.analytics.audienceUx.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Pubblico e UX', 'Audience and UX')} />}>
            <AnalyticsHelperNote>{adminCopy(lang, 'Raggruppa dispositivo, lingua, geografia e percorsi di navigazione per capire dove testare prima il sito.', 'Groups device, language, geography, and navigation paths to understand where to test the site first.')}</AnalyticsHelperNote>
            <div className="analytics-two-column-grid">
              <AnalyticsSubsection title={adminCopy(lang, 'Funnel mobile', 'Mobile funnel')}>
                <AnalyticsTable
                  columns={[
                    { key: 'device_browser', label: adminCopy(lang, 'Dispositivo/browser', 'Device/browser') },
                    { key: 'page_views', label: adminCopy(lang, 'Page views', 'Page views') },
                    { key: 'experience_views', label: adminCopy(lang, 'Viste esperienza', 'Experience views') },
                    { key: 'detail_opens', label: adminCopy(lang, 'Dettagli', 'Details') },
                    { key: 'calendar_date_selections', label: adminCopy(lang, 'Date calendario', 'Calendar dates') },
                    { key: 'form_opens', label: adminCopy(lang, 'Aperture modulo', 'Form opens') },
                    { key: 'field_starts', label: adminCopy(lang, 'Avvii compilazione', 'Field starts') },
                    { key: 'submit_attempts', label: adminCopy(lang, 'Tentativi invio', 'Submit attempts') },
                    { key: 'validation_errors', label: adminCopy(lang, 'Errori validazione', 'Validation errors') },
                    { key: 'submit_successes', label: adminCopy(lang, 'Invii riusciti', 'Submit successes') },
                    { key: 'submit_errors', label: adminCopy(lang, 'Errori invio', 'Submit errors') },
                    { key: 'booking_requests', label: adminCopy(lang, 'Richieste', 'Requests') },
                    { key: 'whatsapp_clicks', label: 'WhatsApp' },
                    { key: 'email_clicks', label: 'Email' },
                    { key: 'phone_clicks', label: adminCopy(lang, 'Telefono', 'Phone') }
                  ]}
                  rows={model.mobileFunnel}
                  empty={emptyText}
                />
              </AnalyticsSubsection>
              <AnalyticsSubsection title={adminCopy(lang, 'Dispositivi', 'Devices')}>
                <h4>{adminCopy(lang, 'Mobile / Desktop / Tablet', 'Mobile / Desktop / Tablet')}</h4>
                <AnalyticsRowList rows={model.deviceRows} total={state.events.length || 1} empty={emptyText} />
                <h4>{adminCopy(lang, 'Browser', 'Browser')}</h4>
                <AnalyticsRowList rows={model.browserRows} total={state.events.length || 1} empty={emptyText} />
                <h4>{adminCopy(lang, 'Sistema operativo', 'Operating system')}</h4>
                <AnalyticsRowList rows={model.osRows} total={state.events.length || 1} empty={emptyText} />
              </AnalyticsSubsection>
            </div>
            <div className="analytics-two-column-grid">
              <AnalyticsSubsection title={adminCopy(lang, 'Lingua e conversione', 'Language and conversion')}>
                <AnalyticsTable
                  columns={[
                    { key: 'language', label: adminCopy(lang, 'Lingua', 'Language') },
                    { key: 'actions', label: adminCopy(lang, 'Azioni', 'Actions') },
                    { key: 'page_views', label: adminCopy(lang, 'Page views', 'Page views') },
                    { key: 'form_opens', label: adminCopy(lang, 'Aperture modulo', 'Form opens') },
                    { key: 'submit_attempts', label: adminCopy(lang, 'Tentativi invio', 'Submit attempts') },
                    { key: 'submit_successes', label: adminCopy(lang, 'Invii riusciti', 'Submit successes') },
                    { key: 'whatsapp_clicks', label: 'WhatsApp' },
                    { key: 'email_clicks', label: 'Email' },
                    { key: 'language_switches', label: adminCopy(lang, 'Cambi lingua', 'Language switches') }
                  ]}
                  rows={model.languageConversion}
                  empty={emptyText}
                />
              </AnalyticsSubsection>
              <AnalyticsSubsection title={adminCopy(lang, 'Lingua', 'Language')}>
                <AnalyticsRowList rows={model.languageRows} total={state.events.length || 1} empty={emptyText} helperLabel={adminCopy(lang, 'visitatori', 'visitors')} />
              </AnalyticsSubsection>
            </div>
            <div className="analytics-two-column-grid">
              <AnalyticsSubsection title={adminCopy(lang, 'Geografia: ipotesi', 'Geography: hypotheses')}>
                <AnalyticsTable
                  columns={[
                    { key: 'country_city', label: adminCopy(lang, 'Paese/città', 'Country/city') },
                    { key: 'actions', label: adminCopy(lang, 'Azioni', 'Actions') },
                    { key: 'language', label: adminCopy(lang, 'Lingua', 'Language') },
                    { key: 'form_opens', label: adminCopy(lang, 'Aperture modulo', 'Form opens') },
                    { key: 'contact_clicks', label: adminCopy(lang, 'Click contatto', 'Contact clicks') },
                    { key: 'device', label: adminCopy(lang, 'Dispositivo', 'Device') }
                  ]}
                  rows={model.geographyHypotheses}
                  empty={emptyText}
                />
              </AnalyticsSubsection>
              <AnalyticsSubsection title={adminCopy(lang, 'Geografia', 'Geography')}>
                <h4>{adminCopy(lang, 'Paesi principali', 'Top countries')}</h4>
                <AnalyticsRowList rows={model.countryRows} total={state.events.length || 1} empty={emptyText} />
                <h4>{adminCopy(lang, 'Città principali', 'Top cities')}</h4>
                <AnalyticsRowList rows={model.cityRows} total={state.events.length || 1} empty={adminCopy(lang, 'Città non disponibile se Cloudflare non la fornisce.', 'City is unavailable if Cloudflare does not provide it.')} />
              </AnalyticsSubsection>
            </div>
            <div className="analytics-two-column-grid">
              <AnalyticsSubsection title={adminCopy(lang, 'Percorsi sessione', 'Session paths')}>
                <AnalyticsTable
                  columns={[
                    { key: 'path', label: adminCopy(lang, 'Percorso', 'Path') },
                    { key: 'sessions', label: adminCopy(lang, 'Sessioni', 'Sessions') },
                    { key: 'contact_actions', label: adminCopy(lang, 'Azioni contatto', 'Contact actions') },
                    { key: 'booking_form_opens', label: adminCopy(lang, 'Aperture modulo', 'Booking form opens') }
                  ]}
                  rows={model.sessionPaths}
                  empty={adminCopy(lang, 'Servono più eventi ordinati per mostrare i percorsi sessione.', 'More ordered events are needed to show session paths.')}
                />
              </AnalyticsSubsection>
              <AnalyticsSubsection title={adminCopy(lang, 'Flusso sito', 'Website flow')}>
                <h4>{adminCopy(lang, 'Azioni principali', 'Key actions')}</h4>
                <AnalyticsRowList rows={model.flowRows} total={Math.max(1, model.flowRows.reduce((sum, row) => sum + row.count, 0))} empty={emptyText} />
                <h4>{adminCopy(lang, 'Pagine principali', 'Top pages')}</h4>
                <AnalyticsRowList rows={model.topPageRows} total={model.pageViews || 1} empty={emptyText} />
                <h4>{adminCopy(lang, 'Visualizzazioni esperienze', 'Excursion detail views')}</h4>
                <AnalyticsRowList rows={model.experienceRows} total={model.experienceViews || 1} empty={emptyText} />
              </AnalyticsSubsection>
            </div>
          </AnalyticsPanel>
        </>
      )}
    </section>
  );
}

function AdminAnalyticsPreview({ lang, adminContent, editor }) {
  return (
    <section className="admin-subpage analytics-admin-page admin-preview-page">
      <div className="admin-page-header analytics-page-header">
        <div>
          <span className="kicker">vulcanIQ</span>
          <AdminEditableText as="h1" itemKey="admin.analytics.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Dati', 'Analytics')} />
          <AdminEditableText as="p" itemKey="admin.analytics.helper" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Metriche anonime e privacy-first sulle visite pubbliche, le azioni e il percorso verso la prenotazione.', 'Anonymous privacy-first metrics about public visits, actions, and movement toward booking.')} />
        </div>
      </div>
      <AnalyticsStaticPanel title={<AdminEditableText itemKey="admin.analytics.overview.title" lang={lang} adminContent={adminContent} editor={editor} fallback={adminCopy(lang, 'Panoramica', 'Overview')} />}>
        <div className="admin-summary-grid analytics-summary-grid">
          <SummaryCard label={adminCopy(lang, 'Visitatori', 'Visitors')} value="128" />
          <SummaryCard label={adminCopy(lang, 'Visualizzazioni pagina', 'Page views')} value="412" />
          <SummaryCard label={adminCopy(lang, 'Richieste prenotazione', 'Booking requests')} value="18" />
          <SummaryCard label={adminCopy(lang, 'Tasso conversione prenotazione', 'Booking conversion rate')} value="14%" />
        </div>
      </AnalyticsStaticPanel>
    </section>
  );
}

function FinanceAdminPage({ lang, session, adminContent = {} }) {
  const [entries, setEntries] = useState([]);
  const [requests, setRequests] = useState([]);
  const [fixedExcursions, setFixedExcursions] = useState([]);
  const [leaflets, setLeaflets] = useState([]);
  const [filters, setFilters] = useState({
    type: 'all',
    dateMode: 'all',
    specificDate: todayIso(),
    specificMonth: monthValueFromDate(),
    fromDate: '',
    toDate: '',
    category: 'all',
    linked: 'all',
    includeArchived: false
  });
  const [form, setForm] = useState({ entry_date: todayIso(), type: 'income', amount: '', currency: 'EUR', title: '', description: '', category: 'booking_payment', payment_method: '', booking_request_id: '', fixed_excursion_id: '', leaflet_id: '' });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [activeFinanceDetail, setActiveFinanceDetail] = useState(null);

  const resolvedDateRange = useMemo(() => resolveFinanceDateRange(filters, lang), [filters, lang]);

  async function refresh() {
    setLoading(true);
    setError('');
    const dateRange = resolveFinanceDateRange(filters, lang);
    try {
      const [entryData, requestData, fixedData, leafletData] = await Promise.all([
        listFinanceEntries({ ...filters, fromDate: dateRange.startDate, toDate: dateRange.endDate }),
        listBookingRequests({ limit: 250 }),
        listFixedExcursions({ activeOnly: false }),
        listMonthlyLeaflets({ activeOnly: false })
      ]);
      setEntries(entryData);
      setRequests(requestData);
      setFixedExcursions(fixedData);
      setLeaflets(leafletData);
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Finanze non caricate.', 'Finance data not loaded.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [filters.type, filters.dateMode, filters.specificDate, filters.specificMonth, filters.fromDate, filters.toDate, filters.category, filters.linked, filters.includeArchived]);

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'type' ? { category: value === 'income' ? 'booking_payment' : 'fuel' } : {})
    }));
  }

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
      ...(field === 'type' ? { category: 'all' } : {})
    }));
  }

  function startEdit(entry) {
    setEditing(entry);
    setForm({
      entry_date: entry.entry_date || todayIso(),
      type: entry.type || 'income',
      amount: String(entry.amount || ''),
      currency: entry.currency || 'EUR',
      title: entry.title || '',
      description: entry.description || '',
      category: entry.category || (entry.type === 'expense' ? 'fuel' : 'booking_payment'),
      payment_method: entry.payment_method || '',
      booking_request_id: entry.booking_request_id || '',
      fixed_excursion_id: entry.fixed_excursion_id || '',
      leaflet_id: entry.leaflet_id || ''
    });
  }

  function resetForm() {
    setEditing(null);
    setForm({ entry_date: todayIso(), type: 'income', amount: '', currency: 'EUR', title: '', description: '', category: 'booking_payment', payment_method: '', booking_request_id: '', fixed_excursion_id: '', leaflet_id: '' });
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setFeedback('');
    if (!form.entry_date || !form.title.trim() || Number(form.amount || 0) <= 0) {
      setError(adminCopy(lang, 'Data, titolo e importo positivo sono obbligatori.', 'Date, title, and a positive amount are required.'));
      return;
    }
    try {
      if (editing) await updateFinanceEntry(editing.id, form, session.user.id);
      else await createFinanceEntry(form, session.user.id);
      setFeedback(editing ? adminCopy(lang, 'Voce aggiornata.', 'Entry updated.') : adminCopy(lang, 'Voce aggiunta.', 'Entry added.'));
      resetForm();
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Voce non salvata.', 'Entry not saved.'));
    }
  }

  async function archive(entry) {
    setError('');
    try {
      await archiveFinanceEntry(entry.id, session.user.id, 'archived from admin');
      setFeedback(adminCopy(lang, 'Voce archiviata.', 'Entry archived.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Archivio non riuscito.', 'Archive failed.'));
    }
  }

  const requestById = useMemo(() => new Map(requests.map((request) => [request.id, request])), [requests]);
  const fixedById = useMemo(() => new Map(fixedExcursions.map((item) => [item.id, item])), [fixedExcursions]);
  const leafletById = useMemo(() => new Map(leaflets.map((item) => [item.id, item])), [leaflets]);
  const enrichedEntries = useMemo(() => entries.map((entry) => enrichFinanceEntry(entry, { requestById, fixedById, leafletById })), [entries, requestById, fixedById, leafletById]);
  const reportEntries = filters.includeArchived ? enrichedEntries : enrichedEntries.filter((entry) => entry.active !== false);
  const financeSummary = calculateFinanceSummary(reportEntries);
  const linkedEntries = reportEntries.filter(financeEntryIsLinked);
  const unlinkedExpenseEntries = financeSummary.expenseEntries.filter((entry) => !financeEntryIsLinked(entry));
  const categories = filters.type === 'expense' ? FINANCE_CATEGORIES.expense : filters.type === 'income' ? FINANCE_CATEGORIES.income : [...FINANCE_CATEGORIES.income, ...FINANCE_CATEGORIES.expense];

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <AdminEditableText as="h1" itemKey="admin.finance.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Finanze', 'Finance')} />
        </div>
        <button className="button secondary" type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      <div className="admin-summary-grid finance-summary-grid">
        <SummaryCard label={adminCopy(lang, 'Entrate totali', 'Total earnings')} value={formatMoney(financeSummary.income)} onClick={() => setActiveFinanceDetail({ key: 'income', title: adminCopy(lang, 'Entrate', 'Income'), entries: financeSummary.incomeEntries, total: financeSummary.income })} helper={adminCopy(lang, 'Apri dettaglio', 'Open details')} />
        <SummaryCard label={adminCopy(lang, 'Uscite totali', 'Total expenses')} value={formatMoney(financeSummary.expenses)} onClick={() => setActiveFinanceDetail({ key: 'expenses', title: adminCopy(lang, 'Uscite', 'Expenses'), entries: financeSummary.expenseEntries, total: financeSummary.expenses })} helper={adminCopy(lang, 'Apri dettaglio', 'Open details')} />
        <SummaryCard label={adminCopy(lang, 'Utile netto', 'Net profit')} value={formatMoney(financeSummary.net)} onClick={() => setActiveFinanceDetail({ key: 'net', title: adminCopy(lang, 'Utile netto', 'Net profit'), entries: reportEntries, total: financeSummary.net })} helper={adminCopy(lang, 'Entrate meno uscite', 'Income minus expenses')} />
        <SummaryCard label={adminCopy(lang, 'Prenotazioni collegate', 'Linked bookings')} value={linkedEntries.length} onClick={() => setActiveFinanceDetail({ key: 'linked', title: adminCopy(lang, 'Prenotazioni collegate', 'Linked bookings'), entries: linkedEntries, total: linkedEntries.length })} helper={adminCopy(lang, 'Vedi movimenti', 'View entries')} />
        <SummaryCard label={adminCopy(lang, 'Spese non collegate', 'Unlinked expenses')} value={unlinkedExpenseEntries.length} onClick={() => setActiveFinanceDetail({ key: 'unlinked-expenses', title: adminCopy(lang, 'Spese non collegate', 'Unlinked expenses'), entries: unlinkedExpenseEntries, total: unlinkedExpenseEntries.length })} helper={adminCopy(lang, 'Vedi spese', 'View expenses')} />
      </div>
      <div className="admin-filter-bar finance-filter-bar">
        <select value={filters.dateMode} onChange={(event) => updateFilter('dateMode', event.target.value)} aria-label={adminCopy(lang, 'Filtro date', 'Date filter')}>
          {FINANCE_DATE_FILTERS.map(([key]) => <option key={key} value={key}>{financeDateFilterLabel(key, lang)}</option>)}
        </select>
        {filters.dateMode === 'specific-date' && <input type="date" value={filters.specificDate} onChange={(event) => updateFilter('specificDate', event.target.value)} aria-label={adminCopy(lang, 'Data specifica', 'Specific date')} />}
        {filters.dateMode === 'specific-month' && <input type="month" value={filters.specificMonth} onChange={(event) => updateFilter('specificMonth', event.target.value)} aria-label={adminCopy(lang, 'Mese specifico', 'Specific month')} />}
        {filters.dateMode === 'custom' && <input type="date" value={filters.fromDate} onChange={(event) => updateFilter('fromDate', event.target.value)} aria-label={adminCopy(lang, 'Da data', 'From date')} />}
        {filters.dateMode === 'custom' && <input type="date" value={filters.toDate} onChange={(event) => updateFilter('toDate', event.target.value)} aria-label={adminCopy(lang, 'A data', 'To date')} />}
        <select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}><option value="all">{adminCopy(lang, 'Tutti i tipi', 'All types')}</option><option value="income">{adminCopy(lang, 'Entrate', 'Income')}</option><option value="expense">{adminCopy(lang, 'Uscite', 'Expenses')}</option></select>
        <select value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}><option value="all">{adminCopy(lang, 'Tutte le categorie', 'All categories')}</option>{categories.map(([key]) => <option key={key} value={key}>{financeCategoryLabel(key, lang)}</option>)}</select>
        <select value={filters.linked} onChange={(event) => updateFilter('linked', event.target.value)}><option value="all">{adminCopy(lang, 'Collegate e libere', 'Linked and unlinked')}</option><option value="linked">{adminCopy(lang, 'Solo collegate', 'Linked only')}</option><option value="unlinked">{adminCopy(lang, 'Solo non collegate', 'Unlinked only')}</option></select>
        <label className="finance-archive-filter"><input type="checkbox" checked={filters.includeArchived} onChange={(event) => updateFilter('includeArchived', event.target.checked)} /><span>{adminCopy(lang, 'Includi archivio', 'Include archive')}</span></label>
        <p className="small-note finance-filter-range-note">{adminCopy(lang, 'Periodo', 'Period')}: {resolvedDateRange.label}</p>
      </div>
      <FinanceOverview lang={lang} summary={financeSummary} rangeLabel={resolvedDateRange.label} onOpen={setActiveFinanceDetail} />
      <FinanceProfitLoss lang={lang} summary={financeSummary} adminContent={adminContent} />
      <div className="admin-two-column finance-layout">
        <details className="admin-panel finance-collapsible-panel finance-form-panel" open={Boolean(editing)}>
          <summary className="finance-collapsible-summary">
            <strong>{editing ? contentText(adminContent, 'admin.finance.editEntry.title', lang, adminCopy(lang, 'Modifica voce', 'Edit entry')) : contentText(adminContent, 'admin.finance.addEntry.title', lang, adminCopy(lang, 'Aggiungi voce', 'Add entry'))}</strong>
          </summary>
          <div className="finance-collapsible-body">
          <form className="admin-form-grid" onSubmit={submit}>
            <AdminSelect label={adminCopy(lang, 'Tipo', 'Type')} value={form.type} onChange={(value) => update('type', value)} options={['income', 'expense']} formatter={(value) => value === 'income' ? adminCopy(lang, 'Entrata', 'Income') : adminCopy(lang, 'Uscita', 'Expense')} />
            <AdminInput label={adminCopy(lang, 'Data', 'Date')} type="date" value={form.entry_date} onChange={(value) => update('entry_date', value)} />
            <AdminInput label={adminCopy(lang, 'Importo', 'Amount')} type="number" value={form.amount} onChange={(value) => update('amount', value)} />
            <AdminInput label={adminCopy(lang, 'Valuta', 'Currency')} value={form.currency} onChange={(value) => update('currency', value)} />
            <AdminInput label={adminCopy(lang, 'Titolo', 'Title')} value={form.title} onChange={(value) => update('title', value)} />
            <AdminSelect label={adminCopy(lang, 'Categoria', 'Category')} value={form.category} onChange={(value) => update('category', value)} options={(form.type === 'income' ? FINANCE_CATEGORIES.income : FINANCE_CATEGORIES.expense).map(([key]) => key)} formatter={(value) => financeCategoryLabel(value, lang)} />
            <AdminInput label={adminCopy(lang, 'Metodo pagamento', 'Payment method')} value={form.payment_method} onChange={(value) => update('payment_method', value)} />
            <AdminSelect label={adminCopy(lang, 'Prenotazione collegata', 'Linked booking')} value={form.booking_request_id} onChange={(value) => update('booking_request_id', value)} options={['', ...requests.map((request) => request.id)]} formatter={(value) => value ? requestFinanceLabel(requests.find((request) => request.id === value), lang) : adminCopy(lang, 'Nessuna', 'None')} />
            <AdminSelect label={adminCopy(lang, 'Escursione fissa collegata', 'Linked fixed excursion')} value={form.fixed_excursion_id} onChange={(value) => update('fixed_excursion_id', value)} options={['', ...fixedExcursions.map((item) => item.id)]} formatter={(value) => value ? fixedExcursionLabel(fixedExcursions.find((item) => item.id === value), lang) : adminCopy(lang, 'Nessuna', 'None')} />
            <AdminSelect label={adminCopy(lang, 'Calendario mensile collegato', 'Linked monthly leaflet')} value={form.leaflet_id} onChange={(value) => update('leaflet_id', value)} options={['', ...leaflets.map((item) => item.id)]} formatter={(value) => value ? leafletLabel(leaflets.find((item) => item.id === value), lang) : adminCopy(lang, 'Nessuno', 'None')} />
            <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione / note', 'Description / notes')}</span><textarea rows={4} value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
            <div className="modal-actions full"><button className="button primary" type="submit">{editing ? adminCopy(lang, 'Salva modifiche', 'Save changes') : adminCopy(lang, 'Aggiungi voce', 'Add entry')}</button>{editing && <button className="button secondary" type="button" onClick={resetForm}>{adminCopy(lang, 'Annulla modifica', 'Cancel edit')}</button>}</div>
          </form>
          </div>
        </details>
        <details className="admin-panel finance-collapsible-panel finance-entries-panel">
          <summary className="finance-collapsible-summary">
            <AdminEditableText as="strong" itemKey="admin.finance.entries.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Voci finanziarie', 'Financial entries')} />
            <em>{entries.length}</em>
          </summary>
          <div className="finance-collapsible-body">
          {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : enrichedEntries.length === 0 ? <p>{adminCopy(lang, 'Nessuna voce trovata.', 'No entries found.')}</p> : (
            <div className="finance-entry-list">
              {enrichedEntries.map((entry) => <FinanceEntryCard key={entry.id} entry={entry} lang={lang} onOpen={() => setActiveFinanceDetail({ key: 'movement', title: adminCopy(lang, 'Dettaglio movimento', 'Movement detail'), entries: [entry], total: Number(entry.amount || 0), selectedEntry: entry })} onEdit={() => startEdit(entry)} onArchive={() => archive(entry)} />)}
            </div>
          )}
          </div>
        </details>
      </div>
      {activeFinanceDetail && <FinanceDetailModal detail={activeFinanceDetail} lang={lang} onClose={() => setActiveFinanceDetail(null)} />}
    </section>
  );
}

function FinanceOverview({ lang, summary, rangeLabel, onOpen }) {
  const empty = adminCopy(lang, 'Nessun movimento per questo periodo.', 'No movements for this period.');
  return (
    <details className="admin-panel finance-collapsible-panel finance-overview-panel">
      <summary className="finance-collapsible-summary">
        <strong>{rangeLabel}</strong>
      </summary>
      <div className="finance-collapsible-body">
      <div className="finance-overview-grid">
        <article className="finance-overview-metric"><span>{adminCopy(lang, 'Utile netto periodo', 'Period net profit')}</span><strong className={`finance-amount ${summary.net < 0 ? 'expense' : 'income'}`}>{formatMoney(summary.net)}</strong></article>
        <button type="button" className="finance-overview-metric clickable" onClick={() => onOpen({ key: 'linked-bookings', title: adminCopy(lang, 'Movimenti collegati a prenotazioni', 'Movements linked to bookings'), entries: summary.linkedBookingEntries, total: summary.linkedBookingEntries.length })}><span>{adminCopy(lang, 'Movimenti collegati a prenotazioni', 'Movements linked to bookings')}</span><strong>{summary.linkedBookingEntries.length}</strong></button>
        <button type="button" className="finance-overview-metric clickable" onClick={() => onOpen({ key: 'linked-fixed', title: adminCopy(lang, 'Movimenti collegati a escursioni fisse', 'Movements linked to fixed excursions'), entries: summary.linkedFixedEntries, total: summary.linkedFixedEntries.length })}><span>{adminCopy(lang, 'Movimenti collegati a escursioni fisse', 'Movements linked to fixed excursions')}</span><strong>{summary.linkedFixedEntries.length}</strong></button>
        <button type="button" className="finance-overview-metric clickable" onClick={() => onOpen({ key: 'unlinked', title: adminCopy(lang, 'Movimenti non collegati', 'Unlinked movements'), entries: summary.unlinkedEntries, total: summary.unlinkedEntries.length })}><span>{adminCopy(lang, 'Movimenti non collegati', 'Unlinked movements')}</span><strong>{summary.unlinkedEntries.length}</strong></button>
      </div>
      <div className="finance-category-breakdown-grid">
        <FinanceCategoryBreakdown
          lang={lang}
          title={adminCopy(lang, 'Entrate per categoria', 'Income by category')}
          empty={empty}
          categories={summary.incomeCategories}
          onOpen={(category) => onOpen({ key: `income-${category.key}`, title: `${adminCopy(lang, 'Entrate', 'Income')} · ${financeCategoryLabel(category.key, lang)}`, entries: category.entries, total: category.total })}
        />
        <FinanceCategoryBreakdown
          lang={lang}
          title={adminCopy(lang, 'Uscite per categoria', 'Expenses by category')}
          empty={empty}
          categories={summary.expenseCategories}
          onOpen={(category) => onOpen({ key: `expense-${category.key}`, title: `${adminCopy(lang, 'Uscite', 'Expenses')} · ${financeCategoryLabel(category.key, lang)}`, entries: category.entries, total: category.total })}
        />
      </div>
      </div>
    </details>
  );
}

function FinanceProfitLoss({ lang, summary, adminContent = {} }) {
  const volume = Math.max(summary.income, summary.expenses, 1);
  const incomeWidth = Math.max(6, Math.round((summary.income / volume) * 100));
  const expenseWidth = Math.max(6, Math.round((summary.expenses / volume) * 100));
  const margin = summary.income > 0 ? Math.round((summary.net / summary.income) * 100) : 0;
  return (
    <details className="admin-panel finance-collapsible-panel finance-pl-panel">
      <summary className="finance-collapsible-summary">
        <AdminEditableText as="strong" itemKey="admin.finance.profitLoss.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Profitti e perdite', 'Profit & Loss')} />
      </summary>
      <div className="finance-collapsible-body">
      <div className="finance-pl-grid">
        <article className="finance-pl-total">
          <span>{adminCopy(lang, 'Entrate', 'Earnings')}</span>
          <strong className="finance-amount income">{formatMoney(summary.income)}</strong>
        </article>
        <article className="finance-pl-total">
          <span>{adminCopy(lang, 'Uscite', 'Expenses')}</span>
          <strong className="finance-amount expense">{formatMoney(summary.expenses)}</strong>
        </article>
        <article className="finance-pl-total highlighted">
          <span>{adminCopy(lang, 'Risultato netto', 'Net result')}</span>
          <strong className={`finance-amount ${summary.net < 0 ? 'expense' : 'income'}`}>{formatMoney(summary.net)}</strong>
        </article>
      </div>
      <div className="finance-pl-bars" aria-label={adminCopy(lang, 'Confronto entrate e uscite', 'Earnings versus expenses comparison')}>
        <div className="finance-pl-bar-row">
          <span>{adminCopy(lang, 'Entrate', 'Earnings')}</span>
          <div className="finance-pl-bar-track"><i className="income" style={{ width: `${incomeWidth}%` }} /></div>
          <strong>{formatMoney(summary.income)}</strong>
        </div>
        <div className="finance-pl-bar-row">
          <span>{adminCopy(lang, 'Uscite', 'Expenses')}</span>
          <div className="finance-pl-bar-track"><i className="expense" style={{ width: `${expenseWidth}%` }} /></div>
          <strong>{formatMoney(summary.expenses)}</strong>
        </div>
      </div>
      <p className="small-note finance-pl-note">{adminCopy(lang, 'Margine netto sul periodo', 'Net margin for the period')}: <strong>{margin}%</strong></p>
      </div>
    </details>
  );
}

function FinanceCategoryBreakdown({ lang, title, categories, empty, onOpen }) {
  return (
    <section className="finance-category-breakdown">
      <h3>{title}</h3>
      {!categories.length ? <p className="small-note">{empty}</p> : (
        <div className="finance-category-list">
          {categories.map((category) => (
            <button type="button" className="finance-category-row" key={category.key} onClick={() => onOpen(category)}>
              <span>
                <strong>{financeCategoryLabel(category.key, lang)}</strong>
                <small>{category.entries.length} {category.entries.length === 1 ? adminCopy(lang, 'movimento', 'movement') : adminCopy(lang, 'movimenti', 'movements')} · {category.percentage}%</small>
              </span>
              <strong className={`finance-amount ${category.type}`}>{formatMoney(category.total)}</strong>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function FinanceDetailModal({ detail, lang, onClose }) {
  const [selectedEntry, setSelectedEntry] = useState(detail.selectedEntry || null);
  const numericTotal = typeof detail.total === 'number' ? detail.total : 0;
  const isCountOnly = detail.key === 'linked' || detail.key === 'linked-bookings' || detail.key === 'linked-fixed' || detail.key === 'unlinked' || detail.key === 'unlinked-expenses';
  useBodyScrollLock(true);
  useEffect(() => { setSelectedEntry(detail.selectedEntry || null); }, [detail]);
  return (
    <div className="modal-backdrop finance-detail-backdrop" role="presentation" onClick={onClose}>
      <section className="admin-modal finance-detail-modal full-screen-admin-modal" role="dialog" aria-modal="true" aria-labelledby="financeDetailTitle" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <span className="kicker">{selectedEntry ? adminCopy(lang, 'Dettaglio movimento', 'Movement detail') : adminCopy(lang, 'Dettaglio finanze', 'Finance details')}</span>
            <h2 id="financeDetailTitle">{selectedEntry ? selectedEntry.title || detail.title : detail.title}</h2>
            {!selectedEntry && <p>{isCountOnly ? `${detail.entries.length} ${adminCopy(lang, 'movimenti', 'entries')}` : formatMoney(numericTotal)}</p>}
          </div>
          <div className="modal-actions inline-actions">
            {selectedEntry && detail.entries.length > 1 && <button className="button secondary" type="button" onClick={() => setSelectedEntry(null)}>{adminCopy(lang, 'Indietro', 'Back')}</button>}
            <button className="modal-close-button" type="button" onClick={onClose}>{adminCopy(lang, 'Chiudi', 'Close')}</button>
          </div>
        </div>
        {selectedEntry ? <FinanceMovementDetail entry={selectedEntry} lang={lang} /> : (
          detail.entries.length === 0 ? <p>{adminCopy(lang, 'Nessun movimento disponibile.', 'No entries available.')}</p> : (
            <div className="finance-detail-entry-list">
              {detail.entries.map((entry) => <FinanceMovementRow key={entry.id} entry={entry} lang={lang} onClick={() => setSelectedEntry(entry)} />)}
            </div>
          )
        )}
      </section>
    </div>
  );
}

function FinanceMovementRow({ entry, lang, onClick }) {
  return (
    <button type="button" className="finance-detail-entry finance-movement-row finance-movement-row--clickable" onClick={onClick}>
      <div>
        <strong>{entry.title || '-'}</strong>
        <p>{formatDateForMessage(entry.entry_date, lang)} · {financeCategoryLabel(entry.category, lang)} · {entry.payment_method || adminCopy(lang, 'Metodo non indicato', 'No payment method')}</p>
        {financeEntryCustomerName(entry) && <p className="small-note">{financeEntryCustomerName(entry)}</p>}
        {entry.description && <p className="small-note">{entry.description}</p>}
        <p className="small-note">{financeEntryIsLinked(entry) ? adminCopy(lang, 'Collegata', 'Linked') : adminCopy(lang, 'Non collegata', 'Unlinked')}</p>
      </div>
      <strong className={`finance-amount ${entry.type}`}>{entry.type === 'expense' ? '-' : '+'}{formatMoney(entry.amount, entry.currency)}</strong>
    </button>
  );
}

function FinanceMovementDetail({ entry, lang }) {
  const booking = entry.linkedBooking;
  const fixed = entry.linkedFixedExcursion;
  const leaflet = entry.linkedLeaflet;
  const missing = adminCopy(lang, 'Non disponibile', 'Not available');
  const guests = [booking?.adults ? `${booking.adults} ${adminCopy(lang, 'adulti', 'adults')}` : '', booking?.children ? `${booking.children} ${adminCopy(lang, 'bambini', 'children')}` : ''].filter(Boolean).join(' · ');
  return (
    <div className="finance-movement-detail">
      <section className="finance-movement-hero">
        <div>
          <span className="kicker">{entry.type === 'expense' ? adminCopy(lang, 'Uscita', 'Expense') : adminCopy(lang, 'Entrata', 'Income')}</span>
          <h3>{entry.title || missing}</h3>
          <p>{formatDateForMessage(entry.entry_date, lang)} · {financeCategoryLabel(entry.category, lang)}</p>
        </div>
        <strong className={`finance-amount ${entry.type}`}>{entry.type === 'expense' ? '-' : '+'}{formatMoney(entry.amount, entry.currency)}</strong>
      </section>
      <div className="finance-detail-grid">
        <FinanceDetailSection title={adminCopy(lang, 'Informazioni pagamento', 'Payment information')}>
          <FinanceDetailRow label={adminCopy(lang, 'Tipo', 'Type')} value={entry.type === 'expense' ? adminCopy(lang, 'Uscita', 'Expense') : adminCopy(lang, 'Entrata', 'Income')} />
          <FinanceDetailRow label={adminCopy(lang, 'Data', 'Date')} value={formatDateForMessage(entry.entry_date, lang)} />
          <FinanceDetailRow label={adminCopy(lang, 'Importo', 'Amount')} value={formatMoney(entry.amount, entry.currency)} />
          <FinanceDetailRow label={adminCopy(lang, 'Valuta', 'Currency')} value={entry.currency || 'EUR'} />
          <FinanceDetailRow label={adminCopy(lang, 'Categoria', 'Category')} value={financeCategoryLabel(entry.category, lang)} />
          <FinanceDetailRow label={adminCopy(lang, 'Metodo pagamento', 'Payment method')} value={entry.payment_method || missing} />
          <FinanceDetailRow label={adminCopy(lang, 'Stato', 'Status')} value={financeEntryIsLinked(entry) ? adminCopy(lang, 'Collegata', 'Linked') : adminCopy(lang, 'Non collegata', 'Unlinked')} />
          <FinanceDetailRow label={adminCopy(lang, 'Archiviata', 'Archived')} value={entry.active === false ? adminCopy(lang, 'Sì', 'Yes') : adminCopy(lang, 'No', 'No')} />
          <FinanceDetailRow label={adminCopy(lang, 'Creata', 'Created')} value={entry.created_at ? formatDateForMessage(String(entry.created_at).slice(0, 10), lang) : missing} />
          <FinanceDetailRow label={adminCopy(lang, 'Aggiornata', 'Updated')} value={entry.updated_at ? formatDateForMessage(String(entry.updated_at).slice(0, 10), lang) : missing} />
        </FinanceDetailSection>
        <FinanceDetailSection title={adminCopy(lang, 'Cliente', 'Customer')}>
          {booking ? (
            <>
              <FinanceDetailRow label={adminCopy(lang, 'Nome', 'Name')} value={booking.customer_name || missing} />
              <FinanceDetailRow label="Email" value={booking.customer_email || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Telefono / WhatsApp', 'Phone / WhatsApp')} value={booking.customer_phone || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Contatto preferito', 'Preferred contact')} value={booking.preferred_contact || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Fonte conoscenza', 'Discovery source')} value={heardAboutUsDisplay(booking.heard_about_us, booking.heard_about_us_detail, lang, { fallback: missing })} />
            </>
          ) : <p className="small-note">{adminCopy(lang, 'Nessuna prenotazione collegata.', 'No linked booking.')}</p>}
        </FinanceDetailSection>
        <FinanceDetailSection title={adminCopy(lang, 'Prenotazione collegata', 'Linked booking')}>
          {booking ? (
            <>
              <FinanceDetailRow label={adminCopy(lang, 'Codice', 'Code')} value={booking.booking_code || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Esperienza', 'Experience')} value={adminExperienceLabel(booking.experience_id, lang)} />
              <FinanceDetailRow label={adminCopy(lang, 'Data richiesta / escursione', 'Requested / excursion date')} value={formatDateForMessage(booking.requested_date, lang) || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Ospiti', 'Guests')} value={guests || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Stato richiesta', 'Request status')} value={requestStatusLabels[booking.status]?.[lang] || booking.status || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Tipo richiesta', 'Request type')} value={booking.request_type || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Fonte conoscenza', 'Discovery source')} value={heardAboutUsDisplay(booking.heard_about_us, booking.heard_about_us_detail, lang, { fallback: missing })} />
              <FinanceDetailRow label={adminCopy(lang, 'Nota admin', 'Admin note')} value={booking.admin_note || missing} />
            </>
          ) : <p className="small-note">{adminCopy(lang, 'Nessuna prenotazione collegata.', 'No linked booking.')}</p>}
        </FinanceDetailSection>
        <FinanceDetailSection title={adminCopy(lang, 'Escursione fissa collegata', 'Linked fixed excursion')}>
          {fixed ? (
            <>
              <FinanceDetailRow label={adminCopy(lang, 'Titolo', 'Title')} value={fixedExcursionTitle(fixed, lang) || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Data', 'Date')} value={formatDateForMessage(fixed.date, lang) || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Orario', 'Time')} value={`${fixed.start_time ? String(fixed.start_time).slice(0, 5) : ''}${fixed.end_time ? `–${String(fixed.end_time).slice(0, 5)}` : ''}` || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Esperienza', 'Experience')} value={adminExperienceLabel(fixed.experience_id, lang)} />
              <FinanceDetailRow label={adminCopy(lang, 'Punto d’incontro', 'Meeting point')} value={fixedExcursionField(fixed, 'meeting_point', lang) || missing} />
              <FinanceDetailRow label={adminCopy(lang, 'Posti disponibili', 'Places remaining')} value={fixed.places_remaining !== undefined ? `${fixed.places_remaining}/${fixed.capacity || '-'}` : missing} />
            </>
          ) : <p className="small-note">{adminCopy(lang, 'Nessuna escursione fissa collegata.', 'No linked fixed excursion.')}</p>}
        </FinanceDetailSection>
        <FinanceDetailSection title={adminCopy(lang, 'Calendario mensile collegato', 'Linked monthly calendar')}>
          {leaflet ? <FinanceDetailRow label={adminCopy(lang, 'Calendario', 'Calendar')} value={leafletLabel(leaflet, lang)} /> : <p className="small-note">{adminCopy(lang, 'Nessun calendario mensile collegato.', 'No linked monthly calendar.')}</p>}
        </FinanceDetailSection>
        <FinanceDetailSection title={adminCopy(lang, 'Note', 'Notes')}>
          <p>{entry.description || adminCopy(lang, 'Nessuna nota.', 'No notes.')}</p>
          {entry.archive_reason && <p className="small-note">{adminCopy(lang, 'Motivo archivio', 'Archive reason')}: {entry.archive_reason}</p>}
        </FinanceDetailSection>
      </div>
    </div>
  );
}

function FinanceDetailSection({ title, children }) {
  return (
    <details className="finance-detail-section">
      <summary><span>{title}</span></summary>
      <div className="finance-detail-section-body">{children}</div>
    </details>
  );
}

function FinanceDetailRow({ label, value }) {
  return <div className="finance-detail-row"><span>{label}</span><strong>{value || '-'}</strong></div>;
}

function requestFinanceLabel(request, lang) {
  if (!request) return '-';
  return `${formatDateForMessage(request.requested_date, lang) || '-'} · ${request.customer_name || '-'} · ${adminExperienceLabel(request.experience_id, lang)}${request.booking_code ? ` · ${request.booking_code}` : ''}`;
}

function FinanceEntryCard({ entry, lang, onOpen, onEdit, onArchive }) {
  return (
    <article className={`finance-entry-card ${entry.active === false ? 'inactive' : ''}`}>
      <div className="request-card-head">
        <div><h3>{entry.title}</h3><p>{formatDateForMessage(entry.entry_date, lang)} · {financeCategoryLabel(entry.category, lang)}</p></div>
        <strong className={`finance-amount ${entry.type}`}>{entry.type === 'expense' ? '-' : '+'}{formatMoney(entry.amount, entry.currency)}</strong>
      </div>
      {entry.description && <p>{entry.description}</p>}
      <p className="small-note">{entry.payment_method || adminCopy(lang, 'Metodo non indicato', 'No payment method')} · {financeEntryIsLinked(entry) ? adminCopy(lang, 'Collegata', 'Linked') : adminCopy(lang, 'Non collegata', 'Unlinked')}{financeEntryCustomerName(entry) ? ` · ${financeEntryCustomerName(entry)}` : ''}</p>
      <div className="request-actions">
        <button className="button secondary" type="button" onClick={onOpen}>{adminCopy(lang, 'Dettaglio', 'Details')}</button>
        <button className="button secondary" type="button" onClick={onEdit}>{adminCopy(lang, 'Modifica', 'Edit')}</button>
        {entry.active !== false && <button className="button secondary danger" type="button" onClick={onArchive}>{adminCopy(lang, 'Archivia', 'Archive')}</button>}
      </div>
    </article>
  );
}

function TodayDashboard({ lang, session, navigate, adminContent = {} }) {
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
  const recentDecisions = requests.filter((request) => ['accepted', 'declined', 'cancelled', 'archived'].includes(request.status)).slice(0, 8);

  async function refreshAll(message = '') {
    await refresh();
    await loadBlocks();
    if (message) setFeedback(message);
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Oggi', 'Today')}</span>
          <AdminEditableText as="h1" itemKey="admin.today.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Pannello operativo', 'Operations')} />
          <AdminEditableText as="p" itemKey="admin.today.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Stato operativo rapido, richieste e attività da controllare oggi.', 'Fast operational status, requests, and activity to review today.')} />
        </div>
        <div className="admin-header-actions">
          <button className="button primary" type="button" onClick={() => setManualOpen(true)}>{adminCopy(lang, 'Aggiungi richiesta manuale', 'Add manual request')}</button>
          <button className="button secondary" type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Gestisci disponibilità', 'Manage availability')}</button>
        </div>
      </div>

      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {(error || blocksError) && <div className="admin-alert error" role="alert">{error || blocksError}</div>}

      <div className="admin-summary-grid admin-primary-stat-grid">
        <SummaryCard label={<AdminEditableText itemKey="admin.today.pendingToday.label" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Pending oggi', 'Pending today')} />} value={pendingToday.length} onClick={() => document.getElementById('adminTodayRequests')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} helper={<AdminEditableText as="small" itemKey="admin.today.pendingToday.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Apri richieste di oggi', 'Open today requests')} />} ariaLabel={`${contentText(adminContent, 'admin.today.pendingToday.label', lang, adminCopy(lang, 'Pending oggi', 'Pending today'))}: ${pendingToday.length}`} />
        <SummaryCard label={<AdminEditableText itemKey="admin.today.pendingTotal.label" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Pending totale', 'Pending total')} />} value={pending.length} onClick={() => navigate('/admin/requests')} helper={<AdminEditableText as="small" itemKey="admin.today.pendingTotal.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Vai alle richieste', 'Go to requests')} />} ariaLabel={`${contentText(adminContent, 'admin.today.pendingTotal.label', lang, adminCopy(lang, 'Pending totale', 'Pending total'))}: ${pending.length}`} />
        <SummaryCard label={<AdminEditableText itemKey="admin.today.acceptedToday.label" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Accettate oggi', 'Accepted today')} />} value={acceptedToday.length} onClick={() => navigate('/admin/upcoming')} helper={<AdminEditableText as="small" itemKey="admin.today.acceptedToday.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Vedi confermate', 'View accepted')} />} ariaLabel={`${contentText(adminContent, 'admin.today.acceptedToday.label', lang, adminCopy(lang, 'Accettate oggi', 'Accepted today'))}: ${acceptedToday.length}`} />
        <SummaryCard label={<AdminEditableText itemKey="admin.today.availabilityToday.label" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Disponibilità oggi', 'Availability issues today')} />} value={availabilityIssuesToday.length} onClick={() => navigate('/admin/availability')} helper={<AdminEditableText as="small" itemKey="admin.today.availabilityToday.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Gestisci calendario', 'Manage calendar')} />} ariaLabel={`${contentText(adminContent, 'admin.today.availabilityToday.label', lang, adminCopy(lang, 'Disponibilità oggi', 'Availability issues today'))}: ${availabilityIssuesToday.length}`} />
      </div>

      <div className="admin-two-column">
        <section className="admin-panel">
          <details className="admin-archive-details today-requests-details" id="adminTodayRequests">
            <summary><AdminEditableText itemKey="admin.today.todayRequests.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Richieste di oggi', 'Today requests')} /><strong>{todayRequests.length}</strong></summary>
            <div className="today-requests-collapsed-body">
              <div className="admin-panel-header today-requests-inner-header">
                <p className="small-note">{adminCopy(lang, 'Sezione chiusa di default. Aprila solo quando devi controllare le richieste con data oggi.', 'Collapsed by default. Open it only when you need to check requests dated today.')}</p>
                <button type="button" onClick={() => refreshAll()}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
              </div>
              {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : todayRequests.length === 0 ? <p>{adminCopy(lang, 'Nessuna richiesta con data oggi.', 'No requests dated today.')}</p> : (
                <div className="request-card-list">
                  {todayRequests.map((request) => <RequestCard key={request.id} request={request} lang={lang} onApprove={() => setDecision({ type: 'approve', request })} onDecline={() => setDecision({ type: 'decline', request })} />)}
                </div>
              )}
            </div>
          </details>

          <div className="admin-panel-subsection">
            <div className="admin-panel-header">
              <AdminEditableText as="h2" itemKey="admin.today.pendingRequests.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Richieste pending da confermare', 'Pending requests needing attention')} />
              <button type="button" onClick={() => navigate('/admin/requests')}>{adminCopy(lang, 'Tutte', 'All')}</button>
            </div>
            {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : pending.length === 0 ? <p>{adminCopy(lang, 'Nessuna richiesta in attesa.', 'No pending requests.')}</p> : (
              <div className="request-card-list">
                {pending.map((request) => <RequestCard key={request.id} request={request} lang={lang} onApprove={() => setDecision({ type: 'approve', request })} onDecline={() => setDecision({ type: 'decline', request })} />)}
              </div>
            )}
          </div>
        </section>

        <aside className="admin-panel compact-panel admin-operations-panel">
          <div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.today.upcomingOperations.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Operazioni imminenti', 'Upcoming operations')} /></div>
          <details className="admin-archive-details admin-operation-group">
            <summary><AdminEditableText itemKey="admin.today.acceptedBookings.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Prenotazioni accettate', 'Accepted bookings')} /><strong>{operational.length}</strong></summary>
            <AdminMiniList
              items={operational}
              empty={adminCopy(lang, 'Nessuna conferma nei prossimi 7 giorni.', 'No accepted bookings in the next 7 days.')}
              render={(request) => <span><strong>{formatDateForMessage(request.requested_date, lang)}</strong> · {request.customer_name || '-'} · {adminExperienceLabel(request.experience_id, lang)}</span>}
            />
            <button className="button secondary admin-inline-button" type="button" onClick={() => navigate('/admin/upcoming')}>{adminCopy(lang, 'Apri prossime prenotazioni', 'Open upcoming bookings')}</button>
          </details>
          <details className="admin-archive-details admin-operation-group">
            <summary><AdminEditableText itemKey="admin.today.nearTermBlocks.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Blocchi prossimi', 'Near-term blocks')} /><strong>{next14.length}</strong></summary>
            <AdminMiniList
              items={blocks.slice(0, 8)}
              empty={adminCopy(lang, 'Nessun blocco attivo nei prossimi 30 giorni.', 'No active blocks in the next 30 days.')}
              render={(block) => <span><strong>{formatDateForMessage(block.date, lang)}</strong> · {adminAvailabilityStatusLabels[block.status]?.[lang] || block.status} · {block.experience_id ? adminExperienceLabel(block.experience_id, lang) : adminCopy(lang, 'Tutte', 'All')}</span>}
            />
          </details>
          <details className="admin-archive-details admin-operation-group">
            <summary><AdminEditableText itemKey="admin.today.recentDecisions.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Decisioni recenti', 'Recent decisions')} /><strong>{recentDecisions.length}</strong></summary>
            <AdminMiniList
              items={recentDecisions}
              empty={adminCopy(lang, 'Nessuna decisione recente.', 'No recent decisions.')}
              render={(request) => <span><strong>{requestStatusLabels[request.status]?.[lang] || request.status}</strong> · {request.customer_name || '-'} · {formatDateForMessage(request.requested_date, lang) || '-'}{request.decision_note ? ` · ${request.decision_note}` : ''}</span>}
            />
          </details>
          <div className="admin-action-groups">
            <AdminActionGroup title={adminCopy(lang, 'Richieste', 'Requests')}>
              <button type="button" onClick={() => setManualOpen(true)}>{adminCopy(lang, 'Aggiungi richiesta', 'Add request')}</button>
              <button type="button" onClick={() => navigate('/admin/requests')}>{adminCopy(lang, 'Storico richieste', 'Request history')}</button>
            </AdminActionGroup>
            <AdminActionGroup title={adminCopy(lang, 'Disponibilità', 'Availability')}>
              <button type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Blocca data', 'Block date')}</button>
              <button type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Segna limitata', 'Mark limited')}</button>
              <button type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Segna su richiesta', 'Mark on request')}</button>
              <a href="/#availability" target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Apri calendario pubblico', 'Open public calendar')}</a>
            </AdminActionGroup>
            <AdminActionGroup title={adminCopy(lang, 'Contatti rapidi', 'Quick contacts')}>
              <button type="button" onClick={() => copyText(PHONE_TEL)}>{adminCopy(lang, 'Copia WhatsApp Leonardo', 'Copy Leonardo WhatsApp')}</button>
              <button type="button" onClick={() => copyText(EMAIL)}>{adminCopy(lang, 'Copia email business', 'Copy business email')}</button>
            </AdminActionGroup>
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

function UpcomingPage({ lang, session, navigate, adminContent = {} }) {
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
  const pastAccepted = requests
    .filter((request) => request.status === 'accepted' && request.requested_date && request.requested_date < todayIso())
    .sort((a, b) => String(b.requested_date).localeCompare(String(a.requested_date)) || String(b.created_at).localeCompare(String(a.created_at)));
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
          <AdminEditableText as="h1" itemKey="admin.upcoming.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Prossime prenotazioni', 'Upcoming bookings')} />
          <AdminEditableText as="p" itemKey="admin.upcoming.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Richieste accettate e blocchi attivi, organizzati per giorno. Nessuna statistica: solo operatività.', 'Accepted requests and active blocks, organized by date. No analytics: just operations.')} />
        </div>
        <div className="admin-header-actions">
          <button className="button secondary" type="button" onClick={refreshAll}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
          <button className="button primary" type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Gestisci disponibilità', 'Manage availability')}</button>
        </div>
      </div>
      {(error || blocksError) && <div className="admin-alert error" role="alert">{error || blocksError}</div>}
      <div className="admin-two-column">
        <section className="admin-panel upcoming-collapsed-panel">
          <details className="admin-archive-details admin-upcoming-group">
            <summary><AdminEditableText itemKey="admin.upcoming.accepted.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Prenotazioni accettate', 'Accepted bookings')} /><strong>{upcoming.length}</strong></summary>
            {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : upcoming.length === 0 ? <p>{adminCopy(lang, 'Nessuna prenotazione accettata futura.', 'No future accepted bookings.')}</p> : (
              <div className="upcoming-group-list">
                {groups.map((group) => group.items.length > 0 && (
                  <details className="admin-archive-details nested-upcoming-group" key={group.key}>
                    <summary><span>{group.title[lang]}</span><strong>{group.items.length}</strong></summary>
                    <div className="request-card-list compact-list">
                      {group.items.map((request) => <RequestCard key={request.id} request={request} lang={lang} compact />)}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </details>
          <details className="admin-archive-details admin-upcoming-group">
            <summary><AdminEditableText itemKey="admin.upcoming.past.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Esperienze passate', 'Past experiences')} /><strong>{pastAccepted.length}</strong></summary>
            {pastAccepted.length === 0 ? <p className="small-note">{adminCopy(lang, 'Nessuna esperienza passata.', 'No past experiences.')}</p> : (
              <div className="request-card-list compact-list">
                {pastAccepted.map((request) => <RequestCard key={request.id} request={request} lang={lang} compact />)}
              </div>
            )}
          </details>
        </section>
        <aside className="admin-panel compact-panel">
          <AdminEditableText as="h2" itemKey="admin.upcoming.blocks.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Blocchi e limitazioni', 'Blocks and limitations')} />
          <AdminMiniList
            items={nearBlocks}
            empty={adminCopy(lang, 'Nessun blocco attivo nei prossimi 30 giorni.', 'No active blocks in the next 30 days.')}
            render={(block) => <span><strong>{formatDateForMessage(block.date, lang)}</strong> · {adminAvailabilityStatusLabels[block.status]?.[lang] || block.status} · {block.experience_id ? adminExperienceLabel(block.experience_id, lang) : adminCopy(lang, 'Tutte le esperienze', 'All experiences')}</span>}
          />
          <div className="admin-action-groups">
            <AdminActionGroup title={adminCopy(lang, 'Scorciatoie', 'Shortcuts')}>
              <button type="button" onClick={() => navigate('/admin/today')}>{adminCopy(lang, 'Torna a oggi', 'Back to Today')}</button>
              <button type="button" onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Blocca / limita data', 'Block / limit date')}</button>
              <a href="/#availability" target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Apri calendario pubblico', 'Open public calendar')}</a>
            </AdminActionGroup>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SummaryCard({ label, value, onClick, helper, ariaLabel }) {
  const labelNode = React.isValidElement(label) ? label : <span>{label}</span>;
  const helperNode = helper ? (React.isValidElement(helper) ? helper : <small>{helper}</small>) : null;
  const resolvedAriaLabel = ariaLabel || (typeof label === 'string' ? `${label}: ${value}` : String(value || ''));
  const content = <><strong>{value}</strong>{labelNode}{helperNode}</>;
  if (onClick) {
    return <button type="button" className="summary-card clickable-summary-card" onClick={onClick} aria-label={resolvedAriaLabel}>{content}</button>;
  }
  return <article className="summary-card">{content}</article>;
}

function AdminActionGroup({ title, children }) {
  return <section className="admin-action-group"><h3>{title}</h3><div className="admin-quick-actions grouped-actions">{children}</div></section>;
}

function AdminMiniList({ items, empty, render }) {
  if (!items.length) return <p className="small-note">{empty}</p>;
  return <ul className="admin-mini-list">{items.map((item) => <li key={item.id}>{render(item)}</li>)}</ul>;
}

function RequestCard({ request, lang, onApprove, onDecline, onRemove, compact = false }) {
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
        <div><dt>{adminCopy(lang, 'Tipo', 'Type')}</dt><dd>{request.request_type === 'fixed' ? adminCopy(lang, 'Escursione fissa', 'Fixed excursion') : adminCopy(lang, 'Escursione privata', 'Private excursion')}</dd></div>
        <div><dt>{adminCopy(lang, 'Fonte', 'Source')}</dt><dd>{request.source || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Fonte conoscenza', 'Discovery source')}</dt><dd>{heardAboutUsDisplay(request.heard_about_us, request.heard_about_us_detail, lang, { fallback: adminCopy(lang, 'Non disponibile', 'Not available') })}</dd></div>
        <div><dt>{adminCopy(lang, 'Contatto', 'Contact')}</dt><dd>{request.preferred_contact || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Esperienza', 'Experience')}</dt><dd>{adminExperienceLabel(request.experience_id, lang)}</dd></div>
        <div><dt>{adminCopy(lang, 'Data richiesta', 'Requested date')}</dt><dd>{formatDateForMessage(request.requested_date, lang) || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Alternativa', 'Alternative')}</dt><dd>{formatDateForMessage(request.alternative_date, lang) || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Lingua', 'Language')}</dt><dd>{request.language || 'it'}</dd></div>
        <div><dt>{adminCopy(lang, 'Gruppo', 'Party')}</dt><dd>{[request.adults ? `${request.adults} adulti/adults` : '', request.children ? `${request.children} bambini/children` : ''].filter(Boolean).join(' · ') || request.party_type || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Totale', 'Total')}</dt><dd>{Number(request.adults || 0) + Number(request.children || 0) || '-'}</dd></div>
        {request.booking_code && <div><dt>{adminCopy(lang, 'Codice prenotazione', 'Booking code')}</dt><dd>{request.booking_code}</dd></div>}
        <div><dt>{adminCopy(lang, 'Privata', 'Private')}</dt><dd>{request.private_experience === true ? adminCopy(lang, 'Sì', 'Yes') : request.private_experience === false ? adminCopy(lang, 'No', 'No') : '-'}</dd></div>
        {request.fixed_excursion_id && <div><dt>{adminCopy(lang, 'Escursione fissa', 'Fixed excursion')}</dt><dd>{request.fixed_excursion_id}</dd></div>}
      </dl>
      {request.children_under_3 && <div className="admin-alert warning compact-alert">{adminCopy(lang, 'Attenzione: bambini sotto i 3 anni. Percorso da valutare con particolare cura.', 'Warning: children under 3. Route must be assessed carefully.')}</div>}
      {request.message && <p className="request-message">{request.message}</p>}
      {request.admin_note && <p className="small-note"><strong>Note:</strong> {request.admin_note}</p>}
      {request.status !== 'pending' && (
        <p className="small-note decision-note"><strong>{adminCopy(lang, 'Decisione', 'Decision')}:</strong> {request.decision_note || '-'} · {request.decided_at ? formatDateForMessage(String(request.decided_at).slice(0, 10), lang) : '-'}{request.decided_by ? ` · ${request.decided_by}` : ''}</p>
      )}
      <ReplyTools request={request} lang={lang} />
      {request.status === 'pending' && (
        <div className="request-actions">
          <button className="button primary" type="button" onClick={onApprove}>{adminCopy(lang, 'Approva', 'Approve')}</button>
          <button className="button secondary" type="button" onClick={onDecline}>{adminCopy(lang, 'Rifiuta', 'Decline')}</button>
        </div>
      )}
      {request.status === 'accepted' && onRemove && (
        <div className="request-actions">
          <button className="button secondary danger" type="button" onClick={onRemove}>{adminCopy(lang, 'Rimuovi / annulla', 'Remove / cancel')}</button>
        </div>
      )}
    </article>
  );
}

function ReplyTools({ request, lang }) {
  const [copied, setCopied] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const replyLang = requestLang(request, lang);
  const approval = buildApprovalReply(request, lang);
  const decline = buildDeclineReply(request, lang);
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
          {customerEmail ? <button type="button" onClick={() => openDefaultEmailApp(customerEmail, subject, prepared)}>{adminCopy(lang, 'Apri app email predefinita', 'Open default email app')}</button> : <span>{adminCopy(lang, 'Email cliente non disponibile.', 'Customer email unavailable.')}</span>}
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
  useBodyScrollLock(true);

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
      } else if (decision.type === 'remove') {
        await cancelBookingRequest({ request: decision.request, userId: session.user.id, decisionNote: note });
        onDone(adminCopy(lang, 'Richiesta rimossa/annullata.', 'Request removed/cancelled.'));
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
          <h2 id="decisionTitle">{decision.type === 'approve' ? adminCopy(lang, 'Approva richiesta', 'Approve request') : decision.type === 'remove' ? adminCopy(lang, 'Rimuovi richiesta accettata', 'Remove accepted request') : adminCopy(lang, 'Rifiuta richiesta', 'Decline request')}</h2>
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
        ) : decision.type === 'remove' ? (
          <div className="admin-alert warning compact-alert">{adminCopy(lang, 'Questa azione annulla la richiesta accettata e libera i posti collegati.', 'This cancels the accepted request and frees its linked places.')}</div>
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
  customer_name: '', customer_phone: '', customer_email: '', preferred_contact: 'whatsapp', source: 'whatsapp', request_type: 'private', party_type: 'solo', experience_id: 'unsure', requested_date: '', alternative_date: '', language: 'it', adults: '', children: '', children_under_3: false, private_experience: false, main_interest: '', preferred_pace: '', message: '', heard_about_us: 'not_specified', heard_about_us_label: '', heard_about_us_detail: '', admin_note: ''
};

function ManualRequestModal({ lang, session, onClose, onSaved }) {
  const [form, setForm] = useState({ ...emptyManualRequest, language: lang });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useBodyScrollLock(true);

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
      const cleanHeardAboutUs = normalizeHeardAboutUs(form.heard_about_us || 'not_specified', { allowAdmin: true }) || 'not_specified';
      await createManualBookingRequest({ ...form, heard_about_us: cleanHeardAboutUs, heard_about_us_label: heardAboutUsLabel(cleanHeardAboutUs, lang), heard_about_us_detail: needsHeardAboutUsDetail(cleanHeardAboutUs) ? cleanHeardAboutUsDetail(form.heard_about_us_detail) : null }, session.user.id);
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
          <AdminSelect label={text(lang, 'heardAboutUsAdmin')} value={form.heard_about_us || 'not_specified'} onChange={(value) => { update('heard_about_us', value); update('heard_about_us_label', heardAboutUsLabel(value, lang)); if (!needsHeardAboutUsDetail(value)) update('heard_about_us_detail', ''); }} options={heardAboutUsOptions({ includeAdmin: true }).map((option) => option.value)} formatter={(value) => heardAboutUsLabel(value, lang)} />
          {needsHeardAboutUsDetail(form.heard_about_us) && <AdminInput label={text(lang, 'heardAboutUsOtherLabel')} value={form.heard_about_us_detail || ''} onChange={(value) => update('heard_about_us_detail', value)} />}
          <AdminSelect label={adminCopy(lang, 'Tipo richiesta', 'Request type')} value={form.request_type} onChange={(value) => update('request_type', value)} options={['private', 'fixed']} formatter={(value) => value === 'fixed' ? adminCopy(lang, 'Escursione fissa', 'Fixed excursion') : adminCopy(lang, 'Escursione privata', 'Private excursion')} />
          <AdminSelect label={adminCopy(lang, 'Tipo gruppo', 'Party type')} value={form.party_type} onChange={(value) => update('party_type', value)} options={['solo', 'couple', 'family', 'group', 'company', 'school', 'other']} formatter={(value) => ({ solo: adminCopy(lang, 'Singolo', 'Solo traveler'), couple: adminCopy(lang, 'Coppia', 'Couple'), family: adminCopy(lang, 'Famiglia', 'Family'), group: adminCopy(lang, 'Gruppo', 'Group'), company: adminCopy(lang, 'Azienda', 'Company'), school: adminCopy(lang, 'Scuola', 'School'), other: adminCopy(lang, 'Altro', 'Other') }[value] || value)} />
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

function AdminInput({ label, value, onChange, type = 'text', placeholder = '' }) {
  const id = useMemo(() => `field-${Math.random().toString(36).slice(2)}`, []);
  return <label className="admin-field" htmlFor={id}><span>{label}</span><input id={id} type={type} value={value || ''} placeholder={placeholder} min={type === 'number' ? '0' : undefined} onChange={(event) => onChange(event.target.value)} /></label>;
}

function AdminSelect({ label, value, onChange, options, formatter = (item) => item }) {
  const id = useMemo(() => `field-${Math.random().toString(36).slice(2)}`, []);
  return <label className="admin-field" htmlFor={id}><span>{label}</span><select id={id} value={value || ''} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{formatter(option)}</option>)}</select></label>;
}


function RequestStatusAccordions({ requests, lang, onApprove, onDecline, onRemove }) {
  const groups = [
    { status: 'pending', label: adminCopy(lang, 'In attesa', 'Pending'), defaultOpen: true },
    { status: 'accepted', label: adminCopy(lang, 'Approvate / accettate', 'Approved / accepted'), defaultOpen: false },
    { status: 'declined', label: adminCopy(lang, 'Rifiutate', 'Declined'), defaultOpen: false },
    { status: 'cancelled', label: adminCopy(lang, 'Rimosse / annullate', 'Removed / cancelled'), defaultOpen: false },
    { status: 'archived', label: adminCopy(lang, 'Archiviate', 'Archived'), defaultOpen: false }
  ].map((group) => ({ ...group, items: requests.filter((request) => request.status === group.status) }))
    .filter((group) => group.items.length || group.status === 'pending');

  return (
    <div className="request-accordion-stack">
      {groups.map((group) => (
        <details className="request-accordion" key={group.status} open={group.defaultOpen}>
          <summary><span>{group.label}</span><strong>{group.items.length}</strong></summary>
          {group.items.length === 0 ? <p className="small-note">{adminCopy(lang, 'Nessuna richiesta in questa sezione.', 'No requests in this section.')}</p> : (
            <div className="request-card-list compact-list">
              {group.items.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  lang={lang}
                  compact
                  onApprove={() => onApprove(request)}
                  onDecline={() => onDecline(request)}
                  onRemove={() => onRemove(request)}
                />
              ))}
            </div>
          )}
        </details>
      ))}
    </div>
  );
}

function AdminReviewsPanel({ lang, adminContent = {} }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [confirmReview, setConfirmReview] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [savingReplyId, setSavingReplyId] = useState('');

  useBodyScrollLock(Boolean(confirmReview));

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setReviews(await listReviews({ activeOnly: false }));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Recensioni non caricate.', 'Could not load reviews.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function setVisible(review, active) {
    setError('');
    setFeedback('');
    try {
      await updateReviewVisibility(review.id, { active, approved: active ? true : review.approved });
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Recensione non aggiornata.', 'Review not updated.'));
    }
  }

  async function confirmDeleteReview() {
    if (!confirmReview) return;
    setError('');
    setFeedback('');
    try {
      await deleteReview(confirmReview.id);
      setConfirmReview(null);
      setFeedback(adminCopy(lang, 'Recensione eliminata.', 'Review deleted.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Impossibile eliminare la recensione. Riprova.', 'Could not delete the review. Please try again.'));
    }
  }


  function replyDraft(review) {
    return replyDrafts[review.id] ?? review.admin_reply ?? '';
  }

  function updateReplyDraft(review, value) {
    setReplyDrafts((current) => ({ ...current, [review.id]: value }));
  }

  async function saveReply(review) {
    setError('');
    setFeedback('');
    setSavingReplyId(review.id);
    try {
      await updateReviewAdminReply(review.id, replyDraft(review));
      setFeedback(adminCopy(lang, 'Risposta salvata.', 'Response saved.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Risposta non salvata. Controlla Supabase e riprova.', 'Response not saved. Check Supabase and try again.'));
    } finally {
      setSavingReplyId('');
    }
  }

  async function clearReply(review) {
    setError('');
    setFeedback('');
    setSavingReplyId(review.id);
    try {
      await deleteReviewAdminReply(review.id);
      setReplyDrafts((current) => ({ ...current, [review.id]: '' }));
      setFeedback(adminCopy(lang, 'Risposta eliminata.', 'Response deleted.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Risposta non eliminata. Riprova.', 'Response not deleted. Please try again.'));
    } finally {
      setSavingReplyId('');
    }
  }

  return (
    <section className="admin-panel admin-reviews-panel">
      <div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.reviews.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Gestione recensioni', 'Review management')} /><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : reviews.length === 0 ? <p>{adminCopy(lang, 'Nessuna recensione ricevuta.', 'No reviews received.')}</p> : (
        <>
          <p className="small-note admin-review-delete-note">{adminCopy(lang, 'Per eliminare una recensione pubblica, usa il pulsante rosso “Elimina definitivamente” sulla card della recensione.', 'To delete a public review, use the red “Delete permanently” button on that review card.')}</p>
          <div className="admin-review-list">
            {reviews.map((review) => (
              <article className={`admin-review-card ${review.active ? '' : 'inactive'}`} key={review.id}>
                <div>
                  <div className="admin-review-title-row">
                    <strong>{review.reviewer_name || 'Guest'} · {review.rating || '-'}/5</strong>
                    <span className={`status-pill ${review.active && review.approved ? 'accepted' : 'cancelled'}`}>{review.active && review.approved ? adminCopy(lang, 'Pubblica sul sito', 'Public on website') : adminCopy(lang, 'Non pubblica', 'Not public')}</span>
                  </div>
                  <div className="admin-review-body">{normalizeReviewText(review.review_text).map((paragraph, index) => <p key={`${review.id}-body-${index}`}>{paragraph}</p>)}</div>
                  {review.admin_reply && (
                    <div className="admin-review-existing-reply">
                      <strong>{adminCopy(lang, 'Risposta vulcanIQ', 'vulcanIQ response')}</strong>
                      {normalizeReviewText(review.admin_reply).map((paragraph, index) => <p key={`${review.id}-reply-${index}`}>{paragraph}</p>)}
                    </div>
                  )}
                  <p className="small-note">{review.booking_code} · {review.language || '-'}</p>
                  <label className="field-label" htmlFor={`reviewReply-${review.id}`}>{review.admin_reply ? adminCopy(lang, 'Modifica risposta', 'Edit response') : adminCopy(lang, 'Rispondi alla recensione', 'Reply to review')}</label>
                  <textarea id={`reviewReply-${review.id}`} className="admin-review-reply-input" value={replyDraft(review)} onChange={(event) => updateReplyDraft(review, event.target.value)} placeholder={adminCopy(lang, 'Scrivi una risposta pubblica da mostrare sotto la recensione.', 'Write a public response to show below the review.')} />
                </div>
                <div className="admin-review-actions">
                  <button className="button secondary" type="button" onClick={() => setVisible(review, !review.active)}>{review.active ? adminCopy(lang, 'Nascondi', 'Hide') : adminCopy(lang, 'Ripubblica', 'Republish')}</button>
                  <button className="button primary" type="button" onClick={() => saveReply(review)} disabled={savingReplyId === review.id}>{savingReplyId === review.id ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Salva risposta', 'Save response')}</button>
                  <button className="button secondary" type="button" onClick={() => clearReply(review)} disabled={savingReplyId === review.id || !replyDraft(review)}>{adminCopy(lang, 'Elimina risposta', 'Delete response')}</button>
                  <button className="button primary danger" type="button" onClick={() => setConfirmReview(review)}>{adminCopy(lang, 'Elimina definitivamente', 'Delete permanently')}</button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {confirmReview && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={adminCopy(lang, 'Conferma eliminazione', 'Confirm deletion')}>
          <article className="admin-modal review-delete-modal">
            <div className="admin-modal-header">
              <h2>{adminCopy(lang, 'Conferma eliminazione', 'Confirm deletion')}</h2>
              <button className="modal-close-button" type="button" onClick={() => setConfirmReview(null)}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>
            </div>
            <p>{adminCopy(lang, 'Sei sicuro di voler eliminare questa recensione? Questa azione non può essere annullata.', 'Are you sure you want to delete this review? This action cannot be undone.')}</p>
            <blockquote className="review-delete-preview">{confirmReview.review_text}</blockquote>
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setConfirmReview(null)}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>
              <button className="button primary danger" type="button" onClick={confirmDeleteReview}>{adminCopy(lang, 'Conferma eliminazione', 'Confirm deletion')}</button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

function RequestsPage({ lang, session, adminContent = {} }) {
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
          <AdminEditableText as="h1" itemKey="admin.requests.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Richieste', 'Requests')} />
          <AdminEditableText as="p" itemKey="admin.requests.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Cerca e filtra richieste da sito, WhatsApp, telefono o email.', 'Search and filter requests from the website, WhatsApp, phone, or email.')} />
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
        <div className="admin-panel-header"><h2><AdminEditableText itemKey="admin.requests.results.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Risultati', 'Results')} /> · {requests.length}</h2><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
        {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : requests.length === 0 ? <p>{adminCopy(lang, 'Nessuna richiesta trovata.', 'No requests found.')}</p> : (
          <RequestStatusAccordions
            requests={requests}
            lang={lang}
            onApprove={(request) => setDecision({ type: 'approve', request })}
            onDecline={(request) => setDecision({ type: 'decline', request })}
            onRemove={(request) => setDecision({ type: 'remove', request })}
          />
        )}
      </section>
      {decision && <DecisionModal lang={lang} session={session} decision={decision} onClose={() => setDecision(null)} onDone={(message) => { setDecision(null); refreshWithFeedback(message); }} />}
      {manualOpen && <ManualRequestModal lang={lang} session={session} onClose={() => setManualOpen(false)} onSaved={() => { setManualOpen(false); refreshWithFeedback(adminCopy(lang, 'Richiesta manuale creata.', 'Manual request created.')); }} />}
    </section>
  );
}

function isValidOptionalUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function PartnershipsAdminPage({ lang, session, adminContent = {} }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const emptyForm = { name: '', category_it: '', category_en: '', description_it: '', description_en: '', website_url: '', image_url: '', image_path: '', image_name: '', image_type: '', imageFile: null, display_order: '0', active: true };
  const [form, setForm] = useState(emptyForm);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const data = await listPartnerships({ activeOnly: false });
      setItems(data);
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Collaborazioni non caricate.', 'Could not load partnerships.'));
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
    if (!form.name.trim()) {
      setError(adminCopy(lang, 'Il nome è obbligatorio.', 'Name is required.'));
      return;
    }
    if (!isValidOptionalUrl(form.website_url) || (!form.imageFile && !isValidOptionalUrl(form.image_url))) {
      setError(adminCopy(lang, 'Inserisci URL validi che iniziano con http o https.', 'Enter valid URLs starting with http or https.'));
      return;
    }
    try {
      const imagePayload = form.imageFile ? await uploadPartnershipImage(form.imageFile, session.user.id) : {};
      const { imageFile, ...payload } = form;
      await createPartnership({ ...payload, ...imagePayload, created_by: session.user.id, updated_by: session.user.id });
      setForm(emptyForm);
      setFeedback(adminCopy(lang, 'Collaborazione creata.', 'Partnership created.'));
      refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Collaborazione non salvata.', 'Partnership not saved.'));
    }
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Partnership pubbliche', 'Public partnerships')}</span>
          <AdminEditableText as="h1" itemKey="admin.partnerships.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Collaborazioni', 'Partnerships')} />
          <AdminEditableText as="p" itemKey="admin.partnerships.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Crea, modifica e disattiva le collaborazioni visibili sul sito pubblico.', 'Create, edit, and deactivate collaborations visible on the public website.')} />
        </div>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      <div className="admin-two-column availability-columns">
        <section className="admin-panel">
          <AdminEditableText as="h2" itemKey="admin.partnerships.create.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Crea collaborazione', 'Create partnership')} />
          <form className="admin-form-grid" onSubmit={submit}>
            <AdminInput label={adminCopy(lang, 'Nome', 'Name')} value={form.name} onChange={(value) => update('name', value)} />
            <AdminInput label="Category IT" value={form.category_it} onChange={(value) => update('category_it', value)} />
            <AdminInput label="Category EN" value={form.category_en} onChange={(value) => update('category_en', value)} />
            <label className="admin-field full"><span>Description IT</span><textarea value={form.description_it} onChange={(event) => update('description_it', event.target.value)} rows={3} /></label>
            <label className="admin-field full"><span>Description EN</span><textarea value={form.description_en} onChange={(event) => update('description_en', event.target.value)} rows={3} /></label>
            <AdminInput label="Website URL" value={form.website_url} onChange={(value) => update('website_url', value)} />
            <AdminInput label={adminCopy(lang, 'URL immagine opzionale', 'Optional image URL')} value={form.image_url} onChange={(value) => update('image_url', value)} />
            <label className="admin-field full"><span>{adminCopy(lang, 'Immagine collaborazione', 'Partnership image')}</span><input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => update('imageFile', event.target.files?.[0] || null)} /></label>
            {form.imageFile && <p className="small-note full">{adminCopy(lang, 'File selezionato', 'Selected file')}: {form.imageFile.name}</p>}
            <AdminInput label={adminCopy(lang, 'Ordine', 'Display order')} type="number" value={form.display_order} onChange={(value) => update('display_order', value)} />
            <label className="check-field"><input type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
            <div className="modal-actions full"><button className="button primary" type="submit">{adminCopy(lang, 'Salva collaborazione', 'Save partnership')}</button></div>
          </form>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.partnerships.saved.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Collaborazioni salvate', 'Saved partnerships')} /><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
          {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : items.length === 0 ? <p>{adminCopy(lang, 'Nessuna collaborazione salvata.', 'No partnerships saved.')}</p> : (
            <div className="availability-block-list">
              {items.map((item) => <PartnershipAdminCard key={item.id} item={item} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function PartnershipAdminCard({ item, lang, userId, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: item.name || '',
    category_it: item.category_it || '',
    category_en: item.category_en || '',
    description_it: item.description_it || '',
    description_en: item.description_en || '',
    website_url: item.website_url || '',
    image_url: item.image_url || '',
    image_path: item.image_path || '',
    image_name: item.image_name || '',
    image_type: item.image_type || '',
    imageFile: null,
    removeImage: false,
    display_order: String(item.display_order || 0),
    active: item.active !== false
  });
  const [error, setError] = useState('');

  async function save() {
    setError('');
    if (!form.name.trim()) {
      setError(adminCopy(lang, 'Il nome è obbligatorio.', 'Name is required.'));
      return;
    }
    if (!isValidOptionalUrl(form.website_url) || (!form.imageFile && !form.removeImage && !isValidOptionalUrl(form.image_url))) {
      setError(adminCopy(lang, 'URL non valido.', 'Invalid URL.'));
      return;
    }
    try {
      let imagePayload = {};
      if (form.imageFile) {
        imagePayload = await uploadPartnershipImage(form.imageFile, userId);
        if (item.image_path) await removePartnershipImage(item.image_path);
      } else if (form.removeImage) {
        if (item.image_path) await removePartnershipImage(item.image_path);
        imagePayload = { image_url: null, image_path: null, image_name: null, image_type: null };
      }
      const { imageFile, removeImage, ...payload } = form;
      await updatePartnership(item.id, { ...payload, ...imagePayload, updated_by: userId });
      setEditing(false);
      onChanged(adminCopy(lang, 'Collaborazione aggiornata.', 'Partnership updated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Aggiornamento non riuscito.', 'Update failed.'));
    }
  }

  async function deactivate() {
    setError('');
    try {
      await deactivatePartnership(item.id, userId);
      onChanged(adminCopy(lang, 'Collaborazione disattivata.', 'Partnership deactivated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Disattivazione non riuscita.', 'Deactivate failed.'));
    }
  }

  return (
    <article className={`availability-block-card ${item.active ? '' : 'inactive'}`}>
      <div className="request-card-head">
        <div><h3>{item.name}</h3><p>{lang === 'it' ? item.category_it || item.category_en : item.category_en || item.category_it}</p></div>
        <span className={`status-pill ${item.active ? 'accepted' : 'cancelled'}`}>{item.active ? adminCopy(lang, 'Attiva', 'Active') : adminCopy(lang, 'Inattiva', 'Inactive')}</span>
      </div>
      {editing ? (
        <div className="admin-form-grid single-card-form">
          <AdminInput label={adminCopy(lang, 'Nome', 'Name')} value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
          <AdminInput label="Category IT" value={form.category_it} onChange={(value) => setForm((current) => ({ ...current, category_it: value }))} />
          <AdminInput label="Category EN" value={form.category_en} onChange={(value) => setForm((current) => ({ ...current, category_en: value }))} />
          <label className="admin-field full"><span>Description IT</span><textarea value={form.description_it} onChange={(event) => setForm((current) => ({ ...current, description_it: event.target.value }))} rows={3} /></label>
          <label className="admin-field full"><span>Description EN</span><textarea value={form.description_en} onChange={(event) => setForm((current) => ({ ...current, description_en: event.target.value }))} rows={3} /></label>
          <AdminInput label="Website URL" value={form.website_url} onChange={(value) => setForm((current) => ({ ...current, website_url: value }))} />
          <AdminInput label={adminCopy(lang, 'URL immagine', 'Image URL')} value={form.image_url} onChange={(value) => setForm((current) => ({ ...current, image_url: value }))} />
          <label className="admin-field full"><span>{adminCopy(lang, 'Sostituisci immagine', 'Replace image')}</span><input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => setForm((current) => ({ ...current, imageFile: event.target.files?.[0] || null, removeImage: false }))} /></label>
          {form.image_url && !form.removeImage && <p className="small-note full"><a href={form.image_url} target="_blank" rel="noopener noreferrer">{form.image_name || adminCopy(lang, 'Immagine esistente', 'Existing image')}</a> <button type="button" className="inline-danger-button" onClick={() => setForm((current) => ({ ...current, removeImage: true, imageFile: null }))}>{adminCopy(lang, 'Rimuovi immagine', 'Remove image')}</button></p>}
          {form.imageFile && <p className="small-note full">{adminCopy(lang, 'Nuovo file', 'New file')}: {form.imageFile.name}</p>}
          <AdminInput label={adminCopy(lang, 'Ordine', 'Display order')} type="number" value={form.display_order} onChange={(value) => setForm((current) => ({ ...current, display_order: value }))} />
          <label className="check-field"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
          {error && <div className="admin-alert error full">{error}</div>}
          <div className="modal-actions full"><button className="button primary" type="button" onClick={save}>{adminCopy(lang, 'Salva', 'Save')}</button><button className="button secondary" type="button" onClick={() => setEditing(false)}>{adminCopy(lang, 'Annulla', 'Cancel')}</button></div>
        </div>
      ) : (
        <>
          {item.image_url && <img className="admin-card-preview-image" src={item.image_url} alt={item.name} />}
          {(item.description_it || item.description_en) && <p>{lang === 'it' ? item.description_it || item.description_en : item.description_en || item.description_it}</p>}
          <p className="small-note">{item.website_url || '-'} · {item.image_name || adminCopy(lang, 'Nessuna immagine', 'No image')} · {adminCopy(lang, 'Ordine', 'Order')} {item.display_order}</p>
          {error && <div className="admin-alert error">{error}</div>}
          <div className="request-actions"><button className="button secondary" type="button" onClick={() => setEditing(true)}>{adminCopy(lang, 'Modifica', 'Edit')}</button>{item.active && <button className="button secondary" type="button" onClick={deactivate}>{adminCopy(lang, 'Disattiva', 'Deactivate')}</button>}</div>
        </>
      )}
    </article>
  );
}

function AvailabilityPage({ lang, session, adminContent = {} }) {
  const [tab, setTab] = useState('blocks');
  const [blocks, setBlocks] = useState([]);
  const [fixedExcursions, setFixedExcursions] = useState([]);
  const [leaflets, setLeaflets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [form, setForm] = useState({ date: '', experience_id: '', status: 'closed', reason_it: '', reason_en: '', internal_note: '' });
  const [fixedForm, setFixedForm] = useState({ date: '', start_time: '', end_time: '', experience_id: 'etna-live', leaflet_id: '', title_it: '', title_en: '', description_it: '', description_en: '', meeting_point_it: '', meeting_point_en: '', meeting_point_maps_url: '', difficulty_it: '', difficulty_en: '', price_note_it: '', price_note_en: '', blockedDatesFile: null, blocked_dates_file_url: '', blocked_dates_file_name: '', blocked_dates_file_type: '', blocked_dates_file_path: '', capacity: '12', active: true });
  const [leafletForm, setLeafletForm] = useState({ month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()), title_it: '', title_en: '', file: null, active: true });

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [blockData, fixedData, leafletData] = await Promise.all([
        listAvailabilityBlocks({ activeOnly: false }),
        listFixedExcursions({ activeOnly: false }),
        listMonthlyLeaflets({ activeOnly: false })
      ]);
      setBlocks(blockData);
      setFixedExcursions(fixedData);
      setLeaflets(leafletData);
    } catch (err) {
      setError(err?.message || 'Could not load calendar data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateFixed(field, value) {
    setFixedForm((current) => ({ ...current, [field]: value }));
  }

  function updateLeaflet(field, value) {
    setLeafletForm((current) => ({ ...current, [field]: value }));
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

  async function submitFixed(event) {
    event.preventDefault();
    setError('');
    setFeedback('');
    if (!fixedForm.date || !fixedForm.experience_id) {
      setError(adminCopy(lang, 'Data ed esperienza sono obbligatorie.', 'Date and experience are required.'));
      return;
    }
    if (Number.parseInt(fixedForm.capacity || '0', 10) < 1) {
      setError(adminCopy(lang, 'La capienza deve essere almeno 1.', 'Capacity must be at least 1.'));
      return;
    }
    if (!fixedForm.title_it.trim() && !fixedForm.title_en.trim()) {
      setError(adminCopy(lang, 'Inserisci almeno un titolo in italiano o inglese.', 'Enter at least one Italian or English title.'));
      return;
    }
    try {
      const filePayload = fixedForm.blockedDatesFile ? await uploadBlockedDatesFile(fixedForm.blockedDatesFile, session.user.id) : {};
      await createFixedExcursion({ ...fixedForm, ...filePayload, created_by: session.user.id, updated_by: session.user.id });
      setFixedForm({ date: '', start_time: '', end_time: '', experience_id: 'etna-live', leaflet_id: '', title_it: '', title_en: '', description_it: '', description_en: '', meeting_point_it: '', meeting_point_en: '', meeting_point_maps_url: '', difficulty_it: '', difficulty_en: '', price_note_it: '', price_note_en: '', blockedDatesFile: null, blocked_dates_file_url: '', blocked_dates_file_name: '', blocked_dates_file_type: '', blocked_dates_file_path: '', capacity: '12', active: true });
      setFeedback(adminCopy(lang, 'Escursione fissa creata.', 'Fixed excursion created.'));
      refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Escursione fissa non salvata.', 'Fixed excursion not saved.'));
    }
  }


  async function submitLeaflet(event) {
    event.preventDefault();
    setError('');
    setFeedback('');
    if (!leafletForm.month || !leafletForm.year || !leafletForm.file) {
      setError(adminCopy(lang, 'Mese, anno e file sono obbligatori.', 'Month, year, and file are required.'));
      return;
    }
    try {
      const filePayload = await uploadMonthlyLeafletFile(leafletForm.file, session.user.id);
      await createMonthlyLeaflet({ ...leafletForm, ...filePayload, created_by: session.user.id, updated_by: session.user.id });
      setLeafletForm({ month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()), title_it: '', title_en: '', file: null, active: true });
      setFeedback(adminCopy(lang, 'Calendario mensile caricato.', 'Monthly leaflet uploaded.'));
      refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Calendario mensile non salvato.', 'Monthly leaflet not saved.'));
    }
  }

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Calendario pubblico', 'Public calendar')}</span>
          <AdminEditableText as="h1" itemKey="admin.availability.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Disponibilità', 'Availability')} />
          <AdminEditableText as="p" itemKey="admin.availability.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Gestisci disponibilità privata e date fisse prenotabili fino a 12 persone.', 'Manage private availability and fixed excursion dates bookable up to 12 people.')} />
        </div>
      </div>
      <div className="mode-toggle admin-tabs" role="tablist" aria-label="Calendar admin tabs">
        <button type="button" className={tab === 'blocks' ? 'active' : ''} onClick={() => setTab('blocks')}>{adminCopy(lang, 'Blocchi disponibilità', 'Availability blocks')}</button>
        <button type="button" className={tab === 'fixed' ? 'active' : ''} onClick={() => setTab('fixed')}>{adminCopy(lang, 'Escursioni fisse', 'Fixed excursions')}</button>
        <button type="button" className={tab === 'leaflets' ? 'active' : ''} onClick={() => setTab('leaflets')}>{adminCopy(lang, 'Calendari mensili', 'Monthly leaflets')}</button>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}

      {tab === 'blocks' ? (
        <div className="admin-two-column availability-columns">
          <section className="admin-panel">
            <AdminEditableText as="h2" itemKey="admin.availability.addBlock.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Aggiungi blocco disponibilità', 'Add availability block')} />
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
            <div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.availability.existingBlocks.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Blocchi esistenti', 'Existing blocks')} /><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
            {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : blocks.length === 0 ? <p>{adminCopy(lang, 'Nessun blocco salvato.', 'No saved blocks.')}</p> : (
              <div className="availability-block-list">
                {blocks.filter((block) => block.active !== false).map((block) => <AvailabilityBlockCard key={block.id} block={block} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
                <details className="admin-archive-details">
                  <summary><span>{adminCopy(lang, 'Archivio', 'Archive')}</span><strong>{blocks.filter((block) => block.active === false).length}</strong></summary>
                  {blocks.filter((block) => block.active === false).length === 0 ? <p className="small-note">{adminCopy(lang, 'Nessun blocco archiviato.', 'No archived blocks.')}</p> : blocks.filter((block) => block.active === false).map((block) => <AvailabilityBlockCard key={block.id} block={block} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
                </details>
              </div>
            )}
          </section>
        </div>
      ) : tab === 'leaflets' ? (
        <div className="admin-two-column availability-columns">
          <section className="admin-panel">
            <h2>{adminCopy(lang, 'Aggiungi calendario mensile', 'Add monthly leaflet')}</h2>
            <p className="small-note">{adminCopy(lang, 'Carica un PDF o immagine mensile e poi collega le date fisse dal tab Escursioni fisse.', 'Upload a monthly PDF or image, then link fixed dates from the Fixed excursions tab.')}</p>
            <form className="admin-form-grid" onSubmit={submitLeaflet}>
              <AdminInput label={adminCopy(lang, 'Mese', 'Month')} type="number" value={leafletForm.month} onChange={(value) => updateLeaflet('month', value)} />
              <AdminInput label={adminCopy(lang, 'Anno', 'Year')} type="number" value={leafletForm.year} onChange={(value) => updateLeaflet('year', value)} />
              <AdminInput label="Title IT" value={leafletForm.title_it} onChange={(value) => updateLeaflet('title_it', value)} />
              <AdminInput label="Title EN" value={leafletForm.title_en} onChange={(value) => updateLeaflet('title_en', value)} />
              <label className="admin-field full"><span>{adminCopy(lang, 'File calendario / leaflet', 'Calendar / leaflet file')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => updateLeaflet('file', event.target.files?.[0] || null)} /></label>
              {leafletForm.file && <p className="small-note full">{adminCopy(lang, 'File selezionato', 'Selected file')}: {leafletForm.file.name}</p>}
              <label className="check-field"><input type="checkbox" checked={leafletForm.active} onChange={(event) => updateLeaflet('active', event.target.checked)} /> {adminCopy(lang, 'Attivo', 'Active')}</label>
              <div className="modal-actions full"><button className="button primary" type="submit">{adminCopy(lang, 'Salva calendario mensile', 'Save monthly leaflet')}</button></div>
            </form>
          </section>
          <section className="admin-panel">
            <div className="admin-panel-header"><h2>{adminCopy(lang, 'Calendari caricati', 'Uploaded leaflets')}</h2><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
            {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : leaflets.length === 0 ? <p>{adminCopy(lang, 'Nessun calendario mensile salvato.', 'No monthly leaflet saved.')}</p> : (
              <div className="availability-block-list">
                {leaflets.filter((leaflet) => leaflet.active !== false).map((leaflet) => <MonthlyLeafletCard key={leaflet.id} item={leaflet} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
                <details className="admin-archive-details">
                  <summary><span>{adminCopy(lang, 'Archivio', 'Archive')}</span><strong>{leaflets.filter((leaflet) => leaflet.active === false).length}</strong></summary>
                  {leaflets.filter((leaflet) => leaflet.active === false).length === 0 ? <p className="small-note">{adminCopy(lang, 'Nessun calendario archiviato.', 'No archived leaflet.')}</p> : leaflets.filter((leaflet) => leaflet.active === false).map((leaflet) => <MonthlyLeafletCard key={leaflet.id} item={leaflet} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
                </details>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="admin-two-column availability-columns">
          <section className="admin-panel">
            <h2>{adminCopy(lang, 'Crea escursione fissa', 'Create fixed excursion')}</h2>
            <p className="small-note">{adminCopy(lang, 'Capienza predefinita 12. Per gruppi oltre 12 persone: contatto diretto con la guida.', 'Default capacity is 12. Groups over 12 should contact the guide directly.')}</p>
            <form className="admin-form-grid" onSubmit={submitFixed}>
              <AdminInput label={adminCopy(lang, 'Data', 'Date')} type="date" value={fixedForm.date} onChange={(value) => updateFixed('date', value)} />
              <AdminInput label={adminCopy(lang, 'Ora inizio', 'Start time')} type="time" value={fixedForm.start_time} onChange={(value) => updateFixed('start_time', value)} />
              <AdminInput label={adminCopy(lang, 'Ora fine opzionale', 'Optional end time')} type="time" value={fixedForm.end_time} onChange={(value) => updateFixed('end_time', value)} />
              <AdminSelect label={adminCopy(lang, 'Esperienza', 'Experience')} value={fixedForm.experience_id} onChange={(value) => updateFixed('experience_id', value)} options={['etna-premium', 'etna-learning', 'etna-live', 'etna-stories']} formatter={(value) => adminExperienceLabel(value, lang)} />
              {leaflets.length > 0 && <AdminSelect label={adminCopy(lang, 'Calendario mensile collegato', 'Linked monthly leaflet')} value={fixedForm.leaflet_id} onChange={(value) => updateFixed('leaflet_id', value)} options={['', ...leaflets.map((leaflet) => leaflet.id)]} formatter={(value) => value ? leafletLabel(leaflets.find((leaflet) => leaflet.id === value), lang) : adminCopy(lang, 'Nessuno', 'None')} />}
              <AdminInput label={adminCopy(lang, 'Capienza', 'Capacity')} type="number" value={fixedForm.capacity} onChange={(value) => updateFixed('capacity', value)} />
              <AdminInput label="Title IT" value={fixedForm.title_it} onChange={(value) => updateFixed('title_it', value)} />
              <AdminInput label="Title EN" value={fixedForm.title_en} onChange={(value) => updateFixed('title_en', value)} />
              <label className="admin-field full"><span>Description IT</span><textarea value={fixedForm.description_it} onChange={(event) => updateFixed('description_it', event.target.value)} rows={3} /></label>
              <label className="admin-field full"><span>Description EN</span><textarea value={fixedForm.description_en} onChange={(event) => updateFixed('description_en', event.target.value)} rows={3} /></label>
              <AdminInput label="Meeting point IT" value={fixedForm.meeting_point_it} onChange={(value) => updateFixed('meeting_point_it', value)} />
              <AdminInput label="Meeting point EN" value={fixedForm.meeting_point_en} onChange={(value) => updateFixed('meeting_point_en', value)} />
              <AdminInput label={adminCopy(lang, 'Link Google Maps del punto d’incontro', 'Google Maps meeting point link')} value={fixedForm.meeting_point_maps_url} placeholder="https://maps.google.com/..." onChange={(value) => updateFixed('meeting_point_maps_url', value)} />
              <AdminInput label="Difficulty IT" value={fixedForm.difficulty_it} onChange={(value) => updateFixed('difficulty_it', value)} />
              <AdminInput label="Difficulty EN" value={fixedForm.difficulty_en} onChange={(value) => updateFixed('difficulty_en', value)} />
              <AdminInput label="Price note IT" value={fixedForm.price_note_it} onChange={(value) => updateFixed('price_note_it', value)} />
              <AdminInput label="Price note EN" value={fixedForm.price_note_en} onChange={(value) => updateFixed('price_note_en', value)} />
              <label className="admin-field full"><span>{adminCopy(lang, 'File calendario date occupate', 'Blocked dates calendar file')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => updateFixed('blockedDatesFile', event.target.files?.[0] || null)} /></label>
              {fixedForm.blockedDatesFile && <p className="small-note full">{adminCopy(lang, 'File selezionato', 'Selected file')}: {fixedForm.blockedDatesFile.name}</p>}
              <label className="check-field"><input type="checkbox" checked={fixedForm.active} onChange={(event) => updateFixed('active', event.target.checked)} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
              <div className="modal-actions full"><button className="button primary" type="submit">{adminCopy(lang, 'Salva escursione fissa', 'Save fixed excursion')}</button></div>
            </form>
          </section>
          <section className="admin-panel">
            <div className="admin-panel-header"><h2>{adminCopy(lang, 'Escursioni fisse', 'Fixed excursions')}</h2><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
            {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : fixedExcursions.length === 0 ? <p>{adminCopy(lang, 'Nessuna escursione fissa salvata.', 'No fixed excursions saved.')}</p> : (
              <div className="availability-block-list">
                {fixedExcursions.filter((item) => item.active !== false && (!item.date || item.date >= todayIso())).map((item) => <FixedExcursionCard key={item.id} item={item} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
                <details className="admin-archive-details">
                  <summary><span>{adminCopy(lang, 'Esperienze passate / Archivio', 'Past experiences / Archive')}</span><strong>{fixedExcursions.filter((item) => item.active === false || (item.date && item.date < todayIso())).length}</strong></summary>
                  {fixedExcursions.filter((item) => item.active === false || (item.date && item.date < todayIso())).length === 0 ? <p className="small-note">{adminCopy(lang, 'Nessuna escursione passata o archiviata.', 'No past or archived excursions.')}</p> : fixedExcursions.filter((item) => item.active === false || (item.date && item.date < todayIso())).map((item) => <FixedExcursionCard key={item.id} item={item} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
                </details>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}


function leafletLabel(item, lang) {
  if (!item) return '-';
  const title = lang === 'it' ? item.title_it || item.title_en : item.title_en || item.title_it;
  const base = `${String(item.month).padStart(2, '0')}/${item.year}`;
  return title ? `${base} · ${title}` : base;
}

function MonthlyLeafletCard({ item, lang, userId, onChanged }) {
  const [error, setError] = useState('');
  async function deactivate() {
    setError('');
    try {
      await deactivateMonthlyLeaflet(item.id, userId);
      onChanged(adminCopy(lang, 'Calendario mensile disattivato.', 'Monthly leaflet deactivated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Disattivazione non riuscita.', 'Deactivate failed.'));
    }
  }
  const isImage = item.file_type?.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(item.file_url || '');
  return (
    <article className={`availability-block-card ${item.active ? '' : 'inactive'}`}>
      <div className="request-card-head">
        <div><h3>{leafletLabel(item, lang)}</h3><p>{item.file_name || '-'}</p></div>
        <span className={`status-pill ${item.active ? 'accepted' : 'cancelled'}`}>{item.active ? adminCopy(lang, 'Attivo', 'Active') : adminCopy(lang, 'Inattivo', 'Inactive')}</span>
      </div>
      {item.file_url && (isImage ? <img className="admin-card-preview-image" src={item.file_url} alt={leafletLabel(item, lang)} loading="lazy" /> : <a className="button secondary" href={item.file_url} target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Apri PDF / file', 'Open PDF / file')}</a>)}
      <p className="small-note">{adminCopy(lang, 'Collega le singole date usando il campo calendario mensile nel form escursione fissa.', 'Link individual dates through the monthly leaflet field in the fixed excursion form.')}</p>
      {error && <div className="admin-alert error">{error}</div>}
      <div className="request-actions">
        {item.file_url && <a className="button secondary" href={item.file_url} target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Apri file', 'Open file')}</a>}
        {item.active && <button className="button secondary" type="button" onClick={deactivate}>{adminCopy(lang, 'Disattiva', 'Deactivate')}</button>}
      </div>
    </article>
  );
}

function FixedExcursionCard({ item, lang, userId, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    date: item.date,
    start_time: item.start_time || '',
    end_time: item.end_time || '',
    experience_id: item.experience_id,
    title_it: item.title_it || '',
    title_en: item.title_en || '',
    description_it: item.description_it || item.note_it || '',
    description_en: item.description_en || item.note_en || '',
    meeting_point_it: item.meeting_point_it || '',
    meeting_point_en: item.meeting_point_en || '',
    meeting_point_maps_url: item.meeting_point_maps_url || '',
    difficulty_it: item.difficulty_it || '',
    difficulty_en: item.difficulty_en || '',
    price_note_it: item.price_note_it || '',
    price_note_en: item.price_note_en || '',
    blockedDatesFile: null,
    blocked_dates_file_url: item.blocked_dates_file_url || '',
    blocked_dates_file_name: item.blocked_dates_file_name || '',
    blocked_dates_file_type: item.blocked_dates_file_type || '',
    blocked_dates_file_path: item.blocked_dates_file_path || '',
    removeBlockedDatesFile: false,
    capacity: String(item.capacity || 12),
    active: item.active !== false
  });
  const [error, setError] = useState('');

  async function save() {
    setError('');
    if (Number.parseInt(form.capacity || '0', 10) < 1) {
      setError(adminCopy(lang, 'La capienza deve essere almeno 1.', 'Capacity must be at least 1.'));
      return;
    }
    if (!form.title_it.trim() && !form.title_en.trim()) {
      setError(adminCopy(lang, 'Inserisci almeno un titolo in italiano o inglese.', 'Enter at least one Italian or English title.'));
      return;
    }
    try {
      let filePayload = {};
      if (form.blockedDatesFile) {
        filePayload = await uploadBlockedDatesFile(form.blockedDatesFile, userId);
        if (item.blocked_dates_file_path) await removeBlockedDatesFile(item.blocked_dates_file_path);
      } else if (form.removeBlockedDatesFile) {
        if (item.blocked_dates_file_path) await removeBlockedDatesFile(item.blocked_dates_file_path);
        filePayload = { blocked_dates_file_url: null, blocked_dates_file_name: null, blocked_dates_file_type: null, blocked_dates_file_path: null };
      }
      const { blockedDatesFile, removeBlockedDatesFile: removeFileFlag, ...fixedPayload } = form;
      await updateFixedExcursion(item.id, { ...fixedPayload, ...filePayload, updated_by: userId });
      setEditing(false);
      onChanged(adminCopy(lang, 'Escursione fissa aggiornata.', 'Fixed excursion updated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Aggiornamento non riuscito.', 'Update failed.'));
    }
  }

  async function deactivate() {
    setError('');
    try {
      await deactivateFixedExcursion(item.id, userId);
      onChanged(adminCopy(lang, 'Escursione fissa disattivata.', 'Fixed excursion deactivated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Disattivazione non riuscita.', 'Deactivate failed.'));
    }
  }

  return (
    <article className={`availability-block-card ${item.active ? '' : 'inactive'}`}>
      <div className="request-card-head">
        <div><h3>{fixedExcursionLabel(item, lang)}</h3><p>{adminExperienceLabel(item.experience_id, lang)}</p></div>
        <span className={`status-pill ${item.active ? 'accepted' : 'cancelled'}`}>{item.active ? adminCopy(lang, 'Attiva', 'Active') : adminCopy(lang, 'Inattiva', 'Inactive')}</span>
      </div>
      {editing ? (
        <div className="admin-form-grid single-card-form">
          <AdminInput label={adminCopy(lang, 'Data', 'Date')} type="date" value={form.date} onChange={(value) => setForm((current) => ({ ...current, date: value }))} />
          <AdminInput label={adminCopy(lang, 'Ora inizio', 'Start time')} type="time" value={form.start_time} onChange={(value) => setForm((current) => ({ ...current, start_time: value }))} />
          <AdminInput label={adminCopy(lang, 'Ora fine opzionale', 'Optional end time')} type="time" value={form.end_time} onChange={(value) => setForm((current) => ({ ...current, end_time: value }))} />
          <AdminSelect label={adminCopy(lang, 'Esperienza', 'Experience')} value={form.experience_id} onChange={(value) => setForm((current) => ({ ...current, experience_id: value }))} options={['etna-premium', 'etna-learning', 'etna-live', 'etna-stories']} formatter={(value) => adminExperienceLabel(value, lang)} />
          <AdminInput label={adminCopy(lang, 'Capienza', 'Capacity')} type="number" value={form.capacity} onChange={(value) => setForm((current) => ({ ...current, capacity: value }))} />
          <AdminInput label="Title IT" value={form.title_it} onChange={(value) => setForm((current) => ({ ...current, title_it: value }))} />
          <AdminInput label="Title EN" value={form.title_en} onChange={(value) => setForm((current) => ({ ...current, title_en: value }))} />
          <label className="admin-field full"><span>Description IT</span><textarea value={form.description_it} onChange={(event) => setForm((current) => ({ ...current, description_it: event.target.value }))} rows={3} /></label>
          <label className="admin-field full"><span>Description EN</span><textarea value={form.description_en} onChange={(event) => setForm((current) => ({ ...current, description_en: event.target.value }))} rows={3} /></label>
          <AdminInput label="Meeting point IT" value={form.meeting_point_it} onChange={(value) => setForm((current) => ({ ...current, meeting_point_it: value }))} />
          <AdminInput label="Meeting point EN" value={form.meeting_point_en} onChange={(value) => setForm((current) => ({ ...current, meeting_point_en: value }))} />
          <AdminInput label={adminCopy(lang, 'Link Google Maps del punto d’incontro', 'Google Maps meeting point link')} value={form.meeting_point_maps_url} placeholder="https://maps.google.com/..." onChange={(value) => setForm((current) => ({ ...current, meeting_point_maps_url: value }))} />
          <AdminInput label="Difficulty IT" value={form.difficulty_it} onChange={(value) => setForm((current) => ({ ...current, difficulty_it: value }))} />
          <AdminInput label="Difficulty EN" value={form.difficulty_en} onChange={(value) => setForm((current) => ({ ...current, difficulty_en: value }))} />
          <AdminInput label="Price note IT" value={form.price_note_it} onChange={(value) => setForm((current) => ({ ...current, price_note_it: value }))} />
          <AdminInput label="Price note EN" value={form.price_note_en} onChange={(value) => setForm((current) => ({ ...current, price_note_en: value }))} />
          <label className="admin-field full"><span>{adminCopy(lang, 'File calendario date occupate', 'Blocked dates calendar file')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => setForm((current) => ({ ...current, blockedDatesFile: event.target.files?.[0] || null, removeBlockedDatesFile: false }))} /></label>
          {form.blocked_dates_file_url && !form.removeBlockedDatesFile && <p className="small-note full"><a href={form.blocked_dates_file_url} target="_blank" rel="noopener noreferrer">{form.blocked_dates_file_name || adminCopy(lang, 'File esistente', 'Existing file')}</a> <button type="button" className="inline-danger-button" onClick={() => setForm((current) => ({ ...current, removeBlockedDatesFile: true, blockedDatesFile: null }))}>{adminCopy(lang, 'Rimuovi file', 'Remove file')}</button></p>}
          {form.blockedDatesFile && <p className="small-note full">{adminCopy(lang, 'Nuovo file', 'New file')}: {form.blockedDatesFile.name}</p>}
          {form.removeBlockedDatesFile && <p className="small-note full">{adminCopy(lang, 'Il file verrà rimosso al salvataggio.', 'The file will be removed on save.')}</p>}
          <label className="check-field"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
          {error && <div className="admin-alert error full">{error}</div>}
          <div className="modal-actions full"><button className="button primary" type="button" onClick={save}>{adminCopy(lang, 'Salva', 'Save')}</button><button className="button secondary" type="button" onClick={() => setEditing(false)}>{adminCopy(lang, 'Annulla', 'Cancel')}</button></div>
        </div>
      ) : (
        <>
          <dl className="request-details-grid">
            <div><dt>{adminCopy(lang, 'Capienza', 'Capacity')}</dt><dd>{item.capacity}</dd></div>
            <div><dt>{adminCopy(lang, 'Accettati', 'Accepted')}</dt><dd>{item.accepted_count || 0}</dd></div>
            <div><dt>{adminCopy(lang, 'Posti residui', 'Remaining')}</dt><dd>{item.places_remaining}</dd></div>
            <div><dt>{adminCopy(lang, 'Aggiornata', 'Updated')}</dt><dd>{formatDateForMessage(String(item.updated_at || item.created_at || '').slice(0, 10), lang) || '-'}</dd></div>
          </dl>
          {item.blocked_dates_file_url && <BlockedDatesAttachment item={item} lang={lang} publicView={false} />}
          {(item.description_it || item.description_en || item.note_it || item.note_en) && <p>{fixedExcursionField(item, 'description', lang) || (lang === 'it' ? item.note_it || item.note_en : item.note_en || item.note_it)}</p>}
          {error && <div className="admin-alert error">{error}</div>}
          <div className="request-actions"><button className="button secondary" type="button" onClick={() => setEditing(true)}>{adminCopy(lang, 'Modifica', 'Edit')}</button>{item.active && <button className="button secondary" type="button" onClick={deactivate}>{adminCopy(lang, 'Disattiva', 'Deactivate')}</button>}</div>
        </>
      )}
    </article>
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
  const [formState, setFormState] = useState({ language: 'it', requestType: 'private', partyType: 'solo', adults: '1', children: '0', childrenUnder3Count: '0', heardAboutUs: '', heardAboutUsDetail: '', message: i18n.it.defaultMessage });
  const [activePage, setActivePage] = useState('home');
  const [siteMedia, setSiteMedia] = useState({});
  const [siteContent, setSiteContent] = useState({});
  const contactRef = useRef(null);
  const analyticsContextRef = useRef({ section: 'home', language: 'it' });

  useEffect(() => {
    analyticsContextRef.current = { section: activePage, language: lang };
  }, [activePage, lang]);

  useEffect(() => {
    if (pathname.startsWith('/admin')) return undefined;
    return startAnalyticsHeartbeat(() => analyticsContextRef.current);
  }, [pathname]);

  useEffect(() => {
    if (pathname.startsWith('/admin')) return;
    trackPageView(activePage, { path: `/${activePage === 'home' ? '' : activePage}`, language: lang });
  }, [activePage, lang, pathname]);

  useEffect(() => {
    const token = import.meta.env.VITE_CLOUDFLARE_WEB_ANALYTICS_TOKEN;
    if (!token || typeof document === 'undefined' || document.getElementById('cloudflare-web-analytics')) return;
    const script = document.createElement('script');
    script.id = 'cloudflare-web-analytics';
    script.defer = true;
    script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    script.setAttribute('data-cf-beacon', JSON.stringify({ token }));
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    Promise.allSettled([listSiteMedia({ activeOnly: true }), loadPublicSiteContent()])
      .then(([mediaResult, contentResult]) => {
        if (!active) return;
        setSiteMedia(mediaResult.status === 'fulfilled' ? buildMediaMap(mediaResult.value) : {});
        setSiteContent(contentResult.status === 'fulfilled' ? buildSiteContentMap(contentResult.value) : {});
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = lang === 'it' ? 'vulcanIQ | Esperienze sull\'Etna' : 'vulcanIQ | Mount Etna experiences';
    setFormState((current) => ({
      ...current,
      language: current.language || lang,
      message: current.message && current.message !== i18n.it.defaultMessage && current.message !== i18n.en.defaultMessage ? current.message : text(lang, 'defaultMessage')
    }));
  }, [lang]);

  function setPublicLanguage(nextLang) {
    setLang((current) => {
      const resolved = typeof nextLang === 'function' ? nextLang(current) : nextLang;
      if (resolved && resolved !== current) trackLanguageSwitch(current, resolved);
      return resolved || current;
    });
  }

  function scrollContactIntoView() {
    setActivePage('contact');
    window.setTimeout(() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function scrollToForm(metadata = {}) {
    const trackingContext = buildBookingTrackingContext({
      experienceId: formState.experienceId || '',
      requestType: formState.requestType || 'private',
      sourceSection: metadata.source_section || 'hero',
      sourceCta: metadata.source_cta || 'contact_direct',
      ctaLocation: metadata.cta_location || 'hero',
      selectedDate: formState.requestedDate || '',
      hasFixedExcursion: formState.requestType === 'fixed',
      language: lang
    });
    trackBookingFormOpen(formState.experienceId || formState.requestType || 'private', mergeTrackingContext(trackingContext, metadata));
    setFormState((current) => ({ ...current, trackingContext: mergeTrackingContext(trackingContext, metadata) }));
    scrollContactIntoView();
  }

  function fillForm({ experienceId, message, requestType, fixedExcursionId, requestedDate, adults, children, childrenUnder3Count, trackingContext, scroll = false }) {
    setFormState((current) => ({
      ...current,
      experienceId: experienceId || current.experienceId,
      requestType: requestType || current.requestType || 'private',
      fixedExcursionId: fixedExcursionId !== undefined ? fixedExcursionId : current.fixedExcursionId,
      requestedDate: requestedDate || current.requestedDate,
      adults: adults !== undefined ? adults : current.adults,
      children: children !== undefined ? children : current.children,
      childrenUnder3Count: childrenUnder3Count !== undefined ? childrenUnder3Count : current.childrenUnder3Count,
      privateExperience: requestType ? requestType === 'private' : current.privateExperience,
      message: message || current.message,
      language: lang,
      trackingContext: trackingContext || current.trackingContext
    }));
    if (scroll) scrollContactIntoView();
  }

  function renderPublicPage() {
    switch (activePage) {
      case 'experiences':
        return <ExperienceAccordion lang={lang} fillForm={fillForm} siteMedia={siteMedia} siteContent={siteContent} />;
      case 'partnerships':
        return <PartnershipsPage lang={lang} siteContent={siteContent} />;
      case 'about':
        return <Team lang={lang} siteMedia={siteMedia} siteContent={siteContent} />;
      case 'reviews':
        return <ReviewsPage lang={lang} siteContent={siteContent} />;
      case 'contact':
        return <ContactForm lang={lang} formState={formState} setFormState={setFormState} siteMedia={siteMedia} siteContent={siteContent} />;
      case 'home':
      default:
        return <Hero lang={lang} setActivePage={setActivePage} scrollToForm={scrollToForm} siteMedia={siteMedia} siteContent={siteContent} />;
    }
  }

  if (pathname.startsWith('/admin')) {
    return <AdminRouter pathname={pathname} navigate={navigate} lang={lang} setLang={setPublicLanguage} />;
  }

  return (
    <>
      <Header lang={lang} setLang={setPublicLanguage} activePage={activePage} setActivePage={setActivePage} siteMedia={siteMedia} />
      <main ref={contactRef} className={`public-page-shell public-page-${activePage}`}>
        {renderPublicPage()}
      </main>
      <Footer lang={lang} siteContent={siteContent} />
      <StickyMobileBar lang={lang} siteContent={siteContent} />
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
