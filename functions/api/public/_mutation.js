import { claimPublicRateLimit, clientActorHash, cleanText, json, readJsonBody, supabaseRpc, verifyTurnstile } from './_shared.js';
import { safeFailure } from '../_shared/requestSafety.js';

export function publicMutation(action, prepare, project) {
  return async (context) => {
    const traceId = crypto.randomUUID();
    const reply = (status, body) => json(context.request, context.env, status, { ...body, trace_id: traceId }, { 'X-Trace-Id': traceId, ...(status === 429 ? { 'Retry-After': '3600' } : {}) });
    try {
      const parsed = await readJsonBody(context.request, 16384);
      if (!parsed.ok) return reply(parsed.status, { ok: false, code: parsed.error });
      const actor = await clientActorHash(context.request, context.env);
      if (!await claimPublicRateLimit(context.env, action, actor, { actorLimit: action === 'register_referral_click' ? 30 : 8, globalLimit: 600 })) return reply(429, { ok: false, code: 'rate_limited' });
      const challenge = await verifyTurnstile(context.request, context.env, parsed.value.turnstile_token);
      if (!challenge.ok) return reply(challenge.status || 403, { ok: false, code: challenge.error });
      const args = prepare(parsed.value);
      if (!args) return reply(400, { ok: false, error: 'INVALID_CODE', code: 'INVALID_CODE' });
      const result = await supabaseRpc(context.env, action, args, { traceId });
      const row = Array.isArray(result) ? result[0] : result;
      return reply(200, project(row || {}));
    } catch (error) {
      if (error.message === 'request_creation_failed') return reply(400, { ok: false, error: 'INVALID_CODE', code: 'INVALID_CODE' });
      const failure = safeFailure(error);
      return reply(failure.status, { ok: false, code: failure.code, retryable: failure.retryable });
    }
  };
}

export function bearerCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9-]{6,80}$/.test(code) ? code : null;
}
export function redemptionResult(row) {
  if (row.requires_recipient_claim === true) return { ok: false, error: 'GIFT_CARD_CLAIM_REQUIRED', requires_recipient_claim: true };
  if (!row.ok) return { ok: false, error: 'INVALID_CODE' };
  return { ok: true, code: cleanText(row.code, 80), customer_name: cleanText(row.customer_name, 120), experience_name_it: cleanText(row.experience_name_it, 180), experience_name_en: cleanText(row.experience_name_en, 180), scheduled_date: cleanText(row.scheduled_date, 20), review_enabled: row.review_enabled === true };
}
export function onRequestOptions(context) { return json(context.request, context.env, 204); }
