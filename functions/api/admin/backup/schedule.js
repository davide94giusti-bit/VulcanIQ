import { cleanText, json, localized, readRequestJson, requestLanguage, requireActiveOwner, restSelect, restUpsert } from './_shared.js';

const DEFAULT_SCHEDULE = {
  id: 'default',
  enabled: true,
  frequency: 'daily',
  utc_hour: 2,
  utc_minute: 0,
  weekly_day: 0,
  monthly_day: 1,
  updated_at: null,
  updated_by: null,
  last_scheduled_backup_at: null
};

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeSchedule(payload, userId) {
  const frequency = ['daily', 'weekly', 'monthly'].includes(payload?.frequency) ? payload.frequency : 'daily';
  return {
    id: 'default',
    enabled: payload?.enabled !== false,
    frequency,
    utc_hour: clampInteger(payload?.utc_hour, 0, 23, 2),
    utc_minute: clampInteger(payload?.utc_minute, 0, 59, 0),
    weekly_day: frequency === 'weekly' ? clampInteger(payload?.weekly_day, 0, 6, 0) : null,
    monthly_day: frequency === 'monthly' ? clampInteger(payload?.monthly_day, 1, 28, 1) : null,
    updated_by: userId
  };
}

function safeSchedule(row) {
  return {
    ...DEFAULT_SCHEDULE,
    ...(row || {}),
    id: 'default',
    enabled: row?.enabled !== false,
    frequency: ['daily', 'weekly', 'monthly'].includes(row?.frequency) ? row.frequency : 'daily',
    utc_hour: clampInteger(row?.utc_hour, 0, 23, 2),
    utc_minute: clampInteger(row?.utc_minute, 0, 59, 0),
    weekly_day: row?.weekly_day === null || row?.weekly_day === undefined ? null : clampInteger(row.weekly_day, 0, 6, 0),
    monthly_day: row?.monthly_day === null || row?.monthly_day === undefined ? null : clampInteger(row.monthly_day, 1, 28, 1)
  };
}

async function loadSchedule(config) {
  const result = await restSelect(config, 'system_backup_settings', {
    select: 'id,enabled,frequency,utc_hour,utc_minute,weekly_day,monthly_day,updated_at,updated_by,last_scheduled_backup_at',
    id: 'eq.default',
    limit: '1'
  });
  if (result.ok) return { ok: true, schedule: safeSchedule(result.rows[0]) };

  // Backward compatibility for databases that ran an earlier draft migration.
  const fallback = await restSelect(config, 'system_backup_settings', {
    select: 'id,enabled,frequency,utc_hour,utc_minute,weekly_day,monthly_day,updated_at,updated_by,last_backup_at',
    id: 'eq.default',
    limit: '1'
  });
  if (!fallback.ok) return { ok: false, status: result.response.status || fallback.response.status };
  const row = fallback.rows[0] || null;
  return { ok: true, schedule: safeSchedule(row ? { ...row, last_scheduled_backup_at: row.last_backup_at || null } : null) };
}

export async function onRequestOptions() {
  return json(204, {});
}

export async function onRequestGet(context) {
  const language = requestLanguage(context.request, 'en');
  const ownerAccess = await requireActiveOwner(context.request, context.env || {}, language);
  if (!ownerAccess.ok) return ownerAccess.response;

  const result = await loadSchedule(ownerAccess.config);
  if (!result.ok) {
    return json(result.status || 500, {
      ok: false,
      message: localized(language, 'Impostazioni programmazione backup non disponibili. Esegui la migrazione Supabase.', 'Backup schedule settings are not available. Run the Supabase migration.')
    });
  }

  return json(200, { ok: true, schedule: result.schedule });
}

export async function onRequestPut(context) {
  const language = requestLanguage(context.request, 'en');
  const ownerAccess = await requireActiveOwner(context.request, context.env || {}, language);
  if (!ownerAccess.ok) return ownerAccess.response;

  const payload = await readRequestJson(context.request);
  const row = normalizeSchedule(payload, ownerAccess.user.id);
  const result = await restUpsert(ownerAccess.config, 'system_backup_settings', row);
  if (!result.ok) {
    console.error('vulcanIQ backup schedule save failed', { status: result.response.status, statusText: result.response.statusText });
    return json(result.response.status || 500, {
      ok: false,
      message: localized(language, 'Programmazione backup non salvata.', 'Backup schedule was not saved.')
    });
  }

  return json(200, {
    ok: true,
    message: localized(language, 'Programmazione salvata', 'Schedule saved'),
    schedule: safeSchedule(result.rows[0] || row)
  });
}

export async function onRequestPost(context) {
  return onRequestPut(context);
}
