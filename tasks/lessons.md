# Lessons

Mistakes made and reusable lessons from George's feedback. Append-only; newest at top.

## 2026-07-14 — A confidently wrong pin is worse than an honest approximate one; and a registry seeded under a broken rule outlives it

Chasing the biggest unresolved venues, "Bühne 1/2/3" (175+ events) turned out to be *stages inside
Dschungel Wien*, a children's theatre in the MuseumsQuartier — the venue was never in the event
text at all, it was the **publisher's identity** (→ `sources.default_venue`, same shape as
`default_categories`). But fixing that exposed two deeper bugs:

**(1) Only one of geocodeEvent's precise rungs was bounded.** `poiQuery` has required a hit to be
within 15km of the expected town since the generic-names lesson (2026-07-11) — but the plain
`address` and `venue+town` rungs never did. So a generic string could match a same-named place
anywhere in the country and be stored at full **venue precision**: "Bühne 3" landed 24km outside
Vienna. **A precisely-wrong pin is strictly worse than a town centroid** — the approx ring is the
signal that tells a user to check the source, and a confident pin removes it. Every precise rung
is now bounded (`TOWN_BOUND_KM`).

**(2) The venues registry had been SEEDED from data produced under that broken rule.**
`migrate-venues.mjs` seeded it from events already at venue precision — including the misplaced
ones. The registry rung returns *before* any bound check (that is the entire point of a registry),
so each poisoned row was served forever and survived every recrawl. 254 rows were beyond the
bound, up to **446km** off (Brand / Egg / Kematen — Austrian town names that repeat).
**Lessons:** (a) when you introduce a cache/registry, ask what rule produced the data you are
seeding it with, and re-validate the seed against the CURRENT rules — this is the negative-geocache
lesson (2026-07-11) in a new costume, and it will keep coming back; (b) a lookup layer that
short-circuits validation must be *provably* clean, because nothing downstream will ever check it
again; (c) delete, don't "correct", a row whose fields contradict each other by 400km — when venue
and town disagree that badly you cannot know which is wrong, so let the pipeline re-derive it.

## 2026-07-14 — Build the surface that shows you your data, and it will show you your data

The first run of the new weekly digest picked, as the **#1 family event for Linz this weekend**, a row
titled "Test event" (description: "Testing events") — George's own add-flow test from 2026-07-12, still
`status='published'` on the live map, dated this Friday. Nobody noticed for two days, because nothing
ever *ranked* the map's contents before: a junk row is invisible among 22k events, and instantly
obvious when something has to choose the best five. The same run surfaced a second latent bug (a crawled
title with an undecoded `&#8211;` and the next element's text bled onto the end, which also defeats
content_hash dedup and duplicates the event).

Also caught, in my own code, by driving it rather than reading it: the send button reported success when
SMTP wasn't configured (`sendNewsletter()` no-ops and returns false; the route incremented `sent`
regardless) — it would have told George "sent to N subscribers" while nothing left the building, *and*
written the "already sent this weekend" ledger, which would then have silently skipped the real send.

**Lessons:** (1) an aggregate view hides junk; a **ranked** view exposes it — building the thing that
must pick the best N is one of the cheapest data-quality audits available, so read its first output as a
bug report, not as content; (2) a no-op-when-unconfigured helper (`return false` if no SMTP/API key) is
a trap for every caller that assumes it threw or worked — check the return value, and make the
user-facing path **fail loudly** rather than report a success it can't back up (reporting outcomes
faithfully matters most exactly where the outcome is invisible — an email you can't see not-arriving);
(3) never write an idempotence ledger before confirming the action actually happened, or the failure
locks out the retry.

## 2026-07-14 — The one filter our users care about was hiding what they came for

