// Viewport rebuild (briefs/viewport-rebuild-brief.md): adds a PostGIS point
// geometry generated from lat/lng + a GiST index so bbox queries
// (`geom && ST_MakeEnvelope(...)`) can replace "ship every event, filter by
// radius client-side". Also adds a tiny `meta` key/value table so
// expireIfStale() can throttle the expire-finished-events UPDATE instead of
// running it on every read. Idempotent — safe to re-run.
// Run: node --env-file=.env.local scripts/migrate-viewport.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis, extensions' },
});

// Supabase convention: extensions live in the `extensions` schema, not public.
await sql`create extension if not exists postgis with schema extensions`;

await sql`
  alter table events add column if not exists geom extensions.geometry(Point,4326)
  generated always as (extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)) stored
`;
await sql`create index if not exists events_geom_idx on events using gist (geom)`;

await sql`create table if not exists meta (key text primary key, value text)`;

const [{ n }] = await sql`select count(*)::int as n from events where geom is not null`;
console.log(`events_geom_idx ready (${n} rows with geometry); meta table ready`);
await sql.end();
