import { geocacheGet, geocacheSet } from './db.js';
import { townCentroid } from './towns.js';

// Nominatim usage policy: max 1 req/s, identifying User-Agent, results cached locally.
// (Batch/server-side lookups only — autocomplete goes through Photon, see the
// suggest endpoint in app/api/geocode/route.js; Nominatim's usage policy
// explicitly forbids using it for autocomplete-as-you-type.)
const UA = 'umkreis-prototype/0.1 (local event map prototype; contact: bobojojok@gmail.com)';
let lastCall = 0;

async function throttle() {
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

// limit>1 is used by the POI waterfall step below, which needs a few
// candidates to pick the right one from (not just Nominatim's top hit).
async function nominatimSearch(q, { limit = 1 } = {}) {
  await throttle();
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=${limit}&countrycodes=at&namedetails=1&addressdetails=1&q=` +
    encodeURIComponent(q);
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  return await res.json();
}

async function nominatim(q) {
  const arr = await nominatimSearch(q, { limit: 1 });
  if (!arr.length) return null;
  return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon), label: arr[0].display_name };
}

const cached = (q) => geocacheGet(q);
const cache = (q, hit) => geocacheSet(q, hit);

// Sanity bounds: reject geocoder hits far outside the region (wrong "Enns" etc.)
// Widened 2026-07-11 Linz box → OÖ → all of Austria (+ margin) for the national
// supply backfill; still rejects same-named places abroad (DE/CH/IT).
// NOTE: whenever these bounds widen, purge geocache rows with hit=false —
// cached misses from the old bounds otherwise block the new area (Bad Ischl bug).
function inRegion(p) {
  return p && p.lat > 46.3 && p.lat < 49.1 && p.lng > 9.4 && p.lng < 17.3;
}

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

function normalizeName(s) {
  return (s || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
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

async function tryQuery(q) {
  const c = await cached(q);
  if (c) return c.hit ? { lat: c.lat, lng: c.lng, label: c.label } : null;
  let hit = null;
  try {
    hit = await nominatim(q);
  } catch {
    /* network failure → treat as miss, don't cache */
    return null;
  }
  if (!inRegion(hit)) hit = null;
  await cache(q, hit);
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
async function poiQuery(venue, town) {
  const key = `poi:${venue}, ${town || ''}`;
  const c = await cached(key);
  if (c) return c.hit ? { lat: c.lat, lng: c.lng, label: c.label } : null;

  let candidates = [];
  try {
    candidates = await nominatimSearch(`${venue}, ${town || ''}, Österreich`, { limit: 5 });
  } catch {
    return null; // network failure → miss, don't cache
  }

  // The static list (lib/towns.js) only covers ~17 Linz-area towns; for the
  // OÖ-wide/national expansion, resolve an approximate town location too
  // (cached, same query the town-centroid fallback below would make anyway)
  // so the 15km bound below is never skipped. Common venue/institution names
  // ("Lambach", "Filzmoos", "Pfarrzentrum X") recur across Austria — without
  // this bound a same-named POI in a different region can silently win.
  let expected = townCentroid(town);
  if (!expected && town) {
    expected = await tryQuery(`${town}, Österreich`);
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
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || !inRegion(p)) continue;
    const dist = expected ? distanceKm(p, expected) : null;
    if (dist != null && dist > 15) continue; // too far from the expected town
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

// Ladder: POI-name lookup → address → venue+town (plain) → static town
// centroid → Nominatim town lookup (with tiny jitter so pins don't stack).
// The POI step goes first because a venue *name* search that requires an
// amenity-like OSM match is more reliable than an address string when both
// are available (see poiQuery above); address/plain-venue remain as
// fallbacks for venues Nominatim doesn't have a confident POI match for.
// The static list (lib/towns.js) only covers the original ~17 Linz-area
// towns; sources.town for the OÖ-wide expansion won't be in it, so
// town-level Nominatim (cached like everything else) is the fallback that
// makes those sources actually usable.
export async function geocodeEvent(ev) {
  if (ev.venue) {
    const hit = await poiQuery(ev.venue, ev.town);
    if (hit) return { ...hit, geo_precision: 'venue' };
  }
  if (ev.address) {
    const hit = await tryQuery(`${ev.address}, ${ev.town || ''}, Österreich`);
    if (hit) return { ...hit, geo_precision: 'address' };
  }
  if (ev.venue) {
    const hit = await tryQuery(`${ev.venue}, ${ev.town || ''}, Österreich`);
    if (hit) return { ...hit, geo_precision: 'venue' };
  }
  const j = () => (Math.random() - 0.5) * 0.006; // ~±300 m
  const c = townCentroid(ev.town);
  if (c) return { lat: c.lat + j(), lng: c.lng + j(), geo_precision: 'town' };
  if (ev.town) {
    const hit = await tryQuery(`${ev.town}, Österreich`);
    if (hit) return { lat: hit.lat + j(), lng: hit.lng + j(), geo_precision: 'town' };
  }
  return null;
}

// Forward-geocode arbitrary place text (town/address) for the "search anywhere"
// feature. Same throttle+cache+OÖ bounds as tryQuery, but keeps the label
// (tryQuery discards it — geocodeEvent never needed it) since the UI shows it
// in the "Umkreis um {ort}" chip.
export async function forwardGeocode(q) {
  const query = (q || '').trim();
  if (!query) return null;
  const key = `fwd:${query.toLowerCase()}, Österreich`;
  const c = await cached(key);
  if (c) return c.hit ? { lat: c.lat, lng: c.lng, label: c.label } : null;
  let hit = null;
  try {
    hit = await nominatim(`${query}, Österreich`);
  } catch {
    return null;
  }
  if (!inRegion(hit)) hit = null;
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
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&addressdetails=1&lat=${lat}&lon=${lng}`;
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
