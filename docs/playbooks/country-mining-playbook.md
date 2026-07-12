# Country Mining Playbook — building a family-events map from municipal sources

Hand this document to any capable LLM/agent — inside this repo or in a completely different
project — with the instruction **"mine events for country X."** It is self-contained: read it
top to bottom and you can execute the recipe with generic tools (fetch, regex/DOM parsing, an
LLM API, a spreadsheet or database). Where this repo (Okolo/eventmap, a families-first
event-discovery map for Austria) already has working code for a step, the step says so and gives
the file path — reuse it if you're running inside this repo, reimplement the pattern if you're
not.

This playbook was distilled from one real country build (Austria, ~272 municipal sources, 1,892
published events, 214 working crawlers as of 2026-07-12) — every rule below traces back to a
specific bug, near-miss, or measured result from that build. Where useful, the originating file or
incident is cited in parentheses.

---

## 1. Mission + non-negotiables

You are building a **facts index with linkback**, not a copy of anyone's content. These rules are
not style preferences — breaking them creates legal exposure or destroys user trust, both
expensive to undo later.

1. **Never fabricate.** Unknown field → `null`. No parseable date → **skip the event entirely**,
   never guess or infer one. A wrong event on the map (wrong date, wrong venue, invented time)
   destroys trust faster than a missing one. This applies to every extraction path — deterministic
   parser, LLM prompt, and manual mining alike.
2. **Facts + linkback, never copy.** Extract title, date/time, venue, address, price, age range,
   category, ticket/registration URL, organizer name, recurrence — these are facts and are not
   copyrightable. Never copy source *prose* (write your own one-sentence description in your own
   words) and never copy source *images*. Every event you index must carry the exact URL it was
   found on (`source_url`) so traffic flows back to the publisher. This is what keeps the whole
   enterprise on the right side of database-right law (in the EU: the *sui generis* database
   right, e.g. Austria's UrhG §76c — extracting facts from a public database is fine, copying its
   substantial expression/structure is not). **This posture is EU-calibrated — check the local
   legal regime for your target country before assuming it transfers**, see §5.
3. **Politeness by design, not an afterthought.** Every fetch: (a) honor `robots.txt` for an
   identifying user-agent, (b) send a User-Agent string that names your bot and gives a contact
   method (e.g. `MyBot/0.1 (+https://example.com; event indexing with linkback; contact:
   you@example.com)`), (c) enforce a minimum delay **per host** (≥1 second is the value proven
   safe here) — never send two requests to the same host concurrently, (d) get speed by
   parallelizing **across different hosts**, never by shrinking the per-host delay. Municipal
   sites run on small servers; the bottleneck you should accept is politeness, not extraction
   speed.