George: "a lot of events and locations which would fit for kids are not tagged as kids" — and
proposed dropping the "For kids" filter to stop frustrating people. Measuring first turned a
tagging question into a **bug**: the kids predicate was `age_min IS NOT NULL OR 'family' =
ANY(categories)`, written before the `place` kind existed. Places carry `playground`/`pool`/`zoo`
— never `family`, never an age range — so switching on "For kids" **deleted 1,268 of 1,269
places, including every playground**. On a families-first product, the single filter a parent
reaches for was removing exactly what they came for. (Also learned: a children's museum's 144
events extracted as `culture`, because the extractor reads the EVENT's words, not the publisher's
identity → `sources.default_categories`.)
**Lessons:** (1) when a user reports a *tagging* smell, measure before agreeing to the *taxonomy*
fix they propose — the cause was a stale predicate, and removing the filter would have destroyed
the product's core lens while leaving the real bug in place; (2) this is the sentinel-value lesson
again in a new costume — a new data class (`kind='place'`) landed and nobody re-checked the
consumers reading `categories`/`age_min`; **grep every consumer of a field when you add a class
that populates it differently**; (3) one predicate implemented twice (server SQL + client list)
WILL drift — when it does, the server ships rows the client hides, which reads as data loss.
Extract it (`lib/kid-cats.js`) rather than keeping them in sync by discipline.

## 2026-07-14 — A marker-bounded block-slice refactor swallowed a function; green checks proved nothing

