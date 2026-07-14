// Create the `reactions` table — anonymous one-tap interest + data-quality reports.
// Idempotent (IF NOT EXISTS). Run: node --env-file=.env.local scripts/migrate-reactions.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis' },
});

await sql`
  create table if not exists reactions (
    id       bigint generated always as identity primary key,
    event_id bigint not null references events(id) on delete cascade,
    kind     text not null check (kind in ('interest','cancelled','wrong_time','wrong_info','not_free')),
    ip_hash  text not null,
    at       timestamptz default now(),
    unique (event_id, kind, ip_hash)
  )
`;
await sql`create index if not exists reactions_event_idx on reactions(event_id, kind)`;

const [{ n }] = await sql`select count(*)::int as n from reactions`;
console.log(`reactions table ready (${n} rows)`);
await sql.end();
