export function json(status, body = {}) {
  if (status === 204) return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

export function cleanText(value, maxLength = 160) {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength);
}

export function localized(language, it, en) {
  return language === 'it' ? it : en;
}

export function requestLanguage(request, fallback = 'en') {
  const explicit = cleanText(request.headers.get('Accept-Language'), 32).toLowerCase();
  if (explicit.startsWith('it')) return 'it';
  if (explicit.startsWith('en')) return 'en';
  return fallback === 'it' ? 'it' : 'en';
}

export async function readRequestJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export function supabaseConfig(env = {}) {
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

export async function getUser(config, token) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) return null;
  return response.json();
}

export async function getOwnerProfile(config, userId) {
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

export async function requireActiveOwner(request, env = {}, language = 'en') {
  const token = bearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: json(401, { ok: false, message: localized(language, 'Sessione admin non disponibile.', 'Admin session is not available.') })
    };
  }

  const config = supabaseConfig(env);
  if (!config) {
    return {
      ok: false,
      response: json(500, { ok: false, message: localized(language, 'Endpoint backup non configurato.', 'Backup endpoint is not configured.') })
    };
  }

  const user = await getUser(config, token);
  if (!user?.id) {
    return {
      ok: false,
      response: json(401, { ok: false, message: localized(language, 'Sessione admin non valida.', 'Invalid admin session.') })
    };
  }

  const profile = await getOwnerProfile(config, user.id);
  if (!profile?.active || profile.role !== 'owner') {
    return {
      ok: false,
      response: json(403, { ok: false, message: localized(language, 'Solo gli owner attivi possono accedere ai backup.', 'Only active owners can access backups.') })
    };
  }

  return { ok: true, config, user, profile };
}

export function githubConfig(env = {}) {
  const owner = cleanText(env.GITHUB_OWNER, 120);
  const repo = cleanText(env.GITHUB_REPO, 120);
  const token = env.GITHUB_BACKUP_TOKEN;
  const workflowId = cleanText(env.GITHUB_BACKUP_WORKFLOW_ID || 'vulcaniq-db-backup.yml', 180);
  const ref = cleanText(env.GITHUB_BACKUP_REF || 'main', 120);
  if (!owner || !repo || !token || !workflowId || !ref) return null;
  return { owner, repo, token, workflowId, ref };
}

export async function githubFetch(config, path, init = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'User-Agent': 'vulcaniq-backup-admin',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {})
    }
  });
}

function artifactToSafeMetadata(artifact) {
  if (!artifact) return null;
  return {
    id: artifact.id,
    artifactName: artifact.name || '',
    createdAt: artifact.created_at || null,
    expiresAt: artifact.expires_at || null,
    sizeInBytes: Number.isFinite(Number(artifact.size_in_bytes)) ? Number(artifact.size_in_bytes) : null,
    expired: Boolean(artifact.expired)
  };
}

