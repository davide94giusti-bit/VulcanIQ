import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { redeemBookingCode, claimGiftCardBookingCode } from '../services/bookingCodes.js';
import { loadPublicFixedExcursions, updateFixedExcursion, loadPublicMonthlyLeaflets } from '../services/availabilityService.js';
import { loadPublicPartnerships } from '../services/partnershipService.js';
import { referralAttributionPayload } from '../services/referrals.js';
import { trackExcursionView, trackExperienceCardView, trackExperienceDetailOpen, trackCalendarDateSelect, trackBookingFormOpen, trackBookingFormStarted, trackBookingFormStepCompleted, trackBookingFormFieldStart, trackBookingSubmitValidationError, trackContactClick, trackMapsClick, trackEvent, getAnalyticsIdentitySnapshot, createFormJourney, markFormFieldStarted, markFormActivity, markFormSubmitted, markFormAbandoned, markFormRecoveredViaWhatsApp } from '../analytics.js';
import { submitPublicBookingRequestWithTracking } from '../services/publicBookingSubmit.js';
import { claimRequestedNotificationOwnership } from '../services/notificationService.js';
import { formatCurrencyAmount } from '../utils/money.js';
import NotificationUnreadBadge from '../features/notifications/NotificationUnreadBadge.jsx';
import { notificationUnreadAriaLabel } from '../domain/notificationInbox.js';
import useBodyScrollLock from '../hooks/useBodyScrollLock.js';
import useDialogFocusTrap from '../hooks/useDialogFocusTrap.js';
import { createFastRequestDraft } from '../domain/fastRequestDraft.js';
import { canonicalPathForPage } from '../app/publicRoutes.js';
import { canTrack } from '../analytics.js';
import { usePublicChallenge } from '../features/privacy/PublicChallenge.jsx';

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

const MOTION_DURATION_MS = 220;

function useTransitionPresence(isOpen, duration = MOTION_DURATION_MS) {
  const [shouldRender, setShouldRender] = useState(Boolean(isOpen));
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
      return undefined;
    }

    if (!shouldRender) {
      setIsClosing(false);
      return undefined;
    }

    setIsClosing(true);
    const timeout = window.setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
    }, duration);

    return () => window.clearTimeout(timeout);
  }, [isOpen, shouldRender, duration]);

  return { shouldRender, isClosing };
}

function useTransitionValue(value, duration = MOTION_DURATION_MS) {
  const presence = useTransitionPresence(Boolean(value), duration);
  const [renderedValue, setRenderedValue] = useState(value);

  useEffect(() => {
    if (value) {
      setRenderedValue(value);
      return;
    }

    if (!presence.shouldRender) setRenderedValue(null);
  }, [value, presence.shouldRender]);

  return { ...presence, renderedValue: presence.shouldRender ? renderedValue : null };
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
}

function motionScrollBehavior() {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

function mediaUrl(siteMedia, key, fallback) {
  const item = siteMedia?.[key];
  if (item?.active === false) return '';
  return item?.file_url || fallback;
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
    nav: ['Inizio', 'Escursioni', 'Collaborazioni', 'Chi siamo', 'Recensioni', 'Social', 'Notizie live sull’Etna', 'Contattaci'],
    contact: 'Contattaci',
    heroKicker: '',
    heroTitle: "L'Etna non è solo uno scenario.",
    heroLead: 'Esperienze private e fisse sull’Etna per leggere il vulcano come territorio vivo: con conoscenza, sicurezza e relazione umana.',
    findExperience: "Trova l'esperienza corretta",
    viewAvailability: 'Prenota ora',
    bookWithCode: 'PRENOTA CON CODICE',
    findExperienceModalIntro: "Rispondi a poche domande: ti suggeriremo l'esperienza migliore e le prossime date disponibili.",
    findExperienceInterestQuestion: 'Cosa ti interessa di più?',
    findExperienceGroupQuestion: 'Con chi viaggi?',
    findExperienceResultTitle: 'Esperienza consigliata',
    bookingCodeTitle: 'Codice prenotazione',
    bookingCodeIntro: 'Inserisci il codice ricevuto dal team vulcanIQ.',
    bookingCodePlaceholder: 'Inserisci codice prenotazione',
    confirmBookingCode: 'Conferma codice',
    bookingCodeNeedHelp: 'Hai bisogno di aiuto?',
    bookingCodeHelpText: 'Se il codice non funziona, contatta direttamente il team.',
    bookingCodeSuccessPrefix: 'Congratulazioni',
    bookingCodeSuccessText: 'Hai prenotato con successo {experience}.',
    bookingCodeCelebrationKicker: 'Prenotazione confermata',
    bookingCodeCelebrationTitle: 'Fantastico, {name}!',
    bookingCodeCelebrationSubtitle: 'La tua esperienza {experience} è confermata. Preparati a vivere l\u2019Etna con vulcanIQ.',
    bookingCodeCelebrationDateLabel: 'Data esperienza',
    bookingCodeCelebrationFooter: 'Ci vediamo sull\u2019Etna.',
    bookingCodeRequired: 'Inserisci un codice prenotazione.',
    bookingCodeNotFound: 'Codice non trovato.',
    bookingCodeAlreadyUsed: 'Codice già utilizzato.',
    bookingCodeExpired: 'Codice scaduto.',
    bookingCodeCancelled: 'Codice annullato.',
    bookingCodeGenericError: 'Controlla il codice e riprova.',
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
    startQuestionnaire: 'Inizia il questionario',
    prepareYourRequest: 'Prepara la tua richiesta',
    contactQuestionnaireIntro: 'Rispondi una domanda alla volta: alla fine potrai controllare e modificare il messaggio prima di inviarlo.',
    contactQuestionnaireTitle: 'Prepara la tua richiesta',
    contactQuestionnaireProgress: 'Passaggio {current} di {total}',
    contactQuestionnaireCloseConfirm: 'Vuoi chiudere il questionario? Le risposte inserite potrebbero andare perse.',
    next: 'Avanti',
    back: 'Indietro',
    reviewMessage: 'Controlla il messaggio',
    regenerateMessage: 'Rigenera messaggio dalle risposte',
    dateTodayOrFuture: 'Seleziona una data di oggi o futura.',
    requestTypeQuestion: 'Che tipo di esperienza vuoi richiedere?',
    experienceQuestion: 'Quale esperienza ti interessa?',
    dateQuestion: 'Quando vorresti vivere l’esperienza?',
    participantsQuestion: 'Chi parteciperà?',
    contactQuestion: 'Come possiamo ricontattarti?',
    attributionQuestion: 'Dove hai sentito parlare di vulcanIQ?',
    notSure: 'Non sono sicuro',
    noDateYet: 'Non ho ancora una data precisa',
    chooseExperienceOptional: 'Scegli un’esperienza o indica che non sei sicuro.',
    contactPhoneRequired: 'Inserisci un numero di telefono per essere ricontattato via WhatsApp o telefono.',
    contactEmailRequired: 'Inserisci un indirizzo email per essere ricontattato via email.',
    contactPhoneInvalid: 'Inserisci un numero di telefono valido usando solo numeri e, se necessario, un + iniziale.',
    contactEmailInvalid: 'Inserisci un indirizzo email valido con @.',
    answerRequired: 'Rispondi a questa domanda per continuare.',
    fixedExcursionRequired: 'Scegli un’escursione fissa disponibile oppure seleziona “Non sono sicuro”.',
    finalMessageHelp: 'Questo messaggio è generato dalle tue risposte. Puoi modificarlo prima di inviarlo.',
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
    nav: ['Home', 'Excursions', 'Partnerships', 'Who we are', 'Reviews', 'Social', 'Etna live news', 'Contact us'],
    contact: 'Contact us',
    heroKicker: '',
    heroTitle: 'Mount Etna is not just a backdrop.',
    heroLead: 'Private and fixed Mount Etna experiences that help guests read the volcano as a living territory: with knowledge, safety, and human connection.',
    findExperience: 'Find the right experience',
    viewAvailability: 'Book now',
    bookWithCode: 'BOOK WITH CODE',
    findExperienceModalIntro: 'Answer a few questions: we will suggest the best experience and the next open dates.',
    findExperienceInterestQuestion: 'What interests you most?',
    findExperienceGroupQuestion: 'Who are you travelling with?',
    findExperienceResultTitle: 'Recommended experience',
    bookingCodeTitle: 'Booking code',
    bookingCodeIntro: 'Enter the code received from the vulcanIQ team.',
    bookingCodePlaceholder: 'Enter booking code',
    confirmBookingCode: 'Confirm code',
    bookingCodeNeedHelp: 'Need help?',
    bookingCodeHelpText: 'If the code does not work, contact the team directly.',
    bookingCodeSuccessPrefix: 'Congratulations',
    bookingCodeSuccessText: 'You successfully booked {experience}.',
    bookingCodeCelebrationKicker: 'Booking confirmed',
    bookingCodeCelebrationTitle: 'Fantastic, {name}!',
    bookingCodeCelebrationSubtitle: 'Your {experience} experience is confirmed. Get ready to experience Mount Etna with vulcanIQ.',
    bookingCodeCelebrationDateLabel: 'Experience date',
    bookingCodeCelebrationFooter: 'See you on Mount Etna.',
    bookingCodeRequired: 'Enter a booking code.',
    bookingCodeNotFound: 'Code not found.',
    bookingCodeAlreadyUsed: 'Code already used.',
    bookingCodeExpired: 'Code expired.',
    bookingCodeCancelled: 'Code cancelled.',
    bookingCodeGenericError: 'Check the code and try again.',
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
    startQuestionnaire: 'Start the questionnaire',
    prepareYourRequest: 'Prepare your request',
    contactQuestionnaireIntro: 'Answer one question at a time: at the end you can review and edit the message before sending it.',
    contactQuestionnaireTitle: 'Prepare your request',
    contactQuestionnaireProgress: 'Step {current} of {total}',
    contactQuestionnaireCloseConfirm: 'Do you want to close the questionnaire? Your answers may be lost.',
    next: 'Next',
    back: 'Back',
    reviewMessage: 'Review your message',
    regenerateMessage: 'Regenerate message from answers',
    dateTodayOrFuture: 'Please select today or a future date.',
    requestTypeQuestion: 'What type of experience would you like to request?',
    experienceQuestion: 'Which experience are you interested in?',
    dateQuestion: 'When would you like to do the experience?',
    participantsQuestion: 'Who will participate?',
    contactQuestion: 'How can we contact you?',
    attributionQuestion: 'Where did you hear about vulcanIQ?',
    notSure: 'I am not sure',
    noDateYet: 'I do not have a precise date yet',
    chooseExperienceOptional: 'Choose an experience or say you are not sure.',
    contactPhoneRequired: 'Enter a phone number so we can contact you by WhatsApp or phone.',
    contactEmailRequired: 'Enter an email address so we can contact you by email.',
    contactPhoneInvalid: 'Enter a valid phone number using only numbers and, if needed, one leading +.',
    contactEmailInvalid: 'Enter a valid email address containing @.',
    answerRequired: 'Answer this question to continue.',
    fixedExcursionRequired: 'Choose an available fixed excursion or select “I am not sure”.',
    finalMessageHelp: 'This message is generated from your answers. You can edit it before sending.',
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

const PARTNERSHIP_CATEGORIES = [
  { key: 'activities', it: 'Attività', en: 'Activities', aliases: ['attivita', 'attività', 'activity', 'activities', 'experience', 'esperienza'] },
  { key: 'restaurants', it: 'Ristoranti', en: 'Restaurants', aliases: ['ristorante', 'ristoranti', 'restaurant', 'restaurants', 'food', 'cibo', 'bar', 'trattoria'] },
  { key: 'accommodation', it: 'Alloggi', en: 'Accommodation', aliases: ['alloggio', 'alloggi', 'accommodation', 'accomodation', 'hotel', 'bnb', 'b&b', 'casa vacanze', 'vacanze', 'apartment', 'appartamento', 'holiday home'] },
  { key: 'transport', it: 'Trasporti', en: 'Transport', aliases: ['trasporto', 'trasporti', 'transport', 'transfer', 'taxi', 'bus', 'ncc', 'driver'] },
  { key: 'guides_services', it: 'Guide / Servizi', en: 'Guides / Services', aliases: ['guide', 'guida', 'servizi', 'servizio', 'services', 'service', 'tour guide'] },
  { key: 'shops', it: 'Negozi', en: 'Shops', aliases: ['negozio', 'negozi', 'shop', 'shops', 'store', 'bottega'] },
  { key: 'other', it: 'Altro', en: 'Other', aliases: ['altro', 'other', 'misc'] }
];

function normalizedKeyText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function partnershipCategoryOption(key) {
  return PARTNERSHIP_CATEGORIES.find((item) => item.key === key) || PARTNERSHIP_CATEGORIES[PARTNERSHIP_CATEGORIES.length - 1];
}

function partnershipCategoryLabel(key, lang) {
  const option = partnershipCategoryOption(key);
  return lang === 'it' ? option.it : option.en;
}

function partnershipCategoryKey(item = {}) {
  const candidates = [item.category_key, item.category, item.category_it, item.category_en, item.name].map(normalizedKeyText).filter(Boolean);
  for (const candidate of candidates) {
    for (const option of PARTNERSHIP_CATEGORIES) {
      if (candidate === normalizedKeyText(option.key) || candidate === normalizedKeyText(option.it) || candidate === normalizedKeyText(option.en) || option.aliases.some((alias) => candidate.includes(normalizedKeyText(alias)))) {
        return option.key;
      }
    }
  }
  return 'other';
}

function localizedPartnershipDescription(item = {}, lang) {
  return lang === 'it' ? (item.description_it || item.description_en || '') : (item.description_en || item.description_it || '');
}

function createTextTeaser(value, maxLength = 150) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > maxLength ? `${clean.slice(0, maxLength).replace(/\s+\S*$/, '')}…` : clean;
}

function FormattedText({ textValue, className = 'formatted-text' }) {
  const raw = String(textValue || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return null;
  return (
    <div className={className}>
      {raw.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>
      ))}
    </div>
  );
}

function normalizeLatestNewsTitle(value, lang) {
  const clean = cleanEditableTextValue(value);
  const normalized = normalizedKeyText(clean);
  if (!clean || normalized === 'ultime notizie' || normalized === 'latest news') return lang === 'it' ? LATEST_NEWS_DEFAULTS.title_it : LATEST_NEWS_DEFAULTS.title_en;
  return clean;
}

function storePublicLanguage(lang) {
  if (typeof window === 'undefined') return;
  if (lang !== 'en' && lang !== 'it') return;
  try { window.localStorage.setItem('vulcaniq_public_language', lang); } catch {}
}

