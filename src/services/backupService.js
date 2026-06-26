import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

function safeMessage(payload, fallback) {
  if (payload && typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
  if (payload && typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim();
  return fallback;
}

function localized(lang, it, en) {
  return lang === 'it' ? it : en;
}

async function accessToken(lang) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(localized(lang, 'Supabase non è configurato.', 'Supabase is not configured.'));
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) {
    throw new Error(localized(lang, 'Sessione admin non disponibile.', 'Admin session is not available.'));
  }
  return token;
}

function extractFilename(contentDisposition) {
  if (!contentDisposition) return '';
  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1].trim().replace(/^"|"$/g, ''));
  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ? match[1].trim() : '';
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function createDatabaseBackup({ lang = 'en' } = {}) {
  const token = await accessToken(lang);

  const response = await fetch('/api/admin/backup/create', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ language: lang })
  });

  const payload = await readJsonResponse(response);

  if (!response.ok || !payload?.ok) {
    throw new Error(safeMessage(payload, localized(lang, 'Impossibile avviare il backup.', 'Could not start backup.')));
  }

  return payload;
}

export async function downloadLatestDatabaseBackup({ lang = 'en' } = {}) {
  const token = await accessToken(lang);

  const response = await fetch('/api/admin/backup/download', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Language': lang || 'en'
    }
  });

  if (!response.ok) {
    const payload = await readJsonResponse(response);
    throw new Error(safeMessage(payload, localized(lang, 'Errore durante il download del backup.', 'Backup download failed.')));
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const filename = extractFilename(disposition) || 'vulcaniq-supabase-backup-latest.zip';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return { ok: true, filename };
}

export async function getBackupStatus({ lang = 'en' } = {}) {
  const token = await accessToken(lang);
  const response = await fetch('/api/admin/backup/status', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Language': lang || 'en'
    }
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(safeMessage(payload, localized(lang, 'Stato backup non disponibile.', 'Backup status is not available.')));
  }
  return payload || { ok: false, latestBackup: null };
}

export async function getBackupSchedule({ lang = 'en' } = {}) {
  const token = await accessToken(lang);
  const response = await fetch('/api/admin/backup/schedule', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Language': lang || 'en'
    }
  });
  const payload = await readJsonResponse(response);
  if (!response.ok || !payload?.ok) {
    throw new Error(safeMessage(payload, localized(lang, 'Programmazione backup non disponibile.', 'Backup schedule is not available.')));
  }
  return payload.schedule;
}

export async function saveBackupSchedule(schedule, { lang = 'en' } = {}) {
  const token = await accessToken(lang);
  const response = await fetch('/api/admin/backup/schedule', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Language': lang || 'en',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(schedule)
  });
  const payload = await readJsonResponse(response);
  if (!response.ok || !payload?.ok) {
    throw new Error(safeMessage(payload, localized(lang, 'Programmazione backup non salvata.', 'Backup schedule was not saved.')));
  }
  return payload;
}
