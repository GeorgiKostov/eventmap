import postgres from 'postgres';
import { tzForEvent } from './geocode.js';
import { KID_PLACE_CATS } from './kid-cats.js';
import { cleanText } from './entities.js';
import { hasTime } from './event-time.js';
import { rankPick, communityQualityGate, COMMUNITY_KINDS } from './source-quality.js';
// Re-exported for existing consumers; the definition lives with the trust tiers.
export { COMMUNITY_KINDS };

// Single-file data layer. Talks to Supabase Postgres over the transaction
// pooler (serverless-safe). The prototype's SQLite schema was designed to mirror
// this layout, so the port stayed mechanical.
//
// Isolation: our tables live in a dedicated `umkreis` schema inside a shared
// Supabase project; `search_path` pins unqualified queries to it. To graduate
// into a standalone project later, dump/restore that one schema — nothing else
// references it.
//
// Time rule (hard): starts_at/ends_at stay TEXT Vienna wall-clock strings
// ("2026-07-12T14:00"), never timestamptz — storing them as tz-aware types is
// exactly the drift bug in tasks/lessons.md. All "now/expiry" math uses
// viennaNow() and naive ::timestamp casts (no zone conversion).

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false, // Supavisor transaction pooling doesn't support prepared statements
  // 'extensions' resolves PostGIS (ST_*, the geom column's && operator) without
  // schema-qualifying every call site — see scripts/migrate-viewport.mjs.
  connection: { search_path: 'umkreis, extensions' },
  idle_timeout: 20,
  max: 5,
});

// Postgres returns real booleans / text[]. Normalize reads back to the prototype's
// SQLite shape (1/0/null ints, categories array) so every consumer — the client
// app, JSON-LD, MCP server — keeps working unchanged.
function shape(r) {
  return {
    ...r,
    all_day: r.all_day ? 1 : 0,
    is_free: r.is_free == null ? null : r.is_free ? 1 : 0,
    indoor: r.indoor == null ? null : r.indoor ? 1 : 0,
    categories: r.categories || [],
    interest_count: r.interest_count ?? 0,
    report_flag: r.report_flag ?? null,
  };
}

// A data-quality report only becomes visible once this many INDEPENDENT reporters
// (distinct IP hashes) agree. One annoyed person cannot smear an event; three
// strangers reporting the same wrong time almost certainly means it is wrong.
export const REPORT_MIN = 3;
export const REACTION_KINDS = ['interest', 'cancelled', 'wrong_time', 'wrong_info', 'not_free'];

// Interest count + the single most-reported problem (only once it clears
// REPORT_MIN). Joined as grouped subqueries rather than per-row laterals so cost
// scales with the size of `reactions`, not with the thousands of published events.
const REACTION_JOIN = sql`
  LEFT JOIN (
    SELECT event_id, count(*)::int AS n FROM reactions WHERE kind='interest' GROUP BY event_id
  ) ri ON ri.event_id = e.id
  LEFT JOIN (
    SELECT DISTINCT ON (event_id) event_id, kind, count(*)::int AS n
    FROM reactions WHERE kind <> 'interest'
    GROUP BY event_id, kind
    ORDER BY event_id, count(*) DESC
  ) rr ON rr.event_id = e.id AND rr.n >= ${REPORT_MIN}
`;

// Toggle an 'interest', or file a report. Idempotent per (event, kind, ip_hash) —
// the unique index is what makes one person one vote, so a retry or a double-tap
// can never inflate a counter. Returns the fresh interest count for the event.
export async function react(eventId, kind, ipHash, { on = true } = {}) {
  if (!REACTION_KINDS.includes(kind)) throw new Error(`bad reaction kind: ${kind}`);
  if (kind === 'interest' && !on) {
    await sql`DELETE FROM reactions WHERE event_id=${eventId} AND kind='interest' AND ip_hash=${ipHash}`;
  } else {
    await sql`
      INSERT INTO reactions (event_id, kind, ip_hash) VALUES (${eventId},${kind},${ipHash})
      ON CONFLICT (event_id, kind, ip_hash) DO NOTHING
    `;
  }
  const [row] = await sql`
    SELECT count(*)::int AS n FROM reactions WHERE event_id=${eventId} AND kind='interest'
  `;
  return row?.n ?? 0;
}

// Country -> IANA timezone. Every wall-clock "now" computation must go
// through one of these, never the host machine's local time or bare UTC
// (tasks/lessons.md — this class of bug bit us once already).
export const COUNTRY_TZ = { AT: 'Europe/Vienna', BG: 'Europe/Sofia', DE: 'Europe/Berlin' };

// "Now" as a wall-clock ISO string ('YYYY-MM-DDTHH:MM') in the given IANA
// timezone, so comparisons are correct regardless of the host machine's
// timezone.
export function nowInTz(tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}
export function viennaNow() { return nowInTz(COUNTRY_TZ.AT); }
export function sofiaNow() { return nowInTz(COUNTRY_TZ.BG); }

