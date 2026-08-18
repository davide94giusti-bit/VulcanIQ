import { corsPreflight, claimAdminAction, clean, dbJson, env, json, readJson, recipients, requireAdmin, resendEmail } from '../_shared/vulcaniq.ts';
import { buildWeeklyRecapEmail } from '../_shared/weeklyRecapEmail.ts';

type Row = Record<string, unknown>;

function isRomeMondayEight(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.weekday === 'Mon' && Number(values.hour) === 8 && Number(values.minute) < 15;
}

function periodLabelRome(start: string, end: string): string {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
  const startLabel = format.format(new Date(start));
  const endLabel = format.format(new Date(new Date(end).getTime() - 1));
  return `${startLabel} – ${endLabel}`;
}

function previousWeekRome(now = new Date()): { start: string; end: string; label: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(map.weekday);
  const localNoon = new Date(`${map.year}-${map.month}-${map.day}T12:00:00Z`);
  const daysSinceMonday = (dayIndex + 6) % 7;
  const currentMonday = new Date(localNoon.getTime() - daysSinceMonday * 86400000);
  const startLocal = new Date(currentMonday.getTime() - 7 * 86400000);
  const endLocal = new Date(currentMonday.getTime());
  const toRomeUtc = (date: Date) => {
    const ymd = date.toISOString().slice(0, 10);
    const probe = new Date(`${ymd}T00:00:00Z`);
    const zoneParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', timeZoneName: 'longOffset', hour: '2-digit', minute: '2-digit' }).formatToParts(probe);
    const offset = zoneParts.find((part) => part.type === 'timeZoneName')?.value.match(/GMT([+-])(\d{2}):(\d{2})/);
    const minutes = offset ? (offset[1] === '+' ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3])) : 60;
    return new Date(probe.getTime() - minutes * 60000).toISOString();
  };
  const start = toRomeUtc(startLocal);
  const end = toRomeUtc(endLocal);
  return { start, end, label: periodLabelRome(start, end) };
}

async function list(table: string, select: string, start: string, end: string, dateColumn = 'created_at'): Promise<Row[]> {
  const query = new URLSearchParams({ select, [dateColumn]: `gte.${start}`, and: `(${dateColumn}.lt.${end})`, limit: '5000' });
  const rows = await dbJson(`${table}?${query.toString()}`, { method: 'GET' });
  return Array.isArray(rows) ? rows as Row[] : [];
}

function countBy(rows: Row[], field: string): Record<string, number> {
  return rows.reduce((acc, row) => { const key = clean(row[field], 80) || 'unknown'; acc[key] = (acc[key] || 0) + 1; return acc; }, {} as Record<string, number>);
}

function canonicalEventCount(rows: Row[], primary: string, legacy: string[] = []): number {
  const primaryCount = rows.filter((row) => clean(row.event_name, 100) === primary).length;
  if (primaryCount) return primaryCount;
  return rows.filter((row) => legacy.includes(clean(row.event_name, 100))).length;
}

function metadataValue(row: Row, key: string): string {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
  return clean(metadata[key], 120);
}

function metadataFirstValue(row: Row, keys: string[]): string {
  for (const key of keys) {
    const value = metadataValue(row, key);
    if (value) return value;
  }
  return '';
}

