# vulcanIQ backup and restore

## Owner workflow

The admin page `Admin > System > Backup` is visible only to active owners (`public.admin_profiles.role = 'owner'` and `active = true`). Managers, unauthenticated users, and public visitors cannot create or download backups.

The browser never receives GitHub tokens, Supabase service-role keys, Supabase access tokens for automation, or database URLs. The browser only sends the logged-in owner Supabase JWT to Cloudflare Pages Functions.

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
storage-assets/
storage-assets/README_STORAGE.md
```

## GitHub repository secrets

Set these in:

`GitHub > Repository > Settings > Secrets and variables > Actions > New repository secret`

Required:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_URL`

Do not commit these values to Git and do not put them in frontend `VITE_` variables.

## Cloudflare Pages server-side variables

Set these in Cloudflare Pages as non-public server-side variables for the Pages Functions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BACKUP_TOKEN`
- `GITHUB_BACKUP_WORKFLOW_ID` (default: `vulcaniq-db-backup.yml`)
- `GITHUB_BACKUP_REF` (default: `main`)

Optional public frontend variable for the diagnostic workflow link:

- `VITE_GITHUB_BACKUP_WORKFLOW_URL`

## Schedule

Run this migration before using the editable schedule UI:

```sql
supabase/migrations/20260626_system_backup_settings.sql
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

## Restore checklist

1. Create a new Supabase project.
2. Enable Data API.
3. Set exposed schemas to `public`.
4. Set extra search path to `public, extensions`.
5. Unzip the latest backup downloaded from the vulcanIQ admin area.
6. Run `restore-supabase.sh` or `restore-supabase.ps1` with the new database connection string.
7. Recreate or verify Supabase Auth users.
8. Insert or verify active owner rows in `public.admin_profiles`.
9. Update Cloudflare Pages variables.
10. Redeploy Cloudflare Pages.
11. Verify `/admin` login.
12. Create one test booking request.
13. Verify the admin analytics page.

## Storage limitation

Supabase database dumps do not include binary files from Supabase Storage. Keep separate copies of uploaded leaflets, PDFs, images, and videos, especially files in the `vulcaniq-public-assets` bucket.