// An event is "over" when ends_at passes; without an end time: 6h after start,
// or end of day for all-day events (design doc rule). Places (kind='place')
// are evergreen — no starts_at/ends_at — and never expire. Every row is
// compared against "now" in ITS OWN timezone (the per-event `tz` column,
// lib/geocode.js tzForEvent) — never a single country-wide zone, never the
// host's. A single-zone country (AT/BG/DE) has one tz for every row, so this is
// unchanged for them; a multi-zone country (US/RU/CA/AU/BR...) now expires a
// New York event and a Los Angeles event independently, DST-correct, because
// `AT TIME ZONE` converts each row's naive local wall-clock to an absolute
// instant in THAT row's zone before comparing to now(). tz falls back to
// COUNTRY_TZ by country, then UTC, for any row written before the tz column
// existed (belt-and-braces — migrate-event-tz.mjs already backfilled AT/BG).
export async function expireFinished() {
  const res = await sql`
    UPDATE events SET status='expired', updated_at=now()
    WHERE status='published'
      AND kind='event'
      AND (
        COALESCE(
          -- A date-only ends_at ("2026-12-31", length 10) is a known end DATE with
          -- no time (lib/event-time.js makeEndsAt) — it must live to the END of
          -- that day, not expire at its midnight. A timed ends_at is exact.
          CASE WHEN length(ends_at) = 10
               THEN date_trunc('day', ends_at::timestamp) + interval '1 day'
               ELSE ends_at::timestamp END,
          -- length(starts_at)=10 means the source published no time (lib/event-time.js).
          -- Such a row must live until the END of its day: starts_at::timestamp is
          -- midnight, so the timed branch (+6h) would expire it at 06:00 on the
          -- very morning it happens.
          CASE WHEN all_day OR length(starts_at) = 10
               THEN date_trunc('day', starts_at::timestamp) + interval '1 day'
               ELSE starts_at::timestamp + interval '6 hours' END
        ) AT TIME ZONE COALESCE(
          tz,
          CASE country
            WHEN 'AT' THEN 'Europe/Vienna'
            WHEN 'BG' THEN 'Europe/Sofia'
            WHEN 'DE' THEN 'Europe/Berlin'
            ELSE 'UTC'
          END
        )
      ) < now()
  `;
  return res.count;
}

