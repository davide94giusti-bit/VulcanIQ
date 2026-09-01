import { calculateLedgerSummary } from '../../domain/financeModel.js';
import { buildMarketingRecommendations } from '../marketing/marketingIntelligence.js';

const INTENT_TERMS = [
  ['scheduled_notifications', ['scheduled notification', 'scheduled campaign', 'schedule', 'notifiche programmate', 'promemoria automatici', 'notifiche automatiche']],
  ['notification_health', ['notification', 'notifications', 'push', 'failed', 'failure', 'dead subscription', 'notifiche', 'errori notifiche', 'notifiche in errore']],
  ['gift_card_status', ['gift card', 'gift cards', 'voucher', 'buono regalo']],
  ['finance_summary', ['finance', 'revenue', 'income', 'expense', 'payment', 'refund', 'finanziaria', 'finanze', 'entrate', 'uscite', 'pagamenti', 'rimborsi']],
  ['upcoming_experiences', ['upcoming', 'excursion', 'excursions', 'tomorrow', 'experience', 'prossime prenotazioni', 'prossime escursioni', 'esperienze']],
  ['booking_requests', ['booking', 'bookings', 'request', 'requests', 'pending', 'prenotazione', 'prenotazioni', 'richieste', 'in attesa']],
  ['marketing_opportunities', ['marketing', 'opportunity', 'promotion', 'campaign idea', 'promozione', 'campagna']],
  ['kpi_summary', ['kpi', 'metrics', 'performance', 'month', 'conversion', 'metriche', 'prestazioni', 'mese', 'conversione']],
  ['help_navigation', ['where', 'how do i', 'manage', 'find', 'password', 'install', 'dove', 'come posso', 'gestire', 'trova', 'installa']],
  ['today_attention', ['today', 'attention', 'urgent', 'prepare', 'needs action', 'oggi', 'attenzione', 'urgente', 'cosa devo sapere']]
];

export function normalizeNeoQuestion(value = '') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9à-ÿ\s-]/g, ' ').replace(/\s+/g, ' ').slice(0, 500);
}

export function matchNeoIntent(question = '') {
  const normalized = normalizeNeoQuestion(question);
  for (const [intent, terms] of INTENT_TERMS) {
    const matches = terms.filter((term) => normalized.includes(term)).length;
    if (matches) return { intent, confidence: matches > 1 ? 'high' : 'medium' };
  }
  return { intent: 'unknown', confidence: 'low' };
}

export function calculateEruptionDuration(question = '', { domains = 0, cards = 0 } = {}) {
  const questionWeight = Math.min(normalizeNeoQuestion(question).length, 500) * 12;
  return Math.max(10000, Math.min(20000, 10000 + questionWeight + Math.min(domains, 6) * 450 + Math.min(cards, 8) * 150));
}

function source(label, state, route) { return { label, state, route }; }
function card(type, title, value, detail, route) { return { type, title, value, detail, route }; }
function count(rows, predicate) { return (rows || []).filter(predicate).length; }
function c(locale, it, en) { return locale === 'it' ? it : en; }
function sourceLabel(key, locale) {
  const labels = { bookingRequests:['Richieste di prenotazione','Booking requests'],giftCards:['Gift Card','Gift Cards'],financeEntries:['Voci Finance','Finance entries'],fixedExcursions:['Escursioni fisse','Fixed excursions'],analytics:['Analytics','Analytics'],notificationHealth:['Salute notifiche','Notification health'],campaigns:['Campagne','Campaigns'] };
  const pair = labels[key] || [key, key]; return c(locale, pair[0], pair[1]);
}

export function selectPendingBookingRequests(data = {}, locale = 'en') {
  const rows = data.bookingRequests || [];
  const pending = count(rows, (item) => item.status === 'pending');
  const followUps = count(rows, (item) => item.next_follow_up_at && !['completed', 'cancelled', 'declined'].includes(item.status));
  return { pending, followUps, cards: [card('booking', c(locale, 'Richieste in attesa', 'Pending requests'), pending, c(locale, `${followUps} richieste attive hanno una data di ricontatto.`, `${followUps} active requests have a follow-up date.`), '/admin/requests')] };
}

export function selectUpcomingExperiences(data = {}, locale = 'en') {
  const today = new Date().toISOString().slice(0, 10);
  const excursions = (data.fixedExcursions || []).filter((item) => item.active !== false && item.date >= today);
  const accepted = count(data.bookingRequests || [], (item) => item.status === 'accepted' && item.requested_date >= today);
  return { cards: [card('experience', c(locale, 'Prossime escursioni', 'Upcoming excursions'), excursions.length, c(locale, `${accepted} richieste future accettate.`, `${accepted} accepted future booking requests.`), '/admin/upcoming')] };
}

