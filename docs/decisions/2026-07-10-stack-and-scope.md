# 2026-07-10 — Stack, scope, and phase

Status: locked · Owner: Architect

## Decision
- **Stack:** Next.js 15 (app router, **plain JS** — no TS in this repo), MapLibre GL + OpenFreeMap
  (OSM) tiles, `better-sqlite3` with a **Supabase-Postgres-portable schema**, Nominatim geocoding,
  Claude/Gemini extraction via a provider abstraction (`lib/extract.js`).
- **No Google Maps** dependency — ToS/caching restrictions + cost. OSM/MapLibre only.
- **Phase = validation prototype.** Build only what the four-weekend Linz coverage/retention test
  needs. Explicitly *not now*: accounts, ticketing, payments, multi-region activation, native apps,
  social/coordination features. These are backlog, gated on validation.

## Why
- Families-first, one-region-at-a-time is the thesis (design-doc §2). The prototype exists to prove
  supply-completeness + weekly retention in Linz, not to be feature-complete.
- SQLite keeps the prototype zero-infra and instantly runnable; the schema mirrors Postgres+PostGIS
  so production is a one-file port, not a rewrite.

## Consequences
- Don't introduce TypeScript piecemeal — match plain JS or convert deliberately in one pass.
- Keep `lib/db.js` portable; no SQLite-only cleverness.
- Scope creep beyond the phase requires George's explicit say-so.
