# vulcanIQ backup and restore

## Owner workflow

The admin page `Admin > System > Backup` is visible only to active owners (`public.admin_profiles.role = 'owner'`). The browser does not run `pg_dump`, Supabase CLI, or ZIP creation directly.

Flow:

1. Owner clicks **Create backup**.
2. The frontend sends the current Supabase access token to `/api/admin/backup/create`.
3. The Cloudflare Pages Function validates the Supabase user.
4. The function confirms an active owner row in `public.admin_profiles`.
5. The function triggers the GitHub Actions workflow `vulcaniq-db-backup.yml`.
6. GitHub Actions creates a ZIP artifact with SQL dumps and restore documentation.

## GitHub repository secrets

Set these in:

`GitHub > Repository > Settings > Secrets and variables > Actions > New repository secret`

Required:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_URL`

Do not commit these values to Git and do not put them in frontend `VITE_` variables.

## Cloudflare Pages server-side variables

Set these in Cloudflare Pages as non-public server-side variables for the Pages Function:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BACKUP_TOKEN`
- `GITHUB_BACKUP_WORKFLOW_ID` (default: `vulcaniq-db-backup.yml`)
- `GITHUB_BACKUP_REF` (default: `main`)

Optional public frontend variable for the admin button link:

- `VITE_GITHUB_BACKUP_WORKFLOW_URL`

## Schedule

Default automatic backup schedule:

```yaml
- cron: "0 2 * * *"
```

Examples:

```yaml
# Daily at 02:00 UTC:
- cron: "0 2 * * *"

# Weekly every Sunday at 02:00 UTC:
- cron: "0 2 * * 0"

# Monthly on the 1st at 02:00 UTC:
- cron: "0 2 1 * *"
```

Scheduled workflow runs are handled by GitHub Actions and may not start at the exact second.

## Restore checklist

1. Create a new Supabase project.
2. Enable Data API.
3. Set exposed schemas to `public`.
4. Set extra search path to `public, extensions`.
5. Unzip the latest GitHub Actions backup artifact.
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
