// Idempotent migration: enable pgvector and add a nullable embedding column to
// umkreis.events, backing scripts/embed-dedup.mjs's cross-source near-duplicate
// detection (report-only for now — see that script). Mirrors the style of
// scripts/migrate-venues.mjs (own short-lived postgres connection, not lib/db.js).
// Usage: node --env-file=.env.local scripts/migrate-embeddings.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2, connection: { search_path: 'umkreis' } });

await sql`create extension if not exists vector`;
console.log('vector extension ready');

// 768 dims to match lib/embed.js's outputDimensionality. No index yet — we're
// at ~25k rows, well within a sequential-scan-per-day-bucket budget for the
// report script; add an ivfflat/hnsw index later if/when this becomes the
// steady-state refresh path (hard rule 7 territory, not yet).
await sql`alter table events add column if not exists embedding vector(768)`;
console.log('events.embedding column ready');

await sql.end();