export function selectGiftCardIssues(data = {}, locale = 'en') {
  const rows = data.giftCards || [];
  const open = count(rows, (item) => ['new', 'contacted', 'quoted'].includes(item.status));
  const paidNotIssued = count(rows, (item) => item.status === 'paid');
  return { cards: [card('gift-card', c(locale, 'Gift Card da seguire', 'Gift Cards requiring follow-up'), open + paidNotIssued, c(locale, `${open} richieste aperte; ${paidNotIssued} pagate e non ancora emesse.`, `${open} open leads; ${paidNotIssued} paid and not yet issued.`), '/admin/gift-cards')] };
}

export function selectFinanceSummary(data = {}, locale = 'en') {
  const ledger = calculateLedgerSummary(data.financeEntries || []);
  const cards = ledger.byCurrency.map((row) => card('finance', `Finance ${row.currency}`, row.net.toFixed(2), c(locale, `Entrate riconosciute ${row.income.toFixed(2)} · uscite ${row.expenses.toFixed(2)} · attese ${row.expectedIncome.toFixed(2)}`, `Recognized income ${row.income.toFixed(2)} · expenses ${row.expenses.toFixed(2)} · expected ${row.expectedIncome.toFixed(2)}`), '/admin/finance'));
  return { cards: cards.length ? cards : [card('finance', 'Finance', c(locale, 'Nessuna voce', 'No entries'), c(locale, 'Non sono state restituite voci Finance autorizzate.', 'No authorized Finance entries were returned.'), '/admin/finance')] };
}

export function selectNotificationHealth(data = {}, locale = 'en') {
  const health = data.notificationHealth || {};
  const campaigns = data.campaigns || [];
  const failed = Number(health.counters?.push_failed || 0);
  const scheduled = count(campaigns, (item) => item.status === 'scheduled');
  return { cards: [card('notification', c(locale, 'Salute notifiche', 'Notification health'), health.budget?.mode || c(locale, 'Non disponibile', 'Unavailable'), c(locale, `${failed} errori push oggi · ${scheduled} campagne programmate.`, `${failed} push failures today · ${scheduled} scheduled campaigns.`), '/admin/notifications')] };
}

export function selectScheduledNotifications(data = {}, locale = 'en') {
  const campaigns = data.campaigns || [];
  const scheduled = campaigns.filter((item) => item.status === 'scheduled');
  const failed = campaigns.filter((item) => item.status === 'failed');
  return { cards: [card('notification', c(locale, 'Notifiche programmate', 'Scheduled notifications'), scheduled.length, c(locale, `${failed.length} campagne recenti in errore.`, `${failed.length} recent campaigns failed.`), '/admin/notifications')] };
}

export function selectKpiSummary(data = {}, locale = 'en') {
  const summary = data.analytics?.summary || data.analytics || {};
  return { cards: [
    card('kpi', c(locale, 'Visitatori approssimativi', 'Approximate visitors'), Number(summary.approx_unique_visitors || 0), c(locale, 'Riepilogo di reporting canonico.', 'Canonical reporting summary.'), '/admin/analytics'),
    card('kpi', c(locale, 'Richieste di prenotazione', 'Booking requests'), Number(summary.booking_requests_total || 0), c(locale, 'Richieste compatibili nel periodo di reporting selezionato.', 'Compatible database requests in the selected reporting baseline.'), '/admin/analytics')
  ] };
}

export function selectMarketingOpportunities(data = {}, locale = 'en') {
  const recommendations = buildMarketingRecommendations(data);
  const italian = {
    'pending-booking-follow-up': ['Richieste di prenotazione da seguire', 'Esamina e rispondi alle richieste in attesa prima di valutare una campagna ampia.'],
    'gift-card-follow-up': ['Gift Card da seguire', 'Esamina la pipeline Gift Card e prepara un ricontatto individuale quando opportuno.'],
    'traffic-without-requests': ['Traffico senza richieste compatibili', 'Esamina funnel e problemi di validazione prima di aumentare la spesa per il traffico.'],
    'notification-pressure': ['Pressione sul sistema notifiche', 'Sospendi nuove promozioni ed esamina la salute delle notifiche.'],
    'insufficient-data': ['Dati insufficienti per una raccomandazione specifica', 'Riesamina Analytics e le pipeline quando saranno disponibili più dati compatibili.']
  };
  return { cards: recommendations.map((item) => {
    const copy = italian[item.id];
    return card('marketing', locale === 'it' ? copy?.[0] || 'Opportunità marketing' : item.finding, locale === 'it' ? copy?.[1] || 'Esamina i dati disponibili.' : item.action, locale === 'it' ? 'Raccomandazione di sola lettura basata sui dati autorizzati disponibili.' : `Evidence: ${item.evidence} Guardrail: ${item.guardrail}`, item.route);
  }), recommendations };
}

