# EU-scale extraction architecture

Status: proposed · Owner: Architect · Date: 2026-07-14
Extends: `docs/decisions/2026-07-11-crawl-scaling-and-legal.md` (the waterfall principle — unchanged)
Companions: `docs/research/scraping-cost.md`, `docs/playbooks/country-mining-playbook.md`

**Scope:** what has to change to recrawl all of the EU — and, if we go big, the planet — on a
self-hosted box, without rearchitecting when we grow. This does **not** revisit the waterfall
(change-detect → structured feeds → CMS parser → LLM last). That decision stands and scales fine.
This is about the constraints that appear *after* it.

---

## Thesis: at continental scale, tokens are not the constraint

This is the headline, and it inverts the intuition that started this thread. Run the numbers on a
mature EU pipeline — ~5,000 target municipalities (the top towns by population cover most of the EU
population), recrawled weekly:

| Stage | Volume | Cost |
|---|---|---|
| Fetches | ~5k source pages/wk | ~0.2 req/s aggregate — nothing |
| Survive change-detection | ~10–15% → ~600/wk | free |
| Handled by feed or CMS parser | ~75% of those | free |
| **Reach the LLM** | **~150 sources/wk** | **low single-digit €/month** |
| One-time cold bootstrap (5k fresh sources, no parsers) | ~500M input tokens | **~€25–50, once** |

Even the cold start is a rounding error. The 2026-07-11 waterfall already won the cost argument;
extending it from Austria to the EU multiplies a number that is already near zero.

**So stop optimizing tokens.** The things that actually break at 100× scale are:

1. **Geocoding throughput** — a hard, serialized ceiling. *The* bottleneck. (§1)
2. **Re-extraction cost** — today a parser bug means re-crawling the continent. (§2)
3. **Parser coverage** — the only real leverage, and it's currently un-instrumented. (§3)
4. **Source discovery** — agent/human time, not compute. (§4)
5. **Horizontal headroom** — one box must become N boxes without a rewrite. (§5)

Everything below addresses one of those five. Nothing else earns its place.

---

## 1. Geocoding is the actual ceiling — self-host Nominatim

