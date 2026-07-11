# Scraping cost model — "how much does this cost at OÖ scale?"

Companion to `docs/decisions/2026-07-11-crawl-scaling-and-legal.md` (architecture direction) and
`data/sources-ooe.json` (candidate source list). This doc answers George's dollar question with
**measured** numbers from real page fetches + real Gemini token usage, not guesses. Pricing verified
2026-07-11 against official pages (links below); flag as estimates if pricing moves.

## Headline numbers

| Scope | Per pass | Per month (2–3 day cadence) |
|---|---|---|
| **Full OÖ** (extrapolated ~340 workable sources) | **~$0.60 – $1.20** | **~$7 – $14** |
| **Linz-region only** (73 sources actually registered+working today) | ~$0.13 – $0.25 | **~$1.60 – $3.00** |
| **Today's registered set** (97 working sources, all districts) | ~$0.18 – $0.33 | ~$2.10 – $4.00 |

All three numbers are **cents-to-single-digit-euros per month** — this confirms the architecture
doc's back-of-envelope "single-digit €/month for all of Austria." At current OÖ scale, a full pass
(~290 Gemini calls at an assumed 85/15 Gemini/Haiku split, see below) fits inside **Gemini's free
tier** (1,000 requests/day, 15 RPM) if crawls are paced — meaning real out-of-pocket cost could be
**$0/month** today, with the paid-tier numbers above as the fallback once volume or burst rate
exceeds the free allowance, or as the honest number to plan around (free tiers aren't a foundation
to build a business on).

These are **naive-baseline numbers**: 1 LLM call per source per crawl, every cycle, no change
detection. The architecture doc's build order (page-hash skip, JSON-LD/iCal parsing, deterministic
RiS-Kommunal/GEM2GO parsers) would cut real spend by an estimated 80–90% once built — none of that
is implemented yet (`scripts/crawl.mjs` calls `extractFromPage` unconditionally for every working
source). Treat this doc's numbers as "cost if we never optimize," which is also the safe upper
bound for planning.

## Measured: tokens per page

Ran real crawl-path extraction (`lib/extract.js` → Gemini 2.5 Flash-Lite, `gemini-2.5-flash-lite`)
against 10 real, currently-registered municipal pages spanning small villages to larger towns, and
recorded `usageMetadata` from the Gemini API response directly (not estimated from character counts):

| Source | Page size (chars, stripped) | Input tokens | Output tokens |
|---|---:|---:|---:|
| Allhaming | 3,396 | 1,217 | 746 |
| Eggendorf im Traunkreis | 4,496 | 1,394 | 1,300 |
| Kematen an der Krems | 34,622 | 9,928 | 7,136 |
| Kronstorf | 4,751 | 1,473 | 939 |
| Sierning | 5,066 | 1,564 | 1,038 |
| Hörsching | 5,250 | 1,630 | 1,086 |
| Traun | 15,936 | 4,911 | 3,190 |
| Leonding | 24,139 | 6,905 | 4,706 |
| Mattighofen | 7,753 | 2,461 | 2,640 |
| Grieskirchen | 5,732 | 1,736 | 1,319 |

- **Median** (typical village/small-town page): **1,683 in / 1,310 out** (~3,000 tokens/page)
- **Mean** (skewed up by a couple of event-dense town portals like Kematen and Leonding): **3,322
  in / 2,410 out** (~5,730 tokens/page)

Both are used below — median as the realistic case, mean as a conservative upper bound, since a full
OÖ set will include some larger town/city pages like the outliers above.

## Pricing (verified 2026-07-11)

- **Gemini 2.5 Flash-Lite** (primary, per `lib/extract.js` routing): **$0.10 / MTok input, $0.40 /
  MTok output**. [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing).
  Free tier: 15 RPM, 1,000 requests/day.
- **Claude Haiku 4.5** (fallback, per the scan-model decision — used for hard pages or when
  `GEMINI_API_KEY` is unset): **$1 / MTok input, $5 / MTok output** (batch: $0.50 / $2.50).
  [platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing).
