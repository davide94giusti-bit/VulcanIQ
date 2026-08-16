import { claimAdminAction, clean, dbJson, env, escapeHtml, json, readJson, recipients, requireAdmin, resendEmail, validEmail } from '../_shared/vulcaniq.ts';

const SUPPORTED = new Set(['booking_requests', 'gift_card_requests']);

type RecordMap = Record<string, unknown>;

function row(label: string, value: unknown): string {
  const text = clean(value, 1200);
  if (!text) return '';
  return `<tr><th align="left" style="padding:6px 12px 6px 0;vertical-align:top">${escapeHtml(label)}</th><td style="padding:6px 0">${escapeHtml(text)}</td></tr>`;
}

function emailFor(table: string, record: RecordMap): { subject: string; html: string; replyTo?: string } {
  const id = clean(record.id, 100);
  const created = clean(record.created_at, 80);
  if (table === 'gift_card_requests') {
    const buyer = clean(record.buyer_name, 120) || 'Unknown buyer';
    return {
      subject: `New vulcanIQ Gift Card request — ${buyer}`,
      replyTo: validEmail(record.buyer_email) ? clean(record.buyer_email, 254) : undefined,
      html: `<h1>New Gift Card request</h1><table>${row('Buyer', buyer)}${row('Email', record.buyer_email)}${row('Phone', record.buyer_phone)}${row('Recipient', record.recipient_name)}${row('Experience', record.experience_type)}${row('Budget', `${clean(record.currency, 8)} ${clean(record.budget, 30)}`)}${row('Preferred delivery', record.preferred_delivery_date)}${row('Message present', clean(record.message) ? 'Yes' : 'No')}${row('Booking code state', clean(record.booking_code) || 'Missing')}${row('Detected source', record.detected_source)}${row('Declared source', record.declared_source)}${row('Request ID', id)}${row('Created', created)}</table>`
    };
  }
  const name = clean(record.customer_name, 120) || 'Unknown customer';
  return {
    subject: `New vulcanIQ booking request — ${name}`,
    replyTo: validEmail(record.customer_email) ? clean(record.customer_email, 254) : undefined,
    html: `<h1>New booking request</h1><table>${row('Request type', record.request_type)}${row('Customer', name)}${row('Email', record.customer_email)}${row('Phone', record.customer_phone)}${row('Preferred contact', record.preferred_contact)}${row('Experience', record.experience_id)}${row('Date', record.requested_date)}${row('Alternative date', record.alternative_date)}${row('Adults', record.adults)}${row('Children', record.children)}${row('Language', record.language)}${row('Detected source', record.detected_source || record.traffic_source)}${row('Declared source', record.declared_source || record.heard_about_us)}${row('CTA location', record.cta_location)}${row('Request ID', id)}${row('Created', created)}</table>`
  };
}

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
  if (req.method !== 'POST') return json(405, { ok: false, code: 'method_not_allowed' });
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
      if (!expected || clean(req.headers.get('x-vulcaniq-webhook-secret'), 500) !== expected) return json(401, { ok: false, code: 'unauthorized' });
      const operation = clean(body.type || body.operation, 30).toUpperCase();
      if (operation !== 'INSERT') return json(202, { ok: true, ignored: true });
    }

    if (!SUPPORTED.has(table) || !id) return json(400, { ok: false, code: 'unsupported_request' });
    if (!record) record = await fetchRecord(table, id);
    if (!record) return json(404, { ok: false, code: 'request_not_found' });

    const targets = recipients('REQUEST_NOTIFICATION_RECIPIENTS');
    if (!targets.length) throw new Error('no_notification_recipients');
    const content = emailFor(table, record);
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
    return json(failed ? 502 : 200, { ok: failed === 0, sent, failed, skipped });
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
    return json(status, { ok: false, code: status === 500 ? 'notification_failed' : code });
  }
});
