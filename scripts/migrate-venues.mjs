// Idempotent migration: create the venues registry (db/schema.sql) and seed it
// from what the DB already knows — events that geocoded to venue/address
// precision, and kind='place' rows (museums/pools/halls ARE the venues events
// happen at). See docs/design/big-city-quality.md §1 Stage 1.
// Usage: node --env-file=.env.local scripts/migrate-venues.mjs
import postgres from 'postgres';
import { normalizeName, isSentinelVenue } from '../lib/geocode.js';
import { closeDb } from '../lib/db.js';

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2, connection: { search_path: 'umkreis' } });

await sql`
  create table if not exists venues (
    id            bigint generated always as identity primary key,
    name          text not null,
    town          text,
    country       text not null default 'AT',
    name_norm     text not null,
    town_norm     text not null default '',
    lat           double precision not null,
    lng           double precision not null,
    geo_precision text not null default 'venue',
    resolved_via  text not null,
    source_url    text,
    verified_at   timestamptz default now(),
    unique (name_norm, town_norm, country)
  )`;
console.log('venues table ready');

// Seed 1: events already resolved to venue precision — their (venue, town) is a
// proven fact. Address-precision rows also qualify when they carry a venue name.
const evRows = await sql`
  select venue, town, country, lat, lng, geo_precision, max(updated_at) as seen
  from events
  where kind='event' and venue is not null and venue <> ''
    and geo_precision in ('venue','address')
  group by venue, town, country, lat, lng, geo_precision`;

// Seed 2: places — the title is the venue name.
const plRows = await sql`
  select title as venue, town, country, lat, lng, source_url
  from events
  where kind='place' and status='published'`;

let ins = 0, skip = 0;
async function seed(rows, via, precision) {
  for (const r of rows) {
    if (isSentinelVenue(r.venue)) { skip++; continue; }
    const res = await sql`
      insert into venues (name, town, country, name_norm, town_norm, lat, lng, geo_precision, resolved_via, source_url)
      values (${r.venue}, ${r.town ?? null}, ${r.country || 'AT'}, ${normalizeName(r.venue)},
              ${normalizeName(r.town || '')}, ${r.lat}, ${r.lng},
              ${precision || r.geo_precision || 'venue'}, ${via}, ${r.source_url ?? null})
      on conflict (name_norm, town_norm, country) do nothing`;
    ins += res.count;
  }
}
await seed(evRows, 'event', null);
await seed(plRows, 'place', 'venue');

const [{ n }] = await sql`select count(*)::int as n from venues`;
console.log(`seeded: +${ins} rows (${skip} sentinel venues skipped) — registry now holds ${n} venues`);
await sql.end();
await closeDb();
