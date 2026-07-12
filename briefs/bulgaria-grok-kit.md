# Bulgaria Grok Mining Kit

This kit defines the exact output shapes for Bulgaria event mining. All text fields must remain in original Bulgarian Cyrillic. Never transliterate or translate.

## Output Files

### 1. municipalities-bg.json
Full authoritative catalog of 265 общини.

Schema (array of objects):
```json
{
  "name": "string (official Bulgarian name)",
  "oblast": "string (one of 28 области)",
  "obshina": "string",
  "website": "string | null",
  "population": "number | null",
  "centroid_lat": "number | null",
  "centroid_lng": "number | null",
  "nsi_code": "string | null"
}
```

### 2. probed-bg.json
CMS fingerprint and confidence for ~30 sampled towns.

Schema (array of objects):
```json
{
  "name": "string",
  "oblast": "string",
  "website": "string",
  "calendar_url": "string | null",
  "cms": "string (gem2go | openagenda | typo3 | custom | wordpress | other | null)",
  "structured_data": {
    "json_ld": "boolean",
    "ical": "boolean",
    "rss_event_dates": "boolean",
    "table_pattern": "boolean"
  },
  "confidence": "high | medium | low",
  "notes": "string | null",
  "probed_at": "ISO date"
}
```

### 3. events-bg-<batch>.json (e.g. events-bg-2026-07-12.json)
Event records ready for ingest.

> **Ingest shape gotcha:** `scripts/seed.mjs` reads `data.source_registry` and `data.events`, so the
> file it seeds from must be an **object** `{ source_registry, events }` — a bare array is silently
> ignored (0 events). It also expects `description_short` (not `description`) and `address_text`
> (not `address`). The `/crawl-bg` command emits the seed-ready object shape directly; use it rather
> than hand-shaping a bare array. The per-event fields below are correct; just nest them under
> `events` and rename those two fields.

**Per-event fields** (each object inside `events`):
```json
{
  "title": "string (Bulgarian Cyrillic)",
  "date_start": "YYYY-MM-DD",
  "time_start": "HH:MM | null",
  "date_end": "YYYY-MM-DD | null",
  "time_end": "HH:MM | null",
  "venue": "string | null",
  "address": "string | null",
  "town": "string (община name)",
  "oblast": "string",
  "categories": "array<string> (family | festival | market | music | culture | food | sport | workshop) | []",
  "is_free": "boolean | null",
  "age_min": "integer | null",
  "age_max": "integer | null",
  "indoor": "boolean | null",
  "description": "string | null (short Bulgarian sentence in own words — never copy source prose)",
  "source_url": "string (required)",
  "country": "BG",
  "source_name": "string (e.g. Община Чепеларе / Visit Sofia)",
  "cms": "string | null"
}
```

## Cyrillic Example (Chepelare-style)

```json
{
  "title": "Фестивал на планинската култура „Чепеларе 2026“",
  "date_start": "2026-08-15",
  "time_start": "10:00",
  "date_end": "2026-08-17",
  "time_end": null,
  "venue": "Читалище „Родопска искра“",
  "address": "ул. „Васил Дечев“ 15",
  "town": "Чепеларе",
  "oblast": "Смолян",
  "categories": ["festival", "culture"],
  "is_free": true,
  "age_min": null,
  "age_max": null,
  "indoor": false,
  "description": "Традиционен фестивал с фолклорни изпълнения, изложби и дегустация на местни продукти.",
  "source_url": "https://visitchepelare.bg/bg/events/12345",
  "country": "BG",
  "source_name": "Visit Chepelare",
  "cms": "custom"
}
```

## Ingest Commands (after Grok returns files)

Preferred path: run `/crawl-bg` — it drives the Grok miner, validates the output, and prints the
exact ingest commands. Manual equivalent (note: these are the scripts that actually exist):

```bash
# 1. Register town sources (dry run prints counts + samples; add --write to commit)
node --env-file=.env.local scripts/register-probed.mjs --file data/catalog/probed-bg.json

# 2. Seed events — reads ALL data/mined/*.json (there is no --country/--batch flag;
#    events are tagged BG by their own country field). Requires the object shape above.
npm run seed

# 3. Verify — spot-check Bulgarian pins on the map (no dedicated verify-bg script yet)
```

**Legal note**: Facts-with-linkback posture applies (Bulgaria is EU). Re-verify terms before any public launch.