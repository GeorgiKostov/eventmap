# Okolo weekend reel (Remotion)

A 9:16, ~20 s reel of the weekend picks for Instagram/Facebook Reels and Stories.
It sits next to the Thursday carousel and is built from the **same frozen digest**,
so it can't disagree with the carousel, newsletter or weekend page.

Scenes: intro (city + dates + count) → map with the picks dropping in as
category pins → one card per pick (max 8) → outro (okolo.events, link in bio).
All content is our own facts + our own art (hard rule 1); no AI is involved
(AI cost policy). Basemap: OpenFreeMap, with attribution drawn in frame.

## Weekly use

From the repo root, after the digest is frozen (desk / `npm run digest`):

```bash
npm run reel:props -- --channel linz            # writes video/data/current.json
cd video && npm run dev                          # Studio preview (port 3000)
cd video && npm run render                       # → video/out/reel.mp4
```

`--weekend 2026-11-20` exports a specific weekend. The export refuses a digest
that carries a paid (gold) pick: the reel has no „Anzeige" label yet.

## Notes

- One-time setup: `cd video && npm i` (separate package so the Next app stays lean).
- Render needs `--gl=angle` (set in `remotion.config.ts` and the render script) for MapLibre.
- Remotion is free for individuals/companies up to 3 people; render locally, not on Lambda.
- No music yet: Meta's API can't attach IG library audio, so any track must be
  royalty-free and baked in.
- Publishing is not wired: posting a reel via the Graph API (`media_type=REELS`)
  needs the MP4 at a public URL. Next step if the 2–3 weekend test pays off.
