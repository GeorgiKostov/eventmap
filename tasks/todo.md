# TODO

Work queue. `[x]` done, `[ ]` open. Newest context at top. Keep surgical — flip/append, don't rewrite.

## Shipped (prototype v1 → v2, 2026-07-10)
- [x] Scaffold Next.js + SQLite (Supabase-portable schema); MapLibre + OSM map.
- [x] Mine 92 real events from linztermine.at, familienkarte.at, erlebe.enns.at, 14 Gemeinde sites
      (agent mining runs → `data/mined/*.json` → `npm run seed`).
- [x] Geocode (Nominatim + cache + town fallback), event expiry, dedup.
- [x] Poster scan: photo → Claude extraction → confirm → publish → live pin.
- [x] Recrawl script (`npm run crawl`) for scheduled refresh.
- [x] UI overhaul: Google-Maps model (desktop sidebar; mobile mini-card → full detail), light theme,
      SVG category icons, date-range picker + more filters, full DE/EN localization.
- [x] AI-readiness: `/event/[id]` JSON-LD pages, sitemap.xml, llms.txt, MCP server (`npm run mcp`).
- [x] Code review pass (12 findings) + fixes; Vercel-hardening (bundled DB → /tmp); `next build` green.
- [x] Moved to `eventmap` repo; agent scaffold + design doc (this structure) added.

## Shipped (v3 — places, controls, crawl waterfall, OÖ scale-out, 2026-07-11)
- [x] Places content type (kind=event|place, opening hours, circle pins, Events|Orte|Alle, add-place
      with address or drag-pin); 3 verified Linz places seeded.
- [x] Controls relayout: locate-me map control, top-right actions menu (+login slot), locality pill,
      expanding search; search-anywhere (location results re-anchor radius/distance, Around-X chip).
- [x] Scan UX: JPEG re-encode always, upload deleted right after extraction.
- [x] Icon taxonomy: unclear glyphs replaced, 5 place icons added.
- [x] Crawl waterfall: robots.txt+UA, page-hash skip, JSON-LD→iCal→RSS before LLM, feed_kind tracking.
- [x] OÖ source expansion: 95 new sources (GEM2GO 64), full crawl → ~1.8k events / 100 sources / 133 towns.
- [x] Pipeline bugs fixed: Gemini exact-keys, town-fallback geocoding, negative-geocache purge (lesson).
- [x] Grok/xAI provider wired (EXTRACT_PROVIDER=grok) for the Austria backfill; run-book in briefs/.

## Shipped (v4 — Google-Maps shell, venue grouping, geocode quality, family places, 2026-07-11)
- [x] Google-Maps top layout: brand text removed from map UI, pill search bar + account circle
      (opens actions menu); Phosphor icons for back/X + directions/calendar/share action row.
- [x] Venue grouping: one pin + count badge per venue (name+town match, or ≤30m only when both
      coords are venue/address precision — town centroids excluded); "More at this venue" section
      in event/place detail with tap-to-switch.
- [x] Add-event + add-place: choose-on-map for both; address autocomplete via
      `/api/geocode?suggest=1` (Photon — Nominatim policy forbids autocomplete).
- [x] POI-name-first geocoding waterfall (name-match + 15km-of-town + OSM-class bounds) +
      negative-geocache purge; fixes the Musikpavillon-in-the-river / Posthof class.
- [x] 57 family places seeded (Overpass/OSM, curated, ODbL attribution in map credits): museums,
      zoos, climbing halls, pools, indoor play, destination playgrounds. 3 new place categories
      (museum/zoo/climbing) with icons + DE/EN labels.
- [x] opening_hours semantics fixed: `{"always":true}` = always open, null = unknown (renders
      nothing) — museums no longer falsely "Immer geöffnet"; 2-row migration applied.

## Now / next — Austria build-out (George 2026-07-11: "build for Austria, politely by design")
- [ ] **Bulgaria Facebook-events channel** (George 2026-07-12): BG events live heavily on FB, which
      the municipal crawler misses — see memory `bg-facebook-events`. Evaluate Graph API / organizer-
      submission / manual Page seeding (NOT scraping); keep facts+linkback. Do before judging BG coverage.
