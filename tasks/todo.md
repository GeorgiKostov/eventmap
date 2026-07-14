# TODO

Work queue. `[x]` done, `[ ]` open. Newest context at top. Keep surgical — flip/append, don't rewrite.

## Adversarial review (2026-07-14, George: "adversarial review of all the latest features… sonnet agents and review" → "clean all") — SHIPPED (96ce8c4, cddd1ee)
Four Sonnet agents (crawl · map · growth · admin-auth security), architect-verified every
Critical/Major against the code, then fixed all. Build green, 52 tests pass (+3 new), DB smoke-tested.
- [x] **CRITICAL — multi-day events expired after day one.** Adapters dropped `ends_at` unless an end
      TIME was present, so a known end DATE (Kinderfreunde 28.02–31.12, GEM2GO/kalkalpen/JSON-LD
      ranges) was lost and expireFinished fell back to end-of-START-day. New `makeEndsAt()`
      (lib/event-time.js) keeps a date-only end; expireFinished reads a 10-char ends_at as end-of-day.
      crawl.mjs (generic+naturfreunde) + seed.mjs (stopped fabricating 23:59).
- [x] **CRITICAL — CSRF on GET /api/admin/remove** (new in the uncommitted auth work): accepted the
      SameSite=Lax cookie on a mutating GET. Now token-only.
- [x] **MAJOR ×6:** login brute-force (leftmost XFF spoof + no global cap → trusted platform IP +
      globalPerDay); unauth /api/social/card built+froze the digest & burned an LLM call (→ loadDigest
      only); digest send double-mailed on timeout/partial (→ per-recipient ledger); weekendPicks
      additive ranking let non-family outrank family (→ lexicographic tuple) + "community" predicate
      caught osm_mined (→ COMMUNITY_KINDS); venues registry rung unbounded (→ town-bounded; prod
      already 0 rows beyond 15km); search no diacritic fold (→ unaccent, migrate-unaccent.mjs applied).
- [x] **MINORs:** crossfade-band town-bubble tap ambiguity; digest all_day vs time-unknown drift;
      drop recompute + regenerate-un-drop; mapPins places-can-starve-events reserved cap; publish-merge
      dedup decoded first; robots `*`/`$` glob + strictest-delay merge; expireIfStale advisory lock;
      parseBbox empty-component; search relevance ranking; entity decode-to-stable; stale comments/copy.
- [ ] **George: real-browser check of the crossfade-band tap fix** — town bubble vs cluster bubble at
      z≈12.3 (WebGL not drivable in the agent pane, same caveat as the other bubble-tap items).
- Deliberately NOT changed: GET /api/admin/login `configured` flag (needed by the desk UI, rated
  non-exploitable); anonymous-submission validator still rejects a date-only `ends_at` (stricter UGC
  policy than the crawl path, on purpose); HMAC session key = ADMIN_PASSWORD (deliberate per its own
  comment — a leaked session shouldn't equal a leaked master credential, but rotating the pw is the
  only kill-switch; flagged, not changed).

## Search: city/town before events (2026-07-14, George: "type vie or wie, always vienna/wien shows up")
- [x] **Three letters of a city now find the city.** `lib/places.js` — search-only gazetteer (~33 AT
      + ~25 BG cities with the aliases people type: Vienna→Wien, Sofia/софи→София), ranked prefix >
      word-start > substring, population as tiebreaker; merged with the towns of loaded events.
      Photon stays as the long tail (villages/addresses) but now tags localities (`osm_key=place`)
      so they sort above streets/POIs, deduped against gazetteer names *and* aliases. Locations
      always render above events; Enter picks the top location. Kept out of `lib/towns.js` on
      purpose — `townCentroid()` fuzzy-matches that list when pinning events. (59d03c4)
- [ ] **Standing rule (CLAUDE.md hard rule 8): expanding coverage = updating `lib/places.js`** in the
      same change. A crawled city nobody can type their way to is invisible. Docs: data-pipeline §5b.

