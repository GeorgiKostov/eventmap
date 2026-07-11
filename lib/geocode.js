import { geocacheGet, geocacheSet } from './db.js';
import { townCentroid } from './towns.js';

// Nominatim usage policy: max 1 req/s, identifying User-Agent, results cached locally.
const UA = 'umkreis-prototype/0.1 (local event map prototype; contact: bobojojok@gmail.com)';
let lastCall = 0;

async function nominatim(q) {
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=at&q=' +
    encodeURIComponent(q);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const arr = await res.json();
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

async function tryQuery(q) {
  const c = await cached(q);
  if (c) return c.hit ? { lat: c.lat, lng: c.lng } : null;
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

// Ladder: address → venue+town → static town centroid → Nominatim town lookup
// (with tiny jitter so pins don't stack). The static list (lib/towns.js) only
// covers the original ~17 Linz-area towns; sources.town for the OÖ-wide
// expansion won't be in it, so town-level Nominatim (cached like everything
// else) is the fallback that makes those sources actually usable.
export async function geocodeEvent(ev) {
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
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  let label = null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&addressdetails=1&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
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