export function selectTodayAttention(data = {}, locale = 'en') {
  const booking = selectPendingBookingRequests(data, locale).cards[0];
  const gift = selectGiftCardIssues(data, locale).cards[0];
  const notifications = selectNotificationHealth(data, locale).cards[0];
  return { cards: [booking, gift, notifications] };
}

export function selectNavigationHelp(question = '', locale = 'en') {
  const q = normalizeNeoQuestion(question);
  const options = [
    ['gift', 'Gift Cards', '/admin/gift-cards'], ['finance', 'Finance', '/admin/finance'], ['password', c(locale, 'Impostazioni account', 'Account settings'), '/admin/account'],
    ['notification', c(locale, 'Notifiche', 'Notifications'), '/admin/notifications'], ['install', c(locale, 'Installa vulcanIQ Admin', 'Install vulcanIQ Admin'), '/admin/notifications'], ['analytics', 'Analytics', '/admin/analytics']
  ];
  const match = options.find(([term]) => q.includes(term)) || options[3];
  return { cards: [card('help', match[1], match[2], c(locale, 'Apri la schermata Admin autorizzata esistente.', 'Open the existing authorized Admin screen.'), match[2])] };
}

export function buildNeoAnswer({ question, intent, confidence, data = {}, unavailable = [], locale = 'en' }) {
  let selection;
  if (intent === 'booking_requests') selection = selectPendingBookingRequests(data, locale);
  else if (intent === 'upcoming_experiences') selection = selectUpcomingExperiences(data, locale);
  else if (intent === 'gift_card_status') selection = selectGiftCardIssues(data, locale);
  else if (intent === 'finance_summary') selection = selectFinanceSummary(data, locale);
  else if (intent === 'notification_health') selection = selectNotificationHealth(data, locale);
  else if (intent === 'scheduled_notifications') selection = selectScheduledNotifications(data, locale);
  else if (intent === 'kpi_summary') selection = selectKpiSummary(data, locale);
  else if (intent === 'marketing_opportunities') selection = selectMarketingOpportunities(data, locale);
  else if (intent === 'help_navigation') selection = selectNavigationHelp(question, locale);
  else if (intent === 'today_attention') selection = selectTodayAttention(data, locale);
  else selection = { cards: [] };

  const cards = selection.cards || [];
  const noMatch = intent === 'unknown';
  const summary = noMatch
    ? c(locale, 'Non sono sicuro dell’area a cui ti riferisci. Prova prenotazioni, Gift Card, Finance, notifiche, KPI o marketing.', "I'm not sure which area you mean. Try bookings, Gift Cards, Finance, notifications, KPIs or marketing.")
    : cards.length
      ? c(locale, 'Ecco la vista corrente in sola lettura dai dati vulcanIQ autorizzati.', 'Here is the current read-only view from authorized vulcanIQ data.')
      : c(locale, 'Non sono stati trovati elementi corrispondenti per i tuoi permessi Admin.', 'No matching items were found for your current Admin permissions.');
  const intentTitles = {
    booking_requests: ['Richieste di prenotazione', 'Booking requests'], upcoming_experiences: ['Prossime esperienze', 'Upcoming experiences'],
    gift_card_status: ['Stato Gift Card', 'Gift Card status'], finance_summary: ['Situazione finanziaria', 'Finance summary'],
    notification_health: ['Salute notifiche', 'Notification health'], scheduled_notifications: ['Notifiche programmate', 'Scheduled notifications'],
    kpi_summary: ['Riepilogo KPI', 'KPI summary'], marketing_opportunities: ['Opportunità marketing', 'Marketing opportunities'],
    help_navigation: ['Aiuto navigazione', 'Navigation help'], today_attention: ['Da sapere oggi', 'Today’s attention']
  };
  return {
    id: crypto.randomUUID?.() || `neo-${Date.now()}`,
    question: String(question).slice(0, 500), intent, confidence,
    title: noMatch ? 'Ask Neo' : c(locale, ...(intentTitles[intent] || [intent.replaceAll('_', ' '), intent.replaceAll('_', ' ')])), summary, cards,
    actions: [...new Map(cards.filter((item) => item.route).map((item) => [item.route, { label: c(locale, `Apri ${item.title}`, `Open ${item.title}`), route: item.route }])).values()],
    sourceTrail: Object.keys(data).map((key) => source(sourceLabel(key, locale), c(locale, 'caricata', 'loaded'), cards.find((item) => item.route)?.route || '/admin'))
      .concat(unavailable.map((key) => source(sourceLabel(key, locale), c(locale, 'non disponibile', 'unavailable'), '/admin'))),
    recommendations: selection.recommendations || [], createdAt: new Date().toISOString()
  };
}