## Viewport-native rebuild (2026-07-14, George: "best for performance and scale... dispatch sonnet opus agents") — SHIPPED
- [x] **Radius model retired; viewport = the spatial filter** (decision doc
      2026-07-14-viewport-data-loading.md, brief briefs/viewport-rebuild-brief.md). PostGIS geom +
      GiST (migration run on prod), zoom-tiered API: pins ≥z11.5 (LIMIT 800, places-first so they
      never starve, total/truncated surfaced) / server grid cells below (constant cost at any scale).
      Global ?q= search, ?ids= saved-list resolve, expireIfStale — reads don't write. Linz viewport
      47 KB (was 10.2 MB / 23,766 rows). Pipeline: Sonnet server agent → Sonnet client agent → Opus
      adversarial review (SHIP-AFTER-FIXES, 2 MAJOR + 4 MINOR + 2 NIT, all fixed or deliberately
      accepted) → architect integration. (ced9e73)
- [x] **Basemap-outage resilience** (architect integration findings): initial fetch gated on map
      init not MapLibre 'load' (CDN outage → grey map + working list, never "0 events");
      `flyAssured()` jumpTo-watchdog so recenters land + refetch even with a dead render loop.
- [ ] **George: eyeball on prod** — Vienna at z12–12.6 (truncation hint + places present), cells at
      country zoom, cell-bubble tap (desk-checked only — flaky tile CDN blocked click-testing),
      search → cross-country fly, saved list from another city.
- [ ] Later, if EU dataset outgrows grid cells: MVT vector tiles (ST_AsMVT), CDN-cached. pg_trgm +
      GIN for search >100k rows.

## Family/kids quality (2026-07-14, George: "not tagged as kids but family — remove the kids tag?")
- [x] **"For kids" was HIDING every playground** — the predicate (`age_min IS NOT NULL OR family =
      ANY(cats)`) predated the `place` kind, so it deleted **1,268 of 1,269 places** (all playgrounds,
      pools, zoos, indoor play). Answer to George: don't remove the filter (it's the product thesis,
      and there is no separate "kids" tag — the chip already means family-OR-age-range); fix the
      definition. `lib/kid-cats.js` = single predicate for server SQL + client list (they had drifted
      into two implementations). Kid places = playground/indoor_play/zoo/pool/climbing/park; museum
      + trail deliberately excluded (adult venues / needs family_suitable attr). Verified live:
      For-kids results 2,634 → 3,483, places 1 → 849, API returns 25 places for Linz. (6cd13b0)
- [x] **`sources.default_categories`** — a children's museum publishes kids events even when the
      event text never says "kids" (144 FRida events extracted as `culture`, invisible to the filter).
      Source-level categories appended at crawl time + backfilled. Set only for unambiguously
      single-audience sources; NOT dioceses/libraries/Naturparks (that would be hard-rule-5
      fabrication in the category column). Backfill joins on source_name — source_url holds the
      EVENT permalink for most adapters. (3ac0e47, ae335fa)
- [x] Duplicate FRida source (2905) deactivated — 1717 already crawls it since 2026-07-12.
- [ ] **Open call for George:** should `museum` and/or `park` count as "For kids" places? Currently
      park=yes, museum=no. One-line change in `lib/kid-cats.js`.
- [ ] **Erzdiözese Wien is structurally low-yield**: its listing shows only a rolling "today" window
      (18 events ingested, all 06:00–07:30 masses, expired within hours) and its date-navigation URLs
      are robots-blocked. Left registered (1 fetch/day) but it will contribute ~nothing. Other 4
      dioceses fine.

## Feedback signals (2026-07-14, George: "ratings + likes + comments? what do you recommend")
- [x] **Interested / Save** on events + places — anonymous one tap, save in localStorage (works at
      zero traffic, no account), server keeps only the aggregate. Count hidden below
      `INTEREST_SHOW_MIN`=3 ("1 interested" reads as an empty room). Saved list = first menu item.
- [x] **Data-quality reports** — closed enum (cancelled / wrong_time / wrong_info / not_free), no
      free text ⇒ nothing to moderate ⇒ no login needed. Surfaced on the card only once `REPORT_MIN`=3
      independent reporters agree, so one person can't smear an event. Defends hard rule 5.
- [x] One `reactions` table + `/api/react`; unique (event_id, kind, ip_hash) = one person one vote.
      Migration `scripts/migrate-reactions.mjs` (run against prod DB). (0c100b9)
