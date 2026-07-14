# Viewport-native data loading — rebuild brief

**Decision (George, 2026-07-14):** retire the radius model; the viewport is the spatial filter,
like Google Maps. Auto-refetch on map move (debounced). Global server-side text search.
This replaces "ship all 23,766 events (10.2 MB) to every visitor on load".

Read `CLAUDE.md` hard rules first. Rules 3 (Vienna wall-clock), 4 (schema.sql + idempotent
migration script, bigint ids are strings), 5 (never fabricate) all apply here.

## Target architecture

```
client (page.js)                         server (route.js + lib/db.js)
map moveend / filter change ──debounce──▶ GET /api/events?view=map&bbox=…&zoom=…&filters…
  zoom ≥ 11.5                              → { mode:'pins', events:[…≤800 rows], total, truncated }
  zoom < 11.5                              → { mode:'cells', cells:[{lat,lng,n}…], total }
search box (≥2 chars) ───debounce────────▶ GET /api/events?q=…        → { results:[…≤20] }
saved-list modal ────────────────────────▶ GET /api/events?ids=1,2,3  → { events:[…] }
detail open (unchanged) ─────────────────▶ GET /api/events?id=373     → { event }
```

Postgres does the heavy narrowing (bbox via PostGIS GiST + date via the existing
`events_starts_idx` text index + all toggle filters, so cell counts are correct).
The client ALSO keeps its existing filter memos over the ≤800 loaded rows, so toggling a chip
feels instant (optimistic) while the debounced refetch replaces the data.

## Server / DB (Agent A)

1. **Migration** `scripts/migrate-viewport.mjs` (idempotent, `--env-file=.env.local`, mirror the
   style of `scripts/migrate-reactions.mjs`) + same DDL appended to `db/schema.sql`:
   - `create extension if not exists postgis with schema extensions;` (Supabase convention —
     extensions live in the `extensions` schema). If this errors on permissions, STOP and report;
     do not work around it.
   - `alter table events add column if not exists geom extensions.geometry(Point,4326)
      generated always as (extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)) stored;`
   - `create index if not exists events_geom_idx on events using gist (geom);`
   - `create table if not exists meta (key text primary key, value text);`
2. **lib/db.js**:
   - Connection `search_path` becomes `'umkreis, extensions'` so `ST_*` and `&&` resolve.
   - `expireIfStale(maxAgeSec=600)` — read `meta['last_expire']`; only run `expireFinished()` +
     upsert timestamp if older. Replace the unconditional `expireFinished()` calls on the read
     path with this. (Today every page load runs an UPDATE before reading. Reads must not write.)
   - `mapPins({bbox, when: {from,to}, kind, cats, free, kids, community, inout, tod})` →
     bbox = `[minLng,minLat,maxLng,maxLat]`. `WHERE status='published' AND geom &&
     ST_MakeEnvelope(...,4326) AND <filters>` ORDER BY starts_at ASC (places' null starts_at sort
     last), LIMIT 800. Return the same column projection as `publishedMapEvents()` (incl.
     interest_count/report_flag via `REACTION_JOIN`), plus `total` (count without limit) and
     `truncated`.
   - `mapCells({bbox, cellDeg, ...same filters})` → `SELECT avg(lat) lat, avg(lng) lng,
     count(*)::int n FROM events WHERE … GROUP BY floor(lat/cellDeg), floor(lng/cellDeg)`.
     No reaction join needed. Also return `total`.
   - `searchEvents(q)` → `title ILIKE '%q%' OR venue ILIKE '%q%' OR town ILIKE '%q%'`,
     status published, ORDER BY starts_at ASC, LIMIT 20, compact projection
     (id,kind,title,starts_at,venue,town,lat,lng). Escape `%_` in q. (Note for >100k rows:
     pg_trgm + GIN; do NOT add it now.)
   - `eventsByIds(ids)` → published rows for ≤100 ids, same projection as mapPins.
   - **Filter semantics: mirror the client's exactly.** Read the predicates in `app/page.js`
     (`filteredEvents` / `commonFiltered` memos and their helpers) and replicate: `when` windows
     as wall-clock TEXT comparisons (`from`/`to` arrive as `YYYY-MM-DDTHH:MM` strings computed
     client-side; overlap test `starts_at <= to AND coalesce(ends_at, starts_at) >= from`), date
     filters apply ONLY to kind='event' (places always pass), kids/community/inout/tod definitions
     copied from the client. String comparison on ISO text is index-friendly on `events_starts_idx`.
   - Compose conditional SQL with postgres.js fragments (`${cond ? sql`AND …` : sql``}`) — never
     string interpolation.
3. **app/api/events/route.js** GET: parse + validate params (floats, enum whitelists; 400 on
   garbage; bbox span >20° → 400). Zoom tier: `zoom >= 11.5` → pins else cells with
   `cellDeg = 360 / Math.pow(2, Math.round(zoom)) / 4` (≈64px cells). Keep `?id=`; add `?ids=`,
   `?q=`. The legacy no-param "return everything" path stays ONLY for `view` absent (MCP server,
   sitemap, JSON-LD use `publishedEvents()` — untouched). `view=map` without bbox → 400.
4. **Verify** with a temp node script (then delete it): bbox around Linz (14.1,48.2,14.5,48.4,
   zoom 13) returns pins incl. reaction fields; zoom 8 returns cells with sane totals; a `q=`
   search finds a Bulgarian event; `EXPLAIN` on the pins query shows the gist index. Run the
   migration against the real DB (it is idempotent). `npm run build` green at the end.

