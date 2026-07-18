# Project memory — eventmap (Okolo)

Session continuity. Update "Where things stand" surgically after meaningful changes.

## One-liner
Location-based event discovery map for the Linz region, Austria — families-first; real events mined
from official municipal sources + AI poster scanning, Google-Maps-style UI. Validation prototype.

## Who
George Kostov (Austria, EU). Solo founder building toward a four-weekend Linz validation test.

## Side experiment (2026-07-18): hidden /realestate price heatmap — REMOVED
- Removed the route, miner, and all listing datasets from current `main` immediately after checking
  willhaben's terms and robots policy. It was never deployed. George explicitly approved a history
  rewrite: public `main` was force-pushed with all experiment paths removed from every reachable
  commit; there are no forks or PRs. GitHub's unreachable-object cache still answers the old SHA
  pending server garbage collection. A private owner-only local snapshot was retained at George's
  request; do not publish, deploy, restore to Git, or rerun it without permission.

## Where things stand (2026-07-18 — Hamburg+Köln municipal backbone registered on top of the metro scopes)
- **A parallel session opened the Germany scopes + gazetteer + microdata sweep (see next block); THIS
  session added the live municipal backbone.** +14 sources / +446 events via own discovery
  (probed-{hamburg,cologne}-40km.json, ids 2991–3004, all new URLs): **Hamburg 7 / 194 ev** (all LLM),
  **Köln 7 / 252 ev** incl. two JSON-LD $0 wins (Bergheim 99, Sankt Augustin 86). Each `crawl --url`
  verified. **DE events → 4,557.** My Köln sources carry region 'Köln 40km' → they scope-resolve under
  the other session's `cologne-40km` scope (sourceRegion matches), so no scope change was needed.
- **The collision + how it reconciled**: both sessions worked Germany the same afternoon. Theirs pushed
  first (microdata in structuredSignals with a broader regex, scopes, 28-town gazetteer, metro-* discovery
  catalogs). I reset to their main and re-applied only my non-overlapping delta: 6 ring towns missing from
  their gazetteer (Buxtehude, Geesthacht, Bergheim, Sankt Augustin, Bornheim, Dormagen — my sources' towns,
  hard rule 8), my two probed catalogs (renamed koln→cologne scope to match), and the todo/memory facts.
  **Lesson: before a big autonomous prod+git task, check `git fetch` — a concurrent session on the same
  feature is the norm here, not the exception.** My prod registrations were additive (new URLs), so no DB
  clobber; only git needed reconciling.
- **Open for George**: koeln.de (id 2961, iCal, 30 ev) flagged by my agent as a NetCologne commercial
  aggregator (hard rule 1) but registered by the 07-17 pass — kept live, needs a yes/no. Leverkusen cms
  nulled (sitepark-ical .ics 503s our ClaudeBot UA → LLM; $0 via browser-UA is a follow-up).
- **Microdata rung proven live beyond muenchen.de** (both sessions independently): rheinmain4family.de
  71/71, Hänneschen 197, familie.or.at 18 — all route:microdata, $0.

## Where things stand (2026-07-17 latest+2 — Germany "completed set": Hamburg+Köln+Frankfurt scopes opened)
- **George's call: top-3 German metros (Hamburg #2, Köln #4, Frankfurt #5) + deepen Stuttgart**, for a
  "completed AT/BG/DE set." Scaffolding shipped: 3 new scopes (hamburg-40km, cologne-40km,
  frankfurt-40km; Köln ring reaches Düsseldorf+Bonn, Frankfurt = Rhein-Main), 28 DE cities/ring-towns
  in the search gazetteer (hard rule 8, ASCII aliases, coords off our Nominatim), places mined for
  Köln 397 + Frankfurt 386 → **DE places 1,814**. Hamburg places DEFERRED (Overpass overloaded all
  afternoon — 5 failed retries; just re-run the miner later, non-blocking).
- **4 discovery agents (~55 sources) → docs/research/germany-metro-sources-2026-07-17.md** = the
  registration work-list, each URL live-fetched, tagged by extraction path ($0-micro / $0-ical /
  $0-rss / $0-2hop / LLM / JS / BLOCKED). First $0 win registered + crawl-verified: **RheinMain4Family
  79/79 via the microdata route, covering Frankfurt+Mainz+Wiesbaden+Darmstadt in one source** — the
  muenchen.de Microdata rung generalizes across cities, as predicted.
- **Registration batch DONE (2026-07-17): DE now 1,925 events · 1,814 places · 67 sources · 946
  family** (from 706/319/8 at session start). Shipped: a **direct-feed rung** (parse the body when a
  source url IS an iCal/RSS endpoint — the `?ical=1`/`?sp:out=rss` feeds findIcsLink can't discover;
  koeln.de iCal verified route:ical 30/30) + **22 metro sources** registered & scope-crawled
  (Hamburg 78 · Köln 257 · Frankfurt 113 · Stuttgart 83). Two more MICRODATA wins: **Hänneschen
  Puppenspiele Köln 197** + RheinMain4Family 79. Scopes: Berlin 20 · Munich 15 · Stuttgart 14
  (deepened) · Frankfurt 8 · Hamburg 5 · Köln 5. register-catalog gated 5 on policy (Bücherhallen/
  hamburg.de/Bonn/Offenbach name ClaudeBot; Düsseldorf robots).
- **Still open**: Sitepark/kulturlotse RSS is pubDate-only (date in the item title → LLM, not $0; a
  small Sitepark-title parser unlocks ~4-6 official kids calendars); two-hop JSON-LD adapter (Hamburg
  Tourismus + visitberlin, same shape, not built); the policy-skipped official sources (outreach);
  Hamburg PLACES (Overpass still owed a re-run). Details: docs/research/germany-metro-sources-2026-07-17.md.
- **Cross-cutting**: DE tourism boards are NOT reliably JSON-LD (visitberlin + Hamburg Tourismus yes
  via detail `@graph`; KölnTourismus/Düsseldorf/visitfrankfurt/stuttgart-tourist no — always check).
  Recurring agent failure: ~2 of every batch no-op in ~13s with 0 tool calls; just re-dispatch.
- **Agent-verified reality of the Microdata rung**: an `itemtype=Event` with an EMPTY
  `datetime=""`/prose-only date (Senckenberg) correctly yields 0 (no fabrication) → that source is
  LLM-route, not $0. The rung is not a bug; the agent overstated structuredness.

