import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { blockedDates, defaultExperienceAvailability } from './data/availability.js';
import { isSupabaseConfigured } from './lib/supabaseClient.js';
import { getAdminAccess, signInOwner, signOutOwner } from './services/adminAuth.js';
import { createPublicBookingRequest, createManualBookingRequest, listBookingRequests, approveBookingRequest, declineBookingRequest } from './services/bookingRequests.js';
import { loadPublicAvailability, loadPublicFixedExcursions, listAvailabilityBlocks, createAvailabilityBlock, updateAvailabilityBlock, deactivateAvailabilityBlock, listFixedExcursions, createFixedExcursion, updateFixedExcursion, deactivateFixedExcursion, defaultReason } from './services/availabilityService.js';
import { buildApprovalReply, buildDeclineReply, replySubject, normalizePhoneForWhatsApp, hasLikelyCountryCode } from './services/replyMessages.js';
import './styles.css';

const PHONE_DISPLAY = '+39 334 929 8246';
const PHONE_WA = '393349298246';
const PHONE_TEL = '+393349298246';
const EMAIL = 'leo97ct@yahoo.it';
const INSTAGRAM = 'https://www.instagram.com/leonardo_chiavetta?igsh=bnhkNWQzbnF2aW5m';

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

const i18n = {
  it: {
    languageLabel: 'Italiano',
    switchLabel: 'EN',
    nav: ['Esperienze', 'Calendario', 'Questionario', 'Sicurezza', 'Team', 'Recensioni', 'Contatti'],
    contact: 'Contatti',
    heroKicker: 'Etna · lento · sicuro · umano',
    heroTitle: "L'Etna non è solo uno scenario.",
    heroLead: 'Esperienze private e fisse sull’Etna per leggere il vulcano come territorio vivo: con conoscenza, sicurezza e relazione umana.',
    findExperience: "Trova l'esperienza giusta",
    viewAvailability: 'Guarda le disponibilità',
    call: 'Chiama Leonardo',
    whatsapp: 'Scrivici su WhatsApp',
    addContact: 'Aggiungi ai contatti',
    email: "Invia un'email",
    trust: ['Guida vulcanologica certificata', 'Esperienze su misura', 'Sicurezza e valutazione reale', 'Italiano e inglese'],
    philosophyKicker: 'Filosofia',
    philosophyTitle: 'Perché un luogo non si visita davvero finché non si entra in relazione con ciò che lo rende vivo.',
    philosophyText: `vulcanIQ nasce da un’esigenza di fermarsi e cambiare prospettiva. Dopo anni a contatto con il turismo di massa, è emersa una domanda semplice ma potente: è davvero questo il modo di vivere un luogo come l’Etna?

Da lì è iniziato un percorso diverso. Il desiderio di rallentare, di osservare davvero, di restituire valore a ciò che spesso viene attraversato troppo in fretta.

Non più solo accompagnare, ma trasmettere. Non più mostrare, ma far comprendere.

È così che prende forma un modo nuovo di vivere la Sicilia: attraverso le storie di chi la abita, i gesti quotidiani, le tradizioni che resistono nel tempo. Lontano dai percorsi più battuti, vicino alle persone, ai dettagli, alle connessioni autentiche.`,
    mission: 'Missione',
    missionText: 'Creare esperienze sull’Etna che uniscano conoscenza, sicurezza e relazione con il territorio, aiutando ogni ospite a leggere il vulcano non come semplice scenario, ma come ambiente vivo, complesso e identitario.',
    vision: 'Visione',
    visionText: 'Crediamo in un turismo che non consumi il territorio, ma lo ascolti. Un modo più autentico di vivere l’Etna, fatto di connessione, rispetto e ricordi che restano.',
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
    reviewsTitle: 'Voci di chi ha vissuto l’Etna con Leonardo.',
    reviewsIntro: 'Recensioni reali, presentate con sobrietà e senza effetto marketplace.',
    safetyKicker: 'Sicurezza',
    safetyTitle: 'Condizioni, prudenza e valutazione reale.',
    safetyIntro: 'Ogni esperienza è confermata solo se meteo, accessibilità, ordinanze e attività vulcanica lo permettono.',
    teamKicker: 'Team',
    teamTitle: 'Un progetto piccolo, curato e umano.',
    leonardoRole: 'Fondatore · guida ambientale e vulcanologica',
    leonardoBio: 'Fondatore e ideatore di vulcanIQ, è guida ambientale dal 2020 e guida vulcanologica dal 2024. Accompagna le persone alla scoperta dell’Etna attraverso racconti, natura e osservazione del territorio, con l’obiettivo di trasformare ogni esperienza in qualcosa di autentico, emozionale e profondamente umano.',
    coFounderName: 'Deborah',
    coFounderRole: 'Qualità del servizio · scuole e aziende',
    coFounderBio: 'Da oltre 8 anni nel mondo dell’insegnamento e con esperienza come analista aziendale, Deborah unisce empatia, organizzazione e attenzione ai dettagli per creare esperienze autentiche e di valore. In vulcanIQ si occupa della qualità del servizio e dello sviluppo di percorsi dedicati a scuole e aziende, progettando attività capaci di unire scoperta, coinvolgimento e crescita personale.',
    coFounderAlt: 'Deborah, co-owner vulcanIQ',
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
    chooseFixedExcursion: 'Scegli escursione fissa',
    noFixedExcursions: 'Nessuna escursione fissa attiva al momento.',
    placesRemaining: 'Posti disponibili',
    capacityLabel: 'Capienza',
    totalPeople: 'Totale persone',
    partyType: 'Tipo di gruppo',
    soloTraveler: 'Singolo',
    contactGuideOver12: 'Per gruppi superiori a 12 persone, contatta direttamente la guida per valutare l’esperienza più adatta.',
    peopleRequired: 'Inserisci almeno una persona nella richiesta.',
    fixedDateRequired: 'Seleziona un’escursione fissa disponibile.',
    reviewOriginalLabel: 'Recensione originale in inglese',
    gearExtra: 'In base al periodo e al tipo di escursione, vi verranno fornite ulteriori informazioni sull’attrezzatura necessaria.',
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
    nav: ['Experiences', 'Calendar', 'Questionnaire', 'Safety', 'Team', 'Reviews', 'Contact'],
    contact: 'Contact',
    heroKicker: 'Etna · slow · safe · human',
    heroTitle: 'Mount Etna is not just a backdrop.',
    heroLead: 'Private and fixed Mount Etna experiences that help guests read the volcano as a living territory: with knowledge, safety, and human connection.',
    findExperience: 'Find the right experience',
    viewAvailability: 'View availability',
    call: 'Call Leonardo',
    whatsapp: 'Message on WhatsApp',
    addContact: 'Add to contacts',
    email: 'Send an email',
    trust: ['Certified volcanological guide', 'Tailored experiences', 'Safety and real assessment', 'Italian and English'],
    philosophyKicker: 'Philosophy',
    philosophyTitle: 'Because a place is not truly visited until you enter into relationship with what makes it alive.',
    philosophyText: `vulcanIQ was born from the need to pause and change perspective. After years in contact with mass tourism, one simple but powerful question emerged: is this really the way to experience a place like Mount Etna?

From there, a different path began. A desire to slow down, to truly observe, and to restore value to what is too often crossed too quickly.

Not only to accompany, but to transmit. Not only to show, but to help people understand.

This is how a new way of experiencing Sicily takes shape: through the stories of those who live here, everyday gestures, and traditions that endure over time. Far from the most beaten paths, close to people, details, and authentic connections.`,
    mission: 'Mission',
    missionText: 'To create Mount Etna experiences that combine knowledge, safety, and connection with the territory, helping each guest understand the volcano not as a simple backdrop, but as a living, complex, and identity-shaping environment.',
    vision: 'Vision',
    visionText: 'We believe in a form of tourism that does not consume the territory, but listens to it. A more authentic way to experience Mount Etna, made of connection, respect, and memories that remain.',
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
    reviewsTitle: 'Voices from people who experienced Etna with Leonardo.',
    reviewsIntro: 'Real reviews, presented with restraint and without a marketplace feel.',
    safetyKicker: 'Safety',
    safetyTitle: 'Conditions, prudence, and real assessment.',
    safetyIntro: 'Every experience is confirmed only if weather, access, regulations, and volcanic activity allow it.',
    teamKicker: 'Team',
    teamTitle: 'A small, curated, human project.',
    leonardoRole: 'Founder · environmental and volcanological guide',
    leonardoBio: 'Founder and creator of vulcanIQ, Leonardo has been an environmental guide since 2020 and a volcanological guide since 2024. He accompanies people in discovering Mount Etna through stories, nature, and observation of the territory, with the aim of transforming every experience into something authentic, emotional, and deeply human.',
    coFounderName: 'Deborah',
    coFounderRole: 'Service quality · schools and companies',
    coFounderBio: 'With more than 8 years in education and experience as a business analyst, Deborah combines empathy, organization, and attention to detail to create authentic and valuable experiences. At vulcanIQ, she focuses on service quality and the development of programs for schools and companies, designing activities that bring together discovery, engagement, and personal growth.',
    coFounderAlt: 'Deborah, vulcanIQ co-owner',
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
    chooseFixedExcursion: 'Choose fixed excursion',
    noFixedExcursions: 'No active fixed excursions at the moment.',
    placesRemaining: 'Places remaining',
    capacityLabel: 'Capacity',
    totalPeople: 'Total people',
    partyType: 'Party type',
    soloTraveler: 'Solo traveler',
    contactGuideOver12: 'For groups larger than 12 people, please contact the guide directly so we can evaluate the most suitable experience.',
    peopleRequired: 'Enter at least one person in the request.',
    fixedDateRequired: 'Select an available fixed excursion.',
    reviewOriginalLabel: 'Original review in English',
    gearExtra: 'Depending on the season and the type of excursion, you will receive further information about the necessary equipment.',
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


function fixedExcursionLabel(item, lang) {
  if (!item) return '';
  const date = formatDateForMessage(item.date, lang);
  const time = item.start_time ? ` · ${String(item.start_time).slice(0, 5)}` : '';
  return `${date}${time} · ${adminExperienceLabel(item.experience_id, lang)}`;
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
      {!missing && <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setMissing(true)} />}
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
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function Header({ lang, setLang }) {
  const [open, setOpen] = useState(false);
  const anchors = ['experiences', 'availability', 'questionnaire', 'safety', 'team', 'reviews', 'contact'];
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
          <VideoSlot
            src={MEDIA.introVideo}
            poster={MEDIA.premium}
            label={lang === 'it' ? 'Video introduttivo vulcanIQ' : 'vulcanIQ introductory video'}
            lang={lang}
          />
        </div>
      </div>
    </section>
  );
}

function Philosophy({ lang }) {
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
            <ImageSlot src={MEDIA.landscape} alt={text(lang, 'safetyAlt')} label={lang === 'it' ? 'Paesaggio · ascolto del territorio' : 'Landscape · listening to the territory'} lang={lang} ratio="wide" />
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
                  <span className="experience-image" aria-hidden="true"><img src={experience.image} alt="" loading="lazy" /></span>
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
  const [mode, setMode] = useState('fixed');
  const [records, setRecords] = useState(blockedDates);
  const [fixedExcursions, setFixedExcursions] = useState([]);
  const [monthDate, setMonthDate] = useState(startOfMonth(new Date()));
  const [experienceId, setExperienceId] = useState('etna-live');
  const [selected, setSelected] = useState(null);
  const [selectedFixedId, setSelectedFixedId] = useState('');

  useEffect(() => {
    loadAvailability().then((runtimeRecords) => {
      if (Array.isArray(runtimeRecords) && runtimeRecords.length) {
        setRecords([...blockedDates, ...runtimeRecords]);
      }
    });
    loadPublicFixedExcursions().then(setFixedExcursions);
  }, []);

  const days = useMemo(() => getCalendarDays(monthDate), [monthDate]);
  const selectedExperience = experienceById(experienceId);
  const selectedMessage = selected
    ? buildCalendarMessage({ experience: selectedExperience, date: selected.date, status: selected.status, note: selected.reason }, lang)
    : '';
  const selectedFixed = fixedExcursions.find((item) => item.id === selectedFixedId) || null;
  const fixedMessage = selectedFixed ? buildFixedExcursionMessage({ fixedExcursion: selectedFixed, people: '' }, lang) : '';

  function changeMonth(delta) {
    setMonthDate((date) => new Date(date.getFullYear(), date.getMonth() + delta, 1));
    setSelected(null);
  }

  function handleDateClick(date) {
    const dateIso = dateToIso(date);
    const availability = resolveAvailability(dateIso, experienceId, records, lang);
    setSelected({ date: dateIso, ...availability });
  }

  function chooseFixed(id) {
    setSelectedFixedId(id);
    const fixed = fixedExcursions.find((item) => item.id === id);
    if (fixed) {
      fillForm({
        experienceId: fixed.experience_id,
        requestType: 'fixed',
        fixedExcursionId: fixed.id,
        requestedDate: fixed.date,
        message: buildFixedExcursionMessage({ fixedExcursion: fixed, people: '' }, lang),
        scroll: false
      });
    }
  }

  return (
    <section className="section alt-section" id="availability">
      <div className="container calendar-layout">
        <div className="section-header sticky-note">
          <span className="kicker">{text(lang, 'availabilityKicker')}</span>
          <h2>{text(lang, 'availabilityTitle')}</h2>
          <p>{text(lang, 'availabilityIntro')}</p>
          <div className="mode-toggle" role="tablist" aria-label={text(lang, 'requestMode')}>
            <button type="button" className={mode === 'fixed' ? 'active' : ''} onClick={() => setMode('fixed')}>{text(lang, 'fixedExcursion')}</button>
            <button type="button" className={mode === 'private' ? 'active' : ''} onClick={() => setMode('private')}>{text(lang, 'privateExcursion')}</button>
          </div>
          {mode === 'private' && (
            <div className="legend" aria-label="Calendar legend">
              {['available', 'limited', 'closed', 'on-request'].map((status) => <span key={status}><i className={`dot ${status}`} />{statusLabels[status][lang]}</span>)}
            </div>
          )}
        </div>
        <div className="calendar-card">
          {mode === 'fixed' ? (
            <div className="fixed-excursion-panel">
              <h3>{text(lang, 'fixedExcursions')}</h3>
              {fixedExcursions.length === 0 ? <p>{text(lang, 'noFixedExcursions')}</p> : (
                <div className="fixed-excursion-list">
                  {fixedExcursions.map((item) => {
                    const note = item[`note_${lang}`] || item.note_it || item.note_en || '';
                    return (
                      <button key={item.id} type="button" className={`fixed-excursion-option ${selectedFixedId === item.id ? 'selected' : ''}`} onClick={() => chooseFixed(item.id)}>
                        <span><strong>{fixedExcursionLabel(item, lang)}</strong>{note && <small>{note}</small>}</span>
                        <b>{text(lang, 'placesRemaining')}: {item.places_remaining}/{item.capacity}</b>
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedFixed && (
                <div className="date-result available">
                  <strong>{fixedExcursionLabel(selectedFixed, lang)}</strong>
                  <p>{text(lang, 'placesRemaining')}: {selectedFixed.places_remaining}/{selectedFixed.capacity}</p>
                  <ContactActions
                    lang={lang}
                    compact
                    contextMessage={fixedMessage}
                    experienceId={selectedFixed.experience_id}
                    onUseForm={() => fillForm({ experienceId: selectedFixed.experience_id, requestType: 'fixed', fixedExcursionId: selectedFixed.id, requestedDate: selectedFixed.date, message: fixedMessage, scroll: true })}
                  />
                </div>
              )}
            </div>
          ) : (
            <>
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
                    <button className="button secondary" type="button" onClick={() => fillForm({ experienceId, requestType: 'private', message: selectedMessage, scroll: true })}>{text(lang, 'requestAlternative')}</button>
                  ) : (
                    <ContactActions
                      lang={lang}
                      compact
                      contextMessage={selectedMessage}
                      experienceId={experienceId}
                      onUseForm={() => fillForm({ experienceId, requestType: 'private', requestedDate: selected.date, message: selectedMessage, scroll: true })}
                    />
                  )}
                </div>
              )}
            </>
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
    travelingWith: 'solo',
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
            <ImageSlot src={MEDIA.liveSafe} alt={text(lang, 'liveAlt')} label={lang === 'it' ? 'Etna Live · distanza sicura' : 'Etna Live · safe distance'} lang={lang} ratio="wide" />
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
          <ImageSlot src={MEDIA.landscape} alt={text(lang, 'safetyAlt')} label={lang === 'it' ? 'Paesaggio' : 'Landscape'} lang={lang} />
          <ImageSlot src={MEDIA.lavaRock} alt={text(lang, 'gallery01Alt')} label={lang === 'it' ? 'Roccia lavica' : 'Lava rock'} lang={lang} />
          <ImageSlot src={MEDIA.guide} alt={text(lang, 'gallery02Alt')} label={lang === 'it' ? 'Guida e territorio' : 'Guide and territory'} lang={lang} />
          <ImageSlot src={MEDIA.naturalLight} alt={text(lang, 'gallery03Alt')} label={lang === 'it' ? 'Luce naturale' : 'Natural light'} lang={lang} />
        </div>
      </section>
      <section className="section compact-section" id="reviews">
        <div className="container reviews-panel">
          <div className="section-header">
            <span className="kicker">{text(lang, 'reviewsKicker')}</span>
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
            <img className="team-photo" src={MEDIA.leonardo} alt={lang === 'it' ? 'Leonardo, guida vulcanologica vulcanIQ' : 'Leonardo, vulcanIQ volcanological guide'} loading="lazy" />
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
  const [fixedExcursions, setFixedExcursions] = useState([]);
  const requestType = formState.requestType || 'private';
  const message = formState.message || text(lang, 'defaultMessage');
  const experienceId = formState.experienceId || '';
  const selectedTitle = experienceId ? experienceById(experienceId).title : '';
  const selectedFixed = fixedExcursions.find((item) => item.id === formState.fixedExcursionId) || null;
  const adults = Number.parseInt(formState.adults || '0', 10) || 0;
  const children = Number.parseInt(formState.children || '0', 10) || 0;
  const totalPeople = adults + children;
  const over12 = totalPeople > 12;
  const fullMessage = message;

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
        experience_id: experienceId || selectedFixed?.experience_id || 'unsure',
        requested_date: selectedFixed?.date || formState.requestedDate,
        alternative_date: formState.alternativeDate,
        language: formState.language || lang,
        party_type: formState.partyType || (requestType === 'private' ? 'other' : 'group'),
        request_type: requestType,
        fixed_excursion_id: requestType === 'fixed' ? formState.fixedExcursionId : null,
        adults,
        children,
        children_under_3: Boolean(formState.childrenUnder3),
        private_experience: requestType === 'private',
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
              <select id="contactExperience" value={experienceId} onChange={(event) => update('experienceId', event.target.value)}>
                <option value="">{text(lang, 'selectExperience')}</option>
                {experiences.map((experience) => <option value={experience.id} key={experience.id}>{experience.title}</option>)}
              </select>
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

          <div className="form-two-cols three">
            <div>
              <label className="field-label" htmlFor="contactAdults">{text(lang, 'adults')}</label>
              <input id="contactAdults" type="number" min="0" value={formState.adults || ''} onChange={(event) => update('adults', event.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="contactChildren">{text(lang, 'childrenCount')}</label>
              <input id="contactChildren" type="number" min="0" value={formState.children || ''} onChange={(event) => update('children', event.target.value)} />
            </div>
            <div className="people-summary">
              <strong>{text(lang, 'totalPeople')}</strong>
              <span>{totalPeople}</span>
            </div>
          </div>

          <div className="checkbox-stack inline-checkboxes">
            <label><input type="checkbox" checked={Boolean(formState.childrenUnder3)} onChange={(event) => update('childrenUnder3', event.target.checked)} /> {text(lang, 'childrenUnder3')}</label>
          </div>
          {over12 && <p className="form-status warning" role="status">{text(lang, 'contactGuideOver12')}</p>}

          <label className="field-label" htmlFor="contactMessage">{text(lang, 'message')}</label>
          <textarea id="contactMessage" value={message} onChange={(event) => update('message', event.target.value)} />
          {selectedTitle && <p className="small-note">{text(lang, 'selectedExperience')}: {selectedTitle}</p>}
          {selectedFixed && <p className="small-note">{text(lang, 'fixedExcursion')}: {fixedExcursionLabel(selectedFixed, lang)}</p>}
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
          <button type="button" className={normalizedPath.includes('/requests') ? 'active' : ''} onClick={() => navigate('/admin/requests')}>{adminCopy(lang, 'Richieste', 'Requests')}</button>
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
        <div><dt>{adminCopy(lang, 'Tipo', 'Type')}</dt><dd>{request.request_type === 'fixed' ? adminCopy(lang, 'Escursione fissa', 'Fixed excursion') : adminCopy(lang, 'Escursione privata', 'Private excursion')}</dd></div>
        <div><dt>{adminCopy(lang, 'Fonte', 'Source')}</dt><dd>{request.source || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Contatto', 'Contact')}</dt><dd>{request.preferred_contact || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Esperienza', 'Experience')}</dt><dd>{adminExperienceLabel(request.experience_id, lang)}</dd></div>
        <div><dt>{adminCopy(lang, 'Data richiesta', 'Requested date')}</dt><dd>{formatDateForMessage(request.requested_date, lang) || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Alternativa', 'Alternative')}</dt><dd>{formatDateForMessage(request.alternative_date, lang) || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Lingua', 'Language')}</dt><dd>{request.language || 'it'}</dd></div>
        <div><dt>{adminCopy(lang, 'Gruppo', 'Party')}</dt><dd>{[request.adults ? `${request.adults} adulti/adults` : '', request.children ? `${request.children} bambini/children` : ''].filter(Boolean).join(' · ') || request.party_type || '-'}</dd></div>
        <div><dt>{adminCopy(lang, 'Totale', 'Total')}</dt><dd>{Number(request.adults || 0) + Number(request.children || 0) || '-'}</dd></div>
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
  const [tab, setTab] = useState('blocks');
  const [blocks, setBlocks] = useState([]);
  const [fixedExcursions, setFixedExcursions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [form, setForm] = useState({ date: '', experience_id: '', status: 'closed', reason_it: '', reason_en: '', internal_note: '' });
  const [fixedForm, setFixedForm] = useState({ date: '', start_time: '', experience_id: 'etna-live', capacity: '12', note_it: '', note_en: '', active: true });

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [blockData, fixedData] = await Promise.all([
        listAvailabilityBlocks({ activeOnly: false }),
        listFixedExcursions({ activeOnly: false })
      ]);
      setBlocks(blockData);
      setFixedExcursions(fixedData);
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
    try {
      await createFixedExcursion({ ...fixedForm, created_by: session.user.id, updated_by: session.user.id });
      setFixedForm({ date: '', start_time: '', experience_id: 'etna-live', capacity: '12', note_it: '', note_en: '', active: true });
      setFeedback(adminCopy(lang, 'Escursione fissa creata.', 'Fixed excursion created.'));
      refresh();
    } catch (err) {
      setError(err?.message || adminCopy(lang, 'Escursione fissa non salvata.', 'Fixed excursion not saved.'));
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
                {blocks.map((block) => <AvailabilityBlockCard key={block.id} block={block} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
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
              <AdminInput label={adminCopy(lang, 'Ora inizio opzionale', 'Optional start time')} type="time" value={fixedForm.start_time} onChange={(value) => updateFixed('start_time', value)} />
              <AdminSelect label={adminCopy(lang, 'Esperienza', 'Experience')} value={fixedForm.experience_id} onChange={(value) => updateFixed('experience_id', value)} options={['etna-premium', 'etna-learning', 'etna-live', 'etna-stories']} formatter={(value) => adminExperienceLabel(value, lang)} />
              <AdminInput label={adminCopy(lang, 'Capienza', 'Capacity')} type="number" value={fixedForm.capacity} onChange={(value) => updateFixed('capacity', value)} />
              <AdminInput label="Note IT" value={fixedForm.note_it} onChange={(value) => updateFixed('note_it', value)} />
              <AdminInput label="Note EN" value={fixedForm.note_en} onChange={(value) => updateFixed('note_en', value)} />
              <label className="check-field"><input type="checkbox" checked={fixedForm.active} onChange={(event) => updateFixed('active', event.target.checked)} /> {adminCopy(lang, 'Attiva', 'Active')}</label>
              <div className="modal-actions full"><button className="button primary" type="submit">{adminCopy(lang, 'Salva escursione fissa', 'Save fixed excursion')}</button></div>
            </form>
          </section>
          <section className="admin-panel">
            <div className="admin-panel-header"><h2>{adminCopy(lang, 'Escursioni fisse', 'Fixed excursions')}</h2><button type="button" onClick={refresh}>{adminCopy(lang, 'Aggiorna', 'Refresh')}</button></div>
            {loading ? <p>{adminCopy(lang, 'Caricamento...', 'Loading...')}</p> : fixedExcursions.length === 0 ? <p>{adminCopy(lang, 'Nessuna escursione fissa salvata.', 'No fixed excursions saved.')}</p> : (
              <div className="availability-block-list">
                {fixedExcursions.map((item) => <FixedExcursionCard key={item.id} item={item} lang={lang} userId={session.user.id} onChanged={(message) => { setFeedback(message); refresh(); }} />)}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function FixedExcursionCard({ item, lang, userId, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    date: item.date,
    start_time: item.start_time || '',
    experience_id: item.experience_id,
    capacity: String(item.capacity || 12),
    note_it: item.note_it || '',
    note_en: item.note_en || '',
    active: item.active !== false
  });
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try {
      await updateFixedExcursion(item.id, { ...form, updated_by: userId });
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
          <AdminInput label={adminCopy(lang, 'Ora inizio opzionale', 'Optional start time')} type="time" value={form.start_time} onChange={(value) => setForm((current) => ({ ...current, start_time: value }))} />
          <AdminSelect label={adminCopy(lang, 'Esperienza', 'Experience')} value={form.experience_id} onChange={(value) => setForm((current) => ({ ...current, experience_id: value }))} options={['etna-premium', 'etna-learning', 'etna-live', 'etna-stories']} formatter={(value) => adminExperienceLabel(value, lang)} />
          <AdminInput label={adminCopy(lang, 'Capienza', 'Capacity')} type="number" value={form.capacity} onChange={(value) => setForm((current) => ({ ...current, capacity: value }))} />
          <AdminInput label="Note IT" value={form.note_it} onChange={(value) => setForm((current) => ({ ...current, note_it: value }))} />
          <AdminInput label="Note EN" value={form.note_en} onChange={(value) => setForm((current) => ({ ...current, note_en: value }))} />
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
          {(item.note_it || item.note_en) && <p>{lang === 'it' ? item.note_it || item.note_en : item.note_en || item.note_it}</p>}
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
  const [formState, setFormState] = useState({ language: 'it', requestType: 'private', partyType: 'solo', adults: '1', children: '0', message: i18n.it.defaultMessage });
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

  function fillForm({ experienceId, message, requestType, fixedExcursionId, requestedDate, scroll = false }) {
    setFormState((current) => ({
      ...current,
      experienceId: experienceId || current.experienceId,
      requestType: requestType || current.requestType || 'private',
      fixedExcursionId: fixedExcursionId !== undefined ? fixedExcursionId : current.fixedExcursionId,
      requestedDate: requestedDate || current.requestedDate,
      privateExperience: requestType ? requestType === 'private' : current.privateExperience,
      message: message || current.message,
      language: lang
    }));
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
