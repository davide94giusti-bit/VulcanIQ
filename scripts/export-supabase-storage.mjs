import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveSupabaseBackendCredential } from '../functions/api/_shared/supabaseBackend.js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const EXPORT_DIR = process.env.STORAGE_EXPORT_DIR || 'backup/storage-assets';
const PROJECT_INFO_PATH = process.env.PROJECT_INFO_PATH || 'backup/00_project_info.json';
const LIST_LIMIT = 1000;
const DOWNLOAD_MAX_ATTEMPTS = 3;

function requireEnv(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`${name} is required`);
  }
}

function secretCompatibleFetch(credential) {
  return (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (credential.kind === 'secret' && headers.get('Authorization') === `Bearer ${credential.key}`) headers.delete('Authorization');
    return globalThis.fetch(input, { ...init, headers });
  };
}

function safePathSegments(value) {
  return String(value || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment) => segment.replace(/[\\:*?"<>|\u0000-\u001f]/g, '_'));
}

function storageRelativePath(bucket, objectName) {
  return path.posix.join('storage-assets', ...safePathSegments(bucket), ...safePathSegments(objectName));
}

function localObjectPath(bucket, objectName) {
  return path.join(EXPORT_DIR, ...safePathSegments(bucket), ...safePathSegments(objectName));
}

function isFolderItem(item) {
  return item && (item.id === null || item.id === undefined) && !item.metadata;
}

function metadataSize(item) {
  const raw = item?.metadata?.size ?? item?.metadata?.contentLength ?? item?.metadata?.content_length;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function metadataContentType(item, blob) {
  return blob?.type || item?.metadata?.mimetype || item?.metadata?.contentType || item?.metadata?.content_type || null;
}

function sanitizeFailureText(value, fallback = 'storage_export_error') {
  return String(value || fallback)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/(?:sb_secret_|eyJ)[A-Za-z0-9._-]+/g, '[credential]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, 240) || fallback;
}

function safeReference(value, maxLength = 500) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength) || null;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function downloadWithRetry(storageBucket, objectName) {
  let lastError = null;
  for (let attempt = 1; attempt <= DOWNLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      const { data: blob, error } = await storageBucket.download(objectName);
      if (error) throw error;
      if (!blob) throw new Error('Downloaded object was empty');
      return { blob, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt < DOWNLOAD_MAX_ATTEMPTS) await delay(150 * (2 ** (attempt - 1)));
    }
  }
  throw Object.assign(new Error(sanitizeFailureText(lastError?.message)), { attempts: DOWNLOAD_MAX_ATTEMPTS });
}

async function referenceDiagnostic(storageBucket, objectName) {
  const segments = String(objectName || '').split('/');
  const name = segments.pop() || '';
  const prefix = segments.join('/');
  try {
    const { data, error } = await storageBucket.list(prefix, { limit: 100, search: name });
    if (error) throw error;
    return {
      checked: true,
      listedAtExport: (Array.isArray(data) ? data : []).some((item) => String(item?.name || '') === name)
    };
  } catch (error) {
    return { checked: false, listedAtExport: null, errorCode: sanitizeFailureText(error?.message) };
  }
}

async function listAllObjects(storageBucket, prefix = '') {
  const objects = [];
  let offset = 0;

  while (true) {
    const { data, error } = await storageBucket.list(prefix, {
      limit: LIST_LIMIT,
      offset,
      sortBy: { column: 'name', order: 'asc' }
    });

    if (error) {
      throw new Error(`Failed to list ${prefix || '/'}: ${error.message}`);
    }

    const items = Array.isArray(data) ? data : [];
    for (const item of items) {
      const name = String(item?.name || '').trim();
      if (!name || name === '.' || name === '..') continue;
      const objectName = prefix ? `${prefix}/${name}` : name;
      if (isFolderItem(item)) {
        objects.push(...await listAllObjects(storageBucket, objectName));
      } else {
        objects.push({ ...item, objectName });
      }
    }

    if (items.length < LIST_LIMIT) break;
    offset += LIST_LIMIT;
  }

  return objects;
}

async function updateProjectInfo(partial) {
  try {
    const raw = await readFile(PROJECT_INFO_PATH, 'utf8');
    const current = JSON.parse(raw);
    await writeFile(PROJECT_INFO_PATH, `${JSON.stringify({ ...current, ...partial }, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.warn(`Storage export could not update ${PROJECT_INFO_PATH}: ${error.message}`);
  }
}

async function writeStorageReadme(manifest) {
  const readme = `# Supabase Storage backup\n\nThis folder contains Supabase Storage files exported by the vulcanIQ backup workflow.\n\n## Contents\n\n- \`manifest.json\` - bucket, object, size, content type, last modified, and failure metadata.\n- \`<bucket-name>/<object-path>\` - downloaded binary files from each Storage bucket.\n\n## Summary\n\n- Generated at: ${manifest.generatedAt}\n- Source Supabase URL: ${manifest.supabaseUrl}\n- Buckets: ${manifest.bucketCount}\n- Downloaded objects: ${manifest.objectCount}\n- Failed objects: ${manifest.failureCount}\n- Total downloaded bytes: ${manifest.totalBytes}\n\n## Restore\n\nRun \`node restore-storage.js\` from the extracted backup folder after setting \`SUPABASE_URL\` and preferably \`SUPABASE_SECRET_KEY\` for the target Supabase project. \`SUPABASE_SERVICE_ROLE_KEY\` remains a temporary fallback. The restore script creates missing buckets where possible and uploads files with upsert enabled.\n\nIf \`failureCount\` is greater than zero, inspect \`manifest.json\` and manually re-upload failed objects.\n`;
  await writeFile(path.join(EXPORT_DIR, 'README_STORAGE.md'), readme, 'utf8');
}

async function main() {
  requireEnv('SUPABASE_URL', SUPABASE_URL);
  const backendCredential = resolveSupabaseBackendCredential(process.env);
  if (!backendCredential) throw new Error('SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required');

  await mkdir(EXPORT_DIR, { recursive: true });

  const supabase = createClient(SUPABASE_URL.replace(/\/$/, ''), backendCredential.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: secretCompatibleFetch(backendCredential) }
  });

  const generatedAt = new Date().toISOString();
  const manifest = {
    manifestVersion: 2,
    generatedAt,
    supabaseUrl: SUPABASE_URL.replace(/\/$/, ''),
    exportStatus: 'complete',
    maxDownloadAttempts: DOWNLOAD_MAX_ATTEMPTS,
    bucketCount: 0,
    objectCount: 0,
    failureCount: 0,
    totalBytes: 0,
    buckets: [],
    failures: []
  };

  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError) manifest.failures.push({ bucket: null, name: null, step: 'list_buckets', errorCode: sanitizeFailureText(bucketError.message), referenceDiagnostic: { checked: false, listedAtExport: null } });

  const bucketList = Array.isArray(buckets) ? buckets : [];
  manifest.bucketCount = bucketList.length;

  for (const bucket of bucketList) {
    const bucketName = String(bucket?.name || bucket?.id || '').trim();
    if (!bucketName) continue;

    const bucketManifest = {
      name: bucketName,
      id: bucket?.id || bucketName,
      public: Boolean(bucket?.public),
      objectCount: 0,
      totalBytes: 0,
      objects: []
    };
    manifest.buckets.push(bucketManifest);

    const storageBucket = supabase.storage.from(bucketName);
    let objects = [];
    try {
      objects = await listAllObjects(storageBucket, '');
    } catch (error) {
      manifest.failures.push({ bucket: safeReference(bucketName, 120), name: null, step: 'list', errorCode: sanitizeFailureText(error.message), referenceDiagnostic: { checked: false, listedAtExport: null } });
      continue;
    }

    for (const object of objects) {
      const objectName = object.objectName;
      try {
        const { blob, attempts } = await downloadWithRetry(storageBucket, objectName);

        const arrayBuffer = await blob.arrayBuffer();
        const bytes = Buffer.from(arrayBuffer);
        const filePath = localObjectPath(bucketName, objectName);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, bytes);

        const size = bytes.byteLength || metadataSize(object) || 0;
        const item = {
          bucket: bucketName,
          name: objectName,
          path: storageRelativePath(bucketName, objectName),
          size,
          contentType: metadataContentType(object, blob),
          lastModified: object?.updated_at || object?.created_at || object?.last_accessed_at || null,
          downloadAttempts: attempts
        };

        bucketManifest.objects.push(item);
        bucketManifest.objectCount += 1;
        bucketManifest.totalBytes += size;
        manifest.objectCount += 1;
        manifest.totalBytes += size;
      } catch (error) {
        const diagnostic = await referenceDiagnostic(storageBucket, objectName);
        const failure = { bucket: safeReference(bucketName, 120), name: safeReference(objectName), step: 'download', attempts: Number(error?.attempts || DOWNLOAD_MAX_ATTEMPTS), errorCode: sanitizeFailureText(error.message || error), referenceDiagnostic: diagnostic };
        manifest.failures.push(failure);
        console.warn('Storage export object failed', { bucket: failure.bucket, name: failure.name, attempts: failure.attempts, errorCode: failure.errorCode, referenceDiagnostic: failure.referenceDiagnostic });
      }
    }
  }

  manifest.failureCount = manifest.failures.length;
  manifest.exportStatus = manifest.failureCount === 0 ? 'complete' : manifest.objectCount > 0 ? 'partial' : 'failed';
  await writeFile(path.join(EXPORT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeStorageReadme(manifest);

  await updateProjectInfo({
    includes_storage_metadata: true,
    includes_storage_files: manifest.objectCount > 0,
    storage_export_status: manifest.exportStatus,
    storage_bucket_count: manifest.bucketCount,
    storage_object_count: manifest.objectCount,
    storage_total_bytes: manifest.totalBytes,
    storage_failure_count: manifest.failureCount
  });

  console.log(`Storage export ${manifest.exportStatus}. Buckets: ${manifest.bucketCount}. Objects: ${manifest.objectCount}. Failures: ${manifest.failureCount}. Bytes: ${manifest.totalBytes}.`);
}

main().catch((error) => {
  console.error(`Supabase Storage export failed: ${error.message}`);
  process.exit(1);
});
