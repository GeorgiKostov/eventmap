import postgres from 'postgres';

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
  };
}

// Country -> IANA timezone. Every wall-clock "now" computation must go
// through one of these, never the host machine's local time or bare UTC
// (tasks/lessons.md — this class of bug bit us once already).
export const COUNTRY_TZ = { AT: 'Europe/Vienna', BG: 'Europe/Sofia' };

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
// are evergreen — no starts_at/ends_at — and never expire. Each country's rows
// are compared against "now" in THAT country's own timezone (never Vienna's,
// never the host's) — a simple per-country pass, one UPDATE per known country.
export async function expireFinished() {
  let total = 0;
  for (const [country, tz] of Object.entries(COUNTRY_TZ)) {
    const now = nowInTz(tz);
    const res = await sql`
      UPDATE events SET status='expired', updated_at=now()
      WHERE status='published'
        AND kind='event'
        AND country=${country}
        AND COALESCE(
          ends_at::timestamp,
          CASE WHEN all_day THEN date_trunc('day', starts_at::timestamp) + interval '1 day'
               ELSE starts_at::timestamp + interval '6 hours' END
        ) < ${now}::timestamp
    `;
    total += res.count;
  }
  return total;
}

export async function publishedEvents() {
  await expireFinished();
  const rows = await sql`SELECT * FROM events WHERE status='published' ORDER BY starts_at ASC`;
  return rows.map(shape);
}

export async function getEvent(id) {
  const rows = await sql`SELECT * FROM events WHERE id=${id} AND status='published'`;
  return rows.length ? shape(rows[0]) : null;
}

export async function listSources() {
  return await sql`SELECT name,url,kind,town,works,last_crawled FROM sources ORDER BY name`;
}

export function contentHash(ev) {
  // Charset extended for Cyrillic (Bulgaria) — Ѐ-ӿ is the full Cyrillic block
  // (U+0400-U+04FF). Adding characters to the allow-list never changes what
  // an existing German/Latin title normalizes to, so every hash already in
  // the DB stays byte-identical (verified: see the Developer-agent report for
  // this change — 5 sample AT/DE titles hashed before/after and matched).
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9äöüßЀ-ӿ]/g, '');
  // Places dedup by title+town only (no date component — they're evergreen).
  if (ev.kind === 'place') return `place|${norm(ev.title)}|${norm(ev.town)}`;
  // Events dedup: same normalized title + same day + same town = same event.
  return `${norm(ev.title)}|${(ev.starts_at || '').slice(0, 10)}|${norm(ev.town)}`;
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
  const existing = await sql`SELECT id FROM events WHERE content_hash=${hash}`;
  if (existing.length) {
    const id = existing[0].id;
    await sql`
      UPDATE events SET
        title=${ev.title}, emoji=${ev.emoji || null}, description=${ev.description || null},
        starts_at=${ev.starts_at || null}, ends_at=${ev.ends_at || null}, all_day=${!!ev.all_day},
        lat=${ev.lat}, lng=${ev.lng}, geo_precision=${ev.geo_precision || 'town'},
        venue=${ev.venue || null}, address=${ev.address || null}, categories=${cats},
        is_free=${bool(ev.is_free)}, age_min=${ageMin}, age_max=${ageMax},
        indoor=${bool(ev.indoor)}, source_url=${ev.source_url || null},
        opening_hours=${json(ev.opening_hours)}, seasonal=${ev.seasonal || null}, updated_at=now()
      WHERE id=${id}
    `;
    return { id, updated: true };
  }
  const inserted = await sql`
    INSERT INTO events (kind,title,description,starts_at,ends_at,all_day,lat,lng,geo_precision,
      venue,address,town,country,categories,is_free,age_min,age_max,indoor,emoji,photo_path,
      opening_hours,seasonal,status,src_kind,source_name,source_url,content_hash)
    VALUES (${kind},${ev.title},${ev.description || null},${ev.starts_at || null},${ev.ends_at || null},${!!ev.all_day},
      ${ev.lat},${ev.lng},${ev.geo_precision || 'town'},${ev.venue || null},${ev.address || null},
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

// Moderation: flip an event's status ('published' | 'removed'). Deliberately
// NOT part of UPDATABLE_FIELDS — the dedup merge path must never touch status.
export async function setEventStatus(id, status) {
  const res = await sql`UPDATE events SET status=${status}, updated_at=now() WHERE id=${id} RETURNING id, title`;
  return res[0] || null;
}

// ---- newsletter ----
export async function addSubscriber(email, { source = null, lang = null } = {}) {
  const rows = await sql`
    INSERT INTO subscribers (email, source, lang)
    VALUES (${email}, ${source}, ${lang})
    ON CONFLICT (email) DO UPDATE SET unsubscribed_at = NULL
    RETURNING (xmax = 0) AS inserted
  `;
  return { inserted: rows[0]?.inserted ?? false };
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
// feed_kind: which extraction route won this crawl (jsonld|ical|rss|llm|null).
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
