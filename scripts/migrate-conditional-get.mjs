// Conditional GET (CLAUDE.md task): adds etag/last_modified to sources so
// scripts/crawl.mjs's generic fetch can send If-None-Match/If-Modified-Since
// and skip re-downloading + re-hashing a page the server says is unchanged.
// Idempotent — safe to re-run.
// Run: node --env-file=.env.local scripts/migrate-conditional-get.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis, extensions' },
});

await sql`alter table sources add column if not exists etag text`;
await sql`alter table sources add column if not exists last_modified text`;

console.log('sources.etag / sources.last_modified ready');
await sql.end();
