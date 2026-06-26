function json(status, body = {}) {
  if (status === 204) return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

function cleanText(value, maxLength = 160) {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength);
}

function localized(language, it, en) {
  return language === 'it' ? it : en;
}

function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function supabaseConfig(env) {
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return null;
  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    anonKey,
    serviceRoleKey
  };
}

async function readRequestJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function getUser(config, token) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) return null;
  return response.json();
}

async function getOwnerProfile(config, userId) {
  const query = new URLSearchParams({
    select: 'id,user_id,full_name,role,active',
    user_id: `eq.${userId}`,
    role: 'eq.owner',
    active: 'eq.true',
    limit: '1'
  });
  const response = await fetch(`${config.supabaseUrl}/rest/v1/admin_profiles?${query.toString()}`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Accept: 'application/json'
    }
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : null;
}

async function dispatchWorkflow(env, user, language) {
  const owner = cleanText(env.GITHUB_OWNER, 120);
  const repo = cleanText(env.GITHUB_REPO, 120);
  const token = env.GITHUB_BACKUP_TOKEN || env.GITHUB_TOKEN;
  const workflowId = cleanText(env.GITHUB_BACKUP_WORKFLOW_ID || 'vulcaniq-db-backup.yml', 180);
  const ref = cleanText(env.GITHUB_BACKUP_REF || 'main', 120);

  if (!owner || !repo || !token || !workflowId || !ref) {
    return { ok: false, status: 500, code: 'github_backup_not_configured' };
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowId)}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'vulcaniq-backup-dispatcher',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({
      ref,
      inputs: {
        requested_by: cleanText(user.email || user.id, 160),
        language: language === 'it' ? 'it' : 'en'
      }
    })
  });

  if (response.status === 204) return { ok: true };
  return { ok: false, status: response.status || 502, code: 'github_dispatch_failed' };
}

export async function onRequestOptions() {
  return json(204, {});
}

export async function onRequestPost(context) {
  const body = await readRequestJson(context.request);
  const language = cleanText(body.language, 8) === 'it' ? 'it' : 'en';
  const token = bearerToken(context.request);

  if (!token) {
    return json(401, { ok: false, message: localized(language, 'Sessione admin non disponibile.', 'Admin session is not available.') });
  }

  const config = supabaseConfig(context.env || {});
  if (!config) {
    return json(500, { ok: false, message: localized(language, 'Endpoint backup non configurato.', 'Backup endpoint is not configured.') });
  }

  const user = await getUser(config, token);
  if (!user?.id) {
    return json(401, { ok: false, message: localized(language, 'Sessione admin non valida.', 'Invalid admin session.') });
  }

  const profile = await getOwnerProfile(config, user.id);
  if (!profile?.active || profile.role !== 'owner') {
    return json(403, { ok: false, message: localized(language, 'Solo gli owner attivi possono avviare un backup.', 'Only active owners can start a backup.') });
  }

  const dispatch = await dispatchWorkflow(context.env || {}, user, language);
  if (!dispatch.ok) {
    const message = dispatch.code === 'github_backup_not_configured'
      ? localized(language, 'Configura le variabili GitHub server-side prima di avviare il backup.', 'Configure the server-side GitHub variables before starting the backup.')
      : localized(language, 'GitHub Actions non ha accettato la richiesta di backup.', 'GitHub Actions did not accept the backup request.');
    return json(dispatch.status || 502, { ok: false, message });
  }

  return json(200, { ok: true, message: localized(language, 'Backup avviato', 'Backup started') });
}
