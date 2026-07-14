import tzlookup from 'tz-lookup';
import { geocacheGet, geocacheSet, getVenue, upsertVenue, COUNTRY_TZ } from './db.js';
import { townCentroid } from './towns.js';

// Nominatim usage policy: max 1 req/s, identifying User-Agent, results cached locally.
// (Batch/server-side lookups only — autocomplete goes through Photon, see the
// suggest endpoint in app/api/geocode/route.js; Nominatim's usage policy
// explicitly forbids using it for autocomplete-as-you-type.)
const UA = 'umkreis-prototype/0.1 (local event map prototype; contact: bobojojok@gmail.com)';
let lastCall = 0;

// Self-hosted Nominatim (docs/ops/local-box-setup.md): point NOMINATIM_URL at
// a local instance and the public-instance politeness throttle is skipped —
// rate-limiting our own hardware would be pure waste. Unset → public
// nominatim.openstreetmap.org with the full 1.1s global gate, as before.
const NOMINATIM_BASE = (process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
const NOMINATIM_SELF_HOSTED = !!process.env.NOMINATIM_URL;

// Nominatim's ~1 req/s limit is GLOBAL, not per-host. Concurrent callers (e.g.
// the crawl's parallel host lanes) racing a bare `lastCall` gate all read the
// same timestamp and fire together → 429s, which then get cached as permanent
// misses and silently drop every event in a town (the NÖ-backfill regression).
// Serialize every request through one promise chain: exactly one runs per 1.1s
// regardless of upstream concurrency.
let throttleChain = Promise.resolve();
function throttle() {
  if (NOMINATIM_SELF_HOSTED) return Promise.resolve();
  const mine = throttleChain.then(async () => {
    const wait = 1100 - (Date.now() - lastCall);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
  });
  throttleChain = mine.catch(() => {});
  return mine;
}

// Per-country Nominatim `countrycodes` + the localized ", <country>" suffix
// appended to free-text queries. AT values are exactly what was hardcoded
// before — unchanged behavior for every existing Austrian query/cache-key.
const COUNTRY_META = {
  AT: { codes: 'at', suffix: 'Österreich' },
  BG: { codes: 'bg', suffix: 'България' },
  DE: { codes: 'de', suffix: 'Deutschland' },
};
function countryMeta(country) {
  return COUNTRY_META[country] || COUNTRY_META.AT;
}

// limit>1 is used by the POI waterfall step below, which needs a few
// candidates to pick the right one from (not just Nominatim's top hit).
async function nominatimSearch(q, { limit = 1, country = 'AT' } = {}) {
  await throttle();
  const codes = countryMeta(country).codes;
  const url =
    `${NOMINATIM_BASE}/search?format=json&limit=${limit}&countrycodes=${codes}&namedetails=1&addressdetails=1&q=` +
    encodeURIComponent(q);
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  // Transient (rate-limit / server) → throw so callers DON'T cache a false miss;
  // only a genuine 200-with-no-results is a real "not found" worth caching.
  if (res.status === 429 || res.status >= 500) throw new Error(`nominatim ${res.status}`);
  if (!res.ok) return [];
  return await res.json();
}

async function nominatim(q, country = 'AT') {
  const arr = await nominatimSearch(q, { limit: 1, country });
  if (!arr.length) return null;
  return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon), label: arr[0].display_name };
}

const cached = (q) => geocacheGet(q);
const cache = (q, hit) => geocacheSet(q, hit);
// Cache-key isolation across countries: AT keys are untouched (no suffix —
// same keys the cache already has millions of rows under); any other country
// gets its code appended so a coincidentally-identical query string (e.g. the
// same generic venue name) can never read/write another country's cache row.
function ck(key, country) {
  return country && country !== 'AT' ? `${key}|${country}` : key;
}

