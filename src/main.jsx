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
    difficulty: 'Difficoltà',
    priceNote: 'Nota prezzo',
    requestAvailability: 'Richiedi disponibilità',
    partnershipsTitle: 'Collaborazioni',
    partnershipsSubtitle: '',
    partnershipsEmpty: 'Al momento non ci sono collaborazioni pubblicate.',
    visitWebsite: 'Visita il sito',
    activeCollaborations: 'Partnership attive',
    chooseFixedExcursion: 'Scegli escursione fissa',
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
    openExcursionProgram: 'Apri programma dell’escursione',
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
    difficulty: 'Difficulty',
    priceNote: 'Price note',
    requestAvailability: 'Request availability',
    partnershipsTitle: 'Partnerships',
    partnershipsSubtitle: '',
    partnershipsEmpty: 'There are currently no published partnerships.',
    visitWebsite: 'Visit website',
    activeCollaborations: 'Active collaborations',
    chooseFixedExcursion: 'Choose fixed excursion',
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
    openExcursionProgram: 'Open excursion program',
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

function contentText(siteContent, key, lang, fallback = '') {
  const item = siteContent?.[key];
  if (!item || item.active === false) return fallback;
  const primary = lang === 'it' ? item.value_it : item.value_en;
  const secondary = lang === 'it' ? item.value_en : item.value_it;
  return primary || secondary || fallback;
}

function buildSiteContentMap(items = []) {
  return (items || []).reduce((acc, item) => {
    if (item?.content_key) acc[item.content_key] = item;
    return acc;
  }, {});
}



function getContentDefinition(key) {
  return SITE_CONTENT_DEFINITIONS.find((item) => item.key === key) || { key, content_key: key, section: 'General', label_it: key, label_en: key, type: 'text', default_it: '', default_en: '' };
}

function getMediaDefinition(key) {
  return MEDIA_ADMIN_ITEMS.find((item) => item.key === key) || { key, it: key, en: key, fallback: '' };
}

