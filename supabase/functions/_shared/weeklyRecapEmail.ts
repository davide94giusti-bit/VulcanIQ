import { escapeHtml } from './vulcaniq.ts';

type CountMap = Record<string, number>;

type RecapData = {
  bookings: {
    total: number;
    website: number;
    websiteCompatible: number;
    bookingCode: number;
    bookingCodeCompatible: number;
    confirmedWebsite: number;
    confirmedBookingCode: number;
    pending: number;
    byStatus: CountMap;
    byExperience: CountMap;
    bySource: CountMap;
  };
  giftCards: { total: number; compatible: number; byStatus: CountMap; missingCode: number };
  finance: { recordedRevenue: number; reversals: number; netRecorded: number; entries: number };
  analytics: {
    events: number;
    sessions: number;
    pageViews: number;
    visitorsApprox: number;
    formOpen: number;
    formStarted: number;
    submitAttempt: number;
    submitSuccess: number;
    submitError: number;
    bookingRequestCreated: number;
    bookingCodeRedeemAttempt: number;
    bookingCodeRedeemSuccess: number;
    giftCardViews: number;
    giftCardStarts: number;
    giftCardRequestCreated: number;
    whatsappClicks: number;
    emailClicks: number;
    phoneClicks: number;
    mapsClicks: number;
    contactIntentVisitors: number;
    fastRequestStarts: number;
    fastRequestSuccesses: number;
    fastRequestWhatsapp: number;
    coverage: { dataComplete: boolean; baselineApplied: boolean; reportingBaselineAt: string; trackingContractStartedAt: string; effectiveFrom: string; effectiveTo: string; incidentState: string };
    byDevice: CountMap;
    byBrowser: CountMap;
    byTrafficSource: CountMap;
    byExperience: CountMap;
  };
  reviews: { total: number; negative: number; replyPending: number };
  urgencies: { currentPending: number; pendingOver12h: number; pendingOver24h: number; upcomingUnconfirmed: number; missingContact: number; missingGiftCodes: number };
  system: { failedNotifications: number };
  recommendations: string[];
};

function number(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown): string {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(number(value));
}

function pct(value: number, total: number): string {
  const numerator = number(value);
  const denominator = number(total);
  if (!denominator) return numerator ? 'Tracking mismatch' : '0%';
  if (numerator > denominator) return 'Tracking mismatch';
  return `${Math.round((numerator / denominator) * 1000) / 10}%`;
}

function metricCard(label: string, value: string | number, helper = ''): string {
  return `<td class="metric-cell" width="25%"><div class="metric"><div class="metric-value">${escapeHtml(value)}</div><div class="metric-label">${escapeHtml(label)}</div>${helper ? `<div class="metric-helper">${escapeHtml(helper)}</div>` : ''}</div></td>`;
}

function mapRows(map: CountMap, limit = 5): Array<[string, number]> {
  return Object.entries(map || {})
    .filter(([key, value]) => key && key !== 'unknown' && number(value) > 0)
    .sort((a, b) => number(b[1]) - number(a[1]))
    .slice(0, limit)
    .map(([key, value]) => [key, number(value)]);
}

function barChart(title: string, rows: Array<[string, number]>, emptyText = 'No activity recorded'): string {
  const safeRows = rows.filter(([, value]) => number(value) > 0);
  const max = Math.max(1, ...safeRows.map(([, value]) => number(value)));
  return `<div class="chart-card"><h3>${escapeHtml(title)}</h3>${safeRows.length ? safeRows.map(([label, value]) => {
    const width = Math.max(4, Math.round((number(value) / max) * 100));
    return `<div class="bar-row"><div class="bar-head"><span>${escapeHtml(label)}</span><strong>${number(value)}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div></div>`;
  }).join('') : `<div class="empty">${escapeHtml(emptyText)}</div>`}</div>`;
}

function funnelChart(title: string, rows: Array<[string, number]>): string {
  const firstRaw = number(rows[0]?.[1]);
  const first = Math.max(1, firstRaw);
  return `<div class="chart-card"><h3>${escapeHtml(title)}</h3>${rows.map(([label, value]) => {
    const current = number(value);
    const compatible = firstRaw > 0 ? current <= firstRaw : current === 0;
    const width = compatible ? Math.max(current ? 4 : 0, Math.min(100, Math.round((current / first) * 100))) : 100;
    const rate = compatible ? pct(current, firstRaw) : 'Tracking mismatch';
    return `<div class="bar-row"><div class="bar-head"><span>${escapeHtml(label)}</span><strong>${current} <em>${escapeHtml(rate)}</em></strong></div><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div></div>`;
  }).join('')}</div>`;
}

function urgencyCard(label: string, value: number, critical = false): string {
  return `<td class="urgency-cell" width="33.33%"><div class="urgency ${critical && value ? 'critical' : ''}"><strong>${number(value)}</strong><span>${escapeHtml(label)}</span></div></td>`;
}

