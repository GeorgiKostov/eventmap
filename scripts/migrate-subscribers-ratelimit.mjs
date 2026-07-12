// Create the subscribers + rate_hits tables (newsletter + durable rate limiting).
// Idempotent (IF NOT EXISTS). Run: node --env-file=.env.local scripts/migrate-subscribers-ratelimit.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis' },
});

await sql`
  create table if not exists subscribers (
    id              bigint generated always as identity primary key,
    email           text unique not null,
    source          text,
    lang            text,
    area_label      text,
    area_lat        double precision,
    area_lng        double precision,
    radius_km       integer not null default 20,
    categories      text[] not null default '{}',
    created_at      timestamptz default now(),
    unsubscribed_at timestamptz
  )
`;
// CREATE TABLE IF NOT EXISTS does not add new columns to an older install.
await sql`alter table subscribers add column if not exists area_label text`;
await sql`alter table subscribers add column if not exists area_lat double precision`;
await sql`alter table subscribers add column if not exists area_lng double precision`;
await sql`alter table subscribers add column if not exists radius_km integer not null default 20`;
await sql`alter table subscribers add column if not exists categories text[] not null default '{}'`;
await sql`alter table subscribers drop constraint if exists subscribers_radius_km_check`;
await sql`alter table subscribers add constraint subscribers_radius_km_check check (radius_km between 3 and 40)`;
await sql`
  create table if not exists rate_hits (
    id       bigint generated always as identity primary key,
    ip_hash  text not null,
    action   text not null,
    at       timestamptz default now()
  )
`;
await sql`create index if not exists rate_hits_lookup on rate_hits(action, ip_hash, at)`;
await sql`create index if not exists rate_hits_at on rate_hits(at)`;

const tables = await sql`select table_name from information_schema.tables where table_schema='umkreis' and table_name in ('subscribers','rate_hits') order by table_name`;
console.log('tables present:', tables.map((r) => r.table_name));
await sql.end();
