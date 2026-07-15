# Lessons

Mistakes made and reusable lessons from George's feedback. Append-only; newest at top.

## 2026-07-14 — An anti-fabrication rule dropped a real fact; and additive scores aren't priorities

Adversarial review (four Sonnet agents over crawl/map/growth/admin) surfaced a CRITICAL that had been
live for a long time: **multi-day events expired after their first day.** Every adapter built
`ends_at = time_end ? \`${date_end}T${time_end}\` : null` — so a range that published an end DATE but no
end TIME ("28.02.2026–31.12.2026", the normal shape for a Ferienprogramm) stored `ends_at=null`, and
`expireFinished` then fell back to end-of-START-day. A ten-month program vanished after ~24h. The
irony: this lived right next to the *start*-time work (lib/event-time.js) whose whole point was "a
missing time is not a reason to fabricate OR to drop a fact" — and the end side did exactly the drop.
**A rule you apply on one field (starts_at: keep the date, drop only the unknown time) has a twin on
the sibling field (ends_at) that nobody wired up.** Fixed with `makeEndsAt()` as the single definition,
mirroring `makeStartsAt`, and expireFinished reads a date-only end as end-of-day. This is the
"grep every consumer / apply the invariant on all twins" lesson again (ends-after-starts, dedup,
geocode-fallback) — the twin here was starts_at↔ends_at.

**Second, from the same review: an additive score is not a priority order.** `weekendPicks` ranked with
`family*4 + free*2 + community*2 + precise*1`, and `free+community+precise = 5 > family = 4` — so a
non-family event could headline the *family* digest, exactly contradicting the "family fit first"
comment one line above. **When you mean "A dominates, ties broken by B, then C", write a lexicographic
tuple, not a weighted sum — a sum lets enough small signals outvote the one that's supposed to be
non-negotiable.** (Same review: a predicate meant to be "community-submitted" was written `!= 'crawl'`,
which also matched bulk `osm_mined` places — a negation is a leaky way to name a positive set; use the
closed set, and share it, as commonFilters already did.)

**Process notes worth keeping.** (1) The four findings I ranked highest were all confirmed by *reading
the code the agent pointed at*, not by trusting the agent — one "CRITICAL" (card route freezing the
digest) was real but recoverable, so verifying downgraded my own alarm. (2) A concurrent session
advanced HEAD and its `git add -A` swept my `db/schema.sql` edit into *its* docs commit while my other
15 files stayed unstaged — the lessons.md entanglement, live. The defense worked: I staged explicit
paths only, and the swept file's content was correct anyway. (3) Under Supavisor transaction pooling a
*session*-level advisory lock is unsafe (unlock can land on a different backend); use a *transaction*-
scoped `pg_try_advisory_xact_lock` that releases at commit.

## 2026-07-14 — A default is a claim. Two of them, and I got my own bug report's headline wrong

`crawl.mjs` and `seed.mjs` both did `starts_at = date + 'T' + (time || '09:00')` **and**
`all_day: time ? 0 : 1`. One missing fact, two inventions: a start time nobody published, and
`all_day` — which the UI renders as **"ganztägig"**, i.e. *"turn up whenever"*. For 8,365 live events
we were telling parents that about events we knew nothing about. A 16:00 cinema screening is not an
all-day event.

**I filed this bug myself, and its headline was wrong.** I wrote "12,052 events are displayed to
parents as if they start at 9:00" without checking the render path. 10,625 of those rows had
`all_day=true`, and `fmtWhen` short-circuits on `all_day` — they never showed 9:00 at all; they showed
"ganztägig". The real display lie was a *different* lie than the one I reported, and only 1,427 rows
were even candidates for showing a 9:00 clock — of which the sampled ones turned out to be **genuine**
(traun.at really does publish "Zeit 09:00–13:00 Uhr"). Had I "fixed" what I reported, I'd have
stripped real times off real events and left the actual fabrication in place. **Measure the render
path, not just the column — a value that never reaches a user is a different bug from one that does,
and it wants a different fix.** (Third time this session: Stuttgart's robots "block", Krenglbach's
"selector bug", now this. The pattern is always the same — the diagnosis in the ticket is a
hypothesis, not evidence.)

**What made the cleanup safe was a property, not a guess.** 10,625 rows had to be rewritten, and
nothing in the row said whether "all day" was true. But no parser, adapter or form *ever* set
`all_day` from something a source actually SAID — every path derived it from the absence of a time.
So `all_day = true ≡ "we don't know the time"`, exactly, and the rewrite was a lossless restatement
rather than a judgement call. **Before a 10k-row backfill, look for the invariant that makes it
mechanical; if you can't find one, you are guessing at scale.** The rows I *couldn't* prove
(`all_day=false` at 09:00 — the extractor genuinely parsed a time) I left alone: destroying a true
time to satisfy a heuristic is the same sin pointing the other way.

