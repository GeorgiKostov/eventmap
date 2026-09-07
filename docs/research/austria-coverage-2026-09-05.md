# Austrian coverage session — 5 September 2026

Compared missing venue hosts with all 1,935 registry entries (1,566 active Austrian sources).
Focused on family locations and the Linz, Wien, Graz, Salzburg and Innsbruck catchments; this was
a targeted gap search, not a claim of complete national coverage.

## Added and repaired

- **Vienna playgrounds:** the licensed municipal WFS returned 773 features. Kept 514 valid,
  unambiguously named playground points after excluding sports-only facilities and shared-name
  ambiguity. Imported **513 new places**, preserving the existing OSM Donauinsel playground.
  A second real crawl updated the same 513 identities without adding duplicates. These are
  evergreen places with supplied coordinates and unknown hours/prices/ages, not dated events.
- **Wissensturm / Stadtbibliothek Linz:** replaced model extraction with visible calendar parsing.
  The real crawl accepted 10 entries, including **three newly published events**: Flohmarkt zum
  Tag der Sprachen, the Banned Books Week reading, and The Librarians screening. Five official
  venue aliases put all ten currently parsed events at venue precision; six previously fell back
  to the city centre. Urfahr and Dornach/Auhof retain their own locations.
- **Existing family sources:** refreshed OÖ Familienbund (10 accepted) and Kinderfreunde Österreich
  (86 of 109 candidates accepted, three cross-source duplicates merged). The remaining Kinderfreunde
  candidates were not published by the existing date/location gates; an extraction count alone is
  not a stored-event count. No new paid extraction was enabled.
- **Vorarlberger Familienverband:** repaired its empty archive by reading linked same-publisher
  homepage/project/featured calendars. The real crawl accepted ten events; one was already over
  and expired normally, leaving **nine newly published upcoming events**. The published street
  addresses are retained, but eight resolve only to town-level coordinates; the Pfänder event
  resolves to venue precision. The adapter excludes German excursions and undated/multi-session
  programme envelopes, and preserves printed Vienna times despite incorrect winter offsets.

**Net additions: 513 places and 12 upcoming events.** Registered one new licensed source and repaired
two existing source routes; all three are `works=true` with the correct deterministic `feed_kind`.
Verification: **374 tests pass**, the **111-page build passes**, and new event ranges have no
backwards ends. Exact new-event IDs and checks are in
[the verification snapshot](austria-coverage-2026-09-05.json).

Live map checks confirmed the new playground's visible licence credit and exact coordinate-based
directions, and Repaircafé's correct Wissensturm address, start time and related events. The browser
reported no errors or horizontal overflow on the checked playground detail.

Examples:

- https://www.okolo.events/?event=100563 — Franz-Hübel-Park playground
- https://www.okolo.events/?event=100561 — Flohmarkt zum Tag der Sprachen
- https://www.okolo.events/?event=84901 — Repaircafé, now pinned to Wissensturm

## Venue activation after George’s approval

| Venue | Adapter / source URL | Evidence from bounded inspection |
|---|---|---|
| Theater des Kindes, Linz | `theater-des-kindes`; https://theater-des-kindes.at/spielplan/ | Ten first-page performances with exact occurrence URLs, dates and minimum ages; follows observed pagination. |
| Niedermair, Wien | `niedermair`; https://niedermair.at/spielplan and https://niedermair.at/kindertheater | September cabaret parser matched 27 of 27 visible rows. Separate children's programme; follows linked current month plus two months. |
| Treibhaus, Innsbruck | `treibhaus`; https://treibhaus.at/programm | 91 accepted from 92 HTML cards; offsite Congress show excluded. Three explicitly age-3+ family shows. HTML avoids the iCal feed's invented end times and incorrect shared location. |

George approved including all three with source references. Their four stable listing URLs
(including the separate Niedermair children’s programme) are now registered and crawled through
the deterministic adapters. No dated event-detail URLs were registered as recurring sources.

Activation results: **231 additional published events**: Theater des Kindes 24, Niedermair 116,
and Treibhaus 91. Niedermair’s 21 children’s dates matched existing cabaret-programme identities,
updated their family category and did not create duplicates. There are 48 family-tagged events.
All four sources are works=true with the intended feed_kind and successful crawl timestamps.
The 24 theatre dates now use the official venue point; the 207 Niedermair/Treibhaus dates retain
honest town-level pins and official addresses. No invalid date ordering or bare-root linkbacks
were found. The 13 adapter tests and registration syntax check pass; live theatre details confirm
source links, venue address and coordinate-based directions. Code remains local and unpushed.
Exact IDs and verification: [activation snapshot](austria-venues-approved-2026-09-05.json).

**Combined session additions: 513 places and 243 upcoming events.**

## Other useful gaps and blockers

- **NHM Wien, Joanneum, Salzburg Museum/Spielzeug Museum, vorarlberg museum and Spielboden:**
  inspected reuse terms require consent or limit reuse to non-commercial/private purposes.
- **ZOOM Kindermuseum:** conflicting current/legacy date information; needs a reliable session feed.
- **Kuddelmuddel:** inspected event blocks expose day/month without a reliable year.
- **Alpenzoo:** dated annual PDF exists, but current articles omit years and do not link it as a
  repeatable annual feed. Do not infer dates from publication years or copyright footers.
- **Tribüne Linz:** promising calendar, pending permission and a verified HTML extraction contract.
- **Drachengasse / Theater HEUSCHRECK:** further leads, not completed source audits; Drachengasse
  needs careful date-range/room handling, HEUSCHRECK's office is not its performance venue.
- **Linz-Termine:** a registered August editorial article is not a stable refresh URL. Review the
  official calendar route separately instead of continually adding new monthly articles.
- **Municipal place deletions/renames:** import currently refreshes/adds identified playgrounds;
  removal reconciliation remains a reviewed follow-up because existing places never expire.
- **Vorarlberg venue precision:** eight new events have honest town-level pins despite retaining
  official street addresses. Verify source coordinates or resolve those addresses before claiming
  building-level precision.

Source-by-source terms, robots, licensing and location evidence are recorded in
[the authorization decision](../decisions/2026-09-05-austria-crawl-authorization.md).

## Re-run and release status

Bürserberg is new coverage and was added to `lib/places.js`, including the `Buerserberg`
spelling. Search coordinates identify the [official tourism route's town-centre start](https://www.vorarlberg.travel/route/rundwanderweg-buerserberg/);
the population tiebreaker uses the [municipality's published 574 residents (November 2022)](https://www.buerserberg.at/).
The event pinning fallback in `lib/towns.js` is unchanged.
The rebuilt local app finds `Buerserberg` and selects “Rund um Bürserberg” in the actual map;
both spellings also pass a direct search check. The temporary test server was stopped.

Registration defaults to dry-run:

```powershell
node --env-file=.env.local scripts/register-austria-coverage-sources.mjs
node --env-file=.env.local scripts/register-austria-coverage-sources.mjs --write
npm run crawl -- --url 'https://wissensturm.linz.at/bibliothek/veranstaltungen.php' --mode structured --force
npm run crawl -- --url 'https://data.wien.gv.at/daten/geo?service=WFS&request=GetFeature&version=2.0.0&typeNames=ogdwien:SPIELPLATZPUNKTOGD&outputFormat=application/json&srsName=EPSG:4326' --mode structured
```

Production data and the approved source registry were updated. Code remains local and uncommitted;
the remote scheduled crawler needs these code changes published before it can use the new routes.
No application deployment was requested or performed.