4. **Wall-clock time, pinned to the target country's timezone, not the host machine's.** Every
   "now" / "today" / "is this event over" computation must use the country's civil timezone
   explicitly (e.g. `Europe/Vienna` for Austria), never the server's local time and never UTC
   without conversion. A first cut of this project compared stored times against the *host's*
   local clock and got both the timezone and the date-string format wrong at once — see the lesson
   in §4. If your language runtime has a timezone-aware date API (`Intl.DateTimeFormat` with an
   explicit `timeZone`, Python's `zoneinfo`, etc.), use it explicitly everywhere a "now" is
   computed; never rely on ambient/default timezone.

---

## 2. The core insight: you are finding *publishers*, not events

The naive approach — search the web for "events near me," or crawl broadly and hope — doesn't
scale and produces a firehose you can't verify. The insight that made this build work:

**Municipal event calendars are not one bespoke thing per town. They cluster on a small number of
CMS ("content management system") products, because most small municipalities buy their website
from the same handful of vendors.** In Austria, two vendors — **GEM2GO** and **RiS-Kommunal**
(RiS often running underneath GEM2GO's front end) — account for the overwhelming majority of
working municipal sources found so far (158 of 214 working sources = 73.8% resolved via a single
deterministic GEM2GO parser; see §2 of `docs/design/data-pipeline.md`). Once you've reverse-
engineered *one* CMS's HTML structure, you have a free, deterministic parser for **every town that
uses it** — hundreds of towns, one parser, $0 in LLM tokens per crawl thereafter.

This inverts the usual "discovery" problem:

- **Discovery is not web search.** It is: obtain the country's complete, official list of
  municipalities (closed set, known count) → resolve each one's official website (from the list,
  or by guessing canonical domain patterns) → deterministically probe each site for an events page
  and fingerprint its CMS by HTML signature. No LLM call is needed for this step — it's regex/DOM
  pattern matching against known markers.
- **One parser per CMS family beats one parser per town.** Before writing a bespoke parser for
  Gemeinde X, check whether X's site is already a member of a CMS family you've fingerprinted.
  Budget your parser-writing effort against "how many live sites does this CMS power," not against
  any individual town.
- **This generalizes.** Every country has some version of a municipal-CMS oligopoly (government
  procurement tends to concentrate around a handful of vendors) — go find your target country's
  equivalent of GEM2GO/RiS-Kommunal before writing any per-town scraping code. See §5 for how to
  find it.

Reference implementation of the discovery half of this: `scripts/probe-sources.mjs` in this repo —
read it even if you're rebuilding outside this repo, it's the concrete version of steps (a)–(d)
below.

---

## 3. Step-by-step recipe

This is the proven sequence, in order. Each step names the repo tool that implements it (if
inside this repo) and the general pattern (if you're rebuilding elsewhere).

### (a) Obtain the country's official municipality list

Use the **national statistics office** or equivalent authoritative registry — you want a *closed,
complete* list with a known total count, not a scraped/community list that might be missing
entries or duplicating renamed towns. (Austria: Statistik Austria's Gemeinde list; this repo's
build actually sourced its list from curated Wikipedia Gemeindelisten per Bundesland as an interim
measure — `data/sources-austria.json` / `data/sources-ooe.json`, feeding
`data/catalog/municipalities-at.json` — but the statistics office is the *correct* source and is
worth switching to; state the country's expected municipality count up front so you can measure
coverage against it later, §6.) Fields you want per municipality at minimum: name, region/state,
official website URL if the registry provides one (don't assume it will).

### (b) Resolve official domains

Where the catalog gives you a website, use it directly. Where it doesn't, guess canonical URL
patterns and try them in order until one resolves with real content (not a parking page): e.g.
`https://www.<slug>.<cctld>/`, `https://<slug>.gv.at/` (government sites), any region-specific
domain pattern you've observed (Austria: `<slug>.ooe.gv.at` for Oberösterreich,
`www.<slug>.salzburg.at` for Salzburg, `www.<slug>.tirol.gv.at` for Tirol — see
`REGION_TLD` in `scripts/probe-sources.mjs`). Slugify the town name consistently: lowercase,
transliterate special characters (ä→ae, ö→oe, ü→ue, ß→ss for German), strip remaining diacritics,
collapse non-alphanumerics to hyphens.

### (c) Probe each site deterministically — no LLM per town

This is the step that makes national coverage cheap. For each resolved site:

1. Fetch the homepage (politely — §1 rule 3).
2. Find the events-calendar page: prefer links actually present on the homepage that match your
   country's word for "events" (German: `veranstalt`) over blind guesses at common URL paths; try
   several common path conventions as a fallback (`/veranstaltungen`, `/events`, etc.).
3. **Reject the false-positive trap before trusting a match.** A URL or link text containing your
   country's generic word for "dates/appointments" (German: `termine`) very often means
   *administrative* dates, not events: waste-collection schedules, council-session dates, building
   permit hearings, funding deadlines — not a public event calendar. In one probing round here,
   37 of the first ~90 auto-registered "sources" were this trap (`briefs/mining-brief.md`). Fix:
   require the specific word for *events* (`veranstalt`, not bare `termine`) in the URL, and after
   fetching the candidate page, verify it actually contains future-dated content and that its
   `<title>` doesn't look administrative (reject titles containing your local equivalents of
   "funding," "council session," "official," "waste," "building hearing"). Do this validation from
   the start of a country build, not as a bolt-on after the fact.
4. **Fingerprint the CMS** by HTML signature: look for the specific CSS class names, ID patterns,
   or URL query-parameter shapes that a known CMS family emits (Austria/GEM2GO example:
   `veranstaltungcmsliste` container class, or the `bem`/`raster`/`collapsible` card variants; RiS:
   a `/system/web/*.aspx?...menuonr=...` URL pattern). Also test generically for structured-data
   signals that work regardless of CMS: a `<script type="application/ld+json">` block containing
   `"@type":"Event"` (schema.org JSON-LD), a `.ics`/`webcal:` calendar link, or an RSS/Atom feed
   link — these are free wins on *any* CMS, check for them everywhere.
5. Record a confidence level (e.g. high/medium/low) based on how much of the above resolved
   cleanly, so a human can triage the low-confidence tail instead of trusting everything blindly.

Reference implementation: `scripts/probe-sources.mjs` (functions `candidateSiteUrls`,
`eventPageCandidates`, `scoreEventUrl`, `fingerprintCms`, `structuredSignals`, `looksLikeCalendar`)
— read it directly, it is the executable version of this entire step, decode-entities gotcha
included (href values in raw HTML are entity-encoded — `&amp;` inside a query string must be
decoded to `&` before you resolve the URL, or you'll silently mangle every RIS/GEM2GO deep link
with a query parameter).

### (d) Register sources with region + CMS + tier

Every probed-and-confirmed source becomes a row in a `sources` registry, not a one-off script
output. Minimum fields: name, canonical URL (unique), town, region/state, CMS family (or
`unknown`/`other`), a `works` boolean (false = confirmed dead/unfetchable — JS-only single-page
apps that render nothing without a browser, TLS failures, etc. — exclude these from future crawl
attempts rather than re-probing them every run), and free-text notes for quirks. This repo's
version: `sources` table, `lib/db.js` (`upsertSource()`), schema in `db/schema.sql`. **Known gap
worth fixing before you copy this pattern**: as of 2026-07-12, this repo's `upsertSource()` has no
`region` parameter even though every registered row has a `region` value — the actual national
backfill set it via direct SQL outside the checked-in registration code path (see §2/§11 of
`docs/design/data-pipeline.md`). If you're building this fresh, put `region` in your registration
function's signature from day one; don't repeat this gap.

### (e) Crawl with the cost waterfall

The only real recurring cost is an LLM call per page. Structure every crawl as a waterfall where
each rung is free and deterministic, and the LLM is the last resort, tried only when everything
above it fails:

1. **Page-hash skip.** Fetch the page, strip to plain text, hash it (e.g. SHA-256), compare to the
   hash stored from the previous crawl. Unchanged → skip extraction entirely, don't even attempt
   parsing. This is the single biggest cost lever — municipal calendars change slowly, so the
   large majority of recrawls should cost only a fetch and a hash compare. (Measured here: with
   change-detection + the CMS parser below, 73.8% of working sources resolve at $0 in LLM tokens;
   the pre-parser naive baseline without either optimization ran ~$0.60–$1.20 per full-region pass,
   see `docs/research/scraping-cost.md`.)
2. **JSON-LD** (`schema.org/Event` blocks) — fully structured, zero LLM, and it's the cleanest
   possible source legally (the publisher chose to emit machine-readable data on purpose).
3. **iCal** (`.ics`/`webcal:` links discovered on the page) — same reasoning, follow the link and
   parse the calendar format directly.
4. **CMS-specific deterministic parser** — gated on the CMS fingerprint recorded at registration
   time (only run the GEM2GO parser on sources tagged `cms='gem2go'`, etc.). This is where the
   payoff of §2's insight lands: one parser per CMS family, reused across every town on that CMS.
   Handle the CMS's known markup variants (this repo found four live GEM2GO template variants:
   classic table, Bootstrap card list, card grid, and accordion — try each in turn, first to yield
   ≥1 event wins). Extract categories via a small keyword-map in the target language (festival,
   concert/music, market, family, exhibition/culture, sport, workshop, food, …) — **null if
   unsure, never force a guess.**