- [ ] **Deliberately NOT built:** star ratings (fail cold-start; events are ephemeral, places lose to
      Google's volume) and free-text comments (DSA/ECG moderation burden on a kids product, needs a
      login, which throttles volume to ~zero at validation scale). Revisit comments post-test, behind
      accounts — "Saved" is the earned on-ramp (people ask for sync once they lose saves on a new phone).
- [ ] Watch in the test: interest taps = the only intent-to-attend signal we have; reports = coverage
      accuracy, the go/no-go metric.

## Set location by map gesture (2026-07-14) — BUILT, THEN RETIRED
- [x] Long-press / right-click dropped a reference pin; tip shown only on an empty result. (f046f83, cf4223c)
- [x] **REMOVED (George, same day): "we can remove the right click and long tap now right"** — correct.
      Under the viewport model, panning IS how you see events elsewhere, so the gesture duplicated the
      map's primary interaction, and its tip ("long-press to see events around that spot") became wrong
      advice. Gone: dropLocationPin, contextmenu/touch long-press listeners, draggable search-marker,
      the hint + its localStorage key, droppedPinLabel/dropPinHint (de/en/bg), .search-hint CSS.
      Typed location search still re-anchors distances via the "Around X" chip — the pin's only
      remaining job. (page.js swept into 6375d5a; remnants 3dbace7)
      **Lesson: a feature can be correct when built and obsolete two hours later — a bigger change
      upstream (radius → viewport) can delete the problem a feature was solving. Re-audit gestures
      after an architecture change instead of carrying them forward.**

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

### Weekly growth engine SHIPPED 2026-07-14 (system doc: docs/strategy/growth-system.md)
- [x] **Phase 2 — the digest is a permanent public page** (George: "sharable page per city
      per week so we reuse the content and have a nice SEO output"). `/weekend/<city>/<friday>`
      renders the SAME frozen snapshot the mail and the carousel read: schema.org ItemList of
      Events, own descriptions, in the sitemap, og:image = that weekend's carousel cover (card route
      gained `&weekend=` so an old page keeps its own cover). `/weekend/<city>` (no date) always
      redirects to the current weekend — the stable URL for a bio/QR poster/pinned group message.
      Past weekends stay up as an archive. Guards: <3 picks ⇒ noindex (a stack of thin city pages is
      a doorway farm); a past weekend links only still-published events (no link-to-404s). Caught by
      rendering it: JSON-LD had NO startDate — schema.org Event requires it and Google rejects the
      WHOLE rich result, so all 9 events would have been invisible. Snapshots now carry startsAt/
      endsAt; jsonLd() drops any dateless item rather than emit a broken Event. (6e026ea)
- [x] **Digest length is quality-gated**, not fixed: floor 5, ceiling 9 (IG allows 1 cover + 9
      slides). Above the floor a pick must still clear the family lens. A thin weekend reads short,
      never padded. Interests picker REMOVED from signup (asked a question the send ignored).
      Cron points at Linz only — the other 9 channels are ready but have no handle/audience.
      Measured cost: ~1.2¢ per city per week (2.3k in + 700 out, Sonnet) = 61¢/yr for Linz. (6605107)
