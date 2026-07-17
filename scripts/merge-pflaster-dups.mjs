// One-off targeted merge of the four legacy Pflasterspektakel duplicates.
//
// Why they exist: all four were crawled 2026-07-10..15, BEFORE crawl-time fuzzy
// dedup shipped (e326335, 2026-07-16). Today's matcher merges all four — the
// guard simply arrived after they were already in the table. They do not
// self-heal either: each row keeps matching its own content_hash on every crawl
// and is updated in place, so the fuzzy path (which only runs for NEW events)
// never sees them.
//
// Survivor: id 14 — the only row carrying linztermine's real event permalink
// (/event/718976). The others point at monthly listing pages. It is enriched
// with 2766's start/end (23.07 16:00 -> 25.07 23:00), which is a published fact,
// not an inference: the festival's own site states "DO 16 – 23 Uhr, FR & SA
// 14 – 23 Uhr", and Linz-Termine extracted the same 16:00.
//
// content_hash is deliberately NOT recomputed: it encodes the event as its
// source published it (no start time → contentHash's time slot, starts.slice(11,16),
// is empty). Re-hashing it from the enriched value could only ever cause a MISS
// and a fresh duplicate — precisely the bug this script removes.
//
// Why the enrichment is stable — and it is NOT the reason you would guess:
// `starts_at` is absent from UPDATABLE_FIELDS, but that set only governs
// updateEventFields() (the fuzzy-merge enrich path). upsertEvent's OWN update
// branch does `starts_at=${ev.starts_at}` unconditionally, so a crawl that
// matched this row WOULD stomp the 16:00 straight back out. It doesn't, because
// **row 14 is an orphan**: its source_name 'linztermine.at' matches no
// registered source (all 24 such rows date from the 2026-07-10 mining run), and
// the one live linztermine source — id 1, "Linz-Termine" — publishes the title
// with a trailing "Linz", which hashes differently and is what produced 2766.
// Nothing in the pipeline computes row 14's content_hash, so nothing rewrites it.
//
// The same fact is the trade-off, and it is worth stating out loud: the row we
// KEEP is the unmaintained one, and the row we retire (2766) is the one
// Linz-Termine actually re-crawls. If the festival were cancelled or moved in
// the next few days, 2766's crawl would quietly update a removed row while
// published row 14 kept saying it's on. Accepted for an 8-day window on a
// 38-year-old festival, and users can still report `cancelled` — but if this
// event ever needs to be *trusted* to change, prefer the crawled row.
//
// Retired rows stay retired by construction: upsertEvent's update never touches
// `status` (only setEventStatus does), so their own sources keep matching them
// by content_hash and updating a removed row rather than inserting a new one.
//
// Reversible: the retired rows are status='removed', flip back to 'published'.
// Idempotent: re-running sets the same values.
//
// Usage: node --env-file=.env.local scripts/merge-pflaster-dups.mjs [--write]

import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis' },
});

const WRITE = process.argv.includes('--write');
const KEEP = '14';
const RETIRE = ['2766', '3226', '32513'];
const NEW_START = '2026-07-23T16:00';
const NEW_END = '2026-07-25T23:00';
const ALL = [KEEP, ...RETIRE];

const snapshot = () => sql`
  SELECT id, status, title, starts_at, ends_at, source_url, content_hash
  FROM events WHERE id IN ${sql(ALL)} ORDER BY id`;

const before = await snapshot();
console.log(`=== BEFORE (${WRITE ? 'WRITE' : 'DRY RUN — pass --write to apply'}) ===`);
for (const r of before) {
  console.log(`[${r.id}] ${r.status.padEnd(9)} ${r.starts_at} -> ${r.ends_at}`);
  console.log(`      ${r.title}`);
  console.log(`      ${r.source_url}`);
}

if (WRITE) {
  await sql`UPDATE events SET starts_at=${NEW_START}, ends_at=${NEW_END}, updated_at=now() WHERE id=${KEEP}`;
  await sql`UPDATE events SET status='removed', updated_at=now() WHERE id IN ${sql(RETIRE)}`;
}

const after = await snapshot();
console.log('\n=== AFTER ===');
for (const r of after) {
  const was = before.find((b) => b.id === r.id);
  console.log(`[${r.id}] ${r.status.padEnd(9)} ${r.starts_at} -> ${r.ends_at}  | content_hash unchanged: ${was.content_hash === r.content_hash}`);
}

const live = await sql`
  SELECT id, title, starts_at, ends_at, source_url FROM events
  WHERE title ILIKE ${'%pflaster%'} AND status='published' ORDER BY id`;
console.log(`\npublished Pflasterspektakel rows now: ${live.length}`);
for (const r of live) console.log(`  [${r.id}] ${r.starts_at} -> ${r.ends_at} | ${r.title}\n        ${r.source_url}`);
await sql.end();
