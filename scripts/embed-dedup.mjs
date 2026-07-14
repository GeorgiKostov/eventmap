// Embedding-based near-duplicate DETECTION — report only, no writes to events
// besides the embedding backfill itself. Goal: catch cross-source duplicate
// events the lexical Jaccard/containment logic in lib/dedup.js misses
// (rephrased titles, DE<->BG cross-language same event) so we can review
// candidates before ever wiring this into scripts/merge-dups.mjs.
//
// Two phases, run independently or together:
//   backfill  — embed `title | venue | town` for published events with
//               embedding IS NULL, batched + rate-limit-friendly.
//   report    — for PUBLISHED kind='event' rows sharing a Vienna calendar day
//               (starts_at's first 10 chars), find pairs whose pgvector cosine
//               similarity (1 - cosine distance, computed in SQL via `<=>`)
//               exceeds --threshold (default 0.88). Cross-checks each pair
//               against the EXISTING lib/dedup.js findDuplicate so the
//               interesting output is what embeddings catch that lexical
//               dedup misses.
//
// Usage:
//   node --env-file=.env.local scripts/embed-dedup.mjs                       (backfill scope=bigcities, then report)
//   node --env-file=.env.local scripts/embed-dedup.mjs backfill              (backfill only)
//   node --env-file=.env.local scripts/embed-dedup.mjs backfill --scope all  (every published row, slower/costlier)
//   node --env-file=.env.local scripts/embed-dedup.mjs report --threshold 0.92
//
// Requires scripts/migrate-embeddings.mjs to have run first (events.embedding
// column + pgvector extension).
import postgres from 'postgres';
import { distanceKm } from '../lib/geocode.js';
import { findDuplicate } from '../lib/dedup.js';
import { embedTexts } from '../lib/embed.js';

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 3, connection: { search_path: 'umkreis' } });

const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('--')) || 'all';
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? dflt : args[i + 1];
};
const SCOPE = flag('scope', 'bigcities'); // bigcities | all
const THRESHOLD = Number(flag('threshold', 0.88));
const LIMIT_PAIRS = Number(flag('limit', 200));
const BATCH_SIZE = Number(flag('batch-size', 100)); // Gemini batchEmbedContents hard cap is 100/request

// docs/design/big-city-quality.md — the five 40km AT city zones, plus all of
// BG (cross-language DE<->BG duplicates are exactly what lexical dedup can't
// see — different alphabets never share tokens).
const ZONES = {
  wien: { lat: 48.2082, lng: 16.3738 },
  linz: { lat: 48.3069, lng: 14.2858 },
  graz: { lat: 47.0707, lng: 15.4395 },
  salzburg: { lat: 47.8095, lng: 13.055 },
  innsbruck: { lat: 47.2692, lng: 11.4041 },
};
const ZONE_KM = 40;
const inBigCityZones = (e) => Object.values(ZONES).some((z) => distanceKm(e, z) <= ZONE_KM);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- backfill ---
async function backfill() {
  let rows = await sql`
    SELECT id, kind, title, venue, town, lat, lng, country
    FROM events
    WHERE status='published' AND embedding IS NULL
    ORDER BY id
  `;
  if (SCOPE === 'bigcities') {
    rows = rows.filter((r) => r.country === 'BG' || inBigCityZones({ lat: r.lat, lng: r.lng }));
  }
  console.log(`backfill scope=${SCOPE}: ${rows.length} row(s) with embedding IS NULL to embed`);
  if (!rows.length) return;

  let done = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const texts = batch.map((r) => `${r.title || ''} | ${r.venue || ''} | ${r.town || ''}`);

    let vectors = null;
    let attempt = 0;
    while (attempt < 5 && !vectors) {
      try {
        vectors = await embedTexts(texts);
      } catch (e) {
        attempt++;
        const is429 = /429|rate|quota/i.test(String(e?.message || e));
        if (attempt >= 5) {
          console.error(`  batch at offset ${i} failed after ${attempt} attempts: ${e.message || e}`);
          failed += batch.length;
          break;
        }
        const backoffMs = is429 ? 2000 * 2 ** attempt : 1000 * attempt;
        console.warn(`  batch at offset ${i} attempt ${attempt} failed (${e.message || e}); retrying in ${backoffMs}ms`);
        await sleep(backoffMs);
      }
    }
    if (vectors) {
      for (let j = 0; j < batch.length; j++) {
        const vecStr = `[${vectors[j].join(',')}]`;
        await sql`UPDATE events SET embedding = ${vecStr}::vector WHERE id = ${batch[j].id}`;
      }
      done += batch.length;
    }

    if (Math.floor(done / 500) > Math.floor((done - batch.length) / 500) || i + BATCH_SIZE >= rows.length) {
      console.log(`  progress: ${done}/${rows.length} embedded${failed ? `, ${failed} failed` : ''}`);
    }
    await sleep(1100); // stay friendly to the free-tier embedding RPM limit
  }
  console.log(`backfill done: ${done} embedded, ${failed} failed`);
}