- [x] **The whole Thursday flow is built and driven end-to-end**: channel registry
      (`lib/city-channels.js`, 10 cities DE+BG) → weekend-picks query (`weekendPicks()`, PostGIS
      ST_DWithin + DISTINCT ON title so a series can't fill the digest) → AI copy
      (`writeDigestCopy()`, **Sonnet** primary → Gemini → deterministic template) → frozen weekly
      snapshot in `meta` (cards/caption/email can never disagree) → 1080×1350 carousel
      (`/api/social/card`, Noto = real Cyrillic) → the desk (`/admin/thursday?token=`) → send with
      RFC-8058 List-Unsubscribe → CLI (`npm run digest`) → Thursday cron that **prepares only**.
      Verified: real Linz + Sofia picks, cards rendered, teasers traced back to our own DB
      descriptions (no fabrication), 403/503/409 guards all fire.
- [x] Consent gap (c) CLOSED: List-Unsubscribe + List-Unsubscribe-Post on every send, and the
      unsubscribe route now answers the one-click POST.
- [x] **Sonnet copy CONFIRMED working locally** (`copy: claude-sonnet-5`). The key was there all
      along — in `env.local`, the DOTLESS file, which nothing loads (`next` reads `.env.local`; every
      npm script passes `--env-file=.env.local`). Exactly the trap in lessons.md 2026-07-10. Copied
      into `.env.local`. **Two identical-looking env files is a footgun — consider deleting the
      dotless `env.local` (both are gitignored).**
- [x] **Admin is a PASSWORD now, not a URL token** (George: "cant we just add some password locked
      page so i can log in from anywhere"). `ADMIN_PASSWORD` → POST /api/admin/login (constant-time
      compare, rate-limited 10/h + 30/day per hashed IP via the durable limiter) → httpOnly + Secure +
      SameSite=Lax cookie holding `<expiry>.<HMAC(expiry)>`, keyed on the password itself, 30 days.
      Stateless (no session table) and changing the password logs every device out. Log-out button on
      the desk. `?token=` survives ONLY on /api/admin/remove — a mail client can't present a login
      form. Verified: 403 → wrong-pw 401 → right-pw 200 → forged/expired cookie 403 → brute force 429
      at attempt 9 → reload keeps the session → `document.cookie` cannot see it (httpOnly).
- [ ] **George: still needed for PROD** — set on Vercel: `ADMIN_PASSWORD` (long + random),
      `ANTHROPIC_API_KEY` (also as a GitHub Actions secret — the Thursday cron writes the copy, else it
      silently falls back to Gemini), and keep `ADMIN_TOKEN` for the removal links.
- [ ] **THE REAL GAP — audience is zero.** 1 subscriber, unconfirmed; no followers; no groups seeded.
      Supply (22k events) and the machine are both done; distribution is the bottleneck and always was.
      Running the four-weekend test before seeding an audience measures nothing. Plan:
      docs/strategy/growth-system.md §5 (map signup prompt → parent FB groups → kindergarten/playground
      QR → Familienkarte). **This is step one of the validation test, not marketing to do later.**
- [ ] **Newsletter consent gaps — remaining**: (a) decide grandfather-vs-drop for the pre-migration
      subscriber (confirmed_at=NULL, so it currently receives nothing); (b) record a proof-of-consent
      (timestamp + consent-text version + IP-hash at signup); (d) confirm-token expiry/rotation policy;
      (e) offer preference-management/unsubscribe from the confirm landing page.
- [ ] Open call (growth-system.md §10): community-submitted events get +2 in the digest ranking — which
      is exactly what let a *test row* headline the first digest. Keep the bonus + rely on Drop, or gate
      community events on a quality check?
- [ ] Later, only after ~4 weeks of manual posting proves the motion: Instagram/FB Graph API auto-post.
      Never before — auto-posting bots get banned from the local parent groups that are the whole channel.
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
- [x] **Stuttgart "robots block" was OUR parser bug, fixed 2026-07-14** — parseRobots ignored
      `Allow:`, so Cloudflare's `User-agent:* / Allow:/` + named-AI-bot blocks merged into one
      all-disallowed `*` group. Fixed (Allow parsing, longest-match precedence, same-agent group
      union, trailing-`*` prefixes; 13/13 tests incl. live stuttgart.de). Stuttgart now yields
      **92 events via the existing sitepark-ical adapter**; Община Плевен (only other victim)
      unblocked too. Both sources' stale notes replaced.
- [ ] **Watch Actions minutes** after ~2 weeks of daily crawls: most AT sources still default to
      `tier='active'` (2d) until they have 3 crawls of yield history, so early runs are heavy
      (~600–1,400 min/month est., free allowance is 2,000 on private repos). Should self-correct as
      tiers demote; if not, drop the trigger to `0 4 */2 * *`. See docs/ops/crawl-cron.md.

- [ ] **Austria backfill Phase 2** (briefs/austria-backfill-brief.md): after waterfall merge + Phase-1
      probe lands — `EXTRACT_PROVIDER=grok` batch crawl (needs `XAI_API_KEY` from console.x.ai — George;
      falls back to Gemini ~$6–15 one-time if no key). Provider already wired in lib/extract.js.

## Big-city quality concept (2026-07-14, George: precise locations + family/nature sources —
## full concept: docs/design/big-city-quality.md; measured: 51% of 9,035 events in the 5 city
## zones sit at town precision; 2,565 have a venue string that collapses to 1,163 unique pairs)
- [~] Stage 0 hygiene SHIPPED in geocode (isSentinelVenue: Online/Sonstige/… never feed the venue
      geocoder). REMAINS: UI decision for the existing 394 'Online' events (list-only vs badge) —
      they still sit at town centroids until that call.
- [x] **Venue registry SHIPPED** (2026-07-14): `venues` table (schema + scripts/migrate-venues.mjs,
      seeded 4,216 venues from resolved events + places); geocodeEvent consults it before Nominatim
      and writes every new POI hit back (resolved_via provenance, first-resolution-wins).
- [x] **Detail-page second hop SHIPPED**: scripts/enrich-locations.mjs — registry → JSON-LD
      Event.location (title-matched) → per-event GEM2GO/RiS iCal LOCATION (data-bez title match,
      postcode→address vs name→POI routing) → detail-table Ort/Adresse; 30km town guard; dry-run
      default. Shares lib/crawl-net.js (politeFetch+robots extracted from crawl.mjs). First
      5-zone --write run in flight.
- [x] **NOMINATIM_URL env** in lib/geocode.js: self-hosted instance skips the 1.1s throttle.
      Setup runbook for George's Ryzen box: docs/ops/local-box-setup.md (Nominatim docker AT+BG+DE
      merged extract → Europe later; systemd timer; NEVER run box cron + GH Actions cron together).
