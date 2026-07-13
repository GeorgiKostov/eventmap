# Brief: All-GL map pins — one GPU surface, zero drift

*Owner: Developer agent (Opus) · Dispatched by Architect 2026-07-13 ·
Context: George: "zoom and moving camera shifts all the map markers — truly broken; needs the
GL architecture; this is the backbone of the app, no drifting of markers."*

## Goal

Replace the DOM pin markers (`.pin2` via `new maplibregl.Marker`) with **GL symbol/circle layers**
so every pin is rendered on the same GPU surface as the map. Pins must stay **pixel-fixed to their
coordinates during pan, zoom, and animations, always** — that is the entire point. Smoothness =
Google Maps class. This also deletes the fragile DOM-marker lifecycle that has produced three
lessons.md entries (drift, flicker, pop-in).

## Why DOM markers are unfixable here

MapLibre repositions each DOM marker per frame from JS (`element.style.transform`), racing the GPU
draw of the basemap. Any CSS interference (a `transition`, load-order flip) or frame lag shifts
pins relative to the map. GL layers are projected in the same render pass as the tiles — drift is
impossible by construction.

## Current state (read these exact regions of `app/page.js` before coding)

- **Constants** (~line 20): `DETAIL_MARKER_SHOW_ZOOM 12.2`, `DETAIL_MARKER_HIDE_ZOOM 12.05`,
  `OVERVIEW_FADE_START_ZOOM 12.1`, `OVERVIEW_MARKER_MAX_ZOOM 12.7`.
- **DOM pin creation/sync** (~1080–1140): `markers.current` Map, `.pin2` element per item, badge +
  community span innerHTML, click/keydown listeners, selected-class effect.
- **Viewport culling machinery** (~760–840): `syncDetailMarkerViewport`, `detailMarkerBounds`,
  `detailMarkersVisible` + hysteresis, rAF-coalesced `move` handler, padded-bounds recompute on
  `moveend`, `markerItems` memo (~1073).
- **Existing GL overview layers** (~1160–1210): source `result-clusters` (clustered GeoJSON from
  `groupedMapItems`), layers `result-cluster-bubbles`, `result-cluster-counts`,
  `result-overview-points`, opacity ramp `clusterFade`. These are ALREADY GL — the rewrite extends
  this source/pattern to full detail pins.
- **Semantic grouping** (~1040–1068): `seriesCollapsedItems`, `venueGroups`, `groupedMapItems`
  (`_venueCount`, `_venueIds`, `_seriesCount`). **Data logic — do not change.**
- **Icons**: `lib/icons.js` — `CATS` colors (16), `P` path strings, `catIconSvg()`. Design spec:
  `docs/design/design-system.md` (marker grammar hard cap — binding).
- `me-marker` / `search-marker` (single DOM markers) may stay DOM — one marker can't drift-storm;
  converting them is optional.

## Target architecture

1. **Sprites.** At map load, rasterize each category pin to an ImageBitmap/ImageData and
   `map.addImage(name, img, { pixelRatio: devicePixelRatio })`:
   - Build a full-pin SVG string per category: teardrop (`50% 50% 50% 4px` silhouette as a path)
     or circle (place cats), fill `CATS[cat].color`, 2px white border, white icon glyph from `P`.
   - Render via `new Image()` + `drawImage` on an offscreen canvas at 2–3× for crispness.
   - 16 category sprites + 1 neutral dashed-ring "approx halo" sprite + 1 community dot sprite
     (or draw those as layers, below). Keep sprite count minimal; variants via layers, not images.
2. **One GeoJSON source** (extend/replace `result-clusters`) holding `groupedMapItems` features with
   properties: `id, cat, color, kind, count` (venue/series count), `community` (bool),
   `approx` (bool). `promoteId: 'id'` for feature-state.