**And the default poisoned a tool three files away.** `merge-dups.mjs` picked its surviving row by
*lowest id* — a tiebreak posing as a decision. With a 09:00 placeholder in play that rule actively
destroyed data: it kept the row that didn't know when the event started and deleted the one that did
(85 of 453 clusters spanned different times; it would have kept "Sachkundenachweis" at the placeholder
and dropped the real 18:30). Now the canonical is the row carrying the most **facts** — a published
time outranks everything, age is only the final tiebreak. **A fabricated value doesn't stay where you
put it: it flows into hashes, sorts, filters and dedup rules, and the further it travels the more it
looks like data.**

## 2026-07-14 — Nine copies of one helper, each missing a different piece; and the bug report was half wrong

The task said two bugs. **One was ours, one was the source's, and only reading the raw page told them apart.**

**Ours:** 66 published titles carried raw entity text ("Sommerfest &#8211; Kramer in der Au"). Cause:
**nine** hand-rolled `decodeEntities` implementations (one per adapter, plus crawl.mjs and
probe-sources.mjs), each with a different partial list of named entities — and only two of the nine
handled NUMERIC references at all. So `&#8211;`, the en-dash that appears in half of all German event
titles, survived every path that hadn't happened to spell it out. WordPress makes this the *default*
case: it entity-encodes inside JSON-LD and RSS, where `JSON.parse`/XML parsing decode their own
escapes but never HTML's — so "the parser is clean" is not the same as "the text is clean".

**Not ours:** the reported "text bled in from the next element" (`…der ErdeDie progressiven
Nostalgiker`) is published *by krenglbach.at itself* — its own JSON-LD `name` field and its own
share-link carry the identical corrupted string. We stored faithfully what they served. I nearly
"fixed" our parser for a bug our parser did not have. (This is the Stuttgart-robots lesson again:
**replay the inherited diagnosis against the raw source before writing the fix.**) It stays as
published — repairing a source's text by inference is fabrication, and hard rule 5 cuts both ways.

**Two traps in the cleanup itself, both caught by dry-running against prod:**
(a) A first pass would have rewritten `content_hash` on **28,568** rows — every row still carrying the
pre-2026-07 legacy hash. But `upsertEvent`'s legacy path re-matches those *deliberately* (exact
`starts_at` + non-conflicting venue), which tolerates a row whose venue was null when written.
Blindly re-hashing them would break that match and let the next crawl insert a second copy —
manufacturing the very duplicates the script existed to remove. Legacy hashes are not corrupt;
entity/whitespace hashes are. **Touch only what is actually broken.**
(b) The obvious follow-up — "re-run merge-dups" — would have **destroyed data**. It clusters by
same-day + similar title and keeps the *oldest* id, and 85 of its 453 clusters merge rows with
*different start times*: it would have kept "Sachkundenachweis" at a placeholder 09:00 and deleted the
row carrying the real 18:30. A dedup tool's canonical-choice rule is a data-quality decision, not a
tiebreak. **Read a destructive tool's dry run row by row before believing its summary line.**

**Lessons:** (1) N copies of one helper is N different behaviours — the third copy is where it stops
being duplication and starts being drift; put it in one module (`lib/entities.js`) and, for a
cross-cutting invariant, enforce it at the **single write boundary** (`upsertEvent`) so no future
adapter can bypass it — same rule as `kid-cats.js`, same rule as the age coercion already sitting
there; (2) don't trust the *category* of a bug report ("our selector is wrong") over the raw evidence;
(3) a hash computed from user-visible text must be recomputed whenever that text is normalized —
`hashPart()` strips non-alphanumerics, so `&#8211;` was silently contributing a literal "8211" to
every affected row's identity.

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

## Record WHAT failed, not just that yield was zero (2026-07-15)
The crawl conflated three unrelated facts into one signal: "extraction errored" (a provider
problem), "the LLM returned no events" (ambiguous — empty calendar or silent model failure), and
"the page had no events" (a source fact) all landed as events_last=0, and two of them also advanced
zero_streak toward tier=dead. Worse, the zero-candidate LLM round stamped the new page_hash, so the
change-detector then skipped the source as "unchanged" forever — a cache stamp taken during a
failure window outlived the failure (the venues-registry lesson again, in a different table). 371
working sources were frozen this way; 333 hash-wedged; 4 unjustly dead.
**Lesson:** every pipeline stat must record *whose* fact it is. A provider error may not touch
source stats, a cadence stamp, or any cache/hash — the run simply didn't happen for that source.
And any "skip next time" marker (hash, etag, negative cache) may only be written on a *successful*
round, or the skip logic institutionalizes the failure.
