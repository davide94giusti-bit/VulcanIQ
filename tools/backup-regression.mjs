import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const exporter = read('scripts/export-supabase-storage.mjs');
const workflow = read('.github/workflows/vulcaniq-db-backup.yml');
const shared = read('functions/api/admin/backup/_shared.js');
const status = read('functions/api/admin/backup/status.js');
const ui = read('src/main.jsx');
const css = read('src/styles/admin-system.css');
const docs = read('docs/BACKUP_RESTORE.md');
const backupValueRule = css.match(/\.backup-summary-grid \.summary-card strong\s*\{([^}]*)\}/)?.[1] || '';

let passed = 0;
let failed = 0;
function test(name, condition) {
  if (condition) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.error(`FAIL  ${name}`); }
}

test('Storage export has explicit complete/partial/failed status derivation', exporter.includes("manifest.exportStatus = manifest.failureCount === 0 ? 'complete' : manifest.objectCount > 0 ? 'partial' : 'failed'"));
test('legacy/no-metadata state remains explicitly none', shared.includes("status: 'none'") && docs.includes('`none`:'));
test('includes_storage_files means actual exported object presence', exporter.includes('includes_storage_files: manifest.objectCount > 0'));
test('Storage download retry is bounded to three attempts', exporter.includes('const DOWNLOAD_MAX_ATTEMPTS = 3') && exporter.includes('attempt <= DOWNLOAD_MAX_ATTEMPTS'));
test('Storage failures sanitize URLs and credential-like values', exporter.includes(".replace(/https?:\\/\\/\\S+/gi, '[url]')") && exporter.includes("'[credential]'"));
test('failed objects receive a live-list reference diagnostic', exporter.includes('async function referenceDiagnostic') && exporter.includes('listedAtExport'));
test('failure details are capped and sanitized before Admin response', shared.includes('.slice(0, 25).map') && shared.includes('errorCode: cleanText'));
test('Auth exclusion and manual recovery semantics are explicit', workflow.includes('"includes_auth_schema": false') && workflow.includes('"includes_auth_data": false') && workflow.includes('"auth_restore_mode": "manual_reprovision"'));
test('artifact sensitivity classification is explicit', workflow.includes('"data_classification": "confidential_restricted"') && docs.includes('confidential_restricted'));
test('actual artifact files receive a SHA-256 manifest', workflow.includes('find . -type f') && workflow.includes('sha256sum') && workflow.includes('backup/checksums.sha256'));
test('Backup status exposes Storage, Auth, and integrity summaries', status.includes('storage,') && status.includes('auth: metadata?.auth') && status.includes('integrity: metadata?.integrity'));
test('Admin Storage card reports export status rather than a misleading boolean', ui.includes("'Esportazione Storage', 'Storage export'") && ['Completa', 'Parziale', 'Non riuscita', 'Nessuna esportazione'].every((value) => ui.includes(value)));
test('Admin UI exposes sanitized partial-failure diagnostics', ui.includes('function BackupStorageFailures') && ui.includes('referenceChecked') && ui.includes('failure.errorCode') && !ui.includes('failure.errorMessage'));
test('duplicate backup creation is disabled while workflow or monitor is active', ui.includes('workflowIsActive || backupProgress.active'));
test('Backup card values preserve normal word boundaries responsively', css.includes('.backup-failure-list') && css.includes('grid-template-columns: minmax(0, 1fr) !important') && backupValueRule.includes('overflow-wrap: normal') && backupValueRule.includes('word-break: normal') && backupValueRule.includes('hyphens: none') && !/overflow-wrap:\s*anywhere|word-break:\s*break-all/.test(backupValueRule));
test('Backup create action uses the explicit localized copy', ui.includes("'Crea nuovo backup', 'Create new backup'") && !ui.includes("'Crea backup', 'Create backup'"));
test('restore documentation requires checksum and separate Auth recovery', docs.includes('sha256sum -c checksums.sha256') && docs.includes('separately approved Supabase Auth process'));

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
