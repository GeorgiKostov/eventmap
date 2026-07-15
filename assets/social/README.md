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

Brand: accent `#c93a5b`, ink `#212b28`, paper `#f2f2ee`, Noto Sans. Cyrillic
renders natively (Sofia/Plovdiv/Varna/Burgas). Tagline per channel language —
EN master "What's on around you" / DE "Was rund um dich los ist" / BG "Какво се
случва около теб" (okolo = "around" in all three).

## Regenerating

- **Profile:** rasterize `app/icon.svg` to 1080² with `sharp` (`.flatten` on
  white — no transparency on a profile pic). Pure vector, no fonts needed.
- **Covers:** rendered by a throwaway `next/og` route (`app/api/brandgen`,
  since removed) reusing the card tokens + real `CATS`/`P` markers — same engine
  as the weekly carousels. To change the background (`?bg=paper|soft|ink`), the
  pin mix, or the scatter, or to add a city: recreate that route from this
  commit's diff, `npx next dev`, and
  `curl 'localhost:PORT/api/brandgen?channel=<slug>&kind=cover&bg=paper' -o ...`,
  then delete the route again. Nothing here is served by the app.