`lib/geocode.js` serializes **every** lookup through one global 1.1s gate, with a comment recording
the 429 storm that already bit us on the NÖ backfill. That gate is correct today (it honors
Nominatim's public usage policy) and fatal tomorrow:

| Backfill | Unique venues | Serialized at 1.1s |
|---|---|---|
| Austria (today) | ~10k | ~3 hours — survivable |
| EU | ~200k | **~61 hours** |
| Planet | ~2M | **~25 days** |

The `geocache` saves steady state, but any bulk import or negative-cache purge
(`purgeNegativeGeocache()`, which we *must* run whenever a geocoding rule changes) triggers a
cache-miss storm that stalls the entire pipeline behind a 1.1s queue.

**Fix: self-host Nominatim on a Geofabrik extract.** Europe extract, ~1 day import on NVMe. Then
delete the throttle — lookups go to thousands/sec, and the EU backfill drops from 61 hours to
minutes. Build Photon from the same DB and the autocomplete dependency in
`app/api/geocode/route.js` comes home too.

This is the single highest-leverage piece of infrastructure in this document, and it is the correct
target for the "not limited by external API calls" instinct. Not the crawler — the geocoder.

- Europe: ~1TB NVMe, 32–64GB RAM (64 for a comfortable import).
- Planet: same shape, bigger extract; the architecture does not change.
- `lib/geocode.js` keeps its interface. Swap the endpoint, drop `throttle()`, keep the cache
  (it's still a free hit and a portability seam).

**Cheap stopgap, worth doing first:** `lib/towns.js` holds centroids for only ~17 towns around Linz,
so every *new* region's centroid fallback pays the 1.1s toll. Pre-populating all ~2,100 Austrian
municipalities is a few hours' work and unblocks the AT build-out immediately. But note what it does
*not* fix: centroids are the **fallback** path — venue and street addresses are the **hot** path, and
those (~200k unique at EU scale) still go through Nominatim. The two stack; the table is not a
substitute for the self-host.

## 2. Store raw pages — never re-fetch to fix a parser

The one component we are missing outright. Today, extraction reads the live fetch. So a parser bug,
a schema change, or a new field in `EVENT_PROPS` means **re-crawling the continent** — slow, rude to
municipal servers, and it destroys the change-detection state that makes the pipeline cheap.

**Fix: a content-addressed raw page store.** Every fetch writes `sha256(body) → pages/ab/cdef…gz`.
Extraction reads from the store, never from the network.

- Cost is trivial: 5k sources × ~20 pages × ~100KB, gzipped ≈ **~2GB per EU snapshot.** Planet ~20GB.
- Buys: re-extract the entire EU offline, for free, in minutes. Backfill a new field across history.
  Diff parser versions against real fixtures. Reproduce any bug without touching a live site.
- Also the politest thing we could possibly do: we fetch each municipal page exactly once.

At this scale, **the ability to re-parse without re-fetching is worth more than any model choice.**

## 3. CMS fingerprinting is the scaling engine — instrument it

Municipal sites cluster hard on a few CMS vendors per country. We found this by accident and already
exploit it — `lib/sitepark-events.js`, `lib/dvv-events.js`, `lib/kreativregion-events.js`, and the
RiS-Kommunal / GEM2GO work — but we treat each as a one-off. At EU scale it is *the* growth curve:
**one parser per CMS unlocks hundreds of towns at €0/page, forever.**

**The cost of *not* measuring this, in real numbers.** Current `cms` distribution across our mined
catalogs:

| `cms` | sources | parser? |
|---|---|---|
| gem2go | 1,275 | ✅ |
| **other** | **447** | ❌ |
| **unknown** | **408** | ❌ |
| custom | 53 | — |
| ris | 29 | ❌ |
| rss / jevents-ical / dvv | 36 | ✅ |

An independent code review (Gemini, 2026-07-14) read the pipeline and proposed *"build a RiS parser"*
as its top improvement. RiS is 29 sources. **The unclassified bucket is 855** — thirty times larger,
and invisible because nothing systematically fingerprints those rows. That is the entire argument for
this section in one table: without the metric, even a careful reviewer optimizes the wrong cluster.
(Counts are from `data/` catalogs; confirm against the live `sources` table before acting.)

`sources.cms` and `sources.feed_kind` already exist. What's missing is making them drive the work:

- **Fingerprint at probe time.** Extend `scripts/probe-sources.mjs` to sniff the CMS (generator meta,
  asset paths, URL shape, footer signature) and write `sources.cms` for every source — including
  `unknown`.
- **Publish a coverage metric.** A standing query: *CMS → # towns → # with a parser*. Sort by towns
  unlocked. That ranked list **is** the engineering backlog. Never guess which parser to write next.
- **Rank countries by events-per-parser**, not by market size. A country where 400 towns run one CMS
  is worth more than a bigger country with 400 bespoke sites.

This turns EU expansion from "5,000 scraping problems" into "maybe 30–50 parsers."

## 4. Source discovery is the real bottleneck — keep it agent work

Fetching 5,000 towns is ~0.2 req/s. Trivial. *Finding* 5,000 municipal calendars across 27 countries
and 24 languages is the hard part, and it's agent/human hours, not compute.

Per the 2026-07-11 two-supply-modes split, this stays **bootstrap** work (Claude Code subagents,
covered by subscription) and must always terminate in a registered, crawlable `sources` row.
`docs/playbooks/country-mining-playbook.md` is the unit of work; per country:

1. Check for a **national open-data event feed** first (several EU states publish one) — that can
   replace hundreds of crawls with one ingest.
2. Fingerprint the dominant municipal CMS → write one parser → harvest the long tail.
3. Register everything with `works=true` and a cadence. Extend `CRAWL_SCOPES` per country; the
   gating in `lib/crawl-scopes.js` is already the right shape for a deliberate, country-by-country
   supply boundary.

**Hard rule 7 needs enforcement, not memory, at this scale.** A source parked at `works=false` with
"refresh only with script X" is invisible rot, and at 5,000 sources nobody will notice by eye. Add a
**rot detector**: a standing check for `works=true` sources whose `last_crawled` exceeds their
cadence, plus any `zero_streak` climbing on a source that used to produce. Fail loudly.

## 5. Horizontal headroom — claim-queue now, N boxes later

To go from one PC to many (or burst to cloud) without a rewrite, workers must be **stateless** and
the queue must live in **Postgres**:

```sql
SELECT * FROM sources
WHERE works AND tier <> 'dead' AND due(cadence, last_crawled)
ORDER BY last_crawled NULLS FIRST
FOR UPDATE SKIP LOCKED LIMIT 10;
```

`FOR UPDATE SKIP LOCKED` is the whole trick: any number of workers, on any number of machines, pull
disjoint batches with no coordinator, no lock contention, and crash-safe redelivery. Add a
`claimed_at` / `claimed_by` pair to `sources` and the current single-process crawl becomes an
N-machine fleet with no change to the extraction path.

**Concurrency lives across hosts, never within one.** The per-host ≥1s politeness delay stays
absolute regardless of worker count — that is a legal commitment (§Rejected), not a tuning knob.
GEM2GO and friends run on small municipal servers.

Layer the fetch savings while we're here: add **conditional GET** (`ETag` / `If-Modified-Since`) on
top of the existing `page_hash` check. `page_hash` skips *extraction*; conditional GET skips the
*transfer* — most nightly fetches become a 304 and cost nothing on both ends.

---

## Explicitly rejected

**VPN / rotating proxies / residential IP pools.** This would cost us our legal position, to solve a
problem we do not have.

Our entire defense under the EU database right / UrhG §87b is hard rule #1 plus the three shields in
the 2026-07-11 decision: we index *facts*, we link back, we identify ourselves (`UmkreisBot/0.1`
with a contact address), we honor robots.txt, we rate-limit per host. That posture is the argument.
Rotating IPs to evade blocks reclassifies us from *polite indexer* to *circumvention* — it is the
first fact a hostile lawyer would reach for, and it would undermine the shields we are otherwise
paying real engineering cost to maintain.

It also solves nothing. We hit each municipal host ~30 times a *week* at 1 req/s; nobody blocks that.
If a town ever does block us, the correct response is an email asking for a feed — which is the
*consented supply* endgame the middle-layer strategy is aiming at anyway. And most VPN exit nodes are
datacenter ranges that are already on blocklists, so it would measurably make things worse.

**Apify.** Managed crawler hosting: their compute, their scheduler, their rented proxy pool, a
marketplace of pre-built actors. We'd be paying mainly for the proxy pool (rejected above) and for
actors we don't need. Our own pipeline already does more than a generic actor would.

**Thread/concurrency maximization.** The aggregate EU crawl is ~0.2 req/s. There is no fetch
throughput problem to solve. Threads would only let us violate the per-host delay faster.

**Agents as the recurring crawler.** Unchanged from 2026-07-11 — 10–50× the tokens per page and
non-repeatable. Agents bootstrap; the pipeline refreshes.

---

## Build order

Sequenced so that everything early is a straight win we'd want even if the EU never happens.

| # | Item | Why now | Size |
|---|---|---|---|
| 1 | **Raw page store** (content-addressed, gzip) | Unblocks free re-extraction forever; the longer we wait the more history we can't re-parse | S |
| 2 | **Self-hosted Nominatim + Photon** (Europe extract) | Kills the 1.1s ceiling; removes an external dependency and a known failure mode | M |
| 3 | **CMS fingerprint at probe + coverage metric** | Turns parser work from guesswork into a ranked backlog | S |
| 4 | **Conditional GET** on top of `page_hash` | Cuts the fetch itself; small change, immediate | S |
| 5 | **Rot detector** (hard rule 7 enforcement) | At 5k sources, silent rot is guaranteed without it | S |
| 6 | **Claim-queue** (`FOR UPDATE SKIP LOCKED`, `claimed_at/by`) | One-line-ish change that buys N-machine scale on demand | S |
| 7 | **LLM leftovers via Batch API** (50% off, 24h) | A nightly crawl has zero latency requirement | S |
| 8 | **Country onboarding** (national feed → CMS parser → tail) | The repeatable EU unit — *post-Linz* | per-country |

Items 1–7 are all local-box / pipeline infrastructure and together they are perhaps a weekend.

## The box

One machine. Not exotic: ~1TB NVMe (Nominatim's Europe import dominates), 32–64GB RAM, any modern
CPU. Runs local Postgres+PostGIS (mirrors the Supabase target — hard rule #4), Nominatim + Photon,
the crawl workers, Playwright for the JS-heavy minority, on a systemd timer.

It writes to Supabase over the network, which is a bonus: it puts the **writer off-Vercel** and
cleanly satisfies hard rule #6 (serverless is read-only + ephemeral) instead of working around it.

---

## Sequencing discipline

Unchanged and load-bearing: **none of this outranks the four-weekend Linz test.**

Items 1–7 are defensible now because they cut cost, remove a known failure mode (the geocode 429
storm), and make the crawl the validation test itself depends on cheaper and more reliable. Item 3
(CMS fingerprinting) directly improves Linz and Stuttgart coverage today.

**Item 8 — actually registering 27 countries of sources — is past the gate.** It is the one part of
this document that builds supply for a product that has not yet shown anyone comes back. Hold it
until Linz answers.
