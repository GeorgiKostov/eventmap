# Austrian seasonal coverage — 16 October 2026

Scope: 16 October 2026 through 31 January 2027, Europe/Vienna. This is a measured refresh of existing official calendars plus five seasonal searches on the previously approved municipal Linz-Termine publisher. It is not a complete list of Austria’s markets.

## Result

The comparable seasonal-title inventory increased from **2,577 to 2,735 published Austrian occurrences**: **184 newly published rows**, **81 existing rows refreshed**, and **26 misleading or superseded Enns rows removed from publication**. New rows are 173 in Linz and 11 in Enns. These are dated occurrences, not 184 unique markets. The existing national inventory was not individually reverified.

The inventory comparison uses the same broad title test before and after: Weihnacht, Christkind, Advent, Halloween, Silvester, Neujahr, Krampus, Perchten or Nikolaus. It includes eight “Halloween im Adventure-Golf” rows; the application correctly excludes “adventure” from Christmas. Application filters also recognize English names and narrower month bounds, so their counts differ: **514 Christmas-market occurrences, 1,726 Christmas events, 220 Halloween events and 200 New Year events**.

| State, mapped by unambiguous municipality name | Before | After |
|---|---:|---:|
| Burgenland | 153 | 153 |
| Kärnten | 53 | 53 |
| Niederösterreich | 937 | 937 |
| Oberösterreich | 452 | 610 |
| Salzburg | 93 | 93 |
| Steiermark | 500 | 500 |
| Tirol | 133 | 133 |
| Vorarlberg | 43 | 43 |
| Wien | 26 | 26 |
| Unmapped / ambiguous town name | 187 | 187 |

All nine states have existing inventory; this proves presence, not complete or equally verified coverage. Ambiguous town names are not assigned a guessed state. No new towns were introduced, so no search-gazetteer expansion was necessary.

New seasonal rows have zero end/start ordering violations and zero missing linkbacks. Location precision: 135 venue, 14 address, 35 town-level. Town-level pins remain approximate.

## Repeatable refresh

All 18 registered-source runs used `npm run crawl -- --url <URL> --mode structured --force`, with no paid model calls. Sixteen succeeded, one returned HTTP 404 and one deferred without a deterministic extraction route. **1,224 total event upserts** include nonseasonal events and overlapping-source updates; they are not new-event counts.

