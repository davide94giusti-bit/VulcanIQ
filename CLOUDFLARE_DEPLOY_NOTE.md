# Cloudflare Pages deploy note

This project is configured for Cloudflare Pages only.

Recommended Cloudflare Pages settings:

- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js version: `20` or `22`

Cloudflare Pages Functions are stored in the root `functions/` directory. The analytics ingestion endpoint is:

```text
/api/analytics/event
```

Required Cloudflare Pages environment variables:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_URL=your-project-url
SUPABASE_SECRET_KEY=your-sb-secret-key
# Temporary rollback fallback only:
SUPABASE_SERVICE_ROLE_KEY=your-legacy-service-role-key
```

`SUPABASE_SECRET_KEY` is preferred for Cloudflare backend runtimes. `SUPABASE_SERVICE_ROLE_KEY` remains a temporary fallback. Configure both only as server-side secrets and never expose either through frontend code or a `VITE_*` variable.
