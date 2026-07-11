# Umkreis / eventmap — Design Doc

> Status: living document · Owner: Architect agent · Last updated: 2026-07-10
> This is the "what we're building and why" bible. Read it before significant work.
> Working product name: **Umkreis** (final name TBD — see `docs/decisions/2026-07-10-naming.md`).
> Repo: `eventmap`.

---

## 1. What this is

A **location-based event discovery app for the Linz region** (Upper Austria), families-first.
Open a map, see what's happening around you — festivals, kids' events, markets, concerts,
community happenings — pulled from official municipal sources and enriched by AI. Users can
also **scan a physical poster** and the AI turns it into a structured event on the map.

Two audiences, in order:
1. **Consumers (families first):** "never miss something good nearby." High-frequency
   weekly query ("what do we do this Saturday with the kids?"), which is what gives this app
   retention that generic event apps lack.
2. **Organizers / municipalities (B2B2C, later):** "publish once, be found everywhere" —
   we distribute their events to families, to Google (schema.org), and to AI assistants (MCP/API).

## 2. The thesis (why this, why now)

Event discovery is a startup graveyard (IRL, YPlan, Sosh, Google Schemer all died). They died
on **retention** (low frequency) and **supply completeness** (chicken-and-egg), not features.
Full catalog of who tried, who died, who survived, and the DACH/scan-a-poster direct analogs:
`docs/research/competitive-landscape.md`.

Our wedge is the part everyone else skipped: **the events that aren't properly online** —
kindergarten posters, Feuerwehrfeste, municipal PDFs, parish newsletters, small-town Gemeinde
calendars. That data was always too fragmented to aggregate profitably. **An LLM agent that
reads a small-town Austrian Gemeinde site (or a photographed poster) is new** — it didn't exist
when the last generation of event apps died. That's the unlock.

**Families first** because the "what do we do this weekend?" query repeats every week (fixes
retention) and has hard constraints (age, indoor/outdoor, weather, stroller) that Google Maps
answers badly.

**One region at a time.** Win Linz completely (near-total coverage) before expanding. Density
in a bounded area is the whole game; being mediocre-everywhere is how this category kills founders.

**The go/no-go gate is still the four-weekend Linz test:** does ≥30% of good events come from
sources the big aggregators miss, and do people come back weekly? Everything else is downstream.

## 3. Current status (2026-07-10)

**Working prototype on a live Supabase Postgres backend, build-verified, in the `eventmap` repo
(not yet pushed — GitHub auth pending, see TODO).** Writes now persist (scan/publish are no longer
ephemeral). What's live:

- Map browser with **92 real events** across Linz + ~15 surrounding municipalities.
- Google-Maps-style UI: desktop sidebar + map; mobile mini-card → full-screen detail.
- Filters: date (Today/Tomorrow/Weekend/7-days + **calendar range picker**), radius,
  category, indoor/outdoor, time-of-day, for-kids, free.
- Full **DE/EN localization** (auto-detect + toggle).
- **AI poster scan** (photo → Claude extraction → confirm → publish), pipeline works;
  needs an API key at runtime.
- **AI-readiness:** `/event/[id]` SSR pages with schema.org/Event JSON-LD, `sitemap.xml`,
  `public/llms.txt`, and an **MCP server** (`npm run mcp`) exposing search_events/get_event/list_sources.
- Production `next build` passes. **Backend = Supabase Postgres** (`umkreis` schema; `lib/db.js` on
  the `postgres` client over the transaction pooler); the old bundled-SQLite/`/tmp` hack is gone.

## 4. Architecture

```
data/mined/*.json  (agent mining runs)   ─┐
sources table      (npm run crawl)       ─┼─→ Supabase Postgres (umkreis schema: events, sources, geocache)
poster scan        (/api/scan → confirm) ─┘        │ expiry: ends_at (or start+6h / all-day EOD) < now (Vienna)
                                                   ▼
                    Next.js app — MapLibre + OSM map, filters, detail,
                    /event/[id] JSON-LD pages, sitemap, MCP server
```

**Stack (chosen to be Supabase-portable):**
- Next.js 15 (app router, plain JS), MapLibre GL + OpenFreeMap tiles (no Google dependency).
- **Supabase Postgres** via the `postgres` client (transaction pooler), tables in the `umkreis`
  schema (`lib/db.js`, one file). starts_at/ends_at stay Vienna wall-clock TEXT (timezone rule).
