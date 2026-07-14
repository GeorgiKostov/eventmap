# TODO

Work queue. `[x]` done, `[ ]` open. Newest context at top. Keep surgical — flip/append, don't rewrite.

## Set location by map gesture (2026-07-14, George: "typing a location to move from current sucks")
- [x] **Long-press (touch, 500ms) / right-click (desktop) drops the search-anywhere reference point**
      where pressed — reverse-geocodes into the existing `Around {ort}` chip, recomputes distances /
      radius filter / radius circle. Dropped pin draggable to fine-tune. One-time hint toast for
      discoverability. Gated by `addFlowActiveRef`; trailing synthetic click swallowed so it never
      fights tap-to-select. (f046f83)
- [x] **Discoverability: hint at the moment of intent** — the drop-pin tip renders the instant the
      location search opens (i.e. as the user is about to type a location, the very friction the
      gesture removes). Reuses `dropPinHint`. Explicitly NOT in the legend: that's a pin-symbol key,
      collapsed by default, nobody opens it mid-task. (0ca7ace)

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

## Map backbone (2026-07-13, George: "markers shift on zoom/pan — truly broken")
- [x] **All-GL pins rewrite SHIPPED** (brief: briefs/gl-pins-brief.md; Opus implement + Opus
      adversarial review): DOM `.pin2` markers → GL symbol/circle layers (16 sprites @3× from
      CATS/P, `result-pins` source promoteId, feature-state selection, icon-allow-overlap
      everywhere, all-GL 12.0→12.6 crossfade); DOM-marker lifecycle DELETED (syncDetailMarker-
      Viewport, bounds culling, hysteresis, rAF move handler). Drift impossible by construction.
      Review verdict SHIP-AFTER-FIXES → all 7 findings fixed: add-flow click guard (pin tap no
      longer corrupts a location being placed), handoff double-camera race, nearest-hit tap
      resolution, badge digit centering (px translate, not ems), deferred search (no per-keystroke
      source rewrite), 99+ badge cap, selection layers fade with the band (validator caught that
      ['*',…,zoom-interp] is invalid GL — top-level interpolate required). Build green, 6/6 tests,
      style-spec valid. NOTE: commits entangled with a concurrent session (43f4ccf/35dd854 swept
      partial work; b7efd7d restored green HEAD).
- [ ] **George: confirm in a real browser** — pan/zoom smoothness, pins pixel-fixed, click→detail,
      handoff band ~z12.0–12.6 (in-app preview can't run WebGL; env-blocked checks: ±2px projection
      assert, no-vanish queryRenderedFeatures counts).

## Design-system consolidation (2026-07-13, brief: design map review) — SHIPPED
- [x] **Design system doc** `docs/design/design-system.md` = source of truth for tokens / marker
      grammar / control vocabulary; design-doc §9 links to it. Any new UI must cite it.
- [x] **Marker grammar hard cap:** retired the `.pin-series` shape (count badge now carries "many"
      for series too) and the whole-pin community ring (→ small `--community` corner badge, same
      token as list `.source-tag.community` + legend dot). Ring/scale reserved for `.selected`.
      Legend updated (series row removed).