export function buildWeeklyRecapEmail(periodLabel: string, data: RecapData, testMode = false): string {
  const websiteConversion = pct(data.analytics.submitSuccess, data.analytics.formOpen);
  const bookingCodeConversion = pct(data.analytics.bookingCodeRedeemSuccess, data.analytics.bookingCodeRedeemAttempt);
  const fastRequestConversion = pct(data.analytics.fastRequestSuccesses, data.analytics.fastRequestStarts);
  const netRevenue = money(data.finance.netRecorded);

  const deviceRows = mapRows(data.analytics.byDevice);
  const trafficRows = mapRows(data.analytics.byTrafficSource);
  const experienceRows = mapRows(data.analytics.byExperience);
  const bookingStatusRows = mapRows(data.bookings.byStatus);
  const giftRows = mapRows(data.giftCards.byStatus);

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;background:#f3eee7;color:#102033;font-family:Arial,Helvetica,sans-serif}.wrap{width:100%;background:#f3eee7;padding:24px 10px}.shell{max-width:760px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;border:1px solid #e2d9cf}.hero{background:#101b2d;padding:28px 30px;color:#fff}.brand{font-size:13px;font-weight:800;letter-spacing:.18em;color:#ff7a59;text-transform:uppercase}.hero h1{margin:8px 0 6px;font-size:30px;line-height:1.05}.hero p{margin:0;color:#cfd7e2;font-size:14px}.badge{display:inline-block;margin-top:14px;padding:6px 10px;border-radius:999px;background:#1c2a40;color:#fff;font-size:12px;font-weight:700}.badge.test{background:#ff7a59}.content{padding:24px 28px}.section{margin:0 0 24px}.section h2{margin:0 0 12px;font-size:19px;color:#102033}.metric-table,.urgency-table,.chart-table{width:100%;border-collapse:separate;border-spacing:8px}.metric-cell,.urgency-cell,.chart-cell{vertical-align:top}.metric{min-height:90px;padding:14px;border-radius:14px;background:#f7f4ef;border:1px solid #ece4db}.metric-value{font-size:24px;font-weight:800;color:#102033}.metric-label{margin-top:5px;font-size:12px;font-weight:700;color:#52606d}.metric-helper{margin-top:5px;font-size:11px;color:#7b8790}.urgency{padding:12px;border-radius:12px;background:#eef5f1;border:1px solid #d8e8df}.urgency.critical{background:#fff0ec;border-color:#ffc7b9;color:#9b2d1d}.urgency strong{display:block;font-size:20px}.urgency span{display:block;margin-top:3px;font-size:11px;font-weight:700}.chart-card{padding:14px;border-radius:14px;background:#fbfaf8;border:1px solid #ece4db}.chart-card h3{margin:0 0 12px;font-size:14px;color:#102033}.bar-row{margin:0 0 10px}.bar-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:5px;font-size:11px;color:#52606d}.bar-head strong{color:#102033}.bar-head em{font-style:normal;color:#7b8790;font-weight:500}.bar-track{height:8px;background:#ece6df;border-radius:99px;overflow:hidden}.bar-fill{height:8px;background:#ff7154;border-radius:99px}.empty{font-size:12px;color:#7b8790}.actions{margin:0;padding-left:20px}.actions li{margin:0 0 8px;line-height:1.45;color:#344455}.footer{padding:18px 28px 26px;color:#7b8790;font-size:11px;border-top:1px solid #eee5dc}.foot-accent{color:#ff7154;font-weight:800}.two-col{width:100%;border-collapse:separate;border-spacing:8px}.two-col td{width:50%;vertical-align:top}@media(max-width:620px){.wrap{padding:0}.shell{border-radius:0;border-left:0;border-right:0}.hero{padding:24px 18px}.hero h1{font-size:25px}.content{padding:18px 10px}.metric-table,.urgency-table,.two-col{border-spacing:5px}.metric-cell,.urgency-cell,.two-col td{display:block;width:100%!important}.metric{min-height:auto}.hero p{line-height:1.4}}
</style></head>
<body><div class="wrap"><div class="shell">
  <div class="hero"><div class="brand">VULCANIQ · OPERATIONS</div><h1>Weekly management recap</h1><p>${escapeHtml(periodLabel)} · Europe/Rome</p><span class="badge ${testMode ? 'test' : ''}">${testMode ? 'TEST REPORT' : 'MONDAY OPERATIONS REPORT'}</span></div>
  <div class="content">
    <div class="section"><h2>Executive overview</h2><table class="metric-table" role="presentation"><tr>
      ${metricCard('Website requests', data.bookings.website, `${data.bookings.confirmedWebsite} confirmed`)}
      ${metricCard('Booking-code requests', data.bookings.bookingCode, `${data.bookings.confirmedBookingCode} confirmed`)}
      ${metricCard('Gift Cards', data.giftCards.total, `${data.giftCards.missingCode} missing code`)}
      ${metricCard('Net recorded revenue', netRevenue, `${data.finance.entries} finance entries`)}
    </tr></table></div>

    <div class="section"><h2>Operational attention</h2><table class="urgency-table" role="presentation"><tr>
      ${urgencyCard('Pending now', data.urgencies.currentPending, true)}
      ${urgencyCard('Pending >24h', data.urgencies.pendingOver24h, true)}
      ${urgencyCard('Within 72h unconfirmed', data.urgencies.upcomingUnconfirmed, true)}
    </tr><tr>
      ${urgencyCard('Failed notifications', data.system.failedNotifications, true)}
      ${urgencyCard('Missing contact', data.urgencies.missingContact, true)}
      ${urgencyCard('Gift Cards missing code', data.urgencies.missingGiftCodes, true)}
    </tr></table></div>

    <div class="section"><h2>Conversion funnels</h2><table class="two-col" role="presentation"><tr><td>
      ${funnelChart(`Website booking funnel · ${websiteConversion}`, [['Form opens', data.analytics.formOpen], ['Form starts', data.analytics.formStarted], ['Submit attempts', data.analytics.submitAttempt], ['Submit successes', data.analytics.submitSuccess], ['Compatible DB requests', data.bookings.websiteCompatible]])}
    </td><td>
      ${funnelChart(`Fast Request / WhatsApp · ${fastRequestConversion}`, [['Starts', data.analytics.fastRequestStarts], ['Submit successes', data.analytics.fastRequestSuccesses], ['WhatsApp outcomes', data.analytics.fastRequestWhatsapp]])}
    </td></tr><tr><td>
      ${funnelChart('Gift Card funnel', [['Views', data.analytics.giftCardViews], ['Questionnaire starts', data.analytics.giftCardStarts], ['Requests created event', data.analytics.giftCardRequestCreated], ['Compatible DB requests', data.giftCards.compatible]])}
    </td><td>
      ${funnelChart(`Booking-code funnel · ${bookingCodeConversion}`, [['Redeem attempts', data.analytics.bookingCodeRedeemAttempt], ['Redeem successes', data.analytics.bookingCodeRedeemSuccess], ['Compatible DB requests', data.bookings.bookingCodeCompatible]])}
    </td></tr></table>
    ${barChart('Contact actions', [['WhatsApp clicks', data.analytics.whatsappClicks], ['Email clicks', data.analytics.emailClicks], ['Phone clicks', data.analytics.phoneClicks], ['Maps clicks', data.analytics.mapsClicks]])}
    </div>

    <div class="section"><h2>Demand & status</h2><table class="two-col" role="presentation"><tr><td>${barChart('Experience detail opens', experienceRows)}</td><td>${barChart('Booking status', bookingStatusRows)}</td></tr><tr><td>${barChart('Gift Card status', giftRows)}</td><td>${barChart('Traffic sources (page views)', trafficRows)}</td></tr></table></div>

    <div class="section"><h2>Audience</h2><table class="metric-table" role="presentation"><tr>
      ${metricCard('Page views', data.analytics.pageViews)}
      ${metricCard('Approx. visitors', data.analytics.visitorsApprox)}
      ${metricCard('Sessions', data.analytics.sessions)}
      ${metricCard('Contact-intent visitors', data.analytics.contactIntentVisitors)}
    </tr></table><table class="two-col" role="presentation"><tr><td>${barChart('Devices (page views)', deviceRows)}</td><td>${barChart('Browsers', mapRows(data.analytics.byBrowser))}</td></tr></table></div>

    <div class="section"><h2>Analytics coverage</h2><table class="metric-table" role="presentation"><tr>
      ${metricCard('Coverage', data.analytics.coverage.dataComplete ? 'Complete' : 'Partial')}
      ${metricCard('Reporting baseline', data.analytics.coverage.reportingBaselineAt || 'Not set', data.analytics.coverage.baselineApplied ? 'Applied to this report' : 'Not applied')}
      ${metricCard('Tracking contract', data.analytics.coverage.trackingContractStartedAt || '—')}
      ${metricCard('Submission health', data.analytics.coverage.incidentState || 'none')}
    </tr></table></div>

    <div class="section"><h2>Finance</h2><table class="metric-table" role="presentation"><tr>${metricCard('Recorded revenue', money(data.finance.recordedRevenue))}${metricCard('Reversals', money(data.finance.reversals))}${metricCard('Net recorded', netRevenue)}${metricCard('Entries', data.finance.entries)}</tr></table></div>

    <div class="section"><h2>Reviews</h2><table class="metric-table" role="presentation"><tr>${metricCard('New reviews', data.reviews.total)}${metricCard('Negative reviews', data.reviews.negative)}${metricCard('Replies pending', data.reviews.replyPending)}${metricCard('Pending >12h', data.urgencies.pendingOver12h)}</tr></table></div>

    <div class="section"><h2>Recommended actions</h2><ol class="actions">${data.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol></div>
  </div>
  <div class="footer"><span class="foot-accent">VULCANIQ</span> · Automated operational recap. Funnel families are intentionally separated so booking-code, Gift Card and WhatsApp activity cannot inflate website-form conversion.</div>
</div></div></body></html>`;
}