// A read must not also pay for a full-table UPDATE. expireFinished() scans
// every published event; run it at most once per maxAgeSec, gated by a
// timestamp in `meta` (scripts/migrate-viewport.mjs), instead of on every
// page load. The freshness check itself is a plain absolute-duration
// comparison (elapsed wall-clock seconds since the last sweep) — not the
// per-event "is this event over" question, so it is not the tz-wall-clock
// rule (CLAUDE.md #3) that governs starts_at/ends_at comparisons below.
export async function expireIfStale(maxAgeSec = 600) {
  const [row] = await sql`SELECT value FROM meta WHERE key='last_expire'`;
  // Stored as epoch ms — `now()::text` produced "2026-07-14 14:01:59+00",
  // which only parses via V8's lenient Date.parse (review finding #8).
  // Number() first; Date.parse fallback reads any old-format row once.
  const last = row ? (Number(row.value) || Date.parse(row.value) || 0) : 0;
  if (Date.now() - last <= maxAgeSec * 1000) return;
  // Concurrent reads all cross the staleness threshold at once; without a lock
  // each would fire the full-table UPDATE (idempotent, but a thundering herd).
  // A TRANSACTION-scoped try-lock lets exactly one request do the sweep; the
  // rest skip and serve the slightly-stale read (the next read re-checks). It
  // must be xact-scoped, not session-scoped: under Supavisor transaction pooling
  // a session lock's unlock can land on a different backend and leak the lock.
  await sql.begin(async (tx) => {
    const [{ got }] = await tx`SELECT pg_try_advisory_xact_lock(hashtext('umkreis:last_expire')) AS got`;
    if (!got) return; // someone else is sweeping — the lock releases at their commit
    await expireFinished();
    await tx`
      INSERT INTO meta (key, value)
      VALUES ('last_expire', ((extract(epoch FROM now()) * 1000)::bigint)::text)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  });
}

export async function publishedEvents() {
  await expireIfStale();
  const rows = await sql`
    SELECT e.*, ri.n AS interest_count, rr.kind AS report_flag
    FROM events e ${REACTION_JOIN}
    WHERE e.status='published' ORDER BY e.starts_at ASC
  `;
  return rows.map(shape);
}

// ---- viewport-native map (briefs/viewport-rebuild-brief.md) ----
// Filter semantics are copied 1:1 from app/page.js's commonFiltered /
// filteredEvents memos — same boundary values, not reimplemented from
// scratch. See that file's `dFrom`/`dTo` memo and the predicates chained
// below it for the source of truth.
//
// `when` window: the client computes dFrom/dTo as Vienna-pinned, DATE-ONLY
// strings ('YYYY-MM-DD', via todayStr()/addDays()'s en-CA Intl formatting) —
// not 'YYYY-MM-DDTHH:MM' wall-clock timestamps. The overlap test compares
// only the first 10 chars of starts_at/ends_at (ev.starts_at.slice(0,10)),
// so we mirror that with left(...,10) rather than comparing full text against
// a date-only bound (which would wrongly exclude same-day events with a time
// component, e.g. '2026-07-20T09:00' > '2026-07-20'). Applies to kind='event'
// only — places are evergreen and always pass (design doc rule; also copied
// verbatim in commonFiltered's date filter, which only appears inside
// filteredEvents).
function commonFilters({ kind, cats, free, kids, community, inout, tod, when } = {}) {
  return sql`
    ${kind ? sql`AND e.kind = ${kind}` : sql``}
    ${cats && cats.length ? sql`AND e.categories && ${cats}` : sql``}
    ${free ? sql`AND e.is_free = true` : sql``}
    ${kids ? sql`AND (e.age_min IS NOT NULL OR e.age_max IS NOT NULL
                      OR 'family' = ANY(e.categories)
                      OR e.categories && ${KID_PLACE_CATS})` : sql``}
    ${community ? sql`AND e.src_kind IN ${sql([...COMMUNITY_KINDS])}` : sql``}
    ${inout === 'in' ? sql`AND e.indoor = true` : sql``}
    ${inout === 'out' ? sql`AND e.indoor = false` : sql``}
    ${when?.from && when?.to ? sql`
      AND (e.kind <> 'event' OR (
        left(e.starts_at, 10) <= ${when.to}
        AND left(COALESCE(e.ends_at, e.starts_at), 10) >= ${when.from}
      ))
    ` : sql``}
    ${tod && tod.length ? sql`
      AND (e.kind <> 'event' OR e.all_day OR length(e.starts_at) = 10 OR (
        CASE WHEN COALESCE(NULLIF(substr(e.starts_at, 12, 2), '')::int, 0) < 12 THEN 'morning'
             WHEN COALESCE(NULLIF(substr(e.starts_at, 12, 2), '')::int, 0) < 17 THEN 'afternoon'
             ELSE 'evening' END
      ) = ANY(${tod})
      )
    ` : sql``}
  `;
}

// bbox = [minLng, minLat, maxLng, maxLat]. LIMIT 800 with `total` (unlimited
// count) + `truncated` so the client can show a "zoom in / narrow filters"
// hint at Vienna-city density. Places sort FIRST: they're evergreen and few
// (design rule: never hidden), so the flood of timed events must not evict
// them past the cap — central Vienna is 1,029 events + 37 places, and
// starts_at ordering alone starved every place out of the response (review
// finding #1). Within each kind, soonest events first, as before. Projection
// includes the reaction fields so the client's row-shape code needs no changes.
export async function mapPins({ bbox, ...filters } = {}) {
  await expireIfStale();
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const where = sql`
    e.status='published'
    AND e.geom && ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)
    ${commonFilters(filters)}
  `;
  // Places sort first so the timed-event flood can't evict them, but that same
  // rule means >800 places in a viewport would evict every EVENT — the reverse
  // starvation. Reserve the cap: places take at most PLACE_CAP slots, so events
  // are guaranteed the remainder (800 - min(places, PLACE_CAP)). Today's per-city
  // place counts are in the tens; this only bites as the OSM place catalog grows.
  const PLACE_CAP = 300;
  const rows = await sql`
    WITH ranked AS (
      SELECT e.*, ri.n AS interest_count, rr.kind AS report_flag,
             row_number() OVER (PARTITION BY (e.kind = 'place') ORDER BY e.starts_at ASC NULLS LAST) AS rn
      FROM events e ${REACTION_JOIN}
      WHERE ${where}
    )
    SELECT id,kind,title,starts_at,ends_at,all_day,lat,lng,geo_precision,
           venue,address,town,country,categories,is_free,age_min,age_max,indoor,
           opening_hours,seasonal,src_kind,interest_count,report_flag
    FROM ranked
    WHERE kind <> 'place' OR rn <= ${PLACE_CAP}
    ORDER BY (kind = 'place') DESC, starts_at ASC NULLS LAST
    LIMIT 800
  `;
  const [{ total }] = await sql`SELECT count(*)::int AS total FROM events e WHERE ${where}`;
  return { events: rows.map(shape), total, truncated: total > rows.length };
}

// Zoomed-out overview: server-side spatial binning so a whole-country view
// never ships per-event rows. No REACTION_JOIN — cells don't show
// interest/report state, only a count.
export async function mapCells({ bbox, cellDeg, ...filters } = {}) {
  await expireIfStale();
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const where = sql`
    e.status='published'
    AND e.geom && ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)
    ${commonFilters(filters)}
  `;
  const cells = await sql`
    SELECT avg(e.lat)::float8 AS lat, avg(e.lng)::float8 AS lng, count(*)::int AS n
    FROM events e
    WHERE ${where}
    GROUP BY floor(e.lat / ${cellDeg}), floor(e.lng / ${cellDeg})
  `;
  const [{ total }] = await sql`SELECT count(*)::int AS total FROM events e WHERE ${where}`;
  return { cells, total };
}

// Global text search (title/venue/town), independent of the viewport — the
// search box looks up events anywhere, not just what's on screen. `%`/`_`
// are escaped so a user typing them can't turn a substring match into a
// wildcard scan; ILIKE's default escape char is backslash.
//
// unaccent() folds diacritics on BOTH sides so "munchen" finds "München" and
// "cafe" finds "Café" — a raw ILIKE returns zero for the accented form, which
// is exactly what a user who can't type umlauts gets. (unaccent folds within a
// script only; Latin→Cyrillic transliteration is a separate unsolved problem.)
export async function searchEvents(q) {
  const escaped = String(q).replace(/[%_\\]/g, (c) => `\\${c}`);
  const pattern = `%${escaped}%`;
  const prefix = `${escaped}%`;
  return await sql`
    SELECT e.id, e.kind, e.title, e.starts_at, e.venue, e.town, e.lat, e.lng
    FROM events e
    WHERE e.status='published'
      AND (unaccent(e.title) ILIKE unaccent(${pattern})
           OR unaccent(e.venue) ILIKE unaccent(${pattern})
           OR unaccent(e.town) ILIKE unaccent(${pattern}))
    -- Relevance before recency: a title that STARTS with the query, then any
    -- title match, then venue/town-only matches — otherwise a common substring
    -- ("park") buries an exact title hit past the 20-row cap on date alone.
    ORDER BY (unaccent(e.title) ILIKE unaccent(${prefix})) DESC,
             (unaccent(e.title) ILIKE unaccent(${pattern})) DESC,
             e.starts_at ASC NULLS LAST
    LIMIT 20
  `;
}

// Resolve the saved-events list. Deliberately NOT scoped to the viewport —
// saved events are usually elsewhere on the map (brief: don't let "outside
// the current bbox" look like "gone").
export async function eventsByIds(ids) {
  if (!ids || !ids.length) return [];
  const rows = await sql`
    SELECT e.id,e.kind,e.title,e.starts_at,e.ends_at,e.all_day,e.lat,e.lng,e.geo_precision,
           e.venue,e.address,e.town,e.country,e.categories,e.is_free,e.age_min,e.age_max,e.indoor,
           e.opening_hours,e.seasonal,e.src_kind,
           ri.n AS interest_count, rr.kind AS report_flag
    FROM events e ${REACTION_JOIN}
    WHERE e.status='published' AND e.id IN ${sql(ids.slice(0, 100))}
    ORDER BY e.starts_at ASC NULLS LAST
  `;
  return rows.map(shape);
}

// Weekend digest picks (docs/ops/weekly-automation.md): the best family events
// around a point for a Fri–Sun window. `from`/`to` are LOCAL date-only strings
// (starts_at is local wall-clock TEXT — string compare, never tz math).
// DISTINCT ON collapses a series (same title, several dates/venues in range) to
// its earliest occurrence so one Ferienprogramm can't fill the whole digest.
//
// A REPORTED event (>=REPORT_MIN independent reporters — REACTION_JOIN's rr)
// is excluded in the WHERE clause, before DISTINCT ON picks the "earliest"
// row: if a series' earliest occurrence is the reported one but a later date
// is fine, filtering pre-DISTINCT lets that later date surface instead of
// dropping the whole series. Never feature a reported event in the digest.
//
// Ranking happens in JS on the small candidate set via rankPick() (one shared
// definition, lib/source-quality.js — also used by the "why did this rank
// here" reasoning elsewhere, so there is only one tuple to keep in sync).
// LEXICOGRAPHIC, not an additive sum: an additive sum once let three lower
// signals (free+community+precise = 5) outrank the product lens itself
// (family = 4), so a non-family event could headline the family digest
// (tasks/lessons.md, 2026-07-14). As a tuple: family fit (strictly dominant)
// → source tier → precise location → free → interest_count → soonest.
//
// Source tier REPLACES "community-submitted" as a ranking boost: George asked
// to rate official sources (linztermine etc) higher, and letting community
// submissions rank ABOVE generic crawl was exactly backwards for a validation
// -stage product where trust matters more than rewarding a contributor — a
// single test row ("Test event") once headlined the first digest run because
// nothing gated or deprioritized unvetted content (same lesson entry). Now
// community content is the LOWEST tier and only survives at all if it passes
// communityQualityGate (venue + real description + no reports) — the "no
// random shit" gate, applied in JS below since it needs the report_flag this
// query already joins.
export async function weekendPicks({ lat, lng, radiusKm, from, to, limit = 10 }) {
  await expireIfStale();
  const rows = await sql`
    SELECT DISTINCT ON (lower(e.title))
           e.id, e.title, e.description, e.starts_at, e.ends_at, e.all_day,
           e.venue, e.address, e.town, e.categories, e.is_free, e.age_min, e.age_max,
           e.indoor, e.geo_precision, e.src_kind, e.source_name, e.source_url, e.lat, e.lng,
           ri.n AS interest_count, rr.kind AS report_flag
    FROM events e ${REACTION_JOIN}
    WHERE e.status='published' AND e.kind='event'
      -- Never feature a reported event — see comment above on why this must
      -- run before DISTINCT ON, not after.
      AND rr.event_id IS NULL
      -- Overlap, not start-only: a festival that began before Friday but runs
      -- through the weekend is happening, so it's pickable (mirrors mapPins).
      AND left(e.starts_at, 10) <= ${to}
      AND left(COALESCE(e.ends_at, e.starts_at), 10) >= ${from}
      AND ST_DWithin(e.geom::geography,
                     ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                     ${radiusKm * 1000})
    ORDER BY lower(e.title), e.starts_at ASC
  `;
  return rows
    .map(shape)
    .filter(communityQualityGate)
    .sort((a, b) => {
      const ra = rankPick(a), rb = rankPick(b);
      for (let i = 0; i < ra.length; i++) if (rb[i] !== ra[i]) return rb[i] - ra[i];
      return String(a.starts_at).localeCompare(String(b.starts_at));
    })
    .slice(0, limit);
}

// Active newsletter recipients: double opt-in complete, not unsubscribed.
export async function confirmedSubscribers() {
  return await sql`
    SELECT id, email, lang, area_label, area_lat, area_lng, radius_km, categories, token
    FROM subscribers
    WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL
    ORDER BY id
  `;
}

// Small key/value store (schema: `meta`). Used by the digest sender as a
// per-week send ledger so a re-run can never double-mail the list.
export async function metaGet(key) {
  const rows = await sql`SELECT value FROM meta WHERE key=${key}`;
  return rows[0]?.value ?? null;
}

// Every frozen weekend digest we have ever published, newest first. Each row is
// one shareable/indexable page (app/weekend/[city]/[weekend]) — the snapshot IS
// the archive, so nothing extra had to be stored to get one.
export async function listDigestKeys() {
  const rows = await sql`SELECT key FROM meta WHERE key LIKE 'digest:%' ORDER BY key DESC`;
  return rows
    .map((r) => r.key.split(':')) // digest:<slug>:<friday>
    .filter((p) => p.length === 3)
    .map(([, slug, friday]) => ({ slug, friday }));
}
export async function metaSet(key, value) {
  await sql`
    INSERT INTO meta (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

// Atomic claim: insert-if-absent, true only for the request that won the row.
// This is the difference between "check then act" (racy) and a real mutex —
// two concurrent publishers both pass a metaGet check, but only one of these
// INSERTs counts. Claims are released with metaDelete.
export async function metaClaim(key, value) {
  const result = await sql`
    INSERT INTO meta (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO NOTHING
  `;
  return result.count === 1;
}

export async function metaDelete(key) {
  await sql`DELETE FROM meta WHERE key=${key}`;
}

export async function getEvent(id) {
  const rows = await sql`
    SELECT e.*, ri.n AS interest_count, rr.kind AS report_flag
    FROM events e ${REACTION_JOIN}
    WHERE e.id=${id} AND e.status='published'
  `;
  return rows.length ? shape(rows[0]) : null;
}

export async function listSources() {
  return await sql`SELECT name,url,kind,town,works,last_crawled FROM sources ORDER BY name`;
}

function hashPart(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9äöüßЀ-ӿ]/g, '');
}

