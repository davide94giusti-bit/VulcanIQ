# Isolated browser gate —27 October2026

The browser scripts permit loopback URLs only and intercept all external/backend/provider requests. Auth users, booking codes, challenge tokens and public build settings are synthetic. No backend data or actual notifications are created. The test-only fixture is not an application entry point or part of the production build.

`tools/browser-audit-regression.mjs` runs actual React components with installed Chrome via Playwright. Its15 cases cover consent-before-identifiers, equal360px privacy buttons, lazy Admin loading, public runtime errors, nested modal focus/Escape, out-of-order and failed queries, Learning/date/group draft persistence without PII, Italian360px/200%CSSzoom layout, delayed notification preferences, Fast Request double-submit/success, same-key failure retry, booking-code challenge missing/expiry/duplicate handling, review challenge/duplicate handling, and cross-tab sign-out on return to the Admin tab. Fast submission asserts no optional analytics identifiers/UTM under rejected consent and preserves the necessary submission idempotency key and static journey version. Turnstile is an in-page mock of the provider callback API; no provider challenge is solved or bypassed on any real site.

Cross-tab verification observes the actual SDK SIGNED_OUT event and returns focus to the original tab before asserting private content is removed. It does not promise a paint deadline for background tabs. The responsive case uses CSS zoom, not a real iPhone/iPad or browser-level text-scaling acceptance test.

Focused correction source-freeze rerun: component browser15 passed/0 failed (13 external requests intercepted); production-bundle browser23 passed/0 failed (395 backend/API requests intercepted). The separately rebuilt synthetic production output transformed147 modules successfully; existing500kB chunk-size warnings remained warnings. `npm.cmd run test:frontend` passed17/17, including mixed-currency report/single-currency drilldown and immutable Finance action cases. These results retain the prior currency-detail, date-dialog focus and auth-navigation coverage and add six Finance browser cases. `git diff --check` passed with line-ending notices only.

`tools/browser-release-regression.mjs` targets a separately built production bundle containing only synthetic public settings. It checks public entry excludes the Admin chunk, loads Admin only on demand, signs in through the actual form against intercepted Auth, and loads every15 current canonical Admin navigation deep link with no pageerror. Its six Finance cases cover recognized manual income and expenses, linked/reversed/recognition-evidence entries, legitimate draft saving, stale-editor invalidation, read-only booking linkage with preserved linked-draft editing, and all refund close paths/double-clicks during a delayed intercepted RPC. It opens the actual refund dialog and holds/releases a synthetic response; it does not move money. This is not live RLS or complete Admin mutation/financial workflow acceptance.

Failing reproductions preceded their fixes: the initial four Finance cases yielded18 pass/3 fail; the later linkage/in-flight-refund cases yielded21 pass/2 fail. The final23/0 includes all six. Domain tests and PostgreSQL guards complement these browser checks; the original ledger and grants were not weakened to obtain green UI results.

## Reproduction

Use an already available Playwright module with installed Chrome:

```powershell
$env:AUDIT_PLAYWRIGHT_MODULE='ABSOLUTE_PATH_TO_EXISTING_PLAYWRIGHT/index.mjs'
# Start loopback Vite5183 using synthetic VITE_SUPABASE_URL,
# VITE_SUPABASE_ANON_KEY and VITE_TURNSTILE_SITE_KEY.
node tools/browser-audit-regression.mjs
# Build with the same synthetic public settings into a new temporary outDir;
# serve that production output with Vite preview on loopback5184.
node tools/browser-release-regression.mjs
```

Do not put these test settings into `.env`, the deployable bundle, or a real provider configuration. The final clean source ZIP contains the scripts, not the synthetic built output or browser binaries.

CI has a separate browser job. It installs pinned Playwright1.62.1 and Chromium only inside runner temporary/tool caches, with no new application dependency or lockfile change. This matches the locally available test runtime; package/browser installation is CI-only. Its isolated build output is also temporary. [Official Playwright CI guidance](https://playwright.dev/docs/ci) documents installing browser/OS dependencies separately. CI execution itself remains unverified until the branch workflow runs; local Chrome results are not represented as a remote CI PASS.