function editorContentItem(siteContent, key, fallback = '') {
  const definition = getContentDefinition(key);
  const stored = siteContent?.[key] || {};
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
    text_size: stored.text_size || definition.text_size || 'normal',
    text_align: stored.text_align || definition.text_align || 'left',
    style_variant: stored.style_variant || definition.style_variant || 'body',
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

function EmailPanel({ lang, message, subject, onClose, onUseForm }) {
  const [copied, setCopied] = useState('');
  const mailto = buildMailto(EMAIL, subject, message);
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
      <button type="button" className="email-option" onClick={() => openDefaultEmailApp(EMAIL, subject, message)}>{text(lang, 'defaultEmail')}</button>
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
          <EditableText as="h1" itemKey="home.hero.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'heroTitle')} />
          <EditableText as="p" className="lead" itemKey="home.hero.subtitle" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'heroLead')} />
          <div className="hero-ctas">
            <button className="button primary" type="button" onClick={() => setActivePage('experiences')}><EditableText itemKey="home.hero.primary_cta" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'findExperience')} /></button>
            <button className="button secondary dark" type="button" onClick={() => setActivePage('experiences')}><EditableText itemKey="home.hero.secondary_cta" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'viewAvailability')} /></button>
            <button className="button secondary dark" type="button" onClick={scrollToForm}>{text(lang, 'contact')}</button>
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
                <strong>{text(lang, 'trust')[0]}</strong>
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
  const [items, setItems] = useState([]);
  const [leaflets, setLeaflets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthDate, setMonthDate] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [selectedExperience, setSelectedExperience] = useState(null);
  const [activeLeaflet, setActiveLeaflet] = useState(null);
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [dateRequest, setDateRequest] = useState({ experienceId: 'etna-premium', adults: '1', children: '0', childrenUnder3Count: '0' });

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

  useEffect(() => {
    document.body.classList.toggle('modal-scroll-lock', Boolean(selectedExperience || activeLeaflet || dateModalOpen));
    return () => document.body.classList.remove('modal-scroll-lock');
  }, [selectedExperience, activeLeaflet, dateModalOpen]);

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

  function changeMonth(delta) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function openDateModal(iso) {
    setSelectedDate(iso);
    setDateModalOpen(true);
  }

  function requestExperience(experience) {
    setSelectedExperience(null);
    fillForm({
      experienceId: experience.id,
      requestType: 'private',
      message: buildExperienceMessage(experience, lang),
      scroll: true
    });
  }

  function requestItem(item) {
    const message = buildFixedExcursionMessage({ fixedExcursion: item, people: '' }, lang);
    setDateModalOpen(false);
    fillForm({
      experienceId: item.experience_id,
      requestType: 'fixed',
      fixedExcursionId: item.id,
      requestedDate: item.date,
      message,
      scroll: true
    });
  }

  function updateDateRequest(field, value) {
    setDateRequest((current) => ({ ...current, [field]: value }));
  }

  function requestAvailableDate() {
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
          {meeting && <div><dt>{text(lang, 'meetingPoint')}</dt><dd>{meeting}</dd></div>}
          {difficulty && <div><dt>{text(lang, 'difficulty')}</dt><dd>{difficulty}</dd></div>}
          {price && <div><dt>{text(lang, 'priceNote')}</dt><dd>{price}</dd></div>}
          <div><dt>{text(lang, 'placesAvailable')}</dt><dd>{item.places_remaining}/{item.capacity}</dd></div>
        </dl>
        <BlockedDatesAttachment item={item} lang={lang} onOpenFile={(file, label) => openLeafletModal(file, label || text(lang, 'openExcursionProgram'))} />
        <div className="request-action-row date-modal-actions">
          <button className="request-action-button request-action-button-primary" type="button" onClick={() => requestItem(item)}>{text(lang, 'requestInformation')}</button>
          <a className="request-action-button request-action-button-secondary" href={`https://wa.me/${PHONE_WA}?text=${encode(fixedMessage)}`} target="_blank" rel="noopener noreferrer">{text(lang, 'sendWhatsapp')}</a>
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
          <a className="request-action-button request-action-button-secondary" href={`https://wa.me/${PHONE_WA}?text=${encode(message)}`} target="_blank" rel="noopener noreferrer">{text(lang, 'sendWhatsapp')}</a>
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
                  <button className="experience-compact-card" type="button" onClick={() => setSelectedExperience(experience)}>
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
                  <a className="request-action-button request-action-button-secondary" href={`https://wa.me/${PHONE_WA}?text=${encode(buildExperienceMessage(selectedExperience, lang))}`} target="_blank" rel="noopener noreferrer">{text(lang, 'sendWhatsapp')}</a>
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
    const message = buildFixedExcursionMessage({ fixedExcursion: item, people: '' }, lang);
    fillForm({
      experienceId: item.experience_id,
      requestType: 'fixed',
      fixedExcursionId: item.id,
      requestedDate: item.date,
      message,
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
          {meeting && <div><dt>{text(lang, 'meetingPoint')}</dt><dd>{meeting}</dd></div>}
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
                <article className="empty-state-card"><p>{text(lang, 'upcomingEmpty')}</p><button className="button primary" type="button" onClick={() => fillForm({ requestType: 'private', scroll: true })}>{text(lang, 'contact')}</button></article>
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

  useEffect(() => { refreshReviews(); }, []);

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
              <a className="inline-link" href={INSTAGRAM} target="_blank" rel="noopener noreferrer"><Icon name="insta" />{text(lang, 'instagram')}</a>
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

function ContactForm({ lang, formState, setFormState, siteContent, editor }) {
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
  const fullMessage = appendUnder3CountToMessage(message, childrenUnder3Count, lang);

  useEffect(() => {
    loadPublicFixedExcursions().then(setFixedExcursions);
  }, []);

  function update(field, value) {
    setFormState((current) => ({ ...current, [field]: value }));
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

    if (!totalPeople) {
      setSubmitState({ loading: false, error: text(lang, 'peopleRequired'), success: '' });
      return;
    }

    if (requestType === 'fixed' && !formState.fixedExcursionId) {
      setSubmitState({ loading: false, error: text(lang, 'fixedDateRequired'), success: '' });
      return;
    }

    if (!hasMessage && !effectiveExperienceId && !selectedDate) {
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
          <EditableText as="h2" itemKey="contact.page.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'formTitle')} />
          <EditableText as="p" itemKey="contact.page.intro" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'formIntro')} />
          <ContactActions lang={lang} contextMessage={fullMessage} onUseForm={null} />
          <a className="instagram-link" href={INSTAGRAM} target="_blank" rel="noopener noreferrer"><Icon name="insta" />{text(lang, 'instagram')}</a>
        </div>
        <form className="contact-form" onSubmit={submitRequest}>
          <label className="field-label">{text(lang, 'requestMode')}</label>
          <div className="mode-toggle form-mode-toggle" role="tablist" aria-label={text(lang, 'requestMode')}>
            <button type="button" className={requestType === 'fixed' ? 'active' : ''} onClick={() => updateRequestType('fixed')}>{text(lang, 'fixedExcursion')}</button>
            <button type="button" className={requestType === 'private' ? 'active' : ''} onClick={() => updateRequestType('private')}>{text(lang, 'privateExcursion')}</button>
          </div>

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
              <select id="contactPreferred" value={formState.preferredContact || 'form'} onChange={(event) => update('preferredContact', event.target.value)}>
                <option value="form">Form</option>
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
            <a className="request-action-button request-action-button-secondary" href={`https://wa.me/${PHONE_WA}?text=${encode(fullMessage)}`} target="_blank" rel="noopener noreferrer">{text(lang, 'sendWhatsapp')}</a>
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
          <p><strong>Leonardo Chiavetta</strong><br />{PHONE_DISPLAY}<br /><a href={buildMailto(EMAIL)}>{EMAIL}</a></p>
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
      <a href={buildMailto(EMAIL, text(lang, 'emailSubject'), message)} onClick={(event) => { event.preventDefault(); openDefaultEmailApp(EMAIL, text(lang, 'emailSubject'), message); }}><Icon name="mail" />Email</a>
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
  const currentAdminPath = normalizedPath.includes('/calendar')
    ? '/admin/calendar'
    : normalizedPath.includes('/finance')
      ? '/admin/finance'
      : normalizedPath.includes('/website') || normalizedPath.includes('/content') || normalizedPath.includes('/media')
        ? '/admin/website'
        : normalizedPath.includes('/partnerships')
            ? '/admin/partnerships'
            : normalizedPath.includes('/upcoming')
              ? '/admin/upcoming'
              : normalizedPath.includes('/requests')
                ? '/admin/requests'
                : normalizedPath.includes('/availability')
                  ? '/admin/availability'
                  : '/admin/today';

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
        <select className="admin-mobile-nav" value={currentAdminPath} onChange={(event) => navigate(event.target.value)} aria-label="Admin navigation">
          <option value="/admin/today">{adminCopy(lang, 'Oggi', 'Today')}</option>
          <option value="/admin/calendar">{adminCopy(lang, 'Calendario', 'Calendar')}</option>
          <option value="/admin/upcoming">{adminCopy(lang, 'Prossime', 'Upcoming')}</option>
          <option value="/admin/requests">{adminCopy(lang, 'Richieste', 'Requests')}</option>
          <option value="/admin/availability">{adminCopy(lang, 'Disponibilità', 'Availability')}</option>
          <option value="/admin/partnerships">{adminCopy(lang, 'Collaborazioni', 'Partnerships')}</option>
          <option value="/admin/website">{adminCopy(lang, 'Modifica sito', 'Edit website')}</option>
          <option value="/admin/finance">{adminCopy(lang, 'Finanze', 'Finance')}</option>
        </select>
        <nav className="admin-nav" aria-label="Admin navigation">
          <button type="button" className={normalizedPath.includes('/today') ? 'active' : ''} onClick={() => navigate('/admin/today')}>{adminCopy(lang, 'Oggi', 'Today')}</button>
          <button type="button" className={normalizedPath.includes('/calendar') ? 'active' : ''} onClick={() => navigate('/admin/calendar')}>{adminCopy(lang, 'Calendario', 'Calendar')}</button>
          <button type="button" className={normalizedPath.includes('/upcoming') ? 'active' : ''} onClick={() => navigate('/admin/upcoming')}>{adminCopy(lang, 'Prossime', 'Upcoming')}</button>
          <button type="button" className={normalizedPath.includes('/requests') ? 'active' : ''} onClick={() => navigate('/admin/requests')}>{adminCopy(lang, 'Richieste', 'Requests')}</button>
          <button type="button" className={normalizedPath.includes('/availability') ? 'active' : ''} onClick={() => navigate('/admin/availability')}>{adminCopy(lang, 'Disponibilità', 'Availability')}</button>
          <button type="button" className={normalizedPath.includes('/partnerships') ? 'active' : ''} onClick={() => navigate('/admin/partnerships')}>{adminCopy(lang, 'Collaborazioni', 'Partnerships')}</button>
          <button type="button" className={normalizedPath.includes('/website') || normalizedPath.includes('/content') || normalizedPath.includes('/media') ? 'active' : ''} onClick={() => navigate('/admin/website')}>{adminCopy(lang, 'Modifica sito', 'Edit website')}</button>
          <button type="button" className={normalizedPath.includes('/finance') ? 'active' : ''} onClick={() => navigate('/admin/finance')}>{adminCopy(lang, 'Finanze', 'Finance')}</button>
          <a href="/" target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Sito pubblico', 'Public site')}</a>
        </nav>
        <div className="admin-userbox">
          <span>{ownerDisplayName(profile, lang)}</span>
          <button type="button" onClick={() => setLang(lang === 'it' ? 'en' : 'it')}>{lang === 'it' ? 'EN' : 'IT'}</button>
          <button type="button" onClick={logout}>{adminCopy(lang, 'Esci', 'Logout')}</button>
        </div>
      </header>
      <main className="admin-main">
        {normalizedPath.includes('/calendar') ? (
          <AdminCalendarPage lang={lang} session={session} navigate={navigate} />
        ) : normalizedPath.includes('/finance') ? (
          <FinanceAdminPage lang={lang} session={session} />
        ) : normalizedPath.includes('/website') || normalizedPath.includes('/content') || normalizedPath.includes('/media') ? (
          <WebsiteAdminPage lang={lang} session={session} />
        ) : normalizedPath.includes('/partnerships') ? (
          <PartnershipsAdminPage lang={lang} session={session} />
        ) : normalizedPath.includes('/upcoming') ? (
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

function AdminCalendarPage({ lang, session, navigate }) {
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
          <h1>{adminCopy(lang, 'Calendario disponibilità', 'Availability calendar')}</h1>
          <p>{adminCopy(lang, 'Verde: escursione fissa. Rosso: esperienza prenotata. Grigio: data bloccata o non disponibile.', 'Green: fixed excursion. Red: booked experience. Grey: blocked or unavailable date.')}</p>
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
              {selected.fixed.length > 0 && <h3>{adminCopy(lang, 'Escursioni fisse', 'Fixed excursions')}</h3>}
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
              {selected.bookings.length > 0 && <h3>{adminCopy(lang, 'Esperienze prenotate', 'Booked experiences')}</h3>}
              {selected.bookings.map((request) => (
                <article className="calendar-detail-item" key={request.id}>
                  <strong>{request.customer_name || '-'}</strong>
                  <span>{adminExperienceLabel(request.experience_id, lang)} · {Number(request.adults || 0) + Number(request.children || 0) || '-'} {adminCopy(lang, 'ospiti', 'guests')}</span>
                  <button type="button" className="button secondary" onClick={() => setSelectedBooking(request)}>{adminCopy(lang, 'Modifica', 'Edit')}</button>
                </article>
              ))}
              {selected.blocks.length > 0 && <h3>{adminCopy(lang, 'Blocchi', 'Blocks')}</h3>}
              {selected.blocks.map((block) => <p className="small-note" key={block.id}>{adminAvailabilityStatusLabels[block.status]?.[lang] || block.status} · {block.reason_it || block.reason_en || '-'}</p>)}
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
  const [form, setForm] = useState({ status: request.status, requested_date: request.requested_date || '', adults: String(request.adults || ''), children: String(request.children || ''), admin_note: request.admin_note || '', decision_note: request.decision_note || '' });
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="admin-modal wide" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal-header"><div><h2>{request.customer_name || adminCopy(lang, 'Prenotazione', 'Booking')}</h2><p>{request.customer_email || '-'} · {request.customer_phone || '-'}</p></div><button className="round-button" type="button" onClick={onClose}>{text(lang, 'close')}</button></div>
        <div className="admin-form-grid">
          <AdminSelect label={adminCopy(lang, 'Stato', 'Status')} value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={REQUEST_STATUSES} formatter={(value) => requestStatusLabels[value]?.[lang] || value} />
          <AdminInput label={adminCopy(lang, 'Data confermata', 'Confirmed date')} type="date" value={form.requested_date} onChange={(value) => setForm((current) => ({ ...current, requested_date: value }))} />
          <AdminInput label={adminCopy(lang, 'Adulti', 'Adults')} type="number" value={form.adults} onChange={(value) => setForm((current) => ({ ...current, adults: value }))} />
          <AdminInput label={adminCopy(lang, 'Bambini', 'Children')} type="number" value={form.children} onChange={(value) => setForm((current) => ({ ...current, children: value }))} />
          <label className="admin-field full"><span>{adminCopy(lang, 'Nota interna', 'Internal note')}</span><textarea rows={3} value={form.admin_note} onChange={(event) => setForm((current) => ({ ...current, admin_note: event.target.value }))} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Nota decisione', 'Decision note')}</span><textarea rows={3} value={form.decision_note} onChange={(event) => setForm((current) => ({ ...current, decision_note: event.target.value }))} /></label>
          <div className="modal-actions full"><button className="button primary" type="button" onClick={() => onSave(request, { ...form, adults: Number.parseInt(form.adults || '0', 10), children: Number.parseInt(form.children || '0', 10) })}>{adminCopy(lang, 'Salva modifiche', 'Save changes')}</button><button className="button secondary" type="button" onClick={onClose}>{adminCopy(lang, 'Annulla', 'Cancel')}</button></div>
        </div>
      </div>
    </div>
  );
}

function CalendarFixedModal({ lang, item, onClose, onSave }) {
  const [form, setForm] = useState({ date: item.date || '', start_time: item.start_time || '', end_time: item.end_time || '', title_it: item.title_it || '', title_en: item.title_en || '', description_it: item.description_it || item.note_it || '', description_en: item.description_en || item.note_en || '', meeting_point_it: item.meeting_point_it || '', meeting_point_en: item.meeting_point_en || '', capacity: String(item.capacity || 12), active: item.active !== false });
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
    if (!selected) return;
    setError('');
    setFeedback('');
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
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Impossibile salvare le modifiche. Riprova.', 'Unable to save changes. Please try again.'));
    }
  }

  async function saveAll() {
    setError('');
    setFeedback('');
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
    }
  }

  function discardDrafts() {
    if (hasDrafts && !window.confirm(adminCopy(lang, 'Scartare le modifiche non salvate?', 'Discard unsaved changes?'))) return;
    setContentDrafts({});
    setMediaDrafts({});
    setFeedback(adminCopy(lang, 'Modifiche locali scartate.', 'Local changes discarded.'));
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
        <button className="button secondary" type="button" onClick={discardDrafts} disabled={!hasDrafts}>{adminCopy(lang, 'Scarta', 'Discard')}</button>
        <button className="button primary" type="button" onClick={saveAll} disabled={!hasDrafts || !isSupabaseConfigured}>{adminCopy(lang, 'Salva tutto', 'Save all')}</button>
      </div>

      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      {notice && <div className="admin-alert warning" role="status">{notice}</div>}
      {loading ? <p>{adminCopy(lang, 'Caricamento editor...', 'Loading editor...')}</p> : (
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
          <EditorInspector
            lang={lang}
            editorLang={editorLang}
            selected={selected}
            contentMap={contentMap}
            mediaMap={mediaMap}
            updateContentDraft={updateContentDraft}
            updateMediaDraft={updateMediaDraft}
            onSave={saveSelected}
            onReset={resetSelected}
            canSave={isSupabaseConfigured}
          />
        </div>
      )}
    </section>
  );
}

function VisualEditorPreview({ page, setPage, lang, setLang, device, siteMedia, siteContent, editor, setNotice }) {
  const [formState, setFormState] = useState({ language: lang, requestType: 'private', partyType: 'solo', adults: '1', children: '0', childrenUnder3Count: '0', message: text(lang, 'defaultMessage') });

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
        return <ContactForm lang={lang} formState={formState} setFormState={setFormState} siteContent={siteContent} editor={editor} />;
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
        <label className="admin-field"><span>{adminCopy(lang, 'Dimensione testo', 'Text size')}</span><select value={item.text_size || 'normal'} onChange={(event) => updateContentDraft(selected.key, { text_size: event.target.value })}><option value="small">Small</option><option value="normal">Normal</option><option value="large">Large</option><option value="hero">Hero</option></select></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Stile testo', 'Text style')}</span><select value={item.style_variant || 'body'} onChange={(event) => updateContentDraft(selected.key, { style_variant: event.target.value })}><option value="label">Label</option><option value="body">Body</option><option value="heading">Heading</option><option value="display">Display heading</option></select></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Allineamento', 'Alignment')}</span><select value={item.text_align || 'left'} onChange={(event) => updateContentDraft(selected.key, { text_align: event.target.value })}><option value="left">Left</option><option value="center">Center</option></select></label>
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
  { key: 'contact.page.intro', section: 'Contatti', label_it: 'Intro contatti', label_en: 'Contact intro', type: 'textarea', default_it: i18n.it.formIntro, default_en: i18n.en.formIntro, text_size: 'large' }
];