export function legacyContentHash(ev) {
  return `${hashPart(ev.title)}|${(ev.starts_at || '').slice(0, 10)}|${hashPart(ev.town)}`;
}

export function contentHash(ev) {
  // Charset extended for Cyrillic (Bulgaria) — Ѐ-ӿ is the full Cyrillic block
  // (U+0400-U+04FF). Adding characters to the allow-list never changes what
  // an existing German/Latin title normalizes to, so every hash already in
  // the DB stays byte-identical (verified: see the Developer-agent report for
  // this change — 5 sample AT/DE titles hashed before/after and matched).
  // Places dedup by title+town only (no date component — they're evergreen).
  if (ev.kind === 'place') return `place|${hashPart(ev.title)}|${hashPart(ev.town)}`;
  // One event can have multiple independently navigable occurrences on the
  // same day. Time and venue keep those rows distinct; fuzzy cross-source
  // dedup remains the layer for differently-worded copies of one occurrence.
  const starts = ev.starts_at || '';
  const location = ev.venue || ev.address || '';
  return `${hashPart(ev.title)}|${starts.slice(0, 10)}|${starts.slice(11, 16)}|${hashPart(ev.town)}|${hashPart(location)}`;
}

const bool = (v) => (v === null || v === undefined ? null : !!v);
const json = (v) => (v === null || v === undefined ? null : sql.json(v));

