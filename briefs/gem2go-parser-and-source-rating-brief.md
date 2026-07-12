# Brief: GEM2GO deterministic parser + source content-rating (sustainable crawl)

Goal: (A) extract GEM2GO sites with a deterministic parser (no LLM → free, fast, cron-able), (B) rate
each source by content yield so we only rescan good ones, (C) make the crawl fast *sustainably*
(host-level concurrency, never hammering one server). This is the "steady-state crawl" the project
depends on. Read first: `docs/decisions/2026-07-11-crawl-scaling-and-legal.md`, `CLAUDE.md` (hard
rules), `scripts/crawl.mjs` (the waterfall + existing hand-parsers `parseJsonLdEvents`, iCal, RSS —
match their style, NO new npm dependency), `lib/db.js`.

## CONCURRENCY / SAFETY — read before touching anything
- A `regeocode.mjs` job and possibly UI agents may be live. **Do NOT run a full crawl.** Test with
  single `--url` only, after `ps aux | grep -E "crawl|regeocode"` shows it's safe.
- Schema changes on the SHARED `sources` table: use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` via the
  postgres client (`--env-file=.env.local`), mirror in `db/schema.sql`. Do NOT alter the events table
  or its extraction/upsert logic. Do NOT touch `app/`, `lib/geocode.js`, `lib/extract.js` provider code.
- Everything additive. `npm run build` must stay green (crawl.mjs isn't bundled, but lib/db.js is).

## Part A — GEM2GO parser
GEM2GO is ONE consistent CMS template across 64+ OÖ sources (and hundreds nationally) — no JSON-LD/iCal,
but a stable event-list DOM (container class `veranstaltungcmsliste`; event rows link to detail pages).
1. Reverse-engineer the repeating event-item structure by fetching several live GEM2GO calendars
   (e.g. Ottensheim `https://www.ottensheim.ooe.gv.at/KULTUR_SPORT/Veranstaltungen`, plus 3–4 others
   from `sources` where `cms='gem2go' AND works`). Identify how title, date (start/end), time, venue,
   and the per-event detail URL are marked up. GEM2GO versions vary slightly — handle the common cases,
   fall through gracefully on the rest.
2. Add `parseGem2goEvents(html, src)` in `scripts/crawl.mjs` (next to the other hand-parsers), returning
   events in the SAME shape the LLM path produces (title, date_start `YYYY-MM-DD`, time_start `HH:MM`|null,
   date_end/time_end, venue, town, categories[], is_free, source_url = per-event detail link).
   - **Facts only (hard rule):** title/date/venue/link. `description` = **null** (never copy their prose).
     Images: none.
   - **Categories:** best-effort via a small German keyword→category map (Fest→festival, Konzert→music,
     Markt/Flohmarkt→market, Kinder/Familie→family, Ausstellung/Theater→culture, Lauf/Turnier→sport,
     Workshop/Kurs→workshop, Kulinarik→food); **null if unsure** — don't force a wrong category.
   - **Never fabricate:** no parseable date → skip the event. Dates are Vienna wall-clock.
3. Slot into the waterfall in `tryStructured` (or just before the LLM fallback): hash-skip → JSON-LD →
   iCal → **gem2go (only when `src.cms==='gem2go'` AND the parser returns ≥1 valid event)** → RSS → LLM.
   Record `feed_kind='gem2go'`. If the parser matches nothing, fall through to the LLM (don't drop the source).
4. **Validate against ground truth:** for 4–5 GEM2GO sources already crawled by the LLM, compare the
   parser's events to what's in the DB for that source (count + a few spot-checks on date/venue). Report
   match rate and any systematic misses. The parser should recover the clear majority; the LLM stays the
   safety net for the rest.

## Part B — source content-rating / tiering
Goal: stop wasting crawls on dead/empty sources; rescan good ones more often.
1. Add to `sources`: `crawl_count int default 0`, `events_last int`, `events_sum int default 0`,
   `zero_streak int default 0`, `last_changed timestamptz`, `tier text` (active|slow|dormant|dead).
2. After each source crawl, update: `crawl_count++`, `events_last`, `events_sum += events_last`;
   `zero_streak` = 0 if events found else +1; `last_changed` = now() when the page_hash actually changed.
   Derive `tier`:
   - `dead`: `zero_streak >= 4` (or repeated fetch failures) → skipped in normal runs.
   - `dormant`: works but avg yield < ~1 and rarely changes → weekly cadence.
   - `slow`: modest yield → ~weekly.
   - `active`: good yield and/or changes often → 2–3 day cadence.
   (Pick sensible thresholds; document them in a comment.)
3. Default `npm run crawl` run: **skip `dead`**, and skip any source whose tier-cadence hasn't elapsed
   since `last_crawled`. Add `--all` (crawl everything incl. dead, for a periodic deep sweep) and keep
   the existing `--force` (bypass hash). Log a one-line tier summary at the end (how many active/slow/
   dormant/dead, how many skipped this run).

## Part C — sustainable speed
The bottleneck after the parser is the polite per-host delay, NOT extraction. Do NOT reduce the ≥1s
per-host rate limit. Instead parallelize across DIFFERENT hosts: a bounded worker pool (e.g. 6–8
concurrent hosts), each host's requests still ≥1s apart. One host = one small municipal server; never
concurrent requests to the same host. robots.txt + `UmkreisBot` UA stay.

## Success check
`npm run build` green; parser validated against ≥4 GEM2GO sources vs DB ground truth (report match rate);
`feed_kind='gem2go'` recorded; source tiers populated and the default run skips dead/not-due sources
(`--all`/`--force` override); host-concurrency in place with per-host politeness intact; nothing
fabricated; single `--url` tests only (no full crawl). Do NOT commit — leave for Architect review, and
report: parser match rate, tier distribution, files changed, and any GEM2GO variants you couldn't parse.
