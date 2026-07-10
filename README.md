# Umkreis — lokale Event-Karte (Prototyp)

Event map for the Linz/Asten region: real events mined from official municipal sources,
browsable on a map with filters, plus an AI poster-scan flow to add events from photos.
Working title; no accounts, no tracking.

## Run it

```bash
npm install
npm run dev        # → http://localhost:3311
```

The database (`data/umkreis.db`, SQLite) ships pre-seeded with real events from
linztermine.at, ~14 Gemeinde websites, familienkarte.at and erlebe.enns.at.

**Poster scan** needs Claude credentials: copy `.env.example` → `.env.local` and set
`ANTHROPIC_API_KEY` (or have Claude Code installed — it falls back to `claude -p`).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app on port 3311 |
| `npm run seed` | Re-import `data/mined/*.json` (validate → geocode → upsert → expire) |
| `npm run crawl` | Recrawl all registered sources (fetch → Claude extraction → geocode → upsert). Run every few days. Needs API key. |

## How it works

```
data/mined/*.json  (agent mining runs)   ─┐
sources table      (npm run crawl)       ─┼─→ SQLite (events, sources, geocache)
poster scan        (/api/scan → confirm) ─┘        │ expiry: ends_at (or start+6h) < now
                                                   ▼
                                    Next.js app — MapLibre + OSM map,
                                    filters (date/radius/category/gratis/outdoor),
                                    detail sheets with provenance + .ics export
```

- **Map:** MapLibre GL + OpenFreeMap tiles (no Google dependency, no API key).
- **Geocoding:** Nominatim (1 req/s, cached in `geocache` table) with town-centroid fallback;
  pins with dashed border = town-level precision only.
- **Extraction:** Claude Haiku 4.5 (`lib/extract.js`) — poster images and crawled pages share
  the same schema. Structured outputs guarantee valid JSON.
- **Expiration:** events disappear from the map once over (`ends_at`, or start + 6h if no end).
- **Dedup:** normalized title + day + town (`content_hash`), so recrawls update instead of duplicate.
- **Legal:** we index facts (title/date/place) with linkback to the official source and write our
  own descriptions — never copying source prose or images. Municipal + Land OÖ sources only.

## Deploying

**GitHub Pages does not work** for this app — it serves only static files, but Umkreis
needs a Node server (API routes, SSR event pages, sitemap). Use **Vercel** (it runs
Next.js natively).

### Live demo on Vercel (read-only, ~5 min)

Import the GitHub repo at [vercel.com/new](https://vercel.com/new). Framework = Next.js,
defaults are fine. The seeded SQLite DB ships in the bundle and is copied to `/tmp` at
cold start (see `resolveDbPath()` in `lib/db.js`), so **browsing works fully** — map,
filters, detail, `/event/[id]` pages with JSON-LD, sitemap.

Optional env vars (Project → Settings → Environment Variables):
- `ANTHROPIC_API_KEY` — enables the poster-scan feature.
- `NEXT_PUBLIC_BASE_URL` — your deployed URL, so sitemap/share links are absolute.

Demo limitation: on serverless the filesystem is ephemeral, so **newly scanned/published
events don't persist** across cold starts. That's the cue to do the real backend ⬇︎

### Production backend (Supabase)

The schema mirrors Supabase's Postgres layout on purpose, so this is a mechanical port:

1. Create a Supabase project; port `lib/db.js` tables to Postgres + PostGIS
   (`lat/lng` → `geography(point)`, `categories` TEXT → `text[]`, keep `content_hash` unique).
2. Swap `better-sqlite3` calls for `@supabase/supabase-js` in `lib/db.js` (single file).
3. Move `npm run crawl` to a Vercel Cron / GitHub Action every 2–3 days.
4. Poster uploads → Supabase Storage instead of `data/uploads/`.

After this, publishing/scan persist and the site is fully production-ready.

## Data sources & recrawl notes

See `briefs/mining-brief.md` for per-source quirks (which Gemeinde URLs work, which are
JS-only SPAs, how familienkarte.at pagination works). The `sources` table stores the same
registry with `works` flags — `npm run crawl` skips broken ones.
