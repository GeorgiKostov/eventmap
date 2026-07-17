# Okolo social brand assets

Upload targets per city channel (`lib/city-channels.js`):

- **`okolo-profile.png`** — **1080×1080**, the app icon (pink map-pin on white,
  from `app/icon.svg`). **One shared profile picture for every account** —
  Instagram + Facebook, all cities. No text: the @handle carries the city, and
  a consistent avatar is the brand. Circle-crops to a white disc with the pin.
- **`okolo-<city>-cover.png`** — **1640×624** Facebook Page cover, one per city.
  Motif: the geometric `okolo` wordmark (pin = the 'l') + city + local-language
  tagline, beside a map "lens" holding the app's REAL category pins (`CATS`
  colours + `lib/icons.js` glyphs: family/festival/culture/pool/music/market/
  sport). Composition is centred so Facebook's mobile centre-crop keeps it.
  Filename is keyed by **slug**, so Vienna's is `okolo-wien-cover.png` even
  though it reads "Vienna" — the file follows the registry key, the artwork
  follows `brandName()` (see below).

The city word is `brandName(channel)` — `channel.brand ?? channel.label` — NOT
`label`. Only Vienna differs today: the account is @okolo.vienna while the city's
German name is Wien, and `label` is load-bearing elsewhere (German prose, the AI
copywriter's `city`, schema.org `addressLocality`, the gazetteer key). Brand art
says Vienna; German prose still says Wien. Rationale on the `wien` row in
`lib/city-channels.js`.

Brand: accent `#c93a5b`, ink `#212b28`, paper `#f2f2ee`, Noto Sans. Cyrillic
renders natively (Sofia/Plovdiv/Varna/Burgas). Tagline per channel language —
EN master "What's on around you" / DE "Was rund um dich los ist" / BG "Какво се
случва около теб" (okolo = "around" in all three).

## Regenerating

- **Profile:** rasterize `app/icon.svg` to 1080² with `sharp` (`.flatten` on
  white — no transparency on a profile pic). Pure vector, no fonts needed.
- **Covers:** rendered by a throwaway `next/og` route (`app/api/brandgen`,
  since removed) reusing the card tokens + real `CATS`/`P` markers — same engine
  as the weekly carousels.

  ⚠️ **The route is NOT recoverable from git.** The instruction that used to live
  here ("recreate it from this commit's diff") is wrong: `f2dc435` committed the
  PNGs only, never the route source. A new cover, a new background, or a changed
  pin scatter means writing that route again from scratch.

  **Retypesetting one word** (what Vienna needed, 2026-07-17) does NOT require
  the route, and shouldn't use it — a from-scratch rebuild would almost certainly
  drift from the other nine covers. Instead, edit the existing PNG in place: the
  city word is **Noto Sans Bold, fontSize 100, letterSpacing −3, `#212B28`**,
  left edge **x=313**, baseline **y=375**, on flat paper `#F2F2EE` that runs to
  x=738 before the lens artwork starts. Those params were recovered from the
  committed art itself (re-rendering "Wien" with them reproduces the original
  letterform-for-letterform), so: erase the old word's bbox, render the new one
  with `next/og` + `public/fonts/NotoSans-Bold.ttf`, composite at that left edge
  and baseline. Verify by diffing against `HEAD` — only the city-name band may
  change. Nothing here is served by the app.