5. **RSS/Atom** — only treat a feed as an *event* source if entries carry an explicit event-date
   field beyond the ordinary publish date (an `eventdate`/`startdate`/`dtstart`-shaped tag);
   otherwise it's a news feed and doesn't belong in the events pipeline.
6. **LLM extraction — last resort only.** When nothing structured matched, hand the page's plain
   text to an LLM with a schema-constrained prompt: exact field names, explicit instruction that
   unknown fields are `null` and undated events are skipped, explicit instruction to write a fresh
   one-sentence description rather than copy source prose. **Give the model the exact key names you
   expect back** — a real bug here: the JSON-mode call told the model to respond in JSON but never
   told it the *required key names*, so it free-formed differently-named fields and every single
   extracted event silently failed the "does this have the fields I need" guard and got dropped
   (`briefs/mining-brief.md`, OÖ round). Route every LLM call through one central extraction module
   (never scatter raw provider SDK calls through feature code) so you can swap/reorder providers
   without touching call sites — this repo's version: `lib/extract.js`, called from `scripts/crawl.mjs`.

   **Verified order matters — check your own code, don't trust a stale comment.** This repo's
   actual implemented waterfall order is JSON-LD → iCal → CMS parser → RSS → LLM (confirmed by
   reading `tryStructuredExtraction` in `scripts/crawl.mjs` directly) — the file's own top-of-file
   comment claims a different order ("JSON-LD / iCal / RSS / GEM2GO") and is stale. Whichever order
   you implement, the rule that matters is: **first deterministic rung to yield ≥1 event wins, the
   LLM is only invoked if every deterministic rung yields zero.**

   Every extracted event, regardless of which rung produced it, passes the same guards before
   being written: no title or no start date → drop it; a malformed time field → discard just that
   field, don't drop the whole event; if a computed end time is before the start time (a common
   garbling of overnight events like "22:00–02:00") → null out the end time rather than publish an
   impossible interval.

