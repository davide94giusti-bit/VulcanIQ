import { writeFile, readFile, stat, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Coverage is optional metadata: large dumps must remain valid backup artifacts
// without allocating their complete contents merely to inspect Auth/Storage scope.
const MAX_COVERAGE_FILE_BYTES = 64 * 1024 * 1024;

export function projectInfo(env) {
  return { app: 'vulcanIQ', backup_created_at_utc: env.BACKUP_CREATED_AT_UTC, supabase_project_ref: env.SUPABASE_PROJECT_REF,
    requested_by: env.BACKUP_REQUESTED_BY || env.GITHUB_ACTOR_ID, trigger: env.BACKUP_EVENT_NAME, backup_trigger: env.BACKUP_TRIGGER,
    scheduled_backup_due_at_utc: env.SCHEDULED_BACKUP_DUE_AT || '', includes_roles: true, includes_schema: true, includes_data: true,
    includes_auth_schema: null, includes_auth_data: null, auth_restore_mode: 'verify_dump_coverage', auth_restore_complete: false,
    includes_storage_sql_metadata: null, includes_storage_metadata: false,
    includes_storage_files: false, storage_export_status: 'none', includes_sha256_checksums: true, data_classification: 'confidential_restricted',
    source_commit: env.GITHUB_SHA, database_complete: false, storage_complete: false, system_complete: false,
    database_completeness_scope: 'roles_schema_data_files_present',
    excluded_recovery_scopes: ['managed_auth_runtime', 'd1', 'secrets'], max_provider_retention_days: 30 };
}

// This measures pg_dump contents, not SQL validity or managed-platform restorability.
// Never retain row values in the result. Unsupported/truncated input stays unknown.
const identifier = '(?:"(?:[^"\\n]|"")+"|[A-Za-z_][A-Za-z_0-9$]*)';
const qualified = `(${identifier})\\s*\\.\\s*(${identifier})`;
const unquote = (name) => name.startsWith('"') ? name.slice(1, -1).replaceAll('""', '"') : name.toLowerCase();
const columnListCount = (text) => new RegExp(`^\\s*${identifier}(?:\\s*,\\s*${identifier})*\\s*$`).test(text) ? text.match(new RegExp(identifier, 'g')).length : null;

function inspectDump(sql) {
  const result = { auth: { rows: 0, tables: new Set(), schemaTables: new Set() }, storage: { rows: 0, tables: new Set(), schemaTables: new Set() } };
  let statement = '', complete = false, i = 0;
  const fail = () => { throw new Error('unknown_dump_coverage'); };
  function accept(text) {
    text = text.trim();
    if (!text) return;
    if (/^COPY\b/i.test(text)) {
      const match = new RegExp(`^COPY\\s+${qualified}\\s*\\(([^;]*)\\)\\s+FROM\\s+stdin$`, 'i').exec(text);
      if (!match) fail();
      const columnCount = columnListCount(match[3]); if (!columnCount) fail();
      const scope = result[unquote(match[1])], table = unquote(match[2]);
      // COPY payload is not SQL: consume every row before scanning another statement.
      const endOfHeader = sql.indexOf('\n', i);
      if (endOfHeader < 0 || sql.slice(i, endOfHeader).trim()) fail();
      i = endOfHeader + 1;
      let rows = 0, terminated = false;
      while (i < sql.length) {
        const end = sql.indexOf('\n', i), next = end < 0 ? sql.length : end;
        const line = sql.slice(i, next).replace(/\r$/, ''); i = end < 0 ? sql.length : end + 1;
        if (line === '\\.') { terminated = true; break; }
        if (line.split('\t').length !== columnCount) fail();
        rows += 1;
      }
      if (!terminated) fail();
      if (scope) { scope.tables.add(table); scope.rows += rows; if (!Number.isSafeInteger(scope.rows)) fail(); }
    } else if (/^INSERT\b/i.test(text)) {
      const match = new RegExp(`^INSERT\\s+INTO\\s+${qualified}\\s*(?:\\(([^)]*)\\)\\s*)?VALUES\\s*([\\s\\S]+)$`, 'i').exec(text);
      if (!match) fail();
      const columnCount = match[3] === undefined ? null : columnListCount(match[3]);
      if (match[3] !== undefined && !columnCount) fail();
      let depth = 0, rows = 0, expectTuple = true, hasValue = false, valueCount = 0;
      for (const character of match[4]) {
        if (depth === 0) {
          if (/\s/.test(character)) continue;
          if (character === '(' && expectTuple) { depth = 1; expectTuple = false; hasValue = false; valueCount = 0; }
          else if (character === ',' && !expectTuple) expectTuple = true;
          else fail();
        } else if (character === '(') { depth += 1; hasValue = true; }
        else if (character === ')') {
          if (depth === 1 && (!hasValue || (columnCount !== null && valueCount + 1 !== columnCount))) fail();
          if (--depth === 0) rows += 1;
        }
        else if (depth === 1 && character === ',') { if (!hasValue) fail(); hasValue = false; valueCount += 1; }
        else if (!/\s/.test(character)) hasValue = true;
      }
      if (depth || expectTuple || !rows) fail();
      const scope = result[unquote(match[1])];
      if (scope) { scope.tables.add(unquote(match[2])); scope.rows += rows; if (!Number.isSafeInteger(scope.rows)) fail(); }
    } else if (/^CREATE\s+(?:UNLOGGED\s+)?TABLE\b/i.test(text)) {
      const match = new RegExp(`^CREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${qualified}\\s*\\(`, 'i').exec(text);
      if (!match) fail();
      result[unquote(match[1])]?.schemaTables.add(unquote(match[2]));
    }
  }
  try {
    if (typeof sql !== 'string' || !sql.trim()) fail();
    while (i < sql.length) {
      if (sql.startsWith('--', i)) {
        const end = sql.indexOf('\n', i), next = end < 0 ? sql.length : end;
        if (/^--\s*PostgreSQL database dump complete\s*$/.test(sql.slice(i, next).trim())) complete = true;
        i = next; statement += ' '; continue;
      }
      if (sql.startsWith('/*', i)) {
        let depth = 1; i += 2;
        while (i < sql.length && depth) { if (sql.startsWith('/*', i)) { depth += 1; i += 2; } else if (sql.startsWith('*/', i)) { depth -= 1; i += 2; } else i += 1; }
        if (depth) fail(); statement += ' '; continue;
      }
      // Recent pg_dump adds top-level psql restrict/unrestrict meta commands.
      if (sql[i] === '\\' && !statement.trim()) {
        const end = sql.indexOf('\n', i), next = end < 0 ? sql.length : end;
        if (!/^\\(?:unrestrict|restrict)\s+\S+\s*$/.test(sql.slice(i, next))) fail();
        i = next; continue;
      }
      const dollar = sql[i] === '$' && /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.exec(sql.slice(i));
      if (dollar) {
        const end = sql.indexOf(dollar[0], i + dollar[0].length); if (end < 0) fail();
        statement += 'value'; i = end + dollar[0].length; continue;
      }
      if (sql[i] === "'" || sql[i] === '"') {
        const quote = sql[i], start = i++, escaped = quote === "'" && /(?:^|\W)E$/i.test(statement);
        let closed = false;
        while (i < sql.length) {
          if (escaped && sql[i] === '\\') { i += 2; continue; }
          if (sql[i] === quote) { if (sql[i + 1] === quote) { i += 2; continue; } i += 1; closed = true; break; }
          i += 1;
        }
        if (!closed) fail();
        statement += quote === '"' ? sql.slice(start, i) : 'value'; continue;
      }
      const character = sql[i++];
      if (character === ';') { accept(statement); statement = ''; } else statement += character;
    }
    if (statement.trim() || !complete) fail();
    return result;
  } catch { return null; }
}

export function measureDumpCoverage(schemaSql, dataSql) {
  const schema = inspectDump(schemaSql), data = inspectDump(dataSql);
  return { method: 'pg_dump_sql_v1', ...Object.fromEntries(['auth', 'storage'].map((scope) => [scope, {
    data_status: data ? 'measured' : 'unknown', row_count: data?.[scope].rows ?? null, table_count: data?.[scope].tables.size ?? null,
    schema_status: schema ? 'measured' : 'unknown', schema_table_count: schema?.[scope].schemaTables.size ?? null
  }])) };
}

export function completeness(info, manifest, sqlComplete, coverage = measureDumpCoverage(null, null)) {
  const storageComplete = manifest.exportStatus === 'complete' && manifest.failureCount === 0 && Array.isArray(manifest.buckets)
    && Number.isInteger(manifest.objectCount) && manifest.objectCount >= 0
    && manifest.buckets.reduce((sum, bucket) => sum + (Array.isArray(bucket.objects) ? bucket.objects.length : NaN), 0) === manifest.objectCount;
  const authData = coverage.auth.data_status === 'measured' ? coverage.auth.row_count > 0 : null;
  return { ...info, dump_coverage: coverage, includes_auth_schema: coverage.auth.schema_status === 'measured' ? coverage.auth.schema_table_count > 0 : null,
    includes_auth_data: authData, auth_restore_mode: authData === true ? 'preserve_uuid_with_compatible_managed_schema' : authData === false ? 'separate_auth_recovery_required' : 'verify_dump_coverage',
    auth_restore_complete: false, includes_storage_sql_metadata: coverage.storage.data_status === 'measured' ? coverage.storage.row_count > 0 : null,
    includes_storage_metadata: true, includes_storage_files: manifest.objectCount > 0, storage_export_status: manifest.exportStatus,
    storage_bucket_count: manifest.bucketCount, storage_object_count: manifest.objectCount, storage_failure_count: manifest.failureCount,
    database_complete: sqlComplete, database_completeness_scope: 'roles_schema_data_files_present', storage_complete: storageComplete, system_complete: false,
    excluded_recovery_scopes: ['managed_auth_runtime', 'd1', 'secrets'],
    recovery_status: sqlComplete && storageComplete ? 'database_storage_complete' : 'partial' };
}

async function main() {
  if (process.argv.includes('--finalize')) {
    const info = JSON.parse(await readFile('backup/00_project_info.json', 'utf8'));
    const manifest = JSON.parse(await readFile('backup/storage-assets/manifest.json', 'utf8'));
    const sqlFiles = await Promise.all(['01_roles.sql', '02_schema.sql', '03_data.sql'].map((name) => stat(`backup/${name}`)));
    const sqlComplete = sqlFiles.every((file) => file.isFile() && file.size > 0);
    const [schemaSql, dataSql] = await Promise.all(['02_schema.sql', '03_data.sql'].map((name, index) =>
      sqlFiles[index + 1].isFile() && sqlFiles[index + 1].size <= MAX_COVERAGE_FILE_BYTES ? readFile(`backup/${name}`, 'utf8') : null));
    const result = completeness(info, manifest, sqlComplete, measureDumpCoverage(schemaSql, dataSql));
    await writeFile('backup/00_project_info.json', JSON.stringify(result, null, 2));
    const complete = result.recovery_status === 'database_storage_complete';
    await appendFile(process.env.GITHUB_ENV, `BACKUP_COMPLETE=${complete}\nARTIFACT_NAME=${process.env.ARTIFACT_NAME}-${complete ? 'complete' : 'partial'}\n`);
  } else await writeFile('backup/00_project_info.json', JSON.stringify(projectInfo(process.env), null, 2));
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
