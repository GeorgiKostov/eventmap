# TODO

Work queue. `[x]` done, `[ ]` open. Newest context at top. Keep surgical — flip/append, don't rewrite.

## Local crawl box LIVE + Germany opens: Berlin + Munich (2026-07-17, George: "setup llm+geocoding so we can mine and crawl quick" → "lets crawl the big cities germany") — SHIPPED (c758e41)
- [x] **Self-hosted Nominatim is UP and it was the whole prize.** AT+BG+DE merged (5,529 MB),
      `IMPORT_STYLE=full`, ~104 GB DB on Z: NVMe, osm2pgsql 33m52s + full import ~2h40m.
      `NOMINATIM_URL=http://localhost:8080` → `throttle()` is a no-op. Measured: 10 DE towns in
      **2,041ms** (public floor 11,000ms+ *serialized*); `geocodeEvent('Labyrinth Kindermuseum',
      'Berlin')` → **venue** precision. DE geocache held **298 rows** — i.e. Germany was ~100%
      cache-miss, which is exactly why it was geocode-bound and why the box matters.
- [x] **The runbook said `IMPORT_STYLE=address`, which would have broken `poiQuery` silently** —
      `address` excludes POIs, so every venue degrades to a town centroid AND the miss gets cached
      (Bad Ischl at scale). Proved with the doc's own sanity check: `Posthof, Linz` returns
      `amenity/arts_centre` on `full`, and only `highway/residential` (the *street*) on `address`.
      Runbook corrected + measured numbers recorded.
- [x] **🚨 `scripts/crawl.mjs` ran NOTHING on Windows** — ``import.meta.url === `file://${argv[1]}` ``
      can never match a backslashed drive path, so `npm run crawl` exited 0, printed nothing,
      crawled zero sources. On the exact box the cron is meant to move to. Fixed (`pathToFileURL`).
- [x] **Generic Microdata rung shipped** (`lib/microdata-events.js`, wired behind JSON-LD): muenchen.de
      = Munich's OFFICIAL calendar, **100 Events / 0 ld+json** → was headed for the paid LLM route.
      Now `route: microdata`, **100/100 upserted, $0**. Includes a **placeholder guard**: all 100
      publish `startDate=T12:00:00Z` (noon-UTC date marker) while the visible page shows 11 distinct
      times — parsed literally that fabricates 12:00 on 100 events. 10 tests.
- [x] **Berlin + Munich scopes registered**: 22 sources (14 + 8), **DE events 706 → 1,326**, 30 DE
      sources across 3 scopes. Berlin crawl 486 events with **26 out-of-radius correctly skipped**.
- [x] **Hard rule 8 closed in the same change**: `lib/places.js` had ZERO DE entries and the geocode
      route hard-filtered Photon to `['AT','BG']` with a binary `? 'AT' : 'BG'` fallback flip that
      could never reach a third country. 30 DE towns added (coords read off our own Nominatim);
      `SERVICE_COUNTRIES` is now one closed set. "Berlin" returned an Austrian *building* before.
- [x] **`scripts/register-catalog.mjs`** — registration was ad-hoc SQL (doc-agent finding (a); its
      claim that `upsertSource()` lacks a `region` param is **stale**). Gates scope + robots +
      AI-bot policy + opt-out, dry-run by default. Reusable for Hamburg/Köln.
- [x] **3 measured 0-yield traps refused, with reasons recorded in the catalogs** (`register:false`):
      Erkner (a *sitemap*, 499 locs / 0 dates), Potsdam (nav-only static HTML — all three local
      models correctly found 0 events on it), Starnberg (0 dates, 0 structured data).
- [x] **`EXTRACT_PROVIDER` UNSET — crawl runs on Gemini** (George, informed call, after I first
      unset it on a *broken* benchmark). Real numbers: gemma4:12b is near-parity on ordinary pages
      (hennigsdorf 5 vs 6) and fabricates nothing, but **2 vs 26** on the dense
      kinderkulturkalender-berlin.de family listing. The earlier "local, no users yet" call was
      priced at "2–3 events"; 8% recall on a family source doesn't fit that premise.
