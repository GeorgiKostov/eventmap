// Apply a reviewed registry fact to the Alpenverein Linz youth events that
// still carry the Linz centroid despite stating the exact Kletterzentrum
// address. Dry-run by default; --write applies only this exact tuple.
//
// Usage:
//   node --env-file=.env.local scripts/repair-linz-venue-registry.mjs
//   node --env-file=.env.local scripts/repair-linz-venue-registry.mjs --write
import postgres from 'postgres';
import { normalizeName } from '../lib/geocode.js';

const WRITE = process.argv.includes('--write');
const COUNTRY = 'AT';
const CASES = [
  {
    label: 'Kletterzentrum AM TURM',
    source: 'Alpenverein Linz — Jugend',
    town: 'Linz-Urfahr',
    venue: 'Kletterzentrum AM TURM',
    address: 'Julius-Raab-Straße 4',
    registryTown: 'Linz',
  },
  {
    label: 'Marchtrenker Straße 23 4611 Buchkirchen',
    source: 'Gemeinde Oftering',
    town: 'Oftering',
    venue: 'Marchtrenker Straße 23 4611 Buchkirchen',
    address: null,
    registryTown: 'Buchkirchen',
  },
];

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis, extensions' },
  max: 2,
});

function fmt(row) {
  return `#${row.id} ${row.starts_at} ${row.town} — ${row.venue} @ ${row.lat},${row.lng} (${row.geo_precision})`;
}

async function main() {
  const repairs = [];
  for (const repairCase of CASES) {
    const [registry] = await sql`
      SELECT id::text AS id, name, town, lat, lng, geo_precision, resolved_via
      FROM venues
      WHERE country=${COUNTRY}
        AND name_norm=${normalizeName(repairCase.venue)}
        AND town_norm=${normalizeName(repairCase.registryTown)}
        AND geo_precision IN ('venue', 'address')
    `;
    if (!registry) throw new Error(`No precise registry row for ${repairCase.venue}, ${repairCase.registryTown}`);

    const rows = await sql`
      SELECT id::text AS id, starts_at, town, venue, address, lat, lng, geo_precision
      FROM events
      WHERE kind='event' AND status='published' AND country=${COUNTRY}
        AND source_name=${repairCase.source} AND town=${repairCase.town}
        AND venue=${repairCase.venue} AND ${repairCase.address === null ? sql`address IS NULL` : sql`address=${repairCase.address}`}
        AND geo_precision='town'
      ORDER BY starts_at, id
    `;
    console.log(`\n${repairCase.label}: registry #${registry.id} (${registry.town}) → ${registry.lat},${registry.lng} (${registry.geo_precision}; ${registry.resolved_via})`);
    console.log(`Matched ${rows.length} exact event row(s).`);
    for (const row of rows) console.log(`  ${fmt(row)} → ${registry.lat},${registry.lng} (${registry.geo_precision})`);
    repairs.push({ registry, rows });
  }

  const rows = repairs.flatMap(({ rows: matched }) => matched);
  if (!rows.length) {
    console.log('\nNo rows need repair.');
    return;
  }
  if (!WRITE) {
    console.log('\nDry run — no changes applied. Re-run with --write after reviewing the exact matches.');
    return;
  }

  await sql.begin(async (tx) => {
    for (const { registry, rows: matched } of repairs) {
      if (!matched.length) continue;
      await tx`
        UPDATE events
        SET lat=${registry.lat}, lng=${registry.lng}, geo_precision=${registry.geo_precision}, updated_at=now()
        WHERE id IN ${tx(matched.map((row) => row.id))}
      `;
    }
  });
  console.log(`\nApplied ${rows.length} registry coordinate repair(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
