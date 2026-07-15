# Project memory — eventmap (Okolo)

Session continuity. Update "Where things stand" surgically after meaningful changes.

## One-liner
Location-based event discovery map for the Linz region, Austria — families-first; real events mined
from official municipal sources + AI poster scanning, Google-Maps-style UI. Validation prototype.

## Who
George Kostov (Austria, EU). Solo founder building toward a four-weekend Linz validation test.

## DEPLOY POLICY (do not forget — also in CLAUDE.md §Deploying)
- **Pushing to main does NOT deploy.** vercel.json sets `git.deploymentEnabled=false`
  (b73a855, "manual deployments only") — a deliberate guard against concurrent sessions
  shipping half-finished states, and builds cost money.
- **George deploys by default** (his rule, 2026-07-14): finish work → commit/push → tell him it's
  ready. Only run `vercel deploy --prod --yes` yourself when a live-prod test is genuinely needed;
  announce it and verify the live API after.

## Where things stand (2026-07-15 — newsletter consent gaps closed; newsletter is launch-ready code-side)
- **Consent gaps (b)(d)(e) closed** (f042187, migration `scripts/migrate-consent.mjs` applied to prod):
  signup stores proof of consent (consent_at + consent_version stamped server-side from
  `NL_CONSENT_VERSION` in lib/i18n.js + the rate limiter's salted IP hash); confirm links expire
  7 days after `token_issued_at` (activation only — unsubscribe tokens never expire, RFC 8058);
  confirm landing page links unsubscribe + explains preferences = re-sign up with same address
  (addSubscriber updates a confirmed row in place, no re-confirm mail). Datenschutz updated de/en/bg.
  Verified: full lifecycle against prod DB + confirm/unsubscribe/invalid pages in the browser.
- **What remains for the newsletter is entirely George's side**: Resend domain verify + Vercel envs
  (RESEND_API_KEY, MAIL_FROM, ADMIN_PASSWORD, ADMIN_TOKEN, ANTHROPIC_API_KEY also as GH Actions
  secret) + deploy; gap (a) grandfather-vs-drop the one pre-migration subscriber; the digest's
  community +2 ranking-bonus call; and audience seeding (growth-system.md §5) — still the bottleneck.

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
