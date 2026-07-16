# Crawl SOTA 2026 — six-topic research pass

Researched 2026-07-16, filling gaps left by a prior fan-out run (topics 3–6 were delivered then;
topics 1–2 and this document itself were not). Verified against our own code
(`scripts/crawl.mjs`, `lib/crawl-net.js`, `lib/cms-fingerprint.js`) and today's fingerprint sweep
(`data/catalog/fingerprint-report.json`, 931 sources). Companion: `docs/design/data-pipeline.md`.

Our scale for context: **~1,741 working sources**, daily cron, static cadence tiers (active 2d /
slow 5d / dormant 7d), ~840 sources on the LLM fallback, 46 blocked in today's sweep (18 = 200-status
bot-challenge pages, 7 = hard 403s, rest robots/transient), only 3 confirmed JS-SPA. Every technique
below is judged **at this scale**, not at Google/Common-Crawl scale — a lot of Google-lineage
literature assumes crawl budgets and infrastructure we don't have and don't need.

## Executive summary

- We already do the two cheapest freshness wins (page-hash skip, conditional GET) — the academic
  "change-frequency estimator" literature (Cho/Garcia-Molina) would buy maybe 1–2 fewer wasted
  fetches/week per source; not worth the modeling machinery at 1,741 sources on a 2–7 day cadence.
- **Sitemaps are a DISCOVERY mechanism for us, not a change signal** (architect follow-up, §1):
  leonding.at's events sub-sitemap enumerates **873 event detail URLs with per-event `lastmod`** —
  but those detail pages carry **no structured data**, so sitemap→detail *multiplies* LLM cost
  (873 extractions vs 1 listing) unless strictly `lastmod`-gated. As a mere change-signal it's worse
  than the conditional GET we already have (it adds a request instead of saving one). Adopt-now, but
  only as lastmod-gated detail discovery behind the existing rungs — never as ungated enumeration.
- WebSub/PubSubHubbub is alive on blogging platforms in 2026 but we found **zero evidence** any
  municipal CMS in our clusters (gem2go, TYPO3, WordPress, RiS-Kommunal) advertises a hub — skip.
- **Web Bot Auth is the single highest-leverage new finding.** It moved from proposal to an active
  IETF working group (chartered early 2026) and a live Cloudflare "Verified Bots"/"signed agents"
  program in the same window we're measuring 200-status challenges and hard 403s. It's genuinely
  implementable by a small operator (Ed25519 key, static JWKS file, 3 signed headers) — but it only
  helps on Cloudflare-fronted zones whose owner hasn't overridden defaults, so it raises odds, it
  doesn't guarantee unblocking.
- HTTP/2 or HTTP/3 for our crawler is not worth building: our own 1 req/s/host politeness cap is a
  far tighter bottleneck than protocol overhead, and Node's global `fetch` doesn't do H2 without a
  dispatcher swap we'd have to build and maintain for near-zero payoff.
- **We do not parse Microdata anywhere in the pipeline** — confirmed by reading the code, not
  inferred. This is a real, unmeasured miss risk given WDC 2024 puts Microdata at 46% of
  structured-data-emitting sites overall.
- JS-SPA (topic 3), LLM cost/quality (topic 4), dedup (topic 5), and Germany discovery (topic 6)
  findings are carried over verbatim from the prior run with their original citations and
  soft/hard sourcing labels intact (see those sections) — no re-research was done there.
- Legal/ToS posture across all of this stays clean: everything recommended is
  robots-respecting, honestly self-identifying, facts-only — the same posture the hard rules
  already commit us to. Web Bot Auth in particular *strengthens* that posture (cryptographic
  proof of the identity claim we already make via UA string).

---

## Topic 1 — Revisit scheduling

