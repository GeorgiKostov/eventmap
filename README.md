# Umkreis — lokale Event-Karte (Prototyp)

Event map for the Linz/Asten region: real events mined from official municipal sources,
browsable on a map with filters, plus an AI poster-scan flow to add events from photos.
Working title; no accounts, no tracking.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill DATABASE_URL (+ GEMINI_API_KEY for scan)
npm run dev                  # → http://localhost:3311
```

The database is **Supabase Postgres** (our tables live in the `umkreis` schema). Set
`DATABASE_URL` to the project's **transaction-pooler** connection string. First-time
setup: `npm run seed:sql -- db/schema.sql` creates the tables; then seed events with
`npm run seed` (re-imports `data/mined/*.json` → geocode → upsert).

Real events come from linztermine.at, ~14 Gemeinde websites, familienkarte.at and erlebe.enns.at.

**Poster scan** uses Gemini Flash-Lite (primary) → Claude Haiku (fallback): set
`GEMINI_API_KEY` and/or `ANTHROPIC_API_KEY` in `.env.local` (without either, it falls back
to the local `claude` CLI if installed).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app on port 3311 |
| `npm run seed` | Re-import `data/mined/*.json` (validate → geocode → upsert → expire) |
| `npm run seed:sql -- <file>` | Run a `.sql` file against the DB (e.g. `db/schema.sql` for first-time setup) |
| `npm run crawl` | Recrawl all registered sources (fetch → AI extraction → geocode → upsert). Run every few days. Needs an extraction key. |

## How it works

```
data/mined/*.json  (agent mining runs)   ─┐
sources table      (npm run crawl)       ─┼─→ Supabase Postgres (umkreis schema: events, sources, geocache)
poster scan        (/api/scan → confirm) ─┘        │ expiry: ends_at (or start+6h) < now (Vienna)
                                                   ▼
                                    Next.js app — MapLibre + OSM map,
                                    filters (date/radius/category/gratis/outdoor),
                                    detail sheets with provenance + .ics export
```

- **Map:** MapLibre GL + OpenFreeMap tiles (no Google dependency, no API key).
- **Geocoding:** Nominatim (1 req/s, cached in `geocache` table) with town-centroid fallback;
  pins with dashed border = town-level precision only.
- **Extraction:** Gemini Flash-Lite primary → Claude Haiku fallback (`lib/extract.js`) — poster
  images and crawled pages share one schema; provider routing stays inside this one file.
- **Expiration:** events disappear from the map once over (`ends_at`, or start + 6h if no end).
- **Dedup:** normalized title + day + town (`content_hash`), so recrawls update instead of duplicate.
- **Legal:** we index facts (title/date/place) with linkback to the official source and write our
  own descriptions — never copying source prose or images. Municipal + Land OÖ sources only.

## Deploying

**GitHub Pages does not work** for this app — it serves only static files, but Umkreis
needs a Node server (API routes, SSR event pages, sitemap). Use **Vercel** (it runs
Next.js natively).

### Backend: Supabase Postgres (live)

`lib/db.js` talks to Supabase over the **transaction pooler** (serverless-safe) via the
`postgres` client. Our tables live in a dedicated `umkreis` schema, pinned by `search_path`
— so the whole thing dumps/restores into a standalone project cleanly. `starts_at`/`ends_at`
stay TEXT Vienna wall-clock strings (never `timestamptz` — see the timezone rule). Writes
(scan/publish) **persist** — no more ephemeral serverless limitation.

First-time DB setup: `npm run seed:sql -- db/schema.sql`, then `npm run seed`.

### Deploy on Vercel

Import the GitHub repo at [vercel.com/new](https://vercel.com/new) (Framework = Next.js).
Set env vars (Project → Settings → Environment Variables):
- `DATABASE_URL` — Supabase transaction-pooler connection string (**required**).
- `GEMINI_API_KEY` — poster-scan extraction (primary). `ANTHROPIC_API_KEY` optional fallback.
- `NEXT_PUBLIC_BASE_URL` — your live URL, so sitemap/share links are absolute.

Still open: move `npm run crawl` to a Vercel Cron / GitHub Action (every 2–3 days), and
poster uploads → Supabase Storage (currently `/tmp` on serverless, ephemeral).

## Data sources & recrawl notes

See `briefs/mining-brief.md` for per-source quirks (which Gemeinde URLs work, which are
JS-only SPAs, how familienkarte.at pagination works). The `sources` table stores the same
registry with `works` flags — `npm run crawl` skips broken ones.
