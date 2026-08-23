import { sendEmptyWebPush } from '../../../shared/webPush.js';

const PUBLIC_CATEGORIES = new Set(['etna_updates', 'etna_weekly', 'experiences', 'events', 'news', 'promotions']);
const ADMIN_CATEGORIES = new Set(['new_bookings', 'upcoming_excursions', 'gift_cards', 'booking_codes', 'payment_reconciliation', 'operational_failures', 'security_alerts', 'daily_summary', 'weekly_summary']);
const CAMPAIGN_CATEGORIES = new Set(['experiences', 'events', 'news', 'promotions']);
const DEFAULT_PUBLIC_CATEGORIES = ['etna_updates', 'etna_weekly', 'experiences', 'events', 'news'];
const DEFAULT_ADMIN_CATEGORIES = ['new_bookings', 'upcoming_excursions', 'gift_cards', 'booking_codes', 'payment_reconciliation', 'operational_failures', 'security_alerts'];
const DEFAULT_ORIGINS = ['https://vulcaniq.it', 'https://www.vulcaniq.it', 'https://vulcaniq.pages.dev'];

function text(value, max = 500) { return String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max); }
function nowIso() { return new Date().toISOString(); }
function uuid() { return crypto.randomUUID(); }
function allowedOrigins(env = {}) { const configured = text(env.PUBLIC_ALLOWED_ORIGINS, 1000).split(',').map((v) => v.trim()).filter(Boolean); return configured.length ? configured : DEFAULT_ORIGINS; }
function cors(request, env) {
  const origin = text(request.headers.get('Origin'), 240);
  const allowed = allowedOrigins(env);
  const trustedOrigin = origin && (allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return {
    ...(trustedOrigin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' } : {}),
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Notification-Device,X-Notification-Token,X-Notification-Ingest-Key',
    'Access-Control-Max-Age': '86400', Vary: 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
  };
}
function json(request, env, status, body = {}) { return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { ...cors(request, env), ...(status === 204 ? {} : { 'Content-Type': 'application/json; charset=utf-8' }) } }); }
async function body(request, maxBytes = 32768) {
  const length = Number(request.headers.get('Content-Length') || 0); if (length > maxBytes) return { error: 'body_too_large', status: 413 };
  try { const raw = await request.text(); if (new TextEncoder().encode(raw).byteLength > maxBytes) return { error: 'body_too_large', status: 413 }; const value = JSON.parse(raw || '{}'); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return { value }; } catch { return { error: 'invalid_json', status: 400 }; }
}
async function hash(value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))); return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
function db(env) { if (!env.NOTIFICATIONS_DB) throw new Error('notifications_db_not_configured'); return env.NOTIFICATIONS_DB; }
function bearer(request) { return (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || ''; }
function supabaseConfig(env) {
  const url = text(env.SUPABASE_URL || env.VITE_SUPABASE_URL, 300).replace(/\/$/, '');
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && anon && service ? { url, anon, service } : null;
}
async function requireAdmin(request, env) {
  const token = bearer(request); const config = supabaseConfig(env); if (!token || !config) return { response: json(request, env, !token ? 401 : 503, { ok: false, error: !token ? 'admin_auth_required' : 'admin_auth_not_configured' }) };
  const userRes = await fetch(`${config.url}/auth/v1/user`, { headers: { apikey: config.anon, Authorization: `Bearer ${token}` } });
  if (!userRes.ok) return { response: json(request, env, 401, { ok: false, error: 'invalid_admin_session' }) };
  const user = await userRes.json();
  const params = new URLSearchParams({ select: 'user_id,role,active', user_id: `eq.${user.id}`, active: 'eq.true', limit: '1' });
  const profileRes = await fetch(`${config.url}/rest/v1/admin_profiles?${params}`, { headers: { apikey: config.service, Authorization: `Bearer ${config.service}`, Accept: 'application/json' } });
  const rows = profileRes.ok ? await profileRes.json() : [];
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile?.active) return { response: json(request, env, 403, { ok: false, error: 'admin_forbidden' }) };
  return { user, profile };
}
function cleanLanguage(value) { return ['auto', 'it', 'en'].includes(value) ? value : 'auto'; }
function cleanLocale(value) { return value === 'en' ? 'en' : 'it'; }
function cleanCategories(audience, values) { const allowed = audience === 'admin' ? ADMIN_CATEGORIES : PUBLIC_CATEGORIES; const input = Array.isArray(values) ? values : []; return [...new Set(input.map((v) => text(v, 60)).filter((v) => allowed.has(v)))]; }
function validTime(value) { return !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
function endpointValid(value) { try { return new URL(value).protocol === 'https:'; } catch { return false; } }
async function audit(database, eventType, fields = {}) {
  const metadata = fields.metadata ? JSON.stringify(fields.metadata) : null;
  await database.prepare('INSERT INTO notification_audit_log (id,event_type,audience,actor_id,subscription_id,campaign_id,outcome,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(uuid(), eventType, fields.audience || null, fields.actorId || null, fields.subscriptionId || null, fields.campaignId || null, fields.outcome || 'ok', metadata, nowIso()).run();
}
async function rateLimit(database, key, limit, seconds) {
  const now = Date.now(); const row = await database.prepare('SELECT window_started_at,hits FROM notification_rate_limits WHERE rate_key=?').bind(key).first();
  const started = row ? Date.parse(row.window_started_at) : 0;
  if (!row || !Number.isFinite(started) || now - started >= seconds * 1000) { await database.prepare('INSERT INTO notification_rate_limits(rate_key,window_started_at,hits) VALUES(?,?,1) ON CONFLICT(rate_key) DO UPDATE SET window_started_at=excluded.window_started_at,hits=1').bind(key, nowIso()).run(); return true; }
  if (Number(row.hits || 0) >= limit) return false;
  await database.prepare('UPDATE notification_rate_limits SET hits=hits+1 WHERE rate_key=?').bind(key).run(); return true;
}
async function ownerContext(request, env, audience) {
  const deviceId = text(request.headers.get('X-Notification-Device'), 120); const deviceToken = text(request.headers.get('X-Notification-Token'), 240);
  if (!deviceId || !deviceToken) return { response: json(request, env, 401, { ok: false, error: 'device_identity_required' }) };
  const tokenHash = await hash(deviceToken);
  if (audience === 'admin') { const auth = await requireAdmin(request, env); if (auth.response) return auth; return { deviceId, tokenHash, ...auth }; }
  return { deviceId, tokenHash };
}
async function resolveSubscription(database, ctx, audience) {
  const sql = audience === 'admin'
    ? 'SELECT * FROM notification_subscriptions WHERE audience=? AND device_id=? AND device_token_hash=? AND admin_user_id=? LIMIT 1'
    : 'SELECT * FROM notification_subscriptions WHERE audience=? AND device_id=? AND device_token_hash=? LIMIT 1';
  return audience === 'admin'
    ? database.prepare(sql).bind(audience, ctx.deviceId, ctx.tokenHash, ctx.user.id).first()
    : database.prepare(sql).bind(audience, ctx.deviceId, ctx.tokenHash).first();
}
function requestAudience(url) { return url.searchParams.get('audience') === 'admin' ? 'admin' : 'public'; }
function parseJson(value, fallback = []) { try { return JSON.parse(value); } catch { return fallback; } }
function localMinutes(date, timezone) {
  try { const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone || 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date); return Number(parts.find((p) => p.type === 'hour')?.value || 0) * 60 + Number(parts.find((p) => p.type === 'minute')?.value || 0); } catch { return null; }
}
function inQuietHours(pref, date = new Date()) {
  if (!pref?.quiet_hours_enabled || !validTime(pref.quiet_start) || !validTime(pref.quiet_end) || !pref.quiet_start || !pref.quiet_end) return false;
  const toMin = (v) => Number(v.slice(0,2))*60 + Number(v.slice(3)); const now = localMinutes(date, pref.timezone); if (now === null) return false;
  const start = toMin(pref.quiet_start), end = toMin(pref.quiet_end); return start === end ? false : start < end ? now >= start && now < end : now >= start || now < end;
}
async function increment(database, key, amount = 1) { const day = nowIso().slice(0,10); await database.prepare('INSERT INTO notification_usage_counters(counter_date,counter_key,counter_value,updated_at) VALUES(?,?,?,?) ON CONFLICT(counter_date,counter_key) DO UPDATE SET counter_value=counter_value+excluded.counter_value,updated_at=excluded.updated_at').bind(day,key,amount,nowIso()).run(); }
async function budget(database, env) {
  const day = nowIso().slice(0,10); const row = await database.prepare("SELECT counter_value FROM notification_usage_counters WHERE counter_date=? AND counter_key='push_attempts'").bind(day).first();
  const attempts = Number(row?.counter_value || 0); const cap = Math.max(1, Number(env.NOTIFICATION_PUBLIC_DAILY_SEND_CAP || 1000)); const pct = attempts / cap * 100;
  const warning = Number(env.NOTIFICATION_WARNING_PERCENT || 70), conservation = Number(env.NOTIFICATION_CONSERVATION_PERCENT || 85), hard = Number(env.NOTIFICATION_HARD_STOP_PERCENT || 95);
  const mode = pct >= hard ? 'HARD_SAFETY' : pct >= conservation ? 'CONSERVATION' : pct >= warning ? 'WARNING' : 'NORMAL'; return { mode, attempts, cap, percent: Number(pct.toFixed(1)) };
}
function allowedByBudget(mode, event) { if (mode === 'NORMAL' || mode === 'WARNING') return true; if (mode === 'CONSERVATION') return !['promotions','daily_summary','weekly_summary','etna_weekly'].includes(event.category); if (mode === 'HARD_SAFETY') return event.audience === 'admin' && event.priority === 'critical'; return true; }
async function fanout(database, env, event) {
  const budgetState = await budget(database, env); if (!allowedByBudget(budgetState.mode, event)) { await audit(database, 'notification_suppressed_budget', { audience: event.audience, outcome: budgetState.mode, metadata: { category: event.category } }); return { attempted: 0, sent: 0, failed: 0, suppressed: true, budget: budgetState }; }
  const maxBatch = Math.max(1, Math.min(1000, Number(env.NOTIFICATION_BROADCAST_BATCH_CAP || 250)));
  const result = await database.prepare(`SELECT s.*,p.language_preference,p.resolved_locale,p.categories_json,p.quiet_hours_enabled,p.quiet_start,p.quiet_end,p.timezone FROM notification_subscriptions s JOIN notification_preferences p ON p.subscription_id=s.id WHERE s.audience=? AND s.enabled=1 LIMIT ${maxBatch}`).bind(event.audience).all();
  let attempted=0,sent=0,failed=0;
  for (const sub of result.results || []) {
    const categories = parseJson(sub.categories_json, []); if (!categories.includes(event.category)) continue;
    if (event.language_target && event.language_target !== 'all' && sub.resolved_locale !== event.language_target) continue;
    const locale = cleanLocale(sub.resolved_locale); const title = locale === 'it' ? event.title_it : event.title_en; const bodyText = locale === 'it' ? event.body_it : event.body_en;
    const inboxId = uuid(); await database.prepare('INSERT INTO notification_inbox(id,event_id,subscription_id,audience,category,title,body,destination_url,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(inboxId,event.id,sub.id,event.audience,event.category,title,bodyText,event.destination_url || null,nowIso()).run();
    const quiet = inQuietHours(sub) && event.priority !== 'critical'; if (quiet || !endpointValid(sub.endpoint)) continue;
    attempted += 1; await increment(database, 'push_attempts');
    const push = await sendEmptyWebPush(sub, env, { urgency: event.priority === 'critical' ? 'high' : 'normal' });
    if (push.ok) { sent += 1; await increment(database, 'push_success'); } else { failed += 1; await increment(database, 'push_failed'); if (push.dead) await database.prepare('UPDATE notification_subscriptions SET endpoint=?,p256dh=NULL,auth=NULL,enabled=1,updated_at=? WHERE id=?').bind(`inapp://${event.audience}/${(await hash(sub.device_id)).slice(0,32)}`,nowIso(),sub.id).run(); }
  }
  return { attempted, sent, failed, suppressed: false, budget: budgetState };
}

export async function onRequest(context) {
  const { request, env } = context; if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request, env) });
  const url = new URL(request.url); const path = url.pathname.replace(/^\/api\/notifications\/?/, '').split('/').filter(Boolean); const route = path[0] || 'status';
  let database; try { database = db(env); } catch { return json(request, env, 503, { ok: false, error: 'notifications_not_configured' }); }
  const audience = requestAudience(url);
  try {
    if (route === 'status' && request.method === 'GET') {
      const b = await budget(database, env); return json(request, env, 200, { ok: true, configured: Boolean(env.VAPID_PUBLIC_KEY), vapidPublicKey: env.VAPID_PUBLIC_KEY || '', audience, budgetMode: b.mode });
    }

    if (route === 'device' && request.method === 'POST') {
      const parsed = await body(request); if (parsed.error) return json(request, env, parsed.status, { ok:false,error:parsed.error });
      const requestedAudience = parsed.value.audience === 'admin' ? 'admin' : 'public';
      const ctx = await ownerContext(request, env, requestedAudience); if (ctx.response) return ctx.response;
      if (!(await rateLimit(database, `device:${ctx.tokenHash}`, 12, 3600))) return json(request, env, 429, { ok:false,error:'rate_limited' });
      const categories = cleanCategories(requestedAudience, parsed.value.categories?.length ? parsed.value.categories : requestedAudience === 'admin' ? DEFAULT_ADMIN_CATEGORIES : DEFAULT_PUBLIC_CATEGORIES);
      if (requestedAudience === 'public' && Array.isArray(parsed.value.categories) && parsed.value.categories.some((c) => ADMIN_CATEGORIES.has(c))) return json(request, env, 403, { ok:false,error:'admin_category_forbidden' });
      const id = uuid(), now = nowIso(), inAppEndpoint = `inapp://${requestedAudience}/${(await hash(ctx.deviceId)).slice(0,32)}`;
      await database.prepare(`INSERT INTO notification_subscriptions(id,audience,app_variant,admin_user_id,device_id,device_token_hash,endpoint,p256dh,auth,enabled,platform,user_agent,created_at,updated_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?,?,?) ON CONFLICT(audience,device_id) DO UPDATE SET admin_user_id=excluded.admin_user_id,device_token_hash=excluded.device_token_hash,enabled=1,platform=excluded.platform,user_agent=excluded.user_agent,updated_at=excluded.updated_at,last_seen_at=excluded.last_seen_at`)
        .bind(id,requestedAudience,requestedAudience,requestedAudience==='admin'?ctx.user.id:null,ctx.deviceId,ctx.tokenHash,inAppEndpoint,null,null,text(parsed.value.platform,80),text(request.headers.get('User-Agent'),400),now,now,now).run();
      const row = await resolveSubscription(database, ctx, requestedAudience);
      if (!row) return json(request, env, 500, { ok:false,error:'subscription_create_failed' });
      const existingPref = await database.prepare('SELECT subscription_id FROM notification_preferences WHERE subscription_id=?').bind(row.id).first();
      if (!existingPref) {
        await database.prepare('INSERT INTO notification_preferences(subscription_id,language_preference,resolved_locale,categories_json,quiet_hours_enabled,quiet_start,quiet_end,timezone,updated_at) VALUES(?,?,?,?,0,NULL,NULL,?,?)')
          .bind(row.id,cleanLanguage(parsed.value.languagePreference),cleanLocale(parsed.value.resolvedLocale),JSON.stringify(categories),text(parsed.value.timezone,100)||'Europe/Rome',now).run();
      }
      await audit(database,'notification_device_registered',{audience:requestedAudience,actorId:requestedAudience==='admin'?ctx.user.id:ctx.deviceId,subscriptionId:row.id});
      return json(request, env, 201, { ok:true, subscriptionId:row.id, audience:requestedAudience, pushEnabled:endpointValid(row.endpoint) });
    }

    if (route === 'subscribe' && request.method === 'POST') {
      const parsed = await body(request); if (parsed.error) return json(request, env, parsed.status, { ok:false,error:parsed.error });
      const requestedAudience = parsed.value.audience === 'admin' ? 'admin' : 'public';
      if (parsed.value.audience && parsed.value.audience !== requestedAudience) return json(request, env, 400, { ok:false,error:'invalid_audience' });
      const ctx = await ownerContext(request, env, requestedAudience); if (ctx.response) return ctx.response;
      if (!(await rateLimit(database, `subscribe:${ctx.tokenHash}`, 8, 3600))) return json(request, env, 429, { ok:false,error:'rate_limited' });
      const sub = parsed.value.subscription || {}; const endpoint = text(sub.endpoint, 2000); if (!endpointValid(endpoint)) return json(request, env, 400, { ok:false,error:'invalid_push_subscription' });
      const categories = cleanCategories(requestedAudience, parsed.value.categories?.length ? parsed.value.categories : requestedAudience === 'admin' ? DEFAULT_ADMIN_CATEGORIES : DEFAULT_PUBLIC_CATEGORIES);
      if (requestedAudience === 'public' && Array.isArray(parsed.value.categories) && parsed.value.categories.some((c) => ADMIN_CATEGORIES.has(c))) return json(request, env, 403, { ok:false,error:'admin_category_forbidden' });
      const id = uuid(), now = nowIso();
      await database.prepare(`INSERT INTO notification_subscriptions(id,audience,app_variant,admin_user_id,device_id,device_token_hash,endpoint,p256dh,auth,enabled,platform,user_agent,created_at,updated_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?,?,?) ON CONFLICT(audience,device_id) DO UPDATE SET admin_user_id=excluded.admin_user_id,device_token_hash=excluded.device_token_hash,endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth=excluded.auth,enabled=1,platform=excluded.platform,user_agent=excluded.user_agent,updated_at=excluded.updated_at,last_seen_at=excluded.last_seen_at`)
        .bind(id,requestedAudience,requestedAudience,requestedAudience==='admin'?ctx.user.id:null,ctx.deviceId,ctx.tokenHash,endpoint,text(sub.keys?.p256dh,300),text(sub.keys?.auth,300),text(parsed.value.platform,80),text(request.headers.get('User-Agent'),400),now,now,now).run();
      const row = await resolveSubscription(database, ctx, requestedAudience); const prefLang = cleanLanguage(parsed.value.languagePreference); const locale = cleanLocale(parsed.value.resolvedLocale);
      await database.prepare('INSERT INTO notification_preferences(subscription_id,language_preference,resolved_locale,categories_json,quiet_hours_enabled,quiet_start,quiet_end,timezone,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(subscription_id) DO UPDATE SET language_preference=excluded.language_preference,resolved_locale=excluded.resolved_locale,categories_json=excluded.categories_json,quiet_hours_enabled=excluded.quiet_hours_enabled,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,timezone=excluded.timezone,updated_at=excluded.updated_at')
        .bind(row.id,prefLang,locale,JSON.stringify(categories),parsed.value.quietHoursEnabled?1:0,validTime(parsed.value.quietStart)?text(parsed.value.quietStart,5):null,validTime(parsed.value.quietEnd)?text(parsed.value.quietEnd,5):null,text(parsed.value.timezone,100)||'Europe/Rome',now).run();
      await audit(database,'notifications_enabled',{audience:requestedAudience,actorId:requestedAudience==='admin'?ctx.user.id:ctx.deviceId,subscriptionId:row.id}); return json(request, env, 201, { ok:true, subscriptionId:row.id, audience:requestedAudience });
    }

    if (['unsubscribe','preferences','inbox','test'].includes(route)) {
      const ctx = await ownerContext(request, env, audience); if (ctx.response) return ctx.response; const sub = await resolveSubscription(database,ctx,audience); if (!sub) return json(request,env,404,{ok:false,error:'subscription_not_found'});
      if (route === 'unsubscribe' && request.method === 'POST') { if (!(await rateLimit(database,`unsubscribe:${ctx.tokenHash}`,12,3600))) return json(request,env,429,{ok:false,error:'rate_limited'}); await database.prepare('UPDATE notification_subscriptions SET endpoint=?,p256dh=NULL,auth=NULL,enabled=1,updated_at=? WHERE id=?').bind(`inapp://${audience}/${(await hash(ctx.deviceId)).slice(0,32)}`,nowIso(),sub.id).run(); await audit(database,'notifications_disabled',{audience,actorId:audience==='admin'?ctx.user.id:ctx.deviceId,subscriptionId:sub.id}); return json(request,env,200,{ok:true}); }
      if (route === 'preferences' && request.method === 'GET') { const pref=await database.prepare('SELECT * FROM notification_preferences WHERE subscription_id=?').bind(sub.id).first(); return json(request,env,200,{ok:true,pushEnabled:endpointValid(sub.endpoint),preferences:{languagePreference:pref?.language_preference||'auto',resolvedLocale:pref?.resolved_locale||'it',categories:parseJson(pref?.categories_json,'[]'),quietHoursEnabled:Boolean(pref?.quiet_hours_enabled),quietStart:pref?.quiet_start||'',quietEnd:pref?.quiet_end||'',timezone:pref?.timezone||'Europe/Rome'}}); }
      if (route === 'preferences' && request.method === 'PATCH') {
        const parsed=await body(request); if(parsed.error)return json(request,env,parsed.status,{ok:false,error:parsed.error}); const current=await database.prepare('SELECT * FROM notification_preferences WHERE subscription_id=?').bind(sub.id).first(); const categories=parsed.value.categories?cleanCategories(audience,parsed.value.categories):parseJson(current?.categories_json,'[]'); if(audience==='public'&&Array.isArray(parsed.value.categories)&&parsed.value.categories.some((c)=>ADMIN_CATEGORIES.has(c)))return json(request,env,403,{ok:false,error:'admin_category_forbidden'});
        const lang=parsed.value.languagePreference?cleanLanguage(parsed.value.languagePreference):current?.language_preference||'auto'; const locale=parsed.value.resolvedLocale?cleanLocale(parsed.value.resolvedLocale):current?.resolved_locale||'it'; const qs=parsed.value.quietStart!==undefined?text(parsed.value.quietStart,5):current?.quiet_start; const qe=parsed.value.quietEnd!==undefined?text(parsed.value.quietEnd,5):current?.quiet_end; if(!validTime(qs)||!validTime(qe))return json(request,env,400,{ok:false,error:'invalid_quiet_hours'});
        await database.prepare('UPDATE notification_preferences SET language_preference=?,resolved_locale=?,categories_json=?,quiet_hours_enabled=?,quiet_start=?,quiet_end=?,timezone=?,updated_at=? WHERE subscription_id=?').bind(lang,locale,JSON.stringify(categories),parsed.value.quietHoursEnabled===undefined?(current?.quiet_hours_enabled||0):(parsed.value.quietHoursEnabled?1:0),qs||null,qe||null,text(parsed.value.timezone,100)||current?.timezone||'Europe/Rome',nowIso(),sub.id).run(); await audit(database,'preferences_updated',{audience,actorId:audience==='admin'?ctx.user.id:ctx.deviceId,subscriptionId:sub.id}); return json(request,env,200,{ok:true});
      }
      if (route === 'inbox' && request.method === 'GET') { const rows=await database.prepare('SELECT id,audience,category,title,body,destination_url,created_at,read_at,dismissed_at FROM notification_inbox WHERE subscription_id=? AND dismissed_at IS NULL ORDER BY created_at DESC LIMIT 100').bind(sub.id).all(); return json(request,env,200,{ok:true,items:rows.results||[]}); }
      if (route === 'test' && request.method === 'POST') {
        if (!(await rateLimit(database, `test:${sub.id}`, 1, 60))) return json(request, env, 429, { ok: false, error: 'rate_limited' });
        const locale = (await database.prepare('SELECT resolved_locale FROM notification_preferences WHERE subscription_id=?').bind(sub.id).first())?.resolved_locale === 'en' ? 'en' : 'it';
        const event = {
          id: uuid(), audience, category: audience === 'admin' ? 'operational_failures' : 'news', origin: 'test',
          title_it: audience === 'admin' ? 'Test notifiche Admin' : 'Test notifiche VulcanIQ',
          body_it: 'Le notifiche funzionano su questo dispositivo.',
          title_en: audience === 'admin' ? 'Admin notification test' : 'VulcanIQ notification test',
          body_en: 'Notifications are working on this device.',
          destination_url: audience === 'admin' ? '/admin/notifications' : '/install',
          dedupe_key: `test:${sub.id}:${Date.now()}`, priority: 'normal'
        };
        const title = locale === 'it' ? event.title_it : event.title_en;
        const bodyText = locale === 'it' ? event.body_it : event.body_en;
        await database.prepare('INSERT INTO notification_inbox(id,event_id,subscription_id,audience,category,title,body,destination_url,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
          .bind(uuid(), null, sub.id, audience, event.category, title, bodyText, event.destination_url, nowIso()).run();
        if (!endpointValid(sub.endpoint)) {
          await audit(database, 'test_notification_sent', { audience, actorId: audience === 'admin' ? ctx.user.id : ctx.deviceId, subscriptionId: sub.id, outcome: 'in_app_only' });
          return json(request, env, 200, { ok: true, pushSkipped: true });
        }
        await increment(database, 'push_attempts');
        const push = await sendEmptyWebPush(sub, env);
        if (push.dead) await database.prepare('UPDATE notification_subscriptions SET endpoint=?,p256dh=NULL,auth=NULL,enabled=1,updated_at=? WHERE id=?')
          .bind(`inapp://${audience}/${(await hash(ctx.deviceId)).slice(0,32)}`, nowIso(), sub.id).run();
        await increment(database, push.ok ? 'push_success' : 'push_failed');
        await audit(database, push.ok ? 'test_notification_sent' : 'test_notification_failed', { audience, actorId: audience === 'admin' ? ctx.user.id : ctx.deviceId, subscriptionId: sub.id, outcome: push.ok ? 'ok' : String(push.status) });
        return json(request, env, push.ok ? 200 : 502, { ok: push.ok, dead: push.dead });
      }
    }

    if (route === 'inbox' && path[1] && path[2] && request.method === 'PATCH') {
      const ctx=await ownerContext(request,env,audience); if(ctx.response)return ctx.response; const sub=await resolveSubscription(database,ctx,audience); if(!sub)return json(request,env,404,{ok:false,error:'subscription_not_found'}); const action=path[2]; if(!['read','dismiss'].includes(action))return json(request,env,404,{ok:false,error:'not_found'}); const column=action==='read'?'read_at':'dismissed_at'; const result=await database.prepare(`UPDATE notification_inbox SET ${column}=? WHERE id=? AND subscription_id=?`).bind(nowIso(),path[1],sub.id).run(); return json(request,env,result.meta?.changes?200:404,{ok:Boolean(result.meta?.changes)});
    }

    if (route === 'ingest' && request.method === 'POST') {
      const configuredSecret = String(env.NOTIFICATION_INGEST_SECRET || '');
      const suppliedSecret = String(request.headers.get('X-Notification-Ingest-Key') || '');
      if (!configuredSecret || !suppliedSecret || (await hash(configuredSecret)) !== (await hash(suppliedSecret))) return json(request, env, 401, { ok: false, error: 'ingest_unauthorized' });
      const parsed = await body(request, 8192); if (parsed.error) return json(request, env, parsed.status, { ok: false, error: parsed.error });
      const category = text(parsed.value.category, 60); if (!ADMIN_CATEGORIES.has(category)) return json(request, env, 400, { ok: false, error: 'invalid_admin_category' });
      const templates = {
        new_bookings: ['Nuova richiesta di prenotazione', 'Una nuova richiesta richiede la tua attenzione.', 'New booking request', 'A new booking needs your attention.', '/admin/requests'],
        upcoming_excursions: ['Escursione in arrivo', 'Un’attività in arrivo richiede la tua attenzione.', 'Upcoming excursion', 'An upcoming activity needs your attention.', '/admin/upcoming'],
        gift_cards: ['Nuova richiesta Gift Card', 'Una nuova richiesta Gift Card richiede la tua attenzione.', 'New Gift Card request', 'A new Gift Card request needs your attention.', '/admin/gift-cards'],
        booking_codes: ['Aggiornamento codice prenotazione', 'Un codice prenotazione richiede la tua attenzione.', 'Booking code update', 'A booking code needs your attention.', '/admin/booking-codes'],
        payment_reconciliation: ['Pagamento da riconciliare', 'Un movimento richiede verifica in Finanze.', 'Payment needs reconciliation', 'A transaction needs review in Finance.', '/admin/finance'],
        operational_failures: ['Problema operativo VulcanIQ', 'Un processo operativo richiede verifica.', 'VulcanIQ operational issue', 'An operational process needs review.', '/admin'],
        security_alerts: ['Avviso sicurezza VulcanIQ', 'Un evento di sicurezza richiede verifica nell’area Admin.', 'VulcanIQ security alert', 'A security event needs review in Admin.', '/admin'],
        daily_summary: ['Riepilogo operativo giornaliero', 'Apri VulcanIQ Admin per il riepilogo di oggi.', 'Daily operations summary', 'Open VulcanIQ Admin for today’s summary.', '/admin/today'],
        weekly_summary: ['Riepilogo operativo settimanale', 'Apri VulcanIQ Admin per il riepilogo della settimana.', 'Weekly operations summary', 'Open VulcanIQ Admin for this week’s summary.', '/admin/today']
      };
      const t = templates[category]; const dedupeKey = text(parsed.value.dedupeKey, 180); if (!dedupeKey) return json(request, env, 400, { ok: false, error: 'dedupe_key_required' });
      const eventDedupe = `ingest:${dedupeKey}`;
      const existing = await database.prepare('SELECT id FROM notification_events WHERE dedupe_key=?').bind(eventDedupe).first(); if (existing) return json(request, env, 200, { ok: true, deduped: true });
      const event = { id: uuid(), audience: 'admin', category, origin: 'trusted_ingest', title_it: t[0], body_it: t[1], title_en: t[2], body_en: t[3], destination_url: text(parsed.value.destinationUrl, 500) || t[4], dedupe_key: eventDedupe, priority: category === 'security_alerts' ? 'critical' : category === 'operational_failures' ? 'high' : 'normal' };
      await database.prepare('INSERT INTO notification_events(id,audience,category,origin,title_it,body_it,title_en,body_en,destination_url,dedupe_key,priority,created_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(event.id,event.audience,event.category,event.origin,event.title_it,event.body_it,event.title_en,event.body_en,event.destination_url,event.dedupe_key,event.priority,nowIso(),'sending').run();
      const result = await fanout(database, env, event); await database.prepare("UPDATE notification_events SET status='sent',sent_at=? WHERE id=?").bind(nowIso(),event.id).run(); return json(request, env, 202, { ok: true, delivery: result });
    }

    if (route === 'campaigns') {
      const auth=await requireAdmin(request,env); if(auth.response)return auth.response; if(!['owner','manager'].includes(auth.profile.role))return json(request,env,403,{ok:false,error:'campaign_permission_required'});
      if(request.method==='GET'){const rows=await database.prepare('SELECT id,category,title_it,title_en,destination_url,language_target,scheduled_for,status,created_at,sent_at FROM notification_campaigns ORDER BY created_at DESC LIMIT 100').all();return json(request,env,200,{ok:true,items:rows.results||[]});}
      if(request.method==='POST'){
        const parsed=await body(request);if(parsed.error)return json(request,env,parsed.status,{ok:false,error:parsed.error}); if(!(await rateLimit(database,`campaign:${auth.user.id}`,5,60)))return json(request,env,429,{ok:false,error:'rate_limited'}); const category=text(parsed.value.category,60);if(!CAMPAIGN_CATEGORIES.has(category))return json(request,env,400,{ok:false,error:'invalid_campaign_category'}); const languageTarget=['it','en'].includes(parsed.value.languageTarget)?parsed.value.languageTarget:'all'; const ti=text(parsed.value.titleIt,120),bi=text(parsed.value.bodyIt,280),te=text(parsed.value.titleEn,120),be=text(parsed.value.bodyEn,280);if((languageTarget!=='en'&&(!ti||!bi))||(languageTarget!=='it'&&(!te||!be)))return json(request,env,400,{ok:false,error:'campaign_language_fields_required'}); const scheduled=text(parsed.value.scheduledFor,40); if(scheduled&&Number.isNaN(Date.parse(scheduled)))return json(request,env,400,{ok:false,error:'invalid_schedule'}); const id=uuid(),dedupe=`campaign:${id}`,status=scheduled&&Date.parse(scheduled)>Date.now()?'scheduled':'queued'; await database.prepare('INSERT INTO notification_campaigns(id,created_by,category,title_it,body_it,title_en,body_en,destination_url,language_target,scheduled_for,status,dedupe_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,auth.user.id,category,ti||null,bi||null,te||null,be||null,text(parsed.value.destinationUrl,500)||null,languageTarget,scheduled||null,status,dedupe,nowIso(),nowIso()).run(); await audit(database,scheduled?'campaign_scheduled':'campaign_created',{audience:'public',actorId:auth.user.id,campaignId:id}); if(status==='queued'){const event={id:uuid(),audience:'public',category,origin:'admin_campaign',title_it:ti||te,body_it:bi||be,title_en:te||ti,body_en:be||bi,destination_url:text(parsed.value.destinationUrl,500)||'/',dedupe_key:dedupe,priority:'normal',language_target:languageTarget};await database.prepare('INSERT INTO notification_events(id,audience,category,origin,title_it,body_it,title_en,body_en,destination_url,dedupe_key,priority,created_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(event.id,event.audience,event.category,event.origin,event.title_it,event.body_it,event.title_en,event.body_en,event.destination_url,event.dedupe_key,event.priority,nowIso(),'sending').run();const sent=await fanout(database,env,event);await database.prepare("UPDATE notification_events SET status='sent',sent_at=? WHERE id=?").bind(nowIso(),event.id).run();await database.prepare("UPDATE notification_campaigns SET status='sent',sent_at=?,updated_at=? WHERE id=?").bind(nowIso(),nowIso(),id).run();await audit(database,'campaign_sent',{audience:'public',actorId:auth.user.id,campaignId:id,metadata:{attempted:sent.attempted,sent:sent.sent,failed:sent.failed}});return json(request,env,201,{ok:true,id,status:'sent',delivery:sent});} return json(request,env,201,{ok:true,id,status});
      }
    }

    if(route==='health'&&request.method==='GET'){const auth=await requireAdmin(request,env);if(auth.response)return auth.response;const day=nowIso().slice(0,10);const counters=await database.prepare('SELECT counter_key,counter_value FROM notification_usage_counters WHERE counter_date=?').bind(day).all();const b=await budget(database,env);return json(request,env,200,{ok:true,budget:b,counters:Object.fromEntries((counters.results||[]).map((r)=>[r.counter_key,r.counter_value]))});}
    return json(request,env,404,{ok:false,error:'not_found'});
  } catch (error) {
    console.error('notification_api_failure',{route,method:request.method,error_name:String(error?.name||'Error')}); return json(request,env,500,{ok:false,error:'notification_api_failed'});
  }
}
