# vulcanIQ implementation test report — reimplementation validation 2026-08-11

Baseline: `main@33cf9de`.

## Automated checks completed

### Security regression

Command:

```text
npm run test:security
```

Result:

```text
33 passed, 0 failed
```

Coverage includes GitHub App configuration paths, backup endpoint controls, public server endpoints, idempotency, rate limits, Turnstile support, removal of browser-controlled partner assignment, RLS/grant changes, notification/report uniqueness, privileged role checks, server-authoritative Gift Card logic, redeemable Gift Card booking codes, analytics events, attribution, cron/webhook authentication, recipient validation, migration transaction structure, and secret-file checks.

### JavaScript syntax

`node --check` passed for the changed plain JavaScript modules, including:

- Cloudflare backup functions;
- public booking/Gift Card functions;
- analytics ingestion;
- analytics client;
- booking/Gift Card/operations services.

### TypeScript/JSX parse validation

TypeScript `transpileModule` parse validation passed for:

- `src/main.jsx`;
- shared Edge Function helpers;
- `notify-new-request`;
- `send-weekly-admin-recap`.

### Migration static validation

Confirmed:

- one `BEGIN` and one final `COMMIT` in the main migration;
- no duplicate Gift Card RPC declarations;
- no `USING (true)` or `WITH CHECK (true)` in the new migrations;
- public partner-authority fields are absent from the server RPC;
- idempotency indexes exist for submissions, notifications, and weekly reports.

## Build status

A complete Vite build could not be executed in this container because `npm install --no-audit --no-fund` timed out before dependencies were installed.

This is an environment limitation, not a successful build result. Run `npm install`, `npm run test:security`, and `npm run build` in the normal development/CI environment before deployment.

## Tests requiring connected services

Not executed here:

- applying migrations to the live/staging Supabase database;
- validating actual RLS and Storage policies;
- deploying/invoking Edge Functions;
- Resend delivery and duplicate webhook replay;
- GitHub App installation-token creation and two real backups;
- Cloudflare rate-limit rules and Turnstile challenge;
- Supabase Cron/Vault invocation;
- production analytics persistence;
- iPhone Safari, Android Chrome, and Desktop Chrome journey testing.

## Required release gate

Do not merge to production until all connected-service and device tests in `docs/AUTOMATION_SECURITY_SETUP_20260726.md` pass.