// Sanity bounds: reject geocoder hits far outside the region (wrong "Enns" etc.)
// Widened 2026-07-11 Linz box → OÖ → all of Austria (+ margin) for the national
// supply backfill; still rejects same-named places abroad. BG and DE boxes
// support their country-specific mining passes; narrower regional crawl scopes
// are enforced after geocoding by scripts/crawl.mjs and scripts/seed.mjs.
// NOTE: whenever these bounds widen, purge geocache rows with hit=false —
// cached misses from the old bounds otherwise block the new area (Bad Ischl bug).
const COUNTRY_BOUNDS = {
  AT: { latMin: 46.3, latMax: 49.1, lngMin: 9.4, lngMax: 17.3 },
  BG: { latMin: 41.2, latMax: 44.3, lngMin: 22.3, lngMax: 28.7 },
  DE: { latMin: 47.2, latMax: 55.1, lngMin: 5.7, lngMax: 15.2 },
};
function inRegion(p, country = 'AT') {
  const b = COUNTRY_BOUNDS[country] || COUNTRY_BOUNDS.AT;
  return p && p.lat > b.latMin && p.lat < b.latMax && p.lng > b.lngMin && p.lng < b.lngMax;
}

// How far a "precise" (venue/address) geocode may sit from its event's town
// before we refuse it. Beyond this, the match is almost certainly a same-named
// place elsewhere — and a confidently-wrong pin is worse than an honest
// town-centroid one. Enforced on EVERY precise rung of geocodeEvent().
const TOWN_BOUND_KM = 15;

// Great-circle distance in km — used to bound POI matches to "near the
// expected town" and by scripts/regeocode.mjs to measure proposed moves.
export function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function normalizeName(s) {
  // Charset extended for Cyrillic (Ѐ-ӿ, U+0400-U+04FF) — same reasoning as
  // contentHash() in lib/db.js: adding to the allow-list never changes what
  // an existing German/Latin name normalizes to.
  return (s || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9Ѐ-ӿ]+/g, ' ')
    .trim();
}

// Generic institutional words ("Gemeindeamt", "Pfarrzentrum", ...) exist in
// every Austrian town — on their own they're not evidence two places are the
// *same* place, and counting them let token-overlap match "Gemeindeamt
// Sierning" (OÖ) to "Gemeindeamt Puchberg am Schneeberg" (Lower Austria,
// 120km away). Excluded from the overlap score; a distinctive shared word
// (a place/person name) still matches fine.
const GENERIC_NAME_WORDS = new Set([
  'gemeindeamt', 'gemeinde', 'pfarrzentrum', 'pfarrkirche', 'pfarre', 'pfarrplatz',
  'rathaus', 'stadtsaal', 'sportplatz', 'sporthalle', 'turnsaal', 'freibad', 'feuerwehr',
  'feuerwehrhaus', 'volksschule', 'hauptschule', 'kindergarten', 'bibliothek', 'marktplatz',
  'ortszentrum', 'gasthof', 'gasthaus', 'online',
]);

// "Reasonably matches": exact/substring match, or high token overlap (handles
// word-order/extra-word differences like "Posthof Linz" vs "Posthof") — but
// only counting distinctive words, not generic institutional ones.
function nameMatches(venue, candidateName) {
  const v = normalizeName(venue);
  const c = normalizeName(candidateName);
  if (!v || !c) return false;
  // Word-boundary-aware, not a raw substring check: raw `.includes()` let a
  // short generic word like "Park" match inside an unrelated compound word
  // like "Parkplatz" (German glues words together, so this isn't rare).
  // Padding with spaces requires v/c to appear as whole word(s), not a
  // fragment of a longer one.
  if (` ${c} `.includes(` ${v} `) || ` ${v} `.includes(` ${c} `)) return true;
  const distinctive = (t) => t.length > 2 && !GENERIC_NAME_WORDS.has(t);
  const vt = new Set(v.split(' ').filter(distinctive));
  const ct = new Set(c.split(' ').filter(distinctive));
  if (!vt.size || !ct.size) return false;
  let overlap = 0;
  for (const t of vt) if (ct.has(t)) overlap++;
  return overlap / Math.min(vt.size, ct.size) >= 0.5;
}

