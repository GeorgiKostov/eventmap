// Gazetteer for the SEARCH BAR only — cities/towns a user might jump to, with
// the alternate names they actually type ("vie"/"wien", "sofia"/"софия").
//
// Deliberately separate from TOWNS (lib/towns.js): that list is the geocoding
// fallback for event pinning and townCentroid() fuzzy-matches against it, so
// adding Vienna or Sofia there would start dragging event pins around. Nothing
// here ever touches geocoding.
//
// Why a static list at all: Photon (our autocomplete geocoder) biases toward
// the map's centre, so typing "vie" near Linz returns Vielguthstraße and a
// heating-systems shop long before Vienna. A user typing three letters of a
// capital expects the capital. Photon still runs as the long-tail fallback for
// everything not listed here (villages, hamlets, addresses).
//
// pop = population, used purely as a tiebreaker: on an equal-quality name match
// the bigger place wins.
export const PLACES = [
  // Austria
  { name: 'Wien', aliases: ['Vienna', 'Wein'], region: 'Wien', lat: 48.2082, lng: 16.3738, pop: 1920000 },
  { name: 'Graz', aliases: [], region: 'Steiermark', lat: 47.0707, lng: 15.4395, pop: 295000 },
  { name: 'Linz', aliases: [], region: 'Oberösterreich', lat: 48.3069, lng: 14.2858, pop: 207000 },
  { name: 'Salzburg', aliases: [], region: 'Salzburg', lat: 47.8095, lng: 13.0550, pop: 156000 },
  { name: 'Innsbruck', aliases: [], region: 'Tirol', lat: 47.2692, lng: 11.4041, pop: 132000 },
  { name: 'Klagenfurt', aliases: [], region: 'Kärnten', lat: 46.6247, lng: 14.3053, pop: 103000 },
  { name: 'Villach', aliases: [], region: 'Kärnten', lat: 46.6103, lng: 13.8558, pop: 63000 },
  { name: 'Wels', aliases: [], region: 'Oberösterreich', lat: 48.1575, lng: 14.0289, pop: 62000 },
  { name: 'Sankt Pölten', aliases: ['St. Pölten', 'St Poelten', 'Sankt Poelten'], region: 'Niederösterreich', lat: 48.2047, lng: 15.6256, pop: 55000 },
  { name: 'Dornbirn', aliases: [], region: 'Vorarlberg', lat: 47.4125, lng: 9.7417, pop: 50000 },
  { name: 'Steyr', aliases: [], region: 'Oberösterreich', lat: 48.0389, lng: 14.4189, pop: 38000 },
  { name: 'Wiener Neustadt', aliases: [], region: 'Niederösterreich', lat: 47.8149, lng: 16.2497, pop: 46000 },
  { name: 'Feldkirch', aliases: [], region: 'Vorarlberg', lat: 47.2333, lng: 9.6000, pop: 34000 },
  { name: 'Bregenz', aliases: [], region: 'Vorarlberg', lat: 47.5031, lng: 9.7471, pop: 29000 },
  { name: 'Leonding', aliases: [], region: 'Oberösterreich', lat: 48.2790, lng: 14.2530, pop: 28000 },
  { name: 'Klosterneuburg', aliases: [], region: 'Niederösterreich', lat: 48.3053, lng: 16.3253, pop: 27000 },
  { name: 'Baden', aliases: [], region: 'Niederösterreich', lat: 48.0059, lng: 16.2333, pop: 26000 },
  { name: 'Traun', aliases: [], region: 'Oberösterreich', lat: 48.2200, lng: 14.2370, pop: 25000 },
  { name: 'Amstetten', aliases: [], region: 'Niederösterreich', lat: 48.1225, lng: 14.8722, pop: 24000 },
  { name: 'Krems an der Donau', aliases: ['Krems'], region: 'Niederösterreich', lat: 48.4103, lng: 15.6019, pop: 25000 },
  { name: 'Kapfenberg', aliases: [], region: 'Steiermark', lat: 47.4447, lng: 15.2933, pop: 23000 },
  { name: 'Hallein', aliases: [], region: 'Salzburg', lat: 47.6833, lng: 13.1000, pop: 21000 },
  { name: 'Braunau am Inn', aliases: ['Braunau'], region: 'Oberösterreich', lat: 48.2569, lng: 13.0347, pop: 17000 },
  { name: 'Schwechat', aliases: [], region: 'Niederösterreich', lat: 48.1400, lng: 16.4700, pop: 20000 },
  { name: 'Ried im Innkreis', aliases: ['Ried'], region: 'Oberösterreich', lat: 48.2100, lng: 13.4894, pop: 12000 },
  { name: 'Gmunden', aliases: [], region: 'Oberösterreich', lat: 47.9181, lng: 13.7994, pop: 13000 },
  { name: 'Bad Ischl', aliases: [], region: 'Oberösterreich', lat: 47.7117, lng: 13.6222, pop: 14000 },
  { name: 'Hallstatt', aliases: [], region: 'Oberösterreich', lat: 47.5622, lng: 13.6493, pop: 800 },
  { name: 'Enns', aliases: [], region: 'Oberösterreich', lat: 48.2130, lng: 14.4750, pop: 12000 },
  { name: 'Freistadt', aliases: [], region: 'Oberösterreich', lat: 48.5117, lng: 14.5033, pop: 8000 },
  { name: 'Vöcklabruck', aliases: ['Voecklabruck'], region: 'Oberösterreich', lat: 48.0089, lng: 13.6558, pop: 12000 },
  { name: 'Eferding', aliases: [], region: 'Oberösterreich', lat: 48.3122, lng: 14.0233, pop: 4500 },
  { name: 'Perg', aliases: [], region: 'Oberösterreich', lat: 48.2500, lng: 14.6333, pop: 8000 },

  // Bulgaria
  { name: 'София', aliases: ['Sofia', 'Sofija'], region: 'Bulgaria', lat: 42.6977, lng: 23.3219, pop: 1240000 },
  { name: 'Пловдив', aliases: ['Plovdiv'], region: 'Bulgaria', lat: 42.1354, lng: 24.7453, pop: 346000 },
  { name: 'Варна', aliases: ['Varna'], region: 'Bulgaria', lat: 43.2141, lng: 27.9147, pop: 336000 },
  { name: 'Бургас', aliases: ['Burgas'], region: 'Bulgaria', lat: 42.5048, lng: 27.4626, pop: 202000 },
  { name: 'Русе', aliases: ['Ruse', 'Rousse'], region: 'Bulgaria', lat: 43.8356, lng: 25.9657, pop: 142000 },
  { name: 'Стара Загора', aliases: ['Stara Zagora'], region: 'Bulgaria', lat: 42.4258, lng: 25.6345, pop: 136000 },
  { name: 'Плевен', aliases: ['Pleven'], region: 'Bulgaria', lat: 43.4170, lng: 24.6067, pop: 97000 },
  { name: 'Сливен', aliases: ['Sliven'], region: 'Bulgaria', lat: 42.6858, lng: 26.3292, pop: 82000 },
  { name: 'Добрич', aliases: ['Dobrich'], region: 'Bulgaria', lat: 43.5726, lng: 27.8273, pop: 78000 },
  { name: 'Шумен', aliases: ['Shumen'], region: 'Bulgaria', lat: 43.2712, lng: 26.9361, pop: 74000 },
  { name: 'Перник', aliases: ['Pernik'], region: 'Bulgaria', lat: 42.6051, lng: 23.0378, pop: 70000 },
  { name: 'Хасково', aliases: ['Haskovo'], region: 'Bulgaria', lat: 41.9344, lng: 25.5556, pop: 68000 },
  { name: 'Ямбол', aliases: ['Yambol'], region: 'Bulgaria', lat: 42.4842, lng: 26.5036, pop: 65000 },
  { name: 'Пазарджик', aliases: ['Pazardzhik'], region: 'Bulgaria', lat: 42.1928, lng: 24.3336, pop: 66000 },
  { name: 'Благоевград', aliases: ['Blagoevgrad'], region: 'Bulgaria', lat: 42.0117, lng: 23.0938, pop: 68000 },
  { name: 'Велико Търново', aliases: ['Veliko Tarnovo', 'Veliko Turnovo'], region: 'Bulgaria', lat: 43.0757, lng: 25.6172, pop: 68000 },
  { name: 'Враца', aliases: ['Vratsa'], region: 'Bulgaria', lat: 43.2100, lng: 23.5525, pop: 52000 },
  { name: 'Габрово', aliases: ['Gabrovo'], region: 'Bulgaria', lat: 42.8742, lng: 25.3342, pop: 51000 },
  { name: 'Видин', aliases: ['Vidin'], region: 'Bulgaria', lat: 43.9961, lng: 22.8675, pop: 40000 },
  { name: 'Казанлък', aliases: ['Kazanlak'], region: 'Bulgaria', lat: 42.6194, lng: 25.3933, pop: 44000 },
  { name: 'Банско', aliases: ['Bansko'], region: 'Bulgaria', lat: 41.8383, lng: 23.4886, pop: 8500 },
  { name: 'Несебър', aliases: ['Nesebar', 'Nessebar'], region: 'Bulgaria', lat: 42.6591, lng: 27.7367, pop: 12000 },
  { name: 'Созопол', aliases: ['Sozopol'], region: 'Bulgaria', lat: 42.4181, lng: 27.6953, pop: 5000 },
  { name: 'Слънчев бряг', aliases: ['Sunny Beach', 'Slanchev bryag'], region: 'Bulgaria', lat: 42.6900, lng: 27.7100, pop: 3000 },
  { name: 'Велинград', aliases: ['Velingrad'], region: 'Bulgaria', lat: 42.0269, lng: 23.9917, pop: 22000 },
];