- [x] **Bulgaria deep crawl + recrawl sources** (2026-07-12): 322 events / 13 municipalities seeded;
      36 fingerprinted listing sources in data/catalog/probed-bg.json, 26 registered (country=BG) so
      `npm run crawl` refreshes BG like AT. Tooling: /crawl-bg, scripts/build-bg-sources.mjs, skills/crawl-doctrine.md.
- [x] **Mobile quick-preview relayout** (2026-07-12, branch claude/mobile-event-preview-layout):
      moved the selected event/place preview from a truncated bottom mini-card to a card docked
      under the search bar — full wrapping title, time/status, venue+distance, 2-line short
      description, caret icon to expand (was "learn more" text); bottom filter bar stays visible;
      mobile flyTo re-padded (top 200 / bottom 150) so the pin sits between card and filters.
- [x] **EN/DE/BG localization** (2026-07-12): proper language picker; BG UI, legal, metadata,
      standalone event pages, and API errors; first visit uses IP country (BG→BG, AT/DE→DE,
      elsewhere→EN) while a manual choice persists and always wins.
- [x] **Locate/search UX fixes** (George 2026-07-12, shipped ef6fac7): search pill no longer shows
      current locality (was confusing), locate-me flies instantly to last-known + cached fix +
      pulsing feedback + denied/unavailable toasts.
- [x] **National coverage SHIPPED 2026-07-12**: deterministic probe of all 2,092 municipalities
      (23 min, no LLM) → 796 sources registered (policy: high-conf + medium-with-CMS-fingerprint)
      → hardened batch crawl → **15,946 events, all 8 Länder** (NÖ 6.9k / OÖ 4.4k / T 1.8k /
      S 1.2k / V 736 / St 457 / B 227 / K 124). Salzburg silent-zero root cause: the batch was
      never run + one "4.5" age string aborted it; both fixed (coercion + isolation).
- [x] **Vienna deep (shipped 2026-07-12)**: 601 Wien events. Backbone = wien.gv.at "Wien erleben"
      (new Sept-2025 system; old open-data dataset confirmed dead) via cms-gated two-hop JSON-LD
      parser ($0); + WIENXTRA, MuseumsQuartier. 45% family-tagged. Skipped on policy: Büchereien/
      VHS Wien robots.txt names ClaudeBot in an AI-bot blocklist — we honor named-AI blocks even
      though UmkreisBot isn't literally listed (George to confirm this policy). wien.info JS-only;
      ZOOM redirect-broken; Kinderfreunde/Wien Museum = follow-up candidates.
- [ ] **Steiermark + Kärnten depth**: thin (457/124 events) — CMS landscape not GEM2GO-dominated;
      identify their dominant CMS from the probe's 'unknown' fingerprints, add a parser or route
      the residue through the LLM waterfall in a targeted batch.
- [ ] **Wien erleben API watch**: the dataset page says a new official API "is in preparation" —
      check quarterly; an API beats our two-hop parse.
- [x] **Dedup + merge system** (shipped 2026-07-12): lib/dedup.js fuzzy match (same Vienna day +
      town/300m-non-sentinel + word-boundary/Jaccard-0.75 titles), scan-of-existing → enrich-merge
      with UI notice, POST /api/events merge path, scripts/merge-dups.mjs (canonical-linkage
      clustering; applied: 127 clusters, 129 dupes deleted, 14 enriched, idempotent-verified).
      Multi-source attribution column = future schema change (after other session lands).
- [x] **Austria family places** (shipped 2026-07-12): 229 curated places seeded across Wien 36 /
      Graz 21 / Salzburg 15 / Innsbruck 11 / Klagenfurt 10 / St. Pölten 14 / Bregenz+Dornbirn 26 /
      Eisenstadt 16 (incl. Familypark) / Wels 29 / Steyr 22 + surroundings — DB now 289 places.
      Marquees verified vs official sites (Museum Arbeitswelt address corrected vs OSM).
