# Okolo — local event discovery map

Families-first event discovery, beginning with Linz: real events from approved official,
municipal, family and cultural sources, browsable on a map with filters, plus an AI poster-scan
flow for events that are not properly online. Product name **Okolo**
([okolo.events](https://www.okolo.events)); the working name was *Umkreis*.

Production is live on Vercel with Supabase Postgres. There are no consumer accounts. Analytics is
privacy-first and anonymous: no autocapture or session recording, no email addresses or precise
user locations, and local/preview/automated/internal traffic is excluded. See
[`docs/ops/advertiser-proof.md`](docs/ops/advertiser-proof.md) for exact definitions.

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

The repeatable source registry now spans approved sources across Austria, with already-published
coverage in Bulgaria and Germany. Scheduled refresh remains Austria-only during validation; see
[`docs/ops/crawl-cron.md`](docs/ops/crawl-cron.md).

**Poster scan** uses Gemini Flash-Lite (primary) → Claude Haiku (fallback): set
`GEMINI_API_KEY` and/or `ANTHROPIC_API_KEY` in `.env.local` (without either, it falls back
to the local `claude` CLI if installed).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app on port 3311 |
| `npm run seed` | Re-import `data/mined/*.json` (validate → geocode → upsert → expire) |
| `npm run seed:sql -- <file>` | Run a `.sql` file against the DB (e.g. `db/schema.sql` for first-time setup) |
| `npm run crawl` | Recrawl due registered sources (structured waterfall → optional AI extraction → geocode → upsert). Scheduled policy is in `docs/ops/crawl-cron.md`. |

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
  images and crawled pages share one schema; provider routing stays inside this one file. The
  scheduled production crawl is deliberately stricter: Austria only, Gemini only, no Anthropic
  fallback, with a 750-request weekly ceiling for the LLM lane.
- **Expiration:** events disappear from the live map once over (`ends_at`, or start + 6h if no
  end), but naturally expired `/event/<id>` URLs remain factual, clearly ended archive pages with
  nearby upcoming alternatives. Removed/rejected/unknown events remain 404.
- **Dedup:** normalized title + day + town (`content_hash`), so recrawls update instead of duplicate.
- **Legal:** we index facts (title/date/place) with linkback and write original descriptions —
  never copying source prose or images. New platforms require authorization before automation.

## Deploying

**GitHub Pages does not work** for this app — it serves only static files, but Okolo
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

The project is linked and live at [www.okolo.events](https://www.okolo.events). Git-triggered Vercel
deployment is intentionally disabled in `vercel.json`; after a verified release, deploy explicitly
with `vercel deploy --prod --yes`. Required production environment variables:
- `DATABASE_URL` — Supabase transaction-pooler connection string (**required**).
- `GEMINI_API_KEY` — poster-scan extraction (primary). `ANTHROPIC_API_KEY` optional fallback.
- `NEXT_PUBLIC_BASE_URL` — the canonical live origin (`https://www.okolo.events`), so
  sitemap/share links are absolute.

Scheduled crawling runs through GitHub Actions: a free structured lane daily and an Austria-only,
Gemini-only bounded lane weekly. Poster images are temporary extraction inputs in `/tmp` on Vercel
and are deleted after processing; Okolo does not retain or republish source posters.

## Data sources & recrawl notes

See `briefs/mining-brief.md` for per-source quirks (which Gemeinde URLs work, which are
JS-only SPAs, how familienkarte.at pagination works). The `sources` table stores the same
registry with `works` flags — `npm run crawl` skips broken ones.