- [ ] `blocked_reason` column + monthly recheck + rot-report section (robots|ai_bot_policy|js_spa|
      login_wall|tos) — blocked ≠ dead; feeds the outreach queue instead of rotting to tier=dead.
- [x] **Naturfreunde adapter SHIPPED + verified** (c19a6bc): cms='naturfreunde', family+kids
      target groups server-side (ids via ng_basedata; leading "_" silently no-ops the filter!),
      source lat/lon used directly, own item-set hash (GET returns a 14-byte stub). 77 events live.
- [x] **Kinderfreunde adapter SHIPPED + verified**: cms='kinderfreunde', 65 events live (14 dropped
      on geocode — some cards carry street-as-town; never fabricated).
- [x] **13 small family sources registered + verified** (scripts/register-family-sources.mjs):
      FRida&freD, Stadtbibliotheken Graz/Innsbruck/Linz+VHS, Naturpark Attersee-Traunsee, ASVÖ,
      OÖ Familienbund (JSON-LD, 10/10, $0), Donau-Auen (Livewire SSR — NOT a SPA, brief was wrong),
      4 Alpenverein section pages. Skipped on evidence: Stadtbibliothek Salzburg (PDF/stale),
      Alpenverein Wien (0 events). First cron crawl picks them all up.
- [x] **Diocese "siteswift" cluster SHIPPED** (d8285c8) — the second GEM2GO: one adapter, five
      markup skins, 6 of 9 dioceses run it; 5 registered (Linz/Wien/Graz-Seckau/Eisenstadt/
      Salzburg; Feldkirch = JS-only via robots-blocked .siteswift path). Parish-level family
      events (MuKi, Jungschar, Kinderchor). Listing = rolling ~20-event window, no compliant
      pagination → coverage accumulates by recrawl cadence. Diözese Linz verified live (8 upserted
      first pass). Request-rate N/S robots directive now parsed (1/30 → 30s host delay).
- [x] **Kalkalpen sitemap two-hop SHIPPED + verified**: 104 occurrences upserted (incl. kids
      Nationalpark tours), town per occurrence from map-marker text, never defaulted.
- [x] **Conditional GET SHIPPED**: sources.etag/last_modified, If-None-Match/If-Modified-Since on
      the generic shell, 304 → unchanged path (live-demoed). Most nightly fetches become free.
- [ ] **Cluster follow-ups from research**: feratel Deskline = partnership email (DSI interface /
      Open Data Platform, servicecenter@feratel.com) — JS-only widget, not crawlable politely;
      Gem2Go central API = none documented, partnership email to office@ris.at if wanted;
      **Veranstaltungsdatenbank NÖ** (Gem2Go consumes it — an official Land-NÖ event DB) = worth
      a direct look, unverified.
