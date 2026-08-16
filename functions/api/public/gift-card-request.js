import {
  claimPublicRateLimit,
  cleanMoney,
  cleanText,
  clientActorHash,
  existingRequestByIdempotency,
  idempotencyKey,
  json,
  publicErrorMessage,
  readJsonBody,
  supabaseRpc,
  validDate,
  validEmail,
  validPhone,
  validateAntiAbuseFields,
  verifyTurnstile
} from './_shared.js';

function giftCardPayload(input, key, actorHash) {
  return {
    buyer_name: cleanText(input.buyer_name || input.buyerName, 120),
    buyer_email: cleanText(input.buyer_email || input.buyerEmail, 254),
    buyer_phone: cleanText(input.buyer_phone || input.buyerPhone, 40),
    buyer_preferred_language: input.buyer_preferred_language === 'en' || input.language === 'en' ? 'en' : 'it',
    recipient_name: cleanText(input.recipient_name || input.recipientName, 120),
    experience_type: cleanText(input.experience_type || input.experienceType, 180),
    budget: cleanMoney(input.budget),
    currency: cleanText(input.currency, 8)?.toUpperCase() || 'EUR',
    message: cleanText(input.message, 2500),
    preferred_delivery_date: cleanText(input.preferred_delivery_date || input.preferredDeliveryDate, 20),
    detected_source: cleanText(input.detected_source || input.traffic_source, 80),
    declared_source: cleanText(input.declared_source || input.heard_about_us, 80),
    utm_source: cleanText(input.utm_source, 120),
    utm_medium: cleanText(input.utm_medium, 120),
    utm_campaign: cleanText(input.utm_campaign, 160),
    utm_content: cleanText(input.utm_content, 160),
    utm_term: cleanText(input.utm_term, 160),
    referrer: cleanText(input.referrer, 500),
    landing_path: cleanText(input.landing_path, 500),
    analytics_session_id: cleanText(input.analytics_session_id, 160),
    analytics_visitor_id: cleanText(input.analytics_visitor_id, 160),
    analytics_journey_id: cleanText(input.analytics_journey_id, 180),
    idempotency_key: key,
    submission_fingerprint: cleanText(input.submission_fingerprint, 180),
    submission_actor_hash: actorHash
  };
}

export async function onRequestOptions(context) {
  return json(context.request, context.env, 204);
}

export async function onRequestPost(context) {
  const parsed = await readJsonBody(context.request, 24576);
  if (!parsed.ok) return json(context.request, context.env, parsed.status, { ok: false, code: parsed.error, message: publicErrorMessage(parsed.error) });

  const input = parsed.value;
  const antiAbuse = validateAntiAbuseFields(input);
  if (!antiAbuse.ok) return json(context.request, context.env, antiAbuse.status, { ok: false, code: antiAbuse.error, message: publicErrorMessage(antiAbuse.error) });

  const turnstile = await verifyTurnstile(context.request, context.env, input.turnstile_token);
  if (!turnstile.ok) return json(context.request, context.env, 403, { ok: false, code: turnstile.error, message: publicErrorMessage(turnstile.error) });

  const key = idempotencyKey(context.request, input, 'gift_card');
  if (!key) return json(context.request, context.env, 400, { ok: false, code: 'invalid_idempotency_key', message: publicErrorMessage('invalid_idempotency_key') });

  const existing = await existingRequestByIdempotency(context.env, 'gift_card_requests', key);
  if (existing?.id) return json(context.request, context.env, 200, { ok: true, duplicate: true, id: existing.id, created_at: existing.created_at });

  const email = input.buyer_email || input.buyerEmail;
  const phone = input.buyer_phone || input.buyerPhone;
  if (!validEmail(email) || !validPhone(phone) || (!cleanText(email) && !cleanText(phone))) {
    return json(context.request, context.env, 400, { ok: false, code: 'invalid_contact', message: publicErrorMessage('invalid_contact') });
  }
  if (!validDate(input.preferred_delivery_date || input.preferredDeliveryDate)) {
    return json(context.request, context.env, 400, { ok: false, code: 'invalid_date', message: publicErrorMessage('invalid_date') });
  }
  if (!cleanText(input.buyer_name || input.buyerName) || !cleanText(input.recipient_name || input.recipientName)) {
    return json(context.request, context.env, 400, { ok: false, code: 'missing_required_fields', message: publicErrorMessage('missing_required_fields') });
  }

  const actorHash = await clientActorHash(context.request, context.env);
  const allowed = await claimPublicRateLimit(context.env, 'gift_card_request', actorHash, { actorLimit: 6, globalLimit: 300, windowSeconds: 3600 });
  if (!allowed) return json(context.request, context.env, 429, { ok: false, code: 'rate_limited', message: publicErrorMessage('rate_limited') });

  try {
    const result = await supabaseRpc(context.env, 'create_public_gift_card_request', { request_payload: giftCardPayload(input, key, actorHash) });
    const created = Array.isArray(result) ? result[0] : result;
    if (!created?.id) throw new Error('request_creation_failed');
    return json(context.request, context.env, 201, { ok: true, id: created.id, status: created.status || 'new', created_at: created.created_at });
  } catch {
    return json(context.request, context.env, 500, { ok: false, code: 'request_creation_failed', message: publicErrorMessage('request_creation_failed') });
  }
}
