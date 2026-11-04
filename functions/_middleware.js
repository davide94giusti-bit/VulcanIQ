import { safeFailure } from './api/_shared/requestSafety.js';

export async function onRequest(context) {
  const traceId = crypto.randomUUID();
  let response;
  try {
    const url = new URL(context.request.url);
    const origin = context.request.headers.get('Origin');
    const allowed = String(context.env?.PUBLIC_ALLOWED_ORIGINS || 'https://vulcaniq.it,https://www.vulcaniq.it,https://vulcaniq.pages.dev').split(',').map((item) => item.trim());
    if ((url.pathname.startsWith('/api/public/') || url.pathname.startsWith('/api/analytics/')) && origin && origin !== url.origin && !allowed.includes(origin)) response = Response.json({ ok: false, code: 'origin_not_allowed', trace_id: traceId }, { status: 403 });
    else response = await context.next();
  }
  catch (error) {
    const failure = safeFailure(error);
    console.error('request_failed', { trace_id: traceId, code: failure.code });
    response = Response.json({ ok: false, ...failure, trace_id: traceId }, { status: failure.status });
  }
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=(), usb=()');
  const csp = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://static.cloudflareinsights.com https://challenges.cloudflare.com; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://cloudflareinsights.com https://static.cloudflareinsights.com https://challenges.cloudflare.com; frame-src 'self' https://*.supabase.co https://challenges.cloudflare.com; manifest-src 'self'; worker-src 'self' blob:";
  headers.set(context.env?.CSP_ENFORCE === 'true' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', csp);
  if (new URL(context.request.url).protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000');
  headers.set('X-Trace-Id', headers.get('X-Trace-Id') || traceId);
  const path = new URL(context.request.url).pathname;
  if (path.startsWith('/api/') || path.startsWith('/admin')) headers.set('Cache-Control', 'no-store');
  if (path.startsWith('/admin')) headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