**Foundational lineage.** Cho & Garcia-Molina, "Estimating Frequency of Change," ACM TOIT 3(3),
2003 (http://oak.cs.ucla.edu/cho/papers/cho-freq.pdf) is the canonical result: given a short history
of "did this page change since last visit" observations (from repeated fetches, not full content
diffs), a Poisson-process estimator predicts per-page change frequency well enough to claim ~35%
better freshness than uniform recrawling at the same fetch budget. The companion paper, "Effective
Page Refresh Policies for Web Crawlers" (ACM TODS, Cho & Garcia-Molina), turns the estimate into a
schedule. **Modern lineage**: Olston, "Recrawl Scheduling Based on Information Longevity" (Olston &
Pandey-style follow-on) reframes the problem around *how long freshly-changed content stays useful*
rather than raw change rate — closer to our case, since an event's "freshness window" is bounded
by its own date, not an arbitrary decay curve.

**Fit for us.** We already implement the crude version of this: `deriveTier()` in
`scripts/crawl.mjs` (line 758) buckets sources into active/slow/dormant/dead using `avgYield` and
`daysSinceChange`, with hash-based unchanged-skip (`page_hash`) as a per-crawl short-circuit. That
*is* a change-frequency estimator, just with 3 discrete cadence buckets (2/5/7 days) instead of a
continuous Poisson estimate. A Cho-style continuous estimator would tighten scheduling further, but
the ceiling on savings is small: our real cost driver is the LLM-fallback token spend on ~840
sources, not wasted HTTP round-trips (each conditional/hash-skip fetch is already near-$0). **Verdict:
skip** — the sophistication doesn't pay for itself below tens of thousands of URLs.

**Sitemap `lastmod` as a change signal.** Google's own guidance treats sitemap `changefreq` as "only
a hint" it frequently ignores, but `lastmod` is treated differently — multiple sources describe
Bing's crawl-scheduling revamp specifically to weight *trusted* `lastmod` values higher after finding
most `changefreq`/`priority` tags were unreliable (blogs.bing.com, 2023 — dated, but the accuracy
finding is still the operative industry lesson repeated in 2025-26 SEO literature). **We spot-checked
this against our own cluster today** (2026-07-16, not secondhand): `https://www.leonding.at/sitemap.xml`
and `https://www.wels.gv.at/sitemap.xml` — both TYPO3 sources from today's `typo3-generic`
adapter-candidate bucket (87 sources) — each returns a valid sitemap **index** with a per-sub-sitemap
`lastmod`, and critically each has a **dedicated "Events" sub-sitemap** separate from Pages/News.
TYPO3's bundled `cms-seo` extension auto-populates `lastmod` from the content's `tstamp` DB field
(docs.typo3.org), so this is plausibly accurate, not decorative, on TYPO3 — worth checking directly
against Germany's dominant CMSes (TYPO3 20.5%, WordPress 17.8% per topic 6) before building.

**Architect follow-up, 2026-07-16 (resolves the open question above, and changes the framing).** The
events sub-sitemap was reachable via the index's own `<loc>` (it carries a `cHash` query param — a
guessed path 404s, which is what stopped the first check). Measured on leonding.at:
**873 `<url>` entries, 873 `<lastmod>` entries — per-event granularity confirmed**, each pointing at
a real detail page (`/veranstaltungen/detail/1635`). Two consequences the "change signal" framing
misses:

1. **This is primarily a DISCOVERY mechanism, not a change pre-check.** As a change signal it is
   near-worthless to us: conditional GET already answers "did the listing change?" for ~0 cost in one
   round-trip (a 304), so a sitemap GET *adds* a request rather than saving one. What it actually
   buys is an **enumeration of every event detail URL** — the listing page only ever renders a
   window, which is exactly why the LLM route pulls a slice (the same Sofia-jevents failure mode).
2. **Naively implemented it is a cost EXPLOSION, not a saving.** Detail pages on this cluster carry
   **no structured data at all** — leonding's detail page has no JSON-LD, no Microdata, no itemscope
   (checked directly). So sitemap→detail does not remove the LLM; it multiplies it: 873 detail
   extractions where the listing cost 1. It only pays if it is **strictly `lastmod`-gated** (fetch
   only detail pages whose `lastmod` > `last_crawled`), which in steady state is a handful per night
   — and note leonding's sample entry has `lastmod` 2021, i.e. the sub-sitemap includes long-expired
   events, so an ungated first run would extract a decade of dead events.

**Effort: S** to consult, **M** to use safely (the gating, not the parsing, is the work).
**Verdict: adopt-now as lastmod-gated detail-page discovery for the 87 typo3-generic + 22
ris-kommunal candidates** — but never as an ungated enumeration, and it does not by itself take
those 109 sources off the paid route (it retargets the spend from a windowed listing onto whole
events). Wire it behind the existing hash/conditional-GET rungs, never in front of them.

