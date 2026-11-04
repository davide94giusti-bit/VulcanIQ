# vulcanIQ backup and restore

## Owner workflow

The admin page `Admin > System > Backup` is visible only to active owners (`public.admin_profiles.role = 'owner'` and `active = true`). Managers, unauthenticated users, and public visitors cannot create or download backups.

The browser never receives GitHub tokens, Supabase secret/service-role keys, Supabase access tokens for automation, or database URLs. The browser only sends the logged-in owner Supabase JWT to Cloudflare Pages Functions.

Create flow:

1. Owner clicks **Create backup**.
2. The frontend sends the current Supabase access token to `/api/admin/backup/create`.
3. The Cloudflare Pages Function validates the Supabase user.
4. The function confirms an active owner row in `public.admin_profiles`.
5. The function triggers the GitHub Actions workflow `vulcaniq-db-backup.yml`.
6. GitHub Actions creates an import-ready backup artifact.

Download flow:

1. Owner clicks **Download latest backup**.
2. The frontend calls `/api/admin/backup/download` with the current Supabase access token.
3. The Cloudflare Pages Function validates the owner.
4. The function finds the latest successful `vulcaniq-db-backup.yml` run and latest artifact whose name starts with `vulcaniq-supabase-backup-`.
5. The function downloads the artifact from GitHub server-side and returns it as `application/zip`.
6. The browser downloads the ZIP locally without requiring a GitHub login.

## Backup artifact structure

The workflow uploads the `backup/` folder directly with `actions/upload-artifact`. GitHub still returns a ZIP when the artifact is downloaded, but the ZIP should open directly to these files:

```txt
00_project_info.json
01_roles.sql
02_schema.sql
03_data.sql
README_RESTORE.md
cloudflare-env-template.txt
restore-supabase.ps1
restore-supabase.sh
restore-storage.js
storage-assets/
storage-assets/README_STORAGE.md
storage-assets/manifest.json
storage-assets/<bucket-name>/<object-paths and files>
checksums.sha256
```

Older database-only backups may not contain `storage-assets/manifest.json` or `restore-storage.js`. Those artifacts can still be downloaded and restored for database data, but Storage must be checked manually.

Every new artifact is classified `confidential_restricted`. Store and transfer it as sensitive operational data. Before restore, run `sha256sum -c checksums.sha256` (or an equivalent SHA-256 verifier) from the extracted artifact root. The checksum manifest hashes the actual artifact files, not a logical/canonical representation.

### Storage export status contract

`00_project_info.json` and `storage-assets/manifest.json` distinguish four states:

- `none`: Storage metadata is unavailable, normally for a legacy database-only artifact.
- `complete`: the export enumerated Storage and every listed object download completed.
- `partial`: at least one object was exported and at least one list/download operation failed.
- `failed`: Storage export produced no object files and recorded one or more failures. The database dump may still be valid.

`includes_storage_files` means that at least one Storage binary is actually present. It is not a claim that the export is complete. `storage_failure_count` and the sanitized `failures` array are authoritative for partial/failed diagnostics. Each object download is attempted at most three times with bounded backoff. Failed-object entries contain a bounded bucket/object reference, safe error code, attempt count, and a best-effort live-list diagnostic; they never contain credentials.

### Supabase Auth scope

The data dump can include actual Auth users, password hashes, identities, sessions and refresh tokens even when the schema dump omits managed Auth definitions. Treat every artifact as `confidential_restricted`; do not print SQL rows when checking coverage. Historical artifacts were found to contain Auth data despite their hardcoded `includes_auth_data: false` metadata. Preserve those original artifacts and checksums; their legacy false flag is not reliable evidence of exclusion.

After the SQL files are finalized, `dump_coverage.method = pg_dump_sql_v1` measures schema-qualified COPY and INSERT VALUES statements without retaining row values. Each `auth`/`storage` scope has `data_status`, `row_count`, `table_count`, `schema_status` and `schema_table_count`. Empty tables count as sections with zero rows. SQL-looking content inside data, comments, strings or function bodies is not treated as another section. Missing, truncated, malformed or unsupported dump formats produce `unknown` status and null counts; a valid completed empty dump produces measured zero. Inspection is limited to 64 MiB per SQL file; larger files remain in the backup but are not read into memory for coverage scanning. This is a coverage scan, not a general SQL validator or proof that every live row was captured.

