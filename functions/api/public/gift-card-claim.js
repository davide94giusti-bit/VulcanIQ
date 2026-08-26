import {
  claimPublicRateLimit,
  cleanText,
  clientActorHash,
  json,
  publicErrorMessage,
  readJsonBody,
  supabaseRpc,
  validEmail,
  validPhone
} from './_shared.js';

const ALLOWED_LANGUAGES = new Set(['it', 'en']);
const PUBLIC_ERROR_CODES = new Set([
  'BOOKING_CODE_REQUIRED',
  'BOOKING_CODE_NOT_FOUND',
  'BOOKING_CODE_ALREADY_REDEEMED',
  'BOOKING_CODE_CANCELLED',
  'BOOKING_CODE_EXPIRED',
  'GIFT_CARD_CODE_REQUIRED',
  'GIFT_CARD_CANCELLED',
  'GIFT_CARD_NOT_CLAIMABLE',
  'RECIPIENT_NAME_INVALID',
  'RECIPIENT_CONTACT_REQUIRED',
  'RECIPIENT_EMAIL_INVALID',
  'RECIPIENT_PHONE_INVALID',
  'RECIPIENT_LANGUAGE_INVALID'
]);

function normalizeCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 80);
}

function publicCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return PUBLIC_ERROR_CODES.has(code) ? code : 'GIFT_CARD_CLAIM_FAILED';
}

function errorStatus(code) {
  if (code === 'BOOKING_CODE_NOT_FOUND') return 404;
  if (['BOOKING_CODE_ALREADY_REDEEMED', 'BOOKING_CODE_CANCELLED', 'BOOKING_CODE_EXPIRED', 'GIFT_CARD_CANCELLED', 'GIFT_CARD_NOT_CLAIMABLE'].includes(code)) return 409;
  return 400;
}

function errorMessage(code) {
  return publicErrorMessage(String(code || 'gift_card_claim_failed').toLowerCase());
}

export async function onRequestOptions(context) {
  return json(context.request, context.env, 204);
}

export async function onRequestPost(context) {
  const traceId = crypto.randomUUID();
  const respond = (status, body = {}) => json(
    context.request,
    context.env,
    status,
    { ...body, trace_id: traceId },
    { 'X-Trace-Id': traceId }
  );
  const parsed = await readJsonBody(context.request, 8192);
  if (!parsed.ok) return respond(parsed.status, { ok: false, code: parsed.error, message: publicErrorMessage(parsed.error) });

  const input = parsed.value;
  const code = normalizeCode(input.code);
  const rawName = String(input.recipient_name || '').trim();
  const rawEmail = String(input.recipient_email || '').trim();
  const rawPhone = String(input.recipient_phone || '').trim();
  const recipientName = cleanText(input.recipient_name, 120);
  const recipientEmail = cleanText(rawEmail, 254)?.toLowerCase() || null;
  const recipientPhone = cleanText(rawPhone, 40);
  const language = cleanText(input.language, 8)?.toLowerCase() || '';

  if (!code) return respond(400, { ok: false, code: 'BOOKING_CODE_REQUIRED', message: errorMessage('BOOKING_CODE_REQUIRED') });
  if (!recipientName || rawName.length > 120) return respond(400, { ok: false, code: 'RECIPIENT_NAME_INVALID', message: errorMessage('RECIPIENT_NAME_INVALID') });
  if (rawEmail.length > 254) return respond(400, { ok: false, code: 'RECIPIENT_EMAIL_INVALID', message: errorMessage('RECIPIENT_EMAIL_INVALID') });
  if (rawPhone.length > 40) return respond(400, { ok: false, code: 'RECIPIENT_PHONE_INVALID', message: errorMessage('RECIPIENT_PHONE_INVALID') });
  if (!recipientEmail && !recipientPhone) return respond(400, { ok: false, code: 'RECIPIENT_CONTACT_REQUIRED', message: errorMessage('RECIPIENT_CONTACT_REQUIRED') });
  if (!validEmail(recipientEmail)) return respond(400, { ok: false, code: 'RECIPIENT_EMAIL_INVALID', message: errorMessage('RECIPIENT_EMAIL_INVALID') });
  if (!validPhone(recipientPhone)) return respond(400, { ok: false, code: 'RECIPIENT_PHONE_INVALID', message: errorMessage('RECIPIENT_PHONE_INVALID') });
  if (!ALLOWED_LANGUAGES.has(language)) return respond(400, { ok: false, code: 'RECIPIENT_LANGUAGE_INVALID', message: errorMessage('RECIPIENT_LANGUAGE_INVALID') });

  const actorHash = await clientActorHash(context.request, context.env);
  const allowed = await claimPublicRateLimit(context.env, 'gift_card_claim', actorHash, { actorLimit: 8, globalLimit: 600, windowSeconds: 3600 });
  if (!allowed) return respond(429, { ok: false, code: 'rate_limited', message: publicErrorMessage('rate_limited') });

  try {
    const result = await supabaseRpc(context.env, 'redeem_gift_card_booking_code', {
      p_code: code,
      p_recipient_name: recipientName,
      p_recipient_email: recipientEmail,
      p_recipient_phone: recipientPhone,
      p_language: language
    }, { traceId });
    const claim = Array.isArray(result) ? result[0] : result;
    if (!claim?.ok) {
      const codeValue = publicCode(claim?.error);
      return respond(errorStatus(codeValue), { ok: false, code: codeValue, message: errorMessage(codeValue) });
    }

    // Keep the browser response celebration-compatible and free of internal UUIDs or purchaser PII.
    return respond(200, {
      ok: true,
      code: cleanText(claim.code, 80),
      customer_name: cleanText(claim.customer_name, 120),
      experience_name_it: cleanText(claim.experience_name_it, 180),
      experience_name_en: cleanText(claim.experience_name_en, 180),
      scheduled_date: cleanText(claim.scheduled_date, 20),
      review_enabled: claim.review_enabled === true
    });
  } catch {
    console.error('vulcanIQ Gift Card claim failed', { traceId, code: 'gift_card_claim_failed' });
    return respond(500, { ok: false, code: 'GIFT_CARD_CLAIM_FAILED', message: errorMessage('GIFT_CARD_CLAIM_FAILED') });
  }
}