| Source | Result |
|---|---|
| [Wallern im Burgenland](https://www.marktgemeinde-wallern-im-burgenland.at/Aktuelles/Veranstaltungen) | 10 upserts |
| [Dellach im Drautal](https://www.dellach-drau.gv.at/de/Dellach_er_leben/Veranstaltungen) | 25 upserts |
| [Judenau-Baumgarten](https://www.judenau-baumgarten.at/Leben_Freizeit/Essen_Trinken_Events/Veranstaltungen) | 99 upserts |
| [Schönbühel-Aggsbach](https://www.schoenbuehel.at/Buergerservice/Aktuelles/Veranstaltungen) | 12 upserts |
| [Garsten](https://www.garsten.at/Buergerservice/Aktuelles/Veranstaltungen) | HTTP 404; existing dead source remains quarantined |
| [Kematen an der Krems](https://www.kematen.at/UNSER_KEMATEN/Veranstaltungen) | 67 upserts |
| [Dorfbeuern](https://www.dorfbeuern.salzburg.at/Unser_Ort/Dorfleben/Veranstaltungen) | 25 upserts |
| [Eisenerz](https://www.eisenerz.at/system/web/veranstaltung.aspx?menuonr=225067878) | 25 upserts |
| [Mils bei Imst](https://www.mils-imst.gv.at/Unser_Mils/Veranstaltungen) | 14 upserts |
| [Doren](https://www.doren.at/Doren_er_leben/Veranstaltungen) | 25 upserts |
| [Wien erleben](https://www.wien.gv.at/veranstaltungen/) | Deferred: no deterministic markup; no paid fallback |
| [Steyr](https://www.steyr.at/veranstaltungen) | 10 upserts |
| [Enns](https://erlebe.enns.at/sitemap-events.xml) | 583 upserts from 167 detail pages |
| [Linz-Termine: Weihnachtsmarkt](https://www.linztermine.at/suche?query=Weihnachtsmarkt) | 49 upserts |
| [Linz-Termine: Christkindlmarkt](https://www.linztermine.at/suche?query=Christkindlmarkt) | 47 upserts |
| [Linz-Termine: Advent](https://www.linztermine.at/suche?query=Advent) | 83 upserts |
| [Linz-Termine: Halloween](https://www.linztermine.at/suche?query=Halloween) | 76 upserts |
| [Linz-Termine: Silvester](https://www.linztermine.at/suche?query=Silvester) | 74 upserts |

Enns now follows its sitemap to same-publisher detail data and requires explicit local opening-hour dates. The sitemap itself supplies no occurrence dates. The adapter retains publisher coordinates when supplied. Linz-Termine follows the visible occurrence list and the read-only “Mehr Termine anzeigen” control. Its JSON-LD can span 2022–2026 and must not become one continuous event. Both adapters are exclusive deterministic routes. The five seasonal Linz searches are registered with `works=true`; the existing monthly-news source was not relabelled.

[Volksgarten](https://www.linztermine.at/event/702661) and [Hauptplatz](https://www.linztermine.at/event/702662) now each have **34 daily occurrences, 21 November–24 December 2026**. First-day hours are 10:00–21:00; Christmas Eve is explicitly 09:00–16:00 in the occurrence list. First-row IDs are **153079** and **153160**. Each daily session retains its exact start/end rather than claiming continuous opening throughout the season. Spot-checks also covered Wallern Halloween/Weihnachtsdorf, Dellach Adventfensterln/Krampus and Enns detail dates.

## Recoverable Enns corrections

26 old sitemap-derived rows were set to `status=removed`, not deleted. Most had false dates or times; three were date-only duplicates of verified timed occurrences. Fuzzy dedup had retained those older date-only rows, so their verified replacements were explicitly written through the existing data layer before the old rows were removed.

| Replacement ID | Event / date and Vienna time | Official detail |
|---|---|---|
| 152643 | Happy Halloween, 31 October 16:00–17:00 | [Museum Lauriacum](https://erlebe.enns.at/events/happy-halloween-programm-im-museum-lauriacum/16453374) |
| 153264 | Magnificat, 27 November 19:30–21:30 | [Chorkonzert](https://erlebe.enns.at/events/magnificat-chorkonzert-zum-1-advent/16418784) |
| 153059 | Weihnachtsfest des Karl-Bertil Johnsson, 29 November 14:59–17:00 | [Kino](https://erlebe.enns.at/events/zuckerfabrik-kino-das-wundersame-weihnachtsfest-des-karl-bertil-johnsson/16446492) |
| 153265 | Adventzeit, 28 November 19:30–22:00 | [First performance](https://erlebe.enns.at/events/adventzeit-winter-und-andere-geschichten/16417971) |
| 153267 | Adventzeit, 29 November 17:00–19:30 | [Second performance](https://erlebe.enns.at/events/adventzeit-winter-und-andere-geschichten/16417981) |
| 153070 | Ennser Adventmarkt, 5 December 10:00–19:00 | [Saturday](https://erlebe.enns.at/events/ennser-adventmarkt-2026/16437457) |
| 153071 | Ennser Adventmarkt, 6 December 10:00–18:00 | [Sunday](https://erlebe.enns.at/events/ennser-adventmarkt-2026/16437460) |

The Kino publisher explicitly supplies the unusual 14:59 start; it was retained as a publisher claim rather than rounded or invented.

Removed IDs, for recovery/audit: `137498`, `129059`, `119429`, `119445`, `119432`, `119438`, `137577`, `137588`, `137589`, `137600`, `137602`, `93014`, `55310`, `55314`, `93024`, `129181`, `93004`, `93026`, `32270`, `32272`, `43571`, `67919`, `129198`, `102619`, `102610`, `102602`.

## National feed authorization and remaining gaps

Before any bulk download, [Österreich Werbung’s public API page](https://api.austria.info/) was checked. It explicitly publishes a weekly Veranstaltungen JSON download under **CC BY 4.0**, attribution **CC-BY-4.0: Österreich Werbung**, with a public download token. Its published download is hosted at `oew.tourdata.at/api/dataspace/GetJsonProxy.php`. This licence permits redistribution/adaptation with credit, licence link and change indication; ordinary editorial pages do not inherit it.

However, [oew.tourdata.at/robots.txt](https://oew.tourdata.at/robots.txt) returned HTTP 200 with `User-agent: *` and `Disallow: /`. The public download invitation conflicts with the repository’s unconditional robots rule. **No event dump was fetched and no national adapter was added.** A narrow user-approved exception for this published licensed download is pending. `api.austria.info/robots.txt` returned a sitemap URL without exclusions; `www.austria.info/robots.txt` allows the public inspiration pages but excludes internal/config/search paths. [Editorial terms](https://www.austria.info/de-at/impressum-und-agbs/) do not supply a blanket event-database reuse grant.

[Austria.info’s 2026 Christmas-market guide](https://www.austria.info/de-at/inspiration/weihnachtsmaerkte/) was used for gap discovery only. It names markets across all nine states, including weekend-only schedules that must not be flattened into continuous multiweek events. Major-city market coverage outside Linz remains incomplete: the baseline had only two Vienna market-title rows. Existing small-town inventory must not be advertised as “all Christmas markets.” Linz Tourismus remains excluded from automated ingestion under its earlier express terms restriction. Garsten’s registered URL needs repair; Vienna’s current calendar needs a deterministic markup repair or approved alternative.

Seven new adapter tests pass, together with the crawl integrity/run regression checks. The integrated application passed its production build and all 406 tests, including HTTP checks, plus desktop/mobile browser verification.

At George's subsequent “Push live” request, release `8879e14` was pushed and deployed on 2026-10-16 as Vercel `dpl_XjeYdUNK1foFBVsMW7xYcViZaWLG` to [www.okolo.events](https://www.okolo.events). The Vercel production build passed (111 pages). Live browser and API checks verified all four theme totals (514 / 1,726 / 220 / 200), matching Austrian rows, cluster/pin parity, and the corrected Enns, Volksgarten and Hauptplatz dates. Removed Enns page `119445` returns 404. No browser console errors were observed. This release does not resolve or override the national-feed authorization gap above.