// age_min/age_max are int columns (db/schema.sql), but extraction (LLM/scrape)
// can hand back "4.5", "6+", or other non-integer junk. Coerce at the write
// boundary so every caller (crawl, seed, API POST, merge) is covered — never
// fabricate a value, only narrow what's already there. Non-finite -> null.
const toIntMin = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : null;
};
const toIntMax = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.ceil(n) : null;
};

export async function upsertEvent(raw) {
  // Entity decoding happens HERE, at the one write boundary every caller passes
  // through (crawl, seed, API POST, merge) — not in each adapter, where nine
  // partial copies had already drifted and let `&#8211;` reach 66 published
  // titles. Sources entity-encode inside JSON-LD/RSS/iCal, so a clean parser is
  // not enough; this is the same "coerce at the write boundary" rule as
  // toIntMin/toIntMax above. It runs BEFORE contentHash so the hash is computed
  // from the decoded title, not from the "8211" that hashPart() would keep.
  const ev = {
    ...raw,
    title: cleanText(raw.title),
    description: cleanText(raw.description),
    venue: cleanText(raw.venue),
    address: cleanText(raw.address),
    town: cleanText(raw.town),
  };
  const hash = contentHash(ev);
  const cats = ev.categories || [];
  const kind = ev.kind === 'place' ? 'place' : 'event';
  const ageMin = toIntMin(ev.age_min);
  const ageMax = toIntMax(ev.age_max);
  const tz = tzForEvent(ev);
  let existing = await sql`SELECT id FROM events WHERE content_hash=${hash}`;
  // Backward compatibility for rows written before occurrence-aware hashes:
  // lazily migrate the legacy title+day+town row only when its exact start and
  // non-conflicting venue match this occurrence. This avoids duplicating old
  // rows while never collapsing a second same-day performance into the first.
  if (!existing.length && kind === 'event') {
    const legacy = await sql`
      SELECT id,starts_at,venue,address FROM events WHERE content_hash=${legacyContentHash(ev)}
    `;
    const candidateLocation = hashPart(ev.venue || ev.address);
    const match = legacy.find((row) => (
      row.starts_at === ev.starts_at
      && (!hashPart(row.venue || row.address) || !candidateLocation
        || hashPart(row.venue || row.address) === candidateLocation)
    ));
    if (match) existing = [match];
  }
  // Placeholder-time migration: rows written before lib/event-time.js stored a
  // missing time as `T09:00` (+ all_day=true). This incoming event has NO time,
  // so its hash now ends in an empty time slot and would MISS that row — and
  // insert a second copy of an event we already have. Adopt the old row instead
  // and let the UPDATE below rewrite it to the honest date-only start.
  // Deliberately one-directional: an incoming event that DOES carry 09:00 takes
  // the normal path, so a genuine 9am event is never touched.
  if (!existing.length && kind === 'event' && ev.starts_at && !hasTime(ev.starts_at)) {
    const placeholder = contentHash({ ...ev, starts_at: `${ev.starts_at}T09:00` });
    const stale = await sql`SELECT id FROM events WHERE content_hash=${placeholder}`;
    if (stale.length) existing = [stale[0]];
  }
  if (existing.length) {
    const id = existing[0].id;
    await sql`
      UPDATE events SET
        title=${ev.title}, emoji=${ev.emoji || null}, description=${ev.description || null},
        starts_at=${ev.starts_at || null}, ends_at=${ev.ends_at || null}, all_day=${!!ev.all_day},
        lat=${ev.lat}, lng=${ev.lng}, geo_precision=${ev.geo_precision || 'town'}, tz=${tz},
        venue=${ev.venue || null}, address=${ev.address || null}, categories=${cats},
        is_free=${bool(ev.is_free)}, age_min=${ageMin}, age_max=${ageMax},
        indoor=${bool(ev.indoor)}, source_url=${ev.source_url || null},
        opening_hours=${json(ev.opening_hours)}, seasonal=${ev.seasonal || null},
        content_hash=${hash}, updated_at=now()
      WHERE id=${id}
    `;
    return { id, updated: true };
  }
  const inserted = await sql`
    INSERT INTO events (kind,title,description,starts_at,ends_at,all_day,lat,lng,geo_precision,tz,
      venue,address,town,country,categories,is_free,age_min,age_max,indoor,emoji,photo_path,
      opening_hours,seasonal,status,src_kind,source_name,source_url,content_hash)
    VALUES (${kind},${ev.title},${ev.description || null},${ev.starts_at || null},${ev.ends_at || null},${!!ev.all_day},
      ${ev.lat},${ev.lng},${ev.geo_precision || 'town'},${tz},${ev.venue || null},${ev.address || null},
      ${ev.town || null},${ev.country || 'AT'},${cats},${bool(ev.is_free)},${ageMin},${ageMax},
      ${bool(ev.indoor)},${ev.emoji || null},${ev.photo_path || null},
      ${json(ev.opening_hours)},${ev.seasonal || null},${ev.status || 'published'},
      ${ev.src_kind || 'crawl'},${ev.source_name || null},${ev.source_url || null},${hash})
    RETURNING id
  `;
  return { id: inserted[0].id, updated: false };
}