## Where things stand (2026-07-17 latest+1 — Germany supply deepened: places + research + adapters)
- **DE now: 1,412 events · 1,123 places · 43 working sources · 549 family-tagged** (from 706/319/8 at
  the day's start). All on Gemini (EXTRACT_PROVIDER unset).
- **Places**: `scripts/mine-places.mjs` (generalized from the Stuttgart Overpass miner, takes --scope).
  Berlin 633 + Munich 234 curated family places → DE places 319→1,123. Key: local Nominatim placex
  CANNOT substitute for Overpass — it drops the curation tags (museum=children, fee, access,
  garden:type), keeping only wikidata/wikipedia. The box is for geocoding, not place mining.
- **Research (2 agents, ~34 verified sources)**: the German linztermine-equivalents. **The prize:
  familienportal.berlin.de = 5,437 dated family events.** Reality check — almost NONE expose
  JSON-LD/Microdata/usable iCal (the "RSS" on Falken was a blog feed w/o event dates), so the generic
  crawl gets a WINDOW (10-25) per source; full yield needs paginated adapters.
- **`lib/familienportal-events.js` (cms=familienportal)**: paginated adapter, 10→262 events (30-page
  verify, FAMILIENPORTAL_MAX_PAGES tunes it, bounded because nightly + ascending sort). Twin-fab bug
  caught pre-ship: meta is "date | HH:MM Uhr | Bezirk" — positional parse would set venue="10:00 Uhr"
  AND drop the time. Fields classified by content; Bezirk→town precision, venue null.
- **13 single-page family/nature/Verein sources registered + hard-rule-7 verified**: Berlin 6→70ev,
  Munich 7→121ev. `family` default-cat on the 6 kids venues (theatres/museums), nature/Verein self-tag.
  Catalogs: data/catalog/research-{berlin,munich}-40km-2026-07-17.json.
- **Deferred**: umweltkalender-berlin.de (2,071, one 352k-char page → own adapter); the NaturFreunde
  chain (national PLZ-radius filter → reusable adapter). **NOT started: municipalities big-cities**
  (291 in the two rings, ~27 registered) — George's 3rd ask, next.

## Where things stand (2026-07-17 latest — THE BOX IS LIVE, Germany opens: Berlin + Munich, c758e41)
- **Self-hosted Nominatim runs on George's box and it is the whole prize.** AT+BG+DE merged
  (5,529 MB) at **`IMPORT_STYLE=full`**, ~104 GB DB on Z: NVMe (Docker's VHDX relocated there via
  `customWslDistroDir`; C: had only 71 GB). `NOMINATIM_URL=http://localhost:8080` makes
  `throttle()` a no-op. Measured: 10 DE towns **2,041ms** vs public's 11,000ms+ *serialized* floor;
  German venues now resolve at **venue** precision. The DE geocache held **298 rows** — Germany was
  ~100% cache-miss, which is precisely why it was geocode-bound.
- **The runbook was wrong in five load-bearing ways and is now corrected + measured**
  (docs/ops/local-box-setup.md): `IMPORT_STYLE=address` (excludes POIs → `poiQuery` returns nothing
  → every venue degrades to a centroid AND the miss is cached = Bad Ischl at scale); image 5.1→5.3;
  the whole WSL2+Ubuntu+systemd section (unnecessary — Docker Desktop + native Node + native Ollama);
  Docker's `memoryMiB` (Hyper-V-only, ignored under WSL2); "qwen2.5:32b, the box has the RAM"
  (**VRAM** binds — 16 GB). Plus the BIOS/SVM prerequisite that ate a morning.
- **🚨 `scripts/crawl.mjs` ran NOTHING on Windows** — the ``file://${argv[1]}`` entrypoint guard can
  never match a backslashed drive path. `npm run crawl` exited 0, printed nothing, crawled zero
  sources — on the exact machine the nightly cron is meant to move to. Fixed with `pathToFileURL`.
- **Germany: DE events 706 → 1,326**, sources 8 → **30** (Berlin 14 · München 8 · Stuttgart 8).
  New `lib/microdata-events.js` rung: muenchen.de (Munich's OFFICIAL calendar) publishes **100
  Events as Microdata, 0 ld+json** → **100/100 upserted at $0** instead of a paid LLM call. Its
  **placeholder guard** matters: all 100 publish `startDate=T12:00:00Z` (noon-UTC date marker) while
  the page shows 11 distinct real times — literal parsing = the `T09:00` fabrication in a schema.org
  badge. Guard is deliberately narrow (uniform + canonical marker + ≥3 events) so a theatre whose
  6 shows all start 19:30 keeps 19:30.
- **Hard rule 8 closed in the same change**: places.js had ZERO DE entries; the geocode route
  hard-filtered Photon to `['AT','BG']` with a binary `? 'AT' : 'BG'` flip that could never reach a
  third country. 30 DE towns added (coords read off our own Nominatim). "Berlin" used to return an
  Austrian *building*; Stuttgart had been unsearchable since 07-13.
- **`EXTRACT_PROVIDER` is UNSET — the crawl runs on Gemini** (George's informed call). NB the
  concurrent session's 5-model bake-off (docs §3b) is real and stands; my first "gemma4 is unusable"
  measurement was **wrong** — I benchmarked a hand-rolled copy of `callOllamaText` instead of the
  real, already-retuned function (c590e12: `format: CRAWL_SCHEMA`, `think:false`, `num_ctx` pinned).
  Correct numbers: gemma4 near-parity on ordinary pages (5 vs 6), fabricates nothing, but **2 vs 26**
  on a dense family listing. **Benchmark the real call path, never your model of it.**
- **`scripts/register-catalog.mjs`** is the committed registration path (scope + robots + AI-policy +
  opt-out gates, dry-run default) — replaces ad-hoc SQL. `upsertSource()` DOES take `region`; the
  todo's claim otherwise is stale. 3 traps refused with measured reasons in the catalogs: Erkner
  (a sitemap), Potsdam (nav-only/JS-rendered), Starnberg (no event data).
- **Concurrent session active all day** — it owns docs/partnerships + the Meta runbook + the Ollama
  §3b bake-off. A full-file `Write` of local-box-setup.md was blocked by the file-changed guard and
  would have destroyed their work; edits there must stay surgical.

## DEPLOY POLICY (do not forget — also in CLAUDE.md §Deploying)
- **Pushing to main does NOT deploy.** vercel.json sets `git.deploymentEnabled=false`
  (b73a855, "manual deployments only") — a deliberate guard against concurrent sessions
  shipping half-finished states, and builds cost money.
- **George deploys by default** (his rule, 2026-07-14): finish work → commit/push → tell him it's
  ready. Only run `vercel deploy --prod --yes` yourself when a live-prod test is genuinely needed;
  announce it and verify the live API after.

## Where things stand (2026-07-17 — local Ollama extraction retuned; gemma4:12b is the box's model)
- **Thursday desk editorial control (a6a250e, NOT yet deployed):** per-pick Replace (swap for
  next-best in same strand, vetoes old id) + ▲/▼ reorder (within strand) on the digest, both edit
  the frozen snapshot with no AI call. Ranking re-verified across all 10 channels — half-half split
  already holds, rankPick untouched. Post-single (per-event IG/FB) already existed.
- **SEO (cf41c48, NOT yet deployed):** fixed layout canonical '/' leaking into every subpage
  (event/legal/weekend-fallback pages all self-declared as homepage duplicates) + added
  Organization/WebSite JSON-LD for the "Okolo"→okolo.events entity link. George verified the domain
  in Search Console (first impression already logged) — needs a deploy to reach Google, then watch
  Search Console "Pages" for event pages entering the index.
- **George's box, measured (not assumed): Ryzen 9 7900X / 63 GB RAM / RTX 4070 Ti SUPER 16 GB VRAM.**
  **VRAM is the binding constraint**, not the 64 GB the runbook used to reason from. Ollama runs
  natively on Windows (not WSL), upgraded **0.17.1 → 0.32.1** — gemma4 cannot load on the old build.
- **Default model `qwen2.5:14b` → `gemma4:12b`** (Apache-2.0 since 03/2026, 7.6 GB, 8.4 GB loaded at
  100% GPU). Chosen by a 5-model × 4-real-page bake-off (2 DE, 2 BG) through the REAL
  `extractFromPage()`, with **gemini-2.5-flash-lite as the reference row**. **Deleted the other four
  (~33 GB freed)**: qwen2.5:14b (wrong keys + **fabricated 3 titles**), gemma3:12b (**0 events on
  German**, Gemma Terms licence), qwen3:14b + qwen3.5:9b (both 0 on linztermine; qwen3.5 also runs to
  18k tokens → invalid JSON).
- **The decider, worth remembering: linztermine.at** (tier-2, the Linz validation test's own source)
  lists events with a time but **no date** — inferable only from "Heute ist der 17.07.2026" elsewhere
  on the page. Gemini finds 5; **gemma4 is the ONLY local model that does**; the other four return
  `[]`. **An empty extract from a real source is indistinguishable from a quiet week** — which is why
  the Gemini reference row is mandatory in any future model comparison, never a zero baseline.
- **Three config fixes mattered more than the model** (lib/extract.js): (1) `format: CRAWL_SCHEMA`
  instead of `format:'json'` — Ollama grammar-constrains keys + the categories enum; the schema was
  already in the file and unused, and **Gemini can't use it** (OpenAPI subset rejects
  `["string","null"]`), so the Gemini-era prose workaround was being applied to the one provider that
  didn't need it. (2) **`num_ctx` pinned to 32768** — auto-sizing pushed qwen2.5:14b to an 18 GB
  footprint → 12/49 layers on CPU → **11.3 tok/s vs 60.6**. (3) **`think: false` unconditionally** —
  every current model thinks by default (gemma4 7.9k chars, qwen3.5 22.7k), which re-feeds as input
  and truncates the JSON; this alone had gemma4 ranked LAST in my first bake-off. Timeout 180s → 600s
  (dense pages ~250s were silently falling back to **paid** Gemini).
- **GEORGE'S CALL (2026-07-17): the box's nightly crawl runs LOCAL.** "no users, we dont want to spend
  money… if we drop 2-3 events its not a big deal… when we have users we can switch back to gemini."
  `EXTRACT_PROVIDER=ollama` + `OLLAMA_MODEL=gemma4:12b` are set in `.env.local` on the box — live.
  Blast radius is the **LLM route only**: structured sources (GEM2GO/JSON-LD/iCal) untouched,
  `extractFromImage` never reads EXTRACT_PROVIDER so poster scan stays on Gemini, and Vercel has its
  own env so prod is unaffected.
- **⚠ TRIPWIRE (open): flip `EXTRACT_PROVIDER` back to Gemini before the four-weekend Linz coverage
  test runs for real** — that test's go/no-go metric IS coverage, so running it on the cheaper
  extractor measures our own recall rather than Linz's supply. One line in `.env.local`.
- **The gap, measured (the raw "27 vs 13" was misleading)**: Gemini emits one row per occurrence date
  of the same title (series dedup collapses those). Honest figure: **gemma4 missed 4 real events** on
  the dense Innsbruck listing and found **0 Gemini didn't** — a strict subset that **invents nothing**
  (0 ungrounded across all 4 pages), which is the bar hard rule 5 sets and qwen2.5 failed (it
  fabricated 3 titles). Parity on 3 of 4 pages: linztermine **5=5**, Русе 6=6, Burgas 107≈110.
- NB `node_modules` was empty on this box (never installed here) — `npm install` done; 116 tests +
  `npm run build` green with the change.

## Where things stand (2026-07-16 latest — AI-bot policy enforced; Germany discovery done, not registered)
## Where things stand (2026-07-17 latest — the digest is two strands now, e254758)
- **The newsletter was ~100% kids BY CONSTRUCTION** (buildDigest took every family event first;
  rankPick makes family strictly dominant) — not a tagging problem. Now `splitSections()` gives
  each strand ~half of 10, richer strand fills the gap. Live: Linz 5/5, Wien 5/5, Graz 3/7,
  Plovdiv 2/8; every channel returns 10.
- **George's call: two LABELLED sections ("Für Familien" / "Für alle"), not a quiet quota.** The
  digest was branded family-first in ~11 places incl. the AI's own system prompt, so a 50/50 list
  under that banner would have had the model writing family framing over art events. The prompt now
  describes both audiences and receives each pick's `section`. `sectionsOf()` = the one grouping
  definition (mail + text part + caption + page); headings only when both strands exist; frozen
  pre-sections snapshots render as built.
- **DIGEST_MAX 9 → 10.** The 9 was purely IG's 10-slide carousel (slide 0 = cover) — a posting
  limit, not editorial. `carouselOmitted()` now NAMES the pick that doesn't fit instead of the
  `.slice(0,10)` silently eating it.
- **🚨 `?lat=&lng=` was read NOWHERE** (pre-existing): the newsletter CTA, every weekend page's map
  button and the event-page back link all carried it, and every one dumped the reader in **Linz** —
  from the Sofia digest, the wrong country. Fixed at map construction; mapCenter seeded from the
  same value (moveend never fires for a map CONSTRUCTED at its target).
- **Menu → `/weekend/<city>`** for the channel nearest the map centre. `nearestChannel()` is
  deliberately NOT `channelForPoint` — that one must stay catchment-bounded, or a subscriber 300km
  from Linz gets mailed events they can't attend. `NL_CONSENT_VERSION` → 2026-07-17 (nlBlurb now
  says families AND everyone, because the newsletter does).
- **Prod writes**: wien + graz 07-17 snapshots regenerated (unsent). **Linz 07-17 is SENT + posted
  — untouched.** innsbruck/salzburg/sofia keep their old 5-item family-framed snapshots this
  weekend; next Thursday is uniform.
- Two pre-existing data smells seen in the Wien digest, neither mine: three distinct *Bouldern*
  events all showing venue "boulderbar Hauptbahnhof" (default_venue overreach), and exhibitions
  printing "Fr 17.7. 00:00" (a stored midnight where the source published no time).

## Where things stand (2026-07-16 — Pflasterspektakel adapter ready, capture runs 23–25 July)
- **George asked whether we can get per-act times/locations for Pflasterspektakel "next weekend".
  Answer: not yet, and by design.** Festival = **23–25 July** (DO 16–23, FR & SA 14–23). The
  Tagesprogramm says "Aktuell ist noch kein Tagesprogramm verfügbar" because "Die Künstler*innen
  wählen ihre Auftrittszeiten und -orte während des Festivals **täglich neu**" — the grid is written
  fresh daily and goes up "kurz vor Programmstart". Live now: the 120+ artist lineup + the fixed frame
  (Kaleidoskop 17:00/20:00/22:30, Feuershows 20–23 Hauptplatz+Pfarrplatz).
- **`lib/pflaster-events.js` (cms='pflaster') SHIPPED, verified against last year's real grid**
  (Wayback 2025-07-19): 35 Spielorte / 275 acts / 87 artists, deterministic, $0. Source registered,
  `--url` driven live → `route: pflaster (0 candidates)` = correct for today (hard rule 7). 133 tests.
  **George's call: pin per Spielort (~35/day), not per act (~825)** — 800 rows would bury Linz during
  the test weekend.
- **The load-bearing detail: the page has NO date** (one grid, overwritten daily). The day comes from
  the source's own Yoast `article:modified_time`, and a grid whose stamp ≠ the Vienna crawl day is
  REFUSED. This is why the nightly cron can never capture it (04:00 UTC = ~06:00 Vienna, before the
  grid is up → it would read yesterday's as today's). Capture runs from
  `.github/workflows/pflasterspektakel.yml` (17–27 July, 14/16/18/21 Vienna; `--url` ignores
  tier/cadence — which also revives the source if zero_streak ever rotted it to dead). Shares the
  `concurrency: crawl` group (Nominatim is per-IP).
- **New narrow waterfall concept `exclusive: true`** — the adapter OWNS the source, so an empty result
  never falls to the LLM (this page describes the festival year-round; an LLM would burn a paid call
  per crawl to mint a duplicate of the Linz-Termine row). Inert for all other adapters.
- **Found by RUNNING dedup, not reading it: all 35 stages partly auto-merge.** Same day, ~300m apart →
  `sameLocation()` passes for every pair; `titlesMatch()` matches on SUBSTRING so "Landhaus" ==
  "Landhaus Arkadenhof", and `titleSubstitution()` is blind to it (it only catches SWAPPED words, not
  added ones). Fixed inside the adapter — the festival's own Kürzel goes in the title
  ("Pflasterspektakel A4: Landhaus"), which is also what's on its printed Festivalplan. 0 collisions
  even with all stages forced to one start time. Deliberately did NOT re-tune the shared matcher.
- **Capture-live-or-lose-it**: the festival archive keeps artists but NEVER the grid. Miss the window
  and it's gone (2025 survives only via the Wayback Machine). **Only the empty path is proven** — the
  happy path can't be driven until a grid exists on the 23rd. Watch the first workflow run.
- **George owes 4 decisions** (tasks/todo.md): the 4 duplicate festival rows (best facts = 2766, best
  linkback = 14 — wants a merge, not a pick); `is_free` left null (no ticket, but artists play for
  **Hutgeld** — "free" is a claim the source doesn't make); `family` not set (general-audience
  programme, forcing it = rule-5 fabrication); and the editorial highlight — this is exactly the
  Pflasterspektakel case that feature was built for.

## Where things stand (2026-07-16 — highlights read the same on every surface, af3c9ba)
- **The highlight was map-only; now it's a system.** List rows ring their marker (the existing
  `.legend-pin.gold` grammar, on `.thumb` — the row's other channels are taken by range-match and
  .active); event pages + the newsletter ring the card. **Editorial was previously INVISIBLE in the
  list**; gold was labelled but unstyled.
- **George's call: newsletter = BADGE ONLY, NO RANK CHANGE.** `weekendPicks` now joins highlights but
  `rankPick` is untouched — payment buys visibility, never a slot or a position. This DIVERGES from
  mapPins (highlight = first sort key, cap-exempt) **on purpose**, documented at both sites: the map
  mustn't let a dense viewport trim a paid pin; the digest is an editorial pick, and paid reordering
  would contradict family-first + trigger the P2B Art. 5 ranking-disclosure page. Verified against a
  control: pick order byte-identical before/after.
- **`highlightJoin(from, to = from)`** — the digest is built Thursday and FROZEN, so a point-in-time
  "active today" test would bake Thursday's answer into a Fri–Sun snapshot and silently drop a
  weekend-only gold. Live surfaces still pass one arg (unchanged).
- **Invariant, test-pinned: treatment ⇔ label.** Gold is styled and labelled together or neither
  (colour alone is not disclosure). Editorial rings, never labelled. Frozen pre-highlight snapshots
  degrade to ordinary picks (no ring, no label) — the honest pairing.
- **Event page** brands + backs via `channelForPoint(event coords)` — derived from the EVENT, so it's
  right however the reader arrived and can't be spoofed. **~40% of events are outside every
  catchment** → bare "okolo.", no signup. Signup added to event + weekend pages
  (`app/newsletter-signup.js`, one email field, area = the page's channel, `source` closed enum).
- **The `highlights` table is NOT empty — George is using the desk.** 3 real rows: Ars Electronica
  **gold** (07-16→09-09), Pflasterspektakel + Altstadt-Klangzeit editorial. **If the Ars gold is a
  genuine paid placement, payer-identity + ranking-disclosure are due NOW.** NB a consequence of
  "no rank change": his Pflasterspektakel showcase reaches the digest only if it independently makes
  the family top-9 — it did not make this weekend's picks. Open question for him (editorial ≠ gold
  legally: nothing stops him editing his own newsletter).
- **The gold shine was 3× the pin, fixed (4b9ad33).** `map.addImage` defaults `pixelRatio` to 1; every
  sprite is supersampled at SPRITE_RATIO=3 and goes through `add()`/`put()`, which pass
  `{pixelRatio: SPRITE_RATIO}`. The glint is the only non-SVG sprite (animated StyleImageInterface),
  so it bypassed both helpers and was hand-added at 2 sites without the option → 114 CSS px vs the
  pin's 38. One `addGlintImage()` now bundles ratio+construction. The SHAPE was never wrong (always
  clipped to pinSilhouette, glint-place/glint-event per feature) — a scale error presenting as a
  shape complaint. **Still needs George's real-browser look**: MapLibre 'load' never fired in the
  agent pane (zero basemap requests), so sprites never registered and the pixels were unobservable;
  proven from the maplibre source + a live addImage probe instead.
