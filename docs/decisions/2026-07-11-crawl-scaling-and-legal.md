# 2026-07-11 — Crawl scaling architecture + legal posture

Status: adopted direction (build order below; steady-state items post-validation unless marked) ·
Owner: Architect. Companion: `docs/research/scraping-cost.md` (measured numbers, Agent 3) and
`docs/decisions/2026-07-11-middle-layer-strategy.md` (why supply is the game).

## Principle: never call the LLM unless we have to

The only real cost in crawling is the LLM call per page. The whole architecture is a waterfall of
free layers with the LLM as last resort:

1. **Change-detection (biggest lever, smallest build).** Store a content hash per fetched page
   (`sources.page_hash`); unchanged since last crawl → skip extraction entirely. Municipal calendars
   change slowly → expect 80–90% of recrawls to cost a fetch and a compare, i.e. nothing.
2. **Structured feeds first.** Many sites already publish schema.org JSON-LD, iCal, or RSS. Parse
   those deterministically — zero LLM, and legally the cleanest possible source (machine-readable
   data published on purpose). Detect at probe time, prefer forever.
3. **Deterministic CMS parsers.** RiS-Kommunal + GEM2GO power most Austrian Gemeinde sites (our own
   mining finding). One parser per CMS = hundreds of towns at ~$0/page. LLM only for the weird ones.
4. **Tiered cadence.** City calendars (linztermine, familienkarte) daily-ish; sleepy villages weekly.
   Geocoding already cached (`geocache`), Nominatim free.
5. **LLM extraction (Gemini Flash-Lite → Haiku fallback) as the fallback layer only** — new sources,
   changed unstructured pages, PDFs, posters.

**Scale math (order of magnitude, see scraping-cost.md for measured):** ~500 municipalities, ~90%
structured-or-unchanged → ~50 real LLM calls/day ≈ **single-digit €/month for all of Austria.**
"One region at a time" stays a *demand/focus* strategy — supply-side, anywhere is cheap by design.

## Two supply modes — different tools, different jobs

- **Bootstrap (one-off): agent mining.** Claude Code subagents (Sonnet/Haiku) reading sites and
  emitting `data/mined/*.json`. Token-hungry per page (10–50× pipeline extraction) but covered by the
  Claude subscription — marginal cost ≈ time, not money. Right tool for: discovering sources, first
  sweep of a new area, weird one-off sites. Output must always be registered into `sources` so the
  pipeline can take over (bookkeeping rule).
- **Steady state (recurring): the crawl pipeline** (`scripts/crawl.mjs` + waterfall above). Right
  tool for: keeping everything fresh forever at near-zero cost. Agents never become the recurring
  crawler — that would be the expensive, artisanal, non-repeatable path.

## Legal posture: facts are free, expression is not

- **Extract facts without limit:** title, date/time, venue, price, age, category, ticket/registration
  URL, organizer name, recurrence (RRULE), opening hours, accessibility. Facts are not copyrightable.
  Going *deeper* on fields is legally free.
- **Never copy expression:** no source prose (we write our own one-liners — already doing), no photos
  (EU database right / UrhG §76c wall). Unchanged hard rule #1.
- **Three cheap shields, all policy:** (a) linkback on every event (`source_url` — already a hard
  rule): traffic back = goodwill, not competition; (b) robots.txt respect + per-source rate limiting +
  an identifying User-Agent ("UmkreisBot … contact URL"): polite citizen; (c) transform + aggregate
  (geocode, dedup, re-describe, cross-source merge) = a new work, not a copy of anyone's database.
- **The endgame removes the risk:** "claim your event" + RiS/GEM2GO write-integration = organizers
  hand us data with consent, no crawling. Crawl is the bootstrap; consented supply is the moat.
- **A deterministic parser adds NO new legal surface** (2026-07-11): it reads the *same* public HTML we
  already fetch for the LLM — it changes how we parse, not what we access. GEM2GO's own ToS don't bind
  us (no account/API); the operative signal stays each municipal site's robots.txt, which we honor. The
  one thing "extract as fast as possible" must NOT break is the **per-host rate limit** — GEM2GO runs on
  small municipal servers; speed comes from concurrency across *different* hosts, never hammering one.
- **Honest caveats:** managed risk, not zero risk — a source can still object on ToS grounds; the
  response is linkback-value + flipping them to the claim path, or dropping them. GDPR: keep organizer
  personal data to public-event facts (name of the Verein, not private phone numbers of volunteers).
  The Familienkarte / Land OÖ partnership ask remains the cleanest permission path of all.

## Build order (cheap wins first)

1. **Page-change hash → skip unchanged** — small; makes the crawl cron near-free. *(OK to build now:
   it's crawl infrastructure the validation phase already uses.)*
2. **JSON-LD + iCal/RSS ingestion** — medium; free structured events. *(OK now, same reason.)*
3. **robots.txt + per-source rate limit + identifying UA** — small; legal hygiene. *(OK now.)*
4. **RiS-Kommunal + GEM2GO deterministic parsers** — medium, huge payoff. *(Build when probe data
   shows which patterns dominate; naturally follows the OÖ probe round.)*
5. **More fact fields in the extraction schema** (ticket URL, price, organizer, RRULE) — small.

**Sequencing discipline unchanged:** none of this outranks the four-weekend Linz test. Items 1–3 are
justified now only because they cut the cost/legal risk of the crawl the test itself depends on.