export async function findLatestBackupArtifact(env = {}) {
  const config = githubConfig(env);
  if (!config) return { ok: false, status: 500, code: 'github_backup_not_configured' };

  const workflowPath = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/actions/workflows/${encodeURIComponent(config.workflowId)}/runs`;
  const runParams = new URLSearchParams({
    status: 'success',
    branch: config.ref,
    per_page: '20'
  });

  const runsResponse = await githubFetch(config, `${workflowPath}?${runParams.toString()}`);
  if (!runsResponse.ok) {
    return { ok: false, status: runsResponse.status, code: githubErrorCode(runsResponse.status) };
  }

  const runsPayload = await runsResponse.json().catch(() => ({}));
  const runs = Array.isArray(runsPayload.workflow_runs) ? runsPayload.workflow_runs : [];
  if (!runs.length) return { ok: false, status: 404, code: 'no_successful_backup_runs' };

  for (const run of runs) {
    if (!run?.id) continue;
    const artifactsResponse = await githubFetch(config, `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/actions/runs/${encodeURIComponent(run.id)}/artifacts`);
    if (!artifactsResponse.ok) {
      return { ok: false, status: artifactsResponse.status, code: githubErrorCode(artifactsResponse.status) };
    }

    const artifactsPayload = await artifactsResponse.json().catch(() => ({}));
    const artifacts = (Array.isArray(artifactsPayload.artifacts) ? artifactsPayload.artifacts : [])
      .filter((artifact) => String(artifact?.name || '').startsWith('vulcaniq-supabase-backup-'))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    const downloadable = artifacts.find((artifact) => !artifact.expired);
    if (downloadable?.id) {
      return { ok: true, config, run, artifact: downloadable, latestBackup: artifactToSafeMetadata(downloadable) };
    }

    if (artifacts.length) {
      return { ok: false, status: 410, code: 'latest_artifact_expired', latestBackup: artifactToSafeMetadata(artifacts[0]) };
    }
  }

  return { ok: false, status: 404, code: 'no_backup_artifacts' };
}


function workflowRunToSafeMetadata(run) {
  if (!run) return null;
  return {
    id: run.id,
    runNumber: run.run_number || null,
    name: run.name || '',
    event: run.event || '',
    status: run.status || '',
    conclusion: run.conclusion || null,
    createdAt: run.created_at || null,
    updatedAt: run.updated_at || null,
    runStartedAt: run.run_started_at || null
  };
}

export async function findLatestBackupWorkflowRun(env = {}) {
  const config = githubConfig(env);
  if (!config) return { ok: false, status: 500, code: 'github_backup_not_configured', workflowRun: null };

  const workflowPath = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/actions/workflows/${encodeURIComponent(config.workflowId)}/runs`;
  const runParams = new URLSearchParams({
    branch: config.ref,
    per_page: '1'
  });

  const response = await githubFetch(config, `${workflowPath}?${runParams.toString()}`);
  if (!response.ok) {
    return { ok: false, status: response.status, code: githubErrorCode(response.status), workflowRun: null };
  }

  const payload = await response.json().catch(() => ({}));
  const runs = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
  return { ok: true, config, workflowRun: workflowRunToSafeMetadata(runs[0]) };
}

export function githubErrorCode(status) {
  if (status === 401 || status === 403) return 'github_access_denied';
  if (status === 404) return 'github_resource_not_found';
  if (status === 410) return 'latest_artifact_expired';
  if (status === 429) return 'github_rate_limited';
  return 'github_api_failed';
}

export function backupErrorMessage(language, code) {
  switch (code) {
    case 'github_backup_not_configured':
      return localized(language, 'Endpoint backup non configurato.', 'Backup endpoint is not configured.');
    case 'no_successful_backup_runs':
    case 'no_backup_artifacts':
      return localized(language, 'Nessun backup scaricabile trovato. Crea prima un backup.', 'No downloadable backup found. Create a backup first.');
    case 'latest_artifact_expired':
      return localized(language, 'L\'ultimo artifact backup è scaduto. Crea un nuovo backup.', 'The latest backup artifact has expired. Create a new backup.');
    case 'github_access_denied':
      return localized(language, 'Configurazione GitHub non autorizzata per il backup.', 'GitHub backup configuration is not authorized.');
    case 'github_rate_limited':
      return localized(language, 'Limite temporaneo GitHub raggiunto. Riprova più tardi.', 'Temporary GitHub rate limit reached. Try again later.');
    case 'artifact_download_failed':
      return localized(language, 'Errore durante il download del backup.', 'Backup download failed.');
    default:
      return localized(language, 'Errore durante il download del backup.', 'Backup download failed.');
  }
}

export function artifactFilename(artifact) {
  const baseName = cleanText(artifact?.name || 'vulcaniq-supabase-backup-latest', 180)
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-');
  return baseName.toLowerCase().endsWith('.zip') ? baseName : `${baseName}.zip`;
}

export async function restSelect(config, table, params = {}) {
  const query = new URLSearchParams(params);
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}?${query.toString()}`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Accept: 'application/json'
    }
  });
  if (!response.ok) return { ok: false, response, rows: [] };
  const rows = await response.json().catch(() => []);
  return { ok: true, response, rows: Array.isArray(rows) ? rows : [] };
}

export async function restUpsert(config, table, row) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(row)
  });
  if (!response.ok) return { ok: false, response, rows: [] };
  const rows = await response.json().catch(() => []);
  return { ok: true, response, rows: Array.isArray(rows) ? rows : [] };
}
