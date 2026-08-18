# ADR-001 — Google reviews provider/cache model

**Status:** Accepted

Use the official Google Business Profile Reviews API through a server-side Supabase Edge Function. Store provider content only in a separate expiring cache (29 days), never as permanent first-party review records. Public components consume a normalized review model. Manual Google-labelled native reviews remain fallback only. Provider failure is non-fatal.

This preserves source ownership, server-only OAuth secrets and provider policy boundaries while keeping the public Reviews page resilient.
