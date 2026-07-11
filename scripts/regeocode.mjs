// Repair pass for events/places whose stored coordinates look wrong: rows
// that fell back to their town's centroid, or rows with a venue name where
// the (now-improved) POI-first geocoding waterfall finds a confident point
// meaningfully far from what's stored. DRY-RUN by default — prints a table
// of proposed moves; --write applies them.
// Usage: node --env-file=.env.local scripts/regeocode.mjs
//        node --env-file=.env.local scripts/regeocode.mjs --write
import { closeDb, purgeNegativeGeocache, getGeocodeCandidateRows, updateEventCoords } from '../lib/db.js';
import { geocodeEvent, distanceKm } from '../lib/geocode.js';

const WRITE = process.argv.includes('--write');
const MOVE_THRESHOLD_KM = 0.15; // 150 m

function fmtCoord(lat, lng) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

async function main() {
  const purged = await purgeNegativeGeocache();
  console.log(`Purged ${purged} negative geocache row(s) (2026-07-11 lesson: rule changed, retry misses).`);

  const rows = await getGeocodeCandidateRows();
  console.log(`Checking ${rows.length} candidate row(s) (geo_precision='town' or venue present)...`);

  const moves = [];
  let checked = 0;
  for (const row of rows) {
    checked++;
    const ev = { venue: row.venue, address: row.address, town: row.town };
    let geo;
    try {
      geo = await geocodeEvent(ev);
    } catch (e) {
      console.log(`  [${row.id}] geocode error: ${e.message}`);
      continue;
    }
    if (!geo) continue; // no confident result → leave as-is, never fabricate

    const was = { lat: row.lat, lng: row.lng };
    const now = { lat: geo.lat, lng: geo.lng };
    const dist = distanceKm(was, now);
    const improvedFromTown = row.geo_precision === 'town' && geo.geo_precision !== 'town';
    if (!improvedFromTown && dist <= MOVE_THRESHOLD_KM) continue; // no meaningful change

    moves.push({
      id: row.id,
      kind: row.kind,
      title: row.title,
      venue: row.venue,
      old: was,
      new: now,
      distKm: dist,
      oldPrecision: row.geo_precision,
      newPrecision: geo.geo_precision,
      matchedName: geo.label || null,
    });

    if (checked % 25 === 0) console.log(`  ...${checked}/${rows.length} checked, ${moves.length} move(s) so far`);
  }

  if (!moves.length) {
    console.log('\nNo proposed moves.');
  } else {
    console.log(`\n${moves.length} proposed move(s):\n`);
    console.log(
      ['id', 'kind', 'title', 'venue', 'old coords', 'new coords', 'dist(km)', 'old→new precision', 'matched OSM name']
        .join(' | ')
    );
    for (const m of moves) {
      console.log(
        [
          m.id,
          m.kind,
          (m.title || '').slice(0, 40),
          (m.venue || '').slice(0, 30),
          fmtCoord(m.old.lat, m.old.lng),
          fmtCoord(m.new.lat, m.new.lng),
          m.distKm.toFixed(3),
          `${m.oldPrecision}→${m.newPrecision}`,
          (m.matchedName || '').slice(0, 60),
        ].join(' | ')
      );
    }
  }

  if (WRITE && moves.length) {
    console.log('\nApplying moves...');
    for (const m of moves) {
      await updateEventCoords(m.id, { lat: m.new.lat, lng: m.new.lng, geo_precision: m.newPrecision });
    }
    console.log(`Applied ${moves.length} move(s).`);
  } else if (moves.length) {
    console.log('\nDry run — no changes applied. Re-run with --write to apply.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
