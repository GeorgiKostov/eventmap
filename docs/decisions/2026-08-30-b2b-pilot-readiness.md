# Managed partner pilot: cache-first readiness before self-hosting

Date: 2026-08-30
Status: accepted for the validation prototype

## Decision

Okolo will sell the first organiser engagement as a managed, bounded pilot on the existing hosted
stack. The public map and partner showcase are hardened now with stable viewport cache keys, CDN
headers, auth-free public reads, bounded database work, targeted Postgres indexes and guarded public
geocoding. Okolo will not self-host the basemap or geocoder before a measured customer requirement
justifies that operational cost.

The public `/partners` page may describe and invite this pilot. It must stay truthful: no invented
customer, reach, conversion, uptime or scale claim. The fictional `/partners/demo` remains clearly
labelled and `noindex`. A named case study requires separate written permission after results exist.

## Why

The first deal needs a credible delivery path, not a second platform. Most guest traffic can be
absorbed by static page delivery and shared edge-cache entries before it reaches Supabase. Published
festival venues can be geocoded and reviewed before launch, so public Nominatim or Photon should not
sit in the visitor-critical path. This is sufficient to rehearse a first managed programme while
keeping the current Linz validation thesis intact.

## Current readiness boundary

- MapLibre remains the browser renderer; OpenFreeMap serves the basemap directly and OpenStreetMap
  attribution remains visible.
- The event overlay stays in Supabase PostGIS through the transaction pooler. Public viewport reads
  use canonical bounding boxes and short edge caching; partner-source reads may cache longer.
- Published spatial, source and normalized search predicates have dedicated indexes.
- Public reads do not refresh an auth session or emit session cookies.
- Public Nominatim access is globally serialized across serverless instances. Photon suggestions are
  configurable, coalesced, rate-limited and edge-cacheable; provider failures are not cached.
- The first customer still requires a capacity rehearsal and written scope. No contractual SLA is
  implied by these engineering changes.

## Escalation path

Use the operational gates in `docs/ops/partner-pilot-scaling.md`. In order: measure real traffic,
fix cache-key or query problems, increase managed compute/pool capacity, publish immutable programme
snapshots, introduce PostGIS vector tiles only if measured density requires them, then move to a
regional PMTiles basemap or managed/self-hosted geocoder if a contract requires independence.

The second independent customer is the trigger to design explicit partner/programme/version tables
and per-partner reporting. Self-service accounts, organiser RBAC, ticketing and multi-tenant theming
remain separate product-phase decisions.