**WebSub/PubSubHubbub.** Live in 2026 for blog platforms — Blogger, WordPress.com, Mastodon, and
feed-reader ecosystems (Feedly, NewsBlur) still support it, and the WordPress.org `pubsubhubbub`
plugin shipped an update as recently as 2026-06-19 (per plugin listing). But this requires the
**publisher** to run a hub and advertise `<link rel="hub" href="...">` in their feed/page — we found
**zero evidence** any of our CMS clusters (gem2go, TYPO3-generic, WordPress-generic, RiS-Kommunal,
Sitepark) does this; it's not a pattern municipal-calendar software vendors implement (this is an
absence-of-evidence inference from our own adapter/CMS survey, not a confirmed negative — we did not
individually inspect all 1,741 feeds for a hub link). Our own feed-discovery code
(`findFeedLink()` in `scripts/crawl.mjs`, line 167) only scans `<link rel="alternate">` for RSS/Atom
— it has never looked for `rel="hub"`, so if any of our WordPress sources for coincidence run the
WebSub plugin, we wouldn't currently notice. Extending the existing regex to also capture `rel="hub"`
is trivial (minutes of code, reuses the same scan pass) but expected yield is near-zero given the
municipal-CMS landscape. **Verdict: skip** — not worth even the trivial change until Topic 6's
Germany scan turns up a WordPress instance running the plugin.

## Topic 2 — Fetching: HTTP/2/3, Cloudflare, Web Bot Auth

**HTTP/2/HTTP/3 for a polite crawler.** Global HTTP/3 traffic share has plateaued around 20–21%
for a full year (20.50% Q2 2025 → 21.04% Q2 2026, per a 2026 protocol-adoption analysis —
technologychecker.io, single secondary source, treat as directional not authoritative). Multiple
2025 write-ups (DebugBear, Catchpoint) converge on: H2/H3 wins are real under high concurrency or
lossy networks, and largely moot for server-to-server fetches that are already rate-limited well
below what a single TCP connection can sustain. That's exactly our situation: `politeFetch()` in
`lib/crawl-net.js` enforces `HOST_DELAY_MS = 1000` (≥1s between requests to the same host,
raised further by a parsed `Crawl-delay`) — connection multiplexing buys nothing when we're only
ever making one request per host per second by design. Concretely: Node's global `fetch` (built on
undici) does **not** negotiate HTTP/2 by default; it requires swapping in a custom undici
`Agent`/`Dispatcher` with `allowH2: true` (open as of a still-unresolved undici GitHub issue,
`nodejs/undici#2750`, requesting H2-by-default). That's a real, maintained code path we'd own for a
benefit our own architecture already forecloses. **Effort: S–M. Verdict: skip.**

**Cloudflare bot management, 2025-26 state.** Cloudflare's Bot Fight Mode / Managed Challenge does
**not** distinguish "malicious scraper" from "legitimate declared crawler" by user-agent string
alone — site-owner write-ups from 2026 (helpnetsecurity.com 2026-07-02; a Webflow-focused blog,
pravinkumar.co, April–May 2026; dataimpulse.com 2026) describe well-known crawlers (GPTBot,
ClaudeBot, PerplexityBot) getting challenged/blocked under default configs unless the *site owner*
adds an explicit WAF "Skip" rule. That's the same shape as our own 18 sources returning a
200-status challenge page: **Cloudflare's interactive/JS challenges commonly return HTTP 200** with
a real HTML body containing a Turnstile widget or a "Checking your browser…" interstitial — a
managed (non-interactive) challenge more often surfaces as 403/503 with a `cf-mitigated: challenge`
response header, which is the most reliable detection signal per Cloudflare's own troubleshooting
docs and third-party write-ups. This is a fixable-by-the-site-owner problem, not something we can
force from the crawler side alone — which is exactly why Web Bot Auth (below) matters: it gives the
site owner a *cheap, standardized* way to say yes to us without hand-writing a bespoke WAF rule per
crawler.

**Web Bot Auth / IETF drafts / Cloudflare Verified Bots — is this a practical path for us?**
Yes, with one real caveat. Timeline: Cloudflare launched "signed agents" as a Web-Bot-Auth-backed
classification on **2025-08-28** (blog.cloudflare.com/signed-agents), then folded Web Bot Auth
signatures into the existing **Verified Bots** program as an alternative to the old static-IP-list /
reverse-DNS methods (blog.cloudflare.com/verified-bots-with-cryptography). On the IETF side, a
**WebBotAuth working group was formally chartered in early 2026** following a BoF at IETF 123, with
a standards-track milestone targeted for **April 2026** and a best-current-practice document
targeted for **August 2026** (datatracker.ietf.org tracking pages, per search-result synthesis — we
did not fetch the WG charter directly, treat the exact milestone dates as reported-not-verified).
The specific architecture draft we fetched, `draft-meunier-web-bot-auth-architecture-05`, is
explicitly marked **expired/superseded** as of the 2026-03-02 snapshot we read (replaced by
`draft-meunier-webbotauth-httpsig-protocol`) — this space is genuinely still in motion, not settled,
so anything built against it needs a maintenance expectation, not a "build once, forget" one.

