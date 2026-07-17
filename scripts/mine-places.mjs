// Mine evergreen family places within an exact 40 km radius of a crawl scope
// from OpenStreetMap through the public Overpass API (ODbL).
//
// This is a deterministic bootstrap miner: one Overpass request per scope, no
// LLM, no geocoder and no database writes. Coordinates are kept only when
// supplied by the OSM element itself (node coordinates or an Overpass-computed
// way/relation centre). Unknown facts stay null. Output feeds seed-places.mjs.
//
// Overpass, NOT our local Nominatim: Nominatim's placex discards the
// discriminating tags this curation needs (museum=children, fee, access,
// garden:type, sport=climbing) — it keeps only wikidata/wikipedia in extratags.
// So the box's local instance can't substitute here; it was only ever for
// geocoding. Overpass keeps the full tag set, and one request per city is well
// within its public budget.
//
// Usage:
//   node scripts/mine-places.mjs --scope berlin-40km
//   node scripts/mine-places.mjs --scope munich-40km
//   node scripts/mine-places.mjs --scope <id> --refilter   # re-curate an existing file, no fetch
import fs from 'fs';
import path from 'path';
import { crawlScope, distanceKm } from '../lib/crawl-scopes.js';

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
}
const SCOPE_ID = argValue('--scope') || 'stuttgart-40km';
const SCOPE = crawlScope(SCOPE_ID);
if (!SCOPE) {
  console.error(`Unknown scope "${SCOPE_ID}". Known: ${['stuttgart-40km', 'berlin-40km', 'munich-40km'].join(', ')}`);
  process.exit(1);
}
// Date-stamped, scope-named so each city's mine is its own file and re-runs
// overwrite cleanly. The town label is the scope's own name (before "40km").
const STAMP = argValue('--stamp') || '2026-07-17';
const SCOPE_TOWN = SCOPE.sourceRegion.replace(/\s*40km$/i, '');
const OUT = path.join(process.cwd(), 'data', 'mined', `places-${SCOPE_ID}-${STAMP}.json`);
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const UA = 'UmkreisBot/0.1 (family event map; contact: bobojojok@gmail.com)';

const EMOJI = {
  playground: '🛝', pool: '🏊', park: '🌳', indoor_play: '🎪',
  museum: '🏛️', zoo: '🦓', climbing: '🧗', trail: '🥾',
};

const MUSEUM_TAGS = new Set([
  'children', 'science', 'technology', 'natural_history', 'transport',
  'automobile', 'railway', 'open_air', 'toys',
]);
const MUSEUM_NAME = /kinder|spielzeug|naturkund|naturkunde|technik|science|experiment|planetarium|porsche|mercedes|bahn|freilicht/i;
const DESTINATION_PLAYGROUND = /abenteuer|aktivspielplatz|walderholung|waldspielplatz|wasserspielplatz|erlebnisspiel|naturerlebnis|spielpark|jugendfarm|kinderbauern|pirat|ritterburg|dinosaur|robinson/i;
const DESTINATION_POOL = /bad|freibad|hallenbad|therm|parkbad|schwimm|aquarena|fildorado|leuze/i;
const POOL_COMPONENT = /becken|whirlpool|rutsche|liegewiese|sprung|eltern.kind|kinderbereich/i;
const DESTINATION_ZOO = /zoo|tierpark|wildpark|falknerei|fasanerie|kamelhof|tieranlage|sensapolis|tripsdrill|schwabenpark|märchengarten|spielstadt|streichelzoo|wildgehege\s+\S|wildparadies|wilhelma|eins . alles|powerpaint/i;
const DESTINATION_CLIMBING = /kletterhalle|kletterzentrum|boulderzentrum|boulderhaus|kletterpark|hochseil|clip.n.climb|jump area|active garden|dav kletteranlage|cityrock|boulderanlage|klettergarten stetten|kletterturm dav|kletterwand graf|tü.arena|rox boulder|top boulder|waldseilgarten|aktivpark/i;
const NON_FAMILY_PARK = /friedhof|lapidarium|\bplatz\b|cvjm|hochschule|universität|versuchsgarten|freibad/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
}

