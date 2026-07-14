// Venue-search backfill — the LAST rung of the enrichment ladder
// (docs/design/big-city-quality.md §1 Stage 3). For events still stuck at
// geo_precision='town' whose venue name IS known but which no source page
// states an address for: ask a web-search-capable model (lib/extract.js →
// Grok CLI, subscription = $0) for that venue's street address, then geocode
// the answer OURSELVES and distance-bound it.
//
// Why venue-first, not event-first: 2,565 such events collapse to ~1,163
// unique (venue, town) pairs — one lookup fixes every event at that venue,
// now and forever (the answer lands in the `venues` registry, which
// geocodeEvent() consults before Nominatim). Per-event search would pay ~10×
// for the same information.
//
// Never-fabricate guards (hard rule 5), in order:
//   1. the model returns an address STRING, never coordinates;
//   2. that string must geocode through our own Nominatim path;
//   3. the resulting point must be within GUARD_KM of the events' town;
//   4. anything failing 1–3 leaves the events honestly at town precision.
//
// Usage: node --env-file=.env.local scripts/venue-search.mjs            (dry-run, 5 city zones)
//        node --env-file=.env.local scripts/venue-search.mjs --write
//        ... --limit 50            cap pairs (testing)
//        ... --concurrency 3       parallel model calls (default 3)
//        ... --all                 every country/zone, not just the 5 zones
//
// NB: run this ALONE — it shares the global Nominatim budget (tasks/lessons.md,
// "one crawl process at a time"). Never alongside crawl.mjs or enrich-locations.
import postgres from 'postgres';
import { searchVenueAddress } from '../lib/extract.js';
import { forwardGeocode, distanceKm, normalizeName, isSentinelVenue } from '../lib/geocode.js';
import { getVenue, upsertVenue, closeDb } from '../lib/db.js';

const ZONES = [
  { lat: 48.2082, lng: 16.3738 }, { lat: 48.3069, lng: 14.2858 }, { lat: 47.0707, lng: 15.4395 },
  { lat: 47.8095, lng: 13.055 }, { lat: 47.2692, lng: 11.4041 },
];
const ZONE_KM = 40;
const GUARD_KM = 25; // resolved point must sit near the events' town

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const ALL = args.includes('--all');
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const CONC = args.includes('--concurrency') ? Number(args[args.indexOf('--concurrency') + 1]) : 3;

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 3, connection: { search_path: 'umkreis' } });

// Unique (venue, town, country) pairs still unresolved, ranked by how many
// events each one would fix — the biggest wins go first, so an interrupted run
// still bought the most it could.
const rows = await sql`
  select venue, town, country, count(*)::int as n,
         avg(lat)::float8 as lat, avg(lng)::float8 as lng
  from events
  where kind='event' and status='published' and geo_precision='town'
    and venue is not null and venue <> ''
  group by venue, town, country
  order by n desc`;

const inZone = (p) => ZONES.some((z) => distanceKm(p, z) <= ZONE_KM);
const pairs = rows.filter((r) => !isSentinelVenue(r.venue) && (ALL || inZone(r)));
console.log(`${rows.length} unresolved (venue,town) pairs; ${pairs.length} in scope`
  + ` covering ${pairs.reduce((s, p) => s + p.n, 0)} events${WRITE ? '' : ' [DRY-RUN]'}`);

const stats = { registry: 0, found: 0, nogeo: 0, guarded: 0, notfound: 0, errors: 0, events: 0 };
const todo = pairs.slice(0, LIMIT === Infinity ? pairs.length : LIMIT);
let done = 0;
const t0 = Date.now();

async function handle(p) {
  const country = p.country || 'AT';
  const nameNorm = normalizeName(p.venue);
  const townNorm = normalizeName(p.town || '');
  try {
    // Someone may have resolved it since the query (earlier rung, parallel worker).
    const reg = await getVenue(nameNorm, townNorm, country);
    if (reg) {
      if (WRITE) stats.events += await applyVenue(p, reg.lat, reg.lng, reg.geo_precision);
      stats.registry++;
      return;
    }

    const addr = await searchVenueAddress({ venue: p.venue, town: p.town, country });
    if (!addr) { stats.notfound++; return; }

    // OUR geocoder decides — the model only supplied a string.
    const hit = await forwardGeocode(addr, country);
    if (!hit) { stats.nogeo++; return; }
    if (distanceKm(hit, p) > GUARD_KM) {
      stats.guarded++;
      console.log(`  ⨯ guarded: "${p.venue}" (${p.town}) → "${addr}" is ${distanceKm(hit, p).toFixed(0)}km away`);
      return;
    }

    stats.found++;
    console.log(`  ✓ ${p.venue} (${p.town}) → ${addr}  [${p.n} event(s)]`);
    if (WRITE) {
      await upsertVenue({
        name: p.venue, town: p.town ?? null, country,
        name_norm: nameNorm, town_norm: townNorm,
        lat: hit.lat, lng: hit.lng, geo_precision: 'address', resolved_via: 'search',
      });
      stats.events += await applyVenue(p, hit.lat, hit.lng, 'address', addr);
    }
  } catch (e) {
    stats.errors++;
    if (stats.errors <= 5) console.log(`  ! ${p.venue}: ${e.code || e.message?.slice(0, 80)}`);
  } finally {
    done++;
    if (done % 20 === 0) {
      console.log(`… ${done}/${todo.length} (${((Date.now() - t0) / 60000).toFixed(1)} min) — ${JSON.stringify(stats)}`);
    }
  }
}

// Update every town-precision event at this venue+town (that's the whole point).
async function applyVenue(p, lat, lng, precision, address = null) {
  const res = await sql`
    update events set lat=${lat}, lng=${lng}, geo_precision=${precision},
      address=coalesce(nullif(address,''), ${address}), updated_at=now()
    where kind='event' and status='published' and geo_precision='town'
      and venue=${p.venue} and town is not distinct from ${p.town ?? null}
      and country=${p.country || 'AT'}`;
  return res.count;
}

// Model calls run in parallel (they hit xAI, not municipal hosts); the Nominatim
// verification inside each is serialized by geocode.js's own global throttle.
const queue = [...todo];
await Promise.all(Array.from({ length: Math.max(1, CONC) }, async () => {
  while (queue.length) await handle(queue.shift());
}));

console.log(`\n${WRITE ? 'Applied' : 'DRY-RUN'}: ${stats.found} venues resolved by search`
  + ` (+${stats.registry} already in registry) → ${stats.events} events upgraded`);
console.log(`not findable ${stats.notfound}, address didn't geocode ${stats.nogeo},`
  + ` distance-guarded ${stats.guarded}, errors ${stats.errors}`);
await sql.end();
await closeDb();