### (f) Geocode with a cache

Use a free/open geocoder for batch work (Nominatim/OpenStreetMap is the reference here) — respect
its usage policy (typically ~1 request/second **global**, not per-host; serialize all calls through
one throttled queue so concurrent crawl workers can't race the same rate-limit clock — a real
regression here: concurrent host-lanes raced the same timestamp, tripped 429s, and those 429s got
miscategorized as permanent misses and cached, silently dropping every event in an entire town). If
you need autocomplete-as-you-type for a UI, use a *different* service built for that (this repo
uses Photon) — Nominatim's own policy explicitly forbids using it for autocomplete. Cache every
geocode result (hit or genuine miss) so repeat lookups are free; but see the negative-cache lesson
in §4 before you trust an old cache after changing any geocoding rule. Prefer a **POI-name-first**
strategy over raw address strings where you have a venue name: search the venue name, constrain
candidates to within a sane radius of the expected town, and prefer amenity/venue-class OSM results
over a road/waterway/boundary that happens to share the name. Self-host the geocoder for burst
volume (a national backfill) rather than hammering the public instance.

### (g) Dedup — exact and fuzzy, as two separate layers

Run two independent dedup layers, don't try to merge them into one:

1. **Exact, at write time.** Normalize title + calendar day + town into a content hash; make it a
   uniqueness constraint so re-extracting the same event (a recrawl) *updates* the existing row
   instead of duplicating it. This alone only catches byte-identical normalized keys.
2. **Fuzzy, cross-source.** Two different publishers describing the same real-world event will
   never normalize identically. Match on **all three** of:
   - **Exact calendar-day match** in the country's civil timezone — not "same weekday," not "same
     recurring series." A recurring weekly event on two different dates must never cluster as one.
   - **Same location**, either an exact normalized town-name match, or (only when **both** records
     carry better-than-town-level geocode precision) within a small distance bound (~300m proven
     here). **Never compare town-centroid fallback coordinates as if they were real positions** —
     they're a sentinel value meaning "we don't actually know exactly where this is," and two
     unrelated events in the same town will otherwise share identical centroid coordinates and
     wrongly merge (see the lesson in §4).
   - **Titles match**: exact normalized match, OR **word-boundary-aware** containment (never a raw
     substring test — in German especially, compound words mean "fest" would wrongly match inside
     "sommerfest"; pad both strings with spaces and test containment on the padded form), OR a
     token-set (Jaccard) similarity above a threshold (0.75 proven here).

   Run this as a **periodic sweep** over everything already published, not just at insert time,
   to catch cross-source dupes that both predate each other (neither insert-time check saw the
   other yet). When you cluster more than two records, always compare each new candidate against
   the cluster's single canonical (oldest) member — never chain comparisons against every member
   already added — otherwise two long, unrelated titles sharing a common boilerplate suffix can
   drag an unrelated event into the wrong cluster (a real finding here, `lib/dedup.js` review
   notes). Document explicitly what this layer does **not** catch: the same event listed with a
   genuinely different date on two sources (one source simply has the date wrong) will never
   cluster, because the exact-day requirement is by design.

   Reference implementation (pure functions, no DB dependency, easy to port): `lib/dedup.js` in
   this repo.

### (h) Verify events are actually published, per region — never trust a green checkmark

