// Snap every town-precision event onto its town's exact centroid.
//
// Until today geocodeEvent added a random ±300m "jitter" to town-level results
// so pins wouldn't stack. That invented a position for ~11k events — in Wiener
// Neustadt, 170 events sat scattered across a few blocks at coordinates nobody
// published, which at street zoom look exactly like real venues. The jitter is
// gone from the geocoder; this removes it from the data already written.
//
// After this, every town-level event in a town shares ONE coordinate, which is
// what lets the map collapse them into a single honest "N events in <town>"
// group instead of a field of fake pins.
//
// Centroid source, in order: the town's cached Nominatim/static centroid
// (authoritative), else the MEDIAN of the group's own coordinates — the jitter
// was symmetric, so the median recovers the centre it was scattered around
// without a single network call.
//
// Usage: node --env-file=.env.local scripts/snap-town-pins.mjs [--write]
import postgres from 'postgres';
import { townCentroid } from '../lib/towns.js';

const WRITE = process.argv.includes('--write');
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2, connection: { search_path: 'umkreis' } });

const SUFFIX = { AT: 'Österreich', BG: 'България', DE: 'Deutschland' };

// NB: aggregate lat and lng together (avg of each), never array_agg(lat order by
// lat) + array_agg(lng order by lng) — those sort INDEPENDENTLY, so element i
// pairs one event's latitude with a different event's longitude, yielding a
// corner point no event occupies (it reported a phantom 5km outlier).
const groups = await sql`
  select town, country, count(*)::int n, avg(lat)::float8 avg_lat, avg(lng)::float8 avg_lng
  from events
  where status='published' and geo_precision='town' and town is not null
  group by town, country`;
console.log(`${groups.length} (town, country) groups, ${groups.reduce((s, g) => s + g.n, 0)} events`);

const cacheRows = await sql`select query, lat, lng from geocache where hit = true`;
const cache = new Map(cacheRows.map((r) => [r.query, { lat: r.lat, lng: r.lng }]));
let fromCentroid = 0, fromMedian = 0, moved = 0, maxMove = 0;
const dist = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 74); // rough km, AT latitudes

for (const g of groups) {
  const country = g.country || 'AT';
  const key = `${g.town}, ${SUFFIX[country] || SUFFIX.AT}`;
  const centroid = (country === 'AT' ? townCentroid(g.town) : null)
    || cache.get(key) || cache.get(`${key}|${country}`);
  // Fallback: the group's own centre. The jitter was symmetric, so the mean of
  // the scattered points recovers the centre they were scattered around.
  const target = centroid || { lat: g.avg_lat, lng: g.avg_lng };
  if (centroid) fromCentroid++; else fromMedian++;

  // Sanity: how far the group's current centre is from where it will land. The
  // jitter was ±0.3km, so a large value means the stored coords were never a
  // jittered centroid — worth seeing before moving 10k rows.
  maxMove = Math.max(maxMove, dist({ lat: g.avg_lat, lng: g.avg_lng }, target));

  if (WRITE) {
    const res = await sql`
      update events set lat=${target.lat}, lng=${target.lng}, updated_at=now()
      where status='published' and geo_precision='town'
        and town=${g.town} and country=${country}
        and (lat <> ${target.lat} or lng <> ${target.lng})`;
    moved += res.count;
  }
}

console.log(`centroid known for ${fromCentroid} groups, median fallback for ${fromMedian}`);
console.log(`largest correction: ${maxMove.toFixed(2)} km (jitter was ±0.3 km — anything much larger means a group spans two real places)`);
console.log(WRITE ? `snapped ${moved} events onto their town centroid` : '(dry-run — pass --write)');
await sql.end();
