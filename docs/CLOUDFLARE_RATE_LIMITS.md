# Cloudflare rate-limit configuration

The application now has database-backed throttling as the authoritative fallback. Add Cloudflare rules as the first line of defence so abusive traffic is rejected before it reaches Supabase.

## Recommended production rules

| Endpoint | Suggested rule | Action |
|---|---:|---|
| `/api/public/booking-request` | 10 requests per IP per 10 minutes | Block for 15 minutes |
| `/api/public/gift-card-request` | 8 requests per IP per 10 minutes | Block for 15 minutes |
| `/api/analytics/event` | 300 requests per IP per hour | Managed challenge or block |
| `/api/admin/backup/create` | 5 requests per IP per 10 minutes | Block for 30 minutes |
| `/functions/v1/notify-new-request` | Do not expose as a public browser action | Require webhook secret or authenticated admin |
| `/functions/v1/send-weekly-admin-recap` | Do not expose as a public browser action | Require cron secret or authenticated owner/manager |

## Expression examples

Use the Cloudflare dashboard rule builder. Match the exact URI path and the `POST` method. Do not include query-string values in a bypass rule.

Example booking expression:

```text
(http.request.method eq "POST" and http.request.uri.path eq "/api/public/booking-request")
```

Example Gift Card expression:

```text
(http.request.method eq "POST" and http.request.uri.path eq "/api/public/gift-card-request")
```

## Turnstile rollout

The server endpoints validate Turnstile tokens when `TURNSTILE_SECRET_KEY` is present. Keep `TURNSTILE_ENFORCE=false` until the public forms render a Turnstile widget and populate `turnstile_token`. Then:

1. Create a site in Cloudflare Turnstile for `vulcaniq.it`, `www.vulcaniq.it`, and the staging alias.
2. Add the public site key to the frontend configuration.
3. Add the secret key only to Cloudflare server-side variables.
4. Verify both public forms on staging.
5. Set `TURNSTILE_ENFORCE=true`.

Do not place the Turnstile secret in a `VITE_` variable.
