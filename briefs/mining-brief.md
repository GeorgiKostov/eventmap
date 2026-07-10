# Mining Brief — Austrian municipal event sources (Raum Linz)

Used to dispatch data-mining agents on 2026-07-10. Re-use for future manual mining runs;
the automated equivalent is `npm run crawl` against the `sources` table.

## Goal
Extract REAL upcoming events (next ~8 weeks) from official sources around Linz/Asten:
city calendar (linztermine.at), Gemeinde websites (mostly RiS-Kommunal/GEM2GO CMS),
and familienkarte.at (Land OÖ). Facts only, with source links.

## Rules
1. NEVER invent an event, date, time, or venue. Unknown field → null. Unclear date → skip.
2. Extract facts; write `description_short` in own words (German, 1 sentence). Never copy site prose
   (EU database right / UrhG §76c — we index facts with linkback, we do not copy databases).
3. Every event carries the specific `source_url` it was actually seen on.
4. Record which URLs work/fail in `source_registry` with structure notes for the recrawler.
5. Honest small result beats padded result.

## Output schema (data/mined/*.json)
```json
{
  "source_registry": [{ "name", "url", "kind", "town", "works", "notes" }],
  "failed_urls": ["..."],
  "events": [{
    "title", "description_short",
    "date_start": "YYYY-MM-DD", "time_start": "HH:MM|null",
    "date_end": null, "time_end": null,
    "venue", "address_text", "town",
    "categories": ["family|festival|market|music|culture|food|sport|workshop"],
    "is_free": true, "age_min": null, "age_max": null, "indoor": null,
    "source_url", "source_name"
  }]
}
```

## Learned source quirks (2026-07-10 run)
- linztermine.at: use monthly /linz-erleben/ pages; next month may 404 until published.
- enns.at: calendar outsourced to erlebe.enns.at (React SPA) — crawl /sitemap-events.xml,
  detail pages embed server-rendered JSON.
- st-florian.at: JS-only SPA, statically unfetchable → fallback tips.at (Linz-Land).
- traun.at + pucking.at: friendly URLs are JS shells; use /system/web/veranstaltung.aspx
  or the Aktuelles subpages.
- ansfelden.at: TLS chain issue on direct fetch.
- familienkarte.at: static fetch returns only today's events; date/district filters need
  form submit (params date_from/date_to/districts_key; Linz Stadt=7, Linz Land=8,
  Urfahr-Umgebung=15; pagination /limitstart.N.html).
