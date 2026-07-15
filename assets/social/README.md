# Okolo social brand assets

Profile pictures + Facebook cover images, one pair per city channel
(`lib/city-channels.js`). Upload the profile to the Instagram/Facebook
account and the cover to the Facebook Page.

- `okolo-<city>-profile.png` — **1080×1080**, square (IG/FB profile picture;
  content is inside the safe centre circle so the IG round crop never clips it).
- `okolo-<city>-cover.png` — **1640×624** (Facebook Page cover, 2× the 820×312
  desktop spec; key text is centred so the mobile crop keeps it).

Brand: accent `#C93A5B`, Noto Sans, the radar-pin identity (rings = "events
around you"). Cyrillic renders natively (Sofia/Plovdiv/Varna/Burgas).

## Motto

Tagline, in each channel's own language (product principle: local language).
`okolo` = "around" in all three, so the radar line lands natively:

- **English (master): "What's on around you"**
- German (AT/DE cities): "Was rund um dich los ist"
- Bulgarian (BG cities): "Какво се случва около теб"

## Regenerating

These were rendered by a throwaway `next/og` route (`app/api/brandgen`,
since removed) reusing the card tokens — same engine as the weekly carousels.
To change the motto/design or add a city, recreate that route from this
commit's diff, `npx next dev`, and
`curl 'localhost:PORT/api/brandgen?channel=<slug>&kind=profile|cover' -o ...`,
then delete the route again. Nothing here is served by the app.