The crawl pipeline can run cleanly, log success, and still silently publish **zero** events for an
entire region because of an unrelated bug earlier in the pipeline (a poisoned geocode cache, a
schema mismatch in the LLM response, a CMS parser matching zero events on a variant it doesn't
handle). After every crawl batch, explicitly query and report: how many events are now published
**per region**, not just an aggregate total. A real incident here: geocode sanity bounds were
widened for a new region, but stale cached geocode *misses* from the old (narrower) bounds were
never purged — so one town's site extracted 25 events, correctly matched every field, and
published exactly zero, with no error anywhere in the log (the "Bad Ischl bug," see §4). Only a
row-count check per region caught it. **Assert row counts per region after every batch; don't
infer success from the absence of errors.**

---

## 4. Tips & tricks / failure catalog

Every entry below is a real thing that happened during this build, generalized into a portable
rule. Treat this as a pre-flight checklist before you declare any step "done."

- **Sentinel values are not data.** A fallback/default value (a town-centroid coordinate used when
  a precise address isn't known; `null` used to mean "always open" for opening hours) looks like
  real data structurally but carries none of its precision. Any code path that later treats it as
  real data (distance comparisons, "always open" badges) will silently misbehave the moment a new
  data source starts populating that field at scale. **When you add a new data source or data
  class, grep every consumer of the fields it populates and ask: "does this code assume a
  precision or meaning that this new data doesn't actually have?"** This bit twice in one day here:
  town-centroid coordinates being compared as if they were precise venue positions (merged ~50
  unrelated events), and `null` opening-hours being displayed as "always open" (mislabeled 54
  newly mined venues).
- **Negative caches outlive the rule that produced them.** Any time you change a validation rule
  that a cache depends on — geocode sanity bounds, a matching threshold, a schema — the cache's
  *negative* entries (cached "this failed" results) are now stale and will keep failing under the
  new rule even though the new rule would have accepted them. **Purge negative cache entries in the
  same change that alters the rule feeding them.** Misses are cheap to recompute; keeping them
  silently blocks whatever the rule change was meant to unblock (the Bad Ischl incident above).
- **Word-boundary matching, never raw substring, for any natural-language containment test** —
  title matching, category keyword matching, anything. Compound-word languages (German especially)
  make raw substring tests wrong in both directions ("fest" inside "sommerfest").
- **Generic institutional names collide nationwide.** Words like "Gemeindeamt" (town hall) or
  "Pfarrzentrum" (parish center) appear as a venue name in nearly every town in the country. Never
  accept a name-based POI geocode match without also bounding it by distance to the expected town —
  otherwise you'll confidently geocode a venue in one town to the identically-named venue 300km
  away.
- **One bad value must never kill a batch.** Coerce/validate at the write boundary (guard clauses
  right before insert: missing title/date → drop just that row) and isolate failures per-event, not
  per-batch — one malformed record from one source must not abort the whole crawl run.
- **A probe/crawl step that stores its change-detection hash without actually extracting makes the
  *next* run silently skip a page that was never truly processed.** Make sure "we looked at this
  page" and "we successfully extracted from this page" are tracked separately, or a first-run bug
  becomes permanently invisible (the page will look "unchanged" forever after).
- **Recurring series vs. duplicates**: a weekly/monthly recurring event and "the same event
  reported twice" look identical unless you require an *exact* date match for dedup clustering. Get
  this requirement right (§3g) or you'll either merge distinct occurrences of a series into one, or
  fail to catch true cross-source duplicates.
- **List-page vs. detail-page duplicates**: many CMSs render a short summary of each event on the
  calendar list page *and* a full version on its own detail page — make sure your parser targets
  one or the other consistently, not both, or you'll double-ingest every event from a single source
  on a single crawl.
- **The aggregator layer is your highest-yield source category — go find it by name, per region.**
  City-wide event calendars, regional tourism-board sites, and regional media outlets each
  typically list many small municipalities' events in one place, at a much higher events-per-source
  ratio than any single Gemeinde site. Identify your target country/region's equivalents (Austria:
  city calendars like linztermine.at, tourism boards like oberoesterreich.at, family-card programs
  like familienkarte.at) — these are usually worth registering even before you finish the long tail
  of individual municipalities.
