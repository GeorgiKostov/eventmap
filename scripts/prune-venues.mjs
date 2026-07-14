// Prune venues-registry rows that sit implausibly far from their own town.
//
// Why this exists: the registry was SEEDED (scripts/migrate-venues.mjs) from
// events that already carried venue/address precision — but at that moment
// geocodeEvent's plain venue+town rung had NO distance bound, so a generic
// venue string ("Bühne 3") could be matched to a same-named place anywhere in
// the country and stored as a fact. The registry rung returns BEFORE any bound
// check (that is the point of a registry), so one poisoned row is served
// forever and survives every recrawl. Same family as the negative-geocache
// lesson: a cache seeded under a broken rule outlives the rule.
//
// Any row further than TOWN_BOUND_KM from its town's centroid is deleted, not
// "corrected" — deleting makes the next crawl re-derive it under the current
// (bounded) rules, which is the only trustworthy source of truth.
//
// Usage: node --env-file=.env.local scripts/prune-venues.mjs [--write]
import postgres from 'postgres';
import { distanceKm, normalizeName } from '../lib/geocode.js';
import { townCentroid } from '../lib/towns.js';

const WRITE = process.argv.includes('--write');
const BOUND_KM = 15;
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2, connection: { search_path: 'umkreis' } });

const venues = await sql`select id, name, town, country, lat, lng, resolved_via from venues where town is not null`;
console.log(`${venues.length} registry rows with a town`);

// Town centroids: static list first, then whatever the geocache already knows
// (never hammer Nominatim for a cleanup pass — a town we cannot locate is a
// town we cannot judge, and is left alone).
const suffix = { AT: 'Österreich', BG: 'България', DE: 'Deutschland' };
const cacheRows = await sql`select query, lat, lng from geocache where hit = true`;
const cache = new Map(cacheRows.map((r) => [r.query, { lat: r.lat, lng: r.lng }]));

const bad = [];
let unjudgeable = 0;
for (const v of venues) {
  const country = v.country || 'AT';
  const key = `${v.town}, ${suffix[country] || suffix.AT}`;
  const expected = (country === 'AT' ? townCentroid(v.town) : null)
    || cache.get(key) || cache.get(country === 'AT' ? key : `${key}|${country}`);
  if (!expected) { unjudgeable++; continue; }
  const d = distanceKm({ lat: v.lat, lng: v.lng }, expected);
  if (d > BOUND_KM) bad.push({ ...v, d });
}

bad.sort((a, b) => b.d - a.d);
console.log(`\n${bad.length} rows beyond ${BOUND_KM}km of their town (${unjudgeable} unjudgeable — town not locatable offline)\n`);
for (const b of bad.slice(0, 25)) {
  console.log(`  ${b.d.toFixed(0).padStart(4)}km  ${b.name.slice(0, 38).padEnd(38)} (${b.town}) via ${b.resolved_via}`);
}
if (bad.length > 25) console.log(`  … and ${bad.length - 25} more`);

if (WRITE && bad.length) {
  const res = await sql`delete from venues where id = any(${bad.map((b) => b.id)})`;
  console.log(`\ndeleted ${res.count} poisoned registry rows — the next crawl re-derives them under the bounded rules`);
} else if (!WRITE) {
  console.log('\n(dry-run — pass --write to delete)');
}

await sql.end();