export async function upsertSource(s) {
  await sql`
    INSERT INTO sources (name,url,kind,town,works,notes,cms,region,country)
    VALUES (${s.name},${s.url},${s.kind || 'municipal'},${s.town || null},${s.works === false ? false : true},${s.notes || null},${s.cms || null},${s.region || null},${s.country || 'AT'})
    ON CONFLICT (url) DO UPDATE SET works=EXCLUDED.works, notes=EXCLUDED.notes, cms=EXCLUDED.cms, region=EXCLUDED.region, country=EXCLUDED.country
  `;
}

// --- geocache (used by lib/geocode.js) ---
export async function geocacheGet(q) {
  const rows = await sql`SELECT * FROM geocache WHERE query=${q}`;
  return rows[0] || null;
}
export async function geocacheSet(q, hit) {
  await sql`
    INSERT INTO geocache (query,lat,lng,label,hit)
    VALUES (${q},${hit?.lat ?? null},${hit?.lng ?? null},${hit?.label ?? null},${hit ? true : false})
    ON CONFLICT (query) DO UPDATE SET lat=EXCLUDED.lat, lng=EXCLUDED.lng, label=EXCLUDED.label, hit=EXCLUDED.hit
  `;
}
// Purge cached misses (hit=false). Whenever a rule feeding the geocache
// changes (bounds, waterfall order, POI matching), old negative entries can
// block results the new rule would have found — see tasks/lessons.md
// (2026-07-11, Bad Ischl). Cheap to recompute, poisonous to keep.
export async function purgeNegativeGeocache() {
  const res = await sql`DELETE FROM geocache WHERE hit=false`;
  return res.count;
}

// --- venues registry (docs/design/big-city-quality.md §1) ---
// Resolved (venue name, town) → coordinates, with provenance. Unlike the
// geocache (a query-string cache that gets purged when rules change), a venue
// row is a curated fact: once "Basilika St. Laurenz, Enns" is resolved, every
// current and future event at that venue geocodes instantly and identically.
export async function getVenue(nameNorm, townNorm, country = 'AT') {
  const rows = await sql`
    SELECT * FROM venues
    WHERE name_norm=${nameNorm} AND town_norm=${townNorm} AND country=${country}`;
  return rows[0] || null;
}
// First resolution wins (ON CONFLICT DO NOTHING): a 'manual' or earlier fix is
// never clobbered by a later automated pass. Corrections go via direct SQL.
export async function upsertVenue(v) {
  await sql`
    INSERT INTO venues (name, town, country, name_norm, town_norm, lat, lng, geo_precision, resolved_via, source_url)
    VALUES (${v.name}, ${v.town ?? null}, ${v.country || 'AT'}, ${v.name_norm}, ${v.town_norm ?? ''},
            ${v.lat}, ${v.lng}, ${v.geo_precision || 'venue'}, ${v.resolved_via}, ${v.source_url ?? null})
    ON CONFLICT (name_norm, town_norm, country) DO NOTHING`;
}

// Moderation: flip an event's status ('published' | 'removed'). Deliberately
// NOT part of UPDATABLE_FIELDS — the dedup merge path must never touch status.
export async function setEventStatus(id, status) {
  const res = await sql`UPDATE events SET status=${status}, updated_at=now() WHERE id=${id} RETURNING id, title`;
  return res[0] || null;
}

// ---- newsletter (double opt-in) ----
// Upsert a subscriber in PENDING state. Preferences are always updated, but the
// opt-in state is never silently flipped on: an active confirmed subscriber is
// left confirmed (no re-confirm mail), while a new / unconfirmed / previously
// unsubscribed row gets a fresh `token` and stays inactive until it confirms —
// so no one can (re)subscribe a stranger or resurrect an unsubscribe without
// proving control of the address. Every signup also records proof of consent
// (Art. 7(1) GDPR): timestamp, the consent-wording version shown, hashed IP.
// Returns { pending } = a confirmation mail is due.
export async function addSubscriber(email, {
  source = null,
  lang = null,
  areaLabel = null,
  areaLat = null,
  areaLng = null,
  radiusKm = 20,
  categories = [],
  token,
  consentVersion = null,
  consentIpHash = null,
} = {}) {
  const rows = await sql`
    INSERT INTO subscribers
      (email, source, lang, area_label, area_lat, area_lng, radius_km, categories, token,
       token_issued_at, consent_version, consent_ip_hash, consent_at)
    VALUES
      (${email}, ${source}, ${lang}, ${areaLabel}, ${areaLat}, ${areaLng}, ${radiusKm}, ${categories}, ${token},
       now(), ${consentVersion}, ${consentIpHash}, now())
    ON CONFLICT (email) DO UPDATE SET
      source = EXCLUDED.source,
      lang = EXCLUDED.lang,
      area_label = EXCLUDED.area_label,
      area_lat = EXCLUDED.area_lat,
      area_lng = EXCLUDED.area_lng,
      radius_km = EXCLUDED.radius_km,
      categories = EXCLUDED.categories,
      consent_version = EXCLUDED.consent_version,
      consent_ip_hash = EXCLUDED.consent_ip_hash,
      consent_at = now(),
      token = CASE
        WHEN subscribers.confirmed_at IS NULL OR subscribers.unsubscribed_at IS NOT NULL
        THEN EXCLUDED.token ELSE subscribers.token END,
      token_issued_at = CASE
        WHEN subscribers.confirmed_at IS NULL OR subscribers.unsubscribed_at IS NOT NULL
        THEN now() ELSE subscribers.token_issued_at END
    RETURNING token, (confirmed_at IS NULL OR unsubscribed_at IS NOT NULL) AS pending
  `;
  const row = rows[0] || {};
  return { pending: row.pending ?? true, token: row.token ?? token };
}

