import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { blockedDates, defaultExperienceAvailability } from './data/availability.js';
import { isSupabaseConfigured } from './lib/supabaseClient.js';
import { getAdminAccess, signInOwner, signOutOwner } from './services/adminAuth.js';
import { createManualBookingRequest, listBookingRequests, updateBookingRequest, approveBookingRequest, declineBookingRequest, cancelBookingRequest, markBookingRequestReviewRequested, markBookingRequestReviewReceived, markBookingRequestReviewLinkCopied, bookingRequestCanConfirmIncome, getBookingRequestIncomeState, confirmBookingRequestIncome } from './services/bookingRequests.js';
import { listBookingCodes, createBookingCode, cancelBookingCode, redeemBookingCode, markBookingCodeCompleted, getBookingCodePaymentState, recordBookingCodePayment, markBookingCodeNoShow, markBookingCodeReviewRequested, markBookingCodeReviewReceived, markBookingCodeReviewLinkCopied } from './services/bookingCodes.js';
import { loadPublicAvailability, loadPublicFixedExcursions, listAvailabilityBlocks, createAvailabilityBlock, updateAvailabilityBlock, deactivateAvailabilityBlock, listFixedExcursions, createFixedExcursion, updateFixedExcursion, deactivateFixedExcursion, listMonthlyLeaflets, loadPublicMonthlyLeaflets, createMonthlyLeaflet, updateMonthlyLeaflet, deactivateMonthlyLeaflet, uploadMonthlyLeafletFile, removeMonthlyLeafletFile, uploadFixedExcursionLeafletFile, uploadBlockedDatesFile, removeBlockedDatesFile, defaultReason } from './services/availabilityService.js';
import { loadPublicPartnerships, listPartnerships, createPartnership, updatePartnership, deactivatePartnership, uploadPartnershipImage, removePartnershipImage } from './services/partnershipService.js';
import { loadPublicReviews, submitPublicReview, listReviews, createManualReview, updateReviewDetails, updateReviewVisibility, updateReviewAdminReply, deleteReviewAdminReply, deleteReview } from './services/reviewsService.js';
import { listSiteMedia, upsertSiteMedia, uploadSiteMediaFile, removeSiteMediaFile } from './services/siteMediaService.js';
import { loadPublicSiteContent, listSiteContent, upsertSiteContent } from './services/siteContentService.js';
import { listFinanceEntries, createFinanceEntry, updateFinanceEntry, archiveFinanceEntry, reverseFinanceEntry } from './services/financeService.js';
import { assignPartnerToBookingRequest, calculatePartnerCommission, listPartnerCommissions, listPartnerCommissionSummary, updatePartnerCommissionStatus, upsertPartnerCommissionForSource } from './services/partnerCommissions.js';
import { getAdminAnalyticsSummary, listAnalyticsEventPage, listAnalyticsSessionPage, setAnalyticsReportingBaseline, clearAnalyticsReportingBaseline } from './services/analyticsService.js';
import { createDatabaseBackup, downloadLatestDatabaseBackup, getBackupSchedule, getBackupStatus, saveBackupSchedule } from './services/backupService.js';
import { createGiftCardRequest, listGiftCardRequests, updateGiftCardRequest } from './services/giftCards.js';
import { getOperationalSafeguards, retryRequestNotification, sendWeeklyAdminRecap } from './services/operationsService.js';
import { createCustomerReferralCode, disableCustomerReferralCode, listCustomerReferralCodes, referralAttributionPayload, referralLink, storeReferralJourney, validateAndRecordReferralClick } from './services/referrals.js';
import { trackPageView, trackLanguageSwitch, trackExcursionView, trackExperienceCardView, trackExperienceDetailOpen, trackCalendarDateSelect, trackBookingFormOpen, trackBookingFormStarted, trackBookingFormStepCompleted, trackBookingFormFieldStart, trackBookingSubmitValidationError, trackContactClick, trackMapsClick, trackReviewView, trackEvent, startAnalyticsHeartbeat, getAnalyticsIdentitySnapshot, isAnalyticsBrowserExcluded, setAnalyticsBrowserExcluded, createFormJourney, markFormFieldStarted, markFormActivity, markFormSubmitted, markFormAbandoned, markFormRecoveredViaWhatsApp } from './analytics.js';
import { buildApprovalReply, buildDeclineReply, replySubject, requestLang, normalizePhoneForWhatsApp, hasLikelyCountryCode } from './services/replyMessages.js';
import { submitPublicBookingRequestWithTracking } from './services/publicBookingSubmit.js';
import { formatCurrencyAmount, normalizeCurrency, parseMoneyAmount } from './utils/money.js';
import { paymentSummary, financeEntryHasBusinessSource, financeEntryIsRecognized, calculateLedgerSummary, buildFinancialReconciliation } from './domain/financeModel.js';
import { applySeo } from './seo.js';
import { ADMIN_ROLES, listAdminUsers, updateAdminUser } from './services/adminUsers.js';
import OperationalSafeguardsBanner from './features/admin/OperationalSafeguardsBanner.jsx';
import VideoOptimizer from './features/admin/media/VideoOptimizer.jsx';
import WeeklyReportsAdminPanel from './features/system/WeeklyReportsAdminPanel.jsx';
import { CURRENT_TRACKING_ACTIVATION_MS, SMALL_SAMPLE_VISITOR_THRESHOLD, isCurrentTrackingRecord } from './features/analytics/integrity.js';
import { ANALYTICS_PERIODS as CANONICAL_ANALYTICS_PERIODS, analyticsPeriodLabel as canonicalAnalyticsPeriodLabel, analyticsDateRange as canonicalAnalyticsDateRange, summaryToAdminModelPatch, defaultAnalyticsCustomRange } from './features/analytics/contract.js';
import AnalyticsHealthPanel from './features/analytics/AnalyticsHealthPanel.jsx';
import AnalyticsCanonicalFunnels from './features/analytics/AnalyticsCanonicalFunnels.jsx';
import ReviewsPage from './features/reviews/ReviewsPage.jsx';
import GoogleReviewsAdminStatus from './features/reviews/GoogleReviewsAdminStatus.jsx';
import NotificationsPage from './features/notifications/NotificationsPage.jsx';
import { normalizeReviewText, reviewSourceLabel } from './features/reviews/reviewModel.js';
import useBodyScrollLock from './hooks/useBodyScrollLock.js';
import { publicPageFromPathname, legalPageFromPathname, routeDefinitionFromPathname, canonicalPathForPage, isReferralPath } from './app/publicRoutes.js';
import NotFoundPage from './app/NotFoundPage.jsx';
import DomainErrorBoundary from './app/DomainErrorBoundary.jsx';
import './styles.css';
import './styles/admin-system.css';
import './styles/analytics-consolidated.css';

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
  { key: 'requests', path: '/admin/requests', labelIt: 'Richieste prenotazione', labelEn: 'Booking requests', editable: true },
  { key: 'bookingCodes', path: '/admin/booking-codes', labelIt: 'Codici prenotazione', labelEn: 'Booking codes', editable: true },
  { key: 'giftCards', path: '/admin/gift-cards', labelIt: 'Gift Card', labelEn: 'Gift Cards', editable: true },
  { key: 'notifications', path: '/admin/notifications', labelIt: 'Installazione e notifiche', labelEn: 'Install & notifications', editable: false },
  { key: 'availability', path: '/admin/availability', labelIt: 'Disponibilità', labelEn: 'Availability', editable: true },
  { key: 'partnerships', path: '/admin/partnerships', labelIt: 'Collaborazioni', labelEn: 'Collaborations', editable: true },
  { key: 'edit', path: '/admin/edit', labelIt: 'Modifica sito e recensioni', labelEn: 'Edit website & reviews', editable: true },
  { key: 'finance', path: '/admin/finance', labelIt: 'Finanze', labelEn: 'Finance', editable: true },
  { key: 'analytics', path: '/admin/analytics', labelIt: 'Analytics', labelEn: 'Analytics', editable: true },
  { key: 'backup', path: '/admin/system/backup', labelIt: 'Sistema e backup', labelEn: 'System & backup', editable: false, ownerOnly: true },
  { key: 'users', path: '/admin/users', labelIt: 'Utenti admin', labelEn: 'Admin users', editable: false, ownerOnly: true },
  { key: 'publicSite', path: '/', labelIt: 'Visualizza sito pubblico', labelEn: 'View public site', editable: true, external: true }
];

const ADMIN_NAV_GROUPS = [
  { key: 'operations', labelIt: 'Operazioni', labelEn: 'Operations', items: ['today', 'upcoming', 'calendar'] },
  { key: 'bookings', labelIt: 'Prenotazioni', labelEn: 'Bookings', items: ['requests', 'bookingCodes', 'giftCards', 'availability', 'notifications'] },
  { key: 'website', labelIt: 'Gestione sito', labelEn: 'Website management', items: ['edit', 'publicSite'] },
  { key: 'business', labelIt: 'Business', labelEn: 'Business', items: ['partnerships', 'finance', 'analytics'] },
  { key: 'system', labelIt: 'Sistema', labelEn: 'System', items: ['backup', 'users'] }
];

function adminNavLabel(section, lang) {
  return lang === 'it' ? section.labelIt : section.labelEn;
}

function isAdminNavSectionActive(normalizedPath, section) {
  if (!section || section.external) return false;
  if (section.key === 'analytics') return normalizedPath.includes('/analytics') || normalizedPath.includes('/data');
  if (section.key === 'bookingCodes') return normalizedPath.includes('/booking-codes');
  if (section.key === 'giftCards') return normalizedPath.includes('/gift-cards');
  if (section.key === 'backup') return normalizedPath.includes('/system') || normalizedPath.includes('/backup');
  if (section.key === 'users') return normalizedPath.includes('/users');
  if (section.key === 'edit') return normalizedPath.includes('/edit') || normalizedPath.includes('/website') || normalizedPath.includes('/content') || normalizedPath.includes('/media');
  if (section.key === 'partnerships') return normalizedPath.includes('/partnerships');
  return normalizedPath.includes(`/${section.key}`);
}

function adminPathFromLocation(pathname) {
  const normalizedPath = pathname === '/admin' ? '/admin/requests' : pathname;
  return ADMIN_NAV_SECTIONS.find((section) => !section.external && isAdminNavSectionActive(normalizedPath, section))?.path || '/admin/requests';
}

function visibleAdminNavSections(profile) {
  const isOwner = profile?.role === 'owner' && profile?.active !== false;
  return ADMIN_NAV_SECTIONS.filter((section) => !section.ownerOnly || isOwner);
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

function buildMediaMap(items = []) {
  return (items || []).reduce((acc, item) => {
    if (item?.media_key && (item?.file_url || item?.active === false)) acc[item.media_key] = item;
    return acc;
  }, {});
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

function partnershipCategoryLabelsForKey(key) {
  const option = partnershipCategoryOption(key);
  return { category_key: option.key, category_it: option.it, category_en: option.en };
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

function readInitialPublicLanguage() {
  if (typeof window === 'undefined') return 'it';
  try {
    const queryLang = new URLSearchParams(window.location.search).get('lang');
    if (queryLang === 'en' || queryLang === 'it') return queryLang;
    const stored = window.localStorage.getItem('vulcaniq_public_language');
    if (stored === 'en' || stored === 'it') return stored;
  } catch {}
  return 'it';
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

function socialLinksToJson(links = []) {
  return JSON.stringify((links || []).map((link, index) => normalizeSocialLink({ ...link, order: link.order || index + 1 }, index)), null, 2);
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

function validDateFromValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLocalDateTime(value, lang, fallback = '') {
  const date = validDateFromValue(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
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

function partyTypeLabel(value, lang) {
  const labels = {
    solo: { it: 'Singolo', en: 'Solo traveler' },
    couple: { it: 'Coppia', en: 'Couple' },
    family: { it: 'Famiglia', en: 'Family' },
    group: { it: 'Gruppo', en: 'Group' },
    company: { it: 'Azienda', en: 'Company' },
    school: { it: 'Scuola', en: 'School' },
    other: { it: 'Altro', en: 'Other' }
  };
  return labels[value]?.[lang] || labels.solo[lang];
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

const publicPages = ['home', 'experiences', 'partnerships', 'about', 'reviews', 'social', 'latestNews', 'contact'];
function Header({ lang, setLang, activePage, setActivePage, siteMedia, editor }) {
  const [open, setOpen] = useState(false);
  const switchLanguage = () => setLang(lang === 'it' ? 'en' : 'it');
  const languageAria = lang === 'it' ? 'Switch to English' : "Passa all'italiano";

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
          <button type="button" className={activePage === 'install' ? 'active' : ''} onClick={() => choose('install')}>{lang === 'it' ? 'Installazione e notifiche' : 'Install & Notifications'}</button>
          <button className="language-toggle desktop-language-toggle" type="button" onClick={switchLanguage} aria-label={languageAria}>{i18n[lang].switchLabel}</button>
        </nav>
        <button className="mobile-language-switch" type="button" onClick={switchLanguage} aria-label={languageAria}>{i18n[lang].switchLabel}</button>
      </div>
    </header>
  );
}

const FIND_EXPERIENCE_INTERESTS = [
  { value: 'lava-activity', it: 'Lava / attività', en: 'Lava / activity', experienceId: 'etna-live' },
  { value: 'geology', it: 'Geologia', en: 'Geology', experienceId: 'etna-learning' },
  { value: 'local-culture', it: 'Cultura locale', en: 'Local culture', experienceId: 'etna-stories' },
  { value: 'photography', it: 'Fotografia', en: 'Photography', experienceId: 'etna-live' },
  { value: 'premium', it: 'Premium', en: 'Premium', experienceId: 'etna-premium' }
];

const FIND_EXPERIENCE_GROUPS = [
  { value: 'solo-couple', it: 'Singolo / coppia', en: 'Solo / couple' },
  { value: 'family', it: 'Famiglia', en: 'Family' },
  { value: 'group', it: 'Gruppo', en: 'Group' },
  { value: 'school-company', it: 'Scuola / azienda', en: 'School / company' }
];

function recommendationFromFindAnswers(interest, group) {
  const selected = FIND_EXPERIENCE_INTERESTS.find((item) => item.value === interest) || FIND_EXPERIENCE_INTERESTS[0];
  if (group === 'school-company' && interest !== 'premium') return experienceById('etna-learning');
  if (group === 'family' && interest === 'lava-activity') return experienceById('etna-learning');
  return experienceById(selected.experienceId);
}

function FindExperienceModal({ lang, onClose, onRequestExperience }) {
  const [step, setStep] = useState(0);
  const [interest, setInterest] = useState('');
  const [group, setGroup] = useState('');
  const modalRef = useRef(null);
  useBodyScrollLock(true);

  useEffect(() => {
    trackEvent('find_experience_started', { language: lang }, { dedupe: false });
    const timer = window.setTimeout(() => modalRef.current?.querySelector('button')?.focus?.(), 0);
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lang, onClose]);

  const selectedExperience = recommendationFromFindAnswers(interest, group);
  const selectedInterest = FIND_EXPERIENCE_INTERESTS.find((item) => item.value === interest);
  const selectedGroup = FIND_EXPERIENCE_GROUPS.find((item) => item.value === group);

  function selectInterest(value) {
    setInterest(value);
    trackEvent('find_experience_interest_selected', { interest: value, language: lang }, { dedupe: false });
  }

  function selectGroup(value) {
    setGroup(value);
    trackEvent('find_experience_group_selected', { group: value, language: lang }, { dedupe: false });
  }

  function goNext() {
    if (step === 0 && !interest) return;
    if (step === 1 && !group) return;
    if (step >= 1) {
      trackEvent('find_experience_completed', { recommended_experience_id: selectedExperience.id, interest, group, language: lang }, { dedupe: false });
    }
    setStep((current) => Math.min(current + 1, 2));
  }

  function requestExperience() {
    onRequestExperience?.(selectedExperience, {
      interest: selectedInterest?.[lang === 'en' ? 'en' : 'it'] || interest,
      group: selectedGroup?.[lang === 'en' ? 'en' : 'it'] || group
    });
  }

  return createPortal((
    <div className="find-experience-backdrop motion-backdrop" role="presentation" onClick={onClose}>
      <section className="find-experience-modal motion-panel" role="dialog" aria-modal="true" aria-labelledby="findExperienceTitle" ref={modalRef} onClick={(event) => event.stopPropagation()}>
        <header className="find-experience-header">
          <div>
            <h2 id="findExperienceTitle">{text(lang, 'findExperience')}</h2>
            <p>{text(lang, 'findExperienceModalIntro')}</p>
          </div>
          <button className="date-modal-close" type="button" onClick={onClose} aria-label={text(lang, 'close')}>{text(lang, 'close')}</button>
        </header>
        <main className="find-experience-body">
          {step === 0 && (
            <section className="find-experience-step" aria-live="polite">
              <h3>{text(lang, 'findExperienceInterestQuestion')}</h3>
              <div className="find-experience-choice-grid">
                {FIND_EXPERIENCE_INTERESTS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`find-experience-choice ${interest === option.value ? 'active' : ''}`}
                    onClick={() => selectInterest(option.value)}
                    aria-pressed={interest === option.value}
                  >
                    {option[lang === 'en' ? 'en' : 'it']}
                  </button>
                ))}
              </div>
            </section>
          )}
          {step === 1 && (
            <section className="find-experience-step" aria-live="polite">
              <h3>{text(lang, 'findExperienceGroupQuestion')}</h3>
              <div className="find-experience-choice-grid compact">
                {FIND_EXPERIENCE_GROUPS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`find-experience-choice ${group === option.value ? 'active' : ''}`}
                    onClick={() => selectGroup(option.value)}
                    aria-pressed={group === option.value}
                  >
                    {option[lang === 'en' ? 'en' : 'it']}
                  </button>
                ))}
              </div>
            </section>
          )}
          {step === 2 && (
            <section className="find-experience-result" aria-live="polite">
              <span className="kicker">{text(lang, 'findExperienceResultTitle')}</span>
              <h3>{selectedExperience.title}</h3>
              <p>{selectedExperience.summary[lang === 'en' ? 'en' : 'it']}</p>
              <dl>
                <div><dt>{text(lang, 'interest')}</dt><dd>{selectedInterest?.[lang === 'en' ? 'en' : 'it'] || '-'}</dd></div>
                <div><dt>{text(lang, 'travelingWith')}</dt><dd>{selectedGroup?.[lang === 'en' ? 'en' : 'it'] || '-'}</dd></div>
              </dl>
              <button className="button primary" type="button" onClick={requestExperience}>{text(lang, 'requestThis')}</button>
            </section>
          )}
        </main>
        <footer className="find-experience-footer">
          <button className="button secondary" type="button" onClick={() => step === 0 ? onClose() : setStep((current) => Math.max(current - 1, 0))}>{text(lang, 'back')}</button>
          {step < 2 && <button className="button primary" type="button" onClick={goNext} disabled={(step === 0 && !interest) || (step === 1 && !group)}>{text(lang, 'next')}</button>}
        </footer>
      </section>
    </div>
  ), document.body);
}

function bookingCodeErrorMessage(error, lang) {
  const raw = String(error?.code || error?.message || '');
  const code = raw.toUpperCase();
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
  const [code, setCode] = useState('');
  const [state, setState] = useState({ loading: false, error: '', success: null });
  const inputRef = useRef(null);
  const redemptionJourneyRef = useRef(`booking_code_journey_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  useBodyScrollLock(true);

  useEffect(() => {
    trackEvent('book_with_code_clicked', { language: lang, source: 'booking_code', source_section: 'hero', source_cta: 'book_with_code', cta_location: 'hero' }, { dedupe: false });
    const timer = window.setTimeout(() => inputRef.current?.focus?.(), 0);
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lang, onClose]);

  async function submit(event) {
    event.preventDefault();
    if (state.loading) return;
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
      const result = await redeemBookingCode(code, { language: lang });
      const successMetadata = {
        language: lang,
        source: 'booking_code',
        journey_id: redemptionJourneyRef.current,
        source_section: 'booking_code_redemption',
        source_cta: 'booking_code_confirm',
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
    } catch (error) {
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
    }
  }

  const success = state.success;
  const successExperience = success ? (lang === 'en' ? success.experience_name_en || success.experience_name_it : success.experience_name_it || success.experience_name_en) : '';
  const supportMessage = lang === 'en'
    ? 'Hi Leonardo, I need help with a vulcanIQ booking code.'
    : 'Ciao Leonardo, ho bisogno di aiuto con un codice prenotazione vulcanIQ.';

  return createPortal((
    <div className="booking-code-backdrop motion-backdrop" role="presentation" onClick={onClose}>
      <section className={`booking-code-modal motion-panel ${success ? 'has-booking-code-success' : ''}`.trim()} role="dialog" aria-modal="true" aria-labelledby="bookingCodeTitle" onClick={(event) => event.stopPropagation()}>
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
            <button className="button primary booking-code-submit" type="submit" disabled={state.loading}>{state.loading ? (lang === 'it' ? 'Verifica...' : 'Checking...') : text(lang, 'confirmBookingCode')}</button>
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


function GiftCardPage({ lang, siteContent, onClose }) {
  const contact = resolvePublicContactDetails(siteContent);
  const journeyRef = useRef(null);
  const abandonedRef = useRef(false);
  const modalRef = useRef(null);
  useBodyScrollLock(true);
  const [started, setStarted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState({
    buyer_name: '',
    buyer_email: '',
    buyer_phone: '',
    recipient_name: '',
    experience_type: 'Etna Premium',
    budget: '',
    currency: 'EUR',
    preferred_delivery_date: '',
    message: ''
  });
  const [state, setState] = useState({ loading: false, error: '', success: '' });

  const todayMinDate = todayIso();

  function sanitizeGiftCardPhone(value) {
    return String(value || '').replace(/[^\d+\s().-]/g, '');
  }

  function isValidGiftCardEmail(value) {
    const clean = String(value || '').trim();
    if (!clean) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
  }

  function isValidGiftCardPhone(value) {
    const clean = String(value || '').trim();
    if (!clean) return true;
    return clean.replace(/\D/g, '').length >= 7;
  }

  function isPastGiftCardDate(value) {
    const clean = String(value || '').trim();
    return Boolean(clean && clean < todayMinDate);
  }

  const sourceMetadata = { language: lang, source_section: 'gift_card_page', source_cta: 'gift_card_form', form_type: 'gift_card_request' };
  const stepDefinitions = [
    { key: 'buyer', title: lang === 'it' ? 'Chi acquista la Gift Card?' : 'Who is buying the Gift Card?' },
    { key: 'recipient', title: lang === 'it' ? 'A chi vuoi regalarla?' : 'Who is it for?' },
    { key: 'experience', title: lang === 'it' ? 'Che esperienza ti interessa?' : 'Which experience are you interested in?' },
    { key: 'budget', title: lang === 'it' ? 'Hai un budget indicativo?' : 'Do you have an indicative budget?' },
    { key: 'delivery', title: lang === 'it' ? 'Quando vorresti consegnarla?' : 'When would you like to deliver it?' },
    { key: 'message', title: lang === 'it' ? 'Vuoi aggiungere un messaggio?' : 'Would you like to add a message?' },
    { key: 'review', title: lang === 'it' ? 'Controlla e invia' : 'Review and send' }
  ];
  const currentStep = stepDefinitions[stepIndex] || stepDefinitions[0];
  const progressText = lang === 'it'
    ? `Passaggio ${stepIndex + 1} di ${stepDefinitions.length}`
    : `Step ${stepIndex + 1} of ${stepDefinitions.length}`;
  const progressPercent = Math.round(((stepIndex + 1) / stepDefinitions.length) * 100);
  const hasEnteredData = Boolean(
    String(form.buyer_name || '').trim() ||
    String(form.buyer_email || '').trim() ||
    String(form.buyer_phone || '').trim() ||
    String(form.recipient_name || '').trim() ||
    String(form.budget || '').trim() ||
    String(form.preferred_delivery_date || '').trim() ||
    String(form.message || '').trim()
  );

  useEffect(() => {
    journeyRef.current = createFormJourney('gift_card_request', sourceMetadata);
    trackEvent('gift_card_view', { ...sourceMetadata, journey_id: journeyRef.current?.journey_id || '' }, { dedupe: false });
  }, [lang]);

  useEffect(() => {
    const timer = window.setTimeout(() => modalRef.current?.focus?.(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') attemptClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  useEffect(() => {
    function handlePageHide() {
      abandonOnce({ transport: 'pagehide' });
    }
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [lang, form.budget, form.experience_type, form.preferred_delivery_date, hasEnteredData]);

  function abandonOnce(extra = {}) {
    if (abandonedRef.current || !hasEnteredData) return;
    abandonedRef.current = true;
    markFormAbandoned(journeyRef.current?.journey_id, {
      ...sourceMetadata,
      ...extra,
      step_index: started ? stepIndex + 1 : 0,
      step_key: started ? currentStep.key : 'intro',
      has_selected_experience: Boolean(form.experience_type),
      has_selected_date: Boolean(form.preferred_delivery_date),
      has_budget: Boolean(String(form.budget || '').trim())
    });
  }

  function attemptClose() {
    if (hasEnteredData) {
      const confirmed = window.confirm(lang === 'it'
        ? 'Vuoi chiudere la richiesta Gift Card? I dati inseriti potrebbero andare persi.'
        : 'Close the Gift Card request? The details entered may be lost.');
      if (!confirmed) return;
    }
    abandonOnce({ close_action: 'manual_close' });
    if (typeof onClose === 'function') onClose();
  }

  function startQuestionnaire() {
    setStarted(true);
    setState({ loading: false, error: '', success: '' });
    trackEvent('gift_card_questionnaire_started', { ...sourceMetadata, journey_id: journeyRef.current?.journey_id || '', step_index: 1, step_key: 'buyer' }, { dedupe: false });
  }

  function update(field, value) {
    const nextValue = field === 'buyer_phone' ? sanitizeGiftCardPhone(value) : value;
    setState((current) => ({ ...current, error: '' }));
    setForm((current) => ({ ...current, [field]: nextValue }));
    markFormFieldStarted(journeyRef.current?.journey_id, field, {
      ...sourceMetadata,
      step_index: started ? stepIndex + 1 : 0,
      step_key: field
    });
    markFormActivity(journeyRef.current?.journey_id, {
      has_selected_experience: field === 'experience_type' ? Boolean(nextValue) : Boolean(form.experience_type),
      has_selected_date: field === 'preferred_delivery_date' ? Boolean(nextValue) : Boolean(form.preferred_delivery_date),
      has_budget: field === 'budget' ? Boolean(nextValue) : Boolean(form.budget)
    });
  }

  function validateStep(index = stepIndex) {
    const key = stepDefinitions[index]?.key;
    if (key === 'buyer') {
      const hasContact = String(form.buyer_email || '').trim() || String(form.buyer_phone || '').trim();
      if (!String(form.buyer_name || '').trim()) return lang === 'it' ? 'Inserisci il nome di chi acquista.' : 'Enter the buyer name.';
      if (!hasContact) return lang === 'it' ? 'Inserisci almeno email o telefono/WhatsApp.' : 'Enter at least an email or phone/WhatsApp.';
      if (!isValidGiftCardEmail(form.buyer_email)) return lang === 'it' ? 'Inserisci un indirizzo email valido.' : 'Enter a valid email address.';
      if (!isValidGiftCardPhone(form.buyer_phone)) return lang === 'it' ? 'Inserisci un numero WhatsApp / telefono valido.' : 'Enter a valid WhatsApp / phone number.';
    }
    if (key === 'recipient' && !String(form.recipient_name || '').trim()) {
      return lang === 'it' ? 'Inserisci il nome del destinatario.' : 'Enter the recipient name.';
    }
    if (key === 'experience' && !String(form.experience_type || '').trim()) {
      return lang === 'it' ? 'Seleziona un interesse o esperienza.' : 'Select an experience or interest.';
    }
    if (key === 'budget' && String(form.budget || '').trim() && parseMoneyAmount(form.budget) <= 0) {
      return lang === 'it' ? 'Inserisci un budget valido oppure lascia il campo vuoto.' : 'Enter a valid budget or leave the field empty.';
    }
    if (key === 'delivery' && isPastGiftCardDate(form.preferred_delivery_date)) {
      return lang === 'it' ? 'Seleziona una data di oggi o futura.' : 'Select today or a future date.';
    }
    return '';
  }

  function validateAll() {
    for (let index = 0; index < stepDefinitions.length - 1; index += 1) {
      const error = validateStep(index);
      if (error) return error;
    }
    return '';
  }

  function goNext() {
    const error = validateStep();
    if (error) {
      setState({ loading: false, error, success: '' });
      return;
    }
    trackEvent('gift_card_questionnaire_step_completed', {
      ...sourceMetadata,
      journey_id: journeyRef.current?.journey_id || '',
      step_index: stepIndex + 1,
      step_key: currentStep.key,
      has_budget: Boolean(String(form.budget || '').trim()),
      has_preferred_delivery_date: Boolean(form.preferred_delivery_date)
    }, { dedupe: false });
    setStepIndex((current) => Math.min(current + 1, stepDefinitions.length - 1));
  }

  function goBack() {
    setState((current) => ({ ...current, error: '' }));
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  function budgetLabel() {
    return String(form.budget || '').trim()
      ? formatMoney(parseMoneyAmount(form.budget), form.currency || 'EUR', lang)
      : (lang === 'it' ? 'Da definire' : 'To define');
  }

  function buildGiftCardMessage() {
    const budget = budgetLabel();
    return lang === 'it'
      ? `Ciao Leonardo,\n\nvorrei informazioni per regalare una Gift Card vulcanIQ.\n\nNome: ${form.buyer_name || '-'}\nContatto: ${form.buyer_phone || form.buyer_email || '-'}\nGift Card per: ${form.recipient_name || '-'}\nEsperienza/interesse: ${form.experience_type || '-'}\nBudget indicativo: ${budget}\nData consegna preferita: ${form.preferred_delivery_date || '-'}\n\n${form.message || ''}\n\nGrazie!`
      : `Hi Leonardo,\n\nI would like information about gifting a vulcanIQ Gift Card.\n\nName: ${form.buyer_name || '-'}\nContact: ${form.buyer_phone || form.buyer_email || '-'}\nGift Card for: ${form.recipient_name || '-'}\nExperience/interest: ${form.experience_type || '-'}\nIndicative budget: ${budget}\nPreferred delivery date: ${form.preferred_delivery_date || '-'}\n\n${form.message || ''}\n\nThank you!`;
  }

  async function submitWebsiteRequest() {
    const error = validateAll();
    if (error) {
      setState({ loading: false, error, success: '' });
      return;
    }
    setState({ loading: true, error: '', success: '' });
    try {
      const identity = getAnalyticsIdentitySnapshot('gift_card_page');
      const created = await createGiftCardRequest({
        ...form,
        ...identity,
        buyer_preferred_language: lang,
        language: lang,
        currency: form.currency || 'EUR',
        analytics_journey_id: journeyRef.current?.journey_id,
        form_started_at: journeyRef.current?.opened_at,
        submission_idempotency_key: journeyRef.current?.journey_id,
        submission_fingerprint: journeyRef.current?.journey_id,
        website: ''
      });
      trackEvent('gift_card_request_created', {
        gift_card_request_id: created?.id || '',
        journey_id: journeyRef.current?.journey_id || '',
        form_type: 'gift_card_request',
        language: lang,
        source_section: 'gift_card_page',
        source_cta: 'website_submit',
        has_budget: Boolean(String(form.budget || '').trim()),
        has_preferred_delivery_date: Boolean(form.preferred_delivery_date)
      }, { dedupe: false });
      markFormSubmitted(journeyRef.current?.journey_id, {
        ...sourceMetadata,
        channel: 'website',
        step_index: stepDefinitions.length,
        step_key: 'review',
        has_selected_experience: Boolean(form.experience_type),
        has_selected_date: Boolean(form.preferred_delivery_date),
        has_budget: Boolean(String(form.budget || '').trim())
      });
      setState({ loading: false, error: '', success: lang === 'it' ? 'Richiesta Gift Card inviata. Ti contatteremo manualmente per conferma e pagamento esterno.' : 'Gift Card request sent. We will contact you manually for confirmation and external payment.' });
      setForm({ buyer_name: '', buyer_email: '', buyer_phone: '', recipient_name: '', experience_type: 'Etna Premium', budget: '', currency: 'EUR', preferred_delivery_date: '', message: '' });
      setStarted(false);
      setStepIndex(0);
      abandonedRef.current = false;
      journeyRef.current = createFormJourney('gift_card_request', sourceMetadata);
    } catch (error) {
      setState({ loading: false, error: lang === 'it' ? 'Richiesta non inviata. Puoi usare WhatsApp.' : 'Request not sent. You can use WhatsApp.', success: '' });
    }
  }

  function handleWhatsappClick(event) {
    const error = validateAll();
    if (error) {
      event.preventDefault();
      setState({ loading: false, error, success: '' });
      return;
    }
    abandonOnce({ recovery_channel: 'whatsapp' });
    markFormRecoveredViaWhatsApp(journeyRef.current?.journey_id, {
      ...sourceMetadata,
      step_index: stepDefinitions.length,
      step_key: 'review',
      has_selected_experience: Boolean(form.experience_type),
      has_selected_date: Boolean(form.preferred_delivery_date),
      has_budget: Boolean(String(form.budget || '').trim())
    });
    trackEvent('gift_card_whatsapp_request_clicked', {
      journey_id: journeyRef.current?.journey_id || '',
      form_type: 'gift_card_request',
      language: lang,
      source_section: 'gift_card_page',
      source_cta: 'whatsapp_submit',
      has_budget: Boolean(String(form.budget || '').trim()),
      has_preferred_delivery_date: Boolean(form.preferred_delivery_date)
    }, { dedupe: false });
    trackEvent('gift_card_request_click', { language: lang, source_section: 'gift_card_page', source_cta: 'whatsapp' }, { dedupe: false });
  }

  const whatsappUrl = `https://wa.me/${contact.phoneWa}?text=${encode(buildGiftCardMessage())}`;

  function renderReviewDetails() {
    return (
      <div className="gift-card-review-card">
        <dl>
          <div><dt>{lang === 'it' ? 'Nome' : 'Name'}</dt><dd>{form.buyer_name || '-'}</dd></div>
          <div><dt>{lang === 'it' ? 'Contatto' : 'Contact'}</dt><dd>{form.buyer_phone || form.buyer_email || '-'}</dd></div>
          <div><dt>{lang === 'it' ? 'Destinatario' : 'Recipient'}</dt><dd>{form.recipient_name || '-'}</dd></div>
          <div><dt>{lang === 'it' ? 'Esperienza' : 'Experience'}</dt><dd>{form.experience_type || '-'}</dd></div>
          <div><dt>{lang === 'it' ? 'Budget' : 'Budget'}</dt><dd>{budgetLabel()}</dd></div>
          <div><dt>{lang === 'it' ? 'Consegna' : 'Delivery'}</dt><dd>{form.preferred_delivery_date || '-'}</dd></div>
        </dl>
        {form.message && <p className="small-note"><strong>{lang === 'it' ? 'Messaggio' : 'Message'}:</strong> {form.message}</p>}
      </div>
    );
  }

  function renderQuestion() {
    switch (currentStep.key) {
      case 'buyer':
        return (
          <div className="admin-form-grid gift-card-step-grid">
            <label className="admin-field full"><span>{lang === 'it' ? 'Nome di chi acquista' : 'Buyer name'}</span><input value={form.buyer_name} onChange={(event) => update('buyer_name', event.target.value)} autoComplete="name" /></label>
            <label className="admin-field"><span>Email</span><input type="email" inputMode="email" value={form.buyer_email} onChange={(event) => update('buyer_email', event.target.value)} autoComplete="email" /></label>
            <label className="admin-field"><span>WhatsApp / Phone</span><input type="tel" inputMode="tel" value={form.buyer_phone} onChange={(event) => update('buyer_phone', event.target.value)} autoComplete="tel" pattern="[0-9+\s().-]*" /></label>
          </div>
        );
      case 'recipient':
        return <label className="admin-field full"><span>{lang === 'it' ? 'Nome destinatario' : 'Recipient name'}</span><input value={form.recipient_name} onChange={(event) => update('recipient_name', event.target.value)} /></label>;
      case 'experience':
        return (
          <label className="admin-field full"><span>{lang === 'it' ? 'Esperienza/interesse' : 'Experience/interest'}</span>
            <select value={form.experience_type} onChange={(event) => update('experience_type', event.target.value)}>
              {experiences.map((item) => <option key={item.id} value={item.title}>{item.title}</option>)}
              <option value={lang === 'it' ? 'Non so ancora' : 'Not sure yet'}>{lang === 'it' ? 'Non so ancora' : 'Not sure yet'}</option>
            </select>
          </label>
        );
      case 'budget':
        return (
          <div className="admin-form-grid gift-card-step-grid">
            <label className="admin-field"><span>{lang === 'it' ? 'Budget indicativo' : 'Indicative budget'}</span><input inputMode="decimal" value={form.budget} onChange={(event) => update('budget', event.target.value)} placeholder="150" /></label>
            <label className="admin-field"><span>{lang === 'it' ? 'Valuta' : 'Currency'}</span><select value={form.currency} onChange={(event) => update('currency', event.target.value)}><option value="EUR">EUR</option><option value="CHF">CHF</option><option value="USD">USD</option><option value="GBP">GBP</option></select></label>
          </div>
        );
      case 'delivery':
        return <label className="admin-field full"><span>{lang === 'it' ? 'Data consegna preferita' : 'Preferred delivery date'}</span><input type="date" min={todayMinDate} value={form.preferred_delivery_date} onChange={(event) => update('preferred_delivery_date', event.target.value)} /></label>;
      case 'message':
        return <label className="admin-field full"><span>{lang === 'it' ? 'Messaggio opzionale' : 'Optional message'}</span><textarea rows={6} value={form.message} onChange={(event) => update('message', event.target.value)} /></label>;
      case 'review':
      default:
        return renderReviewDetails();
    }
  }

  return createPortal((
    <div className="gift-card-flow-backdrop motion-backdrop" role="presentation" onClick={attemptClose}>
      <section className="gift-card-flow-modal motion-panel" role="dialog" aria-modal="true" aria-labelledby="giftCardFlowTitle" ref={modalRef} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <header className="gift-card-flow-header">
          <div>
            <span className="kicker">Gift Card</span>
            <h1 id="giftCardFlowTitle">{lang === 'it' ? 'Regala un’esperienza sull’Etna' : 'Gift a Mount Etna experience'}</h1>
          </div>
          <button className="modal-close-button" type="button" onClick={attemptClose}>{text(lang, 'close')}</button>
        </header>

        {!started ? (
          <main className="gift-card-intro-screen">
            <div className="gift-card-intro-grid">
              <article className="info-card">
                <h2>{lang === 'it' ? 'Come funziona' : 'How it works'}</h2>
                <p>{lang === 'it' ? 'Invia i dettagli, ricevi una conferma manuale e paga esternamente solo dopo essere stato contattato dal team.' : 'Send the details, receive manual confirmation and pay externally only after the team contacts you.'}</p>
              </article>
              <article className="info-card">
                <h2>{lang === 'it' ? 'Ideale per' : 'Best for'}</h2>
                <p>{lang === 'it' ? 'Coppie, famiglie, compleanni, anniversari, lauree e regali aziendali.' : 'Couples, families, birthdays, anniversaries, graduations and company gifts.'}</p>
              </article>
            </div>
            {state.success && <p className="form-status success" role="status">{state.success}</p>}
            <div className="modal-actions gift-card-intro-actions">
              <button className="button primary" type="button" onClick={startQuestionnaire}>{lang === 'it' ? 'Inizia il questionario' : 'Start the questionnaire'}</button>
            </div>
          </main>
        ) : (
          <main className="gift-card-questionnaire-screen">
            <div className="questionnaire-progress gift-card-progress" aria-label={progressText} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progressPercent}>
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="gift-card-progress-label">{progressText}</p>
            <section className={`gift-card-question-card ${currentStep.key === 'review' ? 'review-step' : ''}`.trim()} aria-live="polite">
              <h2>{currentStep.title}</h2>
              {renderQuestion()}
              {state.error && <p className="form-status error" role="alert">{state.error}</p>}
              {state.success && <p className="form-status success" role="status">{state.success}</p>}
            </section>
            <footer className={`gift-card-flow-footer ${currentStep.key === 'review' ? 'review-step' : ''}`.trim()}>
              {currentStep.key !== 'review' ? (
                <>
                  <button className="button secondary" type="button" onClick={goBack} disabled={stepIndex === 0 || state.loading}>{lang === 'it' ? 'Indietro' : 'Back'}</button>
                  <button className="button primary" type="button" onClick={goNext} disabled={state.loading}>{lang === 'it' ? 'Avanti' : 'Next'}</button>
                </>
              ) : (
                <div className="gift-card-review-actions-stack">
                  <button className="button secondary" type="button" onClick={goBack} disabled={stepIndex === 0 || state.loading}>{lang === 'it' ? 'Indietro' : 'Back'}</button>
                  <button className="button primary" type="button" onClick={submitWebsiteRequest} disabled={state.loading}>{state.loading ? (lang === 'it' ? 'Invio...' : 'Sending...') : (lang === 'it' ? 'Invia richiesta Gift Card dal sito' : 'Send Gift Card request via website')}</button>
                  <a className="button secondary gift-card-whatsapp-action" href={whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={handleWhatsappClick}>{lang === 'it' ? 'Invia richiesta Gift Card via WhatsApp' : 'Send Gift Card request via WhatsApp'}</a>
                </div>
              )}
            </footer>
          </main>
        )}
      </section>
    </div>
  ), document.body);
}

function FastRequestModal({ lang, siteContent, onClose, sourceSection = 'sticky_mobile_bar', sourceCta = 'fast_request', ctaLocation = 'sticky_contact_bar', flowType = 'fast_request' }) {
  const contact = resolvePublicContactDetails(siteContent);
  useBodyScrollLock(true);
  const sourceMetadata = { language: lang, source_section: sourceSection, source_cta: sourceCta, cta_location: ctaLocation, flow_type: flowType };
  const formJourneyRef = useRef(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
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
          heardAboutUsDetail: cleanHeardAboutUsDetail(stored.heardAboutUsDetail)
        };
      }
    } catch {}
    return { experienceId: 'etna-premium', dateMode: 'flexible', customDate: '', adults: '2', children: '0', heardAboutUs: '', heardAboutUsDetail: '' };
  });

  useEffect(() => {
    formJourneyRef.current = createFormJourney('fast_request', { ...sourceMetadata, has_selected_experience: true, has_people_count: true, has_attribution: false });
    trackEvent('fast_request_start', { ...sourceMetadata, journey_id: formJourneyRef.current?.journey_id || '', form_type: 'fast_request' }, { dedupe: false });
    return () => {
      try {
        window.localStorage.setItem('vulcaniq_fast_request', JSON.stringify({ ...form, expires_at: Date.now() + 24 * 60 * 60 * 1000 }));
      } catch {}
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

  function completeStep(nextStep) {
    if (step === 4 && nextStep === 5 && !validateAttributionStep()) return;
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
      setStep(4);
      return;
    }
    const attributionMetadata = heardAboutUsMetadata(form.heardAboutUs, lang, form.heardAboutUsDetail);
    markFormRecoveredViaWhatsApp(formJourneyRef.current?.journey_id, { ...sourceMetadata, has_selected_experience: Boolean(form.experienceId), has_selected_date: Boolean(form.customDate || form.dateMode === 'flexible'), has_people_count: true, has_attribution: true, ...attributionMetadata });
    markFormSubmitted(formJourneyRef.current?.journey_id, { ...sourceMetadata, channel: 'whatsapp', has_selected_experience: Boolean(form.experienceId), has_selected_date: Boolean(form.customDate || form.dateMode === 'flexible'), has_people_count: true, has_attribution: true, ...attributionMetadata });
    trackEvent('fast_request_whatsapp_click', { ...sourceMetadata, journey_id: formJourneyRef.current?.journey_id || '', form_type: 'fast_request', experience_id: form.experienceId, date_mode: form.dateMode, ...attributionMetadata }, { dedupe: false });
    trackEvent('fast_request_submit_success', { ...sourceMetadata, journey_id: formJourneyRef.current?.journey_id || '', form_type: 'fast_request', experience_id: form.experienceId, channel: 'whatsapp', ...attributionMetadata }, { dedupe: false });
    try { window.localStorage.removeItem('vulcaniq_fast_request'); } catch {}
  }

  return createPortal((
    <div className="modal-backdrop fast-request-backdrop" role="dialog" aria-modal="true" aria-labelledby="fastRequestTitle">
      <section className="admin-modal fast-request-modal">
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
          <div className="admin-form-grid fast-request-attribution-step">
            <label className="admin-field full" htmlFor="fastRequestHeardAboutUs"><span>{text(lang, 'heardAboutUs')}</span><ContactAttributionSelect id="fastRequestHeardAboutUs" lang={lang} value={form.heardAboutUs || ''} onChange={(value) => update('heardAboutUs', value)} /></label>
            {needsHeardAboutUsDetail(form.heardAboutUs) && <label className="admin-field full" htmlFor="fastRequestHeardAboutUsDetail"><span>{text(lang, 'heardAboutUsOtherLabel')}</span><textarea id="fastRequestHeardAboutUsDetail" className="fast-request-attribution-detail" value={form.heardAboutUsDetail || ''} onChange={(event) => update('heardAboutUsDetail', event.target.value)} placeholder={text(lang, 'heardAboutUsOtherPlaceholder')} rows={3} maxLength={240} /></label>}
            {error && <p className="form-status error full" role="alert">{error}</p>}
            <div className="modal-actions full fast-request-actions"><button className="button secondary" type="button" onClick={() => setStep(3)}>{lang === 'it' ? 'Indietro' : 'Back'}</button><button className="button primary" type="button" onClick={() => completeStep(5)}>{lang === 'it' ? 'Rivedi messaggio' : 'Review message'}</button><button className="button secondary fast-request-inline-close" type="button" onClick={handleClose}>{text(lang, 'close')}</button></div>
          </div>
        )}
        {step === 5 && (
          <div className="fast-request-review">
            <textarea readOnly value={message} rows={10} />
            <div className="modal-actions fast-request-actions"><button className="button secondary" type="button" onClick={() => setStep(4)}>{lang === 'it' ? 'Modifica' : 'Edit'}</button><a className="button primary" href={whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={handleWhatsApp}>WhatsApp</a><button className="button secondary fast-request-inline-close" type="button" onClick={handleClose}>{text(lang, 'close')}</button></div>
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
      })
      .catch(() => {
        if (!active) return;
        setItems([]);
        setLeaflets([]);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

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

      {dateModalTransition.shouldRender && (
        <div className={`date-modal-overlay motion-backdrop ${dateModalTransition.isClosing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="date-modal-title" onClick={() => setDateModalOpen(false)}>
          <article className="date-modal motion-panel" onClick={(event) => event.stopPropagation()}>
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
          <article className="experience-modal motion-panel" onClick={(event) => event.stopPropagation()}>
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
          <article className="leaflet-fullscreen-modal motion-panel" onClick={(event) => event.stopPropagation()}>
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
      })
      .catch(() => { if (active) setItems([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const days = useMemo(() => getCalendarDays(monthDate), [monthDate]);
  const byDate = useMemo(() => getItemsByDate(items), [items]);
  const selectedItems = byDate[selectedDate] || [];

  function requestItem(item) {
    const trackingContext = withBookingJourneyId(buildBookingTrackingContext({
      experienceId: item?.experience_id || '',
      requestType: 'fixed',
      sourceSection: 'today',
      sourceCta: 'fixed_excursion',
      ctaLocation: 'today_section',
      selectedDate: item?.date || '',
      hasFixedExcursion: true,
      language: lang
    }));
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
    const description = fixedExcursionProgram(item, lang) || item[`note_${lang}`] || item.note_it || item.note_en || '';
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
                  const trackingContext = withBookingJourneyId(buildBookingTrackingContext({ requestType: 'private', sourceSection: 'today', sourceCta: 'prepare_request', ctaLocation: 'today_section', language: lang }));
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

function WearReviewsSafety({ lang }) {
  const wearItems = lang === 'it'
    ? ['Scarpe chiuse con buona suola', 'Giacca antivento e strato caldo', 'Acqua personale e protezione solare', 'No abbigliamento fragile o inadatto al terreno lavico']
    : ['Closed shoes with good grip', 'Windproof jacket and warm layer', 'Personal water and sun protection', 'No fragile clothing unsuitable for lava terrain'];
  const safetyItems = lang === 'it'
    ? ['Meteo e visibilità', 'Ordinanze e accessibilità', 'Attività vulcanica reale', 'Età, mobilità e abbigliamento del gruppo']
    : ['Weather and visibility', 'Regulations and access', 'Actual volcanic activity', 'Group age, mobility, and clothing'];
  const review = lang === 'it'
    ? 'Esperienza intensa e ben organizzata sull’Etna. Le indicazioni sull’abbigliamento sono state chiare e il ritmo dell’escursione è rimasto adatto al gruppo, con pause gestite bene e spiegazioni utili sul territorio.'
    : 'A well-organized Etna experience with clear clothing guidance, a suitable pace for the group, well-managed breaks, and useful explanations about the territory.';

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

const BOOKING_JOURNEY_VERSION = '20260629-funnel-integrity';

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
  if (typeof window === 'undefined') return {};
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
  const contact = resolvePublicContactDetails(siteContent);
  const { requestContactAttribution, contactAttributionModal } = useContactAttributionGate(lang);
  const [submitState, setSubmitState] = useState({ loading: false, error: '', success: '' });
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
    Promise.all([
      loadPublicFixedExcursions(),
      loadPublicMonthlyLeaflets().catch(() => [])
    ]).then(([fixedRows, leafletRows]) => {
      if (!active) return;
      setFixedExcursions((fixedRows || []).filter((item) => !item.date || item.date >= todayIso()));
      setLeaflets(leafletRows || []);
    }).catch(() => {
      if (!active) return;
      setFixedExcursions([]);
      setLeaflets([]);
    });
    return () => { active = false; };
  }, []);

  useBodyScrollLock(Boolean(questionnaireTransition.shouldRender || fixedOptionsTransition.shouldRender || privateOptionsTransition.shouldRender || requestLeafletTransition.shouldRender || privateDetailTransition.shouldRender || fixedDetailTransition.shouldRender));

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
          website: '',
          ...referralPayload
        }
      });
      if (referralPayload.referral_code) trackEvent('referral_booking_request_created', { referral_code: referralPayload.referral_code, source_type: 'booking_form', source_id: createdRequest?.id || '', language: lang }, { dedupe: false });
      markFormSubmitted(formJourneyRef.current?.journey_id, { ...trackingMetadata, form_type: 'booking_form', has_selected_experience: Boolean(effectiveExperienceId), has_selected_date: Boolean(selectedFixed?.date || formState.requestedDate), has_people_count: totalPeople > 0 });
      setSubmitState({ loading: false, error: '', success: text(lang, 'requestSent') });
      setQuestionnaireOpen(false);
      trackedFormOpenRef.current.delete('field_start');
      bookingJourneyIdRef.current = '';
    } catch (error) {
      setSubmitState({ loading: false, error: text(lang, 'requestFallbackError'), success: '' });
    }
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
                {fixedExcursions.length === 0 && <p className="small-note">{text(lang, 'noFixedExcursions')}</p>}
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
          <form className="questionnaire-modal motion-panel" ref={modalRef} onSubmit={submitRequest}>
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
                <div className="questionnaire-final-actions">
                  <button className="request-action-button request-action-button-primary" type="submit" disabled={finalActionsDisabled}>{submitState.loading ? (lang === 'it' ? 'Invio...' : 'Sending...') : text(lang, 'submitRequest')}</button>
                  <button className="request-action-button request-action-button-secondary" type="button" onClick={openFormWhatsapp} disabled={finalActionsDisabled}>{text(lang, 'sendWhatsapp')}</button>
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


function LegalPage({ lang, page, siteContent, modal = false }) {
  const contact = resolvePublicContactDetails(siteContent);
  const updated = '30/06/2026';
  const content = {
    privacy: {
      title: adminCopy(lang, 'Privacy Policy', 'Privacy Policy'),
      intro: adminCopy(lang, 'Questa informativa descrive in modo pratico come vulcanIQ tratta i dati inviati tramite il sito.', 'This policy explains in practical terms how vulcanIQ processes data submitted through the website.'),
      sections: [
        [adminCopy(lang, 'Titolare del trattamento', 'Data controller'), adminCopy(lang, 'Il sito è gestito da vulcanIQ. Per richieste privacy puoi usare l’indirizzo email indicato nei contatti del sito.', 'The site is managed by vulcanIQ. For privacy requests, use the email address listed in the website contact details.')],
        [adminCopy(lang, 'Dati raccolti', 'Data collected'), adminCopy(lang, 'Possiamo ricevere dati inseriti nei moduli di contatto o prenotazione, come nome, telefono, email, preferenze di contatto, data richiesta, numero di partecipanti e testo del messaggio.', 'We may receive data entered in contact or booking forms, such as name, phone, email, contact preference, requested date, party size and message text.')],
        [adminCopy(lang, 'Dati analytics', 'Analytics data'), adminCopy(lang, 'Il sito usa metriche anonime e privacy-first per capire visite, azioni di contatto, sorgenti UTM e percorso verso la richiesta di prenotazione. Nomi, email, numeri di telefono e testo dei messaggi non vengono inclusi negli analytics.', 'The site uses anonymous privacy-first metrics to understand visits, contact actions, UTM sources and the path toward booking requests. Names, emails, phone numbers and message text are not included in analytics.')],
        [adminCopy(lang, 'Finalità', 'Purposes'), adminCopy(lang, 'I dati sono usati per rispondere alle richieste, gestire disponibilità e prenotazioni, migliorare il sito e mantenere sicurezza tecnica.', 'Data is used to answer requests, manage availability and bookings, improve the site and maintain technical security.')],
        [adminCopy(lang, 'Servizi terzi', 'Third-party services'), adminCopy(lang, 'Il sito può collegarsi a servizi esterni come WhatsApp, email, Google Maps, social network, Supabase e Cloudflare. Quando apri un link esterno, si applicano anche le policy del relativo servizio.', 'The site may link to external services such as WhatsApp, email, Google Maps, social networks, Supabase and Cloudflare. When you open an external link, that service’s policies also apply.')],
        [adminCopy(lang, 'Conservazione e diritti', 'Retention and rights'), adminCopy(lang, 'I dati vengono conservati per il tempo necessario alla gestione della richiesta e agli obblighi organizzativi o legali. Puoi chiedere accesso, rettifica o cancellazione contattando il team.', 'Data is retained for the time needed to manage the request and organizational or legal obligations. You may request access, correction or deletion by contacting the team.')],
        [adminCopy(lang, 'Contatto', 'Contact'), contact.email]
      ]
    },
    terms: {
      title: adminCopy(lang, 'Termini e condizioni', 'Terms and Conditions'),
      intro: adminCopy(lang, 'Queste condizioni regolano l’uso del sito e l’invio di richieste per esperienze vulcanIQ.', 'These terms govern use of the site and submission of requests for vulcanIQ experiences.'),
      sections: [
        [adminCopy(lang, 'Uso del sito', 'Website use'), adminCopy(lang, 'Le informazioni sono fornite per presentare esperienze, disponibilità indicative e modalità di contatto. Non usare il sito in modo illecito o dannoso.', 'Information is provided to present experiences, indicative availability and contact methods. Do not use the site in unlawful or harmful ways.')],
        [adminCopy(lang, 'Richieste e conferme', 'Requests and confirmations'), adminCopy(lang, 'L’invio di una richiesta non costituisce conferma automatica. La prenotazione è confermata solo dopo risposta esplicita del team vulcanIQ.', 'Submitting a request is not an automatic confirmation. A booking is confirmed only after explicit confirmation from the vulcanIQ team.')],
        [adminCopy(lang, 'Disponibilità, prezzi e programmi', 'Availability, prices and programs'), adminCopy(lang, 'Disponibilità, prezzi, orari, itinerari e programmi possono cambiare in base a meteo, ordinanze, attività vulcanica, logistica e valutazione della guida.', 'Availability, prices, times, routes and programs may change based on weather, regulations, volcanic activity, logistics and guide assessment.')],
        [adminCopy(lang, 'Responsabilità del cliente', 'Customer responsibilities'), adminCopy(lang, 'Il cliente deve fornire informazioni corrette su partecipanti, età, condizioni fisiche, esigenze specifiche e contatti utili alla gestione dell’esperienza.', 'Customers must provide accurate information about participants, age, fitness level, specific needs and contact details required to manage the experience.')],
        [adminCopy(lang, 'Sicurezza Etna e meteo', 'Etna safety and weather'), adminCopy(lang, 'Le esperienze sull’Etna dipendono da condizioni naturali variabili. La guida può modificare, rinviare o annullare l’attività per motivi di sicurezza.', 'Etna experiences depend on variable natural conditions. The guide may change, postpone or cancel the activity for safety reasons.')],
        [adminCopy(lang, 'Link esterni e proprietà intellettuale', 'External links and intellectual property'), adminCopy(lang, 'I link esterni sono forniti per utilità. Testi, immagini, logo e contenuti vulcanIQ non possono essere copiati senza autorizzazione.', 'External links are provided for convenience. vulcanIQ text, images, logo and content may not be copied without permission.')],
        [adminCopy(lang, 'Contatto', 'Contact'), contact.email]
      ]
    },
    cookies: {
      title: adminCopy(lang, 'Cookie Policy', 'Cookie Policy'),
      intro: adminCopy(lang, 'Questa pagina spiega l’uso di cookie e tecnologie simili sul sito vulcanIQ.', 'This page explains the use of cookies and similar technologies on the vulcanIQ website.'),
      sections: [
        [adminCopy(lang, 'Cosa sono i cookie', 'What cookies are'), adminCopy(lang, 'I cookie sono piccoli file o identificatori tecnici usati dal browser per far funzionare un sito o ricordare alcune informazioni.', 'Cookies are small files or technical identifiers used by the browser to operate a site or remember certain information.')],
        [adminCopy(lang, 'Cookie essenziali', 'Essential cookies'), adminCopy(lang, 'Il sito può usare dati tecnici essenziali per lingua, sessione, sicurezza, invio dei moduli e funzionamento dell’interfaccia.', 'The site may use essential technical data for language, session, security, form submission and interface operation.')],
        [adminCopy(lang, 'Analytics', 'Analytics'), adminCopy(lang, 'Le metriche del sito sono configurate per essere anonime e diagnostiche. Se il browser invia preferenze Do Not Track o segnali simili, il tracciamento viene limitato quando supportato dal sito.', 'Site metrics are configured to be anonymous and diagnostic. If the browser sends Do Not Track preferences or similar signals, tracking is limited where supported by the site.')],
        [adminCopy(lang, 'Servizi terzi', 'Third-party services'), adminCopy(lang, 'Link a Google Maps, social network, WhatsApp o altri servizi possono usare cookie propri solo dopo l’apertura del servizio esterno.', 'Links to Google Maps, social networks, WhatsApp or other services may use their own cookies only after the external service is opened.')],
        [adminCopy(lang, 'Gestione cookie', 'Managing cookies'), adminCopy(lang, 'Puoi gestire o cancellare i cookie dalle impostazioni del browser. Il blocco di alcuni elementi tecnici può ridurre il corretto funzionamento del sito.', 'You can manage or delete cookies in your browser settings. Blocking some technical elements may reduce proper site functionality.')],
        [adminCopy(lang, 'Contatto', 'Contact'), contact.email]
      ]
    }
  };
  const selected = content[page] || content.privacy;
  return (
    <section className={`section page-section legal-page-section ${modal ? 'is-modal-content' : ''}`.trim()}>
      <div className="container legal-page-card">
        <div className="section-header refined-section-header">
          <h1 id={modal ? 'legalModalTitle' : undefined}>{selected.title}</h1>

        </div>
        <div className="legal-section-list">
          {selected.sections.map(([title, body]) => (
            <article className="legal-section-card" key={title}>
              <h2>{title}</h2>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </div>
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
  const [footerBookNowOpen, setFooterBookNowOpen] = useState(false);
  const [phoneChoicesOpen, setPhoneChoicesOpen] = useState(false);
  const [legalModalPage, setLegalModalPage] = useState(null);
  const phoneChoiceRef = useRef(null);
  useBodyScrollLock(Boolean(legalModalPage));
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
    <footer className="footer public-footer">
      <div className="container footer-grid public-footer-grid">
        <section className="footer-column footer-brand-column">
          <h2>vulcanIQ</h2>
        </section>
        <section className="footer-column footer-contact-column">
          <h3>{adminCopy(lang, 'Contatti', 'Contact')}</h3>
          <p className="footer-contact-list">
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
          </p>
        </section>
        <section className="footer-column">
          <h3>{adminCopy(lang, 'Legale', 'Legal')}</h3>
          <button className="footer-link-button" type="button" onClick={() => setLegalModalPage('privacy')}>Privacy Policy</button>
          <button className="footer-link-button" type="button" onClick={() => setLegalModalPage('terms')}>{adminCopy(lang, 'Termini e condizioni', 'Terms and Conditions')}</button>
          <button className="footer-link-button" type="button" onClick={() => setLegalModalPage('cookies')}>Cookie Policy</button>
        </section>
        <section className="footer-column">
          <h3>{adminCopy(lang, 'Social', 'Social')}</h3>
          <SocialLinks lang={lang} siteContent={siteContent} className="footer-social-links" compact location="footer" />
        </section>
        <section className="footer-column">
          <h3>Etna</h3>
          <a href="/latest-news">{adminCopy(lang, 'Notizie live sull’Etna', 'Etna live news')}</a>
          <a
            href="/contact"
            onClick={(event) => {
              event.preventDefault();
              setFooterBookNowOpen(true);
            }}
          >{adminCopy(lang, 'Prenota ora', 'Book now')}</a>
        </section>
      </div>
      <div className="container footer-bottom-row">
        <p>{adminCopy(lang, '© 2026 vulcanIQ – Tutti i diritti riservati', '© 2026 vulcanIQ – All rights reserved')}</p>
      </div>
      {legalModalPage && (
        <div className="legal-modal-backdrop motion-backdrop" role="presentation" onClick={() => setLegalModalPage(null)}>
          <article className="legal-modal-panel motion-panel" role="dialog" aria-modal="true" aria-labelledby="legalModalTitle" onClick={(event) => event.stopPropagation()}>
            <div className="legal-modal-header">
              <span>{adminCopy(lang, 'Documento legale', 'Legal document')}</span>
              <button className="modal-close-button" type="button" onClick={() => setLegalModalPage(null)}>{text(lang, 'close')}</button>
            </div>
            <LegalPage lang={lang} page={legalModalPage} siteContent={siteContent} modal />
          </article>
        </div>
      )}
      {footerBookNowOpen && (
        <FastRequestModal
          lang={lang}
          siteContent={siteContent}
          sourceSection="footer"
          sourceCta="book_now"
          ctaLocation="footer_book_now"
          flowType="fast_request"
          onClose={() => setFooterBookNowOpen(false)}
        />
      )}
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
const LEAD_STATUSES = ['new_lead', 'contacted', 'waiting_customer', 'quoted', 'deposit_sent', 'deposit_paid', 'confirmed', 'completed', 'review_requested', 'review_received', 'lost', 'cancelled'];
const LEAD_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const LEAD_STATUS_LABELS = {
  new_lead: { it: 'Nuovo lead', en: 'New lead' },
  contacted: { it: 'Contattato', en: 'Contacted' },
  waiting_customer: { it: 'In attesa cliente', en: 'Waiting customer' },
  quoted: { it: 'Preventivo inviato', en: 'Quoted' },
  deposit_sent: { it: 'Acconto richiesto', en: 'Deposit sent' },
  deposit_paid: { it: 'Acconto pagato', en: 'Deposit paid' },
  confirmed: { it: 'Confermato', en: 'Confirmed' },
  completed: { it: 'Completato', en: 'Completed' },
  review_requested: { it: 'Recensione richiesta', en: 'Review requested' },
  review_received: { it: 'Recensione ricevuta', en: 'Review received' },
  lost: { it: 'Perso', en: 'Lost' },
  cancelled: { it: 'Annullato', en: 'Cancelled' }
};
const LEAD_PRIORITY_LABELS = {
  low: { it: 'Bassa', en: 'Low' },
  normal: { it: 'Normale', en: 'Normal' },
  high: { it: 'Alta', en: 'High' },
  urgent: { it: 'Urgente', en: 'Urgent' }
};
function leadStatusLabel(status, lang) { return LEAD_STATUS_LABELS[status]?.[lang] || status || '-'; }
function leadPriorityLabel(priority, lang) { return LEAD_PRIORITY_LABELS[priority]?.[lang] || priority || '-'; }
function requestMoneyValue(request) { return parseMoneyAmount(request.quoted_amount ?? request.expected_value ?? 0); }
function isRequestConfirmedRevenue(request) {
  if (request.source === 'booking_code') return false;
  return ['accepted', 'confirmed', 'completed'].includes(request.status) || ['confirmed', 'completed', 'deposit_paid', 'review_requested', 'review_received'].includes(request.lead_status);
}
function isRequestLost(request) { return ['declined', 'cancelled', 'archived'].includes(request.status) || ['lost', 'cancelled'].includes(request.lead_status); }

const PARTNER_COMMISSION_STATUSES = ['pending', 'approved', 'paid', 'cancelled'];
const PARTNER_COMMISSION_STATUS_LABELS = {
  pending: { it: 'In attesa', en: 'Pending' },
  approved: { it: 'Approvata non pagata', en: 'Approved unpaid' },
  paid: { it: 'Pagata', en: 'Paid' },
  cancelled: { it: 'Annullata', en: 'Cancelled' }
};
const PARTNER_COMMISSION_TYPE_LABELS = {
  none: { it: 'Nessuna', en: 'None' },
  fixed_amount: { it: 'Importo fisso', en: 'Fixed amount' },
  percentage: { it: 'Percentuale', en: 'Percentage' }
};
const PARTNER_COMMISSION_APPLIES_TO_LABELS = {
  request_created: { it: 'Richiesta creata', en: 'Request created' },
  booking_confirmed: { it: 'Prenotazione confermata', en: 'Booking confirmed' },
  revenue_confirmed: { it: 'Pagamento registrato', en: 'Recorded payment' }
};
function partnerCommissionStatusLabel(status, lang) { return PARTNER_COMMISSION_STATUS_LABELS[status]?.[lang] || status || '-'; }
function partnerCommissionTypeLabel(type, lang) { return PARTNER_COMMISSION_TYPE_LABELS[type]?.[lang] || type || '-'; }
function partnerCommissionAppliesToLabel(value, lang) { return PARTNER_COMMISSION_APPLIES_TO_LABELS[value]?.[lang] || value || '-'; }
function partnerCommissionRuleLabel(item, lang) {
  if (!item || item.commission_enabled === false || item.commission_type === 'none') return adminCopy(lang, 'Nessuna commissione', 'No commission');
  if (item.commission_type === 'percentage') return `${parseMoneyAmount(item.commission_value)}%`;
  if (item.commission_type === 'fixed_amount') return formatMoney(item.commission_value, item.commission_currency || item.currency || 'EUR', lang);
  return partnerCommissionTypeLabel(item.commission_type, lang);
}
function partnerCommissionEligibleForRequest(request = {}, partner = {}) {
  const appliesTo = partner?.commission_applies_to || 'revenue_confirmed';
  if (appliesTo === 'request_created') return true;
  if (appliesTo === 'booking_confirmed') return isRequestConfirmedRevenue(request);
  return isRequestConfirmedRevenue(request) && requestMoneyValue(request) > 0;
}
function partnerCommissionGrossAmountForRequest(request = {}) { return requestMoneyValue(request); }
function partnerCommissionSourceLabel(item = {}, lang) {
  if (item.source_type === 'booking_request') return adminCopy(lang, 'Richiesta', 'Request');
  if (item.source_type === 'booking_code') return adminCopy(lang, 'Codice prenotazione', 'Booking code');
  if (item.source_type === 'manual_booking') return adminCopy(lang, 'Prenotazione manuale', 'Manual booking');
  if (item.source_type === 'gift_card') return 'Gift Card';
  return item.source_type || '-';
}
function requestSourceKey(request) {
  if (request.referral_code || request.referral_source === 'customer_referral') return 'customer_referral';
  if (request.source === 'booking_code') return 'booking_code';
  if (request.source) return request.source;
  if (request.utm_source === 'referral') return 'referral';
  return request.utm_source || request.heard_about_us || 'unknown';
}
function requestExperienceKey(request, lang) { return adminExperienceLabel(request.experience_id, lang) || request.experience_id || 'unknown'; }
function buildRequestsCrmSummary(requests, lang) {
  const now = new Date();
  const today = todayIso();
  const due = requests.filter((request) => request.next_follow_up_at && String(request.next_follow_up_at).slice(0, 10) <= today && !isRequestLost(request));
  const overdue = due.filter((request) => new Date(request.next_follow_up_at) < new Date(`${today}T00:00:00`));
  const confirmed = requests.filter((request) => isRequestConfirmedRevenue(request) && !isRequestLost(request));
  const pipeline = requests.filter((request) => !isRequestLost(request) && !isRequestConfirmedRevenue(request));
  const confirmedRevenue = confirmed.reduce((sum, request) => sum + requestMoneyValue(request), 0);
  const expectedPipeline = pipeline.reduce((sum, request) => sum + requestMoneyValue(request), 0);
  const sourceMap = new Map();
  const experienceMap = new Map();
  confirmed.forEach((request) => {
    sourceMap.set(requestSourceKey(request), (sourceMap.get(requestSourceKey(request)) || 0) + requestMoneyValue(request));
    experienceMap.set(requestExperienceKey(request, lang), (experienceMap.get(requestExperienceKey(request, lang)) || 0) + requestMoneyValue(request));
  });
  return {
    total: requests.length,
    due: due.length,
    overdue: overdue.length,
    confirmedRevenue,
    expectedPipeline,
    averageBookingValue: confirmed.length ? confirmedRevenue / confirmed.length : 0,
    leadToConfirmedRate: requests.length ? (confirmed.length / requests.length) * 100 : 0,
    highPriority: requests.filter((request) => ['high', 'urgent'].includes(request.lead_priority)).length,
    lost: requests.filter(isRequestLost).length,
    sourceBreakdown: [...sourceMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    experienceBreakdown: [...experienceMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    generatedAt: now.toISOString()
  };
}
const REQUEST_SOURCES = ['website', 'whatsapp', 'phone', 'email', 'manual', 'booking_code', 'referral', 'customer_referral'];
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
      navigate('/admin/requests');
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


function AdminMenuDropdown({ lang, visibleSections, normalizedPath, currentNavValue, navigate, safeguards }) {
  const [open, setOpen] = useState(false);
  const shellRef = useRef(null);
  const sectionByKey = useMemo(() => visibleSections.reduce((acc, section) => ({ ...acc, [section.key]: section }), {}), [visibleSections]);
  const currentSection = visibleSections.find((section) => !section.external && section.path === currentNavValue)
    || visibleSections.find((section) => !section.external && isAdminNavSectionActive(normalizedPath, section))
    || visibleSections.find((section) => section.key === 'today');
  const currentLabel = currentSection ? adminNavLabel(currentSection, lang) : adminCopy(lang, 'Oggi', 'Today');

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!shellRef.current?.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function openSection(section) {
    setOpen(false);
    if (!section?.external) navigate(section.path);
  }

  return (
    <div className="admin-menu-shell" ref={shellRef}>
      <button
        className="admin-menu-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {adminCopy(lang, 'Menu', 'Menu')} <span aria-hidden="true">▾</span>
      </button>
      <span className="admin-menu-current"><span>{adminCopy(lang, 'Sezione', 'Current')}</span>{currentLabel}</span>
      {open && (
        <div className="admin-menu-dropdown" role="menu" aria-label={adminCopy(lang, 'Navigazione admin', 'Admin navigation')}>
          {ADMIN_NAV_GROUPS.map((group) => {
            const groupItems = group.items.map((key) => sectionByKey[key]).filter(Boolean);
            if (!groupItems.length) return null;
            return (
              <section className="admin-menu-group" key={group.key}>
                <h2 className="admin-menu-group-title">{lang === 'it' ? group.labelIt : group.labelEn}</h2>
                <div className="admin-menu-group-items">
                  {groupItems.map((section) => {
                    const active = !section.external && isAdminNavSectionActive(normalizedPath, section);
                    return section.external ? (
                      <a
                        key={section.key}
                        className="admin-menu-item"
                        href={section.path}
                        target="_blank"
                        rel="noopener noreferrer"
                        role="menuitem"
                        onClick={() => setOpen(false)}
                      >
                        {adminNavLabel(section, lang)}
                      </a>
                    ) : (
                      <button
                        key={section.key}
                        className={`admin-menu-item ${active ? 'admin-menu-item-active' : ''}`}
                        type="button"
                        role="menuitem"
                        aria-current={active ? 'page' : undefined}
                        onClick={() => openSection(section)}
                      >
                        <span>{adminNavLabel(section, lang)}</span>
                        {section.key === 'requests' && Number(safeguards?.pending_requests || 0) > 0 && <strong className="admin-nav-badge">{safeguards.pending_requests}</strong>}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}


function AdminUsersPage({ lang }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setUsers(await listAdminUsers());
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Utenti non caricati.', 'Users not loaded.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function save(user, changes) {
    setError('');
    setFeedback('');
    try {
      await updateAdminUser(user.user_id, changes);
      setFeedback(adminCopy(lang, 'Utente aggiornato.', 'User updated.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Aggiornamento non riuscito.', 'Update failed.'));
    }
  }

  return (
    <section className="admin-panel admin-users-page">
      <div className="admin-panel-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Owner only', 'Owner only')}</span>
          <h1>{adminCopy(lang, 'Utenti admin', 'Admin users')}</h1>
          <p>{adminCopy(lang, 'Gestisci ruoli e stato degli account già presenti in Supabase Auth. La creazione sicura di nuovi account resta manuale in Supabase.', 'Manage roles and status for accounts already present in Supabase Auth. Secure creation of new accounts remains manual in Supabase.')}</p>
        </div>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      <div className="admin-users-help">
        <button className="button secondary admin-users-details-button" type="button" onClick={() => setDetailsOpen((open) => !open)}>
          {detailsOpen ? adminCopy(lang, 'Nascondi dettagli', 'Hide details') : adminCopy(lang, 'Dettagli aggiunta utente', 'User creation details')}
        </button>
        {detailsOpen && (
          <div className="admin-alert warning admin-users-details-panel">
            {adminCopy(lang, 'Per aggiungere un nuovo utente: crea prima l’utente in Supabase Auth, poi inserisci o aggiorna il profilo in admin_profiles con ruolo e active=true. Non usare mai service-role key nel frontend.', 'To add a new user: first create the user in Supabase Auth, then insert or update the profile in admin_profiles with role and active=true. Never use a service-role key in the frontend.')}
          </div>
        )}
      </div>
      {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : (
        <div className="admin-table-wrap admin-users-table">
          <table className="admin-table">
            <thead><tr><th>{adminCopy(lang, 'Nome', 'Name')}</th><th>Email</th><th>{adminCopy(lang, 'Ruolo', 'Role')}</th><th>{adminCopy(lang, 'Attivo', 'Active')}</th><th>{adminCopy(lang, 'Ultimo accesso', 'Last seen')}</th><th>{adminCopy(lang, 'Azioni', 'Actions')}</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.user_id}>
                  <td data-label={adminCopy(lang, 'Nome', 'Name')}>{user.full_name || '-'}</td>
                  <td data-label="Email">{user.email || '-'}</td>
                  <td data-label={adminCopy(lang, 'Ruolo', 'Role')}><select value={user.role || 'manager'} onChange={(event) => save(user, { role: event.target.value })}>{ADMIN_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></td>
                  <td data-label={adminCopy(lang, 'Attivo', 'Active')}>{user.active === false ? adminCopy(lang, 'No', 'No') : adminCopy(lang, 'Sì', 'Yes')}</td>
                  <td data-label={adminCopy(lang, 'Ultimo accesso', 'Last seen')}>{user.last_seen_at ? new Date(user.last_seen_at).toLocaleString(lang === 'it' ? 'it-IT' : 'en-GB') : '-'}</td>
                  <td data-label={adminCopy(lang, 'Azioni', 'Actions')}><button className="button secondary" type="button" onClick={() => save(user, { active: user.active === false })}>{user.active === false ? adminCopy(lang, 'Riattiva', 'Reactivate') : adminCopy(lang, 'Disattiva', 'Deactivate')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}


function AdminLayout({ pathname, navigate, lang, setLang, session, profile }) {
  const normalizedPath = pathname === '/admin' ? '/admin/requests' : pathname;
  const currentAdminPath = adminPathFromLocation(pathname);
  const visibleSections = visibleAdminNavSections(profile);
  const currentNavValue = visibleSections.some((section) => section.path === currentAdminPath) ? currentAdminPath : '/admin/requests';
  const isOwner = profile?.role === 'owner' && profile?.active !== false;
  const isBackupPage = normalizedPath.includes('/system') || normalizedPath.includes('/backup');
  const isUsersPage = normalizedPath.includes('/users');

  const [adminContentRows, setAdminContentRows] = useState([]);
  const [globalBackupProgress, setGlobalBackupProgress] = useState(inactiveBackupProgress);
  const [operationalSafeguards, setOperationalSafeguards] = useState(null);
  const [weeklyRecapState, setWeeklyRecapState] = useState({ loading: false, message: '' });
  const backupMonitorRef = useRef({ interval: null, timeout: null, requestedAt: '' });

  function clearBackupMonitorTimers() {
    if (backupMonitorRef.current.interval) window.clearInterval(backupMonitorRef.current.interval);
    if (backupMonitorRef.current.timeout) window.clearTimeout(backupMonitorRef.current.timeout);
    backupMonitorRef.current.interval = null;
    backupMonitorRef.current.timeout = null;
  }

  function stopBackupMonitor(delay = 0) {
    clearBackupMonitorTimers();
    storeBackupRequestedAt('');
    if (delay > 0) {
      backupMonitorRef.current.timeout = window.setTimeout(() => setGlobalBackupProgress(inactiveBackupProgress()), delay);
    } else {
      setGlobalBackupProgress(inactiveBackupProgress());
    }
  }

  async function pollGlobalBackupStatus(requestedAt, immediate = false) {
    try {
      const result = await getBackupStatus({ lang, includeMetadata: false });
      const nextProgress = backupProgressFromStatus(result, requestedAt, lang);
      setGlobalBackupProgress(nextProgress);
      if (nextProgress.done) {
        window.dispatchEvent(new CustomEvent('vulcaniq-backup-status-updated', { detail: result }));
        stopBackupMonitor(nextProgress.failed ? 0 : 4500);
      }
    } catch (error) {
      if (immediate) {
        setGlobalBackupProgress({
          active: true,
          value: 25,
          title: adminCopy(lang, 'Backup avviato', 'Backup started'),
          detail: adminCopy(lang, 'Stato workflow non ancora disponibile.', 'Workflow status is not available yet.'),
          failed: false,
          done: false
        });
      }
    }
  }

  function startGlobalBackupMonitor(requestedAt, initialProgress) {
    const safeRequestedAt = requestedAt || new Date().toISOString();
    clearBackupMonitorTimers();
    backupMonitorRef.current.requestedAt = safeRequestedAt;
    storeBackupRequestedAt(safeRequestedAt);
    setGlobalBackupProgress(initialProgress || {
      active: true,
      value: 10,
      title: adminCopy(lang, 'Backup in esecuzione', 'Backup in progress'),
      detail: adminCopy(lang, 'GitHub Actions sta creando il dump e preparando lo ZIP.', 'GitHub Actions is creating the dump and preparing the ZIP.'),
      failed: false,
      done: false
    });
    pollGlobalBackupStatus(safeRequestedAt, true);
    backupMonitorRef.current.interval = window.setInterval(() => pollGlobalBackupStatus(safeRequestedAt), 5000);
  }

  useEffect(() => {
    function handleBackupMonitorStart(event) {
      startGlobalBackupMonitor(event.detail?.requestedAt, event.detail?.progress);
    }
    window.addEventListener('vulcaniq-backup-monitor-start', handleBackupMonitorStart);
    const storedRequestedAt = readStoredBackupRequestedAt();
    if (storedRequestedAt) {
      startGlobalBackupMonitor(storedRequestedAt, {
        active: true,
        value: 35,
        title: adminCopy(lang, 'Backup in esecuzione', 'Backup in progress'),
        detail: adminCopy(lang, 'GitHub Actions sta creando il dump e preparando lo ZIP.', 'GitHub Actions is creating the dump and preparing the ZIP.'),
        failed: false,
        done: false
      });
    } else if (isOwner && isSupabaseConfigured) {
      getBackupStatus({ lang, includeMetadata: false }).then((result) => {
        const run = result?.workflowRun;
        if (!isBackupWorkflowActive(run)) return;
        startGlobalBackupMonitor(run.createdAt || run.runStartedAt || new Date().toISOString(), backupProgressFromStatus(result, run.createdAt || run.runStartedAt || new Date().toISOString(), lang));
      }).catch(() => {});
    }
    return () => {
      window.removeEventListener('vulcaniq-backup-monitor-start', handleBackupMonitorStart);
      clearBackupMonitorTimers();
    };
  }, [lang, isOwner]);


  useEffect(() => {
    if (pathname === '/admin') navigate('/admin/requests');
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

  useEffect(() => {
    let alive = true;
    async function refreshSafeguards() {
      try {
        const result = await getOperationalSafeguards();
        if (alive) setOperationalSafeguards(result);
      } catch {
        if (alive) setOperationalSafeguards(null);
      }
    }
    refreshSafeguards();
    const interval = window.setInterval(refreshSafeguards, 60000);
    return () => { alive = false; window.clearInterval(interval); };
  }, [normalizedPath]);

  async function sendWeeklyRecapTest() {
    setWeeklyRecapState({ loading: true, message: '' });
    try {
      const result = await sendWeeklyAdminRecap({ testMode: true, force: true });
      setWeeklyRecapState({ loading: false, message: adminCopy(lang, `Report di test inviati: ${result.sent || 0}.`, `Test reports sent: ${result.sent || 0}.`) });
      setOperationalSafeguards(await getOperationalSafeguards());
    } catch (error) {
      setWeeklyRecapState({ loading: false, message: error?.message || adminCopy(lang, 'Invio report non riuscito.', 'Report send failed.') });
    }
  }

  const adminContent = useMemo(() => buildSiteContentMap(adminContentRows), [adminContentRows]);

  async function logout() {
    await signOutOwner();
    navigate('/admin/login');
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <AdminMenuDropdown
          lang={lang}
          visibleSections={visibleSections}
          normalizedPath={normalizedPath}
          currentNavValue={currentNavValue}
          navigate={navigate}
          safeguards={operationalSafeguards}
        />
        <div className="admin-userbox">
          <span className="admin-userbox-name">{ownerDisplayName(profile, lang)}</span>
          <span className="admin-userbox-actions">
            <button type="button" onClick={() => setLang(lang === 'it' ? 'en' : 'it')}>{lang === 'it' ? 'EN' : 'IT'}</button>
            <button type="button" onClick={logout}>{adminCopy(lang, 'Esci', 'Logout')}</button>
          </span>
        </div>
      </header>
      <OperationalSafeguardsBanner
        lang={lang}
        safeguards={operationalSafeguards}
        isOwner={isOwner}
        weeklyRecapState={weeklyRecapState}
        onSendWeeklyRecapTest={sendWeeklyRecapTest}
      />
      {isOwner && !isBackupPage && !isUsersPage && (
        <GlobalBackupProgressBanner
          lang={lang}
          progress={globalBackupProgress}
          onOpenBackup={() => navigate('/admin/system/backup')}
        />
      )}
      <main className="admin-main">
        {normalizedPath.includes('/calendar') ? (
          <AdminCalendarPage lang={lang} session={session} navigate={navigate} adminContent={adminContent} />
        ) : normalizedPath.includes('/notifications') || normalizedPath.includes('/install') ? (
          <NotificationsPage variant="admin" lang={lang} adminRole={profile?.role || ''} />
        ) : normalizedPath.includes('/finance') ? (
          <FinanceAdminPage lang={lang} session={session} adminContent={adminContent} />
        ) : normalizedPath.includes('/analytics') || normalizedPath.includes('/data') ? (
          <AdminAnalyticsPage lang={lang} session={session} profile={profile} adminContent={adminContent} />
        ) : normalizedPath.includes('/system') || normalizedPath.includes('/backup') ? (
          isOwner ? <AdminBackupPage lang={lang} session={session} profile={profile} adminContent={adminContent} globalBackupProgress={globalBackupProgress} startGlobalBackupMonitor={startGlobalBackupMonitor} stopGlobalBackupMonitor={stopBackupMonitor} /> : <OwnerOnlyAdminPage lang={lang} />
        ) : normalizedPath.includes('/users') ? (
          isOwner ? <AdminUsersPage lang={lang} session={session} profile={profile} /> : <OwnerOnlyAdminPage lang={lang} />
        ) : normalizedPath.includes('/edit') || normalizedPath.includes('/website') || normalizedPath.includes('/content') || normalizedPath.includes('/media') ? (
          <AdminEditPage lang={lang} session={session} adminContent={adminContent} />
        ) : normalizedPath.includes('/partnerships') ? (
          <PartnershipsAdminPage lang={lang} session={session} adminContent={adminContent} />
        ) : normalizedPath.includes('/upcoming') ? (
          <UpcomingPage lang={lang} session={session} navigate={navigate} adminContent={adminContent} />
        ) : normalizedPath.includes('/booking-codes') ? (
          <BookingCodesPage lang={lang} session={session} adminContent={adminContent} />
        ) : normalizedPath.includes('/gift-cards') ? (
          <GiftCardsAdminPage lang={lang} session={session} adminContent={adminContent} />
        ) : normalizedPath.includes('/requests') ? (
          <RequestsPage lang={lang} session={session} navigate={navigate} adminContent={adminContent} />
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
          <label className="admin-field confirmed-date-section"><span>{adminCopy(lang, 'Data confermata', 'Confirmed date')}</span><input type="date" min={todayIso()} value={form.requested_date || ''} onChange={(event) => setForm((current) => ({ ...current, requested_date: event.target.value }))} /></label>
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
          <AdminInput label={adminCopy(lang, 'Data', 'Date')} type="date" min={todayIso()} value={form.date} onChange={(value) => setForm((current) => ({ ...current, date: value }))} />
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

const EDITOR_PAGE_OPTIONS = [
  { key: 'home', it: 'Home', en: 'Home' },
  { key: 'experiences', it: 'Escursioni', en: 'Excursions' },
  { key: 'partnerships', it: 'Collaborazioni', en: 'Partnerships' },
  { key: 'about', it: 'Chi siamo', en: 'Who we are' },
  { key: 'reviews', it: 'Recensioni', en: 'Reviews' },
  { key: 'social', it: 'Social', en: 'Social' },
  { key: 'latestNews', it: 'Notizie live sull’Etna', en: 'Etna live news' },
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


function SiteSettingsItem(contentMap, key) {
  const definition = getContentDefinition(key);
  return contentMap?.[key] || editorContentItem({}, key, definition.default_it || definition.default_en || '');
}

function LatestNewsEditor({ lang, contentMap, updateContentDraft }) {
  const enabledItem = SiteSettingsItem(contentMap, latestNewsContentKey('enabled'));
  const titleItem = SiteSettingsItem(contentMap, latestNewsContentKey('title'));
  const descriptionItem = SiteSettingsItem(contentMap, latestNewsContentKey('description'));
  const ctaItem = SiteSettingsItem(contentMap, latestNewsContentKey('cta_label'));
  const urlItItem = SiteSettingsItem(contentMap, latestNewsContentKey('url_it'));
  const urlEnItem = SiteSettingsItem(contentMap, latestNewsContentKey('url_en'));
  const enabled = parseBooleanSetting(enabledItem.value_it || enabledItem.value_en || enabledItem.default_it || 'true', true);
  const urlIt = contentSettingValue({ [latestNewsContentKey('url_it')]: urlItItem }, latestNewsContentKey('url_it'), '');
  const urlEn = contentSettingValue({ [latestNewsContentKey('url_en')]: urlEnItem }, latestNewsContentKey('url_en'), '');
  const hasInvalidIt = Boolean(urlIt) && !safeExternalUrl(urlIt);
  const hasInvalidEn = Boolean(urlEn) && !safeExternalUrl(urlEn);

  function updateTextItem(key, patch) {
    const item = SiteSettingsItem(contentMap, key);
    updateContentDraft(key, {
      ...item,
      ...patch,
      active: true,
      visible: true,
      content_type: item.content_type || (item.type === 'textarea' ? 'textarea' : 'text')
    });
  }

  function updateSingleValue(key, value) {
    updateTextItem(key, { value_it: value, value_en: value });
  }

  return (
    <details className="admin-archive-details edit-workspace-section latest-news-editor">
      <summary>
        <span>{adminCopy(lang, 'Notizie live sull’Etna', 'Etna live news')}</span>
        <strong>{adminCopy(lang, 'Link notizie live sull’Etna', 'Etna live news link')}</strong>
      </summary>
      <div className="admin-form-grid latest-news-grid">
        <label className="check-field full">
          <input type="checkbox" checked={enabled} onChange={(event) => updateSingleValue(latestNewsContentKey('enabled'), event.target.checked ? 'true' : 'false')} />
          {enabled ? adminCopy(lang, 'Mostra ultime notizie', 'Show latest news') : adminCopy(lang, 'Nascondi ultime notizie', 'Hide latest news')}
        </label>
        <label className="admin-field"><span>{adminCopy(lang, 'Titolo italiano', 'Italian title')}</span><input value={titleItem.value_it ?? titleItem.default_it ?? ''} onChange={(event) => updateTextItem(latestNewsContentKey('title'), { value_it: event.target.value })} /></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Titolo inglese', 'English title')}</span><input value={titleItem.value_en ?? titleItem.default_en ?? ''} onChange={(event) => updateTextItem(latestNewsContentKey('title'), { value_en: event.target.value })} /></label>
        <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione italiana', 'Italian description')}</span><textarea rows={3} value={descriptionItem.value_it ?? descriptionItem.default_it ?? ''} onChange={(event) => updateTextItem(latestNewsContentKey('description'), { value_it: event.target.value })} /></label>
        <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione inglese', 'English description')}</span><textarea rows={3} value={descriptionItem.value_en ?? descriptionItem.default_en ?? ''} onChange={(event) => updateTextItem(latestNewsContentKey('description'), { value_en: event.target.value })} /></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Testo pulsante italiano', 'Italian button text')}</span><input value={ctaItem.value_it ?? ctaItem.default_it ?? ''} onChange={(event) => updateTextItem(latestNewsContentKey('cta_label'), { value_it: event.target.value })} /></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Testo pulsante inglese', 'English button text')}</span><input value={ctaItem.value_en ?? ctaItem.default_en ?? ''} onChange={(event) => updateTextItem(latestNewsContentKey('cta_label'), { value_en: event.target.value })} /></label>
        <label className="admin-field"><span>{adminCopy(lang, 'URL italiano', 'Italian URL')}</span><input value={urlIt} placeholder="https://..." onChange={(event) => updateSingleValue(latestNewsContentKey('url_it'), event.target.value)} /></label>
        <label className="admin-field"><span>{adminCopy(lang, 'URL inglese', 'English URL')}</span><input value={urlEn} placeholder="https://..." onChange={(event) => updateSingleValue(latestNewsContentKey('url_en'), event.target.value)} /></label>
        {(hasInvalidIt || hasInvalidEn) && <div className="admin-alert warning full">{adminCopy(lang, 'Usa URL https:// validi. I link non validi non verranno mostrati sul sito pubblico.', 'Use valid https:// URLs. Invalid links will not be shown on the public website.')}</div>}
      </div>
    </details>
  );
}

function SocialLinksEditor({ lang, contentMap, updateContentDraft }) {
  const item = SiteSettingsItem(contentMap, SOCIAL_LINKS_CONTENT_KEY);
  const raw = item.value_it || item.value_en || item.default_it || item.default_en || '';
  const rows = raw ? parseSocialLinksJson(raw) : defaultSocialLinks(contentMap);
  const sortedRows = [...rows].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  function commit(nextRows) {
    const json = socialLinksToJson(nextRows);
    updateContentDraft(SOCIAL_LINKS_CONTENT_KEY, {
      ...item,
      value_it: json,
      value_en: json,
      active: true,
      visible: true,
      content_type: 'textarea'
    });
  }

  function addRow() {
    const nextOrder = sortedRows.reduce((max, row) => Math.max(max, Number(row.order || 0)), 0) + 1;
    commit([...sortedRows, {
      id: `social-${Date.now()}`,
      platform: 'instagram',
      label: 'Instagram',
      url: '',
      enabled: true,
      order: nextOrder,
      icon_key: 'insta'
    }]);
  }

  function updateRow(index, patch) {
    const next = sortedRows.map((row, rowIndex) => rowIndex === index ? normalizeSocialLink({ ...row, ...patch }, rowIndex) : row);
    commit(next);
  }

  function removeRow(index) {
    commit(sortedRows.filter((_row, rowIndex) => rowIndex !== index));
  }

  function moveRow(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= sortedRows.length) return;
    const next = [...sortedRows];
    const currentOrder = next[index].order;
    next[index] = { ...next[index], order: next[target].order };
    next[target] = { ...next[target], order: currentOrder };
    commit(next);
  }

  return (
    <details className="admin-archive-details edit-workspace-section social-links-editor">
      <summary>
        <span>{adminCopy(lang, 'Social', 'Social')}</span>
        <strong>{adminCopy(lang, 'Pagine social', 'Social pages')}</strong>
      </summary>
      <div className="social-admin-list">
        {sortedRows.length === 0 && <p className="small-note">{adminCopy(lang, 'Nessun social configurato', 'No social links configured')}</p>}
        {sortedRows.map((row, index) => {
          const invalidUrl = Boolean(row.url) && !safeExternalUrl(row.url);
          return (
            <article className="social-admin-row" key={row.id || index}>
              <div className="social-admin-row-head">
                <h3>{socialLinkLabel(row, lang)}</h3>
                <label className="check-field"><input type="checkbox" checked={row.enabled !== false} onChange={(event) => updateRow(index, { enabled: event.target.checked })} /> {adminCopy(lang, 'Attivo', 'Enabled')}</label>
              </div>
              <div className="admin-form-grid social-admin-grid">
                <label className="admin-field"><span>{adminCopy(lang, 'Piattaforma', 'Platform')}</span><select value={row.platform} onChange={(event) => updateRow(index, { platform: event.target.value, icon_key: socialPlatformOption(event.target.value).icon, label: row.label || socialPlatformLabel(event.target.value, lang) })}>{SOCIAL_PLATFORM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{lang === 'it' ? option.it : option.en}</option>)}</select></label>
                <label className="admin-field"><span>{adminCopy(lang, 'Etichetta', 'Label')}</span><input value={row.label || ''} onChange={(event) => updateRow(index, { label: event.target.value })} placeholder={socialPlatformLabel(row.platform, lang)} /></label>
                <label className="admin-field full"><span>{adminCopy(lang, 'URL', 'URL')}</span><input value={row.url || ''} onChange={(event) => updateRow(index, { url: event.target.value })} placeholder="https://..." /></label>
                <label className="admin-field"><span>{adminCopy(lang, 'Ordine', 'Order')}</span><input type="number" value={row.order || index + 1} onChange={(event) => updateRow(index, { order: event.target.value })} /></label>
                <label className="admin-field"><span>Icon key</span><input value={row.icon_key || ''} onChange={(event) => updateRow(index, { icon_key: event.target.value })} placeholder={socialPlatformOption(row.platform).icon} /></label>
              </div>
              {invalidUrl && <div className="admin-alert warning">{adminCopy(lang, 'URL non valido. Usa un link https://.', 'Invalid URL. Use an https:// link.')}</div>}
              <div className="request-actions">
                <button className="button secondary" type="button" onClick={() => moveRow(index, -1)} disabled={index === 0}>↑</button>
                <button className="button secondary" type="button" onClick={() => moveRow(index, 1)} disabled={index === sortedRows.length - 1}>↓</button>
                <button className="button secondary danger" type="button" onClick={() => removeRow(index)}>{adminCopy(lang, 'Rimuovi social', 'Remove social')}</button>
              </div>
            </article>
          );
        })}
        <button className="button primary" type="button" onClick={addRow}>{adminCopy(lang, 'Aggiungi social', 'Add social')}</button>
      </div>
    </details>
  );
}

function isSupportedMediaUrl(value) {
  const clean = String(value || '').trim();
  if (!clean) return true;
  return clean.startsWith('/') || clean.startsWith('http://') || clean.startsWith('https://');
}

function mediaUrlKindFromValue(value, fallback = 'image') {
  const clean = String(value || '').split('?')[0].toLowerCase();
  if (/\.(mp4|webm|mov)$/.test(clean)) return 'video';
  if (/\.(pdf)$/.test(clean)) return 'document';
  return fallback || 'image';
}

function MediaQuickEditorPanel({ lang, mediaMap, updateMediaDraft, contentMap, updateContentDraft, page }) {
  const keys = page === 'home'
    ? ['home_hero_background', 'home_hero_background_poster', 'home_hero_feature_image', 'home_hero_video']
    : MEDIA_ADMIN_ITEMS.map((item) => item.key).filter((key) => !['brand_logo_main'].includes(key));
  const visibleKeys = page === 'home' ? keys : keys.slice(0, 8);
  const heroLayout = contentMap?.['home.hero.layout'] || editorContentItem({}, 'home.hero.layout');
  return (
    <details className="admin-archive-details edit-workspace-section media-quick-editor">
      <summary>
        <span>{adminCopy(lang, 'Media', 'Media')}</span>
        <strong>{page === 'home' ? adminCopy(lang, 'Sfondo hero, poster, immagine e video', 'Hero background, poster, image, and video') : adminCopy(lang, 'Immagini e video principali', 'Key images and videos')}</strong>
      </summary>
      {page === 'home' && (
        <div className="hero-layout-admin-control">
          <label className="admin-field">
            <span>{adminCopy(lang, 'Allineamento hero senza immagine/video', 'Hero alignment without image/video')}</span>
            <select value={heroLayout.layout_variant === 'center' ? 'center' : 'left'} onChange={(event) => updateContentDraft('home.hero.layout', { layout_variant: event.target.value, active: true, visible: true })}>
              <option value="left">{adminCopy(lang, 'Sinistra', 'Left')}</option>
              <option value="center">{adminCopy(lang, 'Centro', 'Center')}</option>
            </select>
          </label>
          <p className="small-note">{adminCopy(lang, 'Si applica quando immagine e video hero sono rimossi.', 'Applies when both hero image and video are removed.')}</p>
        </div>
      )}
      {page === 'home' && (
        <VideoOptimizer
          lang={lang}
          onApply={({ videoFile, posterFile }) => {
            updateMediaDraft('home_hero_background', {
              file: videoFile,
              file_url: URL.createObjectURL(videoFile),
              file_name: videoFile.name,
              file_type: videoFile.type,
              media_kind: 'video',
              active: true
            });
            updateMediaDraft('home_hero_background_poster', {
              file: posterFile,
              file_url: URL.createObjectURL(posterFile),
              file_name: posterFile.name,
              file_type: posterFile.type,
              media_kind: 'image',
              active: true
            });
          }}
        />
      )}
      <div className="media-quick-grid">
        {visibleKeys.map((key) => {
          const item = mediaMap[key] || editorMediaItem({}, key);
          const label = lang === 'it' ? item.label_it : item.label_en;
          const kind = item.media_kind || mediaUrlKindFromValue(item.file_url, 'image');
          return (
            <article className="media-quick-card" key={key}>
              <div className="media-quick-card-head"><span className="micro-label">{key}</span><h3>{label}</h3></div>
              <div className="media-quick-preview">
                {item.file_url ? (kind === 'video' ? <video src={item.file_url} controls /> : <img src={item.file_url} alt={lang === 'it' ? item.alt_it : item.alt_en} onError={(event) => { event.currentTarget.style.display = 'none'; }} />) : <span>{adminCopy(lang, 'Anteprima non disponibile', 'No preview available')}</span>}
              </div>
              <label className="admin-field"><span>{adminCopy(lang, 'Tipo', 'Type')}</span><select value={kind} onChange={(event) => updateMediaDraft(key, { media_kind: event.target.value, active: true })}><option value="image">{adminCopy(lang, 'Immagine', 'Image')}</option><option value="video">{adminCopy(lang, 'Video', 'Video')}</option><option value="document">Document</option></select></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'URL media', 'Media URL')}</span><input value={item.file_url || ''} placeholder="/images/... oppure https://..." onChange={(event) => updateMediaDraft(key, { file: null, file_url: event.target.value, file_path: null, media_kind: mediaUrlKindFromValue(event.target.value, kind), active: true })} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Testo alternativo', 'Alt text')} IT</span><input value={item.alt_it || ''} onChange={(event) => updateMediaDraft(key, { alt_it: event.target.value })} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Testo alternativo', 'Alt text')} EN</span><input value={item.alt_en || ''} onChange={(event) => updateMediaDraft(key, { alt_en: event.target.value })} /></label>
              <label className="button secondary media-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.webm" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                updateMediaDraft(key, { file, file_url: URL.createObjectURL(file), file_name: file.name, file_type: file.type, media_kind: file.type.startsWith('video/') ? 'video' : 'image', active: true });
              }} />{adminCopy(lang, 'Carica media', 'Upload media')}</label>
              <button className="button secondary danger" type="button" onClick={() => updateMediaDraft(key, { file: null, file_url: '', file_path: null, file_name: '', file_type: '', active: false })}>{adminCopy(lang, 'Rimuovi media', 'Remove media')}</button>
            </article>
          );
        })}
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
    if (!isSupabaseConfigured) {
      throw new Error(
        adminCopy(
          lang,
          'Supabase non è configurato.',
          'Supabase is not configured.'
        )
      );
    }

    const key = item.media_key || item.key;
    const existing = mediaRows.find((row) => row.media_key === key);

    let uploaded = {};
    let saved = false;

    try {
      // A selected local file uses a temporary blob: URL only for preview.
      // Upload the real file first, then validate and persist the permanent URL.
      if (item.file) {
        uploaded = await uploadSiteMediaFile(
          item.file,
          key,
          session.user.id
        );
      }

      const cleanFileUrl = String(
        uploaded.file_url || item.file_url || ''
      ).trim();

      if (!isSupportedMediaUrl(cleanFileUrl)) {
        throw new Error(
          adminCopy(
            lang,
            'URL media non valido. Usa un URL https:// oppure un percorso che inizia con /.',
            'Invalid media URL. Use an https:// URL or a path starting with /.'
          )
        );
      }

      const keepsExistingStorageFile =
        !item.file &&
        cleanFileUrl &&
        cleanFileUrl === existing?.file_url;

      await upsertSiteMedia({
        media_key: key,
        label_it: item.label_it || item.it || key,
        label_en: item.label_en || item.en || key,
        alt_it: item.alt_it || item.label_it || key,
        alt_en: item.alt_en || item.label_en || key,
        file_url: cleanFileUrl || null,
        file_path:
          uploaded.file_path ||
          (keepsExistingStorageFile ? existing?.file_path : null),
        file_name:
          uploaded.file_name ||
          (
            keepsExistingStorageFile
              ? (item.file_name || existing?.file_name)
              : (item.file_name || null)
          ),
        file_type:
          uploaded.file_type ||
          (
            keepsExistingStorageFile
              ? (item.file_type || existing?.file_type)
              : (item.file_type || null)
          ),
        media_kind:
          uploaded.media_kind ||
          item.media_kind ||
          mediaUrlKindFromValue(cleanFileUrl, 'image'),
        active: item.active !== false,
        updated_by: session.user.id
      });

      saved = true;

      // Once the database points to the new URL (or no URL), clean up the
      // previous Storage object if it is no longer referenced.
      const shouldRemoveExistingStorageFile =
        Boolean(existing?.file_path) &&
        (
          (item.file && existing.file_path !== uploaded.file_path) ||
          (!item.file && cleanFileUrl !== existing?.file_url)
        );

      if (shouldRemoveExistingStorageFile) {
        try {
          await removeSiteMediaFile(existing.file_path);
        } catch {
          // The database save succeeded. A failed cleanup must not turn a
          // successful CMS update into a user-visible save failure.
        }
      }
    } catch (error) {
      // If a new upload was created but the database save failed, remove the
      // orphaned upload and keep the previously stored media untouched.
      if (!saved && uploaded?.file_path) {
        try {
          await removeSiteMediaFile(uploaded.file_path);
        } catch {
          // Preserve the original save error.
        }
      }

      throw error;
    }
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
      {!loading && <LatestNewsEditor lang={lang} contentMap={contentMap} updateContentDraft={updateContentDraft} />}
      {!loading && <SocialLinksEditor lang={lang} contentMap={contentMap} updateContentDraft={updateContentDraft} />}
      {!loading && <MediaQuickEditorPanel lang={lang} mediaMap={mediaMap} updateMediaDraft={updateMediaDraft} contentMap={contentMap} updateContentDraft={updateContentDraft} page={page} />}
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
        return <ReviewsPage lang={lang} siteContent={siteContent} editor={editor} EditableTextComponent={EditableText} />;
      case 'social':
        return <SocialPage lang={lang} siteContent={siteContent} editor={editor} />;
      case 'latestNews':
        return <LatestNewsPage lang={lang} siteContent={siteContent} editor={editor} />;
      case 'contact':
        return <ContactForm lang={lang} formState={formState} setFormState={setFormState} siteMedia={siteMedia} siteContent={siteContent} editor={editor} />;
      case 'home':
      default:
        return <Hero lang={lang} setActivePage={setPage} scrollToForm={disabledActionNotice} fillForm={null} siteMedia={siteMedia} siteContent={siteContent} editor={editor} />;
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
    const mediaKind = item.media_kind || mediaUrlKindFromValue(item.file_url, 'image');
    return (
      <aside className="editor-inspector media-editor-inspector">
        <div className="inspector-heading"><span className="kicker">{adminCopy(lang, 'Media', 'Media')}</span><h2>{selected.label}</h2><p>{selected.key}</p></div>
        {item.file_url && (mediaKind === 'video' ? <video className="inspector-media-preview" src={item.file_url} controls /> : <img className="inspector-media-preview" src={item.file_url} alt={editorLang === 'it' ? item.alt_it : item.alt_en} onError={(event) => { event.currentTarget.style.display = 'none'; }} />)}
        <label className="admin-field"><span>{adminCopy(lang, 'Tipo', 'Type')}</span><select value={mediaKind} onChange={(event) => updateMediaDraft(selected.key, { media_kind: event.target.value })}><option value="image">{adminCopy(lang, 'Immagine', 'Image')}</option><option value="video">{adminCopy(lang, 'Video', 'Video')}</option><option value="document">Document</option></select></label>
        <label className="admin-field full"><span>{adminCopy(lang, 'URL media', 'Media URL')}</span><input value={item.file_url || ''} placeholder="/images/... oppure https://..." onChange={(event) => updateMediaDraft(selected.key, { file: null, file_url: event.target.value, file_path: null, media_kind: mediaUrlKindFromValue(event.target.value, mediaKind), active: true })} /></label>
        <label className="admin-field full"><span>{adminCopy(lang, 'Carica media', 'Upload media')}</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.webm" onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          updateMediaDraft(selected.key, { file, file_url: URL.createObjectURL(file), file_name: file.name, file_type: file.type, media_kind: file.type.startsWith('video/') ? 'video' : 'image', active: true });
        }} /></label>
        <label className="admin-field full"><span>{adminCopy(lang, 'Testo alternativo', 'Alt text')} IT</span><input value={item.alt_it || ''} onChange={(event) => updateMediaDraft(selected.key, { alt_it: event.target.value })} /></label>
        <label className="admin-field full"><span>{adminCopy(lang, 'Testo alternativo', 'Alt text')} EN</span><input value={item.alt_en || ''} onChange={(event) => updateMediaDraft(selected.key, { alt_en: event.target.value })} /></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Posizione immagine', 'Image position')}</span><select value={item.image_position || 'center'} onChange={(event) => updateMediaDraft(selected.key, { image_position: event.target.value })}><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Dimensione immagine', 'Image size')}</span><select value={item.image_size || 'normal'} onChange={(event) => updateMediaDraft(selected.key, { image_size: event.target.value })}><option value="compact">Compact</option><option value="normal">Normal</option><option value="large">Large</option></select></label>
        <label className="check-field"><input type="checkbox" checked={item.active !== false} onChange={(event) => updateMediaDraft(selected.key, { active: event.target.checked })} /> {adminCopy(lang, 'Visibile', 'Visible')}</label>
        <div className="inspector-actions"><button className="button primary" type="button" onClick={onSave} disabled={!canSave}>{adminCopy(lang, 'Salva selezione', 'Save selected')}</button><button className="button secondary" type="button" onClick={onReset}>{adminCopy(lang, 'Ripristina default', 'Reset to default')}</button><button className="button secondary danger" type="button" onClick={() => updateMediaDraft(selected.key, { file: null, file_url: '', file_path: null, file_name: '', file_type: '', active: false })}>{adminCopy(lang, 'Rimuovi media', 'Remove media')}</button></div>
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
                <label className="button secondary"><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf,.jpg,.jpeg,.png,.webp,.mp4,.webm,.pdf" onChange={(event) => saveMedia(definition.key, event.target.files?.[0])} />{adminCopy(lang, 'Carica / sostituisci', 'Upload / replace')}</label>
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
    markFormFieldStarted(formJourneyRef.current?.journey_id, key, { ...sourceMetadata, step_index: step, step_key: key });
    markFormActivity(formJourneyRef.current?.journey_id, { has_selected_experience: key === 'experienceId' ? Boolean(value) : Boolean(form.experienceId), has_selected_date: key === 'customDate' ? Boolean(value) : Boolean(form.customDate || form.dateMode === 'flexible'), has_people_count: true });
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
    ['booking_code_expected', 'Codice prenotazione atteso', 'Expected booking-code income'],
    ['gift_card', 'Gift Card', 'Gift Card'],
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

function formatMoney(amount, currency = 'EUR', lang = 'it') {
  return formatCurrencyAmount(amount, currency, lang === 'en' ? 'en-GB' : 'it-IT');
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
  return financeEntryHasBusinessSource(entry) || Boolean(entry.linkedBooking || entry.linkedFixedExcursion || entry.linkedLeaflet);
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
  const totalsByCurrency = new Map();
  filtered.forEach((entry) => { const currency = normalizeCurrency(entry.currency); totalsByCurrency.set(currency, (totalsByCurrency.get(currency) || 0) + Number(entry.amount || 0)); });
  const map = new Map();
  filtered.forEach((entry) => {
    const categoryKey = entry.category || (type === 'income' ? 'other_income' : 'other_expense');
    const currency = normalizeCurrency(entry.currency);
    const key = `${categoryKey}::${currency}`;
    const current = map.get(key) || { key, categoryKey, currency, type, entries: [], total: 0 };
    current.entries.push(entry);
    current.total += Number(entry.amount || 0);
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => b.total - a.total).map((item) => ({ ...item, percentage: (totalsByCurrency.get(item.currency) || 0) > 0 ? Math.round((item.total / totalsByCurrency.get(item.currency)) * 100) : 0 }));
}

function isVoidedFinanceEntry(entry) {
  return ['cancelled', 'void', 'voided'].includes(String(entry.status || '').toLowerCase()) || entry.active === false;
}

function isExpectedFinanceEntry(entry) {
  return ['pending', 'expected'].includes(String(entry.status || '').toLowerCase());
}

function calculateFinanceSummary(entries) {
  const activeEntries = entries.filter((entry) => !isVoidedFinanceEntry(entry));
  const ledger = calculateLedgerSummary(entries);
  const linkedBookingEntries = activeEntries.filter((entry) => entry.booking_request_id || entry.linkedBooking);
  const linkedFixedEntries = activeEntries.filter((entry) => entry.fixed_excursion_id || entry.linkedFixedExcursion);
  const unlinkedEntries = activeEntries.filter((entry) => !financeEntryIsLinked(entry));
  return {
    income: ledger.income,
    expenses: ledger.expenses,
    expectedIncome: ledger.expectedIncome,
    net: ledger.net,
    byCurrency: ledger.byCurrency,
    incomeEntries: ledger.incomeEntries,
    expectedEntries: ledger.expectedEntries,
    expenseEntries: ledger.expenseEntries,
    linkedBookingEntries,
    linkedFixedEntries,
    unlinkedEntries,
    incomeCategories: groupFinanceEntriesByCategory(ledger.incomeEntries, 'income'),
    expenseCategories: groupFinanceEntriesByCategory(ledger.expenseEntries, 'expense')
  };
}

function formatCurrencyMetricRows(rows = [], key, lang) {
  if (!rows.length) return formatMoney(0, 'EUR', lang);
  return rows.map((row) => formatMoney(row?.[key] || 0, row.currency || 'EUR', lang)).join(' · ');
}

const ANALYTICS_PERIODS = CANONICAL_ANALYTICS_PERIODS;

function analyticsPeriodLabel(key, lang) {
  return canonicalAnalyticsPeriodLabel(key, lang);
}

function analyticsDateRange(period) {
  return canonicalAnalyticsDateRange(period);
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
const BOOKING_CODE_REDEEM_ATTEMPT_EVENTS = ['booking_code_redeem_attempt', 'booking_code_submitted'];
const BOOKING_CODE_REDEEM_SUCCESS_EVENTS = ['booking_code_redeem_success', 'booking_code_redeemed'];
const BOOKING_CODE_REDEEM_ERROR_EVENTS = ['booking_code_redeem_error', 'booking_code_invalid'];
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
  const raw = String(metadata.utm_source || row.traffic_source || row.referrer_domain || '').toLowerCase().replace(/[-\s]+/g, '_');
  const medium = String(metadata.utm_medium || '').toLowerCase().replace(/[-\s]+/g, '_');
  if (raw.includes('referral') || medium === 'customer') return 'customer_referral';
  if (raw.includes('instagram') || raw === 'ig') return 'instagram';
  if (raw.includes('whatsapp') || raw === 'wa') return 'whatsapp';
  if (raw.includes('facebook') || raw === 'fb') return 'facebook';
  if (raw.includes('google_business_profile') || raw.includes('google_my_business') || raw === 'gbp') return 'google_business_profile';
  if (raw.includes('google')) return 'google';
  if (raw.includes('partner') || medium === 'partner') return 'partner';
  if (raw.includes('tiktok') || raw === 'tt') return 'tiktok';
  if (!raw || raw === 'direct') return 'direct';
  if (medium === 'share' && raw.includes('whatsapp')) return 'whatsapp';
  return 'other';
}

function trafficSourceLabel(source, lang) {
  if (source === 'direct') return adminCopy(lang, 'Diretto', 'Direct');
  if (source === 'whatsapp') return adminCopy(lang, 'WhatsApp condiviso', 'WhatsApp share');
  if (source === 'google_business_profile') return 'Google Business Profile';
  if (source === 'partner') return adminCopy(lang, 'Partner', 'Partner');
  if (source === 'tiktok') return 'TikTok';
  if (source === 'customer_referral' || source === 'referral') return adminCopy(lang, 'Referral cliente', 'Customer referral');
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
  if (range.to && time >= new Date(range.to).getTime()) return false;
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

function eventBookingRequestId(event) {
  return String(eventMeta(event, 'booking_request_id') || eventMeta(event, 'request_id') || '').trim();
}

function eventBookingJourneyId(event) {
  return String(eventMeta(event, 'booking_journey_id') || eventMeta(event, 'analytics_journey_id') || '').trim();
}

function requestBookingJourneyId(request = {}) {
  return String(request.analytics_journey_id || request.booking_journey_id || '').trim();
}

function requestAnalyticsSessionId(request = {}) {
  return String(request.analytics_session_id || '').trim();
}

function requestCreatedAtTime(request) {
  const time = new Date(request?.created_at || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function eventOccurredAtTime(event) {
  const time = new Date(event?.occurred_at || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function trackingIncompleteLabel(lang) {
  return adminCopy(lang, 'Tracciamento incompleto', 'Incomplete tracking');
}

function isAdminManualRequest(request = {}) {
  return Boolean(request.created_by_admin) || ['manual', 'admin_manual'].includes(String(request.source || '').trim());
}

function normalizedPublicRequestSource(request = {}) {
  const source = String(request.source || '').trim();
  return source || 'website';
}

function isWebsiteFormRequest(request = {}) {
  if (isAdminManualRequest(request)) return false;
  return ['website', 'public_website', 'unknown'].includes(normalizedPublicRequestSource(request));
}

function isBookingCodeRequest(request = {}) {
  if (isAdminManualRequest(request)) return false;
  return normalizedPublicRequestSource(request) === 'booking_code';
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
  return (requests || []).filter((request) => periodContains(request, range) && isWebsiteFormRequest(request)).length;
}

function confirmedBookingRequestsInPeriod(requests, range) {
  return (requests || []).filter((request) => periodContains(request, range) && isWebsiteFormRequest(request) && ['accepted', 'confirmed', 'completed'].includes(request.status)).length;
}

function confirmedBookingCodeRequestsInPeriod(requests, range) {
  return (requests || []).filter((request) => periodContains(request, range) && isBookingCodeRequest(request) && ['accepted', 'confirmed', 'completed'].includes(request.status)).length;
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
      form_events: 0
    };
    map.set(key, row);
    return row;
  }

  (bookingRequests || []).filter((request) => periodContains(request, range)).forEach((request) => {
    const row = ensure(request.heard_about_us);
    row.booking_requests += 1;
    if (['accepted', 'confirmed', 'completed'].includes(request.status)) row.confirmed_bookings += 1;
  });

  (events || []).forEach((event) => {
    const source = eventMeta(event, 'heard_about_us');
    if (!source) return;
    const row = ensure(source);
    if (['whatsapp_click', 'email_click', 'phone_click'].includes(event.event_name)) row.contact_events += 1;
    if (['booking_form_field_start', 'booking_form_submit_attempt', 'booking_form_submit_success', 'booking_request_created'].includes(event.event_name)) row.form_events += 1;
  });

  return [...map.values()]
    .filter((row) => row.booking_requests || row.confirmed_bookings || row.contact_events || row.form_events)
    .map((row) => ({ ...row, details: '—' }))
    .sort((a, b) => (b.booking_requests + b.contact_events + b.form_events) - (a.booking_requests + a.contact_events + a.form_events));
}

function buildBookingRequestTrackingIntegrity({ requests = [], events = [], range, lang, isSubmitAttemptEvent, isSubmitSuccessEvent, isBookingCodeRedeemAttemptEvent, isBookingCodeRedeemSuccessEvent }) {
  const eventsByRequestId = new Map();
  const eventsByJourneyId = new Map();
  events.forEach((event) => {
    const requestId = eventBookingRequestId(event);
    if (requestId) {
      const list = eventsByRequestId.get(requestId) || [];
      list.push(event);
      eventsByRequestId.set(requestId, list);
    }
    const journeyId = eventBookingJourneyId(event);
    if (journeyId) {
      const list = eventsByJourneyId.get(journeyId) || [];
      list.push(event);
      eventsByJourneyId.set(journeyId, list);
    }
  });

  const legacySuccessEvents = events.filter((event) => isSubmitSuccessEvent(event) && !eventBookingRequestId(event) && !eventBookingJourneyId(event));
  const legacyAttemptEvents = events.filter((event) => isSubmitAttemptEvent(event) && !eventBookingRequestId(event) && !eventBookingJourneyId(event));
  const formOpenEvents = events.filter((event) => event.event_name === 'booking_form_open' && !eventBookingJourneyId(event));

  function legacyMatches(request, candidates) {
    const requestTime = requestCreatedAtTime(request);
    const requestKey = requestExperienceKeyFromRequest(request, lang);
    return candidates.filter((event) => {
      const eventTime = eventOccurredAtTime(event);
      if (!requestTime || !eventTime || Math.abs(requestTime - eventTime) > 2 * 60 * 60 * 1000) return false;
      return eventExperienceKey(event, lang) === requestKey;
    });
  }

  return (requests || [])
    .filter((request) => periodContains(request, range))
    .map((request) => {
      const id = String(request.id || '').trim();
      const journeyId = requestBookingJourneyId(request);
      const matchedEventsById = id ? (eventsByRequestId.get(id) || []) : [];
      const matchedEventsByJourney = journeyId ? (eventsByJourneyId.get(journeyId) || []) : [];
      const allProperEvents = [...matchedEventsById, ...matchedEventsByJourney].filter((event, index, array) => array.findIndex((candidate) => candidate.id === event.id) === index);

      const matchedAttemptById = matchedEventsById.find(isSubmitAttemptEvent);
      const matchedSuccessById = matchedEventsById.find(isSubmitSuccessEvent);
      const matchedCreatedById = matchedEventsById.find((event) => event.event_name === 'booking_request_created');
      const matchedFormOpenById = matchedEventsById.find((event) => event.event_name === 'booking_form_open');
      const matchedAttemptByJourney = matchedEventsByJourney.find(isSubmitAttemptEvent);
      const matchedSuccessByJourney = matchedEventsByJourney.find(isSubmitSuccessEvent);
      const matchedCreatedByJourney = matchedEventsByJourney.find((event) => event.event_name === 'booking_request_created');
      const matchedFormOpenByJourney = matchedEventsByJourney.find((event) => event.event_name === 'booking_form_open');
      const matchedCodeAttemptById = matchedEventsById.find(isBookingCodeRedeemAttemptEvent);
      const matchedCodeSuccessById = matchedEventsById.find(isBookingCodeRedeemSuccessEvent);
      const matchedCodeAttemptByJourney = matchedEventsByJourney.find(isBookingCodeRedeemAttemptEvent);
      const matchedCodeSuccessByJourney = matchedEventsByJourney.find(isBookingCodeRedeemSuccessEvent);

      const legacyAttempts = (matchedAttemptById || matchedAttemptByJourney) ? [] : legacyMatches(request, legacyAttemptEvents);
      const legacySuccesses = (matchedSuccessById || matchedSuccessByJourney) ? [] : legacyMatches(request, legacySuccessEvents);
      const legacyFormOpens = (journeyId || matchedEventsById.length) ? [] : legacyMatches(request, formOpenEvents);

      const hasAttempt = Boolean(matchedAttemptById || matchedAttemptByJourney);
      const hasSuccess = Boolean(matchedSuccessById || matchedSuccessByJourney);
      const hasCreated = Boolean(matchedCreatedById || matchedCreatedByJourney);
      const hasFormOpen = Boolean(matchedFormOpenById || matchedFormOpenByJourney || legacyFormOpens.length);
      const adminManual = isAdminManualRequest(request);
      const bookingCodeRequest = isBookingCodeRequest(request);
      const hasCodeAttempt = Boolean(matchedCodeAttemptById || matchedCodeAttemptByJourney);
      const hasCodeSuccess = Boolean(matchedCodeSuccessById || matchedCodeSuccessByJourney);
      const hasJourneyOnlySuccess = Boolean(!matchedSuccessById && matchedSuccessByJourney);
      const hasRequestIdSuccess = Boolean(matchedSuccessById);
      const hasRequestIdCreatedOnly = Boolean(!hasSuccess && matchedCreatedById);
      const hasJourneyCreatedOnly = Boolean(!hasSuccess && !matchedCreatedById && matchedCreatedByJourney);
      const hasLegacyOnly = Boolean(legacySuccesses.length || legacyAttempts.length || legacyFormOpens.length);

      const matchMethod = adminManual
        ? 'admin_manual'
        : bookingCodeRequest
          ? (hasCodeSuccess ? 'booking_code_redeem_success' : hasCodeAttempt ? 'booking_code_redeem_attempt_only' : 'booking_code_tracking_separate')
          : hasRequestIdSuccess
            ? 'matched_by_booking_request_id'
            : hasJourneyOnlySuccess
              ? 'matched_by_journey_id'
              : hasRequestIdCreatedOnly
                ? 'matched_created_event_only_by_booking_request_id'
                : hasJourneyCreatedOnly
                  ? 'matched_created_event_only_by_journey_id'
                  : hasLegacyOnly
                    ? 'matched_by_legacy_heuristic'
                    : 'missing_submit_tracking';

      const createdDate = String(request.created_at || '').slice(0, 10);
      const legacyCutoff = '2026-06-29';
      const bookingCodeCutoff = '2026-07-04';
      const status = adminManual
        ? 'admin_manual'
        : bookingCodeRequest
          ? (hasCodeSuccess
            ? 'booking_code_redeem_success'
            : createdDate && createdDate < bookingCodeCutoff
              ? 'booking_code_legacy_untracked'
              : 'booking_code_missing_redeem_success')
          : hasRequestIdSuccess
            ? 'matched_by_booking_request_id'
            : hasJourneyOnlySuccess
              ? 'matched_by_journey_id'
              : hasRequestIdCreatedOnly || hasJourneyCreatedOnly
                ? 'created_event_without_submit_success'
                : hasLegacyOnly
                  ? 'matched_by_legacy_heuristic'
                  : createdDate && createdDate < legacyCutoff
                    ? 'legacy_missing_tracking'
                    : 'missing_submit_tracking';

      return {
        booking_request_id: id || null,
        analytics_journey_id: journeyId || null,
        analytics_session_id: requestAnalyticsSessionId(request) || null,
        created_at: request.created_at,
        request_type: request.request_type,
        experience_id: request.experience_id,
        source: request.source || 'website',
        created_by_admin: Boolean(request.created_by_admin),
        matched_submit_attempt: hasAttempt,
        matched_submit_success: hasSuccess,
        matched_booking_request_created_event: hasCreated,
        matched_form_open: hasFormOpen,
        matched_booking_code_redeem_attempt: hasCodeAttempt,
        matched_booking_code_redeem_success: hasCodeSuccess,
        legacy_matched_submit_attempt: Boolean(legacyAttempts.length),
        legacy_matched_submit_success: Boolean(legacySuccesses.length),
        legacy_matched_form_open: Boolean(legacyFormOpens.length),
        submit_attempt_at: (matchedAttemptById || matchedAttemptByJourney)?.occurred_at || null,
        submit_success_at: (matchedSuccessById || matchedSuccessByJourney)?.occurred_at || null,
        booking_request_created_event_at: (matchedCreatedById || matchedCreatedByJourney)?.occurred_at || null,
        booking_code_redeem_attempt_at: (matchedCodeAttemptById || matchedCodeAttemptByJourney)?.occurred_at || null,
        booking_code_redeem_success_at: (matchedCodeSuccessById || matchedCodeSuccessByJourney)?.occurred_at || null,
        proper_event_count: allProperEvents.length,
        tracking_match_method: matchMethod,
        tracking_integrity_status: status,
        heard_about_us: normalizeHeardAboutUs(request.heard_about_us, { allowAdmin: true }) || null,
        heard_about_us_label: heardAboutUsLabel(request.heard_about_us, lang, { fallback: '' }) || null,
        // Analytics diagnostics intentionally retain only the categorical source.
        // Free-form "Other" text remains a booking-record concern, not analytics data.
        heard_about_us_display: heardAboutUsLabel(request.heard_about_us, lang, { fallback: '' }) || null
      };
    });
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
  const bookingCodeRedeemAttempts = eventCountAny(events, BOOKING_CODE_REDEEM_ATTEMPT_EVENTS);
  const bookingCodeRedeemSuccesses = eventCountAny(events, BOOKING_CODE_REDEEM_SUCCESS_EVENTS);
  const bookingCodeRedeemErrors = eventCountAny(events, BOOKING_CODE_REDEEM_ERROR_EVENTS);
  const bookingRequestCreatedEvents = eventCount(events, 'booking_request_created');
  const websiteRequestRows = (bookingRequests || []).filter((request) => periodContains(request, range) && isWebsiteFormRequest(request));
  const bookingCodeRequestRows = (bookingRequests || []).filter((request) => periodContains(request, range) && isBookingCodeRequest(request));
  const websiteRequestIds = new Set(websiteRequestRows.map((request) => String(request.id || '').trim()).filter(Boolean));
  const adminManualRequestRows = (bookingRequests || []).filter((request) => periodContains(request, range) && isAdminManualRequest(request));
  const websiteRequests = websiteRequestRows.length;
  const bookingCodeRequests = bookingCodeRequestRows.length;
  const bookingRequestCount = Math.max(websiteRequests + bookingCodeRequests, bookingRequestCreatedEvents, submitSuccesses + bookingCodeRedeemSuccesses);
  const confirmedRequests = confirmedBookingRequestsInPeriod(bookingRequests, range);
  const confirmedBookingCodeRequests = confirmedBookingCodeRequestsInPeriod(bookingRequests, range);
  const visitors = uniqueCount(events, 'visitor_id') || uniqueCount(sessions, 'visitor_id');
  const whatsappClicks = eventCount(events, 'whatsapp_click');
  const emailClicks = eventCount(events, 'email_click');
  const phoneClicks = eventCount(events, 'phone_click');
  const mapsClicks = eventCountAny(events, MAP_CLICK_EVENTS);
  const contactClicks = whatsappClicks + emailClicks + phoneClicks;
  const conversionBase = visitors || pageViews;
  const averageSeconds = averageEngagementSeconds(sessions, events);
  const pageViewEvents = events.filter((event) => event.event_name === 'page_view');
  const experienceCardImpressions = eventCount(events, 'experience_card_view');
  const experienceDetailOpens = eventCount(events, 'experience_detail_open');
  const legacyExcursionViews = eventCount(events, 'excursion_view');
  const experienceViews = experienceDetailOpens || legacyExcursionViews;
  const sourceTotal = pageViewEvents.length || events.length || 1;
  const directTrafficCount = pageViewEvents.filter((event) => normalizedTrafficSourceForAnalytics(event) === 'direct').length;
  const directTrafficShare = sourceTotal ? directTrafficCount / sourceTotal : 0;
  const mobileCount = pageViewEvents.filter((event) => event.device_type === 'mobile').length;
  const mobileShare = pageViewEvents.length ? mobileCount / pageViewEvents.length : 0;
  const formJourneysStarted = eventCount(events, 'form_journey_started');
  const abandonedForms = eventCount(events, 'abandoned_form_detected');
  const recoveredByWhatsapp = eventCount(events, 'abandoned_form_recovered_whatsapp');
  const journeySubmitSuccesses = eventCount(events, 'form_submit_success');
  const abandonmentRate = percent(abandonedForms, formJourneysStarted || formOpens || fieldStarts);
  const recoveryRate = percent(recoveredByWhatsapp, abandonedForms);

  function isSubmitAttemptEvent(event) { return event.event_name === 'booking_form_submit_attempt' || (!hasNewSubmitAttempts && event.event_name === 'booking_submit_attempt'); }
  function isValidationErrorEvent(event) { return event.event_name === 'booking_form_validation_error' || (!hasNewValidationErrors && event.event_name === 'booking_submit_validation_error'); }
  function isSubmitSuccessEvent(event) { return event.event_name === 'booking_form_submit_success' || (!hasNewSubmitSuccesses && ['booking_submit_success', 'booking_submit'].includes(event.event_name)); }
  function isSubmitErrorEvent(event) { return event.event_name === 'booking_form_submit_error' || (!hasNewSubmitErrors && event.event_name === 'booking_submit_error'); }
  function isBookingCodeRedeemAttemptEvent(event) { return BOOKING_CODE_REDEEM_ATTEMPT_EVENTS.includes(event.event_name); }
  function isBookingCodeRedeemSuccessEvent(event) { return BOOKING_CODE_REDEEM_SUCCESS_EVENTS.includes(event.event_name); }
  function isMapClickEvent(event) { return event.event_name === 'google_maps_click' || (!hasNewMapClicks && event.event_name === 'maps_click'); }

  const sourceRows = ['direct', 'customer_referral', 'instagram', 'facebook', 'whatsapp', 'google_business_profile', 'google', 'partner', 'tiktok', 'other'].map((source) => ({
    label: trafficSourceLabel(source, lang),
    count: pageViewEvents.filter((event) => normalizedTrafficSourceForAnalytics(event) === source).length
  }));
  const countryRows = topRows(pageViewEvents, (event) => event.country_name || event.country_code, 6, lang);
  const cityRows = topRows(pageViewEvents, (event) => event.city, 6, lang);
  const topPageRows = topRows(pageViewEvents, (event) => normalizeAnalyticsPath(event.section || event.path), 7, lang);
  const experienceDemandEvents = experienceDetailOpens ? events.filter((event) => event.event_name === 'experience_detail_open') : events.filter((event) => event.event_name === 'excursion_view');
  const experienceRows = topRows(experienceDemandEvents, (event) => event.metadata?.experience_slug || event.metadata?.experience_id || event.metadata?.experience || event.metadata?.slug, 6, lang);
  const deviceRows = topRows(pageViewEvents, (event) => event.device_type, 5, lang);
  const browserRows = topRows(pageViewEvents, (event) => event.browser, 5, lang);
  const osRows = topRows(pageViewEvents, (event) => event.operating_system, 5, lang);
  const languageRows = [
    { label: adminCopy(lang, 'Pagine in italiano', 'Italian page views'), count: pageViewEvents.filter((event) => event.language === 'it').length, helper: uniqueCount(pageViewEvents.filter((event) => event.language === 'it'), 'visitor_id') },
    { label: adminCopy(lang, 'Pagine in inglese', 'English page views'), count: pageViewEvents.filter((event) => event.language === 'en').length, helper: uniqueCount(pageViewEvents.filter((event) => event.language === 'en'), 'visitor_id') },
    { label: adminCopy(lang, 'Cambi lingua', 'Language switches'), count: eventCount(events, 'language_switch') }
  ];
  const flowRows = [
    { label: adminCopy(lang, 'Visualizzazioni pagina', 'Page views'), count: pageViews },
    { label: adminCopy(lang, 'Impression card esperienze', 'Experience card impressions'), count: experienceCardImpressions },
    { label: adminCopy(lang, 'Aperture dettaglio esperienze', 'Experience detail opens'), count: experienceViews },
    { label: adminCopy(lang, 'Aperture modulo prenotazione', 'Booking form starts'), count: formOpens },
    { label: adminCopy(lang, 'Avvii compilazione modulo', 'Booking form field starts'), count: fieldStarts },
    { label: adminCopy(lang, 'Journey form avviati', 'Form journeys started'), count: formJourneysStarted },
    { label: adminCopy(lang, 'Form abbandonati', 'Abandoned forms'), count: abandonedForms },
    { label: adminCopy(lang, 'Recuperi WhatsApp', 'WhatsApp recoveries'), count: recoveredByWhatsapp },
    { label: adminCopy(lang, 'Tentativi invio modulo', 'Booking form submit attempts'), count: submitAttempts },
    { label: adminCopy(lang, 'Invii riusciti tracciati', 'Tracked successful submissions'), count: submitSuccesses },
    { label: adminCopy(lang, 'Richieste modulo sito create', 'Created website form requests'), count: websiteRequests },
    { label: adminCopy(lang, 'Richieste con codice create', 'Created booking-code requests'), count: bookingCodeRequests },
    { label: adminCopy(lang, 'Riscatti codice riusciti', 'Booking-code redeem successes'), count: bookingCodeRedeemSuccesses },
    { label: adminCopy(lang, 'Richieste create totali', 'Total created requests'), count: bookingRequestCount },
    { label: adminCopy(lang, 'Click WhatsApp', 'WhatsApp clicks'), count: whatsappClicks },
    { label: adminCopy(lang, 'Click email', 'Email clicks'), count: emailClicks },
    { label: adminCopy(lang, 'Click telefono', 'Phone clicks'), count: phoneClicks },
    { label: adminCopy(lang, 'Click Google Maps', 'Google Maps clicks'), count: mapsClicks }
  ];

  const mainFunnelSteps = [
    { label: adminCopy(lang, 'Visualizzazioni pagina', 'Page views'), count: pageViews },
    { label: adminCopy(lang, 'Aperture dettaglio esperienze', 'Experience detail opens'), count: experienceViews },
    { label: adminCopy(lang, 'Aperture modulo prenotazione', 'Booking form opens'), count: formOpens },
    { label: adminCopy(lang, 'Avvii compilazione', 'Field starts'), count: fieldStarts },
    { label: adminCopy(lang, 'Tentativi invio modulo', 'Form submit attempts'), count: submitAttempts },
    { label: adminCopy(lang, 'Errori validazione', 'Validation errors'), count: validationErrors },
    { label: adminCopy(lang, 'Invii riusciti tracciati', 'Tracked successful submissions'), count: submitSuccesses },
    { label: adminCopy(lang, 'Errori invio', 'Submit errors'), count: submitErrors },
    { label: adminCopy(lang, 'Richieste modulo sito create', 'Website form requests created'), count: websiteRequests },
    { label: adminCopy(lang, 'Richieste con codice create', 'Booking-code requests created'), count: bookingCodeRequests }
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
      card_impressions: 0,
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
    if (event.event_name === 'experience_card_view') row.card_impressions += 1;
    if (event.event_name === 'experience_detail_open') { row.detail_opens += 1; row.experience_views += 1; }
    if (!experienceDetailOpens && event.event_name === 'excursion_view') row.experience_views += 1;
    if (event.event_name === 'booking_form_open') row.form_opens += 1;
    if (isSubmitAttemptEvent(event)) row.submit_attempts += 1;
    if (isSubmitSuccessEvent(event)) row.submit_successes += 1;
    if (isSubmitErrorEvent(event)) row.submit_errors += 1;
    if (event.event_name === 'booking_request_created' && String(eventMeta(event, 'source') || '').trim() !== 'booking_code') {
      const eventRequestId = eventBookingRequestId(event);
      if (!eventRequestId || !websiteRequestIds.has(eventRequestId)) row.booking_requests += 1;
    }
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
      view_to_request: row.booking_requests && (!(row.experience_views || row.detail_opens) || row.booking_requests > (row.experience_views || row.detail_opens)) ? trackingIncompleteLabel(lang) : percent(row.booking_requests, row.experience_views || row.detail_opens),
      form_to_request: row.booking_requests && (!row.form_opens || row.booking_requests > row.form_opens) ? trackingIncompleteLabel(lang) : percent(row.booking_requests, row.form_opens)
    }))
    .filter((row) => row.experience_views || row.detail_opens || row.form_opens || row.submit_attempts || row.submit_successes || row.booking_requests || row.whatsapp_clicks || row.email_clicks || row.phone_clicks)
    .sort((a, b) => (b.booking_requests + b.form_opens + b.whatsapp_clicks + b.email_clicks + b.phone_clicks) - (a.booking_requests + a.form_opens + a.whatsapp_clicks + a.email_clicks + a.phone_clicks))
    .slice(0, 14);

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
    if (event.event_name === 'experience_card_view') row.card_impressions += 1;
    if (event.event_name === 'experience_detail_open') { row.detail_opens += 1; row.experience_views += 1; }
    if (!experienceDetailOpens && event.event_name === 'excursion_view') row.experience_views += 1;
    if (event.event_name === 'calendar_date_select') row.calendar_date_selections += 1;
    if (event.event_name === 'booking_form_open') row.form_opens += 1;
    if (event.event_name === 'booking_form_field_start') row.field_starts += 1;
    if (isSubmitAttemptEvent(event)) row.submit_attempts += 1;
    if (isValidationErrorEvent(event)) row.validation_errors += 1;
    if (isSubmitSuccessEvent(event)) row.submit_successes += 1;
    if (isSubmitErrorEvent(event)) row.submit_errors += 1;
    if (event.event_name === 'booking_request_created' && String(eventMeta(event, 'source') || '').trim() !== 'booking_code') {
      const eventRequestId = eventBookingRequestId(event);
      if (!eventRequestId || !websiteRequestIds.has(eventRequestId)) row.booking_requests += 1;
    }
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

  const trafficAttributionQuality = ['direct', 'instagram', 'facebook', 'whatsapp', 'google_business_profile', 'google', 'partner', 'tiktok', 'other'].map((source) => ({
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

  const requestTrackingIntegrity = buildBookingRequestTrackingIntegrity({ requests: bookingRequests, events, range, lang, isSubmitAttemptEvent, isSubmitSuccessEvent, isBookingCodeRedeemAttemptEvent, isBookingCodeRedeemSuccessEvent });
  const websiteFormRequestTrackingIntegrity = requestTrackingIntegrity.filter((row) => isWebsiteFormRequest(row));
  const bookingCodeRequestTrackingIntegrity = requestTrackingIntegrity.filter((row) => isBookingCodeRequest(row));
  const requestsMatchedByBookingRequestId = websiteFormRequestTrackingIntegrity.filter((row) => row.tracking_integrity_status === 'matched_by_booking_request_id').length;
  const requestsMatchedByJourneyId = websiteFormRequestTrackingIntegrity.filter((row) => row.tracking_integrity_status === 'matched_by_journey_id').length;
  const requestsMatchedByLegacyHeuristic = websiteFormRequestTrackingIntegrity.filter((row) => row.tracking_integrity_status === 'matched_by_legacy_heuristic').length;
  const requestsCreatedEventOnly = websiteFormRequestTrackingIntegrity.filter((row) => row.tracking_integrity_status === 'created_event_without_submit_success').length;
  const requestsWithTrackedSubmit = requestsMatchedByBookingRequestId + requestsMatchedByJourneyId;
  const websiteSubmitGapStatuses = ['missing_submit_tracking', 'legacy_missing_tracking', 'created_event_without_submit_success', 'matched_by_legacy_heuristic'];
  const websiteSubmitGapRows = websiteFormRequestTrackingIntegrity.filter((row) => websiteSubmitGapStatuses.includes(row.tracking_integrity_status));
  const currentRequestsWithoutTrackedSubmitRows = websiteSubmitGapRows.filter(isCurrentTrackingRecord);
  const historicalRequestsWithoutTrackedSubmitRows = websiteSubmitGapRows.filter((row) => !isCurrentTrackingRecord(row));
  const requestsWithoutTrackedSubmit = websiteSubmitGapRows.length;
  const currentRequestsWithoutTrackedSubmit = currentRequestsWithoutTrackedSubmitRows.length;
  const historicalRequestsWithoutTrackedSubmit = historicalRequestsWithoutTrackedSubmitRows.length;
  const legacyIncompleteRequests = historicalRequestsWithoutTrackedSubmit;
  const websiteSubmitGapDetail = currentRequestsWithoutTrackedSubmit
    ? trackingIncompleteLabel(lang)
    : historicalRequestsWithoutTrackedSubmit
      ? adminCopy(lang, 'Solo storico precedente al contratto di tracking corrente: non viene ricostruito artificialmente.', 'Historical data only, before the current tracking contract: not backfilled artificially.')
      : '—';

  const currentWebsiteFormRows = websiteFormRequestTrackingIntegrity.filter(isCurrentTrackingRecord);
  const currentRequestsWithoutTrackedFormOpenRows = currentWebsiteFormRows.filter((row) => !row.matched_form_open);
  const historicalRequestsWithoutTrackedFormOpenRows = websiteFormRequestTrackingIntegrity.filter((row) => !isCurrentTrackingRecord(row) && !row.matched_form_open);
  const currentFormOpenGapMap = new Map();
  currentRequestsWithoutTrackedFormOpenRows.forEach((row) => {
    const experience = displayExperienceLabel(requestExperienceKeyFromRequest(row, lang), lang);
    currentFormOpenGapMap.set(experience, (currentFormOpenGapMap.get(experience) || 0) + 1);
  });
  const requestsWithoutTrackedFormOpen = [...currentFormOpenGapMap.entries()].map(([experience, booking_requests]) => ({ experience, booking_requests }));
  const currentCanonicalSubmitErrors = events.filter((event) => isSubmitErrorEvent(event) && eventOccurredAtTime(event) >= CURRENT_TRACKING_ACTIVATION_MS);
  const currentSubmitErrors = currentCanonicalSubmitErrors.length;
  const currentSubmitErrorDevices = [...new Set(currentCanonicalSubmitErrors.map((event) => browserDeviceGroup(event)).filter(Boolean))];
  const bookingCodeRequestsWithRedeemSuccess = bookingCodeRequestTrackingIntegrity.filter((row) => row.tracking_integrity_status === 'booking_code_redeem_success').length;
  const bookingCodeRequestsWithoutRedeemSuccess = bookingCodeRequestTrackingIntegrity.filter((row) => ['booking_code_missing_redeem_success', 'booking_code_legacy_untracked'].includes(row.tracking_integrity_status)).length;

  const dataQualityRows = [
    { check: adminCopy(lang, 'Richieste modulo sito create', 'Created website form requests'), count: websiteRequests, detail: adminCopy(lang, 'Solo source=website/public_website/unknown, esclusi codici prenotazione e richieste admin/manuali.', 'Only source=website/public_website/unknown, excluding booking-code and admin/manual requests.') },
    { check: adminCopy(lang, 'Richieste con codice create', 'Created booking-code requests'), count: bookingCodeRequests, detail: adminCopy(lang, 'Tracciate separatamente dal funnel del modulo pubblico.', 'Tracked separately from the public form funnel.') },
    { check: adminCopy(lang, 'Richieste admin/manuali create', 'Created admin/manual requests'), count: adminManualRequestRows.length, detail: adminCopy(lang, 'Escluse dal funnel pubblico sito.', 'Excluded from the public website funnel.') },
    { check: adminCopy(lang, 'Richieste sito con submit_success', 'Website requests with tracked submit_success'), count: requestsWithTrackedSubmit, detail: adminCopy(lang, 'Conta solo match puliti tramite booking_request_id o booking_journey_id con submit_success.', 'Counts only clean booking_request_id or booking_journey_id matches with submit_success.') },
    { check: adminCopy(lang, 'Gap submit correnti', 'Current submit tracking gaps'), count: currentRequestsWithoutTrackedSubmit, detail: currentRequestsWithoutTrackedSubmit ? trackingIncompleteLabel(lang) : '—' },
    { check: adminCopy(lang, 'Gap submit storici esclusi dagli alert', 'Historical submit gaps excluded from alerts'), count: historicalRequestsWithoutTrackedSubmit, detail: websiteSubmitGapDetail },
    { check: adminCopy(lang, 'Richieste sito matchate tramite journey id', 'Website requests matched by journey id'), count: requestsMatchedByJourneyId, detail: adminCopy(lang, 'Match tramite booking_requests.analytics_journey_id = analytics_events.metadata.booking_journey_id.', 'Match via booking_requests.analytics_journey_id = analytics_events.metadata.booking_journey_id.') },
    { check: adminCopy(lang, 'Richieste sito matchate tramite booking_request_id', 'Website requests matched by booking_request_id'), count: requestsMatchedByBookingRequestId, detail: adminCopy(lang, 'Match tramite analytics_events.metadata.booking_request_id.', 'Match via analytics_events.metadata.booking_request_id.') },
    { check: adminCopy(lang, 'Richieste sito matchate solo da euristica legacy', 'Website requests matched only by legacy heuristic'), count: requestsMatchedByLegacyHeuristic, detail: requestsMatchedByLegacyHeuristic ? adminCopy(lang, 'Warning: non contano come invio tracciato correttamente.', 'Warning: these do not count as properly tracked submits.') : '—' },
    { check: adminCopy(lang, 'Eventi richiesta sito senza submit_success', 'Website request events without submit_success'), count: requestsCreatedEventOnly, detail: requestsCreatedEventOnly ? adminCopy(lang, 'Esiste booking_request_created, ma manca booking_form_submit_success.', 'booking_request_created exists, but booking_form_submit_success is missing.') : '—' },
    { check: adminCopy(lang, 'Riscatti codice con redeem_success', 'Booking-code redemptions with redeem_success'), count: bookingCodeRequestsWithRedeemSuccess, detail: adminCopy(lang, 'Match tramite booking_request_id su evento booking_code_redeem_success.', 'Matched by booking_request_id on booking_code_redeem_success event.') },
    { check: adminCopy(lang, 'Richieste codice senza redeem_success', 'Booking-code requests without redeem_success'), count: bookingCodeRequestsWithoutRedeemSuccess, detail: bookingCodeRequestsWithoutRedeemSuccess ? adminCopy(lang, 'Non contano come problema del modulo sito. Verificare solo il tracciamento del riscatto codice.', 'Not counted as a website form issue. Check only booking-code redemption tracking.') : '—' },
    { check: adminCopy(lang, 'Tentativi riscatto codice', 'Booking-code redeem attempts'), count: bookingCodeRedeemAttempts, detail: 'booking_code_redeem_attempt' },
    { check: adminCopy(lang, 'Errori riscatto codice', 'Booking-code redeem errors'), count: bookingCodeRedeemErrors, detail: bookingCodeRedeemErrors ? 'booking_code_redeem_error' : '—' },
    { check: adminCopy(lang, 'Tracciamento legacy incompleto', 'Incomplete legacy tracking'), count: legacyIncompleteRequests, detail: legacyIncompleteRequests ? adminCopy(lang, 'Dati precedenti alla correzione: non vengono ricostruiti artificialmente.', 'Pre-fix data: not backfilled artificially.') : '—' },
    { check: adminCopy(lang, 'Richieste correnti senza apertura modulo tracciata', 'Current website requests without tracked form open'), count: currentRequestsWithoutTrackedFormOpenRows.length, detail: currentRequestsWithoutTrackedFormOpenRows.map((row) => displayExperienceLabel(requestExperienceKeyFromRequest(row, lang), lang)).join(', ') || '—' },
    { check: adminCopy(lang, 'Gap apertura modulo storici', 'Historical form-open gaps'), count: historicalRequestsWithoutTrackedFormOpenRows.length, detail: historicalRequestsWithoutTrackedFormOpenRows.length ? adminCopy(lang, 'Storico escluso dagli alert correnti.', 'Historical records excluded from current alerts.') : '—' },
    { check: adminCopy(lang, 'Aperture modulo senza posizione CTA', 'Form opens without CTA location'), count: formOpenMissingCtaCount, detail: formOpenMissingCtaCount ? adminCopy(lang, 'Aggiornare i CTA che non inviano cta_location.', 'Update CTAs that do not send cta_location.') : '—' },
    { check: adminCopy(lang, 'Form abbandonati', 'Abandoned forms'), count: abandonedForms, detail: `${abandonmentRate} · ${adminCopy(lang, 'recupero WhatsApp', 'WhatsApp recovery')}: ${recoveryRate}` },
    { check: adminCopy(lang, 'Traffico interno escluso', 'Internal traffic excluded'), count: internalEventsExcluded + internalSessionsExcluded, detail: adminCopy(lang, 'Admin, API, CMS/editor, finanze e dashboard analytics esclusi dalle metriche pubbliche.', 'Admin, API, CMS/editor, finance, and analytics dashboard rows excluded from public metrics.') },
    { check: adminCopy(lang, 'Campione insufficiente per conclusioni marketing', 'Sample too small for marketing conclusions'), count: visitors < SMALL_SAMPLE_VISITOR_THRESHOLD ? visitors : 0, detail: visitors < SMALL_SAMPLE_VISITOR_THRESHOLD ? adminCopy(lang, `Sotto ${SMALL_SAMPLE_VISITOR_THRESHOLD} visitatori: usare come diagnostica, non come prova marketing.`, `Below ${SMALL_SAMPLE_VISITOR_THRESHOLD} visitors: use as diagnostics, not as marketing proof.`) : '—' }
  ];

  const warnings = [];
  function addWarning(type, message, helper = '', detail = '') {
    warnings.push({ type, message, helper, detail });
  }
  if (currentRequestsWithoutTrackedSubmit > 0) {
    addWarning(
      'critical',
      adminCopy(lang, 'Il tracciamento del modulo sito è incompleto.', 'Website form tracking is incomplete.'),
      adminCopy(lang, `${currentRequestsWithoutTrackedSubmit} nuove richieste sito senza submit_success tracciato.`, `${currentRequestsWithoutTrackedSubmit} new website requests without tracked submit_success.`),
      adminCopy(
        lang,
        'Sono state create nuove richieste dal sito dopo la correzione del tracciamento, ma manca ancora un evento submit_success corrispondente. Testare il modulo pubblico e verificare che booking_form_submit_attempt, booking_form_submit_success e booking_request_created vengano salvati con lo stesso booking_journey_id o booking_request_id.',
        'New website requests were created after the tracking fix, but a matching submit_success event is still missing. Test the public form and verify booking_form_submit_attempt, booking_form_submit_success, and booking_request_created are written with the same booking_journey_id or booking_request_id.'
      )
    );
  }
  if (bookingCodeRequests > 0 && websiteRequests === 0) {
    addWarning(
      'diagnostic',
      adminCopy(lang, 'Le richieste con codice sono separate dal funnel del modulo pubblico.', 'Booking-code requests are separate from the public form funnel.'),
      adminCopy(lang, `${bookingCodeRequests} richieste con codice create.`, `${bookingCodeRequests} booking-code requests created.`),
      adminCopy(lang, 'Le richieste generate tramite codice prenotazione devono essere diagnosticate nel funnel booking-code, non come errori del modulo pubblico.', 'Requests created through booking codes should be diagnosed in the booking-code funnel, not as public form errors.')
    );
  }
  if (visitors < SMALL_SAMPLE_VISITOR_THRESHOLD) {
    addWarning(
      'diagnostic',
      adminCopy(lang, 'Campione dati ancora piccolo.', 'Small sample size.'),
      adminCopy(lang, `${visitors} visitatori nel periodo.`, `${visitors} visitors in this period.`),
      adminCopy(lang, 'Usa questi numeri per diagnosi tecnica e controlli UX, non ancora per decidere quale canale, campagna o esperienza converte meglio.', 'Use these numbers for technical diagnosis and UX checks only. Do not use them yet to decide which channel, campaign, or experience converts best.')
    );
  }
  if (currentRequestsWithoutTrackedFormOpenRows.length) addWarning('critical', adminCopy(lang, 'Alcune richieste sito correnti non hanno una apertura modulo tracciata.', 'Some current website requests have no tracked form open.'), adminCopy(lang, `${currentRequestsWithoutTrackedFormOpenRows.length} richieste correnti interessate.`, `${currentRequestsWithoutTrackedFormOpenRows.length} current requests affected.`), adminCopy(lang, 'Controllare se i CTA interessati chiamano correttamente booking_form_open con esperienza e tipologia richiesta.', 'Check whether the affected CTAs correctly emit booking_form_open with experience and request type.'));
  else if (historicalRequestsWithoutTrackedFormOpenRows.length) addWarning('diagnostic', adminCopy(lang, 'I gap di apertura modulo rilevati sono storici.', 'Detected form-open gaps are historical.'), adminCopy(lang, `${historicalRequestsWithoutTrackedFormOpenRows.length} record storici esclusi dagli alert correnti.`, `${historicalRequestsWithoutTrackedFormOpenRows.length} historical records excluded from current alerts.`), adminCopy(lang, 'Non ricostruire artificialmente eventi precedenti al contratto di tracking corrente.', 'Do not artificially backfill events created before the current tracking contract.'));
  if (currentSubmitErrors) addWarning('critical', adminCopy(lang, 'Gli invii del modulo pubblico stanno fallendo.', 'Public booking submissions are currently failing.'), adminCopy(lang, `${currentSubmitErrors} errori correnti · ${currentSubmitErrorDevices.join(', ') || 'device unknown'}.`, `${currentSubmitErrors} current errors · ${currentSubmitErrorDevices.join(', ') || 'device unknown'}.`), adminCopy(lang, 'Il problema avviene dopo il submit_attempt e prima di booking_request_created. Controllare /api/public/booking-request e create_public_booking_request prima di interpretarlo come drop-off UX.', 'The failure occurs after submit_attempt and before booking_request_created. Check /api/public/booking-request and create_public_booking_request before treating this as UX drop-off.'));
  if (formOpenMissingCtaCount) addWarning('diagnostic', adminCopy(lang, 'Alcune aperture modulo non hanno cta_location.', 'Some form opens have no cta_location.'), '', adminCopy(lang, 'Aggiornare i CTA che non inviano cta_location per rendere leggibili i percorsi.', 'Update CTAs that do not send cta_location so paths are readable.'));
  if (internalEventsExcluded || internalSessionsExcluded) addWarning('diagnostic', adminCopy(lang, 'Traffico interno escluso dalle metriche pubbliche.', 'Internal traffic excluded from public metrics.'), '', adminCopy(lang, 'Admin, API, CMS/editor, finanze e dashboard analytics restano esclusi dai conteggi pubblici.', 'Admin, API, CMS/editor, finance, and analytics dashboard rows remain excluded from public metrics.'));
  if (directTrafficShare > 0.8) {
    addWarning(
      'attribution',
      adminCopy(lang, 'Attribuzione ancora limitata.', 'Attribution is still limited.'),
      adminCopy(lang, 'Gran parte del traffico risulta Direct.', 'Most traffic is still classified as Direct.'),
      adminCopy(lang, 'Gran parte del traffico risulta Direct, quindi la performance dei canali non è ancora affidabile. Usa link UTM in modo coerente per bio Instagram, storie Instagram, condivisioni WhatsApp, partner e Profilo Google Business.', 'Most traffic is still classified as Direct, so source performance is not reliable yet. Use UTM links consistently for Instagram bio, Instagram stories, WhatsApp shares, partner links, and Google Business Profile.')
    );
  }
  if (mobileShare > 0.7) {
    addWarning(
      'ux',
      adminCopy(lang, 'Priorità ai test mobile.', 'Mobile journey needs priority testing.'),
      adminCopy(lang, 'La maggior parte dell’attività arriva da mobile.', 'Most activity is mobile.'),
      adminCopy(lang, 'La maggior parte dell’attività arriva da mobile. Dopo ogni release, testa il percorso completo su iPhone Safari e Android Chrome: apertura escursione, selezione data, avvio modulo, modifica campi, invio richiesta, apertura WhatsApp e ritorno al sito.', 'Most activity is mobile. After each release, test the complete request path on iPhone Safari and Android Chrome: open excursion, select date, start form, edit fields, submit request, open WhatsApp, and return to the site.')
    );
  }


  const conversionMetrics = {
    websiteRequestConversion: percent(websiteRequests, conversionBase),
    trackedSubmissionConversion: percent(submitSuccesses, conversionBase),
    contactIntentConversion: percent(websiteRequests + whatsappClicks + emailClicks, conversionBase),
    confirmedBookingConversion: websiteRequests ? percent(confirmedRequests, websiteRequests) : adminCopy(lang, 'Dati insufficienti', 'Insufficient data'),
    bookingCodeConfirmationRate: bookingCodeRequests ? percent(confirmedBookingCodeRequests, bookingCodeRequests) : adminCopy(lang, 'Dati insufficienti', 'Insufficient data')
  };

  return {
    visitors,
    pageViews,
    experienceViews,
    experienceCardImpressions,
    experienceDetailOpens,
    formOpens,
    fieldStarts,
    formJourneysStarted,
    abandonedForms,
    recoveredByWhatsapp,
    journeySubmitSuccesses,
    abandonmentRate,
    recoveryRate,
    submitAttempts,
    submitSuccesses,
    submitErrors,
    validationErrors,
    bookingCodeRedeemAttempts,
    bookingCodeRedeemSuccesses,
    bookingCodeRedeemErrors,
    bookingRequests: bookingRequestCount,
    websiteRequests,
    bookingCodeRequests,
    adminManualRequests: adminManualRequestRows.length,
    confirmedRequests,
    confirmedBookingCodeRequests,
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
    requestTrackingIntegrity,
    requestTrackingSummary: {
      website_form_requests: websiteRequests,
      booking_code_requests: bookingCodeRequests,
      admin_manual_requests: adminManualRequestRows.length,
      website_form_submit_attempts: submitAttempts,
      website_form_submit_successes: submitSuccesses,
      booking_code_redeem_attempts: bookingCodeRedeemAttempts,
      booking_code_redeem_successes: bookingCodeRedeemSuccesses,
      website_requests_with_tracked_submit: requestsWithTrackedSubmit,
      requests_with_tracked_submit: requestsWithTrackedSubmit,
      requests_matched_by_journey_id: requestsMatchedByJourneyId,
      requests_matched_by_booking_request_id: requestsMatchedByBookingRequestId,
      requests_matched_by_legacy_heuristic: requestsMatchedByLegacyHeuristic,
      requests_created_event_only: requestsCreatedEventOnly,
      website_requests_without_submit_success: requestsWithoutTrackedSubmit,
      current_website_requests_without_submit_success: currentRequestsWithoutTrackedSubmit,
      historical_website_requests_without_submit_success: historicalRequestsWithoutTrackedSubmit,
      current_submit_errors: currentSubmitErrors,
      requests_without_tracked_submit: requestsWithoutTrackedSubmit,
      booking_code_requests_with_redeem_success: bookingCodeRequestsWithRedeemSuccess,
      booking_code_requests_without_redeem_success: bookingCodeRequestsWithoutRedeemSuccess
    },
    warnings,
    lowSampleNote: visitors < SMALL_SAMPLE_VISITOR_THRESHOLD,
    internalEventsExcluded,
    internalSessionsExcluded,
    directTrafficShare: rowPercent(directTrafficCount, sourceTotal),
    mobileShare: rowPercent(mobileCount, pageViewEvents.length || 1)
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

function AnalyticsWarningList({ warnings = [], lang = 'it', onOpenDetails }) {
  if (!warnings.length) return null;
  const normalized = warnings.map((warning) => (typeof warning === 'string' ? { type: 'diagnostic', message: warning, helper: '', detail: '' } : warning));
  const groups = [
    ['critical', adminCopy(lang, 'Problemi critici di tracciamento', 'Critical tracking issues')],
    ['warning', adminCopy(lang, 'Avvisi da verificare', 'Warnings to review')],
    ['historical', adminCopy(lang, 'Diagnostica storica', 'Historical diagnostics')],
    ['diagnostic', adminCopy(lang, 'Note diagnostiche', 'Diagnostic notes')],
    ['attribution', adminCopy(lang, 'Note attribuzione', 'Attribution notes')],
    ['ux', adminCopy(lang, 'Note test UX', 'UX testing notes')]
  ];
  return (
    <div className="analytics-warning-list grouped" role="status">
      {groups.map(([type, fallbackTitle]) => {
        const items = normalized.filter((warning) => warning.type === type);
        if (!items.length) return null;
        return (
          <section className={`analytics-warning-group ${type}`} key={type}>
            <h3>{fallbackTitle}</h3>
            {items.map((warning, index) => (
              <p key={`${type}-${index}`}>
                <span>{warning.message}</span>
                {warning.helper && <small>{warning.helper}</small>}
              </p>
            ))}
          </section>
        );
      })}
      {onOpenDetails && (
        <div className="analytics-warning-actions">
          <button className="button secondary analytics-details-button" type="button" onClick={onOpenDetails}>
            {adminCopy(lang, 'Dettagli analytics', 'Analytics details')}
          </button>
        </div>
      )}
    </div>
  );
}

function AnalyticsDetailsModal({ lang = 'it', model, onClose }) {
  useBodyScrollLock(true);
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const warnings = Array.isArray(model?.warnings) ? model.warnings : [];
  const utmExamples = [
    '?utm_source=instagram&utm_medium=social&utm_campaign=july_2026',
    '?utm_source=instagram&utm_medium=story&utm_campaign=summer_2026',
    '?utm_source=whatsapp&utm_medium=share&utm_campaign=fixed_excursions',
    '?utm_source=google_business_profile&utm_medium=organic&utm_campaign=profile'
  ];

  return (
    <div className="modal-backdrop analytics-details-backdrop" role="presentation" onClick={onClose}>
      <section className="admin-modal full-screen-admin-modal analytics-details-modal" role="dialog" aria-modal="true" aria-labelledby="analyticsDetailsTitle" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal-header analytics-details-header">
          <div>
            <span className="kicker">vulcanIQ</span>
            <h2 id="analyticsDetailsTitle">{adminCopy(lang, 'Dettagli analytics', 'Analytics details')}</h2>
            <p>{adminCopy(lang, 'Diagnostica tecnica del funnel, qualità dati, attribuzione e percorso mobile. Usare questi dettagli per correggere il tracciamento, non come prova marketing.', 'Technical diagnostics for funnel integrity, data quality, attribution, and mobile paths. Use these details to fix tracking, not as marketing proof.')}</p>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose}>{adminCopy(lang, 'Chiudi', 'Close')}</button>
        </div>

        <div className="admin-summary-grid analytics-mini-summary-grid analytics-details-summary">
          <SummaryCard label={adminCopy(lang, 'Richieste sito', 'Website requests')} value={model?.websiteRequests ?? 0} helper={adminCopy(lang, 'Tutti i record business storici', 'All historical business records')} />
          <SummaryCard label={adminCopy(lang, 'Submit success tracciati', 'Tracked submit successes')} value={model?.submitSuccesses ?? 0} />
          <SummaryCard label={adminCopy(lang, 'Richieste con codice', 'Booking-code requests')} value={model?.bookingCodeRequests ?? 0} helper={adminCopy(lang, 'Tutti i record business storici', 'All historical business records')} />
          <SummaryCard label={adminCopy(lang, 'Riscatti codice riusciti', 'Booking-code redeem successes')} value={model?.bookingCodeRedeemSuccesses ?? 0} />
        </div>

        {warnings.length > 0 && (
          <AnalyticsSubsection title={adminCopy(lang, 'Spiegazione degli avvisi', 'Warning explanations')}>
            <div className="analytics-detail-warning-grid">
              {warnings.map((warning, index) => (
                <article className={`analytics-detail-warning-card ${warning.type || 'diagnostic'}`} key={`${warning.type || 'warning'}-${index}`}>
                  <h4>{warning.message}</h4>
                  {warning.helper && <p className="small-note">{warning.helper}</p>}
                  {warning.detail && <p>{warning.detail}</p>}
                </article>
              ))}
            </div>
          </AnalyticsSubsection>
        )}

        <AnalyticsSubsection title={adminCopy(lang, 'Esempi UTM da usare', 'UTM examples to use')}>
          <div className="analytics-utm-list">
            {utmExamples.map((example) => <code key={example}>{example}</code>)}
          </div>
        </AnalyticsSubsection>

        <AnalyticsSubsection title={adminCopy(lang, 'Qualità dati', 'Data quality')}>
          <AnalyticsTable
            columns={[
              { key: 'check', label: adminCopy(lang, 'Controllo', 'Check') },
              { key: 'count', label: adminCopy(lang, 'Conteggio', 'Count') },
              { key: 'detail', label: adminCopy(lang, 'Dettaglio', 'Detail') }
            ]}
            rows={model?.dataQualityRows || []}
            empty={adminCopy(lang, 'Nessun dato disponibile.', 'No data available.')}
          />
        </AnalyticsSubsection>

        <AnalyticsSubsection title={adminCopy(lang, 'Diagnostica funnel', 'Funnel diagnostics')}>
          <AnalyticsTable
            columns={[
              { key: 'step', label: adminCopy(lang, 'Step', 'Step') },
              { key: 'count', label: adminCopy(lang, 'Conteggio', 'Count') },
              { key: 'dropoff', label: 'Drop-off' }
            ]}
            rows={model?.funnelDiagnostics || []}
            empty={adminCopy(lang, 'Nessun dato disponibile.', 'No data available.')}
          />
        </AnalyticsSubsection>

        <AnalyticsSubsection title={adminCopy(lang, 'Integrità richieste', 'Request tracking integrity')}>
          <AnalyticsTable
            columns={[
              { key: 'created_at', label: adminCopy(lang, 'Creata il', 'Created at') },
              { key: 'request_type', label: adminCopy(lang, 'Tipo', 'Type') },
              { key: 'experience_id', label: adminCopy(lang, 'Esperienza', 'Experience') },
              { key: 'source', label: adminCopy(lang, 'Sorgente', 'Source') },
              { key: 'matched_submit_success', label: adminCopy(lang, 'Submit success', 'Submit success') },
              { key: 'matched_booking_code_redeem_success', label: adminCopy(lang, 'Riscatto codice', 'Code redeem') },
              { key: 'tracking_integrity_status', label: adminCopy(lang, 'Stato', 'Status') }
            ]}
            rows={(model?.requestTrackingIntegrity || []).slice(0, 50)}
            empty={adminCopy(lang, 'Nessuna richiesta disponibile.', 'No requests available.')}
          />
        </AnalyticsSubsection>

        <AnalyticsSubsection title={adminCopy(lang, 'Funnel mobile · campione diagnostico', 'Mobile funnel · diagnostic sample')}>
          <AnalyticsTable
            columns={[
              { key: 'device_browser', label: adminCopy(lang, 'Dispositivo/browser', 'Device/browser') },
              { key: 'page_views', label: adminCopy(lang, 'Page views', 'Page views') },
              { key: 'form_opens', label: adminCopy(lang, 'Aperture modulo', 'Form opens') },
              { key: 'field_starts', label: adminCopy(lang, 'Avvio campi', 'Field starts') },
              { key: 'submit_attempts', label: adminCopy(lang, 'Tentativi invio', 'Submit attempts') },
              { key: 'submit_successes', label: adminCopy(lang, 'Invii riusciti', 'Submit successes') },
              { key: 'whatsapp_clicks', label: 'WhatsApp' },
              { key: 'phone_clicks', label: adminCopy(lang, 'Telefono', 'Phone') }
            ]}
            rows={model?.mobileFunnel || []}
            empty={adminCopy(lang, 'Nessun dato mobile disponibile.', 'No mobile data available.')}
          />
          <p className="small-note analytics-mobile-checklist">{adminCopy(lang, 'Checklist: apri escursione, seleziona data, avvia modulo, modifica campi, invia richiesta, apri WhatsApp e torna al sito su iPhone Safari e Android Chrome.', 'Checklist: open excursion, select date, start form, edit fields, submit request, open WhatsApp, and return to the site on iPhone Safari and Android Chrome.')}</p>
        </AnalyticsSubsection>

        <AnalyticsSubsection title={adminCopy(lang, 'Qualità attribuzione traffico', 'Traffic attribution quality')}>
          <AnalyticsTable
            columns={[
              { key: 'source', label: adminCopy(lang, 'Sorgente', 'Source') },
              { key: 'count', label: adminCopy(lang, 'Conteggio', 'Count') },
              { key: 'notes', label: adminCopy(lang, 'Note', 'Notes') }
            ]}
            rows={model?.trafficAttributionQuality || []}
            empty={adminCopy(lang, 'Nessun dato attribuzione disponibile.', 'No attribution data available.')}
          />
        </AnalyticsSubsection>
      </section>
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
      booking_request_id: request.id || null,
      created_at: request.created_at,
      status: request.status,
      request_type: request.request_type,
      source: request.source,
      created_by_admin: Boolean(request.created_by_admin),
      traffic_source: request.traffic_source,
      source_section: request.source_section,
      source_cta: request.source_cta,
      cta_location: request.cta_location,
      analytics_session_id: request.analytics_session_id || null,
      analytics_visitor_id: request.analytics_visitor_id || null,
      analytics_journey_id: request.analytics_journey_id || null,
      booking_journey_version: request.booking_journey_version || null,
      selected_month: request.selected_month || null,
      device_type: request.device_type || null,
      browser: request.browser || null,
      operating_system: request.operating_system || null,
      experience_id: request.experience_id,
      requested_date_present: Boolean(request.requested_date),
      heard_about_us: normalizeHeardAboutUs(request.heard_about_us, { allowAdmin: true }) || null,
      heard_about_us_label: heardAboutUsLabel(request.heard_about_us, lang, { fallback: '' }) || null,
      has_fixed_excursion: Boolean(request.has_fixed_excursion || request.fixed_excursion_id),
      adults_bucket: request.adults ? (Number(request.adults) > 6 ? '7+' : String(request.adults)) : null,
      children_present: Boolean(request.children)
    }));
}

const ANALYTICS_EXPORT_UNSAFE_METADATA_KEYS = new Set([
  'name', 'customer_name', 'guest_name', 'reviewer_name',
  'email', 'customer_email', 'phone', 'customer_phone',
  'message', 'booking_message', 'customer_note', 'notes',
  'heard_about_us_detail', 'heard_about_us_display',
  'address', 'coordinates', 'lat', 'lng', 'latitude', 'longitude',
  'payment', 'card', 'buyer_name', 'buyer_email', 'buyer_phone',
  'recipient_name', 'partner_bank_details', 'payment_details'
]);

function safeAnalyticsExportMetadata(metadata = {}) {
  const output = {};
  Object.entries(metadata && typeof metadata === 'object' ? metadata : {}).forEach(([key, value]) => {
    const cleanKey = String(key || '').trim().slice(0, 48);
    if (!cleanKey || ANALYTICS_EXPORT_UNSAFE_METADATA_KEYS.has(cleanKey.toLowerCase())) return;
    if (Array.isArray(value) || (value && typeof value === 'object')) return;
    if (typeof value === 'number' || typeof value === 'boolean') {
      output[cleanKey] = value;
      return;
    }
    const cleanValue = String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 220);
    if (cleanValue) output[cleanKey] = cleanValue;
  });
  return output;
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
      metadata: safeAnalyticsExportMetadata(row.metadata || {})
    };
  });
}

function downloadAnalyticsExport({ lang, period, range, model, canonicalSummary, events, sessions, bookingRequests, eventTotal = 0, sessionTotal = 0 }) {
  const generatedAt = new Date().toISOString();
  const payload = {
    export_type: 'vulcaniq_analytics_metrics',
    generated_at: generatedAt,
    language: lang,
    period,
    period_label: analyticsPeriodLabel(period, lang),
    range,
    meta: canonicalSummary?.meta || {},
    coverage: {
      data_complete: canonicalSummary?.meta?.data_complete !== false,
      raw_event_sample_limit: 250,
      raw_event_sample_rows: events.length,
      raw_event_sample_is_truncated: Number(eventTotal || 0) > events.length,
      raw_event_total_matching_rows: Number(eventTotal || 0),
      raw_session_sample_limit: 250,
      raw_session_sample_rows: sessions.length,
      raw_session_sample_is_truncated: Number(sessionTotal || 0) > sessions.length,
      raw_session_total_matching_rows: Number(sessionTotal || 0),
      booking_request_sample_limit: 1000,
      booking_request_sample_rows: bookingRequests.length,
      booking_request_sample_may_be_truncated: bookingRequests.length >= 1000
    },
    canonical_funnels: canonicalSummary?.funnels || {},
    canonical_rates: canonicalSummary?.rates || {},
    canonical_integrity: canonicalSummary?.integrity || {},
    chatgpt_prompt: lang === 'it'
      ? 'Analizza queste metriche del sito vulcanIQ. Concentrati su integrità del funnel, comportamento form vs WhatsApp/email, UX mobile, domanda per esperienza, qualità attribuzione sorgenti e se il campione è sufficiente per conclusioni marketing.'
      : 'Analyze these vulcanIQ website metrics. Focus on funnel integrity, form vs WhatsApp/email behavior, mobile UX, experience demand, source attribution quality, and whether the sample size is sufficient for marketing conclusions.',
    summary: {
      visitors: model.visitors,
      page_views: model.pageViews,
      sessions: model.sessions,
      booking_requests: Number(canonicalSummary?.summary?.booking_requests_total || 0),
      website_booking_requests: Number(canonicalSummary?.summary?.website_requests || 0),
      website_form_requests_compatible: Number(canonicalSummary?.summary?.website_requests_compatible || 0),
      booking_code_requests: Number(canonicalSummary?.summary?.booking_code_requests || 0),
      booking_code_requests_compatible: Number(canonicalSummary?.summary?.booking_code_requests_compatible || 0),
      gift_card_requests: Number(canonicalSummary?.summary?.gift_card_requests || 0),
      gift_card_requests_compatible: Number(canonicalSummary?.summary?.gift_card_requests_compatible || 0),
      admin_manual_requests: Number(canonicalSummary?.summary?.admin_manual_requests || 0),
      website_form_submit_attempts: Number(canonicalSummary?.funnels?.website?.submit_attempts || 0),
      website_form_validation_errors: Number(canonicalSummary?.funnels?.website?.validation_errors || 0),
      website_form_submit_successes: Number(canonicalSummary?.funnels?.website?.submit_successes || 0),
      website_form_submit_errors: Number(canonicalSummary?.funnels?.website?.submit_errors || 0),
      booking_code_redeem_attempts: Number(canonicalSummary?.funnels?.booking_code?.redeem_attempts || 0),
      booking_code_redeem_successes: Number(canonicalSummary?.funnels?.booking_code?.redeem_successes || 0),
      contact_intent_visitors: Number(canonicalSummary?.summary?.contact_intent_visitors || 0),
      whatsapp_clicks: Number(canonicalSummary?.summary?.whatsapp_clicks || 0),
      email_clicks: Number(canonicalSummary?.summary?.email_clicks || 0),
      phone_clicks: Number(canonicalSummary?.summary?.phone_clicks || 0),
      maps_clicks: Number(canonicalSummary?.summary?.maps_clicks || 0),
      website_funnel_completion_rate: model.conversionMetrics.websiteFunnelCompletion,
      visitor_to_tracked_request_rate: model.conversionMetrics.websiteRequestConversion,
      contact_intent_visitor_rate: model.conversionMetrics.contactIntentConversion,
      confirmed_website_request_rate: model.conversionMetrics.confirmedBookingConversion,
      booking_code_redeem_rate: model.conversionMetrics.bookingCodeConfirmationRate,
      average_engagement_time: model.averageEngagement,
      submit_incident_state: canonicalSummary?.integrity?.submit_incident_state || 'none'
    },
    tables: {
      countries: model.countryRows,
      cities: model.cityRows,
      top_pages: model.topPageRows,
      experience_detail_opens: model.experienceRows,
      excursion_views: model.experienceRows,
      experience_card_impressions: model.experienceCardImpressions,
      traffic_sources: model.sourceRows,
      devices: model.deviceRows,
      browsers: model.browserRows,
      operating_systems: model.osRows,
      languages: model.languageRows,
      website_flow: model.flowRows,
      booking_funnel: model.funnelRows,
      data_quality: (canonicalSummary?.integrity?.warnings || []).map((warning) => ({ severity: warning.severity, code: warning.code, count: warning.count ?? 0, detail: warning.message || '' }))
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
      customer_declared_sources_sample: model.declaredAttributionRows,
      requests_without_tracked_form_open_sample: model.requestsWithoutTrackedFormOpen,
      request_tracking_integrity_sample: model.requestTrackingIntegrity
    },
    anonymized_samples: {
      events: safeAnalyticsRows(events, 'event'),
      sessions: safeAnalyticsRows(sessions, 'session'),
      booking_requests: safeBookingRequestRows(bookingRequests, range, lang)
    },
    privacy_note: 'Names, emails, phone numbers, message text, precise coordinates, payment data, and raw booking-request personal details are intentionally excluded. Analytics session/visitor/journey IDs are anonymous diagnostics used only to link funnel events.'
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


function OwnerOnlyAdminPage({ lang }) {
  return (
    <section className="admin-subpage backup-admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">vulcanIQ</span>
          <h1>{adminCopy(lang, 'Accesso owner richiesto', 'Owner access required')}</h1>
          <p>{adminCopy(lang, 'Questa sezione è disponibile solo agli owner attivi.', 'This section is available only to active owners.')}</p>
        </div>
      </div>
      <div className="admin-alert warning" role="status">
        {adminCopy(lang, 'I manager e gli utenti non autenticati non possono accedere ai controlli di backup.', 'Managers and unauthenticated users cannot access backup controls.')}
      </div>
    </section>
  );
}


const DEFAULT_BACKUP_SCHEDULE = {
  enabled: true,
  frequency: 'daily',
  utc_hour: 2,
  utc_minute: 0,
  weekly_day: 0,
  monthly_day: 1
};

function normalizeBackupSchedule(schedule = {}) {
  const frequency = ['daily', 'weekly', 'monthly'].includes(schedule.frequency) ? schedule.frequency : 'daily';
  return {
    ...DEFAULT_BACKUP_SCHEDULE,
    ...schedule,
    enabled: schedule.enabled !== false,
    frequency,
    utc_hour: clampNumber(schedule.utc_hour, 0, 23, 2),
    utc_minute: clampNumber(schedule.utc_minute, 0, 59, 0),
    weekly_day: schedule.weekly_day === null || schedule.weekly_day === undefined ? 0 : clampNumber(schedule.weekly_day, 0, 6, 0),
    monthly_day: schedule.monthly_day === null || schedule.monthly_day === undefined ? 1 : clampNumber(schedule.monthly_day, 1, 28, 1)
  };
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function twoDigit(value) {
  return String(clampNumber(value, 0, 99, 0)).padStart(2, '0');
}

function backupTimeValue(schedule) {
  return `${twoDigit(schedule.utc_hour)}:${twoDigit(schedule.utc_minute)}`;
}

function parseBackupTime(value, current) {
  const [hour, minute] = String(value || '').split(':');
  return {
    ...current,
    utc_hour: clampNumber(hour, 0, 23, current.utc_hour),
    utc_minute: clampNumber(minute, 0, 59, current.utc_minute)
  };
}

function backupDateFallback(lang) {
  return adminCopy(lang, 'Non disponibile', 'Not available');
}

function formatBackupDate(value, lang) {
  return formatLocalDateTime(value, lang, backupDateFallback(lang));
}

function BackupTimeValue({ value, lang, compact = false }) {
  if (!validDateFromValue(value)) return <span>{backupDateFallback(lang)}</span>;
  return (
    <span className={`backup-time-value ${compact ? 'compact' : ''}`}>
      <span className="backup-time-primary">{formatBackupDate(value, lang)}</span>
    </span>
  );
}

function BackupInlineTime({ label, value, lang }) {
  if (!validDateFromValue(value)) return null;
  return (
    <span className="backup-inline-time">
      <span className="backup-inline-time-label">{label}:</span>{' '}
      <span>{formatBackupDate(value, lang)}</span>
    </span>
  );
}

function BackupSummaryHelper({ latestBackup, lang }) {
  if (!latestBackup) return null;
  const rows = [
    `${adminCopy(lang, 'Dimensione', 'Size')}: ${formatBackupSize(latestBackup.sizeInBytes, lang)}`,
    latestBackup.artifactName || '',
  ].filter(Boolean);
  return (
    <span className="backup-summary-helper">
      {rows.map((row) => <span key={row}>{row}</span>)}
      <BackupInlineTime label={adminCopy(lang, 'Artifact caricato', 'Artifact uploaded')} value={latestBackup.artifactCreatedAt || latestBackup.uploadedAt} lang={lang} />
      <BackupInlineTime label={adminCopy(lang, 'Scadenza artifact', 'Artifact expiry')} value={latestBackup.expiresAt} lang={lang} />
    </span>
  );
}

function formatBackupSize(bytes, lang) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return adminCopy(lang, 'Dimensione non disponibile', 'Size unavailable');
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}


function envVarName(parts) {
  return Array.isArray(parts) ? parts.join('_') : '';
}

function storageIncludedLabel(storage, lang) {
  if (!storage || storage.detailsAvailable === false || storage.included === null || storage.included === undefined) {
    return adminCopy(lang, 'Non disponibile', 'Not available');
  }
  return storage.included ? adminCopy(lang, 'sì', 'yes') : adminCopy(lang, 'no', 'no');
}

function backupStorageHelper(latestBackup, lang) {
  const storage = latestBackup?.storage;
  if (!storage || storage.detailsAvailable === false) {
    return adminCopy(lang, 'Dettagli Storage non disponibili per questo backup.', 'Storage details are not available for this backup.');
  }
  const fileCount = Number.isFinite(Number(storage.fileCount)) ? Number(storage.fileCount) : null;
  const size = Number.isFinite(Number(storage.sizeInBytes)) ? formatBackupSize(storage.sizeInBytes, lang) : adminCopy(lang, 'Dimensione non disponibile', 'Size unavailable');
  const failureCount = Number.isFinite(Number(storage.failureCount)) ? Number(storage.failureCount) : 0;
  const fileText = fileCount === null ? adminCopy(lang, 'non disponibile', 'unavailable') : String(fileCount);
  const base = `${adminCopy(lang, 'File Storage', 'Storage files')}: ${fileText} - ${adminCopy(lang, 'Dimensione Storage', 'Storage size')}: ${size}`;
  if (failureCount > 0) {
    return `${base} - ${adminCopy(lang, 'Errori export', 'Export failures')}: ${failureCount}`;
  }
  return base;
}

function backupWeekdayOptions(lang) {
  return [
    { value: 0, label: adminCopy(lang, 'Domenica', 'Sunday') },
    { value: 1, label: adminCopy(lang, 'Lunedì', 'Monday') },
    { value: 2, label: adminCopy(lang, 'Martedì', 'Tuesday') },
    { value: 3, label: adminCopy(lang, 'Mercoledì', 'Wednesday') },
    { value: 4, label: adminCopy(lang, 'Giovedì', 'Thursday') },
    { value: 5, label: adminCopy(lang, 'Venerdì', 'Friday') },
    { value: 6, label: adminCopy(lang, 'Sabato', 'Saturday') }
  ];
}

function backupFrequencyLabel(frequency, lang) {
  if (frequency === 'weekly') return adminCopy(lang, 'Settimanale', 'Weekly');
  if (frequency === 'monthly') return adminCopy(lang, 'Mensile', 'Monthly');
  return adminCopy(lang, 'Giornaliero', 'Daily');
}

function backupScheduleSummary(schedule, lang) {
  const normalized = normalizeBackupSchedule(schedule);
  if (!normalized.enabled) return adminCopy(lang, 'Disattivato', 'Disabled');
  const time = backupTimeValue(normalized);
  if (normalized.frequency === 'weekly') {
    const day = backupWeekdayOptions(lang).find((item) => item.value === normalized.weekly_day)?.label || backupWeekdayOptions(lang)[0].label;
    return `${backupFrequencyLabel('weekly', lang)} - ${day} - ${time}`;
  }
  if (normalized.frequency === 'monthly') {
    return `${backupFrequencyLabel('monthly', lang)} - ${adminCopy(lang, 'giorno', 'day')} ${normalized.monthly_day} - ${time}`;
  }
  return `${backupFrequencyLabel('daily', lang)} - ${time}`;
}


function dateIsAfter(value, reference, slackMs = 60000) {
  if (!value || !reference) return false;
  const date = new Date(value).getTime();
  const ref = new Date(reference).getTime();
  if (!Number.isFinite(date) || !Number.isFinite(ref)) return false;
  return date >= (ref - slackMs);
}

function workflowStatusText(run, lang) {
  if (!run) return adminCopy(lang, 'Nessuna esecuzione trovata', 'No workflow run found');
  if (run.status === 'queued') return adminCopy(lang, 'In coda', 'Queued');
  if (run.status === 'in_progress') return adminCopy(lang, 'In esecuzione', 'Running');
  if (run.status === 'completed' && run.conclusion === 'success') return adminCopy(lang, 'Completato', 'Completed');
  if (run.status === 'completed' && run.conclusion) return adminCopy(lang, `Terminato: ${run.conclusion}`, `Finished: ${run.conclusion}`);
  return run.status || adminCopy(lang, 'Non disponibile', 'Not available');
}


function inactiveBackupProgress() {
  return { active: false, value: 0, title: '', detail: '', failed: false, done: false };
}

function clampBackupProgress(value) {
  const parsed = Number(value);
  return Math.max(0, Math.min(100, Number.isFinite(parsed) ? parsed : 0));
}

function isBackupWorkflowActive(run) {
  return Boolean(run && ['queued', 'in_progress', 'running'].includes(run.status));
}

function backupMonitorStorageKey() {
  return 'vulcaniq-backup-monitor-requested-at';
}

function readStoredBackupRequestedAt() {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(backupMonitorStorageKey()) || '';
  } catch {
    return '';
  }
}

function storeBackupRequestedAt(value) {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(backupMonitorStorageKey(), value);
    else window.localStorage.removeItem(backupMonitorStorageKey());
  } catch {}
}

function GlobalBackupProgressBanner({ lang, progress, onOpenBackup }) {
  if (!progress?.active) return null;
  const progressValue = clampBackupProgress(progress.value);
  return (
    <button className={`global-backup-progress-banner ${progress.failed ? 'failed' : ''}`} type="button" onClick={onOpenBackup} aria-label={adminCopy(lang, 'Apri Sistema e backup', 'Open System & backup')}>
      <div className="global-backup-progress-header">
        <strong>{progress.title || adminCopy(lang, 'Backup in esecuzione', 'Backup in progress')}</strong>
        <span>{Math.round(progressValue)}%</span>
      </div>
      <div className="backup-progress-track" role="progressbar" aria-label={adminCopy(lang, 'Avanzamento backup', 'Backup progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressValue}>
        <span className="backup-progress-fill" style={{ width: `${progressValue}%` }} />
      </div>
      <p>{progress.detail || adminCopy(lang, 'GitHub Actions sta creando il dump e preparando lo ZIP.', 'GitHub Actions is creating the dump and preparing the ZIP.')}</p>
    </button>
  );
}

function backupProgressFromStatus(result, requestedAt, lang) {
  const run = result?.workflowRun;
  const latestBackup = result?.latestBackup;
  if (!run || !dateIsAfter(run.createdAt || run.runStartedAt, requestedAt, 90000)) {
    return {
      active: true,
      value: 25,
      title: adminCopy(lang, 'Richiesta inviata', 'Request sent'),
      detail: adminCopy(lang, 'In attesa che GitHub Actions registri la nuova esecuzione.', 'Waiting for GitHub Actions to register the new run.'),
      done: false,
      failed: false
    };
  }

  if (run.status === 'queued') {
    return {
      active: true,
      value: 35,
      title: adminCopy(lang, 'Backup in coda', 'Backup queued'),
      detail: adminCopy(lang, 'La richiesta è stata accettata ed è in attesa di esecuzione.', 'The request was accepted and is waiting to run.'),
      done: false,
      failed: false
    };
  }

  if (run.status === 'in_progress') {
    return {
      active: true,
      value: 70,
      title: adminCopy(lang, 'Backup in esecuzione', 'Backup in progress'),
      detail: adminCopy(lang, 'GitHub Actions sta creando il dump e preparando lo ZIP.', 'GitHub Actions is creating the dump and preparing the ZIP.'),
      done: false,
      failed: false
    };
  }

  if (run.status === 'completed' && run.conclusion === 'success') {
    const artifactReady = latestBackup?.createdAt && dateIsAfter(latestBackup.createdAt, requestedAt, 120000);
    return {
      active: true,
      value: artifactReady ? 100 : 92,
      title: artifactReady ? adminCopy(lang, 'Backup completato', 'Backup completed') : adminCopy(lang, 'Workflow completato', 'Workflow completed'),
      detail: artifactReady
        ? adminCopy(lang, 'Il nuovo backup è pronto e può essere scaricato da questa pagina.', 'The new backup is ready and can be downloaded from this page.')
        : adminCopy(lang, 'Il workflow è terminato. Attendo la pubblicazione dell\'artifact.', 'The workflow finished. Waiting for the artifact to become available.'),
      done: artifactReady,
      failed: false
    };
  }

  if (run.status === 'completed') {
    return {
      active: true,
      value: 100,
      title: adminCopy(lang, 'Backup non completato', 'Backup not completed'),
      detail: adminCopy(lang, 'L\'ultima esecuzione del workflow non è terminata correttamente. Controlla i dettagli mostrati sotto.', 'The latest workflow run did not finish correctly. Check the details shown below.'),
      done: true,
      failed: true
    };
  }

  return {
    active: true,
    value: 50,
    title: workflowStatusText(run, lang),
    detail: adminCopy(lang, 'Stato workflow aggiornato dal server.', 'Workflow status updated by the server.'),
    done: false,
    failed: false
  };
}
function AdminBackupPage({ lang, globalBackupProgress = inactiveBackupProgress(), startGlobalBackupMonitor, stopGlobalBackupMonitor }) {
  const [actionState, setActionState] = useState({ createLoading: false, downloadLoading: false, message: '', error: '' });
  const [statusState, setStatusState] = useState({ loading: true, error: '', latestBackup: null, workflowRun: null, configured: false, message: '' });
  const [scheduleDraft, setScheduleDraft] = useState(DEFAULT_BACKUP_SCHEDULE);
  const [scheduleState, setScheduleState] = useState({ loading: true, saving: false, message: '', error: '' });
  const [showWorkflowDetails, setShowWorkflowDetails] = useState(false);

  async function refreshBackupStatus() {
    setStatusState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await getBackupStatus({ lang });
      setStatusState({
        loading: false,
        error: '',
        latestBackup: result?.latestBackup || null,
        workflowRun: result?.workflowRun || null,
        configured: result?.configured !== false,
        message: result?.message || ''
      });
    } catch (error) {
      setStatusState({
        loading: false,
        error: error?.message || adminCopy(lang, 'Stato backup non disponibile.', 'Backup status is not available.'),
        latestBackup: null,
        workflowRun: null,
        configured: false,
        message: ''
      });
    }
  }

  async function refreshBackupSchedule() {
    setScheduleState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const schedule = await getBackupSchedule({ lang });
      setScheduleDraft(normalizeBackupSchedule(schedule));
      setScheduleState({ loading: false, saving: false, message: '', error: '' });
    } catch (error) {
      setScheduleDraft(DEFAULT_BACKUP_SCHEDULE);
      setScheduleState({
        loading: false,
        saving: false,
        message: '',
        error: error?.message || adminCopy(lang, 'Programmazione backup non disponibile.', 'Backup schedule is not available.')
      });
    }
  }

  useEffect(() => {
    let alive = true;
    async function loadBackupData() {
      const [statusResult, scheduleResult] = await Promise.allSettled([
        getBackupStatus({ lang }),
        getBackupSchedule({ lang })
      ]);
      if (!alive) return;

      if (statusResult.status === 'fulfilled') {
        setStatusState({
          loading: false,
          error: '',
          latestBackup: statusResult.value?.latestBackup || null,
          workflowRun: statusResult.value?.workflowRun || null,
          configured: statusResult.value?.configured !== false,
          message: statusResult.value?.message || ''
        });
      } else {
        setStatusState({
          loading: false,
          error: statusResult.reason?.message || adminCopy(lang, 'Stato backup non disponibile.', 'Backup status is not available.'),
          latestBackup: null,
          workflowRun: null,
          configured: false,
          message: ''
        });
      }

      if (scheduleResult.status === 'fulfilled') {
        setScheduleDraft(normalizeBackupSchedule(scheduleResult.value));
        setScheduleState({ loading: false, saving: false, message: '', error: '' });
      } else {
        setScheduleDraft(DEFAULT_BACKUP_SCHEDULE);
        setScheduleState({
          loading: false,
          saving: false,
          message: '',
          error: scheduleResult.reason?.message || adminCopy(lang, 'Programmazione backup non disponibile.', 'Backup schedule is not available.')
        });
      }
    }
    loadBackupData();
    return () => { alive = false; };
  }, [lang]);

  useEffect(() => {
    function handleGlobalBackupStatusUpdated(event) {
      const result = event.detail || {};
      setStatusState({
        loading: false,
        error: '',
        latestBackup: result?.latestBackup || null,
        workflowRun: result?.workflowRun || null,
        configured: result?.configured !== false,
        message: result?.message || ''
      });
      setActionState({ createLoading: false, downloadLoading: false, message: adminCopy(lang, 'Backup completato. Puoi scaricarlo da questa pagina.', 'Backup completed. You can download it from this page.'), error: '' });
      window.setTimeout(refreshBackupStatus, 2500);
    }
    window.addEventListener('vulcaniq-backup-status-updated', handleGlobalBackupStatusUpdated);
    return () => window.removeEventListener('vulcaniq-backup-status-updated', handleGlobalBackupStatusUpdated);
  }, [lang]);

  async function handleCreateBackup() {
    const requestedAt = new Date().toISOString();
    const initialProgress = {
      active: true,
      value: 10,
      title: adminCopy(lang, 'Backup in esecuzione', 'Backup in progress'),
      detail: adminCopy(lang, 'GitHub Actions sta creando il dump e preparando lo ZIP.', 'GitHub Actions is creating the dump and preparing the ZIP.'),
      failed: false,
      done: false
    };
    startGlobalBackupMonitor?.(requestedAt, initialProgress);
    setActionState({ createLoading: true, downloadLoading: false, message: '', error: '' });
    try {
      const result = await createDatabaseBackup({ lang });
      const serverRequestedAt = result?.requestedAt || requestedAt;
      setActionState({ createLoading: false, downloadLoading: false, message: result?.message || adminCopy(lang, 'Backup avviato', 'Backup started'), error: '' });
      startGlobalBackupMonitor?.(serverRequestedAt, {
        active: true,
        value: 25,
        title: adminCopy(lang, 'Backup in esecuzione', 'Backup in progress'),
        detail: adminCopy(lang, 'GitHub Actions sta creando il dump e preparando lo ZIP.', 'GitHub Actions is creating the dump and preparing the ZIP.'),
        failed: false,
        done: false
      });
    } catch (error) {
      stopGlobalBackupMonitor?.();
      setActionState({ createLoading: false, downloadLoading: false, message: '', error: error?.message || adminCopy(lang, 'Impossibile avviare il backup.', 'Could not start backup.') });
    }
  }

  async function handleDownloadBackup() {
    setActionState({ createLoading: false, downloadLoading: true, message: adminCopy(lang, 'Download del backup in corso...', 'Downloading backup...'), error: '' });
    try {
      await downloadLatestDatabaseBackup({ lang });
      setActionState({ createLoading: false, downloadLoading: false, message: adminCopy(lang, 'Backup scaricato.', 'Backup downloaded.'), error: '' });
      refreshBackupStatus();
    } catch (error) {
      setActionState({ createLoading: false, downloadLoading: false, message: '', error: error?.message || adminCopy(lang, 'Errore durante il download del backup.', 'Backup download failed.') });
    }
  }

  async function handleSaveSchedule() {
    const normalized = normalizeBackupSchedule(scheduleDraft);
    setScheduleState({ loading: false, saving: true, message: '', error: '' });
    try {
      const result = await saveBackupSchedule(normalized, { lang });
      setScheduleDraft(normalizeBackupSchedule(result?.schedule || normalized));
      setScheduleState({ loading: false, saving: false, message: result?.message || adminCopy(lang, 'Programmazione salvata', 'Schedule saved'), error: '' });
    } catch (error) {
      setScheduleState({ loading: false, saving: false, message: '', error: error?.message || adminCopy(lang, 'Programmazione backup non salvata.', 'Backup schedule was not saved.') });
    }
  }

  const latestBackup = statusState.latestBackup;
  const workflowRun = statusState.workflowRun;
  const workflowIsActive = workflowRun && ['queued', 'in_progress'].includes(workflowRun.status);
  const workflowCompleted = workflowRun?.status === 'completed';
  const workflowSucceeded = workflowCompleted && workflowRun?.conclusion === 'success';
  const workflowFailed = workflowCompleted && workflowRun?.conclusion && workflowRun.conclusion !== 'success';
  const hasDownloadableBackup = Boolean(latestBackup?.createdAt && latestBackup?.expired !== true);
  const latestCompletedAt = latestBackup?.createdAt || (workflowSucceeded ? workflowRun?.updatedAt || workflowRun?.createdAt : null);
  const workflowArtifactMissing = workflowSucceeded && !hasDownloadableBackup;

  const latestBackupLabel = statusState.loading
    ? adminCopy(lang, 'Caricamento...', 'Loading...')
    : latestCompletedAt
      ? <BackupTimeValue value={latestCompletedAt} lang={lang} />
      : workflowFailed
        ? adminCopy(lang, 'Backup non riuscito', 'Backup failed')
        : adminCopy(lang, 'Nessun backup completato', 'No completed backup yet');
  const latestBackupHelper = hasDownloadableBackup
    ? <BackupSummaryHelper latestBackup={latestBackup} lang={lang} />
    : workflowArtifactMissing
      ? adminCopy(lang, 'L’ultimo workflow di backup è terminato correttamente, ma non è stato trovato uno ZIP scaricabile. L’artifact potrebbe essere scaduto, non caricato o non risolto dall’endpoint di download diretto.', 'The latest backup workflow completed successfully, but no downloadable ZIP artifact was found. The artifact may have expired, may not have been uploaded, or the direct-download lookup may need checking.')
      : latestBackup?.expired
        ? adminCopy(lang, 'L’ultimo artifact backup è scaduto. Crea un nuovo backup per abilitarne il download diretto.', 'The latest backup artifact has expired. Create a new backup to enable direct download.')
        : (statusState.message || adminCopy(lang, 'Crea un backup per generare il primo ZIP scaricabile.', 'Create a backup to generate the first downloadable ZIP.'));
  const downloadAvailabilityLabel = statusState.loading
    ? adminCopy(lang, 'Caricamento...', 'Loading...')
    : hasDownloadableBackup
      ? adminCopy(lang, 'Disponibile', 'Available')
      : adminCopy(lang, 'Non disponibile', 'Not available');
  const downloadAvailabilityHelper = hasDownloadableBackup
    ? adminCopy(lang, 'Lo ZIP dell’ultimo backup può essere scaricato direttamente da questa pagina.', 'The latest backup ZIP can be downloaded directly from this page.')
    : workflowArtifactMissing
      ? adminCopy(lang, 'Il backup risulta completato, ma lo ZIP non è disponibile per il download diretto.', 'The backup appears completed, but the ZIP is not available for direct download.')
      : adminCopy(lang, 'Nessun artifact scaricabile disponibile.', 'No downloadable artifact available.');
  const lastStatusLabel = statusState.loading
    ? adminCopy(lang, 'Caricamento...', 'Loading...')
    : workflowIsActive
      ? workflowStatusText(workflowRun, lang)
      : workflowSucceeded
        ? adminCopy(lang, 'Completato', 'Completed')
        : workflowFailed
          ? adminCopy(lang, 'Fallito', 'Failed')
          : statusState.configured
            ? adminCopy(lang, 'Pronto', 'Ready')
            : adminCopy(lang, 'Da configurare', 'Needs configuration');
  const workflowHelper = workflowRun
    ? <BackupInlineTime label={workflowStatusText(workflowRun, lang)} value={workflowRun.updatedAt || workflowRun.createdAt} lang={lang} />
    : adminCopy(lang, 'Nessuna esecuzione workflow disponibile.', 'No workflow run available.');
  const backupProgress = globalBackupProgress || inactiveBackupProgress();
  const progressValue = clampBackupProgress(backupProgress.value);

  return (
    <section className="admin-subpage backup-admin-page">
      <div className="admin-page-header backup-page-header">
        <div>
          <h1>{adminCopy(lang, 'Backup del database', 'Database backup')}</h1>
        </div>
        <div className="backup-header-actions">
          <button className="button primary" type="button" disabled={actionState.downloadLoading || actionState.createLoading || statusState.loading || !hasDownloadableBackup} onClick={handleDownloadBackup}>
            {actionState.downloadLoading ? adminCopy(lang, 'Download del backup in corso...', 'Downloading backup...') : adminCopy(lang, 'Scarica ultimo backup', 'Download latest backup')}
          </button>
          <button className="button secondary" type="button" disabled={actionState.createLoading || actionState.downloadLoading} onClick={handleCreateBackup}>
            {actionState.createLoading ? adminCopy(lang, 'Avvio backup...', 'Starting backup...') : adminCopy(lang, 'Crea backup', 'Create backup')}
          </button>
          <button className="button secondary" type="button" onClick={() => { setShowWorkflowDetails((value) => !value); refreshBackupStatus(); }}>{adminCopy(lang, 'Vedi stato workflow', 'View workflow status')}</button>
        </div>
      </div>

      {actionState.message && <div className="admin-alert success" role="status">{actionState.message}{actionState.createLoading || actionState.downloadLoading ? null : <><br />{adminCopy(lang, 'Il backup sarà scaricabile direttamente da questa pagina appena pronto.', 'The backup will be downloadable directly from this page as soon as it is ready.')}</>}</div>}
      {actionState.error && <div className="admin-alert error" role="alert">{actionState.error}</div>}
      {statusState.error && <div className="admin-alert warning" role="status">{statusState.error}</div>}
      {backupProgress.active && (
        <div className={`backup-progress-panel ${backupProgress.failed ? 'failed' : ''}`} role="status" aria-live="polite">
          <div className="backup-progress-head">
            <strong>{backupProgress.title}</strong>
            <span>{Math.round(progressValue)}%</span>
          </div>
          <div
            className="backup-progress-track"
            role="progressbar"
            aria-label={adminCopy(lang, 'Avanzamento backup', 'Backup progress')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressValue}
          >
            <span className="backup-progress-fill" style={{ width: `${progressValue}%` }} />
          </div>
          {backupProgress.detail && <p>{backupProgress.detail}</p>}
        </div>
      )}

      {workflowIsActive && (
        <section className="admin-panel backup-panel backup-workflow-panel current-backup-panel">
          <div className="admin-panel-header">
            <h2>{adminCopy(lang, 'Backup in esecuzione', 'Backup in progress')}</h2>
            <span className="status-pill pending">{workflowStatusText(workflowRun, lang)}</span>
          </div>
          <dl className="backup-workflow-grid compact-workflow-grid">
            <div><dt>{adminCopy(lang, 'Backup corrente avviato', 'Current backup started')}</dt><dd><BackupTimeValue value={workflowRun.createdAt || workflowRun.runStartedAt} lang={lang} compact /></dd></div>
            <div><dt>{adminCopy(lang, 'Backup corrente aggiornato', 'Current backup updated')}</dt><dd><BackupTimeValue value={workflowRun.updatedAt} lang={lang} compact /></dd></div>
            <div><dt>{adminCopy(lang, 'Ultimo backup completato', 'Last completed backup')}</dt><dd>{latestBackup?.createdAt ? <BackupTimeValue value={latestBackup.createdAt} lang={lang} compact /> : adminCopy(lang, 'Nessun backup completato', 'No completed backup yet')}</dd></div>
          </dl>
        </section>
      )}

      <div className="admin-summary-grid backup-summary-grid">
        <SummaryCard label={adminCopy(lang, 'Ultimo backup completato', 'Last completed backup')} value={latestBackupLabel} helper={latestBackupHelper} />
        <SummaryCard label={adminCopy(lang, 'Download backup', 'Backup download')} value={downloadAvailabilityLabel} helper={downloadAvailabilityHelper} />
        <SummaryCard label={adminCopy(lang, 'Ultimo stato', 'Last status')} value={lastStatusLabel} helper={latestBackup?.artifactName || workflowHelper} />
        <SummaryCard label={adminCopy(lang, 'Programmazione backup', 'Backup schedule')} value={backupFrequencyLabel(scheduleDraft.frequency, lang)} helper={backupScheduleSummary(scheduleDraft, lang)} />
        <SummaryCard label={adminCopy(lang, 'Storage incluso', 'Storage included')} value={storageIncludedLabel(latestBackup?.storage, lang)} helper={backupStorageHelper(latestBackup, lang)} />
      </div>

      {showWorkflowDetails && (
        <section className="admin-panel backup-panel backup-workflow-panel">
          <div className="admin-panel-header">
            <h2>{adminCopy(lang, 'Stato workflow backup', 'Backup workflow status')}</h2>
            <button className="button secondary small-button" type="button" onClick={refreshBackupStatus}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
          </div>
          <p>{adminCopy(lang, 'Questi dettagli vengono letti server-side da GitHub Actions e mostrati qui: l\'admin non deve avere accesso a GitHub.', 'These details are read server-side from GitHub Actions and shown here: the admin does not need GitHub access.')}</p>
          {workflowRun ? (
            <dl className="backup-workflow-grid">
              <div><dt>{adminCopy(lang, 'Esecuzione', 'Run')}</dt><dd>{workflowRun.runNumber ? `#${workflowRun.runNumber}` : '-'}</dd></div>
              <div><dt>{adminCopy(lang, 'Stato', 'Status')}</dt><dd>{workflowStatusText(workflowRun, lang)}</dd></div>
              <div><dt>{adminCopy(lang, 'Tipo', 'Type')}</dt><dd>{workflowRun.event || '-'}</dd></div>
              <div><dt>{adminCopy(lang, 'Backup corrente avviato', 'Current backup started')}</dt><dd><BackupTimeValue value={workflowRun.createdAt || workflowRun.runStartedAt} lang={lang} compact /></dd></div>
              <div><dt>{adminCopy(lang, 'Backup corrente aggiornato', 'Current backup updated')}</dt><dd><BackupTimeValue value={workflowRun.updatedAt} lang={lang} compact /></dd></div>
              <div><dt>{adminCopy(lang, 'Risultato', 'Conclusion')}</dt><dd>{workflowRun.conclusion || adminCopy(lang, 'In corso', 'In progress')}</dd></div>
            </dl>
          ) : (
            <div className="admin-alert warning">{adminCopy(lang, 'Nessuna esecuzione workflow disponibile.', 'No workflow run available.')}</div>
          )}
        </section>
      )}

      <section className="admin-panel backup-panel">
        <div className="admin-panel-header">
          <h2>{adminCopy(lang, 'Programmazione backup', 'Backup schedule')}</h2>
        </div>
        <p>{adminCopy(lang, 'Backup automatico gestito dal server. Il workflow controlla la programmazione salvata e crea il backup solo quando è dovuto.', 'Automatic backup managed by the server. The workflow checks the saved schedule and creates a backup only when it is due.')}</p>

        <div className="backup-schedule-form">
          <label className="backup-toggle-row">
            <input
              type="checkbox"
              checked={scheduleDraft.enabled}
              onChange={(event) => setScheduleDraft((current) => ({ ...current, enabled: event.target.checked }))}
            />
            <span>{adminCopy(lang, 'Backup automatico', 'Automatic backup')}</span>
          </label>

          <div className="backup-schedule-grid">
            <label>
              <span>{adminCopy(lang, 'Frequenza', 'Frequency')}</span>
              <select value={scheduleDraft.frequency} onChange={(event) => setScheduleDraft((current) => normalizeBackupSchedule({ ...current, frequency: event.target.value }))}>
                <option value="daily">{adminCopy(lang, 'Giornaliero', 'Daily')}</option>
                <option value="weekly">{adminCopy(lang, 'Settimanale', 'Weekly')}</option>
                <option value="monthly">{adminCopy(lang, 'Mensile', 'Monthly')}</option>
              </select>
            </label>
            <label>
              <span>{adminCopy(lang, 'Ora', 'Time')}</span>
              <input type="time" value={backupTimeValue(scheduleDraft)} onChange={(event) => setScheduleDraft((current) => parseBackupTime(event.target.value, current))} />
            </label>
            {scheduleDraft.frequency === 'weekly' && (
              <label>
                <span>{adminCopy(lang, 'Giorno della settimana', 'Day of week')}</span>
                <select value={scheduleDraft.weekly_day} onChange={(event) => setScheduleDraft((current) => ({ ...current, weekly_day: clampNumber(event.target.value, 0, 6, 0) }))}>
                  {backupWeekdayOptions(lang).map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                </select>
              </label>
            )}
            {scheduleDraft.frequency === 'monthly' && (
              <label>
                <span>{adminCopy(lang, 'Giorno del mese', 'Day of month')}</span>
                <input type="number" min="1" max="28" value={scheduleDraft.monthly_day} onChange={(event) => setScheduleDraft((current) => ({ ...current, monthly_day: clampNumber(event.target.value, 1, 28, 1) }))} />
              </label>
            )}
          </div>

          <div className="backup-schedule-actions">
            <button className="button primary" type="button" disabled={scheduleState.saving || scheduleState.loading} onClick={handleSaveSchedule}>
              {scheduleState.saving ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Salva programmazione', 'Save schedule')}
            </button>
            <button className="button secondary" type="button" disabled={scheduleState.saving || scheduleState.loading} onClick={refreshBackupSchedule}>{adminCopy(lang, 'Ricarica', 'Reload')}</button>
          </div>
        </div>
        {scheduleState.message && <div className="admin-alert success" role="status">{scheduleState.message}</div>}
        {scheduleState.error && <div className="admin-alert warning" role="status">{scheduleState.error}</div>}
        <p className="small-note">{adminCopy(lang, 'Il controllo automatico viene eseguito ogni ora e usa questa programmazione salvata per decidere se creare un nuovo backup.', 'The automatic check runs hourly and uses this saved schedule to decide whether to create a new backup.')}</p>
      </section>

      <WeeklyReportsAdminPanel lang={lang} />

      <details className="admin-panel backup-panel backup-restore-details">
        <summary>
          <span>
            <strong>{adminCopy(lang, 'Come ripristinare', 'How to restore')}</strong>
            <small>{adminCopy(lang, 'Apri la guida completa per ripristinare database, Storage e configurazione Cloudflare.', 'Open the complete guide to restore database, Storage, and Cloudflare configuration.')}</small>
          </span>
        </summary>
        <div className="backup-restore-content">
          <p>{adminCopy(lang, 'Usa questa procedura solo in caso di ripristino reale o migrazione controllata. Il backup contiene dati riservati: trattalo come materiale confidenziale.', 'Use this procedure only for a real restore or controlled migration. The backup contains confidential data: treat it as confidential material.')}</p>

          <h3>{adminCopy(lang, '1. Verifica lo ZIP estratto', '1. Verify the extracted ZIP')}</h3>
          <p>{adminCopy(lang, 'Scarica il backup da questa pagina, estrailo in una cartella locale e verifica che i file principali siano al livello superiore dello ZIP.', 'Download the backup from this page, extract it into a local folder, and verify the main files are at the top level of the ZIP.')}</p>
          <ul className="backup-restore-list">
            <li><code>00_project_info.json</code></li>
            <li><code>01_roles.sql</code></li>
            <li><code>02_schema.sql</code></li>
            <li><code>03_data.sql</code></li>
            <li><code>README_RESTORE.md</code></li>
            <li><code>restore-supabase.ps1</code> / <code>restore-supabase.sh</code></li>
            <li><code>restore-storage.js</code></li>
            <li><code>cloudflare-env-template.txt</code></li>
            <li><code>storage-assets/manifest.json</code></li>
          </ul>
          <p className="small-note">{adminCopy(lang, 'Se restore-storage.js o storage-assets/manifest.json mancano, il backup è database-only: scaricalo comunque per il database e controlla Storage manualmente.', 'If restore-storage.js or storage-assets/manifest.json is missing, the backup is database-only: still use it for the database and check Storage manually.')}</p>

          <h3>{adminCopy(lang, '2. Prepara il progetto Supabase di destinazione', '2. Prepare the target Supabase project')}</h3>
          <ol className="backup-restore-list">
            <li>{adminCopy(lang, 'Crea o prepara il progetto Supabase di destinazione.', 'Create or prepare the target Supabase project.')}</li>
            <li>{adminCopy(lang, 'Apri Project Settings > Database e copia la connection string PostgreSQL diretta.', 'Open Project Settings > Database and copy the direct PostgreSQL connection string.')}</li>
            <li>{adminCopy(lang, 'Sostituisci la password nella connection string.', 'Replace the password in the connection string.')}</li>
            <li>{adminCopy(lang, 'In API Settings abilita la Data API, esponi public e usa public, extensions come extra search path.', 'In API Settings enable Data API, expose public, and use public, extensions as extra search path.')}</li>
          </ol>

          <h3>{adminCopy(lang, '3. Ripristina ruoli, schema e dati', '3. Restore roles, schema, and data')}</h3>
          <p>{adminCopy(lang, 'Apri un terminale nella cartella estratta e lancia uno dei comandi sotto. Serve psql installato sul computer.', 'Open a terminal in the extracted folder and run one of the commands below. psql must be installed on the computer.')}</p>
          <div className="backup-code-grid">
            <div>
              <strong>PowerShell</strong>
              <code>{`.\\restore-supabase.ps1 -NewDbUrl "postgresql://postgres:[PASSWORD]@db.YOUR-REF.supabase.co:5432/postgres"`}</code>
            </div>
            <div>
              <strong>Bash/macOS/Linux</strong>
              <code>{`./restore-supabase.sh 'postgresql://postgres:[PASSWORD]@db.YOUR-REF.supabase.co:5432/postgres'`}</code>
            </div>
          </div>
          <p>{adminCopy(lang, 'Ordine di ripristino: 01_roles.sql se applicabile, poi 02_schema.sql, poi 03_data.sql. Non invertire schema e dati.', 'Restore order: 01_roles.sql if applicable, then 02_schema.sql, then 03_data.sql. Do not invert schema and data.')}</p>

          <h3>{adminCopy(lang, '4. Ricrea Auth, admin e owner', '4. Recreate Auth, admins, and owners')}</h3>
          <ol className="backup-restore-list">
            <li>{adminCopy(lang, 'Supabase Auth non viene clonato completamente dal dump SQL: crea o verifica gli utenti in Authentication > Users.', 'Supabase Auth is not fully cloned by the SQL dump: create or verify users in Authentication > Users.')}</li>
            <li>{adminCopy(lang, 'Verifica le righe in public.admin_profiles, soprattutto gli owner attivi che possono accedere ai backup.', 'Verify rows in public.admin_profiles, especially active owners who can access backups.')}</li>
            <li>{adminCopy(lang, 'Esegui la migrazione system_backup_settings se la tabella della programmazione non esiste.', 'Run the system_backup_settings migration if the schedule table does not exist.')}</li>
          </ol>

          <h3>{adminCopy(lang, '5. Verifica e ripristino Supabase Storage', '5. Check and restore Supabase Storage')}</h3>
          <p>{adminCopy(lang, "Il dump del database non include i file binari di Supabase Storage, salvo che questo backup sia stato generato con l'esportazione Storage attiva. Dopo il ripristino, controlla bucket, immagini, PDF, volantini e altri asset caricati, quindi ricarica manualmente eventuali file mancanti.", 'The database dump does not include Supabase Storage binary files unless this backup was generated with Storage export enabled. After restore, check buckets, images, PDFs, leaflets, and other uploaded assets, then re-upload missing files.')}</p>
          <p>{adminCopy(lang, 'Questo backup include i file Supabase Storage nella cartella storage-assets/. Dopo il ripristino, verifica tutti i bucket, le immagini, i PDF, i volantini e gli asset caricati. Se un file manca o il caricamento fallisce, ricaricalo manualmente.', 'This backup includes Supabase Storage files under storage-assets/. After restore, verify all buckets, images, PDFs, leaflets, and uploaded assets. If any file is missing or failed to upload, re-upload it manually.')}</p>
          <div className="backup-code-grid">
            <div>
              <strong>PowerShell</strong>
              <code>{`$env:SUPABASE_URL="https://target-project.supabase.co"`}</code>
              <code>{`$env:${envVarName(['SUPABASE', 'SERVICE', 'ROLE', 'KEY'])}="..."`}</code>
              <code>{`node restore-storage.js`}</code>
            </div>
            <div>
              <strong>Bash/macOS/Linux</strong>
              <code>{`SUPABASE_URL="https://target-project.supabase.co" ${envVarName(['SUPABASE', 'SERVICE', 'ROLE', 'KEY'])}="..." node restore-storage.js`}</code>
            </div>
          </div>

          <h3>{adminCopy(lang, '6. Aggiorna Cloudflare Pages', '6. Update Cloudflare Pages')}</h3>
          <p>{adminCopy(lang, 'Aggiorna le variabili Cloudflare con i valori del nuovo progetto Supabase e dei segreti GitHub server-side. Non creare variabili VITE per token GitHub o service role.', 'Update Cloudflare variables with the new Supabase project values and server-side GitHub secrets. Do not create VITE variables for GitHub tokens or service-role keys.')}</p>
          <ul className="backup-restore-list">
            <li><code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code></li>
            <li><code>{envVarName(['SUPABASE', 'URL'])}</code> / <code>{envVarName(['SUPABASE', 'SERVICE', 'ROLE', 'KEY'])}</code></li>
            <li><code>GITHUB_OWNER</code>, <code>GITHUB_REPO</code>, <code>{envVarName(['GITHUB', 'BACKUP', 'WORKFLOW', 'ID'])}</code>, <code>{envVarName(['GITHUB', 'BACKUP', 'REF'])}</code>, <code>{envVarName(['GITHUB', 'BACKUP', 'TOKEN'])}</code></li>
          </ul>

          <h3>{adminCopy(lang, '7. Ridistribuisci e verifica', '7. Redeploy and verify')}</h3>
          <ol className="backup-restore-list">
            <li>{adminCopy(lang, 'Ridistribuisci Cloudflare Pages.', 'Redeploy Cloudflare Pages.')}</li>
            <li>{adminCopy(lang, 'Verifica il sito pubblico.', 'Verify the public website.')}</li>
            <li>{adminCopy(lang, 'Accedi a /admin con un owner attivo.', 'Log in to /admin with an active owner.')}</li>
            <li>{adminCopy(lang, 'Verifica pagina backup, calendario, richieste, analytics, recensioni, finanze e CMS.', 'Verify backup page, calendar, requests, analytics, reviews, finance, and CMS.')}</li>
            <li>{adminCopy(lang, 'Verifica immagini, PDF, volantini e asset caricati.', 'Verify images, PDFs, leaflets, and uploaded assets.')}</li>
            <li>{adminCopy(lang, 'Esegui un booking/questionnaire flow di test.', 'Run a test booking/questionnaire flow.')}</li>
            <li>{adminCopy(lang, 'Crea un nuovo backup e scaricalo da questa pagina.', 'Create a new backup and download it from this page.')}</li>
          </ol>
        </div>
      </details>
    </section>
  );
}

function analyticsAdminErrorMessage(lang, error) {
  const raw = `${error?.message || error || ''}`.toLowerCase();
  if (raw.includes('analytics_events') || raw.includes('analytics_sessions') || raw.includes('schema cache') || raw.includes('pgrst')) {
    return adminCopy(lang, 'La tabella degli eventi analytics non è disponibile o non è ancora sincronizzata.', 'The analytics events table is not available or has not synced yet.');
  }
  return adminCopy(lang, 'Analytics non disponibili al momento.', 'Analytics are not available right now.');
}

function analyticsTechnicalError(error) {
  return error?.message || error?.details || error?.hint || error?.code || '';
}


function ShortLinksPanel({ lang }) {
  const links = [
    ['/r/google-profile', '/?utm_source=google_business_profile&utm_medium=organic&utm_campaign=profile', 'Google profile'],
    ['/r/google-booking', '/experiences?utm_source=google_business_profile&utm_medium=booking&utm_campaign=fixed_excursions', 'Google booking'],
    ['/r/ig-bio', '/?utm_source=instagram&utm_medium=social&utm_campaign=bio', 'Instagram bio'],
    ['/r/wa', '/?utm_source=whatsapp&utm_medium=share&utm_campaign=direct', 'WhatsApp'],
    ['/r/partner', '/?utm_source=partner&utm_medium=referral&utm_campaign=partner', 'Partner'],
    ['/r/qr', '/?utm_source=qr&utm_medium=offline&utm_campaign=printed_qr', 'QR'],
    ['/r/card', '/?utm_source=business_card&utm_medium=offline&utm_campaign=card', 'Business card']
  ];
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  async function copyLink(path) {
    const value = `${origin}${path}`;
    try { await navigator.clipboard.writeText(value); } catch {}
    trackEvent('gbp_utm_link_click', { language: lang, short_link: path, action: 'copy' }, { dedupe: false });
  }
  return (
    <AnalyticsPanel title={adminCopy(lang, 'Link UTM rapidi', 'Quick UTM links')}>
      <AnalyticsHelperNote>{adminCopy(lang, 'Usa questo link nella scheda Google per distinguere il traffico Google Business Profile da Instagram, WhatsApp, QR e partner.', 'Use this link in Google Business Profile to separate Google traffic from Instagram, WhatsApp, QR and partner traffic.')}</AnalyticsHelperNote>
      <div className="short-link-panel">
        {links.map(([path, destination, label]) => (
          <div className="short-link-row" key={path}>
            <strong>{label}</strong>
            <code>{origin}{path}</code>
            <button className="button secondary" type="button" onClick={() => copyLink(path)}>{adminCopy(lang, 'Copia', 'Copy')}</button>
            <small>{destination}</small>
          </div>
        ))}
      </div>
    </AnalyticsPanel>
  );
}


function AdminAnalyticsPage({ lang, profile, adminContent = {} }) {
  const [period, setPeriod] = useState('30d');
  const [customRange, setCustomRange] = useState(() => defaultAnalyticsCustomRange());
  const [reloadToken, setReloadToken] = useState(0);
  const [browserExcluded, setBrowserExcluded] = useState(() => isAnalyticsBrowserExcluded());
  const [state, setState] = useState({
    loading: true, error: '', technicalError: '', summary: null,
    events: [], sessions: [], bookingRequests: [], eventTotal: 0, sessionTotal: 0,
    lastRefreshed: null
  });
  const [analyticsDetailsOpen, setAnalyticsDetailsOpen] = useState(false);
  const range = useMemo(() => canonicalAnalyticsDateRange(period, new Date(), customRange), [period, customRange, reloadToken]);

  useEffect(() => {
    let alive = true;
    async function loadAnalytics() {
      if (period === 'custom' && range.valid === false) {
        if (alive) setState((current) => ({ ...current, loading: false, error: adminCopy(lang, 'Seleziona un intervallo personalizzato valido.', 'Select a valid custom date range.'), technicalError: '' }));
        return;
      }
      setState((current) => ({ ...current, loading: true, error: '', technicalError: '' }));
      try {
        const summary = await getAdminAnalyticsSummary({ ...range, useReportingBaseline: range.useReportingBaseline !== false });
        const drilldownRange = {
          from: summary?.meta?.effective_from || '',
          to: summary?.meta?.effective_to || range.to || ''
        };
        const [eventPage, sessionPage, requests] = await Promise.all([
          listAnalyticsEventPage({ ...drilldownRange, page: 0, pageSize: 250 }),
          listAnalyticsSessionPage({ ...drilldownRange, page: 0, pageSize: 250 }),
          listBookingRequests({ limit: 1000 }).catch(() => [])
        ]);
        if (!alive) return;
        setState({
          loading: false, error: '', technicalError: '', summary,
          events: eventPage.rows || [], sessions: sessionPage.rows || [], bookingRequests: requests || [],
          eventTotal: eventPage.total || 0, sessionTotal: sessionPage.total || 0,
          lastRefreshed: new Date().toISOString()
        });
      } catch (error) {
        if (!alive) return;
        setState((current) => ({
          ...current, loading: false,
          error: analyticsAdminErrorMessage(lang, error),
          technicalError: analyticsTechnicalError(error),
          summary: null, events: [], sessions: [], eventTotal: 0, sessionTotal: 0,
          lastRefreshed: new Date().toISOString()
        }));
      }
    }
    loadAnalytics();
    return () => { alive = false; };
  }, [period, lang, reloadToken, range.from, range.to, range.useReportingBaseline, range.valid]);

  const rawModel = useMemo(() => buildAnalyticsModel({ events: state.events, sessions: state.sessions, bookingRequests: state.bookingRequests, range, lang }), [state.events, state.sessions, state.bookingRequests, range, lang]);
  const model = useMemo(() => {
    if (!state.summary) return rawModel;
    const canonical = summaryToAdminModelPatch(state.summary, formatDuration, lang);
    return {
      ...rawModel,
      ...canonical,
      conversionMetrics: { ...rawModel.conversionMetrics, ...canonical.conversionMetrics },
      // Core warnings come from the server contract. Raw-sample warnings remain
      // available in the details modal but cannot override operational truth.
      warnings: canonical.warnings,
      requestTrackingSummary: {
        ...rawModel.requestTrackingSummary,
        website_form_requests: canonical.websiteRequests,
        booking_code_requests: canonical.bookingCodeRequests,
        website_form_submit_attempts: canonical.submitAttempts,
        website_form_submit_successes: canonical.submitSuccesses,
        booking_code_redeem_attempts: canonical.bookingCodeRedeemAttempts,
        booking_code_redeem_successes: canonical.bookingCodeRedeemSuccesses,
        current_submit_errors: canonical.submitIncidentState === 'current_failure' ? canonical.submitErrors : 0
      }
    };
  }, [rawModel, state.summary]);
  const hasData = Boolean(state.summary && (model.pageViews > 0 || model.visitors > 0 || model.websiteRequests > 0 || model.bookingCodeRequests > 0 || model.giftCardRequests > 0));
  const emptyText = adminCopy(lang, 'Nessun dato disponibile per il periodo selezionato.', 'No analytics data available for the selected period.');
  const setupText = adminCopy(lang, 'I dati inizieranno a comparire dopo le prime visite pubbliche al sito.', 'Data will start appearing after the first public visits to the website.');

  async function startNewBaseline() {
    const confirmed = window.confirm(adminCopy(lang, 'Le metriche operative inizieranno da adesso. I dati storici resteranno salvati e saranno ancora visibili in “Tutti i dati storici”. Continuare?', 'Operational metrics will start from now. Historical analytics will remain stored and visible under “All historical data”. Continue?'));
    if (!confirmed) return;
    try {
      await setAnalyticsReportingBaseline(new Date().toISOString());
      setPeriod('baseline');
      setReloadToken((value) => value + 1);
    } catch (error) {
      setState((current) => ({ ...current, error: analyticsAdminErrorMessage(lang, error), technicalError: analyticsTechnicalError(error) }));
    }
  }

  async function clearBaseline() {
    const confirmed = window.confirm(adminCopy(lang, 'Rimuovere la baseline di reporting? Nessun dato verrà eliminato.', 'Clear the reporting baseline? No data will be deleted.'));
    if (!confirmed) return;
    try {
      await clearAnalyticsReportingBaseline();
      setReloadToken((value) => value + 1);
    } catch (error) {
      setState((current) => ({ ...current, error: analyticsAdminErrorMessage(lang, error), technicalError: analyticsTechnicalError(error) }));
    }
  }

  function toggleBrowserExclusion(excluded) {
    setAnalyticsBrowserExcluded(excluded);
    setBrowserExcluded(isAnalyticsBrowserExcluded());
  }

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
          {period === 'custom' && <div className="analytics-custom-range">
            <label><span>{adminCopy(lang, 'Dal', 'From')}</span><input type="date" value={customRange.from} onChange={(event) => setCustomRange((current) => ({ ...current, from: event.target.value }))} /></label>
            <label><span>{adminCopy(lang, 'Al', 'To')}</span><input type="date" value={customRange.to} onChange={(event) => setCustomRange((current) => ({ ...current, to: event.target.value }))} /></label>
          </div>}
          <button className="button secondary analytics-export-button" type="button" disabled={state.loading || (period === 'custom' && range.valid === false)} onClick={() => downloadAnalyticsExport({ lang, period, range, model, canonicalSummary: state.summary, events: state.events, sessions: state.sessions, bookingRequests: state.bookingRequests, eventTotal: state.eventTotal, sessionTotal: state.sessionTotal })}>{adminCopy(lang, 'Esporta metriche', 'Export metrics')}</button>
        </div>
      </div>

      {state.summary && <AnalyticsHealthPanel
        lang={lang}
        meta={state.summary.meta}
        lastRefreshed={state.lastRefreshed}
        busy={state.loading}
        browserExcluded={browserExcluded}
        onRefresh={() => setReloadToken((value) => value + 1)}
        onStartBaseline={startNewBaseline}
        onClearBaseline={clearBaseline}
        canManageBaseline={['owner', 'manager'].includes(profile?.role) && profile?.active !== false}
        onToggleBrowserExclusion={toggleBrowserExclusion}
      />}

      <ShortLinksPanel lang={lang} />

      {state.error && (
        <div className="admin-alert warning" role="status">
          <p>{state.error}</p>
          <p>{setupText}</p>
          {state.technicalError && (
            <details className="admin-technical-details">
              <summary>{adminCopy(lang, 'Dettagli tecnici', 'Technical details')}</summary>
              <code>{state.technicalError}</code>
            </details>
          )}
        </div>
      )}
      {state.loading ? <p>{adminCopy(lang, 'Caricamento dati...', 'Loading analytics...')}</p> : (
        <>
          {!hasData && <div className="admin-alert warning" role="status">{emptyText}<br />{setupText}</div>}
          {(state.eventTotal > state.events.length || state.sessionTotal > state.sessions.length) && <p className="analytics-raw-sample-note">{adminCopy(lang, `Le metriche principali sono aggregate sul server e complete. I dettagli tecnici sotto mostrano solo un campione paginato (${state.events.length}/${state.eventTotal} eventi; ${state.sessions.length}/${state.sessionTotal} sessioni).`, `Primary metrics are complete server-side aggregates. Technical drilldowns below show only a paginated sample (${state.events.length}/${state.eventTotal} events; ${state.sessions.length}/${state.sessionTotal} sessions).`)}</p>}

          <AnalyticsStaticPanel title={<AdminEditableText itemKey="admin.analytics.overview.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Panoramica', 'Overview')} />}>
            <AnalyticsWarningList warnings={model.warnings} lang={lang} onOpenDetails={() => setAnalyticsDetailsOpen(true)} />
            <div className="admin-summary-grid analytics-summary-grid">
              <SummaryCard label={adminCopy(lang, 'Visitatori unici stimati', 'Approx. unique visitors')} value={model.visitors || '—'} helper={adminCopy(lang, 'Profili browser anonimi', 'Anonymous browser profiles')} />
              <SummaryCard label={adminCopy(lang, 'Visualizzazioni pagina', 'Page views')} value={model.pageViews} />
              <SummaryCard label={adminCopy(lang, 'Sessioni', 'Sessions')} value={model.sessions ?? '—'} />
              <SummaryCard label={adminCopy(lang, 'Richieste sito', 'Website requests')} value={model.websiteRequests} helper={adminCopy(lang, 'Tutti i record business storici', 'All historical business records')} />
              <SummaryCard label={adminCopy(lang, 'Completamento funnel sito', 'Website funnel completion')} value={model.conversionMetrics.websiteFunnelCompletion || '—'} />
              <SummaryCard label={adminCopy(lang, 'Visitatori con intento contatto', 'Contact-intent visitors')} value={model.contactIntentVisitors ?? 0} helper={model.conversionMetrics.contactIntentConversion} />
              <SummaryCard label={adminCopy(lang, 'Richieste con codice', 'Booking-code requests')} value={model.bookingCodeRequests} helper={adminCopy(lang, 'Tutti i record business storici', 'All historical business records')} />
              <SummaryCard label="Gift Card" value={model.giftCardRequests ?? 0} helper={adminCopy(lang, 'Tutti i record business storici', 'All historical business records')} />
              <SummaryCard label={adminCopy(lang, 'Tentativi invio sito', 'Website submit attempts')} value={model.submitAttempts} />
              <SummaryCard label={adminCopy(lang, 'Invii riusciti sito', 'Website submit successes')} value={model.submitSuccesses} />
              <SummaryCard label={adminCopy(lang, 'Errori invio sito', 'Website submit errors')} value={model.submitErrors} />
              <SummaryCard label={adminCopy(lang, 'Tempo medio di coinvolgimento', 'Average engagement time')} value={model.averageEngagement} />
            </div>
          </AnalyticsStaticPanel>

          {state.summary && <AnalyticsCanonicalFunnels lang={lang} payload={state.summary} />}

          {state.summary && <AnalyticsStaticPanel title={adminCopy(lang, 'Domanda per esperienza · canonica', 'Experience demand · canonical')}>
            <AnalyticsHelperNote>{adminCopy(lang, 'Questi valori arrivano dalla stessa aggregazione server-side usata dai KPI e dal report settimanale. Le richieste database includono solo il periodo compatibile con il contratto di tracking.', 'These values come from the same server-side aggregate used by the KPI cards and weekly report. Database requests include only the period compatible with the tracking contract.')}</AnalyticsHelperNote>
            <AnalyticsTable
              columns={[
                { key: 'experience', label: adminCopy(lang, 'Esperienza', 'Experience') },
                { key: 'card_impressions', label: adminCopy(lang, 'Impression card', 'Card impressions') },
                { key: 'detail_opens', label: adminCopy(lang, 'Dettagli aperti', 'Detail opens') },
                { key: 'unique_detail_visitors', label: adminCopy(lang, 'Visitatori dettaglio', 'Detail visitors') },
                { key: 'form_opens', label: adminCopy(lang, 'Aperture modulo', 'Form opens') },
                { key: 'tracked_successes', label: adminCopy(lang, 'Invii tracciati', 'Tracked successes') },
                { key: 'database_requests', label: adminCopy(lang, 'Richieste DB compatibili', 'Compatible DB requests') },
                { key: 'confirmed_database_requests', label: adminCopy(lang, 'Confermate', 'Confirmed') },
                { key: 'contact_actions', label: adminCopy(lang, 'Azioni contatto', 'Contact actions') },
                { key: 'tracked_conversion', label: adminCopy(lang, 'Dettaglio → invio', 'Detail → submit') }
              ]}
              rows={model.canonicalExperienceRows || []}
              empty={emptyText}
            />
          </AnalyticsStaticPanel>}

          <AnalyticsPanel title={adminCopy(lang, 'Qualità dati', 'Data quality')}>
            <AnalyticsHelperNote>{adminCopy(lang, 'Avvisi diagnostici per capire quando il funnel non è internamente coerente. Le metriche pubbliche escludono traffico admin/API.', 'Diagnostic warnings for identifying when the funnel is not internally coherent. Public metrics exclude admin/API traffic.')}</AnalyticsHelperNote>
            <AnalyticsTable
              columns={[
                { key: 'check', label: adminCopy(lang, 'Controllo', 'Check') },
                { key: 'count', label: adminCopy(lang, 'Conteggio', 'Count') },
                { key: 'detail', label: adminCopy(lang, 'Dettaglio', 'Detail') }
              ]}
              rows={state.summary ? (state.summary.integrity?.warnings || []).map((warning) => ({ check: warning.code || warning.severity || 'diagnostic', count: warning.count ?? 0, detail: warning.message || '—' })) : model.dataQualityRows}
              empty={emptyText}
            />
          </AnalyticsPanel>

          <AnalyticsPanel title={<AdminEditableText itemKey="admin.analytics.bookingFunnel.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Diagnostica dettagliata (campione)', 'Detailed diagnostics (sample)')} />}>
            <AnalyticsHelperNote>{adminCopy(lang, 'Questa sezione usa solo il campione tecnico paginato per ispezionare singoli percorsi. Non è la fonte dei KPI o dei funnel canonici sopra.', 'This section uses only the paginated technical sample to inspect individual journeys. It is not the source of the KPI cards or canonical funnels above.')}</AnalyticsHelperNote>
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
            <AnalyticsSubsection title={adminCopy(lang, 'Integrità richieste', 'Request tracking integrity')}>
              <AnalyticsTable
                columns={[
                  { key: 'created_at', label: adminCopy(lang, 'Creata il', 'Created at') },
                  { key: 'request_type', label: adminCopy(lang, 'Tipo', 'Type') },
                  { key: 'experience_id', label: adminCopy(lang, 'Esperienza', 'Experience') },
                  { key: 'matched_submit_attempt', label: adminCopy(lang, 'Tentativo', 'Attempt') },
                  { key: 'matched_submit_success', label: adminCopy(lang, 'Invio riuscito', 'Submit success') },
                  { key: 'matched_booking_code_redeem_success', label: adminCopy(lang, 'Riscatto codice', 'Code redeem') },
                  { key: 'matched_booking_request_created_event', label: adminCopy(lang, 'Evento richiesta', 'Request event') },
                  { key: 'tracking_match_method', label: adminCopy(lang, 'Match', 'Match') },
                  { key: 'tracking_integrity_status', label: adminCopy(lang, 'Stato', 'Status') },
                  { key: 'heard_about_us_display', label: adminCopy(lang, 'Fonte dichiarata', 'Declared source') }
                ]}
                rows={model.requestTrackingIntegrity.slice(0, 25)}
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
                  <SummaryCard label={adminCopy(lang, 'Tentativi invio modulo', 'Form submit attempts')} value={model.submitAttempts} />
                  <SummaryCard label={adminCopy(lang, 'Invii riusciti tracciati', 'Tracked successful submissions')} value={model.submitSuccesses} />
                  <SummaryCard label={adminCopy(lang, 'Errori invio', 'Submit errors')} value={model.submitErrors} />
                  <SummaryCard label={adminCopy(lang, 'Tentativi codice', 'Code attempts')} value={model.bookingCodeRedeemAttempts} />
                  <SummaryCard label={adminCopy(lang, 'Riscatti codice riusciti', 'Code successes')} value={model.bookingCodeRedeemSuccesses} />
                  <SummaryCard label={adminCopy(lang, 'Conversione invii', 'Tracked conversion')} value={model.conversionMetrics.trackedSubmissionConversion} />
                </div>
              </AnalyticsSubsection>
            </div>
          </AnalyticsPanel>

          <AnalyticsPanel title={<AdminEditableText itemKey="admin.analytics.contactIntent.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Intento di contatto', 'Contact intent')} />}>
            <AnalyticsHelperNote>{adminCopy(lang, 'I totali e i visitatori con intento contatto arrivano dall’aggregazione canonica server-side. La tabella dei percorsi sotto è un campione diagnostico paginato.', 'Contact totals and contact-intent visitors come from the canonical server-side aggregate. The path table below is a paginated diagnostic sample.')}</AnalyticsHelperNote>
            <div className="admin-summary-grid analytics-mini-summary-grid">
              <SummaryCard label={adminCopy(lang, 'Click WhatsApp', 'WhatsApp clicks')} value={model.whatsappClicks} />
              <SummaryCard label={adminCopy(lang, 'Click email', 'Email clicks')} value={model.emailClicks} />
              <SummaryCard label={adminCopy(lang, 'Click telefono', 'Phone clicks')} value={model.phoneClicks} />
              <SummaryCard label={adminCopy(lang, 'Click Google Maps', 'Google Maps clicks')} value={model.mapsClicks} />
            </div>
            <AnalyticsSubsection title={adminCopy(lang, 'Percorsi di contatto · campione diagnostico', 'Contact paths · diagnostic sample')}>
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
              <AnalyticsSubsection title={adminCopy(lang, 'Sorgenti principali · page views', 'Top sources · page views')}>
                <AnalyticsRowList rows={model.sourceRows} total={Math.max(1, model.sourceRows.reduce((sum, row) => sum + row.count, 0))} empty={emptyText} />
              </AnalyticsSubsection>
            </div>
            <AnalyticsSubsection title={adminCopy(lang, 'Dove ci hanno scoperto · campione richieste', 'Where customers found us · request sample')}>
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
            <AnalyticsHelperNote>{adminCopy(lang, 'Dispositivi, browser, sistemi operativi, lingua, pagine e geografia sono aggregati dal server sulle page view complete. I funnel mobile, le ipotesi geografiche e i percorsi sessione sono invece campioni diagnostici paginati.', 'Devices, browsers, operating systems, language, pages, and geography are complete server-side page-view aggregates. Mobile funnels, geography hypotheses, and session paths are paginated diagnostic samples.')}</AnalyticsHelperNote>
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
                <h4>{adminCopy(lang, 'Page views per dispositivo', 'Page views by device')}</h4>
                <AnalyticsRowList rows={model.deviceRows} total={model.pageViews || 1} empty={emptyText} />
                <h4>{adminCopy(lang, 'Page views per browser', 'Page views by browser')}</h4>
                <AnalyticsRowList rows={model.browserRows} total={model.pageViews || 1} empty={emptyText} />
                <h4>{adminCopy(lang, 'Page views per sistema operativo', 'Page views by operating system')}</h4>
                <AnalyticsRowList rows={model.osRows} total={model.pageViews || 1} empty={emptyText} />
              </AnalyticsSubsection>
            </div>
            <div className="analytics-two-column-grid">
              <AnalyticsSubsection title={adminCopy(lang, 'Lingua e conversione · campione diagnostico', 'Language and conversion · diagnostic sample')}>
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
                <AnalyticsRowList rows={model.languageRows} total={model.pageViews || 1} empty={emptyText} helperLabel={adminCopy(lang, 'page views', 'page views')} />
              </AnalyticsSubsection>
            </div>
            <div className="analytics-two-column-grid">
              <AnalyticsSubsection title={adminCopy(lang, 'Geografia: ipotesi · campione diagnostico', 'Geography: hypotheses · diagnostic sample')}>
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
                <AnalyticsRowList rows={model.countryRows} total={model.pageViews || 1} empty={emptyText} />
                <h4>{adminCopy(lang, 'Città principali', 'Top cities')}</h4>
                <AnalyticsRowList rows={model.cityRows} total={model.pageViews || 1} empty={adminCopy(lang, 'Città non disponibile se Cloudflare non la fornisce.', 'City is unavailable if Cloudflare does not provide it.')} />
              </AnalyticsSubsection>
            </div>
            <div className="analytics-two-column-grid">
              <AnalyticsSubsection title={adminCopy(lang, 'Percorsi sessione · campione diagnostico', 'Session paths · diagnostic sample')}>
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
      {analyticsDetailsOpen && <AnalyticsDetailsModal lang={lang} model={model} onClose={() => setAnalyticsDetailsOpen(false)} />}
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
const [partnerCommissions, setPartnerCommissions] = useState([]);
const [reconciliationEntries, setReconciliationEntries] = useState([]);
const [reconciliationCodes, setReconciliationCodes] = useState([]);
const [reconciliationGiftCards, setReconciliationGiftCards] = useState([]);
const [partnerCommissionSummary, setPartnerCommissionSummary] = useState({
  commissions: [],
  pendingAmount: 0,
  approvedUnpaidAmount: 0,
  paidAmount: 0,
  cancelledAmount: 0,
  unpaidLiability: 0,
  pendingCount: 0,
  approvedCount: 0,
  paidCount: 0,
  cancelledCount: 0,
  byPartner: [],
  byCurrency: []
});
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
  const [refundTarget, setRefundTarget] = useState(null);

  const resolvedDateRange = useMemo(() => resolveFinanceDateRange(filters, lang), [filters, lang]);

  async function refresh() {
    setLoading(true);
    setError('');
    const dateRange = resolveFinanceDateRange(filters, lang);
    try {
      const [entryData, requestData, fixedData, leafletData, commissionSummaryData, allFinanceData, codeData, giftCardData] = await Promise.all([
        listFinanceEntries({ ...filters, fromDate: dateRange.startDate, toDate: dateRange.endDate }),
        listBookingRequests({ limit: 250 }),
        listFixedExcursions({ activeOnly: false }),
        listMonthlyLeaflets({ activeOnly: false }),
        listPartnerCommissionSummary({ limit: 1000 }).catch(() => ({ commissions: [], pendingAmount: 0, approvedUnpaidAmount: 0, paidAmount: 0, cancelledAmount: 0, unpaidLiability: 0, pendingCount: 0, approvedCount: 0, paidCount: 0, cancelledCount: 0, byPartner: [], byCurrency: [] })),
        listFinanceEntries({ limit: 1000, includeArchived: true }),
        listBookingCodes({ limit: 500 }),
        listGiftCardRequests({ limit: 500 })
      ]);
      setEntries(entryData);
      setRequests(requestData);
      setFixedExcursions(fixedData);
      setLeaflets(leafletData);
      setPartnerCommissions(commissionSummaryData.commissions || []);
      setPartnerCommissionSummary(commissionSummaryData);
      setReconciliationEntries(allFinanceData);
      setReconciliationCodes(codeData);
      setReconciliationGiftCards(giftCardData);
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
    if (!form.entry_date || !form.title.trim() || parseMoneyAmount(form.amount) <= 0) {
      setError(adminCopy(lang, 'Data, titolo e importo positivo sono obbligatori.', 'Date, title, and a positive amount are required.'));
      return;
    }
    try {
      const normalizedForm = { ...form, amount: parseMoneyAmount(form.amount), currency: normalizeCurrency(form.currency) };
      if (editing) await updateFinanceEntry(editing.id, normalizedForm, session.user.id);
      else await createFinanceEntry(normalizedForm, session.user.id);
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
  const financeById = useMemo(() => new Map(reconciliationEntries.map((entry) => [entry.id, entry])), [reconciliationEntries]);
  const enrichedEntries = useMemo(() => entries.map((entry) => enrichFinanceEntry(entry, { requestById, fixedById, leafletById })), [entries, requestById, fixedById, leafletById]);
  const reportEntries = filters.includeArchived ? enrichedEntries : enrichedEntries.filter((entry) => entry.active !== false);
  const financeSummary = calculateFinanceSummary(reportEntries);
  const reconciliation = useMemo(() => buildFinancialReconciliation({ bookings: requests, bookingCodes: reconciliationCodes, giftCards: reconciliationGiftCards, partnerCommissions, financeEntries: reconciliationEntries }), [requests, reconciliationCodes, reconciliationGiftCards, partnerCommissions, reconciliationEntries]);
  const aggregateCurrency = financeSummary.byCurrency?.length === 1 ? financeSummary.byCurrency[0].currency : null;
  const aggregateMoney = (key) => aggregateCurrency ? formatMoney(financeSummary[key] || 0, aggregateCurrency, lang) : financeSummary.byCurrency?.length > 1 ? adminCopy(lang, 'Più valute', 'Multiple currencies') : formatMoney(0, 'EUR', lang);
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
        <SummaryCard label={adminCopy(lang, 'Incassato', 'Recorded payments')} value={aggregateMoney('income')} onClick={() => setActiveFinanceDetail({ key: 'income', title: adminCopy(lang, 'Entrate', 'Income'), entries: financeSummary.incomeEntries, total: financeSummary.income })} helper={adminCopy(lang, 'Apri dettaglio', 'Open details')} />
        <SummaryCard label={adminCopy(lang, 'Entrate attese', 'Expected revenue')} value={aggregateMoney('expectedIncome')} onClick={() => setActiveFinanceDetail({ key: 'expected-income', title: adminCopy(lang, 'Entrate attese', 'Expected income'), entries: financeSummary.expectedEntries, total: financeSummary.expectedIncome })} helper={adminCopy(lang, 'Non confermate', 'Not confirmed')} />
        <SummaryCard label={adminCopy(lang, 'Uscite', 'Expenses')} value={aggregateMoney('expenses')} onClick={() => setActiveFinanceDetail({ key: 'expenses', title: adminCopy(lang, 'Uscite', 'Expenses'), entries: financeSummary.expenseEntries, total: financeSummary.expenses })} helper={adminCopy(lang, 'Apri dettaglio', 'Open details')} />
        <SummaryCard label={adminCopy(lang, 'Risultato netto', 'Net result')} value={aggregateMoney('net')} onClick={() => setActiveFinanceDetail({ key: 'net', title: adminCopy(lang, 'Utile netto', 'Net profit'), entries: reportEntries, total: financeSummary.net })} helper={adminCopy(lang, 'Entrate meno uscite', 'Income minus expenses')} />
        <SummaryCard label={adminCopy(lang, 'Prenotazioni collegate', 'Linked bookings')} value={linkedEntries.length} onClick={() => setActiveFinanceDetail({ key: 'linked', title: adminCopy(lang, 'Prenotazioni collegate', 'Linked bookings'), entries: linkedEntries, total: linkedEntries.length })} helper={adminCopy(lang, 'Vedi movimenti', 'View entries')} />
        <SummaryCard label={adminCopy(lang, 'Spese non collegate', 'Unlinked expenses')} value={unlinkedExpenseEntries.length} onClick={() => setActiveFinanceDetail({ key: 'unlinked-expenses', title: adminCopy(lang, 'Spese non collegate', 'Unlinked expenses'), entries: unlinkedExpenseEntries, total: unlinkedExpenseEntries.length })} helper={adminCopy(lang, 'Vedi spese', 'View expenses')} />
        {Number(partnerCommissionSummary?.unpaidLiability || 0) > 0 && <SummaryCard label={adminCopy(lang, 'Liabilità commissioni partner', 'Partner commission liabilities')} value={formatCurrencyMetricRows(partnerCommissionSummary.byCurrency || [], 'unpaidLiability', lang)} helper={adminCopy(lang, 'In attesa + approvate non pagate', 'Pending + approved unpaid')} />}
        <SummaryCard label={adminCopy(lang, 'Commissioni pagate', 'Paid commissions')} value={formatCurrencyMetricRows(partnerCommissionSummary?.byCurrency || [], 'paidAmount', lang)} helper={`${partnerCommissionSummary?.paidCount || 0} ${adminCopy(lang, 'record', 'records')}`} />
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
      <FinanceReconciliationPanel lang={lang} reconciliation={reconciliation} requestById={requestById} financeById={financeById} session={session} onChanged={refresh} onOpenEntry={(entry) => setActiveFinanceDetail({ key: 'movement', title: adminCopy(lang, 'Dettaglio movimento', 'Movement detail'), entries: [entry], total: Number(entry.amount || 0), selectedEntry: entry })} onRefundEntry={(entry) => setRefundTarget(entry)} />
      <FinanceOverview lang={lang} summary={financeSummary} rangeLabel={resolvedDateRange.label} onOpen={setActiveFinanceDetail} />
      <FinanceProfitLoss lang={lang} summary={financeSummary} adminContent={adminContent} />
      <PartnerCommissionsFinancePanel lang={lang} session={session} commissions={partnerCommissions} summary={partnerCommissionSummary} onChanged={async (message) => { setFeedback(message); await refresh(); }} />
      <div className="admin-two-column finance-layout">
        <details className="admin-panel finance-collapsible-panel finance-form-panel" open={Boolean(editing)}>
          <summary className="finance-collapsible-summary">
            <strong>{editing ? contentText(adminContent, 'admin.finance.editEntry.title', lang, adminCopy(lang, 'Modifica voce', 'Edit entry')) : contentText(adminContent, 'admin.finance.addEntry.title', lang, adminCopy(lang, 'Aggiungi voce', 'Add entry'))}</strong>
          </summary>
          <div className="finance-collapsible-body">
          <p className="small-note">{adminCopy(lang, 'Per le prenotazioni usa normalmente Prenotazione → Registra pagamento. Questa voce manuale resta per carburante, attrezzatura, pubblicità, assicurazione, parcheggi, costi guida e movimenti reali fuori sistema.', 'For bookings, normally use Booking → Record payment. Manual Finance remains for fuel, equipment, advertising, insurance, parking, guide costs, and genuine off-system transactions.')}</p>
          <form className="admin-form-grid" onSubmit={submit}>
            <AdminSelect label={adminCopy(lang, 'Tipo', 'Type')} value={form.type} onChange={(value) => update('type', value)} options={['income', 'expense']} formatter={(value) => value === 'income' ? adminCopy(lang, 'Entrata', 'Income') : adminCopy(lang, 'Uscita', 'Expense')} />
            <AdminInput label={adminCopy(lang, 'Data', 'Date')} type="date" value={form.entry_date} onChange={(value) => update('entry_date', value)} />
            <AdminInput label={adminCopy(lang, 'Importo', 'Amount')} type="text" value={form.amount} onChange={(value) => update('amount', value)} />
            <AdminInput label={adminCopy(lang, 'Valuta', 'Currency')} value={form.currency} onChange={(value) => update('currency', normalizeCurrency(value))} />
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
              {enrichedEntries.map((entry) => <FinanceEntryCard key={entry.id} entry={entry} lang={lang} onOpen={() => setActiveFinanceDetail({ key: 'movement', title: adminCopy(lang, 'Dettaglio movimento', 'Movement detail'), entries: [entry], total: Number(entry.amount || 0), selectedEntry: entry })} onEdit={() => startEdit(entry)} onArchive={() => archive(entry)} onRefund={() => setRefundTarget(entry)} />)}
            </div>
          )}
          </div>
        </details>
      </div>
      {refundTarget && <FinanceRefundDialog entry={refundTarget} lang={lang} onClose={() => setRefundTarget(null)} onSaved={async () => { setRefundTarget(null); setFeedback(adminCopy(lang, 'Rimborso/storno registrato.', 'Refund/reversal recorded.')); await refresh(); }} />}
      {activeFinanceDetail && <FinanceDetailModal detail={activeFinanceDetail} lang={lang} onClose={() => setActiveFinanceDetail(null)} />}
    </section>
  );
}


function PartnerCommissionsFinancePanel({ lang, session, commissions = [], summary = null, onChanged }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const data = summary || { pendingAmount: 0, approvedUnpaidAmount: 0, paidAmount: 0, cancelledAmount: 0, unpaidLiability: 0, pendingCount: 0, approvedCount: 0, paidCount: 0, cancelledCount: 0, byPartner: [], byCurrency: [] };
  const visible = statusFilter === 'all' ? commissions : commissions.filter((item) => item.status === statusFilter);

  async function setStatus(item, status) {
    setBusyId(item.id);
    setError('');
    try {
      await updatePartnerCommissionStatus(item.id, status, item.status_notes || '', session.user.id);
      trackEvent(status === 'paid' ? 'partner_commission_marked_paid' : 'partner_commission_status_changed', { partner_id: item.partner_id || '', source_type: item.source_type || '', commission_status: status, currency: item.currency || 'EUR', has_commission_amount: Boolean(item.commission_amount), commission_type: item.commission_type || '', source_section: 'admin_finance', admin_action: `set_${status}` }, { dedupe: false });
      onChanged?.(status === 'paid' ? adminCopy(lang, 'Commissione segnata come pagata.', 'Commission marked as paid.') : adminCopy(lang, 'Commissione aggiornata.', 'Commission updated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Commissione non aggiornata.', 'Commission not updated.'));
    } finally {
      setBusyId('');
    }
  }

  return (
    <details className="admin-panel finance-collapsible-panel partner-commissions-panel" open>
      <summary className="finance-collapsible-summary">
        <strong>{adminCopy(lang, 'Commissioni partner', 'Partner commissions')}</strong>
        {data.byCurrency?.some((row) => Number(row.unpaidLiability || 0) > 0) && <em>{formatCurrencyMetricRows(data.byCurrency, 'unpaidLiability', lang)} {adminCopy(lang, 'non pagate', 'unpaid')}</em>}
      </summary>
      <div className="finance-collapsible-body">
        <p className="small-note">{adminCopy(lang, 'Le commissioni sono interne, non pubbliche, e vengono conteggiate come liabilità fino al pagamento manuale.', 'Commissions are internal, non-public, and counted as liabilities until manually paid.')}</p>
        {error && <div className="admin-alert error compact-alert">{error}</div>}
        <div className="admin-summary-grid partner-commission-summary-grid">
          <SummaryCard label={adminCopy(lang, 'In attesa', 'Pending')} value={formatCurrencyMetricRows(data.byCurrency || [], 'pendingAmount', lang)} helper={`${data.pendingCount || 0} ${adminCopy(lang, 'record', 'records')}`} />
          <SummaryCard label={adminCopy(lang, 'Approvate non pagate', 'Approved unpaid')} value={formatCurrencyMetricRows(data.byCurrency || [], 'approvedUnpaidAmount', lang)} helper={`${data.approvedCount || 0} ${adminCopy(lang, 'record', 'records')}`} />
          {data.byCurrency?.some((row) => Number(row.unpaidLiability || 0) > 0) && <SummaryCard label={adminCopy(lang, 'Totale non pagato', 'Total unpaid')} value={formatCurrencyMetricRows(data.byCurrency || [], 'unpaidLiability', lang)} helper={adminCopy(lang, 'Liabilità finance', 'Finance liability')} />}
          <SummaryCard label={adminCopy(lang, 'Pagate', 'Paid')} value={formatCurrencyMetricRows(data.byCurrency || [], 'paidAmount', lang)} helper={`${data.paidCount || 0} ${adminCopy(lang, 'record', 'records')}`} />
          <SummaryCard label={adminCopy(lang, 'Annullate', 'Cancelled')} value={formatCurrencyMetricRows(data.byCurrency || [], 'cancelledAmount', lang)} helper={`${data.cancelledCount || 0} ${adminCopy(lang, 'record', 'records')}`} />
        </div>
        <div className="admin-two-column partner-commission-layout">
          <section className="partner-settlement-section">
            <h3>{adminCopy(lang, 'Riepilogo settlement per partner', 'Partner settlement summary')}</h3>
            {!data.byPartner?.length ? <p className="small-note">{adminCopy(lang, 'Nessuna commissione partner presente.', 'No partner commissions yet.')}</p> : (
              <div className="admin-table-wrap">
                <table className="admin-table compact-table">
                  <thead><tr><th>Partner</th><th>{adminCopy(lang, 'In attesa', 'Pending')}</th><th>{adminCopy(lang, 'Approvate', 'Approved')}</th><th>{adminCopy(lang, 'Pagate', 'Paid')}</th><th>{adminCopy(lang, 'Record', 'Records')}</th><th>{adminCopy(lang, 'Ultima', 'Last')}</th></tr></thead>
                  <tbody>{data.byPartner.map((row) => <tr key={`${row.partner_id || row.partner_name}:${row.currency || 'EUR'}`}><td>{row.partner_name || '—'}</td><td>{formatMoney(row.pendingAmount || 0, row.currency || 'EUR', lang)}</td><td>{formatMoney(row.approvedUnpaidAmount || 0, row.currency || 'EUR', lang)}</td><td>{formatMoney(row.paidAmount || 0, row.currency || 'EUR', lang)}</td><td>{row.count}</td><td>{row.lastCommissionDate ? formatLocalDateTime(row.lastCommissionDate, lang, '') : '—'}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
          <section className="partner-commission-list-section">
            <div className="admin-panel-header compact-header"><h3>{adminCopy(lang, 'Dettaglio commissioni', 'Commission details')}</h3><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">{adminCopy(lang, 'Tutti gli stati', 'All statuses')}</option>{PARTNER_COMMISSION_STATUSES.map((status) => <option value={status} key={status}>{partnerCommissionStatusLabel(status, lang)}</option>)}</select></div>
            {!visible.length ? <p className="small-note">{adminCopy(lang, 'Nessuna commissione per questo filtro.', 'No commissions for this filter.')}</p> : (
              <div className="partner-commission-card-list">
                {visible.map((item) => (
                  <article className="partner-commission-card" key={item.id}>
                    <div className="request-card-head">
                      <div><h4>{item.partner_name || '—'}</h4><p>{partnerCommissionSourceLabel(item, lang)} · {item.experience_title || adminExperienceLabel(item.experience_id, lang) || '—'} · {item.experience_date ? formatDateForMessage(item.experience_date, lang) : '—'}</p></div>
                      <span className={`status-pill ${item.status}`}>{partnerCommissionStatusLabel(item.status, lang)}</span>
                    </div>
                    <dl className="request-details-grid compact-details-grid">
                      <div><dt>{adminCopy(lang, 'Lordo', 'Gross')}</dt><dd>{formatMoney(item.gross_amount, item.currency, lang)}</dd></div>
                      <div><dt>{adminCopy(lang, 'Regola', 'Rule')}</dt><dd>{item.commission_type === 'percentage' ? `${item.commission_value}%` : formatMoney(item.commission_value, item.currency, lang)}</dd></div>
                      <div><dt>{adminCopy(lang, 'Commissione', 'Commission')}</dt><dd>{formatMoney(item.commission_amount, item.currency, lang)}</dd></div>
                      <div><dt>{adminCopy(lang, 'Cliente', 'Customer')}</dt><dd>{item.customer_display_name || '—'}</dd></div>
                    </dl>
                    {item.status_notes && <p className="small-note">{item.status_notes}</p>}
                    <div className="request-actions-row">
                      {item.status === 'pending' && <button className="button secondary" type="button" disabled={busyId === item.id} onClick={() => setStatus(item, 'approved')}>{adminCopy(lang, 'Approva', 'Approve')}</button>}
                      {['pending', 'approved'].includes(item.status) && <button className="button secondary danger" type="button" disabled={busyId === item.id} onClick={() => setStatus(item, 'cancelled')}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>}
                      {item.status === 'approved' && <button className="button primary" type="button" disabled={busyId === item.id} onClick={() => setStatus(item, 'paid')}>{adminCopy(lang, 'Segna pagata', 'Mark paid')}</button>}
                      {['paid', 'cancelled'].includes(item.status) && <span className="small-note">{adminCopy(lang, 'Solo consultazione', 'View only')}</span>}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </details>
  );
}

function reconciliationIssueLabel(type, lang) {
  const labels = {
    booking_no_payment: ['Prenotazione accettata senza pagamento registrato', 'Accepted booking with no recorded payment'],
    booking_balance_due: ['Saldo prenotazione da incassare', 'Booking balance due'],
    ambiguous_expected: ['Più entrate attese ambigue sulla prenotazione', 'Multiple ambiguous expected entries on booking'],
    suspected_duplicate_payment: ['Possibile pagamento duplicato', 'Possible duplicate payment'],
    cancelled_booking_with_net_payment: ['Prenotazione annullata con incasso netto non rimborsato', 'Cancelled booking with unrefunded net payment'],
    cancelled_booking_code_with_net_payment: ['Codice annullato con incasso netto non rimborsato', 'Cancelled booking code with unrefunded net payment'],
    booking_code_no_payment: ['Codice usato senza pagamento registrato', 'Redeemed code with no recorded payment'],
    booking_code_balance_due: ['Saldo codice prenotazione da incassare', 'Booking-code balance due'],
    booking_code_ambiguous_expected: ['Entrate attese ambigue per codice', 'Ambiguous expected entries for booking code'],
    booking_code_duplicate_payment: ['Possibile pagamento codice duplicato', 'Possible duplicate booking-code payment'],
    gift_card_paid_missing_income: ['Gift Card pagata senza entrata registrata', 'Paid Gift Card without recorded income'],
    gift_card_issued_with_income_review: ['Gift Card emessa con entrata storica da verificare', 'Issued Gift Card with historical income to review'],
    gift_card_issued_unpaid: ['Gift Card emessa ma non pagata', 'Issued Gift Card but unpaid'],
    gift_card_duplicate_income: ['Possibile entrata Gift Card duplicata', 'Possible duplicate Gift Card income'],
    cancelled_gift_card_with_net_payment: ['Gift Card annullata con incasso netto non rimborsato', 'Cancelled Gift Card with unrefunded net payment'],
    paid_commission_missing_expense: ['Commissione pagata senza uscita Finance', 'Paid commission without Finance expense'],
    duplicate_commission_expense: ['Possibile uscita commissione duplicata', 'Possible duplicate commission expense'],
    unlinked_business_finance_entry: ['Movimento business senza fonte identificabile', 'Business transaction without identifiable source']
  };
  const pair = labels[type] || ['Movimento da verificare', 'Transaction requires review'];
  return lang === 'it' ? pair[0] : pair[1];
}

function FinanceReconciliationPanel({ lang, reconciliation, requestById, financeById, session, onChanged, onOpenEntry, onRefundEntry }) {
  const issues = reconciliation?.issues || [];
  return (
    <details className="admin-panel finance-collapsible-panel finance-reconciliation-panel" open={issues.length > 0}>
      <summary className="finance-collapsible-summary"><strong>{adminCopy(lang, 'Da riconciliare', 'Money to reconcile')}</strong><em>{issues.length}</em></summary>
      <div className="finance-collapsible-body">
        <p className="small-note">{adminCopy(lang, 'Saldi dovuti, record ambigui e incoerenze vengono segnalati senza modificare automaticamente lo storico.', 'Balances due, ambiguous records and inconsistencies are surfaced without automatically changing history.')}</p>
        {Object.keys(reconciliation?.totalsByCurrency || {}).length > 0 && <p className="small-note"><strong>{adminCopy(lang, 'Importi coinvolti per valuta', 'Amounts involved by currency')}:</strong> {Object.entries(reconciliation.totalsByCurrency).map(([currency, amount]) => formatMoney(amount, currency, lang)).join(' · ')}</p>}
        {!issues.length ? <p className="notification-status success">{adminCopy(lang, 'Nessuna anomalia deterministica rilevata nei record caricati.', 'No deterministic anomalies found in the loaded records.')}</p> : <div className="finance-reconciliation-list">
          {issues.map((issue, index) => {
            const request = issue.sourceType === 'booking_request' ? requestById.get(issue.sourceId) : null;
            return <article className="finance-reconciliation-item" key={`${issue.type}:${issue.sourceId}:${index}`}>
              <div><strong>{reconciliationIssueLabel(issue.type, lang)}</strong><p className="small-note">{issue.sourceType} · {String(issue.sourceId || '').slice(0, 8)}… · {formatMoney(issue.amount || 0, issue.currency || 'EUR', lang)}</p></div>
              <div className="request-actions-row">
                {request && ['booking_no_payment','booking_balance_due'].includes(issue.type) && <RequestIncomeConfirmAction request={request} lang={lang} session={session} onUpdated={() => onChanged?.()} />}
                {issue.financeEntryId && financeById?.get(issue.financeEntryId) && <button className="button secondary" type="button" onClick={() => onOpenEntry?.(financeById.get(issue.financeEntryId))}>{adminCopy(lang, 'Rivedi movimento', 'Review transaction')}</button>}
                {issue.financeEntryId && financeById?.get(issue.financeEntryId) && ['cancelled_booking_with_net_payment','cancelled_booking_code_with_net_payment','cancelled_gift_card_with_net_payment'].includes(issue.type) && <button className="button secondary" type="button" onClick={() => onRefundEntry?.(financeById.get(issue.financeEntryId))}>{adminCopy(lang, 'Registra rimborso', 'Record refund')}</button>}
                {issue.route && !request && <a className="button secondary" href={issue.route}>{adminCopy(lang, 'Apri record', 'Open record')}</a>}
                {request && !['booking_no_payment','booking_balance_due'].includes(issue.type) && <a className="button secondary" href="/admin/requests">{adminCopy(lang, 'Rivedi prenotazione', 'Review booking')}</a>}
              </div>
            </article>;
          })}
        </div>}
      </div>
    </details>
  );
}

function FinanceOverview({ lang, summary, rangeLabel, onOpen }) {
  const empty = adminCopy(lang, 'Nessun movimento per questo periodo.', 'No movements for this period.');
  return (
    <details className="admin-panel finance-collapsible-panel finance-overview-panel">
      <summary className="finance-collapsible-summary"><strong>{rangeLabel}</strong></summary>
      <div className="finance-collapsible-body">
        <div className="finance-overview-grid">
          <article className="finance-overview-metric"><span>{adminCopy(lang, 'Risultato netto periodo', 'Period net result')}</span><strong>{formatCurrencyMetricRows(summary.byCurrency || [], 'net', lang)}</strong></article>
          <button type="button" className="finance-overview-metric clickable" onClick={() => onOpen({ key: 'linked-bookings', title: adminCopy(lang, 'Movimenti collegati a prenotazioni', 'Movements linked to bookings'), entries: summary.linkedBookingEntries, total: summary.linkedBookingEntries.length })}><span>{adminCopy(lang, 'Movimenti collegati a prenotazioni', 'Movements linked to bookings')}</span><strong>{summary.linkedBookingEntries.length}</strong></button>
          <button type="button" className="finance-overview-metric clickable" onClick={() => onOpen({ key: 'linked-fixed', title: adminCopy(lang, 'Movimenti collegati a escursioni fisse', 'Movements linked to fixed excursions'), entries: summary.linkedFixedEntries, total: summary.linkedFixedEntries.length })}><span>{adminCopy(lang, 'Movimenti collegati a escursioni fisse', 'Movements linked to fixed excursions')}</span><strong>{summary.linkedFixedEntries.length}</strong></button>
          <button type="button" className="finance-overview-metric clickable" onClick={() => onOpen({ key: 'unlinked', title: adminCopy(lang, 'Movimenti non collegati', 'Unlinked movements'), entries: summary.unlinkedEntries, total: summary.unlinkedEntries.length })}><span>{adminCopy(lang, 'Movimenti non collegati', 'Unlinked movements')}</span><strong>{summary.unlinkedEntries.length}</strong></button>
        </div>
        {(summary.byCurrency || []).length > 1 && <p className="small-note">{adminCopy(lang, 'Le valute restano separate: nessuna conversione FX o somma tra valute viene applicata.', 'Currencies remain separate: no FX conversion or cross-currency sum is applied.')}</p>}
        <div className="finance-category-breakdown-grid">
          <FinanceCategoryBreakdown lang={lang} title={adminCopy(lang, 'Entrate per categoria', 'Income by category')} empty={empty} categories={summary.incomeCategories} onOpen={(category) => onOpen({ key: `income-${category.key}`, title: `${adminCopy(lang, 'Entrate', 'Income')} · ${financeCategoryLabel(category.categoryKey || category.key, lang)}`, entries: category.entries, total: category.total })} />
          <FinanceCategoryBreakdown lang={lang} title={adminCopy(lang, 'Uscite per categoria', 'Expenses by category')} empty={empty} categories={summary.expenseCategories} onOpen={(category) => onOpen({ key: `expense-${category.key}`, title: `${adminCopy(lang, 'Uscite', 'Expenses')} · ${financeCategoryLabel(category.categoryKey || category.key, lang)}`, entries: category.entries, total: category.total })} />
        </div>
      </div>
    </details>
  );
}

function FinanceProfitLoss({ lang, summary, adminContent = {} }) {
  const rows = summary.byCurrency?.length ? summary.byCurrency : [{ currency: 'EUR', income: 0, expenses: 0, net: 0 }];
  return (
    <details className="admin-panel finance-collapsible-panel finance-pl-panel">
      <summary className="finance-collapsible-summary"><AdminEditableText as="strong" itemKey="admin.finance.profitLoss.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Profitti e perdite', 'Profit & Loss')} /></summary>
      <div className="finance-collapsible-body">
        {rows.map((row) => {
          const volume = Math.max(Math.abs(row.income), Math.abs(row.expenses), 1);
          const incomeWidth = Math.max(6, Math.round((Math.abs(row.income) / volume) * 100));
          const expenseWidth = Math.max(6, Math.round((Math.abs(row.expenses) / volume) * 100));
          const margin = row.income > 0 ? Math.round((row.net / row.income) * 100) : 0;
          return <section className="finance-pl-currency" key={row.currency} aria-label={`${adminCopy(lang, 'Valuta', 'Currency')} ${row.currency}`}>
            <h3>{row.currency}</h3>
            <div className="finance-pl-grid"><article className="finance-pl-total"><span>{adminCopy(lang, 'Incassato', 'Recorded payments')}</span><strong className="finance-amount income">{formatMoney(row.income, row.currency, lang)}</strong></article><article className="finance-pl-total"><span>{adminCopy(lang, 'Uscite', 'Expenses')}</span><strong className="finance-amount expense">{formatMoney(row.expenses, row.currency, lang)}</strong></article><article className="finance-pl-total highlighted"><span>{adminCopy(lang, 'Risultato netto', 'Net result')}</span><strong className={`finance-amount ${row.net < 0 ? 'expense' : 'income'}`}>{formatMoney(row.net, row.currency, lang)}</strong></article></div>
            <div className="finance-pl-bars" aria-label={adminCopy(lang, 'Confronto entrate e uscite', 'Income versus expenses comparison')}><div className="finance-pl-bar-row"><span>{adminCopy(lang, 'Entrate', 'Income')}</span><div className="finance-pl-bar-track"><i className="income" style={{ width: `${incomeWidth}%` }} /></div><strong>{formatMoney(row.income, row.currency, lang)}</strong></div><div className="finance-pl-bar-row"><span>{adminCopy(lang, 'Uscite', 'Expenses')}</span><div className="finance-pl-bar-track"><i className="expense" style={{ width: `${expenseWidth}%` }} /></div><strong>{formatMoney(row.expenses, row.currency, lang)}</strong></div></div>
            <p className="small-note finance-pl-note">{adminCopy(lang, 'Margine netto sul periodo', 'Net margin for the period')}: <strong>{margin}%</strong></p>
          </section>;
        })}
        {rows.length > 1 && <p className="small-note">{adminCopy(lang, 'Nessun totale consolidato viene mostrato senza un motore FX.', 'No consolidated total is shown without an FX engine.')}</p>}
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
              <strong className={`finance-amount ${category.type}`}>{formatMoney(category.total, category.currency || 'EUR', lang)}</strong>
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
  const detailLedger = calculateLedgerSummary(detail.entries || []);
  const detailCurrencies = detailLedger.byCurrency || [];
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
            {!selectedEntry && <p>{isCountOnly ? `${detail.entries.length} ${adminCopy(lang, 'movimenti', 'entries')}` : detailCurrencies.length === 1 ? formatMoney(numericTotal, detailCurrencies[0].currency, lang) : detailCurrencies.length > 1 ? adminCopy(lang, 'Più valute — vedi movimenti', 'Multiple currencies — see entries') : formatMoney(0, 'EUR', lang)}</p>}
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

function FinanceEntryCard({ entry, lang, onOpen, onEdit, onArchive, onRefund }) {
  const immutableBusinessTransaction = financeEntryIsRecognized(entry) && financeEntryHasBusinessSource(entry);
  const refundable = entry.type === 'income' && !entry.reversal_of && String(entry.status || '').toLowerCase() === 'confirmed' && parseMoneyAmount(entry.amount) > 0;
  return (
    <article className={`finance-entry-card ${entry.active === false ? 'inactive' : ''}`}>
      <div className="request-card-head">
        <div><h3>{entry.title}</h3><p>{formatDateForMessage(entry.entry_date, lang)} · {financeCategoryLabel(entry.category, lang)}</p></div>
        <strong className={`finance-amount ${entry.type}`}>{entry.type === 'expense' ? '-' : '+'}{formatMoney(entry.amount, entry.currency)}</strong>
      </div>
      {entry.description && <p>{entry.description}</p>}
      <p className="small-note">{entry.payment_method || adminCopy(lang, 'Metodo non indicato', 'No payment method')} · {financeEntryIsLinked(entry) ? adminCopy(lang, 'Collegata', 'Linked') : adminCopy(lang, 'Non collegata', 'Unlinked')}{financeEntryCustomerName(entry) ? ` · ${financeEntryCustomerName(entry)}` : ''}</p>
      {immutableBusinessTransaction && <p className="small-note">{adminCopy(lang, 'Movimento riconosciuto collegato: correggere con uno storno/rimborso, non modificando lo storico.', 'Recognized linked transaction: correct it with a refund/reversal rather than rewriting history.')}</p>}
      <div className="request-actions">
        <button className="button secondary" type="button" onClick={onOpen}>{adminCopy(lang, 'Dettaglio', 'Details')}</button>
        {!immutableBusinessTransaction && <button className="button secondary" type="button" onClick={onEdit}>{adminCopy(lang, 'Modifica', 'Edit')}</button>}
        {refundable && <button className="button secondary" type="button" onClick={onRefund}>{adminCopy(lang, 'Registra rimborso', 'Record refund')}</button>}
        {entry.active !== false && !immutableBusinessTransaction && <button className="button secondary danger" type="button" onClick={onArchive}>{adminCopy(lang, 'Archivia', 'Archive')}</button>}
      </div>
    </article>
  );
}

function FinanceRefundDialog({ entry, lang, onClose, onSaved }) {
  const [form, setForm] = useState({ amount: String(Math.abs(parseMoneyAmount(entry.amount))), entry_date: todayIso(), payment_method: '', reason: '' });
  const [idempotencyKey] = useState(() => createPaymentIdempotencyKey(`refund:${entry.id}`));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useBodyScrollLock(true);

  async function save() {
    setSaving(true); setError('');
    try {
      await reverseFinanceEntry(entry.id, { amount: form.amount, entry_date: form.entry_date, payment_method: form.payment_method, reason: form.reason, idempotency_key: idempotencyKey });
      await onSaved?.();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Rimborso non registrato.', 'Refund was not recorded.'));
    } finally { setSaving(false); }
  }

  return <div className="modal-backdrop" role="presentation"><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby={`refund-${entry.id}`}>
    <div className="admin-modal-header"><div><h2 id={`refund-${entry.id}`}>{adminCopy(lang, 'Registra rimborso / storno', 'Record refund / reversal')}</h2><p>{entry.title} · {formatMoney(entry.amount, entry.currency, lang)}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label={text(lang, 'close')}>×</button></div>
    <p className="small-note">{adminCopy(lang, 'Il pagamento originale resta nello storico. Questo crea un movimento negativo collegato con data e metodo reali.', 'The original payment remains in history. This creates a linked negative transaction with the actual date and method.')}</p>
    <div className="admin-form-grid request-income-confirm-grid"><AdminInput label={adminCopy(lang, 'Importo rimborsato', 'Refund amount')} type="number" inputMode="decimal" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} /><AdminInput label={adminCopy(lang, 'Data rimborso', 'Refund date')} type="date" value={form.entry_date} onChange={(value) => setForm((current) => ({ ...current, entry_date: value }))} /><AdminInput label={adminCopy(lang, 'Metodo rimborso', 'Refund method')} value={form.payment_method} onChange={(value) => setForm((current) => ({ ...current, payment_method: value }))} /><AdminInput label={adminCopy(lang, 'Motivo / riferimento', 'Reason / reference')} value={form.reason} onChange={(value) => setForm((current) => ({ ...current, reason: value }))} /></div>
    {error && <div className="admin-alert error" role="alert">{error}</div>}
    <div className="modal-actions"><button className="button primary" type="button" onClick={save} disabled={saving}>{saving ? adminCopy(lang, 'Registrazione...', 'Recording...') : adminCopy(lang, 'Registra rimborso', 'Record refund')}</button><button className="button secondary" type="button" onClick={onClose} disabled={saving}>{adminCopy(lang, 'Chiudi', 'Close')}</button></div>
  </section></div>;
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
                  {todayRequests.map((request) => <RequestCard key={request.id} request={request} lang={lang} session={session} onApprove={() => setDecision({ type: 'approve', request })} onDecline={() => setDecision({ type: 'decline', request })} />)}
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
                {pending.map((request) => <RequestCard key={request.id} request={request} lang={lang} session={session} onApprove={() => setDecision({ type: 'approve', request })} onDecline={() => setDecision({ type: 'decline', request })} />)}
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
                      {group.items.map((request) => <RequestCard key={request.id} request={request} lang={lang} session={session} compact />)}
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
                {pastAccepted.map((request) => <RequestCard key={request.id} request={request} lang={lang} session={session} compact />)}
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


function RequestCrmControls({ request, lang, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => ({
    lead_status: request.lead_status || 'new_lead',
    lead_priority: request.lead_priority || 'normal',
    next_follow_up_at: request.next_follow_up_at ? String(request.next_follow_up_at).slice(0, 10) : '',
    expected_value: request.expected_value ?? '',
    quoted_amount: request.quoted_amount ?? '',
    lost_reason: request.lost_reason || '',
    internal_notes: request.internal_notes || ''
  }));

  useEffect(() => {
    setForm({
      lead_status: request.lead_status || 'new_lead',
      lead_priority: request.lead_priority || 'normal',
      next_follow_up_at: request.next_follow_up_at ? String(request.next_follow_up_at).slice(0, 10) : '',
      expected_value: request.expected_value ?? '',
      quoted_amount: request.quoted_amount ?? '',
      lost_reason: request.lost_reason || '',
      internal_notes: request.internal_notes || ''
    });
  }, [request.id, request.lead_status, request.lead_priority, request.next_follow_up_at, request.expected_value, request.quoted_amount, request.lost_reason, request.internal_notes]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        lead_status: form.lead_status || null,
        lead_priority: form.lead_priority || null,
        next_follow_up_at: form.next_follow_up_at || null,
        expected_value: form.expected_value === '' ? null : parseMoneyAmount(form.expected_value),
        quoted_amount: form.quoted_amount === '' ? null : parseMoneyAmount(form.quoted_amount),
        lost_reason: form.lost_reason || null,
        internal_notes: form.internal_notes || null
      };
      await updateBookingRequest(request.id, payload);
      if (payload.lead_status !== request.lead_status) trackEvent('lead_status_changed', { request_id: request.id, from_status: request.lead_status || '', to_status: payload.lead_status || '' }, { dedupe: false });
      if (payload.next_follow_up_at !== request.next_follow_up_at) trackEvent('lead_follow_up_set', { request_id: request.id, next_follow_up_at: payload.next_follow_up_at || '' }, { dedupe: false });
      if (payload.expected_value !== request.expected_value || payload.quoted_amount !== request.quoted_amount) trackEvent('lead_value_updated', { request_id: request.id }, { dedupe: false });
      onUpdated?.(adminCopy(lang, 'CRM aggiornata.', 'CRM updated.'));
      setOpen(false);
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'CRM non aggiornata.', 'CRM not updated.'));
    } finally {
      setSaving(false);
    }
  }

  const dueLabel = request.next_follow_up_at
    ? formatDateForMessage(String(request.next_follow_up_at).slice(0, 10), lang)
    : adminCopy(lang, 'Nessun follow-up', 'No follow-up');

  return (
    <div className="request-crm-box">
      <button className="request-crm-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        <span>{adminCopy(lang, 'CRM', 'CRM')}</span>
        <strong>{leadStatusLabel(request.lead_status || 'new_lead', lang)} · {leadPriorityLabel(request.lead_priority || 'normal', lang)}</strong>
        <small>{dueLabel}</small>
      </button>
      {open && (
        <div className="admin-form-grid request-crm-grid">
          <label className="admin-field"><span>{adminCopy(lang, 'Stato lead', 'Lead status')}</span><select value={form.lead_status} onChange={(event) => update('lead_status', event.target.value)}>{LEAD_STATUSES.map((status) => <option key={status} value={status}>{leadStatusLabel(status, lang)}</option>)}</select></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Priorità', 'Priority')}</span><select value={form.lead_priority} onChange={(event) => update('lead_priority', event.target.value)}>{LEAD_PRIORITIES.map((priority) => <option key={priority} value={priority}>{leadPriorityLabel(priority, lang)}</option>)}</select></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Prossimo follow-up', 'Next follow-up')}</span><input type="date" value={form.next_follow_up_at} onChange={(event) => update('next_follow_up_at', event.target.value)} /></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Valore atteso', 'Expected value')}</span><input inputMode="decimal" value={form.expected_value} onChange={(event) => update('expected_value', event.target.value)} /></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Importo preventivato', 'Quoted amount')}</span><input inputMode="decimal" value={form.quoted_amount} onChange={(event) => update('quoted_amount', event.target.value)} /></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Motivo perso', 'Lost reason')}</span><input value={form.lost_reason} onChange={(event) => update('lost_reason', event.target.value)} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Note interne', 'Internal notes')}</span><textarea rows={3} value={form.internal_notes} onChange={(event) => update('internal_notes', event.target.value)} /></label>
          {error && <div className="admin-alert error full">{error}</div>}
          <div className="modal-actions full"><button className="button primary" type="button" onClick={save} disabled={saving}>{saving ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Salva CRM', 'Save CRM')}</button></div>
        </div>
      )}
    </div>
  );
}


function createPaymentIdempotencyKey(prefix = 'payment') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}:${crypto.randomUUID()}`;
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function BookingPaymentSummary({ request, lang }) {
  const agreed = requestMoneyValue(request);
  const currency = request.currency || request.finance_entries?.find((entry) => entry.currency)?.currency || 'EUR';
  const summary = paymentSummary(request.finance_entries || [], agreed, currency);
  const history = (request.finance_entries || []).filter((entry) => ['confirmed', 'reversed', 'reversal'].includes(String(entry.status || '').toLowerCase()));
  if (!(agreed > 0) && history.length === 0) return null;
  return (
    <section className="booking-payment-summary" aria-label={adminCopy(lang, 'Riepilogo pagamento', 'Payment summary')}>
      <div className="booking-payment-summary-grid">
        <span><small>{adminCopy(lang, 'Preventivo', 'Quoted')}</small><strong>{formatMoney(summary.agreed, summary.currency, lang)}</strong></span>
        <span><small>{adminCopy(lang, 'Incassato', 'Paid')}</small><strong>{formatMoney(summary.paid, summary.currency, lang)}</strong></span>
        <span><small>{adminCopy(lang, 'Saldo', 'Balance')}</small><strong>{formatMoney(summary.balance, summary.currency, lang)}</strong></span>
        <span><small>{adminCopy(lang, 'Stato pagamento', 'Payment status')}</small><strong>{summary.status}</strong></span>
      </div>
      {history.length > 0 && <details className="booking-payment-history"><summary>{adminCopy(lang, 'Pagamenti', 'Payments')} · {history.length}</summary>{history.map((entry) => <p className="small-note" key={entry.id}>{formatDateForMessage(entry.entry_date, lang) || '-'} · {entry.status === 'reversal' ? adminCopy(lang, 'Rimborso/storno', 'Refund/reversal') : adminCopy(lang, 'Pagamento', 'Payment')} · {formatMoney(entry.amount, entry.currency || summary.currency, lang)} · {entry.payment_method || '-'}</p>)}</details>}
    </section>
  );
}

function RequestIncomeConfirmAction({ request, lang, session, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [incomeState, setIncomeState] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => createPaymentIdempotencyKey(`booking:${request.id}`));
  const [form, setForm] = useState(() => ({
    entry_date: todayIso(),
    amount: requestMoneyValue(request) > 0 ? String(requestMoneyValue(request)) : '',
    currency: request.currency || request.finance_entries?.find((entry) => entry.currency)?.currency || 'EUR',
    payment_method: ''
  }));

  useBodyScrollLock(open);

  useEffect(() => {
    setForm({ entry_date: todayIso(), amount: requestMoneyValue(request) > 0 ? String(requestMoneyValue(request)) : '', currency: request.currency || request.finance_entries?.find((entry) => entry.currency)?.currency || 'EUR', payment_method: '' });
    setIdempotencyKey(createPaymentIdempotencyKey(`booking:${request.id}`));
    setIncomeState(null);
    setError('');
    setWarning('');
  }, [request.id, request.expected_value, request.quoted_amount]);

  async function loadIncomeState() {
    setLoading(true);
    setError('');
    try {
      const state = await getBookingRequestIncomeState(request.id);
      setIncomeState(state);
      const existingCurrency = state.entries.find((entry) => entry.currency)?.currency;
      if (existingCurrency) setForm((current) => ({ ...current, currency: existingCurrency }));
      const recorded = state.confirmed.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0);
      const remaining = Math.max(0, requestMoneyValue(request) - recorded);
      if (remaining > 0) setForm((current) => ({ ...current, amount: String(remaining) }));
      else if (state.pending.length === 1 && parseMoneyAmount(state.pending[0].amount) > 0) setForm((current) => ({ ...current, amount: String(parseMoneyAmount(state.pending[0].amount)) }));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Stato pagamento non disponibile.', 'Payment status unavailable.'));
    } finally {
      setLoading(false);
    }
  }

  function openModal() { setOpen(true); setWarning(''); window.setTimeout(loadIncomeState, 0); }
  function closeModal() { if (saving) return; setOpen(false); setError(''); setWarning(''); }

  async function recordPayment() {
    setSaving(true); setError(''); setWarning('');
    try {
      const result = await confirmBookingRequestIncome({
        request,
        amount: form.amount,
        currency: form.currency,
        entryDate: form.entry_date,
        paymentMethod: form.payment_method,
        idempotencyKey,
        userId: session?.user?.id || null
      });
      if (result.commissionWarning) setWarning(adminCopy(lang, `Pagamento registrato. Commissione partner da verificare: ${result.commissionWarning}`, `Payment recorded. Partner commission needs review: ${result.commissionWarning}`));
      const state = await getBookingRequestIncomeState(request.id);
      setIncomeState(state);
      const recorded = state.confirmed.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0);
      const remaining = Math.max(0, requestMoneyValue(request) - recorded);
      setForm((current) => ({ ...current, amount: remaining > 0 ? String(remaining) : '', payment_method: '' }));
      setIdempotencyKey(createPaymentIdempotencyKey(`booking:${request.id}`));
      onUpdated?.(result.status === 'already_recorded'
        ? adminCopy(lang, 'Questo pagamento era già stato registrato.', 'This payment was already recorded.')
        : adminCopy(lang, 'Pagamento registrato e collegato alla prenotazione.', 'Payment recorded and linked to the booking.'));
    } catch (err) {
      const code = err?.code || '';
      const message = code === 'BOOKING_INCOME_MULTIPLE_PENDING'
        ? adminCopy(lang, 'Ci sono più entrate attese collegate. Riconciliale in Finanze prima di registrare il pagamento.', 'Multiple expected income entries are linked. Reconcile them in Finance before recording the payment.')
        : code === 'BOOKING_INCOME_PAYMENT_METHOD_REQUIRED' ? adminCopy(lang, 'Indica il metodo di pagamento.', 'Enter the payment method.')
          : code === 'BOOKING_INCOME_AMOUNT_REQUIRED' ? adminCopy(lang, 'Inserisci un importo positivo.', 'Enter a positive amount.')
            : err?.message || adminCopy(lang, 'Pagamento non registrato.', 'Payment was not recorded.');
      setError(message);
    } finally { setSaving(false); }
  }

  if (!session || !bookingRequestCanConfirmIncome(request)) return null;
  const confirmedEntries = incomeState?.confirmed || [];
  const pendingEntries = incomeState?.pending || [];
  const confirmedTotal = confirmedEntries.reduce((sum, entry) => sum + parseMoneyAmount(entry.amount), 0);
  const agreed = requestMoneyValue(request);
  const balance = Math.max(0, agreed - confirmedTotal);
  const status = confirmedTotal === 0 ? 'UNPAID' : agreed > 0 && confirmedTotal < agreed ? 'PART-PAID' : agreed > 0 && confirmedTotal > agreed ? 'OVERPAID' : 'PAID';
  const hasAmbiguousPending = pendingEntries.length > 1;

  return (
    <>
      <div className="request-actions request-income-actions">
        <button className="button primary" type="button" onClick={openModal}>{adminCopy(lang, 'Registra pagamento', 'Record payment')}</button>
      </div>
      {open && <div className="modal-backdrop" role="presentation">
        <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby={`recordPaymentTitle-${request.id}`}>
          <div className="admin-modal-header"><div><h2 id={`recordPaymentTitle-${request.id}`}>{adminCopy(lang, 'Registra pagamento', 'Record payment')}</h2><p>{request.customer_name || adminCopy(lang, 'Cliente senza nome', 'Unnamed customer')} · {adminExperienceLabel(request.experience_id, lang)}</p></div><button type="button" className="icon-button" onClick={closeModal} aria-label={text(lang, 'close')}>×</button></div>
          {loading ? <p>{adminCopy(lang, 'Controllo movimenti collegati...', 'Checking linked finance entries...')}</p> : <>
            <div className="booking-payment-summary-grid modal-payment-summary"><span><small>{adminCopy(lang, 'Concordato', 'Agreed')}</small><strong>{formatMoney(agreed, form.currency, lang)}</strong></span><span><small>{adminCopy(lang, 'Già incassato', 'Already paid')}</small><strong>{formatMoney(confirmedTotal, form.currency, lang)}</strong></span><span><small>{adminCopy(lang, 'Saldo', 'Balance')}</small><strong>{formatMoney(balance, form.currency, lang)}</strong></span><span><small>{adminCopy(lang, 'Stato', 'Status')}</small><strong>{status}</strong></span></div>
            {confirmedEntries.length > 0 && <div className="payment-history-list"><strong>{adminCopy(lang, 'Pagamenti registrati', 'Recorded payments')}</strong>{confirmedEntries.map((entry) => <p className="small-note" key={entry.id}>{formatDateForMessage(entry.entry_date, lang) || '-'} · {formatMoney(entry.amount, entry.currency || form.currency, lang)} · {entry.payment_method || '-'}</p>)}</div>}
            {pendingEntries.length === 1 && <div className="admin-alert info compact-alert">{adminCopy(lang, 'L’entrata attesa verrà ridotta del pagamento registrato; l’eventuale saldo resterà atteso.', 'The expected entry will be reduced by the recorded payment; any remaining balance stays expected.')}</div>}
            {hasAmbiguousPending && <div className="admin-alert warning" role="alert">{adminCopy(lang, 'Più entrate attese sono collegate: riconciliale prima in Finanze.', 'Multiple expected entries are linked: reconcile them in Finance first.')}</div>}
            {!hasAmbiguousPending && <div className="admin-form-grid request-income-confirm-grid"><AdminInput label={adminCopy(lang, 'Data pagamento', 'Payment date')} type="date" value={form.entry_date} onChange={(value) => setForm((current) => ({ ...current, entry_date: value }))} /><AdminInput label={adminCopy(lang, 'Importo effettivo', 'Actual amount')} type="number" inputMode="decimal" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} /><AdminInput label={adminCopy(lang, 'Valuta', 'Currency')} value={form.currency} onChange={(value) => setForm((current) => ({ ...current, currency: normalizeCurrency(value) }))} /><AdminInput label={adminCopy(lang, 'Metodo di pagamento', 'Payment method')} value={form.payment_method} placeholder={adminCopy(lang, 'Contanti, bonifico, carta...', 'Cash, bank transfer, card...')} onChange={(value) => setForm((current) => ({ ...current, payment_method: value }))} /></div>}
            {!hasAmbiguousPending && balance === 0 && <p className="small-note">{adminCopy(lang, 'Il saldo è già zero. Un ulteriore pagamento verrà registrato come sovrappagamento esplicito.', 'Balance is already zero. Any additional payment will be recorded as an explicit overpayment.')}</p>}
          </>}
          {warning && <div className="admin-alert warning" role="status">{warning}</div>}{error && <div className="admin-alert error" role="alert">{error}</div>}
          <div className="modal-actions">{!loading && !hasAmbiguousPending && <button className="button primary" type="button" onClick={recordPayment} disabled={saving}>{saving ? adminCopy(lang, 'Registrazione...', 'Recording...') : adminCopy(lang, 'Registra pagamento', 'Record payment')}</button>}<button className="button secondary" type="button" onClick={closeModal} disabled={saving}>{adminCopy(lang, 'Chiudi', 'Close')}</button></div>
        </section>
      </div>}
    </>
  );
}

function RequestsCrmDashboard({ requests, lang }) {
  const summary = useMemo(() => buildRequestsCrmSummary(requests, lang), [requests, lang]);
  return (
    <section className="admin-panel requests-crm-dashboard">
      <div className="admin-panel-header"><h2>{adminCopy(lang, 'CRM e valore prenotazioni', 'CRM and booking value')}</h2><small>{formatLocalDateTime(summary.generatedAt, lang, '')}</small></div>
      <div className="admin-summary-grid crm-summary-grid">
        <SummaryCard label={adminCopy(lang, 'Valore prenotazioni accettate', 'Accepted booking value')} value={formatMoney(summary.confirmedRevenue, 'EUR', lang)} />
        <SummaryCard label={adminCopy(lang, 'Pipeline attesa', 'Expected pipeline')} value={formatMoney(summary.expectedPipeline, 'EUR', lang)} />
        <SummaryCard label={adminCopy(lang, 'Valore medio', 'Average booking value')} value={formatMoney(summary.averageBookingValue, 'EUR', lang)} />
        <SummaryCard label={adminCopy(lang, 'Conversione lead', 'Lead conversion')} value={`${summary.leadToConfirmedRate.toFixed(1)}%`} />
        <SummaryCard label={adminCopy(lang, 'Follow-up oggi/scaduti', 'Due/overdue follow-ups')} value={`${summary.due}/${summary.overdue}`} />
        <SummaryCard label={adminCopy(lang, 'Alta priorità', 'High priority')} value={summary.highPriority} />
      </div>
      <div className="crm-breakdown-grid">
        <div><h3>{adminCopy(lang, 'Valore per fonte', 'Value by source')}</h3>{summary.sourceBreakdown.length ? <ul className="admin-mini-list">{summary.sourceBreakdown.map(([key, value]) => <li key={key}><strong>{key}</strong> · {formatMoney(value, 'EUR', lang)}</li>)}</ul> : <p className="small-note">{adminCopy(lang, 'Nessun dato confermato.', 'No confirmed data.')}</p>}</div>
        <div><h3>{adminCopy(lang, 'Valore per esperienza', 'Value by experience')}</h3>{summary.experienceBreakdown.length ? <ul className="admin-mini-list">{summary.experienceBreakdown.map(([key, value]) => <li key={key}><strong>{key}</strong> · {formatMoney(value, 'EUR', lang)}</li>)}</ul> : <p className="small-note">{adminCopy(lang, 'Nessun dato confermato.', 'No confirmed data.')}</p>}</div>
      </div>
    </section>
  );
}

function reviewStatusLabelForRecord(record, lang) {
  if (record?.review_received_at || record?.review_submitted) return adminCopy(lang, 'Recensione ricevuta', 'Review received');
  if (record?.review_requested_at) return adminCopy(lang, 'Recensione richiesta', 'Review requested');
  return adminCopy(lang, 'Recensione non richiesta', 'Review not requested');
}

function reviewCodeForRecord(record, type = 'request') {
  return type === 'booking_code' ? record?.code : (record?.review_code || record?.booking_code || '');
}

function buildReviewRequestMessage({ record, type, lang }) {
  const name = type === 'booking_code' ? record.customer_name : record.customer_name;
  const code = reviewCodeForRecord(record, type);
  const link = `/reviews?code=${encodeURIComponent(code)}`;
  return lang === 'it'
    ? `Ciao ${name || ''}, grazie per aver vissuto l’Etna con vulcanIQ.\n\nSe ti va, puoi lasciare una recensione usando questo link:\n${link}\n\nGrazie ancora,\nTeam vulcanIQ`
    : `Hi ${name || ''}, thank you for experiencing Mount Etna with vulcanIQ.\n\nIf you’d like, you can leave a review using this link:\n${link}\n\nThank you again,\nvulcanIQ team`;
}

function ReviewRequestActions({ record, type = 'request', lang, session, onUpdated }) {
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const code = reviewCodeForRecord(record, type);
  const link = code ? `/reviews?code=${encodeURIComponent(code)}` : '';
  const phone = normalizePhoneForWhatsApp(record.customer_phone);
  const whatsappMessage = buildReviewRequestMessage({ record, type, lang });
  const eligible = type === 'booking_code'
    ? record.status === 'redeemed' && record.completion_status === 'completed'
    : isRequestConfirmedRevenue(record) || record.lead_status === 'completed' || record.status === 'accepted';

  async function run(action) {
    if (!eligible || !code) return;
    setBusy(action);
    setError('');
    try {
      if (action === 'copy') {
        await copyText(link);
        if (type === 'booking_code') await markBookingCodeReviewLinkCopied(record.id, session.user.id);
        else await markBookingRequestReviewLinkCopied(record.id, session.user.id);
        trackEvent('review_link_copied', { record_type: type, record_id: record.id, language: lang, has_booking_code: Boolean(code), source_type: type }, { dedupe: false });
        setCopied('link');
      }
      if (action === 'requested') {
        if (type === 'booking_code') await markBookingCodeReviewRequested(record.id, 'manual', session.user.id);
        else await markBookingRequestReviewRequested(record.id, 'manual', session.user.id);
        trackEvent('review_requested_marked', { record_type: type, record_id: record.id, language: lang, has_booking_code: Boolean(code), source_type: type }, { dedupe: false });
      }
      if (action === 'received') {
        if (type === 'booking_code') await markBookingCodeReviewReceived(record.id, session.user.id);
        else await markBookingRequestReviewReceived(record.id, session.user.id);
        trackEvent('review_received_marked', { record_type: type, record_id: record.id, language: lang, has_booking_code: Boolean(code), source_type: type }, { dedupe: false });
      }
      onUpdated?.(adminCopy(lang, 'Workflow recensione aggiornato.', 'Review workflow updated.'));
      window.setTimeout(() => setCopied(''), 1400);
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Azione recensione non completata.', 'Review action failed.'));
    } finally {
      setBusy('');
    }
  }

  async function openWhatsapp() {
    if (!eligible || !code) return;
    setError('');
    try {
      if (type === 'booking_code') await markBookingCodeReviewRequested(record.id, 'whatsapp', session.user.id);
      else await markBookingRequestReviewRequested(record.id, 'whatsapp', session.user.id);
      trackEvent('review_request_whatsapp_click', { record_type: type, record_id: record.id, language: lang, has_booking_code: Boolean(code), source_type: type }, { dedupe: false });
      const target = phone ? `https://wa.me/${phone}?text=${encode(whatsappMessage)}` : `https://wa.me/?text=${encode(whatsappMessage)}`;
      window.open(target, '_blank', 'noopener,noreferrer');
      onUpdated?.(adminCopy(lang, 'Richiesta recensione segnata.', 'Review request marked.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'WhatsApp non aperto.', 'WhatsApp not opened.'));
    }
  }

  if (!eligible) return null;
  return (
    <div className="review-request-actions admin-inline-workflow">
      <p className="small-note"><strong>{reviewStatusLabelForRecord(record, lang)}</strong>{record.review_requested_at ? ` · ${formatLocalDateTime(record.review_requested_at, lang, '')}` : ''}</p>
      {!code && <p className="small-note warning-text">{adminCopy(lang, 'Nessun codice recensione disponibile.', 'No review code available.')}</p>}
      <div className="request-actions-row">
        <button className="button secondary" type="button" disabled={!code || Boolean(busy)} onClick={() => run('copy')}>{adminCopy(lang, 'Copia link recensione', 'Copy review link')} {copied === 'link' ? '· ✓' : ''}</button>
        <button className="button secondary" type="button" disabled={!code || Boolean(busy)} onClick={openWhatsapp}>{adminCopy(lang, 'Apri richiesta WhatsApp', 'Open WhatsApp request')}</button>
        <button className="button secondary" type="button" disabled={!code || Boolean(busy)} onClick={() => run('requested')}>{adminCopy(lang, 'Segna recensione richiesta', 'Mark review requested')}</button>
        <button className="button secondary" type="button" disabled={!code || Boolean(busy)} onClick={() => run('received')}>{adminCopy(lang, 'Segna recensione ricevuta', 'Mark review received')}</button>
      </div>
      {error && <p className="form-status error">{error}</p>}
    </div>
  );
}

function ReferralActions({ record, type = 'request', lang, session, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState(record?.referral_code || '');
  const eligible = type === 'booking_code'
    ? record.status === 'redeemed' && record.completion_status === 'completed'
    : isRequestConfirmedRevenue(record) || ['completed', 'review_requested', 'review_received'].includes(record.lead_status);

  async function createOrCopy() {
    if (!eligible) return;
    setBusy(true);
    setError('');
    try {
      const created = await createCustomerReferralCode({
        customer_name: record.customer_name,
        customer_email: record.customer_email,
        customer_phone: record.customer_phone,
        source_booking_request_id: type === 'request' ? record.id : null,
        source_booking_code_id: type === 'booking_code' ? record.id : null,
        source_type: type
      }, session.user.id);
      setCode(created.code);
      const link = referralLink(created.code, requestLang(record, lang));
      await copyText(link);
      trackEvent('referral_code_created', { referral_code: created.code, source_type: type, source_id: record.id, language: lang }, { dedupe: false });
      trackEvent('referral_link_copied', { referral_code: created.code, source_type: type, source_id: record.id, language: lang }, { dedupe: false });
      onUpdated?.(adminCopy(lang, `Codice referral copiato: ${created.code}`, `Referral code copied: ${created.code}`));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Codice referral non creato.', 'Referral code not created.'));
    } finally {
      setBusy(false);
    }
  }

  if (!eligible) return null;
  return (
    <div className="referral-actions admin-inline-workflow">
      <p className="small-note"><strong>{adminCopy(lang, 'Referral cliente', 'Customer referral')}</strong>{code ? ` · ${code}` : ''}</p>
      <div className="request-actions-row">
        <button className="button secondary" type="button" disabled={busy} onClick={createOrCopy}>{code ? adminCopy(lang, 'Copia link referral', 'Copy referral link') : adminCopy(lang, 'Genera referral', 'Generate referral')}</button>
      </div>
      {error && <p className="form-status error">{error}</p>}
    </div>
  );
}


function ReferralCodesPanel({ lang, session }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try { setItems(await listCustomerReferralCodes({ limit: 100 })); }
    catch (err) { setError(err?.message || adminCopy(lang, 'Referral non caricati.', 'Could not load referrals.')); }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, []);

  async function copyReferral(item) {
    const link = referralLink(item.code, lang);
    await copyText(link);
    trackEvent('referral_link_copied', { referral_code: item.code, source_type: item.source_type || 'unknown', source_id: item.source_booking_request_id || item.source_booking_code_id || '', language: lang }, { dedupe: false });
    setFeedback(adminCopy(lang, `Link referral copiato: ${item.code}`, `Referral link copied: ${item.code}`));
  }

  async function disableReferral(item) {
    if (!window.confirm(adminCopy(lang, `Disattivare ${item.code}?`, `Disable ${item.code}?`))) return;
    try {
      await disableCustomerReferralCode(item.id, session.user.id);
      trackEvent('referral_code_disabled', { referral_code: item.code, source_type: item.source_type || 'unknown', source_id: item.source_booking_request_id || item.source_booking_code_id || '', language: lang }, { dedupe: false });
      await refresh();
      setFeedback(adminCopy(lang, 'Referral disattivato.', 'Referral disabled.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Referral non disattivato.', 'Referral not disabled.'));
    }
  }

  return (
    <section className="admin-panel referral-codes-panel">
      <div className="admin-panel-header">
        <h2>{adminCopy(lang, 'Referral clienti', 'Customer referrals')} · {items.length}</h2>
        <button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
      </div>
      {feedback && <div className="admin-alert success compact-alert">{feedback}</div>}
      {error && <div className="admin-alert error compact-alert">{error}</div>}
      {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : items.length === 0 ? <p className="small-note">{adminCopy(lang, 'Nessun referral generato.', 'No referrals generated.')}</p> : (
        <div className="referral-code-list">
          {items.map((item) => (
            <article className="referral-code-card" key={item.id}>
              <div>
                <strong>{item.code}</strong>
                <p className="small-note">{item.customer_name || '-'} · {item.source_type || '-'} · {adminCopy(lang, 'Usi', 'Uses')} {item.used_count || 0}{item.last_used_at ? ` · ${formatLocalDateTime(item.last_used_at, lang, '')}` : ''}</p>
              </div>
              <span className={`status-pill ${item.active ? 'accepted' : 'cancelled'}`}>{item.active ? adminCopy(lang, 'Attiva', 'Active') : adminCopy(lang, 'Inattiva', 'Inactive')}</span>
              <div className="request-actions-row">
                <button className="button secondary" type="button" onClick={() => copyReferral(item)}>{adminCopy(lang, 'Copia link', 'Copy link')}</button>
                {item.active && <button className="button secondary danger" type="button" onClick={() => disableReferral(item)}>{adminCopy(lang, 'Disattiva', 'Disable')}</button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

const GIFT_CARD_STATUSES = ['new', 'contacted', 'quoted', 'paid', 'issued', 'cancelled'];
function giftCardStatusLabel(status, lang) {
  const labels = {
    new: { it: 'Nuova richiesta', en: 'New request' },
    contacted: { it: 'Contattato', en: 'Contacted' },
    quoted: { it: 'Preventivo inviato', en: 'Quote sent' },
    paid: { it: 'Pagato', en: 'Paid' },
    issued: { it: 'Emesso', en: 'Issued' },
    cancelled: { it: 'Annullato', en: 'Cancelled' }
  };
  return labels[status]?.[lang] || status || '-';
}

function buildGiftCardAdminReply(request, lang) {
  const budget = request.budget ? formatMoney(request.budget, request.currency || 'EUR', lang) : (lang === 'it' ? 'da definire' : 'to define');
  return lang === 'it'
    ? `Ciao ${request.buyer_name || ''},\n\ngrazie per la richiesta Gift Card vulcanIQ.\n\nGift Card per: ${request.recipient_name || '-'}\nEsperienza/interesse: ${request.experience_type || '-'}\nBudget indicativo: ${budget}\n${request.booking_code ? `Codice destinatario: ${request.booking_code}\n` : ''}\nTi confermiamo disponibilità e proposta il prima possibile.\n\nTeam vulcanIQ`
    : `Hi ${request.buyer_name || ''},\n\nthank you for your vulcanIQ Gift Card request.\n\nGift Card for: ${request.recipient_name || '-'}\nExperience/interest: ${request.experience_type || '-'}\nIndicative budget: ${budget}\n${request.booking_code ? `Recipient code: ${request.booking_code}\n` : ''}\nWe will confirm availability and proposal as soon as possible.\n\nvulcanIQ team`;
}

function GiftCardPaymentDialog({ item, lang, onClose, onSaved }) {
  const [form, setForm] = useState({
    payment_amount: item.budget ? String(item.budget) : '',
    payment_date: todayIso(),
    payment_method: '',
    currency: item.currency || 'EUR'
  });
  const [idempotencyKey] = useState(() => createPaymentIdempotencyKey(`gift-card:${item.id}`));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useBodyScrollLock(true);

  async function save() {
    setSaving(true); setError('');
    try {
      if (!(parseMoneyAmount(form.payment_amount) > 0) || !form.payment_date || !String(form.payment_method || '').trim()) {
        throw new Error(adminCopy(lang, 'Importo, data e metodo di pagamento sono obbligatori.', 'Payment amount, date and method are required.'));
      }
      const result = await onSaved?.({
        status: 'paid',
        currency: normalizeCurrency(form.currency),
        payment_amount: parseMoneyAmount(form.payment_amount),
        payment_date: form.payment_date,
        payment_method: form.payment_method,
        payment_idempotency_key: idempotencyKey
      });
      if (result) onClose();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Pagamento Gift Card non registrato.', 'Gift Card payment was not recorded.'));
    } finally { setSaving(false); }
  }

  return <div className="modal-backdrop" role="presentation"><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby={`giftCardPayment-${item.id}`}>
    <div className="admin-modal-header"><div><h2 id={`giftCardPayment-${item.id}`}>{adminCopy(lang, 'Registra pagamento Gift Card', 'Record Gift Card payment')}</h2><p>{item.buyer_name || '-'} · {item.recipient_name || '-'}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label={text(lang, 'close')}>×</button></div>
    <div className="booking-payment-summary-grid modal-payment-summary"><span><small>{adminCopy(lang, 'Valore concordato', 'Agreed value')}</small><strong>{formatMoney(item.budget || 0, form.currency, lang)}</strong></span><span><small>{adminCopy(lang, 'Stato', 'Status')}</small><strong>{giftCardStatusLabel(item.status, lang)}</strong></span></div>
    <div className="admin-form-grid request-income-confirm-grid"><AdminInput label={adminCopy(lang, 'Importo effettivo', 'Actual amount')} type="number" inputMode="decimal" value={form.payment_amount} onChange={(value) => setForm((current) => ({ ...current, payment_amount: value }))} /><AdminInput label={adminCopy(lang, 'Data pagamento', 'Payment date')} type="date" value={form.payment_date} onChange={(value) => setForm((current) => ({ ...current, payment_date: value }))} /><AdminInput label={adminCopy(lang, 'Valuta', 'Currency')} value={form.currency} onChange={(value) => setForm((current) => ({ ...current, currency: normalizeCurrency(value) }))} /><AdminInput label={adminCopy(lang, 'Metodo di pagamento', 'Payment method')} value={form.payment_method} placeholder={adminCopy(lang, 'Contanti, bonifico, carta...', 'Cash, bank transfer, card...')} onChange={(value) => setForm((current) => ({ ...current, payment_method: value }))} /></div>
    <p className="small-note">{adminCopy(lang, 'Segnare Pagato registra denaro reale una sola volta. Emesso genera/consegna il voucher e non crea un’altra entrata.', 'Marking Paid records actual money once. Issued generates/delivers the voucher and does not create another income entry.')}</p>
    {error && <div className="admin-alert error" role="alert">{error}</div>}
    <div className="modal-actions"><button className="button primary" type="button" onClick={save} disabled={saving}>{saving ? adminCopy(lang, 'Registrazione...', 'Recording...') : adminCopy(lang, 'Registra pagamento', 'Record payment')}</button><button className="button secondary" type="button" onClick={onClose} disabled={saving}>{adminCopy(lang, 'Chiudi', 'Close')}</button></div>
  </section></div>;
}

function useAdminGiftCards(filters = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function refresh() {
    setLoading(true);
    setError('');
    try { setItems(await listGiftCardRequests(filters)); }
    catch (err) { setError(err?.message || 'Could not load gift cards.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, [JSON.stringify(filters)]);
  return { items, loading, error, refresh };
}

function NotificationStatusControl({ record, table, lang, onUpdated }) {
  const [state, setState] = useState({ loading: false, error: '' });
  const status = record.notification_email_status || (record.notification_email_sent_at ? 'sent' : 'not_sent');
  const canRetry = ['failed', 'not_sent'].includes(status);

  async function retry() {
    setState({ loading: true, error: '' });
    try {
      const result = await retryRequestNotification(table, record.id);
      setState({ loading: false, error: '' });
      const message = result?.sent > 0
        ? adminCopy(lang, 'Notifica email inviata.', 'Email notification sent.')
        : adminCopy(lang, 'Nessuna notifica da reinviare.', 'No notification required a resend.');
      await onUpdated?.(message);
    } catch (error) {
      setState({ loading: false, error: error?.message || adminCopy(lang, 'Riprova notifica non riuscito.', 'Notification retry failed.') });
    }
  }

  return (
    <div className={`notification-status-control notification-${status}`}>
      <span><strong>{adminCopy(lang, 'Notifica email', 'Email notification')}:</strong> {status}</span>
      {record.notification_email_sent_at && <small>{formatLocalDateTime(record.notification_email_sent_at, lang, '')}</small>}
      {record.notification_email_error && <small>{record.notification_email_error}</small>}
      {canRetry && <button className="button secondary" type="button" onClick={retry} disabled={state.loading}>{state.loading ? adminCopy(lang, 'Invio...', 'Sending...') : adminCopy(lang, 'Riprova email', 'Retry email')}</button>}
      {state.error && <small className="admin-warning-critical">{state.error}</small>}
    </div>
  );
}

function GiftCardsAdminPage({ lang, session, adminContent = {} }) {
  const [filters, setFilters] = useState({ status: 'all', search: '', limit: 250 });
  const { items, loading, error, refresh } = useAdminGiftCards(filters);
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');
  const [paymentTarget, setPaymentTarget] = useState(null);

  async function updateItem(item, patch, message = '') {
    setActionError('');
    setFeedback('');
    try {
      const previousStatus = item.status;
      const updated = await updateGiftCardRequest(item.id, patch, session.user.id);
      if (patch.status && patch.status !== previousStatus) {
        trackEvent('gift_card_status_changed', { request_id: item.id, previous_status: previousStatus, next_status: patch.status, language: lang }, { dedupe: false });
        if (patch.status === 'paid') trackEvent('gift_card_paid', { request_id: item.id, previous_status: previousStatus, next_status: patch.status, language: lang }, { dedupe: false });
        if (patch.status === 'issued') trackEvent('gift_card_issued', { request_id: item.id, previous_status: previousStatus, next_status: patch.status, language: lang }, { dedupe: false });
        if (patch.status === 'cancelled') trackEvent('gift_card_cancelled', { request_id: item.id, previous_status: previousStatus, next_status: patch.status, language: lang }, { dedupe: false });
        if (['paid', 'issued'].includes(patch.status) && updated?.booking_code) {
          trackEvent('gift_card_booking_code_created', { request_id: item.id, booking_code_id: updated.booking_code_id || '', language: lang }, { dedupe: false });
          message = message || adminCopy(lang, `Gift Card aggiornata. Codice destinatario: ${updated.booking_code}`, `Gift Card updated. Recipient code: ${updated.booking_code}`);
        }
      }
      await refresh();
      setFeedback(message || adminCopy(lang, 'Gift Card aggiornata.', 'Gift Card updated.'));
      return updated;
    } catch (err) {
      setActionError(err?.message || adminCopy(lang, 'Gift Card non aggiornata.', 'Gift Card not updated.'));
      return null;
    }
  }

  async function copyReply(item, channel) {
    const replyLang = item.buyer_preferred_language || lang;
    const body = buildGiftCardAdminReply(item, replyLang);
    await copyText(body);
    trackEvent(channel === 'email' ? 'gift_card_email_reply_copied' : 'gift_card_whatsapp_reply_copied', { request_id: item.id, language: replyLang }, { dedupe: false });
    setFeedback(channel === 'email' ? adminCopy(lang, 'Risposta email copiata.', 'Email reply copied.') : adminCopy(lang, 'Risposta WhatsApp copiata.', 'WhatsApp reply copied.'));
  }

  return (
    <section className="admin-page gift-cards-admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">Revenue OS</span>
          <AdminEditableText as="h1" itemKey="admin.giftCards.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Richieste Gift Card', 'Gift Card requests')} />
          <AdminEditableText as="p" itemKey="admin.giftCards.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Gestisci richieste, stato, note interne e revenue Gift Card separata dalle escursioni.', 'Manage requests, status, internal notes, and Gift Card revenue separately from excursions.')} />
        </div>
      </div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {(error || actionError) && <div className="admin-alert error" role="alert">{error || actionError}</div>}
      <div className="admin-filter-bar">
        <input aria-label="Search" placeholder={adminCopy(lang, 'Cerca Gift Card', 'Search Gift Cards')} value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        <select aria-label="Status" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="all">{adminCopy(lang, 'Tutti gli stati', 'All statuses')}</option>{GIFT_CARD_STATUSES.map((status) => <option key={status} value={status}>{giftCardStatusLabel(status, lang)}</option>)}</select>
        <button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
      </div>
      <section className="admin-panel">
        <div className="admin-panel-header"><h2>{adminCopy(lang, 'Richieste Gift Card', 'Gift Card requests')} · {items.length}</h2></div>
        {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : items.length === 0 ? <p>{adminCopy(lang, 'Nessuna richiesta Gift Card.', 'No Gift Card requests.')}</p> : (
          <div className="request-card-list gift-card-admin-list">
            {items.map((item) => (
              <article className="request-card gift-card-admin-card" key={item.id}>
                <div className="request-card-head"><div><h3>{item.buyer_name || adminCopy(lang, 'Acquirente senza nome', 'Unnamed buyer')}</h3><p>{item.buyer_phone || '—'} · {item.buyer_email || '—'}</p></div><span className={`status-pill ${item.status}`}>{giftCardStatusLabel(item.status, lang)}</span></div>
                <dl className="request-details-grid">
                  <div><dt>{adminCopy(lang, 'Destinatario', 'Recipient')}</dt><dd>{item.recipient_name || '-'}</dd></div>
                  <div><dt>{adminCopy(lang, 'Esperienza', 'Experience')}</dt><dd>{item.experience_type || '-'}</dd></div>
                  <div><dt>{adminCopy(lang, 'Budget', 'Budget')}</dt><dd>{item.budget ? formatMoney(item.budget, item.currency, lang) : '-'}</dd></div>
                  <div><dt>{adminCopy(lang, 'Consegna preferita', 'Preferred delivery')}</dt><dd>{formatDateForMessage(item.preferred_delivery_date, lang) || '-'}</dd></div>
                  <div><dt>{adminCopy(lang, 'Lingua', 'Language')}</dt><dd>{item.buyer_preferred_language || '-'}</dd></div>
                  <div><dt>{adminCopy(lang, 'Finance', 'Finance')}</dt><dd>{item.finance_entry_id ? adminCopy(lang, 'Collegata', 'Linked') : adminCopy(lang, 'Non collegata', 'Not linked')}</dd></div>
                  <div><dt>{adminCopy(lang, 'Codice destinatario', 'Recipient code')}</dt><dd>{item.booking_code || '-'}</dd></div>
                </dl>
                <NotificationStatusControl record={item} table="gift_card_requests" lang={lang} onUpdated={async (message) => { await refresh(); setFeedback(message); }} />
                {item.message && <p className="request-message">{item.message}</p>}
                <label className="admin-field full"><span>{adminCopy(lang, 'Nota interna', 'Internal note')}</span><textarea rows={3} defaultValue={item.admin_note || ''} onBlur={(event) => { if (event.target.value !== (item.admin_note || '')) updateItem(item, { admin_note: event.target.value }, adminCopy(lang, 'Nota interna aggiornata.', 'Internal note updated.')); }} /></label>
                <div className="request-actions-row">
                  <select value={item.status} onChange={(event) => { const nextStatus = event.target.value; if (nextStatus === 'paid' && item.status !== 'paid') setPaymentTarget(item); else updateItem(item, { status: nextStatus }); }}>{GIFT_CARD_STATUSES.map((status) => <option key={status} value={status}>{giftCardStatusLabel(status, lang)}</option>)}</select>
                  <button className="button secondary" type="button" onClick={() => copyReply(item, 'whatsapp')}>{adminCopy(lang, 'Copia risposta WhatsApp', 'Copy WhatsApp reply')}</button>
                  <button className="button secondary" type="button" onClick={() => copyReply(item, 'email')}>{adminCopy(lang, 'Copia risposta email', 'Copy email reply')}</button>
                  {item.status !== 'paid' && <button className="button secondary" type="button" onClick={() => setPaymentTarget(item)}>{adminCopy(lang, 'Registra pagamento', 'Record payment')}</button>}
                  <button className="button secondary" type="button" onClick={() => updateItem(item, { status: 'issued' })}>{adminCopy(lang, 'Segna come emesso', 'Mark as issued')}</button>
                  <button className="button secondary danger" type="button" onClick={() => updateItem(item, { status: 'cancelled' })}>{adminCopy(lang, 'Annulla richiesta', 'Cancel request')}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {paymentTarget && <GiftCardPaymentDialog item={paymentTarget} lang={lang} onClose={() => setPaymentTarget(null)} onSaved={(patch) => updateItem(paymentTarget, patch, adminCopy(lang, 'Pagamento Gift Card registrato.', 'Gift Card payment recorded.'))} />}
    </section>
  );
}


function PartnerSourceControl({ request, lang, session, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [partners, setPartners] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [partnerId, setPartnerId] = useState(request.partner_id || '');
  const [grossAmount, setGrossAmount] = useState(String(partnerCommissionGrossAmountForRequest(request) || ''));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setPartnerId(request.partner_id || '');
    setGrossAmount(String(partnerCommissionGrossAmountForRequest(request) || ''));
  }, [request.id, request.partner_id, request.expected_value, request.quoted_amount]);

  async function refresh() {
    if (!open || !session) return;
    setLoading(true);
    setError('');
    try {
      const [partnerRows, commissionRows] = await Promise.all([
        listPartnerships({ activeOnly: true }),
        listPartnerCommissions({ bookingRequestId: request.id, limit: 20 }).catch(() => [])
      ]);
      setPartners(partnerRows || []);
      setCommissions(commissionRows || []);
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Partner non caricati.', 'Partners not loaded.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [open, request.id]);

  const selectedPartner = partners.find((item) => item.id === partnerId) || null;
  const preview = selectedPartner?.commission_enabled ? calculatePartnerCommission({
    grossAmount,
    commissionType: selectedPartner.commission_type,
    commissionValue: selectedPartner.commission_value,
    currency: selectedPartner.commission_currency || 'EUR'
  }) : null;
  const eligible = selectedPartner ? partnerCommissionEligibleForRequest(request, selectedPartner) : false;
  const latestCommission = commissions[0] || null;

  async function save() {
    setSaving(true);
    setError('');
    try {
      const updatedRequest = await assignPartnerToBookingRequest(request.id, partnerId || null, session.user.id);
      trackEvent('partner_source_assigned', { partner_id: partnerId || '', source_type: 'booking_request', source_section: 'admin_requests', admin_action: 'assign_partner' }, { dedupe: false });
      let commissionResult = null;
      if (partnerId && selectedPartner?.commission_enabled) {
        commissionResult = await upsertPartnerCommissionForSource({
          sourceType: 'booking_request',
          source: { ...request, ...updatedRequest, partner_id: partnerId },
          partnerId,
          grossAmount,
          userId: session.user.id,
          statusNotes: notes
        });
        if (commissionResult?.created) trackEvent('partner_commission_created', { partner_id: partnerId, source_type: 'booking_request', commission_status: 'pending', currency: preview?.currency || 'EUR', has_commission_amount: Boolean(preview?.commissionAmount), commission_type: selectedPartner.commission_type, source_section: 'admin_requests', admin_action: 'upsert_commission' }, { dedupe: false });
      }
      await refresh();
      const skipped = commissionResult?.skipped ? ` · ${commissionResult.reason}` : '';
      onUpdated?.(adminCopy(lang, `Fonte partner salvata${skipped}.`, `Partner source saved${skipped}.`));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Fonte partner non salvata.', 'Partner source not saved.'));
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;

  return (
    <div className="partner-source-box admin-inline-workflow">
      <button className="request-crm-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        <span>{adminCopy(lang, 'Fonte partner', 'Partner source')}</span>
        <strong>{request.partner_id ? (partners.find((item) => item.id === request.partner_id)?.name || adminCopy(lang, 'Partner assegnato', 'Partner assigned')) : adminCopy(lang, 'Nessun partner', 'No partner')}</strong>
        <small>{latestCommission ? `${partnerCommissionStatusLabel(latestCommission.status, lang)} · ${formatMoney(latestCommission.commission_amount, latestCommission.currency, lang)}` : adminCopy(lang, 'Commissioni interne non pubbliche', 'Internal commissions only')}</small>
      </button>
      {open && (
        <div className="admin-form-grid request-crm-grid partner-source-grid">
          {loading ? <p className="small-note full">{adminCopy(lang, 'Caricamento partner...', 'Loading partners...')}</p> : null}
          <label className="admin-field"><span>{adminCopy(lang, 'Partner', 'Partner')}</span><select value={partnerId} onChange={(event) => setPartnerId(event.target.value)}><option value="">{adminCopy(lang, 'Nessun partner', 'No partner')}</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Importo lordo', 'Gross amount')}</span><input inputMode="decimal" value={grossAmount} onChange={(event) => setGrossAmount(event.target.value)} placeholder="125.00" /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Note commissione', 'Commission notes')}</span><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          {selectedPartner && <div className="admin-alert compact-alert full">
            <strong>{selectedPartner.name}</strong><br />
            {adminCopy(lang, 'Regola', 'Rule')}: {partnerCommissionRuleLabel(selectedPartner, lang)} · {partnerCommissionAppliesToLabel(selectedPartner.commission_applies_to, lang)}<br />
            {preview && <span>{adminCopy(lang, 'Commissione stimata', 'Estimated commission')}: {formatMoney(preview.commissionAmount, preview.currency, lang)} — {selectedPartner.commission_type === 'percentage' ? `${preview.commissionValue}% ${adminCopy(lang, 'su', 'of')} ${formatMoney(preview.grossAmount, preview.currency, lang)}` : partnerCommissionTypeLabel(selectedPartner.commission_type, lang)}</span>}
            {!eligible && <p className="small-note">{adminCopy(lang, 'La commissione verrà creata solo quando la richiesta raggiunge lo stato configurato e l’importo è noto.', 'The commission is created only when the request reaches the configured state and the amount is known.')}</p>}
          </div>}
          {commissions.length > 0 && <div className="full partner-source-commission-list"><strong>{adminCopy(lang, 'Commissioni esistenti', 'Existing commissions')}</strong>{commissions.map((item) => <p className="small-note" key={item.id}>{partnerCommissionStatusLabel(item.status, lang)} · {formatMoney(item.commission_amount, item.currency, lang)} · {item.created_at ? formatLocalDateTime(item.created_at, lang, '') : ''}</p>)}</div>}
          {error && <div className="admin-alert error full">{error}</div>}
          <div className="modal-actions full"><button className="button primary" type="button" onClick={save} disabled={saving || loading}>{saving ? adminCopy(lang, 'Salvataggio...', 'Saving...') : adminCopy(lang, 'Salva fonte partner', 'Save partner source')}</button></div>
        </div>
      )}
    </div>
  );
}

function openBookingCodeFromRequest(request, navigate) {
  const code = String(request?.booking_code || '').trim();
  if (!code || typeof navigate !== 'function') return;
  try {
    window.sessionStorage.setItem('vulcaniq.admin.bookingCodeSearch', code);
  } catch {
    // Navigation remains useful even when storage is unavailable.
  }
  navigate('/admin/booking-codes');
}

function RequestCard({ request, lang, session = null, navigate = null, onApprove, onDecline, onRemove, onUpdated, compact = false }) {
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
        <div className="request-submitted-meta"><dt>{adminCopy(lang, 'Inviata il', 'Submitted')}</dt><dd>{formatLocalDateTime(request.created_at || request.submitted_at || request.inserted_at || request.createdAt, lang, adminCopy(lang, 'Non disponibile', 'Not available'))}</dd></div>
        <div><dt>{adminCopy(lang, 'Alternativa', 'Alternative')}</dt><dd>{formatDateForMessage(request.alternative_date, lang) || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Lingua', 'Language')}</dt><dd>{request.language || 'it'}</dd></div>
        <div><dt>{adminCopy(lang, 'Gruppo', 'Party')}</dt><dd>{[request.adults ? `${request.adults} adulti/adults` : '', request.children ? `${request.children} bambini/children` : ''].filter(Boolean).join(' · ') || request.party_type || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Totale', 'Total')}</dt><dd>{Number(request.adults || 0) + Number(request.children || 0) || '-'}</dd></div>
        {request.booking_code && <div><dt>{adminCopy(lang, 'Codice prenotazione', 'Booking code')}</dt><dd>{request.booking_code}</dd></div>}
        <div><dt>{adminCopy(lang, 'Privata', 'Private')}</dt><dd>{request.private_experience === true ? adminCopy(lang, 'Sì', 'Yes') : request.private_experience === false ? adminCopy(lang, 'No', 'No') : '-'}</dd></div>
        {request.fixed_excursion_id && <div><dt>{adminCopy(lang, 'Escursione fissa', 'Fixed excursion')}</dt><dd>{request.fixed_excursion_id}</dd></div>}
      </dl>
      <BookingPaymentSummary request={request} lang={lang} />
      <NotificationStatusControl record={request} table="booking_requests" lang={lang} onUpdated={onUpdated} />
      {request.children_under_3 && <div className="admin-alert warning compact-alert">{adminCopy(lang, 'Attenzione: bambini sotto i 3 anni. Percorso da valutare con particolare cura.', 'Warning: children under 3. Route must be assessed carefully.')}</div>}
      {request.message && <p className="request-message">{request.message}</p>}
      {request.admin_note && <p className="small-note"><strong>Note:</strong> {request.admin_note}</p>}
      {request.status !== 'pending' && (
        <p className="small-note decision-note"><strong>{adminCopy(lang, 'Decisione', 'Decision')}:</strong> {request.decision_note || '-'} · {request.decided_at ? formatDateForMessage(String(request.decided_at).slice(0, 10), lang) : '-'}{request.decided_by ? ` · ${request.decided_by}` : ''}</p>
      )}
      <PartnerSourceControl request={request} lang={lang} session={session} onUpdated={onUpdated} />
      <RequestCrmControls request={request} lang={lang} onUpdated={onUpdated} />
      <RequestIncomeConfirmAction request={request} lang={lang} session={session} onUpdated={onUpdated} />
      {session && request.source === 'booking_code' && request.booking_code && navigate && (
        <div className="request-actions request-income-actions">
          <button className="button primary" type="button" onClick={() => openBookingCodeFromRequest(request, navigate)}>{adminCopy(lang, 'Gestisci codice / registra pagamento', 'Manage code / record payment')}</button>
          <span className="small-note">{adminCopy(lang, 'Usa lo stesso flusso di pagamento con importo, data e metodo effettivi.', 'Use the same payment flow with the actual amount, date and method.')}</span>
        </div>
      )}
      {session && <ReviewRequestActions record={request} type="request" lang={lang} session={session} onUpdated={onUpdated} />}
      {session && <ReferralActions record={request} type="request" lang={lang} session={session} onUpdated={onUpdated} />}
      <ReplyTools request={request} lang={lang}>
        {request.status === 'pending' && (
          <>
            <button className="button primary request-action-primary" type="button" onClick={onApprove}>{adminCopy(lang, 'Approva', 'Approve')}</button>
            <button className="button secondary request-action-secondary" type="button" onClick={onDecline}>{adminCopy(lang, 'Rifiuta', 'Decline')}</button>
          </>
        )}
      </ReplyTools>
      {request.status === 'accepted' && onRemove && (
        <div className="request-actions">
          <button className="button secondary danger" type="button" onClick={onRemove}>{adminCopy(lang, 'Rimuovi / annulla', 'Remove / cancel')}</button>
        </div>
      )}
    </article>
  );
}

function ReplyTools({ request, lang, children = null }) {
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
      <div className="reply-tool-buttons request-actions-row">
        {phone ? <a href={`https://wa.me/${phone}?text=${encode(prepared)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a> : <button type="button" onClick={() => copy('reply', prepared)}>{adminCopy(lang, 'Copia risposta', 'Copy reply')}</button>}
        <button type="button" onClick={() => setEmailOpen((open) => !open)}>{adminCopy(lang, 'Email', 'Email')}</button>
        <button type="button" onClick={() => copy('reply', prepared)}>{adminCopy(lang, 'Copia messaggio', 'Copy message')} {copied === 'reply' ? '· ✓' : ''}</button>
        {children}
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
          <AdminInput label="Phone / WhatsApp" type="tel" inputMode="tel" pattern="[0-9+\s().-]*" value={form.customer_phone} onChange={(value) => update('customer_phone', value.replace(/[^\d+\s().-]/g, ''))} />
          <AdminInput label="Email" type="email" value={form.customer_email} onChange={(value) => update('customer_email', value)} />
          <AdminSelect label={adminCopy(lang, 'Contatto preferito', 'Preferred contact')} value={form.preferred_contact} onChange={(value) => update('preferred_contact', value)} options={['whatsapp', 'phone', 'email', 'unknown']} />
          <AdminSelect label={adminCopy(lang, 'Fonte', 'Source')} value={form.source} onChange={(value) => update('source', value)} options={['whatsapp', 'phone', 'email', 'manual']} />
          <AdminSelect label={text(lang, 'heardAboutUsAdmin')} value={form.heard_about_us || 'not_specified'} onChange={(value) => { update('heard_about_us', value); update('heard_about_us_label', heardAboutUsLabel(value, lang)); if (!needsHeardAboutUsDetail(value)) update('heard_about_us_detail', ''); }} options={heardAboutUsOptions({ includeAdmin: true }).map((option) => option.value)} formatter={(value) => heardAboutUsLabel(value, lang)} />
          {needsHeardAboutUsDetail(form.heard_about_us) && <AdminInput label={text(lang, 'heardAboutUsOtherLabel')} value={form.heard_about_us_detail || ''} onChange={(value) => update('heard_about_us_detail', value)} />}
          <AdminSelect label={adminCopy(lang, 'Tipo richiesta', 'Request type')} value={form.request_type} onChange={(value) => update('request_type', value)} options={['private', 'fixed']} formatter={(value) => value === 'fixed' ? adminCopy(lang, 'Escursione fissa', 'Fixed excursion') : adminCopy(lang, 'Escursione privata', 'Private excursion')} />
          <AdminSelect label={adminCopy(lang, 'Tipo gruppo', 'Party type')} value={form.party_type} onChange={(value) => update('party_type', value)} options={['solo', 'couple', 'family', 'group', 'company', 'school', 'other']} formatter={(value) => ({ solo: adminCopy(lang, 'Singolo', 'Solo traveler'), couple: adminCopy(lang, 'Coppia', 'Couple'), family: adminCopy(lang, 'Famiglia', 'Family'), group: adminCopy(lang, 'Gruppo', 'Group'), company: adminCopy(lang, 'Azienda', 'Company'), school: adminCopy(lang, 'Scuola', 'School'), other: adminCopy(lang, 'Altro', 'Other') }[value] || value)} />
          <AdminSelect label={adminCopy(lang, 'Esperienza', 'Experience')} value={form.experience_id} onChange={(value) => update('experience_id', value)} options={ADMIN_EXPERIENCE_OPTIONS} formatter={(value) => adminExperienceLabel(value, lang)} />
          <AdminInput label={adminCopy(lang, 'Data richiesta', 'Requested date')} type="date" min={todayIso()} value={form.requested_date} onChange={(value) => update('requested_date', value)} />
          <AdminInput label={adminCopy(lang, 'Data alternativa', 'Alternative date')} type="date" min={todayIso()} value={form.alternative_date} onChange={(value) => update('alternative_date', value)} />
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


function cleanAdminAmount(value) {
  const parsed = Number.parseFloat(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function AdminBookingCodeModal({ lang, session, onClose, onSaved }) {
  const [fixedExcursions, setFixedExcursions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdCode, setCreatedCode] = useState(null);
  const [form, setForm] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    fixed_excursion_id: '',
    experience_id: 'etna-live',
    experience_name_it: '',
    experience_name_en: '',
    scheduled_date: '',
    scheduled_time: '',
    meeting_point_name: '',
    meeting_point_maps_url: '',
    expected_amount: '',
    currency: 'EUR',
    expiry_date: '',
    admin_note: ''
  });
  useBodyScrollLock(true);

  useEffect(() => {
    let alive = true;
    setLoadingOptions(true);
    listFixedExcursions({ activeOnly: true, fromDate: todayIso() })
      .then((items) => {
        if (!alive) return;
        setFixedExcursions((items || []).filter((item) => item.active !== false && (!item.date || item.date >= todayIso())));
      })
      .catch((err) => {
        if (alive) setError(err?.message || adminCopy(lang, 'Escursioni non caricate.', 'Excursions not loaded.'));
      })
      .finally(() => alive && setLoadingOptions(false));
    return () => { alive = false; };
  }, [lang]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyFixedExcursion(id) {
    const item = fixedExcursions.find((candidate) => candidate.id === id);
    setForm((current) => ({
      ...current,
      fixed_excursion_id: id,
      experience_id: item?.experience_id || current.experience_id,
      experience_name_it: item ? fixedExcursionTitle(item, 'it') : current.experience_name_it,
      experience_name_en: item ? fixedExcursionTitle(item, 'en') : current.experience_name_en,
      scheduled_date: item?.date || current.scheduled_date,
      scheduled_time: item?.start_time ? String(item.start_time).slice(0, 5) : current.scheduled_time,
      meeting_point_name: item ? fixedExcursionField(item, 'meeting_point', lang) : current.meeting_point_name,
      meeting_point_maps_url: item?.meeting_point_maps_url || current.meeting_point_maps_url
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!form.customer_name.trim()) {
      setError(adminCopy(lang, 'Inserisci il nome cliente.', 'Enter the customer name.'));
      return;
    }
    if (!form.fixed_excursion_id && !form.experience_id) {
      setError(adminCopy(lang, 'Seleziona un’escursione o un’esperienza.', 'Select an excursion or an experience.'));
      return;
    }
    if (cleanAdminAmount(form.expected_amount) < 0) {
      setError(adminCopy(lang, 'Importo non valido.', 'Invalid amount.'));
      return;
    }
    if ((form.scheduled_date && form.scheduled_date < todayIso()) || (form.expiry_date && form.expiry_date < todayIso())) {
      setError(adminCopy(lang, 'Seleziona una data di oggi o futura.', 'Select today or a future date.'));
      return;
    }
    setSaving(true);
    try {
      const selectedFixed = fixedExcursions.find((item) => item.id === form.fixed_excursion_id);
      const payload = {
        ...form,
        fixed_excursion_id: selectedFixed?.id || null,
        experience_id: selectedFixed?.experience_id || form.experience_id,
        experience_name_it: form.experience_name_it || (selectedFixed ? fixedExcursionTitle(selectedFixed, 'it') : adminExperienceLabel(form.experience_id, 'it')),
        experience_name_en: form.experience_name_en || (selectedFixed ? fixedExcursionTitle(selectedFixed, 'en') : adminExperienceLabel(form.experience_id, 'en')),
        experience_type: selectedFixed ? 'fixed' : 'manual',
        scheduled_date: form.scheduled_date || selectedFixed?.date || null,
        scheduled_time: form.scheduled_time || (selectedFixed?.start_time ? String(selectedFixed.start_time).slice(0, 5) : null),
        meeting_point_name: form.meeting_point_name || (selectedFixed ? fixedExcursionField(selectedFixed, 'meeting_point', lang) : ''),
        meeting_point_maps_url: form.meeting_point_maps_url || selectedFixed?.meeting_point_maps_url || '',
        expected_amount: cleanAdminAmount(form.expected_amount),
        expires_at: form.expiry_date || null,
        source: 'manual'
      };
      const created = await createBookingCode(payload, session.user.id);
      setCreatedCode(created);
      trackEvent('admin_booking_code_created', { language: lang, experience_id: payload.experience_id, has_fixed_excursion: Boolean(payload.fixed_excursion_id) }, { dedupe: false });
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Codice non creato.', 'Code not created.'));
    } finally {
      setSaving(false);
    }
  }

  const fixedOptions = fixedExcursions.map((item) => item.id);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="admin-modal wide booking-code-admin-modal" role="dialog" aria-modal="true" aria-labelledby="adminBookingCodeTitle">
        <div className="admin-modal-header">
          <div>
            <h2 id="adminBookingCodeTitle">{adminCopy(lang, 'Genera codice prenotazione', 'Generate booking code')}</h2>
            <p>{adminCopy(lang, 'Crea un codice per prenotazioni arrivate da canali esterni.', 'Create a code for bookings that came from external channels.')}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={text(lang, 'close')}>×</button>
        </div>
        {createdCode ? (
          <div className="admin-code-result-card">
            <span className="kicker">{adminCopy(lang, 'Codice pronto', 'Code ready')}</span>
            <h3>{createdCode.code}</h3>
            <p>{createdCode.customer_name} · {(lang === 'en' ? createdCode.experience_name_en || createdCode.experience_name_it : createdCode.experience_name_it || createdCode.experience_name_en)}</p>
            <div className="modal-actions">
              <button className="button primary" type="button" onClick={() => onSaved(createdCode.code)}>{adminCopy(lang, 'Fine', 'Done')}</button>
              <button className="button secondary" type="button" onClick={() => navigator.clipboard?.writeText(createdCode.code)}>{adminCopy(lang, 'Copia codice', 'Copy code')}</button>
            </div>
          </div>
        ) : (
          <form className="admin-form-grid booking-code-generator-form" onSubmit={submit}>
            <AdminInput label={adminCopy(lang, 'Nome cliente', 'Customer name')} value={form.customer_name} onChange={(value) => update('customer_name', value)} />
            <AdminInput label="Email" type="email" value={form.customer_email} onChange={(value) => update('customer_email', value)} />
            <AdminInput label="Phone / WhatsApp" type="tel" inputMode="tel" pattern="[0-9+\s().-]*" value={form.customer_phone} onChange={(value) => update('customer_phone', value.replace(/[^\d+\s().-]/g, ''))} />
            <label className="admin-field"><span>{adminCopy(lang, 'Escursione disponibile', 'Available excursion')}</span><select value={form.fixed_excursion_id} onChange={(event) => applyFixedExcursion(event.target.value)} disabled={loadingOptions}><option value="">{loadingOptions ? adminCopy(lang, 'Caricamento...', 'Loading...') : adminCopy(lang, 'Nessuna / esperienza manuale', 'None / manual experience')}</option>{fixedOptions.map((id) => <option key={id} value={id}>{fixedExcursionLabel(fixedExcursions.find((item) => item.id === id), lang)}</option>)}</select></label>
            {!form.fixed_excursion_id && <AdminSelect label={adminCopy(lang, 'Esperienza', 'Experience')} value={form.experience_id} onChange={(value) => update('experience_id', value)} options={ADMIN_EXPERIENCE_OPTIONS.filter((item) => item !== 'unsure')} formatter={(value) => adminExperienceLabel(value, lang)} />}
            <AdminInput label={adminCopy(lang, 'Titolo esperienza IT', 'Experience title IT')} value={form.experience_name_it} onChange={(value) => update('experience_name_it', value)} />
            <AdminInput label={adminCopy(lang, 'Titolo esperienza EN', 'Experience title EN')} value={form.experience_name_en} onChange={(value) => update('experience_name_en', value)} />
            <AdminInput label={adminCopy(lang, 'Data prevista', 'Expected date')} type="date" min={todayIso()} value={form.scheduled_date} onChange={(value) => update('scheduled_date', value)} />
            <AdminInput label={adminCopy(lang, 'Ora prevista', 'Expected time')} type="time" value={form.scheduled_time} onChange={(value) => update('scheduled_time', value)} />
            <AdminInput label={adminCopy(lang, 'Punto d’incontro', 'Meeting point')} value={form.meeting_point_name} onChange={(value) => update('meeting_point_name', value)} />
            <AdminInput label="Google Maps URL" value={form.meeting_point_maps_url} onChange={(value) => update('meeting_point_maps_url', value)} />
            <AdminInput label={adminCopy(lang, 'Importo previsto', 'Expected amount')} type="number" value={form.expected_amount} onChange={(value) => update('expected_amount', value)} />
            <AdminInput label={adminCopy(lang, 'Valuta', 'Currency')} value={form.currency} onChange={(value) => update('currency', normalizeCurrency(value))} />
            <AdminInput label={adminCopy(lang, 'Scadenza opzionale', 'Optional expiry')} type="date" min={todayIso()} value={form.expiry_date} onChange={(value) => update('expiry_date', value)} />
            <label className="admin-field full"><span>{adminCopy(lang, 'Nota interna opzionale', 'Optional internal note')}</span><textarea value={form.admin_note} onChange={(event) => update('admin_note', event.target.value)} rows={4} /></label>
            {error && <div className="admin-alert error full" role="alert">{error}</div>}
            <div className="modal-actions full">
              <button className="button primary" type="submit" disabled={saving}>{saving ? adminCopy(lang, 'Generazione...', 'Generating...') : adminCopy(lang, 'Genera codice', 'Generate code')}</button>
              <button className="button secondary" type="button" onClick={onClose}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}


function AdminInput({ label, value, onChange, type = 'text', placeholder = '', min, inputMode, pattern }) {
  const id = useMemo(() => `field-${Math.random().toString(36).slice(2)}`, []);
  const resolvedMin = min !== undefined ? min : (type === 'number' ? '0' : undefined);
  return <label className="admin-field" htmlFor={id}><span>{label}</span><input id={id} type={type} value={value || ''} placeholder={placeholder} min={resolvedMin} inputMode={inputMode} pattern={pattern} onChange={(event) => onChange(event.target.value)} /></label>;
}

function AdminSelect({ label, value, onChange, options, formatter = (item) => item }) {
  const id = useMemo(() => `field-${Math.random().toString(36).slice(2)}`, []);
  return <label className="admin-field" htmlFor={id}><span>{label}</span><select id={id} value={value || ''} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{formatter(option)}</option>)}</select></label>;
}


function RequestStatusAccordions({ requests, lang, session = null, navigate = null, onApprove, onDecline, onRemove, onUpdated }) {
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
                  session={session}
                  navigate={navigate}
                  compact
                  onApprove={() => onApprove(request)}
                  onDecline={() => onDecline(request)}
                  onRemove={() => onRemove(request)}
                  onUpdated={onUpdated}
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
  const [editingReviewId, setEditingReviewId] = useState('');
  const [editDrafts, setEditDrafts] = useState({});
  const emptyManualReviewForm = { source: 'google', reviewer_name: '', rating: '5', review_text: '', language: lang, review_date: todayIso(), external_review_url: '', profile_photo_url: '', display_order: '0', active: true, approved: true };
  const [manualForm, setManualForm] = useState(emptyManualReviewForm);

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

  function updateManual(field, value) {
    setManualForm((current) => ({ ...current, [field]: value }));
  }

  async function submitManualReview(event) {
    event.preventDefault();
    setError('');
    setFeedback('');
    if (!manualForm.review_text.trim()) {
      setError(adminCopy(lang, 'Inserisci il testo della recensione.', 'Enter the review text.'));
      return;
    }
    try {
      await createManualReview(manualForm);
      setManualForm({ ...emptyManualReviewForm, language: lang, review_date: todayIso() });
      setFeedback(adminCopy(lang, 'Recensione manuale salvata.', 'Manual review saved.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Recensione manuale non salvata.', 'Manual review not saved.'));
    }
  }

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

  function reviewEditDraft(review) {
    return editDrafts[review.id] || {
      source: review.source || 'website',
      reviewer_name: review.reviewer_name || '',
      rating: String(review.rating || '5'),
      review_text: review.review_text || '',
      language: review.language || lang,
      review_date: review.review_date || String(review.created_at || '').slice(0, 10) || todayIso(),
      external_review_url: review.external_review_url || '',
      profile_photo_url: review.profile_photo_url || '',
      display_order: String(review.display_order || 0),
      active: review.active !== false,
      approved: review.approved !== false
    };
  }

  function updateReviewDraft(review, field, value) {
    setEditDrafts((current) => ({ ...current, [review.id]: { ...reviewEditDraft(review), [field]: value } }));
  }

  function startEditingReview(review) {
    setEditingReviewId(review.id);
    setEditDrafts((current) => ({ ...current, [review.id]: reviewEditDraft(review) }));
  }

  async function saveReviewDetails(review) {
    setError('');
    setFeedback('');
    const draft = reviewEditDraft(review);
    try {
      await updateReviewDetails(review.id, draft);
      setEditingReviewId('');
      setFeedback(adminCopy(lang, 'Recensione aggiornata.', 'Review updated.'));
      await refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Recensione non aggiornata.', 'Review not updated.'));
    }
  }

  function renderReviewDetailsForm(review) {
    const draft = reviewEditDraft(review);
    return (
      <div className="admin-form-grid single-card-form admin-review-edit-form">
        <label className="admin-field"><span>{adminCopy(lang, 'Fonte', 'Source')}</span><select value={draft.source} onChange={(event) => updateReviewDraft(review, 'source', event.target.value)}><option value="website">Website</option><option value="google">Google</option></select></label>
        <AdminInput label={adminCopy(lang, 'Nome', 'Name')} value={draft.reviewer_name} onChange={(value) => updateReviewDraft(review, 'reviewer_name', value)} />
        <label className="admin-field"><span>{adminCopy(lang, 'Valutazione', 'Rating')}</span><select value={draft.rating} onChange={(event) => updateReviewDraft(review, 'rating', event.target.value)}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating}/5</option>)}</select></label>
        <label className="admin-field"><span>{adminCopy(lang, 'Lingua', 'Language')}</span><select value={draft.language} onChange={(event) => updateReviewDraft(review, 'language', event.target.value)}><option value="it">Italiano</option><option value="en">English</option></select></label>
        <AdminInput label={adminCopy(lang, 'Data recensione', 'Review date')} type="date" value={draft.review_date} onChange={(value) => updateReviewDraft(review, 'review_date', value)} />
        <AdminInput label={adminCopy(lang, 'Ordine', 'Display order')} type="number" value={draft.display_order} onChange={(value) => updateReviewDraft(review, 'display_order', value)} />
        <label className="admin-field full"><span>{adminCopy(lang, 'Testo recensione', 'Review text')}</span><textarea value={draft.review_text} onChange={(event) => updateReviewDraft(review, 'review_text', event.target.value)} rows={4} /></label>
        <AdminInput label={adminCopy(lang, 'URL recensione Google opzionale', 'Optional Google review URL')} value={draft.external_review_url} onChange={(value) => updateReviewDraft(review, 'external_review_url', value)} />
        <AdminInput label={adminCopy(lang, 'URL foto profilo opzionale', 'Optional profile photo URL')} value={draft.profile_photo_url} onChange={(value) => updateReviewDraft(review, 'profile_photo_url', value)} />
        <label className="check-field"><input type="checkbox" checked={draft.active} onChange={(event) => updateReviewDraft(review, 'active', event.target.checked)} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
        <label className="check-field"><input type="checkbox" checked={draft.approved} onChange={(event) => updateReviewDraft(review, 'approved', event.target.checked)} /> {adminCopy(lang, 'Approvata', 'Approved')}</label>
        <div className="modal-actions full"><button className="button primary" type="button" onClick={() => saveReviewDetails(review)}>{adminCopy(lang, 'Salva dettagli', 'Save details')}</button><button className="button secondary" type="button" onClick={() => setEditingReviewId('')}>{adminCopy(lang, 'Annulla', 'Cancel')}</button></div>
      </div>
    );
  }

  return (
    <section className="admin-panel admin-reviews-panel">
      <div className="admin-panel-header"><AdminEditableText as="h2" itemKey="admin.reviews.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Gestione recensioni', 'Review management')} /><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}

      <GoogleReviewsAdminStatus lang={lang} />

      <details className="admin-archive-details manual-review-editor">
        <summary><span>{adminCopy(lang, 'Recensione manuale / Google', 'Manual / Google review')}</span><strong>{adminCopy(lang, 'Fonte gratuita gestita da admin', 'Free admin-managed source')}</strong></summary>
        <form className="admin-form-grid" onSubmit={submitManualReview}>
          <label className="admin-field"><span>{adminCopy(lang, 'Fonte', 'Source')}</span><select value={manualForm.source} onChange={(event) => updateManual('source', event.target.value)}><option value="google">Google</option><option value="website">Website</option></select></label>
          <AdminInput label={adminCopy(lang, 'Nome autore', 'Author name')} value={manualForm.reviewer_name} onChange={(value) => updateManual('reviewer_name', value)} />
          <label className="admin-field"><span>{adminCopy(lang, 'Valutazione', 'Rating')}</span><select value={manualForm.rating} onChange={(event) => updateManual('rating', event.target.value)}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating}/5</option>)}</select></label>
          <label className="admin-field"><span>{adminCopy(lang, 'Lingua', 'Language')}</span><select value={manualForm.language} onChange={(event) => updateManual('language', event.target.value)}><option value="it">Italiano</option><option value="en">English</option></select></label>
          <AdminInput label={adminCopy(lang, 'Data recensione', 'Review date')} type="date" value={manualForm.review_date} onChange={(value) => updateManual('review_date', value)} />
          <AdminInput label={adminCopy(lang, 'Ordine', 'Display order')} type="number" value={manualForm.display_order} onChange={(value) => updateManual('display_order', value)} />
          <label className="admin-field full"><span>{adminCopy(lang, 'Testo recensione', 'Review text')}</span><textarea value={manualForm.review_text} onChange={(event) => updateManual('review_text', event.target.value)} rows={4} required /></label>
          <AdminInput label={adminCopy(lang, 'URL recensione Google opzionale', 'Optional Google review URL')} value={manualForm.external_review_url} onChange={(value) => updateManual('external_review_url', value)} />
          <AdminInput label={adminCopy(lang, 'URL foto profilo opzionale', 'Optional profile photo URL')} value={manualForm.profile_photo_url} onChange={(value) => updateManual('profile_photo_url', value)} />
          <label className="check-field"><input type="checkbox" checked={manualForm.active} onChange={(event) => updateManual('active', event.target.checked)} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
          <div className="modal-actions full"><button className="button primary" type="submit">{adminCopy(lang, 'Salva recensione manuale', 'Save manual review')}</button></div>
        </form>
        <p className="small-note">{adminCopy(lang, 'Usa l’inserimento manuale solo come fallback se il provider Google Business Profile non è ancora autorizzato. Quando la cache provider è disponibile, le recensioni Google sincronizzate hanno priorità sul sito pubblico.', 'Use manual entry only as a fallback while the Google Business Profile provider is not authorized. When the provider cache is available, synchronized Google reviews take priority on the public site.')}</p>
      </details>

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
                  <p className="small-note">{adminCopy(lang, 'Fonte', 'Source')}: {reviewSourceLabel(review, lang)} · {review.booking_code || '-'} · {review.language || '-'} · {review.review_date || String(review.created_at || '').slice(0, 10)}</p>
                  {editingReviewId === review.id ? renderReviewDetailsForm(review) : (
                    <>
                      <div className="admin-review-body">{normalizeReviewText(review.review_text).map((paragraph, index) => <p key={`${review.id}-body-${index}`}>{paragraph}</p>)}</div>
                      {review.admin_reply && (
                        <div className="admin-review-existing-reply">
                          <strong>{adminCopy(lang, 'Risposta vulcanIQ', 'vulcanIQ response')}</strong>
                          {normalizeReviewText(review.admin_reply).map((paragraph, index) => <p key={`${review.id}-reply-${index}`}>{paragraph}</p>)}
                        </div>
                      )}
                      <label className="field-label" htmlFor={`reviewReply-${review.id}`}>{review.admin_reply ? adminCopy(lang, 'Modifica risposta', 'Edit response') : adminCopy(lang, 'Rispondi alla recensione', 'Reply to review')}</label>
                      <textarea id={`reviewReply-${review.id}`} className="admin-review-reply-input" value={replyDraft(review)} onChange={(event) => updateReplyDraft(review, event.target.value)} placeholder={adminCopy(lang, 'Scrivi una risposta pubblica da mostrare sotto la recensione.', 'Write a public response to show below the review.')} />
                    </>
                  )}
                </div>
                <div className="admin-review-actions">
                  <button className="button secondary" type="button" onClick={() => startEditingReview(review)}>{adminCopy(lang, 'Modifica dettagli', 'Edit details')}</button>
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

function useAdminBookingCodes(filters = {}) {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const data = await listBookingCodes(filters);
      setCodes(data || []);
    } catch (err) {
      setError(err?.message || 'Could not load booking codes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [JSON.stringify(filters)]);

  return { codes, loading, error, refresh };
}

function bookingCodeStatusLabel(status, lang) {
  const labels = {
    unused: { it: 'Non usato', en: 'Unused' },
    not_completed: { it: 'Non completato', en: 'Not completed' },
    redeemed: { it: 'Usato', en: 'Redeemed' },
    expired: { it: 'Scaduto', en: 'Expired' },
    cancelled: { it: 'Annullato', en: 'Cancelled' },
    completed: { it: 'Completato', en: 'Completed' },
    no_show: { it: 'No-show', en: 'No-show' }
  };
  return labels[status]?.[lang] || status || '-';
}

function bookingCodeIncomeStatusLabel(status, lang) {
  const labels = {
    expected: { it: 'Entrata attesa', en: 'Expected income' },
    pending: { it: 'In attesa', en: 'Pending' },
    confirmed: { it: 'Entrata confermata', en: 'Confirmed income' },
    cancelled: { it: 'Entrata annullata', en: 'Income cancelled' },
    reversed: { it: 'Entrata stornata', en: 'Income reversed' },
    none: { it: 'Nessuna entrata', en: 'No income' }
  };
  return labels[status]?.[lang] || status || '-';
}

function bookingCodeTitleForAdmin(code, lang) {
  return lang === 'en'
    ? (code.experience_name_en || code.experience_name_it || adminExperienceLabel(code.experience_id, lang))
    : (code.experience_name_it || code.experience_name_en || adminExperienceLabel(code.experience_id, lang));
}

function adminMoney(value, currency = 'EUR', lang = 'it') {
  return formatMoney(value, currency, lang);
}

function consumeBookingCodeRequestSearch() {
  try {
    const code = String(window.sessionStorage.getItem('vulcaniq.admin.bookingCodeSearch') || '').trim();
    window.sessionStorage.removeItem('vulcaniq.admin.bookingCodeSearch');
    return code;
  } catch {
    return '';
  }
}

function BookingCodePaymentDialog({ item, lang, session, onClose, onSaved }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => createPaymentIdempotencyKey(`booking-code:${item.id}`));
  const [form, setForm] = useState({ entry_date: todayIso(), amount: String(item.expected_amount || ''), currency: item.currency || 'EUR', payment_method: '' });
  useBodyScrollLock(true);

  async function load() {
    setLoading(true); setError('');
    try {
      const next = await getBookingCodePaymentState(item.id);
      setState(next);
      setForm((current) => ({ ...current, amount: next.balance > 0 ? String(next.balance) : '', currency: next.code.currency || current.currency }));
    } catch (err) { setError(err?.message || adminCopy(lang, 'Pagamenti non disponibili.', 'Payments unavailable.')); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [item.id]);

  async function save() {
    setSaving(true); setError('');
    try {
      const result = await recordBookingCodePayment({ id: item.id, amount: form.amount, currency: form.currency, entryDate: form.entry_date, paymentMethod: form.payment_method, idempotencyKey, userId: session?.user?.id || null });
      trackEvent('booking_code_payment_recorded', { booking_code_id: item.id, code: item.code, payment_status: result.code?.payment_status || '' }, { dedupe: false });
      setIdempotencyKey(createPaymentIdempotencyKey(`booking-code:${item.id}`));
      await onSaved?.(adminCopy(lang, 'Pagamento registrato.', 'Payment recorded.'));
      onClose();
    } catch (err) { setError(err?.message || adminCopy(lang, 'Pagamento non registrato.', 'Payment not recorded.')); }
    finally { setSaving(false); }
  }

  const agreed = state?.agreed ?? Number(item.expected_amount || 0);
  const paid = state?.paid ?? 0;
  const balance = state?.balance ?? Math.max(0, agreed - paid);
  return <div className="modal-backdrop" role="presentation"><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby={`bookingCodePayment-${item.id}`}>
    <div className="admin-modal-header"><div><h2 id={`bookingCodePayment-${item.id}`}>{adminCopy(lang, 'Registra pagamento', 'Record payment')}</h2><p>{item.code} · {item.customer_name || '-'}</p></div><button className="icon-button" type="button" onClick={onClose} aria-label={text(lang, 'close')}>×</button></div>
    {loading ? <p>{adminCopy(lang, 'Caricamento pagamenti...', 'Loading payments...')}</p> : <>
      <div className="booking-payment-summary-grid modal-payment-summary"><span><small>{adminCopy(lang, 'Concordato', 'Agreed')}</small><strong>{formatMoney(agreed, form.currency, lang)}</strong></span><span><small>{adminCopy(lang, 'Incassato', 'Paid')}</small><strong>{formatMoney(paid, form.currency, lang)}</strong></span><span><small>{adminCopy(lang, 'Saldo', 'Balance')}</small><strong>{formatMoney(balance, form.currency, lang)}</strong></span><span><small>{adminCopy(lang, 'Stato', 'Status')}</small><strong>{state?.paymentStatus?.toUpperCase() || 'UNPAID'}</strong></span></div>
      {state?.recognized?.length > 0 && <div className="payment-history-list"><strong>{adminCopy(lang, 'Storico pagamenti', 'Payment history')}</strong>{state.recognized.map((entry) => <p className="small-note" key={entry.id}>{formatDateForMessage(entry.entry_date, lang) || '-'} · {entry.status === 'reversal' ? adminCopy(lang, 'Storno', 'Reversal') : adminCopy(lang, 'Pagamento', 'Payment')} · {formatMoney(entry.amount, entry.currency || form.currency, lang)} · {entry.payment_method || '-'}</p>)}</div>}
      {state?.expected?.length > 1 && <div className="admin-alert warning" role="alert">{adminCopy(lang, 'Più entrate attese sono collegate. Riconciliale in Finanze.', 'Multiple expected entries are linked. Reconcile them in Finance.')}</div>}
      {state?.expected?.length <= 1 && <div className="admin-form-grid request-income-confirm-grid"><AdminInput label={adminCopy(lang, 'Data pagamento', 'Payment date')} type="date" value={form.entry_date} onChange={(value) => setForm((current) => ({ ...current, entry_date: value }))} /><AdminInput label={adminCopy(lang, 'Importo effettivo', 'Actual amount')} type="number" inputMode="decimal" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} /><AdminInput label={adminCopy(lang, 'Valuta', 'Currency')} value={form.currency} onChange={(value) => setForm((current) => ({ ...current, currency: normalizeCurrency(value) }))} /><AdminInput label={adminCopy(lang, 'Metodo di pagamento', 'Payment method')} value={form.payment_method} placeholder={adminCopy(lang, 'Contanti, bonifico, carta...', 'Cash, bank transfer, card...')} onChange={(value) => setForm((current) => ({ ...current, payment_method: value }))} /></div>}
      {balance === 0 && <p className="small-note">{adminCopy(lang, 'Saldo zero: un ulteriore pagamento verrà registrato come sovrappagamento esplicito.', 'Zero balance: an additional payment will be recorded as an explicit overpayment.')}</p>}
    </>}
    {error && <div className="admin-alert error" role="alert">{error}</div>}
    <div className="modal-actions">{!loading && state?.expected?.length <= 1 && <button className="button primary" type="button" onClick={save} disabled={saving}>{saving ? adminCopy(lang, 'Registrazione...', 'Recording...') : adminCopy(lang, 'Registra pagamento', 'Record payment')}</button>}<button className="button secondary" type="button" onClick={onClose} disabled={saving}>{adminCopy(lang, 'Chiudi', 'Close')}</button></div>
  </section></div>;
}

function BookingCodesPage({ lang, session, adminContent = {} }) {
  const [filters, setFilters] = useState(() => ({ status: 'all', search: consumeBookingCodeRequestSearch(), limit: 250 }));
  const { codes, loading, error, refresh } = useAdminBookingCodes(filters);
  const [bookingCodeOpen, setBookingCodeOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  async function refreshWithFeedback(message = '') {
    await refresh();
    if (message) setFeedback(message);
  }

  async function copyCode(code) {
    await copyText(code);
    setFeedback(adminCopy(lang, 'Codice copiato.', 'Code copied.'));
  }

  async function cancelCode(item) {
    if (!window.confirm(adminCopy(lang, `Annullare il codice ${item.code}?`, `Cancel code ${item.code}?`))) return;
    setActionError('');
    setFeedback('');
    try {
      await cancelBookingCode(item.id, session.user.id);
      trackEvent('booking_code_cancelled', { booking_code_id: item.id, code: item.code }, { dedupe: false });
      await refreshWithFeedback(adminCopy(lang, 'Codice annullato.', 'Code cancelled.'));
    } catch (err) {
      setActionError(err?.message || adminCopy(lang, 'Codice non annullato.', 'Code not cancelled.'));
    }
  }

  async function runCodeAction(item, action) {
    setActionError('');
    setFeedback('');
    try {
      if (action === 'completed') {
        await markBookingCodeCompleted(item.id, session.user.id);
        trackEvent('booking_code_completed', { booking_code_id: item.id, code: item.code }, { dedupe: false });
        await refreshWithFeedback(adminCopy(lang, 'Esperienza segnata come completata.', 'Experience marked completed.'));
      }
      if (action === 'no-show') {
        if (!window.confirm(adminCopy(lang, `Segnare ${item.code} come no-show?`, `Mark ${item.code} as no-show?`))) return;
        await markBookingCodeNoShow(item.id, session.user.id);
        trackEvent('booking_code_no_show', { booking_code_id: item.id, code: item.code }, { dedupe: false });
        await refreshWithFeedback(adminCopy(lang, 'Codice segnato come no-show.', 'Code marked as no-show.'));
      }
    } catch (err) {
      setActionError(err?.message || adminCopy(lang, 'Azione non completata.', 'Action failed.'));
    }
  }

  const unusedCount = codes.filter((item) => item.status === 'unused').length;
  const redeemedCount = codes.filter((item) => item.status === 'redeemed').length;
  const codePaymentSummaries = codes.map((item) => paymentSummary(item.finance_entries || [], item.expected_amount, item.currency));
  const totalExpected = codePaymentSummaries.reduce((sum, item) => sum + Math.max(0, item.balance), 0);
  const confirmedIncome = codePaymentSummaries.reduce((sum, item) => sum + item.paid, 0);

  return (
    <section className="admin-page booking-codes-admin-page">
      <div className="admin-page-header">
        <div>
          <span className="kicker">{adminCopy(lang, 'Codici prenotazione', 'Booking codes')}</span>
          <AdminEditableText as="h1" itemKey="admin.bookingCodes.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Codici prenotazione', 'Booking codes')} />
          <AdminEditableText as="p" itemKey="admin.bookingCodes.helper" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Vedi i codici generati, controlla stato, cliente, esperienza, importo e collegamenti creati al momento dell’uso.', 'View generated codes, status, customer, experience, amount, and linked records created on redemption.')} />
        </div>
        <div className="admin-header-actions">
          <button className="button secondary" type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
          <button className="button primary" type="button" onClick={() => setBookingCodeOpen(true)}>{adminCopy(lang, 'Genera codice', 'Generate code')}</button>
        </div>
      </div>

      {feedback && <div className="admin-alert success" role="status">{feedback}</div>}
      {(error || actionError) && <div className="admin-alert error" role="alert">{error || actionError}</div>}

      <div className="admin-summary-grid booking-code-summary-grid">
        <SummaryCard label={adminCopy(lang, 'Totali caricati', 'Loaded total')} value={codes.length} />
        <SummaryCard label={adminCopy(lang, 'Non usati', 'Unused')} value={unusedCount} />
        <SummaryCard label={adminCopy(lang, 'Usati', 'Redeemed')} value={redeemedCount} />
        <SummaryCard label={adminCopy(lang, 'Importo previsto', 'Expected amount')} value={adminMoney(totalExpected, 'EUR', lang)} />
        <SummaryCard label={adminCopy(lang, 'Pagamenti registrati', 'Recorded payments')} value={adminMoney(confirmedIncome, 'EUR', lang)} helper={adminCopy(lang, 'Movimenti Finance registrati', 'Recorded Finance transactions')} />
      </div>

      <div className="admin-filter-bar booking-code-filter-bar">
        <input aria-label="Search booking codes" placeholder={adminCopy(lang, 'Cerca codice, cliente, email, telefono', 'Search code, customer, email, phone')} value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} />
        <select aria-label="Status" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
          <option value="all">{adminCopy(lang, 'Tutti gli stati', 'All statuses')}</option>
          {['unused', 'redeemed', 'expired', 'cancelled'].map((status) => <option key={status} value={status}>{bookingCodeStatusLabel(status, lang)}</option>)}
        </select>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>{adminCopy(lang, 'Codici generati', 'Generated codes')} · {codes.length}</h2>
          <button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button>
        </div>
        {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : codes.length === 0 ? <p>{adminCopy(lang, 'Nessun codice trovato.', 'No booking codes found.')}</p> : (
          <div className="booking-code-admin-list">
            {codes.map((item) => {
              const title = bookingCodeTitleForAdmin(item, lang);
              const mapsUrl = normalizeGoogleMapsUrl(item.meeting_point_maps_url);
              const codePayment = paymentSummary(item.finance_entries || [], item.expected_amount, item.currency);
              const paymentHistory = (item.finance_entries || []).filter((entry) => financeEntryIsRecognized(entry) && entry.type === 'income').sort((a,b) => String(b.entry_date || b.created_at || '').localeCompare(String(a.entry_date || a.created_at || '')));
              return (
                <article className={`booking-code-admin-card status-${item.status || 'unused'}`} key={item.id}>
                  <div className="booking-code-admin-card-head">
                    <div>
                      <button className="booking-code-copy-button" type="button" onClick={() => copyCode(item.code)} title={adminCopy(lang, 'Copia codice', 'Copy code')}>{item.code}</button>
                      <p className="small-note">{item.customer_name || '-'} · {item.customer_email || item.customer_phone || '-'}</p>
                    </div>
                    <span className={`status-pill ${item.status === 'redeemed' ? 'accepted' : item.status === 'cancelled' || item.status === 'expired' ? 'cancelled' : 'pending'}`}>{bookingCodeStatusLabel(item.status, lang)}</span>
                  </div>
                  <dl className="request-details-grid booking-code-details-grid">
                    <div><dt>{adminCopy(lang, 'Esperienza', 'Experience')}</dt><dd>{title}</dd></div>
                    <div><dt>{adminCopy(lang, 'Data', 'Date')}</dt><dd>{item.scheduled_date || '-'}{item.scheduled_time ? ` · ${item.scheduled_time}` : ''}</dd></div>
                    <div><dt>{adminCopy(lang, 'Importo', 'Amount')}</dt><dd>{adminMoney(item.expected_amount, item.currency, lang)}</dd></div>
                    <div><dt>{adminCopy(lang, 'Creato', 'Created')}</dt><dd>{formatLocalDateTime(item.created_at, lang, '-')}</dd></div>
                    <div><dt>{adminCopy(lang, 'Scadenza', 'Expiry')}</dt><dd>{formatLocalDateTime(item.expires_at, lang, item.expires_at || '-')}</dd></div>
                    <div><dt>{adminCopy(lang, 'Usato il', 'Redeemed at')}</dt><dd>{formatLocalDateTime(item.redeemed_at, lang, '-')}</dd></div>
                    <div><dt>{adminCopy(lang, 'Punto d’incontro', 'Meeting point')}</dt><dd>{mapsUrl ? <a className="inline-link" href={mapsUrl} target="_blank" rel="noopener noreferrer">{item.meeting_point_name || adminCopy(lang, 'Apri Maps', 'Open Maps')}</a> : (item.meeting_point_name || '-')}</dd></div>
                    <div><dt>{adminCopy(lang, 'Collegamenti', 'Links')}</dt><dd>{item.redeemed_booking_request_id ? adminCopy(lang, 'Richiesta creata', 'Request created') : '-'}{item.redeemed_finance_entry_id ? ` · ${adminCopy(lang, 'Finanza attesa', 'Expected finance')}` : ''}</dd></div>
                    <div><dt>{adminCopy(lang, 'Completamento', 'Completion')}</dt><dd>{bookingCodeStatusLabel(item.completion_status || 'not_completed', lang)}</dd></div>
                    <div><dt>{adminCopy(lang, 'Pagamento', 'Payment')}</dt><dd>{codePayment.status}</dd></div>
                  </dl>
                  <div className="booking-payment-summary compact"><div><span>{adminCopy(lang, 'Preventivo', 'Quoted')}</span><strong>{adminMoney(codePayment.agreed, codePayment.currency, lang)}</strong></div><div><span>{adminCopy(lang, 'Incassato', 'Paid')}</span><strong>{adminMoney(codePayment.paid, codePayment.currency, lang)}</strong></div><div><span>{adminCopy(lang, 'Saldo', 'Balance')}</span><strong>{adminMoney(codePayment.balance, codePayment.currency, lang)}</strong></div><span className={`status-pill ${codePayment.status.toLowerCase()}`}>{codePayment.status}</span></div>
                  {paymentHistory.length > 0 && <div className="payment-history-list"><strong>{adminCopy(lang, 'Pagamenti', 'Payments')}</strong>{paymentHistory.slice(0,4).map((entry) => <p className="small-note" key={entry.id}>{formatDateForMessage(entry.entry_date, lang) || '-'} · {adminMoney(entry.amount, entry.currency || item.currency, lang)} · {entry.payment_method || '-'}</p>)}</div>}
                  {item.status === 'redeemed' && codePayment.balance > 0 && <div className="admin-alert warning compact-alert">{adminCopy(lang, 'Codice usato: registra solo pagamenti realmente ricevuti, con data e metodo effettivi.', 'Code redeemed: record only payments actually received, with the actual date and method.')}</div>}
                  {item.admin_note && <p className="request-message"><strong>{adminCopy(lang, 'Nota interna', 'Internal note')}:</strong> {item.admin_note}</p>}
                  <ReviewRequestActions record={item} type="booking_code" lang={lang} session={session} onUpdated={(message) => refreshWithFeedback(message)} />
                  <ReferralActions record={item} type="booking_code" lang={lang} session={session} onUpdated={(message) => refreshWithFeedback(message)} />
                  <div className="admin-quick-actions">
                    <button type="button" onClick={() => copyCode(item.code)}>{adminCopy(lang, 'Copia codice', 'Copy code')}</button>
                    {item.status === 'unused' && <button type="button" onClick={() => cancelCode(item)}>{adminCopy(lang, 'Annulla codice', 'Cancel code')}</button>}
                    {item.status === 'redeemed' && item.completion_status !== 'completed' && <button type="button" onClick={() => runCodeAction(item, 'completed')}>{adminCopy(lang, 'Segna completato', 'Mark completed')}</button>}
                    {item.status === 'redeemed' && <button type="button" onClick={() => setPaymentTarget(item)}>{adminCopy(lang, 'Registra pagamento', 'Record payment')}</button>}
                    {item.status === 'redeemed' && item.income_status !== 'confirmed' && <button type="button" onClick={() => runCodeAction(item, 'no-show')}>{adminCopy(lang, 'No-show', 'No-show')}</button>}
                    {item.status === 'redeemed' && <button type="button" onClick={() => cancelCode(item)}>{adminCopy(lang, 'Annulla', 'Cancel')}</button>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <ReferralCodesPanel lang={lang} session={session} />

      {paymentTarget && <BookingCodePaymentDialog item={paymentTarget} lang={lang} session={session} onClose={() => setPaymentTarget(null)} onSaved={refreshWithFeedback} />}
      {bookingCodeOpen && <AdminBookingCodeModal lang={lang} session={session} onClose={() => setBookingCodeOpen(false)} onSaved={(code) => { setBookingCodeOpen(false); refreshWithFeedback(adminCopy(lang, `Codice creato: ${code}`, `Code created: ${code}`)); }} />}
    </section>
  );
}

function RequestsPage({ lang, session, navigate, adminContent = {} }) {
  const [filters, setFilters] = useState({ status: 'pending', experience_id: 'all', source: 'all', search: '', fromDate: '', toDate: '', limit: 250 });
  const { requests, loading, error, refresh } = useAdminRequests(filters);
  const [manualOpen, setManualOpen] = useState(false);
  const [bookingCodeOpen, setBookingCodeOpen] = useState(false);
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
        <div className="admin-header-actions">
          <button className="button secondary" type="button" onClick={() => setBookingCodeOpen(true)}>{adminCopy(lang, 'Genera codice', 'Generate code')}</button>
          <button className="button primary" type="button" onClick={() => setManualOpen(true)}>{adminCopy(lang, 'Aggiungi manuale', 'Add manual')}</button>
        </div>
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
      <RequestsCrmDashboard requests={requests} lang={lang} />
      <section className="admin-panel">
        <div className="admin-panel-header"><h2><AdminEditableText itemKey="admin.requests.results.title" lang={lang} adminContent={adminContent} fallback={adminCopy(lang, 'Risultati', 'Results')} /> · {requests.length}</h2><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
        {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : requests.length === 0 ? <p>{adminCopy(lang, 'Nessuna richiesta trovata.', 'No requests found.')}</p> : (
          <RequestStatusAccordions
            requests={requests}
            lang={lang}
            onApprove={(request) => setDecision({ type: 'approve', request })}
            onDecline={(request) => setDecision({ type: 'decline', request })}
            onRemove={(request) => setDecision({ type: 'remove', request })}
            onUpdated={(message) => refreshWithFeedback(message)}
            session={session}
            navigate={navigate}
          />
        )}
      </section>
      {decision && <DecisionModal lang={lang} session={session} decision={decision} onClose={() => setDecision(null)} onDone={(message) => { setDecision(null); refreshWithFeedback(message); }} />}
      {manualOpen && <ManualRequestModal lang={lang} session={session} onClose={() => setManualOpen(false)} onSaved={() => { setManualOpen(false); refreshWithFeedback(adminCopy(lang, 'Richiesta manuale creata.', 'Manual request created.')); }} />}
      {bookingCodeOpen && <AdminBookingCodeModal lang={lang} session={session} onClose={() => setBookingCodeOpen(false)} onSaved={(code) => { setBookingCodeOpen(false); refreshWithFeedback(adminCopy(lang, `Codice creato: ${code}`, `Code created: ${code}`)); }} />}
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
  const emptyForm = { name: '', category_key: 'other', category_it: 'Altro', category_en: 'Other', description_it: '', description_en: '', website_url: '', google_maps_url: '', social_url: '', image_url: '', image_path: '', image_name: '', image_type: '', imageFile: null, display_order: '0', active: true, commission_enabled: false, commission_type: 'none', commission_value: '', commission_currency: 'EUR', commission_applies_to: 'revenue_confirmed', commission_notes: '', commission_status: 'inactive' };
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
    if (!isValidOptionalUrl(form.website_url) || !isValidOptionalUrl(form.google_maps_url) || !isValidOptionalUrl(form.social_url) || (!form.imageFile && !isValidOptionalUrl(form.image_url))) {
      setError(adminCopy(lang, 'Inserisci URL validi che iniziano con http o https.', 'Enter valid URLs starting with http or https.'));
      return;
    }
    if (form.commission_enabled && (form.commission_type === 'none' || parseMoneyAmount(form.commission_value) <= 0 || (form.commission_type === 'percentage' && parseMoneyAmount(form.commission_value) > 100))) {
      setError(adminCopy(lang, 'Configura una commissione valida: tipo, valore positivo e percentuale massimo 100%.', 'Configure a valid commission: type, positive value, and percentage max 100%.'));
      return;
    }
    try {
      const imagePayload = form.imageFile ? await uploadPartnershipImage(form.imageFile, session.user.id) : {};
      const { imageFile, ...payload } = form;
      await createPartnership({ ...payload, ...partnershipCategoryLabelsForKey(form.category_key), ...imagePayload, created_by: session.user.id, updated_by: session.user.id });
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
            <label className="admin-field"><span>{adminCopy(lang, 'Categoria', 'Category')}</span><select value={form.category_key} onChange={(event) => update('category_key', event.target.value)}>{PARTNERSHIP_CATEGORIES.map((category) => <option value={category.key} key={category.key}>{partnershipCategoryLabel(category.key, lang)}</option>)}</select></label>
            <label className="admin-field full"><span>Description IT</span><textarea value={form.description_it} onChange={(event) => update('description_it', event.target.value)} rows={3} /></label>
            <label className="admin-field full"><span>Description EN</span><textarea value={form.description_en} onChange={(event) => update('description_en', event.target.value)} rows={3} /></label>
            <AdminInput label="Website URL" value={form.website_url} onChange={(value) => update('website_url', value)} />
            <AdminInput label={adminCopy(lang, 'Google Maps URL opzionale', 'Optional Google Maps URL')} value={form.google_maps_url} onChange={(value) => update('google_maps_url', value)} />
            <AdminInput label={adminCopy(lang, 'Instagram/social URL opzionale', 'Optional Instagram/social URL')} value={form.social_url} onChange={(value) => update('social_url', value)} />
            <AdminInput label={adminCopy(lang, 'URL immagine opzionale', 'Optional image URL')} value={form.image_url} onChange={(value) => update('image_url', value)} />
            <label className="admin-field full"><span>{adminCopy(lang, 'Immagine collaborazione', 'Partnership image')}</span><input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => update('imageFile', event.target.files?.[0] || null)} /></label>
            {form.imageFile && <p className="small-note full">{adminCopy(lang, 'File selezionato', 'Selected file')}: {form.imageFile.name}</p>}
            <AdminInput label={adminCopy(lang, 'Ordine', 'Display order')} type="number" value={form.display_order} onChange={(value) => update('display_order', value)} />
            <label className="check-field"><input type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
            <label className="check-field full"><input type="checkbox" checked={form.commission_enabled} onChange={(event) => { update('commission_enabled', event.target.checked); update('commission_status', event.target.checked ? 'active' : 'inactive'); update('commission_type', event.target.checked && form.commission_type === 'none' ? 'percentage' : form.commission_type); }} /> {adminCopy(lang, 'Abilita commissioni partner', 'Enable partner commissions')}</label>
            {form.commission_enabled && <>
              <AdminSelect label={adminCopy(lang, 'Tipo commissione', 'Commission type')} value={form.commission_type} onChange={(value) => update('commission_type', value)} options={['fixed_amount', 'percentage']} formatter={(value) => partnerCommissionTypeLabel(value, lang)} />
              <AdminInput label={adminCopy(lang, 'Valore commissione', 'Commission value')} type="number" value={form.commission_value} onChange={(value) => update('commission_value', value)} />
              <AdminInput label={adminCopy(lang, 'Valuta', 'Currency')} value={form.commission_currency} onChange={(value) => update('commission_currency', normalizeCurrency(value))} />
              <AdminSelect label={adminCopy(lang, 'Si applica a', 'Applies to')} value={form.commission_applies_to} onChange={(value) => update('commission_applies_to', value)} options={['request_created', 'booking_confirmed', 'revenue_confirmed']} formatter={(value) => partnerCommissionAppliesToLabel(value, lang)} />
              <label className="admin-field full"><span>{adminCopy(lang, 'Note interne commissione', 'Internal commission notes')}</span><textarea rows={2} value={form.commission_notes} onChange={(event) => update('commission_notes', event.target.value)} /></label>
              <p className="small-note full">{adminCopy(lang, 'Le commissioni sono interne e non vengono mostrate sul sito pubblico.', 'Commissions are internal and are not shown on the public website.')}</p>
            </>}
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
    category_key: partnershipCategoryKey(item),
    category_it: item.category_it || partnershipCategoryLabel(partnershipCategoryKey(item), 'it'),
    category_en: item.category_en || partnershipCategoryLabel(partnershipCategoryKey(item), 'en'),
    description_it: item.description_it || '',
    description_en: item.description_en || '',
    website_url: item.website_url || '',
    google_maps_url: item.google_maps_url || '',
    social_url: item.social_url || '',
    image_url: item.image_url || '',
    image_path: item.image_path || '',
    image_name: item.image_name || '',
    image_type: item.image_type || '',
    imageFile: null,
    removeImage: false,
    display_order: String(item.display_order || 0),
    active: item.active !== false,
    commission_enabled: item.commission_enabled === true,
    commission_type: item.commission_type || 'none',
    commission_value: item.commission_value ?? '',
    commission_currency: item.commission_currency || 'EUR',
    commission_applies_to: item.commission_applies_to || 'revenue_confirmed',
    commission_notes: item.commission_notes || '',
    commission_status: item.commission_status || (item.commission_enabled ? 'active' : 'inactive')
  });
  const [error, setError] = useState('');

  async function save() {
    setError('');
    if (!form.name.trim()) {
      setError(adminCopy(lang, 'Il nome è obbligatorio.', 'Name is required.'));
      return;
    }
    if (!isValidOptionalUrl(form.website_url) || !isValidOptionalUrl(form.google_maps_url) || !isValidOptionalUrl(form.social_url) || (!form.imageFile && !form.removeImage && !isValidOptionalUrl(form.image_url))) {
      setError(adminCopy(lang, 'URL non valido.', 'Invalid URL.'));
      return;
    }
    if (form.commission_enabled && (form.commission_type === 'none' || parseMoneyAmount(form.commission_value) <= 0 || (form.commission_type === 'percentage' && parseMoneyAmount(form.commission_value) > 100))) {
      setError(adminCopy(lang, 'Configura una commissione valida: tipo, valore positivo e percentuale massimo 100%.', 'Configure a valid commission: type, positive value, and percentage max 100%.'));
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
      await updatePartnership(item.id, { ...payload, ...partnershipCategoryLabelsForKey(form.category_key), ...imagePayload, updated_by: userId });
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
          <label className="admin-field"><span>{adminCopy(lang, 'Categoria', 'Category')}</span><select value={form.category_key} onChange={(event) => setForm((current) => ({ ...current, category_key: event.target.value }))}>{PARTNERSHIP_CATEGORIES.map((category) => <option value={category.key} key={category.key}>{partnershipCategoryLabel(category.key, lang)}</option>)}</select></label>
          <label className="admin-field full"><span>Description IT</span><textarea value={form.description_it} onChange={(event) => setForm((current) => ({ ...current, description_it: event.target.value }))} rows={3} /></label>
          <label className="admin-field full"><span>Description EN</span><textarea value={form.description_en} onChange={(event) => setForm((current) => ({ ...current, description_en: event.target.value }))} rows={3} /></label>
          <AdminInput label="Website URL" value={form.website_url} onChange={(value) => setForm((current) => ({ ...current, website_url: value }))} />
          <AdminInput label={adminCopy(lang, 'Google Maps URL opzionale', 'Optional Google Maps URL')} value={form.google_maps_url} onChange={(value) => setForm((current) => ({ ...current, google_maps_url: value }))} />
          <AdminInput label={adminCopy(lang, 'Instagram/social URL opzionale', 'Optional Instagram/social URL')} value={form.social_url} onChange={(value) => setForm((current) => ({ ...current, social_url: value }))} />
          <AdminInput label={adminCopy(lang, 'URL immagine', 'Image URL')} value={form.image_url} onChange={(value) => setForm((current) => ({ ...current, image_url: value }))} />
          <label className="admin-field full"><span>{adminCopy(lang, 'Sostituisci immagine', 'Replace image')}</span><input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => setForm((current) => ({ ...current, imageFile: event.target.files?.[0] || null, removeImage: false }))} /></label>
          {form.image_url && !form.removeImage && <p className="small-note full"><a href={form.image_url} target="_blank" rel="noopener noreferrer">{form.image_name || adminCopy(lang, 'Immagine esistente', 'Existing image')}</a> <button type="button" className="inline-danger-button" onClick={() => setForm((current) => ({ ...current, removeImage: true, imageFile: null }))}>{adminCopy(lang, 'Rimuovi immagine', 'Remove image')}</button></p>}
          {form.imageFile && <p className="small-note full">{adminCopy(lang, 'Nuovo file', 'New file')}: {form.imageFile.name}</p>}
          <AdminInput label={adminCopy(lang, 'Ordine', 'Display order')} type="number" value={form.display_order} onChange={(value) => setForm((current) => ({ ...current, display_order: value }))} />
          <label className="check-field"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
          <label className="check-field full"><input type="checkbox" checked={form.commission_enabled} onChange={(event) => setForm((current) => ({ ...current, commission_enabled: event.target.checked, commission_status: event.target.checked ? 'active' : 'inactive', commission_type: event.target.checked && current.commission_type === 'none' ? 'percentage' : current.commission_type }))} /> {adminCopy(lang, 'Abilita commissioni partner', 'Enable partner commissions')}</label>
          {form.commission_enabled && <>
            <AdminSelect label={adminCopy(lang, 'Tipo commissione', 'Commission type')} value={form.commission_type} onChange={(value) => setForm((current) => ({ ...current, commission_type: value }))} options={['fixed_amount', 'percentage']} formatter={(value) => partnerCommissionTypeLabel(value, lang)} />
            <AdminInput label={adminCopy(lang, 'Valore commissione', 'Commission value')} type="number" value={form.commission_value} onChange={(value) => setForm((current) => ({ ...current, commission_value: value }))} />
            <AdminInput label={adminCopy(lang, 'Valuta', 'Currency')} value={form.commission_currency} onChange={(value) => setForm((current) => ({ ...current, commission_currency: normalizeCurrency(value) }))} />
            <AdminSelect label={adminCopy(lang, 'Si applica a', 'Applies to')} value={form.commission_applies_to} onChange={(value) => setForm((current) => ({ ...current, commission_applies_to: value }))} options={['request_created', 'booking_confirmed', 'revenue_confirmed']} formatter={(value) => partnerCommissionAppliesToLabel(value, lang)} />
            <label className="admin-field full"><span>{adminCopy(lang, 'Note interne commissione', 'Internal commission notes')}</span><textarea rows={2} value={form.commission_notes} onChange={(event) => setForm((current) => ({ ...current, commission_notes: event.target.value }))} /></label>
            <p className="small-note full">{adminCopy(lang, 'Le commissioni sono interne e non vengono mostrate sul sito pubblico.', 'Commissions are internal and are not shown on the public website.')}</p>
          </>}
          {error && <div className="admin-alert error full">{error}</div>}
          <div className="modal-actions full"><button className="button primary" type="button" onClick={save}>{adminCopy(lang, 'Salva', 'Save')}</button><button className="button secondary" type="button" onClick={() => setEditing(false)}>{adminCopy(lang, 'Annulla', 'Cancel')}</button></div>
        </div>
      ) : (
        <>
          {item.image_url && <img className="admin-card-preview-image" src={item.image_url} alt={item.name} />}
          {(item.description_it || item.description_en) && <FormattedText textValue={lang === 'it' ? item.description_it || item.description_en : item.description_en || item.description_it} className="formatted-text admin-partnership-preview-text" />}
          <p className="small-note">{item.website_url || '-'} · {item.google_maps_url ? 'Google Maps' : adminCopy(lang, 'Nessuna mappa', 'No map')} · {item.social_url ? 'Social' : adminCopy(lang, 'Nessun social', 'No social')} · {item.image_name || adminCopy(lang, 'Nessuna immagine', 'No image')} · {adminCopy(lang, 'Ordine', 'Order')} {item.display_order}</p>
          <p className="small-note"><strong>{adminCopy(lang, 'Commissioni', 'Commissions')}:</strong> {item.commission_enabled ? `${partnerCommissionRuleLabel(item, lang)} · ${partnerCommissionAppliesToLabel(item.commission_applies_to, lang)}` : adminCopy(lang, 'Disabilitate', 'Disabled')}</p>
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
  const emptyFixedForm = { date: '', start_time: '', end_time: '', experience_id: 'etna-live', leaflet_id: '', title_it: '', title_en: '', description_it: '', description_en: '', program_it: '', program_en: '', meeting_point_it: '', meeting_point_en: '', meeting_point_maps_url: '', difficulty_it: '', difficulty_en: '', price_note_it: '', price_note_en: '', leafletFileIt: null, leafletFileEn: null, capacity: '12', active: true };
  const emptyLeafletForm = { month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()), title_it: '', title_en: '', description_it: '', description_en: '', notes_it: '', notes_en: '', file_it: null, file_en: null, active: true };
  const [fixedForm, setFixedForm] = useState(emptyFixedForm);
  const [leafletForm, setLeafletForm] = useState(emptyLeafletForm);

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
    if (!fixedForm.leafletFileIt || !fixedForm.leafletFileEn) {
      setError(adminCopy(lang, 'Carica il volantino italiano e il volantino inglese per questa escursione fissa.', 'Upload both the Italian and English leaflet for this fixed excursion.'));
      return;
    }
    try {
      const filePayloadIt = await uploadFixedExcursionLeafletFile(fixedForm.leafletFileIt, session.user.id, 'it');
      const filePayloadEn = await uploadFixedExcursionLeafletFile(fixedForm.leafletFileEn, session.user.id, 'en');
      const legacyItalianPayload = {
        blocked_dates_file_url: filePayloadIt.leaflet_file_url_it,
        blocked_dates_file_path: filePayloadIt.leaflet_file_path_it,
        blocked_dates_file_name: filePayloadIt.leaflet_file_name_it,
        blocked_dates_file_type: filePayloadIt.leaflet_file_type_it
      };
      const { leafletFileIt, leafletFileEn, ...fixedPayload } = fixedForm;
      await createFixedExcursion({ ...fixedPayload, ...legacyItalianPayload, ...filePayloadIt, ...filePayloadEn, created_by: session.user.id, updated_by: session.user.id });
      setFixedForm({ ...emptyFixedForm });
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
    if (!leafletForm.month || !leafletForm.year) {
      setError(adminCopy(lang, 'Mese e anno sono obbligatori.', 'Month and year are required.'));
      return;
    }
    if (!leafletForm.file_it || !leafletForm.file_en) {
      setError(adminCopy(lang, 'Carica il volantino italiano e il volantino inglese.', 'Upload both the Italian leaflet and the English leaflet.'));
      return;
    }
    try {
      const monthlyStorageKey = `${leafletForm.year}-${String(leafletForm.month).padStart(2, '0')}`;
      const filePayloadIt = await uploadMonthlyLeafletFile(leafletForm.file_it, session.user.id, 'it', monthlyStorageKey);
      const filePayloadEn = await uploadMonthlyLeafletFile(leafletForm.file_en, session.user.id, 'en', monthlyStorageKey);
      const legacyItalianPayload = {
        file_url: filePayloadIt.leaflet_file_url_it,
        file_path: filePayloadIt.leaflet_file_path_it,
        file_name: filePayloadIt.leaflet_file_name_it,
        file_type: filePayloadIt.leaflet_file_type_it
      };
      const { file_it, file_en, ...leafletPayload } = leafletForm;
      await createMonthlyLeaflet({ ...leafletPayload, ...legacyItalianPayload, ...filePayloadIt, ...filePayloadEn, created_by: session.user.id, updated_by: session.user.id });
      setLeafletForm({ ...emptyLeafletForm, month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) });
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
              <AdminInput label={adminCopy(lang, 'Data', 'Date')} type="date" min={todayIso()} value={form.date} onChange={(value) => update('date', value)} />
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
              <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione programma IT', 'Programme description IT')}</span><textarea value={leafletForm.description_it} onChange={(event) => updateLeaflet('description_it', event.target.value)} rows={4} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione programma EN', 'Programme description EN')}</span><textarea value={leafletForm.description_en} onChange={(event) => updateLeaflet('description_en', event.target.value)} rows={4} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Note programma IT', 'Programme notes IT')}</span><textarea value={leafletForm.notes_it} onChange={(event) => updateLeaflet('notes_it', event.target.value)} rows={2} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Note programma EN', 'Programme notes EN')}</span><textarea value={leafletForm.notes_en} onChange={(event) => updateLeaflet('notes_en', event.target.value)} rows={2} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Volantino italiano obbligatorio', 'Required Italian leaflet')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => updateLeaflet('file_it', event.target.files?.[0] || null)} required /></label>
              {leafletForm.file_it && <p className="small-note full">{adminCopy(lang, 'File italiano selezionato', 'Selected Italian file')}: {leafletForm.file_it.name}</p>}
              <label className="admin-field full"><span>{adminCopy(lang, 'Volantino inglese obbligatorio', 'Required English leaflet')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => updateLeaflet('file_en', event.target.files?.[0] || null)} required /></label>
              {leafletForm.file_en && <p className="small-note full">{adminCopy(lang, 'File inglese selezionato', 'Selected English file')}: {leafletForm.file_en.name}</p>}
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
              <AdminInput label={adminCopy(lang, 'Data', 'Date')} type="date" min={todayIso()} value={fixedForm.date} onChange={(value) => updateFixed('date', value)} />
              <AdminInput label={adminCopy(lang, 'Ora inizio', 'Start time')} type="time" value={fixedForm.start_time} onChange={(value) => updateFixed('start_time', value)} />
              <AdminInput label={adminCopy(lang, 'Ora fine opzionale', 'Optional end time')} type="time" value={fixedForm.end_time} onChange={(value) => updateFixed('end_time', value)} />
              <AdminSelect label={adminCopy(lang, 'Esperienza', 'Experience')} value={fixedForm.experience_id} onChange={(value) => updateFixed('experience_id', value)} options={['etna-premium', 'etna-learning', 'etna-live', 'etna-stories']} formatter={(value) => adminExperienceLabel(value, lang)} />
              {leaflets.length > 0 && <AdminSelect label={adminCopy(lang, 'Calendario mensile collegato', 'Linked monthly leaflet')} value={fixedForm.leaflet_id} onChange={(value) => updateFixed('leaflet_id', value)} options={['', ...leaflets.map((leaflet) => leaflet.id)]} formatter={(value) => value ? leafletLabel(leaflets.find((leaflet) => leaflet.id === value), lang) : adminCopy(lang, 'Nessuno', 'None')} />}
              <AdminInput label={adminCopy(lang, 'Capienza', 'Capacity')} type="number" value={fixedForm.capacity} onChange={(value) => updateFixed('capacity', value)} />
              <AdminInput label="Title IT" value={fixedForm.title_it} onChange={(value) => updateFixed('title_it', value)} />
              <AdminInput label="Title EN" value={fixedForm.title_en} onChange={(value) => updateFixed('title_en', value)} />
              <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione breve IT', 'Short description IT')}</span><textarea value={fixedForm.description_it} onChange={(event) => updateFixed('description_it', event.target.value)} rows={3} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione breve EN', 'Short description EN')}</span><textarea value={fixedForm.description_en} onChange={(event) => updateFixed('description_en', event.target.value)} rows={3} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Programma dettagliato IT', 'Detailed programme IT')}</span><textarea value={fixedForm.program_it} onChange={(event) => updateFixed('program_it', event.target.value)} rows={5} /></label>
              <label className="admin-field full"><span>{adminCopy(lang, 'Programma dettagliato EN', 'Detailed programme EN')}</span><textarea value={fixedForm.program_en} onChange={(event) => updateFixed('program_en', event.target.value)} rows={5} /></label>
              <AdminInput label="Meeting point IT" value={fixedForm.meeting_point_it} onChange={(value) => updateFixed('meeting_point_it', value)} />
              <AdminInput label="Meeting point EN" value={fixedForm.meeting_point_en} onChange={(value) => updateFixed('meeting_point_en', value)} />
              <AdminInput label={adminCopy(lang, 'Link Google Maps del punto d’incontro', 'Google Maps meeting point link')} value={fixedForm.meeting_point_maps_url} placeholder="https://maps.google.com/..." onChange={(value) => updateFixed('meeting_point_maps_url', value)} />
              <AdminInput label="Difficulty IT" value={fixedForm.difficulty_it} onChange={(value) => updateFixed('difficulty_it', value)} />
              <AdminInput label="Difficulty EN" value={fixedForm.difficulty_en} onChange={(value) => updateFixed('difficulty_en', value)} />
              <AdminInput label="Price note IT" value={fixedForm.price_note_it} onChange={(value) => updateFixed('price_note_it', value)} />
              <AdminInput label="Price note EN" value={fixedForm.price_note_en} onChange={(value) => updateFixed('price_note_en', value)} />
              <label className="admin-field full"><span>{adminCopy(lang, 'Volantino italiano obbligatorio', 'Required Italian leaflet')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => updateFixed('leafletFileIt', event.target.files?.[0] || null)} required /></label>
              {fixedForm.leafletFileIt && <p className="small-note full">{adminCopy(lang, 'File italiano selezionato', 'Selected Italian file')}: {fixedForm.leafletFileIt.name}</p>}
              <label className="admin-field full"><span>{adminCopy(lang, 'Volantino inglese obbligatorio', 'Required English leaflet')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => updateFixed('leafletFileEn', event.target.files?.[0] || null)} required /></label>
              {fixedForm.leafletFileEn && <p className="small-note full">{adminCopy(lang, 'File inglese selezionato', 'Selected English file')}: {fixedForm.leafletFileEn.name}</p>}
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
  const title = monthlyLeafletField(item, 'title', lang);
  const base = `${String(item.month).padStart(2, '0')}/${item.year}`;
  return title ? `${base} · ${title}` : base;
}

function MonthlyLeafletCard({ item, lang, userId, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    month: String(item.month || new Date().getMonth() + 1),
    year: String(item.year || new Date().getFullYear()),
    title_it: item.title_it || '',
    title_en: item.title_en || '',
    description_it: item.description_it || '',
    description_en: item.description_en || '',
    notes_it: item.notes_it || '',
    notes_en: item.notes_en || '',
    file_it: null,
    file_en: null,
    leaflet_file_url_it: item.leaflet_file_url_it || item.file_url || '',
    leaflet_file_path_it: item.leaflet_file_path_it || item.file_path || '',
    leaflet_file_name_it: item.leaflet_file_name_it || item.file_name || '',
    leaflet_file_type_it: item.leaflet_file_type_it || item.file_type || '',
    leaflet_file_url_en: item.leaflet_file_url_en || '',
    leaflet_file_path_en: item.leaflet_file_path_en || '',
    leaflet_file_name_en: item.leaflet_file_name_en || '',
    leaflet_file_type_en: item.leaflet_file_type_en || '',
    active: item.active !== false
  });
  const [error, setError] = useState('');
  const italianFile = monthlyLeafletFile(item, 'it');
  const englishFile = monthlyLeafletFile(item, 'en');
  const activeFile = monthlyLeafletFile(item, lang);
  const description = monthlyLeafletField(item, 'description', lang);
  const notes = monthlyLeafletField(item, 'notes', lang);

  async function save() {
    setError('');
    if (!form.month || !form.year) {
      setError(adminCopy(lang, 'Mese e anno sono obbligatori.', 'Month and year are required.'));
      return;
    }
    const hasItalian = Boolean(form.file_it || form.leaflet_file_url_it);
    const hasEnglish = Boolean(form.file_en || form.leaflet_file_url_en);
    if (!hasItalian || !hasEnglish) {
      setError(adminCopy(lang, 'Carica il volantino italiano e il volantino inglese.', 'Upload both the Italian leaflet and the English leaflet.'));
      return;
    }
    try {
      let filePayloadIt = {};
      let filePayloadEn = {};
      if (form.file_it) {
        filePayloadIt = await uploadMonthlyLeafletFile(form.file_it, userId, 'it', `${form.year}-${String(form.month).padStart(2, '0')}`);
        if (item.leaflet_file_path_it || item.file_path) await removeMonthlyLeafletFile(item.leaflet_file_path_it || item.file_path);
      }
      if (form.file_en) {
        filePayloadEn = await uploadMonthlyLeafletFile(form.file_en, userId, 'en', `${form.year}-${String(form.month).padStart(2, '0')}`);
        if (item.leaflet_file_path_en) await removeMonthlyLeafletFile(item.leaflet_file_path_en);
      }
      const { file_it, file_en, ...payload } = form;
      const nextItUrl = filePayloadIt.leaflet_file_url_it || payload.leaflet_file_url_it;
      const nextItPath = filePayloadIt.leaflet_file_path_it || payload.leaflet_file_path_it;
      const nextItName = filePayloadIt.leaflet_file_name_it || payload.leaflet_file_name_it;
      const nextItType = filePayloadIt.leaflet_file_type_it || payload.leaflet_file_type_it;
      await updateMonthlyLeaflet(item.id, {
        ...payload,
        ...filePayloadIt,
        ...filePayloadEn,
        file_url: nextItUrl,
        file_path: nextItPath,
        file_name: nextItName,
        file_type: nextItType,
        updated_by: userId
      });
      setEditing(false);
      onChanged(adminCopy(lang, 'Programma mensile aggiornato.', 'Monthly programme updated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Aggiornamento non riuscito.', 'Update failed.'));
    }
  }

  async function deactivate() {
    setError('');
    try {
      await deactivateMonthlyLeaflet(item.id, userId);
      onChanged(adminCopy(lang, 'Calendario mensile disattivato.', 'Monthly leaflet deactivated.'));
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Disattivazione non riuscita.', 'Deactivate failed.'));
    }
  }

  return (
    <article className={`availability-block-card ${item.active ? '' : 'inactive'}`}>
      <div className="request-card-head">
        <div><h3>{leafletLabel(item, lang)}</h3><p>{activeFile?.file_name || adminCopy(lang, 'Programma mensile bilingue', 'Bilingual monthly programme')}</p></div>
        <span className={`status-pill ${item.active ? 'accepted' : 'cancelled'}`}>{item.active ? adminCopy(lang, 'Attivo', 'Active') : adminCopy(lang, 'Inattivo', 'Inactive')}</span>
      </div>
      {editing ? (
        <div className="admin-form-grid single-card-form">
          <AdminInput label={adminCopy(lang, 'Mese', 'Month')} type="number" value={form.month} onChange={(value) => setForm((current) => ({ ...current, month: value }))} />
          <AdminInput label={adminCopy(lang, 'Anno', 'Year')} type="number" value={form.year} onChange={(value) => setForm((current) => ({ ...current, year: value }))} />
          <AdminInput label="Title IT" value={form.title_it} onChange={(value) => setForm((current) => ({ ...current, title_it: value }))} />
          <AdminInput label="Title EN" value={form.title_en} onChange={(value) => setForm((current) => ({ ...current, title_en: value }))} />
          <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione programma IT', 'Programme description IT')}</span><textarea value={form.description_it} onChange={(event) => setForm((current) => ({ ...current, description_it: event.target.value }))} rows={4} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione programma EN', 'Programme description EN')}</span><textarea value={form.description_en} onChange={(event) => setForm((current) => ({ ...current, description_en: event.target.value }))} rows={4} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Note programma IT', 'Programme notes IT')}</span><textarea value={form.notes_it} onChange={(event) => setForm((current) => ({ ...current, notes_it: event.target.value }))} rows={2} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Note programma EN', 'Programme notes EN')}</span><textarea value={form.notes_en} onChange={(event) => setForm((current) => ({ ...current, notes_en: event.target.value }))} rows={2} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Sostituisci volantino italiano', 'Replace Italian leaflet')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => setForm((current) => ({ ...current, file_it: event.target.files?.[0] || null }))} /></label>
          {form.leaflet_file_url_it && <p className="small-note full"><a href={form.leaflet_file_url_it} target="_blank" rel="noopener noreferrer">{form.leaflet_file_name_it || adminCopy(lang, 'Volantino italiano esistente', 'Existing Italian leaflet')}</a></p>}
          {form.file_it && <p className="small-note full">{adminCopy(lang, 'Nuovo file italiano', 'New Italian file')}: {form.file_it.name}</p>}
          <label className="admin-field full"><span>{adminCopy(lang, 'Sostituisci volantino inglese', 'Replace English leaflet')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => setForm((current) => ({ ...current, file_en: event.target.files?.[0] || null }))} /></label>
          {form.leaflet_file_url_en && <p className="small-note full"><a href={form.leaflet_file_url_en} target="_blank" rel="noopener noreferrer">{form.leaflet_file_name_en || adminCopy(lang, 'Volantino inglese esistente', 'Existing English leaflet')}</a></p>}
          {form.file_en && <p className="small-note full">{adminCopy(lang, 'Nuovo file inglese', 'New English file')}: {form.file_en.name}</p>}
          <label className="check-field"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> {adminCopy(lang, 'Attivo', 'Active')}</label>
          {error && <div className="admin-alert error full">{error}</div>}
          <div className="modal-actions full"><button className="button primary" type="button" onClick={save}>{adminCopy(lang, 'Salva programma mensile', 'Save monthly programme')}</button><button className="button secondary" type="button" onClick={() => setEditing(false)}>{adminCopy(lang, 'Annulla', 'Cancel')}</button></div>
        </div>
      ) : (
        <>
          {(description || notes) && <div className="monthly-program-admin-preview">{description && <p>{description}</p>}{notes && <p className="small-note">{notes}</p>}</div>}
          <div className="bilingual-leaflet-admin-list">
            {italianFile?.file_url && <a className="button secondary" href={italianFile.file_url} target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Apri volantino IT', 'Open IT leaflet')}</a>}
            {englishFile?.file_url && <a className="button secondary" href={englishFile.file_url} target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Apri volantino EN', 'Open EN leaflet')}</a>}
          </div>
          <p className="small-note">{adminCopy(lang, 'Collega le singole date usando il campo calendario mensile nel form escursione fissa.', 'Link individual dates through the monthly leaflet field in the fixed excursion form.')}</p>
          {error && <div className="admin-alert error">{error}</div>}
          <div className="request-actions">
            <button className="button secondary" type="button" onClick={() => setEditing(true)}>{adminCopy(lang, 'Modifica', 'Edit')}</button>
            {item.active && <button className="button secondary" type="button" onClick={deactivate}>{adminCopy(lang, 'Disattiva', 'Deactivate')}</button>}
          </div>
        </>
      )}
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
    program_it: item.program_it || item.description_it || item.note_it || '',
    program_en: item.program_en || item.description_en || item.note_en || '',
    meeting_point_it: item.meeting_point_it || '',
    meeting_point_en: item.meeting_point_en || '',
    meeting_point_maps_url: item.meeting_point_maps_url || '',
    difficulty_it: item.difficulty_it || '',
    difficulty_en: item.difficulty_en || '',
    price_note_it: item.price_note_it || '',
    price_note_en: item.price_note_en || '',
    leafletFileIt: null,
    leafletFileEn: null,
    leaflet_file_url_it: item.leaflet_file_url_it || item.blocked_dates_file_url || '',
    leaflet_file_path_it: item.leaflet_file_path_it || item.blocked_dates_file_path || '',
    leaflet_file_name_it: item.leaflet_file_name_it || item.blocked_dates_file_name || '',
    leaflet_file_type_it: item.leaflet_file_type_it || item.blocked_dates_file_type || '',
    leaflet_file_url_en: item.leaflet_file_url_en || '',
    leaflet_file_path_en: item.leaflet_file_path_en || '',
    leaflet_file_name_en: item.leaflet_file_name_en || '',
    leaflet_file_type_en: item.leaflet_file_type_en || '',
    capacity: String(item.capacity || 12),
    active: item.active !== false
  });
  const [error, setError] = useState('');
  const italianFile = fixedExcursionLeafletFile(item, 'it');
  const englishFile = fixedExcursionLeafletFile(item, 'en');

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
    const hasItalian = Boolean(form.leafletFileIt || form.leaflet_file_url_it);
    const hasEnglish = Boolean(form.leafletFileEn || form.leaflet_file_url_en);
    if (!hasItalian || !hasEnglish) {
      setError(adminCopy(lang, 'Carica il volantino italiano e il volantino inglese per questa escursione fissa.', 'Upload both the Italian and English leaflet for this fixed excursion.'));
      return;
    }
    try {
      let filePayloadIt = {};
      let filePayloadEn = {};
      if (form.leafletFileIt) {
        filePayloadIt = await uploadFixedExcursionLeafletFile(form.leafletFileIt, userId, 'it');
        if (item.leaflet_file_path_it || item.blocked_dates_file_path) await removeBlockedDatesFile(item.leaflet_file_path_it || item.blocked_dates_file_path);
      }
      if (form.leafletFileEn) {
        filePayloadEn = await uploadFixedExcursionLeafletFile(form.leafletFileEn, userId, 'en');
        if (item.leaflet_file_path_en) await removeBlockedDatesFile(item.leaflet_file_path_en);
      }
      const { leafletFileIt, leafletFileEn, ...fixedPayload } = form;
      const nextItUrl = filePayloadIt.leaflet_file_url_it || fixedPayload.leaflet_file_url_it;
      const nextItPath = filePayloadIt.leaflet_file_path_it || fixedPayload.leaflet_file_path_it;
      const nextItName = filePayloadIt.leaflet_file_name_it || fixedPayload.leaflet_file_name_it;
      const nextItType = filePayloadIt.leaflet_file_type_it || fixedPayload.leaflet_file_type_it;
      await updateFixedExcursion(item.id, {
        ...fixedPayload,
        ...filePayloadIt,
        ...filePayloadEn,
        blocked_dates_file_url: nextItUrl,
        blocked_dates_file_path: nextItPath,
        blocked_dates_file_name: nextItName,
        blocked_dates_file_type: nextItType,
        updated_by: userId
      });
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
          <AdminInput label={adminCopy(lang, 'Data', 'Date')} type="date" min={todayIso()} value={form.date} onChange={(value) => setForm((current) => ({ ...current, date: value }))} />
          <AdminInput label={adminCopy(lang, 'Ora inizio', 'Start time')} type="time" value={form.start_time} onChange={(value) => setForm((current) => ({ ...current, start_time: value }))} />
          <AdminInput label={adminCopy(lang, 'Ora fine opzionale', 'Optional end time')} type="time" value={form.end_time} onChange={(value) => setForm((current) => ({ ...current, end_time: value }))} />
          <AdminSelect label={adminCopy(lang, 'Esperienza', 'Experience')} value={form.experience_id} onChange={(value) => setForm((current) => ({ ...current, experience_id: value }))} options={['etna-premium', 'etna-learning', 'etna-live', 'etna-stories']} formatter={(value) => adminExperienceLabel(value, lang)} />
          <AdminInput label={adminCopy(lang, 'Capienza', 'Capacity')} type="number" value={form.capacity} onChange={(value) => setForm((current) => ({ ...current, capacity: value }))} />
          <AdminInput label="Title IT" value={form.title_it} onChange={(value) => setForm((current) => ({ ...current, title_it: value }))} />
          <AdminInput label="Title EN" value={form.title_en} onChange={(value) => setForm((current) => ({ ...current, title_en: value }))} />
          <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione breve IT', 'Short description IT')}</span><textarea value={form.description_it} onChange={(event) => setForm((current) => ({ ...current, description_it: event.target.value }))} rows={3} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Descrizione breve EN', 'Short description EN')}</span><textarea value={form.description_en} onChange={(event) => setForm((current) => ({ ...current, description_en: event.target.value }))} rows={3} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Programma dettagliato IT', 'Detailed programme IT')}</span><textarea value={form.program_it} onChange={(event) => setForm((current) => ({ ...current, program_it: event.target.value }))} rows={5} /></label>
          <label className="admin-field full"><span>{adminCopy(lang, 'Programma dettagliato EN', 'Detailed programme EN')}</span><textarea value={form.program_en} onChange={(event) => setForm((current) => ({ ...current, program_en: event.target.value }))} rows={5} /></label>
          <AdminInput label="Meeting point IT" value={form.meeting_point_it} onChange={(value) => setForm((current) => ({ ...current, meeting_point_it: value }))} />
          <AdminInput label="Meeting point EN" value={form.meeting_point_en} onChange={(value) => setForm((current) => ({ ...current, meeting_point_en: value }))} />
          <AdminInput label={adminCopy(lang, 'Link Google Maps del punto d’incontro', 'Google Maps meeting point link')} value={form.meeting_point_maps_url} placeholder="https://maps.google.com/..." onChange={(value) => setForm((current) => ({ ...current, meeting_point_maps_url: value }))} />
          <AdminInput label="Difficulty IT" value={form.difficulty_it} onChange={(value) => setForm((current) => ({ ...current, difficulty_it: value }))} />
          <AdminInput label="Difficulty EN" value={form.difficulty_en} onChange={(value) => setForm((current) => ({ ...current, difficulty_en: value }))} />
          <AdminInput label="Price note IT" value={form.price_note_it} onChange={(value) => setForm((current) => ({ ...current, price_note_it: value }))} />
          <AdminInput label="Price note EN" value={form.price_note_en} onChange={(value) => setForm((current) => ({ ...current, price_note_en: value }))} />
          <label className="admin-field full"><span>{adminCopy(lang, 'Sostituisci volantino italiano', 'Replace Italian leaflet')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => setForm((current) => ({ ...current, leafletFileIt: event.target.files?.[0] || null }))} /></label>
          {form.leaflet_file_url_it && <p className="small-note full"><a href={form.leaflet_file_url_it} target="_blank" rel="noopener noreferrer">{form.leaflet_file_name_it || adminCopy(lang, 'Volantino italiano esistente', 'Existing Italian leaflet')}</a></p>}
          {form.leafletFileIt && <p className="small-note full">{adminCopy(lang, 'Nuovo file italiano', 'New Italian file')}: {form.leafletFileIt.name}</p>}
          <label className="admin-field full"><span>{adminCopy(lang, 'Sostituisci volantino inglese', 'Replace English leaflet')}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => setForm((current) => ({ ...current, leafletFileEn: event.target.files?.[0] || null }))} /></label>
          {form.leaflet_file_url_en && <p className="small-note full"><a href={form.leaflet_file_url_en} target="_blank" rel="noopener noreferrer">{form.leaflet_file_name_en || adminCopy(lang, 'Volantino inglese esistente', 'Existing English leaflet')}</a></p>}
          {form.leafletFileEn && <p className="small-note full">{adminCopy(lang, 'Nuovo file inglese', 'New English file')}: {form.leafletFileEn.name}</p>}
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
          <div className="bilingual-leaflet-admin-list">
            {italianFile?.file_url && <a className="button secondary" href={italianFile.file_url} target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Apri volantino IT', 'Open IT leaflet')}</a>}
            {englishFile?.file_url && <a className="button secondary" href={englishFile.file_url} target="_blank" rel="noopener noreferrer">{adminCopy(lang, 'Apri volantino EN', 'Open EN leaflet')}</a>}
          </div>
          <BlockedDatesAttachment item={item} lang={lang} publicView={false} />
          {(item.program_it || item.program_en || item.description_it || item.description_en || item.note_it || item.note_en) && <p>{fixedExcursionProgram(item, lang) || fixedExcursionField(item, 'description', lang) || (lang === 'it' ? item.note_it || item.note_en : item.note_en || item.note_it)}</p>}
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
  const [lang, setLang] = useState(() => readInitialPublicLanguage());
  const [formState, setFormState] = useState(() => ({ language: lang, requestType: 'private', partyType: 'solo', adults: '1', children: '0', childrenUnder3Count: '0', heardAboutUs: '', heardAboutUsDetail: '', message: text(lang, 'defaultMessage') }));
  const [activePage, setActivePage] = useState(() => publicPageFromPathname(window.location.pathname) || 'home');
  const [siteMedia, setSiteMedia] = useState({});
  const [siteContent, setSiteContent] = useState({});
  const [cmsStatus, setCmsStatus] = useState(() => isSupabaseConfigured ? 'loading' : 'error');
  const contactRef = useRef(null);
  const analyticsContextRef = useRef({ section: 'home', language: 'it' });
  const analyticsDisabledForRoute = pathname.startsWith('/admin');

  useEffect(() => {
    const match = pathname.match(/^\/r\/ref\/([^/?#]+)/);
    if (!match) return;
    const code = match[1];
    const params = new URLSearchParams(window.location.search || '');
    const routeLang = params.get('lang') === 'en' ? 'en' : params.get('lang') === 'it' ? 'it' : lang;
    let cancelled = false;
    async function resolveReferral() {
      const result = await validateAndRecordReferralClick(code);
      if (cancelled) return;
      if (result.valid) {
        storeReferralJourney(result.code, { language: routeLang });
        trackEvent('referral_link_click', { referral_code: result.code, source_type: 'customer_referral', language: routeLang }, { dedupe: false });
      } else {
        trackEvent('referral_invalid_link_click', { referral_code: code, source_type: 'customer_referral', language: routeLang }, { dedupe: false });
      }
      const query = new URLSearchParams();
      if (routeLang === 'en') query.set('lang', 'en');
      if (result.valid) {
        query.set('utm_source', 'referral');
        query.set('utm_medium', 'customer');
        query.set('utm_campaign', `referral_${result.code}`);
      }
      window.history.replaceState({}, '', `/${query.toString() ? `?${query.toString()}` : ''}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
      setActivePage('home');
    }
    resolveReferral();
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => {
    analyticsContextRef.current = { section: activePage, language: lang };
  }, [activePage, lang]);

  useEffect(() => {
    if (analyticsDisabledForRoute) return undefined;
    return startAnalyticsHeartbeat(() => analyticsContextRef.current);
  }, [analyticsDisabledForRoute]);

  useEffect(() => {
    if (pathname.startsWith('/admin')) return;
    const legalPage = legalPageFromPathname(pathname);
    const route = routeDefinitionFromPathname(pathname);
    const notFound = !legalPage && !route && !isReferralPath(pathname);
    const trackedSection = notFound ? 'not_found' : (legalPage ? `legal_${legalPage}` : activePage);
    const trackedPath = notFound || legalPage ? pathname : `/${activePage === 'home' ? '' : activePage}`;
    trackPageView(trackedSection, { path: trackedPath, language: lang });
  }, [activePage, lang, pathname]);

  useEffect(() => {
    if (pathname.startsWith('/admin') || legalPageFromPathname(pathname)) return;
    const routePage = publicPageFromPathname(pathname);
    if (routePage) setActivePage(routePage);
  }, [pathname]);

  useEffect(() => {
    const adminVariant = pathname.startsWith('/admin');
    const manifest = document.querySelector('link[rel="manifest"]');
    if (manifest) manifest.setAttribute('href', adminVariant ? '/admin-manifest.webmanifest' : '/manifest.webmanifest');
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) appleTitle.setAttribute('content', adminVariant ? 'VulcanIQ Admin' : 'VulcanIQ');
  }, [pathname]);

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
    if (pathname.startsWith('/admin')) return;
    const legalPage = legalPageFromPathname(pathname);
    const route = routeDefinitionFromPathname(pathname);
    const notFound = !legalPage && !route && !isReferralPath(pathname);
    applySeo({ page: notFound ? 'notFound' : (legalPage || activePage), lang, pathname, forceNoIndex: notFound });
  }, [activePage, lang, pathname]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setCmsStatus('error');
      return undefined;
    }
    let active = true;
    setCmsStatus('loading');
    Promise.allSettled([listSiteMedia({ activeOnly: true }), loadPublicSiteContent()])
      .then(([mediaResult, contentResult]) => {
        if (!active) return;
        const mediaReady = mediaResult.status === 'fulfilled';
        const contentReady = contentResult.status === 'fulfilled';
        setSiteMedia(mediaReady ? buildMediaMap(mediaResult.value) : {});
        setSiteContent(contentReady ? buildSiteContentMap(contentResult.value) : {});
        setCmsStatus(mediaReady || contentReady ? 'ready' : 'error');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
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
      if (resolved) {
        storePublicLanguage(resolved);
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin')) {
          const url = new URL(window.location.href);
          if (resolved === 'en') url.searchParams.set('lang', 'en');
          else url.searchParams.delete('lang');
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        }
      }
      return resolved || current;
    });
  }

  function scrollContactIntoView() {
    setActivePage('contact');
    navigatePublicRoute('/contact', lang);
    window.setTimeout(() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function scrollToForm(metadata = {}) {
    const trackingContext = withBookingJourneyId(buildBookingTrackingContext({
      experienceId: formState.experienceId || '',
      requestType: formState.requestType || 'private',
      sourceSection: metadata.source_section || 'hero',
      sourceCta: metadata.source_cta || 'contact_direct',
      ctaLocation: metadata.cta_location || 'hero',
      selectedDate: formState.requestedDate || '',
      hasFixedExcursion: formState.requestType === 'fixed',
      language: lang
    }), formState.trackingContext, { forceNew: !formState.trackingContext?.booking_journey_id });
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
      trackingContext: trackingContext ? withBookingJourneyId(trackingContext, current.trackingContext) : current.trackingContext
    }));
    if (scroll) scrollContactIntoView();
  }

  function renderPublicPage() {
    const legalPage = legalPageFromPathname(pathname);
    if (legalPage) return <LegalPage lang={lang} page={legalPage} siteContent={siteContent} />;
    if (!routeDefinitionFromPathname(pathname) && !isReferralPath(pathname)) {
      return <NotFoundPage lang={lang} onHome={() => navigatePublicRoute('/', lang)} />;
    }
    switch (activePage) {
      case 'experiences':
        return <ExperienceAccordion lang={lang} fillForm={fillForm} siteMedia={siteMedia} siteContent={siteContent} />;
      case 'partnerships':
        return <PartnershipsPage lang={lang} siteContent={siteContent} />;
      case 'about':
        return <Team lang={lang} siteMedia={siteMedia} siteContent={siteContent} />;
      case 'reviews':
        return <ReviewsPage lang={lang} siteContent={siteContent} EditableTextComponent={EditableText} />;
      case 'social':
        return <SocialPage lang={lang} siteContent={siteContent} />;
      case 'latestNews':
        return <LatestNewsPage lang={lang} siteContent={siteContent} />;
      case 'contact':
        return <ContactForm lang={lang} formState={formState} setFormState={setFormState} siteMedia={siteMedia} siteContent={siteContent} />;
      case 'giftCard':
        return <GiftCardPage lang={lang} siteContent={siteContent} onClose={() => { setActivePage('home'); navigatePublicRoute('/', lang); }} />;
      case 'install':
        return <NotificationsPage variant="public" lang={lang} />;
      case 'home':
      default:
        return <Hero lang={lang} setActivePage={setActivePage} scrollToForm={scrollToForm} fillForm={fillForm} siteMedia={siteMedia} siteContent={siteContent} cmsStatus={cmsStatus} />;
    }
  }

  if (pathname.startsWith('/admin')) {
    return <AdminRouter pathname={pathname} navigate={navigate} lang={lang} setLang={setPublicLanguage} />;
  }

  return (
    <>
      <Header lang={lang} setLang={setPublicLanguage} activePage={activePage} setActivePage={setActivePage} siteMedia={siteMedia} />
      <main ref={contactRef} className={`public-page-shell public-page-${activePage}`}>
        <DomainErrorBoundary resetKey={`${pathname}:${lang}`} lang={lang}>{renderPublicPage()}</DomainErrorBoundary>
      </main>
      <Footer lang={lang} siteContent={siteContent} />
      <StickyMobileBar lang={lang} siteContent={siteContent} />
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