- [x] **Pipeline source-of-truth doc** (shipped 2026-07-12): docs/design/data-pipeline.md (12
      sections + runbook + how-to-add-a-region + coverage snapshot). Update it in post-commit
      housekeeping whenever pipeline behavior changes.
- [ ] **Doc-agent findings for the crawl session** (their files, don't fix here): (a) upsertSource()
      has no region param + no committed probe/register script — registration path is ad-hoc SQL;
      (b) crawl.mjs header comment states wrong waterfall order (code: JSON-LD→iCal→GEM2GO→RSS);
      (c) design-doc §5/§6 sources-table description + counts badly stale.
- [ ] **Crawl-time fuzzy dedup**: content_hash still the only crawl-path guard; wire findDuplicate
      into crawl.mjs after the concurrent session lands its changes.
- [ ] **Regeocode repair run**: `node --env-file=.env.local scripts/regeocode.mjs` (dry-run) once
      Nominatim rate-limit has cooled (first dry-run was pre-fix and had bad long-distance matches —
      discard it); sanity-check no multi-km cross-region jumps, then `--write`.
- [ ] Geocode wart: network errors during Nominatim lookups are cached as negative hits
      (pre-existing in `tryQuery`) — stop caching on catch, or 429 storms poison the cache.
- [x] **Supabase Postgres port** — `lib/db.js` on the `postgres` client over the transaction pooler;
      dedicated `umkreis` schema; starts_at/ends_at kept as Vienna-TEXT; booleans/arrays normalized
      to the old SQLite shape so no consumer changed. 95 events imported, map/detail/writes verified live.
- [x] **Scan model swap** — Gemini Flash-Lite primary → Claude Haiku fallback → CLI last, routed in
      `lib/extract.js`. Gemini key wired (routing + build verified; live poster scan not yet fired).
- [x] **Pushed to GitHub** (`git@github.com:GeorgiKostov/eventmap.git`, over SSH). main tracks origin.
- [ ] **Deploy to Vercel** (George — dashboard import; MCP can't set env vars). Env: `DATABASE_URL`
      (pooler, required — copy from `.env.local`), `GEMINI_API_KEY`, `NEXT_PUBLIC_BASE_URL` (live URL).
- [x] **Name decided: Okolo (okolo.events)** — rebrand shipped 2026-07-12: radar identity
      (app/icon.svg favicon, next/og opengraph-image, animated loader), full SEO surface
      (app/robots.js, app/manifest.js, layout metadataBase+openGraph+twitter), title/llms.txt.
      Still TODO: register the domain, set `NEXT_PUBLIC_BASE_URL=https://okolo.events` on Vercel.

## Production backend (mostly done)
- [x] Supabase Postgres port (see above). PostGIS deferred — radius filter is client-side; lat/lng
      doubles suffice. Adding a generated `geography(point)` + GIST index is a one-line future migration.
- [ ] Move `npm run crawl` to a Vercel Cron / GitHub Action (every 2–3 days).
- [ ] Crawl-cost waterfall, cheap wins (docs/decisions/2026-07-11-crawl-scaling-and-legal.md):
      (1) page-change hash → skip unchanged, (2) JSON-LD/iCal/RSS ingestion before LLM,
      (3) robots.txt + rate limit + identifying UA. RiS/GEM2GO deterministic parsers after the
      OÖ probe shows dominant patterns; extra fact fields (ticket URL, price, organizer, RRULE) with it.
- [ ] **GEM2GO parser + source rating + host-concurrency** (agent dispatched 2026-07-11,
      briefs/gem2go-parser-and-source-rating-brief.md): deterministic GEM2GO extraction (no LLM →
      $0/cron-able, covers 64/97 OÖ + hundreds nationally), `tier` rating so dead/empty sources stop
      getting rescanned, parallelize across hosts (per-host ≥1s intact). The real cost lever, not Grok.
- [ ] Poster uploads → Supabase Storage (currently `/tmp` on serverless, ephemeral).

## Validation (the actual go/no-go — design-doc §11)
- [ ] Run the **four-weekend Linz coverage/retention test**: measure % of good events the big
      aggregators miss, and weekly return rate. This gates everything downstream.
- [ ] **Partnership outreach (George sends; drafts in briefs/outreach-emails-de.md, agent preparing
      2026-07-12)**: (1) Stadt Linz — Linztermine eventExport XML API access; (2) Österreich Werbung
      api@austria.info — ContentDB/LTO feed key; (3) Familienkarte / Land OÖ — feed + partnership;
      (4, optional) tips.at — regional media feed. German drafts state: who we are (Okolo,
      okolo.events, families-first event map), what we ask (feed/API access, permission to display
      event facts with linkback), what they get (reach, referral traffic, zero work).
- [ ] Email Familienkarte / Land OÖ for a feed/partnership (cheapest legal data path + first B2B contact).
      **Bundle two more asks** (docs/research/open-event-sources.md, 2026-07-12): (a) Stadt Linz —
      access to the Linztermine `eventExport` XML API (CC-BY-4.0, event-granular, replaces our flaky
      HTML scrape; endpoint exists but 403-gated); (b) api@austria.info — Österreich Werbung ContentDB
      key (all-Austria tourism events, CC-BY-4.0 open tier). Both are George-emails, not engineering.
      Research verdict: no open event DB replaces crawling — Gemeinde long tail has no feed; FB/
      Meetup/Ticketmaster ToS-blocked or closed; Common Crawl useful for source discovery only.
- [ ] Verify the competitive landscape (`docs/research/competitive-landscape.md` §7): confirm LocalPosters,
      Familienkarte, Rausgegangen/AllEvents OÖ coverage, and scan for any 2024–26 AI-native / DACH poster-
      scan entrant (the LLM-extraction wedge is recent enough a fresh competitor is plausible).
- [ ] Decide: is "family-friendly" a filter or the default lens?

- [ ] **Austria backfill Phase 2** (briefs/austria-backfill-brief.md): after waterfall merge + Phase-1
      probe lands — `EXTRACT_PROVIDER=grok` batch crawl (needs `XAI_API_KEY` from console.x.ai — George;
      falls back to Gemini ~$6–15 one-time if no key). Provider already wired in lib/extract.js.

## Backlog (post-validation, not now)
- [ ] Retention loop: saved favorites + reminders + private/invite events.
- [ ] **Social layer on event/place detail** (George 2026-07-11): favorite star (save to list),
      "interested" like (count visible to organizers), comment section below detail. Detail action
      row already reserves space for the star. Target model: Facebook Events × Google Maps interfaces
      + Airbnb-smooth filters/dates UI.
- [ ] **User accounts**: sign-up, own submitted events (form or poster scan), favorites/saved list,
      gamification points for contributing/engaging (add, like, comment).
- [ ] **Anti-spam/scam filters** for user-contributed events (basic heuristics + review queue)
      — prerequisite for opening submissions.
- [ ] **Business tier**: paid event highlighting (special pin visuals, ranked-first placement).
- [ ] **Newsletter**: "nice family events in your area this weekend" digest by location; advertiser
      slots (sponsored top placement) as the monetization hook.
- [ ] More extraction fields: ticket links, prices, organizer, recurring schedules, opening hours.
- [ ] New source types: Gemeinde PDF year-calendars, parish newsletters, oeticket/Eventbrite.
- [ ] RiS-Kommunal / GEM2GO write-API/MCP integration (publish-once → no crawl, no double entry).
- [ ] **"Claim your event" flow** — the single-organizer version of the distribution-for-supply barter
      (`docs/decisions/2026-07-11-middle-layer-strategy.md`): claim → light dashboard (enrich price/ticket
      link/updates) → embeddable widget + "Found on Google & AI via Umkreis" badge + referral stats.
- [ ] One-page **organizer pitch** for the commercial/semi-commercial segment (venues, festivals, paid
      workshops) — trade our SEO/AI distribution for their event feed. Not for civic micro-events (crawled).
