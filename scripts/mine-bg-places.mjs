// Mine evergreen FAMILY PLACES for Bulgaria from OpenStreetMap via Overpass
// (ODbL — same source/licence as the Austria places). Named POIs only, mapped
// to our place categories, deduped by title+town. Output:
//   data/mined/places-family-bg.json  ->  { _meta, places:[ {kind:'place',...} ] }
// then: node scripts/seed-places.mjs --write   (dry-run first).
//
// Usage: node scripts/mine-bg-places.mjs
import fs from 'fs';
import path from 'path';

const OUT = path.join(process.cwd(), 'data', 'mined', 'places-family-bg.json');
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

// OSM tag -> our category (mirrors the AT taxonomy: museum/zoo/pool/park/playground/climbing/indoor_play).
// Each entry: an Overpass filter + the category + indoor hint + whether it's free.
const SELECTORS = [
  { q: 'nwr["tourism"="museum"]["name"]',                 cat: 'museum',     indoor: true },
  { q: 'nwr["tourism"="zoo"]["name"]',                    cat: 'zoo',        indoor: false },
  { q: 'nwr["tourism"="aquarium"]["name"]',               cat: 'zoo',        indoor: true },
  { q: 'nwr["tourism"="theme_park"]["name"]',             cat: 'zoo',        indoor: false }, // amusement/theme parks
  { q: 'nwr["leisure"="water_park"]["name"]',             cat: 'pool',       indoor: false }, // aquaparks — big BG family draw
  { q: 'nwr["leisure"="swimming_pool"]["name"]["access"!~"private|no"]', cat: 'pool', indoor: null },
  { q: 'nwr["leisure"="playground"]["name"]',             cat: 'playground', indoor: false },
  { q: 'nwr["leisure"="park"]["name"]',                   cat: 'park',       indoor: false },
  { q: 'nwr["leisure"="garden"]["garden:type"="botanical"]["name"]', cat: 'park', indoor: false },
  { q: 'nwr["sport"="climbing"]["name"]',                 cat: 'climbing',   indoor: null },
  { q: 'nwr["leisure"="trampoline_park"]["name"]',        cat: 'indoor_play', indoor: true },
];

const EMOJI = { museum: '🏛️', zoo: '🦓', pool: '🏊', park: '🌳', playground: '🛝', climbing: '🧗', indoor_play: '🎪', trail: '🥾' };

function buildQuery() {
  const area = 'area["ISO3166-1"="BG"][admin_level=2]->.bg;';
  const parts = SELECTORS.map((s, i) => `${s.q.replace(/\]$/, ']')}(area.bg);`).join('\n');
  return `[out:json][timeout:120];\n${area}\n(\n${parts}\n);\nout center tags;`;
}

async function runOverpass(query) {
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'okolo-eventmap/0.1 (family places from OSM; contact: bobojojok@gmail.com)',
        },
      });
      if (!res.ok) { console.log(`  ${ep} -> HTTP ${res.status}, trying next`); continue; }
      return (await res.json()).elements || [];
    } catch (e) { console.log(`  ${ep} -> ${e.message}, trying next`); }
  }
  throw new Error('all Overpass endpoints failed');
}

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9а-яёѐ-ӿ]/g, '');

async function main() {
  // Run each selector as its own query so we keep the category mapping (one big
  // union loses which filter matched). Small politeness gap between calls.
  const byCat = {};
  const places = [];
  const seen = new Set();
  for (const sel of SELECTORS) {
    const query = `[out:json][timeout:90];\narea["ISO3166-1"="BG"][admin_level=2]->.bg;\n${sel.q}(area.bg);\nout center tags;`;
    let els = [];
    try { els = await runOverpass(query); } catch (e) { console.log(`  [${sel.cat}] FAILED: ${e.message}`); continue; }
    await new Promise((r) => setTimeout(r, 1200));
    let kept = 0;
    for (const el of els) {
      const t = el.tags || {};
      const name = t['name:bg'] || t.name;
      if (!name) continue;
      const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const town = t['addr:city'] || t['addr:town'] || t['addr:village'] || null;
      const key = norm(name) + '|' + norm(town || '');
      if (seen.has(key)) continue;
      seen.add(key);
      const addr = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ') || null;
      const isFree = sel.cat === 'park' || sel.cat === 'playground' ? true : (t.fee === 'no' ? true : (t.fee === 'yes' ? false : null));
      places.push({
        kind: 'place', title: name, description: null,
        venue: null, address: addr, town,
        lat, lng, geo_precision: 'venue',
        categories: [sel.cat],
        is_free: isFree, age_min: null, age_max: null,
        indoor: sel.indoor,
        opening_hours: null, seasonal: null,
        emoji: EMOJI[sel.cat] || '📌',
        src_kind: 'osm_mined', source_name: 'OpenStreetMap',
        source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
        country: 'BG',
        _osm_category: `${Object.keys(t).find((k) => ['tourism', 'leisure', 'sport'].includes(k))}=${t.tourism || t.leisure || t.sport}`,
        _osm_type: el.type, _osm_id: el.id, _wheelchair: t.wheelchair || null,
      });
      kept++;
    }
    byCat[sel.cat] = (byCat[sel.cat] || 0) + kept;
    console.log(`  [${sel.cat}] ${sel.q.slice(0, 40)}… -> ${els.length} osm, ${kept} named+new`);
  }
  const withTown = places.filter((p) => p.town).length;
  fs.writeFileSync(OUT, JSON.stringify({ _meta: { source: 'OpenStreetMap via Overpass (ODbL)', country: 'BG', mined_at: '2026-07-13', count: places.length }, places }, null, 2) + '\n');
  console.log(`\nWrote ${places.length} BG places (${withTown} with a town) -> ${path.relative(process.cwd(), OUT)}`);
  console.log('by category:', JSON.stringify(byCat));
}
main().catch((e) => { console.error(e); process.exit(1); });
