import { writeFile, readFile, stat, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function projectInfo(env) {
  return { app: 'vulcanIQ', backup_created_at_utc: env.BACKUP_CREATED_AT_UTC, supabase_project_ref: env.SUPABASE_PROJECT_REF,
    requested_by: env.BACKUP_REQUESTED_BY || env.GITHUB_ACTOR_ID, trigger: env.BACKUP_EVENT_NAME, backup_trigger: env.BACKUP_TRIGGER,
    scheduled_backup_due_at_utc: env.SCHEDULED_BACKUP_DUE_AT || '', includes_roles: true, includes_schema: true, includes_data: true,
    includes_auth_schema: false, includes_auth_data: false, auth_restore_mode: 'manual_reprovision', includes_storage_metadata: false,
    includes_storage_files: false, storage_export_status: 'none', includes_sha256_checksums: true, data_classification: 'confidential_restricted',
    source_commit: env.GITHUB_SHA, database_complete: false, storage_complete: false, system_complete: false,
    excluded_recovery_scopes: ['auth_identities', 'd1', 'secrets'], max_provider_retention_days: 30 };
}

export function completeness(info, manifest, sqlComplete) {
  const storageComplete = manifest.exportStatus === 'complete' && manifest.failureCount === 0 && Array.isArray(manifest.buckets)
    && Number.isInteger(manifest.objectCount) && manifest.objectCount >= 0
    && manifest.buckets.reduce((sum, bucket) => sum + (Array.isArray(bucket.objects) ? bucket.objects.length : NaN), 0) === manifest.objectCount;
  return { ...info, includes_storage_metadata: true, includes_storage_files: manifest.objectCount > 0, storage_export_status: manifest.exportStatus,
    storage_bucket_count: manifest.bucketCount, storage_object_count: manifest.objectCount, storage_failure_count: manifest.failureCount,
    database_complete: sqlComplete, storage_complete: storageComplete, system_complete: false,
    recovery_status: sqlComplete && storageComplete ? 'database_storage_complete' : 'partial' };
}

async function main() {
  if (process.argv.includes('--finalize')) {
    const info = JSON.parse(await readFile('backup/00_project_info.json', 'utf8'));
    const manifest = JSON.parse(await readFile('backup/storage-assets/manifest.json', 'utf8'));
    const sqlComplete = (await Promise.all(['01_roles.sql', '02_schema.sql', '03_data.sql'].map((name) => stat(`backup/${name}`)))).every((file) => file.isFile() && file.size > 0);
    const result = completeness(info, manifest, sqlComplete);
    await writeFile('backup/00_project_info.json', JSON.stringify(result, null, 2));
    const complete = result.recovery_status === 'database_storage_complete';
    await appendFile(process.env.GITHUB_ENV, `BACKUP_COMPLETE=${complete}\nARTIFACT_NAME=${process.env.ARTIFACT_NAME}-${complete ? 'complete' : 'partial'}\n`);
  } else await writeFile('backup/00_project_info.json', JSON.stringify(projectInfo(process.env), null, 2));
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
