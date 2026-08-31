import { listBookingRequests } from './bookingRequests.js';
import { listGiftCardRequests } from './giftCards.js';
import { listFinanceEntries } from './financeService.js';
import { listFixedExcursions } from './availabilityService.js';
import { getAdminAnalyticsSummary } from './analyticsService.js';
import { getNotificationHealth, listNotificationCampaigns } from './notificationService.js';
import { buildNeoAnswer, matchNeoIntent } from '../features/neo/neoEngine.js';

const LOADERS = {
  bookingRequests: () => listBookingRequests({}), giftCards: () => listGiftCardRequests({ limit: 250 }),
  financeEntries: () => listFinanceEntries({ limit: 500 }), fixedExcursions: () => listFixedExcursions({ activeOnly: true, fromDate: new Date().toISOString().slice(0, 10) }),
  analytics: () => getAdminAnalyticsSummary({}), notificationHealth: () => getNotificationHealth(), campaigns: () => listNotificationCampaigns().then((result) => result.items || [])
};

const INTENT_DOMAINS = {
  today_attention: ['bookingRequests', 'giftCards', 'notificationHealth', 'campaigns'], booking_requests: ['bookingRequests'],
  upcoming_experiences: ['fixedExcursions', 'bookingRequests'], gift_card_status: ['giftCards'], finance_summary: ['financeEntries'],
  notification_health: ['notificationHealth', 'campaigns'], scheduled_notifications: ['notificationHealth', 'campaigns'],
  kpi_summary: ['analytics'], marketing_opportunities: ['bookingRequests', 'giftCards', 'analytics', 'notificationHealth'], help_navigation: [], unknown: []
};

export async function askNeo(question) {
  const matched = matchNeoIntent(question);
  const domains = INTENT_DOMAINS[matched.intent] || [];
  const settled = await Promise.allSettled(domains.map((name) => LOADERS[name]()));
  const data = {}; const unavailable = [];
  settled.forEach((result, index) => { const name = domains[index]; if (result.status === 'fulfilled') data[name] = result.value; else unavailable.push(name); });
  return buildNeoAnswer({ question, ...matched, data, unavailable });
}
