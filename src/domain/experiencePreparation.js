const DEFAULT_PROFILE_KEY = 'standard-etna';

const PROFILES = Object.freeze({
  'etna-premium': Object.freeze({
    label: { it: 'Percorso privato e personalizzato', en: 'Private tailored route' },
    notification: {
      it: 'Controlla i dettagli concordati e prepara calzature chiuse, strati adattabili e acqua. Apri vulcanIQ per la guida completa.',
      en: 'Check the agreed details and prepare closed shoes, adaptable layers and water. Open vulcanIQ for the full guidance.'
    },
    wear: {
      it: ['Calzature chiuse con buona aderenza.', 'Strati adattabili al percorso concordato.', 'Uno strato esterno antivento o resistente alla pioggia.'],
      en: ['Closed footwear with good grip.', 'Layers you can adapt to the agreed route.', 'A wind-resistant or water-resistant outer layer.']
    },
    bring: {
      it: ['Acqua e protezione solare.', 'Solo l’attrezzatura specifica concordata con la guida.'],
      en: ['Water and sun protection.', 'Only the route-specific equipment agreed with your guide.']
    },
    notes: {
      it: ['Le indicazioni confermate per il tuo itinerario prevalgono su questa guida generale.', 'Quota e percorso vengono definiti dopo la valutazione del gruppo.'],
      en: ['Confirmed instructions for your itinerary take priority over this general guidance.', 'Altitude and route are defined after the group assessment.']
    }
  }),
  'etna-learning': Object.freeze({
    label: { it: 'Esperienza educativa e di gruppo', en: 'Educational group experience' },
    notification: {
      it: 'Prepara calzature comode e chiuse, abbigliamento a strati, acqua e protezione solare. Apri vulcanIQ per la guida completa.',
      en: 'Prepare comfortable closed shoes, layered clothing, water and sun protection. Open vulcanIQ for the full guidance.'
    },
    wear: {
      it: ['Calzature comode e chiuse adatte a camminare.', 'Abbigliamento a strati facile da adattare.', 'Uno strato esterno leggero e protettivo.'],
      en: ['Comfortable closed shoes suitable for walking.', 'Easy-to-adjust layered clothing.', 'A light protective outer layer.']
    },
    bring: {
      it: ['Acqua e protezione solare per ogni partecipante.', 'Eventuali necessità personali già concordate per bambini o mobilità.'],
      en: ['Water and sun protection for each participant.', 'Any personal needs already agreed for children or mobility.']
    },
    notes: {
      it: ['Il percorso viene scelto in base a età, mobilità e condizioni operative.', 'Controlla sempre i dettagli finali dell’incontro.'],
      en: ['The route is selected for age, mobility and operating conditions.', 'Always check the final meeting details.']
    }
  }),
  'etna-live': Object.freeze({
    label: { it: 'Osservazione vulcanica flessibile', en: 'Flexible volcano observation' },
    notification: {
      it: 'Prepara calzature chiuse con aderenza, strati e uno strato antivento, acqua e protezione solare. Apri vulcanIQ per i dettagli.',
      en: 'Prepare closed grippy shoes, layers and a wind-resistant outer layer, water and sun protection. Open vulcanIQ for details.'
    },
    wear: {
      it: ['Calzature chiuse con buona aderenza.', 'Abbigliamento a strati.', 'Uno strato esterno antivento o resistente alla pioggia.'],
      en: ['Closed footwear with good grip.', 'Layered clothing.', 'A wind-resistant or water-resistant outer layer.']
    },
    bring: {
      it: ['Acqua e protezione solare.', 'Un piccolo spazio nello zaino per adattare gli strati durante l’attività.'],
      en: ['Water and sun protection.', 'Room in a small backpack to adjust layers during the activity.']
    },
    notes: {
      it: ['L’itinerario può cambiare fino all’ultimo per mantenere un’osservazione responsabile.', 'Controlla i dettagli aggiornati dell’incontro prima di partire.'],
      en: ['The route may change at short notice to keep observation responsible.', 'Check the latest meeting details before leaving.']
    }
  }),
  'etna-stories': Object.freeze({
    label: { it: 'Paesaggio e cultura locale', en: 'Landscape and local culture' },
    notification: {
      it: 'Prepara calzature comode e chiuse, strati leggeri, acqua e protezione solare. Apri vulcanIQ per la guida completa.',
      en: 'Prepare comfortable closed shoes, light layers, water and sun protection. Open vulcanIQ for the full guidance.'
    },
    wear: {
      it: ['Calzature comode e chiuse adatte a percorsi misti.', 'Strati leggeri e adattabili.', 'Uno strato esterno protettivo.'],
      en: ['Comfortable closed shoes suitable for mixed walking.', 'Light, adaptable layers.', 'A protective outer layer.']
    },
    bring: {
      it: ['Acqua e protezione solare.', 'Solo quanto indicato nei dettagli confermati per eventuali soste o attività locali.'],
      en: ['Water and sun protection.', 'Only what is specified in the confirmed details for any local stops or activities.']
    },
    notes: {
      it: ['Ritmo e percorso vengono adattati al gruppo e al contesto.', 'Controlla i dettagli finali dell’incontro.'],
      en: ['Pace and route are adapted to the group and setting.', 'Check the final meeting details.']
    }
  }),
  [DEFAULT_PROFILE_KEY]: Object.freeze({
    label: { it: 'Preparazione Etna essenziale', en: 'Essential Etna preparation' },
    notification: {
      it: 'Controlla i dettagli dell’incontro e prepara calzature chiuse, abbigliamento a strati e acqua. Apri vulcanIQ per i dettagli.',
      en: 'Check the meeting details and prepare closed shoes, layered clothing and water. Open vulcanIQ for details.'
    },
    wear: {
      it: ['Calzature chiuse adatte a camminare.', 'Abbigliamento a strati.', 'Uno strato esterno protettivo.'],
      en: ['Closed shoes suitable for walking.', 'Layered clothing.', 'A protective outer layer.']
    },
    bring: {
      it: ['Acqua e protezione solare.', 'Quanto indicato nei dettagli confermati dalla guida.'],
      en: ['Water and sun protection.', 'Anything specified in the confirmed guidance.']
    },
    notes: {
      it: ['Questa è una guida stabile, non una previsione meteo.', 'Le indicazioni confermate per il percorso prevalgono.'],
      en: ['This is stable guidance, not a weather forecast.', 'Confirmed route guidance takes priority.']
    }
  })
});