function explicitBool(value) {
  if (value === 'yes' || value === 'true' || value === '1') return true;
  if (value === 'no' || value === 'false' || value === '0') return false;
  return null;
}

function isPublic(tags) {
  return !['private', 'no', 'customers'].includes(tags.access);
}

function isNotable(tags) {
  return !!(tags.wikidata || tags.wikipedia);
}

function hasDestinationIdentity(tags) {
  // An operator alone is insufficient: individual zoo rides/enclosures and
  // pool basins inherit the parent venue's operator in OSM.
  return !!(tags.website || tags['contact:website'] || isNotable(tags));
}

function classify(tags) {
  if (!isPublic(tags)) return null;
  if (tags.tourism === 'zoo' || tags.tourism === 'aquarium' || tags.tourism === 'theme_park') {
    if (!hasDestinationIdentity(tags) && !DESTINATION_ZOO.test(tags.name || '')) return null;
    return { category: 'zoo', indoor: tags.tourism === 'aquarium' ? true : false };
  }
  if (tags.leisure === 'water_park' || tags.leisure === 'swimming_pool') {
    if (POOL_COMPONENT.test(tags.name || '')) return null;
    if (tags.leisure === 'swimming_pool'
      && !DESTINATION_POOL.test(tags.name || '')
      && !hasDestinationIdentity(tags)) return null;
    return { category: 'pool', indoor: explicitBool(tags.indoor) };
  }
  if (tags.leisure === 'trampoline_park' || tags.leisure === 'indoor_play') {
    return { category: 'indoor_play', indoor: true };
  }
  if (tags.leisure === 'playground') {
    // Ordinary neighbourhood playgrounds are useful OSM features but not
    // destination places for the product. Keep only explicit/high-signal
    // adventure, water, forest or farm playgrounds (or notable mapped POIs).
    if (!DESTINATION_PLAYGROUND.test(tags.name || '')) return null;
    return { category: 'playground', indoor: explicitBool(tags.indoor) ?? false };
  }
  if (tags.leisure === 'miniature_golf') {
    return { category: 'playground', indoor: explicitBool(tags.indoor) ?? false };
  }
  if (tags.sport === 'climbing') {
    const organisedFacility = ['sports_centre', 'sports_hall', 'high_ropes_course'].includes(tags.leisure);
    if (!organisedFacility && !hasDestinationIdentity(tags) && !DESTINATION_CLIMBING.test(tags.name || '')) return null;
    return { category: 'climbing', indoor: explicitBool(tags.indoor) };
  }
  if (tags.amenity === 'planetarium') return { category: 'museum', indoor: true };
  if (tags.tourism === 'museum') {
    const subtype = String(tags.museum || '').toLowerCase();
    if (!MUSEUM_TAGS.has(subtype) && !MUSEUM_NAME.test(tags.name || '')) return null;
    return { category: 'museum', indoor: explicitBool(tags.indoor) ?? true };
  }
  if (tags.leisure === 'garden' && tags['garden:type'] === 'botanical'
    && !NON_FAMILY_PARK.test(tags.name || '')) {
    return { category: 'park', indoor: false };
  }
  if (tags.leisure === 'park' && isNotable(tags) && !NON_FAMILY_PARK.test(tags.name || '')) {
    return { category: 'park', indoor: false };
  }
  return null;
}

function buildQuery() {
  const around = `(around:${SCOPE.radiusKm * 1000},${SCOPE.center.lat},${SCOPE.center.lng})`;
  // One key/value-regex scan is much cheaper for the public service than a
  // dozen repeated around scans. The conservative allowlist is applied below.
  return `[out:json][timeout:120];\n`
    + `nwr${around}["name"][~"^(tourism|leisure|sport|amenity)$"~"^(zoo|aquarium|theme_park|water_park|swimming_pool|trampoline_park|indoor_play|playground|miniature_golf|park|garden|climbing|planetarium|museum)$"];\n`
    + `out center tags;`;
}

