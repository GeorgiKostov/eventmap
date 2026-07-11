# Brief: Austria-wide supply backfill (Grok-powered bulk fill)

Goal: fill the DB with event supply for ALL of Austria using the cheapest tokens available
(xAI/Grok API credits when present), so future recrawls ride the waterfall (hash-skip + structured
feeds) at near-zero cost. Demand focus stays Linz/OÖ — this is supply-side only (George's call,
2026-07-11).

## Preconditions (order matters)
1. Waterfall changes (page_hash skip, JSON-LD/iCal/RSS-first, robots.txt+UA) merged and tested —
   the backfill must benefit from structured-first so most pages never cost LLM tokens at all.
2. Geocode sanity bounds widened OÖ → Austria (lat 46.3–49.1, lng 9.4–17.3), and **negative
   geocache entries purged immediately after** (lesson: cached misses outlive bounds changes —
   the Bad Ischl bug).
3. **Extraction tokens: the local Grok CLI (`~/.grok/bin/grok`) — George's call, 2026-07-11.**
   `EXTRACT_PROVIDER=grok` routes text extraction through the CLI in fenced headless mode
   (single turn, no tools, tmpdir cwd) on subscription tokens: $0 API cost, verified live
   (Ottensheim 9/9). Trade-off: ~30–60s/page vs ~2s on Gemini — batch runtime is hours, cost is
   zero; run overnight in district batches. Fallbacks stay wired: xAI API (only if XAI_API_KEY
   set) → Gemini (~$6–15 one-time for Austria naive) → Claude.

## Phase 1 — Probe & register (agents, subscription tokens, no LLM extraction)
- Municipality lists per Bundesland from Wikipedia (~2,093 total; OÖ's 436 already done).
- Same prober pattern as the OÖ round: polite sequential GET, CMS fingerprint (RiS-Kommunal /
  GEM2GO / other), find the event-calendar URL, **two-stage verification** (future-dated event
  content + <title> sanity) — the false-positive trap (waste-collection "Termine" pages) is
  documented in briefs/mining-brief.md and MUST be applied from the start.
- Register into `sources` with cms/works/notes/town + a `region` (Bundesland) column so the UI
  and cadence logic can stay OÖ-focused while the DB is national.
- Priority order: Salzburg/Niederösterreich borders of OÖ → Wien/NÖ → Steiermark → rest (nearest
  demand-adjacency first).

## Phase 2 — Backfill crawl (pipeline, Grok tokens)
- `EXTRACT_PROVIDER=grok node --env-file=.env.local scripts/crawl.mjs` in district batches.
- Waterfall order per source: hash-skip → JSON-LD → iCal → RSS → LLM. Record `feed_kind` — after
  the backfill we'll know exactly which % of Austria is structured (expect GEM2GO/RiS to be
  consistent → prime candidates for the deterministic parsers, which remove LLM entirely).
- Post-backfill cadence tiering: OÖ every 2–3 days; other Bundesländer weekly until a demand
  region opens there.

## What to SKIP (the avoid-list — hard learned + hard rules)
1. **Administrative "Termine" pages**: waste collection, council/Gemeinderat sessions, office
   hours, funding deadlines, Sprechtage. (The OÖ probe's false-positive class.)
2. **Course/education catalogs** (VHS class listings, Musikschule semesters) — recurring courses
   are not discoverable events; skip unless it's a one-off open event (Tag der offenen Tür: keep).
3. **Purely liturgical schedules** (mass times) from Pfarre pages — skip; keep genuine parish
   *events* (Pfarrfest, Flohmarkt, Konzert).
4. **Past events and undated events** — never fabricate a date; no date, no event (hard rule).
5. **Copyrighted expression** — no source prose (own one-line description or null), no images.
   Facts + linkback only. (EU database right / UrhG §76c.)
6. **Personal data beyond public organizer facts** (GDPR): Verein name yes; a volunteer's private
   phone number no.
7. **Ticketing platforms** (oeticket, Eventbrite, Ticketmaster) — ToS-restricted; API/partnership
   only, never scraped. Same for Facebook events.
8. **News articles / tourism marketing prose** — not calendars; skip as sources.
9. **JS-only SPAs** — mark works=false with a note; do not burn agent time repeatedly.
10. **robots.txt Disallow** — honored automatically by the waterfall crawler; a disallowed
    calendar gets a note and a "flip to claim-your-event outreach" tag, not a workaround.

## Success criteria
Sources table national with region+cms+works; backfill batches land with per-source feed_kind
recorded; zero fabricated/undated/past events in samples; cost report appended to
docs/research/scraping-cost.md (Grok token spend vs modeled).