`includes_auth_data` is true only for measured Auth rows, false for measured zero and null for unknown coverage. `includes_auth_schema` similarly describes observed managed table definitions; it does not prove complete platform schema coverage. `includes_storage_sql_metadata` measures Storage SQL rows separately from the Storage object manifest and binary export. Existing `includes_storage_metadata` also covers that export manifest.

`auth_restore_mode` is `preserve_uuid_with_compatible_managed_schema` when Auth rows are present, `separate_auth_recovery_required` for measured zero, and `verify_dump_coverage` when unknown. `auth_restore_complete` remains false. Compatible managed schemas/migration versions, Auth configuration, secrets, login and Storage authorization require separate verification even when data is included. Preserve original UUIDs and validate `public.admin_profiles`, ownership, actor and other foreign-key references; email-only recreation is not equivalent. Never blindly replace existing identities or rewrite historical actor IDs.

## GitHub repository secrets

Set these in:

`GitHub > Repository > Settings > Secrets and variables > Actions > New repository secret`

Required:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_URL`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (preferred)
- `SUPABASE_SERVICE_ROLE_KEY` (temporary fallback)

Do not commit these values to Git and do not put them in frontend `VITE_` variables.

## Cloudflare Pages server-side variables

Set these in Cloudflare Pages as non-public server-side variables for the Pages Functions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` (preferred)
- `SUPABASE_SERVICE_ROLE_KEY` (temporary fallback)
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BACKUP_TOKEN`
- `GITHUB_BACKUP_WORKFLOW_ID` (default: `vulcaniq-db-backup.yml`)
- `GITHUB_BACKUP_REF` (default: `main`)

Only these public frontend variables are allowed:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Schedule and artifact retention

Run this migration before using the editable schedule UI:

```sql
supabase/migrations/20260626100000_system_backup_settings.sql
```

The workflow runs hourly:

```yaml
- cron: "0 * * * *"
```

On each scheduled run, the workflow reads `public.system_backup_settings`. If no backup is due, it exits successfully and creates no artifact. If a backup is due, it creates the backup and updates `last_scheduled_backup_at`.

Supported owner-controlled settings:

- Enabled / disabled
- Daily, weekly, or monthly frequency
- UTC time
- Day of week for weekly backups
- Day of month from 1 to 28 for monthly backups

After upload, the workflow retains the newest three `-complete` database/Storage artifacts and the newest three `-partial` diagnostic artifacts independently. It preserves legacy artifacts whose completeness is unknown. Partial runs fail after uploading diagnostics and do not mark the scheduled backup complete. Three partial runs cannot displace the last complete artifact.

Automatic GitHub expiry still applies: this workflow requests 30 days, subject to repository/organization limits and quota. No indefinite retention is promised. The workflow fails when no unexpired complete artifact remains and reports the newest complete expiry. A monthly schedule is insufficient to guarantee a recovery point inside a 30-day expiry: owners must approve a shorter successful-backup cadence and observe failure alerts before relying on it. No schedule was enabled or changed by this repair.

For compatibility, `database_complete` keeps its existing meaning: the roles, schema and data SQL files exist and are nonempty (`database_completeness_scope: roles_schema_data_files_present`). It is not a successful restore, full managed-schema coverage or Auth-login guarantee. `storage_complete` separately measures the object export. `system_complete` remains false; `excluded_recovery_scopes` lists `managed_auth_runtime`, `d1` and `secrets`, not an unsupported blanket claim that Auth identities are absent. Never label a database/Storage artifact as a full-system backup.

## Restore checklist

1. Download latest backup from admin page.
2. Extract ZIP locally.
3. Verify required files exist.
4. Verify `checksums.sha256` before opening or restoring the data.
5. Create a positively identified isolated target, with providers and senders disabled; verify compatible managed Auth/Storage schemas and platform prerequisites before importing data.
6. Restore roles with `01_roles.sql` if applicable.
7. Restore schema with `02_schema.sql`.
8. Resolve Auth coverage before importing dependent data. Preserve included identities and their original UUIDs; absent/unknown coverage needs a separately approved Auth recovery source first. Then restore `03_data.sql` in the reviewed dependency order.
9. Verify restored Auth identities and original UUIDs. Do not blindly recreate users.
10. Verify existing owner/admin and historical actor mappings in `public.admin_profiles` and dependent tables without rewriting them.
11. Restore Storage with `restore-storage.js`; for `partial` or `failed`, reconcile every failure against live Storage first.
12. Update Cloudflare variables and secrets.
13. Perform isolated application QA; any real redeployment requires separate authorization.
14. Verify public website.
15. Verify admin login.
16. Verify backup page.
17. Verify images, PDFs, leaflets, uploaded assets.
18. Run test booking/questionnaire flow.

## Database restore

Bash:

```bash
./restore-supabase.sh 'postgresql://postgres:[LOCAL-PASSWORD]@127.0.0.1:54322/vulcaniq_restore_drill'
```

Windows PowerShell:

```powershell
.\restore-supabase.ps1 -NewDbUrl 'postgresql://postgres:[LOCAL-PASSWORD]@127.0.0.1:54322/vulcaniq_restore_drill'
```

## Check and restore Supabase Storage

The database dump does not include Supabase Storage binary files unless this backup was generated with Storage export enabled. After restore, check buckets, images, PDFs, leaflets, and other uploaded assets, then re-upload missing files.

This backup includes Supabase Storage files under storage-assets/. After restore, verify all buckets, images, PDFs, leaflets, and uploaded assets. If any file is missing or failed to upload, re-upload it manually.

Run this from the extracted backup folder:

```bash
RESTORE_ISOLATED=true SUPABASE_URL="http://127.0.0.1:54321" SUPABASE_SECRET_KEY="[LOCAL-SECRET]" node restore-storage.js
```

Windows PowerShell:

```powershell
$env:RESTORE_ISOLATED="true"
$env:SUPABASE_URL="http://127.0.0.1:54321"
$env:SUPABASE_SECRET_KEY="[LOCAL-SECRET]"
node restore-storage.js
```

Restore helpers now require an isolated local target, `RESTORE_ISOLATED=true`, and a verified SHA-256 manifest before any writes. Run `node validate-backup.mjs .` first. The database helper only accepts a loopback database named `vulcaniq_restore_*`; remote restoration requires a separately reviewed procedure. Set `SUPABASE_URL` to a loopback Storage API for a local Storage drill. The Storage helper reads `storage-assets/manifest.json`, creates missing buckets where possible, and uploads files with upsert enabled. If the backup is partial or legacy/unverified, reconcile it before attempting restore.

## Full-system recovery gate (not yet a completed live drill)

1. Record application/Worker commit and all Supabase/D1 migration versions. Retain compatible source/build separately from confidential business data.
2. Verify hashes and database/Storage completeness locally. Recreate a disposable Supabase stack and restore roles/schema/data with providers disabled; restore fails on missing required Auth UUIDs rather than silently dropping foreign keys.
3. Recover included Auth identities from the protected dump with their original UUIDs and a compatible managed schema. If coverage is absent or unknown, obtain a separately approved Auth recovery source; stop rather than blindly recreate identities. Verify every FK, admin role and ownership record. Do not bulk substitute IDs or enable a frontend recovery bypass. Auth data restoration alone does not prove managed runtime/configuration or login; prove isolated owner login before release.
4. Restore Storage bytes and verify manifest object count/bytes/hash and public/private bucket authorization. Failed leaflets must keep their previous valid bytes.
5. Export/import D1 only against a positively identified isolated binding. Notification credentials must be treated as confidential. Restore consent/ownership semantics; keep jobs and delivery processing disabled and reconcile accepted/unknown attempts before any replay. Device re-enrollment is the safe fallback when credentials cannot be recovered.
6. Restore secrets separately from the owner-controlled secret inventory (names only in artifacts). No secret values are included in source or metadata. Verify bindings target the isolated Supabase/D1 projects before starting compatible Pages/Worker builds.
7. Record counts/FK checks, owner login, Storage read, synthetic booking, test-device enrollment, pending-job reconciliation and measured elapsed times. The real cross-system drill and provider/device acceptance remain pending explicit isolated environment authorization. RPO equals the last successful complete backup age, bounded by provider expiry; no measured RTO is claimed until that drill runs.

## Verifica e ripristino Supabase Storage

Il dump del database non include i file binari di Supabase Storage, salvo che questo backup sia stato generato con l'esportazione Storage attiva. Dopo il ripristino, controlla bucket, immagini, PDF, volantini e altri asset caricati, quindi ricarica manualmente eventuali file mancanti.

Questo backup include i file Supabase Storage nella cartella storage-assets/. Dopo il ripristino, verifica tutti i bucket, le immagini, i PDF, i volantini e gli asset caricati. Se un file manca o il caricamento fallisce, ricaricalo manualmente.