// --- report ---
async function report() {
  const pairs = await sql`
    SELECT
      a.id AS id_a, b.id AS id_b,
      a.title AS title_a, b.title AS title_b,
      a.town AS town_a, b.town AS town_b,
      a.starts_at AS starts_at_a, b.starts_at AS starts_at_b,
      a.all_day AS all_day_a, b.all_day AS all_day_b,
      a.lat AS lat_a, a.lng AS lng_a, b.lat AS lat_b, b.lng AS lng_b,
      a.geo_precision AS geo_precision_a, b.geo_precision AS geo_precision_b,
      a.source_name AS source_name_a, b.source_name AS source_name_b,
      a.source_url AS source_url_a, b.source_url AS source_url_b,
      1 - (a.embedding <=> b.embedding) AS similarity
    FROM events a
    JOIN events b
      ON b.id > a.id
      AND left(b.starts_at, 10) = left(a.starts_at, 10)
    WHERE a.kind='event' AND b.kind='event'
      AND a.status='published' AND b.status='published'
      AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
      AND (1 - (a.embedding <=> b.embedding)) >= ${THRESHOLD}
    ORDER BY similarity DESC
    LIMIT ${LIMIT_PAIRS}
  `;

  console.log(`\n${pairs.length} candidate pair(s) at similarity >= ${THRESHOLD} (capped at ${LIMIT_PAIRS}):\n`);

  let lexicalCaughtCount = 0;
  let novelCount = 0;
  for (const p of pairs) {
    const shapedA = {
      id: p.id_a, title: p.title_a, starts_at: p.starts_at_a, town: p.town_a,
      lat: p.lat_a, lng: p.lng_a, geo_precision: p.geo_precision_a, all_day: p.all_day_a, kind: 'event',
    };
    const shapedB = {
      id: p.id_b, title: p.title_b, starts_at: p.starts_at_b, town: p.town_b,
      lat: p.lat_b, lng: p.lng_b, geo_precision: p.geo_precision_b, all_day: p.all_day_b, kind: 'event',
    };
    const lexicalCaught = !!findDuplicate(shapedB, [shapedA]);
    if (lexicalCaught) lexicalCaughtCount++; else novelCount++;

    console.log(`sim=${Number(p.similarity).toFixed(4)} lexical=${lexicalCaught ? 'YES' : 'no'}`);
    console.log(`  A #${p.id_a} "${p.title_a}" @ ${p.starts_at_a} (${p.town_a || '?'}) — ${p.source_name_a || '?'} ${p.source_url_a ? `<${p.source_url_a}>` : ''}`);
    console.log(`  B #${p.id_b} "${p.title_b}" @ ${p.starts_at_b} (${p.town_b || '?'}) — ${p.source_name_b || '?'} ${p.source_url_b ? `<${p.source_url_b}>` : ''}`);
    console.log('');
  }

  console.log(`Summary: ${pairs.length} pair(s) total — ${lexicalCaughtCount} already caught by lexical dedup, ${novelCount} novel (embeddings-only).`);
}

async function main() {
  if (cmd === 'backfill') {
    await backfill();
  } else if (cmd === 'report') {
    await report();
  } else {
    await backfill();
    await report();
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
