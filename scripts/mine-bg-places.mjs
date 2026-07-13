// Mine evergreen FAMILY PLACES for Bulgaria from OpenStreetMap via Overpass
// (ODbL — same source/licence as the Austria places). Curated: high-signal
// family categories (zoo/aquapark/pool/climbing/indoor-play/botanical) are kept
// wholesale; the noisy museum/park categories are kept only when NOTABLE
// (wikidata/wikipedia tag) so we don't seed 400 memorial rooms + 500 pocket
// parks. Town assigned from addr:city or nearest major city (≤30km).
// Output: data/mined/places-family-bg.json -> { _meta, places:[ {kind:'place',...} ] }
// then: node scripts/seed-places.mjs --write   (dry-run first).
import fs from 'fs';
import path from 'path';

const OUT = path.join(process.cwd(), 'data', 'mined', 'places-family-bg.json');
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const UA = 'okolo-eventmap/0.1 (family places from OSM; contact: bobojojok@gmail.com)';

// selector -> category; `always` = keep wholesale (low noise); otherwise keep
// only when notable (wikidata/wikipedia) or has a town.
const SELECTORS = [
  { q: 'nwr["tourism"="zoo"]["name"]',                    cat: 'zoo',        indoor: false, always: true },
  { q: 'nwr["tourism"="aquarium"]["name"]',               cat: 'zoo',        indoor: true,  always: true },
  { q: 'nwr["tourism"="theme_park"]["name"]',             cat: 'zoo',        indoor: false, always: true },
  { q: 'nwr["leisure"="water_park"]["name"]',             cat: 'pool',       indoor: false, always: true },
  { q: 'nwr["leisure"="swimming_pool"]["name"]["access"!~"private|no"]', cat: 'pool', indoor: null, always: true },
  { q: 'nwr["sport"="climbing"]["name"]',                 cat: 'climbing',   indoor: null,  always: true },
  { q: 'nwr["leisure"="trampoline_park"]["name"]',        cat: 'indoor_play', indoor: true, always: true },
  { q: 'nwr["leisure"="water_park"]',                     cat: 'pool',       indoor: false, always: true }, // some aquaparks unnamed→still keep by ref
  { q: 'nwr["leisure"="garden"]["garden:type"="botanical"]["name"]', cat: 'park', indoor: false, always: true },
  { q: 'nwr["tourism"="museum"]["name"]',                 cat: 'museum',     indoor: true,  always: false },
  { q: 'nwr["leisure"="park"]["name"]',                   cat: 'park',       indoor: false, always: false },
];

const EMOJI = { museum: '🏛️', zoo: '🦓', pool: '🏊', park: '🌳', playground: '🛝', climbing: '🧗', indoor_play: '🎪', trail: '🥾' };

// Major BG city centroids for nearest-town assignment (Cyrillic = catalog form).
const CITIES = [
  ['Столична', 42.697, 23.322], ['Пловдив', 42.142, 24.75], ['Варна', 43.204, 27.91], ['Бургас', 42.504, 27.468],
  ['Русе', 43.849, 25.954], ['Стара Загора', 42.425, 25.635], ['Плевен', 43.417, 24.617], ['Сливен', 42.681, 26.322],
  ['Добрич', 43.571, 27.827], ['Шумен', 43.271, 26.936], ['Перник', 42.605, 23.038], ['Хасково', 41.934, 25.556],
  ['Ямбол', 42.484, 26.508], ['Пазарджик', 42.192, 24.333], ['Благоевград', 42.017, 23.094], ['Велико Търново', 43.081, 25.629],
  ['Враца', 43.21, 23.553], ['Габрово', 42.874, 25.334], ['Асеновград', 42.017, 24.867], ['Видин', 43.993, 22.881],
  ['Казанлък', 42.619, 25.393], ['Кюстендил', 42.284, 22.691], ['Кърджали', 41.639, 25.365], ['Монтана', 43.409, 23.225],
  ['Ловеч', 43.137, 24.716], ['Смолян', 41.577, 24.712], ['Сандански', 41.566, 23.279], ['Велинград', 42.026, 23.991],
  ['Банско', 41.838, 23.488], ['Несебър', 42.659, 27.735], ['Созопол', 42.418, 27.696], ['Балчик', 43.421, 28.159],
  ['Поморие', 42.563, 27.632], ['Троян', 42.9, 24.716], ['Самоков', 42.338, 23.555], ['Дупница', 42.264, 23.116],
  ['Свищов', 43.616, 25.348], ['Каварна', 43.433, 28.34], ['Петрич', 41.395, 23.207], ['Гоце Делчев', 41.567, 23.735],
];
function nearestTown(lat, lng) {
  let best = null, bd = Infinity;
  for (const [name, la, lo] of CITIES) {
    const d = Math.hypot((lat - la) * 111, (lng - lo) * 111 * Math.cos(lat * Math.PI / 180));
    if (d < bd) { bd = d; best = name; }
  }
  return bd <= 30 ? best : null; // only if within 30km of a known city
}