- Nominatim geocoding (1 req/s, cached in `geocache`, town-centroid fallback).
- **Gemini Flash-Lite primary → Claude Haiku fallback** for extraction — posters and crawled pages
  share one schema; provider routing stays in `lib/extract.js` (no provider hardcoding in feature code).

**Key files:**
- `lib/db.js` — schema, upsert/dedup, expiry, Vienna-time helpers. **Single file to port to Supabase.**
- `lib/geocode.js` — Nominatim + cache + region sanity bounds + town fallback.
- `lib/extract.js` — Claude vision (poster) + text (crawl) extraction, structured outputs.
- `lib/i18n.js`, `lib/icons.js`, `lib/towns.js` — localization, category icons, town centroids.
- `app/page.js` — the whole client app (map, filters, mini-card, detail, scan flow).
- `app/event/[id]/page.js` — SSR event page + JSON-LD.
- `scripts/seed.mjs` (import mined JSON), `scripts/crawl.mjs` (recrawl sources), `scripts/mcp-server.mjs`.

## 5. Data model (SQLite → Postgres-portable)

`events` (core): id, title, description, starts_at, ends_at, all_day, lat, lng, geo_precision
(venue|address|town), venue, address, town, categories (JSON array), is_free, age_min, age_max,
indoor, emoji, photo_path, status (published|expired|rejected), src_kind (crawl|feed|user_photo|manual),
source_name, source_url, content_hash (dedup), created_at, updated_at.

`sources`: name, url, kind, town, works, notes, last_crawled.
`geocache`: query → lat/lng/label/hit.

**Rules baked in:** events expire once over (Europe/Vienna-pinned); dedup by
normalized-title + day + town; facts-only with source linkback (never copy source prose/images).

## 6. Data sources (18 registered; ~92 events)

- **linztermine.at** (city calendar), **familienkarte.at** (Land OÖ — our exact audience),
  **erlebe.enns.at**, **tips.at**, and **14 Gemeinde sites**: Asten, Traun, Leonding, Ansfelden,
  Pucking, St. Marien, Luftenberg, Niederneukirchen, Hargelsberg, Wilhering, Ottensheim,
  Puchenau, Steyregg, Hörsching. (St. Florian = JS-only SPA, uncrawlable → tips.at fallback.)
- **Strategic finding:** most Gemeinde sites run on just two CMS products — **RiS-Kommunal**
  and **GEM2GO**. One integration with those vendors covers hundreds of Austrian municipalities.
- Per-source quirks (which URLs work, JS-only SPAs, familienkarte pagination) are in
  `briefs/mining-brief.md` and the `sources.notes` column.

**More data we can extract next:** ticket/registration links, numeric prices, organizer names,
recurring schedules, opening hours; new source *types* — Gemeinde PDF year-calendars (Claude reads
PDFs natively), parish newsletters, oeticket/Eventbrite APIs for the commercial layer.

## 7. Poster-scan pipeline & model choice

Flow: capture/upload → client downscale (≤1600px) → `/api/scan` → Claude vision with a
structured-output schema (title, date/time resolved to nearest future Vienna date, venue,
categories, is_free, age, per-field confidence) → editable confirm screen (low-confidence fields
flagged) → `POST /api/events` → geocode → live pin.

**Model choice (answers the "Google vs OpenAI vs Anthropic, cheapest+best" question):**
see `docs/decisions/2026-07-10-scan-model-choice.md`. Short version: this is a **cheap,
high-volume vision-OCR + structured-JSON + strong-German** task. **Google Gemini Flash-Lite is the
price/performance leader** (lowest per-image cost, big free tier, strong multilingual OCR, native
JSON schema) — **now wired as the primary in `lib/extract.js`**; **Claude Haiku** is the
quality/instruction-following leader, kept as the fallback;
**OpenAI mini** is the middle. Recommendation: keep the provider abstraction in `lib/extract.js`,
run **Gemini Flash-Lite as primary for cost at scale, Claude Haiku as the fallback** for
low-confidence/hard posters. Do not hardcode a provider in feature code (see AGENTS.md hard rules).

## 8. AI-readiness & the "middleman" strategy

We prepare event data better than the municipalities can, for both search engines and LLMs:
- **schema.org/Event JSON-LD** on every `/event/[id]` (Google event rich results + LLM crawlers).
- **sitemap.xml**, **llms.txt**, open **/api/events** JSON, and an **MCP server** so an AI
  assistant can answer "kids events this weekend near Linz" in one tool call, with source attribution.

