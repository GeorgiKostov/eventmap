import postgres from 'postgres';
import { tzForEvent } from './geocode.js';

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
  connection: { search_path: 'umkreis' },
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
          ends_at::timestamp,
          CASE WHEN all_day THEN date_trunc('day', starts_at::timestamp) + interval '1 day'
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

export async function publishedEvents() {
  await expireFinished();
  const rows = await sql`
    SELECT e.*, ri.n AS interest_count, rr.kind AS report_flag
    FROM events e ${REACTION_JOIN}
    WHERE e.status='published' ORDER BY e.starts_at ASC
  `;
  return rows.map(shape);
}

// Homepage map/list projection. Detail-only prose, provenance, photos, and
// write-path metadata stay out of the initial Supabase response; /api/events?id=
// hydrates one full row when the user opens it.
export async function publishedMapEvents() {
  await expireFinished();
  const rows = await sql`
    SELECT e.id,e.kind,e.title,e.starts_at,e.ends_at,e.all_day,e.lat,e.lng,e.geo_precision,
           e.venue,e.address,e.town,e.categories,e.is_free,e.age_min,e.age_max,e.indoor,
           e.opening_hours,e.seasonal,e.src_kind,
           ri.n AS interest_count, rr.kind AS report_flag
    FROM events e ${REACTION_JOIN}
    WHERE e.status='published' ORDER BY e.starts_at ASC
  `;
  return rows.map(shape);
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

export async function upsertEvent(ev) {
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
// proving control of the address. Returns { pending } = a confirmation mail is due.
export async function addSubscriber(email, {
  source = null,
  lang = null,
  areaLabel = null,
  areaLat = null,
  areaLng = null,
  radiusKm = 20,
  categories = [],
  token,
} = {}) {
  const rows = await sql`
    INSERT INTO subscribers
      (email, source, lang, area_label, area_lat, area_lng, radius_km, categories, token)
    VALUES
      (${email}, ${source}, ${lang}, ${areaLabel}, ${areaLat}, ${areaLng}, ${radiusKm}, ${categories}, ${token})
    ON CONFLICT (email) DO UPDATE SET
      source = EXCLUDED.source,
      lang = EXCLUDED.lang,
      area_label = EXCLUDED.area_label,
      area_lat = EXCLUDED.area_lat,
      area_lng = EXCLUDED.area_lng,
      radius_km = EXCLUDED.radius_km,
      categories = EXCLUDED.categories,
      token = CASE
        WHEN subscribers.confirmed_at IS NULL OR subscribers.unsubscribed_at IS NOT NULL
        THEN EXCLUDED.token ELSE subscribers.token END
    RETURNING token, (confirmed_at IS NULL OR unsubscribed_at IS NOT NULL) AS pending
  `;
  const row = rows[0] || {};
  return { pending: row.pending ?? true, token: row.token ?? token };
}

// Confirm the double opt-in: activate the subscriber and clear any prior
// unsubscribe. Idempotent — a second click keeps the original confirmed_at.
export async function confirmSubscriber(token) {
  if (!token) return null;
  const rows = await sql`
    UPDATE subscribers
    SET confirmed_at = COALESCE(confirmed_at, now()), unsubscribed_at = NULL
    WHERE token = ${token}
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
export async function updateSourceMeta(id, { page_hash, feed_kind }) {
  await sql`UPDATE sources SET page_hash=${page_hash ?? null}, feed_kind=${feed_kind ?? null} WHERE id=${id}`;
}
export async function setSourceNote(id, note) {
  await sql`UPDATE sources SET notes=${note} WHERE id=${id}`;
}

// --- source content-rating / tiering (used by scripts/crawl.mjs) ---
// Sources for a normal run: working, not tier='dead' (tier NULL = not yet
// rated, treated as crawl-worthy). --all bypasses the tier filter entirely;
// cadence (has-it-been-long-enough-since-last_crawled) is applied by the
// caller, which already has each row's tier + last_crawled in hand.
export async function getSourcesForCrawl({ all = false } = {}) {
  if (all) return await sql`SELECT * FROM sources WHERE works=true ORDER BY id`;
  return await sql`SELECT * FROM sources WHERE works=true AND (tier IS NULL OR tier != 'dead') ORDER BY id`;
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
