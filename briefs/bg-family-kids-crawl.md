# BG Family/Kids Crawl Brief (for Grok Build)

Self-contained brief to hand to **Grok Build on SuperGrok** (`grok -m grok-build`, $0 API) to mine
Bulgarian **kids/family events** and **family places** the municipal crawl misses. Run from the
eventmap repo root so Grok can write the output file itself. This is the family/kids companion to
`briefs/bulgaria-grok-kit.md`; the enforced rules live in `skills/crawl-doctrine.md`.

## Why this exists
Official община/tourism sites under-cover kids programming. These curated family portals carry it —
with the one field that matters most for a families-first map: **age ranges**.

## Target sites (crawl each; discover more via web_search)

| Site | What it has | Status |
|---|---|---|
| `clubcheta.com` | Kids-events calendar, ~6 cities, structured (date/time, age, venue, category) | ✅ done (99 events) — re-run to refresh |
| `sofia.plays.bg` ("София играе") | Sofia kids events **+ family places** (soft-play, museums), age bands, map | ✅ done (15 events) — go deeper; capture places too |
| `programata.bg` (Kids/Деца section, 8 cities) | Broad city culture guide, kids filter | ✅ done (10 events from accessible articles — Sofia, Plovdiv, Стара Загора; kids.programata.bg subdomain blocked by protection) |
| `roditeli.bg`, `az-deteto.bg`, детски театри (e.g. `puppet-*`, куклени театри) | Parent portals / kids theatre programmes | ⬜ discover + crawl |
| City "какво да правим с децата" listings | Per-city kids-activity roundups | ⬜ discover via web_search |

## Hard rules (from `skills/crawl-doctrine.md` — do not violate)
1. **Never fabricate.** Unknown → `null`. No reliable date → skip. No placeholder/example/root URL as
   `source_url`; never guess dates/ages/addresses.
2. **Facts + linkback, never copy.** Write `description_short` yourself (1 short **Bulgarian Cyrillic**
   sentence). Never paste source prose (esp. programata.bg).
3. **Cyrillic verbatim** for all human text incl. `source_name`.
4. Every event carries the **exact `source_url`** it was seen on (detail/listing page).
5. Times = local Sofia wall-clock as printed, plain strings. Window: **2026-07-12 → 2026-09-10**.
6. **town/oblast = the CITY the event is in** (Cyrillic, catalog form): София→`Столична`/`София-град`,
   `Пловдив`/`Пловдив`, `Варна`/`Варна`, `Бургас`/`Бургас`, `Русе`/`Русе`, `Стара Загора`, `Пловдив`, …

## Extraction — the field that matters: AGE
Whenever the site states an age range, capture it as integers:
- `за деца 3-6 г.` → `age_min: 3, age_max: 6`
- `над 5 години` → `age_min: 5, age_max: null`
- `0-3` / `бебета` → `age_min: 0, age_max: 3`
`categories`: `["family"]` plus `workshop` for ателиета/творчески, `culture` for театър, `music`, etc.

## Output shape — seed-compatible object (NOT a bare array)
`scripts/seed.mjs` reads `.source_registry` and `.events`. Write to
`data/mined/events-bg-kids-<slug>-<YYYY-MM-DD>.json`:
```json
{
  "source_registry": [{ "name": "Клубчета", "url": "https://clubcheta.com/...", "kind": "crawl",
                        "town": "Столична", "works": true, "notes": null }],
  "failed_urls": ["url (why)"],
  "events": [{
    "title": "string (Cyrillic)",
    "description_short": "string|null (own words, Cyrillic, 1 sentence)",
    "date_start": "YYYY-MM-DD", "time_start": "HH:MM|null",
    "date_end": "YYYY-MM-DD|null", "time_end": "HH:MM|null",
    "venue": "string|null", "address_text": "string|null (venue + street + city)",
    "town": "string (Cyrillic city)", "oblast": "string (Cyrillic)",
    "categories": ["family|festival|market|music|culture|food|sport|workshop"],
    "is_free": "true|false|null", "age_min": "int|null", "age_max": "int|null", "indoor": "true|false|null",
    "lat": "number|null (only if the page exposes coords)", "lng": "number|null",
    "source_url": "string (required)", "source_name": "string (Cyrillic)", "country": "BG"
  }]
}
```
Field names matter: `description_short` (not `description`), `address_text` (not `address`).

## Family PLACES (evergreen, from sofia.plays.bg / kids-venue directories)
If a source lists **evergreen family venues** (soft-play, kids museums, indoor play), output them
separately to `data/mined/places-family-<slug>-<date>.json` in the places shape
(`{ "_meta": {...}, "places": [ { "kind": "place", "title", "description", "address", "town",
"lat", "lng", "geo_precision": "venue", "categories": ["indoor_play|museum|zoo|pool|park|playground"],
"is_free", "indoor", "opening_hours": null, "seasonal": null, "src_kind": "crawl",
"source_name", "source_url", "country": "BG" } ] }`). No dates on places. (OSM covers the rest —
see `scripts/mine-bg-places.mjs`.)

## How to run (per target)
```bash
cd /Users/georgikostov/Repositories/eventmap && \
  grok -m grok-build --always-approve --max-turns 100 -p "$(cat this-brief-plus-the-one-site.txt)"
```
Then ingest: `node scripts/seed-places.mjs --write` (places) and `npm run seed` (events) — dry-run /
spot-check `source_url`s live first per the doctrine.