- **A CONCURRENT session owns a Pflasterspektakel adapter** (lib/pflaster-events.js, a workflow, a
  register script, scripts/crawl.mjs + data-pipeline.md edits). Staged explicit paths only.

## Where things stand (2026-07-16 — AI-bot policy enforced; Germany discovery done, not registered)
- **`aiPolicyAllowed()` ships (lib/crawl-net.js)**: a site naming ClaudeBot/GPTBot with a Disallow over
  our path is now skipped in code, not by an agent remembering to. Deliberately SEPARATE from
  `robotsAllowed()` (RFC 9309 genuinely permits us — our UA is never on those lists; that's the whole
  point). Decision + measurements: `docs/decisions/2026-07-16-ai-bot-policy.md`. George's calls:
  **Variant B** (any AI crawler, not just Anthropic) · **bytespider alone ≠ an AI stance** (saves
  berlin.de's 3 official $0 JSON-LD sources) · **honor Stuttgart + ask them** (partnerships row 8b).
- **Applied to prod**: 11 source rows / 9 distinct source_names / **138 published events →
  status='removed'** (BG 69, DE 67, AT 2). Published 28,651 → **28,513**. `works` stays true;
  `blocked_reason='ai_bot_policy'` is the state and self-clears if a site drops the rule.
  **Stuttgart is now 0 events** — the biggest city in the DE scope, gone by our own policy.
- **NB the measurement error I made**: petalbot/amazonbot are SEARCH crawlers, not AI. Including them
  falsely condemned **Linz-Termine (42 ev)** and 9 others. AT's real exposure = 2 sources / 2 events.
  `AI_BOT_TOKENS` carries a comment forbidding their re-addition — do not "complete" that list.
- **Germany discovery done, NOTHING registered yet.** `data/catalog/probed-berlin-40km.json` (16
  proposed, 57% ring hit-rate) + `probed-munich-40km.json` (9 proposed, 31% ring). **Cost answer for
  George: ~$1.30/month for both cities — money is not the constraint.** Nominatim (1 req/s per IP,
  geocache is AT/BG-only → DE is all misses) and the 180-min Actions cap are.
- **Three findings to act on before registering**: (1) **muenchen.de is schema.org MICRODATA, not
  JSON-LD** (verified: 100 `itemtype="…Event"`, 0 ld+json) — we parse Microdata nowhere, so the
  official city calendar would take the PAID route while being perfectly structured; a generic
  microdata rung is now the highest-value adapter on the board. (2) **Do NOT register Erkner as
  proposed** — its URL is a sitemap (499 locs, no event data); cms=null → LLM fed a list of URLs =
  0 yield + a paid call every crawl. (3) **iKISS** (Berlin ring) and **RCE-Events** (Munich ring) are
  the candidate "GEM2GO of Germany"; iKISS ships an interface to **termine-regional.de** — vet that
  nationwide portal before building adapters.
- **Hard rule 8 is currently VIOLATED for Germany**: `lib/places.js` has ZERO DE entries and
  `app/api/geocode/route.js` hard-filters Photon to `['AT','BG']` + collapses country to
  `'BG'?'BG':'AT'`. Stuttgart's events have been unsearchable since 07-13. Verified live: typing
  "Berlin" returns `AT | Berling` (a building). Fix belongs in the same change that registers DE.

## Where things stand (2026-07-16 — crawl-optimization batch, Germany prep)
- **George is setting up local Nominatim on his box** (docs/ops/local-box-setup.md) for the Germany
  scan; regeocode/enrich/merge-dups backfills stay parked until it's up.
- **Hygiene batch SHIPPED (e326335)**: blocked_reason states (migration applied to prod; robots skips
  no longer feed zero_streak), crawl-time fuzzy dedup (findDuplicate fallback behind content_hash +
  crawl-only `titleSubstitution` guard — templated titles like "Josefstadt spielt"↔"Meidling spielt"
  bail instead of auto-deleting a real event), geocode negative-cache fixes (429/5xx never cached),
  scripts/rot-report.mjs (269 flagged first run) + SYSTEMIC guard in crawl summary. 103 tests.
- **In flight**: CMS fingerprint sweep dry run over ~840 LLM-route sources (scripts/fingerprint-
  sources.mjs + lib/cms-fingerprint.js, dry-run only until architect review); jevents adapter for
  visitsofia.bg; SOTA research → docs/research/crawl-sota-2026.md. Research so far: batch APIs = 50%
  LLM cost cut; trafilatura-class preprocessing = 80-90% token cut; Microdata = 46% of structured-data
  sites (JSON-LD-only parsing has a real miss rate); Germany = TYPO3 ~20% + WordPress ~18% of Gemeinden,
  iKISS syncs with termine-regional.de (nationwide portal — vet as bulk shortcut before building
  adapters); OPARL = council meetings only, red herring.
- **Concurrent session caution**: another session committed source-quality ranking (5333ae3) and swept
  this batch's lib/db.js helpers into its commit. Stage explicit paths only.

## Where things stand (2026-07-16 latest — /admin is one hub, 9393e49)
- **One door: `/admin`.** Hub (cards + counts) → Thursday · Highlights · **Pages**, persistent nav +
  logout on every desk, one password, 30-day cookie, no subdomains/tokens. `lib/admin-ui.js` = shared
  shell (S tokens, formatVienna, AdminShell); `app/admin/layout.js` = noindex for all admin pages.
- **`/admin/pages` answers "where are my SEO pages":** every frozen digest snapshot IS the public
  `/weekend/<city>/<friday>` page. Row = weekend · picks · subject · Copy link · Open · Indexed /
  Noindex-thin / Sent / IG / FB. Per city the stable `/weekend/<city>` (bio/QR) link. Live: 6 pages,
  Linz 07-17 (9 items, sent, IG+FB), 5 cities built-but-unsent. `MIN_INDEXABLE_ITEMS` now shared so
  the badge can't drift from the real noindex rule.
- **George owes one login check**: I may not type a password into a form, so the fresh-login render is
  the only path unverified by me (logged-out path proven clean; authed JSX verified with a live session).

## Where things stand (2026-07-16 — highlighted/sponsored pins SHIPPED, cf81564)
- **Gold (paid) + editorial event placement is live in code** (George picked the treatments off an
  iterated prototype artifact 69c1af62…): gold = golden outline ring outside the white pin border,
  1.15×, star corner badge, specular shine sweep every ~5.5s (animated StyleImage, sleeps between
  sweeps, off under prefers-reduced-motion); editorial = static CI-raspberry (#c93a5b) ring, 1.1×,
  no badge/motion — paid and curated are visually distinct on purpose. `highlights` table (period
  rows, migration applied to prod, currently 0 rows), active = query-time join in mapPins/search/
  getEvent (event expiry drops the highlight for free), active highlights are cap-exempt (first sort
  key). Desk: /admin/highlights (password cookie, search → tier → period → note, clear). Legal:
  „Anzeige"/Sponsored tag renders on gold list rows + detail; editorial deliberately unlabeled.
- **Open before the first PAID gold**: payer identity on the detail view + ranking-disclosure note
  (docs/decisions/2026-07-12-paid-placement-compliance.md). Editorial showcases can be used NOW
  (Pflasterspektakel-style) — George just sets them on the desk.
- **George owes a real-browser map eyeball** (WebGL not drivable in the agent pane): gold ring/star/
  shine, editorial ring, both clickable, selection on a highlighted pin. NOT deployed — push ≠ deploy.

## Where things stand (2026-07-15 latest+1 — per-event social posting + cross-ledger dedup)
- **Individual-photo posting on the desk** (551047a): each digest event posts on its own (IG/FB/Preview
  per row, "post next unposted", CLI `--item`/`--next`), sharing one `publishWithLedger` core with the
  bulk carousel. Per-event ledger key `posted:<ig|fb>:<slug>:<friday>:ev:<id>`. "Reroll" = the existing
  Regenerate; per-event keys survive it. Sonnet review caught TWO double-post holes, both fixed:
  cross-ledger (bulk↔item didn't cross-check → silent duplicate; now ALREADY_IN_CAROUSEL /
  ITEMS_ALREADY_POSTED + viaCarousel UI state + confirm-both-directions + bulk-aware next), and
  snapshot-drift (item cards were slide-indexed → mid-Regenerate could mismatch caption/image; now
  `event=<id>`-addressed cards, 404 if regenerated away). 80 tests, build green.
- **Source-quality ranking SHIPPED (5333ae3)** — `lib/source-quality.js` (tier 2 curated official/
  vetted family publishers › 1 municipal crawl › 0 unvetted); weekendPicks tuple = family → tier →
  precise → free → interest → soonest; reported events excluded in SQL pre-DISTINCT-ON; community
  gated (venue+description+no reports, architect call: gated-and-included, never above official; the
  old community BOOST is gone). Takes effect on each channel's NEXT digest build. Desk Publish section
  is visual now (card thumbnails, inline preview, posted/carousel chips, tier badges). Review caught
  2 masked tier bugs (familienbund domain, "Linz-Termine" hyphen) — fixed, test-pinned. NB a
  CONCURRENT session owns uncommitted cms-fingerprint/rot-report work in the tree — don't sweep it.

## Where things stand (2026-07-15 latest — Meta publishing pipeline built, waiting only on credentials)
- **The weekly digest can now post itself to Instagram (carousel) + Facebook Page** (b589d14):
  `lib/social-publish.js` (the one Graph-API surface, mail.js pattern) → `/api/admin/social` →
  Publish buttons on the Thursday desk + `npm run social` CLI. Reads the SAME frozen snapshot as
  the newsletter/cards; never builds; ledger `posted:ig|fb:<slug>:<friday>` written only after Meta
  returns an id; atomic `metaClaim` in-flight marker makes concurrent publishes lose cleanly and
  turns a mid-publish serverless kill into an explicit "post MAY be live — check before force"
  instead of a silent duplicate. Dry-run/Preview works with zero credentials (verified end-to-end
  against the frozen Linz 2026-07-17 snapshot). **Meta setup DONE and PROVEN for Linz + Vienna
  (2026-07-17)**: system user `okolo-publisher`, token expiry Never, five scopes. Vienna's first post
  went out live — two-city publishing works end-to-end (per-channel ids route correctly, cards
  render, Meta accepts). Posting needs deployed card URLs, so a first post always follows a deploy.
  Posting to own Page/IG ≠ the banned group-bot pattern; group seeding stays manual.
- **Meta ids are per-city and live in `lib/city-channels.js`, never env** (2026-07-17). Each city is
  its own Page + IG account with its own pair; only the shared META_ACCESS_TOKEN is env. Until this,
  both publish fns read one global IG_USER_ID/FB_PAGE_ID, so `?channel=wien` posted Vienna's digest
  to the LINZ accounts and reported success — the route was channel-aware, the Graph calls were not.
  A channel with a null id now throws; it must NEVER fall back to another city's account. Live:
  linz 1153097914561205/@okolo.linz, wien 1171182632750527/@okolo.vienna (handle is okolo.VIENNA —
  `handle` is printed on every card, so the registry follows the real account). Other 8 = null.
- **Vienna is "Vienna" on brand surfaces, "Wien" in prose** (2026-07-17, George's call). Cover art +
  carousel cover slide use `brandName(channel)` = `brand ?? label`; only wien sets `brand:'Vienna'`.
  `label` stays 'Wien' because it is NOT display-only: German copy interpolates it, the AI
  copywriter takes it as `city`, and it is schema.org addressLocality + the gazetteer key. Cover PNGs
  are keyed by SLUG, so Vienna's file is still `okolo-wien-cover.png`.
- **FB covers: `node scripts/gen-cover.mjs --channel <slug>`** (2026-07-17). The original brandgen
  route was never committed (f2dc435 = PNGs only) and is unrecoverable, so the generator composites
  frozen PLATES cut from the committed art (`assets/social/_parts/`) and typesets only the city name
  — styling can't drift because it's the same pixels. Layout solved from the art: row centred at
  x=818, column = widest child, GAP 73, so long names/Cyrillic taglines push the lens right.
  `--verify` asserts lensΔ=0 on all ten (its edgePx is subpixel AA, not a failure). Plates are
  frozen → they no longer track CATS/icons and --verify can't notice; a new language needs a tagline
  plate before its first city.
- Review process note: the implementer agent had left `fake-test-token` values in .env.local, which
  flipped every configured() check to true — a plain `npm run social` would have fired real Graph
  calls. Caught by driving the CLI; values blanked (lesson recorded).

## Where things stand (2026-07-15 later — the zero-yield freeze is FIXED at the mechanism level)
- **The starvation fix (49a8ee9) was necessary but not sufficient — two recording bugs of our own kept
  sources frozen even when the crawl DID reach them** (4ea3f14): (1) extraction failure was recorded as
  `noContent` → events_last=0 + zero_streak+1, so a provider blip read as "source is empty" (4 sources
  unjustly tier=dead); (2) a zero-candidate LLM round stamped the NEW page_hash → all later crawls
  hash-skip as "unchanged". Measured before the fix: 371 frozen works=true sources, 333 wedged with a
  stamped hash, 329 on the llm route. Now: provider errors leave stats+last_crawled untouched (source
  stays due → retries next run); page_hash stamped only when the LLM produced candidates (a genuinely
  empty page costs one flash-lite call per due-crawl — cents); withRetry on crawl LLM calls;
  **crawl.yml now passes ANTHROPIC_API_KEY — CI previously had NO fallback provider at all.**
  `--recover-zeros` (new flag) force-recrawls the frozen set incl. dead; run 2026-07-15 FINAL:
  **2,153 events from 100/371 sources, 0 provider errors; zero-yield 371 → 271 (rest are honest
  zeros that now re-extract on cadence); published events 29,846.** **George still owes the GH
  Actions secrets check:** add ANTHROPIC_API_KEY; confirm GEMINI_API_KEY there is the paid key
  (Vercel ≠ Actions).
- **Map: sparse-viewport switch shipped (12cab82), George's own UX call.** Below ZOOM_TIER, viewport
  total ≤50 → API returns rows instead of grid cells; lone events render as category dots, black count
  bubbles only where supercluster finds real overlap. Dense stays cells. Browser-verified both ways
  (community filter at regional zoom = 1 colored dot + real sidebar list; all-AT = 37 cell bubbles).
- Dev-env: `.claude/launch.json` pins the dev server to /opt/homebrew/bin/node (shell node is v16).

## Where things stand (2026-07-15 — big-city coverage: Innsbruck fixed + a systemic zero-yield finding)
- **George's priority: 100% of the big 5 (Wien/Linz/Graz/Salzburg/Innsbruck), countryside can wait.**
  Measured: Wien 3368/76% precise/712 fam, Linz 3442/54%/342, Graz 1198/57%/269, Salzburg 1259/71%/172,
  **Innsbruck 878/61%/26** — Innsbruck was the clear hole.
- **Innsbruck was a "registered but dead" trap, now fixed.** 4 of its 5 city sources were works=true at
  events_last=0. innsbrucktermine.at (+ /familie/kinder) is plain server-rendered HTML, robots-allowed,
  extracts cleanly — it was just STUCK at 0 from a failed-crawl window. `--url --force` recovered it
  (16 + 9 + library 1). Innsbruck 878→941, family 26→38. Innsbruck.info → works=false (feratel Deskline
  widget + Cloudflare bot-block = partnership-only, drafts in docs/partnerships/README.md).
- **🚨 SYSTEMIC + FIXED: the crawl's due-set was `ORDER BY id`, so a partial run always starved the
  same high-id tail** (49a8ee9). 519 works=true sources hadn't been fetched since 07-12 (3 days) despite
  active-tier 2-day cadence; 257 at crawl_count=1 (first crawl got 0, never retried); every source id
  >2158 (newest, incl. today's family sources) never reached by the cron. The 07-12 national backfill
  registered ~800 high-id sources needing slow first-time LLM extraction (slowest AND last in id order),
  so whatever stops a run early — Actions cancellation/restart, 180-min timeout, crash — cut off before
  reaching them, every night. Fix: `ORDER BY last_crawled ASC NULLS FIRST, id` — a partial run now
  spends its budget on the most-overdue and skips the freshest. The 519 self-heal on the next cron run
  (now first in line); a paced manual recovery brings them sooner. Proved alive by re-crawling
  WIENXTRA (0→16), Dornbirn (0→14), Haydnhaus (0→13), Esterházy (0→6).
  **LESSON (recorded): I first asserted this was the "Gemini free-tier daily cap" — flatly wrong,
  George pays for the key. 3rd time this session I stated a diagnosis as fact without measuring
  (Stuttgart robots, Krenglbach, this). The ticket's cause — even my own — is a hypothesis until the
  DB says so.** Corollary bug seen twice: "0/N upserted (route: llm)" = extraction worked but every
  event dropped at geocode (no resolvable location) — correct by hard-rule-5, but yields 0 usable.
- **Publisher-integration question (George: "make an API / ask them to format / push to us?"):
  answer = DON'T build an API.** We already ingest iCal/RSS/JSON-LD; the cleanest path is a public
  "Add your events" page with tiers by THEIR effort: paste a feed URL (30s, pipeline already eats it)
  › add schema.org/Event JSON-LD (one-time, also gets them into Google) › submit form. Real scale
  lever = CMS-VENDOR feeds (GEM2GO/feratel/siteswift = thousands of sites per integration), an
  email-from-George, not code. It's the middle-layer strategy (trade distribution for supply) and it's
  POST-LINZ — the carrot is an audience we don't have yet (1 subscriber). Details: docs/partnerships/README.md §6.
- **Registered sources are otherwise caught up** (8 BG never-crawled → tonight's cron). Countryside CMS
  fingerprint sweep (793 unclassified, 822 on LLM route) deferred per George.

## Where things stand (2026-07-15 — newsletter consent gaps closed; newsletter is launch-ready code-side)
- **Consent gaps (b)(d)(e) closed** (f042187, migration `scripts/migrate-consent.mjs` applied to prod):
  signup stores proof of consent (consent_at + consent_version stamped server-side from
  `NL_CONSENT_VERSION` in lib/i18n.js + the rate limiter's salted IP hash); confirm links expire
  7 days after `token_issued_at` (activation only — unsubscribe tokens never expire, RFC 8058);
  confirm landing page links unsubscribe + explains preferences = re-sign up with same address
  (addSubscriber updates a confirmed row in place, no re-confirm mail). Datenschutz updated de/en/bg.
  Verified: full lifecycle against prod DB + confirm/unsubscribe/invalid pages in the browser.
- **Resend is LIVE on prod (2026-07-15)**: George verified okolo.events on Resend (DKIM/SPF/MX on
  send.okolo.events checked via dig) and set RESEND_API_KEY on Vercel (Preview+Production). Vercel
  envs are **sensitive/write-only — `vercel env pull` returns empty values**, so local testing needs
  the key pasted into .env.local by hand (line exists, still empty). Architect deployed manually
  (documented exception: key only exists on prod) and verified the full loop live: signup form →
  0 Nominatim calls → 200 + honest pending message (only renders when Resend accepted the mail) →
  confirm link → confirmed_at set (bobojojok@gmail.com, Linz, is a real confirmed subscriber now).
  MAIL_FROM is NOT set on Vercel — fromAddress() falls back to `Okolo <SMTP_USER>`, which works.
- **Newsletter remainders**: gap (a) grandfather-vs-drop the one pre-migration subscriber; the
  digest's community +2 ranking-bonus call; audience seeding (growth-system.md §5) — the bottleneck.
- **Growth-surface review + local language + handle branding (c26704f)**: subscriber lang now falls
  back to the chosen area's language (channel registry → lng-20 meridian), never English-by-default;
  newsletter/social-cards/weekend-page all brand as the CITY handle (okolo.linz…) via channel.handle;
  notifyOperator warns when NOTIFY_TO is missing (Resend-only prod silently dropped all signup pings —
  **George: set NOTIFY_TO on Vercel + redeploy**). Newsletter body language was already channel-local
  by construction. NB: `sent:digest:linz:2026-07-17` exists in meta — this weekend's Linz digest is
  already marked sent (ledger has recipients); the desk will 409 a resend without force.

## Where things stand (2026-07-14 latest+8 — adversarial review of the latest features, all cleaned)
- **Four Sonnet agents reviewed crawl / map / growth / admin-auth; architect verified every
  Critical/Major against the code and fixed all.** Shipped 96ce8c4 (pipeline/map/search) + cddd1ee
  (admin/newsletter security). Build green, 52 tests (+3 new), DB smoke-tested against prod.
- **The one that mattered most: multi-day events silently expired after day one.** Every adapter
  dropped `ends_at` unless an end TIME was present, so a known end DATE (Kinderfreunde 28.02–31.12,
  any GEM2GO/kalkalpen/JSON-LD range) was thrown away and expireFinished fell back to end-of-START-day.
  `makeEndsAt()` now keeps a date-only end (same shape rule as `makeStartsAt`); expireFinished reads a
  10-char `ends_at` as end-of-day. PRE-EXISTING, not a regression — it became visible once the end side
  was looked at.
- **New auth work had a CSRF hole** (GET /api/admin/remove accepted the Lax cookie → crafted-link event
  deletion) and its brute-force protection was bypassable (leftmost-XFF spoof, no global cap). Both
  fixed: token-only remove, platform-IP trust + globalPerDay. The auth FEATURE itself was committed by
  a concurrent session (8bdb5f8) while I worked; my fixes are clean deltas on top.
- **weekendPicks ranked with an additive sum** — free+community+precise (5) beat family (4), so a
  non-family event could headline the family digest. Now a lexicographic tuple (family strictly
  dominant). "Community" was `!= 'crawl'` (caught bulk osm_mined); now the user-submitted
  COMMUNITY_KINDS set shared with commonFilters. Digest window is now overlap not start-only.
- **Unauth /api/social/card used to build+freeze the weekly digest** (stale picks locked in + a paid
  LLM call) — now reads the frozen snapshot only. Digest **send** now tracks per-recipient so a
  60s-timeout/partial failure can't double-mail on retry.
- **Search folds diacritics** (`unaccent`, both sides; migrate-unaccent.mjs applied to prod) and ranks
  title-prefix first. Cross-SCRIPT (Latin→Cyrillic) still unsolved (needs transliteration). Complements
  the concurrent session's gazetteer work below. Registry geocode rung now town-bounded (prod already
  clean). Concurrent-session note: my db/schema.sql edit got swept into their docs commit c8dcc79.

## Where things stand (2026-07-14 latest+7 — search finds cities, not just streets)
- **`lib/places.js` = the search gazetteer** (~33 AT + ~25 BG cities + aliases people type:
  Vienna→Wien, Sofia/софи→София). Prefix > word-start > substring, population as tiebreaker;
  locations always above events in the dropdown; Photon is the long tail (villages/addresses) with
  localities sorted above streets. **Standing rule (CLAUDE.md #8): new coverage ⇒ add its cities
  here in the same change** — a crawled city nobody can type their way to is invisible. Never put
  them in `lib/towns.js` (that list drags event *pins* via `townCentroid()`). Docs: data-pipeline §5b.

- **`lib/event-time.js` is the one definition of how a start time is encoded.** A date-only
  `starts_at` ("2026-07-19") means **the source published no time**; 16 chars means it did. Replaces
  `T${time || '09:00'}` + `all_day: time ? 0 : 1` in crawl.mjs and seed.mjs — one missing fact was
  producing TWO inventions: a 09:00 nobody published, and `all_day`, which the UI renders as
  **"ganztägig" ("turn up whenever")** for **8,365 live events** we knew nothing about. Threaded
  through crawl/seed/scan/add-form/contentHash/expireFinished (timeless rows now live to end-of-day,
  not 06:00)/both time-of-day filters/JSON-LD (bare Date)/detail/list/digest/cards; `timeTbd` label in
  de/en/bg; 6 tests. Backfill: **10,625 rows → date-only, all_day=true is now 0.**
- **The backfill was safe because of an invariant, not a guess:** no path ever set `all_day` from
  something a source SAID — all of them inferred it from a missing time — so `all_day=true ≡ time
  unknown`, exactly. The 1,427 rows at 09:00 with `all_day=false` were LEFT ALONE: there the extractor
  really parsed 09:00 (traun.at publishes "Zeit 09:00–13:00 Uhr").
- **`upsertEvent` gained a placeholder-migration** (mirrors the legacy-hash one): an incoming timeless
  event adopts the old `T09:00` row instead of inserting a duplicate. Verified live — a forced GEM2GO
  re-crawl upserted 74/74 with the row count unchanged.
- **merge-dups.mjs canonical rule fixed**: survivor = the row with the most FACTS (published time ≫
  geo precision > venue > description), age only as tiebreak. It was keeping the OLDEST id, which with
  a 09:00 placeholder meant deleting the row that knew the real time. **Still UNRUN** (436 clusters /
  481 rows) — its dry run reveals a separate geocode bug (a canonical with a wrong town).
- **I got my own bug report's headline wrong** and nearly fixed the wrong thing: I claimed parents saw
  "9:00" without checking the render path (all_day short-circuits it). Lesson recorded.

## Where things stand (2026-07-14 latest+5 — text hygiene + TWO data-integrity landmines found)
- **One entity decoder now** (`lib/entities.js`), replacing NINE partial hand-rolled copies (7 adapters
  + crawl.mjs + probe-sources.mjs) of which only 2 handled numeric refs — so `&#8211;` (the en-dash in
  half of all German titles) reached 66 published titles. WordPress entity-encodes *inside* JSON-LD/RSS,
  so a clean parser ≠ clean text. Enforced at the single write boundary (`upsertEvent` → `cleanText`),
  like the age coercion already there, so no future adapter can bypass it. Prod cleaned via
  `scripts/fix-entities.mjs` (dry-run default): 298 rows normalized + re-hashed, 20 provably-identical
  dupes merged (identical recomputed content_hash), 0 entity rows left; re-crawl verified idempotent.
- **The reported "text bleed" was NOT our bug** — krenglbach.at's own JSON-LD publishes
  "…der ErdeDie progressiven Nostalgiker". We store it faithfully; repairing it by inference would be
  fabrication. (Stuttgart-robots lesson again: replay the diagnosis against the raw source first.)
- **🚨 The crawler FABRICATES a start time.** `crawl.mjs:962` = `T${time || '09:00'}` → **12,052 of
  31,349 events (38%) sit at exactly 09:00**, i.e. "no time published" is shown to parents as "starts
  9:00". Hard-rule-5 violation at scale. Spawned as its own task; needs an honest encoding threaded
  through contentHash/expire/filters/digest.
- **🚨 `scripts/merge-dups.mjs --write` is currently DESTRUCTIVE — do not run it.** Its dry run wanted
  to delete 500 rows; it keeps the OLDEST id as canonical, and 85 of 453 clusters merge different start
  times — it would keep a placeholder 09:00 row and delete the row carrying the real 18:30 (verified:
  Sachkundenachweis, Pflasterspektakel), and keep a canonical row with a wrong town. Fix its
  canonical-choice rule (prefer the most precise row) *after* the 09:00 fix.

## Where things stand (2026-07-14 FINAL — honest map, family supply, geocode integrity)
**Numbers:** 1,824 sources (1,743 working, 0 dead) · 23,743 published events · 1,269 places ·
2,589 family-tagged. AT 20,482 / BG 2,486 / DE 775.

**THE COST LEVER, unchanged and un-pulled:** 813 working sources still resolve via the **LLM route**
vs 790 deterministic GEM2GO. ~half of all sources cost a model call *every crawl*. The national probe
classified sources from **URLs only, never fetching HTML**, leaving ~1,027 unclassified — the CMS
fingerprint sweep is the highest-value pipeline task outstanding, and it is also the biggest coverage
lever for the thin Graz ring. **Do this before anything else on scraping.**

**The map no longer lies about where things are.** Half of all events know only a town. We used to
draw each as a pin with a random ±300m jitter — inventing a coordinate for ~11k events. Now: jitter
gone, 10,661 rows snapped to the true centroid, and town-level events collapse into ONE dashed bubble
per town ("N events in Ottensheim", tap → list, "Genauer Ort nicht angegeben"). Grammar reused, not
invented: dashed already meant approximate, bubble+count already meant many. Online events (395) off
the map entirely, still in list+search. **George owes one real-browser tap on a dashed bubble** —
the only unverified path.

**Geocode integrity (the deepest bugs of the day):** only ONE of geocodeEvent's precise rungs was
town-bounded, so generic venue names were placed anywhere in Austria at full venue precision — and
those wrong coords had been SEEDED into the venues registry, which returns *before* validation. 254
poisoned rows, up to 446km off, served on every recrawl. All rungs bounded now; `prune-venues.mjs`
exists for the next time a rule changes. **A cache/registry seeded under a broken rule outlives the
rule** — re-validate on every rule change.

**Family supply: 495 events from the new sources** (FRida&freD 144, Kalkalpen 99, Naturfreunde 65,
Kinderfreunde 60, Alpenverein 35, dioceses 30, Donau-Auen 13, Familienbund 10, libraries 22, ASVÖ 7).
Diocese "siteswift" = the second GEM2GO-class cluster (6 of 9 dioceses, one adapter).
`sources.default_categories` (a children's museum's events ARE family events even when the text never
says so) and `sources.default_venue` (a theatre names the ROOM — "Bühne 1" is inside Dschungel Wien).

**"For kids" now includes museums** (George). 1,254/1,269 places pass; only `trail` out pending the
family_suitable attribute. Insight worth keeping: our places catalogue was MINED as family places, so
per-category re-litigation was hiding our own curation.

**Still running / next:** `venue-search.mjs` (767 unique venues, Grok CLI $0, ~2min each, resumable,
0 errors) — leave it chipping. Then: CMS fingerprint sweep. Partnerships tracker with drafts:
docs/partnerships/README.md (George sends; feratel Deskline is the highest-leverage new one).

## Where things stand (2026-07-14 — family/kids supply + the filter that hid it)
- **All researched family/nature/Verein sources are live and crawled: 495 events, 347 family-tagged.**
  FRida&freD 144 · Kalkalpen 99 · Naturfreunde 65 · Kinderfreunde 60 · Alpenverein Jugend&Familie
  (Linz/Graz/Ibk) 35 · dioceses 30 · Donau-Auen 13 · Familienbund 10 · libraries 22 · ASVÖ 7.
  Total family-tagged events in DB: 2,328.
- **THE BIG ONE: "For kids" was deleting 1,268 of 1,269 places** (every playground/pool/zoo) —
  its predicate predated the `place` kind. George's instinct ("things that fit kids aren't tagged")
  was right, but the cause was a stale predicate, not the taxonomy: removing the filter would have
  destroyed the product's core lens and left the bug. `lib/kid-cats.js` is now the ONE definition
  (server SQL + client list had drifted into two). Live-verified: 2,634 → 3,483 results, 1 → 849
  places. Open call for George: museum/park in or out?
- **`sources.default_categories`**: the extractor reads an EVENT's words, not its publisher's
  identity — a children's museum's 144 events extracted as `culture`. Source-level tags now append
  at crawl time (single-audience sources only; forcing `family` on a diocese would be rule-5
  fabrication in the category column). Backfill must join on source_name, NOT source_url (most
  adapters store the event permalink there — that silently missed OÖ Familienbund).
- **enrich_attempted_at** makes enrichment resumable/cron-able: a killed run used to restart at the
  top of a stable ordering and re-pay the model for pages already proven location-less (resolved 0
  of its first 250). Now stamped on FETCH; re-runs skip 1,188 in 1.6 min instead of 78.
- Enrichment yield so far: zone town-precision 4,575 → 3,727. venue-search.mjs (Grok CLI, $0,
  web-search, verified on Posthof) is BUILT and ready — run it alone (Nominatim budget) once the
  LLM pass finishes.

## Where things stand (2026-07-14 latest+4 — WEEKLY GROWTH ENGINE SHIPPED)
- **The Thursday flow exists end-to-end** (docs/strategy/growth-system.md = the operating system;
  docs/ops/weekly-automation.md = the runbook, now marked SHIPPED). `lib/city-channels.js` (10 city
  channels, AT/BG/DE, each with lang + hashtags + catchment) → `weekendPicks()` (PostGIS ST_DWithin,
  DISTINCT ON lower(title) so a Ferienprogramm series can't fill the digest, ranked family→free→
  community→precise) → `writeDigestCopy()` in lib/extract.js (**Sonnet** primary → Gemini → template;
  routed in extract.js per hard rule 2) → **frozen weekly snapshot in `meta`** so cards, caption and
  email can never disagree → `/api/social/card` 1080×1350 carousel (Noto Sans = real Cyrillic, not
  tofu) → `/admin/thursday?token=` desk (review, Drop a bad pick, download cards, copy caption, Send)
  → `npm run digest` CLI → `.github/workflows/weekly-digest.yml` Thursday cron that **prepares only**.
- **Deliberately manual: posting and sending.** Auto-posting gets you banned from the local parent
  FB/WhatsApp groups that ARE the channel; an auto-sent newsletter is how you mail parents a wrong
  event. The cron prepares and emails George "desk is ready". Revisit Graph API after ~4 weeks manual.
- **The digest immediately found two real bugs, which is the point:** (1) George's own "Test event"
  (id 13890, from add-flow testing) was **published on the live map**, dated this Friday, and would
  have headlined the first newsletter — now `status='removed'` (reversible: flip back to 'published').
  (2) A crawled title carries an undecoded `&#8211;` plus text bled in from the next element
  ("...der ErdeDie progressiven Nostalgiker"), which also defeats content_hash dedup → spawned as its
  own task.
- **AI writes prose, never facts** — every teaser was traced back to our own DB `description`. The
  copy label reports the model that ACTUALLY wrote it, which is how we caught that Sonnet wasn't
  running: `ANTHROPIC_API_KEY` lived in **`env.local` — the DOTLESS file, which nothing loads**
  (`next` reads `.env.local`; npm scripts pass `--env-file=.env.local`). The 2026-07-10 lesson,
  repeating. Copied into `.env.local` → `copy: claude-sonnet-5` confirmed. **Still needed in PROD:
  ANTHROPIC_API_KEY as a Vercel env var AND a GH Actions secret (the Thursday cron writes the copy),
  plus ADMIN_TOKEN on Vercel.** Two near-identically-named env files is a live footgun.
- **THE BOTTLENECK IS AUDIENCE, and it is now the only one.** Supply = 22k events; product = fine;
  assets = 10 min/week. Subscribers = **1, unconfirmed**. Followers = 0. Groups seeded = 0. Running
  the four-weekend Linz test before seeding an audience measures nothing — audience seeding is step
  one OF the test, not marketing to do afterwards (growth-system.md §5).

## Where things stand (2026-07-14 latest+3 — VIEWPORT-NATIVE MAP SHIPPED, radius retired)
- **Deployed to production 2026-07-14 ~14:30Z** (dpl_B2sLnRFxTTF31g5NZPZCAbD3imrt → www.okolo.events)
  and live-verified: pins 48 KB/107 rows incl. 46 places (was 10.7 MB/23,937), cells 2 KB for
  all-AT (20,664 events → 37 cells), ?q= works, no-bbox → 400.
- **The app now loads what the map shows, not the planet** (ced9e73; decision doc
  2026-07-14-viewport-data-loading.md). PostGIS geom+GiST live on prod; /api/events?view=map is
  zoom-tiered (pins ≥11.5 with LIMIT 800 places-first, grid cells below — constant cost at any
  scale); all filters mirrored 1:1 in SQL; global ?q= search; ?ids= saved resolve; expireIfStale.
  Radius slider/circle GONE — viewport is the filter, distance labels stay, newsletter radius stays.
  Linz viewport 47 KB vs 10.2 MB before. Multi-agent build: Sonnet (server) → Sonnet (client) →
  Opus adversarial review → architect fixes. Two integration finds worth remembering: (1) never gate
  DATA on MapLibre 'load' — a basemap-CDN outage then means "0 events" forever; gate on map init,
  degrade to grey-map-working-list. (2) animated flyTo dies with the render loop → `flyAssured()`
  jumpTo watchdog, or recenters silently don't refetch. George still owes a prod eyeball (Vienna
  truncation hint, cell tap).

## Where things stand (2026-07-14 latest+2 — source wave + enrichment run DONE)
- **Enrichment run 1 (deterministic) finished: 537/4,573 zone events upgraded** (registry 146 /
  JSON-LD 191 / iCal 102 / table 98), 33 distance-guarded, 186 sentinels. Remainder: 2,264
  fetched-but-unstructured (→ --llm rung, run 2 in flight on paid Gemini key) + 1,577 listing-only
  linkbacks (→ Grok CLI venue-search backfill, still to run).
- **All researched sources are now LIVE adapters, verified end-to-end** (hard rule 7): Naturfreunde
  77 ev / Kinderfreunde 65 / Diözese-Linz siteswift 8-per-window / Kalkalpen 104 occurrences /
  Familienbund 10 (JSON-LD $0) + 13 registered small sources + 4 more dioceses on tomorrow's cron.
  Diocese "siteswift" platform = the second GEM2GO (6/9 dioceses, 5 registered, parish-level
  family events). feratel Deskline + Gem2Go = partnership emails only; lead: Veranstaltungsdatenbank
  NÖ (official Land event DB Gem2Go consumes).
- **Conditional GET live** (etag/last_modified + 304 path), **Request-rate** robots directive
  parsed, **embedding dedup infra committed** (report-only; 11,740 rows embedded; wiring needs
  similarity ≥0.90 AND same-town — day-only is drowned by templated municipal content).
- **NEAR-MISS: my crawl-net refactor swallowed htmlToText** → every generic crawl silently
  zero; caught by a reviewing agent before any cron ran, fixed + spot-checked (Pottendorf 99/99).
  Lesson recorded. NB George clicked the spawned fix-chip → a duplicate session may exist; its PR
  should be declined (fix is on main, d8285c8).
- **CAUTION: concurrent viewport session** owns uncommitted changes in lib/db.js / db/schema.sql /
  app/api/events/route.js (PostGIS geom, expireIfStale, mapPins). My commits staged those two
  files hunk-selectively. Don't sweep their work.

## Where things stand (2026-07-14 — enrichment ladder stages 0–2 SHIPPED)
- **Venues registry live**: `venues` table seeded with 4,216 resolved venues (events+places);
  `geocodeEvent()` consults it before Nominatim and writes POI hits back. Sentinel venues
  (Online/Sonstige/онлайн…) never geocode. `NOMINATIM_URL` env → self-hosted instance, no throttle.
- **scripts/enrich-locations.mjs shipped** (detail-page second hop): registry → JSON-LD (title-
  matched) → per-event GEM2GO/RiS iCal LOCATION (data-bez matched; postcode→address, else POI) →
  detail-table Ort. 30km town guard, dry-run default, lib/crawl-net.js shared politeness (extracted
  from crawl.mjs). First 5-zone --write run launched — check its tail next session for yield.
- **docs/ops/local-box-setup.md**: full runbook for George's Ryzen/64GB box (Nominatim docker on
  merged AT+BG+DE Geofabrik extract, Photon caveat — Vercel can't reach LAN, systemd timer, GH
  Actions cutover rule: never both crons). George intends to run the box himself.
- NB: a `next dev -p 3311` (not ours) shares .next — `npm run build` fails at export shuffle;
  compile+types green, runtime verified through that dev server. Don't fight the build while his
  server runs.

## Where things stand (2026-07-14 — big-city quality concept + robots parser fix)
- **Concept delivered: docs/design/big-city-quality.md** (George: precise locations for big-city
  events + missing family/nature/Verein sources). Measured: 51% of 9,035 events in the 5 city
  zones (W/L/G/S/I +40km) are town-precision; 2,565 have an unresolved venue string collapsing to
  **1,163 unique (venue,town) pairs** → the fix is venue-shaped, not event-shaped. Ladder: sentinel
  hygiene (394 'Online' centroid pins) → venues registry → $0 detail-page second hop (480+ events
  have unfetched detailonr URLs) → web-search per unique venue (model returns address string, WE
  geocode it, 15km bound — never model coords) → per-event search deliberately NOT built.
  Source sweep (2 Sonnet agents): **Naturfreunde hidden JSON API** (POST /events/ng_items — 2,491
  events, all Länder, lat/lng included, robots-allowed, Crawl-delay 10) is the top unlock;
  then Kinderfreunde (age-tagged HTML), FRida&freD Graz, non-Wien city libraries. Closed/never:
  alpenvereinaktiv, bergfex, komoot, Mamilade (ToS/commercial). Places: trails have real OSM
  backbone (11.7k hiking relations, sac_scale strolling|hiking = family filter); family_cafe only
  viable as restaurant↔playground ≤80m spatial join (direct tags: 1 and 67 hits AT-wide);
  IKEA/XXXLutz play areas = hand-curated committed seed list.
- **Stuttgart was never robots-blocked — parseRobots bug, fixed.** `Allow:` wasn't parsed, so
  Cloudflare's managed layout merged named AI-bot `Disallow:/` into the `*` group → whole site
  read as closed. Fix: Allow parsing + RFC-9309 longest-match + same-agent group union + trailing-*
  prefixes (13/13 tests, live-verified). Stuttgart → **92 events via existing sitepark-ical
  adapter**; Плевен (only other victim) unblocked; no source had rotted to tier=dead. Concept §2:
  `blocked_reason` column so genuine blocks (Büchereien Wien, JS-SPAs) are states feeding an
  outreach queue, not zero_streaks rotting to 'dead'.
- **Inherited-analysis caveat:** the pasted "796 probed sources never registered / Salzburg 0%"
  claim was STALE (all 796 registered 2026-07-12; Salzburg ring has 62 working sources). Real
  kernel kept: probe never sniffed HTML → 1,027 unclassified skips, Graz ring thinnest.

## Where things stand (2026-07-14 — crawl cadence + repeatable-source rule)
- **Crawl trigger is now daily** (`0 4 * * *`, `.github/workflows/crawl.yml`, renamed "Scheduled
  crawl"). Was Thursday-weekly, which made `TIER_CADENCE_DAYS` (active 2d / slow 5d / dormant 7d)
  dead code — on a 7-day trigger every source is past even the dormant threshold. Daily is the
  *trigger*; the tiers decide who is actually *due* (1,711 skipped as not-due on the verification
  run). Actions minutes to watch: most AT sources are still `active` (new sources default there
  until 3 crawls of history), so early runs fetch ~half the catalog daily.
- **Hard rule 7 added (CLAUDE.md): every source must end up repeatable.** Outside crawlers/tools
  (Grok mining, OSM, `scripts/mine-*.mjs`) are bootstrap only — a mining task isn't done until the
  source is `works=true` and reachable by `scripts/crawl.mjs`, verified with
  `npm run crawl -- --url <source>`. `works=false` + "refresh only with script X" is a bug.
- **Stuttgart's two disabled sources are live again.** Sindelfingen (221 ev) and Kreativregion
  (174 ev) had `works=false` because the crawl had no adapter for their CMS — their parsers already
  existed in `lib/`, just unreachable from the waterfall. Wired `typo3-hwveranstaltung` +
  `wordpress-ical` into `tryStructuredExtraction()`; both deterministic, zero LLM cost. All 8 DE
  sources now crawlable. DE published events 763 → 790.
- **Open gap:** `Landeshauptstadt Stuttgart` yields 0 — stuttgart.de robots.txt disallows its RSS
  path, so the region's biggest city contributes nothing. Needs an allowed endpoint or a permission
  email; do not crawl the blocked path. (Spawned as a separate task.)
- Coverage snapshot: AT 1,578 sources / 20,551 events · BG 219 / 2,511 · DE 8 / 790.

## Where things stand (2026-07-14 — anonymous feedback signals)
- **Interested/Save + data-quality reports shipped** (0c100b9). One `reactions` table (entity + enum +
  dedupe key), `/api/react`, unique (event_id, kind, ip_hash) = one person one vote. Interest count
  hidden below 3; reports (cancelled/wrong_time/wrong_info/not_free) surface only at 3 independent
  reporters. Saved list in localStorage, first item in the menu. Migration: `scripts/migrate-reactions.mjs`.
- **The reasoning matters more than the code** (George asked "ratings? likes? comments?"):
  ratings FAIL the cold-start test — events are ephemeral (a star on something you can't re-attend is
  worthless) and places lose to Google's 100× review volume; every card would show empty stars, which
  reads as a dead product and poisons the retention metric. Free-text comments are the most expensive
  and least informative option: DSA/Austrian ECG host-provider duties on a *kids* product, and they
  need a login, which throttles volume to ~zero at validation scale. **Interested is the only signal
  that pays off at N=1** — it's personal-first ("save this") before it's social, it's forward-looking
  so it survives ephemeral events, and it hands us intent-to-attend, the best PMF proxy in the
  four-weekend test. Login policy = **match identity to blast radius**: enum → anonymous; free text →
  account. Comments revisit post-test; "Saved" is the earned on-ramp to accounts (sync on a new phone).
- **Gotcha:** Postgres `bigint` ids arrive in JS as **strings**. `Number.isInteger()` guard silently
  wiped the saved list on reload — caught only by browser verification, not by the build.
- CLAUDE.md hard rules updated: old rule 6 ("serverless is read-only/ephemeral until the Supabase port
  lands") was STALE — the port has landed, `lib/db.js` is Postgres, writes persist. Replaced with the
  anonymous-writes-are-structured-only rule.

## Where things stand (2026-07-14 — set location by map gesture)
- **Long-press / right-click drops the "around here" reference point on the map** (George: typing a
  location to move off current sucks). Long-press = manual 500ms touch timer (cancels on >10px pan,
  swallows the trailing synthetic click); desktop = `contextmenu`. Reverse-geocodes into the existing
  `searchCenter` + `Around {ort}` chip, so distances / radius filter / radius circle recompute for
  free. Dropped `search-marker` is now draggable (create-once, setLngLat on update — no teardown
  mid-drag). One-time hint toast (`dropPinHint`, localStorage `umkreis_droppin_hint`). Gated by
  `addFlowActiveRef` so it never fires during event/place intake. All in `app/page.js`
  (`dropLocationPin`, gesture listeners in map-init effect); i18n keys `droppedPinLabel`/`dropPinHint`
  in de/en/bg. Build green, browser-verified. (f046f83)
- **Discoverability rule learned:** a hidden gesture needs its hint at the *moment of intent*, not in
  a reference panel. The tip now renders the instant the location search opens — the exact second the
  user is reaching for the friction the gesture removes. The legend was rejected on purpose: it's a
  pin-symbol key (event/place/community/approx/cluster), collapsed by default, and a user reading it
  is not mid-task. (0ca7ace)

## Where things stand (2026-07-13 latest — FB link unfurl, filter UX, party category)
- **Public Facebook events now resolve via a pasted link.** FB's login wall is UA-gated;
  `app/api/extract-url` requests FB hosts (`facebook.com`/`fb.me`/…) as the `facebookexternalhit`
  crawler → full og metadata (title/date/place/org + cover) → existing og/AI-text path → structured
  event, FB permalink as source_url. Public only; private/group events fall back to poster scan.
  Legal posture = **user-initiated link unfurl only, never bot/logged-in scraping** (recorded in
  docs/research/open-event-sources.md + memory `bg-facebook-events`). AI intake hardened against
  serverless cold-start flake (withRetry on transient errors + 20s fetch timeout).
- **Filter UX overhauled:** Kind is now a segmented control (single-select) vs toggle chips
  (multi-select); quick row = ⚙Filters · For kids · Free · Indoor · Outdoor · Community · Party;
  a location stats line (N events · M places) sits above the list; Indoor/Outdoor moved out of the
  panel (no redundancy). Community + Party are dedicated quick-filter flags.
- **New `party` category** (nightlife) — full Route C (CATS fuchsia + martini glyph, EVENT_CATS,
  i18n de/en/bg, extractor enum + PARTY_HINT in all 3 prompts incl. submitted content) + Route B
  backfill (scripts/backfill-party.mjs, title-only curated match, 97 existing events tagged).
  NB: backfill APPENDS party, so a party event that already had e.g. `music` keeps its music pin
  colour — party-only events show fuchsia. Making party the primary/pin cat is an open choice.

## Where things stand (2026-07-13 late — ALL-GL MAP PINS, the backbone fix)
- **DOM map markers are GONE — pins now render as GL layers** (George: markers shifted on every
  zoom/pan, "truly broken"). briefs/gl-pins-brief.md → Opus implement + Opus adversarial review
  (verdict SHIP-AFTER-FIXES, all 7 findings fixed, incl. an add-flow click guard that stopped pin
  taps corrupting a location being placed, and invalid nested-zoom GL expressions the style-spec
  validator caught). Architecture: 16 category sprites @3× from CATS/P, one `result-pins` GeoJSON
  source (promoteId), feature-state selection (halo + 1.28× overlay), count/community/approx as
  GL layers, all icon-allow-overlap, cluster↔pin crossfade 12.0→12.6 all-GL. Whole DOM lifecycle
  deleted (syncDetailMarkerViewport, bounds culling, hysteresis). Drift now impossible by
  construction. Caution: a concurrent session's `git add -A` entangled the implementation commits
  (43f4ccf/35dd854/b7efd7d) — see lessons; it recurred (28fe888 carried the mapLoaded lines that
  2a919be depends on), so those commits don't revert/cherry-pick independently.
- **Post-ship regression + fixes (same night):** the initial ship showed an EMPTY map past cluster
  zoom — pin layers never installed (dead `isStyleLoaded()/once('load')` gate; fixed 2a919be with a
  mapLoaded flag; lesson recorded). Follow-up review browser-confirmed the fix: pins render after
  zoom, click→detail works, filter-to-zero-and-back repopulates, add-flow guard works. Selection
  halo + approx ring made shape-matched sprites (teardrop on events — George flagged circles,
  5ec84b5). Review round 2 fixes: cluster-bubble taps now route with priority in ONE click handler
  (bubble → pin → overview → deselect; bubbles kept expanding through the crossfade band), and
  badge/community circles got viewport pitch-alignment/scale so decorations don't tilt/resize
  independently on a pitched map.

## Where things stand (2026-07-13 — design-system consolidation)
- **Landed `docs/design/design-system.md`** as the binding source of truth (tokens / marker grammar /
  control vocabulary); design-doc §9 links to it. Fixed the design-drift issues: marker hard cap
  (retired `.pin-series` shape → count badge; retired whole-pin community ring → `--community` corner
  badge shared across pin/list/legend; ring/scale reserved for `.selected`); darkened the two light
  gold cats in `CATS` for ≥3:1 white-glyph contrast; removed the `.toggle`/`.knob` switch vocabulary
  (one binary grammar = chip); replaced the `.lifted`/`.above-sheet` FAB/locate magic-number offsets
  with one reflowing `.floatstack`; retired the word *Umkreis* from shipped UI/i18n/docs/prototypes
  (product name = Okolo). Build green; verified at 375px in-browser (map + legend + floatstack).
  Two open follow-ups: self-host a display webfont (wordmark is already an OS-stable SVG, so low
  priority); and George's call on family = filter vs default lens.

## Where things stand (2026-07-12 latest — review-fix pass)
- **Reviewed tonight's commits + fixed everything found (5 commits efa8ef6, 4c485af,
  790eaa7, d2e0b54, dcf4bca).** Highlights: map cluster↔pin zoom handoff no longer drifts/flickers
  (cross-fade + hysteresis + marker set frozen mid-gesture, re-culled on moveend only — the WebGL
  map can't render in the in-app preview browser, so map QA must be done in a real browser).
  Newsletter now has proper **double opt-in** (token + /api/subscribe/confirm + /unsubscribe routes +
  confirmation mail via existing Migadu SMTP; migration applied to Supabase; full lifecycle verified
  live) and an honest DE/EN/BG privacy policy. extract-url: fixed a Vienna-time UTC-millis bug, pinned
  the SSRF connection IP (node http/https `lookup`, no undici dep) to close DNS-rebinding, listing-page
  guard, image/rate-limit fixes. Big-city series now split by venue (multi-venue events no longer hide
  behind one pin). All committed to main; build + 6 map-groups tests green.
- **Growth plan delivered** (users / advertisers / partners) with Austria pricing benchmarks —
  anchor: promoted pin €20–50/event/wk, newsletter slot €50–150, category sponsorship €150–400/mo;
  best partner move = Linztermine eventExport XML (CC-BY 4.0, free-for-linkback) + OÖ Familienkarte
  distribution. Aligns with briefs/outreach-emails-de.md (George sends).

## Where things stand (2026-07-12 late — AUSTRIA NATIONAL)
- **Advertising intake:** the account menu now offers a localized Advertising & partnerships
  enquiry window with a `hello@okolo.events` quote CTA. It promises clearly labelled paid
  prominence only; the actual business-tier ranking/visual treatment remains unbuilt and legally
  gated on per-listing ad labels, payer identity, ranking disclosure and advertiser terms.
- **Unified contribution + series map shipped:** one Add FAB accepts poster/photo, pasted image,
  public URL, or manual entry; URL extraction cascades JSON-LD → OG → provider-routed AI with SSRF
  guards and screenshot fallback. Event|Place shares one confirm form; address autocomplete and the
  main map are two-way bound. Map density now resolves coordinates first, collapses conservative
  same-title+town occurrences into a distinct series bubble (with date navigation), collapses safe
  same-venue groups, then applies generic spatial clusters.
- **15,946+601 events, all 9 Länder, 1,069 sources.** Deterministic prober (scripts/probe-sources.mjs,
  2,092-town catalog, no LLM, ~23min sweep) → 796 registered → hardened crawl (age-coercion +
  per-event/source isolation after the "4.5" batch-kill). Vienna = aggregators not Gemeinde:
  "Wien erleben" two-hop parser (cms='wien-erleben'), WIENXTRA, MQW; 601 Wien events, 45% family-
  tagged. Robots policy: honor named-AI-bot blocks (Büchereien/VHS Wien) even under UmkreisBot UA —
  pending George confirm. Next levers: Stmk/Ktn CMS parser, regeocode repair, crawl cron, deploy.
- **Country-aware pipeline (AT/BG)** + Cyrillic-safe hashing (AT hashes proven byte-identical);
  Bulgaria Grok run-kit briefs/bulgaria-grok-kit.md; playbook docs/playbooks/country-mining-playbook.md.
  Outreach drafts ready (briefs/outreach-emails-de.md) — George sends.

## Where things stand (2026-07-11 late — UI v4)
- **2026-07-12 Bulgaria crawl tooling:** `/crawl-bg` command (`.claude/commands/`) drives Grok Build
  on the **SuperGrok OAuth entitlement** ($0 API) as an agentic BG event miner; `skills/crawl-doctrine.md`
  is the enforced standard for ALL crawls (never-fabricate, facts+linkback, Cyrillic-verbatim,
  seed-compatible `{source_registry,events}` shape, source-extracted lat/lng honored by `seed.mjs`,
  spot-check validation). NOT the storykept `/grok` `/hermes` (those are code-review, repo-hardcoded).
  Yield: a single shallow pass got only 20; **11 parallel deep per-city crawls (paginated, all
  sources) → 322 unique real events across 13 municipalities** in `data/mined/events-bg-*.json`,
  schema-clean, spot-checked live. Recrawl loop mirrors Austria: `scripts/build-bg-sources.mjs`
  collects listing pages (≥2 events, dated-afish permalinks collapsed, JSON-LD/iCal/RSS
  fingerprinted) → `data/catalog/probed-bg.json` (36 sources) → `register-probed.mjs` (now
  country-aware, accepts BG medium) → 26 new sources over 11 oblasts → `getSourcesForCrawl` picks
  them up so `npm run crawl` refreshes BG. **Seeded + registered to Supabase (2026-07-12):** 329 BG
  published events (Sofia deepened 23→50 off the visitsofia.bg / Столична община jevents calendar,
  which holds ~176 entries — LLM pulls a slice; no iCal export (403); dedicated jevents parser is the
  real fix, see todo). **2026-07-13 continue-crawl (batch 2):** 12 summer-hotspot deep crawls (Black
  Sea coast Sozopol/Apollonia 51, Pomorie 50, Balchik, Nesebar; resorts Velingrad 61-from-PDF,
  Bansko, Sandanski; + Gabrovo/Kazanlak/Pazardzhik/Kyustendil/Haskovo). **BG now ~979 distinct
  events (1070 rows incl. 91 legit recurring dates) across 42 towns, 177 active recrawl sources
  (76-source curated catalog).** Top: Burgas ~323 (real, gotoburgas aggregator), Varna 117,
  Blagoevgrad 88, Stara Zagora 55, Sofia 75. **2026-07-13 FINALIZED: BG = 1859 events + 661 family
  PLACES (2520 total), all live on okolo.events (verified).** Family/kids gap closed: kids events via
  Grok crawl of clubcheta.com (99) + sofia.plays.bg (15), 167 BG events now carry an age range;
  evergreen family PLACES via `scripts/mine-bg-places.mjs` (OSM/Overpass ODbL, curated — always-keep
  zoo/aquapark/pool/climbing, museum/park notable-only via wikidata, nearest-city town ≤30km): 661
  seeded (museum 287 / park 157 / pool+aquapark 124 / zoo 67 / climbing 25). Research (docs/research/
  bg-event-sources.md): NO clean licensed BG feed exists, NO reusable open-source project (only a
  cinema scraper) — confirms crawl-first thesis; clubcheta/sofia.plays.bg/programata.bg are the
  family unlocks. Reusable Grok brief: briefs/bg-family-kids-crawl.md (programata.bg kids done 2026-07-13: 10 events extracted from articles across Столична/Пловдив/Стара Загора; kids.programata.bg blocked, facts+linkback, own Cyrillic descriptions, ages where stated).
  Sofia deepened 75→121 via 3 parallel clusters (visitsofia jevents calendar + state venues
  NDK/Opera/Nat.Theatre/Philharmonic + galleries/culture). The jump 1070→1637 = a **full `npm run
  crawl` over the 191 registered BG sources ran (last_crawled 2026-07-12 23:38) and pulled events
  live from listing pages via the Gemini waterfall — recrawl loop confirmed working AT SCALE**, not
  just the 1-source test. Re-seed recovered ALL previously un-geocodable (0 now). CAVEAT: Grok-mined
  + Gemini-recrawled the same events with different title phrasings → exact title|date|town dedup
  misses cross-source near-dups, so true-unique <1511; run scripts/merge-dups.mjs (fuzzy) to clean —
  deferred (concurrent session active). Weak spots: Kyustendil homepage-linkback, Velingrad PDF.
  Sofia labels unified (София/Sofia→Столична). ~31 vetted sources works=true
  (65 single-event permalinks deactivated but on record), all country=BG. Fixed a latent bug: the
  AT/BG pipeline had made geocode.js/seed.mjs country-aware but NEVER crawl.mjs — recrawl geocoded
  BG addresses as AT. crawl.mjs now inherits src.country onto events (geocode + tag); seed.mjs no
  longer clobbers source country back to AT. Verified: recrawled Община Русе → 6 events, all [BG],
  all inside Bulgaria bbox. Sofia normalized София→Столична. Launcher scripts in session scratchpad.
- **2026-07-12 localization:** English/German/Bulgarian now cover the map UI, legal pages,
  standalone event pages, metadata, and user-facing API errors. First-visit language uses Vercel's
  approximate IP-country header (BG→BG, AT/DE→DE, all other/unknown→EN); the three-option picker
  stores a manual override in a necessary first-party cookie and local storage.
- **UI v4 shipped** (3 Sonnet agents, Architect-reviewed): Google-Maps shell (brand text gone, pill
  search + account circle → actions menu), Phosphor icons (back/X, directions/calendar/share action
  row, star slot reserved), venue grouping (count badge + "More at this venue"; town-centroid coords
  excluded from proximity matching), address autocomplete (`suggest=1` → Photon; Nominatim forbids
  autocomplete), choose-on-map in both add forms, POI-name-first geocode waterfall (name match +
  15km-of-town bound; fixes Musikpavillon/Posthof class), **57 OSM/Overpass family places seeded**
  (museum/zoo/climbing cats added, ODbL credit in map attribution), opening_hours semantics now
  `{"always":true}`|hours|null=unknown. George's social/accounts/newsletter asks → todo backlog.
- **Pending:** regeocode repair — rerun `scripts/regeocode.mjs` dry-run after Nominatim rate-limit
  cooldown (first dry-run pre-fix, discard), review, then `--write`. Google Places API: not needed
  and legally unusable on non-Google maps (documented in todo).
- **2026-07-12, Austria build-out (this session):** dedup+merge shipped (lib/dedup.js, entry-point
  guards, merge-dups applied: −129 dupes, 14 enriched, idempotent; DB 1892 events + 60 places);
  docs/design/data-pipeline.md = pipeline source of truth (read it before pipeline work);
  npm scripts now carry --env-file. National source probe/GEM2GO parser/tiering = OWNED BY THE
  CONCURRENT SESSION (272 sources, Sbg/OÖ/NÖ; feed_kind last-crawl: 74% gem2go, 24% llm).
  Austria-capitals places mining in flight (data/mined/places-family-austria.json, incremental).
  Session token limit hit once ~22:30 (resets 1:30am Vienna) — agents restarted fine.

## Where things stood (2026-07-11 evening)
- **~1.8k published events from 100 sources / 133 towns** (was 92) after the OÖ expansion round:
  436-municipality catalog, 115 probed, 95 registered (GEM2GO 64 / RiS 9). Places content type live
  (kind=event|place, opening hours, add-place flow). UI v3: locate control, actions menu, locality
  pill + search-anywhere (re-anchors radius), scan-upload cleanup, icon pass. All pushed (2af1c43).
- **Crawl waterfall live:** robots.txt+UmkreisBot UA, page-hash skip, JSON-LD→iCal→RSS before LLM,
  feed_kind per source. Measured cost: ~$1/OÖ pass naive, ~$7–14/mo all-OÖ at 2–3-day cadence,
  mostly free-tier; waterfall cuts recrawls ~10×. Two silent pipeline bugs fixed (Gemini exact keys,
  town geocode fallback). Geocode bounds now Austria-wide (purge negative geocache on widening!).
- **Austria backfill:** run-book briefs/austria-backfill-brief.md. Extraction path per George:
  **local Grok CLI** (~/.grok/bin/grok) via EXTRACT_PROVIDER=grok — subscription tokens, $0 API,
  fenced headless (-p, --tools "", --max-turns 1, tmpdir cwd; stdin NOT delivered — embed text in
  prompt; structuredOutput often null → parseJson(text)). Verified live (Ottensheim 9/9). ~30–60s/page
  → run district batches overnight. Fallbacks: xAI API (if key) → Gemini → Claude. Phase-1 probe agent
  (rest-of-Austria sources, region column) was running end of session — check sources/report next session.
- Doctrine locked: agents discover/verify/repair (subscription tokens), pipeline extracts/refreshes
  (Flash-Lite/Grok). Never agents as recurring crawler.

## Where things stood (2026-07-10)
- Working prototype, v2 UI, in the `eventmap` repo at `~/Repositories/eventmap`. **Committed but not
  yet pushed** — first `git push -u origin main` needs George's GitHub auth (`gh` not installed).
- **Backend is now Supabase Postgres** (was SQLite). Dedicated Supabase project **`eventmap`**
  (ref `lcpamsdenhqqcifcvzbq`, eu-west-1, free org), tables in the **`umkreis` schema**. `lib/db.js`
  rewritten on the `postgres` client over the transaction pooler; 95 events imported; map/detail/JSON-LD/
  **writes all verified live**. Secrets in `.env.local` (gitignored): `DATABASE_URL` (pooler, password
  URL-encoded), `GEMINI_API_KEY`. `next build` green. `data/umkreis.db` removed; `db/schema.sql` is the DDL.
- Scan: Gemini Flash-Lite primary → Claude Haiku fallback → local CLI, all routed in `lib/extract.js`.
  Live poster scan not yet exercised (needs an image).
- Name still open — working name **Umkreis**. As of 2026-07-10 `.events`: grok/sidequest taken;
  okolo / afoot / nabo / outings / ambit free at $17.99. Decision doc: `docs/decisions/2026-07-10-naming.md`.
- Next: push repo → deploy to Vercel (env: DATABASE_URL, GEMINI_API_KEY, NEXT_PUBLIC_BASE_URL) → pick+register name.

## Locked decisions
- Stack: Next.js 15 (plain JS) + MapLibre/OSM + SQLite→Supabase-portable + Claude/Gemini extraction.
- Deploy: Vercel (not GitHub Pages). Production backend = Supabase Postgres+PostGIS (one-file port).
- Data ethics/law: facts + linkback only, never copy prose/images; never fabricate; Vienna-time everywhere.
- Strategy: families-first, one region at a time; B2B2C "publish once, found everywhere" (Google + AI/MCP);
  crawl is the bootstrap, RiS-Kommunal/GEM2GO write-integration is the graduation.
- Middle layer = **trade distribution for supply** (`docs/decisions/2026-07-11-middle-layer-strategy.md`):
  give organizers SEO/AI discoverability they can't build (JSON-LD/MCP) + referral traffic, get their events.
  Two guardrails: value is back-loaded on owning Linz demand first; and perfect JSON-LD risks
  self-disintermediation (Google/AI answer from source_url, skip us) → moat is aggregation+family lens+
  retained audience, not the plumbing. Mechanism: "claim your event" (post-validation).

## Open decisions
- **Name = Okolo (okolo.events)** — rebrand shipped 2026-07-12 (radar identity: pin + rings =
  "events around you"; favicon app/icon.svg, next/og OG image, animated loader; full SEO surface
  robots/manifest/metadataBase/openGraph). Still open: register the domain + set NEXT_PUBLIC_BASE_URL on Vercel.
- Family = filter or default lens?
- Familienkarte / Land OÖ partnership ask (data + first B2B contact) — not yet attempted.

## Pointers
- Bible: `docs/design/design-doc.md`. Queue: `tasks/todo.md`. Lessons: `tasks/lessons.md`.
  Source quirks: `briefs/mining-brief.md`. Decisions: `docs/decisions/`.
