import { resolveSupabaseBackendCredential, supabaseBackendHeaders } from '../_shared/supabaseBackend.js';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://vulcaniq.it',
  'https://www.vulcaniq.it',
  'https://vulcaniq.pages.dev'
];

export function cleanText(value, maxLength = 220) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/[\u0000-\u001f\u007f]/g, '');
  return text ? text.slice(0, maxLength) : null;
}

export function cleanInteger(value, min = 0, max = 1000) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, number));
}

export function cleanMoney(value, max = 100000) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.min(max, Number(number.toFixed(2)));
}

export function cleanBoolean(value, fallback = false) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function allowedOrigins(env = {}) {
  const configured = String(env.PUBLIC_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;
}

export function corsHeaders(request, env = {}) {
  const origin = cleanText(request.headers.get('Origin'), 240);
  const allowed = allowedOrigins(env);
  const allowOrigin = origin && (allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
    ? origin
    : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  };
}

export function json(request, env, status, body = {}, extraHeaders = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request, env),
      ...(status === 204 ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
      ...extraHeaders
    }
  });
}

export async function readJsonBody(request, maxBytes = 32768) {
  const contentType = String(request.headers.get('Content-Type') || '').toLowerCase();
  if (!contentType.includes('application/json')) return { ok: false, status: 415, error: 'invalid_content_type' };

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > maxBytes) return { ok: false, status: 413, error: 'body_too_large' };

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) return { ok: false, status: 413, error: 'body_too_large' };

  try {
    const value = JSON.parse(text || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, status: 400, error: 'invalid_json' };
    return { ok: true, value };
  } catch {
    return { ok: false, status: 400, error: 'invalid_json' };
  }
}

function supabaseConfig(env = {}) {
  const url = cleanText(env.SUPABASE_URL, 240);
  const backendCredential = resolveSupabaseBackendCredential(env);
  if (!url || !backendCredential) return null;
  return { url: url.replace(/\/$/, ''), backendCredential };
}

export async function supabaseRequest(env, path, init = {}) {
  const config = supabaseConfig(env);
  if (!config) throw new Error('public_endpoint_not_configured');
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...supabaseBackendHeaders(config.backendCredential),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {})
    }
  });
  return response;
}

