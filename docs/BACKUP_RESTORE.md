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

The logical database dump deliberately reports `includes_auth_schema: false` and `includes_auth_data: false`. Supabase-managed Auth users and credentials are not an import-ready part of this artifact. A disaster recovery procedure must recreate/reconnect Auth users through a separately approved Supabase Auth process, then verify `public.admin_profiles` links. Do not interpret rows that reference Auth UUIDs as an Auth-user backup.

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

After a successful upload, the workflow lists GitHub Actions artifacts whose name starts with `vulcaniq-supabase-backup-`, sorts them newest to oldest by `created_at`, keeps the newest 3, and deletes older matching artifacts. Unrelated artifacts are not deleted.

## Restore checklist

1. Download latest backup from admin page.
2. Extract ZIP locally.
3. Verify required files exist.
4. Verify `checksums.sha256` before opening or restoring the data.
5. Create or prepare target Supabase project.
6. Restore roles with `01_roles.sql` if applicable.
7. Restore schema with `02_schema.sql`.
8. Restore data with `03_data.sql`.
9. Recreate/reconnect Supabase Auth users manually using the separately approved Auth process.
10. Set owner/admin rows correctly in `public.admin_profiles`.
11. Restore Storage with `restore-storage.js`; for `partial` or `failed`, reconcile every failure against live Storage first.
12. Update Cloudflare variables and secrets.
13. Redeploy Cloudflare Pages.
14. Verify public website.
15. Verify admin login.
16. Verify backup page.
17. Verify images, PDFs, leaflets, uploaded assets.
18. Run test booking/questionnaire flow.

## Database restore

Bash:

```bash
./restore-supabase.sh 'postgresql://postgres:[PASSWORD]@db.YOUR-REF.supabase.co:5432/postgres'
```

Windows PowerShell:

```powershell
.\restore-supabase.ps1 -NewDbUrl 'postgresql://postgres:[PASSWORD]@db.YOUR-REF.supabase.co:5432/postgres'
```

## Check and restore Supabase Storage

The database dump does not include Supabase Storage binary files unless this backup was generated with Storage export enabled. After restore, check buckets, images, PDFs, leaflets, and other uploaded assets, then re-upload missing files.

This backup includes Supabase Storage files under storage-assets/. After restore, verify all buckets, images, PDFs, leaflets, and uploaded assets. If any file is missing or failed to upload, re-upload it manually.

Run this from the extracted backup folder:

```bash
SUPABASE_URL="https://target-project.supabase.co" SUPABASE_SECRET_KEY="..." node restore-storage.js
```

Windows PowerShell:

```powershell
$env:SUPABASE_URL="https://target-project.supabase.co"
$env:SUPABASE_SECRET_KEY="..."
node restore-storage.js
```

The restore script reads `storage-assets/manifest.json`, creates missing buckets where possible, and uploads files with upsert enabled. It prints uploaded, skipped, failed, and bucket counts. If `storage-assets/manifest.json` or `restore-storage.js` is missing, this is an older database-only backup; check Storage manually and re-upload missing files.

## Verifica e ripristino Supabase Storage

Il dump del database non include i file binari di Supabase Storage, salvo che questo backup sia stato generato con l'esportazione Storage attiva. Dopo il ripristino, controlla bucket, immagini, PDF, volantini e altri asset caricati, quindi ricarica manualmente eventuali file mancanti.

Questo backup include i file Supabase Storage nella cartella storage-assets/. Dopo il ripristino, verifica tutti i bucket, le immagini, i PDF, i volantini e gli asset caricati. Se un file manca o il caricamento fallisce, ricaricalo manualmente.
