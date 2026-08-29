// Account contribution/favourite ledger. Provider-neutral UUIDs keep the
// umkreis schema portable; Supabase Auth is the current identity issuer only.
// Run: node --env-file=.env.local scripts/migrate-accounts.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis' },
});

await sql`
  create table if not exists event_contributions (
    id                bigint generated always as identity primary key,
    user_id           uuid not null,
    event_id          bigint not null references events(id) on delete cascade,
    contribution_kind text not null check (contribution_kind in ('manual','photo','link')),
    merged            boolean not null default false,
    created_at        timestamptz default now(),
    updated_at        timestamptz default now(),
    unique (user_id, event_id)
  )
`;
await sql`create index if not exists event_contributions_user_idx on event_contributions(user_id, updated_at desc)`;
await sql`alter table event_contributions enable row level security`;

await sql`
  create table if not exists user_favorites (
    user_id  uuid not null,
    event_id bigint not null references events(id) on delete cascade,
    saved_at timestamptz default now(),
    primary key (user_id, event_id)
  )
`;
await sql`create index if not exists user_favorites_user_idx on user_favorites(user_id, saved_at desc)`;
await sql`alter table user_favorites enable row level security`;

const [counts] = await sql`
  select
    (select count(*)::int from event_contributions) as contributions,
    (select count(*)::int from user_favorites) as favorites
`;
console.log(`account tables ready (${counts.contributions} contributions, ${counts.favorites} favourites)`);
await sql.end();
