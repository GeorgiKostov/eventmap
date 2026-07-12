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

**Exact shape** (array of objects):
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

```bash
# 1. Review CMS allowlist in scripts/crawl.mjs or equivalent
# 2. Register sources (review before bulk insert)
node scripts/register-sources.js data/catalog/municipalities-bg.json

# 3. Seed events
npm run seed -- --country=BG --batch=events-bg-2026-07-12.json

# 4. Verify
node scripts/verify-bg.js --per-oblast
```

**Legal note**: Facts-with-linkback posture applies (Bulgaria is EU). Re-verify terms before any public launch.