function contentDefinitionMap() {
  return SITE_CONTENT_DEFINITIONS.reduce((acc, item) => ({ ...acc, [item.key]: item }), {});
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

function financeCategoryLabel(value, lang) {
  const found = [...FINANCE_CATEGORIES.income, ...FINANCE_CATEGORIES.expense].find(([key]) => key === value);
  return found ? (lang === 'it' ? found[1] : found[2]) : value || '-';
}

function formatMoney(amount, currency = 'EUR') {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: currency || 'EUR' }).format(Number(amount || 0));
}

function FinanceAdminPage({ lang, session }) {
  const [entries, setEntries] = useState([]);
  const [requests, setRequests] = useState([]);
  const [fixedExcursions, setFixedExcursions] = useState([]);
  const [leaflets, setLeaflets] = useState([]);
  const [filters, setFilters] = useState({ type: 'all', fromDate: '', toDate: '', category: 'all', linked: 'all', includeArchived: false });
  const [form, setForm] = useState({ entry_date: todayIso(), type: 'income', amount: '', currency: 'EUR', title: '', description: '', category: 'booking_payment', payment_method: '', booking_request_id: '', fixed_excursion_id: '', leaflet_id: '' });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [entryData, requestData, fixedData, leafletData] = await Promise.all([
        listFinanceEntries(filters),
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

  useEffect(() => { refresh(); }, [filters.type, filters.fromDate, filters.toDate, filters.category, filters.linked, filters.includeArchived]);

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'type' ? { category: value === 'income' ? 'booking_payment' : 'fuel' } : {})
    }));
  }

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
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

  const income = entries.filter((entry) => entry.active !== false && entry.type === 'income').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const expenses = entries.filter((entry) => entry.active !== false && entry.type === 'expense').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const linked = entries.filter((entry) => entry.booking_request_id || entry.fixed_excursion_id || entry.leaflet_id).length;
  const unlinkedExpenses = entries.filter((entry) => entry.type === 'expense' && !entry.booking_request_id && !entry.fixed_excursion_id && !entry.leaflet_id).length;
  const categories = filters.type === 'expense' ? FINANCE_CATEGORIES.expense : filters.type === 'income' ? FINANCE_CATEGORIES.income : [...FINANCE_CATEGORIES.income, ...FINANCE_CATEGORIES.expense];

  return (
    <section className="admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Tracker economico', 'Money tracker')}</span>
          <h1>{adminCopy(lang, 'Finanze', 'Finance')}</h1>
          <p>{adminCopy(lang, 'Registro interno per entrate, uscite e collegamenti a prenotazioni o escursioni. Non è un sistema di pagamento.', 'Internal ledger for income, expenses, and links to bookings or excursions. This is not a payment system.')}</p>
        </div>
        <button className="button secondary" type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      <div className="admin-summary-grid finance-summary-grid">
        <SummaryCard label={adminCopy(lang, 'Entrate totali', 'Total earnings')} value={formatMoney(income)} />
        <SummaryCard label={adminCopy(lang, 'Uscite totali', 'Total expenses')} value={formatMoney(expenses)} />
        <SummaryCard label={adminCopy(lang, 'Utile netto', 'Net profit')} value={formatMoney(income - expenses)} />
        <SummaryCard label={adminCopy(lang, 'Prenotazioni collegate', 'Linked bookings')} value={linked} />
        <SummaryCard label={adminCopy(lang, 'Spese non collegate', 'Unlinked expenses')} value={unlinkedExpenses} />
      </div>
      <div className="admin-filter-bar finance-filter-bar">
        <select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}><option value="all">{adminCopy(lang, 'Tutti i tipi', 'All types')}</option><option value="income">{adminCopy(lang, 'Entrate', 'Income')}</option><option value="expense">{adminCopy(lang, 'Uscite', 'Expenses')}</option></select>
        <select value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}><option value="all">{adminCopy(lang, 'Tutte le categorie', 'All categories')}</option>{categories.map(([key]) => <option key={key} value={key}>{financeCategoryLabel(key, lang)}</option>)}</select>
        <select value={filters.linked} onChange={(event) => updateFilter('linked', event.target.value)}><option value="all">{adminCopy(lang, 'Collegate e libere', 'Linked and unlinked')}</option><option value="linked">{adminCopy(lang, 'Solo collegate', 'Linked only')}</option><option value="unlinked">{adminCopy(lang, 'Solo non collegate', 'Unlinked only')}</option></select>
        <input type="date" value={filters.fromDate} onChange={(event) => updateFilter('fromDate', event.target.value)} />
        <input type="date" value={filters.toDate} onChange={(event) => updateFilter('toDate', event.target.value)} />
        <label className="check-field compact-check"><input type="checkbox" checked={filters.includeArchived} onChange={(event) => updateFilter('includeArchived', event.target.checked)} /> {adminCopy(lang, 'Includi archivio', 'Include archive')}</label>
      </div>
      <div className="admin-two-column finance-layout">
        <section className="admin-panel">
          <h2>{editing ? adminCopy(lang, 'Modifica voce', 'Edit entry') : adminCopy(lang, 'Aggiungi voce', 'Add entry')}</h2>
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
        </section>
        <section className="admin-panel">
          <div className="admin-panel-header"><h2>{adminCopy(lang, 'Voci finanziarie', 'Financial entries')}</h2><span className="status-pill accepted">{entries.length}</span></div>
          {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : entries.length === 0 ? <p>{adminCopy(lang, 'Nessuna voce trovata.', 'No entries found.')}</p> : (
            <div className="finance-entry-list">
              {entries.map((entry) => <FinanceEntryCard key={entry.id} entry={entry} lang={lang} onEdit={() => startEdit(entry)} onArchive={() => archive(entry)} />)}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function requestFinanceLabel(request, lang) {
  if (!request) return '-';
  return `${formatDateForMessage(request.requested_date, lang) || '-'} · ${request.customer_name || '-'} · ${adminExperienceLabel(request.experience_id, lang)}${request.booking_code ? ` · ${request.booking_code}` : ''}`;
}

function FinanceEntryCard({ entry, lang, onEdit, onArchive }) {
  return (
    <article className={`finance-entry-card ${entry.active === false ? 'inactive' : ''}`}>
      <div className="request-card-head">
        <div><h3>{entry.title}</h3><p>{formatDateForMessage(entry.entry_date, lang)} · {financeCategoryLabel(entry.category, lang)}</p></div>
        <strong className={`finance-amount ${entry.type}`}>{entry.type === 'expense' ? '-' : '+'}{formatMoney(entry.amount, entry.currency)}</strong>
      </div>
      {entry.description && <p>{entry.description}</p>}
      <p className="small-note">{entry.payment_method || adminCopy(lang, 'Metodo non indicato', 'No payment method')} · {entry.booking_request_id || entry.fixed_excursion_id || entry.leaflet_id ? adminCopy(lang, 'Collegata', 'Linked') : adminCopy(lang, 'Non collegata', 'Unlinked')}</p>
      <div className="request-actions"><button className="button secondary" type="button" onClick={onEdit}>{adminCopy(lang, 'Modifica', 'Edit')}</button>{entry.active !== false && <button className="button secondary danger" type="button" onClick={onArchive}>{adminCopy(lang, 'Archivia', 'Archive')}</button>}</div>
    </article>
  );
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
          <h1>{adminCopy(lang, 'Pannello operativo', 'Operations')}</h1>
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
          <details className="admin-archive-details today-requests-details">
            <summary><span>{adminCopy(lang, 'Richieste di oggi', 'Today requests')}</span><strong>{todayRequests.length}</strong></summary>
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
          <h2>{adminCopy(lang, 'Prossima operatività', 'Upcoming operations')}</h2>
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
          <h3>{adminCopy(lang, 'Decisioni recenti', 'Recent decisions')}</h3>
          <AdminMiniList
            items={recentDecisions}
            empty={adminCopy(lang, 'Nessuna decisione recente.', 'No recent decisions.')}
            render={(request) => <span><strong>{requestStatusLabels[request.status]?.[lang] || request.status}</strong> · {request.customer_name || '-'} · {formatDateForMessage(request.requested_date, lang) || '-'}{request.decision_note ? ` · ${request.decision_note}` : ''}</span>}
          />
          <button className="button secondary admin-inline-button" type="button" onClick={() => navigate('/admin/requests')}>{adminCopy(lang, 'Apri storico richieste', 'Open request history')}</button>
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
          <details className="admin-archive-details">
            <summary><span>{adminCopy(lang, 'Esperienze passate', 'Past experiences')}</span><strong>{pastAccepted.length}</strong></summary>
            {pastAccepted.length === 0 ? <p className="small-note">{adminCopy(lang, 'Nessuna esperienza passata.', 'No past experiences.')}</p> : (
              <div className="request-card-list compact-list">
                {pastAccepted.map((request) => <RequestCard key={request.id} request={request} lang={lang} compact />)}
              </div>
            )}
          </details>
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
  customer_name: '', customer_phone: '', customer_email: '', preferred_contact: 'whatsapp', source: 'whatsapp', request_type: 'private', party_type: 'solo', experience_id: 'unsure', requested_date: '', alternative_date: '', language: 'it', adults: '', children: '', children_under_3: false, private_experience: false, main_interest: '', preferred_pace: '', message: '', admin_note: ''
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

function AdminInput({ label, value, onChange, type = 'text' }) {
  const id = useMemo(() => `field-${Math.random().toString(36).slice(2)}`, []);
  return <label className="admin-field" htmlFor={id}><span>{label}</span><input id={id} type={type} value={value || ''} min={type === 'number' ? '0' : undefined} onChange={(event) => onChange(event.target.value)} /></label>;
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

function AdminReviewsPanel({ lang }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [confirmReview, setConfirmReview] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [savingReplyId, setSavingReplyId] = useState('');

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
      <div className="admin-panel-header"><h2>{adminCopy(lang, 'Gestione recensioni', 'Review management')}</h2><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
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
          <RequestStatusAccordions
            requests={requests}
            lang={lang}
            onApprove={(request) => setDecision({ type: 'approve', request })}
            onDecline={(request) => setDecision({ type: 'decline', request })}
            onRemove={(request) => setDecision({ type: 'remove', request })}
          />
        )}
      </section>
      <AdminReviewsPanel lang={lang} />
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

function PartnershipsAdminPage({ lang, session }) {
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
          <h1>{adminCopy(lang, 'Collaborazioni', 'Partnerships')}</h1>
          <p>{adminCopy(lang, 'Crea, modifica e disattiva le collaborazioni visibili sul sito pubblico.', 'Create, edit, and deactivate collaborations visible on the public website.')}</p>
        </div>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      <div className="admin-two-column availability-columns">
        <section className="admin-panel">
          <h2>{adminCopy(lang, 'Crea collaborazione', 'Create partnership')}</h2>
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
          <div className="admin-panel-header"><h2>{adminCopy(lang, 'Collaborazioni salvate', 'Saved partnerships')}</h2><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
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

function AvailabilityPage({ lang, session }) {
  const [tab, setTab] = useState('blocks');
  const [blocks, setBlocks] = useState([]);
  const [fixedExcursions, setFixedExcursions] = useState([]);
  const [leaflets, setLeaflets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [form, setForm] = useState({ date: '', experience_id: '', status: 'closed', reason_it: '', reason_en: '', internal_note: '' });
  const [fixedForm, setFixedForm] = useState({ date: '', start_time: '', end_time: '', experience_id: 'etna-live', leaflet_id: '', title_it: '', title_en: '', description_it: '', description_en: '', meeting_point_it: '', meeting_point_en: '', difficulty_it: '', difficulty_en: '', price_note_it: '', price_note_en: '', blockedDatesFile: null, blocked_dates_file_url: '', blocked_dates_file_name: '', blocked_dates_file_type: '', blocked_dates_file_path: '', capacity: '12', active: true });
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
      setFixedForm({ date: '', start_time: '', end_time: '', experience_id: 'etna-live', leaflet_id: '', title_it: '', title_en: '', description_it: '', description_en: '', meeting_point_it: '', meeting_point_en: '', difficulty_it: '', difficulty_en: '', price_note_it: '', price_note_en: '', blockedDatesFile: null, blocked_dates_file_url: '', blocked_dates_file_name: '', blocked_dates_file_type: '', blocked_dates_file_path: '', capacity: '12', active: true });
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
          <h1>{adminCopy(lang, 'Disponibilità', 'Availability')}</h1>
          <p>{adminCopy(lang, 'Gestisci disponibilità privata e date fisse prenotabili fino a 12 persone.', 'Manage private availability and fixed excursion dates bookable up to 12 people.')}</p>
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
  const [formState, setFormState] = useState({ language: 'it', requestType: 'private', partyType: 'solo', adults: '1', children: '0', childrenUnder3Count: '0', message: i18n.it.defaultMessage });
  const [activePage, setActivePage] = useState('home');
  const [siteMedia, setSiteMedia] = useState({});
  const [siteContent, setSiteContent] = useState({});
  const contactRef = useRef(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    Promise.all([listSiteMedia({ activeOnly: true }), loadPublicSiteContent()])
      .then(([mediaItems, contentItems]) => {
        if (!active) return;
        setSiteMedia(buildMediaMap(mediaItems));
        setSiteContent(buildSiteContentMap(contentItems));
      })
      .catch(() => {
        if (!active) return;
        setSiteMedia({});
        setSiteContent({});
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

  function scrollToForm() {
    setActivePage('contact');
    window.setTimeout(() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function fillForm({ experienceId, message, requestType, fixedExcursionId, requestedDate, adults, children, childrenUnder3Count, scroll = false }) {
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
      language: lang
    }));
    if (scroll) scrollToForm();
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
        return <ContactForm lang={lang} formState={formState} setFormState={setFormState} siteContent={siteContent} />;
      case 'home':
      default:
        return <Hero lang={lang} setActivePage={setActivePage} scrollToForm={scrollToForm} siteMedia={siteMedia} siteContent={siteContent} />;
    }
  }

  if (pathname.startsWith('/admin')) {
    return <AdminRouter pathname={pathname} navigate={navigate} lang={lang} setLang={setLang} />;
  }

  return (
    <>
      <Header lang={lang} setLang={setLang} activePage={activePage} setActivePage={setActivePage} siteMedia={siteMedia} />
      <main ref={contactRef} className={`public-page-shell public-page-${activePage}`}>
        {renderPublicPage()}
      </main>
      <Footer lang={lang} />
      <StickyMobileBar lang={lang} />
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
