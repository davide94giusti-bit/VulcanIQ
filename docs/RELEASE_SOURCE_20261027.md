# Clean source release contract — 27 October 2026

`tools/release-source.mjs` packages a current working snapshot, including approved source additions, without requiring a commit or Git in the unpacked source. It never archives original outputs/tmp artifacts or recursively reads those folders. Root/source/config directories are allowlisted; installed dependencies, dist, .git/worktrees, .codex, Supabase runtime, .env/.dev.vars secrets, caches, spreadsheets, local databases and private-key artifacts are excluded. Historical tracked Markdown/SQL/docs and required backup scripts remain included. Safe .env.example files are preserved.

Each ZIP contains RELEASE-MANIFEST.json: base commit, branch, dirty flag, build date, source-tree SHA256, file sizes/SHA256s and chronological migration paths. A sibling .sha256 covers the actual ZIP bytes. ZIP entries are deterministic for identical inputs/buildDate. Byte-level archive verification checks paths, duplicates, compression CRC, sizes, manifest hashes and secret findings. Scanner diagnostics contain paths and rule names, never matched values. Public anon/publishable/VAPID keys are not secrets. Explicit named synthetic fixture keys are permitted only in tools/tests; arbitrary opaque server tokens and private keys fail. This scan complements manual review and is not proof no credential ever existed in history.

Run only after the source has stopped changing; choose a new output path outside the source tree:

```powershell
npm.cmd ci
npm.cmd run test:quality
npm.cmd run build
node tools/release-regression.mjs
node tools/release-source.mjs --output C:\Temp\VulcanIQ-audit-20261027-source.zip --date 2026-10-27T00:00:00.000Z
node tools/release-source.mjs --verify C:\Temp\VulcanIQ-audit-20261027-source.zip --extract C:\Temp\VulcanIQ-audit-20261027-verify
Set-Location C:\Temp\VulcanIQ-audit-20261027-verify
npm.cmd ci
npm.cmd run test:quality
npm.cmd run build
```

Output and extraction paths must not exist. Never overwrite another release or reuse the original artifact directories. Keep required database testing tools/container prerequisites from the audit release runbook; schema tests must use disposable targets. Source includes no deployed environment settings proof, live secrets or installed dependencies. Migration/script presence does not authorize applying it. Preserve the ZIP + SHA alongside the last complete backup and known-compatible previous release for rollback.
