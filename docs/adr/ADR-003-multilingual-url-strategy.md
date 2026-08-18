# ADR-003 — Multilingual URL strategy

**Status:** Accepted for stabilization; revisit at modernization

Italian is represented by the clean route (`/reviews`); English uses `?lang=en`. Italian `?lang=it` is normalized away when the application controls navigation. Runtime canonical/hreflang metadata follows this contract.

A path migration to `/it/...` and `/en/...` is deferred until frontend modernization because it would require redirects, sitemap/canonical changes, analytics updates and external-link migration.
