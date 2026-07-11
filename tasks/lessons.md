# Lessons

Mistakes made and reusable lessons from George's feedback. Append-only; newest at top.

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
