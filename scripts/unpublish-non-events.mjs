// Unpublish already-stored rows that lib/non-events.js says are not events
// (waste collection, office hours, council sittings). New writes are caught in
// upsertEvent; this backfills rows written before the rule existed.
// Reversible: status='removed'. Dry run unless --write.
//
// Usage: node --env-file=.env.local scripts/unpublish-non-events.mjs [--write]
import postgres from 'postgres';
import { isNonEventTitle } from '../lib/non-events.js';

const write = process.argv.includes('--write');
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });
try {
  const rows = await sql`SELECT id, title FROM events WHERE status='published' AND kind='event'`;
  const hits = rows.filter((r) => isNonEventTitle(r.title));
  const byTitle = {};
  for (const r of hits) byTitle[r.title] = (byTitle[r.title] || 0) + 1;
  for (const [t, n] of Object.entries(byTitle).sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`${String(n).padStart(4)}  ${t}`);
  console.log(`\n${hits.length} published non-event row(s) of ${rows.length}.`);
  if (write && hits.length) {
    const res = await sql`UPDATE events SET status='removed', updated_at=now()
      WHERE id = ANY(${hits.map((r) => r.id)}::bigint[]) AND status='published'`;
    console.log(`Unpublished ${res.count}.`);
  } else if (!write) console.log('Dry run — pass --write to unpublish.');
} finally { await sql.end(); }