- [ ] **Hamburg + Köln: not started** (no probed catalog → deliberately NOT in `crawl-scopes.js`;
      a scope without a catalog claims coverage we don't have). Same two-Sonnet discovery pattern,
      then `register-catalog.mjs`.
- [ ] **Erkner + Potsdam are real sources we're leaving on the table**: Erkner needs a kalkalpen-style
      two-hop (its sitemap's detail pages *do* carry JSON-LD Events — 499 of them); Potsdam needs the
      JS-SPA treatment (find the underlying API).
- [ ] **Negative geocache: 14,494 of 22,805 rows are `hit=false`.** Honest misses against *public*
      Nominatim, but re-querying is ~free now. Worth a measured recheck pass — NOT a blind
      `purgeNegativeGeocache()`.
- [ ] **George: cut the cron over to the box** (runbook §4: Task Scheduler, then
      `gh workflow disable "Scheduled crawl"` — **never both**). Also `w32tm` reports
      `Source: Local CMOS Clock`, never NTP-synced; cadence gating uses host time.
- [ ] Microdata prevalence is still **unmeasured** across the ~840 LLM-route sources — the rung now
      exists, so add an `itemscope`/`itemtype=...Event` signal to `structuredSignals()` and let the
      next fingerprint sweep report how much more is $0 (crawl-sota-2026.md ranked this adopt-now).

## Ollama local-extraction retune (2026-07-17, George: "remove the models we cant use, check online for alternatives… delete models we discard") — SHIPPED
- [x] **The model was the small half.** `format:'json'` meant the contract was *asked for* in prose
      while `CRAWL_SCHEMA` sat unused in the same file — qwen2.5 dropped `date_end`/`time_end` from
      all 8 Innsbruck events (**all 8 silently discarded by crawl.mjs**) and invented categories
      (`"Diverse Musikveranstaltungen"`). Now `format: CRAWL_SCHEMA` → GBNF-constrained: keys exact,
      enum unbreakable, faster. NB Gemini *cannot* use this schema (OpenAPI subset rejects
      `["string","null"]`) — Ollama can, so the Gemini-era workaround was being applied to the one
      provider that didn't need it.
- [x] **`num_ctx` pinned (32768).** Ollama auto-sized to the model's trained max; qwen2.5:14b's KV
      cache pushed an 18 GB footprint onto a 16 GB card → 12/49 layers on CPU → **11.3 tok/s vs 60.6**
      pinned, identical output. gemma4's cache is cheap: 8.4 GB / 100% GPU at both 16k and 32k, and
      the headroom is load-bearing (output shares the window; a dense listing needs ~10k tokens).
- [x] **`think: false` unconditionally.** Every current model thinks by DEFAULT (gemma4 7.9k chars,
      qwen3.5 22.7k) → re-feeds as input → ~5× prompt tokens → context exhausted → truncated JSON.
      This alone made gemma4 look last (233s, invalid) before it won (11s). Verified accepted by all.
- [x] **Timeout 180s → 600s (`OLLAMA_TIMEOUT_MS`).** Dense pages (gotoburgas ~112 events, ~250s) blew
      the old ceiling and silently fell back to **paid** Gemini — the outcome this provider exists to
      prevent. Plus explicit truncation warnings for both ends of the window (silent loss otherwise).
- [x] **Default `qwen2.5:14b` → `gemma4:12b`** (Apache-2.0 since 03/2026, 7.6 GB, fits VRAM). Bake-off
      of 5 models × 4 real pages (2 DE, 2 BG) through the real `extractFromPage()`, Gemini as the
      reference row. Decider: **linztermine.at** (tier-2, the Linz test's source) lists events with a
      time but no date — inferable only from "Heute ist der 17.07.2026" elsewhere on the page. Gemini
      finds 5; **gemma4 is the only local model that does** — the other four return `[]`, which reads
      as an honest "quiet week". qwen2.5 also **fabricated 3 titles** on Burgas.
- [x] **Deleted 4 models (~33 GB freed)**: qwen2.5:14b (wrong keys, fabricates), gemma3:12b (0 events
      on German + Gemma Terms licence), qwen3:14b (0 on linztermine), qwen3.5:9b (ignores the 25-cap,
      runs to 18k tokens → invalid JSON). Only `gemma4:12b` remains. Ollama upgraded 0.17.1 → 0.32.1
      (gemma4 cannot load on the old build). Box measured: Ryzen 9 7900X / 63 GB / **RTX 4070 Ti
      SUPER 16 GB** — VRAM is the binding constraint, not the 64 GB the runbook reasoned from.
- [x] **The 13-vs-27 gap measured, not left as a caveat.** Counted against the raw page: Gemini emits
      the same title once per occurrence date (our series dedup collapses those), so the honest figure
      is **gemma4 missed 4 real events** on the dense Innsbruck listing (verified in the page text,
      incl. a festival the next day) and found **0 that Gemini didn't**. It is a strict subset —
      **invents nothing** (0 ungrounded across all 4 pages), which is the bar hard rule 5 sets and
      qwen2.5 failed. Parity on 3 of 4 pages (linztermine **5=5**, Русе 6=6, Burgas 107≈110).
- [x] **George's call (2026-07-17): run the nightly crawl LOCAL.** "no users, we dont want to spend
      money… if we drop 2-3 events its not a big deal… when we have users we can switch back to
      gemini." `EXTRACT_PROVIDER=ollama` + `OLLAMA_MODEL=gemma4:12b` are set on the box — live now.
      Blast radius is the LLM route only (structured sources untouched; `extractFromImage` never reads
      EXTRACT_PROVIDER, so poster scan stays on Gemini; Vercel has its own env, prod unaffected).
- [ ] **⚠ TRIPWIRE — flip `EXTRACT_PROVIDER` back to Gemini before the four-weekend Linz coverage test
      runs for real** (i.e. once there are actual subscribers). That test's go/no-go metric IS
      coverage; running it on the cheaper extractor measures our own recall, not Linz's supply, and
      this failure mode is silent by construction. One line in `.env.local`, no code change.
- [ ] Not tested: a page with genuinely **no** events (fabrication only shows where there's nothing to
      find), and gemma4's recall on GEM2GO-class German municipal pages. Worth folding into the next
      bake-off if local extraction ever outlives the prototype phase.

## Thursday desk editorial control (2026-07-17, George: "regenerate individually so we can replace them… reorganize order so I can decide which events come first… more editorial control… post single on fb/insta") — SHIPPED (a6a250e)
- [x] **Replace** one pick for the next-best pool candidate — same strand, keeps the issue full
      (Drop leaves it a pick shorter). Vetoes the old id (droppedIds) so Regenerate can't revive it,
      and a second Replace walks further down the pool. `applyReplace` in lib/digest.js, no AI call.
- [x] **Reorder** ▲/▼ within a strand — the only movement any renderer shows (mail/page/caption
      group by section). Edge picks disable the arrow. `applyReorder`; intro NOT reset (count
      unchanged). Strand boundaries come from the server (`sectionsOf` → snapshot.sections), one
      source of truth shared with the desk's button-enable logic.
- [x] **Post-single already existed** — per-event IG/FB buttons + `renderItemCaption` + per-event
      ledger (itemPostedKey). Told George; no work needed there.
- [x] **Ranking re-checked (half family / half everyone).** Measured the family-first pool across
      ALL 10 channels: the family PREFIX never exceeds POOL_DEPTH=200 (Linz 41, Wien 47, rest <11),
      so the "for everyone" strand is never starved and splitSections' half-half already holds
      (@200 == unbounded on every channel). No ranking change needed — the earlier rebalance was
      correct. Left rankPick untouched.
- [x] `toItem()` extracted in lib/digest.js so a swapped-in pick is byte-identical in shape
      (section/tier/badges/highlight) to a built one. 10 new pure tests; reorder+replace driven
      end-to-end in the browser. NB: verification mutated the real Linz 07-17 snapshot (it's SENT) —
      restored it clean afterward (fresh build, dropped []), so it's back to its posted state.

## Digest rebalance + weekend-page discovery (2026-07-17, George: "almost every event is for kids… also aimed at young people without kids who want to explore art events, maybe half half… 10 best events" · "a way to access the list of events eg this week in linz from our triple-dot menu, changes based on where you are on the map") — SHIPPED (e254758)
- [x] **It was ~100% kids BY CONSTRUCTION**, not by tagging: buildDigest took every family
      event first and only topped up below DIGEST_MIN, and rankPick makes family strictly
      dominant — so any decent weekend was all-family. Now `splitSections()` gives each strand
      about half, richer strand fills the gap. Live: Linz 5/5, Wien 5/5, Graz 3/7, Plovdiv 2/8;
      all 10 channels return 10 picks. Linz "Für alle" = Sommertheater, Grossstadtgeflüster
      (Posthof), Kunstverein open-air — exactly the audience George named.
- [x] **George's call: two labelled sections, not a quiet quota.** The digest was branded
      family-first in ~11 places INCLUDING the AI's own prompt ("Du schreibst den wöchentlichen
      Familien-Newsletter"), so a 50/50 list under that banner = the model writing family framing
      over art events. Both strands labelled; prompt now describes both audiences + receives each
      pick's `section`; subject/lede/caption/H1 drop "Familien" (the heading carries it). Weekend
      page H1 now also matches the real query ("was ist los in linz am wochenende" — never
      family-specific). `sectionsOf()` = one grouping definition for mail/text/caption/page.
      Headings only when BOTH strands exist; frozen pre-sections snapshots render as built.
- [x] **DIGEST_MAX 9 → 10.** The 9 existed only because IG allows 10 slides and slide 0 is the
      cover — a POSTING limit, not editorial. Mail + page carry 10; `carouselOmitted()` names what
      won't fit and the publisher warns rather than quietly posting 9 of 10 (post #10 per-event
      from the desk). NB the IG caption still lists all 10 while the carousel shows 9 — accepted:
      the caption sells the click to the page, which has all 10.
- [x] **🚨 `?lat=&lng=` was READ NOWHERE** (pre-existing, worse than the feature). The newsletter's
      "auf der Karte" CTA, every weekend page's map button and the event-page back link shipped
      yesterday all carry those params — every one silently dropped the reader in **Linz**, from
      the Sofia digest the wrong country. Now honoured at map construction; mapCenter seeded from
      the same value (moveend never fires for a map CONSTRUCTED at its target). Verified live.
- [x] Menu → `/weekend/<city>` for the channel nearest the map centre (`nearestChannel`,
      deliberately NOT `channelForPoint` — that must stay catchment-bounded for SUBSCRIBER
      routing). Verified: Vienna→Wien, Sofia→София, rural Mühlviertel→Linz. `NL_CONSENT_VERSION`
      bumped (nlBlurb now says families AND everyone, because the newsletter does).
- [x] Prod writes made: **wien + graz 07-17 snapshots regenerated** (both unsent; = the desk's own
      Regenerate). **Linz 07-17 is SENT + IG/FB-posted — untouched.**
- [ ] **innsbruck / salzburg / sofia 07-17 still hold OLD 5-item family-framed snapshots** (built
      before this change; `loadOrBuildDigest` returns an existing snapshot unless forced). Harmless
      — all unsent — and next Thursday's build is uniform. Regenerate from the desk if you want
      them consistent this weekend.
- [ ] **Data-quality smells seen while verifying, both pre-existing, neither mine**: (a) Wien's
      three *Bouldern* events (Wienerberg / Hauptbahnhof / Seestadt) all render venue "boulderbar
      Hauptbahnhof" — a `default_venue` overreaching across distinct locations; (b) Wien's
      exhibitions print "Fr 17.7. **00:00**", i.e. a stored midnight rather than a date-only
      "no time published" — the 09:00-placeholder class again, wearing a different hour.
- [ ] **Claude copy failed ONCE with a malformed JSON response** ("Unterminated string at 982") and
      fell back to Gemini — exactly as designed, honestly labelled. NOT my prompt and NOT the 10th
      pick: probed 9 vs 10 events at 2000/4000 max_tokens, all `stop=end_turn` at ~850 output
      tokens, and Graz then succeeded on claude-sonnet-5. Worth considering whether a JSON-parse
      failure should be RETRIED (withRetry treats it as non-transient), since the fallback is a
      real copy-quality downgrade for a one-off blip.

## Physical distribution + festival partnerships (2026-07-16, George: "stickers which we can stick around cities, generic, okolo.events, events around you with a qr code, use our CI, we need a cheap bulk provider, give it to friends to spread around, also think of other ways" · "i contacted a friend at ars electronica… they give us data, we list it and highlight it, in exchange they add us to their marketing materials, and let us use them as a reference… we probably dont need to charge them unless u say this is good practice") — QUEUED, nothing built

### Stickers
- [ ] **Art: generic on purpose = one SKU, reprintable forever.** CI raspberry `#c93a5b` + the
      wordmark SVG (`docs/design/design-system.md` is the source of truth — cite it, don't invent
      tokens), `okolo.events`, the value line in the local language ("Was ist los um dich herum?"),
      QR. Vinyl if it goes outdoors, paper if indoor-only (cheaper — and see the legal item).
- [ ] **The QR target is the real decision, and "generic" costs us attribution.**
      `/weekend/<city>` already exists as the stable per-city link (built for exactly this — bio/QR,
      listed on /admin/pages), but a generic sticker can't know the city. The map geolocates, so
      generic → `okolo.events` works. The loss is knowing what worked. Cheap fix: **one short code
      per friend/batch** — identical art, `okolo.events/l/<code>` → `utm_source=sticker&utm_campaign=<code>`.
      5 codes answers "whose patch converted" for ~nothing. Needs a `/l/<code>` route (doesn't exist).
- [ ] **Cheap bulk provider — QUOTE it, don't guess.** Ask ~1,000 units, 5–7 cm, vinyl outdoor +
      paper indoor: **druck.at** (AT), **Flyeralarm** (AT/DE), Onlineprinters/diedruckerei,
      WIRmachenDRUCK, Helloprint, StickerApp, Sticker Mule (fastest, priciest). No price recorded
      here on purpose — none of them has been checked, and a made-up anchor is worse than none.
- [ ] **⚠️ LEGAL — flyposting is an actual offence, and this is a kids product.** Stickers on public
      infrastructure, lampposts or someone else's property in Austria = "wilde Plakatierung"
      (Verwaltungsübertretung, city-level fine); if it's hard to remove it's Sachbeschädigung
      (§125 StGB). The fine is survivable — "family app fined for graffiti" is not, and it would land
      in exactly the local press we want on our side. **Placement rule: consented surfaces only**
      (the venue said yes) + official Ankündigungssäulen. Friends get the rule *in writing, with the
      stickers*, or the rule doesn't exist.
- [ ] **The distribution list is a query we already own.** `places` holds 1,269 curated family places
      — indoor play, pools, climbing halls, libraries, museums, playgrounds. Filter to Linz + indoor
      + staffed and you have the venues where "can we leave a few stickers?" gets a yes *and* where a
      bored parent is already holding a phone. Beats handing friends a roll and hoping.

### Other ways to spread it (ranked by cost-per-subscriber, cheapest first)
- [ ] **Window cling for partner venues** ("Unsere Events auf Okolo") — consented by construction,
      outlives a sticker, and it doubles as the "claim your event" on-ramp (partnerships §6 ladder).
- [ ] **Table cards / Bierdeckel in family cafés** — same printers, sits exactly where a parent is
      bored. Cheaper per impression than anything stuck to a wall.
- [ ] **Playground QR poster + Kindergarten/Volksschule newsletters** — already growth-system §5.3;
      the only realistic way into the class WhatsApp groups you cannot join cold.
- [ ] **Warm contacts we already crawl**: Kinderfreunde, Familienbund, libraries, Eltern-Kind-Zentren.
      They're registered sources — that makes them introductions, not cold calls.
- [ ] Kinderarzt waiting rooms; Ars-style festival programme booklets (their print run, our line).

### Festival partnerships — the Ars Electronica shape
- [ ] **We just spent a whole session proving why this is worth building.** Pflasterspektakel is the
      same shape as Ars: one festival, many venues, per-act schedule. Scraping it cost a bespoke
      adapter, a date trap (grid rewritten daily, no date on the page), a near-miss where all 35
      stages would have auto-merged, and its own workflow — and the happy path *still* can't be
      verified until 23 July. If the festival hands us the grid, we get it correctly, for free, on
      day one. **The pipeline pitch is not speculative; it's the fix for a cost we've already paid.**
- [ ] **⚠️ Hard rule 7 constrains the ask: they must PUBLISH the data at a re-fetchable URL, not
      email us a file.** A CSV that arrives once by mail is precisely the `works=false` +
      "refresh only with script X" antipattern that rotted Sindelfingen. A published Google Sheet
      (CSV export URL) counts — it has a stable URL. The ask is "put it somewhere we can re-read",
      and the ladder ranks by *their* effort (partnerships §6): feed URL › JSON-LD › sheet › form.
- [ ] **George's question — do we charge? My answer: no cash, but this is not a favour.** Reasons:
      (1) growth-system §8 is explicit — *don't sell before we can quote real reach*; we have 1
      confirmed subscriber, and pitching a paid slot into that burns the advertiser relationship we'd
      want at 4,000. (2) What we actually want from Ars is worth more than any invoice we could send
      today: a named reference, a line in the marketing of an event with a real audience, and the
      template for festival #2. **Charge them the reciprocity instead, and write it down** — data at
      a URL + the marketing placement + permission to name them, against listing + highlight, on one
      page. A written barter is good practice; a free favour is the thing that gets deprioritised
      internally the week it matters. Revisit cash once we can quote reach.
- [ ] **⚠️ Architect flag — the barter may legally BE consideration, and that changes the label.**
      "They add us to their marketing materials" is a benefit in kind flowing to us for the
      placement. Under the conservative read of ECG §6 / MedienG §26, consideration isn't only cash —
      which would make this a **paid placement** ("Anzeige" + payer identity + the ranking-disclosure
      page in `docs/decisions/2026-07-12-paid-placement-compliance.md`), not an editorial showcase.
      **This is live, not hypothetical: `Ars Electronica Festival 2026` is already a GOLD row in prod
      (07-16→09-09).** Two clean ways out, pick one before the deal is real: (a) run it **editorial**
      and take no obligation on their marketing (if they list us, they list us because they want to);
      (b) call it **gold** and ship the two labelling obligations first. What we must not do is take
      the marketing placement *and* carry it as unlabelled editorial. Not a lawyer — but the cheap
      option here is a 10-minute call, not a defence.
- [ ] **Then generalise it: the "map service for decentralized events" product.** Partnerships §6
      already specifies it (ingestion spec + live preview/validator: "paste a URL, see exactly the
      events we'd extract") and names the trigger — *build it the day a real organizer asks*. That
      trigger has **not** fired yet: George reached out to Ars, Ars hasn't said yes. **If they say
      yes, it fires** — and the deliverable is the one-pager + the validator, still not an API.
      New partnership CATEGORY: §3 tracks data *vendors* (feratel, GEM2GO, Linz open data); this is
      distribution barter with an *organizer* and needs its own section before festival #2.

## Pflasterspektakel per-act schedule (2026-07-16, George: "check pflasterspektakel schedule in linz next weekend, can we get specific locations and times for each act and artist") — ADAPTER SHIPPED, capture runs 23–25 July
- [x] **The answer to the question: not yet, and by design.** Festival is **23–25 July** (DO 16–23,
      FR & SA 14–23). The Tagesprogramm reads "Aktuell ist noch kein Tagesprogramm verfügbar" because
      "Die Künstler*innen wählen ihre Auftrittszeiten und -orte während des Festivals **täglich neu**"
      — the grid is written fresh each day and goes up "kurz vor Programmstart". Published NOW: the
      120+ artist lineup (name/country/genre, `?artist=<id>`, 2 ABGESAGT) + the fixed frame
      (Kaleidoskop 17:00/20:00/22:30 im LINZ AG Spektakelzelt, Feuershows 20–23 Hauptplatz+Pfarrplatz).
- [x] **`lib/pflaster-events.js` + `cms='pflaster'`** wired into `tryStructuredExtraction()`. Verified
      against last year's REAL grid (Wayback 2025-07-19): **35 Spielorte / 275 acts / 87 artists**,
      parsed deterministically, $0, no LLM. Shape: `<h2>`area → table, rows = Spielort (Kürzel+name),
      9 hour-columns (14-15h…22-23h), cells = artist + genre + artist link. Source registered
      (works=true) and driven live: `npm run crawl -- --url …` → `route: pflaster (0 candidates)`,
      correct for today (hard rule 7 satisfied). 133 tests green (+9).
- [x] **THE DATE TRAP, and why the nightly cron can never capture this.** The page carries NO date and
      no day switcher — one grid, overwritten daily. Stamping it with "whenever the crawl ran" would
      mislabel a whole day's line-up, and our 04:00 UTC cron fires ~06:00 Vienna, *before* the day's
      grid is up, so it would read yesterday's as today's. The day is now taken from the source's own
      Yoast `article:modified_time`; any grid whose stamp ≠ the Vienna crawl day is REFUSED (tests
      pin stale/prev-day/undateable/no-grid → 0 events). Capture therefore runs from its own
      `.github/workflows/pflasterspektakel.yml` (17–27 July, 14/16/18/21 Vienna, `--url` so it ignores
      tier/cadence and revives the source if zero_streak ever rotted it to dead). Shares the nightly
      crawl's `concurrency: crawl` group (Nominatim is per-IP).
- [x] **`exclusive: true`** — new, narrow waterfall concept: the adapter OWNS the source, so an empty
      result never falls through to the LLM. Without it this source would burn a paid call on all 362
      grid-less days against a page that still describes the festival — i.e. pay to mint a duplicate
      of the Linz-Termine row we already hold. Inert for every other adapter (undefined → falsy).
- [x] **Caught by testing, not reading: all 35 stages would partly auto-merge.** They run the same day
      within ~300m, so `dedup.js`'s `sameLocation()` passes for EVERY pair and the title is the only
      thing keeping them apart — but `titlesMatch()` matches on SUBSTRING, so "Landhaus" (Altstadt)
      == "Landhaus Arkadenhof" (Spektakel-Oasen) whenever start times coincide (they did on the real
      2025 grid), and `titleSubstitution()` does NOT guard it (it only fires on swapped words, never
      added ones). Fix: the festival's own Kürzel goes in the title ("Pflasterspektakel A4: Landhaus")
      — which is also what's printed on its Festivalplan. 0 collisions now, even with every stage
      forced to one start time. Regression test pinned.
- [x] **The 4 duplicate festival rows are merged to 1** (`scripts/merge-pflaster-dups.mjs`, applied to
      prod): survivor **14** (linztermine's real event permalink) enriched with 2766's
      **23.07 16:00 → 25.07 23:00**, corroborated by the festival's own "DO 16 – 23 Uhr, FR & SA
      14 – 23 Uhr"; 2766/3226/32513 → status='removed' (reversible). They were NOT from the new
      adapter — all four were crawled 07-10..15, i.e. **before crawl-time fuzzy dedup shipped
      (e326335, 07-16)**; today's matcher merges all four. They never self-heal: each row keeps
      matching its own content_hash and is updated in place, and the fuzzy path only runs for NEW
      events. content_hash deliberately NOT recomputed (it encodes the event as its source published
      it; re-hashing could only cause a miss + a fresh duplicate).
- [ ] **Two corrections worth carrying** (I got both wrong first time): (a) `UPDATABLE_FIELDS` governs
      only `updateEventFields()` — **upsertEvent's own update branch overwrites `starts_at`,
      `source_url` and most fields unconditionally**, so "it's not in UPDATABLE_FIELDS" is NOT a reason
      an edit survives a crawl. (b) The enrichment on 14 is stable only because **row 14 is an
      orphan**: `source_name='linztermine.at'` matches no registered source (all 24 such rows are from
      the 2026-07-10 mining run), and live source id 1 "Linz-Termine" publishes the title with a
      trailing "Linz" → different hash → that's what produced 2766. **Trade-off accepted: we kept the
      unmaintained row and retired the crawled one**, so a cancellation in the next 8 days would
      update a removed row while published 14 still says it's on. Fine for a 38-year-old festival with
      `cancelled` reports available; revisit if this event must be trusted to change.
- [ ] **George — decisions:** (1) **`is_free` left null**:
      no ticket/entry control, but the site says artists "spielen für das **Hutgeld** des Publikums"
      and the FAQ tells you where to get 2€ coins — so "free" is a claim the source doesn't make.
      Your call whether the Free filter should include it. (3) **`family` not set** — street art is a
      general-audience programme; forcing it would be rule-5 fabrication in the category column
      (`default_categories` deliberately unset). (4) **Editorial highlight** — this is the
      Pflasterspektakel case the highlights feature was built for; set it on /admin/highlights.
- [ ] **Only the empty path is proven.** The happy path (a real grid → 35 upserts → geocode → pins)
      CANNOT be driven until the grid exists on 23 July — there is no live fixture and the festival
      archive keeps artists but never the grid. Watch the first workflow run on the 23rd.
- [ ] Spielort coordinates: OSM-mined into `data/pflaster-spielorte.json`, seeded into the `venues`
      registry so the registry rung short-circuits before Nominatim (the stage names are local
      shorthand — "Brunnen", "Haltestelle", "Bank Austria" — that no geocoder can place). Unresolved
      ones fall back to the Linz centroid at town precision, which is honest; **never** guessed.

## Highlights everywhere + page signups (2026-07-16, George: "gold/editorial should appear in newsletter, event static pages, list view, basically everywhere" · "pages need newsletter subscription at the bottom" · "/event/7 says okolo not okolo.linz, no back button") — SHIPPED (af3c9ba)
- [x] **The highlight was a MAP-ONLY signal.** List view: editorial rendered *nothing*, gold had the
      „Anzeige" tag but no styling. Event pages + newsletter were highlight-blind entirely — and
      `weekendPicks` had no `highlights` join at all, so the digest could not see one.
- [x] **George's call: BADGE ONLY, NO RANK CHANGE in the newsletter.** Payment buys visibility, never
      a slot or a position; `rankPick` untouched. A deliberate DIVERGENCE from mapPins (where
      highlight is the first sort key + cap-exempt), documented at both sites so it can't read as
      drift: the map mustn't let a dense viewport trim a paid pin; the digest is an editorial pick,
      and letting payment reorder it would contradict family-first AND make the P2B Art. 5
      ranking-disclosure page due. Verified live against a control: pick order byte-identical
      before/after highlighting.
- [x] **`highlightJoin(from, to = from)`** — point-in-time generalized to period overlap. The digest
      needs it: built Thursday and FROZEN, "active today" would bake Thursday's answer into a
      Fri–Sun snapshot and silently drop a weekend-only gold. All existing callers unchanged.
- [x] **Treatment ⇔ label is ONE unit** (colour alone is not disclosure, ECG §6 / MedienG §26): gold
      is styled and labelled together or neither. 8 new tests pin it incl. frozen-snapshot + unknown-
      tier degradation. Editorial rings, never labelled, by design. List ring reuses the EXISTING
      `.legend-pin.gold` grammar on `.thumb` (row's other channels are taken: border-left =
      range-match, background = .active).
- [x] **Event page**: city handle + back arrow from `channelForPoint(event coords)` — the event's own
      location, so branding is right however the reader arrived and can't be spoofed; back goes to
      the map centred on that city (a reader from search has no history). **~40% of events fall
      outside every catchment** → bare "okolo.", no signup (verified).
- [x] **Signup on event + weekend pages** (`app/newsletter-signup.js`): the page's channel IS the
      area, so the only field is an email; area stated, never silently prefilled. The weekend page's
      `nlCta` copy had existed UNUSED since it shipped — this is the section it was written for.
      `source` closed enum (newsletter_popup|weekend_page|event_page) so "did the SEO pages convert?"
      is answerable; `notifyOperator` was hardcoding newsletter_popup and misreporting every ping.
- [x] Fixed in passing, both on the surface George flagged: every event tab read **"… · Okolo · Okolo"**
      (page title ended in "· Okolo" AND the root layout appends `template: '%s · Okolo'`) → now
      `absolute` + city-branded; a long Facebook `source_url` overflowed the page.
- [x] **Gold shine was 3× the pin** (George: "much bigger than actual pin… should fit place or event
      pin shape") — SHIPPED (4b9ad33). `map.addImage` defaults `pixelRatio` to **1**; every sprite is
      supersampled at SPRITE_RATIO=3 and registered via `add()`/`put()`, which both pass
      `{pixelRatio: SPRITE_RATIO}` (114px bitmap → 38 CSS px). The glint is the ONLY non-SVG sprite,
      so it bypassed both helpers, was added by hand at 2 sites, and dropped the option → 114 CSS px.
      Now one `addGlintImage()` bundles the ratio with the construction. **The shape was never
      wrong** — it was always clipped to pinSilhouette(place) and picked glint-place/glint-event per
      feature; at 3× a correct silhouette just sprawled past the pin it traced. Build+133 tests green.
- [ ] **George: the shine needs your real-browser eyeball** — MapLibre 'load' never fired in the agent
      pane this session (zero basemap requests, isStyleLoaded false), so sprites never registered and
      I could not look at it. Verified instead from the maplibre source + an addImage probe on the
      live map (pixelRatio 1→3, 114→38 CSS px). Folds into the existing gold-pin browser check above:
      the sweep should now trace the pin's own teardrop (events) / circle (places), same size as the
      ring, every ~5.5s.
- [ ] **George: decide whether EDITORIAL should be able to earn a newsletter slot.** "No rank change"
      was answered about *gold* (paid) and I applied it to editorial too, conservatively. Consequence:
      **your Pflasterspektakel editorial showcase reaches the digest only if it independently makes
      the family top-9** — it did NOT make this weekend's Linz picks. There is no legal barrier to you
      choosing what goes in your own newsletter; this is purely a product call.
- [ ] **Social cards still carry no highlight** — deliberate and currently *honest* (no treatment AND
      no label = the consistent pairing). Adding the ring there means adding the ad label there too.
- [ ] **A REAL gold is live in prod**: `Ars Electronica Festival 2026`, 07-16→09-09. If that is a
      genuine PAID placement rather than a test, the two pre-launch obligations are due NOW, not
      later: payer identity on the detail view + a reachable ranking-disclosure note
      (docs/decisions/2026-07-12-paid-placement-compliance.md).
- [ ] Map DETAIL view still has no editorial treatment (gold's „Anzeige" tag is there). Left alone
      rather than inventing grammar George hasn't seen — the shipped treatments came off an
      approved prototype. Editorial = raspberry = the accent already used throughout that panel.
- [ ] 3 stale `@example.com` test subscribers from earlier sessions (timing-test/nomailtest/hangtest)
      inflate the subscriber count — the one metric being watched. Inert (unconfirmed ⇒ never mailed).
      Say the word and they're gone.

## Named-AI-bot policy enforced in code (2026-07-16, George: Variant B / bytespider-no / honor-Stuttgart) — SHIPPED
- [x] **The policy existed only in our heads.** `ai_bot_policy` was a `blocked_reason` set BY HAND;
      `robotsAllowed()` returns **true** for every site that names ClaudeBot (our UA is never listed),
      so the nightly cron would crawl any such source that got registered. Found while opening Germany:
      falkensee.de + teltow.de ship a **byte-identical 92-line** robots naming ClaudeBot/GPTBot with
      **no `*` group at all** — a shared Brandenburg template that likely repeats across DE.
- [x] **Measured before touching anything**: robots.txt for all **1,656 unique hosts** / 1,731 working
      sources, parsed with our own parseRobots. Variant A (Anthropic-only) 9 sources/206 ev · **B (any
      AI crawler) 11/208** · C (+bytespider) identical to B. Every blocking group is a *dedicated
      1-agent* block — deliberate, not kitchen-sink. Applied: **11 source rows / 9 distinct
      source_names / 138 published events → status='removed'** (BG 69, DE 67, AT 2). Published
      28,651 → 28,513, verified.
- [x] **My own measurement error, caught before it drove the decision**: petalbot (Huawei) + amazonbot
      are SEARCH crawlers, not AI — they had falsely condemned **Linz-Termine (42 ev, tier-2)** and 9
      others. AT's real exposure is 2 sources / 2 events. `AI_BOT_TOKENS` carries a comment forbidding
      their re-addition.
- [x] `aiPolicyAllowed()` in lib/crawl-net.js — a SEPARATE function from robotsAllowed on purpose
      (RFC 9309 really does permit us; folding policy into the spec parser is what caused the 07-14
      Stuttgart false-block). Pure `aiBotGroup()` + shared `robotsGroups()` = one robots fetch per
      origin. Wired at both crawl gates; `ai_bot_policy` joins `robots` in `AUTO_DERIVED_BLOCKS` so it
      **self-clears**; stats untouched (state, not zero_streak). `works` stays true. 12 new tests
      (116 green), all 8 live cases driven against the real hosts.
- [ ] **George: Stuttgart outreach** (`docs/partnerships/README.md` row 8b, reopened). Biggest DE city,
      now 0 events. Needs a contact for Stadt Stuttgart's Online-Redaktion, then send. Irony worth
      knowing: the 07-14 "Stuttgart is blocked" finding was our parser bug AND they separately do
      block AI bots — both true, different blocks.
- [ ] Gaps left deliberately: `fingerprint-sources.mjs` / `enrich-locations.mjs` / `probe-sources.mjs`
      don't ask aiPolicyAllowed yet (manual, parked tools — the cron was the real violation). Any
      future German municipal probe must apply the policy at DISCOVERY time or it will keep proposing
      sources we may not crawl.

## Germany big-city expansion (2026-07-16, George: "berlin munich hamburg koln 40km, cheap sonnet, tell me if costs are high") — DISCOVERY DONE, registration pending
- [x] **Two Sonnet discovery agents (Berlin, Munich), discovery-only.** Catalogs:
      `data/catalog/probed-berlin-40km.json` (16 proposed / 8 rejected, 57% ring hit-rate) and
      `probed-munich-40km.json` (9 proposed / 15 rejected, 31% ring). Cost answer: **LLM crawl is
      ~$0.04/pass ≈ $1.30/month for both cities** — money is NOT the constraint. The constraints are
      Nominatim (1 req/s global per IP; geocache is AT/BG-only so DE is nearly all misses) and the
      180-min Actions cap.
- [x] **Verified, not trusted**: berlin.de really does serve JSON-LD Events ($0 route); rce-event.de
      really does `Disallow: /` its embed path; Freising's own subdomain really is open.
- [ ] **Architect finding — do NOT register Erkner as proposed**: its URL is a *sitemap* (499 `<loc>`,
      zero event data). With cms=null the waterfall falls through to the LLM with a list of URLs =
      guaranteed 0 yield + a paid call every crawl + a fabrication risk. Needs a kalkalpen-style
      two-hop adapter first.
- [ ] **muenchen.de publishes schema.org MICRODATA, not JSON-LD** (verified: 100 `itemtype="…Event"`
      with startDate/name/location, **0** ld+json blocks). We parse Microdata nowhere, so the official
      city calendar would go the PAID route while being perfectly structured. crawl-sota-2026.md flagged
      this gap (WDC: Microdata = 46% of structured-data sites); this is the first live case. A generic
      microdata rung in `tryStructuredExtraction()` is now the highest-value adapter on the board.
- [ ] **iKISS** (4 of 14 Berlin ring towns, `data-ikiss-mfid`) + **RCE-Events** (5 of 13 Munich ring
      towns) = the two candidate "GEM2GO of Germany" clusters. iKISS ships a bidirectional interface to
      **termine-regional.de** (nationwide portal) — vet that before building adapters. RCE caveat: only
      crawlable when a tenant runs its own subdomain; shared-host tenants are robots-blocked.
- [ ] Still to do before Germany is live: add scopes to `lib/crawl-scopes.js` (its comment requires an
      explicit product decision per region — George gave it), register + `--url` verify each source,
      then **hard rule 8**: German cities are currently **unsearchable** — `lib/places.js` has ZERO DE
      entries and `app/api/geocode/route.js` hard-filters Photon to `['AT','BG']` and collapses country
      to `'BG'?'BG':'AT'`. Stuttgart's events have been invisible to search since 07-13. Verified live:
      typing "Berlin" returns `AT | Berling` (a *building*), not Berlin.
- [ ] Hamburg + Köln: not started (George said Berlin/Munich first).

## Source-quality ranking + visual desk (2026-07-15, George: "most trusted sources first… improve the UI") — SHIPPED (5333ae3)
- [x] **`lib/source-quality.js`** (one definition, kid-cats pattern): tier 2 curated official/vetted
      family publishers › tier 1 municipal crawl › tier 0 unvetted. weekendPicks rank tuple now
      family → tier → precise → free → interest → soonest; **reported events excluded in SQL**
      (pre-DISTINCT-ON so a clean series occurrence survives); **community gated** (venue +
      description≥30 + no reports), old community boost removed. Applies to newsletter + weekend
      page + social cards on each channel's NEXT digest build (frozen snapshots unchanged).
      Verified live: Linz top-12 all tier-2/1, correctly ordered. Architect call recorded:
      community = gated-and-included, not excluded (poster-scan is a product feature).
- [x] **Desk Publish section is visual now**: per-event card thumbnails (event-addressed), inline
      image+caption preview (no more alert()), dimmed posted rows, posted-vs-carousel chips +
      Vienna timestamps, source/tier badges, category dots, refresh. All dedup/confirm flows intact.
- [x] Review (SHIP-AFTER-FIXES) caught 2 latent tier bugs (familienbund domain masked by name
      fallback; /linztermine/i vs real "Linz-Termine") — fixed + pinned with tests. 99 tests green.
- [ ] Minor accepted-for-now: community series whose earliest occurrence fails the quality gate drops
      the whole title-group (gate runs post-DISTINCT-ON, unlike reports); desk card thumbnails are
      immutable-cached per weekend URL so a mid-week Regenerate can show a stale thumb until
      hard-refresh; no onError fallback on desk card imgs.

## Admin hub + published-pages desk (2026-07-16, George: "a nice /admin interface where I log in and all this stuff is easily accessible without special subdomains… + a view of all published blog/newsletter based pages so i can review and copy their links") — SHIPPED (9393e49)
- [x] **`/admin` is the one door now.** Hub with cards + live counts; persistent nav (Home · Thursday ·
      Highlights · Pages) + logout on every desk; one password login, 30-day cookie, no subdomains,
      no `?token=`. `lib/admin-ui.js` = the shared shell (S tokens, formatVienna, AdminShell) — the
      login block was duplicated across 2 desks and about to be 4.
- [x] **`/admin/pages`** — every frozen weekend digest snapshot IS the public SEO page
      (`/weekend/<city>/<friday>`), so the list needed nothing new stored. Per row: weekend, pick count,
      subject, **Copy link** + **Open ↗**, and Indexed / Noindex-thin / Sent (Vienna time) / IG / FB
      badges. Per city: the stable `/weekend/<city>` link (bio/QR/pinned message). Live data: 6 pages,
      Linz 2026-07-17 = 9 items, sent, IG+FB posted; the other 5 cities built-but-unsent.
- [x] `app/admin/layout.js` gives ALL admin pages `robots:noindex` — only the Thursday desk had it, so
      /admin/highlights shipped that morning without it (robots.txt covered it; the meta tag didn't).
- [x] `MIN_INDEXABLE_ITEMS` exported from lib/digest.js — the weekend page's real noindex rule and the
      desk's "Indexed" badge now read the SAME constant (a second hardcoded 3 would have drifted into a
      lying badge). `listDigestPages()` = 2 queries not an N+1; exact ledger keys, since `posted:*` also
      holds per-EVENT rows this view must not count.
- [x] **Review fix — the agent's build broke auth gating and its comment asserted the opposite.** Each
      page held state and RETURNED `<AdminShell>`; React runs a parent's effects regardless of what it
      renders, so every desk fetched while logged out (403s — observed in the network log, not assumed)
      and, with `authed` now inside the shell, would never re-fire on login → a freshly-logged-in desk
      would sit empty. Desk bodies are children of the shell now. Verified: logged-out loads of /admin,
      /admin/thursday, /admin/pages fire the login check and NOTHING else.
- [ ] **George: one login check** — I'm not permitted to type a password into a form, so the
      logged-IN render after a *fresh* login is the one path I couldn't drive myself (the logged-out
      path is proven; the authed JSX was verified while a session already existed). Log in once at
      /admin and confirm each desk populates.

## Highlighted/sponsored pins (2026-07-16, George: "highlight or elevate certain locations… sponsor pays or showcase e.g. Pflasterspektakel") — SHIPPED
- [x] **BUILT (George picked B+star for gold, editorial as suggested).** `highlights` table (migration
      applied to prod, 0 rows), lib/db.js `highlightJoin` threaded through mapPins/searchEvents/
      eventsByIds/getEvent + cap exemption (active highlight = first sort key, can't be trimmed by
      PLACE_CAP or LIMIT 800), /api/admin/highlights (GET/POST/clear, isAdmin), /admin/highlights desk
      (search → tier → period → note; active vs scheduled/past lists). Map: `pin-gold-*`/`pin-ed-*`
      outline sprites (ring outside white border, 1.15×/1.1×), `badge-star` layer (community dot yields
      the corner), glint = animated StyleImage that sleeps between ~5.5s sweeps (skipped entirely under
      prefers-reduced-motion), legend row, „Anzeige"/Sponsored/Реклама tag on gold list rows + detail
      (editorial unlabeled by design). Architect review caught: highlighted pins were UNCLICKABLE (click
      handler queried only the `pins` layer, which now filters them out) + glint stale-frame on throttled
      tabs — both fixed. Verified: build green, 79 tests, DB roundtrip on prod (gold flows to mapPins/
      search/getEvent, expired periods ignored, first-row cap exemption), API guards 403/400/422/404,
      desk login + list + clear driven in browser, Sponsored tag on row + detail. Test rows cleaned.
- [ ] **George: real-browser map check** (WebGL doesn't render in the agent pane): gold pin = ring +
      star + shine sweep every ~5.5s; editorial = raspberry ring only; both clickable; selection still
      works on them (selected state shows the normal 1.28× sprite — accepted simplification).
- [ ] **Before the FIRST PAID gold goes live** (compliance doc 2026-07-12): payer identity surfaced on
      the detail view + a reachable ranking-disclosure note. Editorial showcases need neither.
- [ ] Later: custom gold icons (needs a marker-grammar amendment), billing history views, digest
      inclusion (needs its own ad label), self-serve intake.

## Highlight prototyping (2026-07-16, same thread) — superseded by the shipped build above
- [x] Visual prototype (Sonnet agent): 8 comparison panels on simulated basemap with REAL pin sprites/colors
      (artifact https://claude.ai/code/artifact/69c1af62-1405-470c-a349-353902c4bbbf; source in session
      scratchpad highlight-proto.html). Variants: ember/fire glow, gold/silver/bronze pulsing-halo tiers
      (one grammar, three intensities), radar ping (on-brand), custom-icon showcase, density stress test.
      All GL-feasible: static ring = extra sprite; pulses/pings = animated map.addImage (pulsing-dot pattern).
- [x] Implementation plan (Opus agent, in session transcript 2026-07-16): separate `highlights` table
      (tier enum bronze|silver|gold|editorial, Vienna date-only period, note; = future billing ledger),
      query-time active join in mapPins (no cron; event expiry drops highlight for free), cap exemption so
      paid pins never fall past LIMIT 800, /admin/highlights desk cloned from Thursday desk, search via
      existing /api/events?q=.
- [x] **v2 per George (2026-07-16): one grammar, gold-only paid + editorial, NO pulsing background.**
      Treatment = golden outline ring outside the white pin border, pin 1.15×. Artifact updated (same URL)
      with animation options A static / B occasional shine sweep / C ray ticks / D ring blend in-out /
      E star-badge-only, F editorial outline in CI raspberry #c93a5b (static, 1.1×, no badge), G density
      test w/ gold combo (outline+star+shine) + editorial next to a family pin (CI-collision check).
      Recommended: B+star combo for gold; D fallback; drop C. Silver/bronze/ember dropped per George.
- [ ] **George's calls before building:** (1) pick gold animation (A/B/D/E or B+star combo); (2) paid
      gold REQUIRES the „Anzeige" label on list/card (docs/decisions/2026-07-12-paid-placement-compliance.md
      + adDisclosure promise) — pin styling alone is not enough; editorial gets NO label; (3) does paid
      also lift list ORDER (triggers P2B ranking-disclosure page)? (4) family-category editorial picks are
      raspberry-on-raspberry (white border keeps it legible — see artifact panel G).

## Per-event social posting + cross-ledger dedup (2026-07-15, George: "post individual fotos… different days… dont get stuff already posted") — SHIPPED (551047a)
- [x] Each digest event posts on its own (desk row: IG/FB/Preview; "post next unposted"; CLI --item/--next),
      sharing one `publishWithLedger` core with the bulk carousel. Per-event ledger key
      `posted:<ig|fb>:<slug>:<friday>:ev:<id>` — a re-post never re-posts a sent event. "Reroll" = the
      existing Regenerate; per-event keys survive it (posted events stay marked, new ones postable).
- [x] Sonnet adversarial review caught TWO real double-post holes, both fixed: (1) CROSS-LEDGER — bulk
      and per-item ledgers didn't cross-check, so carousel-then-item (or item-then-carousel) silently
      duplicated. Now ALREADY_IN_CAROUSEL / ITEMS_ALREADY_POSTED guards + viaCarousel state + desk
      confirms both directions + bulk-aware "next"; force is the only override, always behind confirm.
      (2) SNAPSHOT DRIFT — item cards were slide-indexed, so a mid-post Regenerate could pair caption A
      with image B. Cards now addressed by `event=<id>` (card route resolves→slide, 404 if gone).
      80 tests green, build green, event= addressing verified valid→200 / gone→404 / carousel slide→200.
- [ ] Still needs Vercel META env vars to post from the DEPLOYED desk; CLI works now with the local token.

## Meta Graph publishing pipeline (2026-07-15, George: "build the meta api pipeline… ready until the part I need to do") — SHIPPED (b589d14)
- [x] **Everything except credentials is built**: `lib/social-publish.js` (IG carousel + FB Page post,
      one module = the only place posts leave the building), `/api/admin/social` (dry-run first,
      honest 503 naming missing env vars, atomic in-flight claim + success-only ledger),
      desk Publish section on /admin/thursday (Post/Preview per target), `npm run social` CLI
      (dry-run default when unconfigured — verified live against the frozen Linz snapshot),
      17 tests. Sonnet implement → Sonnet adversarial review (DO-NOT-SHIP verdict) → all
      Critical/Major fixed: kill-mid-publish duplicate risk (UNKNOWN_OUTCOME claim), concurrent
      publish race (metaClaim), Preview blocked by credential/ledger checks, swallowed page-token
      errors, snapshot-drift warning, 2200-char caption guard.
- [x] **George: Meta setup — runbook: docs/ops/meta-api-setup.md.** Done for Linz AND Vienna
      (2026-07-17): system user `okolo-publisher`, token expiry Never, all five scopes granted.
      Ids verified live and now live in `lib/city-channels.js`, NOT env — one Page+IG pair per city
      (linz 1153097914561205/@okolo.linz, wien 1171182632750527/@okolo.vienna). Only
      META_ACCESS_TOKEN is env. `IG_USER_ID`/`FB_PAGE_ID` are dead — inert, but worth deleting from
      Vercel + .env.local so nobody sets them expecting an effect.
- [x] Vienna first post — LIVE (2026-07-17, confirmed by George). Two-city posting is proven
      end-to-end: per-channel ids route correctly, cards render, Meta accepts. Linz + Vienna are the
      working pattern for every city after them.
- [ ] Per-city Meta accounts for the remaining 8 channels — all sit at `fbPageId/igUserId: null` and
      REFUSE to publish (by design, no fallback). Each new city = create Page + IG professional
      account, link them, assign both assets to the `okolo-publisher` system user, then paste the
      Graph-verified ids onto its row.
- [ ] Posting to own Page/IG via API is ban-safe; GROUP seeding stays manual forever (Groups API is
      dead) — the growth-system plan's "no auto-posting" warning applies to groups, not this.

## Crawl freeze fix + sparse-map pins (2026-07-15, George: "fix the crawl infra debt … and the map threshold switch") — SHIPPED (4ea3f14, 12cab82)
- [x] **The zero-yield freeze had TWO of our own bugs on top of the ordering starvation (49a8ee9):**
      (1) extraction failure recorded as `noContent` → events_last=0 + zero_streak+1, so a provider
      blip read as "source is empty" and rotted sources toward dead (4 were unjustly tier=dead);
      (2) a zero-candidate LLM round stamped the NEW page_hash → every later crawl hash-skipped the
      source as "unchanged" — measured: 371 frozen works=true sources, **333 wedged with a stamped
      hash**, 329 on the llm route. Fixed: provider errors leave stats+last_crawled untouched (stay
      due, retry next run); page_hash stamped only when the LLM produced candidates; withRetry on the
      crawl's Gemini/Claude calls; crawl.yml passes ANTHROPIC_API_KEY (CI had NO fallback before).
- [x] **`--recover-zeros` recovery mode** (crawl.mjs + getZeroYieldSources): force-recrawls the frozen
      set, tier=dead included (success resets zero_streak → tier revives). Run 2026-07-15 FINAL:
      **2,153 events recovered from 100 of 371 sources, 0 provider errors** (paid key held at full
      volume). Zero-yield sources 371 → 271 — and the remaining 271 are honest zeros that re-extract
      every due cadence instead of being hash-wedged. Published events now 29,846.
- [ ] **George: GitHub Actions secrets** (repo Settings → Secrets → Actions): add `ANTHROPIC_API_KEY`
      (crawl.yml now reads it) and confirm the `GEMINI_API_KEY` secret there is the PAID key — Vercel
      envs don't reach Actions.
- [x] **Map: sparse viewports show pins, not black count bubbles** (George's call: "<20 events and
      still big black circles?"). Below ZOOM_TIER, if the viewport total ≤50 the API returns rows
      instead of grid cells; client unchanged — isolated events render as category dots, supercluster
      bubbles only where ≥2 points overlap within 48px. Dense views stay cells (25k → 37 bubbles).
      Browser-verified both ways. Bonus: sparse country-zoom sidebar now lists real events instead of
      "N results, zoom in". SPARSE_PINS_MAX=50 in app/api/events/route.js.
- [x] Dev-env note: `.claude/launch.json` now pins the dev server to `/opt/homebrew/bin/node`
      (shell default node is v16, Next needs ≥20).

## Newsletter/social review + local language + city-handle branding (2026-07-15, George) — SHIPPED (c26704f)
- [x] **Reviewed the whole growth surface** (signup → confirm → digest build → newsletter render →
      send ledger → social cards → weekend page): structurally solid. Language was already channel-
      local by construction (each digest is written+rendered in its channel's lang: Linz de, Sofia bg),
      confirm mail follows the signup UI language (which follows IP country on first visit).
- [x] **Language hole closed**: a signup with no/invalid `lang` fell back to ENGLISH regardless of
      place. Now: UI language wins; else the language of the CHOSEN AREA (channel registry →
      lng-20 meridian: BG east, AT/DE west). Sofia→bg, Linz/Stuttgart→de, verified matrix.
- [x] **City handle is the brand on all three surfaces**: newsletter header, both social-card slides,
      weekend page now show okolo.linz / okolo.sofia (from channel.handle) instead of bare "okolo".
      Verified from the frozen 2026-07-17 snapshots (Linz de + Sofia Cyrillic covers, slide, page).
- [x] Review find: on Resend-only prod without NOTIFY_TO, `notifyOperator` silently dropped every
      signup/submission ping (to=undefined). Now warns loudly in logs.
- [ ] **George: set `NOTIFY_TO` on Vercel** (e.g. your gmail) — without it you get NO new-subscriber /
      new-submission pings and the desk's "send test to me" has no recipient. Then redeploy.
- [ ] Per-SUBSCRIBER newsletter language (a bg-lang subscriber in Linz gets the German Linz digest) =
      deliberately not built: needs per-language digest copy per city; channel language IS the local
      language George asked for. Revisit only if BG-in-Austria subscribers actually show up.

## Big-city coverage (2026-07-15, George: "100% of big cities matters, countryside fine for now")
- [x] **Innsbruck (worst-covered big city) fixed.** Its 5 city sources were registered works=true but
      4 yielded 0 — looked covered, contributed nothing (the 878 "Innsbruck" events were all Tirol
      surroundings). Root cause was NOT the sources: `innsbrucktermine.at` (+/familie/kinder) is plain
      server-rendered HTML, robots-allowed, extracts cleanly (proved in isolation: 16 + 9 events). It
      was **stuck at events_last=0** from a past failed-crawl window; a `--url --force` re-crawl brought
      it straight back. Innsbruck 878→941 ev, family 26→38. Stadtbibliothek Ibk = 1 (genuinely thin).
      `Innsbruck.info` → **works=false**: feratel Deskline widget + Cloudflare bot-block, PARTNERSHIP-ONLY.
- [x] Same "stuck at 0" pattern recovered on marquee family sources: **WIENXTRA 16**, Familienzentrum
      Dornbirn 14, Haydnhaus 13, Schloss Esterházy Kinderprogramm 6.
- [x] **SYSTEMIC, FIXED (49a8ee9): the crawl due-set was `ORDER BY id` → partial runs starved the same
      high-id tail every night.** 519 sources un-fetched since 07-12 (3 days, past 2-day active cadence);
      257 at crawl_count=1 (first crawl 0, never retried); every id >2158 (newest sources) never reached.
      Whatever stops a run early (Actions cancel/restart, 180-min timeout, crash), fixed id-order always
      cut off the same tail — and the 07-12 backfill put ~800 slow first-time-LLM sources at the end of
      that order. Fix: `ORDER BY last_crawled ASC NULLS FIRST, id` (most-overdue first; partial runs now
      degrade gracefully). The 519 self-heal next cron run. **NOT the Gemini cap I first claimed — George
      pays for the key; I asserted a cause without measuring (lesson recorded).**
- [ ] **Optional: paced manual recovery** of the ~500 still-stuck sources (mostly countryside, George
      deprioritized) — or just let the next cron run self-heal them (they're now first in line).
- [x] **Rot detector SHIPPED (e326335)**: scripts/rot-report.mjs (stale >2× cadence / zero_streak≥3 /
      blocked_reason / honest-zero per tier; 269 flagged on first run) + a `⚠ SYSTEMIC` guard in the
      crawl summary when >50% of attempted sources yield 0. Plus `blocked_reason` column (migration
      applied to prod): robots skips are states now, never zero_streak fuel.
- [ ] Corollary: "0/N upserted (route: llm)" on Kids&Co St.Pölten + Vorarlberger Familienverband =
      extraction fine, all events dropped at geocode (no resolvable location). Correct by hard-rule-5
      but they yield 0 usable — needs a town/location the geocoder accepts.
- [ ] **Big-city PLACES are Linz-biased** (Graz/Salzburg/Innsbruck ~20 each vs Linz 104) — a per-city
      Overpass family-place mining run fixes it cheaply. Countryside deferred per George.

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
- [x] **Crawl-time fuzzy dedup SHIPPED (e326335)**: findDuplicate wired into both crawl paths as a
      fallback behind content_hash (bounded same-day+town query, enrich-only merge, first-seen
      attribution kept) + a crawl-only `titleSubstitution` guard — templated titles that swap one
      content word ("Josefstadt spielt" ↔ "Meidling spielt") bail instead of auto-deleting a real event.
- [ ] **Regeocode repair run**: `node --env-file=.env.local scripts/regeocode.mjs` (dry-run) once
      Nominatim rate-limit has cooled (first dry-run was pre-fix and had bad long-distance matches —
      discard it); sanity-check no multi-km cross-region jumps, then `--write`.
- [x] Geocode wart FIXED (e326335): transient 429/5xx no longer cached as negative hits — poiQuery's
      town sub-lookup (was poisoning the outer poi key) + reverseGeocode (had no 429 guard at all).
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
- [x] **Newsletter signup: two real bugs behind "spins forever / never get the mail"** (771694b).
      (1) The client geocoded the town before POSTing with an UNBOUNDED fetch to Nominatim (~1 req/s,
      can stall) → the button spun with no exit. Now resolves from `lib/places.js` first (every covered
      city, coords, zero network — verified "Linz" = 0 geocode calls, ~1s), and the off-list-village
      fallback is AbortController-bounded to 6s. (2) With no mail provider, `sendSubscriberConfirm`
      returned false but the route still answered `pending:true`, so the UI said "check your inbox" for
      a mail that never sent — a person left waiting, unconfirmable forever. Now the route 503s honestly
      (`mailDown`, de/en/bg). Mail is provider-routed in `lib/mail.js` (Resend → SMTP → none); the
      digest-send guard is `mailConfigured()`, not SMTP-only. Resend since verified LIVE on prod by the
      concurrent session (a211302, 8346a6c) — full signup→confirm loop working.
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
- [x] **Newsletter consent gaps (b)(d)(e) CLOSED** (f042187, migration applied to prod): proof-of-
      consent recorded at signup (consent_at + NL_CONSENT_VERSION in lib/i18n.js — bump when wording
      changes — + the rate limiter's IP hash; datenschutz updated de/en/bg); confirm links expire
      7 days after issue (CONFIRM_TTL_DAYS in lib/db.js — activation needs a fresh token, re-signup
      rotates it; unsubscribe tokens never expire, RFC 8058); confirm landing page now links
      unsubscribe + says preferences change by re-signing up with the same address. Lifecycle
      verified against prod DB + pages driven in browser.
- [ ] **Newsletter consent gap (a) — George**: decide grandfather-vs-drop for the pre-migration
      subscriber (confirmed_at=NULL, so it currently receives nothing; its token_issued_at was
      backfilled to created_at, so its original confirm link dies 7 days after signup).
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
