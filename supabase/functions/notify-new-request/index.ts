import { claimAdminAction, clean, dbJson, env, readJson, recipients, requireAdmin, resendEmail } from '../_shared/vulcaniq.ts';
import { buildRequestNotificationEmail } from '../_shared/requestNotificationEmail.ts';

const SUPPORTED = new Set(['booking_requests', 'gift_card_requests']);

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'https://vulcaniq.it',
  'https://www.vulcaniq.it',
  'https://vulcaniq.pages.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

function allowedOrigins(): Set<string> {
  const configured = env('REQUEST_NOTIFICATION_ALLOWED_ORIGINS', false)
    .split(',').map((value) => value.trim()).filter(Boolean);
  return configured.length ? new Set(configured) : DEFAULT_ALLOWED_ORIGINS;
}

function corsHeaders(req: Request): HeadersInit {
  const origin = clean(req.headers.get('origin'), 500);
  const trusted = origin && allowedOrigins().has(origin);
  return {
    ...(trusted ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage, x-vulcaniq-webhook-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400'
  };
}

function responseJson(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  const origin = clean(req.headers.get('origin'), 500);
  if (origin && !allowedOrigins().has(origin)) return new Response(null, { status: 403, headers: { 'Vary': 'Origin' } });
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

async function ingestAdminNotification(table: string, id: string): Promise<void> {
  const endpoint = env('NOTIFICATION_INGEST_URL', false);
  const secret = env('NOTIFICATION_INGEST_SECRET', false);
  if (!endpoint || !secret) return;
  const category = table === 'booking_requests' ? 'new_bookings' : table === 'gift_card_requests' ? 'gift_cards' : '';
  if (!category) return;
  const destinationUrl = table === 'booking_requests' ? '/admin/requests' : '/admin/gift-cards';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Notification-Ingest-Key': secret },
      body: JSON.stringify({ category, dedupeKey: `request:${table}:${id}`, destinationUrl })
    });
    if (!response.ok && response.status !== 409) console.warn('admin_notification_ingest_failed', { status: response.status, table });
  } catch {
    console.warn('admin_notification_ingest_failed', { status: 'network_error', table });
  }
}

type RecordMap = Record<string, unknown>;

async function fetchRecord(table: string, id: string): Promise<RecordMap | null> {
  const query = new URLSearchParams({ select: '*', id: `eq.${id}`, limit: '1' });
  const rows = await dbJson(`${table}?${query.toString()}`, { method: 'GET' }) as RecordMap[];
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function claim(table: string, id: string, recipient: string, retry: boolean): Promise<boolean> {
  if (retry) {
    const query = new URLSearchParams({ request_table: `eq.${table}`, request_id: `eq.${id}`, channel: 'eq.email', recipient: `eq.${recipient}`, status: 'eq.failed', attempts: 'lt.5' });
    const rows = await dbJson(`request_notification_log?${query.toString()}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'pending', error_message: null, last_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    }) as RecordMap[];
    if (Array.isArray(rows) && rows.length) {
      await dbJson(`request_notification_log?id=eq.${clean(rows[0].id, 80)}`, { method: 'PATCH', body: JSON.stringify({ attempts: Number(rows[0].attempts || 1) + 1 }) });
      return true;
    }
    const inserted = await dbJson('request_notification_log?on_conflict=request_table,request_id,channel,recipient', {
      method: 'POST',
      headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
      body: JSON.stringify({ request_table: table, request_id: id, channel: 'email', recipient, provider: 'resend', status: 'pending', attempts: 1 })
    }) as RecordMap[];
    return Array.isArray(inserted) && inserted.length > 0;
  }
  const rows = await dbJson('request_notification_log?on_conflict=request_table,request_id,channel,recipient', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify({ request_table: table, request_id: id, channel: 'email', recipient, provider: 'resend', status: 'pending', attempts: 1 })
  }) as RecordMap[];
  return Array.isArray(rows) && rows.length > 0;
}

async function updateLog(table: string, id: string, recipient: string, patch: RecordMap): Promise<void> {
  const query = new URLSearchParams({ request_table: `eq.${table}`, request_id: `eq.${id}`, channel: 'eq.email', recipient: `eq.${recipient}` });
  await dbJson(`request_notification_log?${query.toString()}`, { method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
}

async function updateParent(table: string, id: string, status: string, error: string | null, attempts: number): Promise<void> {
  await dbJson(`${table}?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ notification_email_status: status, notification_email_sent_at: status === 'sent' ? new Date().toISOString() : null, notification_email_error: error, notification_email_attempts: attempts, updated_at: new Date().toISOString() })
  });
}

