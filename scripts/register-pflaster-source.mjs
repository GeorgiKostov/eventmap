// Registers the Pflasterspektakel Linz Tagesprogramm source AND seeds the
// festival's Spielorte into the venues registry.
//
// The two halves belong together: the grid names its stages the way a local
// would ("Brunnen", "Haltestelle", "Bank Austria", "Traxlmayr"), and no geocoder
// on earth can place those. Without the registry rows, geocodeEvent() falls
// through to the Linz town centroid and every stage lands on one dot — which for
// a festival whose whole point is WHERE you stand is the same as having no data.
// With them, the registry rung short-circuits before Nominatim: precise pins,
// zero geocode calls, no rate-limit exposure during the festival.
//
// Coordinates come from OpenStreetMap (ODbL, already attributed in the map
// credits). Every one carries the OSM element it was read from, and the seed
// REFUSES to write a row without one — a venues row is served forever without
// any later validation, so a guessed coordinate here would be permanent
// (tasks/lessons.md 2026-07-14: 254 poisoned registry rows, up to 446 km off).
//
// Idempotent: upsertSource is ON CONFLICT (url), upsertVenue is ON CONFLICT
// (name_norm, town_norm, country) DO NOTHING — so a re-run never clobbers a
// hand-corrected coordinate.
//
// Usage: node --env-file=.env.local scripts/register-pflaster-source.mjs [--venues-only|--source-only]

import { readFileSync } from 'node:fs';
import { upsertSource, upsertVenue, closeDb } from '../lib/db.js';
import { normalizeName } from '../lib/geocode.js';

const SPIELORTE = new URL('../data/pflaster-spielorte.json', import.meta.url);
const TOWN = 'Linz';
const SOURCE_URL = 'https://pflasterspektakel.at/de/programm/tagesprogramm/';

if (!process.argv.includes('--venues-only')) {
  await upsertSource({
    name: 'Pflasterspektakel Linz — Tagesprogramm',
    url: SOURCE_URL,
    kind: 'festival',
    cms: 'pflaster',
    town: TOWN,
    region: 'Oberösterreich',
    country: 'AT',
    works: true,
    notes: 'SEASONAL — publishes event data on 3 days a year only. The Tagesprogramm grid '
      + '(Spielort × hour-slot × artist) is written fresh each festival day and goes up "kurz vor '
      + 'Programmstart" (DO 16:00, FR & SA 14:00); the other 362 days the page reads "Aktuell ist '
      + 'noch kein Tagesprogramm verfügbar" and is hash-skipped for free. The nightly crawl (04:00 '
      + 'UTC) can NEVER capture it — the grid is not up yet at 06:00 Vienna — so capture runs from '
      + '.github/workflows/pflasterspektakel.yml (17–27 July, 14/16/18/21 Vienna, --url so it '
      + 'ignores tier/cadence and revives the source if zero_streak ever rotted it to dead). '
      + 'cms=pflaster is an EXCLUSIVE structured route: an empty result means "no grid today", never '
      + '"fall through to the LLM" — the page describes the festival year-round and would otherwise '
      + 'cost a paid call per crawl to mint a duplicate of the Linz-Termine festival row. '
      + 'The page carries no date; lib/pflaster-events.js takes the day from the source\'s own Yoast '
      + 'article:modified_time and refuses any grid it cannot date. robots.txt is allow-all with no '
      + 'AI-bot block (checked 2026-07-16). Their WP REST API exposes /wp/v2/auftritte + '
      + '/wp/v2/auftrittsort — exactly this data — but 401s behind a security plugin, so we parse '
      + 'the public HTML. The festival archive keeps artists but NOT the grid: capture live or lose it. '
      + 'default_categories deliberately NOT set — street art is a general-audience programme, and '
      + 'forcing `family` on it would be rule-5 fabrication in the category column.',
  });
  console.log(`registered source: Pflasterspektakel Linz — Tagesprogramm (cms=pflaster)`);
}

if (process.argv.includes('--source-only')) {
  await closeDb();
  process.exit(0);
}

const spielorte = JSON.parse(readFileSync(SPIELORTE, 'utf8'));
let seeded = 0;
const skipped = [];

for (const s of spielorte) {
  // No coordinate, or no OSM element behind it → no row. A missing venue falls
  // back to the Linz centroid at town precision, which is honest; a fabricated
  // one is served as a precise pin forever.
  if (!s.coords || !Number.isFinite(s.coords.lat) || !Number.isFinite(s.coords.lng) || !s.osm) {
    skipped.push(`${s.kuerzel} ${s.name} — ${s.note || 'no OSM element'}`);
    continue;
  }
  // Must match lib/pflaster-events.js's `${location}, ${area}` exactly — this
  // string IS the registry key. Qualified on purpose: a bare "Brunnen" would
  // hand the festival's fountain to every other Linz event naming a Brunnen.
  const name = `${s.name}, ${s.area}`;
  await upsertVenue({
    name,
    town: TOWN,
    country: 'AT',
    name_norm: normalizeName(name),
    town_norm: normalizeName(TOWN),
    lat: s.coords.lat,
    lng: s.coords.lng,
    // `specific:false` = we resolved the containing square/street, not the exact
    // spot within it (a fountain on the Hauptplatz). That is a real address-level
    // fact, not a venue-level one, and the distinction is what keeps the map honest.
    geo_precision: s.specific ? 'venue' : 'address',
    resolved_via: 'manual',
    source_url: `https://www.openstreetmap.org/${s.osm}`,
  });
  seeded += 1;
}

console.log(`seeded ${seeded}/${spielorte.length} Spielorte into venues (town=${TOWN})`);
if (skipped.length) {
  console.log(`\n${skipped.length} left to the geocoder (no verified OSM element):`);
  for (const s of skipped) console.log(`  - ${s}`);
}
await closeDb();