function robotsDisallows(text, pathname) {
  let applies = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const split = line.indexOf(':');
    if (split < 0) continue;
    const key = line.slice(0, split).trim().toLowerCase();
    const value = line.slice(split + 1).trim();
    if (key === 'user-agent') applies = ['*', 'umkreisbot'].includes(value.toLowerCase());
    if (applies && key === 'disallow' && value && pathname.startsWith(value)) return true;
  }
  return false;
}

async function endpointAllowed(endpoint) {
  const url = new URL(endpoint);
  try {
    const response = await fetch(`${url.origin}/robots.txt`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return true;
    return !robotsDisallows(await response.text(), url.pathname);
  } catch {
    return false;
  }
}

async function fetchElements(query) {
  const failures = [];
  for (const endpoint of ENDPOINTS) {
    if (!(await endpointAllowed(endpoint))) {
      failures.push({ endpoint, reason: 'robots-disallowed-or-unavailable' });
      continue;
    }
    for (let attempt = 1; attempt <= 1; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            'User-Agent': UA,
          },
          signal: AbortSignal.timeout(135_000),
        });
        if (response.ok) {
          const body = await response.json();
          return { endpoint, elements: body.elements || [], failures };
        }
        failures.push({ endpoint, attempt, reason: `HTTP ${response.status}` });
        if (![429, 502, 503, 504].includes(response.status)) break;
      } catch (error) {
        failures.push({ endpoint, attempt, reason: error.message });
      }
      await sleep(5_000 * attempt);
    }
  }
  throw new Error(`all Overpass endpoints failed: ${JSON.stringify(failures)}`);
}

