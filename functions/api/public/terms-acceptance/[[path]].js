import {
  claimPublicRateLimit,
  clientActorHash,
  json,
  readJsonBody,
  supabaseRequest
} from '../_shared.js';
import { isParticipantTermsToken, participantTermsTokenHash } from '../_participantTerms.js';
import { notificationEntityRef } from '../../notifications/_ownership.js';

const ENDPOINTS = new Set(['resolve', 'confirm']);
const SCHEMA_ERROR_CODES = new Set(['42P01', '42883', 'PGRST202', 'PGRST205']);
const TERMS_CONTENT_KEYS = new Set(['intro', 'sections']);
const TERMS_SECTION_KEYS = new Set(['title', 'body']);

function clean(value, max = 500) {
  return String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

function databaseRow(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value && typeof value === 'object' ? value : null;
}

function unavailable(request, env, status = 404) {
  return json(request, env, status, { ok: false, code: 'terms_invitation_unavailable' });
}

function schemaUnavailable(payload) {
  return SCHEMA_ERROR_CODES.has(String(payload?.code || ''));
}

export function participantTermsContentSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!exactKeys(value, TERMS_CONTENT_KEYS)
    || typeof value.intro !== 'string'
    || !value.intro.trim()
    || !Array.isArray(value.sections)
    || !value.sections.length) return null;
  if (value.sections.some((section) => !section
    || typeof section !== 'object'
    || Array.isArray(section)
    || !exactKeys(section, TERMS_SECTION_KEYS)
    || typeof section.title !== 'string'
    || !section.title.trim()
    || typeof section.body !== 'string'
    || !section.body.trim())) return null;
  return value;
}

function experienceName(experienceId, locale) {
  const names = {
    'etna-premium': 'Etna Premium',
    'etna-learning': 'Etna Learning',
    'etna-live': 'Etna Live',
    'etna-stories': 'Etna Stories',
    unsure: locale === 'en' ? 'vulcanIQ experience' : 'Esperienza vulcanIQ'
  };
  return names[experienceId] || names.unsure;
}

async function rpc(env, functionName, payload) {
  const response = await supabaseRequest(env, `rpc/${encodeURIComponent(functionName)}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => null);
  return { response, result };
}

async function cancelCompletedTermsReminder(env, tokenHash) {
  if (!env.NOTIFICATIONS_DB) return;
  try {
    const query = new URLSearchParams({
      select: 'booking_request_id',
      token_hash: `eq.${tokenHash}`,
      consumed_at: 'not.is.null',
      limit: '1'
    });
    const response = await supabaseRequest(env, `terms_acceptance_invitations?${query}`);
    if (!response.ok) return;
    const rows = await response.json();
    const bookingId = Array.isArray(rows) ? String(rows[0]?.booking_request_id || '') : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)) return;
    const entityRef = await notificationEntityRef('booking_request', bookingId);
    const cancelledAt = new Date().toISOString();
    const cancelled = await env.NOTIFICATIONS_DB.prepare("UPDATE notification_jobs SET status='cancelled',cancelled_at=?,failure_reason='terms_state_changed',terminal_reason='terms_state_changed' WHERE source_type='participant_terms_reminder' AND source_id=? AND status='scheduled'")
      .bind(cancelledAt, entityRef).run();
    if (cancelled.meta?.changes) await env.NOTIFICATIONS_DB.prepare("INSERT INTO notification_audit_log(id,event_type,audience,outcome,metadata_json,created_at) VALUES(?,'participant_terms_reminder_cancelled','public','terms_state_changed',?,?)")
      .bind(crypto.randomUUID(), JSON.stringify({ count: cancelled.meta.changes }), cancelledAt).run();
  } catch {
    // Acceptance evidence is authoritative; cross-system reminder cleanup is best-effort.
  }
}

function exactKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return json(request, env, 204);
  if (request.method !== 'POST') return json(request, env, 405, { ok: false, code: 'method_not_allowed' });

  const path = new URL(request.url).pathname
    .replace(/^\/api\/public\/terms-acceptance\/?/, '')
    .split('/')
    .filter(Boolean);
  const action = path[0] || '';
  if (path.length !== 1 || !ENDPOINTS.has(action)) return json(request, env, 404, { ok: false, code: 'not_found' });

  const parsed = await readJsonBody(request, 2048);
  if (!parsed.ok) return json(request, env, parsed.status, { ok: false, code: parsed.error });
  const allowedKeys = action === 'resolve' ? new Set(['token']) : new Set(['token', 'accepted']);
  if (!exactKeys(parsed.value, allowedKeys)) return json(request, env, 400, { ok: false, code: 'invalid_request' });

  try {
    const actorHash = await clientActorHash(request, env);
    const allowed = await claimPublicRateLimit(env, `participant_terms_${action}`, actorHash, action === 'resolve'
      ? { actorLimit: 30, globalLimit: 5000, windowSeconds: 3600 }
      : { actorLimit: 8, globalLimit: 600, windowSeconds: 3600 });
    if (!allowed) return json(request, env, 429, { ok: false, code: 'rate_limited' });

    const token = String(parsed.value.token || '');
    if (!isParticipantTermsToken(token)) return unavailable(request, env);
    if (action === 'confirm' && parsed.value.accepted !== true) {
      return json(request, env, 400, { ok: false, code: 'terms_acceptance_required' });
    }

    const tokenHash = await participantTermsTokenHash(token);
    if (action === 'resolve') {
      const { response, result } = await rpc(env, 'resolve_participant_terms_acceptance_invitation', { p_token_hash: tokenHash });
      if (!response.ok) return schemaUnavailable(result) ? json(request, env, 503, { ok: false, code: 'terms_invitation_unavailable' }) : unavailable(request, env);
      const row = databaseRow(result);
      const content = participantTermsContentSnapshot(row?.content_snapshot);
      const locale = row?.locale === 'en' ? 'en' : row?.locale === 'it' ? 'it' : '';
      if (!row?.participant_name || !row?.terms_version || !locale || !content) return unavailable(request, env);
      return json(request, env, 200, {
        ok: true,
        invitation: {
          participantName: clean(row.participant_name, 120),
          representationType: row.representation_type === 'parent_or_guardian' ? 'parent_or_guardian' : 'self',
          ...(row.actor_name ? { actorName: clean(row.actor_name, 120) } : {}),
          ...(row.expires_at ? { expiresAt: row.expires_at } : {})
        },
        terms: {
          version: clean(row.terms_version, 80),
          locale,
          effectiveAt: row.effective_at,
          content
        },
        experience: { name: experienceName(row.experience_id, locale) }
      });
    }

    const { response, result } = await rpc(env, 'accept_participant_terms_acceptance_invitation', { p_token_hash: tokenHash });
    if (!response.ok) return schemaUnavailable(result) ? json(request, env, 503, { ok: false, code: 'terms_invitation_unavailable' }) : unavailable(request, env);
    const row = databaseRow(result);
    if (!row?.accepted_at) return unavailable(request, env);
    await cancelCompletedTermsReminder(env, tokenHash);
    return json(request, env, 200, {
      ok: true,
      accepted: true,
      idempotent: row.idempotent === true,
      acceptedAt: row.accepted_at,
      representationType: row.representation_type === 'parent_or_guardian' ? 'parent_or_guardian' : 'self'
    });
  } catch {
    return json(request, env, 503, { ok: false, code: 'terms_invitation_unavailable' });
  }
}
