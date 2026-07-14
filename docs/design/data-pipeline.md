# Data pipeline — source of truth

What actually happens, end to end, from "a Gemeinde publishes an event" to "a pin renders on the
map" — and every side door into the `events` table. Written from the code as it stands, not from
intent. Last full pass: **2026-07-14**. Companion docs: [`docs/design/design-doc.md`](design-doc.md) (product bible),
[`docs/decisions/2026-07-11-crawl-scaling-and-legal.md`](../decisions/2026-07-11-crawl-scaling-and-legal.md)
(why this architecture, legal posture), [`docs/decisions/2026-07-11-middle-layer-strategy.md`](../decisions/2026-07-11-middle-layer-strategy.md)
(where supply is going long-term), [`docs/research/scraping-cost.md`](../research/scraping-cost.md)
(measured token cost).

## 1. Overview

```
 ONE-OFF (bootstrap)                       RECURRING (steady state, near-$0)
 ────────────────────                      ────────────────────────────────
 Agent mining                              sources table (region, cms, tier,
  → data/mined/*.json                        page_hash, feed_kind, crawl stats)
      │                                            │
      │ scripts/seed.mjs (events)                  │  npm run crawl
      │ scripts/seed-places.mjs (places)            ▼
      ▼                                    robots.txt check + politeFetch
 events / sources tables                    (UmkreisBot UA, ≥1s/host, up to
                                             6 hosts in parallel — never the
                                             same host twice at once)
                                                    │
                                             page_hash unchanged? ──yes──▶ skip (tier: 'unchanged')
                                                    │ no
                                                    ▼
                                   structured waterfall (deterministic, $0):
                                   JSON-LD → iCal → Sitepark / GEM2GO / DVV parsers (cms-gated)
                                   → RSS/Atom
                                                    │ nothing matched
                                                    ▼
                                   LLM fallback (lib/extract.js):
                                   Gemini Flash-Lite → (Grok CLI if
                                   EXTRACT_PROVIDER=grok) → Claude
                                                    │
                                                    ▼
                                   geocodeEvent() — lib/geocode.js
                                   venues REGISTRY → POI-name → address →
                                   venue+town → source default_venue →
                                   town centroid (NO jitter)
                                   — every precise rung bounded to its town —
                                                    │
                                                    ▼
                                   upsertEvent() — content_hash exact
                                   dedup (lib/db.js) → events table
                                                    │
                                        (periodic, manual)
                                        scripts/merge-dups.mjs — fuzzy
                                        cross-source dedup/merge
                                                    │
                                        expireFinished() — Vienna
                                        wall-clock, runs on every read
                                        and at the end of each crawl

 LOCATION ENRICHMENT (§5) — shrinks the town-only bucket; writes back to `venues`,
 so every resolution improves all FUTURE crawls, not just the rows it touched
 ───────────────────────────────────────────────────────────────────────────────
 enrich-locations.mjs   registry → detail-page 2nd hop (JSON-LD / per-event iCal /
                        detail table) → [--llm] model reads the fetched page
 venue-search.mjs       per UNIQUE (venue,town) pair, not per event: web-search
                        model returns an ADDRESS STRING → we geocode it ourselves
                        → town guard vetoes it. Never model coordinates.

 SIDE ENTRANCES (same geocode + dedup machinery, different front door)
 ───────────────────────────────────────────────────────────────────────
 Poster scan     → app/api/scan/route.js  → extractFromImage() → user
                    confirms in UI → app/api/events/route.js POST
 User add-event/
 add-place       → app/api/events/route.js POST (kind=event|place)
 Mined places    → data/mined/*.json {places:[...]}  (Overpass-sourced)
                    → scripts/seed-places.mjs
```

Every arrow into `events` ends up geocoded (`lib/geocode.js`) and passes through the same
content-hash exact-dedup in `upsertEvent()`; the crawl and the two API POST routes additionally run
the fuzzy dedup guard (`lib/dedup.js`) before writing. See §6.

## 2. Source discovery & registry

**Doctrine (from the crawl-scaling decision doc): agents discover and verify once, the pipeline
recrawls forever.** Claude Code subagents (Sonnet/Haiku, covered by the Claude subscription — cheap
per session, expensive per page) are the right tool for *finding and classifying* a source: probing
a municipality's site, fingerprinting its CMS, confirming it actually has a future-dated event
calendar (not a waste-collection "Termine" page — the false-positive trap documented in
[`briefs/mining-brief.md`](../../briefs/mining-brief.md)). Once a source is registered, `scripts/crawl.mjs`
owns it forever at near-zero cost. **Agents must never become the recurring crawler** — that is the
expensive, artisanal, non-repeatable path the whole architecture exists to avoid.

### `sources` table fields (`db/schema.sql`, `lib/db.js`)

