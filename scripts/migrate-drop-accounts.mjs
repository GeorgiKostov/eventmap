// Drop the account tables left over from Supabase Auth (removed 2026-11-13 with
// the move to Neon). Idempotent. Their last contents (0 favourites, 2
// contributions) are in the 2026-11-13 local pg_dump backup.
// Run: node --env-file=.env.local scripts/migrate-drop-accounts.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require', prepare: false, max: 1, connection: { search_path: 'umkreis' },
});
await sql`drop table if exists umkreis.event_contributions`;
await sql`drop table if exists umkreis.user_favorites`;
const rows = await sql`
  select table_name from information_schema.tables
  where table_schema='umkreis' and table_name in ('event_contributions','user_favorites')
`;
console.log(rows.length ? `still present: ${rows.map((r) => r.table_name).join(', ')}` : 'account tables dropped');
await sql.end();