- **Check the country's open-data portal FIRST, before scraping.** A licensed, structured feed
  beats an HTML scrape every time — it's more reliable, legally cleaner, and free of the
  false-positive/CMS-fingerprinting work entirely. This build found two real candidates on a single
  research pass for Austria: a city's official event-calendar XML export (blocked pending an access
  request) and a national tourism board's ContentDB API (CC-BY-4.0, broad national coverage) — see
  `docs/research/open-event-sources.md` for the full methodology and the ranked list of what to
  pursue vs. skip (most commercial event platforms — Eventbrite, Meetup, Ticketmaster, Facebook —
  turned out to be ToS-gated, closed to new integrations, or simply the wrong content category;
  don't assume any of them are a shortcut without checking their current terms yourself). Do this
  research pass **before** committing to a full scraping build for a new country — it's a day of
  research that can save weeks of scraper maintenance.
- **~90% of pages resolve as structured-or-unchanged once the waterfall is respected, so LLM cost
  stays single-digit €/month per country even at national scale.** If your LLM cost is
  materially higher than that, you've probably skipped a rung in the waterfall (no change
  detection, no CMS-specific parser, or the LLM is being called before the deterministic rungs are
  exhausted) — the waterfall's entire economic argument depends on trying every free rung first,
  not treating it as optional plumbing.