- [x] **Contrast:** darkened the two light golds in `CATS` (`food` #B8860B→#A0750A, `playground`
      #B5A82E→#9D9228) so the white pin glyph clears ≥3:1. Rule documented; keep new cats ≥3:1.
- [x] **One binary grammar:** removed the `.toggle`/`.knob` iOS-switch vocabulary; add-form
      always-open / free-entry are now chips. Kids/Free/Indoor already chips everywhere.
- [x] **Floating controls:** one `.floatstack` (column-reverse: Add bottom, locate above) replaces
      the `.lifted`/`.above-sheet` magic-number offsets; hides over sheet/full-detail. Verified 375px.
- [x] **Umkreis retired** from shipped UI/i18n (DE radius→Radius, chip→"Rund um {ort}", layout meta),
      docs (design-doc/README note), and both prototypes (superseded banner). Product name = Okolo.
- [x] Confirmed single location picker (`.pinpicker` is only the post-publish refine step); confirmed
      `CATS` is the only category-color source (no literals outside it); inline `dtag` hex → tokens.
- [ ] **Follow-up — display webfont:** wordmark is an inline SVG (OS-stable by construction), but
      `--font-display` still leads with Apple-only "Avenir Next" for detail/heading `h2`. Self-host
      one OFL woff2 (`font-display:swap`) if cross-platform heading consistency matters. (Backlog.)
- [ ] **Call to record (not code):** family = filter or default lens? (design-doc §11.3) — until
      decided, "Kids" stays a chip. George's call → `docs/decisions/`.

## Review findings — tonight's commits (2026-07-12 review pass — ALL FIXED 2026-07-12)
- [x] **Zoom cluster↔pin handoff drift/flicker** (efa8ef6): cross-fade + hysteresis + set frozen mid-gesture.
- [x] **HIGH — extract-url UTC millis mis-parse** (4c485af): regex allows `(?:\.\d+)?`; verified millis/offset/bare.
- [x] **HIGH — datenschutz stale vs newsletter data** (790eaa7): policy now lists full data set, DE/EN/BG.
- [x] **HIGH — no unsubscribe path + silent re-opt-in** (790eaa7): double opt-in (token + confirm/unsubscribe
      routes + confirmation mail); migration applied; full lifecycle verified live.
- [x] **MED — big-city series over-collapse** (dcf4bca): splitByVenue keeps distinct named venues as separate
      pins; tests added (multi-venue split, single-venue collapse, sentinel-coords).
- [x] **MED — reverse-geocode out-of-order** (d2e0b54): reverseReqId latest-wins on drag + confirmMapPick.
- [x] **MED — register-bigcities-sw.mjs resurrects dead sources** (dcf4bca): skips already-registered on re-run.
- [x] **MED — extract-url SSRF DNS-rebinding TOCTOU** (4c485af): IP pinned via node http/https `lookup`;
      localhost blocked (422), example.com fetch works. Also IPv6 gaps (fe80::/10, NAT64, hex v4-mapped).
- [x] **MED — geocode country from UI lang** (d2e0b54): newsletter geocode tries both AT and BG.
- [x] **LOW batch** (d2e0b54/790eaa7/4c485af): ends_at now sent + editable end fields; multi-event listing
      bails instead of guessing; reverse/forward geocode per-IP capped; CSV formula-injection neutralized;
      rate slot spent after URL validation; oversize images rejected. radius_km kept deliberately (default 20).

## Now / next — Austria build-out (George 2026-07-11: "build for Austria, politely by design")
- [x] **Unified add-flow** (shipped 2026-07-12, brief: docs/design/add-flow.md): one "+ Add" FAB
      → intake (photo / drag-drop / paste image / paste URL / manual);
      new /api/extract-url (JSON-LD → OG → lib/extract.js cascade, SSRF-guarded, no paid scrapers,
      login-wall → "screenshot it" fallback); event|place switch on confirm (AI sets kind); location
      picking on the MAIN map (two-way address↔map, reverse geocode on settle, PinDropPicker + locMode
      toggle removed from form); menu triplet → one Add item. Also answers the FB-channel item below
      for the organizer-submission path.
- [x] **Series/occurrence map collapse** (2026-07-12): conservative same-title+town grouping anchors
      repeated dates at the strongest resolved venue, renders a distinct count bubble + date list,
      then applies safe same-venue collapse and finally neutral geographic clustering.
- [ ] **Sofia jevents parser** (2026-07-12): visitsofia.bg (Столична община) runs a Joomla *jevents*
      calendar listing ~176 events; LLM crawl only pulls a slice per pass and no iCal export exists
      (403). Write a dedicated parser (enumerate `component/jevents/month.calendar/YYYY/MM/..` →
      `icalrepeat.detail` links → detail pages) like the GEM2GO one, cms-gated in crawl.mjs, to pull
      the full Sofia calendar reliably on every recrawl. Same pattern reusable for other jevents BG sites.
- [ ] **Bulgaria Facebook-events channel** (George 2026-07-12): BG events live heavily on FB, which
      the municipal crawler misses — see memory `bg-facebook-events`. Evaluate Graph API / organizer-
      submission / manual Page seeding (NOT scraping); keep facts+linkback. Do before judging BG coverage.
- [x] **Abuse filter mistuned for scans + BG** (2026-07-13): substring blocklist ('sex'→"Sextet"),
      Cyrillic-blind caps/keyword checks, and phone/caps/link heuristics were rejecting legit scanned
      FB posters; geo check still Austria-only. Now token-boundary (Unicode) blocklist, script-agnostic
      caps, heuristics skipped for AI-vetted scan/link submissions, inServiceArea covers AT+BG. lib/moderation.js.
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
- [x] **National coverage finalized 2026-07-13**: 22,298 events / 1,418 towns / 1,519 working
      sources, all 9 Länder (NÖ 7.6k / OÖ 4.4k / Stmk 2.6k / T 2.0k / S 1.4k / V 1.1k / W 958 /
      B 490 / K 154). Big cities filled via per-city aggregators (Vienna treatment): Wien 958,
      Graz 242, Salzburg 218, Wr.Neustadt 201. Gap-fill added 453 municipal sources (Stmk/Bgld/Ktn
      lifted). 16 stray null-region sources backfilled from catalog. Single-crawl rule enforced
      (Nominatim per-IP lesson).
- [ ] **JS-SPA big-city portals return 0** (Bregenz, Dornbirn, Eisenstadt, Feldkirch, St. Pölten,
      + thin Innsbruck 3/Villach 1/Kufstein 2): their event pages are client-rendered SPAs, so the
      LLM route extracts nothing from static HTML (same class as wien.info). Follow-up: per-city
      custom parser / official API / headless render, or find their JSON/iCal feed. Deep-mining
      agents (a2b6b7bc SW, a36c894e E) flagged custom-parser candidates — resume post-token-reset.
- [ ] **Kärnten still thin (154)**: fewest gap-fill sources registered; re-probe Kärnten municipal
      catalog with a broader policy.
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
- [~] **Rate limits after launch** (2026-07-13, a07e7e0): page is advertised. Dropped all intake
      buckets (events/publish + scan + extract-url) from the 50/hr testing bump to **20/hr** per IP
      (perDay 200, globalPerDay 500 kept) while monitoring for abuse today. `[intake]` diagnostic
      logs stay. Revisit: tighten further toward the original 4-5/hr if abuse shows up, or hold at 20.

## Growth & go-to-market (strategy: docs/strategy/growth-and-social.md, 2026-07-13)
- [ ] **Newsletter unsubscribe/consent gaps — remaining** (double opt-in + unsubscribe shipped
      790eaa7; these are the leftovers): (a) decide grandfather-vs-drop for existing pre-migration
      subscribers (all now confirmed_at=NULL); (b) record a proof-of-consent (timestamp + consent-text
      version + IP-hash at signup); (c) add RFC-8058 List-Unsubscribe + List-Unsubscribe-Post headers to
      the actual newsletter sends when the send pipeline is built; (d) confirm-token expiry/rotation
      policy; (e) offer preference-management/unsubscribe from the confirm landing page.
- [ ] **Design + build the `okolo.linz` IG/FB weekly-posting flow** (design in
      docs/strategy/growth-and-social.md §2): weekend-picks selection query → `next/og` card template(s)
      at 1080×1350 (reuse app/opengraph-image.js) + cover card → card/batch endpoint
      (`/api/social/weekend-card`) → a "generate this week's carousel" script (PNGs + caption). Manual
      posting first; Graph API automation only after the motion is proven. Facts+linkback: our own card
      art + descriptions, never source posters/prose; link to our map.
- [ ] **Verify FB/WhatsApp groups to seed into** (method + candidates in
      docs/strategy/growth-and-social.md §3): live pass — join Linz/OÖ parent + community FB groups,
      read each group's promo rules, gauge activity; identify Bulgarian-in-Austria groups; plan the
      kindergarten/playground QR→WhatsApp route. Output a short vetted list + per-group engagement note.

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

- [x] **Crawl cadence fixed + repeatable-source rule** (2026-07-14): cron weekly → daily, so the
      `active`/`slow`/`dormant` tiers stop being dead code. Sindelfingen + Kreativregion adapters
      (`typo3-hwveranstaltung`, `wordpress-ical`) wired into the crawl waterfall and both sources
      re-enabled (395 events now refresh instead of rotting). Hard rule 7 in CLAUDE.md: outside
      crawlers/tools are bootstrap only; a source isn't done until the cron can re-fetch it.
- [ ] **Stuttgart city source is robots-blocked** — `Landeshauptstadt Stuttgart` yields 0 events;
      stuttgart.de disallows its RSS path. Find an allowed endpoint (open-data portal? JSON-LD/iCal
      calendar page?) or send a permission email (briefs/outreach-emails-de.md). Never crawl the
      blocked path. Biggest city in the DE scope currently contributes nothing.
- [ ] **Watch Actions minutes** after ~2 weeks of daily crawls: most AT sources still default to
      `tier='active'` (2d) until they have 3 crawls of yield history, so early runs are heavy
      (~600–1,400 min/month est., free allowance is 2,000 on private repos). Should self-correct as
      tiers demote; if not, drop the trigger to `0 4 */2 * *`. See docs/ops/crawl-cron.md.

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
      Advertising/partnership enquiry modal is shipped; actual boosts still need per-placement
      “Anzeige/Sponsored” labels, payer identity, ranking disclosure and advertiser terms.
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
