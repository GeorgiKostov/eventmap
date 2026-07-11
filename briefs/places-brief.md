# Brief: "Places" content type + icon taxonomy (Agent 2 — Developer)

Goal: families-first means not only timed events but also evergreen LOCATIONS — playgrounds, forest
walks, parks, swimming pools (with opening times), indoor play (e.g. "playground at Lutz"). These are
a second content kind, not events with fake dates.

## Context
- Runs AFTER the ui-controls agent (both touch `app/page.js`); pull latest first.
- Schema in `lib/db.js` (Supabase Postgres, `umkreis` schema; Vienna wall-clock TEXT datetimes).
- Design doc §5 data model, §9 UI model. Hard rules: never fabricate; Vienna time; Supabase-portable;
  facts+linkback for anything sourced.

## Tasks

### 1. Data model: `kind = event | place`
- Add `kind TEXT NOT NULL DEFAULT 'event'` to `events` table (migration in `db/schema.sql` + `lib/db.js`).
  A `place` has NO starts_at/ends_at; instead:
  - `opening_hours` JSON (nullable) — simple weekly structure `{mon:[["09:00","18:00"]],…}` or null
    meaning "always open" (forest walk, park). Vienna wall-clock.
  - `seasonal` note field optional (e.g. "Mai–September") — plain text, nullable.
- Expiry logic in `lib/db.js` must SKIP places (they never expire). Grep every query that filters by
  starts_at/status — places must not be dropped by date filters accidentally.
- Dedup for places: normalized title + town (no day component).
- Place categories (extend CATS, see Task 3): `playground`, `pool` (swimming, incl. lakes/lidos),
  `park`, `trail` (walks/hikes), `indoor_play` (Indoorspielplatz, play cafés). Keep the existing 8
  event categories unchanged.

### 2. UI: places on the map + add-a-place flow
- Places render with visually distinct pins (rounded-square or circle marker vs teardrop — pick one,
  keep it subtle and consistent) using their category color/icon.
- Filters: date chips do NOT hide places (a playground is valid "today" always — but respect opening
  hours: show "Jetzt geöffnet/geschlossen" state on card/detail when hours exist). "Für Kinder",
  indoor/outdoor, radius, category filters apply normally. Add a top-level toggle chip
  **Events | Orte | Alle** (i18n: Events/Places/All) — default Alle.
- Detail view for a place: no date row; show opening hours (today's hours prominent, week expandable),
  category, address, source link if sourced, distance.
- **Add-a-place flow** from the top-right menu (menu built by Agent 1 — add a third entry "Ort
  hinzufügen"/"Add place"): form with title, category, description, opening hours (optional,
  simple per-day inputs or "always open" checkbox), and LOCATION set by either:
  a. typing an address (geocode via `lib/geocode.js`), or
  b. **interactively dropping/dragging a pin on the map** — a "set on map" mode where a centered
     crosshair/pin follows the camera and the user confirms position (Google-Maps "drop pin" pattern —
     drag the MAP under a fixed center pin; simpler and more mobile-friendly than draggable markers).
  The same pin-adjust step should also be offered on the event confirm screen when geocoding was
  low-precision (geo_precision = 'town') — reuse the component.
- POST via the existing events API route (extended for kind/opening_hours validation).

### 3. Icon taxonomy pass (`lib/icons.js`)
- George: "some icons are unclear, some have dashed lines". Audit all 8 existing icons rendered at
  15px white-on-color: replace unclear/dashed-looking paths with cleaner lucide-style strokes.
  Known suspects: food (fork tines read as dashes), sport (globe lines), market basket verticals.
  Keep stroke style consistent (2–2.2 width, round caps).
- Add clean icons for the 5 new place categories (slide for playground, waves for pool, tree for
  park, footprints/signpost for trail, blocks/ball-pit for indoor_play) + distinct colors that don't
  collide with the event palette.
- Verify legibility: render every icon at pin size in the browser and eyeball it.

## Out of scope
- No user accounts, no moderation queue (drafts publish directly like events do today).
- No scraping of place databases (OSM import etc. is a later decision).
- No image uploads for places yet.

## Success check
- `npm run build` green.
- Browser: seed 2–3 real Linz places by hand via the new flow (e.g. Spielplatz Donaulände, Parkbad
  Linz with real opening hours, a Kürnberger Wald walk) — set one by address, one by map-pin drag.
  Verify: distinct pins, Events|Orte|Alle toggle, date chips don't hide them, opening-hours state
  correct in Vienna time, detail view sane in DE and EN, existing event flows unbroken.
- Update design-doc §5 (data model) and §9 (UI) with the places type — surgical edits.
