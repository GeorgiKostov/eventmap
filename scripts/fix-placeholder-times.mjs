#!/usr/bin/env node
// Backfill for the fabricated start time (lib/event-time.js).
//
//   node --env-file=.env.local scripts/fix-placeholder-times.mjs          # dry run
//   node --env-file=.env.local scripts/fix-placeholder-times.mjs --write
//
// WHAT WAS WRONG. Both write paths did `all_day: time ? 0 : 1` and
// `starts_at = date + 'T' + (time || '09:00')`. So an event whose source
// published NO time was stored as two separate fabrications:
//   · a 09:00 start nobody published, and
//   · all_day = true, which the UI renders as "ganztägig" — a CLAIM that the
//     event runs all day, i.e. that a parent may turn up whenever. For a 16:00
//     cinema screening that is simply false.
//
// WHY THE CONVERSION IS SAFE, not a guess. `all_day` was never a source fact:
// no parser, no adapter and no form ever set it from something a source SAID.
// Every path derived it from the absence of a time. Therefore
//     all_day = true  ≡  "we do not know the time"
// and rewriting those rows to a date-only starts_at with all_day = false loses
// nothing — it only stops asserting the two things we never knew.
//
// WHAT IS DELIBERATELY LEFT ALONE. Rows with all_day = false AND a 09:00 start:
// there, the extractor actually PARSED "09:00" from the source (crawl.mjs only
// clears all_day when it has a time). Traun's swim course really does run
// 09:00–13:00. Those are honest and are not touched — we cannot tell a real 9am
// from an extractor artefact without re-reading every source, and destroying a
// true time to satisfy a heuristic would be the same sin in the other direction.
//
// Rows are re-hashed, because content_hash embeds the time slot. Collisions are
// possible (a timeless row colliding with an existing one) and mean the two rows
// are the same event; the older survives, enriched.

import { contentHash } from '../lib/db.js';
import postgres from 'postgres';

const WRITE = process.argv.includes('--write');
const FILLABLE = ['description', 'venue', 'address', 'is_free', 'age_min', 'age_max', 'indoor', 'source_url', 'ends_at'];

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis, extensions' },
  idle_timeout: 20,
  max: 5,
});

const rows = await sql`
  SELECT id, kind, title, description, venue, address, town, starts_at, ends_at,
         all_day, is_free, indoor, age_min, age_max, source_name, source_url, status, content_hash
  FROM events
  WHERE kind='event' AND all_day = true
  ORDER BY id
`;

console.log(`${WRITE ? 'WRITE' : 'DRY RUN'} — ${rows.length} rows marked all_day (= "time unknown", never a source fact)\n`);

// Everything currently in the table, keyed by hash, so collisions are visible in
// the dry run exactly as they would be in the write.
const taken = new Map();
for (const r of await sql`SELECT id, content_hash, starts_at, all_day FROM events`) {
  taken.set(r.content_hash, r.id);
}

let updated = 0;
let merged = 0;
let sample = 0;

for (const row of rows) {
  const dateOnly = row.starts_at.slice(0, 10);
  const next = { ...row, starts_at: dateOnly, all_day: false };
  const newHash = contentHash(next);

  const clashId = taken.get(newHash);
  const collides = clashId && String(clashId) !== String(row.id);

  if (sample < 6 || collides) {
    console.log(`#${row.id} [${row.status}] ${row.source_name}`);
    console.log(`   ${row.starts_at} + "ganztägig"   →   ${dateOnly} + time unknown`);
    console.log(`   ${row.title.slice(0, 70)}`);
    if (collides) console.log(`   ⇄ collides with #${clashId} — same event; keeping the older row`);
    console.log('');
    sample++;
  }

  if (!WRITE) {
    if (collides) merged++; else updated++;
    continue;
  }

  if (collides) {
    // Same event, two rows. Keep the older id (saved lists reference ids), fill
    // whatever it is missing from this one, drop this one.
    const [keepId, dropId] = Number(clashId) < Number(row.id) ? [clashId, row.id] : [row.id, clashId];
    const [keeper] = await sql`SELECT ${sql(FILLABLE)} FROM events WHERE id=${keepId}`;
    const [loser] = await sql`SELECT ${sql(FILLABLE)} FROM events WHERE id=${dropId}`;
    const fill = {};
    for (const f of FILLABLE) {
      if ((keeper[f] === null || keeper[f] === '') && loser[f] !== null && loser[f] !== '') fill[f] = loser[f];
    }
    await sql`DELETE FROM events WHERE id=${dropId}`;
    await sql`
      UPDATE events SET starts_at=${dateOnly}, all_day=false, content_hash=${newHash},
        ${sql(Object.keys(fill).length ? fill : { updated_at: new Date() })}, updated_at=now()
      WHERE id=${keepId}
    `;
    taken.set(newHash, keepId);
    merged++;
    continue;
  }

  await sql`
    UPDATE events SET starts_at=${dateOnly}, all_day=false, content_hash=${newHash}, updated_at=now()
    WHERE id=${row.id}
  `;
  taken.set(newHash, row.id);
  updated++;
}

console.log('─'.repeat(64));
console.log(`all_day rows scanned:                 ${rows.length}`);
console.log(`${WRITE ? 'rewritten to date-only' : 'would rewrite to date-only'}:  ${updated}`);
console.log(`${WRITE ? 'merged into an existing row' : 'would merge (hash collision)'}: ${merged}`);
console.log('\nUNTOUCHED on purpose: rows with all_day=false at 09:00 — the source actually published 09:00.');
if (!WRITE) console.log('\nRe-run with --write to apply.');

await sql.end();
