import { readFile, lstat, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export async function verifyBackup(directory) {
  const root = await realpath(directory);
  const checksums = await readFile(path.join(root, 'checksums.sha256'), 'utf8');
  const checked = new Set();
  for (const line of checksums.split(/\r?\n/).filter(Boolean)) {
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/.exec(line);
    if (!match) throw new Error('invalid_checksum_manifest');
    const relative = match[2].replace(/^\.\//, '');
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('unsafe_backup_path');
    const file = path.resolve(root, relative);
    if (!(await realpath(file)).startsWith(`${root}${path.sep}`) || (await lstat(file)).isSymbolicLink()) throw new Error('unsafe_backup_path');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    if (hash.digest('hex') !== match[1]) throw new Error('backup_checksum_mismatch');
    checked.add(relative.replaceAll('\\', '/'));
  }
  for (const required of ['00_project_info.json', '01_roles.sql', '02_schema.sql', '03_data.sql', 'storage-assets/manifest.json']) if (!checked.has(required)) throw new Error('incomplete_checksum_manifest');
  const info = JSON.parse(await readFile(path.join(root, '00_project_info.json'), 'utf8'));
  const storage = JSON.parse(await readFile(path.join(root, 'storage-assets/manifest.json'), 'utf8'));
  for (const bucket of storage.buckets || []) for (const object of bucket.objects || []) if (!checked.has(object.path)) throw new Error('unverified_storage_object');
  if (info.database_complete !== true || info.storage_complete !== true || storage.exportStatus !== 'complete' || storage.failureCount !== 0) throw new Error('partial_backup_requires_reconciliation');
  return { checkedFiles: checked.size, databaseComplete: true, storageComplete: true, systemComplete: info.system_complete === true, excludedScopes: info.excluded_recovery_scopes || ['auth_identities', 'd1', 'secrets'] };
}

export function isolatedRestoreTarget(value) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.startsWith('/vulcaniq_restore_')) throw new Error('restore_requires_named_local_disposable_database');
  return value;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const directory = path.resolve(process.argv[2] || 'backup');
  const report = await verifyBackup(directory);
  console.log(JSON.stringify(report));
  if (process.argv.includes('--restore-local')) {
    const target = isolatedRestoreTarget(process.env.RESTORE_DATABASE_URL || '');
    if (process.env.RESTORE_ISOLATED !== 'true') throw new Error('restore_isolation_acknowledgement_required');
    // Credentials travel via child environment, never a logged command argument.
    for (const file of ['01_roles.sql', '02_schema.sql', '03_data.sql']) {
      const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', path.join(directory, file)], { env: { ...process.env, PGDATABASE: target }, stdio: 'pipe' });
      if (result.status !== 0) throw new Error(`restore_step_failed:${file}`);
    }
  }
}