function placeFromElement(element) {
  const tags = element.tags || {};
  const title = tags['name:de'] || tags.name;
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (!title || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (distanceKm(SCOPE.center, { lat, lng }) > SCOPE.radiusKm) return null;
  const classified = classify(tags);
  if (!classified) return null;

  const town = tags['addr:city'] || tags['addr:town'] || tags['addr:village']
    || tags['is_in:city'] || tags['is_in:town'] || null;
  const street = tags['addr:street'] || tags['addr:place'] || null;
  const address = [street, tags['addr:housenumber']].filter(Boolean).join(' ') || null;
  const fee = explicitBool(tags.fee);
  const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
  const osmType = tags.tourism
    ? `tourism=${tags.tourism}`
    : tags.leisure
      ? `leisure=${tags.leisure}`
      : tags.sport
        ? `sport=${tags.sport}`
        : `amenity=${tags.amenity}`;

  return {
    kind: 'place',
    title,
    description: null,
    venue: null,
    address,
    town,
    lat,
    lng,
    geo_precision: 'venue',
    categories: [classified.category],
    is_free: fee === null ? null : !fee,
    age_min: null,
    age_max: null,
    indoor: classified.indoor,
    opening_hours: null,
    seasonal: null,
    emoji: EMOJI[classified.category] || '📌',
    src_kind: 'osm_mined',
    source_name: 'OpenStreetMap contributors',
    source_url: sourceUrl,
    country: SCOPE.country,
    _osm_category: osmType,
    _osm_type: element.type,
    _osm_id: element.id,
    _wheelchair: explicitBool(tags.wheelchair),
  };
}

async function main() {
  if (process.argv.includes('--refilter')) {
    const output = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const before = output.places.length;
    output.places = output.places.filter((place) => (
      (place.categories?.[0] !== 'playground'
        || place._osm_category === 'leisure=miniature_golf'
        || DESTINATION_PLAYGROUND.test(place.title))
      && (place.categories?.[0] !== 'zoo' || DESTINATION_ZOO.test(place.title))
      && (place.categories?.[0] !== 'climbing' || DESTINATION_CLIMBING.test(place.title))
      && (place.categories?.[0] !== 'park' || !NON_FAMILY_PARK.test(place.title))
    ));
    const deduped = [];
    for (const place of output.places) {
      const duplicate = deduped.findIndex((other) => (
        normalize(other.title) === normalize(place.title)
        && other.categories[0] === place.categories[0]
        && distanceKm(other, place) <= 1.5
      ));
      if (duplicate < 0) deduped.push(place);
      else if (!deduped[duplicate].town && place.town) deduped[duplicate] = place;
    }
    output.places = deduped;
    output._meta.count = output.places.length;
    output._meta.with_source_town = output.places.filter((place) => place.town).length;
    output._meta.without_source_town = output.places.length - output._meta.with_source_town;
    output._meta.by_category = Object.fromEntries(Object.keys(EMOJI).map((category) => [
      category, output.places.filter((place) => place.categories[0] === category).length,
    ]).filter(([, count]) => count));
    output._meta.rejected.local_refilter = before - output.places.length;
    fs.writeFileSync(OUT, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`Refiltered ${before} -> ${output.places.length} places in ${path.relative(process.cwd(), OUT)}`);
    console.log(`By category: ${JSON.stringify(output._meta.by_category)}`);
    return;
  }
  const query = buildQuery();
  const { endpoint, elements, failures } = await fetchElements(query);
  const places = [];
  const seenElements = new Set();
  let outsideRadius = 0;
  let rejected = 0;

  for (const element of elements) {
    const elementKey = `${element.type}/${element.id}`;
    if (seenElements.has(elementKey)) continue;
    seenElements.add(elementKey);
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (Number.isFinite(lat) && Number.isFinite(lng)
      && distanceKm(SCOPE.center, { lat, lng }) > SCOPE.radiusKm) {
      outsideRadius++;
      continue;
    }
    const place = placeFromElement(element);
    if (!place) { rejected++; continue; }
    const nearDuplicate = places.findIndex((other) => (
      normalize(other.title) === normalize(place.title)
      && other.categories[0] === place.categories[0]
      && distanceKm(other, place) <= 1.5
    ));
    if (nearDuplicate >= 0) {
      if (!places[nearDuplicate].town && place.town) places[nearDuplicate] = place;
      continue;
    }
    places.push(place);
  }

  places.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  const byCategory = Object.fromEntries(Object.keys(EMOJI).map((category) => [
    category, places.filter((place) => place.categories[0] === category).length,
  ]).filter(([, count]) => count));
  const withTown = places.filter((place) => place.town).length;
  const output = {
    _meta: {
      scope: SCOPE.id,
      generated: STAMP,
      generator: 'scripts/mine-places.mjs',
      source: 'OpenStreetMap via Overpass API',
      source_registry: [{
        name: 'OpenStreetMap contributors',
        url: 'https://www.openstreetmap.org/',
        api_url: endpoint,
        licence: 'ODbL 1.0',
        licence_url: 'https://www.openstreetmap.org/copyright',
        country: SCOPE.country,
        region: SCOPE.sourceRegion,
        town: SCOPE_TOWN,
      }],
      attribution: 'Map data © OpenStreetMap contributors, available under ODbL 1.0 — https://www.openstreetmap.org/copyright',
      search_area: `${SCOPE.radiusKm} km around ${SCOPE.center.lat},${SCOPE.center.lng}`,
      query_elements: elements.length,
      count: places.length,
      with_source_town: withTown,
      without_source_town: places.length - withTown,
      by_category: byCategory,
      failures,
      rejected: { outside_radius: outsideRadius, curation_or_missing_facts: rejected },
      notes: [
        'Facts and coordinates come only from OSM tags/elements; descriptions, images and official-site prose were not copied.',
        'Every row links to its exact canonical OSM element; unknown address, town, fee, accessibility and indoor status remain null.',
        'Museums use a conservative family/science/technology/natural-history/transport/toy allowlist; parks require a notability tag; ordinary neighbourhood playgrounds are excluded.',
        'The 40 km guard is applied again in JavaScript after Overpass returns the candidate set.',
      ],
    },
    places,
  };

  fs.writeFileSync(OUT, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${places.length} family places (${withTown} with source town) to ${path.relative(process.cwd(), OUT)}`);
  console.log(`By category: ${JSON.stringify(byCategory)}`);
  console.log(`Rejected: ${JSON.stringify(output._meta.rejected)}; endpoint failures: ${failures.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
