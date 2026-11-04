// Provider endpoints are opaque after the documented routing prefix. No redirect
// or caller-controlled origin is permitted. See AUDIT_NOTIFICATIONS_20261027.md.
export function validPushEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2000 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || /%/.test(value.split('/')[2] || '')) return false;
    if (url.hostname === 'fcm.googleapis.com') return /^\/(?:fcm\/send|wp)\/[^/]+/.test(url.pathname);
    if (url.hostname === 'updates.push.services.mozilla.com') return /^\/wpush\/(?:v[12]\/)?[^/]+/.test(url.pathname);
    if (/^[a-z0-9-]+\.push\.apple\.com$/.test(url.hostname)) return url.pathname.length > 1;
    if (/^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)) return /^\/(?:w\/)?$/.test(url.pathname) && Boolean(url.searchParams.get('token'));
    return false;
  } catch { return false; }
}

export async function validatePushSubscription(subscription) {
  if (!validPushEndpoint(subscription?.endpoint)) return false;
  try {
    const decode = (value, length) => {
      if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length !== Math.ceil(length * 4 / 3)) throw new Error('key');
      return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), (c) => c.charCodeAt(0));
    };
    const key = decode(subscription.p256dh, 65), auth = decode(subscription.auth, 16);
    if (key.length !== 65 || key[0] !== 4 || auth.length !== 16) return false;
    await crypto.subtle.importKey('raw', key, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    return true;
  } catch { return false; }
}

export function ownedPreferenceColumn(category) {
  if (category === 'customer_upcoming_reminder' || category === 'customer_participant_terms_reminder') return 'reminders_enabled';
  if (category === 'customer_review_reminder') return 'review_reminders_enabled';
  if (category === 'customer_operational_change') return 'operational_updates_enabled';
  return 'status_updates_enabled';
}

export async function claimRate(database, key, limit, seconds, now = new Date()) {
  const cutoff = new Date(now.getTime() - seconds * 1000).toISOString();
  const row = await database.prepare(`INSERT INTO notification_rate_limits(rate_key,window_started_at,hits) VALUES(?,?,1)
    ON CONFLICT(rate_key) DO UPDATE SET
      window_started_at=CASE WHEN window_started_at<=? THEN excluded.window_started_at ELSE window_started_at END,
      hits=CASE WHEN window_started_at<=? THEN 1 ELSE hits+1 END
    WHERE window_started_at<=? OR hits<? RETURNING hits`).bind(key,now.toISOString(),cutoff,cutoff,cutoff,limit).first();
  return Boolean(row);
}

export async function enrollmentBudget(request, env, database, action, deviceHash) {
  // Cloudflare supplies request.cf and overwrites CF-Connecting-IP. A header
  // alone (including on local dev) is deliberately not an identity signal.
  const ip = request.cf ? request.headers.get('CF-Connecting-IP') : null;
  if (!ip || !env.NOTIFICATION_RATE_HASH_SECRET) return { status: 503, error: 'notification_rate_context_unavailable' };
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(env.NOTIFICATION_RATE_HASH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${action}:${ip}`));
  const actor = [...new Uint8Array(bytes)].map((b)=>b.toString(16).padStart(2,'0')).join('');
  if (!await claimRate(database,`global:${action}`,action==='test'?100:500,3600)
    || !await claimRate(database,`actor:${action}:${actor}`,action==='test'?10:60,3600)
    || !await claimRate(database,`device:${action}:${deviceHash}`,action==='test'?1:12,action==='test'?60:3600)) return {status:429,error:'rate_limited',retryAfter:60};
  return null;
}

export async function reservePush(database, env, event = null) {
  const cap = Math.max(1, Math.min(10000, Number(env.NOTIFICATION_PUBLIC_DAILY_SEND_CAP) || 1000));
  const fraction=!event||event.audience==='admin'&&event.priority==='critical'?1:['promotions','daily_summary','weekly_summary','etna_weekly'].includes(event.category)?0.85:0.95;
  const max=Math.max(1,Math.floor(cap*fraction));
  const now = new Date().toISOString();
  const row = await database.prepare(`INSERT INTO notification_usage_counters(counter_date,counter_key,counter_value,updated_at) VALUES(?,'push_attempts',1,?)
    ON CONFLICT(counter_date,counter_key) DO UPDATE SET counter_value=counter_value+1,updated_at=excluded.updated_at
    WHERE counter_value<? RETURNING counter_value`).bind(now.slice(0,10),now,max).first();
  return Boolean(row);
}