## Contract corrections (Agent A, as implemented — B builds against THIS)

- **`from`/`to` are date-only `YYYY-MM-DD`** (the client's real memos compare
  `starts_at.slice(0,10)`; the brief's `THH:MM` spec was wrong). Server validates
  `/^\d{4}-\d{2}-\d{2}$/`, must be sent as a pair; SQL compares `left(starts_at,10)`.
- `?q=` blank → `{results:[]}` with 200 (not 400). Results projection:
  `{id,kind,title,starts_at,venue,town,lat,lng}`, ≤20.
- `?ids=` accepts ≤100 comma-separated integers, else 400. Not bbox-scoped.
- `view=map` REQUIRES valid bbox + zoom (0–22); bbox span >20° → 400; enum params
  whitelisted; booleans lenient (`free=1` true, else false).
- Pins mode returns `{mode:'pins', events, total, truncated}`; LIMIT 800. Cells:
  `{mode:'cells', cells:[{lat,lng,n}], total}`.
- `publishedMapEvents()` is now dead code — Agent B must NOT re-adopt it; C decides removal.
- KNOWN BROKEN INTERMEDIATE STATE: old `page.js` calls `?view=map` without bbox → 400.
  Nothing deploys until B lands. Do not commit the server half alone.

## Client (Agent B — after A lands)

`app/page.js` (+ `app/globals.css`, `lib/i18n.js`). Surgical: the GL sprite/grouping/selection
pipeline stays; only the data source changes.

1. **Remove the radius model**: `radius` state, slider UI, `deferredRadius`, the radius-fill/line
   GL layers + `circleGeoJSON`, the `distKm(refPoint, e) <= radius` predicate, `widenRadius`
   empty-state button (→ a "zoom out" button: `map.easeTo({zoom: zoom-2})`). Distance labels and
   `refPoint` (searchCenter || me) STAY — they're display, not filter. Newsletter radius untouched.
2. **Viewport fetch**: on map `load` + debounced (400ms) `moveend` + on any filter change →
   build params from `map.getBounds()` + `map.getZoom()` + current filters; AbortController on
   in-flight; response replaces `events` state (pins mode) or cell state. Optimistic: existing
   client filter memos keep running over loaded rows so chip toggles apply instantly while the
   refetch runs. Cache last ~10 responses keyed by rounded bbox+zoom+filters for instant back-pan.
3. **Two-layer model keeps its crossfade band** (HANDOFF 12.0–12.6):
   - zoom ≥ 11.5: pins source = viewport rows (existing venue-grouping code, unchanged);
     overview-bubble source = client-side clustering of those same rows (as today).
   - zoom < 11.5: pins source empty; overview-bubble source = server cells (map `n` into the
     property the bubble layers read, or adapt the layer expressions — visuals must not change).
   - Cell/bubble tap = existing easeTo zoom+2 behavior.
4. **`when` params**: compute `from`/`to` wall-clock strings with the EXISTING Vienna-pinned
   helpers (hard rule 3) and send them; keep sending the enum too. Server owns date narrowing;
   client keeps its own date memo for optimistic toggles.
5. **Search**: text search now calls `?q=` (debounced ~400ms, ≥2 chars) and renders the Events
   section from server results; picking one → `flyTo(lat,lng, zoom≥13)` + fetch `?id=` + select.
   Locations section (towns + geocode) unchanged. The instant local-town match stays.
6. **Saved modal**: resolve ids via `?ids=` (saved events are usually NOT in the viewport).
   Keep localStorage as source of truth; prune only ids the server says are gone (absent from
   the ?ids= response), NOT ids merely outside the viewport — do not repeat the bug class where
   the saved list silently emptied.
7. **Counts line**: pins mode = filtered loaded counts (as today); cells mode = server `total`.
8. **Drop-pin/long-press, "Around X" chip, locate-me**: unchanged — flyTo naturally triggers the
   viewport fetch. No radius recompute anywhere.
9. **i18n** de/en/bg: remove radius strings; add zoom-out empty-state string; adjust the drop-pin
   tip only if its copy references radius.
10. **Verify in the browser** (preview server, follow the repo verification loop): initial Linz
    load shows pins fast; pan to Vienna → events appear; zoom out to AT level → bubbles, no pin
    soup, no 10MB fetch (check network panel: payloads ≤ ~150KB); toggle kids/free → counts
    change instantly then settle; search "Пловдив" or a BG event title → result flies there;
    saved modal shows a saved Linz event while viewing Vienna; long-press drop-pin still works;
    zero console errors. `npm run build` green.

## Review (Agent C — Opus, after B)

Adversarial pass over the full diff. Priorities: (1) filter-semantics drift between the old
client memos and the new SQL (date overlap, places-vs-events, kids/tod/community definitions);
(2) the saved-list prune rule (must not drop off-viewport ids); (3) abort/race on rapid pan +
filter storms; (4) `EXPLAIN` sanity — gist index actually used, no seq-scan at pins zoom;
(5) cells↔bubbles property mapping (crossfade band visuals); (6) param validation/injection
(postgres.js fragments only); (7) tz hard rule 3 violations; (8) truncated=true UX at z11.5 over
Vienna. Verdict format: SHIP / SHIP-AFTER-FIXES / REBUILD with a numbered findings list.

## Out of scope (do NOT touch)

MVT vector tiles (later, >200k rows), pg_trgm, accounts, `publishedEvents()` consumers
(MCP/sitemap/JSON-LD), the crawl pipeline, newsletter radius, `/event/[id]` pages.
Agents do not commit — the architect reviews and commits each stage.
