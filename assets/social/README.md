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
- **Covers:** `node scripts/gen-cover.mjs --channel <slug>` (`--all`, or
  `--verify` to check the model without writing). Add the channel row to
  `lib/city-channels.js` first; the cover is then one command.

  The original `next/og` route (`app/api/brandgen`) is **gone and not recoverable**
  — `f2dc435` committed the PNGs only, never the route, so the old instruction here
  ("recreate it from this commit's diff") was a dead end. Rather than redraw it and
  have every future city sit visibly off the first ten, `gen-cover.mjs` **composites
  plates** cut from the committed art (`_parts/`: wordmark, lens, one tagline per
  language) and typesets only the city name (Noto Sans Bold / 100 / −3 / `#212B28`).
  The house style therefore cannot drift — it is the same pixels.

  `--verify` regenerates all ten and asserts **lensΔ=0** against the committed art,
  which it achieves for every channel. Its `edgePx` figure is expected to be
  non-zero and is not a failure: the originals rasterised at fractional x, and a
  plate composited at an integer x cannot reproduce that subpixel antialiasing.

  **Trade-off:** the plates are frozen, so they no longer track `CATS` colours or
  `lib/icons.js` glyphs, and `--verify` cannot notice — it compares against the same
  frozen art. If the palette or icon set changes, re-cut the plates from a
  regenerated cover. **A new language needs a tagline plate first** (cut it at the
  model's column left for that column width, and add the width to `TAGLINE_W`); the
  script refuses rather than typeset a tagline whose metrics it can't verify.
  Nothing here is served by the app.
