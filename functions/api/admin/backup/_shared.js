import { importPKCS8, SignJWT } from 'jose';
import { resolveSupabaseBackendCredential, supabaseBackendHeaders } from '../../_shared/supabaseBackend.js';

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

export async function readRequestJsonWithinLimit(request, maxBytes = 8192) {
  const advertisedLength = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(advertisedLength) && advertisedLength > maxBytes) {
    return { ok: false, status: 413, code: 'request_body_too_large' };
  }

  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch {
    return { ok: false, status: 400, code: 'invalid_request_body' };
  }

  if (new TextEncoder().encode(rawBody).byteLength > maxBytes) {
    return { ok: false, status: 413, code: 'request_body_too_large' };
  }

  if (!rawBody.trim()) return { ok: true, value: {} };

  try {
    const value = JSON.parse(rawBody);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, status: 400, code: 'invalid_json_object' };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, status: 400, code: 'malformed_json' };
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
  const backendCredential = resolveSupabaseBackendCredential(env);
  if (!supabaseUrl || !anonKey || !backendCredential) return null;
  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    anonKey,
    backendCredential
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
    headers: supabaseBackendHeaders(config.backendCredential, { headers: { Accept: 'application/json' } })
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

let cachedInstallationToken = null;
let cachedInstallationTokenExpiresAt = 0;

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function derLength(length) {
  if (length < 128) return Uint8Array.of(length);
  const output = [];
  let remaining = length;
  while (remaining > 0) {
    output.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return Uint8Array.of(0x80 | output.length, ...output);
}

function derNode(tag, payload) {
  const length = derLength(payload.length);
  const output = new Uint8Array(1 + length.length + payload.length);
  output[0] = tag;
  output.set(length, 1);
  output.set(payload, 1 + length.length);
  return output;
}

function concatBytes(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function pkcs1ToPkcs8Pem(pem) {
  const base64 = String(pem || '')
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, '')
    .replace(/-----END RSA PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!base64) throw new Error('GitHub App private key is empty.');

  const pkcs1 = base64ToBytes(base64);
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const rsaAlgorithmIdentifier = Uint8Array.of(
    0x30, 0x0d,
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00
  );
  const privateKeyOctetString = derNode(0x04, pkcs1);
  const pkcs8 = derNode(0x30, concatBytes(version, rsaAlgorithmIdentifier, privateKeyOctetString));
  const wrapped = bytesToBase64(pkcs8).match(/.{1,64}/g)?.join('\n') || '';
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}

function normalizePrivateKey(value) {
  const key = String(value || '').replace(/\\n/g, '\n').trim();
  if (key.includes('BEGIN PRIVATE KEY')) return key;
  if (key.includes('BEGIN RSA PRIVATE KEY')) return pkcs1ToPkcs8Pem(key);
  throw new Error('GitHub App private key must be PKCS#8 or PKCS#1 PEM.');
}

export function githubConfig(env = {}) {
  const owner = cleanText(env.GITHUB_OWNER, 120);
  const repo = cleanText(env.GITHUB_REPO, 120);
  const workflowId = cleanText(env.GITHUB_BACKUP_WORKFLOW || env.GITHUB_BACKUP_WORKFLOW_ID || 'vulcaniq-db-backup.yml', 180);
  const ref = cleanText(env.GITHUB_BACKUP_REF || 'main', 120);
  const appId = cleanText(env.GITHUB_APP_ID, 80);
  const installationId = cleanText(env.GITHUB_APP_INSTALLATION_ID, 80);
  const privateKey = env.GITHUB_APP_PRIVATE_KEY;
  const legacyToken = env.GITHUB_BACKUP_TOKEN;
  const hasApp = Boolean(appId && installationId && privateKey);
  const hasLegacyPat = Boolean(legacyToken);
  if (!owner || !repo || !workflowId || !ref || (!hasApp && !hasLegacyPat)) return null;
  return {
    owner,
    repo,
    workflowId,
    ref,
    appId,
    installationId,
    privateKey,
    legacyToken,
    authMode: hasApp ? 'github_app' : 'legacy_pat'
  };
}

async function createGitHubAppToken(config) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedInstallationToken && cachedInstallationTokenExpiresAt > now + 60) {
    return { token: cachedInstallationToken, authMode: 'github_app' };
  }

  const privateKey = await importPKCS8(normalizePrivateKey(config.privateKey), 'RS256');
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + (9 * 60))
    .setIssuer(config.appId)
    .sign(privateKey);

  const response = await fetch(`https://api.github.com/app/installations/${encodeURIComponent(config.installationId)}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'vulcaniq-cloudflare-backup'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub App token creation failed: ${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  if (!payload?.token) throw new Error('GitHub did not return an installation token.');

  cachedInstallationToken = payload.token;
  cachedInstallationTokenExpiresAt = Math.floor(new Date(payload.expires_at || Date.now() + (50 * 60 * 1000)).getTime() / 1000);
  return { token: payload.token, authMode: 'github_app' };
}

async function githubCredential(config) {
  if (config.authMode === 'github_app') {
    try {
      return await createGitHubAppToken(config);
    } catch (error) {
      if (!config.legacyToken) throw error;
      console.warn('vulcanIQ GitHub App authentication failed; using temporary PAT fallback', {
        message: cleanText(error?.message || 'github_app_authentication_failed', 160)
      });
      return { token: config.legacyToken, authMode: 'legacy_pat' };
    }
  }
  if (config.legacyToken) return { token: config.legacyToken, authMode: 'legacy_pat' };
  throw new Error('GitHub backup authentication is not configured.');
}

export async function githubFetch(config, path, init = {}) {
  try {
    const credential = await githubCredential(config);
    const response = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${credential.token}`,
        'User-Agent': 'vulcaniq-cloudflare-backup',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.headers || {})
      }
    });
    Object.defineProperty(response, 'vulcaniqAuthMode', { value: credential.authMode, enumerable: false });
    return response;
  } catch (error) {
    console.error('vulcanIQ GitHub authentication failed', {
      authMode: config?.authMode || 'unknown',
      message: cleanText(error?.message || 'github_authentication_failed', 240)
    });
    return new Response('', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function claimAdminActionRateLimit(config, actionKey, actorKey, limit = 3, windowSeconds = 300) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/claim_admin_action_rate_limit`, {
    method: 'POST',
    headers: supabaseBackendHeaders(config.backendCredential, { headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    } }),
    body: JSON.stringify({
      p_action_key: cleanText(actionKey, 80),
      p_actor_key: cleanText(actorKey, 160),
      p_limit: Math.max(1, Math.min(20, Number(limit) || 3)),
      p_window_seconds: Math.max(60, Math.min(86400, Number(windowSeconds) || 300))
    })
  });
  if (!response.ok) return false;
  const result = await response.json().catch(() => false);
  return result === true || result?.allowed === true;
}

export function requestHasJsonContentType(request) {
  return String(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json');
}

export function requestBodyWithinLimit(request, maxBytes = 8192) {
  const value = Number(request.headers.get('Content-Length') || 0);
  return !Number.isFinite(value) || value <= 0 || value <= maxBytes;
}

function validIsoString(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseBackupCreatedAtFromArtifactName(name) {
  const match = String(name || '').match(/vulcaniq-supabase-backup-(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-UTC/i);
  if (!match) return null;
  return validIsoString(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00Z`);
}