// Confirm links expire: ACTIVATING a subscription (first confirm, or reviving
// an unsubscribed one) requires a token issued within this window. Re-signing
// up always issues a fresh token, so an expired link is never a dead end. A
// re-click on an already-active subscription stays a harmless no-op at any age,
// and unsubscribe tokens deliberately never expire — revoking consent must
// always work (incl. RFC 8058 one-click). Mail copy mentions the 7 days too
// (CONFIRM_COPY in lib/mail.js) — keep them in sync.
const CONFIRM_TTL_DAYS = 7;

// Confirm the double opt-in: activate the subscriber and clear any prior
// unsubscribe. Idempotent — a second click keeps the original confirmed_at.
export async function confirmSubscriber(token) {
  if (!token) return null;
  const rows = await sql`
    UPDATE subscribers
    SET confirmed_at = COALESCE(confirmed_at, now()), unsubscribed_at = NULL
    WHERE token = ${token}
      AND (
        (confirmed_at IS NOT NULL AND unsubscribed_at IS NULL)
        OR token_issued_at IS NULL
        OR token_issued_at > now() - make_interval(days => ${CONFIRM_TTL_DAYS})
      )
    RETURNING email
  `;
  return rows[0]?.email ?? null;
}

// One-click unsubscribe via the per-subscriber token. Idempotent.
export async function unsubscribe(token) {
  if (!token) return null;
  const rows = await sql`
    UPDATE subscribers
    SET unsubscribed_at = COALESCE(unsubscribed_at, now())
    WHERE token = ${token}
    RETURNING email
  `;
  return rows[0]?.email ?? null;
}

// ---- rate limiting (durable; IP hashes only, never raw IPs) ----
export async function recordRateHit(ipHash, action) {
  await sql`INSERT INTO rate_hits (ip_hash, action) VALUES (${ipHash}, ${action})`;
}
export async function countRateHits(ipHash, action, minutes) {
  const rows = await sql`
    SELECT count(*)::int AS n FROM rate_hits
    WHERE ip_hash=${ipHash} AND action=${action} AND at > now() - (${minutes} * interval '1 minute')
  `;
  return rows[0]?.n ?? 0;
}
export async function countActionAll(action, minutes) {
  const rows = await sql`
    SELECT count(*)::int AS n FROM rate_hits
    WHERE action=${action} AND at > now() - (${minutes} * interval '1 minute')
  `;
  return rows[0]?.n ?? 0;
}

// --- source crawl helpers (used by scripts/crawl.mjs) ---
export async function getSourceByUrl(url) {
  const rows = await sql`SELECT * FROM sources WHERE url=${url}`;
  return rows;
}
// Read-only, all sources regardless of works/tier — used by
// scripts/probe-sources.mjs to skip municipalities already registered
// (matched by domain or name+region), never to write.
export async function listSourcesForDedup() {
  return await sql`SELECT name, url, town, region FROM sources`;
}
export async function getWorkingSources() {
  return await sql`SELECT * FROM sources WHERE works=true`;
}
export async function markSourceCrawled(id) {
  await sql`UPDATE sources SET last_crawled=now() WHERE id=${id}`;
}
// page_hash: sha256 of the stripped page text, for change-detection skip.
// feed_kind: which extraction route won this crawl
// (jsonld|ical|gem2go|dvv|rss|llm|null).
// etag/last_modified: the 200 response's caching headers (generic shell
// only), so the next crawl can send If-None-Match/If-Modified-Since and skip
// a re-download entirely on a 304 — cheaper than the page_hash compare, which
// still needs the full body. A 304 response never reaches this function (it
// takes the same early-return path as an unchanged page_hash, so the stored
// values are left untouched); callers with no HTTP-level etag concept
// (naturfreunde's POST-based special case) simply omit them, same as today.
export async function updateSourceMeta(id, { page_hash, feed_kind, etag, last_modified } = {}) {
  await sql`
    UPDATE sources SET page_hash=${page_hash ?? null}, feed_kind=${feed_kind ?? null},
      etag=${etag ?? null}, last_modified=${last_modified ?? null}
    WHERE id=${id}
  `;
}
export async function setSourceNote(id, note) {
  await sql`UPDATE sources SET notes=${note} WHERE id=${id}`;
}
// blocked_reason (docs/design/big-city-quality.md §2): a STATE ('robots' |
// 'ai_bot_policy' | 'js_spa' | 'bot_block'), not a failure streak — pass null
// to clear it once a fetch succeeds again. Deliberately separate from
// setSourceNote/updateSourceStats: setting/clearing this must never itself
// touch zero_streak or tier.
export async function setSourceBlockedReason(id, reason) {
  await sql`UPDATE sources SET blocked_reason=${reason} WHERE id=${id}`;
}

// --- source content-rating / tiering (used by scripts/crawl.mjs) ---
// Sources for a normal run: working, not tier='dead' (tier NULL = not yet
// rated, treated as crawl-worthy). --all bypasses the tier filter entirely;
// cadence (has-it-been-long-enough-since-last_crawled) is applied by the
// caller, which already has each row's tier + last_crawled in hand.
// Order MOST-OVERDUE FIRST (never-crawled, then oldest last_crawled), not by id.
// A run that doesn't finish the full due-set — Actions cancellation/restart,
// timeout, a crash — always stopped at the SAME high-id tail under `ORDER BY id`,
// so ~500 sources sat un-fetched for days (267 stuck at their first-ever crawl,
// events_last=0, looking dead while being alive). Ordering by staleness makes a
// partial run spend its budget on whatever has waited longest instead of
// re-walking the same head every night. `groupByHost` in crawl.mjs still
// regroups for politeness, so this only changes WHICH sources get reached first.
export async function getSourcesForCrawl({ all = false } = {}) {
  const order = sql`ORDER BY last_crawled ASC NULLS FIRST, id`;
  if (all) return await sql`SELECT * FROM sources WHERE works=true ${order}`;
  return await sql`SELECT * FROM sources WHERE works=true AND (tier IS NULL OR tier != 'dead') ${order}`;
}
// Recovery set for `crawl.mjs --recover-zeros`: sources frozen at zero yield.
// tier='dead' is deliberately INCLUDED — a provider-failure window can rot a
// healthy source's zero_streak to 4, and this pass is how it comes back.
export async function getZeroYieldSources() {
  return await sql`
    SELECT * FROM sources WHERE works=true AND COALESCE(events_last, 0) = 0
    ORDER BY last_crawled ASC NULLS FIRST, id`;
}

