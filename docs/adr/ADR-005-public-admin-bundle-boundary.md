# ADR-005 — Public/admin bundle boundary

**Status:** Target accepted; partial implementation

The long-term import graph must prevent public visitors from eagerly downloading large admin systems. This release extracts Reviews, SEO, routing, hooks and error handling from `main.jsx` without a high-risk AdminRouter rewrite. A true lazy PublicApp/AdminApp split is the next architectural extraction and should be completed before/during the frontend modernization with bundle-size measurements and E2E coverage.
