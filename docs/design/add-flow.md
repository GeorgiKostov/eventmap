# Brief: Unified add-flow (intake · link pipeline · big-map location picker · FAB)

*2026-07-12 — shipped. Approved by George. Discussion context: FB events
can't be crawled (API dead, scraping ToS/anti-bot), so paste-a-link + scan + manual become one
first-class contribute funnel. No paid scraping services — free-tier fetching only.*

## Goal

Scan / link / manual / place are one add-flow with different inputs. One **"+ Add" FAB** on the
map opens a single intake screen; every input converges on the existing confirm screen
(`captureView` in `app/page.js`). Location picking moves onto the **main map** (kill the
`PinDropPicker` mini-map toggle for the form; keep the component only if the `refine` step still
needs it). Streamlined and quick is the bar: fewest taps from "I saw a poster / got a FB link"
to published.

## Phases (each shippable alone, in order)

### ① Intake screen + link pipeline

**Intake (replaces `scanState === 'pick'`):**
- One drop zone that accepts: tap → camera/file picker (existing), drag-drop image, **paste**
  (global `onPaste` while intake open: clipboard image → scan pipeline; text that parses as a
  URL → link pipeline), plus a visible URL text field ("Paste a link — Facebook event, venue
  page, ticket page…").
- "Or type it in manually" link → blank draft form (existing `openManualAdd` path).
- The three menu items (scan/add event/add place) collapse into one "Add" menu item (see ③).

**Link pipeline — new `POST /api/extract-url` (mirror `/api/scan`'s shape: same rate limits,
same `X-Okolo-Lang`, same response envelope):**
1. Server-side fetch of the URL, logged-out, browser-ish UA, ~10s timeout, follow redirects,
   cap body ~2 MB. If `content-type: image/*` → run the existing image scan path on the bytes.
2. Extraction cascade, cheap-first:
   a. JSON-LD `schema.org/Event` (or `Place`/`LocalBusiness`) — parse all `<script
      type="application/ld+json">` blocks; exact fields, zero AI cost.
   b. OpenGraph/meta tags for title/image as fill-ins.
   c. Fallback: strip HTML to text (drop script/style/nav), pass through
      `extractFromPage()` in `lib/extract.js` (add a variant if the crawl-tuned prompt
      doesn't fit single-page submissions — all AI stays in lib/extract.js).
3. Response = a draft (kind event|place, `is_event`-style gate, confidence per field) + the
   URL stored as `source_url` on publish. Facts only — title/date/place/category; write our
   own description; never copy page prose (doctrine).
4. Fetch blocked / login-walled / no event found → typed error; client shows "Couldn't read
   this page — screenshot it and scan instead" and flips to the camera input. FB from
   datacenter IPs will hit this sometimes; that fallback is the accepted answer (no paid
   scraping APIs).

**Event vs place:** intake never asks. Extractor sets `kind`; confirm screen gets a small
**Event | Place** segmented switch (top of form) that flips `draft.kind` — field sections
already branch on `isPlaceDraft`. Manual entry: same switch, default Event.

### ② Location on the main map

Kill the address/map segmented toggle (`locMode`). Address field and main map become one
two-way-bound picker:
- Autocomplete pick (existing Photon suggest) → main map flies there, centered crosshair pin.
- "Adjust on map" button → capture form collapses to a slim bottom bar ("Move the map — ✓
  Confirm"); the real map pans/zooms; on `moveend` + ~600ms settle → reverse geocode center →
  fill address + town. Confirm → form restores with lat/lng + address set.
- `reverseGeocode()` already exists in `lib/geocode.js` — expose it on `GET /api/geocode`
  (e.g. `?reverse=1&lat=&lng=`) with the same caching/rate-limit discipline (Nominatim 1 req/s;
  debounce on settle, cache by rounded coords).
- Guard the feedback loop: a flag so programmatic `flyTo` from a geocode result doesn't
  trigger reverse-geocode overwriting what the user typed.
- Desktop: form is a side panel, map already visible — live-link without the collapse step.
  Mobile: collapse-to-bar as above. `capture` currently hides `locate-btn`; keep that sane in
  map-pick mode.

### ③ FAB + menu cleanup

- Round "+" FAB on the map (above `locate-btn`, same stack), hidden while `capture` open or
  detail full-screen. Opens intake.
- Menu: scan/add-event/add-place items → one "➕ Add to the map" item opening the same intake.
- i18n: all new copy in `lib/i18n.js` for de/en/bg.

## Constraints (hard)

- All AI through `lib/extract.js`; no inline provider calls in routes.
- Vienna wall-clock times; never host-TZ (`viennaNow()`, `Intl` Europe/Vienna).
- Never fabricate: unknown fields null; no reliable date → not an event draft.
- Serverless: read-only project dir, `/tmp` ephemeral; no new persistent-write assumptions.
- SSRF guard on `/api/extract-url`: http(s) only, resolve + reject private/loopback/link-local
  IPs, no redirects to private ranges, cap size/time.
- Surgical diffs; plain JS; match `app/page.js` single-file style.

## Success check

- `npm run build` clean.
- Browser-verified: paste a real public FB event URL *and* an Eventbrite/venue URL with JSON-LD
  → confirm screen pre-filled → publish → pin on map with working `source_url` linkback.
- Paste an image URL and paste a clipboard screenshot → scan path runs.
- Blocked URL shows the screenshot-fallback nudge.
- Address typing moves the big map; map-drag mode fills address/town via reverse geocode; no
  update loop; `PinDropPicker` gone from the add form.
- FAB present on mobile+desktop, old menu triplet collapsed, all three languages have copy.
