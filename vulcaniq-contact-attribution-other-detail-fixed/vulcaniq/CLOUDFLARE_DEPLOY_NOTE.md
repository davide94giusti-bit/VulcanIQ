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
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` must be configured only as a Cloudflare Pages server-side environment variable. Do not expose it in frontend code.