// Nominatim OSM classes that plausibly represent a real venue (vs. a street,
// waterway, or administrative boundary that happens to share a name).
const POI_CLASSES = new Set(['amenity', 'leisure', 'tourism', 'building', 'man_made']);

async function tryQuery(q, country = 'AT') {
  const key = ck(q, country);
  const c = await cached(key);
  if (c) return c.hit ? { lat: c.lat, lng: c.lng, label: c.label } : null;
  let hit = null;
  try {
    hit = await nominatim(q, country);
  } catch {
    /* network failure → treat as miss, don't cache */
    return null;
  }
  if (!inRegion(hit, country)) hit = null;
  await cache(key, hit);
  return hit;
}

// POI-name lookup: a bare venue-name search against Nominatim's top-1 result
// (the old `tryQuery` path) is fine most of the time, but when the venue name
// also collides with a street/waterway/boundary name, address-style geocoding
// can win and land the point somewhere irrelevant (river, town edge). This
// pulls a few candidates and picks the one that actually looks like the named
// place: inside Austria, near the expected town, and named like the venue —
// preferring amenity/leisure/tourism/building/man_made classes over
// roads/waterways/boundaries that happen to share the name.
async function poiQuery(venue, town, country = 'AT') {
  const key = ck(`poi:${venue}, ${town || ''}`, country);
  const c = await cached(key);
  if (c) return c.hit ? { lat: c.lat, lng: c.lng, label: c.label } : null;

  const suffix = countryMeta(country).suffix;
  let candidates = [];
  try {
    candidates = await nominatimSearch(`${venue}, ${town || ''}, ${suffix}`, { limit: 5, country });
  } catch {
    return null; // network failure → miss, don't cache
  }

  // The static list (lib/towns.js) only covers ~17 Linz-area towns (AT only);
  // for the OÖ-wide/national expansion and any other country, resolve an
  // approximate town location too (cached, same query the town-centroid
  // fallback below would make anyway) so the 15km bound below is never
  // skipped. Common venue/institution names recur nationwide — without this
  // bound a same-named POI in a different region can silently win.
  let expected = country === 'AT' ? townCentroid(town) : null;
  if (!expected && town) {
    expected = await tryQuery(`${town}, ${suffix}`, country);
  }
  if (!expected && town) {
    // Town couldn't be located at all → can't verify "near the expected
    // town", so don't risk an unbounded POI match. Fall through to the
    // weaker (but at-least-not-worse) address/plain-venue/town fallbacks.
    await cache(key, null);
    return null;
  }

  let best = null;
  let bestScore = -Infinity;
  for (const cand of candidates) {
    const p = { lat: parseFloat(cand.lat), lng: parseFloat(cand.lon) };
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || !inRegion(p, country)) continue;
    const dist = expected ? distanceKm(p, expected) : null;
    if (dist != null && dist > TOWN_BOUND_KM) continue; // too far from the expected town
    const name = (cand.namedetails && cand.namedetails.name) || (cand.display_name || '').split(',')[0];
    if (!nameMatches(venue, name)) continue; // must actually look like the venue
    const score = (POI_CLASSES.has(cand.class) ? 2 : 0) - (dist != null ? dist / 15 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = { lat: p.lat, lng: p.lng, label: cand.display_name };
    }
  }
  await cache(key, best);
  return best;
}

// Venue strings that are placeholders, not places. Geocoding them to a town
// centroid puts a pin on the map for something that has no map location
// (394 'Online' events were centroid-pinned before this guard — the sentinel
// lesson, tasks/lessons.md 2026-07-11). Treated as "no venue" everywhere.
const SENTINEL_VENUES = new Set([
  'online', 'sonstige', 'sonstiges', 'diverse', 'verschiedene orte', 'div orte',
  'wird noch bekannt gegeben', 'siehe beschreibung', 'онлайн',
]);
export function isSentinelVenue(venue) {
  return SENTINEL_VENUES.has(normalizeName(venue));
}

