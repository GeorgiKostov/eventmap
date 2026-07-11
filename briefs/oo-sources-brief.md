# Brief: Upper-Austria source expansion + crawl bookkeeping + cost model (Agent 3 — Researcher/Dev)

Goal: (a) every site we ever scraped is registered and rescrapable, (b) a big expansion round of
registered sources across Upper Austria (municipalities + local pages), (c) a real cost model for
scraping at OÖ scale.

## Context
- `sources` table (lib/db.js / db/schema.sql): name, url, kind, town, works, notes, last_crawled.
- `scripts/crawl.mjs` recrawls registered sources; `data/mined/*.json` were one-off agent mining runs.
- Strategic finding: most Gemeinde sites run RiS-Kommunal or GEM2GO — URL patterns are templatable.
- Region: Linz + surroundings is the validation focus, but George wants OÖ-wide source registration.
- Hard rules: facts+linkback only, never fabricate, null for unknowns, skip undated events,
  municipal/Land OÖ/official sources only. DO NOT invent source URLs — verify each responds.

## Tasks

### 1. Bookkeeping: everything scraped is registered
- Cross-check `data/mined/*.json` + events' source_name/source_url against the `sources` table;
  register any site we mined but never registered (so `npm run crawl` covers it).
- Add a `discovered_at` and `cms` column (values: ris|gem2go|other|unknown) to sources if not present —
  keep it Supabase-portable, mirror in db/schema.sql.

### 2. OÖ expansion round
- Build the candidate list: all OÖ municipalities (438) from Wikipedia/official Land OÖ list —
  store as `data/sources-ooe.json` (name, district, website URL).
- Probe in batches (plain fetch, be polite: sequential per host, small delay): detect CMS
  (RiS-Kommunal / GEM2GO fingerprints in HTML), find the events-calendar URL pattern, mark `works`.
- Register the workable ones in `sources`. Prioritize by distance to Linz: Linz-Land, Urfahr-Umgebung,
  Linz-Stadt, Wels-Land, Steyr-Land first; far districts (Braunau etc.) can be probed but registering
  them is fine too — crawl cadence will prioritize near ones.
- Also probe the non-municipal layer for the Linz region: tourist boards (oberoesterreich.at events),
  Pfarre calendars (dioezese-linz.at structure), city pages of Wels/Steyr/Enns, libraries (bibliotheken-ooe),
  Volkshochschule OÖ. Register what works, note quirks in `sources.notes` and `briefs/mining-brief.md`.
- If time allows, run `npm run crawl` for a batch of newly registered near-Linz sources and report
  how many new events landed (needs GEMINI_API_KEY from .env.local; script loads --env-file).
  NEVER fabricate events; extraction rules per lib/extract.js.

### 3. Cost model (answer George's "how much does this scraping cost")
Write `docs/research/scraping-cost.md` with real numbers:
- Measure actual token usage from a sample of crawl extractions (log usage from lib/extract.js if
  easy, else estimate from page sizes of ~10 real sources).
- Model: full-OÖ pass (N workable sources × pages × tokens) on Gemini Flash-Lite prices (verify
  current pricing via web), Claude Haiku fallback share ~10-20%; recrawl every 2-3 days → monthly cost.
  Include Nominatim (free, cached) and the free-tier coverage.
- Give three numbers: per full OÖ pass, per month at 2-3 day cadence, per month Linz-region-only.

## Out of scope
- No poster/image scraping. No commercial APIs (oeticket/Eventbrite) — separate decision.
- Don't mine events from far-district sources yet — registering + probing is enough there.

## Success check
- `sources` table: every historic mined site registered; expansion sources registered with cms + works
  flags; `data/sources-ooe.json` committed; cost doc written with measured (not just guessed) numbers;
  `npm run crawl` still runs green on a sample; nothing fabricated.