export function preparationProfileKey(experienceId) {
  const key = String(experienceId || '').trim();
  return Object.prototype.hasOwnProperty.call(PROFILES, key) ? key : DEFAULT_PROFILE_KEY;
}

export function preparationProfileFromKey(value, lang = 'it') {
  const key = String(value || '').trim();
  if (!Object.prototype.hasOwnProperty.call(PROFILES, key)) return null;
  const locale = lang === 'en' ? 'en' : 'it';
  const profile = PROFILES[key];
  return {
    key,
    label: profile.label[locale],
    wear: profile.wear[locale],
    bring: profile.bring[locale],
    notes: profile.notes[locale]
  };
}

export function preparationDestination(experienceId) {
  return `/install?preparation=${encodeURIComponent(preparationProfileKey(experienceId))}`;
}

export function preparationReminder(experienceId) {
  const key = preparationProfileKey(experienceId);
  const profile = PROFILES[key];
  return {
    ruleKey: 'customer_upcoming_reminder',
    category: 'customer_upcoming_reminder',
    titleIt: 'Prepara la tua esperienza vulcanIQ',
    bodyIt: profile.notification.it,
    titleEn: 'Prepare for your vulcanIQ experience',
    bodyEn: profile.notification.en,
    destinationUrl: preparationDestination(key)
  };
}

export { DEFAULT_PROFILE_KEY };
