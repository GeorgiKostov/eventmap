// Seed kind='place' rows from data/mined/*.json files shaped like
// { _meta: {...}, places: [ <event-row-shape with kind:'place'>, ... ] }.
// (scripts/seed.mjs only handles kind='event' — normalizeEvent() there requires
// date_start, which places never have — so places get their own seed path.)
//
// Idempotent: dedup key mirrors lib/db.js contentHash() for places
// (`place|norm(title)|norm(town)`), so re-running is always safe.
//
// Usage:
//   node scripts/seed-places.mjs            # dry-run (default) — prints plan, writes nothing
//   node scripts/seed-places.mjs --write    # actually insert/update via upsertEvent
//   node scripts/seed-places.mjs --scope stuttgart-40km [--write]
//
// Requires DATABASE_URL (e.g. `node --env-file=.env.local scripts/seed-places.mjs`).
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import { upsertEvent, contentHash, closeDb } from '../lib/db.js';
import { CRAWL_SCOPES, isWithinCrawlScope, scopeFromCatalog } from '../lib/crawl-scopes.js';

const WRITE = process.argv.includes('--write');
const MINED_DIR = path.join(process.cwd(), 'data', 'mined');

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

// Fields scripts/seed-places.mjs strips before insert — provenance-only,
// not part of the events table (see data/mined/places-family-linz.json _meta).
const PROVENANCE_KEYS = ['_osm_category', '_osm_type', '_osm_id', '_wheelchair'];

function loadPlaceFiles(requestedScopeId, requestedFile) {
  let files = fs.readdirSync(MINED_DIR).filter((f) => f.endsWith('.json'));
  if (requestedFile) {
    const basename = path.basename(requestedFile);
    files = files.filter((file) => file === basename);
    if (!files.length) throw new Error(`Mined file not found: ${requestedFile}`);
  }
  const places = [];
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(MINED_DIR, file), 'utf8'));
    const scopeId = data?._meta?.scope || data?.scope || null;
    if (requestedScopeId && scopeId !== requestedScopeId) continue;
    const scope = scopeFromCatalog(data);
    if (!Array.isArray(data.places)) continue; // event-only mined files (source_registry/events) — skip
    for (const raw of data.places) {
      const p = { ...raw };
      for (const k of PROVENANCE_KEYS) delete p[k];
      places.push({ file, place: p, scope });
    }
  }
  return places;
}

function validate(p, scope) {
  if (!p.title) return 'missing title';
  if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return 'missing lat/lng';
  if (p.kind !== 'place') return `unexpected kind '${p.kind}'`;
  if (scope && p.country !== scope.country) return `country must be '${scope.country}' for ${scope.id}`;
  if (scope && !isWithinCrawlScope(p, scope)) return `outside ${scope.id}`;
  return null;
}

async function main() {
  const requestedScopeId = argValue('--scope');
  if (requestedScopeId && !CRAWL_SCOPES[requestedScopeId]) {
    throw new Error(`Unknown crawl scope "${requestedScopeId}". Known scopes: ${Object.keys(CRAWL_SCOPES).join(', ')}`);
  }
  const found = loadPlaceFiles(requestedScopeId, argValue('--file'));
  if (!found.length) {
    console.log(`No {places:[...]} files in ${MINED_DIR} — nothing to seed.`);
    return;
  }

  const valid = [];
  let invalid = 0;
  for (const { file, place, scope } of found) {
    const err = validate(place, scope);
    if (err) {
      console.log(`  ! skip (${err}): ${place.title || '(untitled)'} [${file}]`);
      invalid++;
      continue;
    }
    valid.push(place);
  }

  const hashes = valid.map((p) => contentHash(p));

  // Read-only existence check (dry-run and --write both report this; only
  // --write proceeds to actually touch the DB via upsertEvent).
  const sql = postgres(process.env.DATABASE_URL || '', {
    ssl: 'require', prepare: false, connection: { search_path: 'umkreis' }, max: 2,
  });
  let existingHashes = new Set();
  try {
    const rows = await sql`SELECT content_hash FROM events WHERE content_hash = ANY(${hashes})`;
    existingHashes = new Set(rows.map((r) => r.content_hash));
  } finally {
    await sql.end({ timeout: 5 });
  }

  let willInsert = 0, willUpdate = 0;
  for (let i = 0; i < valid.length; i++) {
    const p = valid[i];
    const isUpdate = existingHashes.has(hashes[i]);
    isUpdate ? willUpdate++ : willInsert++;
    const verb = isUpdate ? '↻ update' : '+ insert';
    console.log(`  ${verb}  ${p.title} @ ${p.town || '(no town)'} [${p.categories?.[0] || '?'}]`);
  }

  console.log(
    `\n${WRITE ? 'Write' : 'Dry-run'}: ${willInsert} to insert, ${willUpdate} to update, ` +
    `${invalid} invalid/skipped (of ${found.length} total).`
  );

  if (!WRITE) {
    console.log('Dry-run only — pass --write to actually apply. No rows were changed.');
    return;
  }

  let ok = 0, updated = 0;
  for (const p of valid) {
    const res = await upsertEvent(p);
    res.updated ? updated++ : ok++;
  }
  console.log(`Write done: ${ok} inserted, ${updated} updated.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(closeDb);
