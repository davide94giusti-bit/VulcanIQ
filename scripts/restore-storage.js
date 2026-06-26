#!/usr/bin/env node
const { createReadStream } = require('node:fs');
const { access, readFile } = require('node:fs/promises');
const path = require('node:path');

const ROOT_DIR = process.cwd();
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MANIFEST_PATH = path.join(ROOT_DIR, 'storage-assets', 'manifest.json');

function requireEnv(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`${name} is required`);
  }
}

function encodeObjectPath(value) {
  return String(value || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function headers(contentType = 'application/json') {
  const result = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`
  };
  if (contentType) result['Content-Type'] = contentType;
  return result;
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text().catch(() => '');
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { response, body };
}

async function bucketExists(bucketName) {
  const { response } = await requestJson(`${SUPABASE_URL}/storage/v1/bucket/${encodeURIComponent(bucketName)}`, {
    headers: headers(null)
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Could not check bucket ${bucketName}: HTTP ${response.status}`);
  return true;
}

async function createBucket(bucket) {
  const bucketName = bucket.name;
  const { response, body } = await requestJson(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers('application/json'),
    body: JSON.stringify({ id: bucketName, name: bucketName, public: Boolean(bucket.public) })
  });

  if (response.ok || response.status === 409) return true;
  throw new Error(`Could not create bucket ${bucketName}: HTTP ${response.status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
}

async function uploadObject(object) {
  const localPath = path.join(ROOT_DIR, ...String(object.path || '').split('/'));
  await access(localPath);

  const objectUrl = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(object.bucket)}/${encodeObjectPath(object.name)}`;
  const response = await fetch(objectUrl, {
    method: 'POST',
    headers: {
      ...headers(object.contentType || 'application/octet-stream'),
      'x-upsert': 'true'
    },
    body: createReadStream(localPath),
    duplex: 'half'
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}${text ? ` - ${text}` : ''}`);
  }
}

async function main() {
  requireEnv('SUPABASE_URL', SUPABASE_URL);
  requireEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

  const rawManifest = await readFile(MANIFEST_PATH, 'utf8').catch(() => {
    throw new Error('storage-assets/manifest.json was not found. This is probably an older database-only backup. Check Storage manually and re-upload missing files.');
  });
  const manifest = JSON.parse(rawManifest);
  const buckets = Array.isArray(manifest.buckets) ? manifest.buckets : [];

  let bucketCount = 0;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for (const bucket of buckets) {
    if (!bucket || !bucket.name) continue;
    try {
      const exists = await bucketExists(bucket.name);
      if (!exists) await createBucket(bucket);
      bucketCount += 1;
    } catch (error) {
      const bucketFailures = Array.isArray(bucket.objects) ? bucket.objects.length : 0;
      failed += bucketFailures;
      failures.push({ bucket: bucket.name, name: null, error: error.message });
      console.error(`Bucket restore failed for ${bucket.name}: ${error.message}`);
      continue;
    }

    for (const object of Array.isArray(bucket.objects) ? bucket.objects : []) {
      try {
        if (!object || !object.bucket || !object.name || !object.path) {
          skipped += 1;
          continue;
        }
        await uploadObject(object);
        uploaded += 1;
      } catch (error) {
        failed += 1;
        failures.push({ bucket: object && object.bucket ? object.bucket : bucket.name, name: object && object.name ? object.name : null, error: error.message });
        console.error(`Object restore failed for ${(object && object.bucket) || bucket.name}/${(object && object.name) || ''}: ${error.message}`);
      }
    }
  }

  console.log('Supabase Storage restore summary:');
  console.log(`  buckets checked/created: ${bucketCount}`);
  console.log(`  uploaded: ${uploaded}`);
  console.log(`  skipped: ${skipped}`);
  console.log(`  failed: ${failed}`);

  if (failures.length) {
    console.log('Failures:');
    for (const failure of failures) {
      console.log(`  - ${failure.bucket}/${failure.name || ''}: ${failure.error}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Supabase Storage restore failed: ${error.message}`);
  console.error('Usage: SUPABASE_URL="https://target-project.supabase.co" SUPABASE_SERVICE_ROLE_KEY="..." node restore-storage.js');
  process.exit(1);
});