- [ ] Zone-scoped CMS sniff of the 1,027 unsniffed probe skips — Graz ring thinnest (63 sources,
      ≥51 candidates); Stmk 12%/Ktn 13%/Bgld 15% pass rates hide a cluster. (Merges with the
      fingerprint item below.)
- [ ] Venue web-search backfill (Grok CLI $0 / Gemini grounding) for residual unique venue pairs —
      model returns an address STRING, we geocode it ourselves, 15km bound, registry provenance.
      Never accept model coords (hard rule 5).
- [ ] Places: trails via route=hiking + sac_scale strolling|hiking (11.7k relations / 26.5k easy
      ways AT-wide) with family_suitable + trail_type attrs; **family_cafe** category via
      restaurant↔playground ≤80m spatial join (direct tags measured dead: kids_area=67, playground
      =yes on restaurants=1); retail play areas (IKEA/XXXLutz) = committed hand-curated seed file.
      `farm` deferred. George's call: family_cafe labeling honesty ("own playground" vs "nebenan").
- Rejected: per-event Google search as the opener (venue-first is ~10× cheaper); Mamilade/
  alpenvereinaktiv/bergfex/komoot as sources (ToS/commercial — partnership conversations only).

## Text hygiene / entity decoding (2026-07-14) — SHIPPED
- [x] **One entity decoder** (`lib/entities.js`) replaces the NINE partial hand-rolled copies (7
      adapters + crawl.mjs + probe-sources.mjs); only 2 of the 9 handled numeric refs, so `&#8211;`
      reached 66 published titles. Enforced at the single write boundary (`upsertEvent` → `cleanText`
      on title/description/venue/address/town), so no future adapter can bypass it. 10 unit tests.
- [x] **Cleanup applied to prod** (`scripts/fix-entities.mjs`, dry-run default): 298 rows normalized
      (decode + trim/collapse + re-hash), 20 provably-identical duplicates merged into the older row
      (identical recomputed content_hash = same title/day/time/town/venue; enrich-then-delete).
      Verified idempotent: full re-extraction of Krenglbach upserted 12/12 with zero new rows.
      DB now: 0 entity-bearing rows, 0 untrimmed titles.
- [x] Deliberately NOT done: mass-rewriting the ~28k rows that still carry the legacy hash format —
      `upsertEvent`'s legacy path re-matches those on purpose (exact starts_at + non-conflicting
      venue); re-hashing them would break the match and let the next crawl duplicate them.
- [ ] **`Gemeinde Krenglbach` publishes a corrupted title itself** — krenglbach.at's own JSON-LD
      `name` reads "…der ErdeDie progressiven Nostalgiker" (their WordPress welds the next event's
      title on; their share-link carries the same string). NOT our bug; we store it faithfully. Event
      #1894 is the visible copy, duplicating the clean #805. Options: mail the Gemeinde, or add a
      source-specific title guard. **Do not "repair" it by inference — that is fabrication.**

## Fabricated start time — FIXED 2026-07-14 (lib/event-time.js)
- [x] **The crawler no longer invents a time.** Both write paths did `T${time || '09:00'}` **and**
      `all_day: time ? 0 : 1` — two fabrications from one missing fact. The `09:00` was mostly hidden
      (the UI short-circuits on all_day), but `all_day=true` renders as **"ganztägig"** = "turn up
      whenever", which we were claiming for **8,365 live events** we knew nothing about. Encoding now:
      **date-only `starts_at` ("2026-07-19") = the source published no time**; `all_day` is set only
      when someone actually says so. One definition in `lib/event-time.js`
      (`hasTime`/`timeOf`/`makeStartsAt`/`inTimeOfDay`), threaded through crawl, seed, scan, the add
      form, contentHash, expireFinished (a timeless row now lives to end-of-day, not 06:00), the
      SQL + client time-of-day filters, JSON-LD (`startDate` is a bare Date), the detail page, the
      list, the digest and the cards. New label `timeTbd` in de/en/bg. 6 new tests.
- [x] **Backfill applied**: 10,625 rows → date-only + all_day=false. Provably lossless — `all_day` was
      never a source fact, every path inferred it from a missing time, so `all_day=true ≡ time unknown`.
      Verified: `all_day=true` is now 0; live crawl of a GEM2GO source re-extracted 74/74 with the row
      count unchanged (the placeholder-migration in `upsertEvent` adopts the old rows instead of
      duplicating them); map shows "Uhrzeit nicht angegeben", never 09:00.