// Ladder: venues registry → POI-name lookup → address → venue+town (plain) → static town
// centroid → Nominatim town lookup (with tiny jitter so pins don't stack).
// The POI step goes first because a venue *name* search that requires an
// amenity-like OSM match is more reliable than an address string when both
// are available (see poiQuery above); address/plain-venue remain as
// fallbacks for venues Nominatim doesn't have a confident POI match for.
// The static list (lib/towns.js) only covers the original ~17 Linz-area
// towns; sources.town for the OÖ-wide expansion won't be in it, so
// town-level Nominatim (cached like everything else) is the fallback that
// makes those sources actually usable.
export async function geocodeEvent(ev, { jitterTown = true } = {}) {
  const country = ev.country || 'AT';
  const suffix = countryMeta(country).suffix;
  // Placeholder venues ('Online', 'Sonstige', …) are not places — never feed
  // them to the venue steps; the event falls through to address/town handling.
  const venue = ev.venue && !isSentinelVenue(ev.venue) ? ev.venue : null;
  if (venue) {
    // Registry first: a previously resolved (venue, town) is a fact, cheaper
    // and more trustworthy than re-deriving it from Nominatim.
    const reg = await getVenue(normalizeName(venue), normalizeName(ev.town || ''), country);
    if (reg) return { lat: reg.lat, lng: reg.lng, label: reg.name, geo_precision: reg.geo_precision };
    const hit = await poiQuery(venue, ev.town, country);
    if (hit) {
      await upsertVenue({
        name: venue, town: ev.town ?? null, country,
        name_norm: normalizeName(venue), town_norm: normalizeName(ev.town || ''),
        lat: hit.lat, lng: hit.lng, geo_precision: 'venue', resolved_via: 'geocode',
      });
      return { ...hit, geo_precision: 'venue' };
    }
  }
  // Both remaining precise rungs must land NEAR THE EXPECTED TOWN. poiQuery has
  // enforced this since 2026-07-11 (generic names like "Gemeindeamt" exist in
  // every Austrian town), but these two plain-Nominatim rungs never did — so a
  // generic venue string could be placed anywhere in the country at full venue
  // precision. That is strictly worse than a town centroid: an honest approximate
  // pin becomes a confidently wrong one. ("Bühne 3", a stage inside a Vienna
  // children's theatre, was geocoded 24 km outside Vienna this way.)
  const nearTown = async (hit) => {
    if (!hit) return false;
    if (!ev.town) return true; // no town to check against — nothing to violate
    const expected = (country === 'AT' ? townCentroid(ev.town) : null)
      || await tryQuery(`${ev.town}, ${suffix}`, country);
    if (!expected) return true; // town unlocatable → can't judge; don't discard
    return distanceKm(hit, expected) <= TOWN_BOUND_KM;
  };
  if (ev.address) {
    const hit = await tryQuery(`${ev.address}, ${ev.town || ''}, ${suffix}`, country);
    if (hit && await nearTown(hit)) return { ...hit, geo_precision: 'address' };
  }
  if (venue) {
    const hit = await tryQuery(`${venue}, ${ev.town || ''}, ${suffix}`, country);
    if (hit && await nearTown(hit)) return { ...hit, geo_precision: 'venue' };
  }
  // Scoped crawls disable jitter while checking a hard geographic boundary;
  // otherwise a town on the edge could randomly move in/out between runs.
  const j = () => (jitterTown ? (Math.random() - 0.5) * 0.006 : 0); // ~±300 m
  // townCentroid is an AT-only static list (lib/towns.js) — never consult it
  // for a non-AT country, or a BG town whose name happens to fuzzy-match a
  // Linz-area town string would silently get an Austrian centroid.
  const c = country === 'AT' ? townCentroid(ev.town) : null;
  if (c) return { lat: c.lat + j(), lng: c.lng + j(), geo_precision: 'town' };
  if (ev.town) {
    const hit = await tryQuery(`${ev.town}, ${suffix}`, country);
    if (hit) return { lat: hit.lat + j(), lng: hit.lng + j(), geo_precision: 'town' };
  }
  return null;
}

