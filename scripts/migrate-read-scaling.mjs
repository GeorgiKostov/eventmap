// Read-scaling indexes for the public map and search paths. Idempotent and safe
// to re-run. Indexes are built concurrently so production reads/writes remain
// available while the existing catalog is indexed.
// Run: node --env-file=.env.local scripts/migrate-read-scaling.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis, extensions' },
  max: 1,
});

await sql`create extension if not exists unaccent with schema extensions`;
await sql`create extension if not exists pg_trgm with schema extensions`;
await sql`
  create or replace function search_normalize(input text)
  returns text
  language sql
  immutable
  parallel safe
  set search_path = pg_catalog, extensions
  as $function$
    select lower(extensions.unaccent(coalesce(input, '')))
  $function$
`;

await sql`
  create index concurrently if not exists events_published_geom_idx
  on events using gist (geom) where status='published'
`;
await sql`
  create index concurrently if not exists events_published_source_idx
  on events(source_name) where status='published'
`;
await sql`
  create index concurrently if not exists events_published_search_trgm_idx
  on events using gin
  ((search_normalize(coalesce(title, '') || ' ' || coalesce(venue, '') || ' ' || coalesce(town, ''))) extensions.gin_trgm_ops)
  where status='published'
`;

const indexes = await sql`
  select indexname
  from pg_indexes
  where schemaname='umkreis'
    and indexname in (
      'events_published_geom_idx',
      'events_published_source_idx',
      'events_published_search_trgm_idx'
    )
  order by indexname
`;
const [{ folded }] = await sql`select search_normalize('MÜNCHEN') as folded`;
console.log(`read-scaling indexes ready (${indexes.length}/3); search_normalize('MÜNCHEN')='${folded}'`);
await sql.end();
