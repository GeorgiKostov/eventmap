# Source scout — Austria + Bulgaria (2026-11-16)

Six Sonnet scouts, research only (no DB writes). Each checked robots.txt per host before
recommending; terms pages were only spot-checked, so every "register-now" still needs the rule-9
terms note recorded at registration. Per-area reports with exact endpoints:
[`source-scout-2026-11-16/`](source-scout-2026-11-16/).

## Starting point (DB audit, 2026-11-16)

| | sources | working | stuck on `llm` (no refresh since AI shutdown) | upcoming events |
|---|---|---|---|---|
| AT | 1,644 | 1,556 | 553 | Wien 1,437 · Linz 1,284 · Graz 587 · Salzburg 460 · Innsbruck 295 |
| BG | 219 | 178 | **148** | **~50 nationwide** — Sofia 14, Plovdiv 3, Varna 2, Burgas 0 |

AT structured share is weakest in Steiermark (39/202), Kärnten (19/70), Burgenland (25/91);
Wien has only 19 sources. **Bulgaria's emptiness is a refresh problem, not a discovery problem:**
its sources were registered for the LLM route that the 2026-10-27 zero-paid-AI policy disabled.

## Bulgaria — big cities first

| # | Source | City | Route | Est. upcoming | Verdict |
|---|---|---|---|---|---|
| 1 | clubcheta.com (src 2501) | Sofia | two-hop; `EventSeries` JSON-LD with dated `subEvent`s — `lib/jsonld-events.js` needs `subEvent[]` support | ~230 kids occ./month | build now |
| 2 | sofiapuppet.com `programa.php?year=&month=` (src 2503) | Sofia | Windows-1251 HTML, small parser; robots permits | 36 in Nov, Dec–Jan out | build now (todo "programme empty" is stale) |
| 3 | koiraboti.com СЪБИТКО day pages | Burgas | small HTML parser; no robots.txt | 150–250 | **ask George** (civic, user-submitted listings) |
| 4 | FCC Varna homepage; Palace of Varna + vnpuppet.com ICS | Varna | HTML parser; existing `ical` (vnpuppet: crawl-delay 300) | ~66 + ICS | build / register |
| 5 | aroundyou-bg.com (src 2739), sofiaphilharmonic (src 2354), toplocentrala.bg | Sofia | JSON-LD under `WebPage.mainEntity`; `MusicEvent` (fake `Z`, treat local); microdata | ~97 / ~25 / 10–20 | thaw / register |
| 6 | info.gotoburgas.com, Opera Varna, visit.varna.bg | Burgas/Varna | twohop + label parser | 83 / ~39 / ~100 | build |
| 7 | visitruse.bg/events | Ruse | `<time datetime>` parser | 31 | build |
| 8 | EventiBG day pages `/event/DD/MM/YYYY` → JSON-LD | national | two-hop | 40–45 | rework src 2049 |
| 9 | "NK Software" municipal CMS (Haskovo, Shumen, Pleven, V. Tarnovo, Dobrich, +6) | 11 towns | one adapter | 30–60 (lists often stale) | later |

**Ask George:** sdeteto.com and sofia.plays.bg (best Sofia kids data, but terms forbid copying
without written consent); ruseonthedanube.com (104 Ruse events via tribe REST, but not municipal
and robots `ai-train=no`); koiraboti.com. **Avoid:** kultura.sofia.bg / sofia.bg (bot wall),
burgas.bg and kapana.bg (Cloudflare challenge, not bypassed), programata, NDK, cinemas, resellers.
Plovdiv stays thin (~10–25/month: Opera Plovdiv, plovdiv.bg culture list, Visit Plovdiv).
No national open feed exists still (visitbulgaria tribe feed stale since 2025-10; data.egov.bg 403).

## Austria

| # | Source | Area | Route | Verdict |
|---|---|---|---|---|
| 1 | **Gemeinde24** municipal sites serve `/llms.txt` with dated event lists | 46 frozen sources in ST/K/B alone (likely more AT-wide) | one small adapter | build now — biggest thaw |
| 2 | ooekultur.at (Schlossmuseum etc.), Perg `/kalender/` (EventON) | OÖ | two-hop JSON-LD | register now |
| 3 | Technisches Museum Wien, MAK `/programm/kalender`, Schönbrunn | Wien | JSON-LD / microdata | register now |
| 4 | steiermark.com, burgenland.info | ST, B | two-hop JSON-LD / microdata | register now |
| 5 | ~16 frozen ST/K/B sources already matching GEM2GO/JEvents/iCal; 5 `off` OÖ rows on wrong URLs (Eidenberg, Oberneukirchen, Gallneukirchen, Kremsmünster, Thalheim) | | set cms / repoint | do now |
| 6 | Theater der Jugend, Lilarum (WP Tribe REST, 118 events — needs a tribe adapter), Belvedere, Kuddelmuddel, Wels, Gmunden, Graz Kulturserver | | small adapters | next |

**Ask George:** Citiesapps towns (Bruck/Mur, Fürstenfeld, Hartberg, Wolfsberg, Feldkirchen,
Gleisdorf, Trofaiach, Bad Radkersburg) reserve TDM rights in robots — licence request to
it@citiesapps.com; Ars Electronica Center RSS (overlaps the partner idea); OÖ tourism
Deskline/Tourdata stack (detail pages robots-disallowed on oberoesterreich.at); SZENE Salzburg,
ARGEkultur, Wien Tourismus. **Avoid:** linzag.at (`Disallow: /`), vhs.at, Volksoper (AI-bot block).
St. Pölten, Wels-other and Villach found nothing usable — needs a second pass.

## Reusable adapter wins

- `subEvent[]` / `EventSeries` and `WebPage.mainEntity` support in `lib/jsonld-events.js`
  (clubcheta, aroundyou, likely more).
- A WordPress Tribe REST adapter (`/wp-json/tribe/events/v1/events`): Lilarum, Palace of Varna,
  ruseonthedanube, visitbulgaria.
- Gemeinde24 `/llms.txt` adapter.
