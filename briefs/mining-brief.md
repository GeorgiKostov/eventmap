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

## OÖ expansion round (2026-07-11, Agent 3 — see `data/sources-ooe.json`, `docs/research/scraping-cost.md`)
- **False-positive trap:** probing for a calendar link by matching `veranstalt|termine` in URLs/hrefs
  catches administrative "Termine" pages too — Müll-/Abfalltermine (waste collection), Sitzungstermine
  (council sessions), Bauverhandlungstermine (building hearings), Förderrichtlinien (funding rules).
  37 of the first ~90 auto-registered sources this round were this trap. Fix: match `veranstalt` only
  (not bare `termine`), and verify the resolved page actually has future-dated content + a sane
  `<title>` (reject titles containing förder/sitzung/amtliche/müll/abfall/bauverhandlung/eintragen).
  Any future bulk-probing pass should build this validation in from the start, not bolt it on after.
- **CMS reality check:** live fingerprinting (fetch + grep for `gem2go`/`ris-kommunal` in HTML) often
  disagrees with earlier hand-written notes — e.g. Asten/Ottensheim/Pucking/Steyregg/Traun were noted
  as "RiS-Kommunal" from the 2026-07-10 mining run but fingerprint as GEM2GO live. GEM2GO appears to be
  layered over a RiS-Kommunal backend on many sites (aspx URLs still work underneath). Trust a live
  fetch over notes when they disagree; ~74/97 working sources are GEM2GO, ~10 RiS, rest custom/unknown.
- **Non-municipal layer:** oberoesterreich.at (OÖ tourism) base `/veranstaltungen.html` is a JS filter
  shell with no server-rendered dates — use the monthly `/veranstaltungen/top-events-im-<monat>-in-
  oberoesterreich.html` pages instead (same pattern as linztermine.at). Wels (`wels.gv.at/veranstaltungen`)
  and Steyr (`steyr.at/veranstaltungen`, GEM2GO) city pages both work. OÖ Landesbibliothek
  (`landesbibliothek.at/veranstaltungen`) works, small volume. Landesverband OÖ Bibliotheken
  (`lvooe.bvoe.at/veranstaltungen`) has the right structure but was empty on 2026-07-11 — registered
  `works=false`, worth rechecking. Dioezese Linz Pfarre calendars work (`/pfarre/<nr>/kalender`,
  found via `/pfarren` directory) but content is almost entirely liturgical (Wortgottesfeier/Messe) —
  only one sample (Ansfelden, nr. 4020) registered; scaling to more parishes is a product-fit question
  (noise, no matching category) to raise with George before doing, not a data-integrity blocker.
  Volkshochschule OÖ (`vhsooe.at`) is a paid course catalog, not an event calendar — not registered.
- **Pipeline bugs found and fixed while verifying the above (both pre-existing, not introduced this
  round, but silently zeroed every crawl until fixed):**
  1. `lib/extract.js` `callGeminiText` set `responseMimeType: 'application/json'` but never told
     Gemini the required per-event key names — it free-formed `date`/`location` instead of the
     `date_start`/`venue`/`address`/`categories`/... shape `crawl.mjs` expects, so every extracted
     event failed the `!raw.title || !raw.date_start` guard and got silently dropped. Fixed by adding
     an explicit key-list hint to the system instruction (mirrors the existing image-scan keyHint).
  2. `lib/geocode.js` `geocodeEvent` only fell back to a hardcoded 17-town list (`lib/towns.js`,
     scoped to the original mining-run towns) when address/venue geocoding failed — any event whose
     town wasn't in that list got dropped even with a perfectly good town name. Fixed by adding a
     cached Nominatim town-level lookup as the final rung of the ladder, so newly registered OÖ towns
     resolve without needing manual centroid entries. `lib/geocode.js`'s `inRegion` bounds check still
     correctly rejects far-district towns (e.g. Andorf, Bad Ischl) — by design, matches the Linz-only
     validation-phase scope; those sources are registered (for the future OÖ-wide cost model) but
     won't place pins outside the region today.
