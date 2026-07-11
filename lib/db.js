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

// "Now" as a Europe/Vienna wall-clock ISO string ('YYYY-MM-DDTHH:MM') so
// comparisons are correct regardless of the host machine's timezone.
export function viennaNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

// An event is "over" when ends_at passes; without an end time: 6h after start,
// or end of day for all-day events (design doc rule). Places (kind='place')
// are evergreen — no starts_at/ends_at — and never expire.
export async function expireFinished() {
  const now = viennaNow();
  const res = await sql`
    UPDATE events SET status='expired', updated_at=now()
    WHERE status='published'
      AND kind='event'
      AND COALESCE(
        ends_at::timestamp,
        CASE WHEN all_day THEN date_trunc('day', starts_at::timestamp) + interval '1 day'
             ELSE starts_at::timestamp + interval '6 hours' END
      ) < ${now}::timestamp
  `;
  return res.count;
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
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
  // Places dedup by title+town only (no date component — they're evergreen).
  if (ev.kind === 'place') return `place|${norm(ev.title)}|${norm(ev.town)}`;
  // Events dedup: same normalized title + same day + same town = same event.
  return `${norm(ev.title)}|${(ev.starts_at || '').slice(0, 10)}|${norm(ev.town)}`;
}

const bool = (v) => (v === null || v === undefined ? null : !!v);
const json = (v) => (v === null || v === undefined ? null : sql.json(v));

export async function upsertEvent(ev) {
  const hash = contentHash(ev);
  const cats = ev.categories || [];
  const kind = ev.kind === 'place' ? 'place' : 'event';
  const existing = await sql`SELECT id FROM events WHERE content_hash=${hash}`;
  if (existing.length) {
    const id = existing[0].id;
    await sql`
      UPDATE events SET
        title=${ev.title}, emoji=${ev.emoji || null}, description=${ev.description || null},
        starts_at=${ev.starts_at || null}, ends_at=${ev.ends_at || null}, all_day=${!!ev.all_day},
        lat=${ev.lat}, lng=${ev.lng}, geo_precision=${ev.geo_precision || 'town'},
        venue=${ev.venue || null}, address=${ev.address || null}, categories=${cats},
        is_free=${bool(ev.is_free)}, age_min=${ev.age_min ?? null}, age_max=${ev.age_max ?? null},
        indoor=${bool(ev.indoor)}, source_url=${ev.source_url || null},
        opening_hours=${json(ev.opening_hours)}, seasonal=${ev.seasonal || null}, updated_at=now()
      WHERE id=${id}
    `;
    return { id, updated: true };
  }
  const inserted = await sql`
    INSERT INTO events (kind,title,description,starts_at,ends_at,all_day,lat,lng,geo_precision,
      venue,address,town,categories,is_free,age_min,age_max,indoor,emoji,photo_path,
      opening_hours,seasonal,status,src_kind,source_name,source_url,content_hash)
    VALUES (${kind},${ev.title},${ev.description || null},${ev.starts_at || null},${ev.ends_at || null},${!!ev.all_day},
      ${ev.lat},${ev.lng},${ev.geo_precision || 'town'},${ev.venue || null},${ev.address || null},
      ${ev.town || null},${cats},${bool(ev.is_free)},${ev.age_min ?? null},${ev.age_max ?? null},
      ${bool(ev.indoor)},${ev.emoji || null},${ev.photo_path || null},
      ${json(ev.opening_hours)},${ev.seasonal || null},${ev.status || 'published'},
      ${ev.src_kind || 'crawl'},${ev.source_name || null},${ev.source_url || null},${hash})
    RETURNING id
  `;
  return { id: inserted[0].id, updated: false };
}

export async function upsertSource(s) {
  await sql`
    INSERT INTO sources (name,url,kind,town,works,notes,cms)
    VALUES (${s.name},${s.url},${s.kind || 'municipal'},${s.town || null},${s.works === false ? false : true},${s.notes || null},${s.cms || null})
    ON CONFLICT (url) DO UPDATE SET works=EXCLUDED.works, notes=EXCLUDED.notes, cms=EXCLUDED.cms
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

// --- source crawl helpers (used by scripts/crawl.mjs) ---
export async function getSourceByUrl(url) {
  const rows = await sql`SELECT * FROM sources WHERE url=${url}`;
  return rows;
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

// Scripts must close the pool so the Node process can exit.
export async function closeDb() {
  await sql.end({ timeout: 5 });
}