// Lowercase + strip diacritics so "voecklabruck", "Vöcklabruck" and
// "vocklabruck" all collapse to the same key. Cyrillic passes through
// unchanged — BG places carry an explicit Latin alias instead of relying on
// transliteration.
export function normalizePlace(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// How well a candidate name answers the query. Prefix beats word-start beats
// substring — three letters of a name should surface that name, not a street
// that happens to contain them.
function matchScore(name, q) {
  const n = normalizePlace(name);
  if (n.startsWith(q)) return 100;
  if (n.split(' ').some((w) => w.startsWith(q))) return 60;
  if (n.includes(q)) return 30;
  return 0;
}

// Rank the gazetteer (plus any extra town centroids the caller knows about —
// the towns of currently-loaded events) against a typed query.
// `extra` is a Map of name -> {lat,lng}; gazetteer entries win on name clashes.
export function searchPlaces(query, { extra, limit = 6 } = {}) {
  const q = normalizePlace(query);
  if (q.length < 2) return [];

  const scored = [];
  const seen = new Set();

  for (const p of PLACES) {
    const score = Math.max(...[p.name, ...p.aliases].map((n) => matchScore(n, q)));
    if (!score) continue;
    seen.add(normalizePlace(p.name));
    // A capital and a hamlet can both match at the same quality; population
    // (capped, log-ish) is what separates them.
    scored.push({
      label: p.name,
      lat: p.lat,
      lng: p.lng,
      hint: p.region === p.name ? null : p.region, // Wien in Wien needs no second line
      // Every spelling this place answers to — the caller uses them to drop the
      // remote geocoder's duplicate of a place we already listed (Photon returns
      // "Sofia" for a query the gazetteer already answered with "София").
      keys: [p.name, ...p.aliases].map(normalizePlace),
      score: score + Math.min(p.pop / 100000, 20),
    });
  }

  for (const [name, c] of extra || []) {
    const key = normalizePlace(name);
    if (seen.has(key)) continue;
    const score = matchScore(name, q);
    if (!score) continue;
    seen.add(key);
    // Towns we actually carry events for are the ones a user is most likely
    // hunting, so they get a nudge over an equally-matching far-away city.
    scored.push({ label: name, lat: c.lat, lng: c.lng, hint: null, keys: [key], score: score + 5 });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