- [x] **Left alone on purpose**: the 1,427 rows at `09:00` with `all_day=false` — there the extractor
      genuinely PARSED 09:00 (traun.at really publishes "Zeit 09:00–13:00 Uhr"). Destroying a true time
      to satisfy a heuristic is the same fabrication pointing the other way.
- [x] **merge-dups canonical rule fixed**: the survivor is now the row with the most FACTS (published
      time ≫ geo precision > venue > description), with age only as the final tiebreak. Re-verified in
      its dry run: it now KEEPS "Sachkundenachweis" @18:30 and Pflasterspektakel @16:00 instead of
      deleting them for placeholders.
- [ ] **George: `scripts/merge-dups.mjs --write` is still UNRUN** (436 clusters / 481 rows). The
      destructive canonical bug is fixed, but its dry run still shows a separate problem it cannot see:
      a canonical row can carry a *wrong town* ("4. Tag des Living Pools!" #144 = Alkoven, from a
      Kematen source — a geocode bug). Read the dry run before writing it.

## Source & parser coverage (2026-07-14, Gemini code review — triaged, kept the useful half)
- [ ] **Fingerprint the unclassified sources — do this BEFORE writing any new parser.** Mined catalogs
      show `cms` = gem2go 1275 / **other 447 / unknown 408** / custom 53 / ris 29. The 855 unclassified
      rows are ~30× the RiS prize and almost certainly hide another gem2go-sized cluster. Step 1: run the
      count against the **live `sources` table** (local `data/umkreis.db` is stale — pre-`cms`-column;
      real DB is Postgres via `DATABASE_URL`) to confirm the ratio. Step 2: extend
      `scripts/probe-sources.mjs` to sniff CMS (generator meta, asset paths, URL shape, footer sig) and
      backfill `sources.cms`. Step 3: rank CMS → #towns → #with-parser. That ranked list *is* the parser
      backlog — stop guessing which one to write.
- [ ] **RiS-Kommunal deterministic parser** — real, but it's ~29 sources, not the top of the list.
      Do it *after* the fingerprint sweep says nothing bigger is hiding. Mirrors the GEM2GO parser
      (`scripts/crawl.mjs:331`), wire into `tryStructuredExtraction()` per hard rule 7.
- [ ] **Austrian town-centroid table** (~2,100 municipalities) — `lib/towns.js` covers only ~17 towns
      around Linz, so every new region's centroid fallback goes through Nominatim's 1.1s gate. Cheap
      (hours) and worth doing now. NOTE: this fixes the *fallback* path only — venue/address lookups
      (the hot path, ~200k unique at EU scale) still need the self-hosted Nominatim below. Stacks with
      it; does not replace it.
- [ ] **George-actions (need an email from you, 403 by default):**
      - **linztermine.at XML open-data API** — CC-BY-4.0, has `properforchildren` + `freeofcharge` flags.
        Would replace the monthly `/linz-erleben/` HTML scrape that breaks on every month rollover.
        Best single win here: a licensed feed for our most important city. Contact: Stadt Linz digital office.
      - **Österreich Werbung ContentDB** — CC-BY-4.0 aggregate of Austrian tourism boards (incl. OÖ),
        skews family/festival/seasonal. Request credentials: `api@austria.info`.
- [ ] **Land OÖ Familienkarte scraper** — POST with date-range + district keys (Linz Stadt=7, Linz Land=8);
      static page only returns today. Our exact target audience. (Already noted in briefs/mining-brief.md.)
- **Rejected from that review:** promoting the Facebook link-unfurl as a *supply channel*. The existing
  `/api/extract-url` path stays exactly as-is — user-initiated, one URL, rate-limited 20/h — and that is
  defensible: it reads the OG tags Meta publishes for link previews, same as any Slack/WhatsApp unfurl.
  Scaling it into systematic FB harvesting is identity-misrepresentation to obtain withheld content — the
  same category as the VPN idea rejected in the architecture doc, and we don't get to wave it through just
  because Meta is big. **Working position, not a closed decision** — BG relies heavily on FB events (see
  memory), so there's real product value on the other side. George to overrule if he wants it.