function navigatePublicRoute(path, lang) {
  if (typeof window === 'undefined') return;
  const cleanLang = lang === 'en' ? 'en' : 'it';
  const target = new URL(path, window.location.origin);
  if (cleanLang === 'en') target.searchParams.set('lang', 'en');
  else target.searchParams.delete('lang');
  storePublicLanguage(cleanLang);
  window.history.pushState({}, '', `${target.pathname}${target.search}${target.hash}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
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

const SOCIAL_LINKS_CONTENT_KEY = 'site.social_links';

const SOCIAL_PLATFORM_OPTIONS = [
  { value: 'instagram', it: 'Instagram', en: 'Instagram', icon: 'insta' },
  { value: 'facebook', it: 'Facebook', en: 'Facebook', icon: 'facebook' },
  { value: 'tiktok', it: 'TikTok', en: 'TikTok', icon: 'tiktok' },
  { value: 'youtube', it: 'YouTube', en: 'YouTube', icon: 'youtube' },
  { value: 'linkedin', it: 'LinkedIn', en: 'LinkedIn', icon: 'linkedin' },
  { value: 'tripadvisor', it: 'Tripadvisor', en: 'Tripadvisor', icon: 'tripadvisor' },
  { value: 'google_reviews', it: 'Google Reviews', en: 'Google Reviews', icon: 'google' },
  { value: 'whatsapp', it: 'WhatsApp', en: 'WhatsApp', icon: 'chat' },
  { value: 'other', it: 'Altro', en: 'Other', icon: 'link' }
];

const LATEST_NEWS_DEFAULTS = {
  title_it: 'Notizie live sull’Etna',
  title_en: 'Etna live news',
  description_it: '',
  description_en: '',
  cta_it: 'Apri le notizie live',
  cta_en: 'Open live news'
};

function socialPlatformOption(value) {
  return SOCIAL_PLATFORM_OPTIONS.find((item) => item.value === value) || SOCIAL_PLATFORM_OPTIONS[SOCIAL_PLATFORM_OPTIONS.length - 1];
}

function socialPlatformLabel(value, lang) {
  const option = socialPlatformOption(value);
  return lang === 'it' ? option.it : option.en;
}

function socialPlatformDescription(value, lang) {
  const labels = {
    instagram: { it: 'Aggiornamenti, foto dal territorio e dietro le quinte.', en: 'Updates, local photos and behind-the-scenes content.' },
    facebook: { it: 'Novità, post e informazioni per la community.', en: 'News, posts and community updates.' },
    tiktok: { it: 'Video brevi dall’Etna e dalle esperienze.', en: 'Short videos from Etna and the experiences.' },
    youtube: { it: 'Video, racconti e contenuti più lunghi.', en: 'Videos, stories and longer-form content.' },
    whatsapp: { it: 'Contatto diretto con il team vulcanIQ.', en: 'Direct contact with the vulcanIQ team.' },
    google_reviews: { it: 'Recensioni e profilo Google.', en: 'Google reviews and profile.' },
    other: { it: 'Canale ufficiale vulcanIQ.', en: 'Official vulcanIQ channel.' }
  };
  const copy = labels[value] || labels.other;
  return lang === 'it' ? copy.it : copy.en;
}

function safeExternalUrl(value, { allowHttp = false } = {}) {
  const clean = String(value || '').trim();
  if (!clean) return '';
  try {
    const url = new URL(clean);
    if (url.protocol === 'https:') return url.href;
    if (allowHttp && url.protocol === 'http:') return url.href;
  } catch (error) {
    return '';
  }
  return '';
}

function parseBooleanSetting(value, fallback = true) {
  const clean = String(value ?? '').trim().toLowerCase();
  if (!clean) return fallback;
  if (['false', '0', 'no', 'off', 'disabled', 'disattivo'].includes(clean)) return false;
  if (['true', '1', 'yes', 'on', 'enabled', 'attivo'].includes(clean)) return true;
  return fallback;
}

function socialLinksJsonFromContent(siteContent) {
  const item = siteContent?.[SOCIAL_LINKS_CONTENT_KEY];
  if (!item) return null;
  return item.value_it || item.value_en || item.default_it || item.default_en || '[]';
}

function normalizeSocialLink(link = {}, index = 0) {
  const platform = SOCIAL_PLATFORM_OPTIONS.some((item) => item.value === link.platform) ? link.platform : 'other';
  const label = cleanEditableTextValue(link.label || link.display_label || link.custom_label || '');
  const url = cleanEditableTextValue(link.url || '');
  const order = Number.isFinite(Number(link.order ?? link.display_order)) ? Number(link.order ?? link.display_order) : index + 1;
  return {
    id: cleanEditableTextValue(link.id) || `${platform}-${index + 1}`,
    platform,
    label,
    url,
    enabled: link.enabled !== false && link.active !== false,
    order,
    icon_key: cleanEditableTextValue(link.icon_key || link.icon || socialPlatformOption(platform).icon || '')
  };
}

function parseSocialLinksJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSocialLink).filter((link) => link.platform || link.label || link.url);
  } catch (error) {
    return [];
  }
}

function defaultSocialLinks(siteContent) {
  const contact = resolvePublicContactDetails(siteContent);
  return contact.instagram ? [
    normalizeSocialLink({
      id: 'default-instagram',
      platform: 'instagram',
      label: 'Instagram',
      url: contact.instagram,
      enabled: true,
      order: 1,
      icon_key: 'insta'
    })
  ] : [];
}

function resolveSocialLinks(siteContent, { includeDisabled = false } = {}) {
  const raw = socialLinksJsonFromContent(siteContent);
  const configured = raw === null ? defaultSocialLinks(siteContent) : parseSocialLinksJson(raw);
  return configured
    .map(normalizeSocialLink)
    .map((link) => ({ ...link, url: safeExternalUrl(link.url) }))
    .filter((link) => link.url && (includeDisabled || link.enabled))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function socialLinkLabel(link, lang) {
  return cleanEditableTextValue(link.label) || socialPlatformLabel(link.platform, lang);
}

function latestNewsContentKey(field) {
  return `latest_news.${field}`;
}

function resolveLatestNewsSettings(siteContent, lang) {
  const enabled = parseBooleanSetting(contentSettingValue(siteContent, latestNewsContentKey('enabled'), 'true'), true);
  const title = normalizeLatestNewsTitle(contentText(siteContent, latestNewsContentKey('title'), lang, lang === 'it' ? LATEST_NEWS_DEFAULTS.title_it : LATEST_NEWS_DEFAULTS.title_en), lang);
  const description = contentText(siteContent, latestNewsContentKey('description'), lang, lang === 'it' ? LATEST_NEWS_DEFAULTS.description_it : LATEST_NEWS_DEFAULTS.description_en);
  const ctaLabel = contentText(siteContent, latestNewsContentKey('cta_label'), lang, lang === 'it' ? LATEST_NEWS_DEFAULTS.cta_it : LATEST_NEWS_DEFAULTS.cta_en);
  const urlIt = safeExternalUrl(contentSettingValue(siteContent, latestNewsContentKey('url_it'), ''));
  const urlEn = safeExternalUrl(contentSettingValue(siteContent, latestNewsContentKey('url_en'), ''));
  const selectedUrl = lang === 'it' ? (urlIt || urlEn) : (urlEn || urlIt);
  return {
    enabled,
    title,
    description,
    ctaLabel,
    urlIt,
    urlEn,
    selectedUrl,
    shouldRender: enabled && Boolean(selectedUrl)
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
  const explicitlyInactive = stored.active === false;
  return {
    ...definition,
    ...stored,
    key,
    media_key: key,
    label_it: stored.label_it || definition.it || key,
    label_en: stored.label_en || definition.en || key,
    file_url: explicitlyInactive ? (stored.file_url || '') : (stored.file_url || fallbackSrc || definition.fallback || ''),
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

function isPastPublicDate(value) {
  const clean = String(value || '').trim();
  if (!clean) return false;
  return clean < todayIso();
}

function sanitizePublicPhoneInput(value) {
  const raw = String(value || '');
  const hasLeadingPlus = raw.trimStart().startsWith('+');
  const digits = raw.replace(/\D/g, '');
  return `${hasLeadingPlus ? '+' : ''}${digits}`;
}

function isValidPublicPhone(value) {
  const clean = sanitizePublicPhoneInput(value);
  if (!clean) return true;
  const digits = clean.replace(/\D/g, '');
  return digits.length >= 5 && /^\+?\d+$/.test(clean);
}

function isValidPublicEmail(value) {
  const clean = String(value || '').trim();
  if (!clean) return true;
  return clean.includes('@') && !/\s/.test(clean) && clean.indexOf('@') > 0 && clean.indexOf('@') < clean.length - 1;
}

function preventInvalidPhoneInput(event) {
  const data = event.data;
  if (!data) return;
  if (!/^[0-9+]$/.test(data)) {
    event.preventDefault();
    return;
  }
  if (data === '+') {
    const value = String(event.currentTarget.value || '');
    const start = event.currentTarget.selectionStart ?? value.length;
    if (start !== 0 || value.includes('+')) event.preventDefault();
  }
}

function safeParticipantNumber(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function requestChoiceLabel(value, lang) {
  if (value === 'fixed') return text(lang, 'fixedExcursion');
  if (value === 'unsure') return text(lang, 'notSure');
  return text(lang, 'privateExcursion');
}

function preferredContactLabel(value, lang) {
  if (value === 'email') return 'Email';
  if (value === 'phone') return lang === 'it' ? 'Telefono' : 'Phone';
  return 'WhatsApp';
}

function hasMessageValue(value) {
  const clean = String(value || '').trim();
  return Boolean(clean && clean !== '-');
}

function messageLine(label, value, { trailingPeriod = false } = {}) {
  const clean = String(value || '').trim();
  if (!hasMessageValue(clean)) return '';
  const suffix = trailingPeriod && !/[.!?]$/.test(clean) ? '.' : '';
  return `• ${label}: ${clean}${suffix}`;
}

function joinMessageLines(lines) {
  return lines.filter(Boolean).join('\n');
}

function cleanDateForMessage(value, lang) {
  const clean = String(value || '').trim();
  if (!hasMessageValue(clean)) return '';
  return formatDateForMessage(clean, lang);
}

function peopleSummary({ adults, children, childrenUnder3Count, lang }) {
  const adultCount = safeParticipantNumber(adults, 0);
  const childCount = safeParticipantNumber(children, 0);
  const under3Count = safeParticipantNumber(childrenUnder3Count, 0);
  const olderChildrenCount = Math.max(childCount - under3Count, 0);
  const parts = [];

  if (adultCount > 0) {
    parts.push(lang === 'it'
      ? `${adultCount} ${adultCount === 1 ? 'adulto' : 'adulti'}`
      : `${adultCount} ${adultCount === 1 ? 'adult' : 'adults'}`);
  }

  if (olderChildrenCount > 0) {
    parts.push(lang === 'it'
      ? `${olderChildrenCount} ${olderChildrenCount === 1 ? 'bambino' : 'bambini'}`
      : `${olderChildrenCount} ${olderChildrenCount === 1 ? 'child' : 'children'}`);
  }

  if (under3Count > 0) {
    parts.push(lang === 'it'
      ? `${under3Count} ${under3Count === 1 ? 'bambino sotto i 3 anni' : 'bambini sotto i 3 anni'}`
      : `${under3Count} ${under3Count === 1 ? 'child under 3' : 'children under 3'}`);
  }

  return parts.join(', ');
}

function buildContactQuestionnaireMessage({ formState, selectedFixed, lang }) {
  const requestChoice = formState.requestTypeChoice || formState.requestType || 'private';
  const requestType = requestChoice === 'fixed' ? 'fixed' : 'private';
  const experienceId = requestType === 'fixed' && selectedFixed?.experience_id ? selectedFixed.experience_id : (formState.experienceId || 'unsure');
  const experienceName = experienceId && experienceId !== 'unsure' ? adminExperienceLabel(experienceId, lang) : text(lang, 'notSure');
  const requestedDate = selectedFixed?.date || formState.requestedDate || '';
  const alternativeDate = formState.alternativeDate || '';
  const fixedTitle = requestType === 'fixed' && selectedFixed ? (fixedExcursionTitle(selectedFixed, lang) || adminExperienceLabel(selectedFixed.experience_id || experienceId, lang)) : '';
  const fixedDateText = cleanDateForMessage(requestedDate, lang);
  const fixedStart = selectedFixed?.start_time ? String(selectedFixed.start_time).slice(0, 5) : '';
  const fixedEnd = selectedFixed?.end_time ? String(selectedFixed.end_time).slice(0, 5) : '';
  const fixedTime = fixedStart ? `${fixedStart}${fixedEnd ? `-${fixedEnd}` : ''}` : '';
  const fixedMeetingPoint = selectedFixed ? fixedExcursionField(selectedFixed, 'meeting_point', lang) : '';
  const requestTypeText = requestType === 'fixed' && fixedTitle
    ? `${text(lang, 'fixedExcursion')} - "${fixedTitle}"`
    : requestChoiceLabel(requestChoice, lang);
  const heard = normalizeHeardAboutUs(formState.heardAboutUs);
  const heardDisplay = heard ? heardAboutUsDisplay(heard, formState.heardAboutUsDetail, lang) : '';
  const phone = String(formState.phone || '').trim();
  const email = String(formState.email || '').trim();
  const name = String(formState.name || '').trim();
  const preferredContact = preferredContactLabel(formState.preferredContact || 'whatsapp', lang);
  const people = peopleSummary({
    adults: formState.adults,
    children: formState.children,
    childrenUnder3Count: formState.childrenUnder3Count,
    lang
  });

  if (lang === 'it') {
    const requestLines = joinMessageLines([
      messageLine('Tipo', requestTypeText),
      messageLine('Esperienza', requestType === 'fixed' && fixedTitle ? fixedTitle : experienceName),
      messageLine(requestType === 'fixed' ? 'Data' : 'Data preferita', fixedDateText),
      requestType === 'fixed' ? messageLine('Orario', fixedTime) : messageLine('Data alternativa', cleanDateForMessage(alternativeDate, lang)),
      requestType === 'fixed' ? messageLine('Punto d\u2019incontro', fixedMeetingPoint) : '',
      messageLine('Persone', people)
    ]);
    const contactLines = joinMessageLines([
      messageLine('Nome', name),
      messageLine('WhatsApp/telefono', phone),
      messageLine('Email', email),
      messageLine('Contatto preferito', preferredContact, { trailingPeriod: true })
    ]);
    const opening = requestType === 'fixed' && fixedTitle
      ? `Vorrei informazioni circa l\u2019escursione fissa del ${fixedDateText || '-'}: ${fixedTitle}.`
      : (heardDisplay
        ? `Ho sentito parlare di vulcanIQ da ${heardDisplay} e vorrei informazioni per un\u2019esperienza vulcanIQ sull\u2019Etna.`
        : 'Vorrei informazioni per un\u2019esperienza vulcanIQ sull\u2019Etna.');
    const sourceLine = requestType === 'fixed' && heardDisplay ? `Come ho conosciuto vulcanIQ: ${heardDisplay}.` : '';
    const sections = [
      `Ciao Leonardo,\n\n${opening}`,
      sourceLine,
      requestLines ? `Richiesta:\n${requestLines}` : '',
      contactLines ? `Contatti:\n${contactLines}` : '',
      'Vorrei sapere se la richiesta può essere confermata e ricevere dettagli su disponibilità, durata, prezzo e abbigliamento consigliato.',
      'Grazie.',
      hasMessageValue(name) ? name : ''
    ];
    return sections.filter(Boolean).join('\n\n');
  }

  const requestLines = joinMessageLines([
    messageLine('Type', requestTypeText),
    messageLine('Experience', requestType === 'fixed' && fixedTitle ? fixedTitle : experienceName),
    messageLine(requestType === 'fixed' ? 'Date' : 'Preferred date', fixedDateText),
    requestType === 'fixed' ? messageLine('Time', fixedTime) : messageLine('Alternative date', cleanDateForMessage(alternativeDate, lang)),
    requestType === 'fixed' ? messageLine('Meeting point', fixedMeetingPoint) : '',
    messageLine('People', people)
  ]);
  const contactLines = joinMessageLines([
    messageLine('Name', name),
    messageLine('WhatsApp/phone', phone),
    messageLine('Email', email),
    messageLine('Preferred contact', preferredContact, { trailingPeriod: true })
  ]);
  const opening = requestType === 'fixed' && fixedTitle
    ? `I would like information about the fixed excursion on ${fixedDateText || '-'}: ${fixedTitle}.`
    : (heardDisplay
      ? `I heard about vulcanIQ from ${heardDisplay} and I would like information about a vulcanIQ experience on Mount Etna.`
      : 'I would like information about a vulcanIQ experience on Mount Etna.');
  const sourceLine = requestType === 'fixed' && heardDisplay ? `How I heard about vulcanIQ: ${heardDisplay}.` : '';
  const sections = [
    `Hi Leonardo,\n\n${opening}`,
    sourceLine,
    requestLines ? `Request:\n${requestLines}` : '',
    contactLines ? `Contact:\n${contactLines}` : '',
    'I would like to know whether the request can be confirmed and receive details about availability, duration, price, and recommended clothing.',
    'Thank you.',
    hasMessageValue(name) ? name : ''
  ];
  return sections.filter(Boolean).join('\n\n');
}

function localizedContentField(item, field, lang, legacyFields = []) {
  if (!item) return '';
  const selected = String(item[`${field}_${lang}`] || '').trim();
  if (hasMessageValue(selected)) return selected;
  const fallbackLang = lang === 'it' ? 'en' : 'it';
  const fallback = String(item[`${field}_${fallbackLang}`] || '').trim();
  if (hasMessageValue(fallback)) return fallback;
  const fields = [field, ...legacyFields];
  for (const legacyField of fields) {
    const value = String(item[legacyField] || '').trim();
    if (hasMessageValue(value)) return value;
  }
  return '';
}

function fixedExcursionField(item, field, lang) {
  const legacyFields = field === 'description'
    ? [`note_${lang}`, `note_${lang === 'it' ? 'en' : 'it'}`, 'note']
    : [];
  return localizedContentField(item, field, lang, legacyFields);
}

function fixedExcursionProgram(item, lang) {
  return fixedExcursionField(item, 'program', lang) || fixedExcursionField(item, 'description', lang);
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

function monthlyLeafletField(leaflet, field, lang) {
  return localizedContentField(leaflet, field, lang, field === 'title' ? ['file_name'] : []);
}

function leafletTitle(leaflet, lang) {
  if (!leaflet) return '';
  return monthlyLeafletField(leaflet, 'title', lang) || text(lang, 'openProgram');
}

function monthlyLeafletFile(leaflet, lang) {
  if (!leaflet) return null;
  const selectedLang = lang === 'en' ? 'en' : 'it';
  const directUrl = String(leaflet[`leaflet_file_url_${selectedLang}`] || '').trim();
  if (directUrl) {
    return {
      file_url: directUrl,
      file_path: leaflet[`leaflet_file_path_${selectedLang}`] || '',
      file_name: leaflet[`leaflet_file_name_${selectedLang}`] || leaflet.file_name || '',
      file_type: leaflet[`leaflet_file_type_${selectedLang}`] || leaflet.file_type || ''
    };
  }
  const legacyUrl = String(leaflet.file_url || '').trim();
  if (legacyUrl) {
    return {
      file_url: legacyUrl,
      file_path: leaflet.file_path || '',
      file_name: leaflet.file_name || '',
      file_type: leaflet.file_type || ''
    };
  }
  return null;
}

function fixedExcursionLeafletFile(item, lang) {
  if (!item) return null;
  const selectedLang = lang === 'en' ? 'en' : 'it';
  const directUrl = String(item[`leaflet_file_url_${selectedLang}`] || '').trim();
  if (directUrl) {
    return {
      file_url: directUrl,
      file_path: item[`leaflet_file_path_${selectedLang}`] || '',
      file_name: item[`leaflet_file_name_${selectedLang}`] || item.blocked_dates_file_name || '',
      file_type: item[`leaflet_file_type_${selectedLang}`] || item.blocked_dates_file_type || ''
    };
  }
  const legacyUrl = String(item.blocked_dates_file_url || '').trim();
  if (legacyUrl) {
    return {
      file_url: legacyUrl,
      file_path: item.blocked_dates_file_path || '',
      file_name: item.blocked_dates_file_name || '',
      file_type: item.blocked_dates_file_type || ''
    };
  }
  return null;
}

function hasLeafletFile(leaflet, lang = 'it') {
  return Boolean(monthlyLeafletFile(leaflet, lang)?.file_url);
}

function hasMonthlyLeafletContent(leaflet) {
  return Boolean(leaflet && (
    hasLeafletFile(leaflet, 'it') ||
    hasLeafletFile(leaflet, 'en') ||
    monthlyLeafletField(leaflet, 'title', 'it') ||
    monthlyLeafletField(leaflet, 'title', 'en') ||
    monthlyLeafletField(leaflet, 'description', 'it') ||
    monthlyLeafletField(leaflet, 'description', 'en') ||
    monthlyLeafletField(leaflet, 'notes', 'it') ||
    monthlyLeafletField(leaflet, 'notes', 'en')
  ));
}

function isLeafletImage(fileOrLeaflet) {
  const fileUrl = String(fileOrLeaflet?.file_url || '').trim();
  return String(fileOrLeaflet?.file_type || '').startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(fileUrl);
}

function MonthlyProgramContent({ leaflet, lang, label }) {
  const description = monthlyLeafletField(leaflet, 'description', lang);
  const notes = monthlyLeafletField(leaflet, 'notes', lang);
  const file = monthlyLeafletFile(leaflet, lang);
  const fileUrl = String(file?.file_url || '').trim();
  return (
    <div className="leaflet-fullscreen-body">
      {(description || notes) && (
        <div className="monthly-program-copy">
          {description && <FormattedDescription textValue={description} />}
          {notes && <p className="monthly-program-notes">{notes}</p>}
        </div>
      )}
      {fileUrl ? (
        isLeafletImage(file) ? (
          <img className="leaflet-fullscreen-image" src={fileUrl} alt={label || text(lang, 'openProgram')} loading="lazy" decoding="async" />
        ) : (
          <iframe className="leaflet-fullscreen-frame" src={fileUrl} title={label || text(lang, 'openProgram')} />
        )
      ) : (
        !description && !notes ? <p className="small-note">{text(lang, 'noFixedExcursionLeaflets')}</p> : null
      )}
    </div>
  );
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
    .filter((leaflet) => hasMonthlyLeafletContent(leaflet) && Number(leaflet.month) === month && Number(leaflet.year) === year)
    .forEach((leaflet) => addOption({
      id: `monthly-${leaflet.id}`,
      kind: 'monthly_leaflet',
      leaflet,
      title: leafletTitle(leaflet, lang),
      subtitle: monthLabel(monthDate, lang)
    }));

  leaflets
    .filter((leaflet) => hasMonthlyLeafletContent(leaflet) && linkedIds.has(leaflet.id))
    .forEach((leaflet) => addOption({
      id: `linked-${leaflet.id}`,
      kind: 'linked_leaflet',
      leaflet,
      title: leafletTitle(leaflet, lang),
      subtitle: monthLabel(monthDate, lang)
    }));

  fixedInMonth.forEach((item) => {
    const fixedFile = fixedExcursionLeafletFile(item, lang);
    if (!fixedFile?.file_url) return;
    const leaflet = {
      id: `fixed-file-${item.id}`,
      ...fixedFile,
      title_it: fixedFile.file_name || fixedExcursionTitle(item, 'it'),
      title_en: fixedFile.file_name || fixedExcursionTitle(item, 'en')
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
  const ariaLabel = lang === 'it'
    ? `Apri indicazioni Google Maps per ${meeting}`
    : `Open Google Maps directions to ${meeting}`;
  const trackingContext = buildBookingTrackingContext({
    experienceId: item?.experience_id || '',
    requestType: 'fixed',
    sourceSection: 'calendar',
    sourceCta: 'google_maps_direct',
    ctaLocation: 'scheduled_excursion_detail',
    selectedDate: item?.date || '',
    hasFixedExcursion: true,
    language: lang
  });

  function handleMapsClick() {
    trackMapsClick('scheduled_excursion_detail', trackingContext);
    trackEvent('meeting_point_maps_click', {
      ...trackingContext,
      fixed_excursion_id: item?.id || '',
      experience_name: fixedExcursionTitle(item, lang),
      meeting_point_url: mapsUrl
    }, { dedupe: false, transport: 'beacon' });
  }

  return (
    <div className={`meeting-point-card ${mapsUrl ? 'is-clickable' : ''}`.trim()}>
      <dt>{text(lang, 'meetingPoint')}</dt>
      <dd>
        {mapsUrl ? (
          <a className="meeting-point-card__button" href={mapsUrl} target="_blank" rel="noopener noreferrer" aria-label={ariaLabel} onClick={handleMapsClick}>{meeting}</a>
        ) : meeting}
      </dd>
      {mapsUrl && <span className="meeting-point-card__hint">{text(lang, 'meetingPointDirectionsHint')}</span>}
    </div>
  );
}

function buildFixedExcursionMessage({ fixedExcursion, people }, lang) {
  const title = fixedExcursionTitle(fixedExcursion, lang) || adminExperienceLabel(fixedExcursion?.experience_id, lang);
  const dateText = formatDateForMessage(fixedExcursion?.date, lang) || '-';
  const start = fixedExcursion?.start_time ? String(fixedExcursion.start_time).slice(0, 5) : '';
  const end = fixedExcursion?.end_time ? String(fixedExcursion.end_time).slice(0, 5) : '';
  const timeText = start ? `${start}${end ? `-${end}` : ''}` : '';
  const meetingPoint = fixedExcursionField(fixedExcursion, 'meeting_point', lang);
  const detailLines = joinMessageLines([
    messageLine(lang === 'it' ? 'Data' : 'Date', dateText),
    messageLine(lang === 'it' ? 'Orario' : 'Time', timeText),
    messageLine(lang === 'it' ? 'Punto d\u2019incontro' : 'Meeting point', meetingPoint),
    messageLine(lang === 'it' ? 'Persone' : 'People', people || '')
  ]);

  if (lang === 'it') {
    return `Ciao Leonardo,\n\nVorrei informazioni circa l\u2019escursione fissa del ${dateText}: ${title}.\n\n${detailLines ? `Dettagli:\n${detailLines}\n\n` : ''}Vorrei sapere disponibilità, durata indicativa, prezzo e consigli sull\u2019abbigliamento.\n\nGrazie!`;
  }
  return `Hi Leonardo,\n\nI would like information about the fixed excursion on ${dateText}: ${title}.\n\n${detailLines ? `Details:\n${detailLines}\n\n` : ''}I would like to know availability, approximate duration, price, and clothing recommendations.\n\nThank you!`;
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

function Icon({ name }) {
  const paths = {
    phone: 'M6.6 10.8c1.5 3 3.9 5.4 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.3 1.3.4 2.6.6 4 .6.7 0 1.2.5 1.2 1.2v3.5c0 .7-.5 1.2-1.2 1.2C10.2 22 2 13.8 2 3.4 2 2.7 2.5 2.2 3.2 2.2h3.5c.7 0 1.2.5 1.2 1.2 0 1.4.2 2.8.6 4 .1.4 0 .9-.3 1.2l-1.6 2.2z',
    chat: 'M4 5.5C4 3.6 5.6 2 7.5 2h9C18.4 2 20 3.6 20 5.5v6c0 1.9-1.6 3.5-3.5 3.5H10l-4.4 4.1c-.6.5-1.6.1-1.6-.7V5.5z',
    user: 'M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-3.3 0-6 1.7-6 3.8V20h12v-2.2c0-2.1-2.7-3.8-6-3.8z',
    mail: 'M3 5h18v14H3V5zm2 2v.4l7 4.4 7-4.4V7H5zm14 10V9.8l-7 4.4-7-4.4V17h14z',
    insta: 'M7 2h10c2.8 0 5 2.2 5 5v10c0 2.8-2.2 5-5 5H7c-2.8 0-5-2.2-5-5V7c0-2.8 2.2-5 5-5zm5 5.2A4.8 4.8 0 1 0 12 16.8 4.8 4.8 0 0 0 12 7.2zm0 2A2.8 2.8 0 1 1 12 14.8 2.8 2.8 0 0 1 12 9.2zM17.6 6a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z',
    link: 'M10.6 13.4a1 1 0 0 1 0-1.4l2.8-2.8a3 3 0 0 1 4.2 4.2l-2.1 2.1a3 3 0 0 1-4.1.1 1 1 0 1 1 1.3-1.5 1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0-1.4-1.4L12 13.4a1 1 0 0 1-1.4 0zm2.8-2.8a1 1 0 0 1 0 1.4l-2.8 2.8a3 3 0 1 1-4.2-4.2l2.1-2.1a3 3 0 0 1 4.1-.1 1 1 0 1 1-1.3 1.5 1 1 0 0 0-1.4 0L7.8 12a1 1 0 1 0 1.4 1.4l2.8-2.8a1 1 0 0 1 1.4 0z',
    facebook: 'M14 8h2V5h-2c-2.2 0-4 1.8-4 4v2H8v3h2v8h3v-8h2.4l.6-3h-3V9c0-.6.4-1 1-1z',
    youtube: 'M21.6 7.2s-.2-1.5-.8-2.1c-.8-.8-1.7-.8-2.1-.9C15.8 4 12 4 12 4s-3.8 0-6.7.2c-.4 0-1.3.1-2.1.9-.6.6-.8 2.1-.8 2.1S2 9 2 10.8v1.7c0 1.8.4 3.6.4 3.6s.2 1.5.8 2.1c.8.8 1.8.8 2.3.9 1.7.2 6.5.2 6.5.2s3.8 0 6.7-.2c.4 0 1.3-.1 2.1-.9.6-.6.8-2.1.8-2.1s.4-1.8.4-3.6v-1.7c0-1.8-.4-3.6-.4-3.6zM10 14.5v-6l5.2 3-5.2 3z',
    linkedin: 'M4 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM2.5 9h3v12h-3V9zm5.5 0h2.9v1.6h.1c.4-.8 1.5-1.9 3.3-1.9 3.5 0 4.2 2.3 4.2 5.3v7h-3v-6.2c0-1.5 0-3.4-2.1-3.4s-2.4 1.6-2.4 3.3V21H8V9z',
    google: 'M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.2zM12 22c2.7 0 5-0.9 6.6-2.5l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6C4.8 19.7 8.2 22 12 22zM6.4 13.8a6 6 0 0 1 0-3.6V7.6H3.1a10 10 0 0 0 0 8.8l3.3-2.6zM12 6.1c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 3 14.7 2 12 2 8.2 2 4.8 4.3 3.1 7.6l3.3 2.6C7.2 7.9 9.4 6.1 12 6.1z',
    tiktok: 'M15 3c.4 2.2 1.8 3.8 4 4.1v3.1c-1.5 0-2.9-.5-4-1.3v6.3A5.8 5.8 0 1 1 9.2 9.4c.4 0 .8 0 1.2.1v3.2a2.6 2.6 0 1 0 1.8 2.5V3H15z',
    tripadvisor: 'M3 9.5 2 6h4.5A9 9 0 0 1 12 4.5 9 9 0 0 1 17.5 6H22l-1 3.5a5.2 5.2 0 1 1-8 6.5l-1 1.5-1-1.5a5.2 5.2 0 1 1-8-6.5zm4.2 6.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zm9.6 0a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z'
  };
  const path = paths[name] || paths.link;
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false" className="icon">
      <path d={path} />
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
  const emailMessage = buildContextualAttributionContactMessage(message, emailAttributionSource, emailAttributionDetail, lang);

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
          buildUrl: (_selectedMetadata, source, detail) => `https://wa.me/${contact.phoneWa}?text=${encode(buildContextualAttributionContactMessage(message, source, detail, lang))}`
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

const publicPages = ['home', 'experiences', 'partnerships', 'about', 'reviews', 'social', 'latestNews', 'contact'];

function Header({ lang, setLang, activePage, setActivePage, siteMedia, editor, publicUnreadCount = null }) {
  const [open, setOpen] = useState(false);
  const switchLanguage = () => setLang(lang === 'it' ? 'en' : 'it');
  const languageAria = lang === 'it' ? 'Switch to English' : "Passa all'italiano";
  const notificationLabel = lang === 'it' ? 'Installazione e notifiche' : 'Install & Notifications';

  function choose(page) {
    setActivePage(page);
    setOpen(false);
    if (!editor?.isEditing) navigatePublicRoute(canonicalPathForPage(page), lang);
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
          <button type="button" className={activePage === 'install' ? 'active' : ''} aria-label={notificationUnreadAriaLabel(notificationLabel, publicUnreadCount, lang)} onClick={() => choose('install')}><span className="public-notification-nav-label"><span>{notificationLabel}</span><NotificationUnreadBadge count={publicUnreadCount}/></span></button>
          <button className="language-toggle desktop-language-toggle" type="button" onClick={switchLanguage} aria-label={languageAria}>{i18n[lang].switchLabel}</button>
        </nav>
        <button className="mobile-language-switch" type="button" onClick={switchLanguage} aria-label={languageAria}>{i18n[lang].switchLabel}</button>
      </div>
    </header>
  );
}

function giftCardClaimCopy(lang, key) {
  const copy = {
    it: {
      intro: 'Questa Gift Card deve essere associata alla persona che vivrà l’esperienza.',
      code: 'Codice Gift Card',
      name: 'Nome e cognome del destinatario',
      email: 'Email del destinatario',
      phone: 'Telefono del destinatario',
      contactHint: 'Inserisci almeno un contatto: email o telefono.',
      submit: 'Conferma Gift Card',
      submitting: 'Conferma...',
      back: 'Cambia codice',
      nameRequired: 'Inserisci il nome del destinatario.',
      contactRequired: 'Inserisci almeno email o telefono del destinatario.',
      emailInvalid: 'Inserisci un indirizzo email valido.',
      phoneInvalid: 'Inserisci un numero di telefono valido.',
      unavailable: 'Questa Gift Card non può essere riscattata. Contatta direttamente il team.'
    },
    en: {
      intro: 'This Gift Card must be assigned to the person who will attend the experience.',
      code: 'Gift Card code',
      name: 'Recipient full name',
      email: 'Recipient email',
      phone: 'Recipient phone',
      contactHint: 'Enter at least one contact method: email or phone.',
      submit: 'Confirm Gift Card',
      submitting: 'Confirming...',
      back: 'Change code',
      nameRequired: 'Enter the recipient name.',
      contactRequired: 'Enter at least the recipient email or phone.',
      emailInvalid: 'Enter a valid email address.',
      phoneInvalid: 'Enter a valid phone number.',
      unavailable: 'This Gift Card cannot be redeemed. Contact the team directly.'
    }
  };
  return copy[lang === 'en' ? 'en' : 'it'][key] || '';
}

function validRecipientEmail(value) {
  const email = String(value || '').trim();
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
}

function validRecipientPhone(value) {
  const phone = String(value || '').trim();
  if (!phone) return true;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 && /^[+()\-\s.0-9]+$/.test(phone);
}

function bookingCodeErrorMessage(error, lang) {
  const raw = String(error?.code || error?.message || '');
  const code = raw.toUpperCase();
  if (code.includes('RECIPIENT_NAME')) return giftCardClaimCopy(lang, 'nameRequired');
  if (code.includes('RECIPIENT_CONTACT')) return giftCardClaimCopy(lang, 'contactRequired');
  if (code.includes('RECIPIENT_EMAIL')) return giftCardClaimCopy(lang, 'emailInvalid');
  if (code.includes('RECIPIENT_PHONE')) return giftCardClaimCopy(lang, 'phoneInvalid');
  if (code.includes('GIFT_CARD')) return giftCardClaimCopy(lang, 'unavailable');
  if (code.includes('REQUIRED')) return text(lang, 'bookingCodeRequired');
  if (code.includes('NOT_FOUND')) return text(lang, 'bookingCodeNotFound');
  if (code.includes('ALREADY') || code.includes('REDEEMED')) return text(lang, 'bookingCodeAlreadyUsed');
  if (code.includes('EXPIRED')) return text(lang, 'bookingCodeExpired');
  if (code.includes('CANCELLED')) return text(lang, 'bookingCodeCancelled');
  if (code.includes('RPC_MISSING') || code.includes('REDEEM_BOOKING_CODE') || code.includes('SCHEMA CACHE') || code.includes('FUNCTION')) {
    return lang === 'it'
      ? 'Il codice non può essere verificato al momento. Contatta direttamente il team.'
      : 'The code cannot be verified right now. Contact the team directly.';
  }
  return error?.message && !code.includes('BOOKING_CODE') ? error.message : text(lang, 'bookingCodeGenericError');
}

function BookingCodeModal({ lang, onClose, siteContent }) {
  const challenge = usePublicChallenge(lang);
  const dialogRef = useRef(null);
  const [code, setCode] = useState('');
  const [claimRequired, setClaimRequired] = useState(false);
  const [claimForm, setClaimForm] = useState({ recipient_name: '', recipient_email: '', recipient_phone: '' });
  const [state, setState] = useState({ loading: false, error: '', success: null });
  const inputRef = useRef(null);
  const claimNameRef = useRef(null);
  const redemptionInFlightRef = useRef(false);
  const redemptionJourneyRef = useRef(`booking_code_journey_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  useBodyScrollLock(true);
  useDialogFocusTrap(true, dialogRef, () => { if (!state.loading) onClose(); });

  useEffect(() => {
    trackEvent('book_with_code_clicked', { language: lang, source: 'booking_code', source_section: 'hero', source_cta: 'book_with_code', cta_location: 'hero' }, { dedupe: false });
    const timer = window.setTimeout(() => inputRef.current?.focus?.(), 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [lang, onClose]);

  useEffect(() => {
    if (!claimRequired) return undefined;
    const timer = window.setTimeout(() => claimNameRef.current?.focus?.(), 0);
    return () => window.clearTimeout(timer);
  }, [claimRequired]);

  async function completeRedemption(result, sourceSection = 'booking_code_redemption') {
    const successMetadata = {
      language: lang,
      source: 'booking_code',
      journey_id: redemptionJourneyRef.current,
      source_section: sourceSection,
      source_cta: sourceSection === 'gift_card_claim' ? 'gift_card_claim_confirm' : 'booking_code_confirm',
      cta_location: 'booking_code_screen',
      booking_request_id: result.booking_request_id || result.redeemed_booking_request_id || '',
      finance_entry_id: result.finance_entry_id || result.redeemed_finance_entry_id || '',
      experience_id: result.experience_id || '',
      request_type: result.fixed_excursion_id ? 'fixed' : result.experience_type || '',
      has_scheduled_date: Boolean(result.scheduled_date),
      selected_date: result.scheduled_date || '',
      fixed_excursion_id: result.fixed_excursion_id || ''
    };
    await trackEvent('booking_code_redeem_success', successMetadata, { dedupe: false });
    await trackEvent('booking_request_created', successMetadata, { dedupe: false });
    setState({ loading: false, error: '', success: result });
  }

  async function submit(event) {
    event.preventDefault();
    if (redemptionInFlightRef.current || !challenge.ready) return;
    redemptionInFlightRef.current = true;
    setState({ loading: true, error: '', success: null });
    try {
      await trackEvent('booking_code_redeem_attempt', {
        language: lang,
        source: 'booking_code',
        journey_id: redemptionJourneyRef.current,
        source_section: 'booking_code_redemption',
        source_cta: 'booking_code_confirm',
        cta_location: 'booking_code_screen'
      }, { dedupe: false });
      const result = await redeemBookingCode(code, { language: lang, turnstile_token: challenge.token });
      await completeRedemption(result);
    } catch (error) {
      if (error?.code === 'GIFT_CARD_CLAIM_REQUIRED' || error?.requiresRecipientClaim === true) {
        setClaimRequired(true);
        setState({ loading: false, error: '', success: null });
        return;
      }
      await trackEvent('booking_code_redeem_error', {
        language: lang,
        source: 'booking_code',
        journey_id: redemptionJourneyRef.current,
        source_section: 'booking_code_redemption',
        source_cta: 'booking_code_confirm',
        cta_location: 'booking_code_screen',
        reason: String(error?.code || error?.message || 'invalid')
      }, { dedupe: false });
      setState({ loading: false, error: bookingCodeErrorMessage(error, lang), success: null });
    } finally { redemptionInFlightRef.current = false; challenge.reset(); }
  }

  async function submitGiftCardClaim(event) {
    event.preventDefault();
    if (redemptionInFlightRef.current || !challenge.ready) return;
    const recipientName = claimForm.recipient_name.trim();
    const recipientEmail = claimForm.recipient_email.trim();
    const recipientPhone = claimForm.recipient_phone.trim();
    if (!recipientName) {
      setState({ loading: false, error: giftCardClaimCopy(lang, 'nameRequired'), success: null });
      claimNameRef.current?.focus?.();
      return;
    }
    if (!recipientEmail && !recipientPhone) {
      setState({ loading: false, error: giftCardClaimCopy(lang, 'contactRequired'), success: null });
      return;
    }
    if (!validRecipientEmail(recipientEmail)) {
      setState({ loading: false, error: giftCardClaimCopy(lang, 'emailInvalid'), success: null });
      return;
    }
    if (!validRecipientPhone(recipientPhone)) {
      setState({ loading: false, error: giftCardClaimCopy(lang, 'phoneInvalid'), success: null });
      return;
    }

    redemptionInFlightRef.current = true;
    setState({ loading: true, error: '', success: null });
    try {
      const result = await claimGiftCardBookingCode(code, {
        turnstile_token: challenge.token,
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        recipient_phone: recipientPhone,
        language: lang
      });
      await completeRedemption(result, 'gift_card_claim');
    } catch (error) {
      await trackEvent('booking_code_redeem_error', {
        language: lang,
        source: 'booking_code',
        journey_id: redemptionJourneyRef.current,
        source_section: 'gift_card_claim',
        source_cta: 'gift_card_claim_confirm',
        cta_location: 'booking_code_screen',
        reason: String(error?.code || 'gift_card_claim_failed')
      }, { dedupe: false });
      setState({ loading: false, error: bookingCodeErrorMessage(error, lang), success: null });
    } finally { redemptionInFlightRef.current = false; challenge.reset(); }
  }

  function resetGiftCardClaim() {
    setClaimRequired(false);
    setClaimForm({ recipient_name: '', recipient_email: '', recipient_phone: '' });
    setState({ loading: false, error: '', success: null });
    window.setTimeout(() => inputRef.current?.focus?.(), 0);
  }

  const success = state.success;
  const successExperience = success ? (lang === 'en' ? success.experience_name_en || success.experience_name_it : success.experience_name_it || success.experience_name_en) : '';
  const supportMessage = lang === 'en'
    ? 'Hi Leonardo, I need help with a vulcanIQ booking code.'
    : 'Ciao Leonardo, ho bisogno di aiuto con un codice prenotazione vulcanIQ.';

  return createPortal((
    <div className="booking-code-backdrop motion-backdrop" role="presentation" onClick={onClose}>
      <section ref={dialogRef} tabIndex="-1" className={`booking-code-modal motion-panel ${success ? 'has-booking-code-success' : ''}`.trim()} role="dialog" aria-modal="true" aria-labelledby="bookingCodeTitle" onClick={(event) => event.stopPropagation()}>
        <header className="booking-code-header compact-only-close">
          <h2 id="bookingCodeTitle" className="sr-only">{text(lang, 'bookingCodeTitle')}</h2>
          <button className="date-modal-close" type="button" onClick={onClose} aria-label={text(lang, 'close')}>{text(lang, 'close')}</button>
        </header>
        {success ? (
          <div className="booking-code-success-card celebration" role="status">
            <div className="booking-code-celebration-mark" aria-hidden="true">✓</div>
            <span className="booking-code-celebration-kicker">{text(lang, 'bookingCodeCelebrationKicker')}</span>
            <h3>{text(lang, 'bookingCodeCelebrationTitle').replace('{name}', success.customer_name || 'vulcanIQ guest')}</h3>
            <p>{text(lang, 'bookingCodeCelebrationSubtitle').replace('{experience}', successExperience || 'vulcanIQ')}</p>
            {success.scheduled_date && (
              <div className="booking-code-celebration-detail">
                <span>{text(lang, 'bookingCodeCelebrationDateLabel')}</span>
                <strong>{formatDateForMessage(success.scheduled_date, lang)}</strong>
              </div>
            )}
            <small>{text(lang, 'bookingCodeCelebrationFooter')}</small>
            <a className="button secondary booking-code-review-cta" href="/reviews" onClick={() => trackEvent('booking_code_review_open', { source: 'booking_code', source_section: 'booking_code_success', source_cta: 'leave_review_after_redeem', cta_location: 'booking_code_success_card', language: lang }, { dedupe: false })}>{lang === 'it' ? 'Usa questo codice per una recensione' : 'Use this code for a review'}</a>
          </div>
        ) : claimRequired ? (
          <form className="booking-code-form gift-card-claim-form" onSubmit={submitGiftCardClaim}>
            <div className="gift-card-claim-intro">
              <span className="kicker">Gift Card</span>
              <p>{giftCardClaimCopy(lang, 'intro')}</p>
              <small><strong>{giftCardClaimCopy(lang, 'code')}:</strong> {code}</small>
            </div>
            <label htmlFor="giftCardClaimName">
              <span>{giftCardClaimCopy(lang, 'name')}</span>
              <input
                id="giftCardClaimName"
                ref={claimNameRef}
                value={claimForm.recipient_name}
                onChange={(event) => setClaimForm((current) => ({ ...current, recipient_name: event.target.value }))}
                autoComplete="name"
                maxLength={120}
                required
              />
            </label>
            <div className="gift-card-claim-contact-grid">
              <label htmlFor="giftCardClaimEmail">
                <span>{giftCardClaimCopy(lang, 'email')}</span>
                <input
                  id="giftCardClaimEmail"
                  type="email"
                  value={claimForm.recipient_email}
                  onChange={(event) => setClaimForm((current) => ({ ...current, recipient_email: event.target.value }))}
                  autoComplete="email"
                  maxLength={254}
                />
              </label>
              <label htmlFor="giftCardClaimPhone">
                <span>{giftCardClaimCopy(lang, 'phone')}</span>
                <input
                  id="giftCardClaimPhone"
                  type="tel"
                  value={claimForm.recipient_phone}
                  onChange={(event) => setClaimForm((current) => ({ ...current, recipient_phone: event.target.value }))}
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={40}
                />
              </label>
            </div>
            <p className="gift-card-claim-hint">{giftCardClaimCopy(lang, 'contactHint')}</p>
            {state.error && <p className="form-status error" role="alert">{state.error}</p>}
            <div className="gift-card-claim-actions">
              <button className="button secondary" type="button" disabled={state.loading} onClick={resetGiftCardClaim}>{giftCardClaimCopy(lang, 'back')}</button>
              {challenge.element}
              <button className="button primary booking-code-submit" type="submit" disabled={state.loading || !challenge.ready}>{state.loading ? giftCardClaimCopy(lang, 'submitting') : giftCardClaimCopy(lang, 'submit')}</button>
            </div>
          </form>
        ) : (
          <form className="booking-code-form" onSubmit={submit}>
            <input
              id="publicBookingCodeInput"
              ref={inputRef}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder={text(lang, 'bookingCodePlaceholder')}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck="false"
            />
            {state.error && <p className="form-status error" role="alert">{state.error}</p>}
            {challenge.element}
            <button className="button primary booking-code-submit" type="submit" disabled={state.loading || !challenge.ready}>{state.loading ? (lang === 'it' ? 'Verifica...' : 'Checking...') : text(lang, 'confirmBookingCode')}</button>
          </form>
        )}
        {!success && (
          <aside className="booking-code-support-card">
            <h3>{text(lang, 'bookingCodeNeedHelp')}</h3>
            <ContactActions lang={lang} contextMessage={supportMessage} location="booking_code_screen" siteContent={siteContent} />
          </aside>
        )}
      </section>
    </div>
  ), document.body);
}

function SupportContactModal({ lang, onClose, siteContent }) {
  useBodyScrollLock(true);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const supportMessage = lang === 'en'
    ? 'Hi Leonardo, I need help with vulcanIQ.'
    : 'Ciao Leonardo, ho bisogno di aiuto con vulcanIQ.';

  return createPortal((
    <div className="booking-code-backdrop support-contact-backdrop motion-backdrop" role="presentation" onClick={onClose}>
      <section className="booking-code-modal support-contact-modal motion-panel" role="dialog" aria-modal="true" aria-labelledby="supportContactTitle" onClick={(event) => event.stopPropagation()}>
        <header className="support-contact-header">
          <div>
            <h2 id="supportContactTitle">{text(lang, 'bookingCodeNeedHelp')}</h2>
          </div>
          <button className="date-modal-close support-contact-top-close" type="button" onClick={onClose} aria-label={text(lang, 'close')}>{text(lang, 'close')}</button>
        </header>
        <aside className="booking-code-support-card support-contact-card">
          <ContactActions lang={lang} contextMessage={supportMessage} location="hero_contact_support" siteContent={siteContent} />
        </aside>
      </section>
    </div>
  ), document.body);
}

function FastRequestModal({ lang, siteContent, onClose, sourceSection = 'sticky_mobile_bar', sourceCta = 'fast_request', ctaLocation = 'sticky_contact_bar', flowType = 'fast_request' }) {
  const challenge = usePublicChallenge(lang);
  const contact = resolvePublicContactDetails(siteContent);
  useBodyScrollLock(true);
  const sourceMetadata = { language: lang, source_section: sourceSection, source_cta: sourceCta, cta_location: ctaLocation, flow_type: flowType };
  const formJourneyRef = useRef(null);
  const fastRequestModalRef = useRef(null);
  const fastRequestContactHeadingRef = useRef(null);
  const fastRequestSubmissionErrorRef = useRef(null);
  const draftRef = useRef(null);
  if (!draftRef.current) {
    let storage;
    try { storage = window.localStorage; } catch { storage = null; }
    draftRef.current = createFastRequestDraft(storage);
  }
  const directSubmitRef = useRef(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [followBookingUpdates, setFollowBookingUpdates] = useState(false);
  const [submissionState, setSubmissionState] = useState({ loading: false, error: '', success: '' });
  const [form, setForm] = useState(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem('vulcaniq_fast_request') || '{}');
      if (stored?.expires_at && Date.now() < stored.expires_at) {
        return {
          experienceId: stored.experienceId || 'etna-premium',
          dateMode: stored.dateMode || 'flexible',
          customDate: stored.customDate || '',
          adults: stored.adults || '2',
          children: stored.children || '0',
          heardAboutUs: normalizeHeardAboutUs(stored.heardAboutUs) || '',
          heardAboutUsDetail: '',
          email: '',
          phone: ''
        };
      }
    } catch {}
    return { experienceId: 'etna-premium', dateMode: 'flexible', customDate: '', adults: '2', children: '0', heardAboutUs: '', heardAboutUsDetail: '', email: '', phone: '' };
  });

  draftRef.current.update(form);
  useDialogFocusTrap(true, fastRequestModalRef, () => { if (!directSubmitRef.current) handleClose(); });
  useEffect(() => {
    const timer = setTimeout(() => draftRef.current.save(), 250);
    return () => clearTimeout(timer);
  }, [form]);

  useEffect(() => {
    if (fastRequestModalRef.current) fastRequestModalRef.current.scrollTop = 0;
  }, [step]);

  useEffect(() => {
    if (step === 4 && error) fastRequestContactHeadingRef.current?.focus();
  }, [error, step]);

  useEffect(() => {
    if (step === 6 && submissionState.error) fastRequestSubmissionErrorRef.current?.focus();
  }, [step, submissionState.error]);

  useEffect(() => {
    formJourneyRef.current = createFormJourney('fast_request', { ...sourceMetadata, has_selected_experience: true, has_people_count: true, has_attribution: false });
    trackEvent('fast_request_start', { ...sourceMetadata, journey_id: formJourneyRef.current?.journey_id || '', form_type: 'fast_request' }, { dedupe: false });
    return () => {
      draftRef.current.save();
    };
  }, []);

  function update(key, value) {
    const nextValue = key === 'heardAboutUsDetail' ? cleanHeardAboutUsDetail(value) : value;
    markFormFieldStarted(formJourneyRef.current?.journey_id, key, { ...sourceMetadata, step_index: step, step_key: key });
    markFormActivity(formJourneyRef.current?.journey_id, {
      has_selected_experience: key === 'experienceId' ? Boolean(nextValue) : Boolean(form.experienceId),
      has_selected_date: key === 'customDate' ? Boolean(nextValue) : Boolean(form.customDate || form.dateMode === 'flexible'),
      has_people_count: true,
      has_attribution: key === 'heardAboutUs' ? Boolean(nextValue) : Boolean(form.heardAboutUs)
    });
    setError('');
    setSubmissionState((current) => current.error ? { ...current, error: '' } : current);
    setForm((current) => ({ ...current, [key]: nextValue }));
  }

  function validateAttributionStep() {
    const cleanSource = normalizeHeardAboutUs(form.heardAboutUs);
    const cleanDetail = cleanHeardAboutUsDetail(form.heardAboutUsDetail);
    if (!cleanSource) {
      setError(text(lang, 'heardAboutUsRequired'));
      return false;
    }
    if (needsHeardAboutUsDetail(cleanSource) && !cleanDetail) {
      setError(text(lang, 'heardAboutUsOtherRequired'));
      return false;
    }
    return true;
  }

  function validateFastContactStep(requireContact = false) {
    const email = String(form.email || '').trim();
    const phone = String(form.phone || '').trim();
    if (requireContact && !email && !phone) {
      setError(text(lang, 'contactRequired'));
      return false;
    }
    if (email && (email.length > 254 || !isValidPublicEmail(email))) {
      setError(text(lang, 'contactEmailInvalid'));
      return false;
    }
    if (phone && (phone.length > 40 || !isValidPublicPhone(phone))) {
      setError(text(lang, 'contactPhoneInvalid'));
      return false;
    }
    return true;
  }

  function completeStep(nextStep) {
    if (step === 4 && nextStep === 5 && !validateFastContactStep()) return;
    if (step === 5 && nextStep === 6 && !validateAttributionStep()) return;
    setError('');
    markFormFieldStarted(formJourneyRef.current?.journey_id, `step_${step}`, { ...sourceMetadata, step_index: step, step_key: `step_${step}` });
    trackEvent('fast_request_step_complete', { ...sourceMetadata, journey_id: formJourneyRef.current?.journey_id || '', form_type: 'fast_request', step, next_step: nextStep, ...heardAboutUsMetadata(form.heardAboutUs, lang, form.heardAboutUsDetail) }, { dedupe: false });
    setStep(nextStep);
  }

  const experience = experienceById(form.experienceId);
  const dateLabel = form.dateMode === 'custom'
    ? (form.customDate || (lang === 'it' ? 'data da definire' : 'date to define'))
    : (lang === 'it' ? 'Sono flessibile' : "I'm flexible");
  const peopleSummary = lang === 'it'
    ? `${form.adults || 0} adulti, ${form.children || 0} bambini`
    : `${form.adults || 0} adults, ${form.children || 0} children`;
  const attributionDisplay = heardAboutUsDisplay(form.heardAboutUs, form.heardAboutUsDetail, lang);
  const message = lang === 'it'
    ? `Ciao Leonardo,\n\nvorrei verificare disponibilità per una esperienza vulcanIQ.\n\nEsperienza: ${experience.title}\nData: ${dateLabel}\nPersone: ${peopleSummary}\nLingua: Italiano\nCome ho conosciuto vulcanIQ: ${attributionDisplay || '-'}\nFonte: richiesta rapida\n\nVorrei sapere disponibilità, prezzo, durata e abbigliamento consigliato.\n\nGrazie!`
    : `Hi Leonardo,\n\nI would like to check availability for a vulcanIQ experience.\n\nExperience: ${experience.title}\nDate: ${dateLabel}\nPeople: ${peopleSummary}\nLanguage: English\nHow I heard about vulcanIQ: ${attributionDisplay || '-'}\nSource: fast request\n\nI would like to know availability, price, duration and recommended clothing.\n\nThank you!`;
  const whatsappUrl = `https://wa.me/${contact.phoneWa}?text=${encode(message)}`;
  const supportMessage = lang === 'it'
    ? 'Ciao Leonardo, ho bisogno di aiuto con una richiesta rapida vulcanIQ.'
    : 'Hi Leonardo, I need help with a vulcanIQ fast request.';

  function handleClose() {
    markFormAbandoned(formJourneyRef.current?.journey_id, { ...sourceMetadata, step_index: step, step_key: `step_${step}`, has_selected_experience: Boolean(form.experienceId), has_selected_date: Boolean(form.customDate || form.dateMode === 'flexible'), has_people_count: true, has_attribution: Boolean(form.heardAboutUs), ...heardAboutUsMetadata(form.heardAboutUs, lang, form.heardAboutUsDetail) });
    trackEvent('fast_request_abandon', { ...sourceMetadata, journey_id: formJourneyRef.current?.journey_id || '', form_type: 'fast_request', step, experience_id: form.experienceId, ...heardAboutUsMetadata(form.heardAboutUs, lang, form.heardAboutUsDetail) }, { dedupe: true });
    onClose();
  }

  function handleWhatsApp() {
    if (!validateAttributionStep()) {
      setStep(5);
      return;
    }
    const attributionMetadata = heardAboutUsMetadata(form.heardAboutUs, lang, form.heardAboutUsDetail);
    markFormRecoveredViaWhatsApp(formJourneyRef.current?.journey_id, { ...sourceMetadata, has_selected_experience: Boolean(form.experienceId), has_selected_date: Boolean(form.customDate || form.dateMode === 'flexible'), has_people_count: true, has_attribution: true, ...attributionMetadata });
    trackEvent('fast_request_whatsapp_click', { ...sourceMetadata, journey_id: formJourneyRef.current?.journey_id || '', form_type: 'fast_request', experience_id: form.experienceId, date_mode: form.dateMode, ...attributionMetadata }, { dedupe: false });
    draftRef.current.save();
  }

  async function submitDirectRequest() {
    if (directSubmitRef.current || submissionState.success || !challenge.ready) return;
    const email = String(form.email || '').trim();
    const phone = String(form.phone || '').trim();
    const adults = safeParticipantNumber(form.adults, 0);
    const children = safeParticipantNumber(form.children, 0);
    if (!validateAttributionStep()) {
      setStep(5);
      return;
    }
    if (adults + children < 1) {
      setSubmissionState({ loading: false, error: text(lang, 'peopleRequired'), success: '' });
      return;
    }
    if (!validateFastContactStep(true)) {
      setStep(4);
      return;
    }

    const selectedDate = form.dateMode === 'custom' ? form.customDate : '';
    const attributionMetadata = heardAboutUsMetadata(form.heardAboutUs, lang, form.heardAboutUsDetail);
    const trackingMetadata = withBookingJourneyId(buildBookingTrackingContext({
      experienceId: form.experienceId,
      requestType: 'private',
      sourceSection,
      sourceCta,
      ctaLocation,
      selectedDate,
      language: lang,
      extra: { ...sourceMetadata, form_type: 'fast_request', date_mode: form.dateMode, questionnaire_completed: true, ...attributionMetadata }
    }), { booking_journey_id: formJourneyRef.current?.journey_id || '' });
    const referralPayload = referralAttributionPayload();
    directSubmitRef.current = true;
    setSubmissionState({ loading: true, error: '', success: '' });

    try {
      const createdRequest = await submitPublicBookingRequestWithTracking({
        experience: form.experienceId,
        adults,
        children,
        metadata: { ...trackingMetadata, submit_trigger: 'fast_request_submit_button' },
        payload: {
          customer_name: '',
          customer_email: email,
          customer_phone: phone,
          preferred_contact: phone ? 'whatsapp' : 'email',
          experience_id: form.experienceId || 'unsure',
          requested_date: selectedDate || null,
          alternative_date: null,
          language: lang,
          party_type: 'other',
          request_type: 'private',
          fixed_excursion_id: null,
          adults,
          children,
          children_under_3: false,
          private_experience: true,
          message,
          heard_about_us: normalizeHeardAboutUs(form.heardAboutUs),
          heard_about_us_label: heardAboutUsLabel(form.heardAboutUs, lang),
          heard_about_us_detail: needsHeardAboutUsDetail(form.heardAboutUs) ? cleanHeardAboutUsDetail(form.heardAboutUsDetail) : null,
          source: 'website',
          source_section: trackingMetadata.source_section,
          source_cta: trackingMetadata.source_cta,
          cta_location: trackingMetadata.cta_location,
          selected_date: trackingMetadata.selected_date || null,
          has_fixed_excursion: false,
          traffic_source: trackingMetadata.traffic_source,
          detected_source: trackingMetadata.detected_source || trackingMetadata.traffic_source,
          declared_source: normalizeHeardAboutUs(form.heardAboutUs),
          referrer: trackingMetadata.referrer,
          landing_path: trackingMetadata.landing_path,
          utm_source: trackingMetadata.utm_source,
          utm_medium: trackingMetadata.utm_medium,
          utm_campaign: trackingMetadata.utm_campaign,
          utm_content: trackingMetadata.utm_content,
          utm_term: trackingMetadata.utm_term,
          analytics_session_id: trackingMetadata.analytics_session_id || trackingMetadata.session_id,
          analytics_visitor_id: trackingMetadata.analytics_visitor_id || trackingMetadata.visitor_id,
          analytics_journey_id: trackingMetadata.booking_journey_id,
          booking_journey_version: trackingMetadata.booking_journey_version,
          selected_month: trackingMetadata.selected_month || isoMonthKey(selectedDate),
          device_type: trackingMetadata.device_type,
          browser: trackingMetadata.browser,
          operating_system: trackingMetadata.operating_system,
          form_started_at: formJourneyRef.current?.opened_at,
          submission_idempotency_key: trackingMetadata.booking_journey_id,
          submission_fingerprint: trackingMetadata.booking_journey_id,
          notification_ownership_requested: followBookingUpdates,
          turnstile_token: challenge.token,
          website: '',
          ...referralPayload
        }
      });
      if (referralPayload.referral_code) trackEvent('referral_booking_request_created', { referral_code: referralPayload.referral_code, source_type: 'fast_request', source_id: createdRequest?.id || '', language: lang }, { dedupe: false });
      markFormSubmitted(formJourneyRef.current?.journey_id, { ...trackingMetadata, channel: 'website', has_selected_experience: true, has_selected_date: Boolean(selectedDate || form.dateMode === 'flexible'), has_people_count: adults + children > 0, has_attribution: true, ...attributionMetadata });
      trackEvent('fast_request_submit_success', { ...sourceMetadata, journey_id: trackingMetadata.booking_journey_id, form_type: 'fast_request', experience_id: form.experienceId, channel: 'website', ...attributionMetadata }, { dedupe: false });
      const ownershipLinked = await claimRequestedNotificationOwnership(createdRequest, followBookingUpdates, lang);
      const ownershipMessage = followBookingUpdates
        ? ownershipLinked
          ? (lang === 'it' ? ' Gli aggiornamenti personali sono collegati a questo dispositivo; il centro in-app è già attivo.' : ' Personal updates are linked to this device; the in-app center is already active.')
          : (lang === 'it' ? ' La richiesta è riuscita, ma gli aggiornamenti personali non sono stati collegati.' : ' The request succeeded, but personal updates were not linked.')
        : '';
      setSubmissionState({ loading: false, error: '', success: `${text(lang, 'requestSent')}${ownershipMessage}` });
      setFollowBookingUpdates(false);
      draftRef.current.submitted();
    } catch {
      setSubmissionState({ loading: false, error: text(lang, 'requestFallbackError'), success: '' });
    } finally {
      directSubmitRef.current = false;
      challenge.reset();
    }
  }

  return createPortal((
    <div className="modal-backdrop fast-request-backdrop" role="dialog" aria-modal="true" aria-labelledby="fastRequestTitle">
      <section className="admin-modal fast-request-modal" ref={fastRequestModalRef} tabIndex="-1">
        <header className="admin-modal-header">
          <div><span className="kicker">{lang === 'it' ? 'Richiesta rapida' : 'Fast request'}</span><h2 id="fastRequestTitle">{lang === 'it' ? 'Verifica disponibilità in pochi passaggi' : 'Check availability in a few steps'}</h2></div>
          <button className="modal-close-button" type="button" onClick={handleClose}>{text(lang, 'close')}</button>
        </header>
        {step === 1 && (
          <div className="admin-form-grid">
            <label className="admin-field full"><span>{lang === 'it' ? 'Esperienza' : 'Experience'}</span><select value={form.experienceId} onChange={(event) => update('experienceId', event.target.value)}>{experiences.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <div className="modal-actions full fast-request-actions"><button className="button primary" type="button" onClick={() => completeStep(2)}>{lang === 'it' ? 'Continua' : 'Continue'}</button><button className="button secondary fast-request-inline-close" type="button" onClick={handleClose}>{text(lang, 'close')}</button></div>
          </div>
        )}
        {step === 2 && (
          <div className="admin-form-grid">
            <label className="admin-field"><span>{lang === 'it' ? 'Data' : 'Date'}</span><select value={form.dateMode} onChange={(event) => update('dateMode', event.target.value)}><option value="flexible">{lang === 'it' ? 'Sono flessibile' : "I'm flexible"}</option><option value="custom">{lang === 'it' ? 'Data specifica' : 'Specific date'}</option></select></label>
            {form.dateMode === 'custom' && <label className="admin-field"><span>{lang === 'it' ? 'Data preferita' : 'Preferred date'}</span><input type="date" min={todayIso()} value={form.customDate} onChange={(event) => update('customDate', event.target.value)} /></label>}
            <div className="modal-actions full fast-request-actions"><button className="button secondary" type="button" onClick={() => setStep(1)}>{lang === 'it' ? 'Indietro' : 'Back'}</button><button className="button primary" type="button" onClick={() => completeStep(3)}>{lang === 'it' ? 'Continua' : 'Continue'}</button><button className="button secondary fast-request-inline-close" type="button" onClick={handleClose}>{text(lang, 'close')}</button></div>
          </div>
        )}
        {step === 3 && (
          <div className="admin-form-grid">
            <label className="admin-field"><span>{lang === 'it' ? 'Adulti' : 'Adults'}</span><input type="number" min="0" value={form.adults} onChange={(event) => update('adults', event.target.value)} /></label>
            <label className="admin-field"><span>{lang === 'it' ? 'Bambini' : 'Children'}</span><input type="number" min="0" value={form.children} onChange={(event) => update('children', event.target.value)} /></label>
            <div className="modal-actions full fast-request-actions"><button className="button secondary" type="button" onClick={() => setStep(2)}>{lang === 'it' ? 'Indietro' : 'Back'}</button><button className="button primary" type="button" onClick={() => completeStep(4)}>{lang === 'it' ? 'Continua' : 'Continue'}</button><button className="button secondary fast-request-inline-close" type="button" onClick={handleClose}>{text(lang, 'close')}</button></div>
          </div>
        )}
        {step === 4 && (
          <div className="admin-form-grid fast-request-contact-step" aria-labelledby="fastRequestContactTitle">
            <div className="fast-request-contact-heading full">
              <h3 id="fastRequestContactTitle" ref={fastRequestContactHeadingRef} tabIndex="-1">{lang === 'it' ? 'Dove possiamo risponderti?' : 'Where can we reply?'}</h3>
              <p>{lang === 'it' ? 'Inserisci email o telefono solo se vuoi inviare la richiesta direttamente. Puoi lasciare entrambi vuoti e continuare con WhatsApp.' : 'Enter an email or phone number only if you want to send the request directly. You can leave both empty and continue with WhatsApp.'}</p>
            </div>
            <div className="fast-request-contact-fields full">
              <label className="admin-field" htmlFor="fastRequestEmail"><span>{text(lang, 'contactEmail')}</span><input id="fastRequestEmail" type="email" inputMode="email" maxLength={254} value={form.email || ''} onChange={(event) => update('email', event.target.value)} onBlur={(event) => update('email', String(event.target.value || '').trim())} autoComplete="email" aria-describedby={error ? 'fastRequestContactError' : undefined} /></label>
              <label className="admin-field" htmlFor="fastRequestPhone"><span>{text(lang, 'phone')}</span><input id="fastRequestPhone" type="tel" inputMode="tel" pattern="^\+?[0-9]*$" maxLength={40} value={form.phone || ''} onBeforeInput={preventInvalidPhoneInput} onChange={(event) => update('phone', sanitizePublicPhoneInput(event.target.value))} autoComplete="tel" aria-describedby={error ? 'fastRequestContactError' : undefined} /></label>
            </div>
            {error && <p id="fastRequestContactError" className="form-status error full" role="alert">{error}</p>}
            <div className="modal-actions full fast-request-actions"><button className="button secondary" type="button" onClick={() => setStep(3)}>{lang === 'it' ? 'Indietro' : 'Back'}</button><button className="button primary" type="button" onClick={() => completeStep(5)}>{lang === 'it' ? 'Continua' : 'Continue'}</button><button className="button secondary fast-request-inline-close" type="button" onClick={handleClose}>{text(lang, 'close')}</button></div>
          </div>
        )}
        {step === 5 && (
          <div className="admin-form-grid fast-request-attribution-step">
            <label className="admin-field full" htmlFor="fastRequestHeardAboutUs"><span>{text(lang, 'heardAboutUs')}</span><ContactAttributionSelect id="fastRequestHeardAboutUs" lang={lang} value={form.heardAboutUs || ''} onChange={(value) => update('heardAboutUs', value)} /></label>
            {needsHeardAboutUsDetail(form.heardAboutUs) && <label className="admin-field full" htmlFor="fastRequestHeardAboutUsDetail"><span>{text(lang, 'heardAboutUsOtherLabel')}</span><textarea id="fastRequestHeardAboutUsDetail" className="fast-request-attribution-detail" value={form.heardAboutUsDetail || ''} onChange={(event) => update('heardAboutUsDetail', event.target.value)} placeholder={text(lang, 'heardAboutUsOtherPlaceholder')} rows={3} maxLength={240} /></label>}
            {error && <p className="form-status error full" role="alert">{error}</p>}
            <div className="modal-actions full fast-request-actions"><button className="button secondary" type="button" onClick={() => setStep(4)}>{lang === 'it' ? 'Indietro' : 'Back'}</button><button className="button primary" type="button" onClick={() => completeStep(6)}>{lang === 'it' ? 'Rivedi messaggio' : 'Review message'}</button><button className="button secondary fast-request-inline-close" type="button" onClick={handleClose}>{text(lang, 'close')}</button></div>
          </div>
        )}
        {step === 6 && (
          <div className="fast-request-review">
            <textarea readOnly value={message} rows={10} />
            <div className="fast-request-review-details" aria-labelledby="fastRequestDirectTitle">
              <div className="fast-request-direct-heading"><h3 id="fastRequestDirectTitle">{lang === 'it' ? 'Invia la richiesta direttamente' : 'Send the request directly'}</h3><p>{lang === 'it' ? 'Useremo i dati già inseriti. Per l’invio diretto serve almeno email o telefono.' : 'We will use the information already entered. Direct sending requires at least an email or phone number.'}</p></div>
              <dl className="fast-request-contact-summary" aria-label={lang === 'it' ? 'Recapiti inseriti' : 'Contact details entered'}>
                <div><dt>Email</dt><dd>{form.email || (lang === 'it' ? 'Non fornita' : 'Not provided')}</dd></div>
                <div><dt>{lang === 'it' ? 'Telefono' : 'Phone'}</dt><dd>{form.phone || (lang === 'it' ? 'Non fornito' : 'Not provided')}</dd></div>
              </dl>
            </div>
            <label className="questionnaire-notification-optin fast-request-review-optin" htmlFor="fastRequestFollowUpdates"><input id="fastRequestFollowUpdates" type="checkbox" checked={followBookingUpdates} onChange={(event) => setFollowBookingUpdates(event.target.checked)} /><span><strong>{lang === 'it' ? 'Segui su questo dispositivo gli aggiornamenti dopo l’invio diretto.' : 'Follow updates on this device after sending the direct request.'}</strong><small>{lang === 'it' ? 'Facoltativo. WhatsApp non collega le notifiche personali.' : 'Optional. WhatsApp does not link personal notifications.'}</small></span></label>
            {submissionState.error && <p className="form-status error" role="alert" tabIndex="-1" ref={fastRequestSubmissionErrorRef}>{submissionState.error}</p>}
            {submissionState.success && <p className="form-status success" role="status">{submissionState.success}</p>}
            {challenge.element}
            <div className="fast-request-final-actions"><button className="button secondary" type="button" onClick={() => setStep(1)} disabled={submissionState.loading}>{lang === 'it' ? 'Modifica' : 'Edit'}</button><button className="button primary" type="button" onClick={submitDirectRequest} disabled={submissionState.loading || Boolean(submissionState.success) || !challenge.ready}>{submissionState.loading ? (lang === 'it' ? 'Invio...' : 'Sending...') : (lang === 'it' ? 'Invia richiesta' : 'Send request')}</button><a className="button secondary" href={whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={handleWhatsApp}>WhatsApp</a></div>
          </div>
        )}
        <aside className="booking-code-support-card fast-request-support-card">
          <h3>{text(lang, 'bookingCodeNeedHelp')}</h3>
          <ContactActions lang={lang} contextMessage={supportMessage} location="fast_request_screen" siteContent={siteContent} />
        </aside>
      </section>
    </div>
  ), document.body);
}

function Hero({ lang, setActivePage, scrollToForm, fillForm, siteMedia, siteContent, editor, cmsStatus = 'ready' }) {
  const mediaSource = editor?.mediaMap || siteMedia || {};
  const backgroundItem = editorMediaItem(mediaSource, 'home_hero_background', '', lang === 'it' ? 'Sfondo hero homepage' : 'Home hero background');
  const heroBackground = backgroundItem.file_url || '';
  const heroBackgroundKind = mediaUrlKindFromValue(heroBackground, backgroundItem.media_kind || 'image');
  const heroBackgroundVideo = Boolean(heroBackground && heroBackgroundKind === 'video');
  const heroFeatureImage = mediaUrl(mediaSource, 'home_hero_feature_image', '');
  const heroFeatureVideo = mediaUrl(mediaSource, 'home_hero_video', '');
  const heroFeatureMediaVisible = Boolean(heroFeatureImage || heroFeatureVideo);
  const contentSource = editor?.contentMap || siteContent || {};
  const heroLayoutItem = editorContentItem(contentSource, 'home.hero.layout');
  const heroCenteredWithoutMedia = !heroFeatureMediaVisible && heroLayoutItem.layout_variant === 'center';
  const heroPoster = mediaUrl(mediaSource, 'home_hero_background_poster', heroFeatureImage);
  const heroStaticBackground = heroBackgroundVideo ? heroPoster : heroBackground;
  const heroStyle = heroStaticBackground ? { backgroundImage: `linear-gradient(90deg, rgba(5,10,20,0.72), rgba(5,10,20,0.50) 50%, rgba(5,10,20,0.34)), url("${heroStaticBackground}")` } : undefined;
  const backgroundSelected = editor?.selected?.type === 'image' && editor.selected.key === 'home_hero_background';
  const [findExperienceOpen, setFindExperienceOpen] = useState(false);
  const [bookingCodeOpen, setBookingCodeOpen] = useState(false);
  const [supportContactOpen, setSupportContactOpen] = useState(false);
  const [fastRequestOpen, setFastRequestOpen] = useState(false);

  if (!editor?.isEditing && cmsStatus === 'loading') {
    return (
      <section className="hero hero-no-feature-media hero-layout-center hero-cms-loading" id="top" aria-busy="true" aria-label={lang === 'it' ? 'Caricamento contenuti' : 'Loading content'}>
        <div className="hero-overlay" />
        <div className="container hero-grid hero-grid-no-media">
          <div className="hero-copy hero-cms-loading-copy" aria-hidden="true">
            <span className="hero-cms-loading-line hero-cms-loading-title" />
            <span className="hero-cms-loading-line hero-cms-loading-lead" />
            <span className="hero-cms-loading-line hero-cms-loading-action" />
          </div>
        </div>
      </section>
    );
  }

  function handleBookNow() {
    setFastRequestOpen(true);
  }

  function handleContact() {
    trackEvent('contact_us_clicked', { language: lang, source_section: 'hero', source_cta: 'contact_us' }, { dedupe: false });
    setSupportContactOpen(true);
  }

  function closeSupportContact() {
    setSupportContactOpen(false);
    setActivePage('home');
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: motionScrollBehavior() }), 0);
  }

  function handleFindExperienceRequest(experience, details = {}) {
    setFindExperienceOpen(false);
    const message = buildExperienceMessage(experience, lang);
    if (typeof fillForm === 'function') {
      fillForm({
        experienceId: experience.id,
        requestType: 'private',
        message,
        trackingContext: buildBookingTrackingContext({
          experienceId: experience.id,
          requestType: 'private',
          sourceSection: 'find_experience_modal',
          sourceCta: 'recommended_experience_request',
          ctaLocation: 'find_experience_modal',
          language: lang,
          extra: details
        }),
        scroll: true
      });
      return;
    }
    setActivePage('experiences');
    navigatePublicRoute('/experiences', lang);
  }

  return (
    <section className={`hero ${editor?.isEditing ? 'editor-hero-editable' : ''} ${backgroundSelected ? 'selected' : ''} ${heroFeatureMediaVisible ? '' : 'hero-no-feature-media'} ${heroCenteredWithoutMedia ? 'hero-layout-center' : ''}`.trim()} id="top" style={heroStyle}>
      {heroBackgroundVideo && (
        <video
          className="hero-background-video"
          src={heroBackground}
          poster={heroPoster || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
      )}
      <div className="hero-overlay" />
      {editor?.isEditing && (
        <button
          className={`editor-hero-media-button editor-selectable ${backgroundSelected ? 'selected' : ''}`}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            editor.select({ type: 'image', key: 'home_hero_background', label: lang === 'it' ? 'Sfondo hero' : 'Hero background', section: 'Media', fallbackSrc: '', fallbackAlt: lang === 'it' ? 'Sfondo hero homepage' : 'Home hero background' });
          }}
        >
          {lang === 'it' ? 'Modifica sfondo hero' : 'Edit hero background'}
        </button>
      )}
      <div className={`container hero-grid ${heroFeatureMediaVisible ? '' : 'hero-grid-no-media'}`.trim()}>
        <div className="hero-copy">
          <EditableText as="h1" className="hero-title" itemKey="home.hero.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'heroTitle')} />
          <EditableText as="p" className="lead" itemKey="home.hero.subtitle" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'heroLead')} />
          <div className="hero-action-grid">
            <button className="button primary hero-action-main" type="button" onClick={handleBookNow}><EditableText itemKey="home.hero.secondary_cta" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'viewAvailability')} /></button>
            <button className="button secondary dark hero-action-code" type="button" onClick={() => setBookingCodeOpen(true)}><EditableText itemKey="home.hero.cta.book_with_code" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'bookWithCode')} /></button>
            <a className="button secondary dark hero-action-gift" href={`/gift-card?lang=${lang}`} onClick={(event) => { event.preventDefault(); trackEvent('gift_card_request_click', { language: lang, source_section: 'home_hero', source_cta: 'gift_card' }, { dedupe: false }); setActivePage('giftCard'); navigatePublicRoute('/gift-card', lang); }}><EditableText itemKey="home.hero.cta.gift_card" lang={lang} siteContent={siteContent} editor={editor} fallback="Gift Card" /></a>
            <a
              className="trust-card guide-license-card hero-action-guide"
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
        {heroFeatureMediaVisible && (
          <div className="hero-media" aria-hidden="false">
            {editor?.isEditing && (
              <div className="hero-media-edit-actions">
                <button className="editor-badge editor-selectable" type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); editor.select({ type: 'image', key: 'home_hero_video', label: lang === 'it' ? 'Video hero' : 'Hero video', section: 'Media', fallbackSrc: '', fallbackAlt: lang === 'it' ? 'Video introduttivo vulcanIQ' : 'vulcanIQ introductory video' }); }}>{lang === 'it' ? 'Modifica video' : 'Edit video'}</button>
                <button className="editor-badge editor-selectable" type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); editor.select({ type: 'image', key: 'home_hero_feature_image', label: lang === 'it' ? 'Immagine hero' : 'Hero image', section: 'Media', fallbackSrc: '', fallbackAlt: lang === 'it' ? 'Immagine hero homepage' : 'Home hero image' }); }}>{lang === 'it' ? 'Modifica immagine' : 'Edit image'}</button>
              </div>
            )}
            {heroFeatureVideo ? (
              <VideoSlot
                src={heroFeatureVideo}
                poster={heroFeatureImage || undefined}
                label={lang === 'it' ? 'Video introduttivo vulcanIQ' : 'vulcanIQ introductory video'}
                lang={lang}
              />
            ) : (
              <figure className="video-slot hero-static-media">
                <img src={heroFeatureImage} alt={mediaAlt(mediaSource, 'home_hero_feature_image', lang, lang === 'it' ? 'Immagine hero homepage' : 'Home hero image')} loading="eager" decoding="async" />
              </figure>
            )}
          </div>
        )}
      </div>
      {bookingCodeOpen && <BookingCodeModal lang={lang} onClose={() => setBookingCodeOpen(false)} siteContent={siteContent} />}
      {fastRequestOpen && <FastRequestModal lang={lang} siteContent={siteContent} sourceSection="hero" sourceCta="book_now" ctaLocation="hero_book_now" flowType="fast_request" onClose={() => setFastRequestOpen(false)} />}
      {supportContactOpen && <SupportContactModal lang={lang} onClose={closeSupportContact} siteContent={siteContent} />}
    </section>
  );
}

