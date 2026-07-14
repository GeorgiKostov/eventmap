// Idempotent: add events.enrich_attempted_at — the timestamp of the last time
// scripts/enrich-locations.mjs actually FETCHED this event's detail page (and,
// with --llm, paid a model to read it). Without it, a re-run walks the same
// stable ordering and re-pays for every event the previous run already proved
// has no location on its page — the enrichment equivalent of the page_hash
// skip the crawl has had all along.
// Usage: node --env-file=.env.local scripts/migrate-enrich-attempts.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2, connection: { search_path: 'umkreis' } });

await sql`alter table events add column if not exists enrich_attempted_at timestamptz`;
await sql`create index if not exists events_enrich_attempted_idx on events(enrich_attempted_at)`;

const [{ n }] = await sql`select count(*)::int as n from events where enrich_attempted_at is not null`;
console.log(`events.enrich_attempted_at ready (${n} rows already stamped)`);
await sql.end();
