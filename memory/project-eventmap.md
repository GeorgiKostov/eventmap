# Project memory — eventmap (Umkreis)

Session continuity. Update "Where things stand" surgically after meaningful changes.

## One-liner
Location-based event discovery map for the Linz region, Austria — families-first; real events mined
from official municipal sources + AI poster scanning, Google-Maps-style UI. Validation prototype.

## Who
George Kostov (Austria, EU). Solo founder building toward a four-weekend Linz validation test.

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
  real fix, see todo). ~31 vetted sources works=true
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