function countByMetadataFirst(rows: Row[], keys: string[]): Record<string, number> {
  return rows.reduce((acc, row) => {
    const value = metadataFirstValue(row, keys) || 'unknown';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function money(rows: Row[], predicate: (row: Row) => boolean): number {
  return rows.filter(predicate).reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

async function metrics(period: { start: string; end: string }) {
  const [bookings, gifts, finance, analytics, reviews, notificationFailures, currentPending, currentGiftCodes] = await Promise.all([
    list('booking_requests', 'id,status,request_type,experience_id,requested_date,adults,children,source,created_by_admin,detected_source,declared_source,expected_value,created_at,notification_email_status', period.start, period.end),
    list('gift_card_requests', 'id,status,budget,currency,booking_code,booking_code_id,preferred_delivery_date,created_at,notification_email_status', period.start, period.end),
    list('finance_entries', 'id,type,amount,currency,status,category,reversal_of,created_at', period.start, period.end),
    list('analytics_events', 'id,event_name,visitor_id,device_type,browser,traffic_source,metadata,occurred_at,created_at', period.start, period.end, 'occurred_at'),
    list('reviews', 'id,rating,approved,active,admin_reply,created_at', period.start, period.end).catch(() => []),
    dbJson(`request_notification_log?select=id,status&status=eq.failed&created_at=gte.${encodeURIComponent(period.start)}&created_at=lt.${encodeURIComponent(period.end)}&limit=5000`, { method: 'GET' }).catch(() => []),
    dbJson('booking_requests?select=id,created_at,requested_date,status,customer_email,customer_phone&status=eq.pending&limit=5000', { method: 'GET' }).catch(() => []),
    dbJson('gift_card_requests?select=id,status,booking_code,booking_code_id,preferred_delivery_date&status=in.(paid,issued)&limit=5000', { method: 'GET' }).catch(() => [])
  ]);
  const websiteBookings = bookings.filter((row) => !row.created_by_admin && ['website', 'public_website', 'unknown', ''].includes(clean(row.source, 40) || 'website'));
  const bookingCodeBookings = bookings.filter((row) => clean(row.source, 40) === 'booking_code');
  const isConfirmed = (row: Row) => ['accepted', 'confirmed', 'completed'].includes(clean(row.status).toLowerCase());
  const pending = bookings.filter((row) => clean(row.status).toLowerCase() === 'pending').length;
  const confirmedWebsite = websiteBookings.filter(isConfirmed).length;
  const confirmedBookingCode = bookingCodeBookings.filter(isConfirmed).length;
  const analyticsByEvent = countBy(analytics, 'event_name');
  const pageViewRows = analytics.filter((row) => clean(row.event_name, 100) === 'page_view');
  const detailRows = analytics.filter((row) => clean(row.event_name, 100) === 'experience_detail_open');
  const legacyDetailRows = detailRows.length ? [] : analytics.filter((row) => clean(row.event_name, 100) === 'excursion_view');
  const demandRows = detailRows.length ? detailRows : legacyDetailRows;
  const recordedRevenue = money(finance, (row) => ['confirmed', 'paid', 'collected'].includes(clean(row.status).toLowerCase()) && Number(row.amount || 0) > 0);
  const reversals = Math.abs(money(finance, (row) => Boolean(row.reversal_of) || Number(row.amount || 0) < 0));
  const now = Date.now();
  const pendingRows = (currentPending as Row[]);
  const pendingOver12h = pendingRows.filter((row) => now - new Date(String(row.created_at || '')).getTime() > 12 * 3600000).length;
  const pendingOver24h = pendingRows.filter((row) => now - new Date(String(row.created_at || '')).getTime() > 24 * 3600000).length;
  const next72h = now + 72 * 3600000;
  const upcomingUnconfirmed = pendingRows.filter((row) => {
    const value = new Date(`${clean(row.requested_date, 20)}T12:00:00Z`).getTime();
    return Number.isFinite(value) && value >= now && value <= next72h;
  }).length;
  const missingContact = pendingRows.filter((row) => !clean(row.customer_email, 254) && !clean(row.customer_phone, 40)).length;
  const missingGiftCodes = (currentGiftCodes as Row[]).filter((row) => !row.booking_code_id && !clean(row.booking_code)).length;

  const formOpen = canonicalEventCount(analytics, 'booking_form_open');
  const formStarted = canonicalEventCount(analytics, 'booking_form_started');
  const submitAttempt = canonicalEventCount(analytics, 'booking_form_submit_attempt', ['booking_submit_attempt']);
  const submitSuccess = canonicalEventCount(analytics, 'booking_form_submit_success', ['booking_submit_success', 'booking_submit']);
  const submitError = canonicalEventCount(analytics, 'booking_form_submit_error', ['booking_submit_error']);
  const bookingRequestCreated = canonicalEventCount(analytics, 'booking_request_created');
  const bookingCodeRedeemAttempt = canonicalEventCount(analytics, 'booking_code_redeem_attempt');
  const bookingCodeRedeemSuccess = canonicalEventCount(analytics, 'booking_code_redeem_success');
  const giftCardViews = canonicalEventCount(analytics, 'gift_card_view');
  const giftCardStarts = canonicalEventCount(analytics, 'gift_card_questionnaire_started');
  const giftCardRequestCreated = canonicalEventCount(analytics, 'gift_card_request_created');
  const whatsappClicks = canonicalEventCount(analytics, 'whatsapp_click');
  const visitorIds = new Set(pageViewRows.map((row) => clean(row.visitor_id, 160)).filter(Boolean));

  const recommendations: string[] = [];
  if (pendingRows.length) recommendations.push(`Review ${pendingRows.length} currently pending booking request(s).`);
  if (pendingOver24h) recommendations.push(`Escalate ${pendingOver24h} request(s) pending for more than 24 hours.`);
  else if (pendingOver12h) recommendations.push(`Follow up on ${pendingOver12h} request(s) pending for more than 12 hours.`);
  if (upcomingUnconfirmed) recommendations.push(`Confirm ${upcomingUnconfirmed} excursion request(s) scheduled within 72 hours.`);
  if ((notificationFailures as Row[]).length) recommendations.push(`Retry ${(notificationFailures as Row[]).length} failed notification(s) from the reporting period.`);
  if (missingGiftCodes) recommendations.push(`Generate or repair ${missingGiftCodes} missing Gift Card booking code(s).`);
  if (submitError) recommendations.push(`Inspect ${submitError} public booking submission error(s) before interpreting the funnel as UX drop-off.`);
  else if (submitAttempt > submitSuccess) recommendations.push('Inspect current website booking submit gaps and verify booking_request_created / submit_success integrity.');
  if (!recommendations.length) recommendations.push('No deterministic urgent action detected.');

  return {
    bookings: {
      total: bookings.length,
      website: websiteBookings.length,
      bookingCode: bookingCodeBookings.length,
      confirmedWebsite,
      confirmedBookingCode,
      pending,
      byStatus: countBy(bookings, 'status'),
      byExperience: countBy(websiteBookings, 'experience_id'),
      bySource: countBy(bookings, 'source')
    },
    giftCards: { total: gifts.length, byStatus: countBy(gifts, 'status'), missingCode: gifts.filter((row) => ['paid', 'issued'].includes(clean(row.status)) && !row.booking_code_id && !clean(row.booking_code)).length },
    finance: { recordedRevenue, reversals, netRecorded: recordedRevenue - reversals, entries: finance.length },
    analytics: {
      events: analytics.length,
      pageViews: pageViewRows.length,
      visitorsApprox: visitorIds.size,
      formOpen,
      formStarted,
      submitAttempt,
      submitSuccess,
      submitError,
      bookingRequestCreated,
      bookingCodeRedeemAttempt,
      bookingCodeRedeemSuccess,
      giftCardViews,
      giftCardStarts,
      giftCardRequestCreated,
      whatsappClicks,
      byEvent: analyticsByEvent,
      byDevice: countBy(pageViewRows, 'device_type'),
      byBrowser: countBy(pageViewRows, 'browser'),
      byTrafficSource: countBy(pageViewRows, 'traffic_source'),
      byExperience: countByMetadataFirst(demandRows, ['experience_id', 'experience_slug', 'experience'])
    },
    reviews: { total: reviews.length, negative: reviews.filter((row) => Number(row.rating || 5) <= 3).length, replyPending: reviews.filter((row) => !clean(row.admin_reply)).length },
    urgencies: { currentPending: pendingRows.length, pendingOver12h, pendingOver24h, upcomingUnconfirmed, missingContact, missingGiftCodes },
    system: { failedNotifications: (notificationFailures as Row[]).length },
    recommendations
  };
}

Deno.serve(async (req) => {
  const preflight = corsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json(405, { ok: false, code: 'method_not_allowed' });
  try {
    const body = await readJson(req, 16384);
    const cronSecret = clean(req.headers.get('x-vulcaniq-cron-secret'), 500);
    const isCron = Boolean(cronSecret && cronSecret === env('WEEKLY_RECAP_CRON_SECRET'));
    if (isCron && !isRomeMondayEight()) return json(202, { ok: true, ignored: true, reason: 'outside_rome_schedule' });
    if (!isCron) {
      const userId = await requireAdmin(req);
      if (!await claimAdminAction('weekly-recap-manual', userId, 3, 3600)) throw new Error('rate_limited');
    }
    let testMode = body.test_mode === true;
    let force = body.force === true && !isCron;
    let period = previousWeekRome();
    let targets = recipients('WEEKLY_RECAP_RECIPIENTS');
    if (!targets.length) throw new Error('no_weekly_recap_recipients');
    const resendReportId = !isCron ? clean(body.resend_report_id, 80) : '';
    if (resendReportId) {
      const rows = await dbJson(`admin_weekly_reports?select=id,period_start,period_end,recipient,report_type,status&id=eq.${encodeURIComponent(resendReportId)}&limit=1`, { method: 'GET' }) as Row[];
      const report = Array.isArray(rows) ? rows[0] : null;
      const recipient = clean(report?.recipient, 254).toLowerCase();
      if (!report || !targets.includes(recipient)) throw new Error('report_not_found');
      if (clean(report.status, 30) !== 'failed') throw new Error('report_not_failed');
      const start = clean(report.period_start, 80);
      const end = clean(report.period_end, 80);
      if (!start || !end) throw new Error('report_not_found');
      period = { start, end, label: periodLabelRome(start, end) };
      targets = [recipient];
      testMode = clean(report.report_type, 80) === 'weekly_management_recap_test';
      force = true;
    }
    const data = await metrics(period);
    const from = env('WEEKLY_RECAP_FROM_EMAIL', false) || 'vulcanIQ Reports <reports@notify.vulcaniq.it>';
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const recipient of targets) {
      const existingQuery = new URLSearchParams({ select: 'id,status', period_start: `eq.${period.start}`, period_end: `eq.${period.end}`, recipient: `eq.${recipient}`, report_type: `eq.${testMode ? 'weekly_management_recap_test' : 'weekly_management_recap'}`, limit: '1' });
      const existing = await dbJson(`admin_weekly_reports?${existingQuery.toString()}`, { method: 'GET' }) as Row[];
      if (existing?.length && !force) { skipped += 1; continue; }
      let reportId = clean(existing?.[0]?.id, 80);
      if (!reportId) {
        const inserted = await dbJson('admin_weekly_reports', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ period_start: period.start, period_end: period.end, recipient, report_type: testMode ? 'weekly_management_recap_test' : 'weekly_management_recap', status: 'pending', metrics: data }) }) as Row[];
        reportId = clean(inserted?.[0]?.id, 80);
      } else {
        await dbJson(`admin_weekly_reports?id=eq.${reportId}`, { method: 'PATCH', body: JSON.stringify({ status: 'pending', error_message: null, metrics: data, generated_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
      }
      try {
        const providerId = await resendEmail({ to: recipient, from, subject: `${testMode ? '[TEST] ' : ''}vulcanIQ weekly recap — ${period.label}`, html: buildWeeklyRecapEmail(period.label, data, testMode) });
        await dbJson(`admin_weekly_reports?id=eq.${reportId}`, { method: 'PATCH', body: JSON.stringify({ status: testMode ? 'test' : 'sent', provider_message_id: providerId, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
        sent += 1;
      } catch {
        await dbJson(`admin_weekly_reports?id=eq.${reportId}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', error_message: 'Email provider rejected the weekly recap.', updated_at: new Date().toISOString() }) });
        failed += 1;
      }
    }
    return json(failed ? 502 : 200, { ok: failed === 0, period_start: period.start, period_end: period.end, sent, skipped, failed, metrics: testMode ? data : undefined });
  } catch (error) {
    const code = clean((error as Error)?.message, 80) || 'weekly_recap_failed';
    const status = code === 'unauthorized' ? 401
      : code === 'forbidden' ? 403
        : code === 'rate_limited' ? 429
          : code === 'invalid_content_type' ? 415
            : code === 'body_too_large' ? 413
              : code === 'invalid_json' ? 400
                : code === 'report_not_found' ? 404
                  : code === 'report_not_failed' ? 409
                    : 500;
    console.error('weekly_recap_failed', { code });
    return json(status, { ok: false, code: status === 500 ? 'weekly_recap_failed' : code });
  }
});