- **Nominatim** (geocoding): free, rate-limited to 1 req/s (respected in `lib/geocode.js`), and
  every hit is cached in the `geocache` table — repeat venues/towns cost one lookup ever, not one
  per crawl. At OÖ scale (a few thousand distinct venue/town strings, ballpark) this stays $0.

## Cost per page

| | Gemini Flash-Lite | Claude Haiku 4.5 (fallback) |
|---|---:|---:|
| Median page (1,683 in / 1,310 out) | $0.00069 | $0.00823 |
| Mean page (3,322 in / 2,410 out) | $0.00130 | $0.01537 |

Haiku is ~12x more expensive per page than Flash-Lite — confirms why it should stay a fallback
(hard-to-parse pages, or no Gemini key), per the existing routing in `lib/extract.js`.

Blended at an assumed **85% Gemini / 15% Haiku** split (brief's estimated 10–20% fallback share,
midpoint used):

- Median case: **$0.00182 / page**
- Mean case: **$0.00341 / page**

## Scope sizing

- **Linz-region (5 near-Linz districts: Linz-Stadt, Linz-Land, Urfahr-Umgebung, Wels-Land,
  Steyr-Land)**: fully probed this round. **73 sources** currently registered with `works=true`
  (out of 94 municipalities + city/regional sources in that footprint). This is a real, current
  count — not an extrapolation.
- **Today's full registered set**: **97 sources** `works=true` across all districts (near-Linz +
  the ~22-municipality far-district sample + non-municipal layer). Also a real count.
- **Full OÖ (all 438 municipalities)**: not fully probed this round (brief scope: near-Linz
  districts fully + a ~20-town far-district sample — see `data/sources-ooe.json`). The probed
  sample hit a **~77% "has a findable events calendar" rate** (89 working / 115 probed, after
  correcting an initial batch of false positives — see caveat below). Extrapolating 77% across all
  438 municipalities projects **~337 workable municipal sources**, plus the ~10 non-municipal
  sources (tourism board, libraries, city portals, Pfarre) already found → **~340–350 total**. This
  is a projection, not a probed count.

## Calculation

Full OÖ pass (340 sources × 1 page × blended cost/page):
- Median: 340 × $0.00182 = **$0.62**
- Mean: 340 × $0.00341 = **$1.16**

Monthly at a 2–3 day recrawl cadence (~12 passes/month, using 2.5-day midpoint):
- Median: $0.62 × 12 = **$7.44/month**
- Mean: $1.16 × 12 = **$13.92/month**

Linz-region-only monthly (73 real sources × blended cost/page × 12):
- Median: 73 × $0.00182 × 12 = **$1.59/month**
- Mean: 73 × $0.00341 × 12 = **$2.99/month**

## Caveat that shaped this measurement

The first probing pass this round had a real false-positive problem worth flagging: a loose
"contains veranstalt OR termine" URL match picked up **37 administrative pages** (waste-collection
schedules, council-session dates, building-permit hearing notices) as if they were event calendars.
Caught via a second pass requiring future-dated content and a title-keyword check, corrected before
registering. Two implications for this cost model: (1) the 77% hit rate above is post-correction and
should be reasonably trustworthy, but a full-438 probe would likely surface more of the same pattern
and needs the same two-pass discipline; (2) this is a preview of exactly the kind of noise a
deterministic CMS parser (build-order item 4 in the architecture doc) would eliminate structurally
instead of via regex-and-pray.

## What's not costed here

- **Poster scanning** (`extractFromImage`) — out of scope per the brief; separate, user-driven
  volume (one scan per user action, not a recurring crawl cost).
- **Agent mining** (one-off `data/mined/*.json` sweeps) — covered by the Claude Code subscription,
  not metered API spend; right tool for bootstrap, not steady state (see architecture doc).
- **Change-detection, structured-feed parsing, deterministic CMS parsers** — not built yet. Once
  they land, expect the naive numbers above to drop 80–90% (per architecture doc's estimate), since
  most municipal calendars change slowly and RiS-Kommunal/GEM2GO cover the large majority of sources
  (74 of 97 registered working sources are GEM2GO-fingerprinted, 10 RiS — see `sources.cms`).
