#!/usr/bin/env node
// One-off, idempotent: collapse upcoming GEM2GO events that several municipal
// sites list under one object id (lib/listing-twins.js). Keeps the best row
// (the publisher's own copy, then the most precise pin, then the oldest) and
// sets the others to status='removed'. Nothing is deleted. The crawl applies
// the same rule to new rows since 2026-11-14.
//
//   node --env-file=.env.local scripts/migrate-listing-twins.mjs [--dry-run]
import postgres from 'postgres';
import { gem2goObjectId, sameListingTitle, pickKeeper } from '../lib/listing-twins.js';

const dryRun = process.argv.includes('--dry-run');
const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require', prepare: false, connection: { search_path: 'umkreis, extensions' },
});

try {
  const rows = await sql`
    SELECT id, title, starts_at, town, address, geo_precision, source_url FROM events
    WHERE status='published' AND kind='event' AND source_url ~ '[?&]detailonr=\\d+-\\d+'
      AND left(starts_at, 10) >= to_char(now() AT TIME ZONE 'Europe/Vienna', 'YYYY-MM-DD')
  `;
  const groups = new Map();
  for (const r of rows) {
    const key = `${gem2goObjectId(r.source_url)}|${r.starts_at}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const remove = [];
  let collapsed = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Same object + start but a different title is not assumed to be the same event.
    const byTitle = [];
    for (const r of group) {
      const bucket = byTitle.find((b) => sameListingTitle(b[0].title, r.title));
      if (bucket) bucket.push(r); else byTitle.push([r]);
    }
    for (const twins of byTitle) {
      if (twins.length < 2) continue;
      const keeper = pickKeeper(twins);
      collapsed++;
      for (const r of twins) if (r.id !== keeper.id) remove.push(r.id);
      if (dryRun && collapsed <= 10) {
        console.log(`keep ${keeper.id} ${keeper.town} | drop ${twins.filter((r) => r.id !== keeper.id).map((r) => `${r.id} ${r.town}`).join(', ')} | ${keeper.title}`);
      }
    }
  }
  if (!dryRun && remove.length) {
    await sql`UPDATE events SET status='removed', updated_at=now()
      WHERE id = ANY(${remove}::bigint[]) AND status='published'`;
  }
  console.log(`${collapsed} event(s) listed by several sites; ${remove.length} copies ${dryRun ? 'would be' : ''} unpublished.`);
} finally {
  await sql.end();
}