function artifactToSafeMetadata(artifact) {
  if (!artifact) return null;
  const artifactCreatedAt = validIsoString(artifact.created_at);
  const parsedBackupCreatedAt = parseBackupCreatedAtFromArtifactName(artifact.name);
  const backupCreatedAt = parsedBackupCreatedAt || artifactCreatedAt;
  return {
    id: artifact.id,
    artifactName: artifact.name || '',
    createdAt: backupCreatedAt,
    backupCreatedAt,
    backupCreatedAtSource: parsedBackupCreatedAt ? 'artifact_name' : 'github_artifact_created_at',
    parsedBackupCreatedAt,
    artifactCreatedAt,
    artifactUpdatedAt: validIsoString(artifact.updated_at),
    uploadedAt: artifactCreatedAt,
    expiresAt: validIsoString(artifact.expires_at),
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
    createdAt: validIsoString(run.created_at),
    updatedAt: validIsoString(run.updated_at),
    runStartedAt: validIsoString(run.run_started_at),
    htmlUrl: run.html_url || null
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
      return localized(language, 'Nessun backup completato trovato. Crea prima un backup.', 'No completed backup found. Create a backup first.');
    case 'no_backup_artifacts':
      return localized(language, 'Nessuno ZIP backup scaricabile trovato per l’ultimo workflow.', 'No downloadable backup ZIP found for the latest workflow.');
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
    headers: supabaseBackendHeaders(config.backendCredential, { headers: { Accept: 'application/json' } })
  });
  if (!response.ok) return { ok: false, response, rows: [] };
  const rows = await response.json().catch(() => []);
  return { ok: true, response, rows: Array.isArray(rows) ? rows : [] };
}