- **One control, one meaning; async UI actions need instant feedback.** Tangential to mining
  itself but bites the product built on top of this data: don't let a UI element serve two
  different meanings to save space (e.g. a search box that also displays "where you currently are"
  as its resting state — confusing which one you're looking at), and any button triggering an async
  fetch (a location lookup, a live search) should respond within ~100ms with *something* visible
  (a last-known position, a loading pulse) rather than staying silent for seconds and then showing
  one generic error regardless of cause.
- **Verify your dev/build environment isn't lying to you before you bisect a diff.** Deleting build
  caches (e.g. Next.js's `.next` directory) while a dev server or build process is actively using
  them produces confusing runtime errors that look exactly like a code bug but aren't. If you hit a
  bizarre "cannot read property of undefined" class error right after a cache-clearing operation,
  stop any running dev process, clear the cache once cleanly, and rebuild before assuming your code
  changed anything.
- **Get the "now" computation right in the target civil timezone from day one** (§1 rule 4) — this
  class of bug is easy to introduce (any bare `new Date()` comparison, any string-comparison of
  date fields with mismatched separators) and easy to miss in testing if your dev machine happens
  to sit in the target timezone already.
- **Any recurring/cross-cutting invariant (ends-after-starts, dedup, geocode fallback) must be
  applied on *every* write path, not just the one you tested.** If events can enter your database
  from multiple entry points (a scheduled crawl, a manual seed script, a user-submission API,
  a scanned-poster flow), grep for every insert path and confirm the guard is applied on all of
  them — a guard added to only one path silently lets bad data in through the others.

---

## 5. What to adapt per country

Everything in §3 is a pattern, not a literal script — here's what changes when you move to a new
country:

- **Municipality structure + authoritative count source.** Find the national statistics office's
  (or equivalent) official administrative-division list — this gives you both the town list and,
  crucially, the *expected total count* you'll use to measure coverage (§6). Some countries have
  multiple administrative tiers (province/region/municipality, or state/county/city) — decide which
  tier maps to "one crawlable local government website" for your purposes.
- **CMS vendor landscape — find the local oligopoly.** Probe ~30 municipal sites at random (or
  clustered by one administrative region) and count which HTML fingerprints repeat. Whichever
  handful of signatures cover the most sites are your target CMS families — write one deterministic
  parser per family, in descending order of coverage. Don't assume Austria's specific vendors
  (GEM2GO, RiS-Kommunal) transfer to another country; the *pattern* (government-site CMS
  procurement concentrates on a few vendors) is what transfers, not the vendor names.
- **Geocode sanity bounds.** Set a lat/lng bounding box for the target country (with a small
  margin) and use it to reject obviously-wrong geocode matches. Widen it deliberately as you expand
  coverage region by region — and remember to purge negative geocode-cache entries every time you
  widen it (§4).
- **Language + date-format handling.** Category keyword-matching, "false positive" trap words
  (Austria: `termine` vs `veranstalt`), month-name parsing for long-form dates, and word-boundary
  compound-word handling are all language-specific — rebuild these lists/rules for the target
  language rather than assuming German patterns transfer.
- **Timezone.** Pin every wall-clock computation to the target country's civil timezone (§1 rule
  4). Note some countries span multiple timezones — pick per-region if that applies to you.
- **Legal regime.** The "facts free, expression protected" posture in §1 rule 2 is calibrated to
  EU database-right law. Outside the EU, check the local equivalent before assuming the same
  extraction posture is safe — copyright/database-protection law varies significantly by
  jurisdiction (e.g. U.S. law has no direct equivalent to the EU's *sui generis* database right,
  but has its own case law on scraping and copyright that you should check independently; don't
  port this section's legal conclusion, only its methodology of "go check, then write down the
  reasoning").
- **Tourism-board and aggregator equivalents.** Every country/region tends to have a national or
  regional tourism-promotion body that publishes an event calendar aggregating many local
  publishers — find its name and check whether it has an open-data feed before scraping it (§4).

---

## 6. Quality gates before declaring a country "done"

Don't call a region or country complete until all of these pass:

1. **Coverage vs. municipality count.** What fraction of the authoritative municipality list (§3a)
   has a registered, working source? Report this explicitly, not just "N sources registered" —
   registered-but-`works=false` and registered-but-never-probed don't count as coverage.
2. **Per-region published-event assertions.** Query published event counts grouped by
   region/state, not just a national total (§3h). A silent zero in one region while the aggregate
   total looks healthy is exactly the failure mode that bit this build once already.
3. **Dedup dry-run reviewed by a human.** Run the fuzzy-dedup sweep (§3g) in dry-run/report mode
   and have a person actually look at the proposed merge clusters before applying them — automated
   dedup logic making a wrong merge (or missing an obvious one) is easy to miss without a spot
   check, and merges are harder to undo than they are to prevent.
4. **Spot-check ~20 random published events against their source.** Open the `source_url` for a
   random sample and confirm the title, date, time, and venue actually match what's on the page.
   This is the cheapest, highest-signal check available and catches whole classes of extraction
   bugs (wrong date parsing, wrong field mapping) that automated tests won't.
5. **Geocode sanity — no pins in the wrong place.** Visually or programmatically check that
   geocoded event locations land in plausible places (on land, near the stated town, not in a
   river or an ocean). A real example here: an event's venue name matched an OSM way that happened
   to be a footbridge/pavilion feature near a river, and the geocode landed the pin in the water
   rather than the actual building — a distance-bound + venue-class-preference fix (§3f) is what
   prevents this class of error; re-check it holds after any geocoding rule change.

---

## 7. Handoff checklist

When you finish a mining pass for a country/region, deliver these artifacts back — a mining run
that produces events but no registry/stats artifact is not reusable by the next person or the next
scheduled crawl:

- [ ] **Municipality catalog file** — the resolved list used for this pass (name, region, website,
      count), stored so the next pass can diff against it rather than re-deriving it.
- [ ] **Probe results** — every site probed, whether a working events page was found, the CMS
      fingerprint (or `unknown`/`none`), and a confidence rating — including the ones that
      *failed* (dead site, JS-only SPA, no events page found), so nobody re-probes them blindly
      next time.
- [ ] **Registered sources** — the actual registry rows written (name, URL, region, CMS, `works`
      flag, notes), not just the probe output — probing and registering are different steps and
      both need to leave a trace.
- [ ] **Crawl stats per region** — events found per region, per CMS family, per feed-type (how many
      resolved via JSON-LD/iCal/CMS-parser/RSS/LLM) — this is what tells the next person which CMS
      family is worth a dedicated parser next, and gives you the coverage/cost numbers for §6.
- [ ] **Error/failure-shape log** — the specific things that didn't work and why (sites needing a
      browser to render, TLS failures, robots.txt blocks, false-positive administrative pages
      caught and rejected) — this is what prevents the next pass from re-discovering the same dead
      ends the hard way.

---

*Distilled 2026-07-12 from the Austria build of Okolo (okolo.events). Source material: this repo's
`docs/design/data-pipeline.md`, `tasks/lessons.md`, `briefs/mining-brief.md`,
`briefs/austria-backfill-brief.md`, `briefs/gem2go-parser-and-source-rating-brief.md`,
`docs/decisions/2026-07-11-crawl-scaling-and-legal.md`, `docs/research/open-event-sources.md`,
`scripts/probe-sources.mjs`, `lib/dedup.js`. If you're extending this playbook after mining a new
country, add what you learned back into §4 (tips) and §5 (what to adapt) — the failure catalog is
the most valuable part and it should keep growing.*