Mechanism, concretely: generate an **Ed25519** keypair, publish the public key as a JSON Web Key at
`/.well-known/http-message-signatures-directory` (a static file — no server logic needed beyond
serving it over HTTPS), then sign each outbound request per **RFC 9421 (HTTP Message Signatures)**
with three added headers (`Signature-Input`, `Signature`, `Signature-Agent`). Cloudflare publishes
open-source Rust and TypeScript libraries (`github.com/cloudflare/web-bot-auth`) to do the signing —
genuinely reachable for a one-person crawler, not gatekept to big AI labs. **Verified Bots**
application is a dashboard form (Cloudflare Bot Submission Form); requirements are honest
self-identification (a Web Bot Auth signature now counts, alongside the older static-IP-list or
reverse-DNS options) **plus** a track record of robots.txt compliance and non-abusive rate — no
stated fee, and "bots applying with well-formed Message Signatures will be prioritized, approved
more quickly" per Cloudflare's own docs.

**The caveat that matters for our numbers**: Verified/signed status changes what happens on zones
that haven't overridden Cloudflare's defaults — it does **not** force a zone whose operator has
explicitly turned on "block all AI crawlers" or written a custom deny-rule to let us through; that's
still the site owner's call, exactly as it is today with our UA string. So this raises our odds on
the 18 challenge-pages (many of which are plausibly default-Cloudflare-config, unopinionated
municipal sites, not deliberate anti-scraper stances) without guaranteeing anything, and it does
**nothing** for non-Cloudflare anti-bot vendors if any of our 7 hard 403s sit behind Akamai/Imperva/
DataDome instead — a fact we have not yet checked. **Action before investing further engineering**:
classify which of the 18 + 7 blocked sources actually carry Cloudflare fingerprints (a `cf-ray`
response header, or a `cf-mitigated` header on the challenge itself) — a cheap read-only diagnostic,
distinct from and prior to the signing work itself. **Effort: S–M** to implement signing (key
generation, static file, 3 headers in `politeFetch`), **reusable across every Cloudflare-fronted
source at once** rather than per-site pleading — the best effort-to-leverage ratio in this whole
document, gated on that diagnostic and on how many of the 18+7 are actually Cloudflare zones.
**Verdict: adopt-after-diagnostic** — run the cf-ray/cf-mitigated classification first (this week,
trivial); if it shows most of the 18+7 are Cloudflare, build the signing path next.

Legal/ToS note: this is unambiguously *aligned* with our existing posture, not a new exposure —
Web Bot Auth is a cryptographic upgrade of the honest-self-identification we already do via UA
string (`UmkreisBot/0.1 ... contact: bobojojok@gmail.com`), and Cloudflare's own bar for Verified
status (robots.txt compliance, reasonable rate, non-abusive) is a strict subset of what we already
do.

---

## Topic 3 — JS-SPA sources (carried over, not re-researched)

"Find the underlying API" is standard 2024-26 practice: Playwright as an XHR-sniffing harness
(`page.route`/`on('response')`) to discover the endpoint, then replay it with a plain HTTP client.
Apify's worked example: Zillow's headless page renders ~4MB while the underlying JSON API is ~15KB
(blog.apify.com/reverse-engineer-apis, undated). Scrapfly and Firecrawl document the same pattern.
Agentic discovery via Chrome DevTools MCP exists (posts.oztamir.com) — a single, thin source, treat
as an anecdote not a pattern. **Risk**: sites obfuscate params or use signed tokens, so this is a
maintenance burden that reappears whenever the target changes its frontend, not a one-time cost.
Managed-rendering pricing (all vendor pages, current as fetched by the prior run): Browserless
~30s-browser = 1 unit, from $50/mo; Bright Data $0.75/1k requests base but 5–75× more for JS
rendering; ScrapingBee 1 credit (plain HTML) vs 15 credits (JS-rendered) — roughly 3× on their
~$49/mo tier. At our actual scale (50–100 SPA sources, crawled every few days, ~100–300 renders/wk),
any cheap managed-rendering tier easily covers it — the dollar cost is low (tens of $/mo); the real
cost is the new failure surface and the ops burden of maintaining API-replay logic across 50–100
independently-changing frontends. Google's own two-wave crawl/render split (Web Rendering Service
defers JS execution) is real, but the specific "3.4-day Render-Delay Gap" number traces to a
secondary blog citing an unnamed 2024 analysis — **soft-sourced, label it as such**; the most
citable industry claim that rendering is a rationed, budgeted resource is
botify.com/blog/from-crawl-budget-to-render-budget. At our scale (3 confirmed js-spa sources today)
this whole topic is **low priority** regardless of technique quality.