| Field | Meaning |
|---|---|
| `name`, `url` (unique), `kind` | Registry identity. `kind` here is the *source* kind (`municipal` default) — unrelated to `events.kind` (`event`\|`place`); same column name, different meaning, worth not confusing. |
| `town`, `region` | `town` = Gemeinde; `region` is normally the Bundesland (`Oberösterreich`\|`Salzburg`\|…), with an exact named-scope token such as `Stuttgart 40km` while a country rollout is deliberately radius-limited. |
| `works` | false = known-dead/unfetchable (JS-only SPA, TLS issue) — excluded from crawl candidates entirely. |
| `notes` | Free text — quirks, why `works=false`, robots-block, etc. |
| `cms` | `ris`\|`gem2go`\|`dvv`\|`sitepark-ical`\|`other`\|`unknown`\|null. Gates CMS-specific parsers in the waterfall. |
| `discovered_at` | When first registered. |
| `page_hash` | sha256 of the stripped page text from the last crawl — change-detection. |
| `feed_kind` | Which route won the *last* crawl: `jsonld`\|`ical`\|`gem2go`\|`dvv`\|`rss`\|`llm`\|`siteswift`\|`kalkalpen`\|`naturfreunde`\|`kinderfreunde`\|null. |
| `crawl_count`, `events_last`, `events_sum`, `zero_streak`, `last_changed`, `tier` | Content-rating / tiering, see §3. |
| `etag`, `last_modified` | Last response's caching headers (2026-07-14). The next crawl sends `If-None-Match`/`If-Modified-Since`; a **304 skips the transfer entirely** — cheaper than `page_hash`, which still needs the body. Generic shell only. |
| `default_categories` | Categories every event from this source inherits, **appended never substituted** (2026-07-14). The extractor reads an *event's* words, not its publisher's identity — a children's museum's 144 events extracted as `culture` and were invisible to the For-kids filter. Set only for unambiguously single-audience sources (FRida & freD, Kinderfreunde, Naturfreunde's family target-group, Familienbund, ASVÖ, Alpenverein Jugend&Familie); forcing `family` onto a diocese or a library would be hard-rule-5 fabrication in the category column. `scripts/migrate-source-categories.mjs`. |
| `default_venue`, `default_address` | The physical house a **single-venue publisher** operates from (2026-07-14). A theatre or museum publishing its own programme names the *room*: Dschungel Wien (children's theatre, MuseumsQuartier) lists "Bühne 1"/"Bühne 2" — 175 events, and no geocoder or web search can place "Bühne 2, Wien". The venue isn't in the event text at all; it's the publisher's identity. Used as a fallback whenever an event from such a source resolves no better than town level. `scripts/migrate-source-venue.mjs`. |

### Tiering policy (`scripts/crawl.mjs`)

- `dead`: `zero_streak >= 4` → excluded from default `npm run crawl` runs; `--all` overrides.
- `active`: avg yield (`events_sum / crawl_count`) ≥ 1.5, OR the page changed in the last 3 days →
  recrawl every 2 days. New sources (`crawl_count < 3`) default to `active` — not enough data to
  demote yet, and every source deserves a fair first look.
- `slow`: avg yield ≥ 0.3 → recrawl every 5 days.
- `dormant`: still works, low/no yield, rarely changes → recrawl every 7 days.
- A hash-unchanged round bumps `crawl_count` only, never `zero_streak` — "page didn't change" is
  healthy for a slow municipal calendar, not the same signal as "found nothing."

### Coverage snapshot (read-only query, captured 2026-07-14)

**1,824 sources registered, 1,743 `works=true`, 0 `tier='dead'`.** 87 never crawled (59 AT / 28 BG) —
the daily cron picks them up.

| Country | works=true | Published events | Places | Family-tagged |
|---|---:|---:|---:|---:|
| AT | 1,537 | 20,482 | 289 | 2,148 |
| BG | 198 | 2,486 | 661 | 322 |
| DE (Stuttgart 40km) | 8 | 775 | 319 | 119 |

**Which route won each working source's last crawl — this is the cost picture, and the biggest
remaining lever:**

| Route | Sources | Cost |
|---|---:|---|
| `llm` | **813** | one model call per crawl — **~half of all sources** |
| `gem2go` | 790 | $0 |
| `jsonld` | 37 | $0 |
| `ical` | 31 | $0 |
| `dvv` / `siteswift` / `kalkalpen` / `naturfreunde` / `kinderfreunde` / `wordpress-ical` / `hwveranstaltung` | 15 | $0 |

One deterministic parser per CMS is what converts a whole cluster from the first row to the rest —
GEM2GO (790 sources) and the diocese `siteswift` platform (5 sources, hundreds of parishes) are the
proof. **813 sources still on the LLM route is the standing invitation**: the national probe
classified sources from *URLs only, never fetching HTML*, leaving ~1,027 unclassified, so the CMS
fingerprint sweep (`sources.cms` backfill) is the highest-value pipeline task outstanding.

`feed_kind` of the 214 working sources' most recent crawl: **158 GEM2GO** (73.8%), **51 LLM**
(23.8%), 3 JSON-LD, 2 not yet crawled since the field was added. This is the measured payoff of the
deterministic GEM2GO parser (§3): roughly three in four working sources now resolve for $0 in LLM
tokens.

**Gap found while capturing this snapshot:** [`lib/db.js`](../../lib/db.js)'s `upsertSource()` — the
only registry write path invoked by [`scripts/seed.mjs`](../../scripts/seed.mjs) — has no `region`
parameter at all, yet `region` is populated for every one of the 272 rows above. The Salzburg/OÖ/NÖ
backfill must have set it via ad-hoc SQL outside the checked-in code path, and there is no committed
prober/register script (`scripts/seed.mjs` only *ingests events*, it never registers a source list
on its own) — the "probe & register" step described in
[`briefs/austria-backfill-brief.md`](../../briefs/austria-backfill-brief.md) and
[`briefs/oo-sources-brief.md`](../../briefs/oo-sources-brief.md) is currently agent-run, one-off code
that never landed in `scripts/`. Anyone repeating "add a region" (§11) either has to extend
`upsertSource()` to accept `region`, or keep doing it by hand — worth deciding, not silently
repeating.

## 3. Crawl (`scripts/crawl.mjs`)

**Politeness by design**, not an afterthought: every fetch goes through `politeFetch()` — identifying
UA (`UmkreisBot/0.1 … contact: bobojojok@gmail.com`), a per-host ≥1s delay enforced by a
`lastFetchByHost` map, and a `robots.txt` check (`robotsAllowed()`) cached per origin, gating on a
match for `umkreisbot` or `*` in a small hand-rolled RFC-9309 group parser
(`parseRobots`/`isDisallowed`) — good enough for the two agents that matter, not a full spec
implementation. It does handle the parts that bite in practice (fixed 2026-07-14 after the
Stuttgart false block): `Allow:` lines count as rules (Cloudflare's managed layout otherwise
merges named AI-bot `Disallow: /` blocks into the `*` group), multiple groups for the same agent
token are unioned, precedence is longest-match with allow winning ties, and a trailing `*` in a
pattern is treated as the equivalent prefix. Interior wildcards/`$` remain unsupported.

**Change detection.** The fetched page is stripped to text (`htmlToText`), hashed (sha256), and
compared to `sources.page_hash`. Unchanged (and no `--force`) → skip extraction entirely, only
`crawl_count` advances. This is the single biggest cost lever (per the crawl-scaling decision doc):
municipal calendars change slowly, so most recrawls cost a fetch and a compare.

**Structured-first waterfall** (`tryStructuredExtraction`), first route to yield ≥1 event wins and
the LLM is skipped:

1. **JSON-LD** (`parseJsonLdEvents`) — `schema.org/Event` blocks; category inferred from `@type`,
   `is_free` from `offers`. `description` is always `null` here — facts only, never source prose.
2. **iCal** (`parseIcsEvents`) — follows a discovered `.ics`/`webcal:` link; Vienna wall-clock
   conversion in `icsDateToVienna` (only a trailing `Z` triggers an actual UTC→Vienna conversion via
   `Intl`, everything else is taken literally as written).
3. **GEM2GO** (`parseGem2goEvents`) — gated on `src.cms === 'gem2go'`.
   Four sub-parsers for four live markup variants found probing real GEM2GO sites (a CMS template
   powering 64+ OÖ municipal sites and hundreds more nationally): `parseGem2goTable` (classic
   RIS-style `<table>`), `parseGem2goBem` (Bootstrap "bem" card list), `parseGem2goRaster` (card
   grid, German long-form dates via a `DE_MONTHS` table), `parseGem2goCollapsible` (accordion list).
   Tried in that order, first to yield ≥1 event wins. Categories are best-effort German
   keyword-matching (`GEM2GO_CATEGORY_RULES`) — null if unsure, never a forced guess.
4. **DVV Zusatzmodule RSS** (`parseDvvEvents`, `cms='dvv'`) — municipal feeds whose CDATA exposes
   hCalendar `dtstart`/`dtend`, time, venue, postal address, and exact detail link. Parsed as facts
   with `description=null`; this covers the Stuttgart-area Esslingen/Ludwigsburg/Böblingen pattern
   without an LLM call.
5. **Sitepark RSS + per-event iCal** (`cms='sitepark-ical'`) — the filtered Stuttgart feed supplies
   canonical detail links; each linked iCal supplies the factual date, time, location, categories,
   and canonical URL. RSS descriptions and images are ignored.
6. **RSS/Atom** (`parseRssEvents`) — only treated as an event source if entries carry an explicit
   event-date tag (`startdate`/`dtstart`/`eventdate`, …) beyond the ordinary publish date; otherwise
   it's a news feed, falls through.

Named regional scope guards run after geocoding and before `upsertEvent()`. The first is
`stuttgart-40km`: sources are explicitly tagged `country='DE', region='Stuttgart 40km'`; event
coordinates must be within 40 km of `48.7758,9.1829`. Town-pin jitter is disabled for this check so
the boundary decision is deterministic. A scoped mined file declares `_meta.scope` and gets the same
guard in `scripts/seed.mjs`; out-of-radius events are skipped, never moved inward.
Per-host politeness is at least one second and increases to a parsed robots `Crawl-delay` (capped at
60 seconds); the Stuttgart-area DVV hosts currently request 30 seconds.

**LLM fallback** — only when nothing structured matched: `extractFromPage()` in
[`lib/extract.js`](../../lib/extract.js), see §4.

Every extracted event is guarded before upsert: no `title`/`date_start` → dropped; `time_start` must
match `HH:MM` or is discarded; `ends_at <= starts_at` (garbled overnight end times) → `ends_at` reset
to `null` (the ends-after-starts invariant from `tasks/lessons.md`).

**Host concurrency**: `groupByHost()` buckets due sources by host;
`runHostPool()` runs up to `HOST_CONCURRENCY = 6` lanes in parallel, but each lane processes its
sources **strictly sequentially** — two requests never hit the same host at once, because
`politeFetch`'s per-host timer is not concurrency-safe across simultaneous callers on its own. Speed
comes only from parallelizing across *different* municipal servers, never from shrinking the ≥1s
per-host delay.

**Cadence gating**: `isDue()` compares `last_crawled` against `TIER_CADENCE_DAYS[tier]` (2/5/7 days).
A plain `npm run crawl` (no flags) only crawls due, non-dead sources; `--all` bypasses both the tier
filter and cadence; `--url <url>` targets one source directly, ignoring tier/cadence entirely;
`--force` bypasses the page-hash skip.

## 4. Extraction (`lib/extract.js`)

All AI extraction is routed through this one file — feature code (routes, `crawl.mjs`) never
calls a provider SDK directly (CLAUDE.md hard rule #2). Two call shapes: `extractFromImage` (poster
scan) and `extractFromPage` (crawl text), both text-schema-constrained (`SCAN_SCHEMA` /
`CRAWL_SCHEMA`) so every provider is forced to answer with the exact field names `crawl.mjs` reads.

| Path | Order | Notes |
|---|---|---|
| **Poster scan** (`extractFromImage`) | Gemini Flash-Lite (image) → Claude Haiku (image) → local `claude` CLI (only if Claude call fails with an auth error and a `filePath` was given) | Per [`docs/decisions/2026-07-10-scan-model-choice.md`](../decisions/2026-07-10-scan-model-choice.md). CLI path is a dev-convenience last resort, not a production route. |
| **Crawl page text** (`extractFromPage`) | If `EXTRACT_PROVIDER=grok`: Grok CLI (`~/.grok/bin/grok`, subscription tokens, $0) → xAI API (only if `XAI_API_KEY` set and the CLI fails) → falls into the default order below. Default order: Gemini Flash-Lite → Claude Haiku. | Grok is a **bulk-backfill opt-in**, not steady state — see [`briefs/austria-backfill-brief.md`](../../briefs/austria-backfill-brief.md). The Grok CLI call is fenced hard: single turn, no tools, no web search, `cwd` pinned to a tmpdir (unfenced it wanders the repo looking for "missing input"); stdin isn't delivered in `-p` mode so the page text is embedded directly in the prompt. |

**Never-fabricate rules baked into every prompt and every parser**: unknown fields → `null`; no
parseable date → the event is skipped, never invented; `description` is always "1 short German
sentence, own words" — never copied source prose (facts + linkback, hard rule #1 / #5).

## 5. Geocoding (`lib/geocode.js`, `app/api/geocode/route.js`)

**Nominatim** is the batch/server-side geocoder: 1 req/s **global** limit (not per-host — a single
promise chain `throttleChain` serializes every call so concurrent crawl host-lanes can't race the
same `lastCall` timestamp and fire together, which previously caused 429s that got cached as
permanent misses and silently dropped every event in a town — the NÖ-backfill regression noted
in-code). Every result (hit or genuine miss) is cached in `geocache`; a *transient* failure (429/5xx)
throws instead of caching, so it's retried next time rather than poisoned forever.

**Sanity bounds** (`inRegion()`): lat 46.3–49.1, lng 9.4–17.3 — widened from a Linz box → OÖ → all of
Austria (+ margin) on 2026-07-11 for the national backfill. **Lesson baked into a code comment**:
whenever these bounds widen, `geocache` rows with `hit=false` must be purged, or cached misses from
the old (narrower) bounds silently block the new area (`tasks/lessons.md`, the Bad Ischl bug —
25 events extracted, 0 published, no error).

**The waterfall** (`geocodeEvent`), rebuilt 2026-07-14:

0. **Sentinel venues** (`isSentinelVenue`: `Online`, `Sonstige`, `онлайн`, …) are treated as **no
   venue at all** — they are placeholders, not places, and were previously being geocoded to a town
   centroid and pinned on the map.
1. **`venues` registry** (`getVenue`) — a resolved `(venue_norm, town_norm, country)` is a **fact**,
   not a cache: once "Basilika St. Laurenz, Enns" is known, every current and future event there
   resolves instantly and identically. Every later rung writes its result back
   (`resolved_via`: `event`\|`place`\|`geocode`\|`detail_page`\|`llm`\|`search`\|`manual`). This is what
   turns one-off enrichment into a permanent pipeline improvement — hard rule 7 applied to geocoding.
2. `poiQuery(venue, town)` — venue *name* search, up to 5 candidates, must (a) sit within
   `TOWN_BOUND_KM` (15km) of the expected town, (b) `nameMatches()` the venue (word-boundary
   containment or ≥0.5 token overlap over *distinctive* words — `GENERIC_NAME_WORDS` like
   "Gemeindeamt"/"Pfarrzentrum" recur in every Austrian town and would otherwise false-match
   nationally), (c) preferentially an amenity/leisure/tourism/building/man_made OSM class.
3. `address` string — **now town-bounded too** (see below).
4. Plain `venue + town` string — **now town-bounded too**.
5. **Source's `default_venue`/`default_address`** if it is a single-venue publisher (crawl only).
6. Town centroid (`lib/towns.js`, else a cached Nominatim town lookup). **No jitter.**

**Every precise rung is bounded to its town** (2026-07-14). Only `poiQuery` used to be. So a generic
venue string could be matched to a same-named place anywhere in the country and stored at full
**venue precision** — "Bühne 3" (a stage inside a Vienna children's theatre) landed 24km outside
Vienna. **A confidently-wrong pin is strictly worse than a town centroid**: the approximate treatment
is the signal that tells a user to check the source, and a precise pin removes it.

**The registry can outlive the rule that filled it.** `migrate-venues.mjs` seeded `venues` from
events *already* at venue precision — including ones the then-unbounded rung had misplaced. The
registry rung returns **before** any bound check (that is the point of a registry), so those rows
were served forever and survived every recrawl. `scripts/prune-venues.mjs` deletes rows further than
the bound from their own town: **254 found, up to 446km off** (Brand / Egg / Kematen — Austrian town
names that repeat). Deleted, not "corrected": when a venue and its town disagree by 400km you cannot
know which is wrong, so let the pipeline re-derive it. Same family as the negative-geocache lesson —
**re-validate any cache/registry against the CURRENT rules whenever the rules change.**

**No jitter, ever** (2026-07-14). Town-level results used to get a random ±300m offset so pins
wouldn't stack — which *invented a coordinate* for ~11k events (170 scattered across a few Wiener
Neustadt blocks, indistinguishable from real venues at street zoom). That is fabrication in service
of a tidy map, and hard rule 5 has no cosmetic exemption. Every town-level event now sits exactly on
its town centroid (`scripts/snap-town-pins.mjs` fixed the 10,661 already written), and **the map
collapses them into one honest "N events in <town>" group** — a dashed bubble, never a pin.

### The location-enrichment ladder (`scripts/enrich-locations.mjs`, `scripts/venue-search.mjs`)

Half of all events know only a town. The fix is **venue-shaped, not event-shaped**: in the five big-city
zones, 2,565 such events collapsed to just **1,163 unique (venue, town) pairs** — one resolution fixes
every event at that venue, now and forever, via the registry. Rungs, cheapest first:

1. **registry** (free) → 2. **detail-page second hop** ($0: the event's own page — JSON-LD
   `Event.location`, the GEM2GO/RiS per-event iCal `LOCATION`, the detail table's *Ort*) →
3. **`--llm`** (a model reads the already-fetched page and reports only what it *states*) →
4. **`venue-search.mjs`** (a web-search model, Grok CLI on subscription = $0, asked **per unique
   venue**, never per event).

**The model never returns coordinates** — only an address *string*, which our own Nominatim geocodes
and the 15–30km town guard vetoes. A hallucinated venue simply fails to geocode and its events stay
honestly approximate (hard rule 5 by construction).

`events.enrich_attempted_at` is stamped when a page is **fetched**, not when it succeeds — otherwise
a resumed run restarts at the top of a stable ordering and re-pays a model for every page a prior run
already proved states no location (the first resumed `--llm` run resolved 0 of its first 250 events
for exactly this reason). That gate is what makes the script safely cron-able.

**Photon**, not Nominatim, for autocomplete (`app/api/geocode/route.js`, `photonSuggest`) — Nominatim's
usage policy explicitly forbids autocomplete-as-you-type; Photon (komoot's public instance) is built
for it. Self-contained (doesn't touch `lib/geocode.js` or the DB pool) with a crude in-memory cache
(cap 500 entries, cleared wholesale past that), biased toward Linz (`lat=48.3069&lon=14.2858`),
filtered to `countrycode=AT`.

**Repair runbook**: `scripts/regeocode.mjs` — purges negative geocache first (so the lesson above is
self-applying), then re-runs `geocodeEvent()` for every row at `geo_precision='town'` or carrying a
`venue`, and reports/applies any move ≥150m or any town→better-than-town precision upgrade. Dry-run by
default.

## 5b. The search bar (`lib/places.js`, `app/page.js`)

Typing in the search pill runs **two independent searches** whose results are shown as two sections,
locations always above events:

1. **Locations** — where do you want the map to look? Picking one flies there and becomes the
   distance reference point ("Around X" chip).
2. **Events** — the global server text search (`GET /api/events?q=`, ILIKE over title/venue/town,
   debounced 400ms). Independent of the viewport, so an event in another country is findable.

Locations resolve in two tiers:

**Tier 1 — `lib/places.js`, a static gazetteer (instant, offline).** ~33 AT + ~25 BG cities/towns,
each with the alternate spellings people actually type (`Vienna`→Wien, `Sofia`/`софи`→София,
`St. Pölten`/`St Poelten`). Ranking is **prefix > word-start > substring**, with population as the
tiebreaker; the towns of currently-loaded events are merged in as extra candidates. This exists
because a remote geocoder structurally *cannot* answer a three-letter query well: Photon biases to
the map centre, so "vie" near Linz returns *Vielguthstraße* and a heating-systems shop long before
Vienna, and Nominatim (one-shot, no autocomplete) needs a full correctly-spelled name. Three letters
of a capital must return the capital.

**Tier 2 — Photon suggest** (`/api/geocode?suggest=1`, debounced 300ms, ≥3 chars): the long tail the
gazetteer doesn't carry — villages, hamlets, addresses. Results are tagged `place` (OSM `osm_key=place`)
so **localities sort above streets and POIs**, deduped against the gazetteer's names *and aliases*
(otherwise Photon's "Sofia" repeats our "София").

> **`lib/places.js` is NOT `lib/towns.js`.** `towns.js` is the geocoding fallback for *pinning
> events* and `townCentroid()` fuzzy-substring-matches against it — putting Vienna or Sofia in
> there would start dragging event pins to the wrong city. The gazetteer is search-only and never
> touches geocoding. Keep them separate.

**When coverage expands, the gazetteer expands with it** (see CLAUDE.md hard rule 8): a new region's
cities must be searchable by prefix on day one, or the events we just crawled are on the map but
unreachable by the only tool a user has to get there.

## 6. Dedup & merge

**Two independent layers, deliberately not merged into one:**

1. **Exact layer — `content_hash`** (`lib/db.js` `contentHash()`/`upsertEvent()`): normalized
   title + day + time + town + venue/address (event occurrences) or normalized title + town (places, no day — evergreen). A `unique`
   DB constraint means an identical re-extraction of the same event *updates* the row instead of
   duplicating it. This is what makes recrawls idempotent, but it only catches byte-for-byte-same
   normalized keys — two sources describing the same real event with slightly different titles slip
   through. Legacy title+day+town rows are migrated lazily when the exact start and a non-conflicting
   venue match, so introducing occurrence-aware hashes does not duplicate existing records.
2. **Fuzzy layer — `lib/dedup.js`** (pure functions, no DB access — deliberately, to avoid pulling in
   the DB pool or racing concurrent edits to `lib/geocode.js`): `findDuplicate(candidate, existing)`
   matches on **all three**:
   - `sameDay` plus occurrence time — exact local calendar-date match, and two explicit different
     wall-clock starts never cluster. An all-day copy may still enrich a timed copy.
   - `sameLocation` — when both sides carry better-than-town `geo_precision`, they must be within
     300m; otherwise the normalized `town` fallback applies. Town-centroid coordinates are excluded from the
     distance branch entirely — they're a sentinel, not a position, and two unrelated events in the
     same town would otherwise share identical centroid coords (`tasks/lessons.md`, 2026-07-11 —
     the same bug class that hit the UI's venue-grouping).
   - `titlesMatch` — exact normalized match, OR word-boundary containment (never raw substring —
     "fest" must not match inside "sommerfest"), OR Jaccard similarity ≥0.75 over token sets.

   `mergePlan(existing, candidate)` then computes a field-level enrichment patch: fills only
   `existing`'s null/empty fields (`description`, `ends_at`, `address`, `venue`, `is_free`, `age_min`,
   `age_max`, `indoor`, `photo_path`, `categories`) from `candidate`, never overwrites a populated
   field. `ends_at` is only filled if it would still be a valid end time (guards the
   ends-after-starts invariant). `source_url`/`source_name` are deliberately excluded — first-seen
   wins; multi-source attribution is a future schema change (§12).

**Three entry-point integrations** (all three call `findDuplicate` against `publishedEvents()`):

- [`app/api/scan/route.js`](../../app/api/scan/route.js) — best-effort heads-up only (no geocode yet
  at scan time, so only town-level matching is possible); shown to the user, who still confirms
  before anything is written.
- [`app/api/events/route.js`](../../app/api/events/route.js) POST — after geocoding, a real match
  short-circuits the insert: `mergePlan()` is applied via `updateEventFields()` and the response
  reports `merged: true` against the existing id, no new row.
- [`scripts/merge-dups.mjs`](../../scripts/merge-dups.mjs) — a periodic sweep over everything already
  published, catching cross-source dupes that both slipped past content_hash *and* predate each
  other (so neither insert-time check saw the other). **Canonical-linkage clustering**: within a
  cluster, every candidate is tested against the cluster's canonical (oldest id) member only, never
  against other members already added — single-linkage chaining previously let two long titles
  sharing a boilerplate suffix ("… Das kostenlose Bewegungsprogramm ohne Anmeldung") pull an unrelated
  event into the wrong cluster (review round 3 finding, noted in-code). Dry-run by default; `--write`
  applies `mergePlan()` enrichment to the canonical row then deletes the duplicate rows.
  **Idempotence**: safe to re-run any time — a clean DB just reports zero clusters.

  Out-of-scope case documented in the script's own header: a genuinely single event listed with
  *different* start dates across sources (e.g. one source got the date wrong) will not cluster —
  `sameDay` requires an exact match by design.

## 7. Places

**Source**: Overpass API (`overpass-api.de`) queries against OpenStreetMap, ~25km radius around Linz
center — a one-off agent mining run, not a recurring crawl (no committed Overpass-query script; the
57-place `data/mined/places-family-linz.json` file's `_meta.generator` documents the method:
"Overpass API query + Nominatim/Overpass `is_in` reverse-geocode for town names + web search
cross-check for official websites and simple weekly opening hours").

**Curation rules** (from that file's `_meta.notes`, applied by hand during the mining run, not
enforced in code): facts only, no source prose copied — descriptions are one-line factual summaries
written for the dataset; `categories[]` maps into the current `playground`\|`pool`\|`park`\|`trail`\|
`indoor_play` taxonomy as best-effort (the finer OSM type — `museum`\|`science_center`\|`zoo`\|… — is
preserved in the provenance-only `_osm_category` field for a future taxonomy extension);
`opening_hours` is only populated for simple, confidently-parsed single weekly patterns — complex or
seasonal rules are left `null` with a human-written `seasonal` note instead; a place whose municipality
couldn't be confidently resolved (bare "Freibad" nodes, `access=private` gardens) was **excluded
rather than guessed** — never-fabricate applies to places too.

**ODbL attribution obligation**: every mined place carries `source_name: "OpenStreetMap contributors"`
and the file's `_meta.attribution` string ("Map data © OpenStreetMap contributors … Open Database
License (ODbL) 1.0"). This must stay visible somewhere in the product (footer/about — verify it still
is; not re-checked as part of this doc).

**Seed runbook**: `scripts/seed-places.mjs` — reads `data/mined/*.json` files shaped
`{ _meta, places: [...] }` (only files with a `places` array; event-only mined files are skipped),
strips the provenance-only keys (`_osm_category`, `_osm_type`, `_osm_id`, `_wheelchair`) before
insert, validates `title` + numeric `lat`/`lng` + `kind==='place'`, and is idempotent via the same
`contentHash()` used everywhere else (`place|norm(title)|norm(town)`). Dry-run by default (prints
insert/update plan, touches nothing); `--write` applies via `upsertEvent()`.

**`opening_hours` semantics** (migrated 2026-07-11 by `scripts/fix-always-open.mjs`, a one-off): `null`
= **unknown** (no status line shown), `{"always": true}` = always open, a populated weekly object =
real hours. Before this migration `null` meant "always open," which mislabeled 54 newly-mined
museums/pools as "Immer geöffnet" — the sentinel-value lesson in `tasks/lessons.md`. Only two
hand-picked places (`Spielplatz Donaulände`, `Kürnberger Wald Wanderweg`) were migrated to the
explicit `{"always":true}` marker; everything else with unknown hours correctly stayed `null`.

## 8. Costs & limits

| Service | Role | Limit | Escape hatch |
|---|---|---|---|
| Nominatim | Batch geocode (venue/address/town) | 1 req/s **global**, enforced by `throttleChain` | Everything cached in `geocache`; negative-cache purge (`purgeNegativeGeocache()`) when rules change |
| Photon (komoot) | Autocomplete-as-you-type | No hard quota published; be polite | In-memory cache (cap 500), 5s timeout, empty-result-on-failure (never blocks the UI) |
| Overpass API | One-off places mining | Public instance fair-use policy (not a recurring load — one bootstrap run) | N/A — not on the recurring path |
| Gemini Flash-Lite | Primary crawl/scan LLM | Free tier: 15 RPM, 1,000 req/day | Paid tier ($0.10/$0.40 per MTok in/out, per `docs/research/scraping-cost.md`); falls back to Claude on error |
| Claude Haiku 4.5 | LLM fallback | Whatever the configured API key allows | ~12x Gemini's per-page cost (measured) — by design a fallback, not primary |
| Grok CLI (`~/.grok/bin/grok`) | Bulk backfill LLM (opt-in `EXTRACT_PROVIDER=grok`) | Subscription tokens (fixed), ~30–60s/page (agent startup overhead) | xAI API fallback if `XAI_API_KEY` set; otherwise falls into Gemini→Claude |
| Source servers (municipal sites) | Everything crawled | Small servers — treated as the real constraint, not our infra | Per-host ≥1s delay (`politeFetch`), robots.txt honored, identifying `UmkreisBot` UA |
| Vercel | Hosting | Read-only project dir, ephemeral `/tmp`; `app/api/scan/route.js` sets `maxDuration = 120` | Uploads write to `/tmp/uploads` when `process.env.VERCEL`, local `data/uploads` otherwise; nothing on `/tmp` is kept after extraction (`finally { fs.unlink(...) }`) |
| Supabase (Postgres) | Data store | Transaction pooler, `max: 5` connections, `prepare: false` (Supavisor doesn't support prepared statements) | Dedicated `umkreis` schema inside a shared project — `search_path` scoped, portable to a standalone project by schema dump/restore |

Measured cost figures (Gemini Flash-Lite primary, 85/15 Gemini/Haiku blend, **naive baseline — no
change-detection/structured-waterfall discount applied**): full-OÖ pass ~$0.60–$1.20, ~$7–14/month at
2–3 day cadence; Linz-region-only ~$1.60–3.00/month. See
[`docs/research/scraping-cost.md`](../research/scraping-cost.md) for the token measurements and
pricing sources — that doc predates the GEM2GO parser and tiering, so real spend today is
meaningfully lower than its naive numbers (the 158/214 = 73.8% GEM2GO hit rate in §2 is the concrete
evidence: those crawls now cost $0 in LLM tokens where the naive model assumed one Gemini call each).

## 9. Legal & politeness posture

Full reasoning lives in
[`docs/decisions/2026-07-11-crawl-scaling-and-legal.md`](../decisions/2026-07-11-crawl-scaling-and-legal.md);
summary of what's actually implemented:

- **Facts are free, expression is not.** Title/date/venue/price/age/category/URL are extracted
  without limit (facts aren't copyrightable); source prose and images are never copied — every
  extraction path (`crawl.mjs`'s structured parsers, `lib/extract.js`'s LLM prompts, the Overpass
  places mining) writes `description` as a fresh one-liner or leaves it `null`.
- **robots.txt honored** before every fetch (`robotsAllowed()`), **identifying UA** on every request
  (`UmkreisBot/0.1` for crawl, a separate `umkreis-prototype/0.1` UA for Nominatim per its own usage
  policy), **per-host rate limiting** (≥1s crawl, 1/s global Nominatim).
- **Linkback on every event** (`source_url`, a hard rule) — the traffic-back argument that a
  deterministic parser reading the same public HTML "changes how we parse, not what we access," and
  that GEM2GO's own ToS (no account/API involved) don't bind us.
- **GDPR**: extraction keeps organizer facts (Verein/venue name) but not private personal data
  (a volunteer's phone number) — enforced by prompt instruction and parser design, not a technical
  filter; worth a periodic spot-check as regions scale.
- **Honest caveat carried forward**: this is managed risk, not zero risk. A source can still object
  on ToS grounds; the response is linkback-value or the "claim your event" path (§12), or dropping the
  source — not an argument that scraping is risk-free.

## 10. Runbook

All scripts read `DATABASE_URL` from the environment via `lib/db.js` — **always invoke with
`--env-file=.env.local`**, `npm run <script>` alone will NOT load it (no `.npmrc`/dotenv wiring in
`package.json`; this bit the project once already per `tasks/lessons.md` and the `package.json`
scripts (`"crawl": "node scripts/crawl.mjs"`, `"seed": "node scripts/seed.mjs"`) still don't include
the flag — treat the commands below as the correct form, not the bare `npm run` ones).

| Command | Does | Convention |
|---|---|---|
| `node --env-file=.env.local scripts/crawl.mjs` | Recrawl all due, non-dead sources | Write-on-success (upserts events); prints tier summary at the end |
| `node --env-file=.env.local scripts/crawl.mjs --url https://...` | Crawl one source, ignoring tier/cadence | Same write behavior |
| `node --env-file=.env.local scripts/crawl.mjs --force` | Ignore page-hash change-detection | Same write behavior |
| `node --env-file=.env.local scripts/crawl.mjs --all` | Ignore tier/cadence gating (periodic deep sweep, includes `dead`) | Same write behavior |
| `node --env-file=.env.local scripts/crawl.mjs --scope stuttgart-40km` | Crawl only registered Stuttgart-scope sources | Enforces the 40 km post-geocode guard |
| `EXTRACT_PROVIDER=grok node --env-file=.env.local scripts/crawl.mjs [flags]` | Same crawl, LLM fallback routed through the Grok CLI first | Bulk-backfill use, not steady state |
| `node --env-file=.env.local scripts/seed.mjs` | Ingest `data/mined/*.json` (`events`+`source_registry`) | Writes directly, no dry-run flag |
| `node --env-file=.env.local scripts/seed.mjs --scope stuttgart-40km` | Ingest only mined files explicitly tagged for the Stuttgart pilot | Writes with country + post-geocode 40 km guards |
| `node --env-file=.env.local scripts/seed-places.mjs` | Ingest `data/mined/*.json` (`places`) | **Dry-run by default** — pass `--write` to apply |
| `node --env-file=.env.local scripts/seed-places.mjs --scope stuttgart-40km [--write]` | Review/write only Stuttgart-scoped place files | Validates `DE`, exact coordinates, and 40 km radius |
| `node --env-file=.env.local scripts/regeocode.mjs` | Purge negative geocache, re-check town/venue-precision rows, propose moves | **Dry-run by default** — pass `--write` to apply |
| `node --env-file=.env.local scripts/merge-dups.mjs` | Fuzzy cross-source dedup sweep over published events | **Dry-run by default** — pass `--write` to apply |
| **Location enrichment (§5)** | | |
| `node --env-file=.env.local scripts/enrich-locations.mjs [--write] [--llm]` | Town-precision events → registry, detail-page second hop, then (opt-in) a model reading the fetched page | **Dry-run by default.** `--zone linz` / `--all` / `--limit N` / `--retry-after DAYS`. Stamps `enrich_attempted_at` so re-runs skip pages already read |
| `node --env-file=.env.local scripts/venue-search.mjs [--write]` | Web-search the address of each **unique unresolved (venue, town) pair** (Grok CLI, $0) | **Dry-run by default.** Model returns an address STRING; we geocode it and enforce the town guard. **Run it ALONE** — shares the global Nominatim budget |
| `node --env-file=.env.local scripts/prune-venues.mjs [--write]` | Delete `venues` rows further than 15km from their own town | Run whenever a geocode rule changes — a registry seeded under a broken rule outlives it |
| `node --env-file=.env.local scripts/snap-town-pins.mjs [--write]` | Snap town-precision events onto their exact town centroid | One-off; the ±300m jitter that made this necessary is gone from the geocoder |
| **Source metadata** | | |
| `node --env-file=.env.local scripts/migrate-source-categories.mjs [--write]` | Set + backfill `sources.default_categories` | Backfill joins on **`source_name`**, not `source_url` — most adapters store the *event's* permalink there |
| `node --env-file=.env.local scripts/migrate-source-venue.mjs [--write]` | Set `sources.default_venue/address` for single-venue publishers | Seeds the house into `venues` so every future crawl resolves through the registry |
| `node --env-file=.env.local scripts/embed-dedup.mjs` | Embedding-based near-dup **report** (pgvector) | Report-only. Wiring rule: similarity ≥0.90 **AND** same-town — a day-only threshold is drowned by templated municipal content |
| `node --env-file=.env.local scripts/fix-always-open.mjs` | One-off `opening_hours` sentinel migration | Already applied; keep for reference, don't re-run blindly |
| `npm run mcp` (or `node scripts/mcp-server.mjs`) | MCP server exposing `search_events`/`get_event`/`list_sources` over stdio | Read-only against the DB |

**The purge-negative-geocache rule, restated as a standing rule**: any time a rule feeding the
geocache changes — sanity bounds, the POI-matching waterfall, `nameMatches()`'s word/overlap logic —
run `scripts/regeocode.mjs` (it purges negative geocache as its first step) rather than assuming old
cached misses are still valid.

## 11. How to add a region

Standalone, portable version of this whole recipe (any country, hand-off-able to an outside agent):
[`docs/playbooks/country-mining-playbook.md`](../playbooks/country-mining-playbook.md).

1. **Catalog**: a municipality list for the Bundesland (Wikipedia is the source used so far — see
   `data/sources-austria.json`, 1,654 entries covering multiple Länder — and the older
   `data/sources-ooe.json`), stored as `data/sources-<region>.json`.
2. **Probe & classify CMS**: fetch each candidate site politely (sequential, small delay), fingerprint
   for `gem2go`/`ris-kommunal` markers in the HTML, locate the actual events-calendar URL, and apply
   the two-stage false-positive check from `briefs/mining-brief.md` (URL must contain `veranstalt`,
   not bare `termine`; resolved page must have future-dated content and a title that doesn't look
   administrative). **This step currently has no committed script** (§2's gap) — it has so far been
   agent-run, ad hoc code.
3. **Register**: `upsertSource()` (`lib/db.js`) for name/url/kind/town/works/notes/cms — but note it
   does **not** accept `region` today (§2 gap); setting `region` currently requires a direct SQL
   statement alongside the registration, not the standard helper.
4. **First crawl**: `node --env-file=.env.local scripts/crawl.mjs --url <one-source-url>` per new
   source to sanity-check extraction before folding it into the default run; then let the normal
   `npm run crawl` (with the env flag) cadence pick it up.
5. **Tier settles**: new sources default to `tier='active'` for their first 3 crawls (not enough data
   to judge yield), then reclassify per the thresholds in §2/§3 based on real yield and change
   frequency.

## 12. Roadmap pointers

- **Feed-URL submission / RiS-GEM2GO write-API**: the long-term graduation from crawling to organizers
  handing us data with consent — see
  [`docs/decisions/2026-07-11-middle-layer-strategy.md`](../decisions/2026-07-11-middle-layer-strategy.md)
  §"claim your event" mechanism. Post-validation, not a current build item.
- **Multi-source attribution schema change**: `lib/dedup.js`'s `mergePlan()` currently keeps
  first-seen `source_url`/`source_name` and drops the second source's attribution entirely on merge —
  tracking *all* sources for a merged event is called out as a future schema change (§6).
- **Deeper fact fields**: ticket/registration URL, numeric price, organizer name, RRULE recurrence —
  see design-doc §6, legally free to extract per the crawl-scaling decision doc's "facts without
  limit" principle; not yet in `EVENT_PROPS` (`lib/extract.js`) or the structured parsers.

---

## Keeping this current

Update this doc in the post-commit housekeeping step (CLAUDE.md) whenever pipeline behavior changes —
a new extraction route, a changed dedup/geocode rule, a schema field, a new script. Surgical edits
only: touch the section that changed, don't re-summarize the whole pipeline.