// Per-event IANA timezone, for multi-timezone countries (US, RU, CA, AU,
// BR, ...) where COUNTRY_TZ's single zone-per-country map is wrong — a
// Los Angeles and a New York event share country='US' but their local "now"
// differs by hours. tz-lookup is offline/pure-JS (lat/lng -> IANA zone), so
// this never depends on network. Falls back to COUNTRY_TZ[country], then
// 'UTC' — never fabricates a zone. Guarded because tz-lookup throws on
// out-of-range/garbage coordinates.
export function tzForEvent({ lat, lng, country } = {}) {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    try {
      return tzlookup(lat, lng);
    } catch {
      /* bad coords → fall through to country default */
    }
  }
  return COUNTRY_TZ[country] || 'UTC';
}

// Forward-geocode arbitrary place text (town/address) for the "search anywhere"
// feature. Same throttle+cache+OÖ bounds as tryQuery, but keeps the label
// (tryQuery discards it — geocodeEvent never needed it) since the UI shows it
// in the "Rund um {ort}" chip.
export async function forwardGeocode(q, country = 'AT') {
  const query = (q || '').trim();
  if (!query) return null;
  const suffix = countryMeta(country).suffix;
  const key = ck(`fwd:${query.toLowerCase()}, ${suffix}`, country);
  const c = await cached(key);
  if (c) return c.hit ? { lat: c.lat, lng: c.lng, label: c.label } : null;
  let hit = null;
  try {
    hit = await nominatim(`${query}, ${suffix}`, country);
  } catch {
    return null;
  }
  if (!inRegion(hit, country)) hit = null;
  await cache(key, hit);
  return hit;
}

// Reverse geocode a point to a short locality label (suburb/town), used for the
// "you are near X" pill. Shares the same 1 req/s throttle + cache as forward lookups.
export async function reverseGeocode(lat, lng) {
  const q = `rev:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const c = await cached(q);
  if (c) return c.hit ? c.label : null;
  await throttle();
  let label = null;
  try {
    const url = `${NOMINATIM_BASE}/reverse?format=json&zoom=14&addressdetails=1&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const data = await res.json();
      const a = data.address || {};
      label = a.suburb || a.town || a.city || a.village || a.municipality || a.county || null;
    }
  } catch {
    /* network failure → miss, don't cache */
    return null;
  }
  await cache(q, label ? { lat, lng, label } : null);
  return label;
}

// Reverse geocode a point to a fuller {address, town} for the add-flow map
// picker: as the user drags the main map under the crosshair, the settled
// centre fills the address + town fields. Uses a higher zoom than the "you are
// near X" pill so a street/house number comes back when OSM has one. Shares the
// same 1 req/s throttle + geocache; both strings are stashed in the cache's
// single `label` column as JSON (keyed under an exclusive `revadr:` namespace).
export async function reverseGeocodeAddress(lat, lng) {
  const q = `revadr:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const c = await cached(q);
  if (c) { try { return c.hit ? JSON.parse(c.label) : null; } catch { return null; } }
  await throttle();
  let out = null;
  try {
    const url = `${NOMINATIM_BASE}/reverse?format=json&zoom=18&addressdetails=1&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    // Transient (rate-limit / server) → return null WITHOUT caching, so a 429
    // isn't frozen into the geocache as a permanent miss (tasks/lessons.md).
    if (res.status === 429 || res.status >= 500 || !res.ok) return null;
    const a = (await res.json()).address || {};
    const street = [a.road, a.house_number].filter(Boolean).join(' ');
    const address = street || a.pedestrian || a.neighbourhood || a.suburb || null;
    const town = a.city || a.town || a.village || a.municipality || a.suburb || a.county || null;
    if (address || town) out = { address, town };
  } catch {
    /* network failure → miss, don't cache */
    return null;
  }
  await cache(q, out ? { lat, lng, label: JSON.stringify(out) } : null);
  return out;
}
