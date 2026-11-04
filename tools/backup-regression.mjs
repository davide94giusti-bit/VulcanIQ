import { readApplicationSource } from './application-source.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as metadata from '../scripts/backup-metadata.mjs';

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const exporter = read('scripts/export-supabase-storage.mjs');
const workflow = read('.github/workflows/vulcaniq-db-backup.yml');
const shared = read('functions/api/admin/backup/_shared.js');
const status = read('functions/api/admin/backup/status.js');
const ui = readApplicationSource();
const css = read('src/styles/admin-system.css');
const docs = read('docs/BACKUP_RESTORE.md');
const backupMetadata = read('scripts/backup-metadata.mjs');
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
test('Auth coverage is measured after dumps, with UUID-preserving recovery', workflow.includes('node scripts/backup-metadata.mjs --finalize') && backupMetadata.includes('measureDumpCoverage') && backupMetadata.includes('preserve_uuid_with_compatible_managed_schema') && !backupMetadata.includes("auth_restore_mode: 'manual_reprovision'"));
test('artifact sensitivity classification is explicit', backupMetadata.includes("data_classification: 'confidential_restricted'") && docs.includes('confidential_restricted'));
test('actual artifact files receive a SHA-256 manifest', workflow.includes('find . -type f') && workflow.includes('sha256sum') && workflow.includes('backup/checksums.sha256'));
test('Backup status exposes Storage, Auth, and integrity summaries', status.includes('storage,') && status.includes('auth: metadata?.auth') && status.includes('integrity: metadata?.integrity'));
test('Admin Storage card reports export status rather than a misleading boolean', ui.includes("'Esportazione Storage', 'Storage export'") && ['Completa', 'Parziale', 'Non riuscita', 'Nessuna esportazione'].every((value) => ui.includes(value)));
test('Admin UI exposes sanitized partial-failure diagnostics', ui.includes('function BackupStorageFailures') && ui.includes('referenceChecked') && ui.includes('failure.errorCode') && !ui.includes('failure.errorMessage'));
test('duplicate backup creation is disabled while workflow or monitor is active', ui.includes('workflowIsActive || backupProgress.active'));
test('Backup card values preserve normal word boundaries responsively', css.includes('.backup-failure-list') && css.includes('grid-template-columns: minmax(0, 1fr) !important') && backupValueRule.includes('overflow-wrap: normal') && backupValueRule.includes('word-break: normal') && backupValueRule.includes('hyphens: none') && !/overflow-wrap:\s*anywhere|word-break:\s*break-all/.test(backupValueRule));
test('Backup create action uses the explicit localized copy', ui.includes("'Crea nuovo backup', 'Create new backup'") && !ui.includes("'Crea backup', 'Create backup'"));
test('restore documentation requires checksum and evidence-led Auth recovery', docs.includes('sha256sum -c checksums.sha256') && docs.includes('Preserve original UUIDs') && docs.includes('dump_coverage'));
test('Backup warning does not assert that Auth data is excluded', !ui.includes('they are outside this application backup') && !ui.includes('Gli utenti Supabase Auth non sono inclusi e devono essere ripristinati'));

