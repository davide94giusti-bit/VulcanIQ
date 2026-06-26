import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const EXPORT_DIR = process.env.STORAGE_EXPORT_DIR || 'backup/storage-assets';
const PROJECT_INFO_PATH = process.env.PROJECT_INFO_PATH || 'backup/00_project_info.json';
const LIST_LIMIT = 1000;

function requireEnv(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`${name} is required`);
  }
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
  const readme = `# Supabase Storage backup\n\nThis folder contains Supabase Storage files exported by the vulcanIQ backup workflow.\n\n## Contents\n\n- \`manifest.json\` - bucket, object, size, content type, last modified, and failure metadata.\n- \`<bucket-name>/<object-path>\` - downloaded binary files from each Storage bucket.\n\n## Summary\n\n- Generated at: ${manifest.generatedAt}\n- Source Supabase URL: ${manifest.supabaseUrl}\n- Buckets: ${manifest.bucketCount}\n- Downloaded objects: ${manifest.objectCount}\n- Failed objects: ${manifest.failureCount}\n- Total downloaded bytes: ${manifest.totalBytes}\n\n## Restore\n\nRun \`node restore-storage.js\` from the extracted backup folder after setting \`SUPABASE_URL\` and \`SUPABASE_SERVICE_ROLE_KEY\` for the target Supabase project. The restore script creates missing buckets where possible and uploads files with upsert enabled.\n\nIf \`failureCount\` is greater than zero, inspect \`manifest.json\` and manually re-upload failed objects.\n`;
  await writeFile(path.join(EXPORT_DIR, 'README_STORAGE.md'), readme, 'utf8');
}

async function main() {
  requireEnv('SUPABASE_URL', SUPABASE_URL);
  requireEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

  await mkdir(EXPORT_DIR, { recursive: true });

  const supabase = createClient(SUPABASE_URL.replace(/\/$/, ''), SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const generatedAt = new Date().toISOString();
  const manifest = {
    generatedAt,
    supabaseUrl: SUPABASE_URL.replace(/\/$/, ''),
    bucketCount: 0,
    objectCount: 0,
    failureCount: 0,
    totalBytes: 0,
    buckets: [],
    failures: []
  };

  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError) {
    throw new Error(`Failed to list Supabase Storage buckets: ${bucketError.message}`);
  }

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
      manifest.failures.push({ bucket: bucketName, name: null, step: 'list', error: error.message });
      continue;
    }

    for (const object of objects) {
      const objectName = object.objectName;
      try {
        const { data: blob, error } = await storageBucket.download(objectName);
        if (error) throw error;
        if (!blob) throw new Error('Downloaded object was empty');

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
          lastModified: object?.updated_at || object?.created_at || object?.last_accessed_at || null
        };

        bucketManifest.objects.push(item);
        bucketManifest.objectCount += 1;
        bucketManifest.totalBytes += size;
        manifest.objectCount += 1;
        manifest.totalBytes += size;
      } catch (error) {
        const failure = { bucket: bucketName, name: objectName, step: 'download', error: error.message || String(error) };
        manifest.failures.push(failure);
        console.warn(`Storage export failed for ${bucketName}/${objectName}: ${failure.error}`);
      }
    }
  }

  manifest.failureCount = manifest.failures.length;
  await writeFile(path.join(EXPORT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeStorageReadme(manifest);

  await updateProjectInfo({
    includes_storage_metadata: true,
    includes_storage_files: manifest.failureCount === 0,
    storage_bucket_count: manifest.bucketCount,
    storage_object_count: manifest.objectCount,
    storage_total_bytes: manifest.totalBytes,
    storage_failure_count: manifest.failureCount
  });

  console.log(`Storage export complete. Buckets: ${manifest.bucketCount}. Objects: ${manifest.objectCount}. Failures: ${manifest.failureCount}. Bytes: ${manifest.totalBytes}.`);
}

main().catch((error) => {
  console.error(`Supabase Storage export failed: ${error.message}`);
  process.exit(1);
});
