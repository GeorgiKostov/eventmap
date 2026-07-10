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
function inRegion(p) {
  return p && p.lat > 47.9 && p.lat < 48.6 && p.lng > 13.8 && p.lng < 14.8;
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

// Ladder: address → venue+town → town centroid (with tiny jitter so pins don't stack).
export async function geocodeEvent(ev) {
  if (ev.address) {
    const hit = await tryQuery(`${ev.address}, ${ev.town || ''}, Österreich`);
    if (hit) return { ...hit, geo_precision: 'address' };
  }
  if (ev.venue) {
    const hit = await tryQuery(`${ev.venue}, ${ev.town || ''}, Österreich`);
    if (hit) return { ...hit, geo_precision: 'venue' };
  }
  const c = townCentroid(ev.town);
  if (c) {
    const j = () => (Math.random() - 0.5) * 0.006; // ~±300 m
    return { lat: c.lat + j(), lng: c.lng + j(), geo_precision: 'town' };
  }
  return null;
}
