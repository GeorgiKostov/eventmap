# 2026-07-14 — Viewport-native data loading (retire the radius model)

Status: decided (George) · Owner: Architect · Brief: `briefs/viewport-rebuild-brief.md`

## Problem

The client fetched **every published event on every page load** — 23,766 rows / 10.2 MB JSON
(~1.4 MB gzipped), ~1.5 s API time — to display one city. All filtering (date, category, radius)
ran client-side over the full set. This works only *because* the whole dataset ships; at EU scale
(200k+ rows) it doesn't degrade, it breaks. There was also no spatial index, and
`expireFinished()` ran an UPDATE on every read.

## Decision

**The viewport is the spatial filter** (Google-Maps model), chosen over (a) keeping the radius
slider on top of viewport fetching — two spatial selectors that can contradict each other — and
(b) payload slimming alone, which buys time but doesn't scale.

1. **Retire the radius slider + radius circle.** Zoom = search width. Distance labels ("2,9 km",
   from `refPoint`) stay — distance is display, not filter. Newsletter keeps its own radius
   (separate flow, `subscribers.radius_km`).
2. **PostGIS** (Supabase `extensions` schema): generated `geom` point column + GiST index on
   `events`. Bbox queries are O(log n) — indifferent to 23k vs 5M rows.
3. **Zoom-tiered responses:** ≥11.5 → full rows in bbox, LIMIT 800; <11.5 → server-side grid
   aggregates (`{lat,lng,n}` cells, ~64px). Zoomed-out cost is constant regardless of dataset
   size — this is the piece that actually scales. Escalation path if we outgrow it: MVT vector
   tiles (`ST_AsMVT`), CDN-cached; deliberately not built now.
4. **All filters become SQL predicates** (mirroring the client memos exactly); the client keeps
   filtering loaded rows optimistically so chip toggles stay instant while the debounced (400ms)
   refetch settles. Auto-refetch on map move, no "search this area" button (George).
5. **Global server text search** (`?q=`, ILIKE, limit 20) replaces client search over the loaded
   set — you can find an event in another town from anywhere; picking a result flies there.
   pg_trgm+GIN reserved for >100k rows.
6. **Saved list** resolves via `?ids=` (saved events are usually off-viewport). Prune only ids
   the server says are gone — never ids merely outside the current view.
7. **Reads stop writing:** `expireIfStale(600s)` throttles expiry via a `meta` table instead of
   running `UPDATE` per request.

## Why now

23k rows / 3 countries shipped to a Linz visitor was already indefensible (measured before
deciding — the "scale problem" was really a scoping problem), and the EU/planet-scale docs make
the rebuild inevitable; doing it pre-test avoids rebuilding twice. Execution: Sonnet agents build
(server, then client), Opus adversarial review, architect integrates (per
`skills/model-hierarchy.md`).

## Consequences

- 2,800-line `page.js` loses its "hold everything" assumption; list = what's in view.
- `publishedEvents()` (full dump) remains for MCP server / sitemap / JSON-LD only.
- Filter-semantics drift between old client memos and new SQL is the top regression risk —
  named as review priority #1 in the brief.
