#!/usr/bin/env node
// One-off text hygiene + the dedup it unlocks, for rows written before entity
// decoding moved to the write boundary (lib/db.js upsertEvent → lib/entities.js).
//
//   node --env-file=.env.local scripts/fix-entities.mjs            # dry run (default)
//   node --env-file=.env.local scripts/fix-entities.mjs --write
//
// Three things, in one pass, because they are the same bug:
//
//   1. DECODE. 66 published titles carried raw entity text ("Sommerfest &#8211;
//      Kramer in der Au") because nine partial decoders each missed numeric
//      references, and WordPress entity-encodes inside JSON-LD/RSS.
//   2. NORMALIZE. cleanText also trims/collapses whitespace. Rows written before
//      this existed carry untrimmed titles ("…der Erde "), which is not cosmetic:
//      hashPart() sees that trailing space, so identical events hashed apart.
//   3. RE-HASH, and merge what the re-hash proves identical. hashPart() strips
//      non-alphanumerics, so "&#8211;" leaves a literal "8211" inside the hash of
//      every affected row. Recomputing the hash is therefore mandatory — without
//      it the next crawl would not match the decoded row and would insert the
//      event a second time.
//
// Merging is deliberately NARROW: two rows merge only when their recomputed
// content_hash is byte-identical — same title, day, START TIME, town and venue.
// That is a proof of identity, not a guess. It is NOT the fuzzy same-day
// clustering of scripts/merge-dups.mjs, which currently keeps the OLDEST row and
// would happily drop a 18:30 showing in favour of a 09:00 placeholder.
//
// The survivor is the LOWER id (saved-event lists in localStorage reference ids,
// so the older row is the one a user may already hold), enriched with any field
// it is missing from its twin. Nothing is fabricated: only fields that exist on
// one row and are NULL on the other are copied across.

import { contentHash } from '../lib/db.js';
import { cleanText } from '../lib/entities.js';
import postgres from 'postgres';

const WRITE = process.argv.includes('--write');
const FIELDS = ['title', 'description', 'venue', 'address', 'town'];
// Fields worth inheriting from a duplicate that is about to be deleted.
const FILLABLE = ['description', 'venue', 'address', 'is_free', 'age_min', 'age_max', 'indoor', 'source_url', 'ends_at'];

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis, extensions' },
  idle_timeout: 20,
  max: 5,
});

const all = await sql`
  SELECT id, kind, title, description, venue, address, town, starts_at, ends_at,
         source_url, source_name, status, is_free, indoor, age_min, age_max,
         geo_precision, content_hash
  FROM events
  ORDER BY id
`;

// Clean every row in memory first, so collisions are detected against the
// POST-clean state of the whole table (a dry run must see exactly what a write
// would do — two legacy rows can only be shown to collide once both are cleaned).
const cleaned = all.map((r) => {
  const next = { ...r };
  for (const f of FIELDS) next[f] = cleanText(r[f]);
  next.newHash = contentHash(next);
  next.dirty = FIELDS.some((f) => next[f] !== r[f]) || next.newHash !== r.content_hash;
  return next;
});

const byHash = new Map();
for (const r of cleaned) {
  if (!byHash.has(r.newHash)) byHash.set(r.newHash, []);
  byHash.get(r.newHash).push(r);
}

const textFixed = cleaned.filter((r) => FIELDS.some((f, i) => r[f] !== all[cleaned.indexOf(r)][FIELDS[i]]));
const dupGroups = [...byHash.values()].filter((g) => g.length > 1);

console.log(`${WRITE ? 'WRITE' : 'DRY RUN'} — ${all.length} rows scanned`);
console.log(`  text to normalize: ${cleaned.filter((r) => FIELDS.some((f) => r[f] !== all.find((a) => a.id === r.id)[f])).length}`);
console.log(`  duplicate groups proven by identical re-hash: ${dupGroups.length} (${dupGroups.reduce((n, g) => n + g.length - 1, 0)} rows to remove)\n`);

let updated = 0;
let deleted = 0;
const drop = new Set();