// --- CMS fingerprint sweep (scripts/fingerprint-sources.mjs) ---
// Target set: working sources still paying the LLM route, or never fetched
// with HTML (feed_kind null), or classified from URL-only heuristics that
// never confirmed a real markup marker (unknown/other/null cms). Read-only
// consumer; --write applies via updateSourceCmsFingerprint below.
export async function getFingerprintCandidates({ country } = {}) {
  return await sql`
    SELECT * FROM sources
    WHERE works=true
      AND (
        feed_kind = 'llm' OR feed_kind IS NULL
        OR cms IN ('unknown', 'other') OR cms IS NULL
      )
      ${country ? sql`AND country = ${country}` : sql``}
    ORDER BY id
  `;
}
// Applies a fingerprint sweep's proposed cms (only ever a value crawl.mjs
// routes — see lib/cms-fingerprint.js ROUTABLE_CMS) and/or an explanatory
// note. Never touches feed_kind/page_hash — those are the crawler's own
// bookkeeping, updated only by an actual crawl (updateSourceMeta).
export async function updateSourceCmsFingerprint(id, { cms, notes } = {}) {
  await sql`
    UPDATE sources SET
      cms = COALESCE(${cms ?? null}, cms),
      notes = COALESCE(${notes ?? null}, notes)
    WHERE id=${id}
  `;
}
// Caller (crawl.mjs) computes every field from the row it already read plus
// this run's outcome — see the tier-threshold comment there for the policy.
export async function updateSourceStats(id, { crawl_count, events_last, events_sum, zero_streak, last_changed, tier }) {
  await sql`
    UPDATE sources SET
      crawl_count=${crawl_count}, events_last=${events_last}, events_sum=${events_sum},
      zero_streak=${zero_streak}, last_changed=${last_changed ?? null}, tier=${tier}
    WHERE id=${id}
  `;
}

// --- geocode repair (used by scripts/regeocode.mjs) ---
// Rows worth re-checking: already at town-centroid precision (nothing more
// precise was ever found), or carrying a venue name (candidate for the
// POI-first waterfall to do better than whatever originally resolved it).
export async function getGeocodeCandidateRows() {
  return await sql`
    SELECT id, kind, title, venue, address, town, lat, lng, geo_precision
    FROM events
    WHERE geo_precision = 'town' OR venue IS NOT NULL
    ORDER BY id
  `;
}
export async function updateEventCoords(id, { lat, lng, geo_precision }) {
  await sql`UPDATE events SET lat=${lat}, lng=${lng}, geo_precision=${geo_precision}, updated_at=now() WHERE id=${id}`;
}

// --- crawl-time fuzzy dedup (scripts/crawl.mjs, lib/dedup.js's findDuplicate) ---
// Bounded candidate set for a single new event: same Vienna calendar day + same
// town, excluding the row just written. Mirrors how app/api/events/route.js and
// app/api/scan/route.js use findDuplicate, but against a scoped query instead
// of publishedEvents() (every published event) — the crawl calls this once per
// freshly-inserted row, and a full-table load per candidate would multiply the
// cost of an already-large crawl by the size of the whole events table.
export async function dedupCandidates(day, town, excludeId) {
  const rows = await sql`
    SELECT e.id, e.kind, e.title, e.starts_at, e.ends_at, e.all_day, e.town, e.lat, e.lng,
           e.geo_precision, e.description, e.address, e.venue, e.is_free, e.age_min, e.age_max,
           e.indoor, e.photo_path, e.categories
    FROM events e
    WHERE e.status='published' AND e.kind='event'
      AND left(e.starts_at, 10) = ${day}
      AND lower(e.town) = lower(${town})
      AND e.id <> ${excludeId}
  `;
  return rows.map(shape);
}

// Scripts must close the pool so the Node process can exit.
export async function closeDb() {
  await sql.end({ timeout: 5 });
}

// --- dedup merge (used by app/api/events/route.js, app/api/scan/route.js,
// scripts/merge-dups.mjs via lib/dedup.js's mergePlan) ---
// Parameterized UPDATE over a whitelisted field set — patch is the output of
// mergePlan(), never raw request input, so the whitelist is a belt-and-braces
// guard rather than the only line of defense.
const UPDATABLE_FIELDS = new Set([
  'description', 'ends_at', 'address', 'venue', 'is_free',
  'age_min', 'age_max', 'indoor', 'photo_path', 'categories',
]);
export async function updateEventFields(id, patch) {
  const entries = Object.entries(patch || {}).filter(([k]) => UPDATABLE_FIELDS.has(k));
  if (!entries.length) return { id, updated: false };
  const set = {};
  for (const [k, v] of entries) {
    set[k] = k === 'is_free' || k === 'indoor' ? bool(v) : v;
  }
  await sql`UPDATE events SET ${sql(set)}, updated_at=now() WHERE id=${id}`;
  return { id, updated: true };
}
// Cross-source dedup cleanup (scripts/merge-dups.mjs --write): remove the
// newer duplicate rows once their fields have been merged onto the canonical
// (oldest) row via updateEventFields/mergePlan above.
export async function deleteEventsByIds(ids) {
  if (!ids || !ids.length) return 0;
  const res = await sql`DELETE FROM events WHERE id IN ${sql(ids)}`;
  return res.count;
}