export async function supabaseRpc(env, functionName, payload, diagnostics = {}) {
  const response = await supabaseRequest(env, `rpc/${encodeURIComponent(functionName)}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    console.error('vulcanIQ public RPC failed', { functionName, status: response.status, traceId: diagnostics.traceId || undefined });
    throw new Error('request_creation_failed');
  }
  return response.json().catch(() => null);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function clientActorHash(request, env = {}) {
  const ip = cleanText(request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown', 100) || 'unknown';
  const salt = String(env.SUBMISSION_HASH_SALT || env.SUPABASE_SERVICE_ROLE_KEY || 'vulcaniq-public-endpoint');
  return sha256(`${salt}:${ip}`);
}

export async function claimPublicRateLimit(env, actionKey, actorHash, options = {}) {
  const response = await supabaseRequest(env, 'rpc/claim_public_submission_rate_limit', {
    method: 'POST',
    body: JSON.stringify({
      p_action_key: cleanText(actionKey, 80),
      p_actor_key: cleanText(actorHash, 128),
      p_actor_limit: Math.max(1, Math.min(100, Number(options.actorLimit || 8))),
      p_global_limit: Math.max(1, Math.min(10000, Number(options.globalLimit || 500))),
      p_window_seconds: Math.max(60, Math.min(86400, Number(options.windowSeconds || 3600)))
    })
  });
  if (!response.ok) return false;
  const payload = await response.json().catch(() => false);
  return payload === true || payload?.allowed === true;
}

export async function verifyTurnstile(request, env, token) {
  const secret = env.TURNSTILE_SECRET_KEY;
  const enforce = String(env.TURNSTILE_ENFORCE || '').toLowerCase() === 'true';
  if (!secret) return { ok: true, skipped: true };
  if (!token) return enforce ? { ok: false, error: 'turnstile_required' } : { ok: true, skipped: true };

  const form = new FormData();
  form.set('secret', secret);
  form.set('response', String(token));
  const ip = cleanText(request.headers.get('CF-Connecting-IP'), 100);
  if (ip) form.set('remoteip', ip);

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form
  });
  const payload = await response.json().catch(() => ({}));
  return payload?.success === true ? { ok: true } : { ok: false, error: 'turnstile_failed' };
}

export function validEmail(value) {
  const email = cleanText(value, 254);
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
}

export function validPhone(value) {
  const phone = cleanText(value, 40);
  if (!phone) return true;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 && /^[+()\-\s.0-9]+$/.test(phone);
}

export function validDate(value) {
  const date = cleanText(value, 20);
  if (!date) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(`${date}T00:00:00Z`).getTime());
}

export function validateAntiAbuseFields(payload) {
  if (cleanText(payload.website || payload.company_website || payload.fax, 200)) {
    return { ok: false, status: 400, error: 'spam_detected' };
  }
  const startedAt = new Date(payload.form_started_at || payload.formStartedAt || 0).getTime();
  const elapsed = Date.now() - startedAt;
  if (startedAt > 0 && elapsed < 1800) return { ok: false, status: 429, error: 'submitted_too_quickly' };
  if (startedAt > 0 && elapsed > 24 * 60 * 60 * 1000) return { ok: false, status: 400, error: 'form_session_expired' };
  return { ok: true };
}

export function idempotencyKey(request, payload, prefix) {
  const raw = cleanText(request.headers.get('Idempotency-Key') || payload.idempotency_key || payload.submission_idempotency_key, 180);
  if (!raw || !/^[a-zA-Z0-9:_-]{12,180}$/.test(raw)) return null;
  return `${prefix}:${raw}`.slice(0, 200);
}

export async function existingRequestByIdempotency(env, table, key) {
  const query = new URLSearchParams({
    select: 'id,created_at',
    idempotency_key: `eq.${key}`,
    limit: '1'
  });
  const response = await supabaseRequest(env, `${table}?${query.toString()}`, { method: 'GET' });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export function publicErrorMessage(error) {
  const messages = {
    invalid_content_type: 'Invalid request format.',
    body_too_large: 'Request body is too large.',
    invalid_json: 'Invalid request format.',
    spam_detected: 'Request rejected.',
    submitted_too_quickly: 'Please wait a moment and try again.',
    form_session_expired: 'The form session expired. Reopen the form and try again.',
    turnstile_required: 'Human verification is required.',
    turnstile_failed: 'Human verification failed.',
    rate_limited: 'Too many requests. Please try again later.',
    invalid_contact: 'Enter a valid email address or phone number.',
    terms_actor_name_required: 'Enter the organizer name.',
    terms_acceptance_required: 'Read and accept the applicable Terms before sending the request.',
    terms_or_request_rejected: 'The request or Terms acceptance could not be recorded. Refresh the Terms and try again.',
    recipient_name_invalid: 'Enter the recipient name.',
    recipient_contact_required: 'Enter a recipient email address or phone number.',
    recipient_email_invalid: 'Enter a valid recipient email address.',
    recipient_phone_invalid: 'Enter a valid recipient phone number.',
    recipient_language_invalid: 'Choose Italian or English.',
    booking_code_required: 'Enter a booking code.',
    booking_code_not_found: 'Booking code not found.',
    booking_code_already_redeemed: 'This booking code has already been used.',
    booking_code_cancelled: 'This booking code has been cancelled.',
    booking_code_expired: 'This booking code has expired.',
    gift_card_code_required: 'This code is not a Gift Card code.',
    gift_card_cancelled: 'This Gift Card has been cancelled.',
    gift_card_not_claimable: 'This Gift Card cannot be claimed.',
    gift_card_claim_failed: 'The Gift Card could not be claimed.',
    invalid_date: 'Enter a valid date.',
    invalid_idempotency_key: 'Invalid submission identifier.',
    missing_required_fields: 'Complete the required fields.',
    request_creation_failed: 'The request could not be saved.'
  };
  return messages[error] || messages.request_creation_failed;
}