3. **Layers** (bottom → top), all with `icon-allow-overlap / text-allow-overlap: true` (symbol
   collision-hiding would reintroduce "randomly disappearing pins" — explicitly forbidden):
   - `pin-selected-halo`: circle layer, radius ~22, color `['get','color']` @ ~30% opacity,
     visible only via feature-state `selected` (opacity expression). Selection = only ring/scale
     (design-system.md).
   - `pin-approx-halo`: symbol layer, dashed-ring sprite, filter `approx == true`.
   - `pins`: symbol layer, `icon-image: ['concat','pin-',['get','cat']]`,
     `icon-size` bumps ~1.25 when feature-state `selected`.
   - `pin-badges`: circle (ink bg) + symbol text (`count`), `icon/text-translate` top-right,
     filter `count > 1`.
   - `pin-community`: small circle, `--community` color `#e59500`, translate top-left, filter
     `community == true`.
4. **Zoom handoff, all-GL:** clusters fade out / pins fade in across the same band via
   `interpolate ... zoom` opacity expressions on both — one source of truth, evaluated per frame
   on the GPU. No JS visibility flags. Pick a clean band (e.g. 12.0→12.6) and set layer
   `minzoom/maxzoom` just outside the fade ends.
5. **Interaction:**
   - `map.on('click','pins', …)` → resolve feature `id` → the same `selectRef.current(ev)` path
     (look up the item from a `Map(id → item)` built alongside the source data). Add a few px
     click tolerance by also querying a small bbox around the point.
   - `mouseenter/leave` on the pins layer → `cursor: pointer`.
   - Selection: `map.setFeatureState({source, id}, {selected:true})` + clear previous. Keep the
     existing React `selected` state as the driver; sync in an effect.
6. **Delete** (the payoff): the whole DOM-marker path — `markers.current` loop, `.pin2`
   creation/innerHTML/listeners, `syncDetailMarkerViewport`, `detailMarkerBounds`,
   `detailMarkersVisible` + hysteresis + rAF `move` handler, `markerItems` viewport memo,
   `.pin2*`/`pin-fade-in`/`.pin-badge`/`.pin-community` CSS (keep `.legend-pin*` — the legend is
   plain DOM and stays). Update `data` on the source when `groupedMapItems` changes (`setData`) —
   full set, no viewport culling (GL handles thousands of sprites; that's the point).
7. **Accessibility:** canvas pins are not keyboard/SR-reachable (same as Google Maps). The
   list (sidebar/sheet) remains the accessible path — do not regress it. Keep marker aria strings
   in i18n only if still used; remove dead keys otherwise.

## Hard constraints

- Single-file style of `app/page.js`, plain JS. Surgical: don't touch filters/detail/add-flow/
  grouping logic. Design tokens from `CATS`/`:root` only (`design-system.md` is binding — GL paint
  can't read CSS vars, so mirror the hex with a comment pointing at the token).
- **No symbol collision hiding. No JS-driven per-frame work on `move`.** After this change the
  only `move` handlers left should be ones unrelated to pins (reverse-geocode on moveend etc.).
- `npm run build` green; existing `node --test` map-groups tests still pass.

## Verification (must actually do, not assert)

1. `npm run build` + existing tests.
2. Drive the real app in a browser (dev server on :3311). WebGL may be flaky in the in-app
   preview — if tiles render (they did this session), verify there; otherwise verify with
   programmatic checks:
   - **Fixed-position proof:** for 3 sample features, compare `map.project([lng,lat])` against
     `queryRenderedFeatures` hits after: a 300px pan, zoom 11→14, and a `flyTo` — the feature must
     be found within ±2px of its projected point in every state.
   - **No-vanish proof:** at zoom 13/14/15 over Linz, `queryRenderedFeatures({layers:['pins']})`
     count must equal the number of source features in the viewport (allow-overlap ⇒ nothing
     culled).
   - Click a pin → detail opens; select from the list → halo/scale appears on the right pin.
   - Handoff: step zoom 11.8 → 12.8 in 0.2 increments; at every step clusters+pins opacities are
     complementary (no gap where both are invisible).
3. Report the evidence (numbers/screenshots), not just "works".

## Out of scope

- Clustering algorithm, venue/series grouping, filters, detail UI, add-flow.
- me/search markers (optional, only if trivial).
- Any data/pipeline change.