## Topic 4 — LLM cost/quality (carried over, not re-researched)

Anthropic Message Batches API: flat 50% off input+output, <24h turnaround
(platform.claude.com/docs/en/build-with-claude/batch-processing). Gemini Batch API: flat 50% off
(developers.googleblog.com/en/scale-your-ai-workloads-batch-mode-gemini-api). Batch and
prompt-caching discounts **stack**. Fit caveat: batch requires a queue-then-drain refactor
(fetch+preprocess all → submit → poll → write) — a real architecture change trading inline latency
for 50% savings; a nightly cron has no latency requirement, so this fits us well *if* the refactor
effort is spent. Prompt caching is exact-prefix-match and needs static content before variable
content; Anthropic's minimum is 1024–4096 tokens, Gemini's is 32,768 tokens — our per-page HTML is
never cacheable (it's the variable part), only the fixed system+schema prefix is, so caching is
**marginal and Anthropic-only** in practice for us.

Boilerplate removal: Trafilatura cuts ~80–90% of tokens vs raw HTML (dev.to/stevengonsalvez,
undated), F1≈0.937/precision≈0.978 per Sandia SAND2024-10208 (Aug 2024, osti.gov, hard-sourced);
Jina Reader: 16,180 HTML tokens → 3,150 markdown tokens (~5×, jina.ai/reader). Trafilatura is
**Python**; our crawler is Node — a subprocess call or a JS-native Readability port
(contextractor.com notes readability-lxml scores below Mozilla's own Readability) is the practical
path, not a drop-in import.

Small-model benchmarks: LLMStructBench (arXiv 2602.14743, 2026) — prompting strategy matters more
than model size, semantic errors persist despite syntactically valid JSON. ExtractBench (arXiv
2602.12247) — frontier models only 4.6% field-level pass on complex nested extraction (PDF-focused,
generalization to our simpler event schema is uncertain). AscentCore 2026 small-open-model bench:
SmolLM2 1.7B 26% JSON-parse rate, Llama 3.2 3B 47–56%, Gemma 3 4B 100% parse / 87% schema
compliance. **No authoritative head-to-head of Gemini Flash-Lite vs Claude Haiku on event
extraction exists** — say so plainly, don't infer one.

schema.org adoption: WDC 2024 corpus — 51.25% of pages carry some structured data
(uni-mannheim.de/dws/news/wdc-json-ld-microdata-rdfa-data-corpus-2024-published, released
2025-01-10). A different 2026 audit reports 31.3%/23% — **flag the discrepancy**, don't reconcile
it silently; these numbers disagree and neither supersedes the other on the evidence we have.
`Event` is explicitly called out as a lower-adoption "specialized" type; only 22% of schema-emitting
sites pass Google's Rich Results validation cleanly. **Our own 47% LLM-fallback rate is the best
available evidence for the AT/DE municipal segment specifically** — no independent AT/DE-specific
dataset exists to check it against.

**Formats — the actionable part**: WDC 2024 breaks down structured-data format share among
annotating sites as JSON-LD 70%, Microdata 46%, RDFa 3%, Microformats 23% (released 2025-01-10);
absolute counts ~11.5M JSON-LD, ~7.6M Microdata, ~400k RDFa pages. RDFa is safely ignorable at that
volume. **Microdata is not** — a JSON-LD-only parser has a real, non-trivial miss rate by these
numbers.

**Read-only check against our own code and corpus, as requested**: `parseJsonLdEvents()` in
`scripts/crawl.mjs` (line 134) only matches
`<script type="application/ld+json">` blocks — it has no Microdata path. `structuredSignals()` in
`lib/cms-fingerprint.js` (line 84) — the function that decides whether a source counts as
"structured-signal" in today's fingerprint sweep — checks only `jsonld`/`ical`/`rss` regexes; it
never tests for `itemscope`/`itemtype`/`itemprop`. The **only** Microdata-aware code anywhere in
`lib/` is `lib/kreativregion-events.js:9`, a hardcoded one-off regex matching
`itemtype="https://schema.org/Event"` around an `<article>` tag for one specific legacy source —
a single-source adapter, not a general Microdata extractor. We could not grep our own crawled
corpus for itemscope-vs-JSON-LD prevalence because **no raw HTML is ever persisted**:
`scripts/fingerprint-sources.mjs` fetches each page into a local variable (`let html = await
res.text()`), computes signals from it, and discards it at the end of that source's iteration —
nothing is written to disk. So the honest answer to "how much Microdata do we have" is: **unmeasured,
and unmeasurable retroactively** — we'd need to add an `itemscope`/`itemtype="...Event"` regex
check next to the existing `jsonld`/`ical`/`rss` ones in `structuredSignals()` (a few lines, same
shape as the existing checks) and let the *next* fingerprint sweep report it, rather than trying to
reconstruct history that was never saved.

## Topic 5 — Dedup (carried over, not re-researched)

MinHash vs SimHash (arXiv 1407.4416, older, foundational). A 2025 ACM WebConf companion paper
(dl.acm.org/doi/10.1145/3701716.3715303) finds hashing-LSH significantly less accurate than
sentence-transformer embeddings on hard near-duplicate news. Google's RETSim (arXiv 2311.17264,
ICLR 2024) beats both MinHash and generic embeddings for near-dup detection, and is specifically
robust to typos. **Caveat that matters for us**: none of this literature addresses short structured
records (5–10 word titles) — LSH/shingle methods are built for long-text near-duplicates; our
Jaccard-on-short-fields approach is a defensible, deliberate departure, not a naive fallback.

PredictHQ publicly states some sources run ~30% duplicate rate and they delete up to 45% of
ingested events as inaccurate/spam, backed by an ML + venue/performer "entities" system
(predicthq.com/blog — **secondhand via search snippet, returned 405 on direct re-fetch, label it
soft-sourced**). No public dedup internals exist for Bandsintown/Eventbrite/Ticketmaster — say so.
OpenAgenda sidesteps cross-source dedup entirely via organizer-owned single-entry submission
(developers.openagenda.com) — an architectural contrast worth naming, not a technique we can adopt
(it requires organizer buy-in we don't have). FitGap (Jan 2026,
us.fitgap.com/stack-guides/managing-event-data-quality-with-deduplication-source-scoring-and-audit-trails)
describes almost exactly our design — block by city+date or venue-radius+day, then score title
similarity/time distance/venue similarity — vendor content-marketing, low authority but directionally
supportive, not proof. Embedding-similarity thresholds: community consensus puts 0.85+ as
near-identical, 0.7–0.8 as merely related; structured-record-specific guidance (vendor blogs) puts
0.82–0.88 for general master-data matching and 0.90–0.95 for name+company matching
(community.openai.com thread; zilliz.com/ai-faq). Our planned **≥0.90 AND same-town** rule sits at
the sane high end of that range — no paper validates 0.90 for event titles specifically, it's a
reasonable inference, not a cited result.

## Topic 6 — Germany/discovery (carried over, not re-researched)

CMScensus.eu surveyed 6,533 of ~10,796 German Gemeinde sites: TYPO3 20.5% (1,339), WordPress 17.82%
(1,164), Joomla 4.81% (314), Contao 2.48% (162), Online Suite 1.19%, iKISS 1.01%, Neos 1.01%,
Umbraco 0.8% — and **38.02% "CMS Not Detected"**
(cmscensus.eu/germany/regions-cities/municipalities; dataset likely 2022-23, flag as possibly stale).
Fastnacht/Kreideweiß/Lußky, "CMS-Verteilung im öffentlichen Bereich in Deutschland," Gesellschaft
für Informatik, 31 Aug 2023 (dl.gi.de) confirms the same top-5 ranking for Städte: TYPO3, WordPress,
iKISS, Joomla, Contao. Government Site Builder is **federal**, not municipal (itzbund.de) — exclude
it from any municipal-CMS adapter planning.

iKISS is purpose-built for municipalities and ships a **bidirectional interface to
termine-regional.de**, plus destination.one/Vibus/toubiz/pitcom, and a JSON export
(advantic.de/CMS-iKISS/Schnittstellen/Veranstaltungsdatenbanken/). **termine-regional.de is the top
follow-up lead**: a nationwide German event portal claiming "hundreds of thousands of registered
events" (vendor claim, **unverified**) — check API access terms, licensing, and real volume *before*
committing to building three separate CMS adapters for the same underlying data. NOLIS (300+
municipalities, vendor claim) and Sitepark (Stuttgart/Bonn/Kassel references) are vendor
self-description with no independent share data — treat both as leads, not facts.

Common Crawl for municipal discovery: the infrastructure supports it (CDX/Athena domain index;
gov-class domains average ~2,500 pages/domain crawled vs ~80 typical —
commoncrawl.github.io/cc-crawl-statistics, skeptric.com/common-crawl-index-athena), but **no
published case study exists** for municipal-calendar discovery specifically — this is a **novel
application** if we build it, not a validated technique. OpenAgenda is French-market with no found
German presence (absence of evidence, not a confirmed negative — we didn't exhaustively search).
**OPARL is a confirmed red herring**: it's a council/committee information standard only
(Body/Organization/Person/Meeting/Paper/File — Sitzungskalender, not community events; oparl.org,
open.nrw) — do not spend time on it for event discovery.

**Our own fresh measurement, cited above and directly relevant here**: today's CMS fingerprint sweep
over 931 LLM-route sources (`data/catalog/fingerprint-report.json`) found adapter-candidate clusters
of typo3-generic 87, wordpress-generic 50, ris-kommunal 22, joomla-generic 15, drupal 11, contao 10,
wix 8, wp-the-events-calendar 2, joomla-jevents 2, wp-eventon 1; 196 sources expose a discoverable
feed URL (162 of them `wp-json`); 46 blocked; only 3 js-spa. This Austrian cluster shape — TYPO3 and
WordPress dominating, in that order — is exactly what the German CMS-share studies above predict,
which is the strongest available (if indirect) evidence that our AT adapter investment
(typo3-generic, wordpress-generic) will carry over directly to a German expansion.

---

## Final ranked table

| Technique | What it buys us, concretely | Effort | Verdict |
|---|---|---|---|
| **Web Bot Auth signing + Cloudflare Verified Bots** | **Diagnostic DONE (architect, 2026-07-16): 9 of 12 sampled challenge/403 sources are Cloudflare-fronted** (cf-ray/server:cloudflare) — so ~75% of the 25-strong blocked set is addressable by one signing setup. Note the cluster is overwhelmingly **Bulgarian municipal** (pleven.bg, plovdiv.bg, smolyan.bg), not AT/DE — so this is a BG-coverage lever, not a Germany one | S–M (Ed25519 key, static JWKS file, 3 headers in `politeFetch`) | **Adopt-now** (diagnostic passed). Caveat unchanged: only helps on zones that haven't overridden defaults, and does nothing for the 3 non-CF Apache 403s |
| **Sitemap as lastmod-gated DETAIL-PAGE DISCOVERY** (not a change signal — see §1 follow-up) | Measured on leonding.at: events sub-sitemap = **873 detail URLs, 873 per-event `lastmod`**. Solves the "listing shows only a window" slice problem (the jevents/Sofia failure mode) for the 87 typo3-generic + 22 ris-kommunal candidates. **Does NOT take them off the paid route** — their detail pages have no structured data, so it retargets LLM spend onto whole events rather than removing it | S to consult, **M to use safely** — the `lastmod` gate is the work, not the XML parse | **Adopt-now, strictly lastmod-gated**, behind the existing hash/conditional-GET rungs. **Ungated it is a cost EXPLOSION** (873 extractions vs 1, incl. events dating to 2021). As a plain change-signal: **skip** — conditional GET already does that job in one round-trip |
| **Microdata (itemscope/itemtype) parsing alongside JSON-LD** | Currently zero coverage anywhere except one hardcoded one-off adapter; WDC 2024 puts Microdata at 46% of structured-data-emitting sites — a real, unmeasured miss on some slice of our 931 LLM-route sources | S (a regex check in `structuredSignals()`, mirroring the existing jsonld/ical/rss checks; a real parser is more, but even just *measuring* prevalence is nearly free) | **Adopt-now** for the measurement step (add the signal to the next fingerprint sweep); build the actual extractor only if the number that comes back is non-trivial |
| **termine-regional.de partnership/API check** | Potentially replaces 3+ planned German CMS adapters with one nationwide feed, if licensing allows facts+linkback use | S to investigate, unknown to integrate | **Adopt-now** (investigation only) — cheapest possible way to avoid wasted German adapter work; George call once terms are known |
| Cho/Garcia-Molina-style continuous change-frequency estimator | Marginal freshness gain over our existing 3-tier hash-skip scheduler; real cost driver is LLM tokens, not wasted fetches | M (new stats model, more state per source) | **Skip** — sophistication doesn't pay off below tens of thousands of URLs |
| WebSub/PubSubHubbub consumption | Zero observed adoption across our CMS clusters; trivial to add a `rel="hub"` check to existing feed-scan but near-zero expected yield | S | **Skip** until Germany scan finds a hub-advertising source |
| HTTP/2 for the crawler | Multiplexing/latency wins are moot under our own 1 req/s/host politeness cap; requires a custom undici dispatcher Node's global `fetch` doesn't provide by default | S–M | **Skip** |
| JS-SPA → find-the-API / managed rendering | Dollar cost is low (tens of $/mo) at our 3-confirmed-SPA scale; real cost is new ops/maintenance surface for a handful of sources | M per source, ongoing | **After-Germany-scan** — revisit if the German count is materially higher than AT's 3 |
| LLM batch APIs (Anthropic/Gemini, 50% off) | Flat 50% cost cut on our ~840-source LLM-fallback spend, stacks with prompt caching | M (queue-then-drain refactor of the nightly cron) | **Adopt-after-Germany-scan** — worth doing once German expansion roughly doubles LLM-fallback volume; marginal at today's near-$0 spend per `docs/research/scraping-cost.md` |
| Trafilatura/boilerplate stripping before LLM call | 80–90% token reduction per source hit; Python-only tool needs a subprocess bridge or JS-native alternative | M (cross-language bridge or new JS dependency) | **After-Germany-scan** — pairs naturally with the batch-API refactor above, do them together |
| Embedding-based dedup (RETSim/sentence-transformers) | No evidence it beats our short-field Jaccard approach for 5–10 word event titles — the literature doesn't cover our record shape | M–L (new model dependency, no validated threshold for our case) | **Skip** — no paper supports it for structured short-text records; our current approach is already at the sane end of vendor-suggested thresholds |
| Common Crawl for municipal site discovery | Infrastructure supports it but no case study exists for this application — genuinely novel, unproven | M (new discovery pipeline) | **After-Germany-scan** — worth a cheap pilot query once German expansion starts, not before |

---

### Sources (topics 1–2, this pass)

- Cho & Garcia-Molina, "Estimating Frequency of Change," ACM TOIT 3(3), 2003 — http://oak.cs.ucla.edu/cho/papers/cho-freq.pdf
- Cho & Garcia-Molina, "Effective Page Refresh Policies for Web Crawlers," ACM TODS — http://oak.cs.ucla.edu/~cho/papers/cho-tods03.pdf
- Olston, "Recrawl Scheduling Based on Information Longevity" — https://www.ccs.neu.edu/home/vip/teach/IRcourse/3_crawling_snippets/other_notes/paper_crawl_longevity.pdf
- Bing Webmaster Blog, "The Importance of Setting the lastmod Tag in Your Sitemap" — https://blogs.bing.com/webmaster/february-2023/The-Importance-of-Setting-the-lastmod-Tag-in-Your-Sitemap (2023, dated but still the operative accuracy finding)
- TYPO3 SEO extension docs (lastmod from `tstamp`) — https://docs.typo3.org/c/typo3/cms-seo/13.4/en-us/Features/XmlSitemap.html
- Live spot check, 2026-07-16: https://www.leonding.at/sitemap.xml, https://www.wels.gv.at/sitemap.xml (both from today's fingerprint sweep's typo3-generic bucket)
- WebSub / Wikipedia — https://en.wikipedia.org/wiki/WebSub
- Cloudflare, "The age of agents: cryptographically recognizing agent traffic" (signed agents launch, 2025-08-28) — https://blog.cloudflare.com/signed-agents/
- Cloudflare, "Message Signatures are now part of our Verified Bots Program" — https://blog.cloudflare.com/verified-bots-with-cryptography/
- Cloudflare Web Bot Auth developer docs — https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/
- Cloudflare Verified Bots concept docs — https://developers.cloudflare.com/bots/concepts/bot/verified-bots/
- IETF draft (expired/superseded snapshot read 2026-03-02) — https://datatracker.ietf.org/doc/html/draft-meunier-web-bot-auth-architecture
- github.com/cloudflare/web-bot-auth (open-source signing libraries)
- Help Net Security, "Cloudflare changes AI crawler access rules," 2026-07-02 — https://www.helpnetsecurity.com/2026/07/02/cloudflare-ai-crawler-controls/
- Cloudflare challenge-page troubleshooting docs (200 vs 403/`cf-mitigated` detection) — https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/
- DebugBear, "HTTP/3 vs HTTP/2 Performance" — https://www.debugbear.com/blog/http3-vs-http2-performance
- technologychecker.io, HTTP protocol adoption 2026 (single secondary source, directional only) — https://technologychecker.io/blog/http-protocol-adoption
- nodejs/undici issue #2750 (fetch H2-by-default, still open) — https://github.com/nodejs/undici/issues/2750
