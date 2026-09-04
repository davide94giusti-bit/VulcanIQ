import { sendWebPush } from '../../../shared/webPush.js';
import { resolveSupabaseBackendCredential, supabaseBackendHeaders } from '../_shared/supabaseBackend.js';
import { isOwnershipClaimToken, notificationEntityRef, ownershipClaimStateError, sha256Hex } from './_ownership.js';

const PUBLIC_CATEGORIES = new Set(['etna_updates', 'etna_weekly', 'experiences', 'events', 'news', 'promotions']);
const ADMIN_CATEGORIES = new Set(['new_bookings', 'upcoming_excursions', 'gift_cards', 'booking_codes', 'payment_reconciliation', 'operational_failures', 'security_alerts', 'daily_summary', 'weekly_summary']);
const CAMPAIGN_CATEGORIES = new Set(['experiences', 'events', 'news', 'promotions']);
const CUSTOMER_CATEGORIES = new Set([
  'customer_booking_confirmed', 'customer_payment_received', 'customer_upcoming_reminder',
  'customer_operational_change', 'customer_booking_rescheduled', 'customer_booking_cancelled',
  'customer_review_reminder'
]);
const CUSTOMER_EVENT_TYPES = new Set([
  'booking_confirmed', 'payment_received', 'operational_change',
  'booking_rescheduled', 'booking_cancelled', 'review_reminder'
]);
const CUSTOMER_EVENT_CONFIG = Object.freeze({
  booking_confirmed: { ruleKey: 'customer_booking_confirmed', category: 'customer_booking_confirmed', titleIt: 'Prenotazione confermata', bodyIt: 'La tua prenotazione vulcanIQ è stata confermata.', titleEn: 'Booking confirmed', bodyEn: 'Your vulcanIQ booking has been confirmed.' },
  payment_received: { ruleKey: 'customer_payment_received', category: 'customer_payment_received', titleIt: 'Pagamento ricevuto', bodyIt: 'Il pagamento della tua prenotazione è stato registrato.', titleEn: 'Payment received', bodyEn: 'Your booking payment has been recorded.' },
  operational_change: { ruleKey: 'customer_operational_change', category: 'customer_operational_change', titleIt: 'Aggiornamento sulla prenotazione', bodyIt: 'È disponibile un aggiornamento operativo sulla tua prenotazione.', titleEn: 'Booking update', bodyEn: 'An operational update is available for your booking.' },
  booking_rescheduled: { ruleKey: 'customer_booking_rescheduled', category: 'customer_booking_rescheduled', titleIt: 'Prenotazione riprogrammata', bodyIt: 'La data della tua prenotazione è stata aggiornata.', titleEn: 'Booking rescheduled', bodyEn: 'Your booking date has been updated.' },
  booking_cancelled: { ruleKey: 'customer_booking_cancelled', category: 'customer_booking_cancelled', titleIt: 'Prenotazione annullata', bodyIt: 'La tua prenotazione è stata annullata.', titleEn: 'Booking cancelled', bodyEn: 'Your booking has been cancelled.' },
  review_reminder: { ruleKey: 'customer_review_reminder', category: 'customer_review_reminder', titleIt: 'Racconta la tua esperienza', bodyIt: 'Se vuoi, ora puoi lasciare una recensione sulla tua esperienza.', titleEn: 'Share your experience', bodyEn: 'If you wish, you can now review your experience.' }
});
const DEFAULT_PUBLIC_CATEGORIES = ['etna_updates', 'etna_weekly', 'experiences', 'events', 'news'];
const DEFAULT_ADMIN_CATEGORIES = ['new_bookings', 'upcoming_excursions', 'gift_cards', 'booking_codes', 'payment_reconciliation', 'operational_failures', 'security_alerts'];
const ADMIN_AUTOMATION_RULES = Object.freeze({
  new_bookings: 'admin_new_booking', gift_cards: 'admin_gift_card', booking_codes: 'admin_booking_code',
  payment_reconciliation: 'admin_payment_reconciliation', operational_failures: 'admin_operational_failure', security_alerts: 'admin_security_alert'
});
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
  const backendCredential = resolveSupabaseBackendCredential(env);
  return url && anon && backendCredential ? { url, anon, backendCredential } : null;
}
async function requireAdmin(request, env) {
  const token = bearer(request); const config = supabaseConfig(env); if (!token || !config) return { response: json(request, env, !token ? 401 : 503, { ok: false, error: !token ? 'admin_auth_required' : 'admin_auth_not_configured' }) };
  const userRes = await fetch(`${config.url}/auth/v1/user`, { headers: { apikey: config.anon, Authorization: `Bearer ${token}` } });
  if (!userRes.ok) return { response: json(request, env, 401, { ok: false, error: 'invalid_admin_session' }) };
  const user = await userRes.json();
  const params = new URLSearchParams({ select: 'user_id,role,active', user_id: `eq.${user.id}`, active: 'eq.true', limit: '1' });
  const profileRes = await fetch(`${config.url}/rest/v1/admin_profiles?${params}`, { headers: supabaseBackendHeaders(config.backendCredential, { headers: { Accept: 'application/json' } }) });
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
function cleanDestination(value, fallback = '/') { const clean = text(value, 500); if (!clean) return fallback; if (clean.startsWith('/') && !clean.startsWith('//')) return clean; try { const url = new URL(clean); return url.protocol === 'https:' ? url.toString() : fallback; } catch { return fallback; } }
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
function pushAttemptState(push) {
  if (push.accepted) return { outcome: 'sent', errorCode: 'push_service_accepted' };
  if (push.retryable) return { outcome: 'retryable_error', errorCode: 'retryable_push_error' };
  if (push.unknown) return { outcome: 'outcome_unknown', errorCode: 'push_outcome_unknown' };
  if (push.dead) return { outcome: 'permanent_error', errorCode: 'dead_subscription' };
  return { outcome: 'permanent_error', errorCode: push.error || 'permanent_push_error' };
}
async function recordPushAttempt(database, jobId, attemptNumber, push) {
  if (!jobId || !attemptNumber) return;
  const state = pushAttemptState(push);
  await database.prepare("INSERT OR IGNORE INTO notification_delivery_attempts(id,job_id,attempt_number,transport,outcome,http_status,error_code,created_at) VALUES(?,?,?,'push',?,?,?,?)")
    .bind(uuid(),jobId,attemptNumber,state.outcome,push.status||null,state.errorCode,nowIso()).run();
}
async function budget(database, env) {
  const day = nowIso().slice(0,10); const row = await database.prepare("SELECT counter_value FROM notification_usage_counters WHERE counter_date=? AND counter_key='push_attempts'").bind(day).first();
  const attempts = Number(row?.counter_value || 0); const cap = Math.max(1, Number(env.NOTIFICATION_PUBLIC_DAILY_SEND_CAP || 1000)); const pct = attempts / cap * 100;
  const warning = Number(env.NOTIFICATION_WARNING_PERCENT || 70), conservation = Number(env.NOTIFICATION_CONSERVATION_PERCENT || 85), hard = Number(env.NOTIFICATION_HARD_STOP_PERCENT || 95);
  const mode = pct >= hard ? 'HARD_SAFETY' : pct >= conservation ? 'CONSERVATION' : pct >= warning ? 'WARNING' : 'NORMAL'; return { mode, attempts, cap, percent: Number(pct.toFixed(1)) };
}
function allowedByBudget(mode, event) { if (mode === 'NORMAL' || mode === 'WARNING') return true; if (mode === 'CONSERVATION') return !['promotions','daily_summary','weekly_summary','etna_weekly'].includes(event.category); if (mode === 'HARD_SAFETY') return event.audience === 'admin' && event.priority === 'critical'; return true; }
async function fanout(database, env, event) {
  const personalized = CUSTOMER_CATEGORIES.has(event.category);
  if (personalized && (!event.recipient_subscription_id || event.audience !== 'public')) throw new Error('personalized_recipient_required');
  const budgetState = await budget(database, env); if (!allowedByBudget(budgetState.mode, event)) { await audit(database, 'notification_suppressed_budget', { audience: event.audience, outcome: budgetState.mode, metadata: { category: event.category } }); return { attempted: 0, sent: 0, failed: 0, suppressed: true, budget: budgetState }; }
  const maxBatch = Math.max(1, Math.min(1000, Number(env.NOTIFICATION_BROADCAST_BATCH_CAP || 250)));
  const targetClause = event.recipient_subscription_id ? ' AND s.id=?' : '';
  const statement = database.prepare(`SELECT s.*,p.language_preference,p.resolved_locale,p.categories_json,p.quiet_hours_enabled,p.quiet_start,p.quiet_end,p.timezone FROM notification_subscriptions s JOIN notification_preferences p ON p.subscription_id=s.id WHERE s.audience=? AND s.enabled=1${targetClause} LIMIT ${maxBatch}`);
  const result = event.recipient_subscription_id
    ? await statement.bind(event.audience, event.recipient_subscription_id).all()
    : await statement.bind(event.audience).all();
  let attempted=0,accepted=0,failed=0,retryable=0,dead=0,unknown=0;
  for (const sub of result.results || []) {
    const categories = parseJson(sub.categories_json, []); if (!personalized && !categories.includes(event.category)) continue;
    if (event.language_target && event.language_target !== 'all' && sub.resolved_locale !== event.language_target) continue;
    const locale = cleanLocale(sub.resolved_locale); const title = locale === 'it' ? event.title_it : event.title_en; const bodyText = locale === 'it' ? event.body_it : event.body_en;
    if(event.inapp_enabled!==false){const inboxId = uuid(); await database.prepare('INSERT OR IGNORE INTO notification_inbox(id,event_id,subscription_id,audience,category,title,body,destination_url,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(inboxId,event.id,sub.id,event.audience,event.category,title,bodyText,event.destination_url || null,nowIso()).run();if(event.job_id)await database.prepare('UPDATE notification_jobs SET inbox_delivered_at=coalesce(inbox_delivered_at,?) WHERE id=?').bind(nowIso(),event.job_id).run();}
    const quiet = inQuietHours(sub) && event.priority !== 'critical'; if (quiet || !endpointValid(sub.endpoint) || event.push_enabled===false) continue;
    attempted += 1; await increment(database, 'push_attempts');
    const attemptNumber=event.job_id?1:0;
    if(event.job_id){const started=nowIso();await database.prepare('UPDATE notification_jobs SET push_started_at=?,last_attempt_at=?,attempt_count=attempt_count+1 WHERE id=? AND push_started_at IS NULL AND push_delivered_at IS NULL').bind(started,started,event.job_id).run();}
    const push = await sendWebPush(sub, env, { urgency: event.priority === 'critical' ? 'high' : 'normal' });
    await recordPushAttempt(database,event.job_id,attemptNumber,push);
    if (push.accepted) { accepted += 1; await increment(database, 'push_success');if(event.job_id)await database.prepare('UPDATE notification_jobs SET push_delivered_at=?,terminal_reason=NULL WHERE id=?').bind(nowIso(),event.job_id).run(); } else { failed += 1; await increment(database, 'push_failed');if(push.dead){dead+=1;await database.prepare('UPDATE notification_subscriptions SET endpoint=?,p256dh=NULL,auth=NULL,enabled=1,updated_at=? WHERE id=?').bind(`inapp://${event.audience}/${(await hash(sub.device_id)).slice(0,32)}`,nowIso(),sub.id).run();if(event.job_id)await database.prepare("UPDATE notification_jobs SET dead_subscription_at=?,terminal_reason='dead_subscription' WHERE id=?").bind(nowIso(),event.job_id).run();}else if(push.retryable){retryable+=1;if(event.job_id)await database.prepare("UPDATE notification_jobs SET push_started_at=NULL,failure_reason='retryable_push_error' WHERE id=?").bind(event.job_id).run();}else if(push.unknown){unknown+=1;if(event.job_id)await database.prepare("UPDATE notification_jobs SET terminal_reason='push_outcome_unknown' WHERE id=?").bind(event.job_id).run();}else if(event.job_id)await database.prepare("UPDATE notification_jobs SET terminal_reason='permanent_push_error' WHERE id=?").bind(event.job_id).run(); }
  }
  return { attempted, accepted, sent:accepted, failed, retryable, dead, unknown, deliveryConfirmed:false, suppressed: false, budget: budgetState };
}

async function claimOwnership(database, subscription, rawToken) {
  if (!isOwnershipClaimToken(rawToken)) return { error: 'ownership_claim_invalid' };
  const tokenHash = await sha256Hex(rawToken);
  let claim = await database.prepare('SELECT * FROM notification_ownership_claims WHERE token_hash=? LIMIT 1').bind(tokenHash).first();
  const stateError = ownershipClaimStateError(claim);
  if (stateError === 'ownership_claim_expired' && claim?.status === 'pending') {
    await database.prepare("UPDATE notification_ownership_claims SET status='expired' WHERE id=? AND status='pending'").bind(claim.id).run();
  }
  if (stateError === 'ownership_claim_already_claimed') {
    const existing = await database.prepare('SELECT id,journey_type,verified_at,revoked_at FROM notification_subscription_ownership WHERE claim_id=? AND subscription_id=? LIMIT 1').bind(claim.id, subscription.id).first();
    return existing && !existing.revoked_at ? { ownership: existing, idempotent: true } : { error: stateError };
  }
  if (stateError) return { error: stateError };
  const ownershipId = uuid(); const now = nowIso();
  await database.batch([
    database.prepare("UPDATE notification_ownership_claims SET status='claimed',claimed_subscription_id=?,claimed_at=? WHERE id=? AND status='pending' AND expires_at>?").bind(subscription.id, now, claim.id, now),
    database.prepare(`INSERT OR IGNORE INTO notification_subscription_ownership
      (id,claim_id,subscription_id,entity_type,entity_ref,journey_type,verified_at,created_at)
      SELECT ?,id,?,entity_type,entity_ref,journey_type,?,? FROM notification_ownership_claims
      WHERE id=? AND status='claimed' AND claimed_subscription_id=?`)
      .bind(ownershipId, subscription.id, now, now, claim.id, subscription.id)
  ]);
  const ownership = await database.prepare('SELECT id,journey_type,verified_at,revoked_at FROM notification_subscription_ownership WHERE claim_id=? AND subscription_id=? LIMIT 1').bind(claim.id, subscription.id).first();
  if (!ownership || ownership.revoked_at) return { error: 'ownership_claim_already_claimed' };
  return { ownership, idempotent: false };
}

async function backendRows(config, table, parameters) {
  const response = await fetch(`${config.url}/rest/v1/${table}?${parameters}`, { headers: supabaseBackendHeaders(config.backendCredential, { headers: { Accept: 'application/json' } }) });
  if (!response.ok) throw new Error(`personalized_source_${table}_${response.status}`);
  const rows = await response.json(); return Array.isArray(rows) ? rows : [];
}

async function backendUpdate(config, table, parameters, payload) {
  const response = await fetch(`${config.url}/rest/v1/${table}?${parameters}`, {
    method: 'PATCH',
    headers: supabaseBackendHeaders(config.backendCredential, { headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    } }),
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`personalized_source_${table}_${response.status}`);
}

function customerPreferenceColumn(eventType) {
  if (eventType === 'operational_change') return 'operational_updates_enabled';
  if (eventType === 'review_reminder') return 'review_reminders_enabled';
  if (eventType === 'upcoming_reminder') return 'reminders_enabled';
  return 'status_updates_enabled';
}

async function authoritativeCustomerEvent(config, entityId, eventType) {
  const parameters = new URLSearchParams({
    select: 'id,status,lead_status,requested_date,fixed_excursion_id,updated_at,decided_at,confirmed_at,review_requested_at',
    id: `eq.${entityId}`, limit: '1'
  });
  const booking = (await backendRows(config, 'booking_requests', parameters))[0];
  if (!booking) return { error: 'personalized_source_not_found' };
  let fixedExcursion = null;
  if (booking.fixed_excursion_id) {
    const fixedParameters = new URLSearchParams({
      select: 'id,date,start_time,updated_at,status,active',
      id: `eq.${booking.fixed_excursion_id}`,
      limit: '1'
    });
    fixedExcursion = (await backendRows(config, 'fixed_excursions', fixedParameters))[0] || null;
  }
  let valid = true; let revisionInput = booking.updated_at || booking.id;
  if (eventType === 'booking_confirmed') {
    valid = booking.status === 'accepted' || ['deposit_paid','confirmed','completed','review_requested','review_received'].includes(booking.lead_status);
    revisionInput = booking.confirmed_at || booking.decided_at || booking.updated_at || booking.id;
  } else if (eventType === 'booking_cancelled') {
    valid = ['declined','cancelled'].includes(booking.status) || ['cancelled','lost'].includes(booking.lead_status);
    revisionInput = booking.decided_at || booking.updated_at || booking.id;
  } else if (eventType === 'review_reminder') {
    valid = Boolean(booking.review_requested_at) || booking.lead_status === 'review_requested';
    revisionInput = booking.review_requested_at || booking.updated_at || booking.id;
  } else if (eventType === 'payment_received') {
    const financeParameters = new URLSearchParams({ select: 'id,status,active,recognized_at,admin_confirmed_at,created_at', booking_request_id: `eq.${entityId}`, active: 'eq.true', order: 'created_at.desc', limit: '10' });
    const entries = await backendRows(config, 'finance_entries', financeParameters);
    const recognized = entries.find((entry) => ['received','paid','confirmed','recognized','completed'].includes(String(entry.status || '').toLowerCase()) || entry.recognized_at || entry.admin_confirmed_at);
    valid = Boolean(recognized); revisionInput = recognized ? `${recognized.id}:${recognized.recognized_at || recognized.admin_confirmed_at || recognized.created_at}` : booking.updated_at;
  } else if (eventType === 'booking_rescheduled') {
    valid = Boolean(booking.requested_date) && !['declined','cancelled'].includes(booking.status) && !['cancelled','lost'].includes(booking.lead_status);
    revisionInput = `${booking.updated_at || booking.id}:${booking.requested_date}:${fixedExcursion?.updated_at || ''}`;
  } else if (eventType === 'operational_change') {
    valid = Boolean(fixedExcursion) && !['declined','cancelled'].includes(booking.status) && !['cancelled','lost'].includes(booking.lead_status);
    revisionInput = fixedExcursion ? `${fixedExcursion.id}:${fixedExcursion.updated_at || ''}:${fixedExcursion.date || ''}:${fixedExcursion.start_time || ''}:${fixedExcursion.status || ''}:${fixedExcursion.active}` : booking.updated_at;
  }
  if (!valid) return { error: 'personalized_invalid_business_state', booking };
  return {
    booking,
    fixedExcursion,
    activityDate: fixedExcursion?.date || booking.requested_date || null,
    activityStartTime: fixedExcursion?.start_time || null,
    activityTimezone: fixedExcursion?.start_time ? 'Europe/Rome' : null,
    sourceRevision: await sha256Hex(`${eventType}:${revisionInput}`)
  };
}

async function insertPersonalizedJob(database, env, eventRecord, ownership, config, scheduledFor = null) {
  const now = nowIso(); const jobId = uuid(); const scheduled = scheduledFor || now;
  const dedupeKey = `owned-job:${eventRecord.dedupe_key}:${ownership.id}:${config.category}`;
  const status = scheduledFor ? 'scheduled' : 'processing';
  let inserted;
  try {
    inserted = await database.prepare(`INSERT OR IGNORE INTO notification_jobs
      (id,rule_key,source_type,source_id,source_revision,recipient_subscription_id,audience,category,title_it,body_it,title_en,body_en,destination_url,priority,scheduled_for,status,dedupe_key,created_at,processing_at,ownership_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'normal',?,?,?,?,?,?)`)
      .bind(jobId,config.ruleKey,'owned_journey',eventRecord.entity_ref,eventRecord.source_revision,ownership.subscription_id,'public',config.category,config.titleIt,config.bodyIt,config.titleEn,config.bodyEn,'/install',scheduled,status,dedupeKey,now,scheduledFor?null:now,ownership.id).run();
  } catch (error) {
    if (String(error?.message || error).includes('personalized_job_requires_active_ownership')) return { error: true, reason: 'revoked_recipient' };
    throw error;
  }
  if(!inserted.meta?.changes)return {deduped:true};
  if (scheduledFor) return { scheduled: true, jobId };
  const event = { id: uuid(), audience: 'public', category: config.category, origin: 'owned_journey', title_it: config.titleIt, body_it: config.bodyIt, title_en: config.titleEn, body_en: config.bodyEn, destination_url: '/install', dedupe_key: `owned-event:${dedupeKey}`, priority: 'normal', recipient_subscription_id: ownership.subscription_id,job_id:jobId,push_enabled:ownership.push_enabled!==0,inapp_enabled:ownership.inapp_enabled!==0 };
  try {
    await database.prepare('INSERT INTO notification_events(id,audience,category,origin,title_it,body_it,title_en,body_en,destination_url,dedupe_key,priority,created_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(event.id,event.audience,event.category,event.origin,event.title_it,event.body_it,event.title_en,event.body_en,event.destination_url,event.dedupe_key,event.priority,now,'sending').run();
    const result = await fanout(database, env, event); const resolvedAt = nowIso();
    await database.prepare("UPDATE notification_events SET status='sent',sent_at=? WHERE id=?").bind(resolvedAt,event.id).run();
    const retryAt=result.retryable?new Date(Date.now()+60000).toISOString():null;
    const finalStatus=result.suppressed?'cancelled':result.retryable?'scheduled':result.unknown?'failed':'sent';
    await database.prepare(`UPDATE notification_jobs SET status=?,sent_at=?,cancelled_at=?,failure_reason=?,next_attempt_at=? WHERE id=? AND status='processing'`)
      .bind(finalStatus,finalStatus==='sent'?resolvedAt:null,finalStatus==='cancelled'?resolvedAt:null,result.suppressed?'budget_suppression':result.retryable?'retryable_push_error':result.unknown?'push_outcome_unknown':null,retryAt,jobId).run();
    return { jobId, result };
  } catch (error) {
    await database.prepare("UPDATE notification_jobs SET status='failed',failure_reason=? WHERE id=? AND status='processing'").bind(String(error?.message || 'delivery_failed').slice(0,120),jobId).run();
    return { jobId, error: true };
  }
}

function zonedDateTimeToUtc(date, time, timezone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !/^\d{2}:\d{2}/.test(String(time || ''))) return NaN;
  const [year, month, day] = String(date).split('-').map(Number);
  const [hour, minute] = String(time).split(':').map(Number);
  let instant = Date.UTC(year, month - 1, day, hour, minute, 0);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const values = Object.fromEntries(formatter.formatToParts(new Date(instant)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
    const rendered = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
    instant -= rendered - Date.UTC(year, month - 1, day, hour, minute, 0);
  }
  return instant;
}

function upcomingSchedule(activityDate, startTime, timezone, offsetMinutes = -1440) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(activityDate || ''))) return null;
  const precise = startTime && timezone ? zonedDateTimeToUtc(activityDate, startTime, timezone) : NaN;
  const activity = Number.isFinite(precise) ? precise : Date.parse(`${activityDate}T09:00:00Z`);
  if (!Number.isFinite(activity)) return null;
  const parsedOffset = Number(offsetMinutes);
  const scheduled = activity + (Number.isFinite(parsedOffset) ? parsedOffset : -1440) * 60 * 1000;
  return scheduled > Date.now() ? new Date(scheduled).toISOString() : null;
}

async function processPersonalizedEvent(database, env, config, actorId, entityType, entityId, eventType) {
  const entityRef=await notificationEntityRef(entityType,entityId),eventConfig=CUSTOMER_EVENT_CONFIG[eventType];
  const authoritative=await authoritativeCustomerEvent(config,entityId,eventType);
  if(authoritative.error){
    if(authoritative.error==='personalized_invalid_business_state'&&authoritative.booking){
      const now=nowIso(),revision=await sha256Hex(`${eventType}:invalid:${authoritative.booking.updated_at||authoritative.booking.id}`),invalidDedupe=`personalized:${eventType}:${entityRef}:${revision}`;
      await database.prepare("INSERT OR IGNORE INTO notification_personalized_events(id,entity_type,entity_ref,event_type,source_revision,status,dedupe_key,recipient_count,job_count,failure_reason,created_at,resolved_at) VALUES(?,?,?,?,?,'invalid_business_state',?,0,0,'invalid_business_state',?,?)").bind(uuid(),entityType,entityRef,eventType,revision,invalidDedupe,now,now).run();
      await audit(database,'personalized_notification_suppressed',{audience:'public',actorId,outcome:'invalid_business_state',metadata:{eventType}});
    }
    return { ok:false, status:authoritative.error==='personalized_source_not_found'?404:409, error:authoritative.error };
  }
  const dedupeKey=`personalized:${eventType}:${entityRef}:${authoritative.sourceRevision}`;
  const existing=await database.prepare('SELECT id,status,recipient_count,job_count FROM notification_personalized_events WHERE dedupe_key=? LIMIT 1').bind(dedupeKey).first();
  if(existing)return {ok:true,deduped:true,status:existing.status,recipientCount:existing.recipient_count,jobCount:existing.job_count};
  const eventId=uuid(),createdAt=nowIso();
  if(['booking_rescheduled','booking_cancelled'].includes(eventType))await database.prepare("UPDATE notification_jobs SET status='cancelled',cancelled_at=?,failure_reason=?,terminal_reason='superseded' WHERE source_type='owned_journey' AND source_id=? AND category='customer_upcoming_reminder' AND status='scheduled'").bind(createdAt,`superseded_by_${eventType}`,entityRef).run();
  const rule=await database.prepare("SELECT enabled FROM notification_automation_rules WHERE rule_key=? AND audience='public' LIMIT 1").bind(eventConfig.ruleKey).first();
  const preferenceColumn=customerPreferenceColumn(eventType);
  const ownerships=await database.prepare(`SELECT o.id,o.subscription_id,o.push_enabled,o.inapp_enabled,o.reminders_enabled FROM notification_subscription_ownership o
    JOIN notification_subscriptions s ON s.id=o.subscription_id
    WHERE o.entity_type=? AND o.entity_ref=? AND o.revoked_at IS NULL AND s.audience='public' AND s.enabled=1 AND o.${preferenceColumn}=1 AND (o.push_enabled=1 OR o.inapp_enabled=1)`).bind(entityType,entityRef).all();
  const recipients=ownerships.results||[];
  const revokedCount=Number((await database.prepare('SELECT count(*) AS total FROM notification_subscription_ownership WHERE entity_type=? AND entity_ref=? AND revoked_at IS NOT NULL').bind(entityType,entityRef).first())?.total||0);
  const initialStatus=!rule?.enabled?'cancelled':recipients.length?'processing':'no_verified_recipient';
  const suppressionReason=!rule?.enabled?'automation_rule_disabled':recipients.length?null:revokedCount?'revoked_recipient':'no_verified_recipient';
  const eventInsert=await database.prepare('INSERT OR IGNORE INTO notification_personalized_events(id,entity_type,entity_ref,event_type,source_revision,status,dedupe_key,recipient_count,job_count,failure_reason,created_at,resolved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(eventId,entityType,entityRef,eventType,authoritative.sourceRevision,initialStatus,dedupeKey,recipients.length,0,suppressionReason,createdAt,initialStatus==='processing'?null:createdAt).run();
  if(!eventInsert.meta?.changes){const duplicate=await database.prepare('SELECT status,recipient_count,job_count FROM notification_personalized_events WHERE dedupe_key=? LIMIT 1').bind(dedupeKey).first();return {ok:true,deduped:true,status:duplicate?.status||'processing',recipientCount:duplicate?.recipient_count||0,jobCount:duplicate?.job_count||0};}
  if(!rule?.enabled||!recipients.length){
    await audit(database,'personalized_notification_suppressed',{audience:'public',actorId,outcome:suppressionReason,metadata:{eventType,recipientCount:recipients.length}});
    return {ok:true,status:initialStatus,recipientCount:recipients.length,jobCount:0};
  }
  const eventRecord={id:eventId,entity_ref:entityRef,source_revision:authoritative.sourceRevision,dedupe_key:dedupeKey};
  let jobs=0,immediateFailures=0,scheduledFailures=0;
  for(const ownership of recipients){const delivered=await insertPersonalizedJob(database,env,eventRecord,ownership,eventConfig);jobs+=delivered.deduped?0:1;if(delivered.error)immediateFailures+=1;}
  if(['booking_confirmed','booking_rescheduled'].includes(eventType)){
    const reminderRule=await database.prepare("SELECT enabled,offset_minutes FROM notification_automation_rules WHERE rule_key='customer_upcoming_reminder' LIMIT 1").first();
    const scheduledFor=upcomingSchedule(authoritative.activityDate,authoritative.activityStartTime,authoritative.activityTimezone,reminderRule?.offset_minutes);
    if(scheduledFor&&reminderRule?.enabled){
      const reminderConfig={ruleKey:'customer_upcoming_reminder',category:'customer_upcoming_reminder',titleIt:'La tua esperienza si avvicina',bodyIt:'La tua esperienza vulcanIQ è in programma a breve.',titleEn:'Your experience is coming up',bodyEn:'Your vulcanIQ experience is coming up soon.'};
      for(const ownership of recipients){if(!ownership.reminders_enabled)continue;const scheduledJob=await insertPersonalizedJob(database,env,eventRecord,ownership,reminderConfig,scheduledFor);jobs+=scheduledJob.deduped?0:1;if(scheduledJob.error)scheduledFailures+=1;}
    }
  }
  const resolvedAt=nowIso(),finalStatus=immediateFailures===recipients.length?'failed':'sent';
  const failureReason=[immediateFailures?`${immediateFailures}_delivery_failures`:'',scheduledFailures?`${scheduledFailures}_schedule_failures`:''].filter(Boolean).join(',')||null;
  await database.prepare('UPDATE notification_personalized_events SET status=?,job_count=?,failure_reason=?,resolved_at=? WHERE id=?').bind(finalStatus,jobs,failureReason,resolvedAt,eventId).run();
  await audit(database,'personalized_notification_resolved',{audience:'public',actorId,outcome:finalStatus,metadata:{eventType,recipientCount:recipients.length,jobCount:jobs}});
  return {ok:true,status:finalStatus,recipientCount:recipients.length,jobCount:jobs};
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

    if (route === 'ownership') {
      if (audience !== 'public') return json(request,env,403,{ok:false,error:'public_device_required'});
      const ctx=await ownerContext(request,env,'public'); if(ctx.response)return ctx.response;
      const sub=await resolveSubscription(database,ctx,'public'); if(!sub)return json(request,env,404,{ok:false,error:'subscription_not_found'});
      if(request.method==='GET'){
        const rows=await database.prepare('SELECT id,journey_type,verified_at,revoked_at,status_updates_enabled,operational_updates_enabled,reminders_enabled,review_reminders_enabled,push_enabled,inapp_enabled FROM notification_subscription_ownership WHERE subscription_id=? ORDER BY created_at DESC LIMIT 100').bind(sub.id).all();
        return json(request,env,200,{ok:true,items:rows.results||[]});
      }
      if(path[1]==='claim'&&request.method==='POST'){
        if(!(await rateLimit(database,`ownership-claim:${sub.id}`,12,3600)))return json(request,env,429,{ok:false,error:'rate_limited'});
        const parsed=await body(request,2048);if(parsed.error)return json(request,env,parsed.status,{ok:false,error:parsed.error});
        const claimed=await claimOwnership(database,sub,String(parsed.value.claimToken||''));
        if(claimed.error)return json(request,env,claimed.error==='ownership_claim_invalid'?404:409,{ok:false,error:claimed.error});
        await audit(database,'notification_ownership_claimed',{audience:'public',subscriptionId:sub.id,metadata:{journeyType:claimed.ownership.journey_type,idempotent:claimed.idempotent}});
        return json(request,env,claimed.idempotent?200:201,{ok:true,item:claimed.ownership,idempotent:claimed.idempotent});
      }
      if(path[1]&&path[2]==='preferences'&&request.method==='PATCH'){
        const parsed=await body(request,2048);if(parsed.error)return json(request,env,parsed.status,{ok:false,error:parsed.error});
        const keys=['statusUpdatesEnabled','operationalUpdatesEnabled','remindersEnabled','reviewRemindersEnabled','pushEnabled','inappEnabled'];
        if(!keys.some((key)=>typeof parsed.value[key]==='boolean'))return json(request,env,400,{ok:false,error:'ownership_preferences_required'});
        const current=await database.prepare('SELECT * FROM notification_subscription_ownership WHERE id=? AND subscription_id=? AND revoked_at IS NULL LIMIT 1').bind(path[1],sub.id).first();
        if(!current)return json(request,env,404,{ok:false,error:'ownership_not_found'});
        const next={
          status_updates_enabled:typeof parsed.value.statusUpdatesEnabled==='boolean'?(parsed.value.statusUpdatesEnabled?1:0):current.status_updates_enabled,
          operational_updates_enabled:typeof parsed.value.operationalUpdatesEnabled==='boolean'?(parsed.value.operationalUpdatesEnabled?1:0):current.operational_updates_enabled,
          reminders_enabled:typeof parsed.value.remindersEnabled==='boolean'?(parsed.value.remindersEnabled?1:0):current.reminders_enabled,
          review_reminders_enabled:typeof parsed.value.reviewRemindersEnabled==='boolean'?(parsed.value.reviewRemindersEnabled?1:0):current.review_reminders_enabled,
          push_enabled:typeof parsed.value.pushEnabled==='boolean'?(parsed.value.pushEnabled?1:0):current.push_enabled,
          inapp_enabled:typeof parsed.value.inappEnabled==='boolean'?(parsed.value.inappEnabled?1:0):current.inapp_enabled
        };
        if(!next.push_enabled&&!next.inapp_enabled)return json(request,env,400,{ok:false,error:'ownership_delivery_channel_required'});
        await database.prepare('UPDATE notification_subscription_ownership SET status_updates_enabled=?,operational_updates_enabled=?,reminders_enabled=?,review_reminders_enabled=?,push_enabled=?,inapp_enabled=? WHERE id=? AND subscription_id=? AND revoked_at IS NULL').bind(next.status_updates_enabled,next.operational_updates_enabled,next.reminders_enabled,next.review_reminders_enabled,next.push_enabled,next.inapp_enabled,path[1],sub.id).run();
        await audit(database,'notification_ownership_preferences_updated',{audience:'public',subscriptionId:sub.id,metadata:{journeyType:'booking'}});
        return json(request,env,200,{ok:true,id:path[1],...next});
      }
      if(path[1]&&path[2]==='revoke'&&request.method==='PATCH'){
        const now=nowIso();
        const owned=await database.prepare('SELECT claim_id FROM notification_subscription_ownership WHERE id=? AND subscription_id=? AND revoked_at IS NULL LIMIT 1').bind(path[1],sub.id).first();
        if(!owned)return json(request,env,404,{ok:false,error:'ownership_not_found'});
        await database.batch([
          database.prepare('UPDATE notification_subscription_ownership SET revoked_at=? WHERE id=? AND subscription_id=? AND revoked_at IS NULL').bind(now,path[1],sub.id),
          database.prepare("UPDATE notification_ownership_claims SET status='revoked',revoked_at=? WHERE id=? AND status='claimed'").bind(now,owned.claim_id),
          database.prepare("UPDATE notification_jobs SET status='cancelled',cancelled_at=?,failure_reason='ownership_revoked' WHERE ownership_id=? AND status='scheduled'").bind(now,path[1])
        ]);
        await audit(database,'notification_ownership_revoked',{audience:'public',subscriptionId:sub.id,metadata:{journeyType:'booking'}});
        return json(request,env,200,{ok:true,id:path[1],revokedAt:now});
      }
      return json(request,env,404,{ok:false,error:'not_found'});
    }

    if(route==='personalized-events'&&request.method==='POST'){
      const auth=await requireAdmin(request,env);if(auth.response)return auth.response;
      const parsed=await body(request,4096);if(parsed.error)return json(request,env,parsed.status,{ok:false,error:parsed.error});
      const config=supabaseConfig(env);if(!config)return json(request,env,503,{ok:false,error:'personalized_source_not_configured'});
      if(path[1]==='reconcile'){
        if(!['owner','manager','finance'].includes(auth.profile.role))return json(request,env,403,{ok:false,error:'personalized_event_permission_required'});
        const requestedId=text(parsed.value.outboxId,80);
        if(requestedId&&!/^[-0-9a-f]{36}$/i.test(requestedId))return json(request,env,400,{ok:false,error:'invalid_outbox_id'});
        const staleBefore=new Date(Date.now()-15*60*1000).toISOString();
        await backendUpdate(config,'customer_notification_outbox',new URLSearchParams({status:'eq.processing',last_attempt_at:`lt.${staleBefore}`}),{
          status:'failed',
          next_attempt_at:nowIso(),
          last_error_code:'stale_processing_recovered',
          updated_at:nowIso()
        });
        const params=new URLSearchParams({
          select:'id,entity_type,entity_id,event_type,status,attempt_count,next_attempt_at,created_at',
          status:'in.(pending,failed)',
          order:'created_at.asc',
          limit:requestedId?'1':'25'
        });
        if(requestedId)params.set('id',`eq.${requestedId}`);else params.set('next_attempt_at',`lte.${nowIso()}`);
        let rows=await backendRows(config,'customer_notification_outbox',params);
        if(auth.profile.role==='finance')rows=rows.filter((row)=>row.event_type==='payment_received');
        const results=[];
        for(const row of rows){
          const attempt=Number(row.attempt_count||0)+1;
          await backendUpdate(config,'customer_notification_outbox',new URLSearchParams({id:`eq.${row.id}`,status:`in.(pending,failed)`}),{status:'processing',attempt_count:attempt,last_attempt_at:nowIso(),updated_at:nowIso(),last_error_code:null});
          try{
            const result=await processPersonalizedEvent(database,env,config,auth.user.id,row.entity_type,row.entity_id,row.event_type);
            const invalidBusinessState=result.error==='personalized_invalid_business_state';
            const finalStatus=invalidBusinessState||['no_verified_recipient','cancelled','invalid_business_state'].includes(result.status)
              ?'suppressed'
              :result.ok&&result.status!=='failed'?'delivered':'failed';
            const retryDelay=Math.min(3600,60*(2**Math.min(attempt-1,6)));
            await backendUpdate(config,'customer_notification_outbox',new URLSearchParams({id:`eq.${row.id}`}),{
              status:finalStatus,
              processed_at:finalStatus==='failed'?null:nowIso(),
              next_attempt_at:finalStatus==='failed'?new Date(Date.now()+retryDelay*1000).toISOString():nowIso(),
              last_error_code:finalStatus==='failed'?String(result.error||'notification_processing_failed').slice(0,120):null,
              updated_at:nowIso()
            });
            results.push({outboxId:row.id,status:finalStatus,eventType:row.event_type,deduped:Boolean(result.deduped)});
          }catch(error){
            const retryDelay=Math.min(3600,60*(2**Math.min(attempt-1,6)));
            const code=String(error?.message||'notification_processing_failed').replace(/[^a-zA-Z0-9:_-]/g,'_').slice(0,120);
            await backendUpdate(config,'customer_notification_outbox',new URLSearchParams({id:`eq.${row.id}`}),{status:'failed',next_attempt_at:new Date(Date.now()+retryDelay*1000).toISOString(),last_error_code:code,updated_at:nowIso()});
            results.push({outboxId:row.id,status:'failed',eventType:row.event_type,error:code});
          }
        }
        return json(request,env,202,{ok:true,processed:results.length,items:results});
      }
      const eventType=text(parsed.value.eventType,60),entityType=text(parsed.value.entityType,60),entityId=text(parsed.value.entityId,80);
      if(entityType!=='booking_request'||!CUSTOMER_EVENT_TYPES.has(eventType)||!/^[-0-9a-f]{36}$/i.test(entityId))return json(request,env,400,{ok:false,error:'invalid_personalized_event'});
      if(!['owner','manager','finance'].includes(auth.profile.role)||(auth.profile.role==='finance'&&eventType!=='payment_received'))return json(request,env,403,{ok:false,error:'personalized_event_permission_required'});
      const result=await processPersonalizedEvent(database,env,config,auth.user.id,entityType,entityId,eventType);
      return json(request,env,result.status&&Number.isInteger(result.status)?result.status:result.ok?202:409,result);
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
          title_it: audience === 'admin' ? 'Test notifiche Admin' : 'Test notifiche vulcanIQ',
          body_it: 'Le notifiche funzionano su questo dispositivo.',
          title_en: audience === 'admin' ? 'Admin notification test' : 'vulcanIQ notification test',
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
        const push = await sendWebPush(sub, env);
        if (push.dead) await database.prepare('UPDATE notification_subscriptions SET endpoint=?,p256dh=NULL,auth=NULL,enabled=1,updated_at=? WHERE id=?')
          .bind(`inapp://${audience}/${(await hash(ctx.deviceId)).slice(0,32)}`, nowIso(), sub.id).run();
        await increment(database, push.accepted ? 'push_success' : 'push_failed');
        await audit(database, push.accepted ? 'test_notification_sent' : 'test_notification_failed', { audience, actorId: audience === 'admin' ? ctx.user.id : ctx.deviceId, subscriptionId: sub.id, outcome: push.outcome, metadata: { transport: 'push', httpStatus: push.status || null, deliveryConfirmed: false } });
        return json(request, env, push.accepted ? 200 : 502, { ok: push.accepted, acceptedByPushService: push.accepted, deliveryConfirmed: false, dead: push.dead, retryable: push.retryable, unknown: push.unknown, pushServiceStatus: push.status || null });
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
        operational_failures: ['Problema operativo', 'Un processo vulcanIQ richiede verifica.', 'Operational issue', 'A vulcanIQ process needs review.', '/admin'],
        security_alerts: ['Avviso sicurezza', 'Un evento richiede verifica nell’area Admin.', 'Security alert', 'An event needs review in Admin.', '/admin'],
        daily_summary: ['Riepilogo operativo giornaliero', 'Apri vulcanIQ Admin per il riepilogo di oggi.', 'Daily operations summary', 'Open vulcanIQ Admin for today’s summary.', '/admin/today'],
        weekly_summary: ['Riepilogo operativo settimanale', 'Apri vulcanIQ Admin per il riepilogo della settimana.', 'Weekly operations summary', 'Open vulcanIQ Admin for this week’s summary.', '/admin/today']
      };
      const t = templates[category]; const dedupeKey = text(parsed.value.dedupeKey, 180); if (!dedupeKey) return json(request, env, 400, { ok: false, error: 'dedupe_key_required' });
      const eventDedupe = `ingest:${dedupeKey}`;
      const existing = await database.prepare('SELECT id FROM notification_events WHERE dedupe_key=?').bind(eventDedupe).first(); if (existing) return json(request, env, 200, { ok: true, deduped: true });
      const ruleKey = ADMIN_AUTOMATION_RULES[category] || null;
      const rule = ruleKey ? await database.prepare('SELECT * FROM notification_automation_rules WHERE rule_key=? AND audience=\'admin\' LIMIT 1').bind(ruleKey).first() : null;
      if (rule && !rule.enabled) { await audit(database, 'automation_job_suppressed', { audience: 'admin', outcome: 'rule_disabled', metadata: { ruleKey, sourceType: 'trusted_ingest' } }); return json(request, env, 202, { ok: true, suppressed: true, reason: 'automation_rule_disabled' }); }
      const event = { id: uuid(), audience: 'admin', category, origin: 'trusted_ingest', title_it: t[0], body_it: t[1], title_en: t[2], body_en: t[3], destination_url: text(parsed.value.destinationUrl, 500) || t[4], dedupe_key: eventDedupe, priority: category === 'security_alerts' ? 'critical' : category === 'operational_failures' ? 'high' : 'normal' };
      const jobId = uuid(); const jobDedupe = `job:${eventDedupe}`; const createdAt = nowIso();
      await database.prepare('INSERT INTO notification_jobs(id,rule_key,source_type,source_id,source_revision,audience,category,title_it,body_it,title_en,body_en,destination_url,priority,scheduled_for,status,dedupe_key,created_at,processing_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(jobId,ruleKey,'trusted_ingest',dedupeKey,'1','admin',category,event.title_it,event.body_it,event.title_en,event.body_en,event.destination_url,event.priority,createdAt,'processing',jobDedupe,createdAt,createdAt).run();
      await audit(database, 'automation_job_created', { audience: 'admin', metadata: { jobId, ruleKey, sourceType: 'trusted_ingest' } });
      try {
        await database.prepare('INSERT INTO notification_events(id,audience,category,origin,title_it,body_it,title_en,body_en,destination_url,dedupe_key,priority,created_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(event.id,event.audience,event.category,event.origin,event.title_it,event.body_it,event.title_en,event.body_en,event.destination_url,event.dedupe_key,event.priority,nowIso(),'sending').run();
        const result = await fanout(database, env, event); const sentAt = nowIso(); await database.prepare("UPDATE notification_events SET status='sent',sent_at=? WHERE id=?").bind(sentAt,event.id).run(); await database.prepare("UPDATE notification_jobs SET status='sent',sent_at=?,failure_reason=NULL WHERE id=? AND status='processing'").bind(sentAt,jobId).run(); await audit(database, 'automation_job_sent', { audience: 'admin', metadata: { jobId, ruleKey, attempted: result.attempted, sent: result.sent, failed: result.failed } }); return json(request, env, 202, { ok: true, jobId, delivery: result });
      } catch (error) {
        const reason = String(error?.message || error).slice(0, 240); await database.prepare("UPDATE notification_jobs SET status='failed',failure_reason=? WHERE id=? AND status='processing'").bind(reason,jobId).run(); await audit(database,'automation_job_failed',{audience:'admin',outcome:'failed',metadata:{jobId,ruleKey,error:reason.slice(0,120)}}); throw error;
      }
    }

    if (route === 'automations') {
      const auth=await requireAdmin(request,env); if(auth.response)return auth.response; if(!['owner','manager'].includes(auth.profile.role))return json(request,env,403,{ok:false,error:'automation_permission_required'});
      if(path[1]==='rules'&&request.method==='GET'){const rows=await database.prepare('SELECT rule_key,label_it,label_en,audience,category,enabled,updated_by,created_at,updated_at FROM notification_automation_rules ORDER BY audience,rule_key').all();return json(request,env,200,{ok:true,items:rows.results||[]});}
      if(path[1]==='rules'&&path[2]&&request.method==='PATCH'){const parsed=await body(request,4096);if(parsed.error)return json(request,env,parsed.status,{ok:false,error:parsed.error});if(typeof parsed.value.enabled!=='boolean')return json(request,env,400,{ok:false,error:'enabled_boolean_required'});const now=nowIso();const result=await database.prepare('UPDATE notification_automation_rules SET enabled=?,updated_by=?,updated_at=? WHERE rule_key=?').bind(parsed.value.enabled?1:0,auth.user.id,now,path[2]).run();if(!result.meta?.changes)return json(request,env,404,{ok:false,error:'automation_rule_not_found'});await audit(database,parsed.value.enabled?'automation_rule_enabled':'automation_rule_disabled',{audience:'admin',actorId:auth.user.id,metadata:{ruleKey:path[2]}});return json(request,env,200,{ok:true,ruleKey:path[2],enabled:parsed.value.enabled});}
      if(path[1]==='personalized'&&request.method==='GET'){const rows=await database.prepare('SELECT event_type,status,recipient_count,job_count,failure_reason,created_at,resolved_at FROM notification_personalized_events ORDER BY created_at DESC LIMIT 200').all();const config=supabaseConfig(env);let outbox=[];if(config){const params=new URLSearchParams({select:'id,event_type,status,attempt_count,next_attempt_at,last_attempt_at,processed_at,last_error_code,created_at',order:'created_at.desc',limit:'200'});outbox=await backendRows(config,'customer_notification_outbox',params);}return json(request,env,200,{ok:true,items:rows.results||[],outbox});}
      if(path[1]==='jobs'&&request.method==='GET'){const rows=await database.prepare('SELECT id,rule_key,source_type,source_id,source_revision,audience,category,scheduled_for,status,created_at,processing_at,sent_at,cancelled_at,failure_reason,attempt_count,max_attempts,next_attempt_at,last_attempt_at,terminal_reason,push_started_at,push_delivered_at,dead_subscription_at FROM notification_jobs ORDER BY created_at DESC LIMIT 200').all();return json(request,env,200,{ok:true,items:rows.results||[]});}
      if(path[1]==='jobs'&&path[2]&&path[3]==='cancel'&&request.method==='PATCH'){const now=nowIso();const result=await database.prepare("UPDATE notification_jobs SET status='cancelled',cancelled_at=? WHERE id=? AND status='scheduled'").bind(now,path[2]).run();if(!result.meta?.changes)return json(request,env,409,{ok:false,error:'automation_job_not_cancellable'});await audit(database,'automation_job_cancelled',{audience:'admin',actorId:auth.user.id,metadata:{jobId:path[2]}});return json(request,env,200,{ok:true,id:path[2],status:'cancelled'});}
      return json(request,env,404,{ok:false,error:'not_found'});
    }

    if (route === 'campaigns') {
      const auth=await requireAdmin(request,env); if(auth.response)return auth.response; if(!['owner','manager'].includes(auth.profile.role))return json(request,env,403,{ok:false,error:'campaign_permission_required'});
      if(request.method==='GET'){const rows=await database.prepare('SELECT id,category,title_it,title_en,destination_url,language_target,scheduled_for,status,created_at,sent_at,cancelled_at,failure_reason FROM notification_campaigns ORDER BY created_at DESC LIMIT 100').all();return json(request,env,200,{ok:true,items:rows.results||[]});}
      if(path[1]&&path[2]==='cancel'&&request.method==='PATCH'){const now=nowIso();const result=await database.prepare("UPDATE notification_campaigns SET status='cancelled',cancelled_at=?,updated_at=? WHERE id=? AND status IN ('draft','scheduled')").bind(now,now,path[1]).run();if(!result.meta?.changes)return json(request,env,409,{ok:false,error:'campaign_not_cancellable'});await audit(database,'campaign_cancelled',{audience:'public',actorId:auth.user.id,campaignId:path[1]});return json(request,env,200,{ok:true,id:path[1],status:'cancelled'});}
      if(request.method==='POST'){
        const parsed=await body(request);if(parsed.error)return json(request,env,parsed.status,{ok:false,error:parsed.error}); if(!(await rateLimit(database,`campaign:${auth.user.id}`,5,60)))return json(request,env,429,{ok:false,error:'rate_limited'}); const category=text(parsed.value.category,60);if(!CAMPAIGN_CATEGORIES.has(category))return json(request,env,400,{ok:false,error:'invalid_campaign_category'}); const languageTarget=['it','en'].includes(parsed.value.languageTarget)?parsed.value.languageTarget:'all'; const ti=text(parsed.value.titleIt,120),bi=text(parsed.value.bodyIt,280),te=text(parsed.value.titleEn,120),be=text(parsed.value.bodyEn,280);if((languageTarget!=='en'&&(!ti||!bi))||(languageTarget!=='it'&&(!te||!be)))return json(request,env,400,{ok:false,error:'campaign_language_fields_required'}); const scheduled=text(parsed.value.scheduledFor,40); if(scheduled&&Number.isNaN(Date.parse(scheduled)))return json(request,env,400,{ok:false,error:'invalid_schedule'}); const saveDraft=parsed.value.saveDraft===true; const id=uuid(),dedupe=`campaign:${id}`,status=saveDraft?'draft':scheduled&&Date.parse(scheduled)>Date.now()?'scheduled':'queued'; const destination=cleanDestination(parsed.value.destinationUrl,'/'); await database.prepare('INSERT INTO notification_campaigns(id,created_by,category,title_it,body_it,title_en,body_en,destination_url,language_target,scheduled_for,status,dedupe_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,auth.user.id,category,ti||null,bi||null,te||null,be||null,destination,languageTarget,scheduled||null,status,dedupe,nowIso(),nowIso()).run(); await audit(database,status==='scheduled'?'campaign_scheduled':status==='draft'?'campaign_draft_saved':'campaign_created',{audience:'public',actorId:auth.user.id,campaignId:id}); if(status==='queued'){const event={id:uuid(),audience:'public',category,origin:'admin_campaign',title_it:ti||te,body_it:bi||be,title_en:te||ti,body_en:be||bi,destination_url:destination,dedupe_key:dedupe,priority:'normal',language_target:languageTarget};await database.prepare('INSERT INTO notification_events(id,audience,category,origin,title_it,body_it,title_en,body_en,destination_url,dedupe_key,priority,created_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(event.id,event.audience,event.category,event.origin,event.title_it,event.body_it,event.title_en,event.body_en,event.destination_url,event.dedupe_key,event.priority,nowIso(),'sending').run();const sent=await fanout(database,env,event);await database.prepare("UPDATE notification_events SET status='sent',sent_at=? WHERE id=?").bind(nowIso(),event.id).run();await database.prepare("UPDATE notification_campaigns SET status='sent',sent_at=?,updated_at=? WHERE id=?").bind(nowIso(),nowIso(),id).run();await audit(database,'campaign_sent',{audience:'public',actorId:auth.user.id,campaignId:id,metadata:{attempted:sent.attempted,sent:sent.sent,failed:sent.failed}});return json(request,env,201,{ok:true,id,status:'sent',delivery:sent});} return json(request,env,201,{ok:true,id,status});
      }
    }

    if(route==='health'&&request.method==='GET'){const auth=await requireAdmin(request,env);if(auth.response)return auth.response;const day=nowIso().slice(0,10);const counters=await database.prepare('SELECT counter_key,counter_value FROM notification_usage_counters WHERE counter_date=?').bind(day).all();const b=await budget(database,env);return json(request,env,200,{ok:true,budget:b,counters:Object.fromEntries((counters.results||[]).map((r)=>[r.counter_key,r.counter_value]))});}
    return json(request,env,404,{ok:false,error:'not_found'});
  } catch (error) {
    console.error('notification_api_failure',{route,method:request.method,error_name:String(error?.name||'Error')}); return json(request,env,500,{ok:false,error:'notification_api_failed'});
  }
}
