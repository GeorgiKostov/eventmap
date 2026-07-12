// Add `country` (ISO 3166-1 alpha-2, default 'AT') to events + sources, for
// multi-country ingestion (starting with Bulgaria — see
// docs/playbooks/country-mining-playbook.md and briefs/bulgaria-grok-kit.md).
// Idempotent (IF NOT EXISTS). Run: node --env-file=.env.local scripts/migrate-country.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis' },
});

await sql`alter table events  add column if not exists country text not null default 'AT'`;
await sql`alter table sources add column if not exists country text not null default 'AT'`;

const counts = await sql`
  select 'events' as tbl, country, count(*)::int as n from events group by country
  union all
  select 'sources' as tbl, country, count(*)::int as n from sources group by country
  order by tbl, country
`;
console.log('country column present. row counts:', counts);
await sql.end();
