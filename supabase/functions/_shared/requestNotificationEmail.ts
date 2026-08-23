import { clean, escapeHtml, validEmail } from './vulcaniq.ts';

type RecordMap = Record<string, unknown>;

export type RequestNotificationEmail = {
  subject: string;
  html: string;
  replyTo?: string;
};

function display(value: unknown, max = 1200): string {
  return clean(value, max);
}

function detailRow(label: string, value: unknown): string {
  const text = display(value);
  if (!text) return '';
  return `<tr><td class="detail-label">${escapeHtml(label)}</td><td class="detail-value">${escapeHtml(text)}</td></tr>`;
}

function section(title: string, rows: string): string {
  const content = rows.trim();
  if (!content) return '';
  return `<div class="section"><h2>${escapeHtml(title)}</h2><table class="details" role="presentation">${content}</table></div>`;
}

function shell(title: string, subtitle: string, body: string, requestId: string, created: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;background:#f3eee7;color:#102033;font-family:Arial,Helvetica,sans-serif}.wrap{width:100%;background:#f3eee7;padding:24px 10px}.shell{max-width:720px;margin:0 auto;background:#fffdf9;border:1px solid #e2d9cf;border-radius:20px;overflow:hidden}.hero{background:#101b2d;color:#fff;padding:28px 30px}.brand{font-size:13px;font-weight:800;letter-spacing:.18em;color:#ff7154;text-transform:uppercase}.hero h1{margin:8px 0 7px;font-size:29px;line-height:1.08}.hero p{margin:0;color:#d5dce6;font-size:14px;line-height:1.45}.content{padding:24px 28px}.section{margin:0 0 22px}.section h2{margin:0 0 10px;font-size:17px;color:#102033}.details{width:100%;border-collapse:collapse;background:#fbf8f3;border:1px solid #ebe1d7;border-radius:14px;overflow:hidden}.detail-label,.detail-value{padding:10px 12px;border-bottom:1px solid #eee5dc;vertical-align:top;text-align:left;font-size:13px;line-height:1.4}.detail-label{width:34%;color:#64717e;font-weight:700}.detail-value{color:#102033;word-break:break-word}.details tr:last-child td{border-bottom:0}.meta{padding:15px 28px 23px;border-top:1px solid #eee5dc;color:#7b8790;font-size:11px;line-height:1.5}.meta strong{color:#ff7154;letter-spacing:.08em}.pill{display:inline-block;margin-top:14px;padding:6px 10px;border-radius:999px;background:#1d2b40;color:#fff;font-size:11px;font-weight:700;letter-spacing:.04em}@media(max-width:620px){.wrap{padding:0}.shell{border-radius:0;border-left:0;border-right:0}.hero{padding:24px 18px}.hero h1{font-size:24px}.content{padding:18px 14px}.detail-label,.detail-value{display:block;width:auto;padding:8px 10px}.detail-label{padding-bottom:2px;border-bottom:0}.detail-value{padding-top:2px}.meta{padding:14px 18px 20px}}
</style></head><body><div class="wrap"><div class="shell">
<div class="hero"><div class="brand">VULCANIQ · OPERATIONS</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p><span class="pill">IMMEDIATE OPERATIONAL ALERT</span></div>
<div class="content">${body}</div>
<div class="meta"><strong>VULCANIQ</strong> · Operational notification${requestId ? ` · Request ${escapeHtml(requestId)}` : ''}${created ? ` · ${escapeHtml(created)}` : ''}</div>
</div></div></body></html>`;
}

export function buildRequestNotificationEmail(table: string, record: RecordMap): RequestNotificationEmail {
  const id = display(record.id, 100);
  const created = display(record.created_at, 80);

  if (table === 'gift_card_requests') {
    const buyer = display(record.buyer_name, 120) || 'Unknown buyer';
    const budgetParts = [display(record.currency, 8), display(record.budget, 30)].filter(Boolean).join(' ');
    const contactRows = [
      detailRow('Buyer', buyer),
      detailRow('Email', record.buyer_email),
      detailRow('Phone', record.buyer_phone),
    ].join('');
    const requestRows = [
      detailRow('Recipient', record.recipient_name),
      detailRow('Experience', record.experience_type),
      detailRow('Budget', budgetParts),
      detailRow('Preferred delivery', record.preferred_delivery_date),
      detailRow('Message present', display(record.message) ? 'Yes' : 'No'),
      detailRow('Booking code state', display(record.booking_code) || 'Missing'),
    ].join('');
    const attributionRows = [
      detailRow('Detected source', record.detected_source),
      detailRow('Declared source', record.declared_source),
      detailRow('Request ID', id),
      detailRow('Created', created),
    ].join('');
    return {
      subject: `New vulcanIQ Gift Card request — ${buyer}`,
      replyTo: validEmail(record.buyer_email) ? display(record.buyer_email, 254) : undefined,
      html: shell(
        'New Gift Card request',
        'A new Gift Card request needs operational review.',
        `${section('Buyer', contactRows)}${section('Gift Card details', requestRows)}${section('Attribution & audit', attributionRows)}`,
        id,
        created,
      ),
    };
  }

  const name = display(record.customer_name, 120) || 'Unknown customer';
  const contactRows = [
    detailRow('Customer', name),
    detailRow('Email', record.customer_email),
    detailRow('Phone', record.customer_phone),
    detailRow('Preferred contact', record.preferred_contact),
  ].join('');
  const bookingRows = [
    detailRow('Request type', record.request_type),
    detailRow('Experience', record.experience_id),
    detailRow('Date', record.requested_date),
    detailRow('Alternative date', record.alternative_date),
    detailRow('Adults', record.adults),
    detailRow('Children', record.children),
    detailRow('Language', record.language),
  ].join('');
  const attributionRows = [
    detailRow('Detected source', record.detected_source || record.traffic_source),
    detailRow('Declared source', record.declared_source || record.heard_about_us),
    detailRow('CTA location', record.cta_location),
    detailRow('Request ID', id),
    detailRow('Created', created),
  ].join('');
  return {
    subject: `New vulcanIQ booking request — ${name}`,
    replyTo: validEmail(record.customer_email) ? display(record.customer_email, 254) : undefined,
    html: shell(
      'New booking request',
      'A new booking request needs operational review.',
      `${section('Customer', contactRows)}${section('Booking details', bookingRows)}${section('Attribution & audit', attributionRows)}`,
      id,
      created,
    ),
  };
}
