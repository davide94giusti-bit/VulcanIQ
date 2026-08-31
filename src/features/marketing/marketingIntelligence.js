function recommendation(id, finding, evidence, interpretation, action, metric, route, guardrail) {
  return { id, finding, evidence, interpretation, action, metric, route, guardrail };
}

export function buildMarketingRecommendations({ bookingRequests = [], giftCards = [], analytics = null, notificationHealth = null } = {}) {
  const recommendations = [];
  const pendingBookings = bookingRequests.filter((item) => item.status === 'pending');
  const openGiftCards = giftCards.filter((item) => ['new', 'contacted', 'quoted'].includes(item.status));
  const summary = analytics?.summary || analytics || {};
  const visitors = Number(summary.approx_unique_visitors || 0);
  const requests = Number(summary.website_requests || 0);

  if (pendingBookings.length > 0) {
    recommendations.push(recommendation(
      'pending-booking-follow-up',
      `${pendingBookings.length} booking request${pendingBookings.length === 1 ? '' : 's'} await a decision.`,
      `Current booking_requests with status=pending: ${pendingBookings.length}.`,
      'Prompt, personal follow-up is more useful than increasing promotional pressure while demand is waiting.',
      'Review pending requests and reply before considering a broad campaign.',
      'Pending request count and median response time.',
      '/admin/requests',
      'No campaign is sent or scheduled automatically.'
    ));
  }

  if (openGiftCards.length > 0) {
    recommendations.push(recommendation(
      'gift-card-follow-up',
      `${openGiftCards.length} Gift Card lead${openGiftCards.length === 1 ? '' : 's'} remain open.`,
      `Gift Card requests in new/contacted/quoted states: ${openGiftCards.length}.`,
      'These are high-intent commercial enquiries and should be handled before acquiring more traffic.',
      'Review the Gift Card pipeline and prepare individual follow-up where appropriate.',
      'Gift Card progression from new to paid/issued.',
      '/admin/gift-cards',
      'Do not expose purchaser or recipient details in a campaign.'
    ));
  }

  if (visitors >= 100 && requests === 0) {
    recommendations.push(recommendation(
      'traffic-without-requests',
      'Tracked traffic has adequate sample size but no compatible website requests.',
      `Approximate visitors: ${visitors}; compatible website requests: ${requests}.`,
      'Acquisition is not producing the intended booking outcome.',
      'Inspect the website funnel and validation incidents before increasing traffic spend.',
      'Visitor-to-request conversion and submit-error rate.',
      '/admin/analytics',
      'Treat analytics coverage warnings as authoritative.'
    ));
  }

  const budgetMode = notificationHealth?.budget?.mode;
  if (budgetMode && !['NORMAL', 'WARNING'].includes(budgetMode)) {
    recommendations.push(recommendation(
      'notification-pressure',
      `Notification delivery is in ${budgetMode} mode.`,
      `Current notification budget mode: ${budgetMode}.`,
      'Promotional delivery pressure should not increase while the safety circuit breaker is active.',
      'Pause new promotional planning and inspect notification health.',
      'Push attempts, failures and budget percentage.',
      '/admin/notifications',
      'Critical operational delivery remains governed by the existing budget policy.'
    ));
  }

  if (!recommendations.length) {
    recommendations.push(recommendation(
      'insufficient-data',
      'Insufficient data for a specific marketing recommendation.',
      'No current deterministic rule crossed its evidence threshold.',
      'A recommendation without supporting operational or analytics evidence would be speculative.',
      'Review Analytics and current pipelines after more compatible data is collected.',
      'Compatible visitors, booking requests, Gift Card pipeline and notification health.',
      '/admin/analytics',
      'Never fabricate metrics or trigger an action automatically.'
    ));
  }

  return recommendations;
}
