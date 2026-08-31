import { calculateLedgerSummary } from '../../domain/financeModel.js';
import { buildMarketingRecommendations } from '../marketing/marketingIntelligence.js';

const INTENT_TERMS = [
  ['scheduled_notifications', ['scheduled notification', 'scheduled campaign', 'schedule']],
  ['notification_health', ['notification', 'notifications', 'push', 'failed', 'failure', 'dead subscription']],
  ['gift_card_status', ['gift card', 'gift cards', 'voucher']],
  ['finance_summary', ['finance', 'revenue', 'income', 'expense', 'payment', 'refund']],
  ['upcoming_experiences', ['upcoming', 'excursion', 'excursions', 'tomorrow', 'experience']],
  ['booking_requests', ['booking', 'bookings', 'request', 'requests', 'pending']],
  ['marketing_opportunities', ['marketing', 'opportunity', 'promotion', 'campaign idea']],
  ['kpi_summary', ['kpi', 'metrics', 'performance', 'month', 'conversion']],
  ['help_navigation', ['where', 'how do i', 'manage', 'find', 'password', 'install']],
  ['today_attention', ['today', 'attention', 'urgent', 'prepare', 'needs action']]
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

export function selectPendingBookingRequests(data = {}) {
  const rows = data.bookingRequests || [];
  const pending = count(rows, (item) => item.status === 'pending');
  const followUps = count(rows, (item) => item.next_follow_up_at && !['completed', 'cancelled', 'declined'].includes(item.status));
  return { pending, followUps, cards: [card('booking', 'Pending requests', pending, `${followUps} active requests have a follow-up date.`, '/admin/requests')] };
}

export function selectUpcomingExperiences(data = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const excursions = (data.fixedExcursions || []).filter((item) => item.active !== false && item.date >= today);
  const accepted = count(data.bookingRequests || [], (item) => item.status === 'accepted' && item.requested_date >= today);
  return { cards: [card('experience', 'Upcoming excursions', excursions.length, `${accepted} accepted future booking requests.`, '/admin/upcoming')] };
}

export function selectGiftCardIssues(data = {}) {
  const rows = data.giftCards || [];
  const open = count(rows, (item) => ['new', 'contacted', 'quoted'].includes(item.status));
  const paidNotIssued = count(rows, (item) => item.status === 'paid');
  return { cards: [card('gift-card', 'Gift Cards requiring follow-up', open + paidNotIssued, `${open} open leads; ${paidNotIssued} paid and not yet issued.`, '/admin/gift-cards')] };
}

export function selectFinanceSummary(data = {}) {
  const ledger = calculateLedgerSummary(data.financeEntries || []);
  const cards = ledger.byCurrency.map((row) => card('finance', `Finance ${row.currency}`, row.net.toFixed(2), `Recognized income ${row.income.toFixed(2)} · expenses ${row.expenses.toFixed(2)} · expected ${row.expectedIncome.toFixed(2)}`, '/admin/finance'));
  return { cards: cards.length ? cards : [card('finance', 'Finance', 'No entries', 'No authorized Finance entries were returned.', '/admin/finance')] };
}

export function selectNotificationHealth(data = {}) {
  const health = data.notificationHealth || {};
  const campaigns = data.campaigns || [];
  const failed = Number(health.counters?.push_failed || 0);
  const scheduled = count(campaigns, (item) => item.status === 'scheduled');
  return { cards: [card('notification', 'Notification health', health.budget?.mode || 'Unavailable', `${failed} push failures today · ${scheduled} scheduled campaigns.`, '/admin/notifications')] };
}

export function selectKpiSummary(data = {}) {
  const summary = data.analytics?.summary || data.analytics || {};
  return { cards: [
    card('kpi', 'Approximate visitors', Number(summary.approx_unique_visitors || 0), 'Canonical reporting summary.', '/admin/analytics'),
    card('kpi', 'Booking requests', Number(summary.booking_requests_total || 0), 'Compatible database requests in the selected reporting baseline.', '/admin/analytics')
  ] };
}

export function selectMarketingOpportunities(data = {}) {
  const recommendations = buildMarketingRecommendations(data);
  return { cards: recommendations.map((item) => card('marketing', item.finding, item.action, `Evidence: ${item.evidence} Guardrail: ${item.guardrail}`, item.route)), recommendations };
}

export function selectTodayAttention(data = {}) {
  const booking = selectPendingBookingRequests(data).cards[0];
  const gift = selectGiftCardIssues(data).cards[0];
  const notifications = selectNotificationHealth(data).cards[0];
  return { cards: [booking, gift, notifications] };
}

export function selectNavigationHelp(question = '') {
  const q = normalizeNeoQuestion(question);
  const options = [
    ['gift', 'Gift Cards', '/admin/gift-cards'], ['finance', 'Finance', '/admin/finance'], ['password', 'Account settings', '/admin/account'],
    ['notification', 'Notifications', '/admin/notifications'], ['install', 'Install vulcanIQ Admin', '/admin/notifications'], ['analytics', 'Analytics', '/admin/analytics']
  ];
  const match = options.find(([term]) => q.includes(term)) || options[3];
  return { cards: [card('help', match[1], match[2], 'Open the existing authorized Admin screen.', match[2])] };
}

export function buildNeoAnswer({ question, intent, confidence, data = {}, unavailable = [] }) {
  let selection;
  if (intent === 'booking_requests') selection = selectPendingBookingRequests(data);
  else if (intent === 'upcoming_experiences') selection = selectUpcomingExperiences(data);
  else if (intent === 'gift_card_status') selection = selectGiftCardIssues(data);
  else if (intent === 'finance_summary') selection = selectFinanceSummary(data);
  else if (intent === 'notification_health' || intent === 'scheduled_notifications') selection = selectNotificationHealth(data);
  else if (intent === 'kpi_summary') selection = selectKpiSummary(data);
  else if (intent === 'marketing_opportunities') selection = selectMarketingOpportunities(data);
  else if (intent === 'help_navigation') selection = selectNavigationHelp(question);
  else if (intent === 'today_attention') selection = selectTodayAttention(data);
  else selection = { cards: [] };

  const cards = selection.cards || [];
  const noMatch = intent === 'unknown';
  const summary = noMatch
    ? "I'm not sure which area you mean. Try bookings, Gift Cards, Finance, notifications, KPIs or marketing."
    : cards.length
      ? 'Here is the current read-only view from authorized vulcanIQ data.'
      : 'No matching items were found for your current Admin permissions.';
  return {
    id: crypto.randomUUID?.() || `neo-${Date.now()}`,
    question: String(question).slice(0, 500), intent, confidence,
    title: noMatch ? 'Ask Neo' : intent.replaceAll('_', ' '), summary, cards,
    actions: [...new Map(cards.filter((item) => item.route).map((item) => [item.route, { label: `Open ${item.title}`, route: item.route }])).values()],
    sourceTrail: Object.keys(data).map((key) => source(key, 'loaded', cards.find((item) => item.route)?.route || '/admin'))
      .concat(unavailable.map((key) => source(key, 'unavailable', '/admin'))),
    recommendations: selection.recommendations || [], createdAt: new Date().toISOString()
  };
}
