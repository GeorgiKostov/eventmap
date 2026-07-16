// Create the `highlights` table — paid/editorial event placement (see comment
// in db/schema.sql). Idempotent (IF NOT EXISTS). Run:
//   node --env-file=.env.local scripts/migrate-highlights.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis' },
});

await sql`
  create table if not exists highlights (
    id         bigint generated always as identity primary key,
    event_id   bigint not null references events(id) on delete cascade,
    tier       text not null check (tier in ('gold','editorial')),
    starts_at  text not null,
    ends_at    text not null,
    note       text,
    created_at timestamptz default now()
  )
`;
await sql`create index if not exists highlights_event_idx on highlights(event_id)`;

const [{ n }] = await sql`select count(*)::int as n from highlights`;
console.log(`highlights table ready (${n} rows)`);
await sql.end();