// --- merge the provably-identical rows ---
for (const group of dupGroups) {
  const sorted = [...group].sort((a, b) => Number(a.id) - Number(b.id));
  const keeper = sorted[0];
  const losers = sorted.slice(1);
  const fill = {};
  for (const f of FILLABLE) {
    if (keeper[f] === null || keeper[f] === undefined || keeper[f] === '') {
      const donor = losers.find((l) => l[f] !== null && l[f] !== undefined && l[f] !== '');
      if (donor) fill[f] = donor[f];
    }
  }
  console.log(`= ${keeper.title} @ ${keeper.starts_at} (${keeper.town || '—'})`);
  console.log(`   KEEP   #${keeper.id} [${keeper.status}] ${keeper.source_name}`);
  for (const l of losers) {
    console.log(`   DELETE #${l.id} [${l.status}] ${l.source_name} — identical hash`);
    drop.add(String(l.id));
  }
  if (Object.keys(fill).length) console.log(`   ENRICH ${JSON.stringify(fill)}`);

  if (WRITE) {
    Object.assign(keeper, fill);
    // Delete the losers BEFORE re-hashing the keeper: content_hash is UNIQUE, and
    // the loser is precisely the row already holding the hash the keeper is about
    // to take. Update-then-delete violates the constraint.
    await sql`DELETE FROM events WHERE id IN ${sql(losers.map((l) => String(l.id)))}`;
    deleted += losers.length;
    await sql`
      UPDATE events SET
        title=${keeper.title}, description=${keeper.description ?? null},
        venue=${keeper.venue ?? null}, address=${keeper.address ?? null}, town=${keeper.town ?? null},
        ends_at=${keeper.ends_at ?? null}, is_free=${keeper.is_free ?? null},
        age_min=${keeper.age_min ?? null}, age_max=${keeper.age_max ?? null},
        indoor=${keeper.indoor ?? null}, source_url=${keeper.source_url ?? null},
        content_hash=${keeper.newHash}, updated_at=now()
      WHERE id=${keeper.id}
    `;
    updated++;
  }
  console.log('');
}

// --- normalize the rest ---
for (const r of cleaned) {
  if (drop.has(String(r.id))) continue;
  if (byHash.get(r.newHash).length > 1) continue; // handled above
  const before = all.find((a) => a.id === r.id);
  const textChanged = FIELDS.some((f) => r[f] !== before[f]);
  // ONLY rows whose text actually changed. ~28k rows still carry the pre-2026-07
  // legacy hash (title|day|town), and rewriting those to the occurrence-aware
  // format wholesale would be a bad trade: upsertEvent's legacy path re-matches
  // them deliberately (exact starts_at + non-conflicting venue), which tolerates
  // a row whose venue was null when it was first written. Blindly re-hashing them
  // to include an empty venue would break that match and let the NEXT crawl insert
  // a second copy — manufacturing the very duplicates this script exists to remove.
  // Legacy hashes are not corrupt; entity/whitespace hashes are. Touch only those.
  if (!textChanged) continue;

  if (textChanged) {
    console.log(`#${r.id} [${r.status}] ${r.source_name}`);
    console.log(`   -  ${JSON.stringify(before.title)}`);
    console.log(`   +  ${JSON.stringify(r.title)}`);
    for (const f of ['description', 'venue', 'address', 'town']) {
      if (r[f] !== before[f]) console.log(`   ${f}: ${JSON.stringify(before[f])} → ${JSON.stringify(r[f])}`);
    }
    console.log('');
  }
  if (WRITE) {
    await sql`
      UPDATE events SET title=${r.title}, description=${r.description ?? null},
        venue=${r.venue ?? null}, address=${r.address ?? null}, town=${r.town ?? null},
        content_hash=${r.newHash}, updated_at=now()
      WHERE id=${r.id}
    `;
    updated++;
  }
}

console.log('─'.repeat(60));
const wouldUpdate = cleaned.filter(
  (r) => !drop.has(String(r.id))
    && FIELDS.some((f) => r[f] !== all.find((a) => a.id === r.id)[f]),
).length;
console.log(`rows scanned:  ${all.length}`);
console.log(`${WRITE ? 'updated' : 'would update'}: ${WRITE ? updated : wouldUpdate} (text normalized + re-hashed)`);
console.log(`${WRITE ? 'deleted' : 'would delete'}: ${WRITE ? deleted : drop.size} (exact duplicates, merged into the older row)`);
if (!WRITE) console.log('\nRe-run with --write to apply.');

await sql.end();
