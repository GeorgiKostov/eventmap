// Idempotent: sources.default_venue / default_address — the physical venue a
// SINGLE-VENUE publisher operates from.
//
// Why: a theatre or museum publishes its own programme and names the ROOM, not
// the house. Dschungel Wien (a children's theatre in the MuseumsQuartier) lists
// its events at "Bühne 1" / "Bühne 2" — our two largest unresolved venues, 175
// events, and no geocoder or web search on earth can place "Bühne 2, Wien".
// The venue isn't in the event text at all; it's the publisher's identity, the
// same shape as default_categories. When an event from such a source fails to
// geocode better than town level, we fall back to the source's own address —
// which is a fact about the house, not a guess about the event.
//
// Usage: node --env-file=.env.local scripts/migrate-source-venue.mjs [--write]
import postgres from 'postgres';

const WRITE = process.argv.includes('--write');
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2, connection: { search_path: 'umkreis' } });

await sql`alter table sources add column if not exists default_venue text`;
await sql`alter table sources add column if not exists default_address text`;

// Single-venue publishers whose events name internal rooms/stages.
const VENUES = [
  ['https://www.dschungelwien.at/spielplan', 'Dschungel Wien', 'Museumsplatz 1, 1070 Wien', ['family']],
];

for (const [url, venue, address, cats] of VENUES) {
  const res = await sql`
    update sources set default_venue=${venue}, default_address=${address},
      default_categories = case when ${cats}::text[] <> '{}' then ${cats}::text[] else default_categories end
    where url=${url}`;
  console.log(`${res.count ? '✓' : '✗ not registered'} ${venue} → ${address}${cats.length ? ` (+${cats})` : ''}`);
}

// Report what would change: town-precision events from these sources.
const [{ n }] = await sql`
  select count(*)::int as n from events e join sources s on s.name = e.source_name
  where s.default_venue is not null and e.status='published' and e.geo_precision='town'`;
console.log(`\n${n} town-precision events from single-venue sources (they will resolve to the house address)`);

if (WRITE) {
  // Seed the venues registry with each house so EVERY future crawl of these
  // sources resolves through the registry — repeatable, not a one-off data fix.
  const { normalizeName } = await import('../lib/geocode.js');
  const { forwardGeocode } = await import('../lib/geocode.js');
  for (const [, venue, address] of VENUES) {
    const hit = await forwardGeocode(address, 'AT');
    if (!hit) { console.log(`! could not geocode ${address}`); continue; }
    const town = address.split(',').pop().trim().replace(/^\d+\s*/, '');
    await sql`
      insert into venues (name, town, country, name_norm, town_norm, lat, lng, geo_precision, resolved_via, source_url)
      values (${venue}, ${town}, 'AT', ${normalizeName(venue)}, ${normalizeName(town)},
              ${hit.lat}, ${hit.lng}, 'address', 'manual', null)
      on conflict (name_norm, town_norm, country) do nothing`;
    console.log(`registry: ${venue} (${town}) → ${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)}`);

    // Apply to the existing town-precision events from that source.
    const res = await sql`
      update events e set lat=${hit.lat}, lng=${hit.lng}, geo_precision='address',
        address=coalesce(nullif(e.address,''), ${address}), updated_at=now()
      from sources s
      where s.name = e.source_name and s.default_venue = ${venue}
        and e.status='published' and e.geo_precision='town'`;
    console.log(`updated ${res.count} events to the house address`);
  }
} else {
  console.log('(dry-run — pass --write)');
}

await sql.end();