Deno.serve(async (req) => {
  const preflightResponse = preflight(req);
  if (preflightResponse) return preflightResponse;
  if (req.method !== 'POST') return responseJson(req, 405, { ok: false, code: 'method_not_allowed' });
  try {
    const body = await readJson(req, 65536);
    const retry = body.retry === true;
    let table = clean(body.table, 80);
    let record = (body.record && typeof body.record === 'object' ? body.record : null) as RecordMap | null;
    let id = clean(body.id || record?.id, 100);

    if (retry) {
      const userId = await requireAdmin(req);
      if (!await claimAdminAction('notification-retry', userId, 10, 600)) throw new Error('rate_limited');
    } else {
      const expected = env('REQUEST_NOTIFICATION_WEBHOOK_SECRET');
      if (!expected || clean(req.headers.get('x-vulcaniq-webhook-secret'), 500) !== expected) return responseJson(req, 401, { ok: false, code: 'unauthorized' });
      const operation = clean(body.type || body.operation, 30).toUpperCase();
      if (operation !== 'INSERT') return responseJson(req, 202, { ok: true, ignored: true });
    }

    if (!SUPPORTED.has(table) || !id) return responseJson(req, 400, { ok: false, code: 'unsupported_request' });
    if (!record) record = await fetchRecord(table, id);
    if (!record) return responseJson(req, 404, { ok: false, code: 'request_not_found' });

    await ingestAdminNotification(table, id);

    const targets = recipients('REQUEST_NOTIFICATION_RECIPIENTS');
    if (!targets.length) throw new Error('no_notification_recipients');
    const content = buildRequestNotificationEmail(table, record);
    let sent = 0;
    let failed = 0;
    let attempts = Number(record.notification_email_attempts || 0);

    for (const recipient of targets) {
      const claimed = await claim(table, id, recipient, retry);
      if (!claimed) continue;
      attempts += 1;
      try {
        const providerId = await resendEmail({ to: recipient, subject: content.subject, html: content.html, replyTo: content.replyTo });
        await updateLog(table, id, recipient, { status: 'sent', provider_message_id: providerId, error_message: null, sent_at: new Date().toISOString() });
        sent += 1;
      } catch {
        await updateLog(table, id, recipient, { status: 'failed', error_message: 'Email provider rejected the delivery attempt.' });
        failed += 1;
      }
    }

    const skipped = targets.length - sent - failed;
    if (sent > 0 || failed > 0) {
      const finalStatus = failed ? 'failed' : 'sent';
      await updateParent(table, id, finalStatus, failed ? `${failed} notification delivery attempt(s) failed.` : null, attempts);
    }
    return responseJson(req, failed ? 502 : 200, { ok: failed === 0, sent, failed, skipped });
  } catch (error) {
    const code = clean((error as Error)?.message, 80) || 'notification_failed';
    const status = code === 'unauthorized' ? 401
      : code === 'forbidden' ? 403
        : code === 'rate_limited' ? 429
          : code === 'invalid_content_type' ? 415
            : code === 'body_too_large' ? 413
              : code === 'invalid_json' ? 400
                : 500;
    console.error('notify_new_request_failed', { code });
    return responseJson(req, status, { ok: false, code: status === 500 ? 'notification_failed' : code });
  }
});
