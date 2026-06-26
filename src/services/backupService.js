import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

function safeMessage(payload, fallback) {
  if (payload && typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
  if (payload && typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim();
  return fallback;
}

export async function createDatabaseBackup({ lang = 'en' } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(lang === 'it' ? 'Supabase non è configurato.' : 'Supabase is not configured.');
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data?.session?.access_token;
  if (!accessToken) {
    throw new Error(lang === 'it' ? 'Sessione admin non disponibile.' : 'Admin session is not available.');
  }

  const response = await fetch('/api/admin/backup/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ language: lang })
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(safeMessage(payload, lang === 'it' ? 'Impossibile avviare il backup.' : 'Could not start backup.'));
  }

  return payload;
}
