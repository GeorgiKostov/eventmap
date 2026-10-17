// Source-published venue destinations verified on 2026-10-17, beside each map marker.
// Dry-run by default. Optional --ids id1,id2 repairs only reviewed rows at these URLs.
import { pathToFileURL } from 'node:url';
import { getEvent, getVenue, upsertVenue, updateEventFields, updateEventCoords, closeDb } from '../lib/db.js';
import { normalizeName } from '../lib/geocode.js';

export const LINZ_SEASONAL_VENUES = [
  { name: 'Botanischer Garten, Freiland', lat: 48.29591, lng: 14.27707, source_url: 'https://www.linztermine.at/event/710791' },
  { name: 'Kinderkulturzentrum Kuddelmuddel', lat: 48.29814, lng: 14.28932, source_url: 'https://www.linztermine.at/event/721393' },
  { name: 'Neuer Dom (Mariendom)', lat: 48.30114, lng: 14.28716, source_url: 'https://www.linztermine.at/event/707049' },
  { name: 'Charterschiff Walross', lat: 48.31218, lng: 14.28763, source_url: 'https://www.linztermine.at/event/722834' },
];

async function main() {
  const write = process.argv.includes('--write');
  const idsIndex = process.argv.indexOf('--ids');
  const ids = idsIndex < 0 ? [] : (process.argv[idsIndex + 1] || '').split(',');
  if (ids.some((id) => !/^\d+$/.test(id))) throw new Error('--ids requires comma-separated event IDs');
  const repairs = [];
  for (const id of [...new Set(ids)]) {
    const event = await getEvent(id);
    const venue = LINZ_SEASONAL_VENUES.find((v) => v.source_url === event?.source_url);
    if (!venue || event.country !== 'AT' || event.town !== 'Linz') throw new Error(`Event ${id} is outside the reviewed source scope`);
    if (event.geo_precision !== 'town') {
      console.log(`Preserve already precise event ${id}: ${event.geo_precision}`);
      continue;
    }
    repairs.push({ event, venue });
  }
  for (const venue of LINZ_SEASONAL_VENUES) {
    const name_norm = normalizeName(venue.name), town_norm = normalizeName('Linz');
    const existing = await getVenue(name_norm, town_norm, 'AT');
    console.log(`${existing ? 'Preserve existing' : write ? 'Register' : 'Would register'} venue: ${venue.name}`);
    if (existing) console.log(`  existing point: ${existing.lat},${existing.lng} (${existing.geo_precision})`);
    else if (write) await upsertVenue({ ...venue, name_norm, town_norm, town: 'Linz', country: 'AT', geo_precision: 'venue', resolved_via: 'source' });
  }
  for (const { event, venue } of repairs) {
    console.log(`${write ? 'Repair' : 'Would repair'} event ${event.id}: ${venue.name} (${venue.lat},${venue.lng})`);
    if (write) {
      await updateEventFields(event.id, { venue: venue.name });
      await updateEventCoords(event.id, { lat: venue.lat, lng: venue.lng, geo_precision: 'venue' });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(closeDb);
}
