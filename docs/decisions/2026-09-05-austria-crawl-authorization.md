# 2026-09-05 — Austrian coverage crawl authorization

Scope: missing official venue calendars and useful family locations, requested by George.
Existing records are compared before registration; no third-party calendar is an ingestion source.

## Vienna playground open data

The City of Vienna's **Spielplätze Standorte Wien** dataset explicitly licenses its distributions
under CC BY 4.0. Its open-data terms permit commercial redistribution and adaptation with the credit
`Datenquelle: Stadt Wien – data.wien.gv.at`. The licensed municipal dataset is the authorization
basis, including database reuse; robots permission alone is not the basis.

Evidence checked before downloading features:

- Dataset and distribution licence: https://www.data.gv.at/katalog/dataset/bd8b518b-d812-46f9-b367-4c1b660cfc99
- Terms: https://digitales.wien.gv.at/ogd-nutzungsbedingungen/
- Licence: https://creativecommons.org/licenses/by/4.0/
- Robots: https://data.wien.gv.at/robots.txt — HTTP 404, no path exclusion.
- Official API metadata: https://data.wien.gv.at/daten/geo?service=WFS&request=GetCapabilities&version=2.0.0
  advertises `ogdwien:SPIELPLATZPUNKTOGD`. The service-wide metadata still names CC BY 3.0 AT;
  the more specific dataset distribution and current municipal terms name CC BY 4.0.

Use the published WFS, retain source coordinates and factual place fields, and include the named
credit, licence URI and an indication of normalized/selected fields. Opening times, fees and ages
remain unknown unless present. Keep these as `kind=place`, never as undated events.

The map hides place descriptions, so the registry's visible `source_name` also contains the
complete attribution, the licence URI and `bearbeitet`. Each record links back to the exact WFS
response. Existing other-source place records are preserved on title/town collisions so attribution
cannot be mixed. No licence-dependent application deployment is required for this display.

## Venue research

George explicitly approved Theater des Kindes, Niedermair and Treibhaus on September 5 after
reviewing the robots/reuse distinction: “nah just include them they get referenced”. This records
his project decision to proceed with factual fields and source links; it does not claim that
linkback itself grants a publisher licence. Explicit-restriction sources remain excluded.

| Calendar | Outcome | Evidence |
|---|---|---|
| Theater des Kindes, Linz | Approved by George for facts-only indexing with exact source links. | https://theater-des-kindes.at/robots.txt allows programme paths; https://theater-des-kindes.at/impressum/ reserves content rights. https://theater-des-kindes.at/spielplan/ has explicit occurrence dates and ages, but no reuse licence found. |
| Tribüne Linz | Pending permission; no adapter yet. | https://www.tribuene-linz.at/robots.txt permits public calendar; https://www.tribuene-linz.at/impressum forbids image downloads, https://www.tribuene-linz.at/agb covers tickets. No event-data licence found. |
| Alpenzoo Innsbruck | Pending permission and reliable recurring date-year evidence; no adapter. | https://alpenzoo.at/robots.txt permits public pages; https://alpenzoo.at/impressum/ has no specific reuse grant. Current https://alpenzoo.at/veranstaltungen/ articles omit the event year; publication year alone is insufficient. |
| Niedermair Wien | Approved by George for facts-only indexing with source links. | https://niedermair.at/robots.txt permits crawling; https://niedermair.at/impressum and https://niedermair.at/agb have no programme-reuse prohibition. https://niedermair.at/presse invites reporting and offers monthly programmes, but that is not an explicit redistribution licence. |
| Treibhaus Innsbruck | Approved by George for facts-only indexing with source links. | https://treibhaus.at/robots.txt permits programme; https://treibhaus.at/kontakt and https://treibhaus.at/datenschutz checked. Public https://treibhaus.at/programm.ics is a subscription export, but no explicit redistribution licence found. |
| NHM Wien | Deferred: non-commercial redistribution permission does not clearly cover Okolo. | https://www.nhm.at/impressum_agb |
| Universalmuseum Joanneum | Deferred: public information reuse requires consent. | https://www.museum-joanneum.at/joanneum/impressum-agb |
| Salzburg Museum / Spielzeug Museum | Deferred: reuse requires consent. | https://www.salzburgmuseum.at/impressum/ |
| vorarlberg museum | Deferred: publication/reuse requires consent. | https://www.vorarlbergmuseum.at/impressum/ |
| Spielboden Dornbirn | Deferred: inclusion in online services requires written consent. | https://www.spielboden.at/kontakt/impressum |

ZOOM's current/legacy programme dates conflict; Kuddelmuddel's inspected performance markup has
day/month without a year. Both need reliable dated source evidence as well as an authorization
decision. Do not infer event years from copyright footers or copy third-party ticket databases.

## Existing library venue locations

The approved Wissensturm calendar remains the same registered URL. Its own location page,
https://wissensturm.linz.at/bibliothek/wissensturm.php, publishes the point
**48.290883, 14.288280** in the map feature and directions links. The LeWis contact page,
https://wissensturm.linz.at/lewis/kontakt.php, confirms the shared Kärntnerstraße 26 address.
Five exact room aliases covering six current events are registered with that provenance.
No source-wide building default is applied to Urfahr, Dornach/Auhof or older unrelated events.

## Existing Vorarlberger Familienverband route

The approved `https://familie.or.at/veranstaltungen/` source now emits an empty EventON archive.
Its observed navigation leads to `https://familie.or.at/` and `https://familie.or.at/vater-sein/`,
which retain static dated venue cards; the featured lecture links to
`https://familie.or.at/Veranstaltungen/vortrag-sunburn-statt-burnout/`.
These are same-publisher refresh paths, checked against `https://familie.or.at/robots.txt`, not a
new platform or third-party dataset. Individual Bikepark, Blasterspaß and Sunburn details were
spot-checked for dates, times and addresses. No headquarters location fallback is used.

## Approved theatre location

Theater des Kindes publishes an explicit Place geo point at **48.298793539307916,
14.289576450404233** in the JSON-LD of https://theater-des-kindes.at/spielplan/.
The venue registry uses this point while retaining the visible 4020 Linz address rather than
the incorrect structured postcode 4600. A real recrawl updates the 24 event pins.
Niedermair `/anfahrt` and Treibhaus `/kontakt` expose camera centres only; these were not
misrepresented as precise venue markers.