function ExperienceAccordion({ lang, fillForm, siteMedia, siteContent, editor }) {
  const [availabilityError, setAvailabilityError] = useState(false);
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const contact = resolvePublicContactDetails(siteContent);
  const [items, setItems] = useState([]);
  const [leaflets, setLeaflets] = useState([]);
  const [partnerCommissions, setPartnerCommissions] = useState([]);
  const [partnerCommissionSummary, setPartnerCommissionSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [monthDate, setMonthDate] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [selectedExperience, setSelectedExperience] = useState(null);
  const [activeLeaflet, setActiveLeaflet] = useState(null);
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [dateRequest, setDateRequest] = useState({ experienceId: 'etna-premium', adults: '1', children: '0', childrenUnder3Count: '0' });
  const { requestContactAttribution, contactAttributionModal } = useContactAttributionGate(lang);
  const dateModalTransition = useTransitionPresence(dateModalOpen);
  const experienceModalTransition = useTransitionValue(selectedExperience);
  const leafletModalTransition = useTransitionValue(activeLeaflet);
  const renderedExperience = experienceModalTransition.renderedValue;
  const renderedLeaflet = leafletModalTransition.renderedValue;
  const dateDialogRef = useRef(null);
  const experienceDialogRef = useRef(null);
  const leafletDialogRef = useRef(null);
  useDialogFocusTrap(dateModalTransition.shouldRender, dateDialogRef, () => setDateModalOpen(false));
  useDialogFocusTrap(Boolean(renderedExperience), experienceDialogRef, () => setSelectedExperience(null));
  useDialogFocusTrap(Boolean(renderedLeaflet?.leaflet), leafletDialogRef, () => setActiveLeaflet(null));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setAvailabilityError(false);
    Promise.all([
      loadPublicFixedExcursions(),
      loadPublicMonthlyLeaflets()
    ])
      .then(([fixedRows, leafletRows]) => {
        if (!active) return;
        const rows = fixedRows || [];
        setItems(rows);
        setLeaflets(leafletRows || []);
      })
      .catch(() => {
        if (!active) return;
        setAvailabilityError(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [availabilityRetry]);

  useBodyScrollLock(Boolean(dateModalTransition.shouldRender || experienceModalTransition.shouldRender || leafletModalTransition.shouldRender));

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
  const visibleMonthLeaflet = useMemo(() => leaflets.find((leaflet) => Number(leaflet.month) === monthDate.getMonth() + 1 && Number(leaflet.year) === monthDate.getFullYear() && hasMonthlyLeafletContent(leaflet)), [leaflets, monthDate]);
  const selectedDateLeaflet = useMemo(() => {
    const linkedId = selectedItems.find((item) => item.leaflet_id)?.leaflet_id;
    return linkedId ? leaflets.find((leaflet) => leaflet.id === linkedId && hasMonthlyLeafletContent(leaflet)) : null;
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
    const trackingContext = withBookingJourneyId(buildBookingTrackingContext({
      experienceId: experience?.id || '',
      requestType: 'private',
      sourceSection: 'experiences',
      sourceCta: 'book_experience',
      ctaLocation: 'experience_modal',
      language: lang
    }));
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

  function requestItem(item, event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const trackingContext = withBookingJourneyId(buildBookingTrackingContext({
      experienceId: item?.experience_id || '',
      requestType: 'fixed',
      sourceSection: 'calendar',
      sourceCta: 'calendar_fixed_excursion_request_info',
      ctaLocation: 'calendar_modal',
      selectedDate: item?.date || '',
      selectedTime: item?.start_time || '',
      fixedExcursionId: item?.id || '',
      experienceName: fixedExcursionTitle(item, lang),
      hasFixedExcursion: true,
      language: lang
    }));
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
    const trackingContext = withBookingJourneyId(buildBookingTrackingContext({
      experienceId: dateRequest.experienceId || '',
      requestType: 'private',
      sourceSection: 'calendar',
      sourceCta: 'prepare_request',
      ctaLocation: 'calendar_modal',
      selectedDate,
      hasFixedExcursion: false,
      language: lang
    }));
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
    if (!hasMonthlyLeafletContent(leaflet)) return;
    setActiveLeaflet({ leaflet, label });
  }

  function renderDateModalFixedDetails(item) {
    const title = fixedExcursionTitle(item, lang);
    const description = fixedExcursionProgram(item, lang) || item[`note_${lang}`] || item.note_it || item.note_en || '';
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
        <BlockedDatesAttachment item={item} lang={lang} onOpenFile={(file, label) => openLeafletModal(file, label || text(lang, 'openExcursionProgram'))} />
        <FormattedDescription textValue={description || experienceById(item.experience_id).summary[lang]} />
        <dl className="public-details-grid date-modal-details-grid">
          <div><dt>{text(lang, 'dateLabel')}</dt><dd>{formatDateForMessage(item.date, lang)}</dd></div>
          <div><dt>{text(lang, 'experienceLabel')}</dt><dd>{adminExperienceLabel(item.experience_id, lang)}</dd></div>
          <MeetingPointDetailCard item={item} lang={lang} />
          {difficulty && <div><dt>{text(lang, 'difficulty')}</dt><dd>{difficulty}</dd></div>}
          {price && <div><dt>{text(lang, 'priceNote')}</dt><dd>{price}</dd></div>}
          <div><dt>{text(lang, 'placesAvailable')}</dt><dd>{item.places_remaining}/{item.capacity}</dd></div>
        </dl>
        <div className="request-action-row date-modal-actions">
          <button className="request-action-button request-action-button-primary" type="button" onClick={(event) => requestItem(item, event)}>{text(lang, 'requestInformation')}</button>
          <a className="request-action-button request-action-button-secondary" href={`https://wa.me/${contact.phoneWa}?text=${encode(fixedMessage)}`} target="_blank" rel="noopener noreferrer" onClick={(event) => requestContactAttribution(event, { type: 'whatsapp', url: `https://wa.me/${contact.phoneWa}?text=${encode(fixedMessage)}`, target: '_blank', location: 'calendar_modal', metadata: withBookingJourneyId(buildBookingTrackingContext({ experienceId: item.experience_id || '', requestType: 'fixed', sourceSection: 'calendar', sourceCta: 'fixed_excursion_whatsapp', ctaLocation: 'calendar_modal', selectedDate: item.date || '', selectedTime: item.start_time || '', fixedExcursionId: item.id || '', experienceName: fixedExcursionTitle(item, lang), hasFixedExcursion: true, language: lang })), confirmLabel: contactActionConfirmLabel('whatsapp', lang), buildUrl: (_selectedMetadata, source, detail) => `https://wa.me/${contact.phoneWa}?text=${encode(buildContextualAttributionContactMessage(fixedMessage, source, detail, lang))}` })}>{text(lang, 'sendWhatsapp')}</a>
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
          <a className="request-action-button request-action-button-secondary" href={`https://wa.me/${contact.phoneWa}?text=${encode(message)}`} target="_blank" rel="noopener noreferrer" onClick={(event) => requestContactAttribution(event, { type: 'whatsapp', url: `https://wa.me/${contact.phoneWa}?text=${encode(message)}`, target: '_blank', location: 'calendar_modal', metadata: buildBookingTrackingContext({ experienceId: dateRequest.experienceId || '', requestType: 'private', sourceSection: 'calendar', sourceCta: 'whatsapp_direct', ctaLocation: 'calendar_modal', selectedDate, language: lang }), confirmLabel: contactActionConfirmLabel('whatsapp', lang), buildUrl: (_selectedMetadata, source, detail) => `https://wa.me/${contact.phoneWa}?text=${encode(buildContextualAttributionContactMessage(message, source, detail, lang))}` })}>{text(lang, 'sendWhatsapp')}</a>
        </div>
      </div>
    );
  }

  return (
    <section className="section page-section excursions-section" id="experiences">
      {availabilityError && <p className="container" role="status">{lang === 'it' ? 'Disponibilità non aggiornata. Contattaci prima di scegliere una data.' : 'Availability could not be updated. Please contact us before choosing a date.'} <button type="button" onClick={() => setAvailabilityRetry(value => value + 1)}>{lang === 'it' ? 'Riprova' : 'Retry'}</button></p>}
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
                        disabled={isPast || availabilityError}
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

      {dateModalTransition.shouldRender && (
        <div className={`date-modal-overlay motion-backdrop ${dateModalTransition.isClosing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="date-modal-title" onClick={() => setDateModalOpen(false)}>
          <article className="date-modal motion-panel" ref={dateDialogRef} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
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

      {renderedExperience && (
        <div className={`experience-modal-overlay motion-backdrop ${experienceModalTransition.isClosing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="experience-modal-title" onClick={() => setSelectedExperience(null)}>
          <article className="experience-modal motion-panel" ref={experienceDialogRef} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
            <div className="experience-modal-header">
              <h2 id="experience-modal-title">{renderedExperience.title}</h2>
              <button className="experience-modal-close" type="button" onClick={() => setSelectedExperience(null)}>{text(lang, 'close')}</button>
            </div>
            <div className="experience-detail-content">
              <EditableImage mediaKey={experienceMediaKey(renderedExperience.id)} lang={lang} siteMedia={siteMedia} editor={editor} fallbackSrc={renderedExperience.image} fallbackAlt={`${renderedExperience.title} vulcanIQ`} className="experience-modal-image" />
              <div className="experience-detail-copy">
                <EditableText as="p" itemKey={`experiences.${renderedExperience.id}.description`} lang={lang} siteContent={siteContent} editor={editor} fallback={renderedExperience.description[lang]} />
                <dl>
                  <div><dt>{text(lang, 'bestFor')}</dt><dd><EditableText itemKey={`experiences.${renderedExperience.id}.best_for`} lang={lang} siteContent={siteContent} editor={editor} fallback={renderedExperience.bestFor[lang]} /></dd></div>
                  <div><dt>{text(lang, 'practical')}</dt><dd><EditableText itemKey={`experiences.${renderedExperience.id}.notes`} lang={lang} siteContent={siteContent} editor={editor} fallback={renderedExperience.notes[lang]} /></dd></div>
                  <div><dt>{text(lang, 'safety')}</dt><dd><EditableText itemKey={`experiences.${renderedExperience.id}.safety`} lang={lang} siteContent={siteContent} editor={editor} fallback={renderedExperience.safety[lang]} /></dd></div>
                </dl>
                <div className="request-action-row experience-modal-actions">
                  <button className="request-action-button request-action-button-primary" type="button" onClick={() => requestExperience(renderedExperience)}>{text(lang, 'request')}</button>
                  <a className="request-action-button request-action-button-secondary" href={`https://wa.me/${contact.phoneWa}?text=${encode(buildExperienceMessage(renderedExperience, lang))}`} target="_blank" rel="noopener noreferrer" onClick={(event) => requestContactAttribution(event, { type: 'whatsapp', url: `https://wa.me/${contact.phoneWa}?text=${encode(buildExperienceMessage(renderedExperience, lang))}`, target: '_blank', location: 'experience_modal', metadata: buildBookingTrackingContext({ experienceId: renderedExperience?.id || '', requestType: 'private', sourceSection: 'experiences', sourceCta: 'whatsapp_direct', ctaLocation: 'experience_modal', language: lang }), confirmLabel: contactActionConfirmLabel('whatsapp', lang), buildUrl: (_selectedMetadata, source, detail) => `https://wa.me/${contact.phoneWa}?text=${encode(buildContextualAttributionContactMessage(buildExperienceMessage(renderedExperience, lang), source, detail, lang))}` })}>{text(lang, 'sendWhatsapp')}</a>
                </div>
              </div>
            </div>
          </article>
        </div>
      )}

      {renderedLeaflet?.leaflet && (
        <div className={`leaflet-fullscreen-overlay motion-backdrop ${leafletModalTransition.isClosing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={renderedLeaflet.label || text(lang, 'openProgram')} onClick={() => setActiveLeaflet(null)}>
          <article className="leaflet-fullscreen-modal motion-panel" ref={leafletDialogRef} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
            <div className="leaflet-fullscreen-header">
              <h2>{renderedLeaflet.label || text(lang, 'openProgram')}</h2>
              <button className="date-modal-close" type="button" onClick={() => setActiveLeaflet(null)}>{text(lang, 'close')}</button>
            </div>
            <MonthlyProgramContent leaflet={renderedLeaflet.leaflet} lang={lang} label={renderedLeaflet.label || text(lang, 'openProgram')} />
          </article>
        </div>
      )}
      {contactAttributionModal}
    </section>
  );
}

function BlockedDatesAttachment({ item, lang, publicView = true, onOpenFile }) {
  const file = fixedExcursionLeafletFile(item, lang);
  const url = file?.file_url;
  if (!url) return null;

  const type = file.file_type || '';
  const name = file.file_name || fixedExcursionTitle(item, lang) || text(lang, 'openExcursionProgram');
  const isImage = type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(url);
  const label = publicView ? text(lang, 'openExcursionProgram') : adminCopy(lang, 'Apri volantino', 'Open leaflet');
  const filePayload = { file_url: url, file_type: type, file_name: name, title_it: name, title_en: name };

  const openFile = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (typeof onOpenFile === 'function') {
      onOpenFile(filePayload, label);
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="blocked-dates-attachment fixed-excursion-leaflet-attachment">
      {!publicView && (
        <div className="blocked-dates-admin-meta">
          <strong>{adminCopy(lang, 'Volantino escursione', 'Excursion leaflet')}</strong>
          <span>{name}</span>
        </div>
      )}
      {isImage ? (
        <button className="blocked-dates-preview-button" type="button" onClick={openFile} aria-label={label}>
          <img src={url} alt={name} loading="lazy" decoding="async" />
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

function PartnershipsPage({ lang, siteContent, editor }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [partnershipFilterOpen, setPartnershipFilterOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const partnershipFilterRef = useRef(null);

  useBodyScrollLock(Boolean(selectedItem));

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadPublicPartnerships()
      .then((data) => { if (active) setItems(data || []); })
      .catch(() => { if (active) setItems([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const enrichedItems = useMemo(() => items.map((item) => ({ ...item, categoryKey: partnershipCategoryKey(item) })), [items]);
  const availableCategories = useMemo(() => PARTNERSHIP_CATEGORIES.filter((category) => enrichedItems.some((item) => item.categoryKey === category.key)), [enrichedItems]);

  useEffect(() => {
    if (selectedCategory !== 'all' && !availableCategories.some((category) => category.key === selectedCategory)) setSelectedCategory('all');
  }, [availableCategories, selectedCategory]);

  useEffect(() => {
    if (!partnershipFilterOpen) return undefined;
    function closeFilter(event) {
      if (event?.key && event.key !== 'Escape') return;
      if (event?.target && partnershipFilterRef.current?.contains(event.target)) return;
      setPartnershipFilterOpen(false);
    }
    document.addEventListener('pointerdown', closeFilter);
    window.addEventListener('keydown', closeFilter);
    return () => {
      document.removeEventListener('pointerdown', closeFilter);
      window.removeEventListener('keydown', closeFilter);
    };
  }, [partnershipFilterOpen]);

  useEffect(() => {
    if (!selectedItem) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') setSelectedItem(null);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem]);

  const partnershipFilterOptions = useMemo(() => [{ key: 'all' }, ...availableCategories], [availableCategories]);
  const selectedItems = selectedCategory === 'all' ? enrichedItems : enrichedItems.filter((item) => item.categoryKey === selectedCategory);
  const selectedCategoryLabel = selectedCategory === 'all' ? adminCopy(lang, 'Tutte', 'All') : partnershipCategoryLabel(selectedCategory, lang);

  function externalClick(eventName, item, extra = {}) {
    trackEvent(eventName, {
      partnership_id: item.id,
      partnership_name: item.name,
      category: item.categoryKey || partnershipCategoryKey(item),
      cta_location: 'partnership_detail_modal',
      source_section: 'partnerships',
      language: lang,
      ...extra
    }, { dedupe: false, transport: 'beacon' });
  }

  function renderPartnershipImage(item, className = '') {
    return item.image_url
      ? <img className={className} src={item.image_url} alt={item.name} loading="lazy" decoding="async" />
      : <div className={`partnership-image-fallback ${className}`.trim()} aria-hidden="true">vulcanIQ</div>;
  }

  return (
    <section className="section page-section partnerships-page-section" id="partnerships">
      <div className="container">
        <div className="section-header refined-section-header partnership-section-header">
          <div className="partnership-title-row">
            <EditableText as="h2" itemKey="partnerships.page.title" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'partnershipsTitle')} />
            {!loading && enrichedItems.length > 0 && (
              <div className="partnership-filter-control" ref={partnershipFilterRef}>
                <button
                  className="partnership-filter-trigger review-filter-trigger"
                  type="button"
                  onClick={() => setPartnershipFilterOpen((open) => !open)}
                  aria-expanded={partnershipFilterOpen}
                  aria-haspopup="menu"
                >
                  {adminCopy(lang, 'Filtra', 'Filter')}: {selectedCategoryLabel} <span aria-hidden="true">▾</span>
                </button>
                {partnershipFilterOpen && (
                  <div className="partnership-filter-menu review-filter-menu" role="menu">
                    {partnershipFilterOptions.map((category) => {
                      const label = category.key === 'all' ? adminCopy(lang, 'Tutte', 'All') : partnershipCategoryLabel(category.key, lang);
                      return (
                        <button
                          key={category.key}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selectedCategory === category.key}
                          className={selectedCategory === category.key ? 'is-active' : ''}
                          onClick={() => { setSelectedCategory(category.key); setPartnershipFilterOpen(false); }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <EditableText as="p" itemKey="partnerships.page.intro" lang={lang} siteContent={siteContent} editor={editor} fallback={text(lang, 'partnershipsIntro') || ''} />
        </div>
        {loading ? <p>{lang === 'it' ? 'Caricamento...' : 'Loading...'}</p> : enrichedItems.length === 0 ? (
          <article className="empty-state-card"><p>{text(lang, 'partnershipsEmpty')}</p></article>
        ) : (
          <div className="partnerships-browser">
            <div className="partnership-grid compact-partnership-grid">
              {selectedItems.map((item) => {
                const description = localizedPartnershipDescription(item, lang);
                return (
                  <button className="partnership-card partnership-click-card" type="button" key={item.id} onClick={() => setSelectedItem(item)}>
                    {renderPartnershipImage(item)}
                    <span className="partnership-card-copy">
                      <strong>{item.name}</strong>
                      {description && <span className="partnership-teaser">{createTextTeaser(description)}</span>}
                      <span className="partnership-card-action">{adminCopy(lang, 'Apri dettagli', 'Open details')}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selectedItem && (
        <div className="public-modal-backdrop partnership-modal-backdrop motion-backdrop" role="presentation" onClick={() => setSelectedItem(null)}>
          <article className="partnership-detail-modal motion-panel" role="dialog" aria-modal="true" aria-labelledby="partnershipModalTitle" onClick={(event) => event.stopPropagation()}>
            <div className="partnership-modal-header">
              {renderPartnershipImage(selectedItem, 'partnership-modal-image')}
              <div>
                <h2 id="partnershipModalTitle">{selectedItem.name}</h2>
              </div>
              <button className="modal-close-button" type="button" onClick={() => setSelectedItem(null)}>{text(lang, 'close')}</button>
            </div>
            <FormattedText textValue={localizedPartnershipDescription(selectedItem, lang)} className="formatted-text partnership-formatted-description" />
            <div className="partnership-modal-actions">
              {selectedItem.website_url && (
                <a className="button primary" href={selectedItem.website_url} target="_blank" rel="noopener noreferrer" onClick={() => externalClick('external_link_click', selectedItem, { external_link_type: 'website' })}>{text(lang, 'visitWebsite')}</a>
              )}
              {selectedItem.google_maps_url && (
                <a className="button secondary" href={selectedItem.google_maps_url} target="_blank" rel="noopener noreferrer" onClick={() => trackMapsClick('partnership_detail_modal', { partnership_id: selectedItem.id, source_section: 'partnerships', language: lang })}>{adminCopy(lang, 'Apri su Google Maps', 'Open in Google Maps')}</a>
              )}
              {selectedItem.social_url && (
                <a className="button secondary" href={selectedItem.social_url} target="_blank" rel="noopener noreferrer" onClick={() => externalClick('social_link_click', selectedItem, { platform: 'partnership_social' })}>Instagram</a>
              )}
            </div>
          </article>
        </div>
      )}
    </section>
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
              <SocialLinks lang={lang} siteContent={siteContent} className="footer-social-links" compact />
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

const BOOKING_JOURNEY_VERSION = '20261027-authoritative-website';

function normalizeCampaignSource(value = '', medium = '') {
  const source = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  const mediumValue = String(medium || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (!source) return 'direct';
  if (source.includes('instagram') || source === 'ig') return 'instagram';
  if (source.includes('facebook') || source === 'fb') return 'facebook';
  if (source.includes('whatsapp') || source === 'wa') return 'whatsapp';
  if (source.includes('google_business_profile') || source.includes('google_my_business') || source === 'gbp') return 'google_business_profile';
  if (source.includes('google')) return 'google';
  if (source.includes('partner')) return 'partner';
  if (source.includes('qr')) return 'qr';
  if (source.includes('business_card')) return 'business_card';
  if (source.includes('tiktok') || source === 'tt') return 'tiktok';
  if (source.includes('direct')) return 'direct';
  if (['social', 'story', 'bio', 'share', 'partner', 'organic', 'referral', 'print', 'page', 'post', 'video'].includes(mediumValue)) return source.slice(0, 80) || 'other';
  return 'other';
}

function currentBrowserAttribution() {
  if (typeof window === 'undefined' || !canTrack()) return {};
  const params = new URLSearchParams(window.location.search || '');
  const utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].reduce((acc, key) => {
    const value = String(params.get(key) || '').trim();
    if (value) acc[key] = value.slice(0, 120);
    return acc;
  }, {});
  const source = String(utm.utm_source || '').toLowerCase();
  const trafficSource = normalizeCampaignSource(source, utm.utm_medium);
  return { traffic_source: trafficSource, ...utm };
}

function createBookingJourneyId() {
  const randomValue = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `booking_journey_${randomValue}`;
}

function isoMonthKey(value) {
  const clean = String(value || '').trim();
  const match = clean.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function withBookingJourneyId(context = {}, existingContext = {}, { forceNew = false } = {}) {
  const bookingJourneyId = !forceNew && (existingContext?.booking_journey_id || existingContext?.analytics_journey_id || context?.booking_journey_id || context?.analytics_journey_id)
    ? (existingContext?.booking_journey_id || existingContext?.analytics_journey_id || context?.booking_journey_id || context?.analytics_journey_id)
    : createBookingJourneyId();
  const selectedDate = context.selected_date || existingContext?.selected_date || '';
  return {
    ...(existingContext || {}),
    ...(context || {}),
    booking_journey_id: bookingJourneyId,
    analytics_journey_id: bookingJourneyId,
    booking_journey_version: BOOKING_JOURNEY_VERSION,
    selected_month: context.selected_month || existingContext?.selected_month || isoMonthKey(selectedDate)
  };
}

function buildBookingTrackingContext({
  experienceId = '',
  requestType = 'private',
  sourceSection = 'contact',
  sourceCta = 'prepare_request',
  ctaLocation = 'contact_section',
  selectedDate = '',
  selectedTime = '',
  fixedExcursionId = '',
  experienceName = '',
  hasFixedExcursion = false,
  language = 'it',
  extra = {}
} = {}) {
  const knownExperience = experiences.find((experience) => experience.id === experienceId) || null;
  const normalizedRequestType = requestType || (knownExperience ? 'experience' : 'private');
  const browserAttribution = currentBrowserAttribution();
  const analyticsIdentity = getAnalyticsIdentitySnapshot(sourceSection || ctaLocation || 'contact');
  return {
    ...analyticsIdentity,
    ...browserAttribution,
    traffic_source: browserAttribution.traffic_source || analyticsIdentity.traffic_source || 'direct',
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
    selected_time: selectedTime || '',
    selected_month: isoMonthKey(selectedDate),
    ...(fixedExcursionId ? { fixed_excursion_id: fixedExcursionId } : {}),
    ...(experienceName ? { experience_name: experienceName } : {}),
    has_fixed_excursion: Boolean(hasFixedExcursion),
    language: language || 'it',
    ...(extra || {}),
    booking_journey_version: BOOKING_JOURNEY_VERSION
  };
}

function mergeTrackingContext(base = {}, override = {}) {
  return { ...(base || {}), ...(override || {}) };
}

function ContactForm({ lang, formState, setFormState, siteMedia, siteContent, editor }) {
  const contactInFlightRef = useRef(false);
  const challenge = usePublicChallenge(lang);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const contact = resolvePublicContactDetails(siteContent);
  const { requestContactAttribution, contactAttributionModal } = useContactAttributionGate(lang);
  const [submitState, setSubmitState] = useState({ loading: false, error: '', success: '' });
  const [followBookingUpdates, setFollowBookingUpdates] = useState(false);
  const [fixedExcursions, setFixedExcursions] = useState([]);
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [stepError, setStepError] = useState('');
  const [messageManuallyEdited, setMessageManuallyEdited] = useState(false);
  const requestChoice = formState.requestTypeChoice || formState.requestType || 'private';
  const requestType = requestChoice === 'fixed' ? 'fixed' : 'private';
  const message = formState.message || text(lang, 'defaultMessage');
  const experienceId = formState.experienceId || '';
  const selectedFixed = fixedExcursions.find((item) => item.id === formState.fixedExcursionId) || null;
  const effectiveExperienceId = requestType === 'fixed' && selectedFixed?.experience_id ? selectedFixed.experience_id : experienceId;
  const adults = safeParticipantNumber(formState.adults, 1);
  const children = safeParticipantNumber(formState.children, 0);
  const childrenUnder3Count = safeParticipantNumber(formState.childrenUnder3Count, 0);
  const totalPeople = adults + children;
  const over12 = totalPeople > 12;
  const selectedHeardAboutUs = normalizeHeardAboutUs(formState.heardAboutUs);
  const selectedHeardAboutUsDetail = cleanHeardAboutUsDetail(formState.heardAboutUsDetail);
  const selectedHeardAboutUsNeedsDetail = needsHeardAboutUsDetail(selectedHeardAboutUs);
  const fullMessage = String(message || text(lang, 'defaultMessage')).trim();
  const preferredContactValue = ['whatsapp', 'phone', 'email'].includes(formState.preferredContact) ? formState.preferredContact : 'whatsapp';
  const selectedHeardAboutUsMetadata = heardAboutUsMetadata(selectedHeardAboutUs, lang, selectedHeardAboutUsDetail);
  const trackedFormOpenRef = useRef(new Set());
  const bookingJourneyIdRef = useRef(formState.trackingContext?.booking_journey_id || '');
  const formJourneyRef = useRef(null);
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [leaflets, setLeaflets] = useState([]);
  const [fixedOptionsOpen, setFixedOptionsOpen] = useState(false);
  const [privateOptionsOpen, setPrivateOptionsOpen] = useState(false);
  const [detailsMonthDate, setDetailsMonthDate] = useState(startOfMonth(new Date()));
  const [activeLeaflet, setActiveLeaflet] = useState(null);
  const [selectedPrivateExperience, setSelectedPrivateExperience] = useState(null);
  const [selectedFixedExcursionDetails, setSelectedFixedExcursionDetails] = useState(null);
  const questionnaireTransition = useTransitionPresence(questionnaireOpen);
  const fixedOptionsTransition = useTransitionPresence(fixedOptionsOpen);
  const privateOptionsTransition = useTransitionPresence(privateOptionsOpen);
  const requestLeafletTransition = useTransitionValue(activeLeaflet);
  const privateDetailTransition = useTransitionValue(selectedPrivateExperience);
  const fixedDetailTransition = useTransitionValue(selectedFixedExcursionDetails);
  const renderedRequestLeaflet = requestLeafletTransition.renderedValue;
  const renderedPrivateExperience = privateDetailTransition.renderedValue;
  const renderedFixedExcursionDetails = fixedDetailTransition.renderedValue;

  const questionnaireSteps = [
    { key: 'request_type', title: text(lang, 'requestTypeQuestion') },
    { key: 'experience', title: text(lang, 'experienceQuestion') },
    { key: 'date', title: text(lang, 'dateQuestion') },
    { key: 'participants', title: text(lang, 'participantsQuestion') },
    { key: 'contact', title: text(lang, 'contactQuestion') },
    { key: 'attribution', title: text(lang, 'attributionQuestion') },
    { key: 'message', title: text(lang, 'reviewMessage') }
  ];
  const currentStep = questionnaireSteps[stepIndex] || questionnaireSteps[0];
  const todayMinDate = todayIso();

  useEffect(() => {
    let active = true;
    setAvailabilityError(false);
    Promise.all([
      loadPublicFixedExcursions(),
      loadPublicMonthlyLeaflets()
    ]).then(([fixedRows, leafletRows]) => {
      if (!active) return;
      setFixedExcursions((fixedRows || []).filter((item) => !item.date || item.date >= todayIso()));
      setLeaflets(leafletRows || []);
    }).catch(() => {
      if (!active) return;
      setAvailabilityError(true);
    });
    return () => { active = false; };
  }, [availabilityRetry]);

  useBodyScrollLock(Boolean(questionnaireTransition.shouldRender || fixedOptionsTransition.shouldRender || privateOptionsTransition.shouldRender || requestLeafletTransition.shouldRender || privateDetailTransition.shouldRender || fixedDetailTransition.shouldRender));
  useDialogFocusTrap(questionnaireTransition.shouldRender && !fixedOptionsOpen && !privateOptionsOpen && !activeLeaflet && !selectedPrivateExperience && !selectedFixedExcursionDetails, modalRef, () => attemptCloseQuestionnaire());

  useEffect(() => {
    const existingJourneyId = formState.trackingContext?.booking_journey_id || formState.trackingContext?.analytics_journey_id || '';
    if (existingJourneyId) bookingJourneyIdRef.current = existingJourneyId;
  }, [formState.trackingContext?.booking_journey_id, formState.trackingContext?.analytics_journey_id]);

  useEffect(() => {
    if (!questionnaireOpen) return undefined;
    previousFocusRef.current = document.activeElement;
    window.setTimeout(() => modalRef.current?.querySelector('button, input, select, textarea')?.focus(), 0);
    return () => {
      const previous = previousFocusRef.current;
      if (previous && typeof previous.focus === 'function') window.setTimeout(() => previous.focus(), 0);
    };
  }, [questionnaireOpen]);

  useEffect(() => {
    if (!questionnaireOpen) return undefined;
    const timeout = window.setTimeout(() => {
      const scrollTarget = modalRef.current?.querySelector?.('.questionnaire-body') || modalRef.current;
      scrollTarget?.scrollTo?.({ top: 0, behavior: motionScrollBehavior() });
    }, 40);
    return () => window.clearTimeout(timeout);
  }, [questionnaireOpen, stepIndex]);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key !== 'Escape') return;
      if (activeLeaflet) { setActiveLeaflet(null); return; }
      if (selectedFixedExcursionDetails) { setSelectedFixedExcursionDetails(null); return; }
      if (selectedPrivateExperience) { setSelectedPrivateExperience(null); return; }
      if (fixedOptionsOpen) { setFixedOptionsOpen(false); return; }
      if (privateOptionsOpen) { setPrivateOptionsOpen(false); return; }
      if (questionnaireOpen) attemptCloseQuestionnaire();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [activeLeaflet, selectedFixedExcursionDetails, selectedPrivateExperience, fixedOptionsOpen, privateOptionsOpen, questionnaireOpen, formState]);

  const fixedOptions = useMemo(() => monthlyOptionsLeaflets({ leaflets, fixedExcursions, monthDate: detailsMonthDate, lang }), [leaflets, fixedExcursions, detailsMonthDate, lang]);
  const canGoPreviousDetailsMonth = isCurrentOrFutureMonth(new Date(detailsMonthDate.getFullYear(), detailsMonthDate.getMonth() - 1, 1));

  const currentTrackingMetadata = withBookingJourneyId(mergeTrackingContext(mergeTrackingContext(buildBookingTrackingContext({
    experienceId: effectiveExperienceId,
    requestType,
    sourceSection: 'contact',
    sourceCta: 'prepare_request',
    ctaLocation: 'questionnaire_modal',
    selectedDate: selectedFixed?.date || formState.requestedDate || '',
    hasFixedExcursion: requestType === 'fixed',
    language: formState.language || lang
  }), formState.trackingContext), {
    ...selectedHeardAboutUsMetadata,
    questionnaire_version: 'contact_request_v1',
    questionnaire_step: stepIndex + 1,
    questionnaire_step_key: currentStep.key,
    questionnaire_completed: currentStep.key === 'message'
  }), { booking_journey_id: bookingJourneyIdRef.current || formState.trackingContext?.booking_journey_id || '' });

  function trackQuestionnaireFieldStart(fieldName, extraMetadata = {}) {
    if (!bookingJourneyIdRef.current && currentTrackingMetadata.booking_journey_id) bookingJourneyIdRef.current = currentTrackingMetadata.booking_journey_id;
    if (trackedFormOpenRef.current.has('field_start')) return;
    trackedFormOpenRef.current.add('field_start');
    markFormFieldStarted(formJourneyRef.current?.journey_id, fieldName || 'unknown', { ...currentTrackingMetadata, ...extraMetadata, form_type: 'booking_form', step_index: stepIndex + 1, step_key: currentStep.key });
    trackBookingFormStarted(effectiveExperienceId || requestType || 'private', {
      ...currentTrackingMetadata,
      ...extraMetadata,
      first_field_name: fieldName || 'unknown'
    });
    trackBookingFormFieldStart(effectiveExperienceId || requestType || 'private', {
      ...currentTrackingMetadata,
      ...extraMetadata,
      first_field_name: fieldName || 'unknown'
    });
  }

  function update(field, value) {
    trackQuestionnaireFieldStart(field, { changed_field: field });
    setStepError('');
    setFormState((current) => {
      if (field === 'heardAboutUs') {
        return { ...current, heardAboutUs: value, heardAboutUsDetail: needsHeardAboutUsDetail(value) ? current.heardAboutUsDetail : '' };
      }
      return { ...current, [field]: value };
    });
  }

  function updateMessage(value) {
    setMessageManuallyEdited(true);
    update('message', value);
  }

  function updateRequestType(value) {
    trackQuestionnaireFieldStart('request_type', { changed_field: 'request_type', selected_request_type: value });
    setStepError('');
    setFormState((current) => ({
      ...current,
      requestTypeChoice: value,
      requestType: value === 'fixed' ? 'fixed' : 'private',
      privateExperience: value !== 'fixed',
      fixedExcursionId: value === 'fixed' ? current.fixedExcursionId : '',
      experienceId: value === 'unsure' ? 'unsure' : current.experienceId
    }));
  }

  function updateFixedExcursion(id) {
    const fixed = fixedExcursions.find((item) => item.id === id);
    trackQuestionnaireFieldStart('fixed_excursion_id', {
      changed_field: 'fixed_excursion_id',
      selected_fixed_excursion_id: id || '',
      selected_experience_id: fixed?.experience_id || '',
      selected_date: fixed?.date || ''
    });
    setStepError('');
    setFormState((current) => ({
      ...current,
      requestTypeChoice: 'fixed',
      requestType: 'fixed',
      fixedExcursionId: id,
      privateExperience: false,
      experienceId: fixed?.experience_id || current.experienceId,
      requestedDate: fixed?.date || current.requestedDate,
      message: !messageManuallyEdited && fixed ? buildFixedExcursionMessage({ fixedExcursion: fixed, people: totalPeople || '' }, lang) : current.message
    }));
  }

  function changeDetailsMonth(delta) {
    setDetailsMonthDate((current) => {
      const next = startOfMonth(new Date(current.getFullYear(), current.getMonth() + delta, 1));
      return isCurrentOrFutureMonth(next) ? next : startOfMonth(new Date());
    });
  }

  function openFixedOptions() {
    setDetailsMonthDate(startOfMonth(new Date()));
    setFixedOptionsOpen(true);
    trackEvent('fixed_excursion_options_open', { request_type: 'fixed', selected_month: monthKey(new Date()), language: lang, source_section: 'contact_questionnaire' }, { dedupe: false });
  }

  function openPrivateOptions() {
    setPrivateOptionsOpen(true);
    trackEvent('private_excursion_options_open', { request_type: 'private', language: lang, source_section: 'contact_questionnaire' }, { dedupe: false });
  }

  function openRequestLeaflet(option) {
    if (!hasMonthlyLeafletContent(option?.leaflet)) return;
    const selectedMonth = monthKey(detailsMonthDate);
    trackEvent('fixed_leaflet_open_from_request', {
      request_type: 'fixed',
      selected_month: selectedMonth,
      excursion_id: option.fixedExcursion?.id || '',
      excursion_slug: option.fixedExcursion?.experience_id || '',
      language: lang,
      source_section: 'contact_questionnaire'
    }, { dedupe: false });
    setActiveLeaflet({ leaflet: option.leaflet, label: option.title || leafletTitle(option.leaflet, lang), fixedExcursion: option.fixedExcursion || null });
  }

  function openPrivateExperienceDetails(experience) {
    trackEvent('private_excursion_detail_open_from_request', {
      request_type: 'private',
      excursion_id: experience?.id || '',
      excursion_slug: experience?.id || '',
      language: lang,
      source_section: 'contact_questionnaire'
    }, { dedupe: false });
    trackExperienceDetailOpen(experience);
    setSelectedPrivateExperience(experience);
  }

  function moveQuestionnaireToDateStep() {
    const dateStepIndex = questionnaireSteps.findIndex((step) => step.key === 'date');
    if (dateStepIndex < 0) return;
    setStepIndex(dateStepIndex);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        setStepIndex(dateStepIndex);
        modalRef.current?.scrollTo?.({ top: 0, behavior: motionScrollBehavior() });
        modalRef.current?.querySelector?.('#questionnaireRequestedDate')?.focus?.();
      }, 0);
    }
  }

  function usePrivateExperienceInRequest(experience) {
    trackQuestionnaireFieldStart('private_experience_option', {
      changed_field: 'private_experience_option',
      selected_experience_id: experience?.id || ''
    });
    setFormState((current) => ({
      ...current,
      requestTypeChoice: 'private',
      requestType: 'private',
      privateExperience: true,
      fixedExcursionId: '',
      requestedDate: (current.requestTypeChoice || current.requestType) === 'fixed' ? '' : current.requestedDate,
      experienceId: experience?.id || current.experienceId,
      message: !messageManuallyEdited && experience ? buildExperienceMessage(experience, lang) : current.message,
      language: current.language || lang
    }));
    setQuestionnaireOpen(true);
    setStepError('');
    setActiveLeaflet(null);
    setSelectedFixedExcursionDetails(null);
    setSelectedPrivateExperience(null);
    setFixedOptionsOpen(false);
    setPrivateOptionsOpen(false);
    moveQuestionnaireToDateStep();
  }

  function hasMeaningfulQuestionnaireData() {
    const defaultMessages = [i18n.it.defaultMessage, i18n.en.defaultMessage];
    return Boolean(
      formState.name || formState.phone || formState.email || formState.experienceId || formState.fixedExcursionId ||
      formState.requestedDate || formState.alternativeDate || formState.heardAboutUs || formState.heardAboutUsDetail ||
      (formState.message && !defaultMessages.includes(formState.message))
    );
  }

  function attemptCloseQuestionnaire() {
    if (hasMeaningfulQuestionnaireData()) {
      markFormAbandoned(formJourneyRef.current?.journey_id, { ...currentTrackingMetadata, form_type: 'booking_form', step_index: stepIndex + 1, step_key: currentStep.key, has_selected_experience: Boolean(effectiveExperienceId), has_selected_date: Boolean(selectedFixed?.date || formState.requestedDate), has_people_count: totalPeople > 0 });
    }
    if (!hasMeaningfulQuestionnaireData() || window.confirm(text(lang, 'contactQuestionnaireCloseConfirm'))) {
      setQuestionnaireOpen(false);
      setStepError('');
    }
  }

  function openQuestionnaire() {
    const trackingContext = withBookingJourneyId(mergeTrackingContext(buildBookingTrackingContext({
      experienceId: effectiveExperienceId,
      requestType,
      sourceSection: 'contact',
      sourceCta: 'start_questionnaire',
      ctaLocation: 'contact_section',
      selectedDate: selectedFixed?.date || formState.requestedDate || '',
      hasFixedExcursion: requestType === 'fixed',
      language: lang
    }), formState.trackingContext), formState.trackingContext, { forceNew: !formState.trackingContext?.booking_journey_id });
    bookingJourneyIdRef.current = trackingContext.booking_journey_id || createBookingJourneyId();
    formJourneyRef.current = createFormJourney('booking_form', { ...trackingContext, journey_id: bookingJourneyIdRef.current, language: lang, source_section: 'contact', source_cta: 'start_questionnaire', has_selected_experience: Boolean(effectiveExperienceId), has_selected_date: Boolean(selectedFixed?.date || formState.requestedDate), has_people_count: totalPeople > 0 });
    trackedFormOpenRef.current.delete('field_start');
    const journeyTrackingContext = withBookingJourneyId(trackingContext, { booking_journey_id: bookingJourneyIdRef.current });
    trackBookingFormOpen(effectiveExperienceId || requestType || 'private', { ...journeyTrackingContext, questionnaire_version: 'contact_request_v1' });
    setFormState((current) => ({ ...current, trackingContext: journeyTrackingContext, language: current.language || lang }));
    setQuestionnaireOpen(true);
  }

  function regenerateMessageFromAnswers() {
    const generated = buildContactQuestionnaireMessage({ formState, selectedFixed, lang });
    setMessageManuallyEdited(false);
    setFormState((current) => ({ ...current, message: generated }));
  }

  function ensureFinalMessage() {
    if (messageManuallyEdited) return;
    const generated = buildContactQuestionnaireMessage({ formState, selectedFixed, lang });
    setFormState((current) => ({ ...current, message: generated }));
  }

  function validationIssueForStep(index = stepIndex) {
    const stepKey = questionnaireSteps[index]?.key;
    const email = String(formState.email || '').trim();
    const phone = String(formState.phone || '').trim();
    if (stepKey === 'request_type' && !requestChoice) return { error: text(lang, 'answerRequired'), fields: ['request_type'] };
    if (stepKey === 'experience') {
      if (requestChoice === 'fixed' && !formState.fixedExcursionId) return { error: text(lang, 'fixedExcursionRequired'), fields: ['fixed_excursion_id'] };
      if (requestChoice !== 'fixed' && !formState.experienceId) return { error: text(lang, 'chooseExperienceOptional'), fields: ['experience_id'] };
    }
    if (stepKey === 'date') {
      const fields = [];
      if (isPastPublicDate(formState.requestedDate)) fields.push('requested_date');
      if (isPastPublicDate(formState.alternativeDate)) fields.push('alternative_date');
      if (fields.length) return { error: text(lang, 'dateTodayOrFuture'), fields };
    }
    if (stepKey === 'participants' && totalPeople < 1) return { error: text(lang, 'peopleRequired'), fields: ['adults', 'children'] };
    if (stepKey === 'contact') {
      if (!email && !phone) return { error: text(lang, 'contactRequired'), fields: ['email', 'phone'] };
      if ((preferredContactValue === 'whatsapp' || preferredContactValue === 'phone') && !phone) return { error: text(lang, 'contactPhoneRequired'), fields: ['phone', 'preferred_contact'] };
      if (preferredContactValue === 'email' && !email) return { error: text(lang, 'contactEmailRequired'), fields: ['email', 'preferred_contact'] };
      if (phone && !isValidPublicPhone(phone)) return { error: text(lang, 'contactPhoneInvalid'), fields: ['phone'] };
      if (email && !isValidPublicEmail(email)) return { error: text(lang, 'contactEmailInvalid'), fields: ['email'] };
    }
    if (stepKey === 'attribution') {
      if (!selectedHeardAboutUs) return { error: text(lang, 'heardAboutUsRequired'), fields: ['heard_about_us'] };
      if (selectedHeardAboutUsNeedsDetail && !selectedHeardAboutUsDetail) return { error: text(lang, 'heardAboutUsOtherRequired'), fields: ['heard_about_us_detail'] };
    }
    if (stepKey === 'message') {
      const fields = [];
      if (isPastPublicDate(formState.requestedDate)) fields.push('requested_date');
      if (isPastPublicDate(formState.alternativeDate)) fields.push('alternative_date');
      if (fields.length) return { error: text(lang, 'dateTodayOrFuture'), fields };
      if (!String(message || '').trim()) return { error: text(lang, 'requestDetailsRequired'), fields: ['message'] };
    }
    return { error: '', fields: [] };
  }

  function validationForStep(index = stepIndex) {
    return validationIssueForStep(index).error || '';
  }

  function firstValidationIssue() {
    for (let index = 0; index < questionnaireSteps.length; index += 1) {
      const issue = validationIssueForStep(index);
      if (issue.error) return { ...issue, index, stepKey: questionnaireSteps[index]?.key || '' };
    }
    return null;
  }

  function firstValidationError() {
    return firstValidationIssue()?.error || '';
  }

  function validationTrackingMetadata(reason, issue = null, extra = {}) {
    const fields = issue?.fields?.length ? issue.fields : validationIssueForStep().fields;
    return {
      ...currentTrackingMetadata,
      ...extra,
      validation_reason: reason || 'unknown',
      validation_error_fields: fields,
      validation_error_count: fields.length,
      current_questionnaire_step: (issue?.index ?? stepIndex) + 1,
      current_questionnaire_step_key: issue?.stepKey || currentStep.key,
      selected_date: selectedFixed?.date || formState.requestedDate || '',
      selected_experience_id: effectiveExperienceId || experienceId || '',
      selected_fixed_excursion_id: selectedFixed?.id || formState.fixedExcursionId || '',
      selected_fixed_excursion_date: selectedFixed?.date || '',
      request_type: requestType,
      language: formState.language || lang
    };
  }

  function trackQuestionnaireValidation(reason, issue = null, extra = {}) {
    trackBookingSubmitValidationError(
      effectiveExperienceId || requestType || 'private',
      reason || 'questionnaire_validation_error',
      validationTrackingMetadata(reason, issue, extra)
    );
  }

  function goNext() {
    const issue = validationIssueForStep();
    const error = issue.error;
    if (error) {
      trackQuestionnaireValidation(`questionnaire_${currentStep.key}`, { ...issue, index: stepIndex, stepKey: currentStep.key });
      setStepError(error);
      return;
    }
    setStepError('');
    trackBookingFormStepCompleted(effectiveExperienceId || requestType || 'private', currentStep.key, stepIndex + 1, currentTrackingMetadata);
    setStepIndex((current) => {
      const next = Math.min(current + 1, questionnaireSteps.length - 1);
      if (questionnaireSteps[next]?.key === 'message') window.setTimeout(ensureFinalMessage, 0);
      return next;
    });
  }

  function goBack() {
    setStepError('');
    setStepIndex((current) => Math.max(0, current - 1));
  }

  async function submitRequest(event) {
    event?.preventDefault?.();
    if (contactInFlightRef.current || !challenge.ready) return;
    setSubmitState({ loading: false, error: '', success: '' });

    const email = String(formState.email || '').trim();
    const phone = String(formState.phone || '').trim();
    const selectedDate = String(formState.requestedDate || '').trim();
    const hasMessage = String(message || '').trim() && message !== text(lang, 'defaultMessage');
    const trackedExperience = effectiveExperienceId || requestType || 'private';
    const trackingMetadata = withBookingJourneyId({ ...currentTrackingMetadata, questionnaire_completed: true, questionnaire_step_key: 'message' }, { booking_journey_id: bookingJourneyIdRef.current || currentTrackingMetadata.booking_journey_id || '' });
    bookingJourneyIdRef.current = trackingMetadata.booking_journey_id;
    const submitTrackingMetadata = {
      ...trackingMetadata,
      submit_trigger: 'questionnaire_submit_button'
    };
    const preflightIssue = firstValidationIssue();
    const preflightError = preflightIssue?.error || '';

    if (preflightError) {
      trackQuestionnaireValidation('questionnaire_incomplete', preflightIssue, { questionnaire_completed: false });
      setStepError(preflightError);
      setSubmitState({ loading: false, error: preflightError, success: '' });
      return;
    }

    if (!hasMessage && !effectiveExperienceId && !selectedDate) {
      const messageIssue = { error: text(lang, 'requestDetailsRequired'), fields: ['message', 'experience_id', 'requested_date'], index: stepIndex, stepKey: currentStep.key };
      trackQuestionnaireValidation('missing_request_details', messageIssue, { questionnaire_completed: false });
      setSubmitState({ loading: false, error: text(lang, 'requestDetailsRequired'), success: '' });
      return;
    }

    contactInFlightRef.current = true;
    setSubmitState({ loading: true, error: '', success: '' });

    try {
      const referralPayload = referralAttributionPayload();
      const createdRequest = await submitPublicBookingRequestWithTracking({
        experience: trackedExperience,
        adults,
        children,
        metadata: submitTrackingMetadata,
        attemptAlreadyTracked: false,
        payload: {
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
          detected_source: trackingMetadata.detected_source || trackingMetadata.traffic_source,
          declared_source: selectedHeardAboutUs,
          referrer: trackingMetadata.referrer,
          landing_path: trackingMetadata.landing_path,
          utm_source: trackingMetadata.utm_source,
          utm_medium: trackingMetadata.utm_medium,
          utm_campaign: trackingMetadata.utm_campaign,
          utm_content: trackingMetadata.utm_content,
          utm_term: trackingMetadata.utm_term,
          analytics_session_id: trackingMetadata.analytics_session_id || trackingMetadata.session_id,
          analytics_visitor_id: trackingMetadata.analytics_visitor_id || trackingMetadata.visitor_id,
          analytics_journey_id: trackingMetadata.booking_journey_id || trackingMetadata.analytics_journey_id,
          booking_journey_version: trackingMetadata.booking_journey_version,
          selected_month: trackingMetadata.selected_month || isoMonthKey(trackingMetadata.selected_date || selectedFixed?.date || formState.requestedDate),
          device_type: trackingMetadata.device_type,
          browser: trackingMetadata.browser,
          operating_system: trackingMetadata.operating_system,
          form_started_at: formJourneyRef.current?.opened_at,
          submission_idempotency_key: trackingMetadata.booking_journey_id || formJourneyRef.current?.journey_id,
          submission_fingerprint: trackingMetadata.booking_journey_id || formJourneyRef.current?.journey_id,
          notification_ownership_requested: followBookingUpdates,
          turnstile_token: challenge.token,
          website: '',
          ...referralPayload
        }
      });
      if (referralPayload.referral_code) trackEvent('referral_booking_request_created', { referral_code: referralPayload.referral_code, source_type: 'booking_form', source_id: createdRequest?.id || '', language: lang }, { dedupe: false });
      markFormSubmitted(formJourneyRef.current?.journey_id, { ...trackingMetadata, form_type: 'booking_form', has_selected_experience: Boolean(effectiveExperienceId), has_selected_date: Boolean(selectedFixed?.date || formState.requestedDate), has_people_count: totalPeople > 0 });
      const ownershipLinked = await claimRequestedNotificationOwnership(createdRequest, followBookingUpdates, lang);
      const ownershipMessage = followBookingUpdates
        ? ownershipLinked
          ? (lang === 'it' ? ' Gli aggiornamenti personali sono collegati a questo dispositivo; il centro in-app è già attivo.' : ' Personal updates are linked to this device; the in-app center is already active.')
          : (lang === 'it' ? ' La richiesta è riuscita, ma gli aggiornamenti personali non sono stati collegati.' : ' The request succeeded, but personal updates were not linked.')
        : '';
      setSubmitState({ loading: false, error: '', success: `${text(lang, 'requestSent')}${ownershipMessage}` });
      setFollowBookingUpdates(false);
      setQuestionnaireOpen(false);
      trackedFormOpenRef.current.delete('field_start');
      bookingJourneyIdRef.current = '';
    } catch (error) {
      setSubmitState({ loading: false, error: text(lang, 'requestFallbackError'), success: '' });
    } finally { contactInFlightRef.current = false; challenge.reset(); }
  }

  function openFormWhatsapp() {
    const trackedExperience = effectiveExperienceId || requestType || 'private';
    const issue = firstValidationIssue();
    const error = issue?.error || '';
    if (error) {
      trackQuestionnaireValidation('questionnaire_incomplete_whatsapp', issue, { contact_path: 'whatsapp' });
      setStepError(error);
      setSubmitState({ loading: false, error, success: '' });
      return;
    }
    markFormRecoveredViaWhatsApp(formJourneyRef.current?.journey_id, { ...currentTrackingMetadata, form_type: 'booking_form', has_selected_experience: Boolean(effectiveExperienceId), has_selected_date: Boolean(selectedFixed?.date || formState.requestedDate), has_people_count: totalPeople > 0 });
    trackContactClick('whatsapp', 'questionnaire_modal', { ...currentTrackingMetadata, source_cta: 'whatsapp_direct', questionnaire_completed: true });
    if (typeof window !== 'undefined') {
      window.open(`https://wa.me/${contact.phoneWa}?text=${encode(fullMessage)}`, '_blank', 'noopener,noreferrer');
    }
  }

  function renderStepFields() {
    switch (currentStep.key) {
      case 'request_type':
        return (
          <div className="questionnaire-choice-grid" role="radiogroup" aria-label={text(lang, 'requestMode')}>
            {[['private', text(lang, 'privateExcursion')], ['fixed', text(lang, 'fixedExcursion')], ['unsure', text(lang, 'notSure')]].map(([value, label]) => (
              <button key={value} type="button" className={`questionnaire-choice ${requestChoice === value ? 'active' : ''}`} onClick={() => updateRequestType(value)} aria-pressed={requestChoice === value}>{label}</button>
            ))}
          </div>
        );
      case 'experience':
        return (
          <div className="questionnaire-field-stack">
            {requestChoice === 'fixed' ? (
              <>
                <label className="field-label" htmlFor="questionnaireFixedExcursion">{text(lang, 'chooseFixedExcursion')}</label>
                <select id="questionnaireFixedExcursion" value={formState.fixedExcursionId || ''} onChange={(event) => updateFixedExcursion(event.target.value)}>
                  <option value="">{text(lang, 'chooseFixedExcursion')}</option>
                  {fixedExcursions.map((item) => <option key={item.id} value={item.id}>{fixedExcursionLabel(item, lang)} · {text(lang, 'placesRemaining')} {item.places_remaining}/{item.capacity}</option>)}
                </select>
                {!availabilityError && fixedExcursions.length === 0 && <p className="small-note">{text(lang, 'noFixedExcursions')}</p>}
              </>
            ) : (
              <>
                <label className="field-label" htmlFor="questionnaireExperience">{text(lang, 'selectedExperience')}</label>
                <select id="questionnaireExperience" value={experienceId} onChange={(event) => update('experienceId', event.target.value)}>
                  <option value="">{text(lang, 'selectExperience')}</option>
                  {experiences.map((experience) => <option value={experience.id} key={experience.id}>{experience.title}</option>)}
                  <option value="unsure">{text(lang, 'notSure')}</option>
                </select>
              </>
            )}
          </div>
        );
      case 'date':
        return (
          <div className="questionnaire-field-stack">
            {selectedFixed && <p className="small-note">{text(lang, 'fixedExcursion')}: {fixedExcursionLabel(selectedFixed, lang)} · {adminExperienceLabel(selectedFixed.experience_id, lang)}</p>}
            {requestType === 'private' && (
              <div className="form-two-cols">
                <div>
                  <label className="field-label" htmlFor="questionnaireRequestedDate">{text(lang, 'requestedDate')}</label>
                  <input id="questionnaireRequestedDate" type="date" min={todayMinDate} value={formState.requestedDate || ''} onChange={(event) => update('requestedDate', event.target.value)} />
                </div>
                <div>
                  <label className="field-label" htmlFor="questionnaireAlternativeDate">{text(lang, 'alternativeDate')}</label>
                  <input id="questionnaireAlternativeDate" type="date" min={todayMinDate} value={formState.alternativeDate || ''} onChange={(event) => update('alternativeDate', event.target.value)} />
                </div>
              </div>
            )}
            {requestType === 'private' && <p className="small-note">{text(lang, 'noDateYet')}</p>}
          </div>
        );
      case 'participants':
        return (
          <div className="questionnaire-field-stack">
            <label className="field-label" htmlFor="questionnairePartyType">{text(lang, 'partyType')}</label>
            <select id="questionnairePartyType" value={formState.partyType || 'solo'} onChange={(event) => update('partyType', event.target.value)}>
              <option value="solo">{text(lang, 'soloTraveler')}</option>
              <option value="couple">{lang === 'it' ? 'Coppia' : 'Couple'}</option>
              <option value="family">{lang === 'it' ? 'Famiglia' : 'Family'}</option>
              <option value="group">{lang === 'it' ? 'Gruppo' : 'Group'}</option>
              <option value="company">{lang === 'it' ? 'Azienda' : 'Company'}</option>
              <option value="school">{lang === 'it' ? 'Scuola' : 'School'}</option>
              <option value="other">{lang === 'it' ? 'Altro' : 'Other'}</option>
            </select>
            <div className="form-two-cols people-count-grid">
              <div>
                <label className="field-label" htmlFor="questionnaireAdults">{text(lang, 'adults')}</label>
                <input id="questionnaireAdults" type="number" min="0" value={formState.adults || ''} onChange={(event) => update('adults', event.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="questionnaireChildren">{text(lang, 'childrenCount')}</label>
                <input id="questionnaireChildren" type="number" min="0" value={formState.children || ''} onChange={(event) => update('children', event.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="questionnaireChildrenUnder3">{text(lang, 'childrenUnder3')}</label>
                <input id="questionnaireChildrenUnder3" type="number" min="0" max={children || undefined} value={formState.childrenUnder3Count || '0'} onChange={(event) => update('childrenUnder3Count', event.target.value)} />
              </div>
              <div className="people-summary">
                <strong>{text(lang, 'totalPeople')}</strong>
                <span>{totalPeople}</span>
              </div>
            </div>
            {over12 && <p className="form-status warning" role="status">{text(lang, 'contactGuideOver12')}</p>}
          </div>
        );
      case 'contact':
        return (
          <div className="questionnaire-field-stack">
            <label className="field-label" htmlFor="questionnaireName">{text(lang, 'name')}</label>
            <input id="questionnaireName" type="text" value={formState.name || ''} onChange={(event) => update('name', event.target.value)} autoComplete="name" />
            <div className="form-two-cols">
              <div>
                <label className="field-label" htmlFor="questionnairePhone">{text(lang, 'phone')}</label>
                <input id="questionnairePhone" type="tel" inputMode="tel" pattern="^\+?[0-9]*$" value={formState.phone || ''} onBeforeInput={preventInvalidPhoneInput} onChange={(event) => update('phone', sanitizePublicPhoneInput(event.target.value))} autoComplete="tel" />
              </div>
              <div>
                <label className="field-label" htmlFor="questionnaireEmail">{text(lang, 'contactEmail')}</label>
                <input id="questionnaireEmail" type="email" inputMode="email" value={formState.email || ''} onChange={(event) => update('email', event.target.value)} onBlur={(event) => update('email', String(event.target.value || '').trim())} autoComplete="email" />
              </div>
            </div>
            <div className="form-two-cols">
              <div>
                <label className="field-label" htmlFor="questionnairePreferred">{text(lang, 'preferredContact')}</label>
                <select id="questionnairePreferred" value={preferredContactValue} onChange={(event) => update('preferredContact', event.target.value)}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="phone">{lang === 'it' ? 'Telefono' : 'Phone'}</option>
                  <option value="email">Email</option>
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="questionnaireLanguage">{text(lang, 'preferredLanguage')}</label>
                <select id="questionnaireLanguage" value={formState.language || lang} onChange={(event) => update('language', event.target.value)}>
                  <option value="it">Italiano</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
          </div>
        );
      case 'attribution':
        return (
          <div className="questionnaire-field-stack">
            <label className="field-label" htmlFor="questionnaireHeardAboutUs">{text(lang, 'heardAboutUs')}</label>
            <ContactAttributionSelect id="questionnaireHeardAboutUs" lang={lang} value={formState.heardAboutUs || ''} onChange={(value) => update('heardAboutUs', value)} />
            {selectedHeardAboutUsNeedsDetail && (
              <label className="field-label full" htmlFor="questionnaireHeardAboutUsDetail">
                {text(lang, 'heardAboutUsOtherLabel')}
                <textarea
                  id="questionnaireHeardAboutUsDetail"
                  value={formState.heardAboutUsDetail || ''}
                  onChange={(event) => update('heardAboutUsDetail', event.target.value)}
                  placeholder={text(lang, 'heardAboutUsOtherPlaceholder')}
                  rows={3}
                  maxLength={240}
                  required
                />
              </label>
            )}
          </div>
        );
      case 'message':
      default:
        return (
          <div className="questionnaire-field-stack">
            <p className="small-note">{text(lang, 'finalMessageHelp')}</p>
            <label className="field-label" htmlFor="questionnaireMessage">{text(lang, 'message')}</label>
            <textarea id="questionnaireMessage" className="questionnaire-message-textarea" value={message} onChange={(event) => updateMessage(event.target.value)} rows={10} />
            <button className="button secondary" type="button" onClick={regenerateMessageFromAnswers}>{text(lang, 'regenerateMessage')}</button>
          </div>
        );
    }
  }

  const progressPercent = Math.round(((stepIndex + 1) / questionnaireSteps.length) * 100);
  const progressText = text(lang, 'contactQuestionnaireProgress').replace('{current}', String(stepIndex + 1)).replace('{total}', String(questionnaireSteps.length));
  const finalError = firstValidationError();
  const finalActionsDisabled = Boolean(finalError || submitState.loading);

  return (
    <section className="section alt-section contact-page-clean-section" id="contact">
      {availabilityError && <p className="container" role="status">{lang === 'it' ? 'Programma non disponibile: puoi richiedere informazioni senza una data confermata.' : 'Schedule unavailable: you can request information without a confirmed date.'} <button type="button" onClick={() => setAvailabilityRetry(value => value + 1)}>{lang === 'it' ? 'Riprova' : 'Retry'}</button></p>}
      <div className="container contact-questionnaire-entry contact-questionnaire-entry-clean">
        <article className="contact-form questionnaire-start-card">
          <span className="kicker">{text(lang, 'formKicker')}</span>
          <div className="questionnaire-start-top-row">
            <h3>{text(lang, 'prepareYourRequest')}</h3>
            <button className="request-action-button request-action-button-primary questionnaire-start-button" type="button" onClick={openQuestionnaire}>{text(lang, 'startQuestionnaire')}</button>
          </div>
          <p>{text(lang, 'contactQuestionnaireIntro')}</p>
          {submitState.success && <p className="form-status success" role="status">{submitState.success}</p>}
        </article>
      </div>

      {questionnaireTransition.shouldRender && (
        <div className={`questionnaire-overlay motion-backdrop ${questionnaireTransition.isClosing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="questionnaire-title">
          <form className={`questionnaire-modal motion-panel ${currentStep.key === 'message' ? 'questionnaire-modal-final' : ''}`} ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={text(lang, 'requestInformation')} onSubmit={submitRequest}>
            <header className="questionnaire-header">
              <div>
                <span className="kicker">vulcanIQ</span>
                <h2 id="questionnaire-title">{text(lang, 'contactQuestionnaireTitle')}</h2>
                <p>{progressText}</p>
              </div>
              <button className="date-modal-close" type="button" onClick={attemptCloseQuestionnaire} aria-label={text(lang, 'close')}>{text(lang, 'close')}</button>
            </header>
            <div className="questionnaire-progress" aria-label={progressText} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progressPercent}>
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="questionnaire-option-actions">
              <button className="button secondary" type="button" onClick={openPrivateOptions}>{text(lang, 'viewPrivateExcursionOptions')}</button>
              <button className="button secondary" type="button" onClick={openFixedOptions}>{text(lang, 'viewFixedExcursionOptions')}</button>
            </div>
            <main className="questionnaire-body">
              <section className="questionnaire-step" key={currentStep.key} aria-live="polite">
                <h3>{currentStep.title}</h3>
                {renderStepFields()}
                {stepError && <p className="form-status error" role="alert">{stepError}</p>}
                {submitState.error && currentStep.key === 'message' && <p className="form-status error" role="alert">{submitState.error}</p>}
                {submitState.success && <p className="form-status success" role="status">{submitState.success}</p>}
              </section>
            </main>
            <footer className="questionnaire-footer">
              <button className="button secondary" type="button" onClick={goBack} disabled={stepIndex === 0}>{text(lang, 'back')}</button>
              {currentStep.key !== 'message' ? (
                <button className="request-action-button request-action-button-primary" type="button" onClick={goNext}>{text(lang, 'next')}</button>
              ) : (
                <div className="questionnaire-final-cta">
                  <label className="notification-toggle questionnaire-notification-optin" htmlFor="questionnaireFollowUpdates">
                    <input id="questionnaireFollowUpdates" type="checkbox" checked={followBookingUpdates} onChange={(event) => setFollowBookingUpdates(event.target.checked)} />
                    <span>{lang === 'it' ? 'Segui su questo dispositivo gli aggiornamenti dopo l’invio diretto (centro in-app; push facoltativo).' : 'Follow updates on this device after sending the direct request (in-app center; push optional).'}</span>
                  </label>
                  <p className="questionnaire-notification-note">{lang === 'it' ? 'Facoltativo e solo per “Invia richiesta”. WhatsApp non collega le notifiche personali.' : 'Optional and only for “Send request”. WhatsApp does not link personal notifications.'}</p>
                  {challenge.element}
                  <div className="questionnaire-final-actions">
                    <button className="request-action-button request-action-button-primary" type="submit" disabled={finalActionsDisabled || !challenge.ready}>{submitState.loading ? (lang === 'it' ? 'Invio...' : 'Sending...') : text(lang, 'submitRequest')}</button>
                    <button className="request-action-button request-action-button-secondary" type="button" onClick={openFormWhatsapp} disabled={finalActionsDisabled}>{text(lang, 'sendWhatsapp')}</button>
                  </div>
                </div>
              )}
            </footer>
          </form>
        </div>
      )}

      {fixedOptionsTransition.shouldRender && (
        <div className={`date-modal-overlay request-options-overlay motion-backdrop ${fixedOptionsTransition.isClosing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="fixed-options-title" onClick={() => setFixedOptionsOpen(false)}>
          <article className="date-modal request-options-modal motion-panel" onClick={(event) => event.stopPropagation()}>
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
            {fixedExcursions.filter((item) => sameCalendarMonth(item.date, detailsMonthDate)).length > 0 && (
              <div className="request-fixed-list">
                {fixedExcursions.filter((item) => sameCalendarMonth(item.date, detailsMonthDate)).map((item) => (
                  <button className="request-fixed-option" type="button" key={item.id} onClick={() => setSelectedFixedExcursionDetails(item)}>
                    <strong>{fixedExcursionLabel(item, lang)}</strong>
                    <span>{adminExperienceLabel(item.experience_id, lang)} · {text(lang, 'placesRemaining')} {item.places_remaining}/{item.capacity}</span>
                  </button>
                ))}
              </div>
            )}
            {fixedOptions.length ? (
              <div className="request-leaflet-grid">
                {fixedOptions.map((option) => {
                  const file = monthlyLeafletFile(option.leaflet, lang) || option.leaflet;
                  const isImage = isLeafletImage(file);
                  return (
                    <button className="request-leaflet-tile" type="button" key={option.id} onClick={() => openRequestLeaflet(option)}>
                      {isImage && file?.file_url ? (
                        <img src={file.file_url} alt={option.title} loading="lazy" decoding="async" />
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

      {privateOptionsTransition.shouldRender && (
        <div className={`date-modal-overlay request-options-overlay motion-backdrop ${privateOptionsTransition.isClosing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="private-options-title" onClick={() => setPrivateOptionsOpen(false)}>
          <article className="date-modal request-options-modal motion-panel" onClick={(event) => event.stopPropagation()}>
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


      {renderedFixedExcursionDetails && (
        <div className={`date-modal-overlay request-fixed-detail-overlay motion-backdrop ${fixedDetailTransition.isClosing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="request-fixed-detail-title" onClick={() => setSelectedFixedExcursionDetails(null)}>
          <article className="date-modal request-fixed-detail-modal motion-panel" onClick={(event) => event.stopPropagation()}>
            <div className="date-modal-header">
              <div>
                <span className="micro-label details-label">{text(lang, 'fixedExcursion')}</span>
                <h2 id="request-fixed-detail-title">{fixedExcursionTitle(renderedFixedExcursionDetails, lang)}</h2>
                <p>{fixedExcursionLabel(renderedFixedExcursionDetails, lang)}</p>
              </div>
              <button className="date-modal-close" type="button" onClick={() => setSelectedFixedExcursionDetails(null)}>{text(lang, 'close')}</button>
            </div>
            <div className="date-modal-content fixed-date-content">
              <article className="date-modal-fixed-card request-fixed-detail-card">
                <BlockedDatesAttachment item={renderedFixedExcursionDetails} lang={lang} onOpenFile={(file, label) => setActiveLeaflet({ leaflet: file, label: label || text(lang, 'openExcursionProgram'), fixedExcursion: renderedFixedExcursionDetails })} />
                <FormattedDescription textValue={fixedExcursionProgram(renderedFixedExcursionDetails, lang) || renderedFixedExcursionDetails[`note_${lang}`] || renderedFixedExcursionDetails.note_it || renderedFixedExcursionDetails.note_en || experienceById(renderedFixedExcursionDetails.experience_id).summary[lang]} />
                <dl className="public-details-grid date-modal-details-grid">
                  <div><dt>{text(lang, 'dateLabel')}</dt><dd>{formatDateForMessage(renderedFixedExcursionDetails.date, lang)}</dd></div>
                  <div><dt>{text(lang, 'experienceLabel')}</dt><dd>{adminExperienceLabel(renderedFixedExcursionDetails.experience_id, lang)}</dd></div>
                  <MeetingPointDetailCard item={renderedFixedExcursionDetails} lang={lang} />
                  {fixedExcursionField(renderedFixedExcursionDetails, 'difficulty', lang) && <div><dt>{text(lang, 'difficulty')}</dt><dd>{fixedExcursionField(renderedFixedExcursionDetails, 'difficulty', lang)}</dd></div>}
                  {fixedExcursionField(renderedFixedExcursionDetails, 'price_note', lang) && <div><dt>{text(lang, 'priceNote')}</dt><dd>{fixedExcursionField(renderedFixedExcursionDetails, 'price_note', lang)}</dd></div>}
                  <div><dt>{text(lang, 'placesAvailable')}</dt><dd>{renderedFixedExcursionDetails.places_remaining}/{renderedFixedExcursionDetails.capacity}</dd></div>
                </dl>
                <div className="request-action-row date-modal-actions">
                  <button className="request-action-button request-action-button-primary" type="button" onClick={() => { updateFixedExcursion(renderedFixedExcursionDetails.id); setSelectedFixedExcursionDetails(null); setFixedOptionsOpen(false); }}>{text(lang, 'useThisOptionInRequest')}</button>
                </div>
              </article>
            </div>
          </article>
        </div>
      )}
      {renderedPrivateExperience && (
        <div className={`experience-modal-overlay request-private-detail-overlay motion-backdrop ${privateDetailTransition.isClosing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="request-private-detail-title" onClick={() => setSelectedPrivateExperience(null)}>
          <article className="experience-modal request-private-detail-modal motion-panel" onClick={(event) => event.stopPropagation()}>
            <div className="experience-modal-header">
              <h2 id="request-private-detail-title">{renderedPrivateExperience.title}</h2>
              <button className="experience-modal-close" type="button" onClick={() => setSelectedPrivateExperience(null)}>{text(lang, 'close')}</button>
            </div>
            <div className="experience-detail-content">
              <EditableImage mediaKey={experienceMediaKey(renderedPrivateExperience.id)} lang={lang} siteMedia={siteMedia} editor={editor} fallbackSrc={renderedPrivateExperience.image} fallbackAlt={`${renderedPrivateExperience.title} vulcanIQ`} className="experience-modal-image" />
              <div className="experience-detail-copy">
                <p>{renderedPrivateExperience.description[lang]}</p>
                <dl>
                  <div><dt>{text(lang, 'bestFor')}</dt><dd>{renderedPrivateExperience.bestFor[lang]}</dd></div>
                  <div><dt>{text(lang, 'practical')}</dt><dd>{renderedPrivateExperience.notes[lang]}</dd></div>
                  <div><dt>{text(lang, 'safety')}</dt><dd>{renderedPrivateExperience.safety[lang]}</dd></div>
                </dl>
                <div className="request-action-row experience-modal-actions">
                  <button className="request-action-button request-action-button-primary" type="button" onClick={() => usePrivateExperienceInRequest(renderedPrivateExperience)}>{text(lang, 'useThisOptionInRequest')}</button>
                </div>
              </div>
            </div>
          </article>
        </div>
      )}

      {renderedRequestLeaflet?.leaflet && (
        <div className={`leaflet-fullscreen-overlay request-leaflet-overlay motion-backdrop ${requestLeafletTransition.isClosing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={renderedRequestLeaflet.label || text(lang, 'openProgram')} onClick={() => setActiveLeaflet(null)}>
          <article className="leaflet-fullscreen-modal motion-panel" onClick={(event) => event.stopPropagation()}>
            <div className="leaflet-fullscreen-header">
              <h2>{renderedRequestLeaflet.label || text(lang, 'openProgram')}</h2>
              <button className="date-modal-close" type="button" onClick={() => setActiveLeaflet(null)}>{text(lang, 'close')}</button>
            </div>
            <MonthlyProgramContent leaflet={renderedRequestLeaflet.leaflet} lang={lang} label={renderedRequestLeaflet.label || text(lang, 'openProgram')} />
            {renderedRequestLeaflet.fixedExcursion && <button className="request-action-button request-action-button-primary" type="button" onClick={() => { updateFixedExcursion(renderedRequestLeaflet.fixedExcursion.id); setActiveLeaflet(null); setFixedOptionsOpen(false); }}>{text(lang, 'useThisOptionInRequest')}</button>}
          </article>
        </div>
      )}
      {contactAttributionModal}
    </section>
  );
}

function SocialLinks({ lang, siteContent, className = '', compact = false, card = false, location = 'site' }) {
  const links = resolveSocialLinks(siteContent);
  if (!links.length) return null;
  return (
    <div className={`social-links ${compact ? 'compact' : ''} ${card ? 'card-layout' : ''} ${className}`.trim()} aria-label={adminCopy(lang, 'Pagine social', 'Social pages')}>
      {links.map((link) => (
        <a
          className={card ? "social-link-card" : undefined}
          key={link.id || `${link.platform}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent('social_link_click', {
            platform: link.platform,
            cta_location: location,
            source_section: location,
            language: lang
          }, { dedupe: false, transport: 'beacon' })}
        >
          <Icon name={link.icon_key || socialPlatformOption(link.platform).icon || 'link'} />
          <span className="social-link-copy">
            <strong>{socialLinkLabel(link, lang)}</strong>
            {card && <small>{socialPlatformDescription(link.platform, lang)}</small>}
          </span>
          {card && <span className="social-card-cta">{adminCopy(lang, 'Apri', 'Open')} ↗</span>}
        </a>
      ))}
    </div>
  );
}

function LatestNewsCard({ lang, siteContent, editor }) {
  const settings = resolveLatestNewsSettings(editor?.contentMap || siteContent || {}, lang);
  if (!settings.shouldRender && !editor?.isEditing) return null;
  const disabled = !settings.selectedUrl;
  const title = normalizeLatestNewsTitle(settings.title, lang);
  const safetyCopy = adminCopy(
    lang,
    'Le condizioni del vulcano e del meteo possono cambiare rapidamente: controlla sempre gli aggiornamenti prima dell’escursione.',
    'Volcanic and weather conditions can change quickly: always check the latest updates before your experience.'
  );
  return (
    <section className={`section latest-news-section ${!settings.shouldRender ? 'editor-only-hidden-public' : ''}`.trim()}>
      <div className="container latest-news-card etna-news-card">
        <div className="etna-news-copy">
          {editor?.isEditing ? <EditableText as="h2" itemKey={latestNewsContentKey('title')} lang={lang} siteContent={siteContent} editor={editor} fallback={title} /> : <h2>{title}</h2>}
          <p className="small-note etna-news-safety-note">{safetyCopy}</p>
        </div>
        <div className="etna-news-action-card">
          {disabled ? (
            <button className="button secondary" type="button" disabled>{adminCopy(lang, 'URL non configurato', 'URL not configured')}</button>
          ) : (
            <a className="button primary" href={settings.selectedUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent('external_link_click', { cta_location: 'etna_live_news_card', source_section: 'latest_news', language: lang }, { dedupe: false, transport: 'beacon' })}>
              {editor?.isEditing ? <EditableText itemKey={latestNewsContentKey('cta_label')} lang={lang} siteContent={siteContent} editor={editor} fallback={settings.ctaLabel} /> : settings.ctaLabel}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function SocialPage({ lang, siteContent, editor }) {
  const links = resolveSocialLinks(editor?.contentMap || siteContent || {});
  return (
    <section className="section page-section social-page-section" id="social">
      <div className="container social-page-card">
        <div className="section-header refined-section-header social-page-hero">
          <h2>{adminCopy(lang, 'Pagine social vulcanIQ', 'vulcanIQ social pages')}</h2>
          <p>{adminCopy(lang, 'Segui vulcanIQ sui canali ufficiali per aggiornamenti sull’Etna, nuove esperienze, foto dal territorio e contenuti dietro le quinte.', 'Follow vulcanIQ on the official channels for Etna updates, new experiences, local stories and behind-the-scenes content.')}</p>
        </div>
        {links.length ? (
          <>
            {links.length === 1 && (
              <article className="social-feature-card">
                <div>
                  <Icon name={links[0].icon_key || socialPlatformOption(links[0].platform).icon || 'link'} />
                  <h3>{socialLinkLabel(links[0], lang)}</h3>
                  <p>{socialPlatformDescription(links[0].platform, lang)}</p>
                </div>
                <a className="button primary" href={links[0].url} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent('social_link_click', { platform: links[0].platform, cta_location: 'social_page_featured', source_section: 'social_page', language: lang }, { dedupe: false, transport: 'beacon' })}>{adminCopy(lang, 'Apri', 'Open')}</a>
              </article>
            )}
            <SocialLinks lang={lang} siteContent={editor?.contentMap || siteContent} className="social-page-links" card location="social_page" />
          </>
        ) : (
          <article className="empty-state-card">
            <p>{adminCopy(lang, 'Nessun social configurato al momento.', 'No social links are configured yet.')}</p>
          </article>
        )}
      </div>
    </section>
  );
}

function LatestNewsPage({ lang, siteContent, editor }) {
  const settings = resolveLatestNewsSettings(editor?.contentMap || siteContent || {}, lang);
  return (
    <section className="section page-section latest-news-page-section" id="latest-news">
      {settings.shouldRender || editor?.isEditing ? (
        <LatestNewsCard lang={lang} siteContent={siteContent} editor={editor} />
      ) : (
        <div className="container">
          <article className="empty-state-card latest-news-empty-card">
            <h2>{adminCopy(lang, 'Nessun link configurato', 'No Etna live news link configured')}</h2>
            <p>{adminCopy(lang, 'Le notizie live sull’Etna saranno disponibili appena verrà configurato il link.', 'Etna live news will be available once the link is configured.')}</p>
          </article>
        </div>
      )}
    </section>
  );
}

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

function buildAttributionContactMessage(value, detail, lang) {
  const display = heardAboutUsDisplay(value, detail, lang);
  if (!display) return text(lang, 'defaultMessage');
  if (lang === 'en') {
    return `Hi Leonardo,\n\nI heard about vulcanIQ from "${display}" and I would like information about a vulcanIQ experience on Mount Etna.\n\nI would like to know availability, approximate duration, price and clothing recommendations.\n\nThank you!`;
  }
  return `Ciao Leonardo,\n\nHo sentito parlare di vulcanIQ da "${display}" e vorrei informazioni su un’esperienza vulcanIQ sull’Etna.\n\nVorrei sapere disponibilità, durata indicativa, prezzo e consigli sull’abbigliamento.\n\nGrazie!`;
}

function buildContextualAttributionContactMessage(baseMessage, value, detail, lang) {
  const cleanBase = String(baseMessage || '').trim();
  const defaultMessage = String(text(lang, 'defaultMessage') || '').trim();
  const display = heardAboutUsDisplay(value, detail, lang);
  if (!cleanBase || cleanBase === defaultMessage) return buildAttributionContactMessage(value, detail, lang);
  if (!display) return cleanBase;
  const sourceLine = lang === 'en'
    ? `How I heard about vulcanIQ: ${display}.`
    : `Come ho conosciuto vulcanIQ: ${display}.`;
  return `${cleanBase}\n\n${sourceLine}`;
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
  const panelRef = useRef(null);
  useDialogFocusTrap(true, panelRef, onClose);
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
      <section ref={panelRef} tabIndex={-1} className="contact-attribution-modal" role="dialog" aria-modal="true" aria-labelledby="contactAttributionTitle" onClick={(event) => event.stopPropagation()}>
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

function adminExperienceLabel(id, lang) {
  if (!id || id === 'unsure') return lang === 'it' ? 'Non so' : 'Not sure';
  return experienceById(id).title;
}

const MEDIA_ADMIN_ITEMS = [
  { key: 'brand_logo_main', it: 'Logo principale vulcanIQ', en: 'Main vulcanIQ logo', fallback: BRAND.logo, alt_it: 'Logo vulcanIQ — esperienze premium sull’Etna', alt_en: 'vulcanIQ logo — premium Etna experiences' },
  { key: 'home_hero_background', it: 'Sfondo hero homepage', en: 'Home hero background', media_kind: 'image', alt_it: 'Sfondo hero homepage', alt_en: 'Home hero background' },
  { key: 'home_hero_background_poster', it: 'Poster sfondo hero', en: 'Hero background poster', media_kind: 'image', alt_it: 'Poster sfondo hero homepage', alt_en: 'Home hero background poster' },
  { key: 'home_hero_feature_image', it: 'Immagine hero homepage', en: 'Home hero image', media_kind: 'image', alt_it: 'Immagine hero homepage', alt_en: 'Home hero image' },
  { key: 'home_hero_video', it: 'Video homepage', en: 'Home video', media_kind: 'video', alt_it: 'Video introduttivo vulcanIQ', alt_en: 'vulcanIQ introductory video' },
  { key: 'mission_main_image', it: 'Immagine missione', en: 'Mission image' },
  { key: 'about_leonardo_image', it: 'Foto Leonardo', en: 'Leonardo photo' },
  { key: 'about_deborah_image', it: 'Foto Deborah', en: 'Deborah photo' },
  { key: 'reviews_background_image', it: 'Immagine recensioni', en: 'Reviews image' },
  { key: 'default_experience_premium_image', it: 'Etna Premium', en: 'Etna Premium' },
  { key: 'default_experience_learning_image', it: 'Etna Learning', en: 'Etna Learning' },
  { key: 'default_experience_live_image', it: 'Etna Live', en: 'Etna Live' },
  { key: 'default_experience_stories_image', it: 'Etna Stories', en: 'Etna Stories' }
];

function mediaUrlKindFromValue(value, fallback = 'image') {
  const clean = String(value || '').split('?')[0].toLowerCase();
  if (/\.(mp4|webm|mov)$/.test(clean)) return 'video';
  if (/\.(pdf)$/.test(clean)) return 'document';
  return fallback || 'image';
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
  { key: 'home.hero.cta.book_with_code', section: 'Homepage', label_it: 'CTA prenota con codice', label_en: 'Book with code CTA', type: 'text', default_it: i18n.it.bookWithCode, default_en: i18n.en.bookWithCode, style_variant: 'label' },
  { key: 'home.hero.cta.gift_card', section: 'Homepage', label_it: 'CTA Gift Card', label_en: 'Gift Card CTA', type: 'text', default_it: 'Gift Card', default_en: 'Gift Card', style_variant: 'label' },
  { key: 'home.hero.contact_cta', section: 'Homepage', label_it: 'CTA contatto', label_en: 'Contact CTA', type: 'text', default_it: i18n.it.contact, default_en: i18n.en.contact, style_variant: 'label' },
  { key: 'home.hero.guide_badge', section: 'Homepage', label_it: 'Badge guida', label_en: 'Guide badge', type: 'text', default_it: i18n.it.trust[0], default_en: i18n.en.trust[0], style_variant: 'label' },
  { key: 'home.hero.layout', section: 'Homepage', label_it: 'Layout hero senza media', label_en: 'Hero layout without media', type: 'text', default_it: '', default_en: '', layout_variant: 'left' },
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
  { key: latestNewsContentKey('enabled'), section: 'Notizie live sull’Etna', label_it: 'Mostra notizie live sull’Etna', label_en: 'Show Etna live news', type: 'text', default_it: 'true', default_en: 'true' },
  { key: latestNewsContentKey('title'), section: 'Notizie live sull’Etna', label_it: 'Titolo notizie live sull’Etna', label_en: 'Etna live news title', type: 'text', default_it: LATEST_NEWS_DEFAULTS.title_it, default_en: LATEST_NEWS_DEFAULTS.title_en, text_size: 'large', style_variant: 'heading' },
  { key: latestNewsContentKey('description'), section: 'Notizie live sull’Etna', label_it: 'Descrizione notizie live sull’Etna', label_en: 'Etna live news description', type: 'textarea', default_it: LATEST_NEWS_DEFAULTS.description_it, default_en: LATEST_NEWS_DEFAULTS.description_en },
  { key: latestNewsContentKey('cta_label'), section: 'Notizie live sull’Etna', label_it: 'Testo pulsante notizie live sull’Etna', label_en: 'Etna live news button text', type: 'text', default_it: LATEST_NEWS_DEFAULTS.cta_it, default_en: LATEST_NEWS_DEFAULTS.cta_en, style_variant: 'label' },
  { key: latestNewsContentKey('url_it'), section: 'Notizie live sull’Etna', label_it: 'URL italiano notizie live sull’Etna', label_en: 'Italian latest-news URL', type: 'text', default_it: '', default_en: '' },
  { key: latestNewsContentKey('url_en'), section: 'Notizie live sull’Etna', label_it: 'URL inglese notizie live sull’Etna', label_en: 'English latest-news URL', type: 'text', default_it: '', default_en: '' },
  { key: SOCIAL_LINKS_CONTENT_KEY, section: 'Social', label_it: 'Pagine social', label_en: 'Social pages', type: 'textarea', default_it: '', default_en: '' },
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

function formatMoney(amount, currency = 'EUR', lang = 'it') {
  return formatCurrencyAmount(amount, currency, lang === 'en' ? 'en-GB' : 'it-IT');
}

export { ADMIN_CONTENT_DEFINITIONS, BOOKING_JOURNEY_VERSION, BRAND, BlockedDatesAttachment, BookingCodeModal, ContactActions, ContactAttributionModal, ContactAttributionSelect, ContactForm, DEFAULT_EDITABLE_TEXT_STYLES, EMAIL, EXPERIENCE_CONTENT_DEFINITIONS, EditableCardFrame, EditableImage, EditableText, EmailPanel, ExperienceAccordion, FastRequestModal, FormattedDescription, FormattedText, HEARD_ABOUT_US_ADMIN_OPTION, HEARD_ABOUT_US_OPTIONS, HEARD_ABOUT_US_VALUES, Header, Hero, INSTAGRAM, Icon, LATEST_NEWS_DEFAULTS, LatestNewsCard, LatestNewsPage, MEDIA, MEDIA_ADMIN_ITEMS, MOTION_DURATION_MS, MeetingPointDetailCard, MonthlyProgramContent, PARTNERSHIP_CATEGORIES, PHONE_DISPLAY, PHONE_TEL, PHONE_WA, PartnershipsPage, SITE_CONTENT_DEFINITIONS, SOCIAL_LINKS_CONTENT_KEY, SOCIAL_PLATFORM_OPTIONS, SocialLinks, SocialPage, SupportContactModal, Team, VideoSlot, adminCopy, adminExperienceLabel, bookingCodeErrorMessage, buildAttributionContactMessage, buildAvailableDateRequestMessage, buildBookingTrackingContext, buildContactQuestionnaireMessage, buildContextualAttributionContactMessage, buildExperienceMessage, buildFixedExcursionMessage, buildMailto, buildSiteContentMap, cleanDateForMessage, cleanEditableTextValue, cleanHeardAboutUsDetail, contactActionConfirmLabel, contentSettingValue, contentText, createBookingJourneyId, createTextTeaser, currentBrowserAttribution, dateToIso, defaultSocialLinks, editorContentItem, editorMediaItem, encode, escapeRegExp, experienceById, experienceMediaKey, experiences, fixedExcursionField, fixedExcursionLabel, fixedExcursionLeafletFile, fixedExcursionProgram, fixedExcursionTitle, formatDateForMessage, formatMoney, formattedDescriptionBlocks, getCalendarDays, getContentDefinition, getItemsByDate, getMediaDefinition, giftCardClaimCopy, hasLeafletFile, hasMessageValue, hasMonthlyLeafletContent, heardAboutUsDisplay, heardAboutUsLabel, heardAboutUsMetadata, heardAboutUsOptions, i18n, isCurrentOrFutureMonth, isLeafletImage, isPastPublicDate, isValidPublicEmail, isValidPublicPhone, isoMonthKey, joinMessageLines, latestNewsContentKey, leafletTitle, localizedContentField, localizedPartnershipDescription, mediaAlt, mediaUrl, mediaUrlKindFromValue, mergeTrackingContext, messageLine, monthKey, monthLabel, monthlyLeafletField, monthlyLeafletFile, monthlyOptionsLeaflets, motionScrollBehavior, navigatePublicRoute, needsHeardAboutUsDetail, normalizeCampaignSource, normalizeGoogleMapsUrl, normalizeHeardAboutUs, normalizeInstagramUrl, normalizeLatestNewsTitle, normalizePhoneDigits, normalizePhoneTel, normalizeSocialLink, normalizedKeyText, openDefaultEmailApp, openResolvedContactAction, parseBooleanSetting, parseSocialLinksJson, partnershipCategoryKey, partnershipCategoryLabel, partnershipCategoryOption, peopleSummary, preferredContactLabel, prefersReducedMotion, preventInvalidPhoneInput, publicPages, requestChoiceLabel, resolveEditableTextStyle, resolveLatestNewsSettings, resolvePublicContactDetails, resolveSocialLinks, safeExternalUrl, safeParticipantNumber, sameCalendarMonth, sanitizePublicPhoneInput, socialLinkLabel, socialLinksJsonFromContent, socialPlatformDescription, socialPlatformLabel, socialPlatformOption, startOfMonth, startOfWeekMonday, storePublicLanguage, text, textStyleClass, todayIso, useContactAttributionGate, useTransitionPresence, useTransitionValue, validRecipientEmail, validRecipientPhone, withBookingJourneyId };
