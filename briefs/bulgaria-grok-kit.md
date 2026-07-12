# George's run-kit: mining Bulgaria with Grok

Pipeline is now country-aware (`country` column on `events`/`sources`, Sofia timezone,
BG geocode bounds, Cyrillic-safe hashing/dedup — see the Developer-agent report for
the full diff). This is the kit for the actual mining pass, done externally with
Grok following `docs/playbooks/country-mining-playbook.md`.

## (a) Paste-ready prompt for Grok

> You are mining public event data for Bulgaria to seed a families-first local
> event-discovery map. Follow the attached playbook
> (`docs/playbooks/country-mining-playbook.md`) exactly — it's self-contained and
> covers discovery, probing, the extraction waterfall, geocoding, and dedup.
> Bulgaria specifics:
> - **Municipality universe**: Bulgaria has 265 official общини (municipalities)
>   across 28 области (districts) — get the authoritative list from NSI
>   (nsi.bg, "Administrative-territorial and territorial division of the Republic
>   of Bulgaria"). Don't substitute a scraped/community list.
> - **Sources to target**: община official sites, city/tourism portals (like
>   visitsofia.bg, visitplovdiv.com), читалища (community cultural centers —
>   Bulgaria's dense network of local culture houses, often the actual event
>   publisher for small towns), and area/oblast-level cultural calendars.
> - **CMS landscape is unknown going in** — probe ~30 towns across different
>   districts first, fingerprint what you find (HTML class names, JSON-LD,
>   .ics/RSS links, common CMS vendor patterns), and report the fingerprint
>   distribution before scaling to all 265.
> - **Politeness**: robots.txt honored, identifying User-Agent with contact info,
>   ≥1s delay per host, parallelize across hosts only — never shrink the delay.
> - **Times**: Europe/Sofia wall-clock strings, `'YYYY-MM-DDTHH:MM'` — no UTC, no
>   host-machine time.
> - **Language**: ALL text fields (title, venue, address, town, description) stay
>   in Bulgarian, Cyrillic script, exactly as published. Never transliterate,
>   never translate.
> - **Never fabricate.** Unknown field → `null`. No parseable date → skip the
>   event entirely. Every event carries its exact `source_url`.
>
> Deliver: `municipalities-bg.json` (full 265-row catalog), `probed-bg.json`
> (probe results with cms + confidence per site), and mined events as
> `events-bg-<batch>.json` (one file per district or city batch) in the event
> shape below, `country: "BG"` on every row.

## Output artifact shapes

**`municipalities-bg.json`** — see the stub at `data/catalog/municipalities-bg.json`
for the exact `_meta`/row shape (fill in all 265 `municipalities` rows, replacing
the 2 example rows).

**`probed-bg.json`** — `{ proposed: [ { name, url, region, cms, confidence, notes }, ... ] }`, mirrors `data/catalog/probed-all-1823.json`.

**`events-bg-<batch>.json`** — `{ source_registry: [...], events: [...] }`. Every
event object, exact field list (matches `EVENT_PROPS` in `lib/extract.js` plus
`country`):

```json
{
  "title": "Куклен театър за деца",
  "date_start": "2026-08-01",
  "time_start": "18:00",
  "date_end": null,
  "time_end": null,
  "venue": "Драматичен театър Пловдив",
  "address": null,
  "town": "Пловдив",
  "country": "BG",
  "categories": ["family", "culture"],
  "is_free": false,
  "age_min": 4,
  "age_max": 10,
  "indoor": true,
  "description": "Кукленo представление за най-малките зрители.",
  "source_url": "https://example.bg/events/kukleno-predstavlenie"
}
```

`source_registry` rows: `{ name, url, kind, town, works, notes, cms, region, country: "BG" }` (matches `upsertSource`'s fields in `lib/db.js`).

## (b) Ingest steps (run after George drops the files in)

See `data/mined/README-bulgaria.md` for the full command list. Short version:
1. `node --env-file=.env.local scripts/register-probed.mjs --file data/catalog/probed-bg.json` (dry run), then `--write`. **Review the CMS allowlist in that script first** — it's currently Austria-calibrated (`gem2go`/`ris`), meaningless for Bulgaria's CMS landscape.
2. `npm run seed` (picks up `data/mined/events-bg-*.json` automatically).
3. Verify **per-oblast published counts**, not just a national total — the "silent zero" failure mode (a clean run publishing 0 events for a whole region) is documented in the playbook §3h and has bitten this project once already for Austria.

## (c) Legal note

The "facts free, expression protected" posture (`docs/playbooks/country-mining-playbook.md` §1) is EU-calibrated (sui generis database right), and Bulgaria is an EU member state, so the same legal reasoning should carry over — but this has **not been independently re-verified for Bulgarian law** and should be before any public launch, not assumed by default. `robots.txt` compliance is universal regardless of jurisdiction and applies unconditionally.