async function runOverpass(query) {
  for (const ep of ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(ep, {
          method: 'POST', body: 'data=' + encodeURIComponent(query),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json', 'User-Agent': UA },
        });
        if (res.status === 429 || res.status === 504 || res.status >= 500) { await sleep(8000); continue; }
        if (!res.ok) break;
        return (await res.json()).elements || [];
      } catch { await sleep(4000); }
    }
  }
  throw new Error('all endpoints failed/overloaded');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9а-яёѐ-ӿ]/g, '');

async function main() {
  const byCat = {}, places = [], seen = new Set();
  for (const sel of SELECTORS) {
    const query = `[out:json][timeout:90];\narea["ISO3166-1"="BG"][admin_level=2]->.bg;\n${sel.q}(area.bg);\nout center tags;`;
    let els = [];
    try { els = await runOverpass(query); } catch (e) { console.log(`  [${sel.cat}] ${sel.q.slice(0, 34)}… FAILED: ${e.message}`); await sleep(1500); continue; }
    await sleep(1500);
    let kept = 0;
    for (const el of els) {
      const t = el.tags || {};
      const name = t['name:bg'] || t.name;
      if (!name && !sel.q.includes('water_park')) continue; // water_park allowed unnamed
      const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const notable = !!(t.wikidata || t.wikipedia || t['name:en']);
      if (!sel.always && !notable) continue; // curate museum/park to notable only
      const town = t['addr:city'] || t['addr:town'] || t['addr:village'] || nearestTown(lat, lng);
      const title = name || `Аквапарк (${town || 'BG'})`;
      const key = norm(title) + '|' + norm(town || '') + '|' + sel.cat;
      if (seen.has(key)) continue;
      seen.add(key);
      const addr = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ') || null;
      const isFree = (sel.cat === 'park') ? true : (t.fee === 'no' ? true : (t.fee === 'yes' ? false : null));
      places.push({
        kind: 'place', title, description: null, venue: null, address: addr, town,
        lat, lng, geo_precision: 'venue', categories: [sel.cat],
        is_free: isFree, age_min: null, age_max: null, indoor: sel.indoor,
        opening_hours: null, seasonal: null, emoji: EMOJI[sel.cat] || '📌',
        src_kind: 'osm_mined', source_name: 'OpenStreetMap',
        source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`, country: 'BG',
        _osm_category: `${Object.keys(t).find((k) => ['tourism', 'leisure', 'sport'].includes(k))}=${t.tourism || t.leisure || t.sport}`,
        _osm_type: el.type, _osm_id: el.id, _wheelchair: t.wheelchair || null,
      });
      kept++;
    }
    byCat[sel.cat] = (byCat[sel.cat] || 0) + kept;
    console.log(`  [${sel.cat}] ${sel.q.slice(0, 40)}… -> ${els.length} osm, +${kept}`);
  }
  const withTown = places.filter((p) => p.town).length;
  fs.writeFileSync(OUT, JSON.stringify({ _meta: { source: 'OpenStreetMap via Overpass (ODbL)', country: 'BG', mined_at: '2026-07-13', curated: 'always-cats wholesale; museum/park notable-only; town≤30km', count: places.length }, places }, null, 2) + '\n');
  console.log(`\nWrote ${places.length} curated BG places (${withTown} with town) -> ${path.relative(process.cwd(), OUT)}`);
  console.log('by category:', JSON.stringify(byCat));
}
main().catch((e) => { console.error(e); process.exit(1); });