- **Already covered elsewhere, no action:** schema enrichment (ticket links / price / organizer / RRULE)
  is item 5 of the 2026-07-11 decision's build order. Google Maps: correctly rejected — no events API,
  ToS forbids storing coords / rendering on a non-Google map. Stay on OSM/Overpass + MapLibre; let our
  JSON-LD make *us* the thing Google indexes.

## Crawl infra — EU/planet scale (docs/architecture/eu-scale-extraction.md, 2026-07-14)
Items 1–7 are local-box/pipeline wins that make the *current* crawl cheaper and more reliable, so they
are OK before the Linz gate. Country registration (item 8) is explicitly post-Linz.
- [ ] **Raw page store** — content-addressed gzip blobs (`sha256(body)`); extraction reads the store,
      never the network. Unblocks free re-extraction of everything after a parser/schema change
      (today a parser bug means re-crawling the continent). ~2GB per EU snapshot.
- [ ] **Self-host Nominatim + Photon** (Geofabrik Europe extract) — `lib/geocode.js` serializes every
      lookup through one global 1.1s gate: EU backfill = ~61h, planet = ~25 days. Self-hosted → minutes,
      and the 429/negative-cache storm (NÖ backfill, tasks/lessons.md) stops being possible. **The
      bottleneck.** Needs the box first (~1TB NVMe, 32–64GB RAM).
- [ ] **CMS fingerprint at probe time + coverage metric** — extend `scripts/probe-sources.mjs` to write
      `sources.cms` for every source; standing query CMS → #towns → #with-parser, sorted by towns
      unlocked = the parser backlog. One parser per CMS = hundreds of towns at €0/page. Helps Linz +
      Stuttgart today.
- [ ] **Conditional GET** (`ETag`/`If-Modified-Since`) on top of `page_hash` — hash skips extraction,
      conditional GET skips the transfer. Most nightly fetches become a 304.
- [ ] **Rot detector** (hard rule 7 enforcement) — alert on `works=true` sources past their cadence and
      on climbing `zero_streak`. At 5k sources silent rot is guaranteed without it.
- [ ] **Claim-queue** — `claimed_at`/`claimed_by` on `sources` + `FOR UPDATE SKIP LOCKED`. Turns the
      single-process crawl into an N-machine fleet with no change to the extraction path.
- [ ] **LLM leftovers via Batch API** (50% off, 24h turnaround) — a nightly crawl has zero latency need.
- [ ] **Country onboarding** (national open-data feed → dominant CMS parser → long tail), ranked by
      events-per-parser not market size. **Post-Linz — this is the part that builds supply past the gate.**
- Rejected (see doc): VPN/proxy rotation (torches the legal posture for a problem we don't have),
  Apify, thread maximization (EU aggregate is ~0.2 req/s), agents as the recurring crawler.

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

## Imprecise locations — honest map (2026-07-14, George: "how do we communicate it so it's not confusing")
- [x] **Jitter removed + 10,661 rows snapped to true centroid** — the ±300m scatter INVENTED a
      coordinate for every town-level event (170 across a few Wiener Neustadt blocks). (0495d13)
- [x] **Town groups**: dashed bubble + count + TOWN NAME replaces per-event pins for the 10.8k
      town-level events. Grammar reused, nothing new to learn: dashed=approximate (existing),
      bubble+count=many (existing). Tap → list scoped to that town with "Genauer Ort nicht
      angegeben". List/detail show "in {town} · ≈{km}" never a fake address. Online events (395)
      off the map entirely, still in list+search with a badge. Dead approx-halo grammar removed.
      Legend now contrasts the two bubbles. (2fbbbe6)
- [ ] **George: tap a dashed bubble in a real browser** — the only path not yet verified (basemap
      tiles wouldn't load in the agent's pane). Handler is structurally identical to the working
      cluster-bubble handler.
- [x] Museums count as "For kids" (George). 1,254/1,269 places now pass; only `trail` out, pending
      the family_suitable attribute. (4fe7de0)
- [x] **docs/partnerships/README.md** — cross-country tracker + drafts for feratel Deskline,
      RiS/GEM2GO, Land NÖ Veranstaltungsdatenbank. Stuttgart closed (was our own bug). (4fe7de0)
