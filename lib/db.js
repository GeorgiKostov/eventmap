import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Schema mirrors the design doc's Postgres/Supabase layout (events/sources/geocache)
// so the later migration is a mechanical port, not a redesign.

const BUNDLED_DB = path.join(process.cwd(), 'data', 'umkreis.db');

// On serverless (Vercel) the project dir is read-only. Copy the seeded DB to
// /tmp (writable, but ephemeral) at cold start so reads work and WAL can create
// its sidecar files. Writes there don't persist across cold starts — that's the
// signal to migrate to Supabase Postgres (see README).
function resolveDbPath() {
  if (!process.env.VERCEL) return BUNDLED_DB;
  const tmp = '/tmp/umkreis.db';
  if (!fs.existsSync(tmp) && fs.existsSync(BUNDLED_DB)) fs.copyFileSync(BUNDLED_DB, tmp);
  return tmp;
}

let db;

export function getDb() {
  if (db) return db;
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      url           TEXT UNIQUE NOT NULL,
      kind          TEXT NOT NULL,            -- municipal | city_calendar | regional_feed | user_photo
      town          TEXT,
      works         INTEGER DEFAULT 1,
      notes         TEXT,
      last_crawled  TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT NOT NULL,
      description   TEXT,
      starts_at     TEXT NOT NULL,            -- ISO local "2026-07-12T14:00"
      ends_at       TEXT,                     -- nullable
      all_day       INTEGER DEFAULT 0,        -- 1 = no reliable start time known
      lat           REAL NOT NULL,
      lng           REAL NOT NULL,
      geo_precision TEXT DEFAULT 'town',      -- venue | address | town
      venue         TEXT,
      address       TEXT,
      town          TEXT,
      categories    TEXT NOT NULL DEFAULT '[]', -- JSON array
      is_free       INTEGER,                  -- 1/0/NULL
      age_min       INTEGER,
      age_max       INTEGER,
      indoor        INTEGER,                  -- 1/0/NULL
      emoji         TEXT,
      photo_path    TEXT,
      status        TEXT NOT NULL DEFAULT 'published', -- published | expired | rejected
      src_kind      TEXT NOT NULL DEFAULT 'crawl',     -- crawl | feed | user_photo | manual
      source_name   TEXT,
      source_url    TEXT,
      content_hash  TEXT UNIQUE,              -- dedup key
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS events_starts_idx ON events (starts_at);
    CREATE INDEX IF NOT EXISTS events_status_idx ON events (status);

    CREATE TABLE IF NOT EXISTS geocache (
      query   TEXT PRIMARY KEY,
      lat     REAL, lng REAL,
      label   TEXT,
      hit     INTEGER DEFAULT 1
    );
  `);
  return db;
}

// "Now" as a Europe/Vienna wall-clock ISO string ('YYYY-MM-DDTHH:MM') so
// comparisons are correct regardless of the host machine's timezone, and use
// the same 'T' separator as stored timestamps (SQLite datetime() emits a space,
// which would break lexicographic comparison against our stored values).
export function viennaNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

// An event is "over" when ends_at passes; without an end time: 6h after start,
// or end of day for all-day events (design doc rule).
export function expireFinished() {
  const d = getDb();
  return d
    .prepare(
      `UPDATE events SET status='expired', updated_at=datetime('now')
       WHERE status='published'
         AND COALESCE(
           ends_at,
           CASE WHEN all_day=1 THEN strftime('%Y-%m-%dT%H:%M', starts_at, 'start of day', '+1 day')
                ELSE strftime('%Y-%m-%dT%H:%M', starts_at, '+6 hours') END
         ) < ?`
    )
    .run(viennaNow()).changes;
}

export function publishedEvents() {
  const d = getDb();
  expireFinished();
  return d
    .prepare(
      `SELECT * FROM events WHERE status='published' ORDER BY starts_at ASC`
    )
    .all()
    .map((e) => ({ ...e, categories: JSON.parse(e.categories || '[]') }));
}

export function getEvent(id) {
  const d = getDb();
  const e = d.prepare("SELECT * FROM events WHERE id=? AND status='published'").get(id);
  return e ? { ...e, categories: JSON.parse(e.categories || '[]') } : null;
}

export function listSources() {
  return getDb().prepare('SELECT name,url,kind,town,works,last_crawled FROM sources ORDER BY name').all();
}

export function contentHash(ev) {
  // Dedup: same normalized title + same day + same town = same event.
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
  return `${norm(ev.title)}|${(ev.starts_at || '').slice(0, 10)}|${norm(ev.town)}`;
}

export function upsertEvent(ev) {
  const d = getDb();
  const hash = contentHash(ev);
  const existing = d.prepare('SELECT id FROM events WHERE content_hash=?').get(hash);
  const row = {
    title: ev.title,
    description: ev.description || null,
    starts_at: ev.starts_at,
    ends_at: ev.ends_at || null,
    all_day: ev.all_day ? 1 : 0,
    lat: ev.lat,
    lng: ev.lng,
    geo_precision: ev.geo_precision || 'town',
    venue: ev.venue || null,
    address: ev.address || null,
    town: ev.town || null,
    categories: JSON.stringify(ev.categories || []),
    is_free: ev.is_free === null || ev.is_free === undefined ? null : ev.is_free ? 1 : 0,
    age_min: ev.age_min ?? null,
    age_max: ev.age_max ?? null,
    indoor: ev.indoor === null || ev.indoor === undefined ? null : ev.indoor ? 1 : 0,
    emoji: ev.emoji || null,
    photo_path: ev.photo_path || null,
    status: ev.status || 'published',
    src_kind: ev.src_kind || 'crawl',
    source_name: ev.source_name || null,
    source_url: ev.source_url || null,
    content_hash: hash,
  };
  if (existing) {
    d.prepare(
      `UPDATE events SET title=@title, emoji=@emoji, description=@description,
        starts_at=@starts_at, ends_at=@ends_at,
        all_day=@all_day, lat=@lat, lng=@lng, geo_precision=@geo_precision, venue=@venue,
        address=@address, categories=@categories, is_free=@is_free, age_min=@age_min,
        age_max=@age_max, indoor=@indoor, source_url=@source_url,
        updated_at=datetime('now')
       WHERE id=@id`
    ).run({ ...row, id: existing.id });
    return { id: existing.id, updated: true };
  }
  const info = d
    .prepare(
      `INSERT INTO events (title,description,starts_at,ends_at,all_day,lat,lng,geo_precision,
        venue,address,town,categories,is_free,age_min,age_max,indoor,emoji,photo_path,
        status,src_kind,source_name,source_url,content_hash)
       VALUES (@title,@description,@starts_at,@ends_at,@all_day,@lat,@lng,@geo_precision,
        @venue,@address,@town,@categories,@is_free,@age_min,@age_max,@indoor,@emoji,@photo_path,
        @status,@src_kind,@source_name,@source_url,@content_hash)`
    )
    .run(row);
  return { id: info.lastInsertRowid, updated: false };
}

export function upsertSource(s) {
  const d = getDb();
  d.prepare(
    `INSERT INTO sources (name,url,kind,town,works,notes) VALUES (@name,@url,@kind,@town,@works,@notes)
     ON CONFLICT(url) DO UPDATE SET works=@works, notes=@notes`
  ).run({
    name: s.name,
    url: s.url,
    kind: s.kind || 'municipal',
    town: s.town || null,
    works: s.works === false ? 0 : 1,
    notes: s.notes || null,
  });
}
