# Brief: Search at another location, not just mine (Agent 4 — Developer)

Goal: the top-left search (built in ui-controls round) currently filters events by text. Extend it so
the user can also search a PLACE (town/address) and explore events around there — Google Maps pattern.

## Context
- Runs AFTER the places agent (both touch `app/page.js`) — pull latest working-tree state first.
- Existing pieces to reuse: top-left expanding search (page.js), `/api/geocode` route (forward mode
  may need adding — it currently does reverse), `lib/towns.js` centroids, locate-me FAB + `located`
  state, radius filter + distance display logic.

## Tasks

1. **Two result sections in the search dropdown/list:** "Events" (existing text match) and "Orte"
   (locations). Locations come from: (a) instant client-side match against `lib/towns.js` + distinct
   `town` values present in loaded events/places; (b) on Enter or after ~600ms debounce with ≥3 chars
   and no local hit, a forward-geocode via the geocode API (extend `/api/geocode` with a `q` param →
   `lib/geocode.js` forward lookup, OÖ sanity bounds apply, Nominatim throttle respected). i18n DE/EN.
2. **Selecting a location result:** fly the camera there, drop a subtle temporary marker, and set it
   as the **reference point**: distance labels and the radius filter now compute from it. Show a small
   dismissible chip near the top-left pill: "Umkreis um {Ort} ✕" — clearing it (or tapping the
   locate-me FAB) restores the user's own location as reference and removes the marker.
3. **No regression:** plain text search still filters events; selecting an event result behaves as
   before. Keep state minimal — one `searchCenter {lat,lng,label} | null` is probably enough.

4. **Locate-me button restyle (George feedback):** the bottom-right locate button must look like a
   standard map control, not a colored action FAB — white/neutral circular button, subtle border +
   shadow (match MapLibre control styling), with the standard "my location" crosshair SVG glyph
   (circle + 4 ticks, lucide `locate`/`crosshair` style) in dark gray; accent color only while
   actively locating or when the reference point is the user's own location (Google Maps behavior).
   No emoji. Keep the raspberry FAB style for real actions only.

## Out of scope
Autocomplete beyond the above; search history; multi-region support beyond the OÖ bounds.

## Success check
`npm run build` green. Browser (mobile + desktop): search "Wels" → Orte section appears → select →
camera flies, chip shows, distances/radius recompute around Wels; ✕ or locate-me restores own location;
event-text search unchanged. STOP any dev server you start.
