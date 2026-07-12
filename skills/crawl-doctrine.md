# Crawl Doctrine — the standard every crawl must follow

Canonical rules for **any** event-mining run in this repo — automated (`scripts/crawl.mjs`), agentic
(`/crawl-bg` via Grok), or manual. Country-agnostic. If a crawl doesn't follow these, its output is
not trusted and does not get seeded. This encodes the hard rules from `CLAUDE.md` plus what we
learned on the AT/BG runs; the per-run brief only adds sources + scope, never overrides these.

## The engine (how a crawl is run)

- **Agentic/manual crawls run through Grok Build on the SuperGrok subscription** (`grok -m grok-build`,
  OAuth entitlement) — **never** the metered xAI developer API, and **never** via `/hermes` (that's
  GLM-through-OpenRouter, a paid-API path reserved for second-opinion *review*, not crawling).
- **Automated crawls** go through `scripts/crawl.mjs` → `lib/extract.js`. No model/provider
  hardcoding in feature code — route by cost/quality in `lib/extract.js` only.

## The rules (non-negotiable)

1. **Never fabricate.** Unknown field → `null`. No reliable date → **skip the event**. Never emit a
   placeholder URL, an example id (e.g. `/12345`), a bare domain root as a `source_url`, or a guessed
   date/time. A wrong event on the map destroys trust faster than a missing one.
2. **Facts + linkback, never copy.** Index title/date/place only. Write `description_short` yourself
   — one short sentence **in the source's own language** — never paste source prose (EU database
   right / UrhG §76c).
3. **Locale verbatim.** All human-readable text — including `title`, `venue`, `address_text`,
   `town`, `oblast`, `description_short`, and `source_name` — stays in the source's original language
   and script (Bulgarian Cyrillic for BG, German for AT). Never transliterate or translate; a brand
   like "Visit Sofia" is written "Визит София".
4. **Every event carries the exact `source_url` it was seen on** — the detail/listing page actually
   fetched, not the site root.
5. **Times are local wall-clock as printed on the source**, stored as plain strings (`date_start:
   "YYYY-MM-DD"`, `time_start: "HH:MM"` or `null`). No timezone conversion (BG source = Europe/Sofia,
   AT = Europe/Vienna; both stored as bare local strings).
6. **Official sources only** — municipal / Land / official-tourism / user-submitted. No aggregators,
   no scraping copyrighted third-party databases.
7. **Honest small result beats a padded one.** A JS-only SPA `curl` can't render → record it in
   `failed_urls` with a note, don't guess its events.

## Output shape (seed-compatible — enforced)

`scripts/seed.mjs` reads `data.source_registry` and `data.events`, so every mined file MUST be an
**object** (a bare array is silently ignored → 0 seeded). Write to `data/mined/<name>-<date>.json`:

```json
{
  "source_registry": [
    { "name": "string", "url": "string", "kind": "crawl", "town": "string", "works": true, "notes": "string|null" }
  ],
  "failed_urls": ["url that returned nothing usable / was blocked / JS-only"],
  "events": [
    { "title", "description_short", "date_start", "time_start", "date_end", "time_end",
      "venue", "address_text", "town", "oblast",
      "categories": ["family|festival|market|music|culture|food|sport|workshop"],
      "is_free", "age_min", "age_max", "indoor",
      "lat", "lng",
      "source_url", "source_name", "country" }
  ]
}
```

Field names that `seed.mjs` requires: `description_short` (not `description`), `address_text` (not
`address`). Set `country` on every event (`"BG"`, `"AT"`, …). Categories outside the allowed set are
dropped to `other`.

**Location extraction.** Always fill `address_text` as precisely as the source allows (venue +
street + number + town) so the geocoder can place it. If — and only if — the source page exposes real
coordinates (a map embed, JSON-LD `geo`, `<meta>` lat/lng), copy them into numeric `lat`/`lng`;
`seed.mjs` trusts those over geocoding (`geo_precision: 'venue'`). Never invent or approximate
coordinates — omit them (`null`) and let the address geocode.

## Validate before seeding (never trust output blindly)

- File parses and is the `{ source_registry, events }` object shape.
- Every event: real `date_start` (`^\d{4}-\d{2}-\d{2}$`), non-placeholder `source_url`, correct
  `country`, `town` present in the country catalog (`data/catalog/municipalities-<cc>.json`).
- Spot-check 2–3 events: fetch the `source_url` and confirm the title/date are really on that page.
  Drop anything you can't confirm; report how many were dropped and why.
- Confirm all human text is in the correct language/script.
- Report kept-event counts per oblast/region and the failed-source list.

## Ingest (only after validation; show George the commands, don't auto-bulk-insert)

```bash
node --env-file=.env.local scripts/register-probed.mjs --file data/catalog/probed-<cc>.json   # add --write to commit
npm run seed   # reads ALL data/mined/*.json; events tagged by their own country field
```