function behavior(name, run) {
  try { run(); test(name, true); } catch { test(name, false); }
}
const dump = (...statements) => `-- PostgreSQL database dump\n${statements.join('\n')}\n-- PostgreSQL database dump complete\n`;
const schema = dump('CREATE TABLE public.example (id uuid);');
const measured = (data, schemaSql = schema) => metadata.measureDumpCoverage(schemaSql, data);
behavior('quoted COPY measures Auth rows and Storage metadata separately', () => {
  const result = measured(dump('COPY "auth"."users" ("id", "encrypted_password") FROM stdin;\nfixture-a\tprivate-fixture-value\nfixture-b\t\\N\n\\.', 'COPY "storage"."objects" ("id") FROM stdin;\nobject-a\n\\.'));
  assert.equal(result.auth.data_status, 'measured'); assert.equal(result.auth.row_count, 2); assert.equal(result.auth.table_count, 1);
  assert.equal(result.storage.row_count, 1); assert.equal(result.auth.schema_table_count, 0);
  assert.ok(!JSON.stringify(result).includes('private-fixture-value'));
});
behavior('unquoted COPY and CRLF count empty tables without inventing rows', () => {
  const result = measured(dump('COPY auth.users (id) FROM stdin;\r\n\\.\r\nCOPY auth.identities (id) FROM stdin;\r\nidentity-a\r\n\\.'));
  assert.equal(result.auth.row_count, 1); assert.equal(result.auth.table_count, 2);
});
behavior('COPY data resembling SQL is never interpreted as another table', () => {
  const result = measured(dump('COPY public.example (id) FROM stdin;\nINSERT INTO auth.users VALUES (1);\n\\.'));
  assert.equal(result.auth.row_count, 0); assert.equal(result.auth.table_count, 0);
});
behavior('quoted and unquoted INSERT VALUES support multiple rows and strings', () => {
  const result = measured(dump('INSERT INTO "auth"."users" (id, note) VALUES (1, \'a;,(b)\'), (2, \'escaped \'\' quote\');', 'INSERT INTO storage.objects VALUES (1, NULL);'));
  assert.equal(result.auth.row_count, 2); assert.equal(result.storage.row_count, 1);
});
behavior('multiline INSERT supports nested expressions and dollar-quoted values', () => {
  const result = measured(dump('INSERT INTO auth.identities (id, note)\nVALUES\n(1, $text$semi; value (x)$text$),\n(2, json_build_object(\'a\', \'b\'));'));
  assert.equal(result.auth.row_count, 2);
});
behavior('SQL-looking comments and function bodies do not fabricate Auth coverage', () => {
  const result = measured(dump('-- COPY auth.users (id) FROM stdin;\n/* INSERT INTO storage.objects VALUES (1); */\nSELECT \'INSERT INTO auth.users VALUES (1);\';'), dump('CREATE FUNCTION public.example() RETURNS void LANGUAGE plpgsql AS $$BEGIN INSERT INTO auth.users VALUES (1); END;$$;'));
  assert.equal(result.auth.row_count, 0); assert.equal(result.storage.row_count, 0); assert.equal(result.auth.schema_table_count, 0);
});
behavior('managed CREATE TABLE definitions are measured without claiming full schema', () => {
  const result = measured(dump('COPY auth.users (id) FROM stdin;\n\\.'), dump('CREATE TABLE "auth"."users" (id uuid);', 'CREATE TABLE storage.objects (id uuid);'));
  assert.equal(result.auth.schema_status, 'measured'); assert.equal(result.auth.schema_table_count, 1); assert.equal(result.storage.schema_table_count, 1);
});
for (const [label, input] of [
  ['empty input', ''],
  ['unterminated COPY', dump('COPY auth.users (id) FROM stdin;\nfixture-a')],
  ['malformed INSERT', dump('INSERT INTO auth.users VALUES (1;')],
  ['empty INSERT tuple', dump('INSERT INTO auth.users VALUES ();')],
  ['mixed empty INSERT tuple', dump('INSERT INTO auth.users VALUES (1), ();')],
  ['missing INSERT value', dump('INSERT INTO auth.users VALUES (1,);')],
  ['empty INSERT column list', dump('INSERT INTO auth.users () VALUES (1);')],
  ['INSERT column count mismatch', dump('INSERT INTO auth.users (id, name) VALUES (1);')],
  ['empty COPY column list', dump('COPY auth.users () FROM stdin;\nfixture-a\n\\.')],
  ['COPY field count mismatch', dump('COPY auth.users (id, name) FROM stdin;\nfixture-a\n\\.')],
  ['unclosed string', dump("INSERT INTO auth.users VALUES ('unfinished);")],
  ['unsupported INSERT SELECT', dump('INSERT INTO auth.users SELECT 1;')],
  ['unqualified data target', dump('SET search_path = auth;\nINSERT INTO users VALUES (1);')]
]) behavior(`dump coverage fails closed for ${label}`, () => {
  const result = measured(input); assert.equal(result.auth.data_status, 'unknown'); assert.equal(result.auth.row_count, null); assert.equal(result.storage.row_count, null);
});
behavior('valid empty pg_dump reports measured zero, not missing identities', () => {
  const result = measured(dump('SET statement_timeout = 0;'));
  assert.equal(result.auth.data_status, 'measured'); assert.equal(result.auth.row_count, 0);
});
behavior('initial metadata is unknown and never claims a complete system', () => {
  const result = metadata.projectInfo({}); assert.equal(result.includes_auth_data, null); assert.equal(result.includes_auth_schema, null);
  assert.equal(result.auth_restore_mode, 'verify_dump_coverage'); assert.equal(result.system_complete, false);
  assert.ok(!result.excluded_recovery_scopes.includes('auth_identities'));
});
behavior('finalized measured Auth coverage preserves identity UUID recovery contract', () => {
  const result = metadata.completeness(metadata.projectInfo({}), { exportStatus: 'complete', failureCount: 0, buckets: [], bucketCount: 0, objectCount: 0 }, true, measured(dump('COPY auth.users (id) FROM stdin;\nfixture-a\n\\.')));
  assert.equal(result.includes_auth_data, true); assert.equal(result.includes_auth_schema, false);
  assert.equal(result.auth_restore_mode, 'preserve_uuid_with_compatible_managed_schema'); assert.equal(result.auth_restore_complete, false);
  assert.equal(result.database_complete, true); assert.equal(result.system_complete, false);
  assert.equal(result.database_completeness_scope, 'roles_schema_data_files_present');
});
behavior('finalizer scans actual SQL files without printing or copying row values', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vulcaniq-backup-coverage-'));
  try {
    fs.mkdirSync(path.join(directory, 'backup/storage-assets'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'backup/00_project_info.json'), JSON.stringify(metadata.projectInfo({})));
    fs.writeFileSync(path.join(directory, 'backup/01_roles.sql'), '-- fixture roles');
    fs.writeFileSync(path.join(directory, 'backup/02_schema.sql'), schema);
    fs.writeFileSync(path.join(directory, 'backup/03_data.sql'), dump('COPY auth.users (id) FROM stdin;\nconfidential-fixture-value\n\\.'));
    fs.writeFileSync(path.join(directory, 'backup/storage-assets/manifest.json'), JSON.stringify({ exportStatus: 'complete', failureCount: 0, buckets: [], bucketCount: 0, objectCount: 0 }));
    const output = execFileSync(process.execPath, [path.join(root, 'scripts/backup-metadata.mjs'), '--finalize'], { cwd: directory, env: { ...process.env, GITHUB_ENV: path.join(directory, 'github-env'), ARTIFACT_NAME: 'fixture-backup' }, encoding: 'utf8' });
    const result = JSON.parse(fs.readFileSync(path.join(directory, 'backup/00_project_info.json'), 'utf8'));
    assert.equal(result.includes_auth_data, true); assert.equal(result.dump_coverage.auth.row_count, 1);
    assert.ok(!output.includes('confidential-fixture-value')); assert.ok(!JSON.stringify(result).includes('confidential-fixture-value'));
    assert.ok(fs.readFileSync(path.join(directory, 'backup/03_data.sql'), 'utf8').includes('confidential-fixture-value'));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
behavior('oversized sparse dump stays untouched and finalizes unknown without being read', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vulcaniq-backup-size-'));
  try {
    fs.mkdirSync(path.join(directory, 'backup/storage-assets'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'backup/00_project_info.json'), JSON.stringify(metadata.projectInfo({})));
    fs.writeFileSync(path.join(directory, 'backup/01_roles.sql'), '-- fixture roles');
    fs.writeFileSync(path.join(directory, 'backup/02_schema.sql'), schema);
    const dataFile = path.join(directory, 'backup/03_data.sql');
    fs.writeFileSync(dataFile, '-- sparse size fixture'); fs.truncateSync(dataFile, 64 * 1024 * 1024 + 1);
    const before = fs.statSync(dataFile);
    fs.writeFileSync(path.join(directory, 'backup/storage-assets/manifest.json'), JSON.stringify({ exportStatus: 'complete', failureCount: 0, buckets: [], bucketCount: 0, objectCount: 0 }));
    // Refuse an oversized allocation in the test child as well as checking its result.
    // The sparse fixture never needs a large in-memory or on-disk payload.
    const guard = `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module'; const original=fs.promises.readFile; fs.promises.readFile=async function(file,...args){if(String(file).endsWith('03_data.sql')&&(await fs.promises.stat(file)).size>64*1024*1024)throw new Error('oversized_coverage_read');return original.call(this,file,...args)};syncBuiltinESMExports();`;
    execFileSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(guard)}`, path.join(root, 'scripts/backup-metadata.mjs'), '--finalize'], { cwd: directory, env: { ...process.env, GITHUB_ENV: path.join(directory, 'github-env'), ARTIFACT_NAME: 'fixture-backup' }, stdio: 'pipe' });
    const result = JSON.parse(fs.readFileSync(path.join(directory, 'backup/00_project_info.json'), 'utf8'));
    assert.equal(result.includes_auth_data, null); assert.equal(result.dump_coverage.auth.data_status, 'unknown'); assert.equal(result.dump_coverage.storage.row_count, null);
    assert.equal(result.database_complete, true); assert.equal(result.system_complete, false);
    const after = fs.statSync(dataFile); assert.equal(after.size, before.size); assert.equal(after.mtimeMs, before.mtimeMs);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