export async function restUpsert(config, table, row) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: supabaseBackendHeaders(config.backendCredential, { headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    } }),
    body: JSON.stringify(row)
  });
  if (!response.ok) return { ok: false, response, rows: [] };
  const rows = await response.json().catch(() => []);
  return { ok: true, response, rows: Array.isArray(rows) ? rows : [] };
}
function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeZipEntryName(name) {
  return String(name || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function zipReadUint16(view, offset) {
  return view.getUint16(offset, true);
}

function zipReadUint32(view, offset) {
  return view.getUint32(offset, true);
}

async function inflateZipEntry(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('DecompressionStream is not available');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function extractZipTextEntries(arrayBuffer, wantedNames = []) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const decoder = new TextDecoder('utf-8');
  const wanted = new Set(wantedNames.map(normalizeZipEntryName));
  const found = {};
  const maxSearch = Math.max(0, bytes.length - 66000);
  let eocdOffset = -1;

  for (let offset = bytes.length - 22; offset >= maxSearch; offset -= 1) {
    if (zipReadUint32(view, offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('ZIP end of central directory not found');

  const totalEntries = zipReadUint16(view, eocdOffset + 10);
  let centralOffset = zipReadUint32(view, eocdOffset + 16);

  for (let index = 0; index < totalEntries && centralOffset < bytes.length; index += 1) {
    if (zipReadUint32(view, centralOffset) !== 0x02014b50) break;

    const method = zipReadUint16(view, centralOffset + 10);
    const compressedSize = zipReadUint32(view, centralOffset + 20);
    const fileNameLength = zipReadUint16(view, centralOffset + 28);
    const extraLength = zipReadUint16(view, centralOffset + 30);
    const commentLength = zipReadUint16(view, centralOffset + 32);
    const localOffset = zipReadUint32(view, centralOffset + 42);
    const nameBytes = bytes.slice(centralOffset + 46, centralOffset + 46 + fileNameLength);
    const entryName = normalizeZipEntryName(decoder.decode(nameBytes));
    const matchingName = [...wanted].find((wantedName) => entryName === wantedName || entryName.endsWith(`/${wantedName}`));

    if (matchingName && zipReadUint32(view, localOffset) === 0x04034b50) {
      const localNameLength = zipReadUint16(view, localOffset + 26);
      const localExtraLength = zipReadUint16(view, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressedBytes = bytes.slice(dataStart, dataStart + compressedSize);
      let uncompressedBytes = null;
      if (method === 0) {
        uncompressedBytes = compressedBytes;
      } else if (method === 8) {
        uncompressedBytes = await inflateZipEntry(compressedBytes);
      } else {
        throw new Error(`Unsupported ZIP compression method ${method}`);
      }
      found[matchingName] = decoder.decode(uncompressedBytes);
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
    if (Object.keys(found).length === wanted.size) break;
  }

  return found;
}

function parseJsonText(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function backupMetadataToStorageSummary(projectInfo, storageManifest) {
  if (!projectInfo && !storageManifest) {
    return {
      detailsAvailable: false,
      included: null,
      status: 'none',
      fileCount: null,
      sizeInBytes: null,
      bucketCount: null,
      failureCount: null,
      failures: []
    };
  }

  const metadataIncluded = projectInfo?.includes_storage_metadata === true || Boolean(storageManifest);
  const fileCount = safeNumber(projectInfo?.storage_object_count) ?? safeNumber(storageManifest?.objectCount);
  const failureCount = safeNumber(projectInfo?.storage_failure_count) ?? safeNumber(storageManifest?.failureCount);
  const declaredStatus = cleanText(projectInfo?.storage_export_status || storageManifest?.exportStatus, 20);
  const status = ['none', 'complete', 'partial', 'failed'].includes(declaredStatus)
    ? declaredStatus
    : !metadataIncluded
      ? 'none'
      : Number(failureCount || 0) > 0
        ? Number(fileCount || 0) > 0 ? 'partial' : 'failed'
        : 'complete';
  const filesIncluded = fileCount !== null ? fileCount > 0 : projectInfo?.includes_storage_files === true ? true : projectInfo?.includes_storage_files === false ? false : null;
  const failures = (Array.isArray(storageManifest?.failures) ? storageManifest.failures : []).slice(0, 25).map((failure) => ({
    bucket: cleanText(failure?.bucket, 120) || null,
    name: cleanText(failure?.name, 500) || null,
    step: cleanText(failure?.step, 40) || 'unknown',
    attempts: safeNumber(failure?.attempts),
    errorCode: cleanText(failure?.errorCode, 160) || 'storage_export_error',
    referenceChecked: failure?.referenceDiagnostic?.checked === true,
    listedAtExport: typeof failure?.referenceDiagnostic?.listedAtExport === 'boolean' ? failure.referenceDiagnostic.listedAtExport : null
  }));

  return {
    detailsAvailable: metadataIncluded,
    included: filesIncluded,
    status,
    fileCount,
    sizeInBytes: safeNumber(projectInfo?.storage_total_bytes) ?? safeNumber(storageManifest?.totalBytes),
    bucketCount: safeNumber(projectInfo?.storage_bucket_count) ?? safeNumber(storageManifest?.bucketCount),
    failureCount,
    failures
  };
}

export async function readBackupArtifactMetadata(config, artifact) {
  if (!config || !artifact?.id) return null;

  let response = await githubFetch(
    config,
    `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/actions/artifacts/${encodeURIComponent(artifact.id)}/zip`,
    { redirect: 'manual' }
  );

  if (response.status >= 300 && response.status < 400 && response.headers.get('Location')) {
    response = await fetch(response.headers.get('Location'), {
      method: 'GET',
      headers: { Accept: 'application/zip' }
    });
  }

  if (!response.ok) return null;

  const zip = await response.arrayBuffer();
  if (!zip || zip.byteLength === 0) return null;

  try {
    const entries = await extractZipTextEntries(zip, ['00_project_info.json', 'storage-assets/manifest.json']);
    const projectInfo = parseJsonText(entries['00_project_info.json']);
    const storageManifest = parseJsonText(entries['storage-assets/manifest.json']);
    return {
      projectInfo,
      storageManifest,
      backupCreatedAtUtc: validIsoString(projectInfo?.backup_created_at_utc || projectInfo?.backupCreatedAtUtc || projectInfo?.backup_created_at),
      storage: backupMetadataToStorageSummary(projectInfo, storageManifest),
      auth: {
        schemaIncluded: projectInfo?.includes_auth_schema === true,
        dataIncluded: projectInfo?.includes_auth_data === true,
        restoreMode: cleanText(projectInfo?.auth_restore_mode, 80) || 'manual_reprovision'
      },
      integrity: {
        sha256ManifestIncluded: projectInfo?.includes_sha256_checksums === true,
        dataClassification: cleanText(projectInfo?.data_classification, 80) || 'confidential_restricted'
      }
    };
  } catch (error) {
    console.warn('vulcanIQ backup metadata could not be read', { message: error.message });
    return null;
  }
}

