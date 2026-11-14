#!/usr/bin/env node
// One-off, idempotent: unpublish already-stored events whose title says they are
// cancelled. New crawls apply the same rule at the write boundary
// (lib/cancellation.js via upsertEvent); this catches rows written before it.
// Reversible: rows become status='removed', nothing is deleted.
//
//   node --env-file=.env.local scripts/migrate-cancelled-events.mjs [--dry-run]
import postgres from 'postgres';
import { isCancelledTitle } from '../lib/cancellation.js';

const dryRun = process.argv.includes('--dry-run');
const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require', prepare: false, connection: { search_path: 'umkreis, extensions' },
});
try {
  // Coarse SQL prefilter, exact decision in JS (same rule as the crawl).
  const rows = await sql`
    SELECT id, title, starts_at, town FROM events
    WHERE status='published' AND kind='event'
      AND title ~* '(abgesag|entf(ä|ae)llt|f(ä|ae)llt\\s+aus|verschoben|storniert|cancell?ed|postponed|nicht\\s+statt)'
  `;
  const hits = rows.filter((r) => isCancelledTitle(r.title));
  for (const r of hits) console.log(`${dryRun ? 'would remove' : 'remove'} ${r.id} | ${r.starts_at} | ${r.town} | ${r.title}`);
  if (!dryRun && hits.length) {
    await sql`UPDATE events SET status='removed', updated_at=now() WHERE id = ANY(${hits.map((r) => r.id)}::bigint[]) AND status='published'`;
  }
  console.log(`${hits.length} cancelled event(s) ${dryRun ? 'found' : 'unpublished'} (${rows.length} prefiltered).`);
} finally {
  await sql.end();
}
