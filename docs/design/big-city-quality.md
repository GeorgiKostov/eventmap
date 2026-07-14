# Big-city quality concept — localization, blocked sources, family/nature supply

**Status: concept, 2026-07-14.** George's ask: (1) events in the five big-city zones (Wien, Linz,
Graz, Salzburg, Innsbruck, each +40 km) are often not precisely localized — can we do a per-event
follow-up search to find the real venue? (2) What family/kids/nature/Verein sources are we missing
(Naturfreunde etc.), including places like cafés/XXXLutz with playgrounds, and how do we classify
them? (3) How do we mark and handle robots-blocked sources (the Stuttgart case) so they stop looking
like dead sources? Numbers below are measured against the live DB (2026-07-14); source research by
two Sonnet web sweeps the same day.

---

## 1. The localization problem, measured

Published events inside the five 40 km zones (haversine against city centers):

| Zone | Events | town-precision | …of which venue text exists | …neither venue nor address |
|---|---:|---:|---:|---:|
| Wien +40 | 3,076 | 1,306 (42%) | 738 | 405 |
| Linz +40 | 2,966 | 1,862 (63%) | 1,113 | 610 |
| Graz +40 | 1,140 | 595 (52%) | 357 | 234 |
| Salzburg +40 | 1,026 | 420 (41%) | 242 | 133 |
| Innsbruck +40 | 827 | 392 (47%) | 115 | 227 |
| **Total** | **9,035** | **4,575 (51%)** | **2,565** | **1,609** |

Three structurally different sub-populations, needing three different fixes:

1. **Venue known, geocode failed (2,565 events).** The extractor already found the venue string
   ("Basilika St. Laurenz", "Bühne 2", "K&K Kammerbühne") — Nominatim/OSM just couldn't resolve it
   (POI missing in OSM, name mismatch, generic name rejected). Excluding `venue='Online'`, these
   collapse to **1,163 unique (venue, town) pairs**. This is the decisive fact: the problem is
   venue-shaped, not event-shaped. One resolution fixes every current and *future* event at that
   venue. Top offenders repeat heavily (Bühne 2 Wien ×93, Bühne 1 Wien ×82, Basilika St. Laurenz
   Enns ×29…).
2. **Nothing extracted (1,609 events).** No venue, no address. ~480 of them carry a per-event
   detail URL (GEM2GO `veranstaltung.aspx?detailonr=…` etc.) that the crawl never fetches — the
   waterfall parses listing pages only (the Wien-erleben parser is the one existing two-hop
   exception, and it proves the pattern works).
3. **Sentinel junk.** 394 events DB-wide have `venue='Online'` and sit on a town centroid — they
   shouldn't be map pins at all. Also seen: `venue='Sonstige'` (generic filler). Same
   sentinel-value class as `tasks/lessons.md` 2026-07-11.

### The fix: a cost ladder, venue-first — never per-event Google as the opener

"Search Google per event" is the intuitive design and the wrong first move: it pays per *event*
(9k× cost), results need verification anyway, and it re-pays for the same venue every week. The
ladder below does the same job at roughly 1/10th the lookups, and every rung feeds the one below
so the expensive rung stays small.

**Stage 0 — hygiene ($0, hours).**
- `venue IN ('Online','Sonstige',…)` → treat as no venue: never geocode to a town centroid, and
  exclude online events from map pins (list-only, or an "online" badge). Add the strings to a
  sentinel list next to `GENERIC_NAME_WORDS`.

**Stage 1 — venue registry (the durable asset; schema + small code, ~a day).**
A `venues` table: `(name_norm, town, country) → lat, lng, precision, resolved_via
('event'|'place'|'osm'|'detail_page'|'search'|'manual'), source_url, verified_at`.
- Seeded for free from what we already know: every event that *did* geocode to venue precision,
  and every `kind='place'` row (our 289 AT places are exactly the museums/pools/halls events
  happen at).