Extracting the politeness layer from crawl.mjs into lib/crawl-net.js, I removed "everything from
the UA comment to the extraction-section comment" with a Python string slice — and `htmlToText`
lived between those markers. Result: every generic-shell crawl silently extracted ZERO events
(the ReferenceError was swallowed by the per-source try/catch and logged as an ordinary source
skip). `node --check` passed (undefined identifiers are runtime errors), `npm run build` was
irrelevant (scripts aren't bundled), and my own post-refactor verifications happened to exercise
only the two paths that bypass the shell (Stuttgart ran pre-refactor; Naturfreunde is
special-cased). A later agent reading the file cold found it before the first cron ran with it.
**Lessons:** (1) when slicing code out by textual landmarks, diff what you REMOVED against what
you meant to move — a marker-bounded cut takes everything in between, not just what you were
thinking about; (2) after refactoring a shared layer, re-run the *most common* consumer path
(one plain GEM2GO crawl here), not whichever path is conveniently already running; (3) a
per-item try/catch that logs-and-continues converts a total outage into N identical "skip" lines
— when every item in a batch fails with the same message, treat it as one systemic failure, not
N item failures (worth a failure-rate assert in crawl summaries); (4) fresh eyes reading a file
beat the author re-checking their own cut — the reviewing agent caught in minutes what three
green checks missed.

## 2026-07-14 — Your own politeness layer can manufacture a block; verify "blocked" against the raw file

Stuttgart (the biggest DE-scope city) sat at 0 events for days with `notes="skipped: disallowed
by robots.txt"` — and stuttgart.de never blocked us. `parseRobots` didn't recognize `Allow:`
lines, so Cloudflare's now-ubiquitous managed robots layout (`User-agent: * / Allow: /` followed
immediately by `User-agent: GPTBot / Disallow: /` etc.) left the `*` group looking rule-less; the
consecutive-UA grouping heuristic then merged the first named AI bot INTO the `*` group, which
absorbed its `Disallow: /` — our parser concluded the whole site was closed to everyone. The skip
even fed `zero_streak`, i.e. "we may not crawl this" was being counted as "nothing is here" and
marching toward auto-`dead`. **Lessons:** (1) a "blocked/disallowed" verdict produced by your own
compliance code deserves the same skepticism as any other failure — before accepting it (or
emailing a webmaster for permission), replay the parser against the raw robots.txt and read the
file yourself; (2) when hand-rolling a spec subset, unrecognized-but-rule-bearing directives are
the trap: any directive you don't parse must still terminate grouping windows, or its group
swallows its neighbors; (3) skip-reasons must be states, not failure streaks — a robots skip
should never increment the same counter as an empty calendar (→ `blocked_reason` concept,
docs/design/big-city-quality.md §2). Same-day corollary: an inherited analysis (the "796 sources
were never registered" claim) was stale — its headline was false against the live DB while its
sub-findings were real. Verify inherited/pasted findings against the live system before building
plans on them; stale `_meta` notes in catalog files outlive the actions that resolved them.

## 2026-07-13 — `map.isStyleLoaded()` + `once('load')` is a dead-end gate for late layer installs

The GL pins shipped and George saw an EMPTY map past cluster zoom: the pin layers were never
installed. The install effect used `if (map.isStyleLoaded()) install(); else map.once('load',
install)`. Both branches fail for anything that runs *after* map 'load': `isStyleLoaded()` returns
false whenever style work is pending — chiefly sources still loading tiles / pending source
updates, which is the normal state right after 'load' — and `'load'` fires **once per map
lifetime**, so a `once('load')` registered after the real 'load' never fires. Result: install
silently never ran. Clusters "worked" only by luck of ordering (their effect ran pre-load).
**Lesson:** gate layer installs on a `mapLoaded` flag set in the 'load' handler (or a dependency
that can only be true post-load, like spritesReady) and then call install directly —
`addSource`/`addLayer` are safe any time after 'load'. Never use `isStyleLoaded()` as an install
gate. (Whether the in-app agent browser fires MapLibre 'load' varies by session/environment — one
review run drove the map fine, earlier runs never got 'load'. So treat agent-side map QA as
best-effort, and post-'load' lifecycle paths as needing real-browser confirmation when it fails.)

## 2026-07-13 — Concurrent sessions + `git add -A` entangle commits; and GL zoom expressions must be top-level

Two from the GL-pins rewrite. (1) A second Claude session working the same repo ran `git add -A`
commits that **swept another agent's in-progress `page.js`/`i18n.js` edits into its own commits**,
briefly leaving HEAD non-building (committed code imported an export that only existed in the
other agent's uncommitted file). **Lesson:** when two sessions share a repo, `git add -A` is a
foot-gun — stage explicit paths only; and an agent whose files got swept should commit its
remaining files to restore a green HEAD rather than rewrite the tree under the other session.
(2) The style-spec validator rejected `['*', ['case', feature-state…], zoom-interpolate]`:
**a `zoom` expression may only be input to a top-level `step`/`interpolate`**. To combine
feature-state with a zoom ramp, invert it — top-level interpolate whose *output* is the
feature-state `case`. This never fails at build time; validate GL expressions with
`@maplibre/maplibre-gl-style-spec` (runtime `error` events are the only other signal).

## 2026-07-13 — Never CSS-`transition: transform` a MapLibre custom marker element

Pins lagged/drifted/mis-placed while panning or zooming (a regression). Root cause:
MapLibre writes the marker's positioning transform **inline, every frame, onto the
exact element you pass** to `new Marker({element})` (`this._element.style.transform =
translate(...)`; its own `.maplibregl-marker` CSS is deliberately `transition: opacity`,
never transform). Our `.pin2` rule had `transition: transform 0.12s` (for a hover/scale
that never even applied — the inline transform overrides a stylesheet `transform:scale`).
`.pin2` and `.maplibregl-marker` are the **same element with equal specificity**, so
which `transition` wins is pure **load-order** — and Next.js chunk ordering (globals.css
imported in layout.js vs maplibre-gl.css in page.js) flipped between builds, so ours
started winning and animating MapLibre's per-frame reposition → visible drift. **Lesson:**
a custom map-marker element must never CSS-transition `transform` (or `all`); MapLibre owns
that property. Put any hover/select scale on an *inner* wrapper, not the positioned root.
Beware equal-specificity class collisions between your CSS and a vendor's on the same node —
the winner is load-order-dependent and silently fragile across builds. (The WebGL map still
can't be driven in the in-app preview browser; this was diagnosed from the MapLibre source +
a synthetic two-class element's computed `transitionProperty`, then verified in a real browser.)

## 2026-07-12 — SSRF IP-pinning: node's `lookup` callback has two call forms; and `undici` isn't importable

Hardening extract-url against DNS-rebinding, I pinned the connection IP via the
node http/https `lookup` option. Two traps, both caught by actually driving the
route (not just building): (1) `import { Agent } from 'undici'` fails to bundle —
undici backs global fetch but isn't an importable module without adding the dep;
use node `http`/`https` built-ins instead, which accept `lookup` and keep Host/SNI
correct. (2) node calls `lookup(host, opts, cb)` as **either** `cb(null, address,
family)` **or**, when `opts.all` is set (https/tls does), `cb(null, [{address,
family}])`. A callback that only handles the scalar form throws "Invalid IP
address: undefined" and every fetch fails — the error paths (bad URL, blocked)
still passed, so a build-only check would have shipped a totally broken happy
path. **Lesson:** support both `lookup` callback shapes, and for any route that
makes outbound requests, smoke-test a real success, not just the guard/error branches.

## 2026-07-12 — Don't recompute a map layer's data on every gesture frame

Fixing the cluster↔pin zoom handoff, the first cut synced the viewport (and so
recomputed the padded marker-bounds / marker SET) on every `move` frame. That
churned DOM markers continuously while panning — pins appeared to drift and
blink in/out. **Lesson:** MapLibre already repositions `Marker` DOM elements
smoothly on its own every render; a gesture-frame handler must not rebuild the
marker set. Update only cheap flags mid-gesture (a ref-guarded visibility bool),
and recompute the set/bounds only on `moveend` (settle) or the single frame a
layer first turns on. Drive per-frame *visual* transitions (cluster fade) with
zoom-interpolated paint expressions, which MapLibre evaluates each frame for
free — not with React state. Verify map behavior needs WebGL; the in-app preview
browser can't render MapLibre (style fetches 200 but `isStyleLoaded()` never
flips), so map QA must happen in a real browser.

## 2026-07-12 — One crawl process at a time: Nominatim throttles per-IP, not per-host

Ran 3 crawl processes concurrently (parallel big-city + gap-fill agents). Per-host politeness
(≥1s/host, built into `politeFetch`) is enforced *within* a process, but Nominatim's rate limit is
**global per public IP** — three processes sharing one IP collectively blew past 1 req/s and got
throttled, silently dropping geocodes (→ the silent-zero failure mode again, this time for whole
cities like Innsbruck). **Lesson:** never run more than one `npm run crawl` at once from a single
machine/IP. Parallelize *discovery/registration* across agents (writes to `sources`, no shared
external limit), but funnel *crawling* through a single sequential process — or a global cross-process
geocode rate limiter if concurrency is ever truly needed. Registration and crawling are separable:
agents register their sources, then ONE consolidating `npm run crawl` (cadence-gated → only the
never-crawled/due ones run) finishes the job without contention.

## 2026-07-12 — Big cities ≠ Gemeinde: statutory cities need the Vienna treatment, not the prober

The municipal prober (catalog × URL patterns × GEM2GO/RiS fingerprints) covers the ~2,000 small
Gemeinden but returns ~nothing for the 15 Statutarstädte + big cities (Graz, Salzburg, Innsbruck,
Klagenfurt, Villach, St. Pölten, Dornbirn…): they run bespoke event portals, not the municipal CMS.
Result after the national crawl: Graz/Innsbruck/Klagenfurt/Villach etc. sat at **0 events** while
looking "covered" by region totals. **Lesson:** population centers are a *separate* source-discovery
track — per city, hand-find the official calendar + tourism board + top family publishers (WIENXTRA
pattern), verify live, register, crawl. Never assume region-level event totals mean the cities inside
are covered — assert per-CITY counts for the population centers specifically.

## 2026-07-12 — A relative overlay must stay inside its positioning container

The mobile quick-preview was deliberately `position: relative` inside `.m-topbar`, directly below
the search pill. A later feature merge moved it to the map root without restoring absolute anchors,
so it rendered from the screen origin and overlapped the search UI. **Lesson:** when relocating an
overlay in JSX, audit its containing block and positioning contract together; preserve intentional
UI work from the branch base unless the new feature explicitly replaces it.

## 2026-07-12 — One control, one meaning; async actions need instant feedback

George flagged the v4 search pill: it displayed the current locality (`📍 Linz`) as its resting
label, so "where you are" masqueraded as "what you searched" — confusing. And locate-me waited up
to 8s for a fresh GPS fix before doing anything visible, with no in-flight indicator and one
generic error toast. **Lesson:** (1) don't overload a control with a second meaning to save space —
search shows search, location shows location; (2) any button that triggers an async fetch must
respond within ~100ms (fly to last-known / show a pulse) and fail loudly with a cause-specific
message (denied vs unavailable), not a generic one after a long silent wait.

## 2026-07-11 — Sentinel values are not data; re-audit consumers when a new data class arrives

Two same-day instances of one class: (1) venue grouping by "coords within 30m" merged 50 unrelated
events because town-centroid *fallback* coords are identical, not near; (2) "null opening_hours =
always open" was fine for hand-added parks but labeled 54 newly mined museums/pools "Immer geöffnet".
**Lesson:** fallback/sentinel encodings (centroid coords, null-as-default, generic venue names like
"Online") silently break when a new data source class lands. When adding a data class, grep every
consumer of the fields it populates and ask "does this code assume precision/meaning the new data
doesn't have?" Related: generic institutional names (Gemeindeamt, Pfarrzentrum…) match across all of
Austria — never accept a POI geocode without a distance bound to the expected town.

## 2026-07-11 — Negative caches outlive the rule that produced them

Geocode sanity bounds were widened (Linz box → OÖ → Austria), but the geocache had stored `hit=false`
rows for towns rejected under the OLD bounds — so Bad Ischl extracted 25 events and published 0,
silently, while everything looked green. **Lesson:** whenever a validation rule feeding a cache
changes (bounds, filters, schemas), purge the cache's *negative* entries in the same change — misses
are cheap to recompute and poisonous to keep. A warning comment now sits on `inRegion()` itself.
Related repeat-offender: `npm run crawl` without `--env-file=.env.local` still fails at runtime
(lesson from 2026-07-10 — it bit again; always launch scripts with the env file).

## 2026-07-10 — Supabase connection strings: pooler host, URL-encoded password, `.env.local`

Wiring the app to Supabase hit three avoidable snags in a row: (1) the **direct** host
`db.<ref>.supabase.co` is IPv6-only and won't resolve in many envs — always use the **transaction
pooler** (`aws-0-<region>.pooler.supabase.com:6543`, user `postgres.<ref>`, `prepare:false`).
(2) A DB password with reserved characters **must be percent-encoded** inside `DATABASE_URL`, or
the driver misparses it and tries the *username* as a hostname (`ENOTFOUND postgres.<ref>`).
(3) The env file must be **`.env.local`** (leading dot) — `env.local` is silently ignored by Next,
and plain `node scripts/*.mjs` needs `--env-file=.env.local` (it doesn't auto-load). **Lesson:** when
a user pastes a Supabase URL, verify host≈pooler, port 6543, user `postgres.<ref>`, and a
non-placeholder, encoded password before trying to connect. Reconstruct the pooler form from a
direct string rather than asking for a re-paste.

## 2026-07-10 — Timezone must be pinned to Europe/Vienna, not the host

Stored `starts_at`/`ends_at` are Vienna wall-clock strings. The first cut compared them against
SQLite `datetime('now','localtime')` (host TZ) **and** used a space separator where our strings use
`T` — so expiry both string-compared wrong and drifted on any non-Vienna host. Client date chips used
the browser's local day too. **Lesson:** every "now/today/expiry/date-bucket" computation is
Vienna-pinned — `viennaNow()` in `lib/db.js`, `Intl` with `timeZone:'Europe/Vienna'` client-side.
A code reviewer caught the class; don't reintroduce it.

## 2026-07-10 — Guard `ends_at <= starts_at` on every write path

An overnight event ("22:00–02:00", end time parsed as same-day 02:00) produces an `ends_at` before
`starts_at`, so it expires the instant it's inserted. The seed path guarded it; crawl and the POST
route didn't. **Lesson:** cross-cutting invariants (ends-after-starts, dedup, geocode-fallback) must
be applied on *all* write paths (seed, crawl, API POST) in the same change — grep for the twins.

## 2026-07-10 — Map markers need a full sync, not create-only

Markers were created once and never updated/removed, so a recrawl that moved/renamed/expired an
event left stale pins and stale detail data until a hard reload. **Lesson:** on data reload, sync the
marker set — update moved/renamed pins, remove vanished ones, and point the click handler at fresh
event data (no stale closures).

## 2026-07-10 — SQLite on serverless is read-only + ephemeral

Vercel's project dir is read-only and only `/tmp` is writable (and ephemeral). Opening the bundled DB
read-write there fails (WAL sidecars); writes don't persist. **Lesson:** `resolveDbPath()` copies the
seeded DB to `/tmp` on `process.env.VERCEL`; uploads go to `/tmp`; and the honest framing is "read-only
demo until the Supabase port." Don't promise persistent writes on serverless SQLite.

## 2026-07-10 — Data trust: never fabricate, facts + linkback only

A wrong event on the map destroys trust faster than a missing one, and copying source prose/images
is an EU-database-right problem. **Lesson:** extraction/mining uses `null` for unknowns, skips undated
events, writes our own descriptions, and keeps every `source_url`. This is a hard rule, not a nicety.

## 2026-07-12 — `rm -rf .next` under a running dev server / build gives fake errors

Ran `rm -rf .next && npm run build` while the preview dev server (`next dev`) shared the same
`.next`. Result: a misleading `next build` prerender crash (`Cannot read properties of undefined
(reading 'call')`) and, on the dev server, `Cannot find module './331.js'` + missing
`routes-manifest.json` / `middleware-manifest.json` 500s. None were code bugs. **Lesson:** that class
of webpack-runtime error usually means a corrupt/half-written `.next`, not your diff. Don't delete
`.next` while `next dev`/`next build` is touching it. To confirm the code is fine: stop the dev
server, `rm -rf .next`, and do one clean `npm run build`. Only bisect the diff if the *clean* build fails.

## 2026-07-13 — "first tap fails, second works" on AI intake = serverless cold start

A pasted FB link (and any poster scan) sometimes failed on the first submit, then succeeded on the
retry. Not FB, not our fetch (both stable ~1s). Cause: the first request after idle lands on a cold
Vercel container — the model call transiently 429/5xx/overloads, or the page-fetch socket stalls past
the (then 10s) inactivity timeout — while the warm second request sails through. **Lesson:** first-tap
AI-intake flows on serverless need to absorb transient flake, not surface it. Wrap intake in a bounded
`withRetry` (transient errors only — 429/5xx/overload/network/timeout; rethrow auth/bad-content
immediately) and keep the page-fetch timeout generous (20s, well under maxDuration). A provider
fallback (Gemini→Claude) alone doesn't cover a cold-start socket stall or a double transient.

## 2026-07-13 — FB link "sometimes works": the date was never in the AI input

The pasted-FB-link flow failed intermittently. Adding FB diagnostic logs
(`[intake] extract-url FB:` — status / ogTitle / ogDesc / textLen) surfaced it in
one fetch: FB serves ~71 chars of body text; the event's **date/place live only in
`og:description`**. But the AI fallback fed the model `[og:title, htmlToText(body)]`
— and `htmlToText` strips `<meta>`, so og:description never reached the model. With
no date, the model either returned null (the visible failures) or **guessed a plausible
date/time** — a silent hard-rule-#5 fabrication (a phantom `20:00` that FB never
stated). **Lesson:** for any og-driven page (FB/IG/many event pages) the machine-readable
facts are in `<meta>`, not the body — always feed `og:description`/`twitter:description`
to the extractor, not just the title. And when an extractor "succeeds" with a field the
source doesn't actually contain, suspect fabrication, not competence — verify against the
raw input. Logs that print the exact model input are how you catch both.

## 2026-07-14 — A source parked at `works=false` is data that rots, not data we have

Answering "how often do we crawl, and do we cover everything?" surfaced two silent
failures. **(1) The tiering was dead code.** `TIER_CADENCE_DAYS` gates each source at
active 2d / slow 5d / dormant 7d — but the cron only fired *weekly*, so by Thursday
every source was past even the 7-day dormant threshold. All ~1,800 were crawled every
run regardless of tier; the whole tier column bought us nothing. **A per-item cadence is
a no-op unless the trigger is at least as frequent as the tightest tier.** Fixed by
moving the trigger to daily — the tiers now do the differentiating (1,711 skipped as
"not due" on the next run).

**(2) Stuttgart's two best sources were switched off.** Sindelfingen (221 events) and
Kreativregion (174) sat at `works=false` with notes saying "refresh only with
`scripts/mine-*.mjs`", because the generic crawl had no adapter for their CMS. Their
parsers *already existed* in `lib/` — they were just only reachable from the one-shot
mining scripts. So the cron skipped them and their events quietly went stale. Wiring the
two parsers into `tryStructuredExtraction()` (`typo3-hwveranstaltung`, `wordpress-ical`)
turned 395 dead events into a repeating feed for zero LLM cost. **Lesson:** an external
tool (Grok mining, OSM, a hand-rolled miner) is a *bootstrap*, never a refresh path. If
the cron can't re-fetch it, we don't have the data — we have a snapshot with an expiry
date nobody wrote down. Now hard rule 7 in CLAUDE.md. Corollary: the miner scripts wrote
`works: false` into their own `source_registry`, so re-running one would have re-disabled
the source it just fed — a bootstrap must never be able to undo the pipeline.

## Postgres bigint ids are strings in JS (2026-07-14)
`events.id` is `bigint`; postgres.js returns it as a **string** (`"373"`), not a number. A
`Number.isInteger(id)` guard when loading saved-event ids from localStorage silently discarded the
entire list on every reload — the build was green and there was no console error. Only driving the
real flow in the browser (save → reload → check the menu badge) surfaced it.
**Lesson:** never type-guard or compare a DB id as a number; normalize to `String` on every path.
**Lesson:** a green build proves nothing about state that round-trips through storage — verify the
flow, not the compile.

## Data must not depend on the basemap (2026-07-14)
Two integration bugs from the viewport rebuild, same root: coupling app data to MapLibre's render
pipeline. (1) The initial event fetch was gated on `map.on('load')` — which never fires if the
style/tile CDN is down, leaving "0 events" on a healthy API. Gate data on map *construction*
(transform/bounds exist immediately); only LAYER install needs 'load'. (2) Animated `flyTo` needs
the render loop; with a dead CDN the animation never progresses, `moveend` never fires, and the
viewport silently stays on the old area while the "Around X" chip claims the new one. Fix:
watchdog → `jumpTo` (synchronous moveend). Rule of thumb: an OpenFreeMap outage must degrade to
"grey map, working list" — verify features with the tile CDN *blocked*, not just healthy.

## An architecture change can delete the problem a feature was solving (2026-07-14)
The long-press / right-click drop-pin was built to answer "show me events over there without
typing" — a real problem under the radius model, where the map didn't drive the query. Hours later
the viewport rebuild made *panning* the query, so the gesture duplicated the map's primary
interaction and its discoverability tip became wrong advice ("long-press to see events around that
spot" — no: just look). George spotted it, not me: I shipped the rebuild and carried the gesture
forward without re-asking whether it still had a job.
**Lesson:** after a change to how the app fundamentally works, re-audit the features built for the
old model and ask what each one is still *for*. Deleting a feature you just built is not waste —
carrying a dead interaction (plus its hint, its CSS, its i18n) forward is.