**The pitch (B2B2C):** "Your events, entered once, found everywhere — by families on our map,
by Google through our structured pages, by AI assistants through our API." Municipalities can't do
JSON-LD or MCP themselves. Crawling is the bootstrap; the graduation is a **write API / MCP** that
the RiS-Kommunal / GEM2GO "publish event" button feeds directly (no double entry, no scraping).
Every record links back to them (traffic + goodwill). Selling structured/fresh event data to AI
companies becomes viable only *after* we own regional density — which loops back to the Linz test.
There is **no dominant open event-exchange protocol in the DACH region** — that gap is the opening.

**The middle layer — trade distribution for supply** (`docs/decisions/2026-07-11-middle-layer-strategy.md`):
the sharpened framing is that we sit *between* events and everyone searching for them, and we **pay for
supply with distribution**. We give organizers the SEO + AI discoverability they can't build themselves
(JSON-LD, sitemap, llms.txt, MCP) plus referral traffic; in exchange they let us index and enrich their
events. The consideration is a capability we have on day one, not audience size we don't — which is how
we offer real value before we're big. The `source_url` linkback we already owe (facts-only hard rule) *is*
the payment. Two guardrails are load-bearing: (1) the traffic is **back-loaded** — its value to suppliers
depends on us owning demand density first, so this does not replace the Linz test, it depends on it; and
(2) **doing the distribution job too well makes us skippable** (Google/AI answer straight from `source_url`),
so the middle layer is only defensible bolted onto an *owned, retained family audience* + aggregation/curation
the bare source can't replicate — never as pure pass-through pipes. The barter bites hardest on the
**commercial/semi-commercial** long tail (venues, festivals, paid workshops) who want reach; civic
micro-events we simply crawl. Nearest build expression is a **"claim your event"** flow — post-validation.

## 9. UI model

- **Desktop:** fixed left sidebar (list / filters / detail) + map fills the rest. Selecting an
  event flies the map to the pin and shows detail in the panel — never covers the map edge-to-edge.
- **Mobile:** tap a pin → compact **mini-card** (title, time, venue, distance, "Learn more") →
  full-screen detail (Google-Maps pattern). Bottom chip bar for date filters; sheet for filters/list.
- Clean **light theme**, teardrop pins in category colors with white SVG icons; same icons on
  chips, list rows, detail tags. Category set: family, festival, market, music, culture, food,
  sport, workshop.

## 10. Deployment

- **GitHub Pages: won't work** (static only; we need a Node server for API/SSR/DB).
- **Vercel: yes.** Import repo → deploy. **Backend = Supabase Postgres** (done): dedicated project
  `eventmap`, `umkreis` schema, transaction-pooler connection. Writes persist — no serverless caveat.
- Env vars: `DATABASE_URL` (Supabase pooler, **required**); `GEMINI_API_KEY` (scan primary) /
  `ANTHROPIC_API_KEY` (fallback); `NEXT_PUBLIC_BASE_URL` for absolute sitemap/share links.
- **Still open:** `npm run crawl` → Vercel Cron / GitHub Action; poster uploads → Supabase Storage
  (currently `/tmp`, ephemeral). PostGIS deferred (radius filter is client-side; lat/lng doubles suffice).

## 11. Open questions / risks

1. Retention — the category-killer. Reminders + saved favorites + private events (invites are a
   viral+retention loop) are the levers; not yet built.
2. Does Familienkarte / Land OÖ respond to a partnership ask? (Cheapest legal path to their data,
   and first B2B contact.) Not yet attempted.
3. Is "family-friendly" a filter or the *default lens*? If test users only touch family events,
   the whole product should default to it.
4. Scan is a donation-to-the-commons unless it delivers private value first (reminder for *you*).
   Watch that the scan flow isn't altruism-only.
5. We are the supply engine for the first 6–12 months (walking Linz photographing posters). Budget
   for that emotionally.
6. **Self-disintermediation.** The middle-layer/AI-readiness strategy (§8) is double-edged: perfect
   JSON-LD lets Google and AI assistants answer straight from the `source_url` and skip us entirely.
   The plumbing is not the moat — aggregation + family lens + retained audience is. Watch that we don't
   optimize ourselves out of the loop we're trying to own.

See `tasks/todo.md` for the actionable queue and `docs/decisions/` for locked calls.
