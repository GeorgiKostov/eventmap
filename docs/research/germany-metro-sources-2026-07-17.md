# Germany metro source discovery — Hamburg · Köln · Frankfurt · Stuttgart (2026-07-17)

Four research agents (one per metro), every URL live-fetched and verified. This is the
registration work-list. Excluded on policy: commercial aggregators/ticketing (meinestadt,
eventfrog, rausgegangen, eventim, kindaling) and competitors — municipal/official + venue + org
sources only (hard rule 1). Scopes: `hamburg-40km`, `cologne-40km`, `frankfurt-40km`,
`stuttgart-40km` (lib/crawl-scopes.js).

**Extraction path legend:** `$0-micro` = schema.org Microdata (the muenchen.de rung) · `$0-ical` /
`$0-rss` = feed the waterfall can eat · `$0-2hop` = JS listing but detail pages carry JSON-LD in
`@graph` (visitberlin pattern) · `LLM` = plain SSR HTML, paid route · `JS` = needs headless/API ·
`BLOCKED` = WAF/403/cert.

## Verified $0 and registered this session
- **RheinMain4Family** — https://www.rheinmain4family.de/events.html — `$0-micro`, **79 events, covers
  Frankfurt+Mainz+Wiesbaden+Darmstadt**. Registered, crawl-verified 79/79. (region Frankfurt 40km)

## Verified $0 — register next (feed-URL sources; confirm how the waterfall consumes a direct feed)
| source | metro | path | note |
|---|---|---|---|
| koeln.de Events (tribe_events) | Köln | `$0-ical` | `?post_type=tribe_events&ical=1&eventDisplay=list` → 30 VEVENTs verified. Kinder/Familien section. |
| Stadt Bonn Veranstaltungskalender | Köln (Bonn) | `$0-ical`/`$0-rss` | Zielgruppen filter Familien/Kinder(0-5,5-12); iCal + RSS present; ~1,186 events. |
| Stadt Köln Veranstaltungskalender | Köln | `$0-ical` | per-event iCal `/services/ical/ical.html?urlid=…`; Kinder/Familie/Ferienprogramm categories. |
| Mainz — Kinder & Jugendliche | Frankfurt (Mainz) | `$0-rss` | Sitepark `?sp:out=rss` → 10 items verified. Official kids calendar. |
| Offenbach Veranstaltungskalender | Frankfurt (Offenbach) | `$0-rss` | Sitepark `?sp:out=rss` → 30 items verified. (Sitepark RSS pattern reusable on other Hessian towns.) |
| kulturlotse.de (Kinder theme) | Hamburg | `$0-rss` | `/rss.xml`, 150+ kids events/week, free-focused. |
| Hamburg Tourismus detail pages | Hamburg | `$0-2hop` | listing filtered by family; detail pages JSON-LD Event in `@graph` (verified). Two-hop adapter. |
| visitberlin.de/en/category/family | Berlin | `$0-2hop` | Drupal, detail-page JSON-LD `@graph` Event (verified 2026-07-17). 14 family/page. Two-hop adapter. |

## LLM-route (real events, plain SSR HTML — register, they yield their window)
- **Hamburg**: hamburg-magazin.de/kinder-wochenende (itemtype=Event but empty datetime → LLM),
  Bücherhallen Hamburg (clean `/datum/YYYYMMDD.html`), hamburg.de kids, hh-mit-kindern.de,
  Tierpark Hagenbeck, Planetarium Hamburg, NABU Hamburg, Norderstedt Tourismus.
- **Köln**: Düsseldorf Kinder&Jugend, KÄNGURU (kaenguru-online.de — the "HIMBEER Köln", category
  pages SSR ~21/page), COMEDIA Theater (100+ dated, age-rated), Hänneschen Puppenspiele (200+),
  NABU Köln, KölnTourismus + visitduesseldorf (SSR, no structured data).
- **Frankfurt**: Senckenberg (itemtype=Event but startDate datetime="" → LLM; has `?feed=rss2` worth
  testing), Zoo Frankfurt (two-hop `/event/` links), KIKAWI Wiesbaden (TYPO3 nn_calendar), Papageno
  Musiktheater, Theater Grüne Soße, NABU Frankfurt.
- **Stuttgart** (deepen — structurally poorer, NO JSON-LD/microdata anywhere): Junges Schloss
  Kindermuseum, FITZ Figurentheater, JES, SMNS Naturkunde, Stadtbibliothek Stuttgart (`zielgruppe=3`),
  Esslingen (**iCal**, the one $0 feed — grab .ics from the rendered DOM), Ludwigsburg + Böblingen
  (shared "zms" CMS — one adapter serves both).

## Needs work / blocked (record, revisit)
- **JS-rendered** (headless or find the XHR): frankfurt.de + Stadtbücherei Frankfurt (also **403 to
  non-browser UA** — send a real UA), visitfrankfurt.travel, Darmstadt (ztix backend), Wiesbaden,
  Junges Museum Frankfurt (Drupal — probe detail JSON-LD), Museen Köln, Stadtbibliothek Köln
  (easy2book), Luftballon Stuttgart (~1,000/mo — highest Stuttgart yield if the endpoint is found),
  stuttgart-tourist.de (2,042, kids filter).
- **BLOCKED**: Wilhelma Stuttgart (WAF 403 on page + robots), HIMBEER Hamburg (self-signed TLS).
- **Metro-region shared DBs** (Hamburg): mrh.events + Hamburg Tourismus DB already ingest most ring
  towns — crawling those two aggregators covers more than per-town sites.

## Cross-cutting findings
- **The Microdata rung (muenchen.de) pays off broadly**: RheinMain4Family (79, 4 cities) is the first
  new-city win. Add an itemscope/itemtype=Event signal to `structuredSignals()` so the next
  fingerprint sweep finds the rest across the ~840 LLM-route sources.
- **Sitepark `?sp:out=rss`** and **tribe_events `?ical=1`** and **Sitepark per-event iCal** are
  repeatable feed patterns worth generic support.
- **Tourism boards are NOT reliably JSON-LD in DE**: visitberlin + Hamburg Tourismus yes (detail
  `@graph`), but KölnTourismus + Düsseldorf + visitfrankfurt + stuttgart-tourist = none. Check, never
  assume.