- `geocodeEvent()` consults the registry **before** the Nominatim waterfall; every later stage
  writes its resolution back into it. This is what converts one-off enrichment into permanent
  pipeline improvement — hard rule 7 applied to geocoding.

**Stage 2 — detail-page second hop ($0, deterministic).**
For events with `geo_precision='town'` and a per-event `source_url` detail page: re-fetch the
detail page (politeFetch, robots-checked) and parse the address/venue block. GEM2GO detail pages
have a uniform "Ort/Treffpunkt" template; many detail pages also carry JSON-LD with a `location`
the listing lacked. Implementation: `scripts/enrich-locations.mjs` batch first (backfill), then
fold into the crawl for new town-precision events (cap N detail fetches per source per run to stay
polite — the Wien-erleben `WIEN_DETAIL_CAP` precedent). Recovers addresses for a large share of
sub-population 2 and many of the 1,163 venue pairs (an address beats a venue-name search).

**Stage 3 — web search per unique venue (the actual "find it online" step, deduped).**
For (venue, town) pairs still unresolved after stages 1–2 — order of several hundred, not 9,000:
- Ask a search-grounded model (routed through `lib/extract.js` per hard rule 2 — Gemini with
  Google-Search grounding, or the Grok CLI's built-in web search at $0 on subscription) exactly one
  question: *"What is the street address of {venue} in {town}, Austria? Answer null if not
  findable."*
- **Never accept model coordinates.** The model returns an address *string*; we geocode that
  string ourselves via the existing Nominatim path. Acceptance requires: geocode succeeds AND lands
  ≤15 km from the town (the existing POI bound). Result goes into the venue registry with
  `resolved_via='search'`; failure leaves the event honestly at town precision (approx ring). This
  keeps hard rule 5 intact — a searched-but-unverifiable venue stays approximate, never guessed.
- Cost: one-off ~1k lookups (Grok CLI $0, or Gemini grounding pennies-to-a-few-€), then a trickle
  for genuinely new venues.

**Stage 4 — per-event search (last resort, capped, probably defer).**
For sub-population 2 events with no detail page and no venue: searching "title + town" per event is
the only option, and for most (small-Gemeinde one-offs) the town centroid is honestly fine. If
built at all: cap to high-value events only (inside the 5 zones, family-tagged, upcoming, or
carrying interest taps). Not needed for the Linz test.

**Sequencing note:** the regeocode repair run already queued in `tasks/todo.md` (post-cooldown
`scripts/regeocode.mjs`) should run *after* stage 1 lands, so the sweep benefits from the registry.
The self-hosted Nominatim (docs/architecture/eu-scale-extraction.md) makes all of this faster but
none of it depends on it.

**Precision-labeling invariant:** every stage writes truthful `geo_precision`
(`venue`/`address`), and anything below that keeps the approx ring. The UI already renders
approx honestly; enrichment must never upgrade the label without upgrading the data.

---

## 2. Blocked sources — mark them, don't let them rot into 'dead'

The Stuttgart case (`Landeshauptstadt Stuttgart`, robots.txt disallows the registered RSS path):
today the crawl skips it, writes `notes='skipped: disallowed by robots.txt'`, and `zero_streak`
climbs — at 4 it auto-tiers **'dead'**, i.e. *"we may not crawl this"* becomes indistinguishable
from *"there is nothing here."* The biggest DE-scope city then silently vanishes from attention.
Same unmarked class: Büchereien/VHS Wien (named-AI-bot block), wien.info + the JS-SPA city portals
(Bregenz, Dornbirn, Eisenstadt, St. Pölten…), login-walled pages. All currently live only in
free-text `notes`.

**Concept: a `blocked_reason` column on `sources`** (`robots` | `ai_bot_policy` | `js_spa` |
`login_wall` | `tos` | null), set by the crawl when it detects the condition (robots check already
knows; a JS-SPA yields the same empty-extraction signature repeatedly) or by hand:

- **Crawl semantics:** `blocked_reason IS NOT NULL` → skipped without touching `zero_streak`/tier.
  Blocked is a *state*, not a failure streak. `works` keeps meaning "technically fetchable".
- **Re-check loop:** robots.txt and site tech change. A monthly `--recheck-blocked` pass re-tests
  the condition (one robots fetch / one HTML fetch per source, ~free) and clears the flag when the
  block is gone. Blocked sources therefore heal automatically instead of needing someone to
  remember them.
- **Visibility:** the rot detector planned in the EU-scale doc reports blocked sources as their own
  section with reason + age + suggested next step (outreach email, custom parser, headless render).
  A blocked source is an **outreach queue item**, not noise — `robots`/`tos` blocks map directly to
  the George-sends-an-email track (briefs/outreach-emails-de.md), `js_spa` maps to the
  custom-parser backlog.
- **Hard rule 7 fit:** rule 7 says a source that can't be re-crawled must be flagged rather than
  left looking scheduled. `blocked_reason` is that flag, made queryable instead of prose.

**Stuttgart resolution (2026-07-14, same day):** the investigation found stuttgart.de never
blocked us — our own `parseRobots` didn't recognize `Allow:` lines, so Cloudflare's managed robots
layout (`User-agent: * / Allow: /` immediately followed by named AI-bot `Disallow: /` blocks)
merged the AI-bot block into the `*` group and made the whole site look disallowed for everyone.
Fixed in `scripts/crawl.mjs` (Allow parsing, RFC-9309 longest-match precedence, union of multiple
same-agent groups, trailing-`*` prefixes); Stuttgart now yields **92 events via the existing
`sitepark-ical` adapter**, and Община Плевен (the only other victim) is unblocked too. The
`blocked_reason` concept above still stands for the *genuine* cases (Büchereien Wien AI-policy,
JS-SPAs, login walls) — with one added rule learned here: **a "blocked" verdict produced by our
own politeness layer must be verified against the raw robots.txt before it's treated as the
source's fault.** Note also stuttgart.de/pleven.bg publish `Content-Signal: search=yes,
ai-train=no, use=reference` — our facts-index-with-linkback use matches the permitted
search/reference signals; worth citing if the named-AI-bot policy question (George, pending)
comes up again.

---

## 3. Missing family/nature/Verein supply — what the sweep found

Full agent reports summarized; ranked by value for the five zones. Everything below obeys the
standing rules: facts + linkback, robots honored, and per hard rule 7 each source lands as a
registered, cron-reachable `sources` row (adapter in the waterfall if needed) — never a one-off
mine.

### 3.1 Event sources worth wiring (ranked)

1. **Naturfreunde / Naturfreundejugend — the big one.** Shared hidden JSON API:
   `POST https://www.naturfreunde.at/events/ng_items` (body `{}`, paginated) — **2,491 events
   nationwide, all 9 Länder, down to Ortsgruppe level, with lat/lng in the payload** (kills the
   geocode problem for this source entirely). Filterable (`portalid`, `targetgroupid` — likely
   family/kids target groups, `maincategoryid`). robots.txt allows `/events/`; **Crawl-delay: 10
   must be honored** (our parser caps at 60s, fine). Content skews outdoor-sport; filter by target
   group for the family lens. Needs a small `cms='naturfreunde'` adapter (JSON, easiest kind).
2. **Kinderfreunde** — `kinderfreunde.at/ehrenamt/veranstaltungen`: server-rendered, clean cards
   with date/time/address/**age range**, region-filterable, robots fully open. Inherently
   family-only. HTML parser (no feed), one template.
3. **FRida & freD (Grazer Kindermuseum)** — `fridaundfred.at/en/termine/`: ~170 dated kids
   entries, static HTML. Direct hit for the weak Graz zone.
4. **City libraries (non-Wien)** — Stadtbibliothek Graz (age-tagged, paginated), Stadtbibliothek
   Innsbruck ("für Kinder" filter), Wissensturm Linz (full list lives in the linked
   `vhskurs.linz.at` system — probe that), Stadtbibliothek Salzburg (hub page, dates on
   sub-pages). All robots-permissive. Wien libraries stay excluded (named-AI-bot block — §2).
5. **Nationalpark/Naturpark programs** — Donau-Auen (filterable by "Familien", robots open, but
   JS-rendered → needs its AJAX endpoint found or `blocked_reason='js_spa'`), Kalkalpen (same:
   Contao, JS calendar, endpoint unverified), Naturpark Attersee-Traunsee (static HTML, small,
   open). Gesäuse/Hohe Tauern unverified — follow-up.
6. **Alpenverein sections** — per-section static pages like
   `alpenverein.at/graz/termine/uebersicht-jugend-und-familien.php` (verified, low volume,
   robots-permissive on alpenverein.at). Worth a generic section-page parser if 2–3 more city
   sections share the template. **alpenvereinaktiv.com is a hard no** — ToS + robots block
   automated reuse (Outdooractive commercial data). Same verdict: **bergfex, komoot — closed,
   never scrape.**
7. **Familienbund Eltern-Kind-Zentren** — OÖ verified (`ooe.familienbund.at` per-event pages,
   recurring Eltern-Kind-Turnen/Spielgruppen); other Länder likely same platform (unverified).
8. **ASVÖ Familiensporttage** — one static national list/year, ~20 family sport days incl. all
   five zones; trivially parseable, low frequency. ASKÖ/SPORTUNION calendars unverified.
9. **Not viable as feeds:** Jungschar/Pfadfinder (parish/Gruppe-fragmented, no central calendar),
   Waldpädagogik (a practitioner directory, bookable-on-request, not scheduled public events),
   **Mamilade** (commercial aggregator, no reuse license — use only as a *discovery lead* to the
   primary organizer, or a partnership conversation for George; never a source).

Classification: these are all covered by the existing `family` event category + `age_min/max`;
no event-taxonomy change needed. What they need is a **source-level default-tag** mechanism —
e.g. `sources.default_categories` (Kinderfreunde → `family`, Naturfreunde-family-filter →
`family`+`sport`) so deterministic adapters don't depend on keyword guessing.

### 3.2 Places: nature/walks/family-gastro — how to find and classify

Measured OSM reality (Overpass, Austria-wide):

| Signal | Count | Verdict |
|---|---:|---|
| `relation[route=hiking]` | 11,677 | Strong backbone — primary source |
| easy paths (`sac_scale` strolling/hiking) | 26,458 ways | Good family-suitability filter |
| `kids_area=*` on gastro | 67 | Real schema, unused — enrichment only |
| `playground=yes` on restaurants | 1 | Dead — never a discovery source |
| `highchair=yes` | 113 | Enrichment only |

- **Trails (extend, don't fragment):** keep the single `trail` category; add attributes, not new
  top-level cats — `family_suitable` derived from `sac_scale` (strolling/hiking → yes), optional
  `trail_type` (`theme`/`forest_education`/`barefoot`) from a name regex
  (`Lehrpfad|Erlebnisweg|Themenweg|Naturlehrpfad|Walderlebnispfad|Barfuß`), since OSM has **no
  tag** for Themenwege. Only family-suitable trails get mined into the 5 zones; a 2,000 m
  Alpinsteig on a families map is anti-quality. Austrian OGD trail datasets (data.gv.at, CC-BY-4.0)
  are patchy per-municipality extras, not a backbone. Long routes need a representative *point*
  (trailhead/parking or start of route) — a relation is a line, our schema is a pin.
- **`family_cafe` (new category):** the "Gasthaus mit Spielplatz"/XXXLutz ask. Direct tags are
  unusable (see table) — the honest recipe is a **spatial join**: `amenity=restaurant|cafe|
  biergarten|pub` within ~80 m of a `leisure=playground`, then curate the candidate list (the join
  will catch cafés merely *near* a public playground — for a families product that's arguably
  still useful, but label it honestly, e.g. "Spielplatz nebenan" vs "eigener Spielplatz").
  Enrich with `kids_area`/`highchair`/`changing_table` where present.
- **Retail play areas (IKEA Småland, XXXLutz restaurants):** finite hand-curated seed list (~a few
  dozen AT-wide), maintained as a committed `data/mined/places-retail-play.json` re-runnable via
  `seed-places.mjs` — a bounded manual list is repeatable by construction; OSM will never carry
  this reliably.
- **`farm` (Erlebnisbauernhof — candidate, low confidence):** no clean tag; `place=farm`/
  `shop=farm` + name regex (`Erlebnisbauernhof|Schaubauernhof`) yields a curation list, not a
  category mine. Defer unless the join output looks rich.
- **Repeatability (hard rule 7):** the Overpass recipes become a committed
  `scripts/mine-places.mjs --zone <city>` (query + join + filters in code), re-runnable quarterly —
  places change slowly, so "repeatable" here means a re-runnable script + ODbL attribution, not a
  daily cron.

Taxonomy delta, kept minimal: **add `family_cafe`; extend `trail` with
`family_suitable`/`trail_type` attributes; `farm` deferred pending yield.** Everything else fits
the existing 8 place categories.

---

## 4. Zone coverage — the third leg (register/sniff before enriching)

While verifying an external analysis claiming "796 approved sources were never registered": that
claim is **stale** — all 796 policy-passing probed sources are already in `sources`
(registered 2026-07-12), and Salzburg-Land was covered by the earlier backfill (62 working sources
in its ring) even though it's absent from `probed-all-1823.json`. What *is* real:

- The national probe classified from **URLs only, never fetched HTML** — so `cms='unknown'`
  (389) means "didn't look". The 1,027 skipped entries hide real sources, concentrated exactly
  where pass rates are anomalously low: **Steiermark 12%, Kärnten 13%, Burgenland 15%** (vs NÖ
  61%, Tirol 65%).
- Per-zone working sources: Wien 127 / Linz 104 / Innsbruck 84 / Graz 63 / Salzburg 62. **Graz has
  the thinnest ring and ≥51 skipped-unsniffed candidates inside it** (an undercount — only 197 of
  1,027 skipped towns had cached centroids to measure with).
- Conclusion: the CMS-fingerprint sweep already queued in `tasks/todo.md` (extend
  `probe-sources.mjs` to sniff generator meta/asset paths) is *also* the biggest coverage lever
  for the Graz zone specifically — run it scoped to the 5 zones first, before any Stage-3 search
  spend.

---

## 5. Suggested build order (all pre-Linz-gate compatible in size)

| # | Item | Cost | Wins |
|---|---|---|---|
| 1 | Stage 0 hygiene (Online/Sonstige sentinels) | hours | kills 394 junk pins |
| 2 | Venue registry + seed from places/resolved events (§1 St.1) | ~1 day | durable; unblocks everything below |
| 3 | Detail-page second hop (§1 St.2) | ~1 day, $0 crawl cost | biggest precision jump, deterministic |
| 4 | `blocked_reason` + recheck + rot-report section (§2) | ~½ day | Stuttgart-class sources stop rotting silently |
| 5 | Naturfreunde JSON adapter + Kinderfreunde parser (§3.1) | ~1 day | 2 national family-heavy feeds, coords included |
| 6 | Zone-scoped CMS sniff of the 1,027 skipped (§4) | script run | Graz ring especially |
| 7 | Venue web-search backfill (§1 St.3, Grok CLI $0) | script run | resolves the residual ~hundreds of venue pairs |
| 8 | Trails + family_cafe Overpass mining for the 5 zones (§3.2) | ~1–2 days | new place supply, family lens |
| 9 | Libraries/FRida&freD/Naturparks parsers (§3.1) | incremental | per-city depth, Graz first |

Items needing **George's call**: adding the `family_cafe` category + its "nearby playground"
labeling honesty; deferring `farm`; Mamilade/alpenvereinaktiv = partnership conversations only;
Stage-4 per-event search (recommend: don't build now).
