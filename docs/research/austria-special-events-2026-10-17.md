# Austrian special-event crawl — 17 October 2026

Scope: 17 October 2026–17 January 2027, Europe/Vienna. Focus on new seasonal discovery around Linz, with a refresh of existing approved Austrian family/venue calendars. No paid extraction calls, third-party event databases or unapproved national tourism feed.

## Inventory result

The first post-crawl comparison found 169 newly published dated occurrences, including 131 seasonal occurrences across 17 distinct title/venue/town programmes, plus 342 refreshed existing occurrences. The comparable Austrian inventory changed from 22,738 to 22,906; one prior event expired during the run. Occurrences include repeat performances and daily exhibition sessions; these are not 169 unique festivals.

151 additions are in Linz. The remaining additions come from existing municipal/family calendars elsewhere in Austria. These totals describe this bounded crawl, not complete national coverage.

## New discoveries

| Event | Verified Vienna-local date/time | Official source |
| --- | --- | --- |
| Laternen-Basteln, Zoo Linz | 6 November, 15:00–16:00 | https://www.linztermine.at/event/704056 |
| Martinsfest, Zoo Linz | 6 November, 16:00–17:30 | https://www.linztermine.at/event/717352 |
| Martinsfest am Linzer Schloss | 8 November, 14:00–18:00 | https://www.linztermine.at/event/713712 |
| Nikolaus am Domplatz | 6 December, 16:00–17:00 | https://www.linztermine.at/event/718972 |
| Der Nikolaus besucht den Zoo | 6 December, 13:00–15:00 | https://www.linztermine.at/event/702776 |
| Nikolausfahrt, Charterschiff Walross | 6 December, 17:00–18:30 | https://www.linztermine.at/event/722834 |
| Kasperl und Nikolo | Six separate performances, 4–5 December | https://www.linztermine.at/event/721393 |
| Traditionelle Krippenausstellung | 31 dated sessions, 21 November–27 December | https://www.linztermine.at/event/703056 |
| Weihnacht im Botanischen Garten | 54 dated sessions inside this audit window | https://www.linztermine.at/event/710791 |
| Ice-skating programme | 17 dated course/show sessions | https://www.linztermine.at/event/722486 and https://www.linztermine.at/event/706103 |

Source pages were fetched live. Search-engine cached copies of the zoo lantern workshop and castle Martinsfest still showed 2025; live visible headers explicitly showed the 2026 dates above. Nikolausfahrt is a boat outing, not a train ride.

## Repeatable sources and refresh

Four new search URLs on the already approved Stadt Linz publisher are registered with `works=true`, `cms=linztermine`: Laternen, Nikolaus, Eislaufen and Krippen. Each passed the normal CLI crawl:

```
npm run crawl -- --url https://www.linztermine.at/suche?query=Laternen --mode structured --force
npm run crawl -- --url https://www.linztermine.at/suche?query=Nikolaus --mode structured --force
npm run crawl -- --url https://www.linztermine.at/suche?query=Eislaufen --mode structured --force
npm run crawl -- --url https://www.linztermine.at/suche?query=Krippen --mode structured --force
```

Registration is reproducible with `scripts/register-linz-seasonal-sources.mjs`. The existing adapter checks robots, follows official detail links, and reads each visible dated occurrence. No source prose or images are copied.

Existing refreshed sources: Pasching, OÖ Familienbund, Traun, Puchenau, Ottensheim, Kinderfreunde Österreich, Niedermair's child and general programmes, and Treibhaus Innsbruck.

Two failed routes were diagnosed and repaired:
- Wissensturm's former library calendar returned 404. The observed replacement is https://wissensturm.linz.at/bibliothek/index.php; its crawl saved seven occurrences. The old source is retired and the replacement registered. The separate VHS navigation redirects to a robots-disallowed endpoint and was not used.
- Theater des Kindes replaced dated performance URLs with production links. The parser now retains the actual fetched listing as its linkback, preserves separate performances and excludes offsite guest/private/closed events. A real crawl saved 53 occurrences.

Seventeen CLI runs (including the two failed first attempts and successful repairs) performed 614 upserts. That number includes overlapping and unchanged records and occurrences beyond the audit window; it is not a new-event count.

## Quality checks and limitations

- No newly added rows lacked a source URL or map coordinates; no invalid end/start ordering or exact duplicate occurrence groups were found.
- The explicitly cancelled Krippenbauen workshop at https://www.linztermine.at/event/52025 was excluded before import. A regression test now prevents the adapter from publishing such cancelled listings.
- All newly added descriptions are null; no publisher descriptions were copied.
- The location audit corrected 71 seasonal occurrences from town-centre pins to the publisher's actual venue destinations. Four specific Linz venues and the Walding atelier are registered for subsequent geocoding. The botanical-garden parser now keeps the full visible venue name instead of the generic room label “Freiland”. Final new-row precision: **143 venue, 13 address, 13 town**; the 13 town pins remain explicitly approximate.
- Four malformed/ambiguous location records were replaced with source-verified towns; originals remain recoverable with status removed: 153418→153589 (Innsbruck), 153419→153590 (Großpetersdorf), 153383→153591 (Neuhofen an der Krems), 153393→153592 (Walding). The first three retain honest town precision because a reliable exact geocode was unavailable. Walding uses the official embedded venue marker. These replacements do not change the 169 net new-occurrence count.
- Kinderfreunde's compound-street parsing bug is fixed: Gramartstraße 7 is an address, never a town. Its sparse listing still lacks a town; the reviewed detail provided Innsbruck. The Familienbund JSON-LD locality “Neuhofen” remains ambiguous despite postcode 4501, and the Ottensheim list omits the Walding detail address. Known rows are corrected, but generic source-locality disambiguation remains follow-up work. Removed erroneous identities are not republished by ordinary upsert.
- Kinderfreunde produced 118 candidates; 33 could not be geocoded and were skipped rather than assigned invented coordinates.
- Nationalfeiertag, Herbstferien, Kürbis, Perchten, Neujahr and Fasching searches produced no dated Linz additions in the audit window. Martinsfest overlapped Laternen; Krampus overlapped Nikolaus. No empty or redundant search source was registered.
- Grusel yielded an already covered Halloween party. Ice-skating and lantern events remain normal map/category discoveries; this crawl does not introduce new filter types.
- The national Österreich Werbung download and restricted publishers remain excluded under the previously recorded access decisions.
- Data is live in the shared database; crawler code changes are included in the subsequently requested main publishing batch.

Verification: **40 focused adapter/crawl tests pass**. Live public search returned the new castle Martinsfest (153399) and Nikolaus am Domplatz (153403). Production map requests for 6 December returned the zoo, castle, Domplatz and Walross events with verified dates and venue coordinates; direct API checks confirmed all four location replacements and repaired botanical-garden/Kuddelmuddel/Mariendom points. The Martinsfest event page returned HTTP 200. All four new Linz searches and the repaired library/theatre sources are working, active and have successful deterministic feed routes. No application deployment was needed for the database additions. George subsequently requested publishing all completed work to main; application deployment remains separate.
