#!/usr/bin/env node
// One-off, idempotent: move upcoming events that carry their LISTING town into
// the town their own address names (lib/address-town.js), the same rule the
// crawl applies since 2026-11-14. Neighbour copies of one event then share a
// content_hash; the later copy is unpublished (status='removed', nothing is
// deleted) instead of staying a second pin.
//
//   node --env-file=.env.local scripts/migrate-address-towns.mjs --dry-run
//   node --env-file=.env.local scripts/migrate-address-towns.mjs [--limit N]
//
// Geocoding goes through lib/geocode.js (geocache + venue registry first,
// polite Nominatim after), so a full run takes a while; re-running resumes.
import postgres from 'postgres';
import { addressTown, sameTown } from '../lib/address-town.js';
import { geocodeEvent } from '../lib/geocode.js';
import { contentHash, closeDb } from '../lib/db.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitAt = args.indexOf('--limit');
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;

const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require', prepare: false, connection: { search_path: 'umkreis, extensions' },
});

try {
  const rows = await sql`
    SELECT e.id, e.title, e.starts_at, e.venue, e.address, e.town, e.country, s.town AS source_town
    FROM events e LEFT JOIN sources s ON s.name = e.source_name
    WHERE e.status='published' AND e.kind='event'
      AND left(e.starts_at, 10) >= to_char(now() AT TIME ZONE 'Europe/Vienna', 'YYYY-MM-DD')
      AND e.address ~ '\\d{4,5}\\s+[^,0-9]+$'
    ORDER BY e.id
  `;
  // Same condition as the crawl: only rows whose town is the source's own town.
  const todo = rows.filter((r) => {
    const place = addressTown(r.address);
    return place && !sameTown(place, r.town) && (!r.source_town || sameTown(r.town, r.source_town));
  });
  console.log(`${todo.length} event(s) carry a town their address contradicts (${rows.length} with a postcode address).`);
  if (dryRun) {
    for (const r of todo.slice(0, 20)) console.log(`  ${r.id} | ${r.town} → ${addressTown(r.address)} | ${r.title}`);
    process.exit(0);
  }

  let moved = 0, merged = 0, kept = 0, done = 0;
  for (const r of todo) {
    if (done++ >= limit) break;
    const town = addressTown(r.address);
    const geo = await geocodeEvent({ ...r, town, country: r.country || 'AT' }, { jitterTown: false });
    if (!geo || geo.geo_precision === 'town') { kept++; continue; }
    const hash = contentHash({ ...r, kind: 'event', town });
    const [twin] = await sql`SELECT id, status FROM events WHERE content_hash=${hash} AND id <> ${r.id}`;
    if (twin) {
      if (twin.status === 'published') {
        await sql`UPDATE events SET status='removed', updated_at=now() WHERE id=${r.id}`;
        merged++;
      } else {
        kept++;
      }
      continue;
    }
    await sql`
      UPDATE events SET town=${town}, lat=${geo.lat}, lng=${geo.lng},
        geo_precision=${geo.geo_precision}, content_hash=${hash}, updated_at=now()
      WHERE id=${r.id}
    `;
    moved++;
    if (moved % 100 === 0) console.log(`  … ${moved} moved, ${merged} merged, ${kept} kept`);
  }
  console.log(`${moved} moved to their address town, ${merged} neighbour copies unpublished, ${kept} left as they were.`);
} finally {
  await sql.end();
  await closeDb();
}
