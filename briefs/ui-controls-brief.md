# Brief: Map controls relayout + scan UX (Agent 1 — Developer)

Goal: Google-Maps-grade control layout on mobile and desktop, plus a scan flow that never looks broken.

## Context
- App is one client page: `app/page.js` (~870 lines) + `app/globals.css`. MapLibre GL map.
- Existing: language toggle (corner), zoom controls (MapLibre default), scan flow (photo → /api/scan
  → confirm screen), geolocation already used once at startup (`page.js` ~line 250).
- Hard rules: Vienna-pinned time everywhere; no provider hardcoding; match existing style; surgical edits.

## Tasks

### 1. Fix: language toggle overlaps zoom buttons (mobile)
Reposition so DE/EN toggle and MapLibre zoom/attribution never collide at 375px width. Zoom controls
may be hidden on mobile (pinch zoom is native, Google Maps hides them too) — your call, state it.

### 2. Locate-me button (bottom-right, Google Maps pattern)
- Round FAB bottom-right (above mini-card when open). Tap → `navigator.geolocation` → fly camera to
  user, show a blue-dot marker (with accuracy halo if cheap). Re-tap recenters. Graceful denial
  handling (toast/hint, no crash). Keep the user position in state — Task 5 and the distance display
  already computed elsewhere can reuse it.

### 3. Top-right dropdown menu (the "actions" corner)
- One round menu button top-right. Opens a small dropdown with:
  a. **Scan poster** (camera icon) — moves the existing scan-photo entry point here.
  b. **Add event manually** (plus icon) — opens the SAME confirm/edit form the scan flow uses, but
     empty (no photo, no extraction). Reuse the existing confirm-screen component; do not fork it.
  c. Visual slot prepared for future **Account/Login** item — build the menu as a list so adding an
     entry later is one line; add a code comment marking it. NO account functionality now.
- Language toggle can live in this menu too if that solves Task 1 more cleanly (your call).

### 4. Top-left: current-location label + expanding search
- Compact pill top-left: shows locality name of user position when known (reverse-geocode via our
  existing Nominatim helper in `lib/geocode.js` — respect its 1 req/s + cache), else region default "Linz".
- Next to it a magnifier (Lupe) button: tap → expands into a text input (animated, Google-Maps-like),
  typing filters events client-side by title/venue/town/category match (we have ≤ a few hundred events;
  no server search needed). Esc/X collapses. Results show in the existing list/sidebar; on mobile show
  a thin results dropdown under the input. DE/EN placeholder via `lib/i18n.js`.

### 5. Scan flow UX hardening
- **Loading state**: from the moment the user confirms the photo until extraction returns, show a
  clear in-progress screen (spinner + i18n text like "Poster wird gelesen…" / "Reading poster…").
  Disable double-submits. Show a distinct error state with retry on failure.
- **Client downscale**: verify the existing ≤1600px client-side downscale actually runs before upload;
  also re-encode to JPEG quality ~0.8 so uploads are typically <500KB.
- **No stored waste**: the uploaded photo must not persist after extraction completes. Currently the
  photo goes to `/tmp` on serverless — make the scan route delete the file (or never write it: process
  the buffer in memory if that's simpler — prefer in-memory). If a photo is intentionally kept for a
  published event later, that's out of scope today.
- Reference implementation for server-side sharp resize (if needed):
  `~/Repositories/storykept/lib/books/image-resize.ts` — pattern only, don't import cross-repo.
  Avoid adding `sharp` unless actually needed (client downscale may suffice).

## Out of scope
- No scraping of source-site images (hard rule: copyrighted).
- No accounts. No places/locations type (separate brief).

## Success check
- `npm run build` green.
- Browser-verify at 375px and desktop: no overlap; locate-me flies to position (or degrades politely);
  menu opens with Scan/Add entries; manual add reaches the confirm form and can publish an event
  (test then delete it, or use an obviously-test title and delete via DB);
  search expands, filters live, collapses; scan shows loading state (can be simulated with a real
  poster photo file if no camera in the test browser).
- Surgical diff: don't reformat untouched sections of page.js/globals.css.
