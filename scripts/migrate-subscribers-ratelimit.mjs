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
    created_at      timestamptz default now(),
    unsubscribed_at timestamptz
  )
`;
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
