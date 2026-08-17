const encoder = new TextEncoder();

export const corsHeaders: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage, x-vulcaniq-cron-secret, x-vulcaniq-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

export function corsPreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response('ok', { status: 200, headers: corsHeaders });
}

export function env(name: string, required = true): string {
  const value = (Deno.env.get(name) || '').trim();
  if (required && !value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

export async function readJson(req: Request, maxBytes = 65536): Promise<Record<string, unknown>> {
  const contentType = (req.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) throw new Error('invalid_content_type');
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error('body_too_large');
  const text = await req.text();
  if (encoder.encode(text).byteLength > maxBytes) throw new Error('body_too_large');
  let value: unknown;
  try {
    value = JSON.parse(text || '{}');
  } catch {
    throw new Error('invalid_json');
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('invalid_json');
  return value as Record<string, unknown>;
}

export function clean(value: unknown, max = 240): string {
  return String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

export function escapeHtml(value: unknown): string {
  return clean(value, 5000)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function validEmail(value: unknown): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(clean(value, 254));
}

export function recipients(name: string): string[] {
  return [...new Set(env(name).split(',').map((item) => item.trim().toLowerCase()).filter(validEmail))];
}

export function supabaseHeaders(extra: HeadersInit = {}): HeadersInit {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  return { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...extra };
}

export async function db(path: string, init: RequestInit = {}): Promise<Response> {
  const base = env('SUPABASE_URL').replace(/\/$/, '');
  return fetch(`${base}/rest/v1/${path}`, { ...init, headers: supabaseHeaders(init.headers) });
}

export async function dbJson(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await db(path, init);
  if (!response.ok) {
    console.error('database_request_failed', { path: path.split('?')[0], status: response.status });
    throw new Error('database_request_failed');
  }
  return response.status === 204 ? null : response.json().catch(() => null);
}

export async function resendEmail(input: { to: string; subject: string; html: string; replyTo?: string; from?: string }): Promise<string> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: input.from || env('REQUEST_NOTIFICATION_FROM_EMAIL', false) || 'vulcanIQ Notifications <bookings@notify.vulcaniq.it>',
      to: [input.to],
      subject: input.subject.slice(0, 180),
      html: input.html.slice(0, 80000),
      ...(input.replyTo && validEmail(input.replyTo) ? { reply_to: input.replyTo } : {})
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) {
    console.error('resend_delivery_failed', { status: response.status });
    throw new Error('email_delivery_failed');
  }
  return String(payload.id);
}

export async function claimAdminAction(action: string, userId: string, limit = 3, windowSeconds = 300): Promise<boolean> {
  const value = await dbJson('rpc/claim_admin_action_rate_limit', {
    method: 'POST',
    body: JSON.stringify({
      p_action_key: clean(action, 70),
      p_actor_key: clean(userId, 180),
      p_limit: Math.max(1, Math.min(100, Math.trunc(limit))),
      p_window_seconds: Math.max(60, Math.min(86400, Math.trunc(windowSeconds)))
    })
  });
  return value === true;
}

export async function requireAdmin(req: Request): Promise<string> {
  const auth = clean(req.headers.get('authorization'), 4096);
  if (!auth.toLowerCase().startsWith('bearer ')) throw new Error('unauthorized');
  const supabaseUrl = env('SUPABASE_URL').replace(/\/$/, '');
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), authorization: auth } });
  if (!userResponse.ok) throw new Error('unauthorized');
  const user = await userResponse.json();
  const userId = clean(user?.id, 80);
  if (!userId) throw new Error('unauthorized');
  const query = new URLSearchParams({ select: 'user_id,role,active', user_id: `eq.${userId}`, active: 'eq.true', limit: '1' });
  const rows = await dbJson(`admin_profiles?${query.toString()}`, { method: 'GET' }) as Array<Record<string, unknown>>;
  if (!Array.isArray(rows) || !rows.length || !['owner', 'manager'].includes(clean(rows[0].role, 20).toLowerCase())) throw new Error('forbidden');
  return userId;
}

export function iso(value: unknown): string | null {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
